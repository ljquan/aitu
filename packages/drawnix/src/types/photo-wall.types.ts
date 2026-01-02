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
export type LayoutStyle = 'scattered' | 'grid' | 'circular' | 'inspiration-board';

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
    style: 'inspiration-board',
    labelZh: '灵感图',
    labelEn: 'Inspiration Board',
    description: '不规则大小的紧凑拼贴布局，适合创意灵感展示',
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
 * 灵感图布局配置
 */
export interface InspirationBoardLayoutConfig {
  /** 图片数量（1-36） */
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
 * 灵感图默认配置
 */
export const INSPIRATION_BOARD_DEFAULTS = {
  imageCount: 9,
  minWidthRatio: 0.7,
  maxWidthRatio: 1.4,
  maxRotation: 8,
  gap: 15,
};

/**
 * 灵感图提示词模板
 * 生成紧凑拼贴布局的生产图，图片大小不一，用细白线分割
 *
 * 拆图算法：Flood Fill（从边缘开始，白线作为可穿透区域）
 * 关键要求：白线必须从图片边缘连通到每张子图周围
 */
export const INSPIRATION_BOARD_PROMPT_TEMPLATE = {
  zh: (theme: string, imageCount: number) => {
    return `创建一个边缘到边缘的灵感拼贴图（生产用），主题是"${theme}"，包含 ${imageCount} 张图片。

【关键要求 - 必须铺满画面】
- 图片必须完全铺满整个画布，从左边缘到右边缘，从上边缘到下边缘
- 禁止任何外部空白区域或边距
- 最外侧的图片必须紧贴画布边界
- 画布利用率必须达到 98% 以上
- 禁止生成类似相框、照片边框的装饰效果

【布局要求】
- 图片大小不一：有大有小，比例各异（正方形、横向、竖向混合）
- 大小分布：1-2 张大图占据显著区域，3-4 张中图，其余为小图
- 不规则拼贴布局，类似杂志或 Pinterest 风格的灵感板
- 图片之间紧密排列，只留分割线的空间
- 图片边缘干净利落，无装饰边框或阴影效果

【白色分割线要求 - 算法依赖】
- 图片之间用 2-3px 纯白色 (#FFFFFF) 细线分隔
- 白线必须连续、无断裂，形成连通的分割网络
- 每张图片必须被白线完全包围（四边都有白线）
- 画布最外边缘也有 2-3px 白线（不是大片空白）
- 禁止图片重叠或直接接触

【图片内容要求】
- ${imageCount} 张图片展示 ${imageCount} 种完全不同的内容
- 禁止重复：内容、构图、色调都必须明显不同
- 每张图片内容饱满，主体居中
- 图片内容直接呈现，不要有边框装饰

【输出要求】
- 横向布局，宽高比约 16:9
- 整个画面必须被图片填满，无外部留白`;
  },

  en: (theme: string, imageCount: number) => {
    return `Create an edge-to-edge inspiration board collage (production use) with the theme "${theme}", containing ${imageCount} images.

【Critical Requirement - Must Fill Canvas】
- Images must completely fill the entire canvas, from left edge to right edge, top to bottom
- No external blank areas or margins allowed
- Outermost images must touch canvas boundaries
- Canvas utilization must be 98% or higher
- Do NOT generate photo frame or border decorations

【Layout Requirements】
- Varying image sizes: large, medium, and small mixed
- Size distribution: 1-2 large images taking significant area, 3-4 medium, rest small
- Irregular collage layout, magazine or Pinterest style inspiration board
- Images tightly arranged, only leaving space for divider lines
- Clean image edges, no decorative borders or shadow effects

【White Divider Lines - Algorithm Critical】
- Images separated by 2-3px pure white (#FFFFFF) lines
- White lines must be continuous, no breaks, forming a connected network
- Each image must be completely surrounded by white lines (all four sides)
- Canvas outer edge also has 2-3px white line (not large blank space)
- No overlapping or direct contact between images

【Image Content Requirements】
- ${imageCount} images showing ${imageCount} completely different contents
- No repetition: different content, composition, and tone
- Each image with full content, subject centered
- Present image content directly without frame decorations

【Output Requirements】
- Horizontal layout, aspect ratio about 16:9
- Entire canvas must be filled with images, no external whitespace`;
  },
};

/**
 * 宫格图提示词模板
 * 生成紧凑网格拼贴图，等大图片 + 细白线分割，最大化图片区域
 */
export const GRID_IMAGE_PROMPT_TEMPLATE = {
  zh: (theme: string, rows: number, cols: number) =>
    `创建一个 ${rows}x${cols} 紧凑网格拼贴图（生产用），主题是"${theme}"。

【布局要求 - 极其重要】
- 严格的 ${rows} 行 × ${cols} 列网格布局
- 所有 ${rows * cols} 张图片必须完全相同大小（正方形）
- 图片之间用 2-3px 细白线分隔（仅作为分割线）
- 整个画面几乎被图片填满，最小化边距
- 外边缘也用 2-3px 细白线包围

【分割线要求 - 必须遵守】
- 分割线必须是纯白色 (#FFFFFF)
- 分割线必须笔直、连续、无断裂
- 横向分割线贯穿整个宽度
- 纵向分割线贯穿整个高度
- 分割线宽度统一为 2-3px

【图片内容要求】
- ${rows * cols} 张图片必须展示 ${rows * cols} 种完全不同的内容
- 禁止重复：每个元素的形状、颜色、姿态都必须明显不同
- 追求最大差异化：不同种类、不同风格、不同细节
- 每张图片内容饱满，充分利用空间

【输出要求】
- 整体呈正方形或接近正方形的比例
- 图片区域最大化（占比 > 95%）
- 这是生产图，用于后续拆分`,

  en: (theme: string, rows: number, cols: number) =>
    `Create a ${rows}x${cols} compact grid collage (production use) with the theme "${theme}".

【Layout Requirements - Extremely Important】
- Strict ${rows} rows × ${cols} columns grid layout
- All ${rows * cols} images must be exactly the same size (square)
- Images separated by 2-3px thin white lines (only as dividers)
- The entire canvas should be almost filled with images, minimize margins
- Outer edges also surrounded by 2-3px thin white lines

【Divider Line Requirements - Must Follow】
- Divider lines must be pure white (#FFFFFF)
- Divider lines must be straight, continuous, no breaks
- Horizontal dividers span the entire width
- Vertical dividers span the entire height
- Divider line width uniform at 2-3px

【Image Content Requirements】
- ${rows * cols} images must show ${rows * cols} completely different contents
- No repetition: each element must have distinctly different shape, color, pose
- Maximize variation: different types, styles, details
- Each image should have full content, utilizing space effectively

【Output Requirements】
- Overall square or near-square aspect ratio
- Maximize image area (> 95%)
- This is a production image for subsequent splitting`,
};
