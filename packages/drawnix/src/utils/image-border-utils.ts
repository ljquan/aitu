/**
 * 图片边框处理工具
 *
 * 提供共享的边框检测和裁剪功能，供宫格图和灵感图拆图复用
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
 * 检测像素是否为边框色（白色、灰色或透明/黑色）
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
    alpha?: number;  // alpha 通道值
  } = {}
): boolean {
  const {
    whiteThreshold = 230,  // 降低阈值，更容易检测白边
    grayMinValue = 150,    // 降低阈值，检测更多灰色
    grayMaxValue = 255,    // 扩展到纯白
    maxColorDiff = 25,     // 稍微放宽颜色差异
    alpha = 255,           // 默认不透明
  } = options;

  // 检查是否为透明像素（PNG 透明背景）
  if (alpha < 128) {
    return true;
  }

  // 检查是否为黑色或接近黑色（PNG 透明背景渲染后可能是黑色）
  if (r <= 10 && g <= 10 && b <= 10) {
    return true;
  }

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
 * 检测像素是否为背景色（灰色或白色）
 * 用于灵感图分割时识别图片之间的间隔区域
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
  // 扩展 maxGray 到 255 以支持白色/浅灰色背景
  const { minGray = 180, maxGray = 255, maxColorDiff = 15 } = options;

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
 * @param borderRatio - 判定为边框行/列的边框色占比阈值（默认 0.5）
 * @param maxTrimRatio - 每个方向最大裁剪比例（默认 0.15，防止裁掉过多内容）
 */
