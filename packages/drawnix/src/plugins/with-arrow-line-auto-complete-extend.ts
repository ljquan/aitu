import {
  PlaitBoard,
  PlaitElement,
  rotateAntiPointsByElement,
  toActivePoint,
  Transforms,
  Direction,
  rotatePointsByElement,
  RectangleClient,
} from '@plait/core';
import {
  BasicShapes,
  createDefaultGeometry,
  DrawPointerType,
  getAutoCompletePoints,
  getHitIndexOfAutoCompletePoint,
  getSelectedDrawElements,
  PlaitDrawElement,
  insertElement,
  createArrowLineElement,
  ArrowLineShape,
  ArrowLineMarkerType,
  getHitConnection,
  GeometryShapes,
} from '@plait/draw';
import { getDirectionByIndex } from '@plait/common';

/**
 * 自动完成形状选择状态
 */
export interface AutoCompleteShapeState {
  /** 是否显示形状选择器 */
  visible: boolean;
  /** 选择器位置（屏幕坐标） */
  position: { x: number; y: number };
  /** 当前源元素 */
  sourceElement: PlaitElement | null;
  /** 当前源元素的形状 */
  currentShape: DrawPointerType | null;
  /** hover 的连接点索引 */
  hitIndex: number;
  /** hover 的连接点坐标 (viewBox 坐标，用于创建元素) */
  hitPoint: [number, number] | null;
}

const initialState: AutoCompleteShapeState = {
  visible: false,
  position: { x: 0, y: 0 },
  sourceElement: null,
  currentShape: null,
  hitIndex: -1,
  hitPoint: null,
};

// WeakMap 存储每个 board 的状态
const BOARD_TO_AUTO_COMPLETE_STATE = new WeakMap<PlaitBoard, AutoCompleteShapeState>();
const BOARD_TO_STATE_CALLBACK = new WeakMap<PlaitBoard, (state: AutoCompleteShapeState) => void>();

/**
 * 获取 board 的自动完成状态
 */
export function getAutoCompleteState(board: PlaitBoard): AutoCompleteShapeState {
  return BOARD_TO_AUTO_COMPLETE_STATE.get(board) || initialState;
}

/**
 * 设置 board 的自动完成状态
 */
export function setAutoCompleteState(board: PlaitBoard, state: AutoCompleteShapeState): void {
  BOARD_TO_AUTO_COMPLETE_STATE.set(board, state);
  const callback = BOARD_TO_STATE_CALLBACK.get(board);
  if (callback) {
    callback(state);
  }
}

/**
 * 注册状态变化回调
 */
export function registerAutoCompleteStateCallback(
  board: PlaitBoard,
  callback: (state: AutoCompleteShapeState) => void
): () => void {
  BOARD_TO_STATE_CALLBACK.set(board, callback);
  return () => {
    BOARD_TO_STATE_CALLBACK.delete(board);
  };
}

/**
 * 重置自动完成状态
 */
export function resetAutoCompleteState(board: PlaitBoard): void {
  setAutoCompleteState(board, initialState);
}

// 新形状与源元素的默认距离（viewBox 坐标系中的距离）
const AUTO_COMPLETE_DISTANCE = 100;

/**
 * 创建并插入连接线和新形状
 * 参考 @plait/draw 原生 withArrowLineAutoComplete 实现
 */
