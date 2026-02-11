/**
 * Media Executor (Main Thread)
 *
 * 主线程媒体执行器，直接调用 API 并将结果写入 IndexedDB。
 * 所有 LLM API 请求在主线程直接发起（不经过 Service Worker）。
 */

import type {
  IMediaExecutor,
  ImageGenerationParams,
  VideoGenerationParams,
  AIAnalyzeParams,
  AIAnalyzeResult,
  ExecutionOptions,
  GeminiConfig,
  VideoAPIConfig,
} from './types';
import { taskStorageWriter } from './task-storage-writer';
import { geminiSettings } from '../../utils/settings-manager';
import {
  startLLMApiLog,
  completeLLMApiLog,
  failLLMApiLog,
  updateLLMApiLogMetadata,
  LLMReferenceImage,
} from './llm-api-logger';
import { parseToolCalls, extractTextContent } from '@aitu/utils';
import { isAuthError, dispatchApiAuthError } from '../../utils/api-auth-error-event';
import { unifiedCacheService } from '../unified-cache-service';
import { submitVideoGeneration } from '../media-api';
import {
  extractPromptFromMessages,
  buildImageRequestBody,
  parseImageResponse,
  pollVideoStatus,
  isAsyncImageModel,
  generateAsyncImage,
  ensureBase64ForAI,
} from './fallback-utils';
import { resolveAdapterForModel } from '../model-adapters';
import {
  executeImageViaAdapter,
  executeVideoViaAdapter,
} from './fallback-adapter-routes';

/** 从 uploadedImages 提取 URL 列表，与 SW ImageHandler 逻辑一致 */
function extractUrlsFromUploadedImages(uploadedImages: unknown): string[] | undefined {
  if (!uploadedImages || !Array.isArray(uploadedImages)) return undefined;
  const urls = (uploadedImages as Array<{ url?: string }>)
    .filter((img) => img && typeof img === 'object' && typeof img.url === 'string')
    .map((img) => img.url as string);
  return urls.length > 0 ? urls : undefined;
}

/**
 * 主线程媒体执行器
 *
 * 在主线程直接执行媒体生成任务，所有 API 请求使用原生 fetch。
 * 页面刷新会中断任务执行，通过 beforeunload 提示用户保护。
 */
export class FallbackMediaExecutor implements IMediaExecutor {
  readonly name = 'FallbackMediaExecutor';

  /**
   * 降级执行器始终可用（只要浏览器支持 fetch）
   */
  async isAvailable(): Promise<boolean> {
    return typeof fetch === 'function';
  }

  /**
   * 生成图片
   * 参考图逻辑与 SW ImageHandler 对齐：支持 referenceImages 与 uploadedImages
   */
  async generateImage(
    params: ImageGenerationParams,
    options?: ExecutionOptions
  ): Promise<void> {
    const { taskId, prompt, model, size, quality, count = 1 } = params;
    const referenceImages =
      (params.referenceImages && params.referenceImages.length > 0
        ? params.referenceImages
        : undefined) ||
      extractUrlsFromUploadedImages(params.uploadedImages);

    const config = this.getConfig();
    const hasApiKey = Boolean(config.geminiConfig.apiKey);
    const baseUrl = config.geminiConfig.baseUrl ?? '(default)';

    // 更新任务状态为 processing
    await taskStorageWriter.updateStatus(taskId, 'processing');
    options?.onProgress?.({ progress: 0, phase: 'submitting' });

    const startTime = Date.now();
    const modelName = model || config.geminiConfig.modelName;

    // 专用 adapter 路由（mj-imagine 等非 gemini 模型）
    const imageAdapter = resolveAdapterForModel(modelName, 'image');
    if (imageAdapter && imageAdapter.kind === 'image' && imageAdapter.id !== 'gemini-image-adapter') {
      return executeImageViaAdapter(taskId, imageAdapter, { prompt, model: modelName, size, quality, count, referenceImages, params: params.params }, options, startTime);
    }

    // 异步图片模型：使用 /v1/videos 接口（与 SW 模式一致）
    if (isAsyncImageModel(modelName)) {
      return this.generateAsyncImageTask(
        taskId,
        { prompt, model: modelName, size, referenceImages },
        config,
        options,
        startTime
      );
    }

    // 开始记录 LLM API 调用
    const logId = startLLMApiLog({
      endpoint: '/images/generations',
      model: modelName,
      taskType: 'image',
      prompt,
      hasReferenceImages: !!referenceImages && referenceImages.length > 0,
      referenceImageCount: referenceImages?.length,
      referenceImages: referenceImages?.map(url => ({ url, size: 0, width: 0, height: 0 } as LLMReferenceImage)),
      taskId,
    });

    try {
      // 处理参考图片：统一转为 base64（API 要求），并行处理提升性能
      let processedImages: string[] | undefined;
      if (referenceImages && referenceImages.length > 0) {
        const t0 = performance.now();
        processedImages = await Promise.all(
          referenceImages.map(async (imgUrl) => {
            const imageData = await unifiedCacheService.getImageForAI(imgUrl);
            return ensureBase64ForAI(imageData, options?.signal);
          })
        );
        console.debug('[FallbackMediaExecutor] generateImage: base64 conversion took', Math.round(performance.now() - t0), 'ms for', referenceImages.length, 'images, taskId:', taskId);
      }

      // 构建请求体
      const requestBody = buildImageRequestBody({
        prompt,
        model: modelName,
        size,
        referenceImages: processedImages,
        quality,
        n: Math.min(Math.max(1, count), 10),
      });

      options?.onProgress?.({ progress: 10, phase: 'submitting' });

      // 直接调用 API
      const url = `${config.geminiConfig.baseUrl}/images/generations`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.geminiConfig.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: options?.signal,
      });