export function trimBorders(
  imageData: ImageData,
  borderRatio: number = 0.5,
  maxTrimRatio: number = 0.15
): BorderTrimResult {
  const { width, height, data } = imageData;

  // 计算每个方向的最大裁剪像素数
  const maxTrimTop = Math.floor(height * maxTrimRatio);
  const maxTrimBottom = Math.floor(height * maxTrimRatio);
  const maxTrimLeft = Math.floor(width * maxTrimRatio);
  const maxTrimRight = Math.floor(width * maxTrimRatio);

  // 检测一行是否为边框行
  const isRowBorder = (y: number): boolean => {
    let borderCount = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (isBorderColor(data[idx], data[idx + 1], data[idx + 2], { alpha })) {
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
      const alpha = data[idx + 3];
      if (isBorderColor(data[idx], data[idx + 1], data[idx + 2], { alpha })) {
        borderCount++;
      }
    }
    return borderCount / height > borderRatio;
  };

  // 从顶部向下扫描（限制最大裁剪量）
  let top = 0;
  while (top < maxTrimTop && top < height - 1 && isRowBorder(top)) {
    top++;
  }

  // 从底部向上扫描（限制最大裁剪量）
  let bottom = height - 1;
  while (height - 1 - bottom < maxTrimBottom && bottom > top && isRowBorder(bottom)) {
    bottom--;
  }

  // 从左边向右扫描（限制最大裁剪量）
  let left = 0;
  while (left < maxTrimLeft && left < width - 1 && isColBorder(left)) {
    left++;
  }

  // 从右边向左扫描（限制最大裁剪量）
  let right = width - 1;
  while (width - 1 - right < maxTrimRight && right > left && isColBorder(right)) {
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

  const borders = trimBorders(imageData, 0.5);

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
 * 独立的去白边方法
 * 从图片 URL 加载图片，去除四边白边后返回新的 data URL
 *
 * @param imageUrl - 图片 URL 或 data URL
 * @param options - 配置选项
 * @returns 去除白边后的 data URL，如果失败返回原 URL
 */
export async function removeWhiteBorder(
  imageUrl: string,
  options: {
    borderRatio?: number;  // 边框判定阈值（默认 0.3，更激进）
  } = {}
): Promise<string> {
  const { borderRatio = 0.3 } = options;

  try {
    const img = await loadImage(imageUrl);
    const { naturalWidth: width, naturalHeight: height } = img;

    // 创建 Canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return imageUrl;

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);

    const borders = trimBorders(imageData, borderRatio);

    // 计算裁剪后的尺寸
    const trimmedWidth = borders.right - borders.left + 1;
    const trimmedHeight = borders.bottom - borders.top + 1;

    // 如果没有裁剪（尺寸相同），直接返回原图
    if (trimmedWidth === width && trimmedHeight === height) {
      return imageUrl;
    }

    // 创建裁剪后的 Canvas
    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = trimmedWidth;
    trimmedCanvas.height = trimmedHeight;
    const trimmedCtx = trimmedCanvas.getContext('2d');
    if (!trimmedCtx) return imageUrl;

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

    return trimmedCanvas.toDataURL('image/jpeg', 0.92);
  } catch (error) {
    console.error('[removeWhiteBorder] Error:', error);
    return imageUrl;
  }
}

/**
 * 加载图片
 * 对于外部图片，设置 crossOrigin 以支持 Canvas 操作
 * 如果 CORS 失败，会提供友好的错误提示
 */
export async function loadImage(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    // 检查是否为外部 URL
    const isExternalUrl = imageUrl.startsWith('http') && !imageUrl.startsWith(location.origin);
    
    // 对于需要 Canvas 操作的图片，必须设置 crossOrigin
    img.crossOrigin = 'anonymous';
    
    img.onload = () => resolve(img);
    img.onerror = () => {
      // 提供更友好的错误信息
      if (isExternalUrl) {
        reject(new Error(
          `无法加载外部图片，可能是跨域 (CORS) 限制。请先下载图片到本地后再操作。`
        ));
      } else {
        reject(new Error(`图片加载失败，请检查图片是否有效`));
      }
    };
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

/**
 * 去除 Canvas 四周的白边和透明边（返回详细信息）
 * 用于需要知道裁剪偏移量的场景（如合并图片后精确定位）
 *
 * @param canvas - 原始 Canvas
 * @param options - 配置选项
 * @returns 裁剪结果，包含裁剪后的 Canvas 和偏移信息
 */
export function trimCanvasWhiteAndTransparentBorderWithInfo(
  canvas: HTMLCanvasElement,
  options: {
    /** 白色阈值，RGB 都大于此值视为白色（默认 240） */
    whiteThreshold?: number;
    /** 透明度阈值，alpha 小于此值视为透明（默认 10） */
    alphaThreshold?: number;
    /** 裁剪后最小尺寸（默认 10） */
    minSize?: number;
  } = {}
): {
  canvas: HTMLCanvasElement;
  left: number;
  top: number;
  trimmedWidth: number;
  trimmedHeight: number;
  wasTrimmed: boolean;
} {
  const {
    whiteThreshold = 240,
    alphaThreshold = 10,
    minSize = 10,
  } = options;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { canvas, left: 0, top: 0, trimmedWidth: canvas.width, trimmedHeight: canvas.height, wasTrimmed: false };
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;

  // 检测像素是否为边框色（透明或白色/浅灰色）
  const isBorderPixel = (idx: number): boolean => {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const alpha = data[idx + 3];

    // 透明像素
    if (alpha < alphaThreshold) return true;

    // 白色或浅灰色
    if (r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold) return true;

    return false;
  };

  // 检测一行是否为边框行
  const isRowBorder = (y: number): boolean => {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (!isBorderPixel(idx)) return false;
    }
    return true;
  };

  // 检测一列是否为边框列
  const isColBorder = (x: number): boolean => {
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      if (!isBorderPixel(idx)) return false;
    }
    return true;
  };

  // 从四个方向扫描
  let top = 0;
  while (top < height && isRowBorder(top)) top++;

  let bottom = height - 1;
  while (bottom > top && isRowBorder(bottom)) bottom--;

  let left = 0;
  while (left < width && isColBorder(left)) left++;

  let right = width - 1;
  while (right > left && isColBorder(right)) right--;

  // 计算裁剪后的尺寸
  const trimmedWidth = right - left + 1;
  const trimmedHeight = bottom - top + 1;

  // 如果没有需要裁剪的（尺寸相同），返回原 Canvas
  if (trimmedWidth === width && trimmedHeight === height) {
    return { canvas, left: 0, top: 0, trimmedWidth: width, trimmedHeight: height, wasTrimmed: false };
  }

  // 确保裁剪后有有效内容
  if (trimmedWidth <= minSize || trimmedHeight <= minSize) {
    return { canvas, left: 0, top: 0, trimmedWidth: canvas.width, trimmedHeight: canvas.height, wasTrimmed: false };
  }

  // 创建裁剪后的 Canvas
  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = trimmedWidth;
  trimmedCanvas.height = trimmedHeight;
  const trimmedCtx = trimmedCanvas.getContext('2d');

  if (!trimmedCtx) {
    return { canvas, left: 0, top: 0, trimmedWidth: canvas.width, trimmedHeight: canvas.height, wasTrimmed: false };
  }

  trimmedCtx.drawImage(
    canvas,
    left, top, trimmedWidth, trimmedHeight,
    0, 0, trimmedWidth, trimmedHeight
  );

  return { canvas: trimmedCanvas, left, top, trimmedWidth, trimmedHeight, wasTrimmed: true };
}

