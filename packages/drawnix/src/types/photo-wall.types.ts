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
    `创建一个 ${rows}x${cols} 的多样化展示拼贴图，主题是"${theme}"。

布局要求：
- 图片被清晰地分成 ${rows * cols} 个等大的正方形区域，排列成 ${rows} 行 ${cols} 列
- 区域之间有明显的白色分隔线（约 10px 宽度）
- 每个区域有独立的白色或浅色纯色背景

多样性要求（极其重要）：
- ${rows * cols} 个区域必须展示 ${rows * cols} 种完全不同的物品/元素
- 禁止任何重复：每个物品的形状、颜色、姿态、角度都必须明显不同
- 追求最大差异化：如果主题是动物，展示不同种类；如果是物品，展示不同类别
- 每个元素应有不同的视觉特征：不同的颜色、不同的形态、不同的细节
- 元素之间的风格可以有变化：有的写实、有的卡通、有的简约、有的精细

示例多样性参考：
- 若主题是"猫"：不同品种、不同毛色、不同姿势、不同表情
- 若主题是"餐具"：碗、盘、杯、勺、叉、刀等不同类别
- 若主题是"花卉"：不同种类、不同颜色、不同形态的花

输出要求：
- 每个物品居中放置在其区域内
- 物品大小适中，占据区域 60%-80% 的空间
- 适合分割后独立展示`,

  en: (theme: string, rows: number, cols: number) =>
    `Create a ${rows}x${cols} diverse showcase collage with the theme "${theme}".

Layout requirements:
- The image is clearly divided into ${rows * cols} equal square sections, arranged in ${rows} rows and ${cols} columns
- Clear white dividing lines between sections (approximately 10px width)
- Each section has an independent white or light solid background

Diversity requirements (extremely important):
- The ${rows * cols} sections MUST display ${rows * cols} completely different items/elements
- No repetition allowed: each item must have distinctly different shape, color, pose, and angle
- Maximize variation: if the theme is animals, show different species; if objects, show different categories
- Each element should have different visual features: different colors, forms, and details
- Styles can vary between elements: some realistic, some cartoon, some minimalist, some detailed

Diversity reference examples:
- If theme is "cats": different breeds, fur colors, poses, expressions
- If theme is "tableware": bowls, plates, cups, spoons, forks, knives - different categories
- If theme is "flowers": different species, colors, and forms

Output requirements:
- Each item centered within its section
- Items moderately sized, occupying 60%-80% of the section space
- Suitable for independent display after splitting`,
};
