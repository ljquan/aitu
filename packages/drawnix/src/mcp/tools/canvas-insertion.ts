/**
 * 画布插入 MCP 工具
 *
 * 将AI生成的内容（文本、图片、视频）插入到画布中
 * 支持垂直和水平布局：
 * - 垂直（上→下）：一次AI对话中，上方产物作为下方产物的输入
 * - 水平（左→右）：指定数量时，相同输入的产物横向排列
 */

import type { MCPTool, MCPResult } from '../types';
import { PlaitBoard, Point, getRectangleByElements } from '@plait/core';
import { DrawTransforms } from '@plait/draw';
import { insertImageFromUrl } from '../../data/image';
import { insertVideoFromUrl } from '../../data/video';
import { scrollToPointIfNeeded } from '../../utils/selection-utils';

/**
 * 内容类型
 */
export type ContentType = 'text' | 'image' | 'video' | 'svg';

/**
 * 单个要插入的内容项
 */
export interface InsertionItem {
  /** 内容类型 */
  type: ContentType;
  /** 内容（文本内容或URL） */
  content: string;
  /** 标签/描述，用于显示 */
  label?: string;
  /** 是否为同组内容（相同输入产出，横向排列） */
  groupId?: string;
}

/**
 * 画布插入参数
 */
export interface CanvasInsertionParams {
  /** 要插入的内容列表 */
  items: InsertionItem[];
  /** 起始位置 [leftX, topY]（可选，默认使用当前选中元素或画布底部，左对齐） */
  startPoint?: Point;
  /** 垂直间距（默认50px） */
  verticalGap?: number;
  /** 水平间距（默认20px） */
  horizontalGap?: number;
}

/**
 * 布局常量
 */
const LAYOUT_CONSTANTS = {
  /** 默认垂直间距 */
  DEFAULT_VERTICAL_GAP: 50,
  /** 默认水平间距 */
  DEFAULT_HORIZONTAL_GAP: 20,
  /** 文本默认宽度 */
  TEXT_DEFAULT_WIDTH: 300,
  /** 文本默认高度估算（每行高度） */
  TEXT_LINE_HEIGHT: 24,
  /** 图片/视频默认尺寸 */
  MEDIA_DEFAULT_SIZE: 400,
  /** 最大媒体尺寸 */
  MEDIA_MAX_SIZE: 600,
};

/**
 * Board 引用持有器
 * 由于 MCP 工具是无状态的，需要外部设置 board 引用
 */
let boardRef: PlaitBoard | null = null;

/**
 * 设置 Board 引用
 */
export function setCanvasBoard(board: PlaitBoard | null): void {
  boardRef = board;
  console.log('[CanvasInsertion] Board reference set:', !!board);
}

/**
 * 获取 Board 引用
 */
export function getCanvasBoard(): PlaitBoard | null {
  return boardRef;
}

/**
 * 从保存的选中元素IDs获取起始插入位置（左对齐）
 */
function getStartPointFromSelection(board: PlaitBoard): Point | undefined {
  const appState = (board as any).appState;
  const savedElementIds = appState?.lastSelectedElementIds || [];

  if (savedElementIds.length === 0) {
    return undefined;
  }

  const elements = savedElementIds
    .map((id: string) => board.children.find((el: any) => el.id === id))
    .filter(Boolean);

  if (elements.length === 0) {
    return undefined;
  }

  try {
    const boundingRect = getRectangleByElements(board, elements, false);
    const leftX = boundingRect.x; // 左对齐：使用左边缘X坐标
    const insertionY = boundingRect.y + boundingRect.height + LAYOUT_CONSTANTS.DEFAULT_VERTICAL_GAP;
    return [leftX, insertionY] as Point;
  } catch (error) {
    console.warn('[CanvasInsertion] Error calculating start point:', error);
    return undefined;
  }
}

/**
 * 获取画布底部最后一个元素的位置（左对齐）
 */
