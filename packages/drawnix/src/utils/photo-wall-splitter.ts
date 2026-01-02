/**
 * 照片墙智能拆图器
 *
 * 专门用于检测和拆分不规则照片墙图片
 * 特点：图片大小不一、位置不规则、有白色边框、灰色/白色背景间隔
 *
 * 算法思路（增强版 - 边缘 Flood Fill）：
 * 1. 计算图像梯度（Sobel 边缘检测）
 * 2. 从四角采样检测背景颜色
 * 3. 从图像边缘开始 Flood Fill，标记"从边缘可达"的背景区域
 *    - 使用梯度作为边界，防止填充进入图片内部
 *    - 即使图片内容有白色，只要不与边缘连通就不会被标记为背景
 * 4. 膨胀操作连接相邻区域
 * 5. 连通区域标记，找到各个图片区域
 * 6. 过滤太小的区域（噪点）
 * 7. 合并重叠区域，提取图片
 *
 * 优化：
 * - 大图片自动降采样检测，避免阻塞主线程
 * - 异步处理，定期 yield 给浏览器
 * - 边缘检测失效时自动回退到颜色匹配算法
 */

import type { ImageElement } from '../types/photo-wall.types';
import {
  loadImage,
  isBackgroundPixel,
  isWhiteBorderPixel,
  removeWhiteBorder,
} from './image-border-utils';

/** 检测时的最大尺寸，超过此尺寸会降采样（降低此值可提升性能） */
const MAX_DETECTION_SIZE = 800;

/** 每处理多少像素后 yield 一次（降低此值可提升 UI 响应性） */
const YIELD_INTERVAL = 100000;

/**
 * 让出主线程，避免阻塞 UI
 */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 检测结果
 */
export interface PhotoWallDetectionResult {
  /** 检测到的图片数量 */
  count: number;
  /** 每个图片的边界矩形 */
  regions: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

/**
 * 计算像素的灰度值
 */
function getGrayValue(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * 计算图像的梯度幅值（用于边缘检测，异步版本）
 * 使用 Sobel 算子
 */
async function computeGradientMagnitude(imageData: ImageData): Promise<Float32Array> {
  const { width, height, data } = imageData;
  const gradient = new Float32Array(width * height);
  let processedPixels = 0;

  // 预计算灰度值以提升性能
  const grayValues = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    grayValues[i] = getGrayValue(data[idx], data[idx + 1], data[idx + 2]);
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      // Sobel 算子 - 使用预计算的灰度值
      // Gx = [-1 0 1; -2 0 2; -1 0 1]
      const gx =
        -grayValues[idx - width - 1] + grayValues[idx - width + 1] +
        -2 * grayValues[idx - 1] + 2 * grayValues[idx + 1] +
        -grayValues[idx + width - 1] + grayValues[idx + width + 1];

      // Gy = [-1 -2 -1; 0 0 0; 1 2 1]
      const gy =
        -grayValues[idx - width - 1] - 2 * grayValues[idx - width] - grayValues[idx - width + 1] +
        grayValues[idx + width - 1] + 2 * grayValues[idx + width] + grayValues[idx + width + 1];

      gradient[idx] = Math.sqrt(gx * gx + gy * gy);

      // 定期 yield 给浏览器
      processedPixels++;
      if (processedPixels % YIELD_INTERVAL === 0) {
        await yieldToMain();
      }
    }
  }

  return gradient;
}

/**
 * 检测背景颜色（从图像四角采样）
 */