      if (!response.ok) {
        const duration = Date.now() - startTime;
        const errorBody = await response.text().catch(() => `HTTP ${response.status} ${response.statusText || 'Error'}`);
        failLLMApiLog(logId, {
          httpStatus: response.status,
          duration,
          errorMessage: errorBody.substring(0, 500),
        });
        throw new Error(`Image generation failed: ${response.status} - ${errorBody.substring(0, 200)}`);
      }

      options?.onProgress?.({ progress: 80, phase: 'downloading' });

      const data = await response.json();
      const result = parseImageResponse(data);
      const duration = Date.now() - startTime;

      console.debug('[FallbackMediaExecutor] generateImage: success, duration:', duration, 'ms, taskId:', taskId);

      // 记录成功
      completeLLMApiLog(logId, {
        httpStatus: response.status,
        duration,
        resultType: 'image',
        resultCount: 1,
        resultUrl: result.url,
      });

      options?.onProgress?.({ progress: 100 });

      // 完成任务
      await taskStorageWriter.completeTask(taskId, {
        url: result.url,
        urls: result.urls,
        format: 'png',
        size: 0,
      });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMessage = error.message || 'Image generation failed';
      console.error('[FallbackMediaExecutor] generateImage failed:', errorMessage, 'taskId:', taskId, 'duration:', duration, 'ms');

      // 检测认证错误，触发设置弹窗
      if (isAuthError(errorMessage)) {
        dispatchApiAuthError({ message: errorMessage, source: 'image' });
      }
      
