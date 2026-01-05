/**
 * 智能图片分割器
 *
 * 检测图片中的白色/浅色分割线，自动将图片拆分成多个独立图片
 */

import { PlaitBoard, Point, getRectangleByElements, PlaitElement } from '@plait/core';
import { DrawTransforms } from '@plait/draw';
import { loadImage, trimBorders } from './image-border-utils';
import { scrollToPointIfNeeded } from './selection-utils';

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
  /** 白边偏移量，用于精确分割 */
  borderOffset?: { left: number; top: number; right: number; bottom: number };
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
 * 根据图片比例筛选可能的宫格配置
 * 假设子图是正方形，根据图片宽高比计算合理的 rows/cols 组合
 *
 * @param width - 图片宽度
 * @param height - 图片高度
 * @returns 按可能性排序的宫格配置列表
 */
function getPossibleGridConfigs(width: number, height: number): Array<{ rows: number; cols: number; score: number }> {
  // 所有候选配置
  const allConfigs = [
    { rows: 4, cols: 4 },
    { rows: 4, cols: 3 },
    { rows: 4, cols: 2 },
    { rows: 2, cols: 2 },
    { rows: 2, cols: 3 },
    { rows: 2, cols: 4 },
    { rows: 3, cols: 2 },
    { rows: 3, cols: 3 },
    { rows: 3, cols: 4 },
    { rows: 5, cols: 5 },
  ];

  // 计算每个配置的得分（子图越接近正方形得分越高）
  const scoredConfigs = allConfigs.map(config => {
    // 子图的宽高比
    const cellWidth = width / config.cols;
    const cellHeight = height / config.rows;
    const cellAspectRatio = cellWidth / cellHeight;

    // 计算与正方形的偏离程度（1.0 表示完美正方形）
    // 偏离越小得分越高
    const deviation = Math.abs(cellAspectRatio - 1.0);
    const score = 1 / (1 + deviation * 10); // 转换为 0-1 的得分

    return { ...config, score, cellAspectRatio };
  });

  // 按得分降序排序，只保留子图接近正方形的配置（偏离不超过 20%）
  const validConfigs = scoredConfigs
    .filter(c => c.cellAspectRatio >= 0.8 && c.cellAspectRatio <= 1.25);

  return validConfigs;
}

/**
 * 直接使用图片数据检测标准宫格
 * 尝试常见的宫格配置（2x2, 3x3, 4x4, 2x3, 3x2 等），验证等间距分割线是否存在
 *
 * @param imageData - 图片像素数据
 * @param width - 图片宽度
 * @param height - 图片高度
 * @returns 检测到的宫格配置，如果不是标准宫格返回 null
 */
function detectStandardGridFromImage(
  imageData: ImageData,
  width: number,
  height: number
): { rows: number; cols: number } | null {

  // 根据图片比例获取可能的宫格配置（子图接近正方形的优先）
  const gridConfigs = getPossibleGridConfigs(width, height);

  if (gridConfigs.length === 0) {
    return null;
  }

  for (const config of gridConfigs) {
    const result = verifyGridConfig(imageData, width, height, config.rows, config.cols);
    if (result) {
      return { rows: config.rows, cols: config.cols };
    }
  }

  return null;
}

/**
 * 验证指定的宫格配置是否有效
 * 检查等间距位置是否存在白色分割线
 */
