/**
 * Gemini API 配置常量
 */

import { GeminiConfig } from './types';

// 默认配置
export const DEFAULT_CONFIG: Partial<GeminiConfig> = {
  modelName: 'gemini-2.5-flash-image-vip', // 图片生成和聊天的默认模型
  maxRetries: 10,
  retryDelay: 0,
  timeout: 120000, // 120秒
};

// 视频生成专用配置
export const VIDEO_DEFAULT_CONFIG: Partial<GeminiConfig> = {
  modelName: 'veo3', // 视频生成模型
  maxRetries: 10,
  retryDelay: 0,
  timeout: 300000, // 5分钟，视频生成需要更长时间
};