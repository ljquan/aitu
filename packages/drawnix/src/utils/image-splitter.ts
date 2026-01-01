/**
 * 智能图片分割器
 *
 * 检测图片中的白色/浅色分割线，自动将图片拆分成多个独立图片
 */

import { PlaitBoard, Point } from '@plait/core';
import { DrawTransforms } from '@plait/draw';
import { getInsertionPointBelowBottommostElement } from './selection-utils';

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
}

/**
 * 检测结果
 */
export interface GridDetectionResult {
  /** 检测到的行数 */
  rows: number;
  /** 检测到的列数 */
  cols: number;
  /** 行分割线位置（Y 坐标） */
  rowLines: number[];
  /** 列分割线位置（X 坐标） */
  colLines: number[];
}

/**
 * 加载图片
 */
async function loadImage(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(new Error(`Failed to load image: ${error}`));
    img.src = imageUrl;
  });
}

/**
 * 检测像素是否为白色/浅色（分割线颜色）
 */
function isLightPixel(r: number, g: number, b: number, threshold: number = 240): boolean {
  // 检查是否接近白色
  return r >= threshold && g >= threshold && b >= threshold;
}

/**
 * 检测一行像素是否为分割线（大部分为白色）
 */
function isHorizontalSplitLine(
  imageData: ImageData,
  y: number,
  minWhiteRatio: number = 0.85
): boolean {
  const { width, data } = imageData;
  let whiteCount = 0;

  for (let x = 0; x < width; x++) {
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    if (isLightPixel(r, g, b)) {
      whiteCount++;
    }
  }

  return whiteCount / width >= minWhiteRatio;
}

/**
 * 检测一列像素是否为分割线
 */
function isVerticalSplitLine(
  imageData: ImageData,
  x: number,
  minWhiteRatio: number = 0.85
): boolean {
  const { width, height, data } = imageData;
  let whiteCount = 0;

  for (let y = 0; y < height; y++) {
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    if (isLightPixel(r, g, b)) {
      whiteCount++;
    }
  }

  return whiteCount / height >= minWhiteRatio;
}

/**
 * 合并相邻的分割线位置
 */
function mergeSplitLines(lines: number[], minGap: number = 10): number[] {
  if (lines.length === 0) return [];

  const sorted = [...lines].sort((a, b) => a - b);
  const merged: number[] = [];
  let groupStart = sorted[0];
  let groupEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - groupEnd <= minGap) {
      // 继续当前组
      groupEnd = sorted[i];
    } else {
      // 保存当前组的中点
      merged.push(Math.floor((groupStart + groupEnd) / 2));
      groupStart = sorted[i];
      groupEnd = sorted[i];
    }
  }

  // 保存最后一组
  merged.push(Math.floor((groupStart + groupEnd) / 2));

  return merged;
}

/**
 * 内部检测函数，返回图片数据和检测结果
 */
async function detectGridLinesInternal(imageUrl: string): Promise<{
  detection: GridDetectionResult;
  img: HTMLImageElement;
  imageData: ImageData;
  canvas: HTMLCanvasElement;
}> {
  const img = await loadImage(imageUrl);
  const { naturalWidth: width, naturalHeight: height } = img;

  // 创建 Canvas 获取像素数据
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);

  // 检测水平分割线
  const horizontalLines: number[] = [];
  // 跳过边缘区域（前后 5%）
  const marginY = Math.floor(height * 0.05);
  for (let y = marginY; y < height - marginY; y++) {
    if (isHorizontalSplitLine(imageData, y)) {
      horizontalLines.push(y);
    }
  }

  // 检测垂直分割线
  const verticalLines: number[] = [];
  const marginX = Math.floor(width * 0.05);
  for (let x = marginX; x < width - marginX; x++) {
    if (isVerticalSplitLine(imageData, x)) {
      verticalLines.push(x);
    }
  }

  // 合并相邻的分割线
  const mergedHorizontal = mergeSplitLines(horizontalLines, Math.floor(height * 0.02));
  const mergedVertical = mergeSplitLines(verticalLines, Math.floor(width * 0.02));

  return {
    detection: {
      rows: mergedHorizontal.length + 1,
      cols: mergedVertical.length + 1,
      rowLines: mergedHorizontal,
      colLines: mergedVertical,
    },
    img,
    imageData,
    canvas,
  };
}

