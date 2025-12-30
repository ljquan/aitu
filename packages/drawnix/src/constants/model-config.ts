/**
 * 统一的模型配置文件
 * 
 * 所有图片和视频模型的配置都在这里定义
 * 被 ModelSelector、settings-dialog、ai-image-generation、ai-video-generation 等组件使用
 */

/**
 * 模型类型
 */
export type ModelType = 'image' | 'video';

/**
 * 模型配置接口
 */
export interface ModelConfig {
  /** 模型 ID（用于 API 调用） */
  id: string;
  /** 完整显示名称（用于设置弹窗等） */
  label: string;
  /** 简短显示名称（用于 ModelSelector 等） */
  shortLabel?: string;
  /** 描述信息 */
  description?: string;
  /** 模型类型 */
  type: ModelType;
  /** 是否为 VIP/推荐模型 */
  isVip?: boolean;
  /** 是否支持工具调用（用于 Agent 模式） */
  supportsTools?: boolean;
}

// ============================================
// 图片模型配置
// ============================================

/**
 * VIP/推荐图片模型
 */
export const IMAGE_MODEL_VIP_OPTIONS: ModelConfig[] = [
  {
    id: 'gemini-3-pro-image-preview-vip',
    label: 'gemini-3-pro-image-preview-vip (nano-banana-2-vip)',
    shortLabel: 'nano-banana-2-vip',
    description: '最新 Gemini 3 Pro 图片模型（VIP）',
    type: 'image',
    isVip: true,
    supportsTools: true,
  },
  {
    id: 'gemini-3-pro-image-preview-2k-vip',
    label: 'gemini-3-pro-image-preview-2k-vip (nano-banana-2-2k-vip)',
    shortLabel: 'nano-banana-2-2k-vip',
    description: '2K 高清图片模型（VIP）',
    type: 'image',
    isVip: true,
    supportsTools: true,
  },
  {
    id: 'gemini-3-pro-image-preview-4k-vip',
    label: 'gemini-3-pro-image-preview-4k-vip (nano-banana-2-4k-vip)',
    shortLabel: 'nano-banana-2-4k-vip',
    description: '4K 超高清图片模型（VIP）',
    type: 'image',
    isVip: true,
    supportsTools: true,
  },
  {
    id: 'gemini-2.5-flash-image-vip',
    label: 'gemini-2.5-flash-image-vip (nano-banana-vip)',
    shortLabel: 'nano-banana-vip',
    description: '快速图片生成模型（VIP）',
    type: 'image',
    isVip: true,
    supportsTools: true,
  },
];

/**
 * 更多图片模型
 */
export const IMAGE_MODEL_MORE_OPTIONS: ModelConfig[] = [
  {
    id: 'gpt-image-1.5',
    label: 'gpt-image-1.5',
    description: 'GPT 图片生成模型',
    type: 'image',
    supportsTools: true,
  },
  {
    id: 'gemini-3-pro-image-preview',
    label: 'gemini-3-pro-image-preview (nano-banana-2)',
    shortLabel: 'nano-banana-2',
    description: 'Gemini 3 Pro 图片模型',
    type: 'image',
    supportsTools: true,
  },
  {
    id: 'gemini-2.5-flash-image',
    label: 'gemini-2.5-flash-image (nano-banana)',
    shortLabel: 'nano-banana',
    description: '快速图片生成模型',
    type: 'image',
    supportsTools: true,
  },
  {
    id: 'gemini-3-pro-image-preview-hd',
    label: 'gemini-3-pro-image-preview-hd (nano-banana-2-hd)',
    shortLabel: 'nano-banana-2-hd',
    description: 'HD 高清图片模型',
    type: 'image',
    supportsTools: true,
  },
  {
    id: 'gemini-3-pro-image-preview-2k',
    label: 'gemini-3-pro-image-preview-2k (nano-banana-2-2k)',
    shortLabel: 'nano-banana-2-2k',
    description: '2K 高清图片模型',
    type: 'image',
    supportsTools: true,
  },
  {
    id: 'gemini-3-pro-image-preview-4k',
    label: 'gemini-3-pro-image-preview-4k (nano-banana-2-4k)',
    shortLabel: 'nano-banana-2-4k',
    description: '4K 超高清图片模型',
    type: 'image',
    supportsTools: true,
  },
];

