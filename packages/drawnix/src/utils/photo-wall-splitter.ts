/**
 * 照片墙智能拆图器
 *
 * 专门用于检测和拆分不规则照片墙图片
 * 特点：图片大小不一、位置不规则、有白色边框、灰色背景
 *
 * 算法思路：
 * 1. 检测背景颜色（灰色区域）
 * 2. 找到非背景的连通区域
 * 3. 为每个连通区域计算边界矩形
 * 4. 过滤掉太小的区域（噪点）
 * 5. 提取每个区域的图片
 */

import type { ImageElement } from '../types/photo-wall.types';
import {
  loadImage,
  isBackgroundPixel,
  isWhiteBorderPixel,
  extractAndTrimRegion,
} from './image-border-utils';

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
 * 创建二值化遮罩
 * 背景 = 0，前景（图片区域）= 1
 */
function createBinaryMask(imageData: ImageData): Uint8Array {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);

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
    }
  }

  return mask;
}

/**
 * 形态学操作：膨胀
 * 用于连接相邻的前景像素
 */
function dilate(mask: Uint8Array, width: number, height: number, radius: number = 2): Uint8Array {
  const result = new Uint8Array(mask.length);

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
    }
  }

  return result;
}

/**
 * 连通区域标记（使用 Flood Fill）
 * 返回每个像素的标签（0 = 背景，1+ = 不同的连通区域）
 */
function labelConnectedComponents(
  mask: Uint8Array,
  width: number,
  height: number
): { labels: Int32Array; count: number } {
  const labels = new Int32Array(mask.length);
  let currentLabel = 0;

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
 * 扩展边界矩形以包含白色边框
 */
function expandBoxesToIncludeBorder(
  boxes: Array<{ x: number; y: number; width: number; height: number }>,
  imageData: ImageData,
  padding: number = 5
): Array<{ x: number; y: number; width: number; height: number }> {
  const { width: imgWidth, height: imgHeight, data } = imageData;

  return boxes.map((box) => {
    // 向外扩展，寻找白色边框
    let { x, y, width, height } = box;

    // 向左扩展
    while (x > 0) {
      let hasWhite = false;
      for (let py = y; py < y + height && py < imgHeight; py++) {
        const idx = (py * imgWidth + (x - 1)) * 4;
        if (isWhiteBorderPixel(data[idx], data[idx + 1], data[idx + 2])) {
          hasWhite = true;
          break;
        }
      }
      if (hasWhite) {
        x--;
        width++;
      } else {
        break;
      }
    }

    // 向右扩展
    while (x + width < imgWidth) {
      let hasWhite = false;
      for (let py = y; py < y + height && py < imgHeight; py++) {
        const idx = (py * imgWidth + (x + width)) * 4;
        if (isWhiteBorderPixel(data[idx], data[idx + 1], data[idx + 2])) {
          hasWhite = true;
          break;
        }
      }
      if (hasWhite) {
        width++;
      } else {
        break;
      }
    }

    // 向上扩展
    while (y > 0) {
      let hasWhite = false;
      for (let px = x; px < x + width && px < imgWidth; px++) {
        const idx = ((y - 1) * imgWidth + px) * 4;
        if (isWhiteBorderPixel(data[idx], data[idx + 1], data[idx + 2])) {
          hasWhite = true;
          break;
        }
      }
      if (hasWhite) {
        y--;
        height++;
      } else {
        break;
      }
    }

    // 向下扩展
    while (y + height < imgHeight) {
      let hasWhite = false;
      for (let px = x; px < x + width && px < imgWidth; px++) {
        const idx = ((y + height) * imgWidth + px) * 4;
        if (isWhiteBorderPixel(data[idx], data[idx + 1], data[idx + 2])) {
          hasWhite = true;
          break;
        }
      }
      if (hasWhite) {
        height++;
      } else {
        break;
      }
    }

    // 添加少量 padding
    return {
      x: Math.max(0, x - padding),
      y: Math.max(0, y - padding),
      width: Math.min(imgWidth - x + padding, width + padding * 2),
      height: Math.min(imgHeight - y + padding, height + padding * 2),
    };
  });
}

/**
 * 检测照片墙中的图片区域
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
  const { naturalWidth: width, naturalHeight: height } = img;
  const totalArea = width * height;

  console.log(`[PhotoWallSplitter] Image size: ${width}x${height}`);

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

  // 1. 创建二值化遮罩
  console.log('[PhotoWallSplitter] Creating binary mask...');
  let mask = createBinaryMask(imageData);

  // 2. 膨胀操作，连接相邻区域
  console.log('[PhotoWallSplitter] Dilating mask...');
  mask = dilate(mask, width, height, 3);

  // 3. 连通区域标记
  console.log('[PhotoWallSplitter] Labeling connected components...');
  const { labels, count } = labelConnectedComponents(mask, width, height);
  console.log(`[PhotoWallSplitter] Found ${count} raw regions`);

  // 4. 计算边界矩形
  const rawBoxes = computeBoundingBoxes(labels, width, height, count);

  // 5. 过滤太小的区域
  const minArea = Math.max(minRegionSize, totalArea * minRegionRatio);
  const filteredBoxes = rawBoxes.filter((box) => box.area >= minArea);
  console.log(`[PhotoWallSplitter] After filtering: ${filteredBoxes.length} regions`);

  // 6. 合并重叠的矩形
  const mergedBoxes = mergeOverlappingBoxes(filteredBoxes);
  console.log(`[PhotoWallSplitter] After merging: ${mergedBoxes.length} regions`);

  // 7. 扩展边界以包含白色边框
  const finalBoxes = expandBoxesToIncludeBorder(mergedBoxes, imageData);

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

    // 使用共享工具提取并裁剪区域边框
    const trimResult = extractAndTrimRegion(img, region);

    if (!trimResult) {
      console.log(`[PhotoWallSplitter] Region ${i} too small after trimming, skipping`);
      continue;
    }

    elements.push({
      id: `photo-wall-${Date.now()}-${i}`,
      imageData: trimResult.canvas.toDataURL('image/png', 0.92),
      originalIndex: i,
      width: trimResult.width,
      height: trimResult.height,
    });

    console.log(`[PhotoWallSplitter] Region ${i}: ${region.width}x${region.height} -> ${trimResult.width}x${trimResult.height}`);
  }

  console.log(`[PhotoWallSplitter] Split into ${elements.length} images`);
  return elements;
}