/**
 * 智能检测图片中的网格分割线
 */
export async function detectGridLines(imageUrl: string): Promise<GridDetectionResult> {
  const { detection } = await detectGridLinesInternal(imageUrl);
  console.log('[ImageSplitter] Detected horizontal lines:', detection.rowLines);
  console.log('[ImageSplitter] Detected vertical lines:', detection.colLines);
  return detection;
}

/**
 * 快速检测图片是否包含分割线（用于判断是否显示拆图按钮）
 *
 * @param imageUrl - 图片 URL
 * @returns 是否包含分割线
 */
export async function hasSplitLines(imageUrl: string): Promise<boolean> {
  try {
    const { detection } = await detectGridLinesInternal(imageUrl);
    // 至少有一条水平或垂直分割线才认为可以拆分
    return detection.rows > 1 || detection.cols > 1;
  } catch (error) {
    console.warn('[ImageSplitter] Failed to detect split lines:', error);
    return false;
  }
}

/**
 * 检测图片区域的白边并返回裁剪后的边界
 * 从四个方向向内扫描，找到第一个非白色像素行/列
 */
function detectAndTrimWhiteBorders(
  imageData: ImageData,
  threshold: number = 245
): { top: number; right: number; bottom: number; left: number } {
  const { width, height, data } = imageData;

  // 检测一行是否全是白色/浅色
  const isRowLight = (y: number): boolean => {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (r < threshold || g < threshold || b < threshold) {
        return false;
      }
    }
    return true;
  };

  // 检测一列是否全是白色/浅色
  const isColLight = (x: number): boolean => {
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (r < threshold || g < threshold || b < threshold) {
        return false;
      }
    }
    return true;
  };

  // 从顶部向下扫描
  let top = 0;
  while (top < height && isRowLight(top)) {
    top++;
  }

  // 从底部向上扫描
  let bottom = height - 1;
  while (bottom > top && isRowLight(bottom)) {
    bottom--;
  }

  // 从左边向右扫描
  let left = 0;
  while (left < width && isColLight(left)) {
    left++;
  }

  // 从右边向左扫描
  let right = width - 1;
  while (right > left && isColLight(right)) {
    right--;
  }

  return { top, right, bottom, left };
}

/**
 * 根据检测到的分割线分割图片
 */
