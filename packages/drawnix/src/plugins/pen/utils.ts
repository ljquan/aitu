import { PlaitBoard, Point, RectangleClient, createG, idCreator, isPointInPolygon } from '@plait/core';
import {
  PenPath,
  PenAnchor,
  PEN_TYPE,
  PenShape,
  ANCHOR_HIT_RADIUS,
  HANDLE_HIT_RADIUS,
  PATH_HIT_DISTANCE,
  PenThemeColors,
} from './type';
import {
  distanceBetweenPoints,
  distanceToPath,
  getPathBoundingBox,
  getPathSamplePoints,
} from './bezier-utils';
import { getPenSettings } from './pen-settings';

/**
 * 创建新的钢笔路径元素
 */
export function createPenPath(
  board: PlaitBoard,
  anchors: PenAnchor[],
  closed: boolean = false
): PenPath {
  // 从设置中获取样式
  const settings = getPenSettings(board);
  const strokeColor = settings.strokeColor;
  const strokeWidth = settings.strokeWidth;
  const strokeStyle = settings.strokeStyle;
  
  // 获取填充色（仅闭合路径）
  const themeMode = board.theme.themeColorMode;
  const fill = closed ? (PenThemeColors[themeMode]?.fill || 'none') : 'none';

  // 计算 points（用于 PlaitElement 的基本定位）
  const boundingBox = getPathBoundingBox(anchors, closed);
  const points: [Point, Point] = [
    [boundingBox.x, boundingBox.y],
    [boundingBox.x + boundingBox.width, boundingBox.y + boundingBox.height],
  ];

  return {
    id: idCreator(),
    type: PEN_TYPE,
    shape: PenShape.pen,
    points,
    anchors,
    closed,
    strokeWidth,
    strokeColor,
    strokeStyle,
    fill,
  } as PenPath;
}

/**
 * 获取钢笔路径的包围矩形
 */
export function getPenPathRectangle(element: PenPath): RectangleClient {
  const boundingBox = getPathBoundingBox(element.anchors, element.closed, 5);
  return RectangleClient.getRectangleByCenterPoint(
    [boundingBox.x + boundingBox.width / 2, boundingBox.y + boundingBox.height / 2],
    boundingBox.width,
    boundingBox.height
  );
}

/**
 * 检测点击是否命中路径
 * 对于闭合路径，也检测点击是否在填充区域内
 */
export function isHitPenPath(
  board: PlaitBoard,
  element: PenPath,
  point: Point
): boolean {
  // 检测是否在路径线条附近
  const distance = distanceToPath(point, element.anchors, element.closed);
  if (distance <= PATH_HIT_DISTANCE) {
    return true;
  }

  // 对于闭合路径，检测是否在填充区域内
  if (element.closed && element.anchors.length >= 3) {
    // 获取路径上的采样点形成多边形
    const polygonPoints = getPathSamplePoints(element.anchors, element.closed);
    if (isPointInPolygon(point, polygonPoints)) {
      return true;
    }
  }

  return false;
}

/**
 * 检测矩形选择是否命中路径
 */
export function isRectangleHitPenPath(
  board: PlaitBoard,
  element: PenPath,
  selection: { anchor: Point; focus: Point }
): boolean {
  const rectangle = RectangleClient.getRectangleByPoints([
    selection.anchor,
    selection.focus,
  ]);
  
  // 获取路径的采样点进行精确检测
  const samplePoints = getPathSamplePoints(element.anchors, element.closed);
  
  // 检测选择框是否包含任意一个采样点
  for (const point of samplePoints) {
    if (RectangleClient.isHit(rectangle, point)) {
      return true;
    }
  }
  
  // 同时检测锚点
  for (const anchor of element.anchors) {
    if (RectangleClient.isHit(rectangle, anchor.point)) {
      return true;
    }
  }
  
  return false;
}

/**
 * 锚点命中测试结果
 */
export interface AnchorHitResult {
  /** 命中的锚点索引，-1 表示未命中 */
  anchorIndex: number;
  /** 命中的控制柄类型 */
  handleType: 'anchor' | 'handleIn' | 'handleOut' | null;
}

/**
 * 检测点击是否命中锚点或控制柄
 */
