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
 * 获取一行的白色像素比例
 */
function getRowWhiteRatio(imageData: ImageData, y: number): number {
  const { width, data } = imageData;
  let whiteCount = 0;

  for (let x = 0; x < width; x++) {
    const idx = (y * width + x) * 4;
    if (isLightPixel(data[idx], data[idx + 1], data[idx + 2])) {
      whiteCount++;
    }
  }

  return whiteCount / width;
}

/**
 * 获取一列的白色像素比例
 */
function getColWhiteRatio(imageData: ImageData, x: number): number {
  const { width, height, data } = imageData;
  let whiteCount = 0;

  for (let y = 0; y < height; y++) {
    const idx = (y * width + x) * 4;
    if (isLightPixel(data[idx], data[idx + 1], data[idx + 2])) {
      whiteCount++;
    }
  }

  return whiteCount / height;
}

/**
 * 检测一行像素是否为分割线（大部分为白色）
 */
function isHorizontalSplitLine(
  imageData: ImageData,
  y: number,
  minWhiteRatio: number = 0.90
): boolean {
  return getRowWhiteRatio(imageData, y) >= minWhiteRatio;
}

/**
 * 检测一列像素是否为分割线
 */
function isVerticalSplitLine(
  imageData: ImageData,
  x: number,
  minWhiteRatio: number = 0.90
): boolean {
  return getColWhiteRatio(imageData, x) >= minWhiteRatio;
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
 * 验证分割线是否有足够的宽度（连续多行/列都是白色）
 * @param lines - 检测到的分割线位置
 * @param minWidth - 最小宽度（默认 3 像素）
 * @returns 有效的分割线位置
 */
function validateSplitLineWidth(lines: number[], minWidth: number = 3): number[] {
  if (lines.length === 0) return [];

  const sorted = [...lines].sort((a, b) => a - b);
  const validated: number[] = [];

  let groupStart = sorted[0];
  let groupEnd = sorted[0];

  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] - groupEnd <= 1) {
      groupEnd = sorted[i];
    } else {
      const groupWidth = groupEnd - groupStart + 1;
      if (groupWidth >= minWidth) {
        validated.push(Math.floor((groupStart + groupEnd) / 2));
      }
      if (i < sorted.length) {
        groupStart = sorted[i];
        groupEnd = sorted[i];
      }
    }
  }

  return validated;
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

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);

  // 检测水平分割线，跳过边缘区域（前后 5%）
  const horizontalLines: number[] = [];
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

  // 验证分割线宽度（至少 2 像素宽）并合并相邻分割线
  const validatedHorizontal = validateSplitLineWidth(horizontalLines, 2);
  const validatedVertical = validateSplitLineWidth(verticalLines, 2);
  const mergedHorizontal = mergeSplitLines(validatedHorizontal, Math.floor(height * 0.02));
  const mergedVertical = mergeSplitLines(validatedVertical, Math.floor(width * 0.02));

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
 * 2. 灵感图格式（灰色背景 + 白边框图片）
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

    // 2. 检测灵感图格式（灰色背景 + 白边框）
    const isPhotoWall = await detectPhotoWallFormat(imageUrl);
    return isPhotoWall;
  } catch (error) {
    console.warn('[ImageSplitter] Failed to detect split lines:', error);
    return false;
  }
}

/**
 * 快速检测图片是否为灵感图格式
 * 特征：灰色背景占比较大，存在多个白色边框区域
 */
