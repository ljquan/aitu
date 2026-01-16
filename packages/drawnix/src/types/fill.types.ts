/**
 * 填充类型定义
 * Fill Type Definitions
 */

// ============ 填充类型枚举 ============

/** 填充类型 */
export type FillType = 'solid' | 'gradient' | 'image';

// ============ 纯色填充 ============

/** 纯色填充配置 */
export interface SolidFillConfig {
  /** 颜色值 (HEX 格式，可含透明度) */
  color: string;
}

// ============ 渐变填充 ============

/** 渐变类型 */
export type GradientFillType = 'linear' | 'radial';

/** 渐变色标 */
export interface GradientFillStop {
  /** 位置 (0-1) */
  offset: number;
  /** 颜色值 (HEX 格式) */
  color: string;
  /** 透明度 (0-1)，可选，默认从 color 的 alpha 通道获取 */
  opacity?: number;
}

/** 线性渐变配置 */
export interface LinearGradientConfig {
  type: 'linear';
  /** 渐变角度 (0-360)，0 度为从左到右 */
  angle: number;
  /** 色标列表 */
  stops: GradientFillStop[];
}

/** 径向渐变配置 */
export interface RadialGradientConfig {
  type: 'radial';
  /** 中心点 X 位置 (0-1)，相对于元素宽度 */
  centerX: number;
  /** 中心点 Y 位置 (0-1)，相对于元素高度 */
  centerY: number;
  /** 色标列表 */
  stops: GradientFillStop[];
}

/** 渐变填充配置 */
export type GradientFillConfig = LinearGradientConfig | RadialGradientConfig;

// ============ 图片填充 ============

/** 图片平铺模式 */
export type ImageFillMode = 'stretch' | 'tile' | 'fit';

/** 图片填充配置 */
export interface ImageFillConfig {
  /** 图片 URL（可以是 base64 或网络 URL） */
  imageUrl: string;
  /** 平铺模式 */
  mode: ImageFillMode;
  /** 缩放比例 (0.5-2.0)，默认 1 */
  scale?: number;
  /** X 轴偏移 (-1 到 1)，相对于元素宽度，默认 0 */
  offsetX?: number;
  /** Y 轴偏移 (-1 到 1)，相对于元素高度，默认 0 */
  offsetY?: number;
  /** 旋转角度 (0-360)，默认 0 */
  rotation?: number;
}

// ============ 统一填充配置 ============

/** 统一填充配置 */
export interface FillConfig {
  /** 填充类型 */
  type: FillType;
  /** 纯色配置 (type='solid' 时使用) */
  solid?: SolidFillConfig;
  /** 渐变配置 (type='gradient' 时使用) */
  gradient?: GradientFillConfig;
  /** 图片配置 (type='image' 时使用) */
  image?: ImageFillConfig;
}

// ============ 辅助类型和常量 ============

/** 默认纯色填充配置 */
export const DEFAULT_SOLID_FILL: SolidFillConfig = {
  color: '#FFFFFF',
};

/** 默认线性渐变填充配置 */
export const DEFAULT_LINEAR_GRADIENT: LinearGradientConfig = {
  type: 'linear',
  angle: 90,
  stops: [
    { offset: 0, color: '#FFFFFF' },
    { offset: 1, color: '#000000' },
  ],
};

/** 默认径向渐变填充配置 */
export const DEFAULT_RADIAL_GRADIENT: RadialGradientConfig = {
  type: 'radial',
  centerX: 0.5,
  centerY: 0.5,
  stops: [
    { offset: 0, color: '#FFFFFF' },
    { offset: 1, color: '#000000' },
  ],
};

/** 默认图片填充配置 */
export const DEFAULT_IMAGE_FILL: ImageFillConfig = {
  imageUrl: '',
  mode: 'stretch',
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
};

// ============ 渐变预设 ============

/** 渐变预设分类 */
export type GradientPresetCategory = 'basic' | 'colorful' | 'sunset' | 'nature' | 'metal';

/** 渐变预设 */
export interface GradientFillPreset {
  id: string;
  name: string;
  nameZh: string;
  category: GradientPresetCategory;
  config: GradientFillConfig;
}