function verifyGridConfig(
  imageData: ImageData,
  width: number,
  height: number,
  rows: number,
  cols: number
): boolean {
  const cellWidth = width / cols;
  const cellHeight = height / rows;

  // 分割线检测的容差范围（像素）
  const tolerance = 10;
  // 分割线需要的最小白色像素比例（降低阈值以适应实际情况）
  const minWhiteRatio = 0.70;


  // 验证垂直分割线（列之间）
  for (let col = 1; col < cols; col++) {
    const expectedX = Math.round(col * cellWidth);
    let found = false;
    let maxRatio = 0;

    // 在容差范围内搜索分割线
    for (let x = expectedX - tolerance; x <= expectedX + tolerance; x++) {
      if (x < 0 || x >= width) continue;
      const ratio = getColWhiteRatio(imageData, x);
      maxRatio = Math.max(maxRatio, ratio);
      if (ratio >= minWhiteRatio) {
        found = true;
        break;
      }
    }

    if (!found) return false;
  }

  // 验证水平分割线（行之间）
  for (let row = 1; row < rows; row++) {
    const expectedY = Math.round(row * cellHeight);
    let found = false;
    let maxRatio = 0;

    // 在容差范围内搜索分割线
    for (let y = expectedY - tolerance; y <= expectedY + tolerance; y++) {
      if (y < 0 || y >= height) continue;
      const ratio = getRowWhiteRatio(imageData, y);
      maxRatio = Math.max(maxRatio, ratio);
      if (ratio >= minWhiteRatio) {
        found = true;
        break;
      }
    }

    if (!found) return false;
  }

  return true;
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
 * 注意：调用此函数前应该已经完成去白边处理
 */
async function detectGridLinesInternal(imageUrl: string): Promise<{
  detection: GridDetectionResult;
  img: HTMLImageElement;
  imageData: ImageData;
  canvas: HTMLCanvasElement;
}> {
  const img = await loadImage(imageUrl);
  const { naturalWidth: width, naturalHeight: height } = img;

  // 创建 Canvas
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

  // 优先使用图片像素数据检测标准宫格
  // 直接验证预期位置是否存在白色分割线，避免"切人头"问题
  const standardGrid = detectStandardGridFromImage(imageData, width, height);

  if (standardGrid) {

    // 计算标准化的分割线位置
    const cellWidth = width / standardGrid.cols;
    const cellHeight = height / standardGrid.rows;
    const standardRowLines: number[] = [];
    const standardColLines: number[] = [];

    for (let i = 1; i < standardGrid.rows; i++) {
      standardRowLines.push(Math.round(i * cellHeight));
    }
    for (let i = 1; i < standardGrid.cols; i++) {
      standardColLines.push(Math.round(i * cellWidth));
    }

    return {
      detection: {
        rows: standardGrid.rows,
        cols: standardGrid.cols,
        rowLines: standardRowLines,
        colLines: standardColLines,
      },
      img,
      imageData,
      canvas,
    };
  }

  // 不符合宫格规律，使用原始检测结果
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
    // 0. 先去除白边
    const { trimmedImageUrl } = await trimImageWhiteBorders(imageUrl);

    // 1. 检测网格分割线（使用去白边后的图片）
    const { detection } = await detectGridLinesInternal(trimmedImageUrl);
    if (detection.rows > 1 || detection.cols > 1) {
      return true;
    }

    // 2. 检测灵感图格式（灰色背景 + 白边框）
    const isPhotoWall = await detectPhotoWallFormat(trimmedImageUrl);
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
 * 检测是否为标准宫格布局（等间距分割）
 * 用于决定分割时使用精确模式还是普通模式
 */
function isUniformGridLayout(detection: GridDetectionResult, width: number, height: number): boolean {
  const { rowLines, colLines } = detection;

  // 必须同时有行和列的分割线才算标准宫格
  if (rowLines.length === 0 || colLines.length === 0) {
    return false;
  }

  // 检查行分割线是否等间距
  const expectedRowGap = height / (rowLines.length + 1);
  for (let i = 0; i < rowLines.length; i++) {
    const expectedPos = expectedRowGap * (i + 1);
    if (Math.abs(rowLines[i] - expectedPos) > expectedRowGap * 0.15) {
      return false;
    }
  }

  // 检查列分割线是否等间距
  const expectedColGap = width / (colLines.length + 1);
  for (let i = 0; i < colLines.length; i++) {
    const expectedPos = expectedColGap * (i + 1);
    if (Math.abs(colLines[i] - expectedPos) > expectedColGap * 0.15) {
      return false;
    }
  }

  return true;
}

/**
 * 严格去白边：只裁剪100%纯白的边缘行/列
 * 用于宫格图分割后的子图处理，避免误裁人物内容
 *
 * @param ctx - Canvas 2D 上下文
 * @param width - 图片宽度
 * @param height - 图片高度
 * @param threshold - 白色阈值（默认 250，非常严格）
 * @returns 裁剪后的边界
 */
function getStrictWhiteBorders(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  threshold: number = 250
): { top: number; right: number; bottom: number; left: number } {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // 检查像素是否为纯白
  const isWhitePixel = (idx: number): boolean => {
    return data[idx] >= threshold && data[idx + 1] >= threshold && data[idx + 2] >= threshold;
  };

  // 检查整行是否100%为白色
  const isRowAllWhite = (y: number): boolean => {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (!isWhitePixel(idx)) return false;
    }
    return true;
  };

  // 检查整列是否100%为白色
  const isColAllWhite = (x: number): boolean => {
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      if (!isWhitePixel(idx)) return false;
    }
    return true;
  };

  // 从顶部向下扫描
  let top = 0;
  while (top < height && isRowAllWhite(top)) {
    top++;
  }

  // 从底部向上扫描
  let bottom = height - 1;
  while (bottom > top && isRowAllWhite(bottom)) {
    bottom--;
  }

  // 从左边向右扫描
  let left = 0;
  while (left < width && isColAllWhite(left)) {
    left++;
  }

  // 从右边向左扫描
  let right = width - 1;
  while (right > left && isColAllWhite(right)) {
    right--;
  }

  return { top, right, bottom, left };
}

