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
  /**
   * 回退颜色 (用于渐变/图片填充的首次渲染)
   * 在 SVG defs 准备好之前，使用此颜色作为占位显示
   * 对于渐变，通常是第一个色标的颜色
   * 对于图片，通常是 #FFFFFF 或主色调
   */
  fallbackColor?: string;
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
 * 从渐变配置中提取主色调（第一个色标的颜色）
 */
export function getGradientPrimaryColor(config: GradientFillConfig): string {
  if (config.stops && config.stops.length > 0) {
    return config.stops[0].color;
  }
  return '#FFFFFF';
}

/**
 * 计算 FillConfig 的 fallbackColor
 * 用于在渐变/图片填充的 SVG defs 准备好之前显示
 */
export function computeFallbackColor(config: FillConfig): string {
  switch (config.type) {
    case 'solid':
      return config.solid?.color || '#FFFFFF';
    case 'gradient':
      return config.gradient ? getGradientPrimaryColor(config.gradient) : '#FFFFFF';
    case 'image':
      // 图片填充使用白色作为回退
      return '#FFFFFF';
    default:
      return '#FFFFFF';
  }
}

/**
 * 确保 FillConfig 有 fallbackColor
 * 如果没有，自动计算并添加
 */
export function ensureFallbackColor(config: FillConfig): FillConfig {
  if (config.fallbackColor) {
    return config;
  }
  return {
    ...config,
    fallbackColor: computeFallbackColor(config),
  };
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
 * 获取 FillConfig 的初始渲染颜色
 * 用于 Generator 在初次渲染时使用，避免黑色闪烁
 * 对于纯色返回实际颜色，对于渐变/图片返回 fallbackColor
 */
export function getFillRenderColor(fill: string | FillConfig | undefined | null): string {
  if (!fill) {
    return 'none';
  }
  if (typeof fill === 'string') {
    return fill;
  }
  if (isFillConfig(fill)) {
    // 优先使用 fallbackColor
    if (fill.fallbackColor) {
      return fill.fallbackColor;
    }
    // 纯色直接返回
    if (fill.type === 'solid' && fill.solid) {
      return fill.solid.color;
    }
    // 渐变和图片计算 fallbackColor
    return computeFallbackColor(fill);
  }
  return 'none';
}

/**
 * 从元素获取 FillConfig
 * 支持新数据结构（element.fillConfig）和旧数据结构（element.fill 是 FillConfig）
 * 
 * @param element - PlaitElement 或包含 fill/fillConfig 的对象
 * @returns FillConfig 或 null
 */
export function getElementFillConfig(element: Record<string, any> | undefined | null): FillConfig | null {
  if (!element) return null;
  
  // 优先使用新的 fillConfig 属性
  if (element.fillConfig && isFillConfig(element.fillConfig)) {
    return element.fillConfig;
  }
  
  // 兼容旧数据：element.fill 是 FillConfig 对象的情况
  if (element.fill && isFillConfig(element.fill)) {
    return element.fill;
  }
  
  return null;
}

/**
 * 获取元素的填充值（供 UI 显示使用）
 * 返回 FillConfig 或字符串或 undefined
 */
export function getElementFillValue(element: Record<string, any> | undefined | null): FillConfig | string | undefined {
  if (!element) return undefined;
  
  // 如果有 fillConfig，返回它
  const fillConfig = getElementFillConfig(element);
  if (fillConfig) {
    return fillConfig;
  }
  
  // 否则返回 fill 字符串
  if (typeof element.fill === 'string') {
    return element.fill;
  }
  
  return undefined;
}

/**
 * 生成唯一的 SVG 定义 ID
 */
export function generateFillDefId(elementId: string, fillType: FillType): string {
  return `fill-${fillType}-${elementId}`;
}

// ============ 数据迁移 ============

/**
 * 迁移单个元素的 fill 数据格式
 * 旧格式：element.fill 是 FillConfig 对象
 * 新格式：element.fill 是字符串（fallbackColor），element.fillConfig 是 FillConfig 对象
 * 
 * @param element - 元素对象
 * @returns 迁移后的元素（如果无需迁移返回原对象）
 */
export function migrateElementFillData<T extends Record<string, any>>(element: T): T {
  // 如果 fill 不是 FillConfig 对象，无需迁移
  if (!element.fill || !isFillConfig(element.fill)) {
    return element;
  }
  
  const fillConfig = element.fill as FillConfig;
  
  // 只迁移渐变和图片类型，纯色不需要迁移
  if (fillConfig.type !== 'gradient' && fillConfig.type !== 'image') {
    // 纯色类型：直接提取颜色字符串
    if (fillConfig.type === 'solid' && fillConfig.solid) {
      return {
        ...element,
        fill: fillConfig.solid.color,
        fillConfig: undefined, // 纯色不需要 fillConfig
      };
    }
    return element;
  }
  
  // 计算 fallbackColor
  const fallbackColor = fillConfig.fallbackColor || computeFallbackColor(fillConfig);
  
  // 确保 FillConfig 包含 fallbackColor
  const migratedFillConfig: FillConfig = {
    ...fillConfig,
    fallbackColor,
  };
  
  return {
    ...element,
    fill: fallbackColor, // 设置为字符串，供 Plait 直接渲染
    fillConfig: migratedFillConfig, // 保存完整配置，供插件使用
  };
}

/**
 * 迁移元素数组的 fill 数据格式
 * 在数据加载时调用，确保传入 Plait 的数据是正确格式
 * 
 * @param elements - 元素数组
 * @returns 迁移后的元素数组（如果无需迁移返回原数组）
 */
export function migrateElementsFillData<T extends Record<string, any>>(elements: T[]): T[] {
  let hasMigration = false;
  
  const migratedElements = elements.map((element) => {
    const migrated = migrateElementFillData(element);
    if (migrated !== element) {
      hasMigration = true;
    }
    return migrated;
  });
  
  // 如果没有任何迁移，返回原数组以保持引用稳定
  return hasMigration ? migratedElements : elements;
}