/** 预设渐变列表 */
export const GRADIENT_FILL_PRESETS: GradientFillPreset[] = [
  // Basic
  {
    id: 'gray-scale',
    name: 'Gray Scale',
    nameZh: '灰度',
    category: 'basic',
    config: {
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#FFFFFF' },
        { offset: 1, color: '#666666' },
      ],
    },
  },
  // Colorful
  {
    id: 'ocean-blue',
    name: 'Ocean Blue',
    nameZh: '海洋蓝',
    category: 'colorful',
    config: {
      type: 'linear',
      angle: 135,
      stops: [
        { offset: 0, color: '#667eea' },
        { offset: 1, color: '#764ba2' },
      ],
    },
  },
  {
    id: 'fresh-green',
    name: 'Fresh Green',
    nameZh: '清新绿',
    category: 'colorful',
    config: {
      type: 'linear',
      angle: 135,
      stops: [
        { offset: 0, color: '#11998e' },
        { offset: 1, color: '#38ef7d' },
      ],
    },
  },
  {
    id: 'pink-purple',
    name: 'Pink Purple',
    nameZh: '粉紫',
    category: 'colorful',
    config: {
      type: 'linear',
      angle: 135,
      stops: [
        { offset: 0, color: '#ee9ca7' },
        { offset: 1, color: '#ffdde1' },
      ],
    },
  },
  // Sunset
  {
    id: 'sunset-orange',
    name: 'Sunset Orange',
    nameZh: '日落橙',
    category: 'sunset',
    config: {
      type: 'linear',
      angle: 45,
      stops: [
        { offset: 0, color: '#ff6a00' },
        { offset: 1, color: '#ee0979' },
      ],
    },
  },
  {
    id: 'warm-flame',
    name: 'Warm Flame',
    nameZh: '暖焰',
    category: 'sunset',
    config: {
      type: 'linear',
      angle: 45,
      stops: [
        { offset: 0, color: '#ff9a9e' },
        { offset: 0.5, color: '#fecfef' },
        { offset: 1, color: '#fecfef' },
      ],
    },
  },
  // Nature
  {
    id: 'sky-blue',
    name: 'Sky Blue',
    nameZh: '天空蓝',
    category: 'nature',
    config: {
      type: 'radial',
      centerX: 0.5,
      centerY: 0.3,
      stops: [
        { offset: 0, color: '#a1c4fd' },
        { offset: 1, color: '#c2e9fb' },
      ],
    },
  },
  {
    id: 'forest-green',
    name: 'Forest Green',
    nameZh: '森林绿',
    category: 'nature',
    config: {
      type: 'linear',
      angle: 180,
      stops: [
        { offset: 0, color: '#134e5e' },
        { offset: 1, color: '#71b280' },
      ],
    },
  },
  // Metal
  {
    id: 'silver',
    name: 'Silver',
    nameZh: '银色',
    category: 'metal',
    config: {
      type: 'linear',
      angle: 135,
      stops: [
        { offset: 0, color: '#bdc3c7' },
        { offset: 0.5, color: '#ecf0f1' },
        { offset: 1, color: '#bdc3c7' },
      ],
    },
  },
  {
    id: 'gold',
    name: 'Gold',
    nameZh: '金色',
    category: 'metal',
    config: {
      type: 'linear',
      angle: 135,
      stops: [
        { offset: 0, color: '#f5af19' },
        { offset: 0.5, color: '#f7dc6f' },
        { offset: 1, color: '#f5af19' },
      ],
    },
  },
];

// ============ 工具函数类型 ============

/**
 * 判断是否为纯色填充（兼容旧的 string 格式）
 */
export function isSolidFill(fill: string | FillConfig | undefined): fill is string {
  return typeof fill === 'string';
}

/**
 * 判断是否为 FillConfig 对象
 */
export function isFillConfig(fill: string | FillConfig | undefined): fill is FillConfig {
  return typeof fill === 'object' && fill !== null && 'type' in fill;
}

/**
 * 将旧格式的 string fill 转换为 FillConfig
 */
export function stringToFillConfig(fill: string): FillConfig {
  return {
    type: 'solid',
    solid: { color: fill },
  };
}

/**
 * 将 FillConfig 转换为可用于渲染的字符串或 SVG 定义 ID
 * 返回 null 表示需要使用 SVG defs 定义
 */
export function fillConfigToRenderValue(fill: FillConfig): string | null {
  if (fill.type === 'solid' && fill.solid) {
    return fill.solid.color;
  }
  // 渐变和图片填充需要使用 SVG defs，返回 null
  return null;
}

/**
 * 生成唯一的 SVG 定义 ID
 */
export function generateFillDefId(elementId: string, fillType: FillType): string {
  return `fill-${fillType}-${elementId}`;
}