function detectBackgroundColor(imageData: ImageData): { r: number; g: number; b: number } {
  const { width, height, data } = imageData;
  const samples: Array<{ r: number; g: number; b: number }> = [];
  const sampleSize = Math.min(20, Math.floor(Math.min(width, height) / 10));

  // 从四角采样
  const corners = [
    { startX: 0, startY: 0 },
    { startX: width - sampleSize, startY: 0 },
    { startX: 0, startY: height - sampleSize },
    { startX: width - sampleSize, startY: height - sampleSize },
  ];

  for (const corner of corners) {
    for (let dy = 0; dy < sampleSize; dy++) {
      for (let dx = 0; dx < sampleSize; dx++) {
        const x = corner.startX + dx;
        const y = corner.startY + dy;
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const idx = (y * width + x) * 4;
          samples.push({
            r: data[idx],
            g: data[idx + 1],
            b: data[idx + 2],
          });
        }
      }
    }
  }

  // 计算平均值
  const avg = samples.reduce(
    (acc, s) => ({ r: acc.r + s.r, g: acc.g + s.g, b: acc.b + s.b }),
    { r: 0, g: 0, b: 0 }
  );
  const count = samples.length;

  return {
    r: Math.round(avg.r / count),
    g: Math.round(avg.g / count),
    b: Math.round(avg.b / count),
  };
}

/**
 * 检查像素是否与背景色相似
 */
function isSimilarToBackground(
  r: number, g: number, b: number,
  bgColor: { r: number; g: number; b: number },
  colorThreshold: number = 30
): boolean {
  const dr = Math.abs(r - bgColor.r);
  const dg = Math.abs(g - bgColor.g);
  const db = Math.abs(b - bgColor.b);
  return dr <= colorThreshold && dg <= colorThreshold && db <= colorThreshold;
}

/**
 * 使用边缘 Flood Fill 创建二值化遮罩（增强版）
 * 从图像边缘开始填充，使用梯度作为边界
 * 背景 = 0，前景（图片区域）= 1
 *
 * 性能优化：
 * - 使用 Uint32Array 存储队列，避免对象创建开销
 * - 使用索引代替 shift()，避免 O(n) 操作
 * - 预先标记已入队像素，避免重复入队
 */
async function createBinaryMaskWithEdgeFloodFill(
  imageData: ImageData,
  gradient: Float32Array,
  bgColor: { r: number; g: number; b: number }
): Promise<Uint8Array> {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);
  const inQueue = new Uint8Array(width * height); // 标记是否已入队

  // 梯度阈值（边缘检测）
  const gradientThreshold = 30;
  // 颜色相似度阈值
  const colorThreshold = 40;

  // 初始化：所有像素默认为前景 (1)
  mask.fill(1);

  // 使用 Uint32Array 存储队列（每个元素 = y * width + x）
  // 预估最大队列大小为图像面积的一半
  const maxQueueSize = Math.ceil((width * height) / 2);
  const queue = new Uint32Array(maxQueueSize);
  let queueHead = 0;
  let queueTail = 0;

  // 入队辅助函数
  const enqueue = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = y * width + x;
    if (inQueue[idx]) return;
    inQueue[idx] = 1;
    queue[queueTail % maxQueueSize] = idx;
    queueTail++;
  };

  // 添加四边的像素到队列
  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  let processedPixels = 0;

  while (queueHead < queueTail) {
    const idx = queue[queueHead % maxQueueSize];
    queueHead++;

    const x = idx % width;
    const y = Math.floor(idx / width);

    const pixelIdx = idx * 4;
    const r = data[pixelIdx];
    const g = data[pixelIdx + 1];
    const b = data[pixelIdx + 2];
    const grad = gradient[idx];

    // 判断是否为背景：
    // 1. 颜色与背景相似
    // 2. 梯度不太大（不是边缘）
    // 3. 或者是纯白/灰色（通用背景色）
    const isBgColor = isSimilarToBackground(r, g, b, bgColor, colorThreshold);
    const isGenericBg = isBackgroundPixel(r, g, b) || isWhiteBorderPixel(r, g, b);
    const isLowGradient = grad < gradientThreshold;

    if ((isBgColor || isGenericBg) && isLowGradient) {
      // 标记为背景
      mask[idx] = 0;

      // 继续扩展到邻居（4-连通）
      enqueue(x + 1, y);
      enqueue(x - 1, y);
      enqueue(x, y + 1);
      enqueue(x, y - 1);
    }

    // 定期 yield 给浏览器
    processedPixels++;
    if (processedPixels % YIELD_INTERVAL === 0) {
      await yieldToMain();
    }
  }

  return mask;
}

