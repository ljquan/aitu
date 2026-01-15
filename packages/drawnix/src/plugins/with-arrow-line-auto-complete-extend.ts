import {
  PlaitBoard,
  PlaitElement,
  rotateAntiPointsByElement,
  toActivePoint,
  Transforms,
  Direction,
  isHorizontalDirection,
  rotatePointsByElement,
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
  getConnectionPoint,
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
  /** hover 的连接点坐标 (viewBox 坐标) */
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

// 新形状与源元素的默认距离
const AUTO_COMPLETE_DISTANCE = 100;
// 新形状的默认大小
const DEFAULT_SHAPE_SIZE = 100;

/**
 * 创建并插入连接线和新形状
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
  
  // 计算新形状的位置
  let offsetX = 0;
  let offsetY = 0;
  
  switch (direction) {
    case Direction.right:
      offsetX = AUTO_COMPLETE_DISTANCE;
      break;
    case Direction.bottom:
      offsetY = AUTO_COMPLETE_DISTANCE;
      break;
    case Direction.left:
      offsetX = -AUTO_COMPLETE_DISTANCE - DEFAULT_SHAPE_SIZE;
      break;
    case Direction.top:
      offsetY = -AUTO_COMPLETE_DISTANCE - DEFAULT_SHAPE_SIZE;
      break;
  }
  
  // 计算新形状的点（左上角和右下角）
  const newShapePoints: [number, number][] = [
    [hitPoint[0] + offsetX, hitPoint[1] + offsetY - DEFAULT_SHAPE_SIZE / 2],
    [hitPoint[0] + offsetX + DEFAULT_SHAPE_SIZE, hitPoint[1] + offsetY + DEFAULT_SHAPE_SIZE / 2],
  ];
  
  // 根据方向调整位置
  if (isHorizontalDirection(direction)) {
    newShapePoints[0][1] = hitPoint[1] - DEFAULT_SHAPE_SIZE / 2;
    newShapePoints[1][1] = hitPoint[1] + DEFAULT_SHAPE_SIZE / 2;
  } else {
    newShapePoints[0][0] = hitPoint[0] - DEFAULT_SHAPE_SIZE / 2;
    newShapePoints[1][0] = hitPoint[0] + DEFAULT_SHAPE_SIZE / 2;
  }
  
  // 创建新形状
  const newShapeElement = createDefaultGeometry(board, newShapePoints, targetShape);
  
  // 复制源元素的样式
  const typedSource = sourceElement as PlaitDrawElement & {
    angle?: number;
    fill?: string;
    strokeColor?: string;
    strokeStyle?: string;
    strokeWidth?: number;
    groupId?: string;
  };
  
  if (typedSource.angle !== undefined) newShapeElement.angle = typedSource.angle;
  if (typedSource.fill !== undefined) newShapeElement.fill = typedSource.fill;
  if (typedSource.strokeColor !== undefined) newShapeElement.strokeColor = typedSource.strokeColor;
  if (typedSource.strokeStyle !== undefined) newShapeElement.strokeStyle = typedSource.strokeStyle;
  if (typedSource.strokeWidth !== undefined) newShapeElement.strokeWidth = typedSource.strokeWidth;
  
  // 计算连接点
  const sourceConnectionPoint = rotatePointsByElement(hitPoint, sourceElement) || hitPoint;
  const sourceConnection = getHitConnection(board, sourceConnectionPoint, sourceElement);
  
  // 计算目标连接点（新形状面向源的那个点）
  let targetHitIndex: number;
  switch (direction) {
    case Direction.right:
      targetHitIndex = 2; // 左边
      break;
    case Direction.bottom:
      targetHitIndex = 3; // 上边
      break;
    case Direction.left:
      targetHitIndex = 0; // 右边
      break;
    case Direction.top:
      targetHitIndex = 1; // 下边
      break;
    default:
      targetHitIndex = 2;
  }
  
  const targetConnectionPoints = getAutoCompletePoints(board, newShapeElement, false);
  const targetPoint = targetConnectionPoints[targetHitIndex] || targetConnectionPoints[0];
  const targetConnection = getHitConnection(board, targetPoint, newShapeElement);
  
  // 创建箭头线
  const arrowLineElement = createArrowLineElement(
    ArrowLineShape.elbow,
    [sourceConnectionPoint, targetPoint],
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
