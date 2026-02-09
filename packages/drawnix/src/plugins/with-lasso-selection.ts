/**
 * 套索选择插件
 *
 * 通过自由绘制路径选择画布元素（Non-Zero Winding Rule 多边形包围检测）。
 * 在 Active SVG 层绘制带蚂蚁线动画的套索路径。
 */

import {
  PlaitBoard,
  PlaitElement,
  RectangleClient,
  Point,
  Transforms,
  clearSelectedElement,
  getSelectedElements,
  isMainPointer,
  toHostPoint,
  toViewBoxPoint,
  toActivePointFromViewBoxPoint,
} from '@plait/core';

/** 套索指针类型常量 */
export const LassoPointerType = 'lasso' as const;

/** 路径简化容差（像素/zoom） */
const SIMPLIFY_TOLERANCE = 3;

/** 蚂蚁线动画样式 */
const LASSO_STROKE_COLOR = '#6698FF';
const LASSO_FILL_COLOR = 'rgba(102, 152, 255, 0.08)';
const LASSO_STROKE_WIDTH = 1.5;
const LASSO_DASH_ARRAY = '6 4';
const LASSO_DASH_SPEED = '0.4s';

/**
 * 简化路径（Douglas-Peucker 变体）
 */
function simplifyPath(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }
  if (maxDist > tolerance) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), tolerance);
    const right = simplifyPath(points.slice(maxIdx), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(point[0] - lineStart[0], point[1] - lineStart[1]);
  }
  const t = Math.max(0, Math.min(1, ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / lenSq));
  const projX = lineStart[0] + t * dx;
  const projY = lineStart[1] + t * dy;
  return Math.hypot(point[0] - projX, point[1] - projY);
}

/**
 * Non-Zero Winding Rule 点在多边形内判定
 */
function isPointInPolygonNonZero(px: number, py: number, polygon: Point[]): boolean {
  let windingNumber = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % n];
    if (y1 <= py) {
      if (y2 > py) {
        if (isLeft(x1, y1, x2, y2, px, py) > 0) {
          windingNumber++;
        }
      }
    } else {
      if (y2 <= py) {
        if (isLeft(x1, y1, x2, y2, px, py) < 0) {
          windingNumber--;
        }
      }
    }
  }
  return windingNumber !== 0;
}

function isLeft(x1: number, y1: number, x2: number, y2: number, px: number, py: number): number {
  return (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1);
}

/**
 * 线段相交检测
 */