/**
 * 使用精确等分方式分割标准宫格图
 * 分割后严格去除100%纯白的边缘行/列
 *
 * @param img - 图片元素
 * @param rows - 行数
 * @param cols - 列数
 */
async function splitUniformGrid(
  img: HTMLImageElement,
  rows: number,
  cols: number
): Promise<SplitImageElement[]> {
  const width = img.naturalWidth;
  const height = img.naturalHeight;

  // 精确计算每个格子的尺寸
  const cellWidth = Math.floor(width / cols);
  const cellHeight = Math.floor(height / rows);

  const elements: SplitImageElement[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;

      // 精确计算裁剪区域
      const sx = col * cellWidth;
      const sy = row * cellHeight;

      // 创建临时 Canvas 用于裁剪
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = cellWidth;
      tempCanvas.height = cellHeight;

      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
      if (!tempCtx) continue;

      // 先裁剪到临时 Canvas
      tempCtx.drawImage(img, sx, sy, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight);

      // 获取严格的白边边界
      const borders = getStrictWhiteBorders(tempCtx, cellWidth, cellHeight);

      // 计算去白边后的尺寸
      const trimmedWidth = borders.right - borders.left + 1;
      const trimmedHeight = borders.bottom - borders.top + 1;

      // 如果有白边需要裁剪，创建新的 Canvas
      if (trimmedWidth < cellWidth || trimmedHeight < cellHeight) {
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = trimmedWidth;
        finalCanvas.height = trimmedHeight;

        const finalCtx = finalCanvas.getContext('2d');
        if (!finalCtx) continue;

        finalCtx.drawImage(
          tempCanvas,
          borders.left, borders.top, trimmedWidth, trimmedHeight,
          0, 0, trimmedWidth, trimmedHeight
        );

        elements.push({
          imageData: finalCanvas.toDataURL('image/jpeg', 0.92),
          index,
          width: trimmedWidth,
          height: trimmedHeight,
          sourceX: sx + borders.left,
          sourceY: sy + borders.top,
        });
      } else {
        // 没有白边，直接使用
        elements.push({
          imageData: tempCanvas.toDataURL('image/jpeg', 0.92),
          index,
          width: cellWidth,
          height: cellHeight,
          sourceX: sx,
          sourceY: sy,
        });
      }
    }
  }

  return elements;
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

  // 检测是否为标准宫格布局
  const isUniformGrid = isUniformGridLayout(detection, width, height);

  // 对于标准宫格，使用精确等分方式（类似 gridSplitter.split）
  // 注意：调用前已完成去白边处理
  if (isUniformGrid) {
    return splitUniformGrid(img, detection.rows, detection.cols);
  }

  // 非标准布局：使用检测到的分割线位置进行分割
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

      // 非标准布局使用较大的 padding 以确保裁剪干净
      const splitLinePadding = 8;

      let sx = x1 + (col > 0 ? splitLinePadding : 0);
      let sy = y1 + (row > 0 ? splitLinePadding : 0);
      let sw = x2 - x1 - (col > 0 ? splitLinePadding : 0) - (col < colBounds.length - 2 ? splitLinePadding : 0);
      let sh = y2 - y1 - (row > 0 ? splitLinePadding : 0) - (row < rowBounds.length - 2 ? splitLinePadding : 0);

      if (sw <= 0 || sh <= 0) continue;

      // 获取这个区域的像素数据
      const regionData = fullCtx.getImageData(sx, sy, sw, sh);

      // 检测并裁剪边框（白边和灰边）
      const borders = trimBorders(regionData, 0.5, 0.15);

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
 * 检测像素是否为白色/浅色（只检测白色，不检测黑色）
 * 专门用于宫格图去白边，避免误裁黑色内容
 */
