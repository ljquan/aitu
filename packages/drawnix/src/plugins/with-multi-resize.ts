/**
 * With Multi Resize Plugin
 *
 * 实现多选元素的统一缩放功能
 * 支持 Freehand、PenPath 及其他 Plait 元素的多选缩放
 */

import {
  PlaitBoard,
  Point,
  RectangleClient,
  getSelectedElements,
  getRectangleByElements,
  Transforms,
  PlaitElement,
  createG,
  isSelectionMoving,
  toActiveRectangleFromViewBoxRectangle,
} from '@plait/core';
import {
  withResize,
  ResizeRef,
  ResizeState,
  getRectangleResizeHandleRefs,
  RESIZE_HANDLE_DIAMETER,
  drawHandle,
} from '@plait/common';
import { PlaitDrawElement } from '@plait/draw';
import { Freehand } from './freehand/type';
import { PenPath, PenAnchor } from './pen/type';
import { getFreehandRectangle } from './freehand/utils';
import { getPenPathRectangle } from './pen/utils';
import {
  ResizeHandle,
  calculateResizedRect,
  getShiftKeyState,
} from '../utils/resize-utils';

// 存储多选元素信息的接口
interface MultiResizeInfo {
  elements: PlaitElement[];
  rectangle: RectangleClient;
}

// 存储原始元素状态的接口
interface OriginalElementState {
  element: PlaitElement;
  rectangle: RectangleClient;
}

// 用于存储拖拽开始时的原始元素状态（深拷贝）
// key 是 resize 操作的唯一标识，防止多个 resize 操作冲突
let originalStatesMap: Map<string, OriginalElementState> | null = null;

/**
 * 获取元素的矩形边界
 */
function getElementRectangle(board: PlaitBoard, element: PlaitElement): RectangleClient | null {
  if (Freehand.isFreehand(element)) {
    return getFreehandRectangle(element);
  }
  if (PenPath.isPenPath(element)) {
    return getPenPathRectangle(element);
  }
  // 其他 Plait 元素使用 board.getRectangle
  return board.getRectangle(element);
}

/**
 * 命中测试辅助函数 - 检测点是否在缩放手柄上
 */
function getHitRectangleResizeHandleRef(
  rectangle: RectangleClient,
  point: Point
) {
  const resizeHandleRefs = getRectangleResizeHandleRefs(
    rectangle,
    RESIZE_HANDLE_DIAMETER
  );

  return resizeHandleRefs.find((resizeHandleRef) => {
    return RectangleClient.isHit(
      RectangleClient.getRectangleByPoints([point, point]),
      resizeHandleRef.rectangle
    );
  });
}

/**
 * 检查选中元素是否包含需要特殊处理的类型
 */
function hasCustomResizableElements(elements: PlaitElement[]): boolean {
  return elements.some(
    (el) => Freehand.isFreehand(el) || PenPath.isPenPath(el)
  );
}

/**
 * 获取多选信息
 */
function getMultiResizeInfo(board: PlaitBoard): MultiResizeInfo | null {
  const selectedElements = getSelectedElements(board);
  
  // 需要至少2个元素，且至少包含一个需要特殊处理的元素
  if (selectedElements.length < 2) {
    return null;
  }
  
  if (!hasCustomResizableElements(selectedElements)) {
    return null;
  }

  try {
    const rectangle = getRectangleByElements(board, selectedElements, false);
    return {
      elements: selectedElements,
      rectangle,
    };
  } catch {
    return null;
  }
}

/**
 * 判断当前选中的元素是否可以缩放
 */
function canResize(board: PlaitBoard): boolean {
  return getMultiResizeInfo(board) !== null;
}

/**
 * 命中测试 - 检测鼠标是否点击到缩放手柄
 */
function hitTest(board: PlaitBoard, point: Point) {
  const info = getMultiResizeInfo(board);
  if (!info) {
    return null;
  }

  const handleRef = getHitRectangleResizeHandleRef(info.rectangle, point);

  if (handleRef) {
    // 保存所有选中元素的原始状态（深拷贝）
    // 这样在拖拽过程中元素被修改后，我们仍然可以基于原始状态计算
    originalStatesMap = new Map();
    for (const element of info.elements) {
      const elementRect = getElementRectangle(board, element);
      if (elementRect) {
        // 深拷贝元素，确保原始数据不被修改
        originalStatesMap.set(element.id, {
          element: JSON.parse(JSON.stringify(element)),
          rectangle: { ...elementRect },
        });
      }
    }

    return {
      element: info.elements as any, // 存储所有元素（引用，用于查找路径）
      rectangle: info.rectangle,
      handle: handleRef.handle,
      cursorClass: handleRef.cursorClass,
    };
  }

  return null;
}


