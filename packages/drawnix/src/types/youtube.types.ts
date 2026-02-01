/**
 * YouTube Element Type Definitions
 *
 * 定义 YouTube 视频嵌入元素的类型和接口
 */

import { PlaitElement, Point } from '@plait/core';

/**
 * YouTube 默认尺寸（16:9 比例）
 */
export const DEFAULT_YOUTUBE_SIZE = {
  width: 480,
  height: 270,
};

/**
 * YouTube 元素 - 画布上的 YouTube 视频嵌入实例
 */
export interface PlaitYouTube extends PlaitElement {
  /** 元素类型标识 */
  type: 'youtube';

  /** 位置和尺寸（画布坐标）[左上角, 右下角] */
  points: [Point, Point];

  /** 旋转角度（度数） */
  angle: number;

  /** YouTube 视频 ID */
  videoId: string;

  /** 视频标题 */
  title?: string;

  /** 缩略图 URL */
  thumbnailUrl?: string;

  /** 原始 URL */
  originalUrl?: string;

  /** 创建时间 */
  createdAt?: number;
}

/**
 * 创建 YouTube 元素的选项
 */
export interface YouTubeCreateOptions {
  /** 插入位置 */
  position: Point;

  /** 尺寸（可选） */
  size?: { width: number; height: number };

  /** YouTube 视频 ID 或完整 URL */
  videoIdOrUrl: string;

  /** 视频标题（可选） */
  title?: string;
}

/**
 * YouTube URL 解析结果
 */
export interface YouTubeParseResult {
  /** 是否有效 */
  valid: boolean;
  /** 视频 ID */
  videoId?: string;
  /** 缩略图 URL */
  thumbnailUrl?: string;
}

/**
 * 从 YouTube URL 提取视频 ID
 * 支持多种 URL 格式：
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 */
export function parseYouTubeUrl(url: string): YouTubeParseResult {
  if (!url) {
    return { valid: false };
  }

  // 移除首尾空格
  url = url.trim();

  // 如果是纯视频 ID（11位字符）
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
    return {
      valid: true,
      videoId: url,
      thumbnailUrl: getYouTubeThumbnail(url),
    };
  }

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');
    let videoId: string | null = null;

    // youtube.com 格式
    if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
      // /watch?v=VIDEO_ID
      if (urlObj.pathname === '/watch') {
        videoId = urlObj.searchParams.get('v');
      }
      // /embed/VIDEO_ID
      else if (urlObj.pathname.startsWith('/embed/')) {
        videoId = urlObj.pathname.split('/embed/')[1]?.split(/[?&]/)[0];
      }
      // /v/VIDEO_ID
      else if (urlObj.pathname.startsWith('/v/')) {
        videoId = urlObj.pathname.split('/v/')[1]?.split(/[?&]/)[0];
      }
      // /shorts/VIDEO_ID
      else if (urlObj.pathname.startsWith('/shorts/')) {
        videoId = urlObj.pathname.split('/shorts/')[1]?.split(/[?&]/)[0];
      }
    }
    // youtu.be 短链接
    else if (hostname === 'youtu.be') {
      videoId = urlObj.pathname.slice(1).split(/[?&]/)[0];
    }

    if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return {
        valid: true,
        videoId,
        thumbnailUrl: getYouTubeThumbnail(videoId),
      };
    }
  } catch {
    // URL 解析失败
  }

  return { valid: false };
}

/**
 * 获取 YouTube 视频缩略图 URL
 */
export function getYouTubeThumbnail(videoId: string): string {
  // 使用 maxresdefault 质量，如果不可用会自动降级
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

/**
 * 获取 YouTube 嵌入 URL
 */
export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?rel=0&enablejsapi=1`;
}

/**
 * 检查 URL 是否为 YouTube 视频
 */
export function isYouTubeUrl(url: string): boolean {
  return parseYouTubeUrl(url).valid;
}
