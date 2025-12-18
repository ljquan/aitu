/**
 * Video API Service
 *
 * Handles video generation API calls with async polling support.
 * Uses tu-zi API for video generation.
 */

import { geminiSettings } from '../utils/settings-manager';
import type { VideoModel, UploadedVideoImage } from '../types/video.types';

// Re-export VideoModel for backward compatibility
export type { VideoModel };

// Video generation request params
export interface VideoGenerationParams {
  model: VideoModel;
  prompt: string;
  seconds?: string;
  size?: string;
  // Multiple images support for different models
  inputReferences?: UploadedVideoImage[];
  // Legacy single image support (for backward compatibility)
  inputReference?: string;
}

// Video generation response (submit)
export interface VideoSubmitResponse {
  id: string;
  object: string;
  model: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  created_at: number;
  seconds: string;
  size?: string;
  error?: string | { code: string; message: string };
}

// Video query response
export interface VideoQueryResponse {
  id: string;
  size: string;
  model: string;
  object: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  seconds: string;
  progress?: number; // Optional - API may not return progress when status is 'queued'
  video_url?: string;
  url?: string;
  created_at: number;
  error?: string | { code: string; message: string };
}

// Polling options
interface PollingOptions {
  interval?: number;      // Polling interval in ms (default: 5000)
  maxAttempts?: number;   // Max polling attempts (default: 1080 = 90min at 5s interval)
  onProgress?: (progress: number, status: string) => void;
  onSubmitted?: (videoId: string) => void; // Callback when video is submitted (for saving remoteId)
}

/**
 * Video API Service
 * Manages video generation with async polling
 */
