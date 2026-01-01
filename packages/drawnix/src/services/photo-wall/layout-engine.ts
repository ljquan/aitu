/**
 * LayoutEngine - 宫格图布局引擎
 * 
 * 根据布局风格计算每个图片元素在画板上的位置、旋转角度和缩放比例
 * 支持三种布局风格：散落、网格、环形
 */

import type {
  ImageElement,
  PositionedElement,
  LayoutStyle,
  LayoutParams,
  ScatteredLayoutConfig,
  CircularLayoutConfig,
  PhotoWallLayoutConfig,
} from '../../types/photo-wall.types';
import { PHOTO_WALL_DEFAULTS } from '../../types/photo-wall.types';

/**
 * 随机数生成器（指定范围）
 */
function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * 打乱数组顺序（Fisher-Yates 洗牌算法）
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * LayoutEngine 类
 * 
 * 负责计算宫格图中每个元素的位置和变换参数
 */
export class LayoutEngine {
  /**
   * 根据布局风格计算元素位置
   * 
   * @param elements - 图片元素数组
   * @param style - 布局风格
   * @param params - 布局参数
   * @param config - 风格特定配置
   * @returns 带位置信息的元素数组
   */
  calculate(
    elements: ImageElement[],
    style: LayoutStyle,
    params: LayoutParams,
    config?: ScatteredLayoutConfig | CircularLayoutConfig | PhotoWallLayoutConfig
  ): PositionedElement[] {
    switch (style) {
      case 'scattered':
        return this.scatteredLayout(elements, params, config as ScatteredLayoutConfig);
      case 'grid':
        return this.gridLayout(elements, params);
      case 'circular':
        return this.circularLayout(elements, params, config as CircularLayoutConfig);
      case 'photo-wall':
        return this.photoWallLayout(elements, params, config as PhotoWallLayoutConfig);
      default:
        console.warn(`[LayoutEngine] Unknown layout style: ${style}, falling back to grid`);
        return this.gridLayout(elements, params);
    }
  }
  
  /**
   * 散落布局
   * 
   * 特点：随机位置偏移、随机旋转角度、随机缩放，模拟真实照片散落效果
   */
  private scatteredLayout(
    elements: ImageElement[],
    params: LayoutParams,
    config?: ScatteredLayoutConfig
  ): PositionedElement[] {
    const {
      maxRotation = 15,
      minScale = 0.85,
      maxScale = 1.15,
      positionJitter = 40,
    } = config || {};
    
    const { canvasWidth, canvasHeight, startX, startY, gap = 20 } = params;
    
    // 计算基础网格（用于确定大致位置）
    const count = elements.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    
    // 计算单元格大小（基于最大元素尺寸）
    const maxElementWidth = Math.max(...elements.map(e => e.width));
    const maxElementHeight = Math.max(...elements.map(e => e.height));
    
    // 缩放元素以适应画布
    const availableWidth = canvasWidth - gap * 2;
    const availableHeight = canvasHeight - gap * 2;
    
    const cellWidth = availableWidth / cols;
    const cellHeight = availableHeight / rows;
    
    // 计算统一的缩放比例
    const baseScale = Math.min(
      (cellWidth - gap) / maxElementWidth,
      (cellHeight - gap) / maxElementHeight,
      1 // 不放大超过原始尺寸
    );
    
    // 打乱 z-index 顺序，增加层叠感
    const zIndexOrder = shuffleArray(elements.map((_, i) => i));
    
    return elements.map((element, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      
      // 基础位置（网格中心）
      const baseX = startX + gap + col * cellWidth + cellWidth / 2;
      const baseY = startY + gap + row * cellHeight + cellHeight / 2;
      
      // 添加随机偏移
      const jitterX = randomInRange(-positionJitter, positionJitter);
      const jitterY = randomInRange(-positionJitter, positionJitter);
      
      // 随机旋转角度
      const rotation = randomInRange(-maxRotation, maxRotation);
      
      // 随机缩放
      const scaleVariation = randomInRange(minScale, maxScale);
      const finalScale = baseScale * scaleVariation;
      
      // 计算最终位置（左上角坐标）
      const scaledWidth = element.width * finalScale;
      const scaledHeight = element.height * finalScale;
      
      return {
        ...element,
        x: baseX + jitterX - scaledWidth / 2,
        y: baseY + jitterY - scaledHeight / 2,
        rotation,
        scale: finalScale,
        zIndex: zIndexOrder[index],
      };
    });
  }
  