function isWhitePixel(r: number, g: number, b: number, threshold: number = 235): boolean {
  return r >= threshold && g >= threshold && b >= threshold;
}

/**
 * 只裁剪白色边框（不裁剪黑色）
 * 专门用于宫格图拆分前的预处理
 *
 * 算法：从边缘向内扫描，检测中间区域（避开圆角）是否为白色
 */
function trimWhiteBordersOnly(
  imageData: ImageData,
  borderRatio: number = 0.7,
  maxTrimRatio: number = 0.15
): { top: number; right: number; bottom: number; left: number } {
  const { width, height, data } = imageData;

  // 计算每个方向的最大裁剪像素数
  const maxTrimTop = Math.floor(height * maxTrimRatio);
  const maxTrimBottom = Math.floor(height * maxTrimRatio);
  const maxTrimLeft = Math.floor(width * maxTrimRatio);
  const maxTrimRight = Math.floor(width * maxTrimRatio);

  // 圆角区域大小（检测时跳过边缘的圆角部分）
  const cornerSize = Math.min(width, height) * 0.15;

  // 检测一行是否为白色边框行（只检测中间部分，避开圆角）
  const isRowWhite = (y: number): boolean => {
    let whiteCount = 0;
    const startX = Math.floor(cornerSize);
    const endX = width - Math.floor(cornerSize);
    const checkWidth = endX - startX;
    if (checkWidth <= 0) return false;

    for (let x = startX; x < endX; x++) {
      const idx = (y * width + x) * 4;
      if (isWhitePixel(data[idx], data[idx + 1], data[idx + 2])) {
        whiteCount++;
      }
    }
    return whiteCount / checkWidth > borderRatio;
  };

  // 检测一列是否为白色边框列（只检测中间部分，避开圆角）
  const isColWhite = (x: number): boolean => {
    let whiteCount = 0;
    const startY = Math.floor(cornerSize);
    const endY = height - Math.floor(cornerSize);
    const checkHeight = endY - startY;
    if (checkHeight <= 0) return false;

    for (let y = startY; y < endY; y++) {
      const idx = (y * width + x) * 4;
      if (isWhitePixel(data[idx], data[idx + 1], data[idx + 2])) {
        whiteCount++;
      }
    }
    return whiteCount / checkHeight > borderRatio;
  };

  // 从顶部向下扫描
  let top = 0;
  while (top < maxTrimTop && top < height - 1 && isRowWhite(top)) {
    top++;
  }

  // 从底部向上扫描
  let bottom = height - 1;
  while (height - 1 - bottom < maxTrimBottom && bottom > top && isRowWhite(bottom)) {
    bottom--;
  }

  // 从左边向右扫描
  let left = 0;
  while (left < maxTrimLeft && left < width - 1 && isColWhite(left)) {
    left++;
  }

  // 从右边向左扫描
  let right = width - 1;
  while (width - 1 - right < maxTrimRight && right > left && isColWhite(right)) {
    right--;
  }

  return { top, right, bottom, left };
}

