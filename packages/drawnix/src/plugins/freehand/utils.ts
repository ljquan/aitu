import {
  getSelectedElements,
  idCreator,
  isPointInPolygon,
  PlaitBoard,
  PlaitElement,
  Point,
  RectangleClient,
  rotateAntiPointsByElement,
  Selection,
  ThemeColorMode,
} from '@plait/core';
import { Freehand, FreehandShape, FreehandThemeColors } from './type';
import {
  DefaultDrawStyle,
  isClosedCustomGeometry,
  isClosedPoints,
  isHitPolyLine,
  isRectangleHitRotatedPoints,
} from '@plait/draw';

export function getFreehandPointers() {
  return [FreehandShape.feltTipPen, FreehandShape.eraser];
}

/**
 * 获取手绘元素的边界框（考虑 strokeWidth）
 * @param element 手绘元素
 * @returns 扩展后的边界框
 */
export function getFreehandRectangle(element: Freehand): RectangleClient {
  const baseRect = RectangleClient.getRectangleByPoints(element.points);
  // 获取 strokeWidth，默认值为 2
  const strokeWidth = (element as any).strokeWidth ?? 2;
  // 边界框需要向外扩展 strokeWidth / 2
  const padding = strokeWidth / 2;
  return {
    x: baseRect.x - padding,
    y: baseRect.y - padding,
    width: baseRect.width + strokeWidth,
    height: baseRect.height + strokeWidth,
  };
}

export interface CreateFreehandOptions {
  strokeWidth?: number;
  strokeColor?: string;
}

export const createFreehandElement = (
  shape: FreehandShape,
  points: Point[],
  options?: CreateFreehandOptions
): Freehand => {
  const element: Freehand = {
    id: idCreator(),
    type: 'freehand',
    shape,
    points,
    ...(options?.strokeWidth !== undefined && { strokeWidth: options.strokeWidth }),
    ...(options?.strokeColor !== undefined && { strokeColor: options.strokeColor }),
  };
  return element;
};

export const isHitFreehand = (
  board: PlaitBoard,
  element: Freehand,
  point: Point
) => {
  const antiPoint = rotateAntiPointsByElement(board, point, element) || point;
  const points = element.points;
  if (isClosedPoints(element.points)) {
    return (
      isPointInPolygon(antiPoint, points) || isHitPolyLine(points, antiPoint)
    );
  } else {
    return isHitPolyLine(points, antiPoint);
  }
};

/**
 * 计算点到线段的最短距离
 */
function distanceToSegment(point: Point, segStart: Point, segEnd: Point): number {
  const [px, py] = point;
  const [x1, y1] = segStart;
  const [x2, y2] = segEnd;
  
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  
  if (lengthSquared === 0) {
    // 线段退化为点
    return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  }
  
  // 计算投影参数 t
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  
  // 计算最近点
  const nearestX = x1 + t * dx;
  const nearestY = y1 + t * dy;
  
  return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
}

/**
 * 检测点是否在折线的指定半径范围内
 */
function isPointNearPolyLine(pathPoints: Point[], point: Point, radius: number): boolean {
  if (pathPoints.length < 2) {
    if (pathPoints.length === 1) {
      const [px, py] = point;
      const [x, y] = pathPoints[0];
      return Math.sqrt((px - x) ** 2 + (py - y) ** 2) <= radius;
    }
    return false;
  }
  
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const distance = distanceToSegment(point, pathPoints[i], pathPoints[i + 1]);
    if (distance <= radius) {
      return true;
    }
  }
  return false;
}

/**
 * 带半径的命中检测（用于橡皮擦）
 * @param board 画板
 * @param element 手绘元素
 * @param point 检测点
 * @param hitRadius 命中半径（橡皮擦大小的一半）
 */
export const isHitFreehandWithRadius = (
  board: PlaitBoard,
  element: Freehand,
  point: Point,
  hitRadius: number
) => {
  const antiPoint = rotateAntiPointsByElement(board, point, element) || point;
  const points = element.points;
  
  if (isClosedPoints(element.points)) {
    // 闭合路径：检测是否在多边形内或在边界半径范围内
    return (
      isPointInPolygon(antiPoint, points) || 
      isPointNearPolyLine(points, antiPoint, hitRadius)
    );
  } else {
    // 非闭合路径：检测是否在线段半径范围内
    return isPointNearPolyLine(points, antiPoint, hitRadius);
  }
};

