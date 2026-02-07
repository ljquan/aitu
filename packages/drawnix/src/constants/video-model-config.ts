/**
 * Video Model Configuration
 *
 * Defines supported video models and their parameter options.
 * This configuration drives the UI for video generation.
 */

import type { VideoModel, VideoModelConfig } from '../types/video.types';

/**
 * Video model configurations
 * Each model has specific duration, size, and image upload options
 */
export const VIDEO_MODEL_CONFIGS: Record<VideoModel, VideoModelConfig> = {
  // Sora models
  'sora-2': {
    id: 'sora-2',
    label: 'Sora 2',
    provider: 'sora',
    description: '10s/15s 默认标清，支持故事场景模式',
    durationOptions: [
      { label: '10秒', value: '10' },
      { label: '15秒', value: '15' },
    ],
    defaultDuration: '10',
    sizeOptions: [
      { label: '横屏 16:9', value: '1280x720', aspectRatio: '16:9' },
      { label: '竖屏 9:16', value: '720x1280', aspectRatio: '9:16' },
    ],
    defaultSize: '1280x720',
    imageUpload: {
      maxCount: 1,
      mode: 'reference',
      labels: ['参考图'],
    },
    storyboardMode: {
      supported: true,
      maxScenes: 15,
      minSceneDuration: 0.1,
    },
  },
  'sora-2-pro': {
    id: 'sora-2-pro',
    label: 'Sora 2 Pro',
    provider: 'sora',
    description: '10s/15s/25s 高清，支持故事场景模式',
    durationOptions: [
      { label: '10秒', value: '10' },
      { label: '15秒', value: '15' },
      { label: '25秒', value: '25' },
    ],
    defaultDuration: '10',
    sizeOptions: [
      { label: '横屏 16:9', value: '1280x720', aspectRatio: '16:9' },
      { label: '竖屏 9:16', value: '720x1280', aspectRatio: '9:16' },
      { label: '高清横屏', value: '1792x1024', aspectRatio: '16:9' },
      { label: '高清竖屏', value: '1024x1792', aspectRatio: '9:16' },
    ],
    defaultSize: '1280x720',
    imageUpload: {
      maxCount: 1,
      mode: 'reference',
      labels: ['参考图'],
    },
    storyboardMode: {
      supported: true,
      maxScenes: 15,
      minSceneDuration: 0.1,
    },
  },
  'sora-2-4s': {
    id: 'sora-2-4s',
    label: 'Sora 2 · 4s',
    provider: 'sora',
    description: '4秒固定时长，模型名已包含时长，无需 seconds 参数',
    durationOptions: [{ label: '4秒（固定）', value: '4' }],
    defaultDuration: '4',
    sizeOptions: [
      { label: '横屏 16:9', value: '1280x720', aspectRatio: '16:9' },
      { label: '竖屏 9:16', value: '720x1280', aspectRatio: '9:16' },
    ],
    defaultSize: '1280x720',
    imageUpload: {
      maxCount: 1,
      mode: 'reference',
      labels: ['参考图'],
    },
  },
  'sora-2-8s': {
    id: 'sora-2-8s',
    label: 'Sora 2 · 8s',
    provider: 'sora',
    description: '8秒固定时长，模型名已包含时长，无需 seconds 参数',
    durationOptions: [{ label: '8秒（固定）', value: '8' }],
    defaultDuration: '8',
    sizeOptions: [
      { label: '横屏 16:9', value: '1280x720', aspectRatio: '16:9' },
      { label: '竖屏 9:16', value: '720x1280', aspectRatio: '9:16' },
    ],
    defaultSize: '1280x720',
    imageUpload: {
      maxCount: 1,
      mode: 'reference',
      labels: ['参考图'],
    },
  },
  'sora-2-12s': {
    id: 'sora-2-12s',
    label: 'Sora 2 · 12s',
    provider: 'sora',
    description: '12秒固定时长，模型名已包含时长，无需 seconds 参数',
    durationOptions: [{ label: '12秒（固定）', value: '12' }],
    defaultDuration: '12',
    sizeOptions: [
      { label: '横屏 16:9', value: '1280x720', aspectRatio: '16:9' },
      { label: '竖屏 9:16', value: '720x1280', aspectRatio: '9:16' },
    ],
    defaultSize: '1280x720',
    imageUpload: {
      maxCount: 1,
      mode: 'reference',
      labels: ['参考图'],
    },
  },

  // Veo models
  'veo3': {
    id: 'veo3',
    label: 'Veo 3',
    provider: 'veo',
    description: '8秒视频',
    durationOptions: [
      { label: '8秒', value: '8' },
    ],
    defaultDuration: '8',
    sizeOptions: [
      { label: '横屏 16:9', value: '1280x720', aspectRatio: '16:9' },
      { label: '竖屏 9:16', value: '720x1280', aspectRatio: '9:16' },
    ],
    defaultSize: '1280x720',
    imageUpload: {
      maxCount: 1,
      mode: 'reference',
      labels: ['参考图'],
    },
  },
  'veo3-pro': {
    id: 'veo3-pro',
    label: 'Veo 3 Pro',
    provider: 'veo',
    description: '8秒高质量视频',
    durationOptions: [
      { label: '8秒', value: '8' },
    ],
    defaultDuration: '8',
    sizeOptions: [
      { label: '横屏 16:9', value: '1280x720', aspectRatio: '16:9' },
      { label: '竖屏 9:16', value: '720x1280', aspectRatio: '9:16' },
    ],
    defaultSize: '1280x720',
    imageUpload: {
      maxCount: 1,
      mode: 'reference',
      labels: ['参考图'],
    },
  },
  'veo3.1': {
    id: 'veo3.1',
    label: 'Veo 3.1',
    provider: 'veo',
    description: '8秒快速模式，支持首尾帧',
    durationOptions: [
      { label: '8秒', value: '8' },
    ],
    defaultDuration: '8',
    sizeOptions: [
      { label: '横屏 16:9', value: '1280x720', aspectRatio: '16:9' },
      { label: '竖屏 9:16', value: '720x1280', aspectRatio: '9:16' },
    ],
    defaultSize: '1280x720',
    imageUpload: {
      maxCount: 2,
      mode: 'frames',
      labels: ['首帧', '尾帧'],
    },
  },
  'veo3.1-pro': {
    id: 'veo3.1-pro',
    label: 'Veo 3.1 Pro',
    provider: 'veo',
    description: '8秒高质量模式，支持首尾帧',
    durationOptions: [
      { label: '8秒', value: '8' },
    ],
    defaultDuration: '8',
    sizeOptions: [
      { label: '横屏 16:9', value: '1280x720', aspectRatio: '16:9' },
      { label: '竖屏 9:16', value: '720x1280', aspectRatio: '9:16' },
    ],
    defaultSize: '1280x720',
    imageUpload: {
      maxCount: 2,
      mode: 'frames',
      labels: ['首帧', '尾帧'],
    },
  },
  'veo3.1-components': {
    id: 'veo3.1-components',
    label: 'Veo 3.1 Components',
    provider: 'veo',
    description: '8秒模式，支持3张参考图',
    durationOptions: [
      { label: '8秒', value: '8' },
    ],
    defaultDuration: '8',
    sizeOptions: [
      { label: '横屏 16:9', value: '1280x720', aspectRatio: '16:9' },
      { label: '竖屏 9:16', value: '720x1280', aspectRatio: '9:16' },
    ],
    defaultSize: '1280x720',
    imageUpload: {
      maxCount: 3,
      mode: 'components',
      labels: ['参考图1', '参考图2', '参考图3'],
    },
  },
  'veo3.1-4k': {
    id: 'veo3.1-4k',
    label: 'Veo 3.1 4K',
    provider: 'veo',
    description: '8秒4K模式，支持首尾帧',
    durationOptions: [
      { label: '8秒', value: '8' },
    ],
    defaultDuration: '8',
    sizeOptions: [
      { label: '4K横屏 16:9', value: '3840x2160', aspectRatio: '16:9' },
      { label: '4K竖屏 9:16', value: '2160x3840', aspectRatio: '9:16' },
    ],
    defaultSize: '3840x2160',
    imageUpload: {
      maxCount: 2,
      mode: 'frames',
      labels: ['首帧', '尾帧'],
    },
  },
  'veo3.1-components-4k': {
    id: 'veo3.1-components-4k',
    label: 'Veo 3.1 Components 4K',
    provider: 'veo',
    description: '8秒4K模式，支持3张参考图',
    durationOptions: [
      { label: '8秒', value: '8' },
    ],
    defaultDuration: '8',
    sizeOptions: [
      { label: '4K横屏 16:9', value: '3840x2160', aspectRatio: '16:9' },
      { label: '4K竖屏 9:16', value: '2160x3840', aspectRatio: '9:16' },
    ],
    defaultSize: '3840x2160',
    imageUpload: {
      maxCount: 3,
      mode: 'components',
      labels: ['参考图1', '参考图2', '参考图3'],
    },
  },
  'veo3.1-pro-4k': {
    id: 'veo3.1-pro-4k',
    label: 'Veo 3.1 Pro 4K',
    provider: 'veo',
    description: '8秒高质量4K模式，支持首尾帧',
    durationOptions: [
      { label: '8秒', value: '8' },
    ],
    defaultDuration: '8',
    sizeOptions: [
      { label: '4K横屏 16:9', value: '3840x2160', aspectRatio: '16:9' },
      { label: '4K竖屏 9:16', value: '2160x3840', aspectRatio: '9:16' },
    ],
    defaultSize: '3840x2160',
    imageUpload: {
      maxCount: 2,
      mode: 'frames',
      labels: ['首帧', '尾帧'],
    },
  },
};

