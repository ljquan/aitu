/**
 * Generation API Service
 *
 * Wraps the AI generation API calls for images and videos.
 * Handles timeouts, cancellation, and error handling.
 */

import {
  GenerationParams,
  TaskType,
  TaskResult,
  TaskExecutionPhase,
  TaskStatus,
} from '../types/task.types';
import {
  GenerationRequest,
  GenerationResponse,
  GenerationError,
} from '../types/generation.types';
import { defaultGeminiClient } from '../utils/gemini-api';
import { videoAPIService, VideoModel } from './video-api-service';
import { TASK_TIMEOUT } from '../constants/TASK_CONSTANTS';
import { analytics } from '../utils/posthog-analytics';
import { legacyTaskQueueService as taskQueueService } from './task-queue';
import { geminiSettings } from '../utils/settings-manager';
import { unifiedCacheService } from './unified-cache-service';
import { convertAspectRatioToSize } from '../constants/image-aspect-ratios';
import { asyncImageAPIService } from './async-image-api-service';
import { isAsyncImageModel } from '../constants/model-config';

/**
 * Generation API Service
 * Manages API calls for content generation with timeout and cancellation support
 */
class GenerationAPIService {
  private abortControllers: Map<string, AbortController>;

  constructor() {
    this.abortControllers = new Map();
  }