/**
 * 所有图片模型
 */
export const IMAGE_MODELS: ModelConfig[] = [
  ...IMAGE_MODEL_VIP_OPTIONS,
  ...IMAGE_MODEL_MORE_OPTIONS,
];

// ============================================
// 视频模型配置
// ============================================

/**
 * 视频模型配置
 */
export const VIDEO_MODELS: ModelConfig[] = [
  {
    id: 'veo3.1',
    label: 'Veo 3.1',
    description: '8秒快速模式，支持首尾帧',
    type: 'video',
    isVip: true,
    supportsTools: true,
  },
  {
    id: 'sora-2',
    label: 'Sora 2',
    description: '10s/15s 默认标清，支持故事场景模式',
    type: 'video',
    isVip: true,
    supportsTools: true,
  },
  {
    id: 'veo3',
    label: 'Veo 3',
    description: '8秒视频',
    type: 'video',
    supportsTools: true,
  },
  {
    id: 'veo3-pro',
    label: 'Veo 3 Pro',
    description: '8秒高质量视频',
    type: 'video',
    supportsTools: true,
  },
  {
    id: 'veo3.1-pro',
    label: 'Veo 3.1 Pro',
    description: '8秒高质量模式，支持首尾帧',
    type: 'video',
    supportsTools: true,
  },
  {
    id: 'veo3.1-components',
    label: 'Veo 3.1 Components',
    description: '8秒模式，支持3张参考图',
    type: 'video',
    supportsTools: true,
  },
  {
    id: 'sora-2-pro',
    label: 'Sora 2 Pro',
    description: '10s/15s/25s 高清，支持故事场景模式',
    type: 'video',
    supportsTools: true,
  },
];

// ============================================
// 所有模型
// ============================================

/**
 * 所有支持的模型
 */
export const ALL_MODELS: ModelConfig[] = [
  ...IMAGE_MODELS,
  ...VIDEO_MODELS,
];

// ============================================
// 辅助函数
// ============================================

/**
 * 根据类型获取模型列表
 */
export function getModelsByType(type: ModelType): ModelConfig[] {
  return ALL_MODELS.filter(model => model.type === type);
}

/**
 * 获取模型配置
 */
export function getModelConfig(modelId: string): ModelConfig | undefined {
  return ALL_MODELS.find(model => model.id === modelId);
}

/**
 * 获取模型类型
 */
export function getModelType(modelId: string): ModelType | undefined {
  return getModelConfig(modelId)?.type;
}

/**
 * 获取模型 ID 列表
 */
export function getModelIds(type?: ModelType): string[] {
  const models = type ? getModelsByType(type) : ALL_MODELS;
  return models.map(model => model.id);
}

/**
 * 检查模型是否支持工具调用
 */
export function supportsTools(modelId: string): boolean {
  return getModelConfig(modelId)?.supportsTools ?? false;
}

// ============================================
// 兼容旧格式的导出（用于 Select 组件）
// ============================================

/**
 * 图片模型选项（用于 Select 组件）
 */
export const IMAGE_MODEL_SELECT_OPTIONS = IMAGE_MODELS.map(model => ({
  label: model.label,
  value: model.id,
}));

/**
 * 图片模型分组选项（用于 Select 组件）
 */
export const IMAGE_MODEL_GROUPED_SELECT_OPTIONS = [
  {
    group: '推荐',
    children: IMAGE_MODEL_VIP_OPTIONS.map(model => ({
      label: model.label,
      value: model.id,
    })),
  },
  {
    group: '更多',
    children: IMAGE_MODEL_MORE_OPTIONS.map(model => ({
      label: model.label,
      value: model.id,
    })),
  },
];

/**
 * 视频模型选项（用于 Select 组件）
 */
export const VIDEO_MODEL_SELECT_OPTIONS = VIDEO_MODELS.map(model => ({
  label: model.label,
  value: model.id,
}));

/**
 * 默认图片模型
 */
export const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image-preview-vip';

/**
 * 默认视频模型
 */
export const DEFAULT_VIDEO_MODEL = 'veo3';