export const isRectangleHitFreehand = (
  board: PlaitBoard,
  element: Freehand,
  selection: Selection
) => {
  const rangeRectangle = RectangleClient.getRectangleByPoints([
    selection.anchor,
    selection.focus,
  ]);
  return isRectangleHitRotatedPoints(
    rangeRectangle,
    element.points,
    element.angle
  );
};

export const getSelectedFreehandElements = (board: PlaitBoard) => {
  return getSelectedElements(board).filter((ele) => Freehand.isFreehand(ele));
};

export const getFreehandDefaultStrokeColor = (theme: ThemeColorMode) => {
  return FreehandThemeColors[theme].strokeColor;
};

export const getFreehandDefaultFill = (theme: ThemeColorMode) => {
  return FreehandThemeColors[theme].fill;
};

export const getStrokeColorByElement = (
  board: PlaitBoard,
  element: PlaitElement
) => {
  const defaultColor = getFreehandDefaultStrokeColor(
    board.theme.themeColorMode
  );
  const strokeColor = element.strokeColor || defaultColor;
  return strokeColor;
};

export const getFillByElement = (board: PlaitBoard, element: PlaitElement) => {
  const defaultFill =
    Freehand.isFreehand(element) && isClosedCustomGeometry(board, element)
      ? getFreehandDefaultFill(board.theme.themeColorMode)
      : DefaultDrawStyle.fill;
  const fill = element.fill || defaultFill;
  return fill;
};

export function gaussianWeight(x: number, sigma: number) {
  return Math.exp(-(x * x) / (2 * sigma * sigma));
}

export function gaussianSmooth(
  points: Point[],
  sigma: number,
  windowSize: number
) {
  if (points.length < 2) return points;

  const halfWindow = Math.floor(windowSize / 2);
  const smoothedPoints: Point[] = [];

  // 方法1：端点镜像
  function getMirroredPoint(idx: number): Point {
    if (idx < 0) {
      // 左端镜像
      const mirrorIdx = -idx - 1;
      if (mirrorIdx < points.length) {
        // 以第一个点为中心的对称点
        return [
          2 * points[0][0] - points[mirrorIdx][0],
          2 * points[0][1] - points[mirrorIdx][1],
        ];
      }
    } else if (idx >= points.length) {
      // 右端镜像
      const mirrorIdx = 2 * points.length - idx - 1;
      if (mirrorIdx >= 0) {
        // 以最后一个点为中心的对称点
        return [
          2 * points[points.length - 1][0] - points[mirrorIdx][0],
          2 * points[points.length - 1][1] - points[mirrorIdx][1],
        ];
      }
    }
    return points[idx];
  }

  // 方法2：自适应窗口
  function getAdaptiveWindow(i: number): number {
    // 端点处使用较小的窗口
    const distToEdge = Math.min(i, points.length - 1 - i);
    return Math.min(halfWindow, distToEdge + Math.floor(halfWindow / 2));
  }

  for (let i = 0; i < points.length; i++) {
    let sumX = 0;
    let sumY = 0;
    let weightSum = 0;

    // 对端点使用自适应窗口
    const adaptiveWindow = getAdaptiveWindow(i);

    for (let j = -adaptiveWindow; j <= adaptiveWindow; j++) {
      const idx = i + j;
      const point = getMirroredPoint(idx);

      // 端点处使用渐变权重
      let weight = gaussianWeight(j, sigma);

      // 端点权重调整
      if (i < halfWindow || i >= points.length - halfWindow) {
        // 增加端点原始值的权重
        const edgeFactor = 1 + 0.5 * (1 - Math.abs(j) / adaptiveWindow);
        weight *= j === 0 ? edgeFactor : 1;
      }

      sumX += point[0] * weight;
      sumY += point[1] * weight;
      weightSum += weight;
    }

    // 端点处的特殊处理
    if (i === 0 || i === points.length - 1) {
      // 保持端点不变
      smoothedPoints.push([points[i][0], points[i][1]]);
    } else {
      // 平滑中间点
      smoothedPoints.push([sumX / weightSum, sumY / weightSum]);
    }
  }

  return smoothedPoints;
}
