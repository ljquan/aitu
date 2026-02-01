/**
 * Tweet Element Type Definitions
 *
 * 定义 Twitter/X 推文嵌入元素的类型和接口
 */

import { PlaitElement, Point } from '@plait/core';

/**
 * 推文默认尺寸
 */
export const DEFAULT_TWEET_SIZE = {
  width: 400,
  height: 300,
};

/**
 * 推文元素 - 画布上的 Twitter/X 推文嵌入实例
 */
export interface PlaitTweet extends PlaitElement {
  /** 元素类型标识 */
  type: 'tweet';

  /** 位置和尺寸（画布坐标）[左上角, 右下角] */
  points: [Point, Point];

  /** 旋转角度（度数） */
  angle: number;

  /** 推文 ID */
  tweetId: string;

  /** 作者用户名 */
  authorHandle?: string;

  /** 原始 URL */
  originalUrl?: string;

  /** 主题（light/dark） */
  theme?: 'light' | 'dark';

  /** 创建时间 */
  createdAt?: number;
}

/**
 * 创建推文元素的选项
 */
export interface TweetCreateOptions {
  /** 插入位置 */
  position: Point;

  /** 尺寸（可选） */
  size?: { width: number; height: number };

  /** 推文 ID 或完整 URL */
  tweetIdOrUrl: string;

  /** 主题（可选） */
  theme?: 'light' | 'dark';
}

/**
 * 推文 URL 解析结果
 */
export interface TweetParseResult {
  /** 是否有效 */
  valid: boolean;
  /** 推文 ID */
  tweetId?: string;
  /** 作者用户名 */
  authorHandle?: string;
}

/**
 * 从 Twitter/X URL 提取推文信息
 * 支持多种 URL 格式：
 * - https://twitter.com/username/status/TWEET_ID
 * - https://x.com/username/status/TWEET_ID
 * - https://mobile.twitter.com/username/status/TWEET_ID
 */
export function parseTweetUrl(url: string): TweetParseResult {
  if (!url) {
    return { valid: false };
  }

  // 移除首尾空格
  url = url.trim();

  // 如果是纯推文 ID（数字）
  if (/^\d{10,}$/.test(url)) {
    return {
      valid: true,
      tweetId: url,
    };
  }

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '').replace('mobile.', '');

    // 检查是否为 Twitter/X 域名
    if (hostname !== 'twitter.com' && hostname !== 'x.com') {
      return { valid: false };
    }

    // 解析路径: /username/status/TWEET_ID
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    
    if (pathParts.length >= 3 && pathParts[1] === 'status') {
      const authorHandle = pathParts[0];
      const tweetId = pathParts[2].split('?')[0]; // 移除查询参数

      // 验证推文 ID 是数字
      if (/^\d+$/.test(tweetId)) {
        return {
          valid: true,
          tweetId,
          authorHandle,
        };
      }
    }
  } catch {
    // URL 解析失败
  }

  return { valid: false };
}

/**
 * 获取 Twitter oEmbed URL
 */
export function getTweetOEmbedUrl(tweetId: string, authorHandle?: string): string {
  const tweetUrl = authorHandle 
    ? `https://twitter.com/${authorHandle}/status/${tweetId}`
    : `https://twitter.com/i/status/${tweetId}`;
  return `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}&omit_script=true`;
}

/**
 * 获取推文直接链接
 */
export function getTweetUrl(tweetId: string, authorHandle?: string): string {
  if (authorHandle) {
    return `https://twitter.com/${authorHandle}/status/${tweetId}`;
  }
  return `https://twitter.com/i/status/${tweetId}`;
}

/**
 * 检查 URL 是否为 Twitter/X 推文
 */
export function isTweetUrl(url: string): boolean {
  return parseTweetUrl(url).valid;
}
