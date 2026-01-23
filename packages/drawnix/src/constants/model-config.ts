/**
 * 统一的模型配置文件
 * 
 * 所有图片、视频和文本模型的配置都在这里定义
 * 被 ModelSelector、settings-dialog、ai-image-generation、ai-video-generation 等组件使用
 * 
 * 参数配置用于 SmartSuggestionPanel 的 - 参数提示功能
 */

/**
 * 模型类型
 */
export type ModelType = 'image' | 'video' | 'text';

/**
 * 参数值类型
 */
export type ParamValueType = 'enum' | 'number' | 'string';

/**
 * 参数配置接口
 */
export interface ParamConfig {
  /** 参数 ID（用于输入，如 -duration） */
  id: string;
  /** 显示标签 */
  label: string;
  /** 简短标签 */
  shortLabel?: string;
  /** 描述信息 */
  description?: string;
  /** 参数值类型 */
  valueType: ParamValueType;
  /** 可选值列表（enum 类型时使用） */
  options?: Array<{ value: string; label: string }>;
  /** 默认值 */
  defaultValue?: string;
  /** 兼容的模型 ID 列表（空数组表示所有模型都兼容） */
  compatibleModels: string[];
  /** 适用的模型类型 */
  modelType: ModelType;
}

/**
 * 图片模型默认参数
 */
export interface ImageModelDefaults {
  /** 默认宽高比 */
  aspectRatio: string;
  /** 默认宽度 */
  width: number;
  /** 默认高度 */
  height: number;
}

/**
 * 视频模型默认参数
 */
export interface VideoModelDefaults {
  /** 默认时长（秒） */
  duration: string;
  /** 默认尺寸 */
  size: string;
  /** 默认宽高比 */
  aspectRatio: string;
}

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
  /** 超短缩写（用于 @ 模型选择器显示，如 nb2v） */
  shortCode?: string;
  /** 描述信息 */
  description?: string;
  /** 模型类型 */
  type: ModelType;
  /** 是否为 VIP/推荐模型 */
  isVip?: boolean;
  /** 是否支持工具调用（用于 Agent 模式） */
  supportsTools?: boolean;
  /** 图片模型默认参数 */
  imageDefaults?: ImageModelDefaults;
  /** 视频模型默认参数 */
  videoDefaults?: VideoModelDefaults;
}

// ============================================
// 模型颜色配置
// ============================================

/**
 * 模型类型对应的颜色
 */
export const MODEL_TYPE_COLORS = {
  image: '#E53935',  // 红色
  video: '#FF9800',  // 橙色
  text: '#4CAF50',   // 绿色
} as const;

// ============================================
// 图片模型配置
// ============================================

/** 图片模型通用默认参数 */
const IMAGE_DEFAULT_PARAMS: ImageModelDefaults = {
  aspectRatio: 'auto',
  width: 1024,
  height: 1024,
};

/** 2K 图片模型默认参数 */
const IMAGE_2K_DEFAULT_PARAMS: ImageModelDefaults = {
  aspectRatio: 'auto',
  width: 2048,
  height: 2048,
};

/** 4K 图片模型默认参数 */
const IMAGE_4K_DEFAULT_PARAMS: ImageModelDefaults = {
  aspectRatio: 'auto',
  width: 4096,
  height: 4096,
};

/**
 * VIP/推荐图片模型
 */