/**
 * 缩放 Freehand 元素
 * 使用原始元素状态来计算，避免累积误差
 */
function scaleFreehandElement(
  board: PlaitBoard,
  elementId: string,
  originalElement: Freehand,
  originalElementRect: RectangleClient,
  startRect: RectangleClient,
  newRect: RectangleClient
) {
  const scaleX = newRect.width / startRect.width;
  const scaleY = newRect.height / startRect.height;

  // 计算元素在选区中的相对位置，然后应用缩放
  const relElementX = originalElementRect.x - startRect.x;
  const relElementY = originalElementRect.y - startRect.y;
  const newElementX = newRect.x + relElementX * scaleX;
  const newElementY = newRect.y + relElementY * scaleY;

  // 使用原始元素的 points 计算缩放
  const scaledPoints = originalElement.points.map((p: Point) => {
    // 计算点相对于原始元素矩形的相对位置
    const relX = p[0] - originalElementRect.x;
    const relY = p[1] - originalElementRect.y;
    // 缩放相对位置
    const scaledRelX = relX * scaleX;
    const scaledRelY = relY * scaleY;
    // 加上新的元素位置
    return [
      newElementX + scaledRelX,
      newElementY + scaledRelY,
    ] as Point;
  });

  const path = board.children.findIndex((el: any) => el.id === elementId);
  if (path >= 0) {
    Transforms.setNode(board, { points: scaledPoints } as Partial<Freehand>, [path]);
  }
}

/**
 * 缩放 PenPath 元素
 * 使用原始元素状态来计算，避免累积误差
 */
function scalePenPathElement(
  board: PlaitBoard,
  elementId: string,
  originalElement: PenPath,
  originalElementRect: RectangleClient,
  startRect: RectangleClient,
  newRect: RectangleClient
) {
  const scaleX = newRect.width / startRect.width;
  const scaleY = newRect.height / startRect.height;

  // 计算元素相对于选区的位置
  const relX = originalElementRect.x - startRect.x;
  const relY = originalElementRect.y - startRect.y;
  const newElementX = newRect.x + relX * scaleX;
  const newElementY = newRect.y + relY * scaleY;

  // 使用原始元素的 anchors 计算缩放（相对坐标）
  const scaledAnchors: PenAnchor[] = originalElement.anchors.map((anchor) => ({
    ...anchor,
    point: [anchor.point[0] * scaleX, anchor.point[1] * scaleY] as Point,
    handleIn: anchor.handleIn
      ? [anchor.handleIn[0] * scaleX, anchor.handleIn[1] * scaleY] as Point
      : undefined,
    handleOut: anchor.handleOut
      ? [anchor.handleOut[0] * scaleX, anchor.handleOut[1] * scaleY] as Point
      : undefined,
  }));

  // 计算新的宽高
  const newWidth = originalElementRect.width * scaleX;
  const newHeight = originalElementRect.height * scaleY;

  const newBasePoint: Point = [newElementX, newElementY];
  const newPoints: [Point, Point] = [
    newBasePoint,
    [newElementX + newWidth, newElementY + newHeight],
  ];

  const path = board.children.findIndex((el: any) => el.id === elementId);
  if (path >= 0) {
    Transforms.setNode(
      board,
      { points: newPoints, anchors: scaledAnchors } as Partial<PenPath>,
      [path]
    );
  }
}

/**
 * 缩放通用 Plait 元素（图片、图形等）
 * 使用原始元素状态来计算，避免累积误差
 */
