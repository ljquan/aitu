/**
 * 插入工具函数
 * 
 * 提供画布元素插入相关的公共工具函数
 * 
 * 核心功能：
 * - 元素插入后获取实际渲染尺寸
 * - 检测新插入元素与现有元素的重叠情况
 * - 自动将重叠元素移动到不重叠的位置
 * - 支持思维导图等动态尺寸元素的正确处理
 */

import {
  getViewportOrigination,
  PlaitBoard,
  PlaitElement,
  PlaitGroupElement,
  Point,
  RectangleClient,
  WritableClipboardOperationType,
  getRectangleByElements,
  Transforms,
} from '@plait/core';
import { getSmartInsertionPoint, scrollToPointIfNeeded } from '../../../utils/selection-utils';

/**
 * 代码块提取结果
 */
export interface CodeBlockResult {
  content: string;
  language: string;
}

/**
 * 插入结果
 */
export interface InsertResult {
  success: boolean;
  elementsCount?: number;
  error?: string;
}

/**
 * 边界框接口
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 默认安全间距（元素之间的最小距离）
const DEFAULT_PADDING = 20;
// 向下移动的步长
const STEP_SIZE = 50;
// 最大搜索次数，防止无限循环
const MAX_ITERATIONS = 100;

/**
 * 从 markdown 代码块中提取代码
 * 支持 ```language 格式的代码块
 * 
 * @param input 输入字符串
 * @param language 要提取的语言标识（如 'mermaid', 'markdown'）
 * @returns 提取的代码内容，如果没有代码块则返回原始输入
 */
export function extractCodeBlock(input: string, language?: string): string {
  if (language) {
    // 尝试提取指定语言的代码块
    const regex = new RegExp(`\`\`\`(?:${language}|${language.charAt(0).toUpperCase() + language.slice(1)})\\s*([\\s\\S]*?)\`\`\``, 'i');
    const match = input.match(regex);
    if (match) {
      return match[1].trim();
    }
  }

  // 尝试提取任意代码块
  const genericBlockRegex = /```(?:\w+)?\s*([\s\S]*?)```/;
  const genericMatch = input.match(genericBlockRegex);
  if (genericMatch) {
    return genericMatch[1].trim();
  }

  // 如果没有代码块，返回原始输入（去除首尾空白）
  return input.trim();
}

/**
 * 计算元素的边界矩形
 */
export function calculateElementsBoundingRect(elements: PlaitElement[]): RectangleClient {
  return RectangleClient.getBoundingRectangle(
    elements
      .filter((ele) => !PlaitGroupElement.isGroup(ele))
      .map((ele) =>
        RectangleClient.getRectangleByPoints(ele.points as Point[])
      )
  );
}

/**
 * 检测两个边界框是否重叠
 * 
 * @param box1 第一个边界框
 * @param box2 第二个边界框
 * @param padding 安全间距，默认为 DEFAULT_PADDING
 * @returns 是否重叠
 */
export function isOverlapping(box1: BoundingBox, box2: BoundingBox, padding: number = DEFAULT_PADDING): boolean {
  // 考虑安全间距的 AABB 碰撞检测
  const left1 = box1.x - padding;
  const right1 = box1.x + box1.width + padding;
  const top1 = box1.y - padding;
  const bottom1 = box1.y + box1.height + padding;

  const left2 = box2.x;
  const right2 = box2.x + box2.width;
  const top2 = box2.y;
  const bottom2 = box2.y + box2.height;

  // 如果任一边界不相交，则不重叠
  return !(right1 < left2 || left1 > right2 || bottom1 < top2 || top1 > bottom2);
}

/**
 * 获取画布上所有元素的边界框
 * 
 * @param board 画布实例
 * @returns 所有元素的边界框数组
 */