export function createAutoCompleteElements(
  board: PlaitBoard,
  sourceElement: PlaitDrawElement,
  hitIndex: number,
  hitPoint: [number, number],
  targetShape: DrawPointerType
): void {
  // 获取方向（0: 右, 1: 下, 2: 左, 3: 上）
  const direction = getDirectionByIndex(hitIndex);
  
  // 使用源元素的尺寸来计算新形状的大小（与源元素保持一致）
  const sourceRect = RectangleClient.getRectangleByPoints(sourceElement.points);
  const sourceWidth = sourceRect.width;
  const sourceHeight = sourceRect.height;
  const sourceCenterX = sourceRect.x + sourceWidth / 2;
  const sourceCenterY = sourceRect.y + sourceHeight / 2;
  
  // 获取源元素边缘中心点作为箭头线起点（viewBox 坐标）
  const sourceEdgeCenterPoints = RectangleClient.getEdgeCenterPoints(sourceRect);
  const arrowLineStartPoint = sourceEdgeCenterPoints[hitIndex];
  
  // 计算新形状的中心位置（基于源形状中心对齐）
  // 水平方向：新形状与源形状垂直居中对齐
  // 垂直方向：新形状与源形状水平居中对齐
  let newCenterX: number;
  let newCenterY: number;
  
  switch (direction) {
    case Direction.right:
      // 新形状在源元素右侧，垂直居中
      newCenterX = sourceCenterX + sourceWidth / 2 + AUTO_COMPLETE_DISTANCE + sourceWidth / 2;
      newCenterY = sourceCenterY;
      break;
    case Direction.bottom:
      // 新形状在源元素下方，水平居中
      newCenterX = sourceCenterX;
      newCenterY = sourceCenterY + sourceHeight / 2 + AUTO_COMPLETE_DISTANCE + sourceHeight / 2;
      break;
    case Direction.left:
      // 新形状在源元素左侧，垂直居中
      newCenterX = sourceCenterX - sourceWidth / 2 - AUTO_COMPLETE_DISTANCE - sourceWidth / 2;
      newCenterY = sourceCenterY;
      break;
    case Direction.top:
      // 新形状在源元素上方，水平居中
      newCenterX = sourceCenterX;
      newCenterY = sourceCenterY - sourceHeight / 2 - AUTO_COMPLETE_DISTANCE - sourceHeight / 2;
      break;
    default:
      newCenterX = sourceCenterX + sourceWidth / 2 + AUTO_COMPLETE_DISTANCE + sourceWidth / 2;
      newCenterY = sourceCenterY;
  }
  
  // 基于新中心点创建新形状的 points（左上角和右下角）
  const newShapePoints: [[number, number], [number, number]] = [
    [newCenterX - sourceWidth / 2, newCenterY - sourceHeight / 2],
    [newCenterX + sourceWidth / 2, newCenterY + sourceHeight / 2],
  ];
  
  // 创建新形状
  const newShapeElement = createDefaultGeometry(board, newShapePoints, targetShape as GeometryShapes);
  
  // 复制源元素的样式（仅对 ShapeElement）
  if (PlaitDrawElement.isShapeElement(sourceElement) && !PlaitDrawElement.isText(sourceElement)) {
    const typedSource = sourceElement as PlaitDrawElement & {
      angle?: number;
      fill?: string;
      strokeColor?: string;
      strokeStyle?: unknown;
      strokeWidth?: number;
    };
    
    if (typedSource.angle !== undefined) newShapeElement.angle = typedSource.angle;
    if (typedSource.fill !== undefined) newShapeElement.fill = typedSource.fill;
    if (typedSource.strokeColor !== undefined) newShapeElement.strokeColor = typedSource.strokeColor;
    if (typedSource.strokeStyle !== undefined) {
      (newShapeElement as typeof typedSource).strokeStyle = typedSource.strokeStyle;
    }
    if (typedSource.strokeWidth !== undefined) newShapeElement.strokeWidth = typedSource.strokeWidth;
  }
  
  // 计算连接点（使用 viewBox 坐标）
  const rotatedArrowLineStartPoint = rotatePointsByElement(arrowLineStartPoint, sourceElement) || arrowLineStartPoint;
  // 使用类型断言确保 sourceElement 是 ShapeElement
  const sourceConnection = PlaitDrawElement.isShapeElement(sourceElement) 
    ? getHitConnection(board, rotatedArrowLineStartPoint, sourceElement as Parameters<typeof getHitConnection>[2])
    : undefined;
  
  // 计算目标连接点（新形状面向源的那个点）
  // getEdgeCenterPoints 返回顺序: 0=上, 1=右, 2=下, 3=左
  let targetHitIndex: number;
  switch (direction) {
    case Direction.right:
      targetHitIndex = 3; // 新形状在右侧，连接点在左边
      break;
    case Direction.bottom:
      targetHitIndex = 0; // 新形状在下方，连接点在上边
      break;
    case Direction.left:
      targetHitIndex = 1; // 新形状在左侧，连接点在右边
      break;
    case Direction.top:
      targetHitIndex = 2; // 新形状在上方，连接点在下边
      break;
    default:
      targetHitIndex = 3;
  }
  
  // 获取新形状的边缘中心点（viewBox 坐标）
  const newShapeRect = RectangleClient.getRectangleByPoints(newShapeElement.points);
  const targetEdgeCenterPoints = RectangleClient.getEdgeCenterPoints(newShapeRect);
  const arrowLineEndPoint = targetEdgeCenterPoints[targetHitIndex];
  const rotatedArrowLineEndPoint = rotatePointsByElement(arrowLineEndPoint, newShapeElement) || arrowLineEndPoint;
  const targetConnection = getHitConnection(board, rotatedArrowLineEndPoint, newShapeElement);
  
  // 创建箭头线（使用直线而非折线）
  const arrowLineElement = createArrowLineElement(
    ArrowLineShape.straight,
    [rotatedArrowLineStartPoint, rotatedArrowLineEndPoint],
    {
      marker: ArrowLineMarkerType.none,
      connection: sourceConnection,
      boundId: sourceElement.id,
    },
    {
      marker: ArrowLineMarkerType.arrow,
      connection: targetConnection,
      boundId: newShapeElement.id,
    },
    [],
    {}
  );
  
  // 插入元素
  Transforms.insertNode(board, arrowLineElement, [board.children.length]);
  insertElement(board, newShapeElement);
  
  // 重置状态
  resetAutoCompleteState(board);
}

