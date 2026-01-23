/**
 * 灵感图智能拆图器
 *
 * 支持两种布局格式：
 * 1. 紧凑网格布局（新）：等大小图片 + 细白线分割，用于生产图
 * 2. 不规则布局（旧）：不同大小图片 + 灰色背景间隔
 *
 * 检测策略：
 * 1. 优先尝试网格检测（检测横竖白线分割）
 * 2. 如果网格检测失败，回退到边缘 Flood Fill 算法
 *
 * 网格检测算法：
 * 1. 扫描图像查找连续的白色横线和竖线
 * 2. 根据线的位置计算网格结构
 * 3. 直接按网格分割图片
 *
 * 边缘 Flood Fill 算法（用于不规则布局）：
 * 1. 计算图片梯度（Sobel 边缘检测）
 * 2. 从四角采样检测背景颜色
 * 3. 从图片边缘开始 Flood Fill，标记背景区域
 * 4. 连通区域标记，找到各个图片区域
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

/** 白线检测阈值 */
const WHITE_LINE_THRESHOLD = 240;

/** 最小白线长度比例（相对于图片宽/高） */
const MIN_LINE_RATIO = 0.8;

/**
 * 让出主线程，避免阻塞 UI
 */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 网格检测结果
 */
interface GridDetectionResult {
  success: boolean;
  rows?: number;
  cols?: number;
  horizontalLines?: number[];
  verticalLines?: number[];
}

/**
 * 检测图片中的网格结构（基于白色分割线）
 * 用于处理紧凑网格布局的生产图
 */
function detectGridStructure(imageData: ImageData): GridDetectionResult {
  const { width, height, data } = imageData;

  // console.log('[GridDetection] Starting grid detection...');

  // 扫描横向白线（y 位置）
  const horizontalWhiteRows: number[] = [];
  for (let y = 0; y < height; y++) {
    let whiteCount = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (r >= WHITE_LINE_THRESHOLD && g >= WHITE_LINE_THRESHOLD && b >= WHITE_LINE_THRESHOLD) {
        whiteCount++;
      }
    }
    // 如果这一行超过 80% 是白色，认为是分割线
    if (whiteCount / width >= MIN_LINE_RATIO) {
      horizontalWhiteRows.push(y);
    }
  }

  // 扫描纵向白线（x 位置）
  const verticalWhiteCols: number[] = [];
  for (let x = 0; x < width; x++) {
    let whiteCount = 0;
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (r >= WHITE_LINE_THRESHOLD && g >= WHITE_LINE_THRESHOLD && b >= WHITE_LINE_THRESHOLD) {
        whiteCount++;
      }
    }
    // 如果这一列超过 80% 是白色，认为是分割线
    if (whiteCount / height >= MIN_LINE_RATIO) {
      verticalWhiteCols.push(x);
    }
  }

  // console.log(`[GridDetection] Found ${horizontalWhiteRows.length} horizontal white rows`);
  // console.log(`[GridDetection] Found ${verticalWhiteCols.length} vertical white cols`);

  // 合并连续的白线为单一分割线（取中点）
  const horizontalLines = mergeConsecutiveLines(horizontalWhiteRows);
  const verticalLines = mergeConsecutiveLines(verticalWhiteCols);

  // console.log(`[GridDetection] Merged to ${horizontalLines.length} horizontal lines:`, horizontalLines);
  // console.log(`[GridDetection] Merged to ${verticalLines.length} vertical lines:`, verticalLines);

  // 验证是否构成有效网格
  // 需要至少 1 条横线和 1 条竖线（形成 2x2 网格）
  // 或者 0 条横线但有竖线（1 行多列），或者 0 条竖线但有横线（多行 1 列）
  const hasValidGrid =
    (horizontalLines.length >= 1 && verticalLines.length >= 0) ||
    (horizontalLines.length >= 0 && verticalLines.length >= 1);

  if (!hasValidGrid) {
    // console.log('[GridDetection] No valid grid structure found');
    return { success: false };
  }

  // 计算行列数
  const rows = horizontalLines.length + 1;
  const cols = verticalLines.length + 1;

  // 验证网格是否合理（2-12 个单元格）
  const cellCount = rows * cols;
  if (cellCount < 2 || cellCount > 16) {
    // console.log(`[GridDetection] Invalid cell count: ${cellCount}`);
    return { success: false };
  }

  // console.log(`[GridDetection] Detected ${rows}x${cols} grid (${cellCount} cells)`);

  return {
    success: true,
    rows,
    cols,
    horizontalLines,
    verticalLines,
  };
}

