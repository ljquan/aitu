/**
 * Generation API Service
 * 
 * Wraps the AI generation API calls for images and videos.
 * Handles timeouts, cancellation, and error handling.
 */

import { GenerationParams, TaskType, TaskResult } from '../types/task.types';
import { GenerationRequest, GenerationResponse, GenerationError } from '../types/generation.types';
import { defaultGeminiClient } from '../utils/gemini-api';
import { videoAPIService, VideoModel } from './video-api-service';
import { TASK_TIMEOUT } from '../constants/TASK_CONSTANTS';
import { analytics } from '../utils/umami-analytics';
import { taskQueueService } from './task-queue-service';
import { geminiSettings } from '../utils/settings-manager';

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

    // Track model call start
    analytics.trackModelCall({
      taskId,
      taskType,
      model: taskType === 'image' ? 'gemini-image' : 'gemini-video',
      promptLength: params.prompt.length,
      hasUploadedImage: !!(params as any).uploadedImage || !!(params as any).uploadedImages,
      startTime,
    });

    try {
      console.log(`[GenerationAPI] Starting generation for task ${taskId} (${type})`);

      // Get timeout for this task type
      const timeout = TASK_TIMEOUT[type.toUpperCase() as keyof typeof TASK_TIMEOUT];

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('TIMEOUT'));
        }, timeout);
      });

      // Create generation promise
      const generationPromise = type === TaskType.IMAGE
        ? this.generateImage(params, abortController.signal)
        : this.generateVideo(taskId, params, abortController.signal);

      // Race between generation and timeout
      const result = await Promise.race([generationPromise, timeoutPromise]);

      const duration = Date.now() - startTime;
      console.log(`[GenerationAPI] Generation completed for task ${taskId}`);

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
      console.error(`[GenerationAPI] Generation failed for task ${taskId}:`, error);

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
   * Generates an image using the image generation API
   * @private
   */
  private async generateImage(
    params: GenerationParams,
    signal: AbortSignal
  ): Promise<TaskResult> {
    const finalWidth = params.width || 1024;
    const finalHeight = params.height || 1024;

    try {
      // Use Chat API for image generation
      const imagePrompt = `Generate an image based on this description: "${params.prompt}"`;

      // Convert uploaded images if any (from params metadata)
      const imageInputs: any[] = [];
      if ((params as any).uploadedImages) {
        const uploadedImages = (params as any).uploadedImages;
        for (const img of uploadedImages) {
          if (img.type === 'url' && img.url) {
            imageInputs.push({ url: img.url });
          }
        }
      }

      const result = await defaultGeminiClient.chat(imagePrompt, imageInputs);
      
      // Extract image URL from response
      const responseContent = result.response.choices[0]?.message?.content || '';
      
      // Check processed content for images
      if (result.processedContent && result.processedContent.images && result.processedContent.images.length > 0) {
        const firstImage = result.processedContent.images[0];
        let imageUrl: string;
        
        if (firstImage.type === 'url') {
          imageUrl = firstImage.data;
        } else if (firstImage.type === 'base64') {
          imageUrl = `data:image/png;base64,${firstImage.data}`;
        } else {
          throw new Error('无法从响应中提取图片');
        }

        return {
          url: imageUrl,
          format: 'png',
          size: 0, // Size unknown for now
          width: finalWidth,
          height: finalHeight,
        };
      }

      // Try to extract URL from text response
      const urlMatch = responseContent.match(/https?:\/\/[^\s<>"'\n]+/);
      if (urlMatch) {
        const imageUrl = urlMatch[0].replace(/[.,;!?]*$/, '');
        
        return {
          url: imageUrl,
          format: 'png',
          size: 0,
          width: finalWidth,
          height: finalHeight,
        };
      }

      throw new Error('API 未返回有效的图片数据');
    } catch (error: any) {
      console.error('[GenerationAPI] Image generation error:', error);
      throw new Error(error.message || '图片生成失败');
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
      // Handle uploaded images (new multi-image format)
      let inputReferences: any[] | undefined;
      let inputReference: string | undefined;

      if ((params as any).uploadedImages && (params as any).uploadedImages.length > 0) {
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
      const model: VideoModel = (params as any).model || (settings.videoModelName as VideoModel) || 'veo3';

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
            console.log(`[GenerationAPI] Video progress: ${progress}% (${status})`);
            // Update task progress in queue
            taskQueueService.updateTaskProgress(taskId, progress);
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
      throw new Error(error.message || '视频生成失败');
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
      console.log(`[GenerationAPI] Cancelled request for task ${taskId}`);
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
