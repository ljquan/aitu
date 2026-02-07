/**
 * Media Executor (Main Thread)
 *
 * 主线程媒体执行器，直接调用 API 并将结果写入 IndexedDB。
 * 这是主执行器（不再是降级备选），所有任务在主线程执行。
 * API 请求通过 Fetch Relay 代理，页面关闭后 SW 继续执行。
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
} from './llm-api-logger';
import { parseToolCalls, extractTextContent, compressImageBlob } from '@aitu/utils';
import { isAuthError, dispatchApiAuthError } from '../../utils/api-auth-error-event';
import { unifiedCacheService } from '../unified-cache-service';
import { getDataURL } from '../../data/blob';

/** 参考图转 base64 时最大体积（1MB），避免请求体过大 */
const MAX_REFERENCE_IMAGE_BYTES = 1 * 1024 * 1024;
import { submitVideoGeneration } from '../media-api';
import {
  extractPromptFromMessages,
  buildImageRequestBody,
  parseImageResponse,
  pollVideoStatus,
  isAsyncImageModel,
  generateAsyncImage,
} from './fallback-utils';

/** 从 uploadedImages 提取 URL 列表，与 SW ImageHandler 逻辑一致 */
function extractUrlsFromUploadedImages(uploadedImages: unknown): string[] | undefined {
  if (!uploadedImages || !Array.isArray(uploadedImages)) return undefined;
  const urls = (uploadedImages as Array<{ url?: string }>)
    .filter((img) => img && typeof img === 'object' && typeof img.url === 'string')
    .map((img) => img.url as string);
  return urls.length > 0 ? urls : undefined;
}

/** 将 Blob 压缩到 1MB 以内再转 base64（仅图片类型） */
async function blobToBase64Under1MB(blob: Blob): Promise<string> {
  let target = blob;
  if (
    blob.type.startsWith('image/') &&
    blob.size > MAX_REFERENCE_IMAGE_BYTES
  ) {
    target = await compressImageBlob(blob, 1);
  }
  return getDataURL(target);
}

/** 确保图片为 base64 数据（API 要求），且体积控制在 1MB 内；getImageForAI 对未缓存远程 URL 可能返回 URL，需再转 base64 */
async function ensureBase64ForAI(
  imageData: { type: string; value: string },
  signal?: AbortSignal
): Promise<string> {
  const value = imageData.value;
  if (value.startsWith('data:')) {
    const base64Part = value.slice(value.indexOf(',') + 1);
    const estimatedBytes = (base64Part.length * 3) / 4;
    if (estimatedBytes <= MAX_REFERENCE_IMAGE_BYTES) return value;
    const res = await fetch(value, { signal });
    const blob = await res.blob();
    return blobToBase64Under1MB(blob);
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    const res = await fetch(value, { signal });
    if (!res.ok) throw new Error(`Failed to fetch reference image: ${res.status}`);
    const blob = await res.blob();
    return blobToBase64Under1MB(blob);
  }
  return value;
}

/**
 * 主线程降级执行器
 *
 * 当 SW 不可用时，在主线程直接执行媒体生成任务。
 * 缺点：页面刷新会中断任务执行。
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
      taskId,
    });

    try {
      // 处理参考图片：统一转为 base64（API 要求；远程 URL 在未缓存时 getImageForAI 返回 URL，需再转 base64）
      let processedImages: string[] | undefined;
      if (referenceImages && referenceImages.length > 0) {
        processedImages = [];
        for (const imgUrl of referenceImages) {
          const imageData = await unifiedCacheService.getImageForAI(imgUrl);
          const base64 = await ensureBase64ForAI(imageData, options?.signal);
          processedImages.push(base64);
        }
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

      // 调用 API（不添加自定义 header，避免 CORS 预检被服务端拒绝）
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
        const errorText = await response.text();
        const duration = Date.now() - startTime;
        failLLMApiLog(logId, {
          httpStatus: response.status,
          duration,
          errorMessage: errorText.substring(0, 500),
        });
        throw new Error(`Image generation failed: ${response.status} - ${errorText.substring(0, 200)}`);
      }

      options?.onProgress?.({ progress: 80, phase: 'downloading' });

      const data = await response.json();
      const result = parseImageResponse(data);
      const duration = Date.now() - startTime;

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
        format: 'png',
        size: 0,
      });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMessage = error.message || 'Image generation failed';
      
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
      taskId,
    });

    try {
      // 处理参考图片：统一转为 base64（与同步路径一致）
      let processedImages: string[] | undefined;
      if (params.referenceImages && params.referenceImages.length > 0) {
        processedImages = [];
        for (const imgUrl of params.referenceImages) {
          const imageData = await unifiedCacheService.getImageForAI(imgUrl);
          const base64 = await ensureBase64ForAI(imageData, options?.signal);
          processedImages.push(base64);
        }
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

    const logId = startLLMApiLog({
      endpoint: '/v1/videos',
      model,
      taskType: 'video',
      prompt,
      taskId,
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
        referenceImages = [];
        const isVirtual = (u: string) =>
          u.startsWith('/__aitu_cache__/') || u.startsWith('/asset-library/');
        for (const url of refUrls) {
          if (isVirtual(url)) {
            const imageData = await unifiedCacheService.getImageForAI(url);
            const dataUrl = await ensureBase64ForAI(imageData, options?.signal);
            referenceImages.push(dataUrl);
          } else {
            referenceImages.push(url);
          }
        }
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
          options?.onProgress?.({ progress: 10 + progress * 0.8, phase: 'polling' });
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
        duration: parseInt(duration),
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
        code: 'VIDEO_GENERATION_ERROR',
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