class VideoAPIService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = 'https://api.tu-zi.com';
  }

  /**
   * Submit video generation task
   */
  async submitVideoGeneration(params: VideoGenerationParams): Promise<VideoSubmitResponse> {
    const settings = geminiSettings.get();
    const apiKey = settings.apiKey;

    if (!apiKey) {
      throw new Error('API Key 未配置，请先配置 API Key');
    }

    // Log request parameters
    console.log('[VideoAPI] ========== Video Generation Request ==========');
    console.log('[VideoAPI] Request params:', {
      model: params.model,
      prompt: params.prompt,
      seconds: params.seconds,
      size: params.size,
      inputReferencesCount: params.inputReferences?.length || 0,
      hasLegacyInputReference: !!params.inputReference,
    });
    console.log('[VideoAPI] Full prompt:');
    console.log(params.prompt);
    console.log('[VideoAPI] ===============================================');

    const formData = new FormData();
    formData.append('model', params.model);
    formData.append('prompt', params.prompt);

    if (params.seconds) {
      formData.append('seconds', params.seconds);
    }

    if (params.size) {
      formData.append('size', params.size);
    }

    // Handle multiple images - all models use input_reference
    // For veo3.1, multiple images can be passed with same field name (first frame, last frame)
    console.log('[VideoAPI] Processing inputReferences:', params.inputReferences);
    if (params.inputReferences && params.inputReferences.length > 0) {
      // Sort by slot to ensure correct order (slot 0 = first frame, slot 1 = last frame)
      const sortedImages = [...params.inputReferences].sort((a, b) => a.slot - b.slot);

      for (const imageRef of sortedImages) {
        console.log('[VideoAPI] Processing image:', { slot: imageRef.slot, url: imageRef.url?.substring(0, 50), name: imageRef.name });

        if (!imageRef.url) {
          console.log('[VideoAPI] Skipping image - no URL');
          continue;
        }

        const fieldName = 'input_reference';
        console.log('[VideoAPI] Using field name:', fieldName, 'for model:', params.model, 'slot:', imageRef.slot);

        // Convert to blob and append
        if (imageRef.url.startsWith('data:')) {
          console.log('[VideoAPI] Converting data URL to blob...');
          const response = await fetch(imageRef.url);
          const blob = await response.blob();
          console.log('[VideoAPI] Appending blob:', { fieldName, blobSize: blob.size, fileName: imageRef.name || 'image.png' });
          formData.append(fieldName, blob, imageRef.name || 'image.png');
        } else if (imageRef.url.startsWith('http')) {
          console.log('[VideoAPI] Fetching remote URL...');
          const response = await fetch(imageRef.url);
          const blob = await response.blob();
          console.log('[VideoAPI] Appending blob:', { fieldName, blobSize: blob.size, fileName: imageRef.name || 'image.png' });
          formData.append(fieldName, blob, imageRef.name || 'image.png');
        } else {
          console.log('[VideoAPI] Unknown URL format, skipping');
        }
      }
    }
    // Legacy single image support
    else if (params.inputReference) {
      if (params.inputReference.startsWith('data:')) {
        const response = await fetch(params.inputReference);
        const blob = await response.blob();
        formData.append('input_reference', blob, 'reference.png');
      } else if (params.inputReference.startsWith('http')) {
        const response = await fetch(params.inputReference);
        const blob = await response.blob();
        formData.append('input_reference', blob, 'reference.png');
      }
    }

    // Log FormData summary before sending
    console.log('[VideoAPI] FormData summary:');
    const formDataEntries: Record<string, string> = {};
    formData.forEach((value, key) => {
      if (value instanceof Blob) {
        formDataEntries[key] = `[Blob: ${value.size} bytes, type: ${value.type}]`;
      } else {
        formDataEntries[key] = String(value);
      }
    });
    console.log('[VideoAPI] FormData entries:', formDataEntries);
    console.log('[VideoAPI] Sending request to:', `${this.baseUrl}/v1/videos`);

    const response = await fetch(`${this.baseUrl}/v1/videos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[VideoAPI] Submit failed:', response.status, errorText);
      const error = new Error(`视频生成提交失败: ${response.status} - ${errorText}`);
      (error as any).apiErrorBody = errorText;
      (error as any).httpStatus = response.status;
      throw error;
    }

    const result = await response.json();
    console.log('[VideoAPI] Submit response:', JSON.stringify(result, null, 2));
    return result;
  }

  /**
   * Query video generation status (with network retry)
   */
  async queryVideoStatus(videoId: string): Promise<VideoQueryResponse> {
    const settings = geminiSettings.get();
    const apiKey = settings.apiKey;

    if (!apiKey) {
      throw new Error('API Key 未配置');
    }

    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/v1/videos/${videoId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[VideoAPI] Query failed:', response.status, errorText);
          const error = new Error(`视频状态查询失败: ${response.status} - ${errorText}`);
          (error as any).apiErrorBody = errorText;
          (error as any).httpStatus = response.status;
          throw error;
        }

        const result = await response.json();
        console.log('[VideoAPI] Query response:', JSON.stringify(result, null, 2));
        return result;
      } catch (error) {
        lastError = error as Error;
        const isNetworkError = error instanceof TypeError &&
          (error.message.includes('Failed to fetch') || error.message.includes('network'));

        if (isNetworkError && attempt < maxRetries) {
          console.warn(`[VideoAPI] Network error on attempt ${attempt}/${maxRetries}, retrying in ${retryDelay}ms...`);
          await this.sleep(retryDelay);
          continue;
        }

        // Non-network error or last attempt, throw immediately
        throw error;
      }
    }

    // Should not reach here, but just in case
    throw lastError || new Error('视频状态查询失败');
  }

  /**
   * Generate video with polling
   * Submits task and polls until completion
   */
  async generateVideoWithPolling(
    params: VideoGenerationParams,
    options: PollingOptions = {}
  ): Promise<VideoQueryResponse> {
    const {
      interval = 5000,
      maxAttempts = 1080,
      onProgress,
      onSubmitted,
    } = options;

    // Submit video generation task
    console.log('[VideoAPI] Submitting video generation task...');
    const submitResponse = await this.submitVideoGeneration(params);
    console.log('[VideoAPI] Task submitted:', submitResponse.id, 'Status:', submitResponse.status);

    // Notify that video has been submitted (for saving remoteId)
    if (onSubmitted) {
      onSubmitted(submitResponse.id);
    }

    // Report initial progress
    if (onProgress) {
      onProgress(0, submitResponse.status);
    }

    // Check if submission already failed (e.g., content policy violation)
    if (submitResponse.status === 'failed') {
      let errorMessage = '视频生成失败';
      if (submitResponse.error) {
        if (typeof submitResponse.error === 'string') {
          errorMessage = submitResponse.error;
        } else if (typeof submitResponse.error === 'object') {
          errorMessage = (submitResponse.error as any).message || JSON.stringify(submitResponse.error);
        }
      }
      throw new Error(errorMessage);
    }

    // Continue with polling
    return this.pollUntilComplete(submitResponse.id, { interval, maxAttempts, onProgress });
  }

  /**
   * Resume polling for an existing video task
   * Used to recover from page refresh
   */
  async resumePolling(
    videoId: string,
    options: PollingOptions = {}
  ): Promise<VideoQueryResponse> {
    console.log('[VideoAPI] Resuming polling for video:', videoId);

    const { onProgress } = options;

    // For resumed tasks, check status immediately first (video may already be completed)
    console.log('[VideoAPI] Checking status immediately for resumed task...');
    const immediateStatus = await this.queryVideoStatus(videoId);
    const immediateProgress = immediateStatus.progress ??
      (immediateStatus.status === 'failed' ? 100 : (immediateStatus.status === 'completed' ? 100 : 0));
    console.log(`[VideoAPI] Immediate check: Status=${immediateStatus.status}, Progress=${immediateProgress}%`);

    // Report progress
    if (onProgress) {
      onProgress(immediateProgress, immediateStatus.status);
    }

    // If already completed, return immediately
    if (immediateStatus.status === 'completed') {
      console.log('[VideoAPI] Video already completed:', immediateStatus.video_url || immediateStatus.url);
      return immediateStatus;
    }

    // If already failed, throw error immediately
    if (immediateStatus.status === 'failed') {
      let errorMessage = '视频生成失败';
      if (immediateStatus.error) {
        if (typeof immediateStatus.error === 'string') {
          errorMessage = immediateStatus.error;
        } else if (typeof immediateStatus.error === 'object') {
          errorMessage = (immediateStatus.error as any).message || JSON.stringify(immediateStatus.error);
        }
      }
      throw new Error(errorMessage);
    }

    // Continue polling if still in progress
    return this.pollUntilComplete(videoId, options);
  }

  /**
   * Poll for video completion
   * @private
   */
  private async pollUntilComplete(
    videoId: string,
    options: PollingOptions = {}
  ): Promise<VideoQueryResponse> {
    const {
      interval = 5000,
      maxAttempts = 1080,
      onProgress,
    } = options;

    let attempts = 0;

    // Poll for completion
    while (attempts < maxAttempts) {
      await this.sleep(interval);
      attempts++;

      const status = await this.queryVideoStatus(videoId);
      // Determine progress based on status and API response
      // - If API returns progress, use it
      // - If status is 'failed', show 100% to indicate task has ended
      // - Otherwise default to 0 (e.g., when status is 'queued')
      const progress = status.progress ?? (status.status === 'failed' ? 100 : 0);
      console.log(`[VideoAPI] Poll ${attempts}: Status=${status.status}, Progress=${progress}%`);

      // Report progress
      if (onProgress) {
        onProgress(progress, status.status);
      }

      if (status.status === 'completed') {
        console.log('[VideoAPI] Video generation completed:', status.video_url || status.url);
        return status;
      }

      if (status.status === 'failed') {
        // Handle error - extract message if error is an object
        let errorMessage = '视频生成失败';
        if (status.error) {
          if (typeof status.error === 'string') {
            errorMessage = status.error;
          } else if (typeof status.error === 'object') {
            // Error is an object, extract message
            errorMessage = (status.error as any).message || JSON.stringify(status.error);
          }
        }
        throw new Error(errorMessage);
      }
    }

    throw new Error('视频生成超时，请稍后重试');
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const videoAPIService = new VideoAPIService();
