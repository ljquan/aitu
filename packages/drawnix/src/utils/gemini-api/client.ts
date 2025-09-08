/**
 * Gemini API 客户端类
 */

import { GeminiConfig, ImageInput, VideoGenerationOptions } from './types';
import { DEFAULT_CONFIG, VIDEO_DEFAULT_CONFIG } from './config';
import { generateImageWithGemini, generateVideoWithGemini, chatWithGemini } from './services';
import { geminiSettings } from '../settings-manager';

/**
 * Gemini API 客户端
 */
export class GeminiClient {
  private isVideoClient: boolean;

  constructor(isVideoClient: boolean = false) {
    this.isVideoClient = isVideoClient;
  }

  /**
   * 获取当前有效配置（直接从 localStorage 实时读取）
   */
  private getEffectiveConfig(): GeminiConfig {
    const globalSettings = geminiSettings.get();
    
    if (this.isVideoClient) {
      return {
        ...VIDEO_DEFAULT_CONFIG,
        ...globalSettings,
        modelName: globalSettings.videoModelName || VIDEO_DEFAULT_CONFIG.modelName,
      };
    } else {
      return {
        ...DEFAULT_CONFIG,
        ...globalSettings,
        modelName: globalSettings.imageModelName || DEFAULT_CONFIG.modelName,
      };
    }
  }

  /**
   * 生成图像
   */
  async generateImage(prompt: string, options: { n?: number; size?: string; } = {}) {
    return generateImageWithGemini(prompt, options);
  }

  /**
   * 生成视频
   */
  async generateVideo(prompt: string, image: ImageInput | null, options: VideoGenerationOptions = {}) {
    return generateVideoWithGemini(prompt, image, options);
  }

  /**
   * 聊天对话（支持图片输入）
   */
  async chat(prompt: string, images: ImageInput[] = []) {
    return chatWithGemini(prompt, images);
  }

  /**
   * 获取当前配置
   */
  getConfig(): GeminiConfig {
    return this.getEffectiveConfig();
  }
}

/**
 * 创建默认的 Gemini 客户端实例（用于图片生成和聊天）
 */
export const defaultGeminiClient = new GeminiClient(false);

/**
 * 创建视频生成专用的 Gemini 客户端实例
 */
export const videoGeminiClient = new GeminiClient(true);