export const IMAGE_MODEL_VIP_OPTIONS: ModelConfig[] = [
  {
    id: 'gemini-3-pro-image-preview-vip',
    label: 'gemini-3-pro-image-preview-vip (nano-banana-2-vip)',
    shortLabel: 'nano-banana-2-vip',
    shortCode: 'nb2v',
    description: '最新 Gemini 3 Pro 图片模型（VIP）',
    type: 'image',
    isVip: true,
    supportsTools: true,
    imageDefaults: IMAGE_DEFAULT_PARAMS,
  },
  {
    id: 'gemini-3-pro-image-preview-2k-vip',
    label: 'gemini-3-pro-image-preview-2k-vip (nano-banana-2-2k-vip)',
    shortLabel: 'nano-banana-2-2k-vip',
    shortCode: 'nb22kv',
    description: '2K 高清图片模型（VIP）',
    type: 'image',
    isVip: true,
    supportsTools: true,
    imageDefaults: IMAGE_2K_DEFAULT_PARAMS,
  },
  {
    id: 'gemini-3-pro-image-preview-4k-vip',
    label: 'gemini-3-pro-image-preview-4k-vip (nano-banana-2-4k-vip)',
    shortLabel: 'nano-banana-2-4k-vip',
    shortCode: 'nb24kv',
    description: '4K 超高清图片模型（VIP）',
    type: 'image',
    isVip: true,
    supportsTools: true,
    imageDefaults: IMAGE_4K_DEFAULT_PARAMS,
  },
  {
    id: 'gemini-2.5-flash-image-vip',
    label: 'gemini-2.5-flash-image-vip (nano-banana-vip)',
    shortLabel: 'nano-banana-vip',
    shortCode: 'nbv',
    description: '快速图片生成模型（VIP）',
    type: 'image',
    isVip: true,
    supportsTools: true,
    imageDefaults: IMAGE_DEFAULT_PARAMS,
  },
];

/**
 * 更多图片模型
 */