function doSegmentsIntersect(
  a1: Point, a2: Point, b1: Point, b2: Point
): boolean {
  const d1 = isLeft(a1[0], a1[1], a2[0], a2[1], b1[0], b1[1]);
  const d2 = isLeft(a1[0], a1[1], a2[0], a2[1], b2[0], b2[1]);
  const d3 = isLeft(b1[0], b1[1], b2[0], b2[1], a1[0], a1[1]);
  const d4 = isLeft(b1[0], b1[1], b2[0], b2[1], a2[0], a2[1]);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

/**
 * 获取元素的边界角点（ViewBox 坐标系）
 */
function getElementCorners(board: PlaitBoard, element: PlaitElement): Point[] | null {
  const rect = board.getRectangle(element);
  if (!rect) return null;
  return [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
  ];
}

/**
 * 获取元素的中心点
 */
function getElementCenter(rect: RectangleClient): Point {
  return [rect.x + rect.width / 2, rect.y + rect.height / 2];
}

/**
 * 双重检测：包围测试 + 相交测试
 */
function isElementHitByLasso(
  board: PlaitBoard,
  element: PlaitElement,
  lassoPolygon: Point[],
  lassoBounds: RectangleClient
): boolean {
  const rect = board.getRectangle(element);
  if (!rect) return false;

  // AABB 粗筛
  const elementBounds: RectangleClient = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  if (!RectangleClient.isHit(lassoBounds, elementBounds)) {
    return false;
  }

  const corners = getElementCorners(board, element);
  if (!corners) return false;

  // 包围测试：元素任意角点或中心点在套索多边形内
  const center = getElementCenter(rect);
  const allTestPoints = [...corners, center];
  for (const pt of allTestPoints) {
    if (isPointInPolygonNonZero(pt[0], pt[1], lassoPolygon)) {
      return true;
    }
  }

  // 相交测试：套索路径线段与元素边界线段相交
  const edgeSegments: [Point, Point][] = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];
  for (let i = 0; i < lassoPolygon.length; i++) {
    const la = lassoPolygon[i];
    const lb = lassoPolygon[(i + 1) % lassoPolygon.length];
    for (const [ea, eb] of edgeSegments) {
      if (doSegmentsIntersect(la, lb, ea, eb)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 将 ViewBox 点数组转为 SVG path d 字符串
 */
function pointsToPathD(points: Point[], board: PlaitBoard): string {
  if (points.length === 0) return '';

  const parts: string[] = [];
  const first = toActivePointFromViewBoxPoint(board, points[0]);
  parts.push(`M ${first[0]} ${first[1]}`);
  for (let i = 1; i < points.length; i++) {
    const pt = toActivePointFromViewBoxPoint(board, points[i]);
    parts.push(`L ${pt[0]} ${pt[1]}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/**
 * 创建套索 SVG 路径元素（带蚂蚁线动画）
 */
function createLassoSvgElements(): { g: SVGGElement; path: SVGPathElement } {
  const NS = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('class', 'lasso-selection-overlay');

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('fill', LASSO_FILL_COLOR);
  path.setAttribute('stroke', LASSO_STROKE_COLOR);
  path.setAttribute('stroke-width', String(LASSO_STROKE_WIDTH));
  path.setAttribute('stroke-dasharray', LASSO_DASH_ARRAY);
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.style.pointerEvents = 'none';

  // 蚂蚁线动画
  const animate = document.createElementNS(NS, 'animate');
  animate.setAttribute('attributeName', 'stroke-dashoffset');
  animate.setAttribute('from', '0');
  animate.setAttribute('to', '20');
  animate.setAttribute('dur', LASSO_DASH_SPEED);
  animate.setAttribute('repeatCount', 'indefinite');
  path.appendChild(animate);

  g.appendChild(path);
  return { g, path };
}

/**
 * 套索选择插件
 */
export const withLassoSelection = (board: PlaitBoard): PlaitBoard => {
  const { pointerDown, pointerMove, globalPointerUp } = board;

  let isLassoing = false;
  let lassoViewBoxPoints: Point[] = [];
  let lassoG: SVGGElement | null = null;
  let lassoPath: SVGPathElement | null = null;
  let isShift = false;
  let previousSelectedElements: PlaitElement[] = [];

  const cleanup = () => {
    if (lassoG && lassoG.parentNode) {
      lassoG.parentNode.removeChild(lassoG);
    }
    lassoG = null;
    lassoPath = null;
    lassoViewBoxPoints = [];
    isLassoing = false;
    isShift = false;
    previousSelectedElements = [];
  };

  board.pointerDown = (event: PointerEvent) => {
    if (
      PlaitBoard.isPointer(board, LassoPointerType) &&
      isMainPointer(event) &&
      !event.ctrlKey && !event.metaKey
    ) {
      isLassoing = true;
      isShift = event.shiftKey;

      // Shift 模式下保留已选元素
      if (isShift) {
        previousSelectedElements = getSelectedElements(board);
      } else {
        previousSelectedElements = [];
        clearSelectedElement(board);
      }

      const hostPoint = toHostPoint(board, event.x, event.y);
      const viewBoxPoint = toViewBoxPoint(board, hostPoint);
      lassoViewBoxPoints = [viewBoxPoint];

      // 创建 SVG 覆盖
      const activeHost = PlaitBoard.getActiveHost(board);
      const elements = createLassoSvgElements();
      lassoG = elements.g;
      lassoPath = elements.path;
      activeHost.appendChild(lassoG);

      return;
    }
    pointerDown(event);
  };

  board.pointerMove = (event: PointerEvent) => {
    if (isLassoing && lassoPath) {
      const hostPoint = toHostPoint(board, event.x, event.y);
      const viewBoxPoint = toViewBoxPoint(board, hostPoint);
      lassoViewBoxPoints.push(viewBoxPoint);

      // 更新 SVG 路径
      const d = pointsToPathD(lassoViewBoxPoints, board);
      lassoPath.setAttribute('d', d);

      // 实时更新选中元素
      updateLassoSelection(board, lassoViewBoxPoints, previousSelectedElements);
      return;
    }
    pointerMove(event);
  };

  board.globalPointerUp = (event: PointerEvent) => {
    if (isLassoing) {
      // 简化路径并做最终选择
      const zoom = board.viewport.zoom;
      const simplified = simplifyPath(lassoViewBoxPoints, SIMPLIFY_TOLERANCE / zoom);
      if (simplified.length >= 3) {
        updateLassoSelection(board, simplified, previousSelectedElements, true);
      }
      cleanup();
      return;
    }
    globalPointerUp(event);
  };

  return board;
};

/**
 * 根据套索路径更新选中元素
 * @param isFinal 是否为最终选择（pointerUp 时），需要触发选中框渲染
 */
function updateLassoSelection(
  board: PlaitBoard,
  lassoPoints: Point[],
  previousSelected: PlaitElement[],
  isFinal = false
): void {
  if (lassoPoints.length < 3) return;

  const lassoBounds = RectangleClient.getRectangleByPoints(lassoPoints);

  const hitElements: PlaitElement[] = [];
  for (const element of board.children) {
    if (isElementHitByLasso(board, element, lassoPoints, lassoBounds)) {
      hitElements.push(element);
    }
  }

  // Shift 模式：合并之前的选中集
  const finalElements = previousSelected.length > 0
    ? mergeSelections(previousSelected, hitElements)
    : hitElements;

  if (isFinal && finalElements.length > 0) {
    // 通过 addSelectionWithTemporaryElements 触发 onChange，渲染选中框
    Transforms.addSelectionWithTemporaryElements(board, finalElements);
  }
}

/**
 * 合并选中集合（去重）
 */
function mergeSelections(prev: PlaitElement[], current: PlaitElement[]): PlaitElement[] {
  const idSet = new Set(prev.map(el => el.id));
  const merged = [...prev];
  for (const el of current) {
    if (!idSet.has(el.id)) {
      merged.push(el);
      idSet.add(el.id);
    }
  }
  return merged;
}