/**
 * 创建二值化遮罩（原始颜色匹配版本，作为后备）
 * 背景 = 0，前景（图片区域）= 1
 */
async function createBinaryMaskByColor(imageData: ImageData): Promise<Uint8Array> {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);
  let processedPixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // 背景（灰色）或纯白（边框外围）标记为 0
      if (isBackgroundPixel(r, g, b) || isWhiteBorderPixel(r, g, b)) {
        mask[y * width + x] = 0;
      } else {
        mask[y * width + x] = 1;
      }

      // 定期 yield 给浏览器
      processedPixels++;
      if (processedPixels % YIELD_INTERVAL === 0) {
        await yieldToMain();
      }
    }
  }

  return mask;
}

/**
 * 形态学操作：膨胀（异步版本）
 * 用于连接相邻的前景像素
 */
async function dilate(mask: Uint8Array, width: number, height: number, radius: number = 2): Promise<Uint8Array> {
  const result = new Uint8Array(mask.length);
  let processedPixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hasNeighbor = false;

      // 检查邻域
      for (let dy = -radius; dy <= radius && !hasNeighbor; dy++) {
        for (let dx = -radius; dx <= radius && !hasNeighbor; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            if (mask[ny * width + nx] === 1) {
              hasNeighbor = true;
            }
          }
        }
      }

      result[y * width + x] = hasNeighbor ? 1 : 0;

      // 定期 yield 给浏览器
      processedPixels++;
      if (processedPixels % YIELD_INTERVAL === 0) {
        await yieldToMain();
      }
    }
  }

  return result;
}

/**
 * 连通区域标记（使用 Flood Fill，异步版本）
 * 返回每个像素的标签（0 = 背景，1+ = 不同的连通区域）
 */
async function labelConnectedComponents(
  mask: Uint8Array,
  width: number,
  height: number
): Promise<{ labels: Int32Array; count: number }> {
  const labels = new Int32Array(mask.length);
  let currentLabel = 0;
  let processedPixels = 0;

  const queue: Array<{ x: number; y: number }> = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // 跳过背景和已标记的像素
      if (mask[idx] === 0 || labels[idx] !== 0) {
        continue;
      }

      // 开始新的连通区域
      currentLabel++;
      queue.push({ x, y });

      while (queue.length > 0) {
        const { x: cx, y: cy } = queue.shift()!;
        const cidx = cy * width + cx;

        if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
        if (mask[cidx] === 0 || labels[cidx] !== 0) continue;

        labels[cidx] = currentLabel;

        // 8-连通邻域
        queue.push({ x: cx + 1, y: cy });
        queue.push({ x: cx - 1, y: cy });
        queue.push({ x: cx, y: cy + 1 });
        queue.push({ x: cx, y: cy - 1 });
        queue.push({ x: cx + 1, y: cy + 1 });
        queue.push({ x: cx - 1, y: cy - 1 });
        queue.push({ x: cx + 1, y: cy - 1 });
        queue.push({ x: cx - 1, y: cy + 1 });

        // 定期 yield 给浏览器
        processedPixels++;
        if (processedPixels % YIELD_INTERVAL === 0) {
          await yieldToMain();
        }
      }
    }
  }

  return { labels, count: currentLabel };
}

/**
 * 计算每个连通区域的边界矩形
 */