  /**
   * 网格布局
   * 
   * 特点：整齐排列，无旋转，统一缩放
   */
  private gridLayout(
    elements: ImageElement[],
    params: LayoutParams
  ): PositionedElement[] {
    const { canvasWidth, canvasHeight, startX, startY, gap = 20 } = params;
    
    const count = elements.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    
    const maxElementWidth = Math.max(...elements.map(e => e.width));
    const maxElementHeight = Math.max(...elements.map(e => e.height));
    
    const availableWidth = canvasWidth - gap * (cols + 1);
    const availableHeight = canvasHeight - gap * (rows + 1);
    
    const cellWidth = availableWidth / cols;
    const cellHeight = availableHeight / rows;
    
    // 统一缩放比例
    const scale = Math.min(
      cellWidth / maxElementWidth,
      cellHeight / maxElementHeight,
      1
    );
    
    return elements.map((element, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      
      const scaledWidth = element.width * scale;
      const scaledHeight = element.height * scale;
      
      // 在单元格内居中
      const cellX = startX + gap + col * (cellWidth + gap);
      const cellY = startY + gap + row * (cellHeight + gap);
      
      const x = cellX + (cellWidth - scaledWidth) / 2;
      const y = cellY + (cellHeight - scaledHeight) / 2;
      
      return {
        ...element,
        x,
        y,
        rotation: 0,
        scale,
        zIndex: index,
      };
    });
  }
  
  /**
   * 环形布局
   * 
   * 特点：围绕中心点环形分布，可选中心元素
   */
  private circularLayout(
    elements: ImageElement[],
    params: LayoutParams,
    config?: CircularLayoutConfig
  ): PositionedElement[] {
    const {
      centerIndex = -1,
      radius: customRadius,
      startAngle = -90,
    } = config || {};
    
    const { canvasWidth, canvasHeight, startX, startY } = params;
    
    // 中心点
    const centerX = startX + canvasWidth / 2;
    const centerY = startY + canvasHeight / 2;
    
    // 分离中心元素和环形元素
    const ringElements = centerIndex >= 0 && centerIndex < elements.length
      ? elements.filter((_, i) => i !== centerIndex)
      : elements;
    
    const centerElement = centerIndex >= 0 && centerIndex < elements.length
      ? elements[centerIndex]
      : null;
    
    // 计算元素尺寸
    const maxElementWidth = Math.max(...elements.map(e => e.width));
    const maxElementHeight = Math.max(...elements.map(e => e.height));
    const maxElementSize = Math.max(maxElementWidth, maxElementHeight);
    
    // 计算半径（如果未指定）
    const ringCount = ringElements.length;
    const minRadius = maxElementSize * 0.8; // 中心元素周围的最小间距
    const circumference = ringCount * maxElementSize * 1.2; // 环形周长
    const calculatedRadius = Math.max(minRadius, circumference / (2 * Math.PI));
    const radius = customRadius || Math.min(calculatedRadius, Math.min(canvasWidth, canvasHeight) / 2 - maxElementSize / 2);
    
    // 计算缩放比例
    const availableSize = Math.min(canvasWidth, canvasHeight);
    const scale = Math.min(
      (availableSize * 0.25) / maxElementSize, // 每个元素占用约 1/4 画布
      1
    );
    
    const result: PositionedElement[] = [];
    
    // 添加中心元素
    if (centerElement) {
      const scaledWidth = centerElement.width * scale * 1.2; // 中心元素稍大
      const scaledHeight = centerElement.height * scale * 1.2;
      
      result.push({
        ...centerElement,
        x: centerX - scaledWidth / 2,
        y: centerY - scaledHeight / 2,
        rotation: 0,
        scale: scale * 1.2,
        zIndex: ringCount, // 最高层级
      });
    }
    
    // 添加环形元素
    const angleStep = 360 / ringCount;
    
    ringElements.forEach((element, index) => {
      const angle = startAngle + index * angleStep;
      const radian = (angle * Math.PI) / 180;
      
      const scaledWidth = element.width * scale;
      const scaledHeight = element.height * scale;
      
      // 计算位置
      const x = centerX + radius * Math.cos(radian) - scaledWidth / 2;
      const y = centerY + radius * Math.sin(radian) - scaledHeight / 2;
      
      // 旋转角度指向中心（可选）
      const rotation = 0; // 保持正向，不旋转
      
      result.push({
        ...element,
        x,
        y,
        rotation,
        scale,
        zIndex: index,
      });
    });

    return result;
  }