function getBottomMostPoint(board: PlaitBoard): Point {
  if (!board.children || board.children.length === 0) {
    return [100, 100] as Point;
  }

  let maxY = 0;
  let maxYLeftX = 100;

  for (const element of board.children) {
    try {
      const rect = getRectangleByElements(board, [element], false);
      const elementBottom = rect.y + rect.height;
      if (elementBottom > maxY) {
        maxY = elementBottom;
        maxYLeftX = rect.x; // 左对齐：使用左边缘X坐标
      }
    } catch {
      // 忽略无法计算矩形的元素
    }
  }

  return [maxYLeftX, maxY + LAYOUT_CONSTANTS.DEFAULT_VERTICAL_GAP] as Point;
}

/**
 * 估算文本内容的尺寸
 */
function estimateTextSize(text: string): { width: number; height: number } {
  const lines = text.split('\n');
  const maxLineLength = Math.max(...lines.map(l => l.length));
  const width = Math.min(maxLineLength * 8, LAYOUT_CONSTANTS.TEXT_DEFAULT_WIDTH);
  const height = lines.length * LAYOUT_CONSTANTS.TEXT_LINE_HEIGHT;
  return { width, height };
}

/**
 * 按组分组内容项
 */
function groupItems(items: InsertionItem[]): InsertionItem[][] {
  const groups: Map<string, InsertionItem[]> = new Map();
  const ungrouped: InsertionItem[] = [];

  for (const item of items) {
    if (item.groupId) {
      const group = groups.get(item.groupId) || [];
      group.push(item);
      groups.set(item.groupId, group);
    } else {
      ungrouped.push(item);
    }
  }

  // 将分组和未分组的项合并，保持顺序
  const result: InsertionItem[][] = [];
  let currentGroupId: string | null = null;

  for (const item of items) {
    if (item.groupId) {
      if (currentGroupId !== item.groupId) {
        currentGroupId = item.groupId;
        const group = groups.get(item.groupId);
        if (group) {
          result.push(group);
        }
      }
    } else {
      result.push([item]);
      currentGroupId = null;
    }
  }

  return result;
}

/**
 * 插入单个文本项到画布
 */
async function insertTextToCanvas(
  board: PlaitBoard,
  text: string,
  point: Point
): Promise<{ width: number; height: number }> {
  DrawTransforms.insertText(board, point, text);
  return estimateTextSize(text);
}

/**
 * 插入单个图片到画布
 */
async function insertImageToCanvas(
  board: PlaitBoard,
  imageUrl: string,
  point: Point
): Promise<{ width: number; height: number }> {
  // skipScroll: true - 由 executeCanvasInsertion 统一处理滚动
  await insertImageFromUrl(board, imageUrl, point, false, undefined, true);
  // 返回默认尺寸，实际尺寸在插入时已处理
  return { width: LAYOUT_CONSTANTS.MEDIA_DEFAULT_SIZE, height: LAYOUT_CONSTANTS.MEDIA_DEFAULT_SIZE };
}

/**
 * 预先获取图片尺寸（用于居中计算）
 */
async function getImageDimensions(imageUrl: string): Promise<{ width: number; height: number }> {
  try {
    const { unifiedCacheService } = await import('../../services/unified-cache-service');
    const { loadHTMLImageElement } = await import('../../data/image');

    // 使用智能图片传递：优先URL，超过1天用base64
    const imageData = await unifiedCacheService.getImageForAI(imageUrl);
    const image = await loadHTMLImageElement(imageData.value, false);

    // 计算显示尺寸（保持宽高比，默认宽度400）
    const defaultImageWidth = 400;
    const targetWidth = Math.min(image.width, defaultImageWidth);
    const aspectRatio = image.height / image.width;
    const targetHeight = targetWidth * aspectRatio;

    return { width: targetWidth, height: targetHeight };
  } catch (error) {
    console.warn('[CanvasInsertion] Failed to get image dimensions:', error);
    return { width: LAYOUT_CONSTANTS.MEDIA_DEFAULT_SIZE, height: LAYOUT_CONSTANTS.MEDIA_DEFAULT_SIZE };
  }
}

/**
 * 插入单个视频到画布
 */