/**
 * 去除图片四周白边
 * 作为所有拆图操作的前置步骤
 * 注意：只去除白色边框，不去除黑色内容
 *
 * @param imageUrl - 图片 URL
 * @returns 去除白边后的图片 data URL 和边框信息
 */
async function trimImageWhiteBorders(imageUrl: string): Promise<{
  trimmedImageUrl: string;
  borderInfo: {
    original: { width: number; height: number };
    trimmed: { width: number; height: number };
    borders: { left: number; top: number; right: number; bottom: number };
    hasBorders: boolean;
  };
}> {
  const img = await loadImage(imageUrl);
  const originalWidth = img.naturalWidth;
  const originalHeight = img.naturalHeight;

  // 创建 Canvas 获取图片数据
  const canvas = document.createElement('canvas');
  canvas.width = originalWidth;
  canvas.height = originalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      trimmedImageUrl: imageUrl,
      borderInfo: {
        original: { width: originalWidth, height: originalHeight },
        trimmed: { width: originalWidth, height: originalHeight },
        borders: { left: 0, top: 0, right: 0, bottom: 0 },
        hasBorders: false,
      },
    };
  }

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, originalWidth, originalHeight);

  // 只检测白色边框（不检测黑色），使用较高阈值
  const borders = trimWhiteBordersOnly(imageData, 0.8, 0.1);
  const trimmedWidth = borders.right - borders.left + 1;
  const trimmedHeight = borders.bottom - borders.top + 1;

  const borderLeft = borders.left;
  const borderTop = borders.top;
  const borderRight = originalWidth - borders.right - 1;
  const borderBottom = originalHeight - borders.bottom - 1;

  // 计算有白边的边数（至少 5 像素才算有白边）
  const MIN_BORDER_WIDTH = 5;
  let borderCount = 0;
  if (borderLeft > MIN_BORDER_WIDTH) borderCount++;
  if (borderTop > MIN_BORDER_WIDTH) borderCount++;
  if (borderRight > MIN_BORDER_WIDTH) borderCount++;
  if (borderBottom > MIN_BORDER_WIDTH) borderCount++;

  // 保护逻辑：至少 2 条边有白边才执行裁剪
  // 避免只有单边误判（如浅色头发被误判为白边）导致内容被切掉
  const hasBorders = borderCount >= 2;

  console.log('[trimImageWhiteBorders] Border detection:', {
    borderLeft, borderTop, borderRight, borderBottom,
    borderCount,
    hasBorders,
  });

  if (!hasBorders) {
    // 没有明显白边，返回原图
    return {
      trimmedImageUrl: imageUrl,
      borderInfo: {
        original: { width: originalWidth, height: originalHeight },
        trimmed: { width: originalWidth, height: originalHeight },
        borders: { left: 0, top: 0, right: 0, bottom: 0 },
        hasBorders: false,
      },
    };
  }

  // 创建裁剪后的 Canvas
  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = trimmedWidth;
  trimmedCanvas.height = trimmedHeight;
  const trimmedCtx = trimmedCanvas.getContext('2d');
  if (!trimmedCtx) {
    return {
      trimmedImageUrl: imageUrl,
      borderInfo: {
        original: { width: originalWidth, height: originalHeight },
        trimmed: { width: originalWidth, height: originalHeight },
        borders: { left: 0, top: 0, right: 0, bottom: 0 },
        hasBorders: false,
      },
    };
  }

  trimmedCtx.drawImage(
    canvas,
    borders.left,
    borders.top,
    trimmedWidth,
    trimmedHeight,
    0,
    0,
    trimmedWidth,
    trimmedHeight
  );

  return {
    trimmedImageUrl: trimmedCanvas.toDataURL('image/jpeg', 0.95),
    borderInfo: {
      original: { width: originalWidth, height: originalHeight },
      trimmed: { width: trimmedWidth, height: trimmedHeight },
      borders: { left: borderLeft, top: borderTop, right: borderRight, bottom: borderBottom },
      hasBorders: true,
    },
  };
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
 */