/**
 * Normalize model name to a known config key; fallback to默认模型（veo3）避免崩溃。
 */
export function normalizeVideoModel(model?: string | null): VideoModel {
  if (model && (VIDEO_MODEL_CONFIGS as any)[model]) {
    return model as VideoModel;
  }
  return 'veo3';
}

function getConfigOrDefault(model?: string | null): VideoModelConfig {
  const normalized = normalizeVideoModel(model);
  return VIDEO_MODEL_CONFIGS[normalized];
}

/**
 * Get model configuration by model ID
 */
export function getVideoModelConfig(model: VideoModel): VideoModelConfig {
  return getConfigOrDefault(model);
}

/**
 * Get all video model options for select component
 */
export function getVideoModelOptions(): { label: string; value: VideoModel }[] {
  return Object.values(VIDEO_MODEL_CONFIGS).map(config => ({
    label: config.label,
    value: config.id,
  }));
}

/**
 * Get default parameters for a model
 */
export function getDefaultModelParams(model: VideoModel): {
  duration: string;
  size: string;
} {
  const config = getConfigOrDefault(model);
  return {
    duration: config.defaultDuration,
    size: config.defaultSize,
  };
}

/**
 * Check if model supports multiple image uploads
 */
export function supportsMultipleImages(model: VideoModel): boolean {
  const config = getConfigOrDefault(model);
  return config.imageUpload.maxCount > 1;
}

/**
 * Get image upload labels for a model
 */
export function getImageUploadLabels(model: VideoModel): string[] {
  const config = getConfigOrDefault(model);
  return config.imageUpload.labels || ['参考图'];
}

/**
 * Check if model supports storyboard mode
 */
export function supportsStoryboardMode(model: VideoModel): boolean {
  const config = getConfigOrDefault(model);
  return config.storyboardMode?.supported ?? false;
}

/**
 * Get storyboard mode configuration for a model
 */
export function getStoryboardModeConfig(model: VideoModel) {
  const config = getConfigOrDefault(model);
  return config.storyboardMode ?? {
    supported: false,
    maxScenes: 15,
    minSceneDuration: 0.1,
  };
}
