/**
 * 智能图片分割器
 *
 * 检测图片中的白色/浅色分割线，自动将图片拆分成多个独立图片
 */

import { PlaitBoard, Point } from '@plait/core';
import { DrawTransforms } from '@plait/draw';
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
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
 * 支持两种格式：
 * 1. 网格分割线格式（白色分割线）
 * 2. 照片墙格式（灰色背景 + 白边框照片）
 *
 * @param imageUrl - 图片 URL
 * @returns 是否包含分割线
 */
export async function hasSplitLines(imageUrl: string): Promise<boolean> {
  try {
    // 1. 先检测网格分割线
    const { detection } = await detectGridLinesInternal(imageUrl);
    if (detection.rows > 1 || detection.cols > 1) {
      return true;
    }

    // 2. 检测照片墙格式（灰色背景 + 白边框）
    const isPhotoWall = await detectPhotoWallFormat(imageUrl);
    return isPhotoWall;
  } catch (error) {
    console.warn('[ImageSplitter] Failed to detect split lines:', error);
    return false;
  }
}

/**
 * 快速检测图片是否为照片墙格式
 * 特征：灰色背景占比较大，存在多个白色边框区域
 */
async function detectPhotoWallFormat(imageUrl: string): Promise<boolean> {
  try {
    // 动态导入照片墙检测器
    const { detectPhotoWallRegions } = await import('./photo-wall-splitter');
    const result = await detectPhotoWallRegions(imageUrl, {
      minRegionSize: 3000, // 降低阈值以快速检测
      minRegionRatio: 0.005,
    });

    // 如果检测到 2 个以上的区域，认为是照片墙
    return result.count >= 2;
  } catch (error) {
    console.warn('[ImageSplitter] Failed to detect photo wall format:', error);
    return false;
  }
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
  const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });
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

      // 检测并裁剪边框（白边和灰边）
      const borders = trimBorders(regionData);

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
 * 源图片的位置信息
 */
export interface SourceImageRect {
  /** X 坐标 */
  x: number;
  /** Y 坐标 */
  y: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
}

/**
 * 智能拆分图片并插入到画板
 * 支持两种格式：
 * 1. 网格分割线格式（白色分割线）
 * 2. 照片墙格式（灰色背景 + 白边框照片）
 *
 * @param board - 画板实例
 * @param imageUrl - 图片 URL
 * @param sourceRect - 源图片的位置信息（用于计算插入位置）
 * @param gap - 图片间距（默认 20）
 */
export async function splitAndInsertImages(
  board: PlaitBoard,
  imageUrl: string,
  sourceRect?: SourceImageRect,
  gap: number = 20
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    console.log('[ImageSplitter] Starting smart split...');

    // 1. 先尝试检测网格分割线
    const detection = await detectGridLines(imageUrl);
    console.log('[ImageSplitter] Grid detection result:', detection);

    let elements: SplitImageElement[] = [];
    let cols = 1;

    if (detection.rows > 1 || detection.cols > 1) {
      // 网格分割线格式
      console.log('[ImageSplitter] Using grid split mode');
      elements = await splitImageByLines(imageUrl, detection);
      cols = detection.cols;
    } else {
      // 2. 尝试照片墙格式
      console.log('[ImageSplitter] Grid not detected, trying photo wall mode...');
      const isPhotoWall = await detectPhotoWallFormat(imageUrl);

      if (isPhotoWall) {
        console.log('[ImageSplitter] Using photo wall split mode');
        const { splitPhotoWall } = await import('./photo-wall-splitter');
        const photoWallElements = await splitPhotoWall(imageUrl);

        // 转换为 SplitImageElement 格式
        elements = photoWallElements.map((el, index) => ({
          imageData: el.imageData,
          index,
          width: el.width,
          height: el.height,
          sourceX: 0,
          sourceY: 0,
        }));

        // 照片墙使用自适应列数
        cols = Math.ceil(Math.sqrt(elements.length));
      }
    }

    if (elements.length === 0) {
      return {
        success: false,
        count: 0,
        error: '未检测到可拆分的区域，请确保图片包含分割线或照片墙格式',
      };
    }

    console.log(`[ImageSplitter] Split into ${elements.length} images`);

    // 3. 计算插入位置（在源图片下方，左对齐）
    let baseX: number;
    let baseY: number;

    if (sourceRect) {
      // 有源图片信息：在源图片正下方插入，左对齐
      baseX = sourceRect.x;
      baseY = sourceRect.y + sourceRect.height + gap;
    } else {
      // 兜底：在画布左上角
      baseX = 100;
      baseY = 100;
    }

    // 4. 按网格布局插入图片
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
