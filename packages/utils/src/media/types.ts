/**
 * Media Utilities - Shared Types
 *
 * 媒体处理工具的共享类型定义
 */

// ==================== Video Types ====================

/**
 * 提取的视频帧信息
 */
export interface ExtractedFrame {
  /** 帧的 Data URL (PNG 格式) */
  dataUrl: string;
  /** 帧在视频中的时间戳（秒） */
  timestamp: number;
  /** 视频宽度 */
  width: number;
  /** 视频高度 */
  height: number;
}

/**
 * 视频帧提取选项
 */
export interface ExtractFrameOptions {
  /** 目标时间戳（秒）。'last' 提取最后一帧，'first' 提取第一帧。默认 'last' */
  timestamp?: number | 'last' | 'first';
  /** 输出图片格式。默认 'image/png' */
  format?: 'image/png' | 'image/jpeg';
  /** JPEG 格式的质量 (0-1)。默认 0.92 */
  quality?: number;
  /** 超时时间（毫秒）。默认 30000 */
  timeout?: number;
}

/**
 * 缩略图尺寸
 */
export interface ThumbnailSize {
  width: number;
  height: number;
}

// ==================== Image Types ====================

/**
 * 图片压缩策略
 */
export interface CompressionStrategy {
  /** 是否需要压缩 */
  shouldCompress: boolean;
  /** 目标大小 (MB) */
  targetSizeMB: number;
  /** 初始质量 (0-1) */
  initialQuality: number;
  /** 最小质量 (0-1) */
  minQuality: number;
  /** 最大质量 (0-1) */
  maxQuality: number;
}

/**
 * 图片压缩结果
 */
export interface CompressionResult {
  /** 压缩后的 Blob */
  compressed: Blob;
  /** 原始大小（字节） */
  originalSize: number;
  /** 压缩后大小（字节） */
  compressedSize: number;
  /** 最终使用的质量 */
  quality: number;
}

/**
 * 边框裁剪结果
 */
export interface BorderTrimResult {
  /** 顶部裁剪位置 */
  top: number;
  /** 右侧裁剪位置 */
  right: number;
  /** 底部裁剪位置 */
  bottom: number;
  /** 左侧裁剪位置 */
  left: number;
}

/**
 * Canvas 裁剪结果（带详细信息）
 */
export interface CanvasTrimResult {
  /** 裁剪后的 Canvas */
  canvas: HTMLCanvasElement;
  /** 左侧裁剪偏移 */
  left: number;
  /** 顶部裁剪偏移 */
  top: number;
  /** 裁剪后宽度 */
  trimmedWidth: number;
  /** 裁剪后高度 */
  trimmedHeight: number;
  /** 是否进行了裁剪 */
  wasTrimmed: boolean;
}

/**
 * 边框颜色检测选项
 */
export interface BorderColorOptions {
  /** 白色阈值，RGB 都大于此值视为白色（默认 230） */
  whiteThreshold?: number;
  /** 灰色最小值（默认 150） */
  grayMinValue?: number;
  /** 灰色最大值（默认 255） */
  grayMaxValue?: number;
  /** 最大颜色差异（默认 25） */
  maxColorDiff?: number;
  /** alpha 通道值（默认 255） */
  alpha?: number;
}

/**
 * 裁剪白边/透明边选项
 */
export interface TrimOptions {
  /** 白色阈值，RGB 都大于此值视为白色（默认 240） */
  whiteThreshold?: number;
  /** 透明度阈值，alpha 小于此值视为透明（默认 10） */
  alphaThreshold?: number;
  /** 裁剪后最小尺寸（默认 10） */
  minSize?: number;
}

/**
 * 图片裁剪输出选项
 */
export interface TrimOutputOptions extends TrimOptions {
  /** 输出格式（默认 'image/jpeg'） */
  outputFormat?: 'image/jpeg' | 'image/png';
  /** 输出质量（默认 0.92） */
  outputQuality?: number;
}
