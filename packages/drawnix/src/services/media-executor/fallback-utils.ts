/**
 * Fallback Executor 辅助函数
 *
 * 提供降级执行器的通用工具函数
 */

import type { VideoAPIConfig } from './types';

/**
 * 从消息数组中提取 prompt 用于日志记录
 */
export function extractPromptFromMessages(
  messages: Array<{ role: string; content: unknown }>
): string {
  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        return msg.content.substring(0, 500);
      }
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            return part.text.substring(0, 500);
          }
        }
      }
    }
  }
  return '';
}

/**
 * 构建图片生成请求体
 */
export function buildImageRequestBody(params: {
  prompt: string;
  model: string;
  size?: string;
  referenceImages?: string[];
  quality?: string;
  n: number;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: params.prompt,
    model: params.model,
    n: params.n,
  };

  if (params.size) {
    body.size = params.size;
  }

  if (params.quality) {
    body.quality = params.quality;
  }

  // 添加参考图片（已经转换为 base64 或 URL）
  if (params.referenceImages && params.referenceImages.length > 0) {
    body.image = params.referenceImages;
  }

  return body;
}

/**
 * 解析图片生成响应
 */
export function parseImageResponse(data: Record<string, unknown>): {
  url: string;
  urls?: string[];
} {
  // 支持多种响应格式
  if (data.data && Array.isArray(data.data)) {
    const urls = data.data
      .map((item: Record<string, unknown>) => item.url || item.b64_json)
      .filter(Boolean) as string[];
    return {
      url: urls[0] || '',
      urls: urls.length > 1 ? urls : undefined,
    };
  }

  if (data.url && typeof data.url === 'string') {
    return { url: data.url };
  }

  throw new Error('Invalid image generation response');
}

/**
 * 轮询视频状态
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
