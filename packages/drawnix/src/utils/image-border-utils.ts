/**
 * 图片边框处理工具
 *
 * 提供共享的边框检测和裁剪功能，供宫格图和照片墙拆图复用
 */

/**
 * 边框检测结果
 */
export interface BorderTrimResult {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * 检测像素是否为边框色（白色或灰色）
 */
export function isBorderColor(
  r: number,
  g: number,
  b: number,
  options: {
    whiteThreshold?: number;
    grayMinValue?: number;
    grayMaxValue?: number;
    maxColorDiff?: number;
  } = {}
): boolean {
  const {
    whiteThreshold = 240,
    grayMinValue = 160,
    grayMaxValue = 240,
    maxColorDiff = 20,
  } = options;

  // 检查是否为白色（高亮度）
  if (r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold) {
    return true;
  }

  // 检查是否为灰色（R、G、B 接近且在一定范围内）
  const maxVal = Math.max(r, g, b);
  const minVal = Math.min(r, g, b);
  const colorDiff = maxVal - minVal;
  const grayValue = (r + g + b) / 3;

  // 灰色：颜色差异小，灰度值在一定范围
  if (colorDiff <= maxColorDiff && grayValue >= grayMinValue && grayValue <= grayMaxValue) {
    return true;
  }

  return false;
}

/**
 * 检测像素是否为背景色（灰色）
 */
export function isBackgroundPixel(
  r: number,
  g: number,
  b: number,
  options: {
    minGray?: number;
    maxGray?: number;
    maxColorDiff?: number;
  } = {}
): boolean {
  const { minGray = 180, maxGray = 230, maxColorDiff = 15 } = options;

  // 检查是否为灰色（R、G、B 接近）
  const maxVal = Math.max(r, g, b);
  const minVal = Math.min(r, g, b);
  const colorDiff = maxVal - minVal;

  if (colorDiff > maxColorDiff) {
    return false;
  }

  // 检查灰度值范围
  const grayValue = (r + g + b) / 3;
  return grayValue >= minGray && grayValue <= maxGray;
}

/**
 * 检测像素是否为白色边框
 */
export function isWhiteBorderPixel(
  r: number,
  g: number,
  b: number,
  threshold: number = 245
): boolean {
  return r >= threshold && g >= threshold && b >= threshold;
}

/**
 * 裁剪图片的白边和灰边
 * 从四个方向向内扫描，找到第一个非边框行/列
 *
 * @param imageData - Canvas ImageData
 * @param borderRatio - 判定为边框行/列的边框色占比阈值（默认 0.9）
 */
export function trimBorders(
  imageData: ImageData,
  borderRatio: number = 0.9
): BorderTrimResult {
  const { width, height, data } = imageData;

  // 检测一行是否为边框行
  const isRowBorder = (y: number): boolean => {
    let borderCount = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (isBorderColor(data[idx], data[idx + 1], data[idx + 2])) {
        borderCount++;
      }
    }
    return borderCount / width > borderRatio;
  };

  // 检测一列是否为边框列
  const isColBorder = (x: number): boolean => {
    let borderCount = 0;
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      if (isBorderColor(data[idx], data[idx + 1], data[idx + 2])) {
        borderCount++;
      }
    }
    return borderCount / height > borderRatio;
  };

  // 从顶部向下扫描
  let top = 0;
  while (top < height - 1 && isRowBorder(top)) {
    top++;
  }

  // 从底部向上扫描
  let bottom = height - 1;
  while (bottom > top && isRowBorder(bottom)) {
    bottom--;
  }

  // 从左边向右扫描
  let left = 0;
  while (left < width - 1 && isColBorder(left)) {
    left++;
  }

  // 从右边向左扫描
  let right = width - 1;
  while (right > left && isColBorder(right)) {
    right--;
  }

  return { top, right, bottom, left };
}

/**
 * 从 Canvas 裁剪边框并返回新的 Canvas
 *
 * @param sourceCanvas - 原始 Canvas
 * @param minSize - 裁剪后最小尺寸（默认 10）
 * @returns 裁剪后的 Canvas，如果裁剪后太小则返回 null
 */
export function trimCanvasBorders(
  sourceCanvas: HTMLCanvasElement,
  minSize: number = 10
): HTMLCanvasElement | null {
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const borders = trimBorders(imageData);

  // 计算裁剪后的尺寸
  const trimmedWidth = borders.right - borders.left + 1;
  const trimmedHeight = borders.bottom - borders.top + 1;

  // 确保裁剪后有有效内容
  if (trimmedWidth <= minSize || trimmedHeight <= minSize) {
    return null;
  }

  // 创建裁剪后的 Canvas
  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = trimmedWidth;
  trimmedCanvas.height = trimmedHeight;

  const trimmedCtx = trimmedCanvas.getContext('2d');
  if (!trimmedCtx) return null;

  trimmedCtx.drawImage(
    sourceCanvas,
    borders.left,
    borders.top,
    trimmedWidth,
    trimmedHeight,
    0,
    0,
    trimmedWidth,
    trimmedHeight
  );

  return trimmedCanvas;
}

/**
 * 加载图片
 */
export async function loadImage(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(new Error(`Failed to load image: ${error}`));
    img.src = imageUrl;
  });
}

/**
 * 从图片 URL 创建 Canvas
 */
export async function createCanvasFromImage(
  imageUrl: string,
  options?: { willReadFrequently?: boolean }
): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: HTMLImageElement }> {
  const img = await loadImage(imageUrl);
  const { naturalWidth: width, naturalHeight: height } = img;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: options?.willReadFrequently ?? true });
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.drawImage(img, 0, 0);

  return { canvas, ctx, img };
}

/**
 * 从图片区域创建裁剪后的 Canvas（去除边框）
 *
 * @param img - 源图片
 * @param region - 区域坐标
 * @returns 裁剪后的 Canvas 和尺寸信息，如果裁剪后太小则返回 null
 */
export function extractAndTrimRegion(
  img: HTMLImageElement,
  region: { x: number; y: number; width: number; height: number }
): { canvas: HTMLCanvasElement; width: number; height: number } | null {
  // 创建区域 Canvas
  const regionCanvas = document.createElement('canvas');
  regionCanvas.width = region.width;
  regionCanvas.height = region.height;

  const regionCtx = regionCanvas.getContext('2d', { willReadFrequently: true });
  if (!regionCtx) return null;

  regionCtx.drawImage(
    img,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height
  );

  // 裁剪边框
  const trimmedCanvas = trimCanvasBorders(regionCanvas);
  if (!trimmedCanvas) return null;

  return {
    canvas: trimmedCanvas,
    width: trimmedCanvas.width,
    height: trimmedCanvas.height,
  };
}