async function insertVideoToCanvas(
  board: PlaitBoard,
  videoUrl: string,
  point: Point
): Promise<{ width: number; height: number }> {
  // 提前获取视频尺寸用于正确的居中计算
  const { getVideoDimensions } = await import('../../data/video');

  try {
    const dimensions = await getVideoDimensions(videoUrl);
    // 计算显示尺寸（保持宽高比，限制最大尺寸）
    const MAX_SIZE = 600;
    let displayWidth = dimensions.width;
    let displayHeight = dimensions.height;

    if (displayWidth > MAX_SIZE || displayHeight > MAX_SIZE) {
      const scale = Math.min(MAX_SIZE / displayWidth, MAX_SIZE / displayHeight);
      displayWidth = Math.round(displayWidth * scale);
      displayHeight = Math.round(displayHeight * scale);
    }

    // skipScroll: true - 由 executeCanvasInsertion 统一处理滚动
    // skipCentering: true - point 已经是左上角坐标（已在 executeCanvasInsertion 中居中计算）
    await insertVideoFromUrl(board, videoUrl, point, false, undefined, true, true);
    return { width: displayWidth, height: displayHeight };
  } catch (error) {
    console.warn('[CanvasInsertion] Failed to get video dimensions, using default:', error);
    // 降级：使用默认尺寸
    await insertVideoFromUrl(board, videoUrl, point, false, undefined, true, true);
    return { width: LAYOUT_CONSTANTS.MEDIA_DEFAULT_SIZE, height: 225 };
  }
}

/**
 * 将SVG代码转换为Data URL
 */
function svgToDataUrl(svg: string): string {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  return `data:image/svg+xml,${encoded}`;
}

/**
 * 规范化SVG代码
 */