export function getAllElementBoundingBoxes(board: PlaitBoard): BoundingBox[] {
  const boxes: BoundingBox[] = [];

  if (!board.children || board.children.length === 0) {
    return boxes;
  }

  for (const element of board.children) {
    try {
      const rect = getRectangleByElements(board, [element as PlaitElement], false);
      boxes.push({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    } catch (error) {
      // 忽略无法获取边界框的元素
      console.warn('[InsertUtils] Failed to get bounding box for element:', error);
    }
  }

  return boxes;
}

/**
 * 检测新元素边界框是否与任何现有元素重叠
 * 
 * @param newBox 新元素的边界框
 * @param existingBoxes 现有元素的边界框数组
 * @param padding 安全间距
 * @returns 是否有重叠
 */
export function hasOverlapWithAny(newBox: BoundingBox, existingBoxes: BoundingBox[], padding: number = DEFAULT_PADDING): boolean {
  for (const box of existingBoxes) {
    if (isOverlapping(newBox, box, padding)) {
      return true;
    }
  }
  return false;
}

/**
 * 查找不与现有元素重叠的插入位置
 * 从初始位置开始，向下搜索直到找到不重叠的位置
 * 
 * @param initialPoint 初始插入位置（左上角坐标）
 * @param newElementSize 新元素的尺寸
 * @param existingBoxes 现有元素的边界框数组
 * @param padding 安全间距
 * @param stepSize 每次向下移动的步长
 * @returns 不重叠的插入位置
 */
export function findNonOverlappingPosition(
  initialPoint: Point,
  newElementSize: { width: number; height: number },
  existingBoxes: BoundingBox[],
  padding: number = DEFAULT_PADDING,
  stepSize: number = STEP_SIZE
): Point {
  let currentPoint: Point = [...initialPoint] as Point;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    const newBox: BoundingBox = {
      x: currentPoint[0],
      y: currentPoint[1],
      width: newElementSize.width,
      height: newElementSize.height,
    };

    if (!hasOverlapWithAny(newBox, existingBoxes, padding)) {
      // 找到不重叠的位置
      console.log('[InsertUtils] Found non-overlapping position after', iterations, 'iterations:', currentPoint);
      return currentPoint;
    }

    // 向下移动
    currentPoint = [currentPoint[0], currentPoint[1] + stepSize] as Point;
    iterations++;
  }

  // 如果达到最大迭代次数，返回当前位置
  console.warn('[InsertUtils] Max iterations reached, returning current position:', currentPoint);
  return currentPoint;
}

/**
 * 计算插入位置（带重叠检测）
 * 优先使用选中元素下方位置，否则使用画布中心位置
 * 然后进行重叠检测，确保不与现有元素重叠
 * 
 * @param board 画布实例
 * @param elements 要插入的元素
 * @returns 插入位置坐标
 */
export function getInsertionPoint(board: PlaitBoard, elements: PlaitElement[]): Point {
  // 计算新元素的边界矩形
  const elementRectangle = calculateElementsBoundingRect(elements);
  const newElementWidth = elementRectangle.width;
  const newElementHeight = elementRectangle.height;

  // 获取所有现有元素的边界框
  const existingBoxes = getAllElementBoundingBoxes(board);

  let initialPoint: Point;

  // 1. 优先尝试获取选中元素下方的插入点
  const smartPoint = getSmartInsertionPoint(board);
  if (smartPoint) {
    // smartPoint 返回的是中心X坐标，需要调整为左上角
    initialPoint = [
      smartPoint[0] - newElementWidth / 2,
      smartPoint[1],
    ] as Point;
  } else if (existingBoxes.length > 0) {
    // 2. 如果没有选中元素但有现有元素，找到最下方元素的底部位置
    let maxBottomY = -Infinity;
    let bottomElementCenterX = 0;

    for (const box of existingBoxes) {
      const bottomY = box.y + box.height;
      if (bottomY > maxBottomY) {
        maxBottomY = bottomY;
        bottomElementCenterX = box.x + box.width / 2;
      }
    }

    initialPoint = [
      bottomElementCenterX - newElementWidth / 2,
      maxBottomY + STEP_SIZE,
    ] as Point;
  } else {
    // 3. 如果画布为空，使用画布中心位置
    const boardContainerRect = PlaitBoard.getBoardContainer(board).getBoundingClientRect();
    const focusPoint = [
      boardContainerRect.width / 2,
      boardContainerRect.height / 2,
    ];
    const zoom = board.viewport.zoom;
    const origination = getViewportOrigination(board);
    const centerX = origination![0] + focusPoint[0] / zoom;
    const centerY = origination![1] + focusPoint[1] / zoom;

    initialPoint = [
      centerX - newElementWidth / 2,
      centerY - newElementHeight / 2,
    ] as Point;
  }

  // 4. 进行重叠检测，找到不重叠的位置
  const finalPoint = findNonOverlappingPosition(
    initialPoint,
    { width: newElementWidth, height: newElementHeight },
    existingBoxes
  );

  return finalPoint;
}

/**
 * 获取元素在画布中的实际边界框（基于渲染后的尺寸）
 * 
 * @param board 画布实例
 * @param element 元素
 * @returns 边界框，如果获取失败返回 null
 */
export function getElementActualBoundingBox(board: PlaitBoard, element: PlaitElement): BoundingBox | null {
  try {
    const rect = getRectangleByElements(board, [element], false);
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  } catch (error) {
    console.warn('[InsertUtils] Failed to get actual bounding box:', error);
    return null;
  }
}

/**
 * 获取除指定元素外的所有元素边界框
 * 
 * @param board 画布实例
 * @param excludeIds 要排除的元素 ID 集合
 * @returns 边界框数组
 */
export function getOtherElementBoundingBoxes(board: PlaitBoard, excludeIds: Set<string>): BoundingBox[] {
  const boxes: BoundingBox[] = [];

  if (!board.children || board.children.length === 0) {
    return boxes;
  }

  for (const element of board.children) {
    const el = element as PlaitElement;
    if (excludeIds.has(el.id)) {
      continue;
    }
    try {
      const rect = getRectangleByElements(board, [el], false);
      boxes.push({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    } catch (error) {
      // 忽略无法获取边界框的元素
    }
  }

  return boxes;
}

/**
 * 移动元素到新位置
 * 
 * @param board 画布实例
 * @param element 要移动的元素
 * @param deltaX X 方向偏移量
 * @param deltaY Y 方向偏移量
 * @returns 是否移动成功
 */
export function moveElement(board: PlaitBoard, element: PlaitElement, deltaX: number, deltaY: number): boolean {
  try {
    const path = board.children.findIndex((child) => (child as PlaitElement).id === element.id);
    if (path < 0) {
      console.warn('[InsertUtils] Element not found in board:', element.id);
      return false;
    }

    // 获取当前 points 并计算新位置
    const currentPoints = element.points as Point[];
    if (!currentPoints || currentPoints.length === 0) {
      console.warn('[InsertUtils] Element has no points:', element.id);
      return false;
    }

    // 移动所有点
    const newPoints = currentPoints.map((point) => [
      point[0] + deltaX,
      point[1] + deltaY,
    ] as Point);

    Transforms.setNode(board, { points: newPoints }, [path]);
    console.log('[InsertUtils] Moved element', element.id, 'by', deltaX, deltaY);
    return true;
  } catch (error) {
    console.error('[InsertUtils] Failed to move element:', error);
    return false;
  }
}

/**
 * 计算初始插入位置（不进行重叠检测）
 * 
 * @param board 画布实例
 * @returns 初始插入位置
 */
export function getInitialInsertionPoint(board: PlaitBoard): Point {
  // 1. 优先尝试获取选中元素下方的插入点
  const smartPoint = getSmartInsertionPoint(board);
  if (smartPoint) {
    return smartPoint;
  }

  // 2. 如果没有选中元素但有现有元素，找到最下方元素的底部位置
  const existingBoxes = getAllElementBoundingBoxes(board);
  if (existingBoxes.length > 0) {
    let maxBottomY = -Infinity;
    let bottomElementCenterX = 0;

    for (const box of existingBoxes) {
      const bottomY = box.y + box.height;
      if (bottomY > maxBottomY) {
        maxBottomY = bottomY;
        bottomElementCenterX = box.x + box.width / 2;
      }
    }

    return [bottomElementCenterX, maxBottomY + STEP_SIZE] as Point;
  }

  // 3. 如果画布为空，使用画布中心位置
  const boardContainerRect = PlaitBoard.getBoardContainer(board).getBoundingClientRect();
  const focusPoint = [
    boardContainerRect.width / 2,
    boardContainerRect.height / 2,
  ];
  const zoom = board.viewport.zoom;
  const origination = getViewportOrigination(board);
  const centerX = origination![0] + focusPoint[0] / zoom;
  const centerY = origination![1] + focusPoint[1] / zoom;

  return [centerX, centerY] as Point;
}

/**
 * 插入后重叠检测并调整位置
 * 
 * 核心算法：
 * 1. 获取新插入元素的实际渲染边界
 * 2. 获取其他所有元素的边界框
 * 3. 检测是否有重叠
 * 4. 如果重叠，向下移动直到找到不重叠的位置
 * 
 * @param board 画布实例
 * @param newElementIds 新插入元素的 ID 集合
 * @returns 是否进行了位置调整
 */
export function adjustOverlappingElements(board: PlaitBoard, newElementIds: Set<string>): boolean {
  let adjusted = false;

  for (const elementId of newElementIds) {
    const element = board.children.find((child) => (child as PlaitElement).id === elementId) as PlaitElement;
    if (!element) {
      continue;
    }

    // 获取新元素的实际边界框
    const newElementBox = getElementActualBoundingBox(board, element);
    if (!newElementBox) {
      continue;
    }

    // 获取其他元素的边界框
    const otherBoxes = getOtherElementBoundingBoxes(board, newElementIds);
    if (otherBoxes.length === 0) {
      continue;
    }

    // 检测是否重叠
    if (!hasOverlapWithAny(newElementBox, otherBoxes, DEFAULT_PADDING)) {
      continue;
    }

    console.log('[InsertUtils] Detected overlap for element:', elementId, 'at', newElementBox);

    // 查找不重叠的位置
    const nonOverlapPoint = findNonOverlappingPosition(
      [newElementBox.x, newElementBox.y] as Point,
      { width: newElementBox.width, height: newElementBox.height },
      otherBoxes,
      DEFAULT_PADDING,
      STEP_SIZE
    );

    // 计算偏移量
    const deltaX = nonOverlapPoint[0] - newElementBox.x;
    const deltaY = nonOverlapPoint[1] - newElementBox.y;

    if (deltaX !== 0 || deltaY !== 0) {
      if (moveElement(board, element, deltaX, deltaY)) {
        adjusted = true;
        console.log('[InsertUtils] Adjusted element position:', elementId, 'delta:', deltaX, deltaY);
      }
    }
  }

  return adjusted;
}

/**
 * 将元素插入到画布（带插入后重叠检测）
 * 
 * 实现"先插入、后检测、再调整"的策略：
 * 1. 记录插入前的元素 ID
 * 2. 执行 insertFragment 插入元素
 * 3. 找出新插入的元素
 * 4. 获取新元素的实际渲染尺寸
 * 5. 检测重叠并调整位置
 * 
 * @param board 画布实例
 * @param elements 要插入的元素
 * @param insertionPoint 可选的插入位置，如果不提供则自动计算
 * @returns 插入结果
 */
export function insertElementsToCanvas(
  board: PlaitBoard,
  elements: PlaitElement[],
  insertionPoint?: Point
): InsertResult {
  if (!elements || elements.length === 0) {
    return {
      success: false,
      error: '没有可插入的元素',
    };
  }

  try {
    // 1. 记录插入前的元素 ID
    const existingIds = new Set<string>(
      board.children.map((child) => (child as PlaitElement).id)
    );

    // 2. 计算初始插入位置
    const point = insertionPoint || getInitialInsertionPoint(board);

    // 3. 插入到画布
    board.insertFragment(
      { elements: JSON.parse(JSON.stringify(elements)) },
      point,
      WritableClipboardOperationType.paste
    );

    console.log('[InsertUtils] Inserted', elements.length, 'elements to canvas at', point);

    // 4. 找出新插入的元素 ID
    const newElementIds = new Set<string>();
    for (const child of board.children) {
      const el = child as PlaitElement;
      if (!existingIds.has(el.id)) {
        newElementIds.add(el.id);
      }
    }

    console.log('[InsertUtils] New element IDs:', Array.from(newElementIds));

    // 5. 插入后重叠检测并调整位置
    if (newElementIds.size > 0) {
      // 使用 requestAnimationFrame 确保元素已渲染
      requestAnimationFrame(() => {
        const adjusted = adjustOverlappingElements(board, newElementIds);
        if (adjusted) {
          console.log('[InsertUtils] Adjusted overlapping elements');
        }

        // 6. 滚动视口到新元素位置（如果不在视口内）
        if (point) {
          scrollToPointIfNeeded(board, point);
        }
      });
    } else if (point) {
      // 如果没有新元素需要调整，直接滚动
      requestAnimationFrame(() => {
        scrollToPointIfNeeded(board, point);
      });
    }

    return {
      success: true,
      elementsCount: elements.length,
    };
  } catch (error: any) {
    console.error('[InsertUtils] Failed to insert elements:', error);
    return {
      success: false,
      error: error.message || '插入元素失败',
    };
  }
}
