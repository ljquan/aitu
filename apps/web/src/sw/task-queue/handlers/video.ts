/**
 * Video Generation Handler for Service Worker
 *
 * Handles video generation tasks with polling support.
 * 使用通用的媒体生成工具函数来减少重复代码
 */

import type {
  SWTask,
  TaskResult,
  HandlerConfig,
  TaskHandler,
} from '../types';
import { TaskExecutionPhase } from '../types';
import {
  mergeReferenceImages,
  pollVideoUntilComplete,
  fetchImageWithCache,
} from '../utils/media-generation-utils';

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

/**
 * Video generation handler
 */
export class VideoHandler implements TaskHandler {
  private abortControllers: Map<string, AbortController> = new Map();
  private pollingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  /**
   * Execute video generation task
   */
  async execute(task: SWTask, config: HandlerConfig): Promise<TaskResult> {
    const abortController = new AbortController();
    this.abortControllers.set(task.id, abortController);

    try {
      config.onProgress(task.id, 0, TaskExecutionPhase.SUBMITTING);

      // Submit video generation request
      const { response: submitResponse, logId } = await this.submitVideoGeneration(
        task,
        config,
        abortController.signal
      );

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
   */
  async resume(task: SWTask, config: HandlerConfig): Promise<TaskResult> {
    if (!task.remoteId) {
      throw new Error('No remote ID for resume');
    }

    const abortController = new AbortController();
    this.abortControllers.set(task.id, abortController);

    // 为恢复的任务创建新的日志条目
    const { startLLMApiLog } = await import('../llm-api-logger');
    const logId = startLLMApiLog({
      endpoint: `/videos/${task.remoteId} (resumed)`,
      model: (task.params?.model as string) || 'veo3',
      taskType: 'video',
      prompt: (task.params?.prompt as string) || '',
      taskId: task.id,
    });

    try {
      config.onProgress(task.id, task.progress || 0, TaskExecutionPhase.POLLING);

      const result = await this.pollUntilComplete(
        task.remoteId,
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
   * Cancel video generation
   */
  cancel(taskId: string): void {
    this.cleanup(taskId);
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

    // 处理参考图片：获取 Blob 或回退到 URL
    if (refUrls.length > 0) {
      for (let i = 0; i < refUrls.length; i++) {
        const url = refUrls[i];
        try {
          // 使用通用函数从缓存获取图片
          const blob = await fetchImageWithCache(url, signal);
          if (blob) {
            formData.append('input_reference', blob, `reference-${i + 1}.png`);
          } else {
            // 缓存和网络都失败时，回退到发送 URL
            console.warn(`[VideoHandler] Failed to get reference image: ${url}`);
            formData.append('input_reference', url);
          }
        } catch (err) {
          console.warn(`[VideoHandler] Error fetching reference image: ${url}`, err);
          formData.append('input_reference', url);
        }
      }
    }

    // Import loggers
    const { debugFetch } = await import('../debug-fetch');
    const { startLLMApiLog, completeLLMApiLog, failLLMApiLog } = await import('../llm-api-logger');
    
    const startTime = Date.now();
    const model = (params.model as string) || 'veo3';
    const logId = startLLMApiLog({
      endpoint: '/videos',
      model,
      taskType: 'video',
      prompt: params.prompt as string,
      hasReferenceImages: refUrls.length > 0,
      referenceImageCount: refUrls.length,
      taskId: task.id,
    });

    // Use debugFetch for logging
    const response = await debugFetch(`${videoConfig.baseUrl}/videos`, {
      method: 'POST',
      headers: videoConfig.apiKey
        ? { Authorization: `Bearer ${videoConfig.apiKey}` }
        : undefined,
      body: formData,
      signal,
    }, {
      label: `🎬 提交视频生成 (${model})`,
      logResponseBody: true,
    });

    if (!response.ok) {
      const errorText = await response.text();
      failLLMApiLog(logId, {
        httpStatus: response.status,
        duration: Date.now() - startTime,
        errorMessage: errorText,
        responseBody: errorText,
      });
      throw new Error(`Video submission failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

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
