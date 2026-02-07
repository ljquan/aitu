/**
 * 智能图片分割核心模块
 * 
 * 统一宫格图和灵感图的拆分逻辑，提供可配置的拆分策略
 */

import { loadImage, trimBorders } from './image-border-utils';

/**
 * 分割后的图片元素
 */
export interface SplitImageElement {
  /** 图片数据（base64 DataURL） */
  imageData: string;
  /** 在原图中的索引位置 */
  index: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
  /** 原始 X 坐标 */
  sourceX: number;
  /** 原始 Y 坐标 */
  sourceY: number;
  /** 是否为透明背景图片 */
  hasTransparency?: boolean;
}

/**
 * 去白边模式
 */
export type TrimMode = 
  | 'strict'   // 严格模式：整行/整列 100% 白色才裁剪（宫格图）
  | 'normal'   // 普通模式：95% 白色就裁剪（灵感图）
  | 'none';    // 不裁剪

/**
 * 分割配置选项
 */
export interface SplitOptions {
  /** 去白边模式 */
  trimMode: TrimMode;
  /** 是否递归拆分 */
  recursive: boolean;
  /** 最大递归深度 */
  maxDepth: number;
  /** 最大元素数量 */
  maxElements: number;
  /** 最小元素尺寸（像素） */
  minElementSize: number;
}

/**
 * 预设配置
 */
export const SPLIT_PRESETS = {
  /** 标准宫格图配置 */
  grid: {
    trimMode: 'strict' as TrimMode,
    recursive: false,
    maxDepth: 0,
    maxElements: 25,
    minElementSize: 50,
  },
  /** 灵感图配置 */
  inspiration: {
    trimMode: 'normal' as TrimMode,
    recursive: true,
    maxDepth: 2,
    maxElements: 25,
    minElementSize: 100,
  },
};

/**
 * 根据 trimMode 获取 trimBorders 参数
 */
export function getTrimParams(trimMode: TrimMode): { borderRatio: number; maxTrimRatio: number } | null {
  switch (trimMode) {
    case 'strict':
      // 整行/整列 100% 白色才裁剪
      return { borderRatio: 1.0, maxTrimRatio: 0.05 };
    case 'normal':
      // 95% 白色就裁剪
      return { borderRatio: 0.95, maxTrimRatio: 0.05 };
    case 'none':
      return null;
  }
}

/**
 * 对单个元素应用去白边处理
 */
export async function trimElementBorders(
  element: SplitImageElement,
  trimMode: TrimMode
): Promise<SplitImageElement> {
  const params = getTrimParams(trimMode);
  
  if (!params) {
    // 不裁剪，直接返回
    return element;
  }
  
  // 加载图片获取像素数据
  const img = await loadImage(element.imageData);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  if (!ctx) {
    return element;
  }
  
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  // 计算裁剪边界
  const borders = trimBorders(imageData, params.borderRatio, params.maxTrimRatio);
  
  // 计算裁剪后的尺寸
  const trimmedWidth = borders.right - borders.left + 1;
  const trimmedHeight = borders.bottom - borders.top + 1;
  
  // 如果没有需要裁剪的，直接返回
  if (trimmedWidth >= element.width && trimmedHeight >= element.height) {
    return element;
  }
  
  // 创建裁剪后的图片
  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = trimmedWidth;
  trimmedCanvas.height = trimmedHeight;
  const trimmedCtx = trimmedCanvas.getContext('2d');
  
  if (!trimmedCtx) {
    return element;
  }
  
  trimmedCtx.drawImage(
    canvas,
    borders.left, borders.top, trimmedWidth, trimmedHeight,
    0, 0, trimmedWidth, trimmedHeight
  );
  
  return {
    ...element,
    imageData: trimmedCanvas.toDataURL('image/jpeg', 0.92),
    width: trimmedWidth,
    height: trimmedHeight,
    sourceX: element.sourceX + borders.left,
    sourceY: element.sourceY + borders.top,
  };
}

/**
 * 批量处理元素的去白边
 */
export async function trimElementsBorders(
  elements: SplitImageElement[],
  trimMode: TrimMode
): Promise<SplitImageElement[]> {
  if (trimMode === 'none') {
    return elements;
  }
  
  const results: SplitImageElement[] = [];
  for (const element of elements) {
    const trimmed = await trimElementBorders(element, trimMode);
    results.push(trimmed);
  }
  return results;
}

/**
 * 检测像素是否为白色/浅色
 */
export function isLightPixel(r: number, g: number, b: number, threshold = 240): boolean {
  return r >= threshold && g >= threshold && b >= threshold;
}

/**
 * 检测像素是否为透明
 */
export function isTransparentPixel(a: number, threshold = 50): boolean {
  return a < threshold;
}

/**
 * 检测图片是否有透明度
 */
export function hasTransparency(imageData: ImageData): boolean {
  const { data } = imageData;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) {
      return true;
    }
  }
  return false;
}

/**
 * 合并相邻的分割线位置
 */
export function mergeSplitLines(lines: number[], minGap = 10): number[] {
  if (lines.length === 0) return [];

  const sorted = [...lines].sort((a, b) => a - b);
  const merged: number[] = [];
  let groupStart = sorted[0];
  let groupEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - groupEnd <= minGap) {
      groupEnd = sorted[i];
    } else {
      merged.push(Math.round((groupStart + groupEnd) / 2));
      groupStart = sorted[i];
      groupEnd = sorted[i];
    }
  }
  merged.push(Math.round((groupStart + groupEnd) / 2));

  return merged;
}

/**
 * 验证分割线宽度
 */
export function validateSplitLineWidth(lines: number[], minWidth = 3): number[] {
  if (lines.length === 0) return [];

  const validated: number[] = [];
  let consecutiveCount = 1;
  let lastLine = lines[0];

  for (let i = 1; i < lines.length; i++) {
    if (lines[i] - lastLine <= 1) {
      consecutiveCount++;
    } else {
      if (consecutiveCount >= minWidth) {
        validated.push(Math.round((lastLine + lines[i - 1]) / 2));
      }
      consecutiveCount = 1;
    }
    lastLine = lines[i];
  }

  if (consecutiveCount >= minWidth) {
    validated.push(Math.round((lines[lines.length - consecutiveCount] + lines[lines.length - 1]) / 2));
  }

  return validated;
}

/**
 * 计算网格布局位置
 */
export function calculateGridLayout(
  elements: SplitImageElement[],
  targetWidth: number,
  gap: number
): Array<{ x: number; y: number }> {
  if (elements.length === 0) return [];

  const positions: Array<{ x: number; y: number }> = [];
  let currentX = 0;
  let currentY = 0;
  let rowHeight = 0;

  for (const element of elements) {
    if (currentX + element.width > targetWidth && currentX > 0) {
      currentX = 0;
      currentY += rowHeight + gap;
      rowHeight = 0;
    }

    positions.push({ x: currentX, y: currentY });
    currentX += element.width + gap;
    rowHeight = Math.max(rowHeight, element.height);
  }

  return positions;
}