function scaleGenericElement(
  board: PlaitBoard,
  elementId: string,
  originalElement: PlaitElement,
  originalElementRect: RectangleClient,
  startRect: RectangleClient,
  newRect: RectangleClient
) {
  const scaleX = newRect.width / startRect.width;
  const scaleY = newRect.height / startRect.height;

  // 计算元素相对于选区的位置
  const relX = originalElementRect.x - startRect.x;
  const relY = originalElementRect.y - startRect.y;
  const newElementX = newRect.x + relX * scaleX;
  const newElementY = newRect.y + relY * scaleY;

  // 计算新的宽高
  const newWidth = originalElementRect.width * scaleX;
  const newHeight = originalElementRect.height * scaleY;

  const newPoints: [Point, Point] = [
    [newElementX, newElementY],
    [newElementX + newWidth, newElementY + newHeight],
  ];

  const path = board.children.findIndex((el: any) => el.id === elementId);
  if (path >= 0) {
    // 检查是否是图片元素，如果是则同时更新 width 和 height 属性
    // 图片元素的实际渲染尺寸由 width 和 height 属性控制
    if (PlaitDrawElement.isDrawElement(originalElement) && PlaitDrawElement.isImage(originalElement)) {
      Transforms.setNode(
        board,
        {
          points: newPoints,
          width: newWidth,
          height: newHeight,
        } as Partial<PlaitElement>,
        [path]
      );
    } else {
      Transforms.setNode(
        board,
        { points: newPoints } as Partial<PlaitElement>,
        [path]
      );
    }
  }
}

/**
 * 缩放回调 - 当用户拖拽缩放手柄时调用
 */
function onResize(
  board: PlaitBoard,
  resizeRef: ResizeRef<PlaitElement[], ResizeHandle>,
  resizeState: ResizeState
): void {
  const { element: elements, rectangle: startRectangle, handle } = resizeRef;
  const { startPoint, endPoint } = resizeState;

  if (!startRectangle || !Array.isArray(elements) || !originalStatesMap) {
    return;
  }

  const dx = endPoint[0] - startPoint[0];
  const dy = endPoint[1] - startPoint[1];

  // 使用公共函数计算新矩形，支持 Shift 锁定比例
  const newRect = calculateResizedRect(
    startRectangle,
    handle,
    dx,
    dy,
    getShiftKeyState() // Shift 键锁定比例
  );

  // 缩放所有选中的元素（使用原始状态计算，避免累积误差）
  for (const element of elements) {
    const originalState = originalStatesMap.get(element.id);
    if (!originalState) {
      continue;
    }

    const { element: originalElement, rectangle: originalElementRect } = originalState;

    if (Freehand.isFreehand(originalElement)) {
      scaleFreehandElement(
        board,
        element.id,
        originalElement as Freehand,
        originalElementRect,
        startRectangle,
        newRect
      );
    } else if (PenPath.isPenPath(originalElement)) {
      scalePenPathElement(
        board,
        element.id,
        originalElement as PenPath,
        originalElementRect,
        startRectangle,
        newRect
      );
    } else {
      // 其他类型的元素（图片、图形等）
      scaleGenericElement(
        board,
        element.id,
        originalElement,
        originalElementRect,
        startRectangle,
        newRect
      );
    }
  }
}

/**
 * 生成多选缩放控制点
 */
function generatorResizeHandles(board: PlaitBoard): SVGGElement | null {
  const selectedElements = getSelectedElements(board);
  
  // 需要至少2个元素，且至少包含一个需要特殊处理的元素
  if (selectedElements.length < 2 || !hasCustomResizableElements(selectedElements)) {
    return null;
  }

  try {
    const handleG = createG();
    const boundingRectangle = getRectangleByElements(board, selectedElements, false);
    const boundingActiveRectangle = toActiveRectangleFromViewBoxRectangle(board, boundingRectangle);
    const corners = RectangleClient.getCornerPoints(boundingActiveRectangle);
    
    corners.forEach((corner) => {
      const g = drawHandle(board, corner);
      handleG.append(g);
    });
    
    return handleG;
  } catch {
    return null;
  }
}

/**
 * 多选缩放插件
 */
export const withMultiResize = (board: PlaitBoard) => {
  const { afterChange } = board;
  
  // 用于存储控制点的 SVG 组
  let handleG: SVGGElement | null = null;
  
  // 添加 afterChange 钩子来渲染控制点
  board.afterChange = () => {
    afterChange();
    
    // 移除旧的控制点
    if (handleG) {
      handleG.remove();
      handleG = null;
    }
    
    // 检查是否需要渲染多选控制点
    const selectedElements = getSelectedElements(board);
    if (
      selectedElements.length > 1 &&
      hasCustomResizableElements(selectedElements) &&
      !isSelectionMoving(board)
    ) {
      handleG = generatorResizeHandles(board);
      if (handleG) {
        PlaitBoard.getActiveHost(board).append(handleG);
      }
    }
  };
  
  return withResize<PlaitElement[], ResizeHandle>(board, {
    key: 'multi-resize',
    canResize: () => canResize(board),
    hitTest: (point: Point) => hitTest(board, point),
    onResize: (resizeRef, resizeState) => onResize(board, resizeRef, resizeState),
  });
};
