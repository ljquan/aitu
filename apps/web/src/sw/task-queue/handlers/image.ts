/**
 * Image Generation Handler for Service Worker
 *
 * Handles image generation tasks including standard images and inspiration boards.
 * 使用通用的媒体生成工具函数来减少重复代码
 */

import type { SWTask, TaskResult, HandlerConfig, TaskHandler } from '../types';
import { TaskExecutionPhase } from '../types';
import {
  extractUrlsFromUploadedImages,
  buildImageGenerationRequestBody,
  parseImageGenerationResponse,
  processReferenceImages,
  convertAspectRatioToSize,
} from '../utils/media-generation-utils';
import type { LLMReferenceImage } from '../llm-api-logger';
const ASYNC_IMAGE_MODELS = [
  'gemini-3-pro-image-preview-async',
  'gemini-3-pro-image-preview-2k-async',
  'gemini-3-pro-image-preview-4k-async',
];

const isAsyncImageModel = (model?: string): boolean => {
  if (!model) return false;
  const lower = model.toLowerCase();
  return ASYNC_IMAGE_MODELS.some((m) => lower.includes(m));
};

const isMJImageModel = (model?: string): boolean => {
  if (!model) return false;
  return model.toLowerCase().startsWith('mj');
};

const getExtensionFromUrl = (url: string): string => {
  try {
    const clean = url.split('?')[0];
    const last = clean.split('.').pop();
    if (last && last.length <= 5) {
      return last.toLowerCase();
    }
  } catch (e) {
    // ignore
  }
  return 'jpg';
};

// 规范化 baseUrl，移除尾部 / 或 /v1，便于拼接 /v1/videos
const normalizeApiBase = (url: string): string => {
  let base = url.replace(/\/+$/, '');
  if (base.endsWith('/v1')) {
    base = base.slice(0, -3);
  }
  return base;
};

/**
 * Image generation handler
 */
export class ImageHandler implements TaskHandler {
  private abortControllers: Map<string, AbortController> = new Map();

  /**
   * Execute image generation task
   */
  async execute(task: SWTask, config: HandlerConfig): Promise<TaskResult> {
    const abortController = new AbortController();
    this.abortControllers.set(task.id, abortController);

    try {
      config.onProgress(task.id, 0, TaskExecutionPhase.SUBMITTING);

      const result = await this.generateImage(
        task,
        config,
        abortController.signal
      );

      return result;
    } finally {
      this.abortControllers.delete(task.id);
    }
  }