export async function splitImageByLines(
  imageUrl: string,
  detection: GridDetectionResult
): Promise<SplitImageElement[]> {
  const img = await loadImage(imageUrl);
  const { naturalWidth: width, naturalHeight: height } = img;

  // 构建分割边界
  const rowBounds = [0, ...detection.rowLines, height];
  const colBounds = [0, ...detection.colLines, width];

  const elements: SplitImageElement[] = [];
  let index = 0;

  // 创建完整图片的 Canvas 用于获取像素数据
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = width;
  fullCanvas.height = height;
  const fullCtx = fullCanvas.getContext('2d');
  if (!fullCtx) return elements;
  fullCtx.drawImage(img, 0, 0);

  for (let row = 0; row < rowBounds.length - 1; row++) {
    for (let col = 0; col < colBounds.length - 1; col++) {
      const x1 = colBounds[col];
      const x2 = colBounds[col + 1];
      const y1 = rowBounds[row];
      const y2 = rowBounds[row + 1];

      // 初步裁剪：在分割线位置两侧各裁剪一些像素
      const splitLinePadding = 8;
      let sx = x1 + (col > 0 ? splitLinePadding : 0);
      let sy = y1 + (row > 0 ? splitLinePadding : 0);
      let sw = x2 - x1 - (col > 0 ? splitLinePadding : 0) - (col < colBounds.length - 2 ? splitLinePadding : 0);
      let sh = y2 - y1 - (row > 0 ? splitLinePadding : 0) - (row < rowBounds.length - 2 ? splitLinePadding : 0);

      if (sw <= 0 || sh <= 0) continue;

      // 获取这个区域的像素数据
      const regionData = fullCtx.getImageData(sx, sy, sw, sh);

      // 检测并裁剪白边
      const borders = detectAndTrimWhiteBorders(regionData);

      // 计算最终裁剪区域
      const finalSx = sx + borders.left;
      const finalSy = sy + borders.top;
      const finalSw = borders.right - borders.left + 1;
      const finalSh = borders.bottom - borders.top + 1;

      // 确保有有效内容
      if (finalSw <= 10 || finalSh <= 10) continue;

      // 创建最终裁剪 Canvas
      const canvas = document.createElement('canvas');
      canvas.width = finalSw;
      canvas.height = finalSh;

      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      ctx.drawImage(img, finalSx, finalSy, finalSw, finalSh, 0, 0, finalSw, finalSh);

      elements.push({
        imageData: canvas.toDataURL('image/png', 0.92),
        index: index++,
        width: finalSw,
        height: finalSh,
        sourceX: finalSx,
        sourceY: finalSy,
      });
    }
  }

  return elements;
}

/**
 * 智能拆分图片并插入到画板
 *
 * @param board - 画板实例
 * @param imageUrl - 图片 URL
 * @param startPoint - 起始位置（可选）
 * @param gap - 图片间距（默认 20）
 */
export async function splitAndInsertImages(
  board: PlaitBoard,
  imageUrl: string,
  startPoint?: Point,
  gap: number = 20
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    console.log('[ImageSplitter] Starting smart split...');

    // 1. 检测分割线
    const detection = await detectGridLines(imageUrl);
    console.log('[ImageSplitter] Detection result:', detection);

    // 如果没有检测到分割线，返回错误
    if (detection.rows <= 1 && detection.cols <= 1) {
      return {
        success: false,
        count: 0,
        error: '未检测到分割线，请确保图片包含白色分割线',
      };
    }

    // 2. 分割图片
    const elements = await splitImageByLines(imageUrl, detection);
    console.log(`[ImageSplitter] Split into ${elements.length} images`);

    if (elements.length === 0) {
      return {
        success: false,
        count: 0,
        error: '分割失败，未能生成图片',
      };
    }

    // 3. 计算插入位置
    let baseX = startPoint?.[0] ?? 100;
    let baseY = startPoint?.[1];

    if (baseY === undefined) {
      const bottomPoint = getInsertionPointBelowBottommostElement(board, 800);
      baseY = bottomPoint?.[1] ?? 100;
      baseX = bottomPoint?.[0] ?? baseX;
    }

    // 4. 按网格布局插入图片
    const cols = detection.cols;
    let currentX = baseX;
    let currentY = baseY;
    let rowMaxHeight = 0;
    let colIndex = 0;

    for (const element of elements) {
      // 插入图片
      const imageItem = {
        url: element.imageData,
        width: element.width,
        height: element.height,
      };

      DrawTransforms.insertImage(board, imageItem, [currentX, currentY] as Point);

      // 更新位置
      rowMaxHeight = Math.max(rowMaxHeight, element.height);
      colIndex++;

      if (colIndex >= cols) {
        // 换行
        currentX = baseX;
        currentY += rowMaxHeight + gap;
        rowMaxHeight = 0;
        colIndex = 0;
      } else {
        currentX += element.width + gap;
      }
    }

    console.log('[ImageSplitter] Successfully inserted all images');

    return {
      success: true,
      count: elements.length,
    };
  } catch (error: any) {
    console.error('[ImageSplitter] Split failed:', error);
    return {
      success: false,
      count: 0,
      error: error.message || '拆分图片失败',
    };
  }
}