/**
 * 去除 Canvas 四周的白边和透明边
 * 用于合并图片、生成预览图等场景
 *
 * @param canvas - 原始 Canvas
 * @param options - 配置选项
 * @returns 裁剪后的 Canvas，如果无需裁剪或裁剪后太小则返回原 Canvas
 */
export function trimCanvasWhiteAndTransparentBorder(
  canvas: HTMLCanvasElement,
  options: {
    /** 白色阈值，RGB 都大于此值视为白色（默认 240） */
    whiteThreshold?: number;
    /** 透明度阈值，alpha 小于此值视为透明（默认 10） */
    alphaThreshold?: number;
    /** 裁剪后最小尺寸（默认 10） */
    minSize?: number;
  } = {}
): HTMLCanvasElement {
  return trimCanvasWhiteAndTransparentBorderWithInfo(canvas, options).canvas;
}

/**
 * 去除图片 URL 四周的白边和透明边
 * 用于合并图片、生成预览图等场景
 *
 * @param imageUrl - 图片 URL 或 data URL
 * @param options - 配置选项
 * @returns 去除白边后的 data URL，如果失败返回原 URL
 */
export async function trimImageWhiteAndTransparentBorder(
  imageUrl: string,
  options: {
    /** 白色阈值，RGB 都大于此值视为白色（默认 240） */
    whiteThreshold?: number;
    /** 透明度阈值，alpha 小于此值视为透明（默认 10） */
    alphaThreshold?: number;
    /** 输出格式（默认 'image/jpeg'） */
    outputFormat?: 'image/jpeg' | 'image/png';
    /** 输出质量（默认 0.92） */
    outputQuality?: number;
  } = {}
): Promise<string> {
  const {
    outputFormat = 'image/jpeg',
    outputQuality = 0.92,
    ...trimOptions
  } = options;

  try {
    const img = await loadImage(imageUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) return imageUrl;

    ctx.drawImage(img, 0, 0);

    const trimmedCanvas = trimCanvasWhiteAndTransparentBorder(canvas, trimOptions);

    // 如果是同一个 Canvas（没有裁剪），返回原 URL
    if (trimmedCanvas === canvas) {
      return imageUrl;
    }

    return trimmedCanvas.toDataURL(outputFormat, outputQuality);
  } catch (error) {
    console.error('[trimImageWhiteAndTransparentBorder] Error:', error);
    return imageUrl;
  }
}
