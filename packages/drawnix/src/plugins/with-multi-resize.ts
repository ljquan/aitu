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
  toHostPoint,
  toViewBoxPoint,
} from '@plait/core';
import {
  withResize,
  ResizeRef,
  ResizeState,
  getRectangleResizeHandleRefs,
  RESIZE_HANDLE_DIAMETER,
  drawHandle,
  normalizeShapePoints,
  ResizeHandle as PlaitResizeHandle,
} from '@plait/common';
import { PlaitDrawElement, PlaitText } from '@plait/draw';
import { DEFAULT_FONT_SIZE } from '@plait/text-plugins';
import { Freehand } from './freehand/type';
import { PenPath, PenAnchor } from './pen/type';
import { getFreehandRectangle } from './freehand/utils';
import { getPenPathRectangle } from './pen/utils';
import {
  ResizeHandle,
  calculateResizedRect,
} from '../utils/resize-utils';

// 与 with-text-resize 一致：文本框最小尺寸，用于多选时取「所有元素最小缩放」的最大值，避免任意元素溢出
const MIN_BOX_SIZE = 10;
const LINE_HEIGHT_FACTOR = 1.4;
const MIN_TEXT_BOX_HEIGHT = DEFAULT_FONT_SIZE * LINE_HEIGHT_FACTOR;

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
 * 递归缩放文本节点的 font-size（与 with-text-resize 一致，供多选缩放文本框时使用）
 */