/**
 * 扩展 @plait/draw 的自动完成功能
 * 
 * 功能：
 * 1. 在 hover 到连接点时显示形状选择器
 * 2. 允许用户选择下一个节点的形状类型
 * 3. 默认使用同类形状
 */
export const withArrowLineAutoCompleteExtend = (board: PlaitBoard) => {
  const { pointerMove, pointerLeave } = board;
  
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastHitIndex = -1;

  board.pointerMove = (event: PointerEvent) => {
    // 清除之前的延迟
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }

    const selectedElements = getSelectedDrawElements(board);
    const originElement = selectedElements.length === 1 && selectedElements[0];
    const currentState = getAutoCompleteState(board);

    if (!originElement || 
        !PlaitDrawElement.isShapeElement(originElement) || 
        PlaitDrawElement.isText(originElement)) {
      if (currentState.visible) {
        setAutoCompleteState(board, { ...initialState });
      }
      lastHitIndex = -1;
      pointerMove(event);
      return;
    }

    const activePoint = toActivePoint(board, event.x, event.y);
    const points = getAutoCompletePoints(board, originElement, true);
    const rotatedPoint = rotateAntiPointsByElement(board, activePoint, originElement, true) || activePoint;
    const hitIndex = getHitIndexOfAutoCompletePoint(rotatedPoint, points);
    const hitPoint = points[hitIndex];

    if (hitPoint) {
      // 只有当 hitIndex 变化或选择器未显示时才更新
      if (hitIndex !== lastHitIndex || !currentState.visible) {
        lastHitIndex = hitIndex;
        
        // 保存当前鼠标位置用于显示选择器
        const mouseX = event.clientX;
        const mouseY = event.clientY;
        
        // 延迟显示选择器
        hoverTimeout = setTimeout(() => {
          // 获取元素的形状类型
          const shape = PlaitDrawElement.isImage(originElement)
            ? BasicShapes.rectangle
            : (originElement as { shape?: DrawPointerType }).shape || BasicShapes.rectangle;
          
          setAutoCompleteState(board, {
            visible: true,
            // 选择器宽度约 280px，水平居中显示在鼠标正下方
            position: { x: mouseX - 140, y: mouseY + 20 },
            sourceElement: originElement,
            currentShape: shape,
            hitIndex,
            hitPoint,
          });
        }, 200); // 200ms 延迟，避免快速移动时频繁触发
      }
    } else {
      lastHitIndex = -1;
      if (currentState.visible) {
        // 延迟隐藏，给用户时间移动到选择器
        hoverTimeout = setTimeout(() => {
          const state = getAutoCompleteState(board);
          if (state.visible) {
            setAutoCompleteState(board, { ...initialState });
          }
        }, 300);
      }
    }

    pointerMove(event);
  };

  board.pointerLeave = (event: PointerEvent) => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    // 不立即关闭，让用户有机会移动到选择器
    pointerLeave(event);
  };

  return board;
};