async function detectPhotoWallFormat(imageUrl: string): Promise<boolean> {
  try {
    // 动态导入灵感图检测器
    const { detectPhotoWallRegions } = await import('./photo-wall-splitter');
    const result = await detectPhotoWallRegions(imageUrl, {
      minRegionSize: 3000, // 降低阈值以快速检测
      minRegionRatio: 0.005,
    });

    // 如果检测到 2 个以上的区域，认为是灵感图
    return result.count >= 2;
  } catch (error) {
    console.warn('[ImageSplitter] Failed to detect inspiration board format:', error);
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
        imageData: canvas.toDataURL('image/jpeg', 0.92),
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
 * 递归拆分单个图片元素
 * 如果元素内还能检测到分割线，继续拆分
 *
 * @exported 供 image-split-service.ts 复用
 */
export async function recursiveSplitElement(
  element: SplitImageElement,
  depth: number = 0,
  maxDepth: number = 3
): Promise<SplitImageElement[]> {
  console.log(`[ImageSplitter] recursiveSplitElement depth=${depth}, element size=${element.width}x${element.height}`);

  // 防止无限递归
  if (depth >= maxDepth) {
    console.log(`[ImageSplitter] Max depth ${maxDepth} reached, stopping recursion`);
    return [element];
  }

  // 检测子元素中的分割线
  const detection = await detectGridLines(element.imageData);
  console.log(`[ImageSplitter] Depth ${depth}: detection result = ${detection.rows}x${detection.cols}, lines: h=${detection.rowLines.length}, v=${detection.colLines.length}`);

  // 如果没有检测到分割线，返回当前元素
  if (detection.rows <= 1 && detection.cols <= 1) {
    console.log(`[ImageSplitter] Depth ${depth}: No split lines found, returning element as-is`);
    return [element];
  }

  console.log(`[ImageSplitter] Depth ${depth}: Found ${detection.rows}x${detection.cols} grid in sub-image`);

  // 有分割线，继续拆分
  const subElements = await splitImageByLines(element.imageData, detection);
  console.log(`[ImageSplitter] Depth ${depth}: splitImageByLines returned ${subElements.length} elements`);

  // 如果拆分结果和原来一样（只有 1 个），返回当前元素
  if (subElements.length <= 1) {
    console.log(`[ImageSplitter] Depth ${depth}: Only ${subElements.length} sub-element, returning original`);
    return [element];
  }

  // 递归处理每个子元素
  const allResults: SplitImageElement[] = [];
  for (let i = 0; i < subElements.length; i++) {
    console.log(`[ImageSplitter] Depth ${depth}: Recursing into sub-element ${i + 1}/${subElements.length}`);
    const recursiveResults = await recursiveSplitElement(subElements[i], depth + 1, maxDepth);
    allResults.push(...recursiveResults);
  }

  console.log(`[ImageSplitter] Depth ${depth}: Returning ${allResults.length} total elements`);
  return allResults;
}

/**
 * 智能拆分图片并插入到画板
 * 支持两种格式：
 * 1. 网格分割线格式（白色分割线）- 支持递归拆分
 * 2. 灵感图格式（灰色背景 + 白边框图片）- 支持递归拆分
 *
 * @param board - 画板实例
 * @param imageUrl - 图片 URL
 * @param sourceRect - 源图片的位置信息（用于计算插入位置）
 */
export async function splitAndInsertImages(
  board: PlaitBoard,
  imageUrl: string,
  sourceRect?: SourceImageRect
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    console.log('[ImageSplitter] Starting smart split...');

    // 1. 先尝试检测网格分割线
    const detection = await detectGridLines(imageUrl);
    console.log('[ImageSplitter] Grid detection result:', detection);

    let elements: SplitImageElement[] = [];

    if (detection.rows > 1 || detection.cols > 1) {
      // 网格分割线格式
      console.log('[ImageSplitter] Using grid split mode');
      const initialElements = await splitImageByLines(imageUrl, detection);

      // 递归拆分每个元素
      for (const el of initialElements) {
        const recursiveResults = await recursiveSplitElement(el, 0, 3);
        elements.push(...recursiveResults);
      }
    } else {
      // 2. 尝试灵感图格式（已内置递归拆分）
      console.log('[ImageSplitter] Grid not detected, trying inspiration board mode...');
      const isPhotoWall = await detectPhotoWallFormat(imageUrl);

      if (isPhotoWall) {
        console.log('[ImageSplitter] Using inspiration board split mode');
        const { splitPhotoWall } = await import('./photo-wall-splitter');
        const inspirationBoardElements = await splitPhotoWall(imageUrl);

        // 转换为 SplitImageElement 格式
        elements = inspirationBoardElements.map((el, index) => ({
          imageData: el.imageData,
          index,
          width: el.width,
          height: el.height,
          sourceX: 0,
          sourceY: 0,
        }));
      }
    }

    if (elements.length === 0) {
      return {
        success: false,
        count: 0,
        error: '未检测到可拆分的区域，请确保图片包含分割线或灵感图格式',
      };
    }

    // 重新分配 index
    elements = elements.map((el, idx) => ({ ...el, index: idx }));

    console.log(`[ImageSplitter] Split into ${elements.length} images (after recursive split)`);

    // 3. 获取原图的实际像素尺寸，计算缩放比例
    const originalImage = await loadImage(imageUrl);
    const originalPixelWidth = originalImage.naturalWidth;
    const originalPixelHeight = originalImage.naturalHeight;

    // 计算缩放比例（原图显示尺寸 / 原图像素尺寸）
    let scale = 1;
    if (sourceRect) {
      scale = Math.min(
        sourceRect.width / originalPixelWidth,
        sourceRect.height / originalPixelHeight
      );
    }

    console.log(`[ImageSplitter] Original: ${originalPixelWidth}x${originalPixelHeight}, Display: ${sourceRect?.width}x${sourceRect?.height}, Scale: ${scale}`);

    // 4. 计算插入位置（在源图片下方，左对齐）
    let baseX: number;
    let baseY: number;

    if (sourceRect) {
      baseX = sourceRect.x;
      baseY = sourceRect.y + sourceRect.height + 20;
    } else {
      baseX = 100;
      baseY = 100;
    }

    // 5. 使用网格布局，中心集中避免重叠
    const gap = 20; // 图片间距
    const count = elements.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    // 计算所有图片缩放后的最大尺寸
    const scaledElements = elements.map((el) => ({
      ...el,
      scaledWidth: el.width * scale,
      scaledHeight: el.height * scale,
    }));

    const maxScaledWidth = Math.max(...scaledElements.map((e) => e.scaledWidth));
    const maxScaledHeight = Math.max(...scaledElements.map((e) => e.scaledHeight));

    // 计算单元格尺寸
    const cellWidth = maxScaledWidth + gap;
    const cellHeight = maxScaledHeight + gap;

    console.log(`[ImageSplitter] Grid layout: ${rows}x${cols}, cell=${cellWidth.toFixed(1)}x${cellHeight.toFixed(1)}, scale=${scale}`);

    // 按网格布局插入
    for (let i = 0; i < scaledElements.length; i++) {
      const element = scaledElements[i];
      const row = Math.floor(i / cols);
      const col = i % cols;

      // 计算单元格位置
      const cellX = baseX + col * cellWidth;
      const cellY = baseY + row * cellHeight;

      // 在单元格内居中
      const insertX = cellX + (cellWidth - element.scaledWidth) / 2;
      const insertY = cellY + (cellHeight - element.scaledHeight) / 2;

      const imageItem = {
        url: element.imageData,
        width: element.scaledWidth,
        height: element.scaledHeight,
      };

      DrawTransforms.insertImage(board, imageItem, [insertX, insertY] as Point);
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
