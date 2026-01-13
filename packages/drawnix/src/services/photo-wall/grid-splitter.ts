/**
 * GridSplitter - 图片网格分割器
 * 
 * 使用 Canvas API 将一张图片按规则网格分割成多个独立图片
 */

import type { GridConfig, ImageElement } from '../../types/photo-wall.types';

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 加载图片到 HTMLImageElement
 */
async function loadImage(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(new Error(`Failed to load image: ${error}`));
    
    // 处理 base64 和 URL
    img.src = imageUrl;
  });
}

/**
 * 将 Canvas 导出为 DataURL
 */
function canvasToDataURL(canvas: HTMLCanvasElement, quality: number = 0.92): string {
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * GridSplitter 类
 * 
 * 负责将完整图片按网格分割成多个独立图片
 */
export class GridSplitter {
  /**
   * 分割图片
   * 
   * @param imageUrl - 图片 URL 或 base64 DataURL
   * @param config - 网格配置（行数和列数）
   * @returns 分割后的图片元素数组
   */
  async split(imageUrl: string, config: GridConfig): Promise<ImageElement[]> {
    const { rows, cols } = config;
    
    if (rows < 1 || cols < 1) {
      throw new Error('Grid rows and cols must be at least 1');
    }
    
    // 加载原图
    const sourceImage = await loadImage(imageUrl);
    const sourceWidth = sourceImage.naturalWidth;
    const sourceHeight = sourceImage.naturalHeight;
    
    // 计算每个格子的尺寸
    const cellWidth = Math.floor(sourceWidth / cols);
    const cellHeight = Math.floor(sourceHeight / rows);
    
    // console.log(`[GridSplitter] Splitting ${sourceWidth}x${sourceHeight} image into ${rows}x${cols} grid`);
    // console.log(`[GridSplitter] Cell size: ${cellWidth}x${cellHeight}`);
    
    const elements: ImageElement[] = [];
    
    // 遍历网格，裁剪每个区域
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        
        // 计算裁剪区域
        const sx = col * cellWidth;
        const sy = row * cellHeight;
        
        // 创建离屏 Canvas
        const canvas = document.createElement('canvas');
        canvas.width = cellWidth;
        canvas.height = cellHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas 2d context');
        }
        
        // 裁剪并绘制到 Canvas
        ctx.drawImage(
          sourceImage,
          sx, sy, cellWidth, cellHeight,  // 源图裁剪区域
          0, 0, cellWidth, cellHeight     // 目标绘制区域
        );
        
        // 导出为 DataURL
        const imageData = canvasToDataURL(canvas);
        
        elements.push({
          id: generateId(),
          imageData,
          originalIndex: index,
          width: cellWidth,
          height: cellHeight,
        });
      }
    }
    
    // console.log(`[GridSplitter] Successfully split into ${elements.length} elements`);
    
    return elements;
  }
  
  /**
   * 分割图片并返回 Blob URL（更节省内存）
   * 
   * @param imageUrl - 图片 URL 或 base64 DataURL
   * @param config - 网格配置
   * @returns 分割后的图片元素数组（使用 Blob URL）
   */
  async splitToBlob(imageUrl: string, config: GridConfig): Promise<ImageElement[]> {
    const { rows, cols } = config;
    
    if (rows < 1 || cols < 1) {
      throw new Error('Grid rows and cols must be at least 1');
    }
    
    const sourceImage = await loadImage(imageUrl);
    const sourceWidth = sourceImage.naturalWidth;
    const sourceHeight = sourceImage.naturalHeight;
    
    const cellWidth = Math.floor(sourceWidth / cols);
    const cellHeight = Math.floor(sourceHeight / rows);
    
    const elements: ImageElement[] = [];
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        
        const sx = col * cellWidth;
        const sy = row * cellHeight;
        
        const canvas = document.createElement('canvas');
        canvas.width = cellWidth;
        canvas.height = cellHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Failed to get canvas 2d context');
        }
        
        ctx.drawImage(
          sourceImage,
          sx, sy, cellWidth, cellHeight,
          0, 0, cellWidth, cellHeight
        );
        
        // 转换为 Blob URL
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to create blob'));
              }
            },
            'image/png',
            0.92
          );
        });
        
        const blobUrl = URL.createObjectURL(blob);
        
        elements.push({
          id: generateId(),
          imageData: blobUrl,
          originalIndex: index,
          width: cellWidth,
          height: cellHeight,
        });
      }
    }
    
    return elements;
  }
  
  /**
   * 释放 Blob URL 资源
   * 
   * @param elements - 使用 Blob URL 的图片元素数组
   */
  revokeBlobUrls(elements: ImageElement[]): void {
    for (const element of elements) {
      if (element.imageData.startsWith('blob:')) {
        URL.revokeObjectURL(element.imageData);
      }
    }
  }
}

/**
 * 默认的 GridSplitter 实例
 */
export const gridSplitter = new GridSplitter();
