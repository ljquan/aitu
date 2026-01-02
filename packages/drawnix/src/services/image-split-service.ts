/**
 * Image Split Service - 统一的图片拆分服务
 *
 * 提供两种拆分模式：
 * 1. 网格拆分（grid）：按指定的行列数均匀分割
 * 2. 智能检测（auto）：自动检测白色分割线并拆分
 *
 * 复用现有的拆分能力，避免代码重复
 */

import { PlaitBoard, Point } from '@plait/core';
import { DrawTransforms } from '@plait/draw';
import { gridSplitter } from './photo-wall/grid-splitter';
import { layoutEngine } from './photo-wall/layout-engine';
import {
  detectGridLines,
  splitImageByLines,
  recursiveSplitElement,
  type SplitImageElement,
} from '../utils/image-splitter';
import { splitPhotoWall } from '../utils/photo-wall-splitter';
import { getInsertionPointBelowBottommostElement } from '../utils/selection-utils';
import type {
  GridConfig,
  LayoutStyle,
  LayoutParams,
  PositionedElement,
  ImageElement,
} from '../types/photo-wall.types';

/**
 * 拆分模式
 * - grid: 按网格均匀分割
 * - auto: 自动检测白色分割线
 * - inspiration-board: 智能检测灵感图中的不规则区域
 */
export type SplitMode = 'grid' | 'auto' | 'inspiration-board';

/**
 * 拆分选项
 */
export interface SplitOptions {
  /** 拆分模式 */
  mode: SplitMode;
  /** 网格配置（grid 模式必填） */
  gridConfig?: GridConfig;
  /** 布局风格 */
  layoutStyle?: LayoutStyle;
  /** 插入时的元素间距 */
  gap?: number;
}

/**
 * 拆分结果
 */
export interface SplitResult {
  success: boolean;
  /** 拆分后的图片数量 */
  count: number;
  /** 检测到的网格配置（auto 模式） */
  detectedGrid?: GridConfig;
  /** 错误信息 */
  error?: string;
}

/**
 * 拆分并插入画布的选项
 */
export interface SplitAndInsertOptions extends SplitOptions {
  /** 起始位置 */
  startPoint?: Point;
}

/**
 * Image Split Service 类
 */
class ImageSplitService {
  /**
   * 按网格拆分图片
   *
   * @param imageUrl - 图片 URL 或 base64 DataURL
   * @param config - 网格配置
   * @returns 拆分后的图片元素数组
   */
  async splitByGrid(imageUrl: string, config: GridConfig): Promise<ImageElement[]> {
    console.log(`[ImageSplitService] Splitting by grid: ${config.rows}x${config.cols}`);
    return gridSplitter.split(imageUrl, config);
  }

  /**
   * 智能检测并拆分图片（支持递归拆分）
   * 复用 image-splitter.ts 的 recursiveSplitElement
   *
   * @param imageUrl - 图片 URL 或 base64 DataURL
   * @returns 拆分后的图片元素数组和检测到的网格配置
   */
  async splitByDetection(imageUrl: string): Promise<{
    elements: ImageElement[];
    gridConfig: GridConfig;
  }> {
    console.log('[ImageSplitService] Splitting by auto detection (with recursive)');

    // 检测分割线
    const detection = await detectGridLines(imageUrl);
    console.log('[ImageSplitService] Detected grid:', detection);

    // 如果没有检测到分割线，返回空数组
    if (detection.rows <= 1 && detection.cols <= 1) {
      return {
        elements: [],
        gridConfig: { rows: 1, cols: 1 },
      };
    }

    // 按检测到的分割线拆分（第一轮）
    const initialElements = await splitImageByLines(imageUrl, detection);

    // 递归拆分每个元素（复用 image-splitter.ts 的函数）
    const allSplitElements: SplitImageElement[] = [];
    for (const el of initialElements) {
      const subElements = await recursiveSplitElement(el, 0, 3);
      allSplitElements.push(...subElements);
    }

    // 转换为 ImageElement 格式
    const elements: ImageElement[] = allSplitElements.map((el, idx) => ({
      id: `split-${Date.now()}-${idx}`,
      imageData: el.imageData,
      originalIndex: idx,
      width: el.width,
      height: el.height,
    }));

    // 估算网格配置
    const cols = Math.ceil(Math.sqrt(elements.length));
    const rows = Math.ceil(elements.length / cols);

    console.log(`[ImageSplitService] Recursive split: ${initialElements.length} -> ${elements.length} images`);

    return {
      elements,
      gridConfig: { rows, cols },
    };
  }

  /**
   * 智能检测灵感图并拆分
   * 适用于不规则布局的灵感图（大小不一、位置不规则、白色边框、灰色背景）
   *
   * @param imageUrl - 图片 URL 或 base64 DataURL
   * @returns 拆分后的图片元素数组
   */
  async splitPhotoWall(imageUrl: string): Promise<{
    elements: ImageElement[];
    gridConfig: GridConfig;
  }> {
    console.log('[ImageSplitService] Splitting inspiration board by intelligent detection');

    const elements = await splitPhotoWall(imageUrl);

    if (elements.length === 0) {
      console.log('[ImageSplitService] No inspiration board regions detected');
      return {
        elements: [],
        gridConfig: { rows: 1, cols: 1 },
      };
    }

    // 估算网格配置（用于布局计算）
    const cols = Math.ceil(Math.sqrt(elements.length));
    const rows = Math.ceil(elements.length / cols);

    console.log(`[ImageSplitService] Inspiration board split into ${elements.length} images (estimated grid: ${rows}x${cols})`);

    return {
      elements,
      gridConfig: { rows, cols },
    };
  }

