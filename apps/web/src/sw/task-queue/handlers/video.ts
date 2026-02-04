/**
 * Video Generation Handler for Service Worker
 *
 * Handles video generation tasks with polling support.
 * 使用通用的媒体生成工具函数来减少重复代码
 */

import type { SWTask, TaskResult, HandlerConfig, TaskHandler } from '../types';
import { TaskExecutionPhase } from '../types';
import {
  mergeReferenceImages,
  pollVideoUntilComplete,
  fetchImageWithCache,
  parseSize,
  cropImageToAspectRatio,
} from '../utils/media-generation-utils';
import type { LLMReferenceImage } from '../llm-api-logger';

/**
 * Video generation response types
 */
interface VideoSubmitResponse {
  id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  error?: string | { code: string; message: string };
}

/**
 * Submit response with log ID for tracking
 */
interface SubmitResult {
  response: VideoSubmitResponse;
  logId: string;
}

interface KlingSubmitResult {
  taskId: string;
  logId: string;
  action2: 'text2video' | 'image2video';
}

/**
 * Video generation handler
 */
export class VideoHandler implements TaskHandler {
  private abortControllers: Map<string, AbortController> = new Map();
  private pollingIntervals: Map<string, ReturnType<typeof setInterval>> =
    new Map();

  /**
   * Execute video generation task
   */
  async execute(task: SWTask, config: HandlerConfig): Promise<TaskResult> {
    const abortController = new AbortController();
    this.abortControllers.set(task.id, abortController);

    try {
      if (this.isKlingModel((task.params as any)?.model)) {
        return await this.executeKling(task, config, abortController.signal);
      }

      config.onProgress(task.id, 0, TaskExecutionPhase.SUBMITTING);

      // Submit video generation request
      const { response: submitResponse, logId } =
        await this.submitVideoGeneration(task, config, abortController.signal);

      // Notify remote ID
      config.onRemoteId(task.id, submitResponse.id);
      config.onProgress(task.id, 5, TaskExecutionPhase.POLLING);

      // Poll until completion using shared utility
      const result = await this.pollUntilComplete(
        submitResponse.id,
        task.id,
        config,
        abortController.signal,
        logId
      );

      return result;
    } finally {
      this.cleanup(task.id);
    }
  }

  /**
   * Resume video generation polling
   * 恢复任务只是继续轮询，不创建新的 LLM API 日志条目
   * 通过 taskId 查找原始日志并在完成时更新它
   */
  async resume(task: SWTask, config: HandlerConfig): Promise<TaskResult> {
    if (!task.remoteId) {
      throw new Error('No remote ID for resume');
    }

    const abortController = new AbortController();
    this.abortControllers.set(task.id, abortController);

    // 查找原始任务的日志 ID，以便在轮询完成时更新它
    const { findLatestLogByTaskId } = await import('../llm-api-logger');
    const originalLog = await findLatestLogByTaskId(task.id);
    const logId = originalLog?.id;

    try {
      if (this.isKlingModel((task.params as any)?.model)) {
        return await this.resumeKling(
          task,
          config,
          abortController.signal,
          logId
        );
      }

      config.onProgress(
        task.id,
        task.progress || 0,
        TaskExecutionPhase.POLLING
      );

      const result = await this.pollUntilComplete(
        task.remoteId,
        task.id,
        config,
        abortController.signal,
        logId // 传递原始日志 ID，轮询完成时会更新原始日志
      );

      return result;
    } finally {
      this.cleanup(task.id);
    }
  }

  /**
   * Cancel video generation
   */
  cancel(taskId: string): void {
    this.cleanup(taskId);
  }

  private isKlingModel(model?: string): boolean {
    return !!model && model.startsWith('kling');
  }

  private normalizeKlingBaseUrl(baseUrl: string): string {
    const trimmed = baseUrl.replace(/\/$/, '');
    return trimmed.endsWith('/v1') ? trimmed.slice(0, -3) : trimmed;
  }

  private deriveAspectRatio(size?: string): string | undefined {
    if (!size || !size.includes('x')) return undefined;
    const [wRaw, hRaw] = size.split('x');
    const width = Number(wRaw);
    const height = Number(hRaw);
    if (!width || !height) return undefined;
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const div = gcd(width, height);
    return `${width / div}:${height / div}`;
  }