function computeBoundingBoxes(
  labels: Int32Array,
  width: number,
  height: number,
  count: number
): Array<{ x: number; y: number; width: number; height: number; area: number }> {
  // 初始化边界
  const boxes: Array<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    pixelCount: number;
  }> = [];

  for (let i = 0; i < count; i++) {
    boxes.push({
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
      pixelCount: 0,
    });
  }

  // 遍历标签，更新边界
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labels[y * width + x];
      if (label > 0) {
        const box = boxes[label - 1];
        box.minX = Math.min(box.minX, x);
        box.maxX = Math.max(box.maxX, x);
        box.minY = Math.min(box.minY, y);
        box.maxY = Math.max(box.maxY, y);
        box.pixelCount++;
      }
    }
  }

  // 转换为标准格式
  return boxes
    .map((box) => ({
      x: box.minX,
      y: box.minY,
      width: box.maxX - box.minX + 1,
      height: box.maxY - box.minY + 1,
      area: box.pixelCount,
    }))
    .filter((box) => box.width > 0 && box.height > 0);
}

/**
 * 合并重叠或相邻的矩形
 */
function mergeOverlappingBoxes(
  boxes: Array<{ x: number; y: number; width: number; height: number; area: number }>,
  overlapThreshold: number = 0.3,
  proximityThreshold: number = 20
): Array<{ x: number; y: number; width: number; height: number }> {
  if (boxes.length === 0) return [];

  // 按面积降序排序
  const sorted = [...boxes].sort((a, b) => b.area - a.area);
  const merged: Array<{ x: number; y: number; width: number; height: number }> = [];
  const used = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;

    let box = { ...sorted[i] };
    used.add(i);

    // 尝试合并其他矩形
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < sorted.length; j++) {
        if (used.has(j)) continue;

        const other = sorted[j];

        // 检查是否重叠或相邻
        const overlapX = Math.max(
          0,
          Math.min(box.x + box.width, other.x + other.width) - Math.max(box.x, other.x)
        );
        const overlapY = Math.max(
          0,
          Math.min(box.y + box.height, other.y + other.height) - Math.max(box.y, other.y)
        );
        const overlapArea = overlapX * overlapY;
        const otherArea = other.width * other.height;

        // 检查是否需要合并
        const isOverlapping = overlapArea > otherArea * overlapThreshold;
        const isProximate =
          Math.abs(box.x - other.x - other.width) < proximityThreshold ||
          Math.abs(other.x - box.x - box.width) < proximityThreshold ||
          Math.abs(box.y - other.y - other.height) < proximityThreshold ||
          Math.abs(other.y - box.y - box.height) < proximityThreshold;

        if (isOverlapping || (overlapArea > 0 && isProximate)) {
          // 合并
          const newX = Math.min(box.x, other.x);
          const newY = Math.min(box.y, other.y);
          const newRight = Math.max(box.x + box.width, other.x + other.width);
          const newBottom = Math.max(box.y + box.height, other.y + other.height);

          box = {
            x: newX,
            y: newY,
            width: newRight - newX,
            height: newBottom - newY,
            area: (newRight - newX) * (newBottom - newY),
          };

          used.add(j);
          changed = true;
        }
      }
    }

    merged.push({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    });
  }

  return merged;
}


/**
 * 检测照片墙中的图片区域
 * 对于大图片会自动降采样检测，然后映射回原始坐标
 */
