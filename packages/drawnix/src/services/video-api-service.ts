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
  maxAttempts?: number;   // Max polling attempts (default: 360 = 30min at 5s interval)
  onProgress?: (progress: number, status: string) => void;
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
      throw new Error(`视频生成提交失败: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('[VideoAPI] Submit response:', JSON.stringify(result, null, 2));
    return result;
  }

  /**
   * Query video generation status
   */
  async queryVideoStatus(videoId: string): Promise<VideoQueryResponse> {
    const settings = geminiSettings.get();
    const apiKey = settings.apiKey;

    if (!apiKey) {
      throw new Error('API Key 未配置');
    }

    const response = await fetch(`${this.baseUrl}/v1/videos/${videoId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[VideoAPI] Query failed:', response.status, errorText);
      throw new Error(`视频状态查询失败: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('[VideoAPI] Query response:', JSON.stringify(result, null, 2));
    return result;
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
      maxAttempts = 360,
      onProgress,
    } = options;

    // Submit video generation task
    console.log('[VideoAPI] Submitting video generation task...');
    const submitResponse = await this.submitVideoGeneration(params);
    console.log('[VideoAPI] Task submitted:', submitResponse.id, 'Status:', submitResponse.status);

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

    const videoId = submitResponse.id;
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