/**
 * 合并连续的行/列为单一分割线
 * 例如 [10, 11, 12, 50, 51] -> [11, 50.5]
 */
function mergeConsecutiveLines(lines: number[]): number[] {
  if (lines.length === 0) return [];

  const merged: number[] = [];
  let start = lines[0];
  let end = lines[0];

  for (let i = 1; i < lines.length; i++) {
    if (lines[i] <= end + 3) {
      // 连续或间隔很小（允许 3px 误差）
      end = lines[i];
    } else {
      // 不连续，记录当前组的中点
      merged.push(Math.floor((start + end) / 2));
      start = lines[i];
      end = lines[i];
    }
  }
  // 记录最后一组
  merged.push(Math.floor((start + end) / 2));

  return merged;
}

/**
 * 根据网格结构生成区域
 */
function generateGridRegions(
  width: number,
  height: number,
  horizontalLines: number[],
  verticalLines: number[]
): Array<{ x: number; y: number; width: number; height: number }> {
  const regions: Array<{ x: number; y: number; width: number; height: number }> = [];

  // 添加边界
  const yPositions = [0, ...horizontalLines, height];
  const xPositions = [0, ...verticalLines, width];

  // 生成每个单元格的区域
  for (let row = 0; row < yPositions.length - 1; row++) {
    for (let col = 0; col < xPositions.length - 1; col++) {
      const x = xPositions[col];
      const y = yPositions[row];
      const nextX = xPositions[col + 1];
      const nextY = yPositions[row + 1];

      // 跳过分割线（取内部区域）
      const padding = 2; // 跳过分割线的像素
      const regionX = x + (col === 0 ? padding : padding);
      const regionY = y + (row === 0 ? padding : padding);
      const regionWidth = nextX - x - padding * 2;
      const regionHeight = nextY - y - padding * 2;

      if (regionWidth > 20 && regionHeight > 20) {
        regions.push({
          x: regionX,
          y: regionY,
          width: regionWidth,
          height: regionHeight,
        });
      }
    }
  }

  return regions;
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
 * 计算图片的梯度幅值（用于边缘检测，异步版本）
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
 * 检测背景颜色（从图片四角采样）
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
 * 从图片边缘开始填充，使用梯度作为边界
 * 背景 = 0，前景（图片区域）= 1
 *
 * 性能优化：
 * - 使用 Uint32Array 存储队列，避免对象创建开销
 * - 使用索引代替 shift()，避免 O(n) 操作
 * - 预先标记已入队像素，避免重复入队
 *
 * 关键改进：白色边框也被视为可穿透区域，因为它属于照片的外围
 */
async function createBinaryMaskWithEdgeFloodFill(
  imageData: ImageData,
  gradient: Float32Array,
  bgColor: { r: number; g: number; b: number }
): Promise<Uint8Array> {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);
  const inQueue = new Uint8Array(width * height); // 标记是否已入队

  // 梯度阈值（边缘检测）- 提高阈值以穿过白色边框
  const gradientThreshold = 50;
  // 颜色相似度阈值
  const colorThreshold = 50;

  // 初始化：所有像素默认为前景 (1)
  mask.fill(1);

  // 使用 Uint32Array 存储队列（每个元素 = y * width + x）
  // 预估最大队列大小为图片面积的一半
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

    // 判断是否为背景/可穿透区域：
    const isBgColor = isSimilarToBackground(r, g, b, bgColor, colorThreshold);
    const isGenericBg = isBackgroundPixel(r, g, b);
    const isWhiteBorder = isWhiteBorderPixel(r, g, b, 240); // 白色边框
    const isLowGradient = grad < gradientThreshold;

    // 关键改进：白色边框区域即使梯度较高也应该被穿透
    // 因为白色边框是照片的外围，不是照片的内容
    const canPassThrough =
      // 背景色且低梯度 - 可以穿透
      ((isBgColor || isGenericBg) && isLowGradient) ||
      // 白色边框 - 无论梯度如何都可以穿透（但需要与已知背景相邻）
      isWhiteBorder;

    if (canPassThrough) {
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
 * 检测灵感图中的图片区域
 * 优先使用网格检测（适用于紧凑网格布局），失败时回退到边缘 Flood Fill
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

  // console.log(`[PhotoWallSplitter] Image size: ${originalWidth}x${originalHeight}`);

  // 计算是否需要降采样
  const maxDimension = Math.max(originalWidth, originalHeight);
  const scale = maxDimension > MAX_DETECTION_SIZE ? MAX_DETECTION_SIZE / maxDimension : 1;
  const width = Math.round(originalWidth * scale);
  const height = Math.round(originalHeight * scale);

  // if (scale < 1) {
  //   console.log(`[PhotoWallSplitter] Downscaling to ${width}x${height} (scale: ${scale.toFixed(2)})`);
  // }

  // 创建 Canvas 获取像素数据（可能是降采样后的）
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // 绘制图片
  ctx.drawImage(img, 0, 0, width, height);
  const originalImageData = ctx.getImageData(0, 0, width, height);

  // =============================================
  // 策略 1：优先尝试网格检测（适用于紧凑网格布局）
  // =============================================
  // console.log('[PhotoWallSplitter] Trying grid detection first...');
  const gridResult = detectGridStructure(originalImageData);

  if (gridResult.success && gridResult.horizontalLines && gridResult.verticalLines) {
    // console.log(`[PhotoWallSplitter] Grid detection succeeded! ${gridResult.rows}x${gridResult.cols} grid`);

    // 根据网格结构生成区域
    const gridRegions = generateGridRegions(
      width,
      height,
      gridResult.horizontalLines,
      gridResult.verticalLines
    );

    // 映射回原始尺寸
    const finalRegions = gridRegions.map((region) => {
      if (scale < 1) {
        return {
          x: Math.round(region.x / scale),
          y: Math.round(region.y / scale),
          width: Math.round(region.width / scale),
          height: Math.round(region.height / scale),
        };
      }
      return region;
    });

    // console.log(`[PhotoWallSplitter] Grid detection found ${finalRegions.length} regions`);
    return {
      count: finalRegions.length,
      regions: finalRegions,
    };
  }

  // =============================================
  // 策略 2：回退到边缘 Flood Fill 算法
  // =============================================
  // console.log('[PhotoWallSplitter] Grid detection failed, falling back to flood fill...');

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
  paddedCtx.drawImage(canvas, borderSize, borderSize);

  const imageData = paddedCtx.getImageData(0, 0, paddedWidth, paddedHeight);
  // console.log(`[PhotoWallSplitter] Added ${borderSize}px gray border, detection size: ${paddedWidth}x${paddedHeight}`);

  await yieldToMain();

  // 1. 计算梯度（边缘检测）
  // console.log('[PhotoWallSplitter] Computing gradient...');
  const gradient = await computeGradientMagnitude(imageData);

  await yieldToMain();

  // 2. 检测背景颜色
  const bgColor = detectBackgroundColor(imageData);
  // console.log(`[PhotoWallSplitter] Detected background color: RGB(${bgColor.r}, ${bgColor.g}, ${bgColor.b})`);

  // 3. 使用边缘 Flood Fill 创建二值化遮罩
  // console.log('[PhotoWallSplitter] Creating binary mask with edge flood fill...');
  let mask = await createBinaryMaskWithEdgeFloodFill(imageData, gradient, bgColor);

  await yieldToMain();

  // 统计前景像素数量，判断是否检测有效
  const foregroundCount = mask.reduce((sum, val) => sum + val, 0);
  const totalPaddedPixels = paddedWidth * paddedHeight;
  const foregroundRatio = foregroundCount / totalPaddedPixels;
  // console.log(`[PhotoWallSplitter] Foreground ratio: ${(foregroundRatio * 100).toFixed(1)}%`);

  // 如果前景占比过高（>95%）或过低（<5%），说明边缘检测可能失效，回退到颜色匹配
  if (foregroundRatio > 0.95 || foregroundRatio < 0.05) {
    // console.log('[PhotoWallSplitter] Edge flood fill ineffective, falling back to color matching...');
    mask = await createBinaryMaskByColor(imageData);
  }

  await yieldToMain();

  // 4. 膨胀操作，连接相邻区域
  // console.log('[PhotoWallSplitter] Dilating mask...');
  mask = await dilate(mask, paddedWidth, paddedHeight, 3);

  await yieldToMain();

  // 5. 连通区域标记
  // console.log('[PhotoWallSplitter] Labeling connected components...');
  const { labels, count } = await labelConnectedComponents(mask, paddedWidth, paddedHeight);
  // console.log(`[PhotoWallSplitter] Found ${count} raw regions`);

  await yieldToMain();

  // 6. 计算边界矩形
  const rawBoxes = computeBoundingBoxes(labels, paddedWidth, paddedHeight, count);

  // 7. 过滤太小的区域（注意：面积阈值也需要按比例缩放）
  const scaledMinArea = Math.max(minRegionSize * scale * scale, totalArea * scale * scale * minRegionRatio);
  const filteredBoxes = rawBoxes.filter((box) => box.area >= scaledMinArea);
  // console.log(`[PhotoWallSplitter] After filtering: ${filteredBoxes.length} regions`);

  // 8. 合并重叠的矩形
  const mergedBoxes = mergeOverlappingBoxes(filteredBoxes);
  // console.log(`[PhotoWallSplitter] After merging: ${mergedBoxes.length} regions`);

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
 * 递归拆分单个区域
 * 如果区域内还能检测到多个子区域，继续递归拆分
 * @param imageUrl 当前区域的图片 URL
 * @param depth 当前递归深度
 * @param maxDepth 最大递归深度
 * @param offsetX 当前区域相对于原始图片的 X 偏移量
 * @param offsetY 当前区域相对于原始图片的 Y 偏移量
 */
async function splitRegionRecursively(
  imageUrl: string,
  depth = 0,
  maxDepth = 5,
  offsetX = 0,
  offsetY = 0
): Promise<ImageElement[]> {
  // 防止无限递归
  if (depth >= maxDepth) {
    const img = await loadImage(imageUrl);
    return [{
      id: `photo-wall-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      imageData: imageUrl,
      originalIndex: 0,
      width: img.naturalWidth,
      height: img.naturalHeight,
      sourceX: offsetX,
      sourceY: offsetY,
    }];
  }

  // 检测当前图片中的区域
  const detection = await detectPhotoWallRegions(imageUrl);

  // 如果检测到 0 或 1 个区域，说明无法继续拆分，返回当前图片
  if (detection.count <= 1) {

    // 去白边后返回
    const trimmedImageData = await removeWhiteBorder(imageUrl, { borderRatio: 0.3 });
    const trimmedImg = await loadImage(trimmedImageData);
    const trimmedWidth = trimmedImg.naturalWidth;
    const trimmedHeight = trimmedImg.naturalHeight;

    // 过滤太小的图片
    if (trimmedWidth < 50 || trimmedHeight < 50) {
      return [];
    }

    return [{
      id: `photo-wall-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      imageData: trimmedImageData,
      originalIndex: 0,
      width: trimmedWidth,
      height: trimmedHeight,
      sourceX: offsetX,
      sourceY: offsetY,
    }];
  }

  // 检测到多个区域，提取每个区域并递归处理
  const img = await loadImage(imageUrl);
  const allElements: ImageElement[] = [];

  for (let i = 0; i < detection.regions.length; i++) {
    const region = detection.regions[i];

    // 提取区域
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

    const regionImageUrl = regionCanvas.toDataURL('image/jpeg', 0.92);

    // 递归拆分这个区域，累积位置偏移
    const subElements = await splitRegionRecursively(
      regionImageUrl,
      depth + 1,
      maxDepth,
      offsetX + region.x,  // 累积 X 偏移
      offsetY + region.y   // 累积 Y 偏移
    );
    allElements.push(...subElements);
  }

  return allElements;
}

/**
 * 拆分灵感图图片（递归版本）
 * 会递归拆分直到每个区域都无法再拆分为止
 */
export async function splitPhotoWall(imageUrl: string): Promise<ImageElement[]> {
  const elements = await splitRegionRecursively(imageUrl, 0, 5);

  // 重新分配 ID 和 index
  const finalElements = elements.map((el, index) => ({
    ...el,
    id: `photo-wall-${Date.now()}-${index}`,
    originalIndex: index,
  }));

  // 按面积降序排序（大图在前）
  finalElements.sort((a, b) => b.width * b.height - a.width * a.height);
  
  return finalElements;
}