  /**
   * 拆分图片（统一入口）
   *
   * @param imageUrl - 图片 URL
   * @param options - 拆分选项
   */
  async split(
    imageUrl: string,
    options: SplitOptions
  ): Promise<{ elements: ImageElement[]; gridConfig: GridConfig }> {
    const { mode, gridConfig } = options;

    if (mode === 'grid') {
      if (!gridConfig) {
        throw new Error('Grid mode requires gridConfig');
      }
      const elements = await this.splitByGrid(imageUrl, gridConfig);
      return { elements, gridConfig };
    } else if (mode === 'inspiration-board') {
      return this.splitPhotoWall(imageUrl);
    } else {
      return this.splitByDetection(imageUrl);
    }
  }

  /**
   * 计算布局后的元素位置
   */
  calculateLayout(
    elements: ImageElement[],
    layoutStyle: LayoutStyle = 'grid',
    gridConfig: GridConfig
  ): PositionedElement[] {
    // 计算布局参数
    const layoutParams = this.calculateLayoutParams(elements, gridConfig);
    return layoutEngine.calculate(elements, layoutStyle, layoutParams);
  }

  /**
   * 拆分并插入到画布
   *
   * @param board - 画板实例
   * @param imageUrl - 图片 URL
   * @param options - 拆分和插入选项
   */
  async splitAndInsert(
    board: PlaitBoard,
    imageUrl: string,
    options: SplitAndInsertOptions
  ): Promise<SplitResult> {
    try {
      const { mode, gridConfig, layoutStyle = 'grid', startPoint } = options;

      // 1. 拆分图片
      const { elements, gridConfig: detectedConfig } = await this.split(imageUrl, {
        mode,
        gridConfig,
      });

      if (elements.length === 0) {
        return {
          success: false,
          count: 0,
          error: mode === 'auto' ? '未检测到分割线' : '拆分失败',
        };
      }

      // 2. 计算布局
      const finalConfig = mode === 'grid' ? gridConfig! : detectedConfig;
      const positionedElements = this.calculateLayout(elements, layoutStyle, finalConfig);

      // 3. 插入到画布
      await this.insertToBoard(board, positionedElements, startPoint);

      return {
        success: true,
        count: elements.length,
        detectedGrid: mode === 'auto' ? detectedConfig : undefined,
      };
    } catch (error: any) {
      console.error('[ImageSplitService] Split and insert failed:', error);
      return {
        success: false,
        count: 0,
        error: error.message || '拆分失败',
      };
    }
  }

  /**
   * 将带位置信息的元素插入画板
   */
  private async insertToBoard(
    board: PlaitBoard,
    elements: PositionedElement[],
    startPoint?: Point
  ): Promise<void> {
    // 计算插入基准点
    let baseX = startPoint?.[0] ?? 100;
    let baseY = startPoint?.[1];

    if (baseY === undefined) {
      const bottomPoint = getInsertionPointBelowBottommostElement(board, 800);
      baseY = bottomPoint?.[1] ?? 100;
      baseX = bottomPoint?.[0] ?? baseX;
    }

    console.log(`[ImageSplitService] Inserting ${elements.length} elements at (${baseX}, ${baseY})`);

    // 按 zIndex 排序
    const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);

    // 逐个插入元素
    for (const element of sortedElements) {
      const insertX = baseX + element.x;
      const insertY = baseY + element.y;

      const imageItem = {
        url: element.imageData,
        width: element.width * element.scale,
        height: element.height * element.scale,
      };

      DrawTransforms.insertImage(board, imageItem, [insertX, insertY] as Point);
    }

    console.log('[ImageSplitService] All elements inserted successfully');
  }

  /**
   * 计算布局参数
   */
  private calculateLayoutParams(elements: ImageElement[], gridConfig: GridConfig): LayoutParams {
    const totalWidth = elements.reduce((sum, e) => sum + e.width, 0);
    const totalHeight = elements.reduce((sum, e) => sum + e.height, 0);

    const count = elements.length;
    const cols = gridConfig.cols;
    const rows = gridConfig.rows;

    const avgWidth = totalWidth / count;
    const avgHeight = totalHeight / count;

    const gap = 30;
    const padding = 50;

    const canvasWidth = cols * avgWidth + (cols + 1) * gap + padding * 2;
    const canvasHeight = rows * avgHeight + (rows + 1) * gap + padding * 2;

    return {
      canvasWidth,
      canvasHeight,
      startX: 0,
      startY: 0,
      gap,
    };
  }
}

/**
 * 默认的 ImageSplitService 实例
 */
export const imageSplitService = new ImageSplitService();