export async function detectPhotoWallRegions(
  imageUrl: string,
  options: {
    minRegionSize?: number; // 最小区域大小（像素）
    minRegionRatio?: number; // 最小区域占比（相对于图片面积）
  } = {}
): Promise<PhotoWallDetectionResult> {
  const { minRegionSize = 5000, minRegionRatio = 0.01 } = options;

  const img = await loadImage(imageUrl);
  const { naturalWidth: originalWidth, naturalHeight: originalHeight } = img;
  const totalArea = originalWidth * originalHeight;

  console.log(`[PhotoWallSplitter] Image size: ${originalWidth}x${originalHeight}`);

  // 计算是否需要降采样
  const maxDimension = Math.max(originalWidth, originalHeight);
  const scale = maxDimension > MAX_DETECTION_SIZE ? MAX_DETECTION_SIZE / maxDimension : 1;
  const width = Math.round(originalWidth * scale);
  const height = Math.round(originalHeight * scale);

  if (scale < 1) {
    console.log(`[PhotoWallSplitter] Downscaling to ${width}x${height} (scale: ${scale.toFixed(2)})`);
  }

  // 创建 Canvas 获取像素数据（可能是降采样后的）
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // 添加灰色边框，确保 Flood Fill 能从边缘正确开始
  const borderSize = Math.max(10, Math.round(Math.min(width, height) * 0.02));
  const paddedWidth = width + borderSize * 2;
  const paddedHeight = height + borderSize * 2;

  const paddedCanvas = document.createElement('canvas');
  paddedCanvas.width = paddedWidth;
  paddedCanvas.height = paddedHeight;
  const paddedCtx = paddedCanvas.getContext('2d', { willReadFrequently: true });
  if (!paddedCtx) {
    throw new Error('Failed to get padded canvas context');
  }

  // 填充灰色背景
  paddedCtx.fillStyle = '#E0E0E0';
  paddedCtx.fillRect(0, 0, paddedWidth, paddedHeight);

  // 绘制原图到中心
  ctx.drawImage(img, 0, 0, width, height);
  paddedCtx.drawImage(canvas, borderSize, borderSize);

  const imageData = paddedCtx.getImageData(0, 0, paddedWidth, paddedHeight);
  console.log(`[PhotoWallSplitter] Added ${borderSize}px gray border, detection size: ${paddedWidth}x${paddedHeight}`);

  await yieldToMain();

  // 1. 计算梯度（边缘检测）
  console.log('[PhotoWallSplitter] Computing gradient...');
  const gradient = await computeGradientMagnitude(imageData);

  await yieldToMain();

  // 2. 检测背景颜色
  const bgColor = detectBackgroundColor(imageData);
  console.log(`[PhotoWallSplitter] Detected background color: RGB(${bgColor.r}, ${bgColor.g}, ${bgColor.b})`);

  // 3. 使用边缘 Flood Fill 创建二值化遮罩
  console.log('[PhotoWallSplitter] Creating binary mask with edge flood fill...');
  let mask = await createBinaryMaskWithEdgeFloodFill(imageData, gradient, bgColor);

  await yieldToMain();

  // 统计前景像素数量，判断是否检测有效
  const foregroundCount = mask.reduce((sum, val) => sum + val, 0);
  const totalPaddedPixels = paddedWidth * paddedHeight;
  const foregroundRatio = foregroundCount / totalPaddedPixels;
  console.log(`[PhotoWallSplitter] Foreground ratio: ${(foregroundRatio * 100).toFixed(1)}%`);

  // 如果前景占比过高（>95%）或过低（<5%），说明边缘检测可能失效，回退到颜色匹配
  if (foregroundRatio > 0.95 || foregroundRatio < 0.05) {
    console.log('[PhotoWallSplitter] Edge flood fill ineffective, falling back to color matching...');
    mask = await createBinaryMaskByColor(imageData);
  }

  await yieldToMain();

  // 4. 膨胀操作，连接相邻区域
  console.log('[PhotoWallSplitter] Dilating mask...');
  mask = await dilate(mask, paddedWidth, paddedHeight, 3);

  await yieldToMain();

  // 5. 连通区域标记
  console.log('[PhotoWallSplitter] Labeling connected components...');
  const { labels, count } = await labelConnectedComponents(mask, paddedWidth, paddedHeight);
  console.log(`[PhotoWallSplitter] Found ${count} raw regions`);

  await yieldToMain();

  // 6. 计算边界矩形
  const rawBoxes = computeBoundingBoxes(labels, paddedWidth, paddedHeight, count);

  // 7. 过滤太小的区域（注意：面积阈值也需要按比例缩放）
  const scaledMinArea = Math.max(minRegionSize * scale * scale, totalArea * scale * scale * minRegionRatio);
  const filteredBoxes = rawBoxes.filter((box) => box.area >= scaledMinArea);
  console.log(`[PhotoWallSplitter] After filtering: ${filteredBoxes.length} regions`);

  // 8. 合并重叠的矩形
  const mergedBoxes = mergeOverlappingBoxes(filteredBoxes);
  console.log(`[PhotoWallSplitter] After merging: ${mergedBoxes.length} regions`);

  // 9. 不再扩展边界（之前会扩展太多白色区域）
  // 后续 splitPhotoWall 会使用 removeWhiteBorder 裁剪白边

  // 10. 将坐标映射回原始尺寸（需要减去边框偏移，添加少量 padding）
  const smallPadding = 2; // 添加 2px padding 确保不会裁掉边缘
  const finalBoxes = mergedBoxes.map((box) => {
    // 先减去边框偏移，添加少量 padding
    const x = Math.max(0, box.x - borderSize - smallPadding);
    const y = Math.max(0, box.y - borderSize - smallPadding);
    // 限制在原图范围内
    const right = Math.min(width, box.x + box.width - borderSize + smallPadding);
    const bottom = Math.min(height, box.y + box.height - borderSize + smallPadding);
    const w = Math.max(0, right - x);
    const h = Math.max(0, bottom - y);

    // 如果有降采样，按比例放大
    if (scale < 1) {
      return {
        x: Math.round(x / scale),
        y: Math.round(y / scale),
        width: Math.round(w / scale),
        height: Math.round(h / scale),
      };
    }
    return { x, y, width: w, height: h };
  }).filter((box) => box.width > 0 && box.height > 0);

  return {
    count: finalBoxes.length,
    regions: finalBoxes,
  };
}