  /**
   * Generates content (image or video) based on task parameters
   *
   * @param taskId - Unique task identifier
   * @param params - Generation parameters
   * @param type - Content type (image or video)
   * @returns Promise with task result
   */
  async generate(
    taskId: string,
    params: GenerationParams,
    type: TaskType
  ): Promise<TaskResult> {
    // Create abort controller for this task
    const abortController = new AbortController();
    this.abortControllers.set(taskId, abortController);

    const startTime = Date.now();
    const taskType = type === TaskType.IMAGE ? 'image' : 'video';

    // Track model call start with enhanced parameters
    const hasRefImage =
      !!(params as any).uploadedImage ||
      !!(params as any).uploadedImages ||
      !!(params as any).referenceImages;
    analytics.trackModelCall({
      taskId,
      taskType,
      model:
        params.model ||
        (taskType === 'image' ? 'gemini-image' : 'gemini-video'),
      promptLength: params.prompt.length,
      hasUploadedImage: hasRefImage,
      startTime,
      // Enhanced parameters
      aspectRatio: params.size,
      duration: params.duration,
      resolution:
        params.width && params.height
          ? `${params.width}x${params.height}`
          : undefined,
      batchCount: (params as any).count || 1,
      hasReferenceImage: hasRefImage,
    });

    try {
      // Get timeout for this task type
      const timeout =
        TASK_TIMEOUT[type.toUpperCase() as keyof typeof TASK_TIMEOUT];

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('TIMEOUT'));
        }, timeout);
      });

      // Create generation promise
      const generationPromise = (() => {
        if (type === TaskType.IMAGE && isAsyncImageModel(params.model)) {
          return this.generateAsyncImage(taskId, params);
        }
        if (type === TaskType.IMAGE) {
          return this.generateImage(params, abortController.signal);
        }
        return this.generateVideo(taskId, params, abortController.signal);
      })();

      // Race between generation and timeout
      const result = await Promise.race([generationPromise, timeoutPromise]);

      const duration = Date.now() - startTime;

      // Track success
      analytics.trackModelSuccess({
        taskId,
        taskType,
        model: taskType === 'image' ? 'gemini-image' : 'gemini-video',
        duration,
        resultSize: result.size,
      });

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(
        `[GenerationAPI] Generation failed for task ${taskId}:`,
        error
      );

      if (error.message === 'TIMEOUT') {
        // Track timeout failure
        analytics.trackModelFailure({
          taskId,
          taskType,
          model: taskType === 'image' ? 'gemini-image' : 'gemini-video',
          duration,
          error: 'TIMEOUT',
        });
        throw new Error(`${type === TaskType.IMAGE ? '图片' : '视频'}生成超时`);
      }

      if (error.name === 'AbortError') {
        // Track cancellation
        analytics.trackTaskCancellation({
          taskId,
          taskType,
          duration,
        });
        throw new Error('任务已取消');
      }

      // Track other failures
      analytics.trackModelFailure({
        taskId,
        taskType,
        model: taskType === 'image' ? 'gemini-image' : 'gemini-video',
        duration,
        error: error.message || 'UNKNOWN_ERROR',
      });

      throw error;
    } finally {
      // Cleanup abort controller
      this.abortControllers.delete(taskId);
    }
  }

  /**
   * Converts aspectRatio to size parameter
   * @private
   */
  private convertAspectRatioToSize(aspectRatio?: string): string | undefined {
    return convertAspectRatioToSize(aspectRatio);
  }

  /**
   * 将尺寸或宽高转为接口需要的比例字符串（如 16:9）
   */
  private deriveAspectRatio(params: GenerationParams): string | undefined {
    const parseSizeToRatio = (size: string): string | undefined => {
      if (!size.includes('x')) return undefined;
      const [wStr, hStr] = size.split('x');
      const w = Number(wStr);
      const h = Number(hStr);
      if (!w || !h) return undefined;
      const gcd = (a: number, b: number): number =>
        b === 0 ? a : gcd(b, a % b);
      const g = gcd(w, h);
      return `${w / g}:${h / g}`;
    };

    if (params.size) {
      const ratio = parseSizeToRatio(params.size);
      if (ratio) return ratio;
    }

    if (params.width && params.height) {
      const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
      const div = g(params.width, params.height);
      return `${params.width / div}:${params.height / div}`;
    }

    return undefined;
  }

  /**
   * 使用异步接口生成图片（提交任务 + 轮询）
   */
  private async generateAsyncImage(
    taskId: string,
    params: GenerationParams
  ): Promise<TaskResult> {
    const aspectRatio = this.deriveAspectRatio(params) || '1:1';
    const sizeParam = aspectRatio; // 异步接口使用 size 字段传递比例枚举

    try {
      const result = await asyncImageAPIService.generateWithPolling(
        {
          model: params.model || 'gemini-3-pro-image-preview-async',
          prompt: params.prompt,
          size: sizeParam,
        },
        {
          interval: 5000,
          onProgress: (progress, status) => {
            taskQueueService.updateTaskProgress(taskId, progress);
            taskQueueService.updateTaskStatus(taskId, TaskStatus.PROCESSING, {
              executionPhase: TaskExecutionPhase.POLLING,
            });
          },
          onSubmitted: (remoteId) => {
            taskQueueService.updateTaskStatus(taskId, TaskStatus.PROCESSING, {
              remoteId,
              executionPhase: TaskExecutionPhase.POLLING,
            });
          },
        }
      );

      const { url, format } = asyncImageAPIService.extractUrlAndFormat(result);

      return {
        url,
        format,
        size: 0,
      };
    } catch (error: any) {
      console.error('[GenerationAPI] Async image generation error:', error);
      const wrappedError = new Error(error.message || '图片生成失败');
      if (error.apiErrorBody) {
        (wrappedError as any).apiErrorBody = error.apiErrorBody;
      }
      if (error.httpStatus) {
        (wrappedError as any).httpStatus = error.httpStatus;
      }
      throw wrappedError;
    }
  }

  /**
   * Generates an image using the image generation API
   * 使用专用的 /v1/images/generations 接口
   * @private
   */
  private async generateImage(
    params: GenerationParams,
    signal: AbortSignal
  ): Promise<TaskResult> {
    try {
      // 直接使用传入的 size 参数，或兼容旧的 aspectRatio 参数
      let size: string | undefined = params.size;
      if (!size) {
        const aspectRatio = (params as any).aspectRatio;
        size = this.convertAspectRatioToSize(aspectRatio);
      }

      // 转换上传的图片为 URL 数组（检查缓存时间，超过1天转为base64）
      let imageUrls: string[] | undefined;
      if ((params as any).uploadedImages) {
        const uploadedImages = (params as any).uploadedImages;
        const processedUrls: string[] = [];

        for (const img of uploadedImages) {
          if (img.type === 'url' && img.url) {
            // 使用智能图片传递：检查缓存时间，超过1天自动转为base64
            const imageData = await unifiedCacheService.getImageForAI(img.url);
            processedUrls.push(imageData.value);
            // console.log(`[GenerationAPI] Image processed: ${imageData.type === 'base64' ? 'converted to base64' : 'using URL'}`);
          }
        }

        if (processedUrls.length > 0) {
          imageUrls = processedUrls;
        }
      }

      // 获取 quality 参数（如果有）
      const quality = (params as any).quality as '1k' | '2k' | '4k' | undefined;

      // 调用新的图片生成接口
      const result = await defaultGeminiClient.generateImage(params.prompt, {
        size,
        image: imageUrls && imageUrls.length > 0 ? imageUrls : undefined,
        response_format: 'url',
        quality,
        model: params.model, // 传递指定的模型
      });

      // console.log('[GenerationAPI] Image generation response:', result);

      // 从 revised_prompt 中提取纯净的 API 响应（去掉 "Generate an image: 用户prompt: " 前缀）
      const extractCleanResponse = (revisedPrompt: string): string => {
        const prefix = `Generate an image: ${params.prompt}: `;
        if (revisedPrompt.startsWith(prefix)) {
          return revisedPrompt.substring(prefix.length);
        }
        // 如果前缀不匹配，尝试去掉 "Generate an image: " 部分
        const simplePrefix = 'Generate an image: ';
        if (revisedPrompt.startsWith(simplePrefix)) {
          const rest = revisedPrompt.substring(simplePrefix.length);
          // 找到用户 prompt 之后的内容（第一个 ": " 之后）
          const colonIndex = rest.indexOf(': ');
          if (colonIndex !== -1) {
            return rest.substring(colonIndex + 2);
          }
        }
        return revisedPrompt;
      };

      // 解析响应 - 新接口返回格式: { data: [{ url: "..." }] }
      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        const imageData = result.data[0];
        let imageUrl: string;

        if (imageData.url) {
          imageUrl = imageData.url;
        } else if (imageData.b64_json) {
          imageUrl = `data:image/png;base64,${imageData.b64_json}`;
        } else {
          // Check if there's an error message in revised_prompt (e.g., PROHIBITED_CONTENT)
          const revisedPrompt = imageData.revised_prompt || '';
          if (
            revisedPrompt.includes('PROHIBITED_CONTENT') ||
            revisedPrompt.includes('has been blocked')
          ) {
            // Extract the error message - look for the blocked reason
            const blockedMatch = revisedPrompt.match(
              /your request has been blocked[^:]*:\s*([^.]+)/i
            );
            if (blockedMatch) {
              throw new Error(blockedMatch[0]);
            }
            // Fallback: extract everything after the last occurrence of "blocked"
            const lastBlockedIndex = revisedPrompt
              .toLowerCase()
              .lastIndexOf('blocked');
            if (lastBlockedIndex !== -1) {
              const errorPart = revisedPrompt.slice(lastBlockedIndex - 20);
              throw new Error(errorPart.trim());
            }
          }

          // 返回了 data 但没有有效的图片格式，可能是文本响应
          let responseText: string;
          if (imageData.revised_prompt) {
            responseText = extractCleanResponse(imageData.revised_prompt);
          } else {
            responseText = JSON.stringify(imageData);
          }
          const error = new Error(`API 未返回有效的图片数据: ${responseText}`);
          (error as any).fullResponse = responseText;
          throw error;
        }

        return {
          url: imageUrl,
          format: 'png',
          size: 0,
        };
      }

      // API 响应格式不符合预期，提取纯净的错误信息
      let cleanResponse: string;
      if (result.revised_prompt) {
        cleanResponse = extractCleanResponse(result.revised_prompt);
      } else {
        cleanResponse = JSON.stringify(result);
      }
      const error = new Error(`API 未返回有效的图片数据: ${cleanResponse}`);
      (error as any).fullResponse = cleanResponse;
      throw error;
    } catch (error: any) {
      console.error('[GenerationAPI] Image generation error:', error);
      // Preserve original error properties for better error reporting
      const wrappedError = new Error(error.message || '图片生成失败');
      if (error.apiErrorBody) {
        (wrappedError as any).apiErrorBody = error.apiErrorBody;
      }
      if (error.httpStatus) {
        (wrappedError as any).httpStatus = error.httpStatus;
      }
      if (error.fullResponse) {
        (wrappedError as any).fullResponse = error.fullResponse;
      }
      throw wrappedError;
    }
  }

  /**
   * 恢复异步图片任务的轮询（页面刷新后）
   */
  async resumeAsyncImageGeneration(
    taskId: string,
    remoteId: string
  ): Promise<TaskResult> {
    const timeout = TASK_TIMEOUT.IMAGE;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), timeout);
    });

    try {
      const result = await Promise.race([
        asyncImageAPIService.resumePolling(remoteId, {
          interval: 5000,
          onProgress: (progress) => {
            taskQueueService.updateTaskProgress(taskId, progress);
          },
        }),
        timeoutPromise,
      ]);

      const { url, format } = asyncImageAPIService.extractUrlAndFormat(result);

      return {
        url,
        format,
        size: 0,
      };
    } catch (error: any) {
      const wrappedError = new Error(error.message || '图片生成失败');
      if (error.apiErrorBody) {
        (wrappedError as any).apiErrorBody = error.apiErrorBody;
      }
      if (error.httpStatus) {
        (wrappedError as any).httpStatus = error.httpStatus;
      }
      throw wrappedError;
    }
  }

  /**
   * Generates a video using the video generation API with async polling
   * @private
   */
  private async generateVideo(
    taskId: string,
    params: GenerationParams,
    signal: AbortSignal
  ): Promise<TaskResult> {
    try {
      // Mark task as submitting phase (before API call)
      // This helps identify tasks interrupted during submission
      taskQueueService.updateTaskStatus(taskId, 'processing' as any, {
        executionPhase: TaskExecutionPhase.SUBMITTING,
      });

      // Handle uploaded images (new multi-image format)
      let inputReferences: any[] | undefined;
      let inputReference: string | undefined;

      if (
        (params as any).uploadedImages &&
        (params as any).uploadedImages.length > 0
      ) {
        // New multi-image format
        inputReferences = (params as any).uploadedImages;
      } else if ((params as any).uploadedImage) {
        // Legacy single image format
        const img = (params as any).uploadedImage;
        if (img.type === 'url' && img.url) {
          inputReference = img.url;
        }
      }

      // Get model from params, settings, or use default
      const settings = geminiSettings.get();
      const model: VideoModel =
        (params as any).model ||
        (settings.videoModelName as VideoModel) ||
        'veo3';

      // Get duration from params (new format uses 'seconds' string)
      let seconds: string | undefined;
      if ((params as any).seconds) {
        seconds = (params as any).seconds;
      } else if (params.duration) {
        seconds = params.duration.toString();
      } else if (model.startsWith('sora')) {
        seconds = '10'; // sora default
      } else {
        seconds = '8'; // veo default
      }

      // Get size from params (new format uses 'size' string like '1280x720')
      let size: string | undefined;
      if ((params as any).size) {
        size = (params as any).size;
      } else if (params.width && params.height) {
        size = `${params.width}x${params.height}`;
      } else {
        size = '1280x720'; // default landscape
      }

      // Use new async polling API
      const result = await videoAPIService.generateVideoWithPolling(
        {
          model,
          prompt: params.prompt,
          seconds,
          size,
          inputReferences,
          inputReference,
        },
        {
          interval: 5000, // Poll every 5 seconds
          onProgress: (progress, status) => {
            // console.log(`[GenerationAPI] Video progress: ${progress}% (${status})`);
            // Update task progress in queue
            taskQueueService.updateTaskProgress(taskId, progress);
          },
          onSubmitted: (videoId) => {
            // Save remoteId immediately after submission for recovery support
            // console.log(`[GenerationAPI] Video submitted, saving remoteId: ${videoId}`);
            taskQueueService.updateTaskStatus(taskId, 'processing' as any, {
              remoteId: videoId,
              executionPhase: TaskExecutionPhase.POLLING,
            });
          },
        }
      );

      // Extract video URL from response
      const videoUrl = result.video_url || result.url;
      if (!videoUrl) {
        throw new Error('API 未返回有效的视频 URL');
      }

      return {
        url: videoUrl,
        format: 'mp4',
        size: 0,
        duration: parseInt(result.seconds) || params.duration || 8,
      };
    } catch (error: any) {
      console.error('[GenerationAPI] Video generation error:', error);
      // Preserve original error properties (apiErrorBody, httpStatus) for better error reporting
      const wrappedError = new Error(error.message || '视频生成失败');
      if (error.apiErrorBody) {
        (wrappedError as any).apiErrorBody = error.apiErrorBody;
      }
      if (error.httpStatus) {
        (wrappedError as any).httpStatus = error.httpStatus;
      }
      throw wrappedError;
    }
  }

  /**
   * Resumes video polling for a task that was interrupted (e.g., by page refresh)
   *
   * @param taskId - Task identifier
   * @param remoteId - Remote video ID from API
   * @returns Promise with task result
   */
  async resumeVideoGeneration(
    taskId: string,
    remoteId: string
  ): Promise<TaskResult> {
    const startTime = Date.now();

    // Track resumed task
    analytics.trackModelCall({
      taskId,
      taskType: 'video',
      model: 'gemini-video',
      promptLength: 0, // Unknown for resumed tasks
      hasUploadedImage: false,
      startTime,
    });

    try {
      // console.log(`[GenerationAPI] Resuming video generation for task ${taskId}, remoteId: ${remoteId}`);

      // Get timeout for video
      const timeout = TASK_TIMEOUT.VIDEO;

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('TIMEOUT'));
        }, timeout);
      });

      // Resume polling
      const pollingPromise = videoAPIService.resumePolling(remoteId, {
        interval: 5000,
        onProgress: (progress, status) => {
          // console.log(`[GenerationAPI] Resumed video progress: ${progress}% (${status})`);
          taskQueueService.updateTaskProgress(taskId, progress);
        },
      });

      // Race between polling and timeout
      const result = await Promise.race([pollingPromise, timeoutPromise]);

      const duration = Date.now() - startTime;
      // console.log(`[GenerationAPI] Resumed video generation completed for task ${taskId}`);

      // Track success
      analytics.trackModelSuccess({
        taskId,
        taskType: 'video',
        model: 'gemini-video',
        duration,
        resultSize: 0,
      });

      // Extract video URL from response
      const videoUrl = result.video_url || result.url;
      if (!videoUrl) {
        throw new Error('API 未返回有效的视频 URL');
      }

      return {
        url: videoUrl,
        format: 'mp4',
        size: 0,
        duration: parseInt(result.seconds) || 8,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(
        `[GenerationAPI] Resumed video generation failed for task ${taskId}:`,
        error
      );

      // Track failure
      analytics.trackModelFailure({
        taskId,
        taskType: 'video',
        model: 'gemini-video',
        duration,
        error: error.message || 'UNKNOWN_ERROR',
      });

      throw error;
    }
  }

  /**
   * Cancels an ongoing generation request
   *
   * @param taskId - Task identifier to cancel
   */
  cancelRequest(taskId: string): void {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
      // console.log(`[GenerationAPI] Cancelled request for task ${taskId}`);
    }
  }

  /**
   * Checks if a task has an active request
   *
   * @param taskId - Task identifier
   * @returns True if the task has an active request
   */
  hasActiveRequest(taskId: string): boolean {
    return this.abortControllers.has(taskId);
  }
}

// Export singleton instance
export const generationAPIService = new GenerationAPIService();