  /**
   * 照片墙布局
   *
   * 特点：不规则大小、横向散落、带旋转和层叠效果
   * 模拟真实照片墙/灵感板效果
   */
  private photoWallLayout(
    elements: ImageElement[],
    params: LayoutParams,
    config?: PhotoWallLayoutConfig
  ): PositionedElement[] {
    const {
      minWidthRatio = PHOTO_WALL_DEFAULTS.minWidthRatio,
      maxWidthRatio = PHOTO_WALL_DEFAULTS.maxWidthRatio,
      maxRotation = PHOTO_WALL_DEFAULTS.maxRotation,
      gap = PHOTO_WALL_DEFAULTS.gap,
    } = config || {};

    const { canvasWidth, canvasHeight, startX, startY } = params;
    const count = elements.length;

    // 为每个元素分配随机的尺寸比例（大、中、小）
    const sizeCategories = this.assignSizeCategories(count);

    // 计算基础尺寸
    const avgWidth = elements.reduce((sum, e) => sum + e.width, 0) / count;
    const avgHeight = elements.reduce((sum, e) => sum + e.height, 0) / count;

    // 横向布局：宽度大于高度
    const layoutWidth = canvasWidth || 1200;
    const layoutHeight = canvasHeight || 600;

    // 计算基础缩放比例，使元素适合布局区域
    const baseScale = Math.min(
      (layoutWidth * 0.25) / avgWidth,
      (layoutHeight * 0.4) / avgHeight,
      1
    );

    // 使用分区算法放置元素
    const positions = this.calculatePhotoWallPositions(
      count,
      layoutWidth,
      layoutHeight,
      gap
    );

    // 打乱 zIndex 顺序，增加层叠感
    const zIndexOrder = shuffleArray(elements.map((_, i) => i));

    return elements.map((element, index) => {
      const pos = positions[index];
      const sizeCategory = sizeCategories[index];

      // 根据尺寸类别调整缩放
      let scaleMultiplier: number;
      switch (sizeCategory) {
        case 'large':
          scaleMultiplier = randomInRange(1.2, maxWidthRatio);
          break;
        case 'medium':
          scaleMultiplier = randomInRange(0.9, 1.1);
          break;
        case 'small':
          scaleMultiplier = randomInRange(minWidthRatio, 0.85);
          break;
        default:
          scaleMultiplier = 1;
      }

      const finalScale = baseScale * scaleMultiplier;

      // 随机旋转角度（比散落布局小一些，更优雅）
      const rotation = randomInRange(-maxRotation, maxRotation);

      // 添加位置抖动
      const jitterX = randomInRange(-20, 20);
      const jitterY = randomInRange(-15, 15);

      const scaledWidth = element.width * finalScale;
      const scaledHeight = element.height * finalScale;

      return {
        ...element,
        x: startX + pos.x + jitterX - scaledWidth / 2,
        y: startY + pos.y + jitterY - scaledHeight / 2,
        rotation,
        scale: finalScale,
        zIndex: zIndexOrder[index],
      };
    });
  }

  /**
   * 为元素分配尺寸类别（大、中、小）
   * 照片墙效果需要混合不同大小的图片
   */
  private assignSizeCategories(count: number): ('large' | 'medium' | 'small')[] {
    const categories: ('large' | 'medium' | 'small')[] = [];

    // 分配比例：约 25% 大图，50% 中图，25% 小图
    const largeCount = Math.max(2, Math.floor(count * 0.25));
    const smallCount = Math.max(2, Math.floor(count * 0.25));
    const mediumCount = count - largeCount - smallCount;

    for (let i = 0; i < largeCount; i++) categories.push('large');
    for (let i = 0; i < mediumCount; i++) categories.push('medium');
    for (let i = 0; i < smallCount; i++) categories.push('small');

    // 打乱顺序
    return shuffleArray(categories);
  }

  /**
   * 计算照片墙位置
   * 使用横向分区 + 随机偏移的方式生成自然的散落效果
   */
  private calculatePhotoWallPositions(
    count: number,
    width: number,
    height: number,
    gap: number
  ): Array<{ x: number; y: number }> {
    const positions: Array<{ x: number; y: number }> = [];

    // 横向布局：分成多行，每行位置有随机性
    const rows = Math.ceil(count / 4); // 每行约 4 个元素
    const cols = Math.ceil(count / rows);

    const cellWidth = (width - gap * 2) / cols;
    const cellHeight = (height - gap * 2) / rows;

    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;

      // 基础位置（单元格中心）
      const baseX = gap + col * cellWidth + cellWidth / 2;
      const baseY = gap + row * cellHeight + cellHeight / 2;

      // 添加随机偏移（横向偏移更大，强调横向布局）
      const offsetX = randomInRange(-cellWidth * 0.3, cellWidth * 0.3);
      const offsetY = randomInRange(-cellHeight * 0.2, cellHeight * 0.2);

      positions.push({
        x: baseX + offsetX,
        y: baseY + offsetY,
      });
    }

    // 打乱位置顺序，增加随机感
    return shuffleArray(positions);
  }

  /**
   * 计算布局所需的画布尺寸
   * 
   * @param elements - 图片元素数组
   * @param style - 布局风格
   * @param targetScale - 目标缩放比例
   * @returns 建议的画布尺寸
   */
  calculateRequiredSize(
    elements: ImageElement[],
    style: LayoutStyle,
    targetScale: number = 0.5
  ): { width: number; height: number } {
    const count = elements.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    
    const maxWidth = Math.max(...elements.map(e => e.width));
    const maxHeight = Math.max(...elements.map(e => e.height));
    
    const gap = 20;
    const padding = style === 'scattered' ? 60 : 40;
    
    const width = cols * maxWidth * targetScale + (cols + 1) * gap + padding * 2;
    const height = rows * maxHeight * targetScale + (rows + 1) * gap + padding * 2;
    
    return { width, height };
  }
}

/**
 * 默认的 LayoutEngine 实例
 */
export const layoutEngine = new LayoutEngine();