  /**
   * Cancel image generation
   */
  cancel(taskId: string): void {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
    }
  }

  /**
   * Generate image using Gemini API
   */
  private async generateImage(
    task: SWTask,
    config: HandlerConfig,
    signal: AbortSignal
  ): Promise<TaskResult> {
    const { geminiConfig } = config;
    const { params } = task;

    // 合并参考图片来源
    const rawRefImages =
      (params.referenceImages as string[] | undefined) ||
      extractUrlsFromUploadedImages(params.uploadedImages);

    // 处理参考图片：本地图片转 base64，远程图片检查缓存时间
    let processedRefImages: string[] | undefined;
    const { getImageInfo } = await import('../utils/media-generation-utils');
    const { startLLMApiLog, completeLLMApiLog, failLLMApiLog } = await import(
      '../llm-api-logger'
    );
    const { debugFetch } = await import('../debug-fetch');
    let referenceImageInfos: LLMReferenceImage[] | undefined;

    if (rawRefImages && rawRefImages.length > 0) {
      // console.log(`[ImageHandler] Processing ${rawRefImages.length} reference images:`, rawRefImages.map(u => u.substring(0, 60)));
      processedRefImages = await processReferenceImages(rawRefImages, signal);
      // console.log(`[ImageHandler] Processed reference images:`, processedRefImages.map(u =>
      //   u.startsWith('data:') ? `base64 (${u.length} chars)` : u.substring(0, 60)
      // ));

      // 获取参考图片详情用于日志
      referenceImageInfos = await Promise.all(
        rawRefImages.map(async (url) => {
          try {
            const info = await getImageInfo(url, signal);
            return {
              url: info.url,
              size: info.size,
              width: info.width,
              height: info.height,
            };
          } catch (err) {
            console.warn(
              `[ImageHandler] Failed to get image info for log: ${url}`,
              err
            );
            return {
              url,
              size: 0,
              width: 0,
              height: 0,
            };
          }
        })
      );
    }

    const resolvedSize =
      params.size ||
      convertAspectRatioToSize(params.aspectRatio as string | undefined);

    if (isMJImageModel(params.model as string | undefined)) {
      return this.generateMJImage(task, config, signal, processedRefImages);
    }

    // 异步模型：走提交 + 轮询
    if (isAsyncImageModel(params.model)) {
      return this.generateAsyncImage(task, config, signal, resolvedSize);
    }

    // 使用通用函数构建请求体（同步模型）
    const requestBody = buildImageGenerationRequestBody(
      {
        prompt: params.prompt,
        model: params.model,
        size: resolvedSize,
        referenceImages: processedRefImages,
        isInspirationBoard: params.isInspirationBoard as boolean | undefined,
        inspirationBoardImageCount: params.inspirationBoardImageCount as
          | number
          | undefined,
      },
      geminiConfig.modelName
    );

    config.onProgress(task.id, 10, TaskExecutionPhase.SUBMITTING);

    const startTime = Date.now();

    // 为日志记录构建完整的请求体（不包含参考图片的 base64 数据以节省空间）
    const requestBodyForLog = {
      ...requestBody,
      // 如果有参考图片，只记录数量而不记录 base64 数据
      ...(processedRefImages && processedRefImages.length > 0
        ? {
            reference_images: `[${processedRefImages.length} images - data omitted]`,
          }
        : {}),
    };

    const logId = startLLMApiLog({
      endpoint: '/images/generations',
      model: geminiConfig.modelName || 'unknown',
      taskType: 'image',
      prompt: params.prompt as string,
      requestBody: JSON.stringify(requestBodyForLog, null, 2),
      hasReferenceImages: !!processedRefImages && processedRefImages.length > 0,
      referenceImageCount: processedRefImages?.length,
      referenceImages: referenceImageInfos,
      taskId: task.id,
    });

    // Make API request (using debugFetch for logging)
    const response = await debugFetch(
      `${geminiConfig.baseUrl}/images/generations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${geminiConfig.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal,
      },
      {
        label: `🎨 生成图片 (${geminiConfig.modelName})`,
        logRequestBody: true,
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
        `Image generation failed: ${response.status} - ${errorText}`
      );
    }

    config.onProgress(task.id, 80, TaskExecutionPhase.DOWNLOADING);

    const data = await response.json();
    const responseBodyStr = JSON.stringify(data);

    // 使用通用函数解析响应（异步：Base64 会被缓存为虚拟路径 URL）
    const { url } = await parseImageGenerationResponse(data, task.id);

    completeLLMApiLog(logId, {
      httpStatus: response.status,
      duration: Date.now() - startTime,
      resultType: 'image',
      resultCount: 1,
      resultUrl: url,
      responseBody: responseBodyStr,
    });

    config.onProgress(task.id, 100);

    return {
      url,
      format: 'png',
      size: 0, // Size will be determined when downloading
      width: params.width,
      height: params.height,
    };
  }

  /**
   * 异步图片生成：提交任务并轮询结果
   */
  private async generateAsyncImage(
    task: SWTask,
    config: HandlerConfig,
    signal: AbortSignal,
    resolvedSize?: string
  ): Promise<TaskResult> {
    const { geminiConfig } = config;
    const { params } = task;

    const aspectRatio = this.getAspectRatio(
      params.aspectRatio as string,
      resolvedSize
    );
    // 异步接口使用 size 字段传递比例枚举
    const sizeParam = aspectRatio;
    const baseUrl = normalizeApiBase(geminiConfig.baseUrl);

    // 处理参考图：支持多图，按接口字段重复 append input_reference
    const refImages =
      (params.referenceImages as string[] | undefined) ||
      extractUrlsFromUploadedImages(params.uploadedImages);
    const refBlobs: Blob[] = [];
    if (refImages && refImages.length > 0) {
      for (let i = 0; i < refImages.length; i++) {
        const blob = await this.toBlob(refImages[i], signal);
        if (blob) {
          refBlobs.push(blob);
        }
      }
    }

    const formData = new FormData();
    formData.append(
      'model',
      params.model ||
        geminiConfig.modelName ||
        'gemini-3-pro-image-preview-async'
    );
    formData.append('prompt', params.prompt || '');
    if (sizeParam) {
      formData.append('size', sizeParam);
    }
    if (refBlobs.length > 0) {
      refBlobs.forEach((blob, idx) => {
        formData.append('input_reference', blob, `reference-${idx}.png`);
      });
    }

    config.onProgress(task.id, 5, TaskExecutionPhase.SUBMITTING);

    const submitResp = await fetch(`${baseUrl}/v1/videos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${geminiConfig.apiKey}`,
      },
      body: formData,
      signal,
    });

    if (!submitResp.ok) {
      const text = await submitResp.text();
      throw new Error(
        `Async image submit failed: ${submitResp.status} - ${text}`
      );
    }

    const submitData = await submitResp.json();

    if (submitData.status === 'failed') {
      const msg =
        typeof submitData.error === 'string'
          ? submitData.error
          : submitData.error?.message || '图片生成失败';
      throw new Error(msg);
    }

    const taskRemoteId = submitData.id;

    // 轮询
    const interval = 5000;
    const maxAttempts = 1080; // ~90min
    let attempts = 0;
    let progress = submitData.progress ?? 0;

    config.onProgress(task.id, progress, TaskExecutionPhase.POLLING);

    while (attempts < maxAttempts) {
      await this.sleep(interval, signal);
      attempts += 1;

      const queryResp = await fetch(`${baseUrl}/v1/videos/${taskRemoteId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${geminiConfig.apiKey}`,
        },
        signal,
      });

      if (!queryResp.ok) {
        const text = await queryResp.text();
        throw new Error(
          `Async image query failed: ${queryResp.status} - ${text}`
        );
      }

      const statusData = await queryResp.json();
      progress = statusData.progress ?? progress;
      config.onProgress(task.id, progress, TaskExecutionPhase.POLLING);

      if (statusData.status === 'completed') {
        const url = statusData.video_url || statusData.url;
        if (!url) {
          throw new Error('API 未返回有效的图片 URL');
        }
        return {
          url,
          format: getExtensionFromUrl(url),
          size: 0,
        };
      }

      if (statusData.status === 'failed') {
        const msg =
          typeof statusData.error === 'string'
            ? statusData.error
            : statusData.error?.message || '图片生成失败';
        throw new Error(msg);
      }
    }

    throw new Error('图片生成超时');
  }

  private async generateMJImage(
    task: SWTask,
    config: HandlerConfig,
    signal: AbortSignal,
    processedRefImages?: string[]
  ): Promise<TaskResult> {
    const { geminiConfig } = config;
    const { params } = task;
    const { debugFetch } = await import('../debug-fetch');
    const { startLLMApiLog, completeLLMApiLog, failLLMApiLog } = await import(
      '../llm-api-logger'
    );

    const baseUrl = normalizeApiBase(geminiConfig.baseUrl);
    const base64Array = (processedRefImages || []).map((img) =>
      img.startsWith('data:') ? img.replace(/^data:[^;]+;base64,/, '') : img
    );

    const submitBody = {
      botType: 'MID_JOURNEY',
      prompt: params.prompt,
      base64Array,
    };

    const startTime = Date.now();
    const logId = startLLMApiLog({
      endpoint: '/mj/submit/imagine',
      model: params.model as string,
      taskType: 'image',
      prompt: params.prompt as string,
      requestBody: JSON.stringify(
        {
          ...submitBody,
          base64Array:
            base64Array.length > 0 ? `[${base64Array.length} images]` : [],
        },
        null,
        2
      ),
      hasReferenceImages: base64Array.length > 0,
      referenceImageCount: base64Array.length,
      taskId: task.id,
    });

    const submitResponse = await debugFetch(
      `${baseUrl}/mj/submit/imagine`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${geminiConfig.apiKey}`,
        },
        body: JSON.stringify(submitBody),
        signal,
      },
      {
        label: `🎨 提交 MJ Imagine (${params.model})`,
        logRequestBody: true,
        logResponseBody: true,
      }
    );

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      failLLMApiLog(logId, {
        httpStatus: submitResponse.status,
        duration: Date.now() - startTime,
        errorMessage: errorText,
        responseBody: errorText,
      });
      throw new Error(
        `MJ submission failed: ${submitResponse.status} - ${errorText}`
      );
    }

    const submitData = await submitResponse.json();
    const taskId = submitData?.result?.toString();
    if (!taskId) {
      throw new Error('MJ submission missing task id');
    }

    for (let attempt = 0; attempt < 1080; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const queryResponse = await debugFetch(
        `${baseUrl}/mj/task/${taskId}/fetch`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${geminiConfig.apiKey}`,
          },
          signal,
        },
        {
          label: `🎨 查询 MJ 任务 (${taskId})`,
          logResponseBody: true,
        }
      );

      if (!queryResponse.ok) {
        const errorText = await queryResponse.text();
        failLLMApiLog(logId, {
          httpStatus: queryResponse.status,
          duration: Date.now() - startTime,
          errorMessage: errorText,
          responseBody: errorText,
        });
        throw new Error(
          `MJ query failed: ${queryResponse.status} - ${errorText}`
        );
      }

      const data = await queryResponse.json();
      const status = String(data?.status || '').toLowerCase();
      if (['success', 'succeed', 'completed', 'done'].includes(status)) {
        const imageUrl = data?.imageUrl;
        if (!imageUrl) {
          throw new Error('MJ response missing imageUrl');
        }
        completeLLMApiLog(logId, {
          httpStatus: 200,
          duration: Date.now() - startTime,
          resultType: 'image',
          resultCount: 1,
          resultUrl: imageUrl,
          responseBody: JSON.stringify(data),
        });
        return {
          url: imageUrl,
          format: 'jpg',
          size: 0,
        };
      }

      if (['fail', 'failed', 'failure', 'error'].includes(status)) {
        const message = data?.failReason || 'MJ generation failed';
        failLLMApiLog(logId, {
          duration: Date.now() - startTime,
          errorMessage: message,
          responseBody: JSON.stringify(data),
        });
        throw new Error(message);
      }

      config.onProgress(
        task.id,
        Math.min(95, 5 + attempt * 0.1),
        TaskExecutionPhase.POLLING
      );
    }

    failLLMApiLog(logId, {
      duration: Date.now() - startTime,
      errorMessage: 'MJ generation timeout',
    });
    throw new Error('MJ generation timeout');
  }

  private getAspectRatio(
    aspectRatio?: string,
    size?: string
  ): string | undefined {
    if (aspectRatio) return aspectRatio;
    if (size && size.includes('x')) {
      const [wStr, hStr] = size.split('x');
      const w = Number(wStr);
      const h = Number(hStr);
      if (w && h) {
        const gcd = (a: number, b: number): number =>
          b === 0 ? a : gcd(b, a % b);
        const g = gcd(w, h);
        return `${w / g}:${h / g}`;
      }
    }
    return '1:1';
  }

  private async toBlob(
    value: string,
    signal: AbortSignal
  ): Promise<Blob | null> {
    try {
      if (value.startsWith('data:')) {
        const res = await fetch(value, { signal });
        return await res.blob();
      }

      const res = await fetch(value, { signal });
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = setTimeout(resolve, ms);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(id);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true }
      );
    });
  }
}