      // 如果日志还未更新为失败，更新它
      failLLMApiLog(logId, {
        duration,
        errorMessage,
      });
      await taskStorageWriter.failTask(taskId, {
        code: 'IMAGE_GENERATION_ERROR',
        message: errorMessage,
      });
      throw error;
    }
  }

  /**
   * 生成异步图片（使用 /v1/videos 接口）
   * 与 SW 模式保持一致的实现
   */
  private async generateAsyncImageTask(
    taskId: string,
    params: {
      prompt: string;
      model: string;
      size?: string;
      referenceImages?: string[];
    },
    config: { geminiConfig: GeminiConfig; videoConfig: VideoAPIConfig },
    options?: ExecutionOptions,
    startTime?: number
  ): Promise<void> {
    const logStartTime = startTime || Date.now();

    // 开始记录 LLM API 调用
    const logId = startLLMApiLog({
      endpoint: '/v1/videos (async image)',
      model: params.model,
      taskType: 'image',
      prompt: params.prompt,
      hasReferenceImages: params.referenceImages && params.referenceImages.length > 0,
      referenceImageCount: params.referenceImages?.length,
      referenceImages: params.referenceImages?.map(url => ({ url, size: 0, width: 0, height: 0 } as LLMReferenceImage)),
      taskId,
    });

    try {
      // 处理参考图片：统一转为 base64（与同步路径一致），并行处理
      let processedImages: string[] | undefined;
      if (params.referenceImages && params.referenceImages.length > 0) {
        const t0 = performance.now();
        processedImages = await Promise.all(
          params.referenceImages.map(async (imgUrl) => {
            const imageData = await unifiedCacheService.getImageForAI(imgUrl);
            return ensureBase64ForAI(imageData, options?.signal);
          })
        );
        console.debug('[FallbackMediaExecutor] generateAsyncImage: base64 conversion took', Math.round(performance.now() - t0), 'ms for', params.referenceImages.length, 'images, taskId:', taskId);
      }

      // 调用异步图片生成
      const result = await generateAsyncImage(
        {
          prompt: params.prompt,
          model: params.model,
          size: params.size,
          referenceImages: processedImages,
        },
        config.geminiConfig,
        {
          onProgress: (progress) => {
            options?.onProgress?.({ progress, phase: progress < 10 ? 'submitting' : 'polling' });
          },
          onSubmitted: async (remoteId) => {
            // 保存 remoteId，用于页面刷新后恢复轮询
            await taskStorageWriter.updateRemoteId(taskId, remoteId);
          },
          signal: options?.signal,
        }
      );

      const duration = Date.now() - logStartTime;

      // 记录成功
      completeLLMApiLog(logId, {
        httpStatus: 200,
        duration,
        resultType: 'image',
        resultCount: 1,
        resultUrl: result.url,
      });

      options?.onProgress?.({ progress: 100 });

      // 完成任务
      await taskStorageWriter.completeTask(taskId, {
        url: result.url,
        format: result.format,
        size: 0,
      });
    } catch (error: any) {
      const duration = Date.now() - logStartTime;
      const errorMessage = error.message || 'Async image generation failed';
      
      // 检测认证错误，触发设置弹窗
      if (isAuthError(errorMessage)) {
        dispatchApiAuthError({ message: errorMessage, source: 'async-image' });
      }
      
      failLLMApiLog(logId, {
        duration,
        errorMessage,
      });
      await taskStorageWriter.failTask(taskId, {
        code: 'ASYNC_IMAGE_GENERATION_ERROR',
        message: errorMessage,
      });
      throw error;
    }
  }

  /**
   * 生成视频
   * 使用共享 submitVideoGeneration，支持参考图且参考图体积控制在 1MB 内
   */
  async generateVideo(
    params: VideoGenerationParams,
    options?: ExecutionOptions
  ): Promise<void> {
    const { taskId, prompt, model = 'veo3', duration, size = '1280x720' } = params;
    const config = this.getConfig();
    const startTime = Date.now();
    const durationEncodedInModel = (m?: string | null) => Boolean(m && m.startsWith('sora-2-'));
    const shouldSkipSeconds = durationEncodedInModel(model);
    const secondsToSend = shouldSkipSeconds ? undefined : (duration ?? '8');

    await taskStorageWriter.updateStatus(taskId, 'processing');
    options?.onProgress?.({ progress: 0, phase: 'submitting' });

    // 专用 adapter 路由（kling 等非 gemini 模型）
    const videoAdapter = resolveAdapterForModel(model, 'video');
    if (videoAdapter && videoAdapter.kind === 'video' && videoAdapter.id !== 'gemini-video-adapter') {
      return executeVideoViaAdapter(taskId, videoAdapter, { prompt, model, size, duration, referenceImages: params.referenceImages, inputReference: params.inputReference, params: params.params }, options, startTime);
    }

    // 收集参考图原始 URL（用于日志记录）
    const logRefUrls =
      (params.referenceImages && params.referenceImages.length > 0
        ? params.referenceImages
        : undefined) ||
      (params.inputReference ? [params.inputReference] : undefined);

    const logId = startLLMApiLog({
      endpoint: '/v1/videos',
      model,
      taskType: 'video',
      prompt,
      taskId,
      hasReferenceImages: !!logRefUrls && logRefUrls.length > 0,
      referenceImageCount: logRefUrls?.length,
      referenceImages: logRefUrls?.map(url => ({ url, size: 0, width: 0, height: 0 } as LLMReferenceImage)),
    });

    try {
      // 参考图：虚拟路径先转为 data URL（1MB 内），再交给 submitVideoGeneration 走 FormData+压缩
      const refUrls =
        (params.referenceImages && params.referenceImages.length > 0
          ? params.referenceImages
          : undefined) ||
        (params.inputReference ? [params.inputReference] : undefined);
      let referenceImages: string[] | undefined;
      if (refUrls && refUrls.length > 0) {
        const t0 = performance.now();
        const isVirtual = (u: string) =>
          u.startsWith('/__aitu_cache__/') || u.startsWith('/asset-library/');
        referenceImages = await Promise.all(
          refUrls.map(async (url) => {
            if (isVirtual(url)) {
              const imageData = await unifiedCacheService.getImageForAI(url);
              return ensureBase64ForAI(imageData, options?.signal);
            }
            return url;
          })
        );
        console.debug('[FallbackMediaExecutor] generateVideo: ref image processing took', Math.round(performance.now() - t0), 'ms for', refUrls.length, 'images, taskId:', taskId);
      }

      const videoApiConfig = {
        ...config.videoConfig,
        defaultModel: 'veo3' as const,
      };
      const videoId = await submitVideoGeneration(
        {
          prompt,
          model,
          size,
          duration: secondsToSend,
          referenceImages,
        },
        videoApiConfig,
        options?.signal
      );

      if (!videoId) {
        const elapsedTime = Date.now() - startTime;
        failLLMApiLog(logId, {
          httpStatus: 200,
          duration: elapsedTime,
          errorMessage: 'No video ID returned from API',
        });
        throw new Error('No video ID returned from API');
      }

      updateLLMApiLogMetadata(logId, {
        remoteId: videoId,
        httpStatus: 200,
      });

      options?.onProgress?.({ progress: 10, phase: 'polling' });

      // 轮询等待视频完成
      const result = await pollVideoStatus(
        videoId,
        config.videoConfig,
        (progress) => {
          // progress 是 0-1 范围（来自 pollVideoStatus 的 progress/100）
          // 映射到 10-90 范围：10 + (0~1) * 80 = 10~90
          options?.onProgress?.({ progress: 10 + progress * 80, phase: 'polling' });
        },
        options?.signal
      );

      const elapsedTime = Date.now() - startTime;

      // 记录成功
      completeLLMApiLog(logId, {
        httpStatus: 200,
        duration: elapsedTime,
        resultType: 'video',
        resultCount: 1,
        resultUrl: result.url,
        remoteId: videoId,
      });

      options?.onProgress?.({ progress: 100 });

      // 完成任务
      await taskStorageWriter.completeTask(taskId, {
        url: result.url,
        format: 'mp4',
        size: 0,
        duration: duration ? parseInt(duration, 10) : undefined,
      });
    } catch (error: any) {
      const elapsedTime = Date.now() - startTime;
      const errorMessage = error.message || 'Video generation failed';
      
      // 检测认证错误，触发设置弹窗
      if (isAuthError(errorMessage)) {
        dispatchApiAuthError({ message: errorMessage, source: 'video' });
      }
      
      failLLMApiLog(logId, {
        duration: elapsedTime,
        errorMessage,
      });
      await taskStorageWriter.failTask(taskId, {
        code: error.code || 'VIDEO_GENERATION_ERROR',
        message: errorMessage,
      });
      throw error;
    }
  }

  /**
   * AI 分析
   */
  async aiAnalyze(
    params: AIAnalyzeParams,
    options?: ExecutionOptions
  ): Promise<AIAnalyzeResult> {
    const { taskId, prompt, messages, images, referenceImages, model, textModel, systemPrompt } = params;
    const config = this.getConfig();
    const startTime = Date.now();
    // 优先使用用户选择的模型
    const modelName = textModel || model || config.geminiConfig.textModelName || config.geminiConfig.modelName;
    // 合并图片参数
    const allImages = referenceImages || images || [];

    // 注意：AI 分析任务不写入 tasks 表，chat 类型不应该出现在用户任务列表
    options?.onProgress?.({ progress: 0, phase: 'submitting' });

    // 构建消息数组
    let chatMessages: Array<{ role: string; content: unknown }>;

    if (messages && messages.length > 0) {
      // 使用预构建的消息（与 SW 端一致）
      chatMessages = messages;
    } else if (prompt) {
      // 使用 prompt 构建消息
      const contents: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: 'text', text: prompt },
      ];

      // 添加图片
      if (allImages.length > 0) {
        for (const imageUrl of allImages) {
          contents.push({
            type: 'image_url',
            image_url: { url: imageUrl },
          });
        }
      }

      chatMessages = [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: contents },
      ];
    } else {
      throw new Error('缺少必填参数：需要 messages 或 prompt');
    }

    // 提取 prompt 用于日志记录
    const logPrompt = extractPromptFromMessages(chatMessages);

    // 开始记录 LLM API 调用
    const logId = startLLMApiLog({
      endpoint: '/chat/completions',
      model: modelName,
      taskType: 'chat',
      prompt: logPrompt,
      hasReferenceImages: allImages.length > 0,
      referenceImageCount: allImages.length,
      taskId,
    });

    const requestBody = {
      model: modelName,
      messages: chatMessages,
    };

    try {
      options?.onProgress?.({ progress: 30, phase: 'submitting' });

      const response = await fetch(`${config.geminiConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.geminiConfig.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: options?.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const elapsedTime = Date.now() - startTime;
        failLLMApiLog(logId, {
          httpStatus: response.status,
          duration: elapsedTime,
          errorMessage: errorText.substring(0, 500),
        });
        throw new Error(`AI analyze failed: ${response.status} - ${errorText.substring(0, 200)}`);
      }

      options?.onProgress?.({ progress: 80 });

      const data = await response.json();
      const fullResponse = data.choices?.[0]?.message?.content || '';
      const elapsedTime = Date.now() - startTime;

      // 记录成功
      completeLLMApiLog(logId, {
        httpStatus: response.status,
        duration: elapsedTime,
        resultType: 'text',
        resultCount: 1,
        resultText: fullResponse.substring(0, 500),
        responseBody: JSON.stringify(data), // 记录完整的 JSON 响应体
      });

      // 解析 tool calls（AI 规划的后续任务）
      const toolCalls = parseToolCalls(fullResponse);
      const textContent = extractTextContent(fullResponse);

      // 转换为 addSteps 格式
      const addSteps = toolCalls.map((tc, index) => {
        // 替换图片占位符
        let processedArgs = { ...tc.arguments };
        if (images && images.length > 0 && processedArgs.referenceImages) {
          const refs = processedArgs.referenceImages as string[];
          processedArgs.referenceImages = refs.map((placeholder) => {
            const match = placeholder.match(/\[图片(\d+)\]/);
            if (match) {
              const idx = parseInt(match[1], 10) - 1;
              return images[idx] || placeholder;
            }
            return placeholder;
          });
        }

        return {
          id: `ai-step-${Date.now()}-${index}`,
          mcp: tc.name,
          args: processedArgs,
          description: textContent || `执行 ${tc.name}`,
          status: 'pending' as const,
        };
      });

      options?.onProgress?.({ progress: 100 });

      return {
        content: textContent,
        addSteps: addSteps.length > 0 ? addSteps : undefined,
      };
    } catch (error: any) {
      const elapsedTime = Date.now() - startTime;
      const errorMessage = error.message || 'AI analyze failed';
      
      // 检测认证错误，触发设置弹窗
      if (isAuthError(errorMessage)) {
        dispatchApiAuthError({ message: errorMessage, source: 'ai-analyze' });
      }
      
      failLLMApiLog(logId, {
        duration: elapsedTime,
        errorMessage,
      });
      throw error;
    }
  }

  /**
   * 规范化 baseUrl，移除尾部 / 或 /v1，便于拼接 /v1/videos
   */
  private normalizeApiBase(url: string): string {
    let base = url.replace(/\/+$/, '');
    if (base.endsWith('/v1')) {
      base = base.slice(0, -3);
    }
    return base;
  }

  /**
   * 获取 API 配置
   */
  private getConfig(): { geminiConfig: GeminiConfig; videoConfig: VideoAPIConfig } {
    const settings = geminiSettings.get();

    return {
      geminiConfig: {
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl || 'https://api.tu-zi.com/v1',
        modelName: settings.chatModel || 'gemini-2.0-flash',
        textModelName: settings.textModelName,
      },
      videoConfig: {
        apiKey: settings.apiKey,
        // 规范化 baseUrl，移除尾部 / 或 /v1，便于拼接 /v1/videos
        baseUrl: this.normalizeApiBase(settings.baseUrl || 'https://api.tu-zi.com'),
      },
    };
  }

}

/**
 * 降级执行器单例
 */
export const fallbackMediaExecutor = new FallbackMediaExecutor();
