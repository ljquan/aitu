/**
 * Gemini API 配置常量
 */

import { GeminiConfig } from './types';

// 默认配置
export const DEFAULT_CONFIG: Partial<GeminiConfig> = {
  modelName: 'gemini-2.5-flash-image-vip', // 图片生成和聊天的默认模型
  maxRetries: 10,
  retryDelay: 0,
  timeout: 10 * 60 * 1000, // 10分钟，HTTP 请求超时
};

// 视频生成专用配置
export const VIDEO_DEFAULT_CONFIG: Partial<GeminiConfig> = {
  modelName: 'veo3', // 视频生成模型
  maxRetries: 10,
  retryDelay: 0,
  timeout: 10 * 60 * 1000, // 10分钟，HTTP 请求超时
};

/**
 * 需要使用非流式调用的模型列表
 * 这些模型在流式模式下可能返回不完整的响应
 * 可动态扩展：添加模型名称即可
 */
export const NON_STREAM_MODELS: string[] = [
  'seedream-4-0-250828',
  'seedream-v4',
];

/**
 * 检查模型是否需要使用非流式调用
 */
export function shouldUseNonStreamMode(modelName: string): boolean {
  if (!modelName) return false;
  const lowerModelName = modelName.toLowerCase();
  return NON_STREAM_MODELS.some(m => lowerModelName.includes(m.toLowerCase()));
}