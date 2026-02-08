/**
 * 流程图快速创建插件
 *
 * 当选中一个几何形状时：
 * - 方向键(↑↓←→)：在对应方向创建新形状，并用肘形箭头连接
 * - Tab：导航到下一个连接的形状
 * - Shift+Tab：导航到上一个连接的形状
 */
import {
  PlaitBoard,
  PlaitElement,
  PlaitPointerType,
  BoardTransforms,
  Transforms,
  Direction,
  RectangleClient,
  getSelectedElements,
  clearSelectedElement,
  addSelectedElement,
  rotatePointsByElement,
  Point,
  getRectangleByElements,
} from '@plait/core';
import {
  PlaitDrawElement,
  ArrowLineShape,
  ArrowLineMarkerType,
  createDefaultGeometry,
  createArrowLineElement,
  getHitConnection,
  GeometryShapes,
  getSelectedDrawElements,
} from '@plait/draw';
import { scrollToPointIfNeeded } from '../utils/selection-utils';

/** 新形状与源元素的默认距离 */
const FLOWCHART_DISTANCE = 100;

/** 方向键到 Direction 的映射 */
function getDirectionFromKey(key: string): Direction | null {
  switch (key) {
    case 'ArrowRight':
      return Direction.right;
    case 'ArrowDown':
      return Direction.bottom;
    case 'ArrowLeft':
      return Direction.left;
    case 'ArrowUp':
      return Direction.top;
    default:
      return null;
  }
}

/** Direction 到 hitIndex 的映射（上=0, 右=1, 下=2, 左=3） */
function directionToHitIndex(direction: Direction): number {
  switch (direction) {
    case Direction.top:
      return 0;
    case Direction.right:
      return 1;
    case Direction.bottom:
      return 2;
    case Direction.left:
      return 3;
    default:
      return 1;
  }
}

/** 获取反向 hitIndex */
function getOppositeHitIndex(hitIndex: number): number {
  // 0→2, 1→3, 2→0, 3→1
  return (hitIndex + 2) % 4;
}

/**
 * 检查目标位置是否与现有元素重叠
 */
function hasOverlapAtPosition(
  board: PlaitBoard,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  excludeId: string
): boolean {
  const targetRect = {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };

  for (const element of board.children) {
    if (element.id === excludeId) continue;
    if (!PlaitDrawElement.isDrawElement(element)) continue;
    if (PlaitDrawElement.isArrowLine(element)) continue;

    try {
      const rect = RectangleClient.getRectangleByPoints(element.points);
      if (
        targetRect.x < rect.x + rect.width &&
        targetRect.x + targetRect.width > rect.x &&
        targetRect.y < rect.y + rect.height &&
        targetRect.y + targetRect.height > rect.y
      ) {
        return true;
      }
    } catch {
      // 跳过无法计算边界的元素
    }
  }
  return false;
}

/**
 * 在指定方向创建连接的流程图节点
 */
