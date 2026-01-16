import { PlaitBoard, Point, RectangleClient, createG, idCreator, isPointInPolygon, getSelectedElements } from '@plait/core';
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
 * 将绝对坐标的锚点转换为相对坐标（相对于 origin）
 */
export function anchorsToRelative(anchors: PenAnchor[], origin: Point): PenAnchor[] {
  return anchors.map(anchor => ({
    ...anchor,
    point: [anchor.point[0] - origin[0], anchor.point[1] - origin[1]] as Point,
    handleIn: anchor.handleIn 
      ? [anchor.handleIn[0] - origin[0], anchor.handleIn[1] - origin[1]] as Point 
      : undefined,
    handleOut: anchor.handleOut 
      ? [anchor.handleOut[0] - origin[0], anchor.handleOut[1] - origin[1]] as Point 
      : undefined,
  }));
}

/**
 * 将相对坐标的锚点转换为绝对坐标
 */
export function anchorsToAbsolute(anchors: PenAnchor[], origin: Point): PenAnchor[] {
  return anchors.map(anchor => ({
    ...anchor,
    point: [anchor.point[0] + origin[0], anchor.point[1] + origin[1]] as Point,
    handleIn: anchor.handleIn 
      ? [anchor.handleIn[0] + origin[0], anchor.handleIn[1] + origin[1]] as Point 
      : undefined,
    handleOut: anchor.handleOut 
      ? [anchor.handleOut[0] + origin[0], anchor.handleOut[1] + origin[1]] as Point 
      : undefined,
  }));
}

/**
 * 获取元素的绝对坐标锚点（用于渲染和命中测试）
 */
export function getAbsoluteAnchors(element: PenPath): PenAnchor[] {
  const origin = element.points[0];
  return anchorsToAbsolute(element.anchors, origin);
}

/**
 * 创建新的钢笔路径元素
 * 注意：传入的 anchors 应该是绝对坐标，函数会自动转换为相对坐标存储
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
  const cornerRadius = settings.cornerRadius;
  
  // 获取填充色（仅闭合路径）
  const themeMode = board.theme.themeColorMode;
  const fill = closed ? (PenThemeColors[themeMode]?.fill || 'none') : 'none';

  // 计算 points（用于 PlaitElement 的基本定位）
  const boundingBox = getPathBoundingBox(anchors, closed);
  const origin: Point = [boundingBox.x, boundingBox.y];
  const points: [Point, Point] = [
    origin,
    [boundingBox.x + boundingBox.width, boundingBox.y + boundingBox.height],
  ];
  
  // 将绝对坐标转换为相对坐标存储
  const relativeAnchors = anchorsToRelative(anchors, origin);

  return {
    id: idCreator(),
    type: PEN_TYPE,
    shape: PenShape.pen,
    points,
    anchors: relativeAnchors,
    closed,
    strokeWidth,
    strokeColor,
    strokeStyle,
    fill,
    cornerRadius,
  } as PenPath;
}

/**
 * 获取钢笔路径的包围矩形
 */
export function getPenPathRectangle(element: PenPath): RectangleClient {
  // 使用绝对坐标计算包围盒
  const absoluteAnchors = getAbsoluteAnchors(element);
  const boundingBox = getPathBoundingBox(absoluteAnchors, element.closed, 5);
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
  // 使用绝对坐标进行检测
  const absoluteAnchors = getAbsoluteAnchors(element);
  
  // 检测是否在路径线条附近
  const distance = distanceToPath(point, absoluteAnchors, element.closed);
  if (distance <= PATH_HIT_DISTANCE) {
    return true;
  }

  // 对于闭合路径，检测是否在填充区域内
  if (element.closed && absoluteAnchors.length >= 3) {
    // 获取路径上的采样点形成多边形
    const polygonPoints = getPathSamplePoints(absoluteAnchors, element.closed);
    if (isPointInPolygon(point, polygonPoints)) {
      return true;
    }
  }

  return false;
}

/**
 * 检测点是否在矩形内
 */
function isPointInRectangle(point: Point, rect: RectangleClient): boolean {
  return (
    point[0] >= rect.x &&
    point[0] <= rect.x + rect.width &&
    point[1] >= rect.y &&
    point[1] <= rect.y + rect.height
  );
}

/**
 * 检测矩形选择是否命中路径
 */
export function isRectangleHitPenPath(
  board: PlaitBoard,
  element: PenPath,
  selection: { anchor: Point; focus: Point }
): boolean {
  const selectionRect = RectangleClient.getRectangleByPoints([
    selection.anchor,
    selection.focus,
  ]);
  
  // 首先检测元素边界框是否与选择框相交
  const elementRect = getPenPathRectangle(element);
  if (RectangleClient.isHit(selectionRect, elementRect)) {
    // 边界框相交，进一步检测路径上的点
    const absoluteAnchors = getAbsoluteAnchors(element);
    
    // 获取路径的采样点进行精确检测
    const samplePoints = getPathSamplePoints(absoluteAnchors, element.closed);
    
    // 检测选择框是否包含任意一个采样点
    for (const point of samplePoints) {
      if (isPointInRectangle(point, selectionRect)) {
        return true;
      }
    }
    
    // 同时检测锚点
    for (const anchor of absoluteAnchors) {
      if (isPointInRectangle(anchor.point, selectionRect)) {
        return true;
      }
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
 * 注意：使用绝对坐标进行检测
 */
export function hitTestAnchor(
  element: PenPath,
  point: Point,
  scale: number = 1
): AnchorHitResult {
  const anchorRadius = ANCHOR_HIT_RADIUS / scale;
  const handleRadius = HANDLE_HIT_RADIUS / scale;
  
  // 使用绝对坐标进行检测
  const absoluteAnchors = getAbsoluteAnchors(element);

  for (let i = 0; i < absoluteAnchors.length; i++) {
    const anchor = absoluteAnchors[i];

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

/**
 * 获取选中的钢笔路径元素
 */
export function getSelectedPenPathElements(board: PlaitBoard): PenPath[] {
  return getSelectedElements(board).filter((ele) => PenPath.isPenPath(ele)) as PenPath[];
}