function normalizeSvg(svg: string): string {
  let normalized = svg.trim();
  if (!normalized.includes('xmlns=')) {
    normalized = normalized.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return normalized;
}

/**
 * 解析SVG尺寸
 */
function parseSvgDimensions(svg: string): { width: number; height: number } {
  const viewBoxMatch = svg.match(/viewBox=["']([^"']+)["']/i);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/\s+/).map(Number);
    if (parts.length >= 4 && parts[2] && parts[3]) {
      return { width: parts[2], height: parts[3] };
    }
  }
  const widthMatch = svg.match(/width=["'](\d+)(?:px)?["']/i);
  const heightMatch = svg.match(/height=["'](\d+)(?:px)?["']/i);
  if (widthMatch && heightMatch) {
    return { width: parseInt(widthMatch[1]), height: parseInt(heightMatch[1]) };
  }
  return { width: 400, height: 400 };
}

/**
 * 插入单个SVG到画布
 */
async function insertSvgToCanvas(
  board: PlaitBoard,
  svgCode: string,
  point: Point
): Promise<{ width: number; height: number }> {
  const normalized = normalizeSvg(svgCode);
  const dimensions = parseSvgDimensions(normalized);

  // 计算目标尺寸，保持宽高比
  const targetWidth = Math.min(dimensions.width, LAYOUT_CONSTANTS.MEDIA_DEFAULT_SIZE);
  const aspectRatio = dimensions.height / dimensions.width;
  const targetHeight = targetWidth * aspectRatio;

  const dataUrl = svgToDataUrl(normalized);
  const imageItem = {
    url: dataUrl,
    width: targetWidth,
    height: targetHeight,
  };

  DrawTransforms.insertImage(board, imageItem, point);
  return { width: targetWidth, height: targetHeight };
}

/**
 * 执行画布插入
 */
async function executeCanvasInsertion(params: CanvasInsertionParams): Promise<MCPResult> {
  const board = boardRef;

  if (!board) {
    return {
      success: false,
      error: '画布未初始化，请先打开画布',
      type: 'error',
    };
  }

  const { items, verticalGap = LAYOUT_CONSTANTS.DEFAULT_VERTICAL_GAP, horizontalGap = LAYOUT_CONSTANTS.DEFAULT_HORIZONTAL_GAP } = params;

  if (!items || items.length === 0) {
    return {
      success: false,
      error: '没有要插入的内容',
      type: 'error',
    };
  }

  try {
    // 确定起始位置
    let startPoint = params.startPoint;
    if (!startPoint) {
      startPoint = getStartPointFromSelection(board);
    }
    if (!startPoint) {
      startPoint = getBottomMostPoint(board);
    }

    // 按组分组
    const groupedItems = groupItems(items);

    let currentY = startPoint[1];
    const leftX = startPoint[0]; // 改为左对齐：startPoint[0] 是左边缘X坐标
    const insertedItems: { type: ContentType; point: Point }[] = [];

    // 逐组插入
    for (const group of groupedItems) {
      if (group.length === 1) {
        // 单个项，垂直插入
        const item = group[0];
        let itemSize = { width: LAYOUT_CONSTANTS.MEDIA_DEFAULT_SIZE, height: 225 };

        // 预先获取尺寸用于正确的居中计算
        if (item.type === 'text') {
          itemSize = estimateTextSize(item.content);
        } else if (item.type === 'image') {
          // 提前获取图片尺寸
          itemSize = await getImageDimensions(item.content);
        } else if (item.type === 'video') {
          // 提前获取视频尺寸
          try {
            const { getVideoDimensions } = await import('../../data/video');
            const dimensions = await getVideoDimensions(item.content);
            const MAX_SIZE = 600;
            if (dimensions.width > MAX_SIZE || dimensions.height > MAX_SIZE) {
              const scale = Math.min(MAX_SIZE / dimensions.width, MAX_SIZE / dimensions.height);
              itemSize = {
                width: Math.round(dimensions.width * scale),
                height: Math.round(dimensions.height * scale),
              };
            } else {
              itemSize = dimensions;
            }
          } catch (error) {
            console.warn('[CanvasInsertion] Failed to get video dimensions:', error);
            itemSize = { width: LAYOUT_CONSTANTS.MEDIA_DEFAULT_SIZE, height: 225 };
          }
        }

        const point: Point = [leftX, currentY]; // 左对齐：直接使用 leftX

        if (item.type === 'text') {
          await insertTextToCanvas(board, item.content, point);
          currentY += itemSize.height + verticalGap;
        } else if (item.type === 'image') {
          await insertImageToCanvas(board, item.content, point);
          currentY += itemSize.height + verticalGap;
        } else if (item.type === 'video') {
          await insertVideoToCanvas(board, item.content, point);
          currentY += itemSize.height + verticalGap;
        } else if (item.type === 'svg') {
          const svgSize = await insertSvgToCanvas(board, item.content, point);
          currentY += svgSize.height + verticalGap;
        }

        insertedItems.push({ type: item.type, point });
      } else {
        // 多个项（同组），水平排列，从左边缘开始
        let currentX = leftX; // 左对齐：从 leftX 开始
        let maxHeight = 0;

        for (const item of group) {
          const point: Point = [currentX, currentY];

          if (item.type === 'text') {
            const size = await insertTextToCanvas(board, item.content, point);
            maxHeight = Math.max(maxHeight, size.height);
            currentX += size.width + horizontalGap;
          } else if (item.type === 'image') {
            await insertImageToCanvas(board, item.content, point);
            maxHeight = Math.max(maxHeight, LAYOUT_CONSTANTS.MEDIA_DEFAULT_SIZE);
            currentX += LAYOUT_CONSTANTS.MEDIA_DEFAULT_SIZE + horizontalGap;
          } else if (item.type === 'video') {
            await insertVideoToCanvas(board, item.content, point);
            maxHeight = Math.max(maxHeight, 225);
            currentX += LAYOUT_CONSTANTS.MEDIA_DEFAULT_SIZE + horizontalGap;
          } else if (item.type === 'svg') {
            const svgSize = await insertSvgToCanvas(board, item.content, point);
            maxHeight = Math.max(maxHeight, svgSize.height);
            currentX += svgSize.width + horizontalGap;
          }

          insertedItems.push({ type: item.type, point });
        }

        currentY += maxHeight + verticalGap;
      }
    }

    console.log('[CanvasInsertion] Successfully inserted', insertedItems.length, 'items');

    // 插入完成后，滚动到第一个插入元素的位置
    if (insertedItems.length > 0) {
      const firstItem = insertedItems[0];
      // 计算第一个元素的中心点
      const centerPoint: Point = [
        firstItem.point[0] + LAYOUT_CONSTANTS.MEDIA_DEFAULT_SIZE / 2,
        firstItem.point[1] + LAYOUT_CONSTANTS.MEDIA_DEFAULT_SIZE / 2,
      ];
      requestAnimationFrame(() => {
        scrollToPointIfNeeded(board, centerPoint);
      });
    }

    return {
      success: true,
      data: {
        insertedCount: insertedItems.length,
        items: insertedItems,
        // 返回第一个元素的位置，供上层使用
        firstElementPosition: insertedItems.length > 0 ? insertedItems[0].point : undefined,
      },
      type: 'text',
    };
  } catch (error: any) {
    console.error('[CanvasInsertion] Failed to insert content:', error);
    return {
      success: false,
      error: `插入失败: ${error.message || '未知错误'}`,
      type: 'error',
    };
  }
}

/**
 * 画布插入 MCP 工具定义
 */
export const canvasInsertionTool: MCPTool = {
  name: 'insert_to_canvas',
  description: `将内容插入到画布工具。用于将AI生成的文本、图片、视频等内容插入到画布中。

使用场景：
- AI对话产生的Prompt需要显示在画布上
- AI生成的图片需要插入到画布
- AI生成的视频需要插入到画布
- 一次对话中多个产物需要按布局排列

布局规则：
- 垂直布局（默认）：内容从上到下依次排列，表示流程/依赖关系
- 水平布局：同组内容（相同groupId）从左到右排列，表示并列关系

不适用场景：
- 仅生成内容但不需要显示在画布上`,

  inputSchema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: '要插入的内容列表',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: '内容类型：text（文本）、image（图片URL）、video（视频URL）、svg（SVG代码）',
              enum: ['text', 'image', 'video', 'svg'],
            },
            content: {
              type: 'string',
              description: '内容：文本内容或媒体URL',
            },
            label: {
              type: 'string',
              description: '标签/描述（可选）',
            },
            groupId: {
              type: 'string',
              description: '分组ID，相同groupId的内容会水平排列（可选）',
            },
          },
          required: ['type', 'content'],
        },
      },
      verticalGap: {
        type: 'number',
        description: '垂直间距（像素），默认50',
        default: 50,
      },
      horizontalGap: {
        type: 'number',
        description: '水平间距（像素），默认20',
        default: 20,
      },
    },
    required: ['items'],
  },

  execute: async (params: Record<string, unknown>): Promise<MCPResult> => {
    return executeCanvasInsertion(params as unknown as CanvasInsertionParams);
  },
};

