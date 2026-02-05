/**
 * Fallback Executor 辅助函数
 *
 * 提供降级执行器的通用工具函数
 * 大部分逻辑已迁移到 media-api 共享模块
 */

import type { VideoAPIConfig, GeminiConfig } from './types';

// 从共享模块重新导出
export {
  isAsyncImageModel,
  extractPromptFromMessages,
  buildImageRequestBody,
  parseImageResponse,
} from '../media-api';

// 导入共享模块的工具函数
import {
  normalizeApiBase,
  getExtensionFromUrl,
  sizeToAspectRatio,
  sleep,
  parseErrorMessage,
} from '../media-api';

/**
 * 轮询视频状态
 * 注意：此函数保留以保持向后兼容，新代码应使用 media-api/video-api.ts 中的 pollVideoUntilComplete
 */
export async function pollVideoStatus(
  videoId: string,
  config: VideoAPIConfig,
  onProgress: (progress: number) => void,
  signal?: AbortSignal
): Promise<{ url: string }> {
  const maxAttempts = 120; // 最多轮询 10 分钟
  const interval = 5000; // 5 秒轮询间隔

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new Error('Video generation cancelled');
    }

    const response = await fetch(`${config.baseUrl}/v1/videos/${videoId}`, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to check video status: ${response.status}`);
    }

    const data = await response.json();
    const status = data.status || data.state;
    const progress = data.progress || 0;

    onProgress(progress / 100);

    if (status === 'completed' || status === 'succeeded') {
      const url = data.video_url || data.url || data.output?.url;
      if (!url) {
        throw new Error('No video URL in completed response');
      }
      return { url };
    }

    if (status === 'failed' || status === 'error') {
      throw new Error(data.error || data.message || 'Video generation failed');
    }

    // 等待下一次轮询
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Video generation timeout');
}

// 从共享模块导入异步图片生成
import { generateImageAsync as sharedGenerateImageAsync } from '../media-api';

/**
 * 异步图片生成选项
 */
interface AsyncImageOptions {
  onProgress: (progress: number) => void;
  onSubmitted?: (remoteId: string) => void;
  signal?: AbortSignal;
}

/**
 * 异步图片生成：提交任务并轮询结果
 * 此函数现在委托给共享模块的 generateImageAsync
 */
export async function generateAsyncImage(
  params: {
    prompt: string;
    model: string;
    size?: string;
    referenceImages?: string[];
  },
  config: GeminiConfig,
  options: AsyncImageOptions
): Promise<{ url: string; format: string }> {
  const result = await sharedGenerateImageAsync(
    {
      prompt: params.prompt,
      model: params.model,
      size: params.size,
      referenceImages: params.referenceImages,
    },
    {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      defaultModel: params.model,
    },
    {
      onProgress: options.onProgress,
      onSubmitted: options.onSubmitted,
      signal: options.signal,
    }
  );

  return {
    url: result.url,
    format: result.format || 'png',
  };
}