  private async executeKling(
    task: SWTask,
    config: HandlerConfig,
    signal: AbortSignal
  ): Promise<TaskResult> {
    config.onProgress(task.id, 0, TaskExecutionPhase.SUBMITTING);

    const { taskId, logId, action2 } = await this.submitKlingVideoGeneration(
      task,
      config,
      signal
    );

    config.onRemoteId(task.id, taskId);
    config.onProgress(task.id, 5, TaskExecutionPhase.POLLING);

    return await this.pollKlingUntilComplete(
      taskId,
      action2,
      task.id,
      config,
      signal,
      logId
    );
  }

  private async resumeKling(
    task: SWTask,
    config: HandlerConfig,
    signal: AbortSignal,
    logId?: string
  ): Promise<TaskResult> {
    const action2: 'text2video' | 'image2video' =
      ((task.params as any)?.klingAction2 as
        | 'text2video'
        | 'image2video'
        | undefined) ||
      ((task.params as any)?.uploadedImages?.length > 0 ||
      (task.params as any)?.referenceImages?.length > 0
        ? 'image2video'
        : 'text2video');

    return await this.pollKlingUntilComplete(
      task.remoteId!,
      action2,
      task.id,
      config,
      signal,
      logId
    );
  }

  private async submitKlingVideoGeneration(
    task: SWTask,
    config: HandlerConfig,
    signal: AbortSignal
  ): Promise<KlingSubmitResult> {
    const { videoConfig } = config;
    const { params } = task as any;

    const refUrls = mergeReferenceImages({
      referenceImages: params.referenceImages as string[] | undefined,
      uploadedImages: params.uploadedImages as any[] | undefined,
      inputReference: params.inputReference as string | undefined,
      inputReferences: params.inputReferences as any[] | undefined,
    });

    const action2: 'text2video' | 'image2video' =
      (params.klingAction2 as 'text2video' | 'image2video' | undefined) ||
      (refUrls.length > 0 ? 'image2video' : 'text2video');

    if (action2 === 'image2video' && refUrls.length === 0) {
      throw new Error('Kling image2video requires a reference image');
    }

    const baseUrl = this.normalizeKlingBaseUrl(videoConfig.baseUrl);
    const aspectRatio =
      params.aspect_ratio || this.deriveAspectRatio(params.size);
    const duration = params.duration || params.seconds;

    const body = {
      model_name: params.model || 'kling-v1-5',
      prompt: params.prompt,
      image: refUrls[0],
      aspect_ratio: aspectRatio,
      duration: duration ? String(duration) : undefined,
      ...(params.params || {}),
    };

    const { debugFetch } = await import('../debug-fetch');
    const { startLLMApiLog, failLLMApiLog } = await import('../llm-api-logger');

    const startTime = Date.now();
    const logId = startLLMApiLog({
      endpoint: `/kling/v1/videos/${action2}`,
      model: params.model || 'kling-v1-5',
      taskType: 'video',
      prompt: params.prompt as string,
      requestBody: JSON.stringify(body, null, 2),
      hasReferenceImages: refUrls.length > 0,
      referenceImageCount: refUrls.length,
      taskId: task.id,
    });

    const response = await debugFetch(
      `${baseUrl}/kling/v1/videos/${action2}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(videoConfig.apiKey
            ? { Authorization: `Bearer ${videoConfig.apiKey}` }
            : {}),
        },
        body: JSON.stringify(body),
        signal,
      },
      {
        label: `🎬 提交 Kling 视频生成 (${params.model || 'kling-v1-5'})`,
        logResponseBody: true,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      failLLMApiLog(logId, {
        httpStatus: response.status,
        duration: Date.now() - startTime,
        errorMessage: errorText,
        responseBody: errorText,
      });
      throw new Error(
        `Kling submission failed: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();
    const taskId = data?.data?.task_id;
    if (!taskId) {
      throw new Error('Kling submission missing task_id');
    }

    return { taskId, logId, action2 };
  }

  private async pollKlingUntilComplete(
    taskId: string,
    action2: 'text2video' | 'image2video',
    localTaskId: string,
    config: HandlerConfig,
    signal: AbortSignal,
    logId?: string
  ): Promise<TaskResult> {
    const { videoConfig } = config;
    const { debugFetch } = await import('../debug-fetch');
    const { completeLLMApiLog, failLLMApiLog } = await import(
      '../llm-api-logger'
    );
    const startTime = Date.now();
    const baseUrl = this.normalizeKlingBaseUrl(videoConfig.baseUrl);

    for (let attempt = 0; attempt < 1080; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const response = await debugFetch(
        `${baseUrl}/kling/v1/videos/${action2}/${taskId}`,
        {
          method: 'GET',
          headers: videoConfig.apiKey
            ? { Authorization: `Bearer ${videoConfig.apiKey}` }
            : undefined,
          signal,
        },
        {
          label: `🎬 查询 Kling 视频任务 (${taskId})`,
          logResponseBody: true,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        if (logId) {
          failLLMApiLog(logId, {
            httpStatus: response.status,
            duration: Date.now() - startTime,
            errorMessage: errorText,
            responseBody: errorText,
          });
        }
        throw new Error(
          `Kling query failed: ${response.status} - ${errorText}`
        );
      }

      const data = await response.json();
      const status = data?.data?.task_status;

      if (status === 'succeed') {
        const videoUrl = data?.data?.task_result?.videos?.[0]?.url;
        if (!videoUrl) {
          throw new Error('No video URL in Kling response');
        }

        if (logId) {
          completeLLMApiLog(logId, {
            httpStatus: 200,
            duration: Date.now() - startTime,
            resultType: 'video',
            resultCount: 1,
            resultUrl: videoUrl,
            responseBody: JSON.stringify(data),
          });
        }

        return {
          url: videoUrl,
          format: 'mp4',
          size: 0,
          duration:
            parseFloat(data?.data?.task_result?.videos?.[0]?.duration || '0') ||
            0,
        };
      }

      if (status === 'failed') {
        const message =
          data?.data?.task_status_msg || 'Kling generation failed';
        if (logId) {
          failLLMApiLog(logId, {
            duration: Date.now() - startTime,
            errorMessage: message,
            responseBody: JSON.stringify(data),
          });
        }
        throw new Error(message);
      }

      config.onProgress(
        localTaskId,
        5 + Math.min(90, attempt * 0.1),
        TaskExecutionPhase.POLLING
      );
    }

    if (logId) {
      failLLMApiLog(logId, {
        duration: Date.now() - startTime,
        errorMessage: 'Kling generation timeout',
      });
    }
    throw new Error('Kling generation timeout');
  }

  /**
   * Submit video generation request
   */
  private async submitVideoGeneration(
    task: SWTask,
    config: HandlerConfig,
    signal: AbortSignal
  ): Promise<SubmitResult> {
    const { videoConfig } = config;
    const { params } = task;

    // Build form data
    const formData = new FormData();
    formData.append('model', params.model || 'veo3');
    formData.append('prompt', params.prompt);

    if (params.duration) {
      formData.append('seconds', String(params.duration));
    }

    if (params.size) {
      formData.append('size', params.size);
    }

    // 使用通用函数合并参考图片
    const refUrls = mergeReferenceImages({
      referenceImages: params.referenceImages as string[] | undefined,
      uploadedImages: params.uploadedImages as any[] | undefined,
      inputReference: params.inputReference as string | undefined,
      inputReferences: params.inputReferences as any[] | undefined,
    });

    // 处理参考图片：获取 Blob，裁剪到目标尺寸，然后添加到 FormData
    // 同时收集裁剪后的图片信息用于日志
    const { getImageInfo } = await import('../utils/media-generation-utils');
    const referenceImageInfos: LLMReferenceImage[] = [];

    if (refUrls.length > 0) {
      // 解析目标尺寸
      const targetSize = params.size ? parseSize(params.size as string) : null;

      for (let i = 0; i < refUrls.length; i++) {
        const url = refUrls[i];
        try {
          // 使用通用函数从缓存获取图片
          let blob = await fetchImageWithCache(url, signal);
          if (blob) {
            // 如果指定了目标尺寸，裁剪图片到匹配的宽高比
            if (targetSize) {
              blob = await cropImageToAspectRatio(
                blob,
                targetSize.width,
                targetSize.height
              );
            }

            // 获取裁剪后的图片信息用于日志
            try {
              const info = await getImageInfo(blob, signal);
              referenceImageInfos.push({
                url: info.url,
                size: info.size,
                width: info.width,
                height: info.height,
              });
            } catch (err) {
              console.warn(
                `[VideoHandler] Failed to get cropped image info for log`,
                err
              );
              referenceImageInfos.push({
                url,
                size: blob.size,
                width: 0,
                height: 0,
              });
            }

            formData.append('input_reference', blob, `reference-${i + 1}.png`);
          } else {
            // 缓存和网络都失败时，回退到发送 URL
            console.warn(
              `[VideoHandler] Failed to get reference image: ${url}`
            );
            formData.append('input_reference', url);
            referenceImageInfos.push({ url, size: 0, width: 0, height: 0 });
          }
        } catch (err) {
          console.warn(
            `[VideoHandler] Error fetching reference image: ${url}`,
            err
          );
          formData.append('input_reference', url);
          referenceImageInfos.push({ url, size: 0, width: 0, height: 0 });
        }
      }
    }

    // Import loggers
    const { debugFetch } = await import('../debug-fetch');
    const { startLLMApiLog, completeLLMApiLog, failLLMApiLog } = await import(
      '../llm-api-logger'
    );

    const startTime = Date.now();
    const model = (params.model as string) || 'veo3';

    // 构建请求参数的日志表示（FormData 无法直接序列化）
    const requestParamsForLog = {
      model,
      prompt: params.prompt,
      ...(params.duration && { seconds: params.duration }),
      ...(params.size && { size: params.size }),
      ...(refUrls.length > 0 && {
        input_reference: `[${refUrls.length} images]`,
      }),
    };

    const logId = startLLMApiLog({
      endpoint: '/videos',
      model,
      taskType: 'video',
      prompt: params.prompt as string,
      requestBody: JSON.stringify(requestParamsForLog, null, 2),
      hasReferenceImages: refUrls.length > 0,
      referenceImageCount: refUrls.length,
      referenceImages: referenceImageInfos,
      taskId: task.id,
    });

    // Use debugFetch for logging
    const response = await debugFetch(
      `${videoConfig.baseUrl}/videos`,
      {
        method: 'POST',
        headers: videoConfig.apiKey
          ? { Authorization: `Bearer ${videoConfig.apiKey}` }
          : undefined,
        body: formData,
        signal,
      },
      {
        label: `🎬 提交视频生成 (${model})`,
        logResponseBody: true,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      failLLMApiLog(logId, {
        httpStatus: response.status,
        duration: Date.now() - startTime,
        errorMessage: errorText,
        responseBody: errorText,
      });
      throw new Error(
        `Video submission failed: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();

    // 记录 remoteId 到日志，以便在 SW 重启时恢复
    if (data.id) {
      const { updateLLMApiLogMetadata } = await import('../llm-api-logger');
      updateLLMApiLogMetadata(logId, {
        remoteId: data.id,
        responseBody: JSON.stringify(data),
        httpStatus: response.status,
      });
    }

    // 注意：这里不调用 completeLLMApiLog，因为视频还在异步生成中
    // 最终结果会在 pollUntilComplete 完成后更新

    return { response: data, logId };
  }

  /**
   * Poll video status until completion
   * 使用通用的轮询逻辑，但保持任务级别的进度回调
   */
  private async pollUntilComplete(
    videoId: string,
    taskId: string,
    config: HandlerConfig,
    signal: AbortSignal,
    logId?: string
  ): Promise<TaskResult> {
    const { videoConfig } = config;
    const startTime = Date.now();

    try {
      // 使用通用轮询函数
      const result = await pollVideoUntilComplete(
        videoConfig.baseUrl,
        videoId,
        {
          onProgress: (progress, phase) => {
            config.onProgress(taskId, progress, phase);
          },
          signal,
          apiKey: videoConfig.apiKey,
          interval: 5000,
          maxAttempts: 1080, // 90 minutes
        }
      );

      const videoUrl = result.video_url || result.url;
      if (!videoUrl) {
        throw new Error('No video URL in completed response');
      }

      // 更新 LLM API 日志，添加最终的视频 URL
      if (logId) {
        const { completeLLMApiLog } = await import('../llm-api-logger');
        completeLLMApiLog(logId, {
          httpStatus: 200,
          duration: Date.now() - startTime,
          resultType: 'video',
          resultCount: 1,
          resultUrl: videoUrl,
          responseBody: JSON.stringify(result),
        });
      }

      return {
        url: videoUrl,
        format: 'mp4',
        size: 0,
        width: result.width,
        height: result.height,
        duration: parseInt(result.seconds || '0') || 0,
      };
    } catch (error) {
      // 更新 LLM API 日志，记录失败
      if (logId) {
        const { failLLMApiLog } = await import('../llm-api-logger');
        failLLMApiLog(logId, {
          duration: Date.now() - startTime,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(taskId: string): void {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
    }

    const interval = this.pollingIntervals.get(taskId);
    if (interval) {
      clearTimeout(interval);
      this.pollingIntervals.delete(taskId);
    }
  }
}