/**
 * 便捷函数：快速插入单个内容
 */
export async function quickInsert(
  type: ContentType,
  content: string,
  point?: Point
): Promise<MCPResult> {
  return executeCanvasInsertion({
    items: [{ type, content }],
    startPoint: point,
  });
}

/**
 * 便捷函数：插入一组图片（水平排列）
 */
export async function insertImageGroup(
  imageUrls: string[],
  point?: Point
): Promise<MCPResult> {
  const groupId = `img-group-${Date.now()}`;
  return executeCanvasInsertion({
    items: imageUrls.map(url => ({
      type: 'image' as ContentType,
      content: url,
      groupId,
    })),
    startPoint: point,
  });
}

/**
 * 便捷函数：插入AI对话流程（Prompt → 结果）
 */
export async function insertAIFlow(
  prompt: string,
  results: Array<{ type: 'image' | 'video'; url: string }>,
  point?: Point
): Promise<MCPResult> {
  const items: InsertionItem[] = [
    { type: 'text', content: prompt, label: 'Prompt' },
  ];

  if (results.length === 1) {
    items.push({
      type: results[0].type,
      content: results[0].url,
    });
  } else {
    // 多个结果，水平排列
    const groupId = `result-group-${Date.now()}`;
    results.forEach(r => {
      items.push({
        type: r.type,
        content: r.url,
        groupId,
      });
    });
  }

  return executeCanvasInsertion({
    items,
    startPoint: point,
  });
}