/** 递归拆分的最小尺寸限制 */
const MIN_SPLIT_SIZE = 100;

export async function recursiveSplitElement(
  element: SplitImageElement,
  depth: number = 0,
  maxDepth: number = 2,
  options?: { skipTrim?: boolean }
): Promise<SplitImageElement[]> {
  // 防止无限递归
  if (depth >= maxDepth) {
    return [element];
  }

  // 尺寸太小，不再拆分
  if (element.width < MIN_SPLIT_SIZE || element.height < MIN_SPLIT_SIZE) {
    return [element];
  }

  // 根据 skipTrim 决定是否去白边
  // - 原图（depth=0 且未指定 skipTrim）：需要去白边
  // - 宫格子图（skipTrim=true）：不需要去白边，避免裁掉人物内容
  const skipTrim = options?.skipTrim ?? false;

  let workingImageUrl = element.imageData;
  let workingWidth = element.width;
  let workingHeight = element.height;
  let hasTrimmed = false;

  if (!skipTrim) {
    // 前置步骤：先去除白边
    const { trimmedImageUrl, borderInfo } = await trimImageWhiteBorders(element.imageData);
    workingImageUrl = trimmedImageUrl;
    workingWidth = borderInfo.trimmed.width;
    workingHeight = borderInfo.trimmed.height;
    hasTrimmed = borderInfo.hasBorders;

    // 去白边后尺寸太小，不再拆分
    if (workingWidth < MIN_SPLIT_SIZE || workingHeight < MIN_SPLIT_SIZE) {
      if (hasTrimmed) {
        return [{
          ...element,
          imageData: workingImageUrl,
          width: workingWidth,
          height: workingHeight,
        }];
      }
      return [element];
    }
  }

  // 使用工作图片检测分割线
  const detection = await detectGridLines(workingImageUrl);

  // 如果没有检测到分割线，返回当前元素（使用去白边后的图片）
  if (detection.rows <= 1 && detection.cols <= 1) {
    if (hasTrimmed) {
      return [{
        ...element,
        imageData: workingImageUrl,
        width: workingWidth,
        height: workingHeight,
      }];
    }
    return [element];
  }

  // 检测到标准宫格，直接拆分不再递归
  const isStandardGrid = detection.rows > 1 && detection.cols > 1;
  const subElements = await splitImageByLines(workingImageUrl, detection);

  // 如果拆分结果和原来一样（只有 1 个），返回当前元素
  if (subElements.length <= 1) {
    if (hasTrimmed) {
      return [{
        ...element,
        imageData: workingImageUrl,
        width: workingWidth,
        height: workingHeight,
      }];
    }
    return [element];
  }

  // 标准宫格：直接返回拆分结果，不再递归
  // 子图不需要再去白边，避免裁掉人物内容
  if (isStandardGrid) {
    return subElements;
  }

  // 非标准布局：继续递归处理每个子元素
  // 非标准布局的子元素仍然需要去白边（可能包含嵌套的白边图片）
  const allResults: SplitImageElement[] = [];
  for (const subEl of subElements) {
    // 子元素太小，直接添加
    if (subEl.width < MIN_SPLIT_SIZE || subEl.height < MIN_SPLIT_SIZE) {
      allResults.push(subEl);
      continue;
    }
    const recursiveResults = await recursiveSplitElement(subEl, depth + 1, maxDepth);
    allResults.push(...recursiveResults);
  }

  return allResults;
}

/**
 * 获取画布最底部元素下方的插入位置
 * 用于在没有指定 startPoint 和 sourceRect 时计算默认插入位置
 */