function scaleTextContent(node: any, scaleFactor: number): any {
  if (!node) return node;
  if ('text' in node && typeof node.text === 'string') {
    const cur = node['font-size']
      ? parseFloat(node['font-size'])
      : DEFAULT_FONT_SIZE;
    const next = Math.max(1, parseFloat((cur * scaleFactor).toFixed(1)));
    return { ...node, 'font-size': `${next}` };
  }
  if ('children' in node && Array.isArray(node.children)) {
    return {
      ...node,
      children: node.children.map((c: any) => scaleTextContent(c, scaleFactor)),
    };
  }
  return node;
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
 * 检查选中元素是否包含需要特殊处理的类型（手绘、钢笔等）
 */
function hasCustomResizableElements(elements: PlaitElement[]): boolean {
  return elements.some(
    (el) => Freehand.isFreehand(el) || PenPath.isPenPath(el)
  );
}

/**
 * 检查选中元素是否全部为 Draw 元素（文本框、图形、图片等，用于多选仅角点缩放）
 */
function hasOnlyDrawElements(elements: PlaitElement[]): boolean {
  return (
    elements.length >= 2 &&
    elements.every((el) => PlaitDrawElement.isDrawElement(el))
  );
}

/**
 * 获取多选信息
 * 多选时统一由此插件处理，只显示四角手柄、等比例缩放，且不允许边中点横向/纵向单独拖拽
 */
function getMultiResizeInfo(board: PlaitBoard): MultiResizeInfo | null {
  const selectedElements = getSelectedElements(board);

  if (selectedElements.length < 2) {
    return null;
  }

  const custom = hasCustomResizableElements(selectedElements);
  const onlyDraw = hasOnlyDrawElements(selectedElements);
  if (!custom && !onlyDraw) {
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
  if (!handleRef) return null;

  // 多选与单选文本框一致：只允许角点拖拽等比缩放，不允许边中点单独横向/纵向拖动
  const handleIndex = parseInt(handleRef.handle as string, 10);
  if (handleIndex >= 4) return null;

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
    } else if (PlaitDrawElement.isText(originalElement)) {
      const scale = newWidth / originalElementRect.width;
      const textEl = originalElement as PlaitText;
      const scaledText =
        textEl.text && Math.abs(scale - 1) > 0.001
          ? scaleTextContent(textEl.text, scale)
          : textEl.text;
      Transforms.setNode(
        board,
        {
          points: normalizeShapePoints(newPoints),
          textHeight: newHeight,
          text: scaledText,
          autoSize: false,
        } as Partial<PlaitText>,
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
 * 单元素允许的最小缩放比（再小会溢出或过小），与 with-text-resize 一致
 */
function getMinScaleForElement(
  element: PlaitElement,
  rect: RectangleClient
): number {
  const w = rect.width;
  const h = rect.height;
  if (PlaitDrawElement.isText(element)) {
    const minScale = Math.max(MIN_BOX_SIZE / w, MIN_TEXT_BOX_HEIGHT / h);
    return Math.min(1, minScale);
  }
  const minDim = Math.min(w, h);
  if (minDim <= 0) return 0;
  const minScale = MIN_BOX_SIZE / minDim;
  return Math.min(1, minScale);
}

/**
 * 按等比 scale 从固定角计算新矩形（仅角点 0-3）
 */
function rectFromUniformScale(
  startRect: RectangleClient,
  handle: string,
  scale: number
): RectangleClient {
  const w = startRect.width * scale;
  const h = startRect.height * scale;
  const x = startRect.x;
  const y = startRect.y;
  switch (handle) {
    case '0': // NW
      return { x: x + startRect.width - w, y: y + startRect.height - h, width: w, height: h };
    case '1': // NE
      return { x, y: y + startRect.height - h, width: w, height: h };
    case '3': // SW
      return { x: x + startRect.width - w, y, width: w, height: h };
    case '2': // SE
    default:
      return { x, y, width: w, height: h };
  }
}

/**
 * 缩放回调 - 当用户拖拽缩放手柄时调用
 * 多选整体最小缩放取「选中元素各自最小缩放」的最大值，避免任意元素溢出
 */
function onResize(
  board: PlaitBoard,
  resizeRef: ResizeRef<PlaitElement[], PlaitResizeHandle>,
  resizeState: ResizeState
): void {
  const { element: elements, rectangle: startRectangle, handle } = resizeRef;
  const { startPoint, endPoint } = resizeState;

  if (!startRectangle || !Array.isArray(elements) || !originalStatesMap) {
    return;
  }

  const dx = endPoint[0] - startPoint[0];
  const dy = endPoint[1] - startPoint[1];

  // 多选与单选文本框一致：始终等比例缩放；handle 为 @plait/common 枚举，值与本地 ResizeHandle 一致 ("0"-"7")
  let newRect = calculateResizedRect(
    startRectangle,
    handle as unknown as ResizeHandle,
    dx,
    dy,
    true,
    20
  );

  let scale = newRect.width / startRectangle.width;
  // 取多选内「限制缩放内容」的最大值作为整体下限，避免任意元素溢出
  let maxMinScale = 0;
  for (const element of elements) {
    const state = originalStatesMap.get(element.id);
    if (state) {
      const minS = getMinScaleForElement(state.element, state.rectangle);
      if (minS > maxMinScale) maxMinScale = minS;
    }
  }
  if (scale < maxMinScale) {
    scale = maxMinScale;
    newRect = rectFromUniformScale(startRectangle, handle, scale);
  }

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
    
    // 检查是否需要渲染多选控制点（含「仅 draw 元素」多选，保证只显示四角）
    const multiResizeInfo = getMultiResizeInfo(board);
    if (
      multiResizeInfo !== null &&
      !isSelectionMoving(board)
    ) {
      handleG = generatorResizeHandles(board);
      if (handleG) {
        const host = PlaitBoard.getActiveHost(board);
        // 多选时只保留本插件的四角手柄，移除 draw 的 8 手柄组，避免出现边中点
        Array.from(host.children).forEach((el) => {
          if (
            el instanceof SVGGElement &&
            el !== handleG &&
            el.querySelector('.resize-handle')
          ) {
            el.remove();
          }
        });
        host.append(handleG);
      }
    }
  };
  
  const result = withResize<PlaitElement[], PlaitResizeHandle>(board, {
    key: 'multi-resize',
    canResize: () => canResize(board),
    hitTest: (point: Point) => hitTest(board, point),
    onResize: (resizeRef, resizeState) => onResize(board, resizeRef, resizeState),
  });

  // 多选时只允许角点缩放：若点击在边中点上，吞掉事件，不交给下层 draw 的 8 手柄逻辑
  const prevPointerDown = result.pointerDown;
  result.pointerDown = (event: PointerEvent) => {
    const info = getMultiResizeInfo(result);
    if (info) {
      const point = toViewBoxPoint(
        result,
        toHostPoint(result, event.x, event.y)
      ) as Point;
      const handleRef = getHitRectangleResizeHandleRef(info.rectangle, point);
      const handleIndex =
        handleRef != null
          ? parseInt(handleRef.handle as string, 10)
          : -1;
      if (handleRef != null && handleIndex >= 4) {
        return;
      }
    }
    prevPointerDown(event);
  };

  // 多选时悬停在边中点上不显示横向/纵向箭头：不交给 draw 的 pointerMove，并清除可能的光标
  const RESIZE_CURSOR_CLASSES = ['ns-resize', 'ew-resize', 'nwse-resize', 'nesw-resize'];
  const prevPointerMove = result.pointerMove;
  result.pointerMove = (event: PointerEvent) => {
    const info = getMultiResizeInfo(result);
    if (info) {
      const point = toViewBoxPoint(
        result,
        toHostPoint(result, event.x, event.y)
      ) as Point;
      const handleRef = getHitRectangleResizeHandleRef(info.rectangle, point);
      if (handleRef) {
        const handleIndex = parseInt(handleRef.handle as string, 10);
        if (handleIndex >= 4) {
          RESIZE_CURSOR_CLASSES.forEach((cls) =>
            PlaitBoard.getBoardContainer(result).classList.remove(cls)
          );
          return;
        }
      }
    }
    prevPointerMove(event);
  };

  return result;
};
