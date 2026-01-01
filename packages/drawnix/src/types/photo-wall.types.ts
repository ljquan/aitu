/**
 * 宫格图功能类型定义
 *
 * 用于实现宫格图生成功能：
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
export type LayoutStyle = 'scattered' | 'grid' | 'circular' | 'photo-wall';

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
  {
    style: 'photo-wall',
    labelZh: '照片墙',
    labelEn: 'Photo Wall',
    description: '不规则大小的横向散落布局，创意感更强',
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
 * 宫格图生成参数
 */
export interface GridImageParams {
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
 * 宫格图生成结果
 */
export interface GridImageResult {
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
export const GRID_IMAGE_DEFAULTS = {
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
 * 照片墙布局配置
 */
export interface PhotoWallLayoutConfig {
  /** 图片数量（6-12） */
  imageCount?: number;
  /** 最小宽度比例（相对于平均尺寸） */
  minWidthRatio?: number;
  /** 最大宽度比例（相对于平均尺寸） */
  maxWidthRatio?: number;
  /** 最大旋转角度（度） */
  maxRotation?: number;
  /** 元素间距 */
  gap?: number;
}

/**
 * 照片墙默认配置
 */
export const PHOTO_WALL_DEFAULTS = {
  imageCount: 9,
  minWidthRatio: 0.7,
  maxWidthRatio: 1.4,
  maxRotation: 8,
  gap: 15,
};

/**
 * 照片墙提示词模板
 * 生成不规则布局的照片墙，图片大小不一，位置不规则，有白色边框，灰色背景
 * 智能拆图算法会检测并分割这些不规则区域
 */
export const PHOTO_WALL_PROMPT_TEMPLATE = {
  zh: (theme: string, imageCount: number) => {
    return `创建一个创意照片墙拼贴图，主题是"${theme}"。

整体布局要求（极其重要）：
- 统一的灰色背景（RGB 200-210 左右的浅灰色）
- 在灰色背景上放置 ${imageCount} 张独立的照片/卡片
- 每张照片有明显的白色边框（约 10-15px 宽度），呈现相框效果
- 照片大小不一：有大有小，比例各异（正方形、横向、竖向混合）
- 位置不规则：照片随意散落摆放，不要整齐排列成网格
- 所有照片必须保持水平，不要旋转

间距要求（最重要，必须严格遵守）：
- 所有照片之间必须完全分离，绝对禁止任何重叠
- 照片之间必须保持至少 20px 的灰色背景间隙
- 每张照片的四边都必须被灰色背景包围
- 灰色背景必须在所有照片之间清晰可见
- 照片边缘不能触碰或相交

照片内容要求：
- ${imageCount} 张照片必须展示 ${imageCount} 种完全不同的物品/场景
- 禁止任何重复：每张照片的内容、构图、色调都必须明显不同
- 追求最大差异化：不同的场景、不同的物品、不同的风格

大小分布参考：
- 1-2 张大图（占据较大空间，是视觉焦点）
- 3-4 张中等大小的图
- 剩余为小图

输出要求：
- 整体呈横向布局，宽高比约 16:9
- 灰色背景在所有照片周围和之间都清晰可见
- 白色边框清晰完整，不被遮挡`;
  },

  en: (theme: string, imageCount: number) => {
    return `Create a creative photo wall collage with the theme "${theme}".

Overall layout requirements (extremely important):
- Uniform gray background (light gray around RGB 200-210)
- Place ${imageCount} independent photos/cards on the gray background
- Each photo has a clear white border (about 10-15px width), creating a frame effect
- Varying photo sizes: mix of large and small, different aspect ratios (square, landscape, portrait)
- Irregular positions: photos scattered randomly, NOT aligned in a grid
- All photos must remain horizontal, no rotation

Spacing requirements (MOST IMPORTANT, must strictly follow):
- All photos MUST be completely separated, absolutely NO overlapping allowed
- There MUST be at least 20px gray background gap between all photos
- Each photo must be surrounded by gray background on all four sides
- Gray background MUST be clearly visible between all photos
- Photo edges must NOT touch or intersect

Photo content requirements:
- ${imageCount} photos MUST display ${imageCount} completely different items/scenes
- No repetition allowed: each photo must have distinctly different content, composition, and tone
- Maximize variation: different scenes, different objects, different styles

Size distribution reference:
- 1-2 large photos (occupy more space, serve as visual focal points)
- 3-4 medium-sized photos
- Remaining photos are smaller

Output requirements:
- Overall horizontal layout, aspect ratio about 16:9
- Gray background clearly visible around and between all photos
- White borders clear and complete, not obscured`;
  },
};

/**
 * 宫格图提示词模板
 * 生成灰色背景 + 白边框的网格拼贴图，与照片墙使用相同的格式便于统一拆图
 */
export const GRID_IMAGE_PROMPT_TEMPLATE = {
  zh: (theme: string, rows: number, cols: number) =>
    `创建一个 ${rows}x${cols} 的多样化展示拼贴图，主题是"${theme}"。

整体布局要求：
- 统一的灰色背景（RGB 200-210 左右的浅灰色）
- 在灰色背景上放置 ${rows * cols} 张等大的正方形照片/卡片
- 照片排列成 ${rows} 行 ${cols} 列的整齐网格
- 每张照片有明显的白色边框（约 10-15px 宽度），呈现相框效果
- 所有照片必须保持水平，不要旋转

间距要求（必须严格遵守）：
- 所有照片之间必须完全分离，绝对禁止任何重叠
- 照片之间必须保持至少 15px 的灰色背景间隙
- 每张照片的四边都必须被灰色背景包围

照片内容要求（极其重要）：
- ${rows * cols} 张照片必须展示 ${rows * cols} 种完全不同的物品/元素
- 禁止任何重复：每个物品的形状、颜色、姿态、角度都必须明显不同
- 追求最大差异化：如果主题是动物，展示不同种类；如果是物品，展示不同类别
- 每个元素应有不同的视觉特征：不同的颜色、不同的形态、不同的细节

输出要求：
- 整体呈正方形或接近正方形的比例
- 灰色背景在所有照片周围和之间都清晰可见
- 白色边框清晰完整，不被遮挡`,

  en: (theme: string, rows: number, cols: number) =>
    `Create a ${rows}x${cols} diverse showcase collage with the theme "${theme}".

Overall layout requirements:
- Uniform gray background (light gray around RGB 200-210)
- Place ${rows * cols} equal-sized square photos/cards on the gray background
- Photos arranged in a neat grid of ${rows} rows and ${cols} columns
- Each photo has a clear white border (about 10-15px width), creating a frame effect
- All photos must remain horizontal, no rotation

Spacing requirements (must strictly follow):
- All photos MUST be completely separated, absolutely NO overlapping allowed
- There MUST be at least 15px gray background gap between all photos
- Each photo must be surrounded by gray background on all four sides

Photo content requirements (extremely important):
- ${rows * cols} photos MUST display ${rows * cols} completely different items/elements
- No repetition allowed: each item must have distinctly different shape, color, pose, and angle
- Maximize variation: if the theme is animals, show different species; if objects, show different categories
- Each element should have different visual features: different colors, forms, and details

Output requirements:
- Overall square or near-square aspect ratio
- Gray background clearly visible around and between all photos
- White borders clear and complete, not obscured`,
};