export const IMAGE_MODEL_MORE_OPTIONS: ModelConfig[] = [
  {
    id: 'gpt-image-1.5',
    label: 'gpt-image-1.5',
    shortCode: 'gpt15',
    description: 'GPT 图片生成模型',
    type: 'image',
    supportsTools: true,
    imageDefaults: IMAGE_DEFAULT_PARAMS,
  },
  {
    id: 'gemini-3-pro-image-preview',
    label: 'gemini-3-pro-image-preview (nano-banana-2)',
    shortLabel: 'nano-banana-2',
    shortCode: 'nb2',
    description: 'Gemini 3 Pro 图片模型',
    type: 'image',
    supportsTools: true,
    imageDefaults: IMAGE_DEFAULT_PARAMS,
  },
  {
    id: 'gemini-2.5-flash-image',
    label: 'gemini-2.5-flash-image (nano-banana)',
    shortLabel: 'nano-banana',
    shortCode: 'nb',
    description: '快速图片生成模型',
    type: 'image',
    supportsTools: true,
    imageDefaults: IMAGE_DEFAULT_PARAMS,
  },
  {
    id: 'gemini-3-pro-image-preview-hd',
    label: 'gemini-3-pro-image-preview-hd (nano-banana-2-hd)',
    shortLabel: 'nano-banana-2-hd',
    shortCode: 'nb2hd',
    description: 'HD 高清图片模型',
    type: 'image',
    supportsTools: true,
    imageDefaults: IMAGE_DEFAULT_PARAMS,
  },
  {
    id: 'gemini-3-pro-image-preview-2k',
    label: 'gemini-3-pro-image-preview-2k (nano-banana-2-2k)',
    shortLabel: 'nano-banana-2-2k',
    shortCode: 'nb22k',
    description: '2K 高清图片模型',
    type: 'image',
    supportsTools: true,
    imageDefaults: IMAGE_2K_DEFAULT_PARAMS,
  },
  {
    id: 'gemini-3-pro-image-preview-4k',
    label: 'gemini-3-pro-image-preview-4k (nano-banana-2-4k)',
    shortLabel: 'nano-banana-2-4k',
    shortCode: 'nb24k',
    description: '4K 超高清图片模型',
    type: 'image',
    supportsTools: true,
    imageDefaults: IMAGE_4K_DEFAULT_PARAMS,
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

/** Veo 模型默认参数（8秒） */
const VEO_DEFAULT_PARAMS: VideoModelDefaults = {
  duration: '8',
  size: '1280x720',
  aspectRatio: '16:9',
};

/** Veo 4K 模型默认参数（8秒，4K分辨率） */
const VEO_4K_DEFAULT_PARAMS: VideoModelDefaults = {
  duration: '8',
  size: '3840x2160',
  aspectRatio: '16:9',
};

/** Sora 模型默认参数（10秒） */
const SORA_DEFAULT_PARAMS: VideoModelDefaults = {
  duration: '10',
  size: '1280x720',
  aspectRatio: '16:9',
};

/**
 * 视频模型配置
 */
export const VIDEO_MODELS: ModelConfig[] = [
  {
    id: 'veo3.1',
    label: 'Veo 3.1',
    shortCode: 'v31',
    description: '8秒快速模式，支持首尾帧',
    type: 'video',
    isVip: true,
    supportsTools: true,
    videoDefaults: VEO_DEFAULT_PARAMS,
  },
  {
    id: 'sora-2',
    label: 'Sora 2',
    shortCode: 's2',
    description: '10s/15s 默认标清，支持故事场景模式',
    type: 'video',
    isVip: true,
    supportsTools: true,
    videoDefaults: SORA_DEFAULT_PARAMS,
  },
  {
    id: 'veo3',
    label: 'Veo 3',
    shortCode: 'v3',
    description: '8秒视频',
    type: 'video',
    supportsTools: true,
    videoDefaults: VEO_DEFAULT_PARAMS,
  },
  {
    id: 'veo3-pro',
    label: 'Veo 3 Pro',
    shortCode: 'v3p',
    description: '8秒高质量视频',
    type: 'video',
    supportsTools: true,
    videoDefaults: VEO_DEFAULT_PARAMS,
  },
  {
    id: 'veo3.1-pro',
    label: 'Veo 3.1 Pro',
    shortCode: 'v31p',
    description: '8秒高质量模式，支持首尾帧',
    type: 'video',
    supportsTools: true,
    videoDefaults: VEO_DEFAULT_PARAMS,
  },
  {
    id: 'veo3.1-components',
    label: 'Veo 3.1 Components',
    shortCode: 'v31c',
    description: '8秒模式，支持3张参考图',
    type: 'video',
    supportsTools: true,
    videoDefaults: VEO_DEFAULT_PARAMS,
  },
  {
    id: 'veo3.1-4k',
    label: 'Veo 3.1 4K',
    shortCode: 'v314k',
    description: '8秒4K模式，支持首尾帧',
    type: 'video',
    supportsTools: true,
    videoDefaults: VEO_4K_DEFAULT_PARAMS,
  },
  {
    id: 'veo3.1-components-4k',
    label: 'Veo 3.1 Components 4K',
    shortCode: 'v31c4k',
    description: '8秒4K模式，支持3张参考图',
    type: 'video',
    supportsTools: true,
    videoDefaults: VEO_4K_DEFAULT_PARAMS,
  },
  {
    id: 'veo3.1-pro-4k',
    label: 'Veo 3.1 Pro 4K',
    shortCode: 'v31p4k',
    description: '8秒高质量4K模式，支持首尾帧',
    type: 'video',
    supportsTools: true,
    videoDefaults: VEO_4K_DEFAULT_PARAMS,
  },
  {
    id: 'sora-2-pro',
    label: 'Sora 2 Pro',
    shortCode: 's2p',
    description: '10s/15s/25s 高清，支持故事场景模式',
    type: 'video',
    supportsTools: true,
    videoDefaults: SORA_DEFAULT_PARAMS,
  },
];

// ============================================
// 文本模型配置
// ============================================

/**
 * 文本/Agent 模型配置
 */
export const TEXT_MODELS: ModelConfig[] = [
  {
    id: 'deepseek-v3.2',
    label: 'DeepSeek V3.2',
    shortCode: 'ds32',
    description: 'DeepSeek 最新大语言模型，性价比高',
    type: 'text',
    supportsTools: true,
  },
  {
    id: 'claude-opus-4-5-20251101',
    label: 'Claude Opus 4.5',
    shortCode: 'op45',
    description: 'Anthropic 旗舰模型，推理能力最强',
    type: 'text',
    isVip: true,
    supportsTools: true,
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    label: 'Claude Sonnet 4.5',
    shortCode: 'sn45',
    description: 'Anthropic 均衡模型，性能与速度兼顾',
    type: 'text',
    isVip: true,
    supportsTools: true,
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    shortCode: 'g25f',
    description: 'Google 快速响应模型，适合日常任务',
    type: 'text',
    supportsTools: true,
  },
  {
    id: 'gemini-3-pro-preview',
    label: 'Gemini 3 Pro Preview',
    shortCode: 'g3pp',
    description: 'Google 最新预览模型，能力强大',
    type: 'text',
    isVip: true,
    supportsTools: true,
  },
];

// ============================================
// 所有模型
// ============================================

/**
 * 图片和视频模型（用于 ModelSelector）
 */
export const IMAGE_VIDEO_MODELS: ModelConfig[] = [
  ...IMAGE_MODELS,
  ...VIDEO_MODELS,
];

/**
 * 所有支持的模型
 */
export const ALL_MODELS: ModelConfig[] = [
  ...IMAGE_MODELS,
  ...VIDEO_MODELS,
  ...TEXT_MODELS,
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

/**
 * 获取图片模型默认参数
 */
export function getImageModelDefaults(modelId: string): ImageModelDefaults {
  const config = getModelConfig(modelId);
  return config?.imageDefaults ?? IMAGE_DEFAULT_PARAMS;
}

/**
 * 获取视频模型默认参数
 */
export function getVideoModelDefaults(modelId: string): VideoModelDefaults {
  const config = getModelConfig(modelId);
  return config?.videoDefaults ?? VEO_DEFAULT_PARAMS;
}

/**
 * 获取模型颜色
 */
export function getModelTypeColor(type: ModelType): string {
  return MODEL_TYPE_COLORS[type];
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
 * 文本模型选项（用于 Select 组件）
 */
export const TEXT_MODEL_SELECT_OPTIONS = TEXT_MODELS.map(model => ({
  label: model.label,
  value: model.id,
}));

/**
 * 默认图片模型 ID
 */
export const DEFAULT_IMAGE_MODEL_ID = 'gemini-3-pro-image-preview-vip';

/**
 * 获取默认图片模型 ID（优先使用环境变量）
 */
export function getDefaultImageModel(): string {
  const envModel = import.meta.env.VITE_DEFAULT_IMAGE_MODEL;
  if (envModel && getModelConfig(envModel)?.type === 'image') {
    return envModel;
  }
  return DEFAULT_IMAGE_MODEL_ID;
}

/**
 * 默认图片模型（兼容旧代码）
 * @deprecated 请使用 getDefaultImageModel()
 */
export const DEFAULT_IMAGE_MODEL = DEFAULT_IMAGE_MODEL_ID;

/**
 * 默认视频模型 ID
 */
export const DEFAULT_VIDEO_MODEL_ID = 'veo3';

/**
 * 获取默认视频模型 ID（目前固定为 veo3）
 */
export function getDefaultVideoModel(): string {
  return DEFAULT_VIDEO_MODEL_ID;
}

/**
 * 默认视频模型（兼容旧代码）
 * @deprecated 请使用 getDefaultVideoModel()
 */
export const DEFAULT_VIDEO_MODEL = DEFAULT_VIDEO_MODEL_ID;

/**
 * 默认文本模型 ID
 */
export const DEFAULT_TEXT_MODEL_ID = 'deepseek-v3.2';

/**
 * 获取默认文本模型 ID
 */
export function getDefaultTextModel(): string {
  return DEFAULT_TEXT_MODEL_ID;
}

/**
 * 默认文本模型（兼容旧代码）
 */
export const DEFAULT_TEXT_MODEL = DEFAULT_TEXT_MODEL_ID;

// ============================================
// 参数配置（用于 SmartSuggestionPanel）
// ============================================

/** Veo 系列模型 ID（标清，只支持 8 秒） */
const VEO_MODEL_IDS = ['veo3', 'veo3-pro', 'veo3.1', 'veo3.1-pro', 'veo3.1-components'];

/** Veo 4K 系列模型 ID（4K分辨率，只支持 8 秒） */
const VEO_4K_MODEL_IDS = ['veo3.1-4k', 'veo3.1-components-4k', 'veo3.1-pro-4k'];

/** 所有 Veo 模型 ID（用于时长参数） */
const ALL_VEO_MODEL_IDS = [...VEO_MODEL_IDS, ...VEO_4K_MODEL_IDS];

/** Sora 2 模型（支持 10/15 秒） */
const SORA_2_MODEL_IDS = ['sora-2'];

/** Sora 2 Pro 模型（支持 10/15/25 秒和高清尺寸） */
const SORA_2_PRO_MODEL_IDS = ['sora-2-pro'];

/** GPT 图片模型 ID（仅支持有限尺寸） */
const GPT_IMAGE_MODEL_IDS = ['gpt-image-1.5'];

/** Gemini 图片模型 ID（支持完整尺寸） */
const GEMINI_IMAGE_MODEL_IDS = IMAGE_MODELS
  .filter(m => !GPT_IMAGE_MODEL_IDS.includes(m.id))
  .map(m => m.id);

/** 所有图片模型 ID */
const ALL_IMAGE_MODEL_IDS = IMAGE_MODELS.map(m => m.id);

/**
 * 视频参数配置
 * 根据 video-model-config.ts 中各模型的实际参数配置
 */
export const VIDEO_PARAMS: ParamConfig[] = [
  // Veo 系列时长参数（只有 8 秒，包括标清和 4K）
  {
    id: 'duration',
    label: '视频时长',
    shortLabel: '时长',
    description: '生成视频的时长（秒）',
    valueType: 'enum',
    options: [
      { value: '8', label: '8秒' },
    ],
    defaultValue: '8',
    compatibleModels: ALL_VEO_MODEL_IDS,
    modelType: 'video',
  },
  // Sora 2 时长参数（10/15 秒）
  {
    id: 'duration',
    label: '视频时长',
    shortLabel: '时长',
    description: '生成视频的时长（秒）',
    valueType: 'enum',
    options: [
      { value: '10', label: '10秒' },
      { value: '15', label: '15秒' },
    ],
    defaultValue: '10',
    compatibleModels: SORA_2_MODEL_IDS,
    modelType: 'video',
  },
  // Sora 2 Pro 时长参数（10/15/25 秒）
  {
    id: 'duration',
    label: '视频时长',
    shortLabel: '时长',
    description: '生成视频的时长（秒）',
    valueType: 'enum',
    options: [
      { value: '10', label: '10秒' },
      { value: '15', label: '15秒' },
      { value: '25', label: '25秒' },
    ],
    defaultValue: '10',
    compatibleModels: SORA_2_PRO_MODEL_IDS,
    modelType: 'video',
  },
  // Veo 标清和 Sora 2 尺寸参数（720p）
  {
    id: 'size',
    label: '视频尺寸',
    shortLabel: '尺寸',
    description: '生成视频的分辨率',
    valueType: 'enum',
    options: [
      { value: '1280x720', label: '横屏 16:9 (1280x720)' },
      { value: '720x1280', label: '竖屏 9:16 (720x1280)' },
    ],
    defaultValue: '1280x720',
    compatibleModels: [...VEO_MODEL_IDS, ...SORA_2_MODEL_IDS],
    modelType: 'video',
  },
  // Veo 4K 尺寸参数（4K 分辨率）
  {
    id: 'size',
    label: '视频尺寸',
    shortLabel: '尺寸',
    description: '生成视频的分辨率',
    valueType: 'enum',
    options: [
      { value: '3840x2160', label: '4K横屏 16:9 (3840x2160)' },
      { value: '2160x3840', label: '4K竖屏 9:16 (2160x3840)' },
    ],
    defaultValue: '3840x2160',
    compatibleModels: VEO_4K_MODEL_IDS,
    modelType: 'video',
  },
  // Sora 2 Pro 尺寸参数（含高清）
  {
    id: 'size',
    label: '视频尺寸',
    shortLabel: '尺寸',
    description: '生成视频的分辨率',
    valueType: 'enum',
    options: [
      { value: '1280x720', label: '横屏 16:9 (1280x720)' },
      { value: '720x1280', label: '竖屏 9:16 (720x1280)' },
      { value: '1792x1024', label: '高清横屏 (1792x1024)' },
      { value: '1024x1792', label: '高清竖屏 (1024x1792)' },
    ],
    defaultValue: '1280x720',
    compatibleModels: SORA_2_PRO_MODEL_IDS,
    modelType: 'video',
  },
];

/**
 * 图片参数配置
 * 根据 API 文档，size 使用宽高比格式（如 16x9），API 会自动转换为对应像素
 * 'auto' 表示不传尺寸参数，让模型自动决定
 */
export const IMAGE_PARAMS: ParamConfig[] = [
  // GPT 图片模型尺寸（仅支持有限尺寸）
  {
    id: 'size',
    label: '图片尺寸',
    shortLabel: '尺寸',
    description: '生成图片的尺寸比例',
    valueType: 'enum',
    options: [
      { value: 'auto', label: '自动' },
      { value: '1x1', label: '1:1 方形' },
      { value: '3x2', label: '3:2 横版' },
      { value: '2x3', label: '2:3 竖版' },
    ],
    defaultValue: 'auto',
    compatibleModels: GPT_IMAGE_MODEL_IDS,
    modelType: 'image',
  },
  // Gemini 图片模型尺寸（支持完整尺寸）
  {
    id: 'size',
    label: '图片尺寸',
    shortLabel: '尺寸',
    description: '生成图片的尺寸比例',
    valueType: 'enum',
    options: [
      { value: 'auto', label: '自动' },
      { value: '1x1', label: '1:1 方形' },
      { value: '16x9', label: '16:9 横版' },
      { value: '9x16', label: '9:16 竖版' },
      { value: '3x2', label: '3:2 横版' },
      { value: '2x3', label: '2:3 竖版' },
      { value: '4x3', label: '4:3 横版' },
      { value: '3x4', label: '3:4 竖版' },
      { value: '5x4', label: '5:4 横版' },
      { value: '4x5', label: '4:5 竖版' },
      { value: '21x9', label: '21:9 超宽' },
    ],
    defaultValue: 'auto',
    compatibleModels: GEMINI_IMAGE_MODEL_IDS,
    modelType: 'image',
  },
];

/**
 * 所有参数配置
 */
export const ALL_PARAMS: ParamConfig[] = [
  ...VIDEO_PARAMS,
  ...IMAGE_PARAMS,
];

/**
 * 根据模型类型获取参数列表
 */
export function getParamsByModelType(modelType: ModelType): ParamConfig[] {
  return ALL_PARAMS.filter(param => param.modelType === modelType);
}

/**
 * 根据模型 ID 获取兼容的参数列表
 */
export function getCompatibleParams(modelId: string): ParamConfig[] {
  const modelConfig = getModelConfig(modelId);
  if (!modelConfig) return [];
  
  return ALL_PARAMS.filter(param => {
    // 检查模型类型是否匹配
    if (param.modelType !== modelConfig.type) return false;
    // 检查是否在兼容列表中（空数组表示所有模型都兼容）
    if (param.compatibleModels.length === 0) return true;
    return param.compatibleModels.includes(modelId);
  });
}

/**
 * 获取参数配置
 */
export function getParamConfig(paramId: string): ParamConfig | undefined {
  return ALL_PARAMS.find(param => param.id === paramId);
}

/**
 * 获取参数 ID 列表
 */
export function getParamIds(modelType?: ModelType): string[] {
  const params = modelType ? getParamsByModelType(modelType) : ALL_PARAMS;
  return params.map(param => param.id);
}

/**
 * 获取模型支持的尺寸选项
 * @param modelId 模型 ID
 * @returns 尺寸选项列表，包含 value 和 label
 */
export function getSizeOptionsForModel(modelId: string): Array<{ value: string; label: string }> {
  const params = getCompatibleParams(modelId);
  const sizeParam = params.find(p => p.id === 'size');
  return sizeParam?.options || [];
}

/**
 * 获取模型的默认尺寸
 * @param modelId 模型 ID
 * @returns 默认尺寸值
 */
export function getDefaultSizeForModel(modelId: string): string {
  const params = getCompatibleParams(modelId);
  const sizeParam = params.find(p => p.id === 'size');
  return sizeParam?.defaultValue || 'auto';
}
