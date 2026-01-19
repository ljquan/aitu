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
    const { startLLMApiLog, completeLLMApiLog, failLLMApiLog } = await import('../llm-api-logger');
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
            console.warn(`[ImageHandler] Failed to get image info for log: ${url}`, err);
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

    // 使用通用函数构建请求体
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
    const logId = startLLMApiLog({
      endpoint: '/images/generations',
      model: geminiConfig.modelName || 'unknown',
      taskType: 'image',
      prompt: params.prompt as string,
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
}