function getBottommostInsertionPoint(board: PlaitBoard): { x: number; y: number } {
  if (!board.children || board.children.length === 0) {
    return { x: 100, y: 100 };
  }

  try {
    let bottommostElement: PlaitElement | null = null;
    let maxBottomY = -Infinity;

    for (const element of board.children) {
      try {
        const rect = getRectangleByElements(board, [element as PlaitElement], false);
        const bottomY = rect.y + rect.height;

        if (bottomY > maxBottomY) {
          maxBottomY = bottomY;
          bottommostElement = element as PlaitElement;
        }
      } catch {
        // 忽略无法计算矩形的元素
      }
    }

    if (!bottommostElement) {
      return { x: 100, y: 100 };
    }

    const bottommostRect = getRectangleByElements(board, [bottommostElement], false);
    // 在最底部元素的左侧开始，下方 50px
    return {
      x: bottommostRect.x,
      y: bottommostRect.y + bottommostRect.height + 50,
    };
  } catch {
    return { x: 100, y: 100 };
  }
}

/**
 * 拆分并插入选项
 */
export interface SplitAndInsertOptions {
  /** 源图片的位置信息（用于计算插入位置和缩放） */
  sourceRect?: SourceImageRect;
  /** 自定义起始插入位置（优先于 sourceRect） */
  startPoint?: Point;
  /** 是否滚动到插入位置（默认 true） */
  scrollToResult?: boolean;
}

/**
 * 智能拆分图片并插入到画板
 * 支持两种格式：
 * 1. 网格分割线格式（白色分割线）- 支持递归拆分
 * 2. 灵感图格式（灰色背景 + 白边框图片）- 支持递归拆分
 *
 * @param board - 画板实例
 * @param imageUrl - 图片 URL
 * @param options - 拆分和插入选项
 */