function createFlowchartNode(
  board: PlaitBoard,
  sourceElement: PlaitDrawElement,
  direction: Direction
): void {
  const sourceRect = RectangleClient.getRectangleByPoints(sourceElement.points);
  const sourceWidth = sourceRect.width;
  const sourceHeight = sourceRect.height;
  const sourceCenterX = sourceRect.x + sourceWidth / 2;
  const sourceCenterY = sourceRect.y + sourceHeight / 2;

  // 计算新形状中心位置
  let newCenterX: number;
  let newCenterY: number;

  switch (direction) {
    case Direction.right:
      newCenterX = sourceCenterX + sourceWidth / 2 + FLOWCHART_DISTANCE + sourceWidth / 2;
      newCenterY = sourceCenterY;
      break;
    case Direction.bottom:
      newCenterX = sourceCenterX;
      newCenterY = sourceCenterY + sourceHeight / 2 + FLOWCHART_DISTANCE + sourceHeight / 2;
      break;
    case Direction.left:
      newCenterX = sourceCenterX - sourceWidth / 2 - FLOWCHART_DISTANCE - sourceWidth / 2;
      newCenterY = sourceCenterY;
      break;
    case Direction.top:
      newCenterX = sourceCenterX;
      newCenterY = sourceCenterY - sourceHeight / 2 - FLOWCHART_DISTANCE - sourceHeight / 2;
      break;
    default:
      newCenterX = sourceCenterX + sourceWidth / 2 + FLOWCHART_DISTANCE + sourceWidth / 2;
      newCenterY = sourceCenterY;
  }

  // 碰撞检测：如果目标位置有重叠，向垂直方向偏移（锯齿形分布）
  let offset = 0;
  const offsetStep = direction === Direction.right || direction === Direction.left
    ? sourceHeight + 20
    : sourceWidth + 20;

  while (hasOverlapAtPosition(board, newCenterX, newCenterY, sourceWidth, sourceHeight, sourceElement.id)) {
    offset += offsetStep;
    if (direction === Direction.right || direction === Direction.left) {
      newCenterY = sourceCenterY + offset;
    } else {
      newCenterX = sourceCenterX + offset;
    }
    // 防止无限循环
    if (offset > 1000) break;
  }

  // 创建新形状
  const newShapePoints: [[number, number], [number, number]] = [
    [newCenterX - sourceWidth / 2, newCenterY - sourceHeight / 2],
    [newCenterX + sourceWidth / 2, newCenterY + sourceHeight / 2],
  ];

  // 获取源元素的形状类型
  const sourceShape = (sourceElement as PlaitDrawElement & { shape?: GeometryShapes }).shape;
  const targetShape = sourceShape || 'rectangle';
  const newShapeElement = createDefaultGeometry(board, newShapePoints, targetShape as GeometryShapes);

  // 设置默认白色填充
  newShapeElement.fill = '#ffffff';

  // 复制源元素样式
  if (PlaitDrawElement.isShapeElement(sourceElement) && !PlaitDrawElement.isText(sourceElement)) {
    const typedSource = sourceElement as PlaitDrawElement & {
      fill?: string;
      strokeColor?: string;
      strokeWidth?: number;
    };
    if (typedSource.fill && typedSource.fill !== 'none') {
      newShapeElement.fill = typedSource.fill;
    }
    if (typedSource.strokeColor !== undefined) {
      newShapeElement.strokeColor = typedSource.strokeColor;
    }
    if (typedSource.strokeWidth !== undefined) {
      newShapeElement.strokeWidth = typedSource.strokeWidth;
    }
  }

  // 计算连接点
  const sourceHitIndex = directionToHitIndex(direction);
  const targetHitIndex = getOppositeHitIndex(sourceHitIndex);

  const sourceEdgeCenterPoints = RectangleClient.getEdgeCenterPoints(sourceRect);
  const arrowLineStartPoint = sourceEdgeCenterPoints[sourceHitIndex];
  const rotatedStartPoint = rotatePointsByElement(arrowLineStartPoint, sourceElement) || arrowLineStartPoint;
  const sourceConnection = PlaitDrawElement.isShapeElement(sourceElement)
    ? getHitConnection(board, rotatedStartPoint, sourceElement as Parameters<typeof getHitConnection>[2])
    : undefined;

  const newShapeRect = RectangleClient.getRectangleByPoints(newShapeElement.points);
  const targetEdgeCenterPoints = RectangleClient.getEdgeCenterPoints(newShapeRect);
  const arrowLineEndPoint = targetEdgeCenterPoints[targetHitIndex];
  const rotatedEndPoint = rotatePointsByElement(arrowLineEndPoint, newShapeElement) || arrowLineEndPoint;
  const targetConnection = getHitConnection(board, rotatedEndPoint, newShapeElement);

  // 创建肘形箭头线
  const arrowLineElement = createArrowLineElement(
    ArrowLineShape.elbow,
    [rotatedStartPoint, rotatedEndPoint],
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
  Transforms.insertNode(board, newShapeElement, [board.children.length]);

  // 选中新形状并滚动到视口
  const newElementId = newShapeElement.id;
  setTimeout(() => {
    const insertedElement = board.children.find(el => el.id === newElementId);
    if (insertedElement) {
      clearSelectedElement(board);
      addSelectedElement(board, insertedElement);
      BoardTransforms.updatePointerType(board, PlaitPointerType.selection);

      // 滚动到新元素
      scrollToPointIfNeeded(board, [newCenterX, newCenterY]);
    }
  }, 50);
}

/**
 * 获取元素通过箭头线连接的相邻元素
 */
function getConnectedElements(
  board: PlaitBoard,
  element: PlaitElement
): { incoming: PlaitElement[]; outgoing: PlaitElement[] } {
  const incoming: PlaitElement[] = [];
  const outgoing: PlaitElement[] = [];

  for (const child of board.children) {
    if (!PlaitDrawElement.isArrowLine(child)) continue;
    const arrowLine = child as PlaitElement & {
      source?: { boundId?: string };
      target?: { boundId?: string };
    };

    if (arrowLine.source?.boundId === element.id && arrowLine.target?.boundId) {
      const targetElement = board.children.find(el => el.id === arrowLine.target!.boundId);
      if (targetElement) {
        outgoing.push(targetElement);
      }
    }

    if (arrowLine.target?.boundId === element.id && arrowLine.source?.boundId) {
      const sourceElement = board.children.find(el => el.id === arrowLine.source!.boundId);
      if (sourceElement) {
        incoming.push(sourceElement);
      }
    }
  }

  return { incoming, outgoing };
}

/**
 * 导航到连接的元素
 * forward=true: 优先导航到 outgoing，否则 incoming
 * forward=false: 优先导航到 incoming，否则 outgoing
 */
function navigateToConnectedElement(
  board: PlaitBoard,
  currentElement: PlaitElement,
  forward: boolean
): boolean {
  const { incoming, outgoing } = getConnectedElements(board, currentElement);
  const targets = forward ? [...outgoing, ...incoming] : [...incoming, ...outgoing];

  if (targets.length === 0) return false;

  const target = targets[0];
  clearSelectedElement(board);
  addSelectedElement(board, target);

  // 滚动到目标元素
  try {
    const rect = getRectangleByElements(board, [target], false);
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    scrollToPointIfNeeded(board, [centerX, centerY]);
  } catch {
    // 静默处理
  }

  return true;
}

/**
 * 流程图快捷键插件
 */
export const withFlowchartShortcut = (board: PlaitBoard) => {
  const { keyDown } = board;

  board.keyDown = (event: KeyboardEvent) => {
    // 只在无修饰键时处理方向键（有修饰键可能是其他操作）
    if (!event.altKey && !event.metaKey && !event.ctrlKey) {
      // 方向键：创建流程图节点
      if (!event.shiftKey) {
        const direction = getDirectionFromKey(event.key);
        if (direction !== null) {
          const selectedElements = getSelectedDrawElements(board);
          if (selectedElements.length === 1) {
            const element = selectedElements[0];
            if (
              PlaitDrawElement.isShapeElement(element) &&
              !PlaitDrawElement.isText(element) &&
              !PlaitDrawElement.isImage(element)
            ) {
              createFlowchartNode(board, element, direction);
              event.preventDefault();
              return;
            }
          }
        }
      }

      // Tab / Shift+Tab：在连接的形状间导航
      if (event.key === 'Tab') {
        const selectedElements = getSelectedElements(board);
        if (selectedElements.length === 1) {
          const element = selectedElements[0];
          if (PlaitDrawElement.isDrawElement(element) && PlaitDrawElement.isShapeElement(element)) {
            const navigated = navigateToConnectedElement(board, element, !event.shiftKey);
            if (navigated) {
              event.preventDefault();
              return;
            }
          }
        }
      }
    }

    keyDown(event);
  };

  return board;
};
