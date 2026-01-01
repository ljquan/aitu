/**
 * 照片墙功能类型定义
 * 
 * 用于实现照片墙生成功能：
 * 1. AI 生成一张拼贴图
 * 2. Canvas 分割成多个独立图片
 * 3. 按布局风格插入画板
 */

/**
 * 网格配置 - 用于图片分割
 */
export interface GridConfig {
  /** 行数 */
  rows: number;
  /** 列数 */
  cols: number;
}

/**
 * 布局风格枚举
 */
export type LayoutStyle = 'scattered' | 'grid' | 'circular';

/**
 * 布局风格配置
 */
export interface LayoutStyleConfig {
  /** 风格标识 */
  style: LayoutStyle;
  /** 中文名称 */
  labelZh: string;
  /** 英文名称 */
  labelEn: string;
  /** 描述 */
  description: string;
}

/**
 * 预定义的布局风格配置
 */
export const LAYOUT_STYLES: LayoutStyleConfig[] = [
  {
    style: 'scattered',
    labelZh: '散落',
    labelEn: 'Scattered',
    description: '随机位置和旋转角度，模拟真实照片散落效果',
  },
  {
    style: 'grid',
    labelZh: '网格',
    labelEn: 'Grid',
    description: '整齐的网格排列，适合展示类场景',
  },
  {
    style: 'circular',
    labelZh: '环形',
    labelEn: 'Circular',
    description: '围绕中心点环形分布，适合突出中心主题',
  },
];

/**
 * 分割后的图片元素
 */
export interface ImageElement {
  /** 唯一标识 */
  id: string;
  /** 图片数据（base64 DataURL） */
  imageData: string;
  /** 在原图中的索引位置（从左到右，从上到下） */
  originalIndex: number;
  /** 原始宽度 */
  width: number;
  /** 原始高度 */
  height: number;
}

/**
 * 带位置信息的图片元素（布局计算后）
 */
export interface PositionedElement extends ImageElement {
  /** X 坐标 */
  x: number;
  /** Y 坐标 */
  y: number;
  /** 旋转角度（度） */
  rotation: number;
  /** 缩放比例 */
  scale: number;
  /** Z 层级（用于控制重叠顺序） */
  zIndex: number;
}

/**
 * 照片墙生成参数
 */
export interface PhotoWallParams {
  /** 用户输入的主题描述 */
  theme: string;
  /** 网格配置（默认 3x3） */
  gridConfig?: GridConfig;
  /** 布局风格（默认散落） */
  layoutStyle?: LayoutStyle;
  /** 图片生成尺寸（默认 1x1） */
  imageSize?: string;
  /** 图片质量 */
  imageQuality?: '1k' | '2k' | '4k';
}

/**
 * 照片墙生成结果
 */
export interface PhotoWallResult {
  /** 是否成功 */
  success: boolean;
  /** 原始拼贴图 URL */
  originalImageUrl?: string;
  /** 分割后的图片元素 */
  elements?: PositionedElement[];
  /** 错误信息 */
  error?: string;
}

/**
 * 布局计算参数
 */
export interface LayoutParams {
  /** 画布/区域宽度 */
  canvasWidth: number;
  /** 画布/区域高度 */
  canvasHeight: number;
  /** 起始 X 坐标 */
  startX: number;
  /** 起始 Y 坐标 */
  startY: number;
  /** 元素间距 */
  gap?: number;
}

/**
 * 散落布局配置
 */
export interface ScatteredLayoutConfig {
  /** 最大旋转角度（度），默认 15 */
  maxRotation?: number;
  /** 最小缩放比例，默认 0.8 */
  minScale?: number;
  /** 最大缩放比例，默认 1.2 */
  maxScale?: number;
  /** 位置随机偏移范围（像素），默认 30 */
  positionJitter?: number;
}

/**
 * 环形布局配置
 */
export interface CircularLayoutConfig {
  /** 中心元素索引（-1 表示无中心元素），默认 -1 */
  centerIndex?: number;
  /** 环形半径，默认根据元素数量自动计算 */
  radius?: number;
  /** 起始角度（度），默认 0 */
  startAngle?: number;
}

/**
 * 默认配置
 */
export const PHOTO_WALL_DEFAULTS = {
  gridConfig: { rows: 3, cols: 3 } as GridConfig,
  layoutStyle: 'scattered' as LayoutStyle,
  imageSize: '1x1',
  imageQuality: '2k' as const,
  layoutParams: {
    gap: 20,
  },
  scatteredConfig: {
    maxRotation: 15,
    minScale: 0.85,
    maxScale: 1.15,
    positionJitter: 40,
  } as ScatteredLayoutConfig,
  circularConfig: {
    centerIndex: -1,
    startAngle: -90, // 从顶部开始
  } as CircularLayoutConfig,
};

/**
 * 照片墙提示词模板
 * 用于生成适合分割的拼贴图
 */
export const PHOTO_WALL_PROMPT_TEMPLATE = {
  zh: (theme: string, rows: number, cols: number) =>
    `创建一个 ${rows}x${cols} 的产品展示拼贴图，主题是"${theme}"。
要求：
- 图片被清晰地分成 ${rows * cols} 个等大的区域
- 每个区域展示一个独立的物品或场景
- 区域之间有明显的白色分隔线
- 整体风格统一协调
- 每个物品有独立的白色或浅色背景
- 适合用于照片墙展示`,

  en: (theme: string, rows: number, cols: number) =>
    `Create a ${rows}x${cols} product showcase collage with the theme "${theme}".
Requirements:
- The image is clearly divided into ${rows * cols} equal sections
- Each section displays an independent item or scene
- Clear white dividing lines between sections
- Unified and coordinated overall style
- Each item has an independent white or light background
- Suitable for photo wall display`,
};