/**
 * 拆分照片墙图片
 */
export async function splitPhotoWall(imageUrl: string): Promise<ImageElement[]> {
  const detection = await detectPhotoWallRegions(imageUrl);

  if (detection.count === 0) {
    console.log('[PhotoWallSplitter] No regions detected');
    return [];
  }

  const img = await loadImage(imageUrl);
  const elements: ImageElement[] = [];

  // 按面积降序排序（大图在前）
  const sortedRegions = [...detection.regions].sort(
    (a, b) => b.width * b.height - a.width * a.height
  );

  for (let i = 0; i < sortedRegions.length; i++) {
    const region = sortedRegions[i];

    // 先提取区域（不裁剪）
    const regionCanvas = document.createElement('canvas');
    regionCanvas.width = region.width;
    regionCanvas.height = region.height;
    const regionCtx = regionCanvas.getContext('2d');
    if (!regionCtx) continue;

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

    // 转换为 data URL
    const rawImageData = regionCanvas.toDataURL('image/png', 0.92);

    // 使用独立的去白边方法
    const trimmedImageData = await removeWhiteBorder(rawImageData, {
      borderRatio: 0.3,  // 更激进的裁剪
    });

    // 获取裁剪后的尺寸
    const trimmedImg = await loadImage(trimmedImageData);
    const trimmedWidth = trimmedImg.naturalWidth;
    const trimmedHeight = trimmedImg.naturalHeight;

    // 过滤太小的图片
    if (trimmedWidth < 50 || trimmedHeight < 50) {
      console.log(`[PhotoWallSplitter] Region ${i} too small after trimming (${trimmedWidth}x${trimmedHeight}), skipping`);
      continue;
    }

    elements.push({
      id: `photo-wall-${Date.now()}-${i}`,
      imageData: trimmedImageData,
      originalIndex: i,
      width: trimmedWidth,
      height: trimmedHeight,
    });

    console.log(`[PhotoWallSplitter] Region ${i}: ${region.width}x${region.height} -> ${trimmedWidth}x${trimmedHeight}`);
  }

  console.log(`[PhotoWallSplitter] Split into ${elements.length} images`);
  return elements;
}