export async function splitAndInsertImages(
  board: PlaitBoard,
  imageUrl: string,
  options?: SplitAndInsertOptions
): Promise<{ success: boolean; count: number; error?: string }> {
  const { sourceRect, startPoint, scrollToResult = true } = options || {};
  try {
    let elements: SplitImageElement[] = [];
    // 标记是否为标准宫格（用于决定是否跳过子图去白边）
    let isStandardGrid = false;
    // 用于计算缩放的图片尺寸
    let workingImageWidth: number;
    let workingImageHeight: number;

    // 策略：无论什么格式，都先去除外围白边
    // 外围白边会干扰网格检测，必须先清理
    // 注意：这里去除的是整张图片的外围白边，不是内部分割线
    const { trimmedImageUrl, borderInfo } = await trimImageWhiteBorders(imageUrl);
    workingImageWidth = borderInfo.trimmed.width;
    workingImageHeight = borderInfo.trimmed.height;

    console.log('[splitAndInsertImages] Trimmed outer border:', {
      original: borderInfo.original,
      trimmed: borderInfo.trimmed,
      hasBorders: borderInfo.hasBorders,
    });

    // 使用去除外围白边后的图片检测网格
    const detection = await detectGridLines(trimmedImageUrl);

    if (detection.rows > 1 || detection.cols > 1) {
      // 网格分割线格式 - 使用去除外围白边后的图片
      const initialElements = await splitImageByLines(trimmedImageUrl, detection);

      // 判断是否为标准宫格（行列数都大于1，说明是规则宫格）
      isStandardGrid = detection.rows > 1 && detection.cols > 1;

      console.log('[splitAndInsertImages] Grid detected:', {
        rows: detection.rows,
        cols: detection.cols,
        isStandardGrid,
        elementsCount: initialElements.length,
      });

      if (isStandardGrid) {
        // 标准宫格：直接使用拆分结果，不需要递归
        // 子图不再额外去白边，避免裁掉白色背景人物图的边缘
        elements = initialElements;
      } else {
        // 非标准宫格（可能是灵感图或不规则布局）：递归拆分，但限制总数
        const MAX_TOTAL_ELEMENTS = 25;
        const MIN_ELEMENT_SIZE = 100; // 最小 100x100 像素

        for (const el of initialElements) {
          // 检查是否已达到最大数量
          if (elements.length >= MAX_TOTAL_ELEMENTS) {
            break;
          }

          // 检查元素是否太小，不需要继续拆分
          if (el.width < MIN_ELEMENT_SIZE || el.height < MIN_ELEMENT_SIZE) {
            elements.push(el);
            continue;
          }

          const recursiveResults = await recursiveSplitElement(el, 0, 2);
          // 限制添加的数量
          const remainingSlots = MAX_TOTAL_ELEMENTS - elements.length;
          elements.push(...recursiveResults.slice(0, remainingSlots));
        }
      }
    } else {
      // 尝试灵感图格式（已内置递归拆分）- 使用去除白边后的图片
      const isPhotoWall = await detectPhotoWallFormat(trimmedImageUrl);

      if (isPhotoWall) {
        const { splitPhotoWall } = await import('./photo-wall-splitter');
        const inspirationBoardElements = await splitPhotoWall(trimmedImageUrl);

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

    // 2.5 对非标准宫格的子图进行去白边处理
    // 标准宫格使用精确等分，不需要去白边，避免裁掉白色背景人物图的边缘（手、头发等）
    if (!isStandardGrid) {
      const cleanedElements: SplitImageElement[] = [];
      for (const el of elements) {
        const { trimmedImageUrl: elTrimmedUrl, borderInfo: elBorderInfo } = await trimImageWhiteBorders(el.imageData);
        cleanedElements.push({
          ...el,
          imageData: elTrimmedUrl,
          width: elBorderInfo.trimmed.width,
          height: elBorderInfo.trimmed.height,
        });
      }
      elements = cleanedElements;
    }

    // 重新分配 index
    elements = elements.map((el, idx) => ({ ...el, index: idx }));

    // 3. 使用工作图片尺寸计算缩放比例
    // 注意：标准宫格使用原图尺寸，其他格式使用去白边后的尺寸
    // 计算缩放比例（原图显示尺寸 / 工作图片像素尺寸）
    let scale = 1;
    if (sourceRect) {
      scale = Math.min(
        sourceRect.width / workingImageWidth,
        sourceRect.height / workingImageHeight
      );
    }

    // 4. 计算插入位置
    // 优先使用 startPoint，其次使用 sourceRect，最后在画布最底部元素下方
    let baseX: number;
    let baseY: number;

    if (startPoint) {
      // 使用自定义起始位置
      baseX = startPoint[0];
      baseY = startPoint[1];
      console.log('[splitAndInsertImages] Using startPoint:', { baseX, baseY });
    } else if (sourceRect) {
      // 在源图片下方，左对齐
      baseX = sourceRect.x;
      baseY = sourceRect.y + sourceRect.height + 20;
      console.log('[splitAndInsertImages] Using sourceRect:', { sourceRect, baseX, baseY });
    } else {
      // 查找画布最底部元素，在其下方插入
      const bottomPosition = getBottommostInsertionPoint(board);
      baseX = bottomPosition.x;
      baseY = bottomPosition.y;
      console.log('[splitAndInsertImages] Using bottommost position:', { baseX, baseY });
    }

    // 5. 使用网格布局，中心集中避免重叠
    const gap = 20; // 图片间距
    const count = elements.length;
    const cols = Math.ceil(Math.sqrt(count));

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

    // 按网格布局插入
    let firstInsertPoint: Point | undefined;
    let firstElementSize: { width: number; height: number } | undefined;

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

      // 记录第一个插入点用于滚动
      if (!firstInsertPoint) {
        firstInsertPoint = [insertX, insertY] as Point;
        firstElementSize = { width: element.scaledWidth, height: element.scaledHeight };
      }

      const imageItem = {
        url: element.imageData,
        width: element.scaledWidth,
        height: element.scaledHeight,
      };

      DrawTransforms.insertImage(board, imageItem, [insertX, insertY] as Point);
    }

    // 插入完成后滚动到第一个元素的位置
    if (scrollToResult && firstInsertPoint && firstElementSize) {
      const centerPoint: Point = [
        firstInsertPoint[0] + firstElementSize.width / 2,
        firstInsertPoint[1] + firstElementSize.height / 2,
      ];
      requestAnimationFrame(() => {
        scrollToPointIfNeeded(board, centerPoint);
      });
    }

    return {
      success: true,
      count: elements.length,
    };
  } catch (error: any) {
    return {
      success: false,
      count: 0,
      error: error.message || '拆分图片失败',
    };
  }
}