export function hitTestAnchor(
  element: PenPath,
  point: Point,
  scale: number = 1
): AnchorHitResult {
  const anchorRadius = ANCHOR_HIT_RADIUS / scale;
  const handleRadius = HANDLE_HIT_RADIUS / scale;

  for (let i = 0; i < element.anchors.length; i++) {
    const anchor = element.anchors[i];

    // 检测控制柄（优先级高于锚点）
    if (anchor.handleIn) {
      if (distanceBetweenPoints(point, anchor.handleIn) <= handleRadius) {
        return { anchorIndex: i, handleType: 'handleIn' };
      }
    }
    if (anchor.handleOut) {
      if (distanceBetweenPoints(point, anchor.handleOut) <= handleRadius) {
        return { anchorIndex: i, handleType: 'handleOut' };
      }
    }

    // 检测锚点
    if (distanceBetweenPoints(point, anchor.point) <= anchorRadius) {
      return { anchorIndex: i, handleType: 'anchor' };
    }
  }

  return { anchorIndex: -1, handleType: null };
}

/**
 * 检测是否点击了起始锚点（用于闭合路径）
 */
export function isHitStartAnchor(
  element: PenPath,
  point: Point,
  scale: number = 1
): boolean {
  if (element.anchors.length < 2) return false;
  const anchorRadius = ANCHOR_HIT_RADIUS / scale;
  const startAnchor = element.anchors[0];
  return distanceBetweenPoints(point, startAnchor.point) <= anchorRadius;
}

/**
 * 更新锚点位置
 */
export function updateAnchorPosition(
  anchors: PenAnchor[],
  index: number,
  newPoint: Point
): PenAnchor[] {
  const anchor = anchors[index];
  const dx = newPoint[0] - anchor.point[0];
  const dy = newPoint[1] - anchor.point[1];

  const updatedAnchor: PenAnchor = {
    ...anchor,
    point: newPoint,
    // 同时移动控制柄
    handleIn: anchor.handleIn
      ? [anchor.handleIn[0] + dx, anchor.handleIn[1] + dy]
      : undefined,
    handleOut: anchor.handleOut
      ? [anchor.handleOut[0] + dx, anchor.handleOut[1] + dy]
      : undefined,
  };

  const newAnchors = [...anchors];
  newAnchors[index] = updatedAnchor;
  return newAnchors;
}

/**
 * 更新控制柄位置
 */
export function updateHandlePosition(
  anchors: PenAnchor[],
  index: number,
  handleType: 'handleIn' | 'handleOut',
  newPoint: Point
): PenAnchor[] {
  const anchor = anchors[index];
  const updatedAnchor: PenAnchor = { ...anchor };

  if (handleType === 'handleIn') {
    updatedAnchor.handleIn = newPoint;
    // 对于 smooth 和 symmetric 类型，同步更新对面的控制柄
    if (anchor.type === 'smooth' || anchor.type === 'symmetric') {
      const dx = anchor.point[0] - newPoint[0];
      const dy = anchor.point[1] - newPoint[1];
      if (anchor.type === 'symmetric') {
        // 对称：长度和角度都相同
        updatedAnchor.handleOut = [anchor.point[0] + dx, anchor.point[1] + dy];
      } else if (anchor.handleOut) {
        // 平滑：只保持角度，长度可以不同
        const outLength = distanceBetweenPoints(anchor.point, anchor.handleOut);
        const inLength = Math.hypot(dx, dy);
        if (inLength > 0) {
          const scale = outLength / inLength;
          updatedAnchor.handleOut = [
            anchor.point[0] + dx * scale,
            anchor.point[1] + dy * scale,
          ];
        }
      }
    }
  } else {
    updatedAnchor.handleOut = newPoint;
    // 对于 smooth 和 symmetric 类型，同步更新对面的控制柄
    if (anchor.type === 'smooth' || anchor.type === 'symmetric') {
      const dx = anchor.point[0] - newPoint[0];
      const dy = anchor.point[1] - newPoint[1];
      if (anchor.type === 'symmetric') {
        updatedAnchor.handleIn = [anchor.point[0] + dx, anchor.point[1] + dy];
      } else if (anchor.handleIn) {
        const inLength = distanceBetweenPoints(anchor.point, anchor.handleIn);
        const outLength = Math.hypot(dx, dy);
        if (outLength > 0) {
          const scale = inLength / outLength;
          updatedAnchor.handleIn = [
            anchor.point[0] + dx * scale,
            anchor.point[1] + dy * scale,
          ];
        }
      }
    }
  }

  const newAnchors = [...anchors];
  newAnchors[index] = updatedAnchor;
  return newAnchors;
}

/**
 * 创建预览 SVG 组
 */
export function createPenPreviewG(): SVGGElement {
  return createG();
}

/**
 * 更新元素的 points（包围盒）
 */
export function updatePenPathPoints(element: PenPath): Point[] {
  const boundingBox = getPathBoundingBox(element.anchors, element.closed);
  return [
    [boundingBox.x, boundingBox.y],
    [boundingBox.x + boundingBox.width, boundingBox.y + boundingBox.height],
  ];
}
