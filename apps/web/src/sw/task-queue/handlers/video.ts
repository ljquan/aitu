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
      const submitResponse = await this.submitVideoGeneration(
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
        abortController.signal
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

    try {
      config.onProgress(task.id, task.progress || 0, TaskExecutionPhase.POLLING);

      const result = await this.pollUntilComplete(
        task.remoteId,
        task.id,
        config,
        abortController.signal
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
  ): Promise<VideoSubmitResponse> {
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

    // Use debugFetch for logging
    const { debugFetch } = await import('../debug-fetch');
    const response = await debugFetch(`${videoConfig.baseUrl}/videos`, {
      method: 'POST',
      headers: videoConfig.apiKey
        ? { Authorization: `Bearer ${videoConfig.apiKey}` }
        : undefined,
      body: formData,
      signal,
    }, {
      label: `🎬 提交视频生成 (${params.model || 'veo3'})`,
      logResponseBody: true,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Video submission failed: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Poll video status until completion
   * 使用通用的轮询逻辑，但保持任务级别的进度回调
   */
  private async pollUntilComplete(
    videoId: string,
    taskId: string,
    config: HandlerConfig,
    signal: AbortSignal
  ): Promise<TaskResult> {
    const { videoConfig } = config;

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

    return {
      url: videoUrl,
      format: 'mp4',
      size: 0,
      width: result.width,
      height: result.height,
      duration: parseInt(result.seconds || '0') || 0,
    };
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
