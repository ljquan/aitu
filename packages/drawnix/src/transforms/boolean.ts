/**
 * 元素布尔运算 Transform
 * Element Boolean Operations Transforms
 *
 * 使用 clipper-lib 进行多边形布尔运算
 * 支持：Union（合并）、Difference（减去）、Intersection（相交）、Xor（排除）
 */

import {
  PlaitBoard,
  PlaitElement,
  Point,
  getSelectedElements,
  getRectangleByElements,
  deleteFragment,
  addSelectedElement,
  clearSelectedElement,
  Transforms,
  idCreator,
} from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { MessagePlugin } from 'tdesign-react';
import { PenPath, PenAnchor, PEN_TYPE, PenShape } from '../plugins/pen/type';
import { Freehand } from '../plugins/freehand/type';
import { getPathSamplePoints } from '../plugins/pen/bezier-utils';
import { getAbsoluteAnchors } from '../plugins/pen/utils';

// Clipper-lib 类型声明
interface ClipperPoint {
  X: number;
  Y: number;
}

type ClipperPath = ClipperPoint[];

interface ClipperInstance {
  AddPath: (path: ClipperPath, polyType: number, closed: boolean) => void;
  AddPaths: (paths: ClipperPath[], polyType: number, closed: boolean) => void;
  Execute: (
    clipType: number,
    solution: ClipperPath[],
    fillType1?: number,
    fillType2?: number
  ) => boolean;
}

interface ClipperLibType {
  Clipper: new () => ClipperInstance;
  PolyType: {
    ptSubject: number;
    ptClip: number;
  };
  ClipType: {
    ctUnion: number;
    ctDifference: number;
    ctIntersection: number;
    ctXor: number;
  };
  PolyFillType: {
    pftEvenOdd: number;
    pftNonZero: number;
  };
}

export type BooleanOperationType =
  | 'union'
  | 'subtract'
  | 'intersect'
  | 'exclude'
  | 'flatten';

// Clipper 使用整数运算，需要缩放因子
const CLIPPER_SCALE = 1000;

/**
 * 将 Point 数组转换为 Clipper 路径格式
 */
function pointsToClipperPath(points: Point[]): ClipperPath {
  return points.map((p) => ({
    X: Math.round(p[0] * CLIPPER_SCALE),
    Y: Math.round(p[1] * CLIPPER_SCALE),
  }));
}

/**
 * 将 Clipper 路径转换回 Point 数组
 */
function clipperPathToPoints(path: ClipperPath): Point[] {
  return path.map((p) => [p.X / CLIPPER_SCALE, p.Y / CLIPPER_SCALE] as Point);
}

/**
 * 获取形状元素的多边形点（矩形、椭圆等基础形状）
 */
/**
 * 生成圆角矩形的采样点
 * @param x 左上角 x
 * @param y 左上角 y
 * @param width 宽度
 * @param height 高度
 * @param radius 圆角半径
 * @param samplesPerCorner 每个圆角的采样点数
 */
function getRoundedRectanglePoints(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  samplesPerCorner: number = 16
): Point[] {
  // 限制圆角半径不超过宽高的一半
  const r = Math.min(radius, width / 2, height / 2);
  if (r <= 0) {
    // 没有圆角，返回普通矩形
    return [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ];
  }

  const points: Point[] = [];

  // 右上角圆弧 (从上边到右边)
  for (let i = 0; i <= samplesPerCorner; i++) {
    const angle = -Math.PI / 2 + (Math.PI / 2) * (i / samplesPerCorner);
    points.push([
      x + width - r + r * Math.cos(angle),
      y + r + r * Math.sin(angle),
    ]);
  }

  // 右下角圆弧
  for (let i = 0; i <= samplesPerCorner; i++) {
    const angle = 0 + (Math.PI / 2) * (i / samplesPerCorner);
    points.push([
      x + width - r + r * Math.cos(angle),
      y + height - r + r * Math.sin(angle),
    ]);
  }

  // 左下角圆弧
  for (let i = 0; i <= samplesPerCorner; i++) {
    const angle = Math.PI / 2 + (Math.PI / 2) * (i / samplesPerCorner);
    points.push([
      x + r + r * Math.cos(angle),
      y + height - r + r * Math.sin(angle),
    ]);
  }

  // 左上角圆弧
  for (let i = 0; i <= samplesPerCorner; i++) {
    const angle = Math.PI + (Math.PI / 2) * (i / samplesPerCorner);
    points.push([
      x + r + r * Math.cos(angle),
      y + r + r * Math.sin(angle),
    ]);
  }

  return points;
}

/**
 * 生成胶囊形状（Terminal/Stadium）的采样点
 * 左右两端是半圆
 */
function getCapsulePoints(
  x: number,
  y: number,
  width: number,
  height: number,
  samplesPerArc: number = 32
): Point[] {
  const points: Point[] = [];
  const r = height / 2; // 半圆的半径

  // 如果宽度不够，返回椭圆
  if (width <= height) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rx = width / 2;
    const ry = height / 2;
    const numPoints = samplesPerArc * 4;
    for (let i = 0; i < numPoints; i++) {
      const angle = (2 * Math.PI * i) / numPoints;
      points.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
    }
    return points;
  }

  // 上边（从左到右）
  points.push([x + r, y]);
  points.push([x + width - r, y]);

  // 右边半圆
  for (let i = 0; i <= samplesPerArc; i++) {
    const angle = -Math.PI / 2 + Math.PI * (i / samplesPerArc);
    points.push([
      x + width - r + r * Math.cos(angle),
      y + r + r * Math.sin(angle),
    ]);
  }

  // 下边（从右到左）
  points.push([x + width - r, y + height]);
  points.push([x + r, y + height]);

  // 左边半圆
  for (let i = 0; i <= samplesPerArc; i++) {
    const angle = Math.PI / 2 + Math.PI * (i / samplesPerArc);
    points.push([
      x + r + r * Math.cos(angle),
      y + r + r * Math.sin(angle),
    ]);
  }

  return points;
}

function getShapePolygon(element: PlaitDrawElement, samplesPerSegment: number = 20): Point[] {
  const points = element.points;
  if (!points || points.length < 2) return [];

  const [p1, p2] = points;
  const x = Math.min(p1[0], p2[0]);
  const y = Math.min(p1[1], p2[1]);
  const width = Math.abs(p2[0] - p1[0]);
  const height = Math.abs(p2[1] - p1[1]);

  // 检查形状类型
  const shape = (element as any).shape;

  console.log('[Boolean] Shape type:', shape, { x, y, width, height });

  if (shape === 'ellipse' || shape === 'circle') {
    // 椭圆/圆形采样 - 使用更高的采样密度以保持曲线平滑
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rx = width / 2;
    const ry = height / 2;
    const polygonPoints: Point[] = [];
    // 根据椭圆周长动态计算采样点数量，确保曲线平滑
    const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    const numPoints = Math.max(180, Math.ceil(perimeter / 2)); // 至少 180 个点

    for (let i = 0; i < numPoints; i++) {
      const angle = (2 * Math.PI * i) / numPoints;
      polygonPoints.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
    }
    
    console.log('[Boolean] Ellipse points count:', polygonPoints.length);
    return polygonPoints;
  } else if (shape === 'roundRectangle') {
    // 圆角矩形 - 使用固定圆角比例
    const radius = Math.min(width, height) * 0.15; // 15% 的圆角
    const pts = getRoundedRectanglePoints(x, y, width, height, radius, 16);
    console.log('[Boolean] RoundRectangle points count:', pts.length);
    return pts;
  } else if (shape === 'terminal' || shape === 'stadium' || shape === 'capsule') {
    // Terminal/胶囊形状 - 左右两端是半圆
    const pts = getCapsulePoints(x, y, width, height, 32);
    console.log('[Boolean] Terminal/Capsule points count:', pts.length);
    return pts;
  } else if (shape === 'triangle') {
    // 三角形
    return [
      [x + width / 2, y],
      [x + width, y + height],
      [x, y + height],
    ];
  } else if (shape === 'diamond' || shape === 'rhombus') {
    // 菱形
    return [
      [x + width / 2, y],
      [x + width, y + height / 2],
      [x + width / 2, y + height],
      [x, y + height / 2],
    ];
  } else if (shape === 'pentagon') {
    // 五边形
    const cx = x + width / 2;
    const cy = y + height / 2;
    const r = Math.min(width, height) / 2;
    const polygonPoints: Point[] = [];
    for (let i = 0; i < 5; i++) {
      const angle = (2 * Math.PI * i) / 5 - Math.PI / 2;
      polygonPoints.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    return polygonPoints;
  } else if (shape === 'hexagon') {
    // 六边形
    const cx = x + width / 2;
    const cy = y + height / 2;
    const r = Math.min(width, height) / 2;
    const polygonPoints: Point[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (2 * Math.PI * i) / 6;
      polygonPoints.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    return polygonPoints;
  } else if (shape === 'octagon') {
    // 八边形
    const cx = x + width / 2;
    const cy = y + height / 2;
    const r = Math.min(width, height) / 2;
    const polygonPoints: Point[] = [];
    for (let i = 0; i < 8; i++) {
      const angle = (2 * Math.PI * i) / 8 - Math.PI / 8;
      polygonPoints.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    return polygonPoints;
  } else if (shape === 'star') {
    // 五角星
    const cx = x + width / 2;
    const cy = y + height / 2;
    const outerR = Math.min(width, height) / 2;
    const innerR = outerR * 0.38;
    const polygonPoints: Point[] = [];
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * i) / 5 - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      polygonPoints.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    return polygonPoints;
  } else if (shape === 'cross') {
    // 十字形
    const armWidth = Math.min(width, height) * 0.33;
    const cx = x + width / 2;
    const cy = y + height / 2;
    return [
      [cx - armWidth / 2, y],
      [cx + armWidth / 2, y],
      [cx + armWidth / 2, cy - armWidth / 2],
      [x + width, cy - armWidth / 2],
      [x + width, cy + armWidth / 2],
      [cx + armWidth / 2, cy + armWidth / 2],
      [cx + armWidth / 2, y + height],
      [cx - armWidth / 2, y + height],
      [cx - armWidth / 2, cy + armWidth / 2],
      [x, cy + armWidth / 2],
      [x, cy - armWidth / 2],
      [cx - armWidth / 2, cy - armWidth / 2],
    ];
  } else if (shape === 'parallelogram') {
    // 平行四边形
    const offset = width * 0.2;
    return [
      [x + offset, y],
      [x + width, y],
      [x + width - offset, y + height],
      [x, y + height],
    ];
  } else if (shape === 'trapezoid') {
    // 梯形
    const offset = width * 0.15;
    return [
      [x + offset, y],
      [x + width - offset, y],
      [x + width, y + height],
      [x, y + height],
    ];
  } else {
    // 默认矩形
    console.log('[Boolean] Default rectangle for shape:', shape);
    return [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ];
  }
}

/**
 * 将元素转换为多边形点数组
 */
function elementToPolygon(
  board: PlaitBoard,
  element: PlaitElement,
  samplesPerSegment: number = 20
): Point[] | null {
  // PenPath 元素
  if (PenPath.isPenPath(element)) {
    if (!element.closed) {
      // 非闭合路径不能参与布尔运算
      return null;
    }
    const absoluteAnchors = getAbsoluteAnchors(element);
    return getPathSamplePoints(absoluteAnchors, true, samplesPerSegment);
  }

  // Freehand 元素
  if (Freehand.isFreehand(element)) {
    const points = element.points;
    if (!points || points.length < 3) return null;

    // 检查是否闭合（首尾点接近）
    const first = points[0];
    const last = points[points.length - 1];
    const distance = Math.hypot(last[0] - first[0], last[1] - first[1]);
    if (distance > 10) {
      // 非闭合路径
      return null;
    }
    return points;
  }

  // PlaitDrawElement 形状元素
  if (PlaitDrawElement.isDrawElement(element) && PlaitDrawElement.isShapeElement(element)) {
    // 排除图片和文本
    if (PlaitDrawElement.isImage(element) || PlaitDrawElement.isText(element)) {
      return null;
    }
    return getShapePolygon(element, samplesPerSegment);
  }

  return null;
}

/**
 * Douglas-Peucker 路径简化算法
 */
function simplifyPath(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;

  // 找到离首尾连线最远的点
  const first = points[0];
  const last = points[points.length - 1];

  let maxDistance = 0;
  let maxIndex = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const distance = pointToLineDistance(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // 如果最大距离大于容差，递归简化
  if (maxDistance > tolerance) {
    const left = simplifyPath(points.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPath(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

/**
 * 计算点到直线的距离
 */
function pointToLineDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const lineLengthSquared = dx * dx + dy * dy;

  if (lineLengthSquared === 0) {
    return Math.hypot(point[0] - lineStart[0], point[1] - lineStart[1]);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / lineLengthSquared
    )
  );

  const closestX = lineStart[0] + t * dx;
  const closestY = lineStart[1] + t * dy;

  return Math.hypot(point[0] - closestX, point[1] - closestY);
}

/**
 * 计算两个向量之间的角度（弧度）
 */
function angleBetweenVectors(v1: Point, v2: Point): number {
  const dot = v1[0] * v2[0] + v1[1] * v2[1];
  const cross = v1[0] * v2[1] - v1[1] * v2[0];
  return Math.atan2(cross, dot);
}

/**
 * 计算点的曲率（通过前后点的角度变化）
 */
function calculateCurvature(prev: Point, curr: Point, next: Point): number {
  const v1: Point = [curr[0] - prev[0], curr[1] - prev[1]];
  const v2: Point = [next[0] - curr[0], next[1] - curr[1]];
  const angle = Math.abs(angleBetweenVectors(v1, v2));
  return angle;
}

/**
 * 为平滑点生成贝塞尔控制柄
 */
function generateSmoothHandles(
  prev: Point,
  curr: Point,
  next: Point,
  smoothness: number = 0.25
): { handleIn: Point; handleOut: Point } {
  // 计算切线方向（从前一个点到后一个点的方向）
  const tangentX = next[0] - prev[0];
  const tangentY = next[1] - prev[1];
  const tangentLength = Math.hypot(tangentX, tangentY);

  if (tangentLength === 0) {
    return { handleIn: curr, handleOut: curr };
  }

  // 归一化切线
  const unitTangentX = tangentX / tangentLength;
  const unitTangentY = tangentY / tangentLength;

  // 计算到前后点的距离
  const distPrev = Math.hypot(curr[0] - prev[0], curr[1] - prev[1]);
  const distNext = Math.hypot(next[0] - curr[0], next[1] - curr[1]);

  // 控制柄长度基于到相邻点的距离
  const handleInLength = distPrev * smoothness;
  const handleOutLength = distNext * smoothness;

  // handleIn 指向前一个点的方向（切线的反方向）
  const handleIn: Point = [
    curr[0] - unitTangentX * handleInLength,
    curr[1] - unitTangentY * handleInLength,
  ];

  // handleOut 指向后一个点的方向（切线方向）
  const handleOut: Point = [
    curr[0] + unitTangentX * handleOutLength,
    curr[1] + unitTangentY * handleOutLength,
  ];

  return { handleIn, handleOut };
}

/**
 * 将多边形点数组转换为 PenPath 元素
 * 自动检测曲线段并生成平滑的贝塞尔控制点
 */
function polygonToPenPath(
  points: Point[],
  strokeColor: string = '#333333',
  fill: string = '#FFFFFF',
  strokeWidth: number = 2
): PenPath {
  if (points.length < 3) {
    throw new Error('Polygon must have at least 3 points');
  }

  console.log('[Boolean] polygonToPenPath input points:', points.length);
  console.log('[Boolean] Input points sample (first 10):', points.slice(0, 10));

  // 使用更小的容差值简化路径，保留更多曲线细节
  const simplifiedPoints = simplifyPath(points, 0.3);
  
  console.log('[Boolean] After simplify points:', simplifiedPoints.length);
  console.log('[Boolean] Simplified points sample:', simplifiedPoints.slice(0, 10));

  // 计算包围盒
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of simplifiedPoints) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }

  const origin: Point = [minX, minY];
  const n = simplifiedPoints.length;

  // 角度阈值：小于此值认为是曲线段，大于此值认为是角点
  const cornerThreshold = Math.PI * 0.4; // 约 72 度

  // 转换为相对坐标的锚点，并检测是否需要平滑
  const anchors: PenAnchor[] = simplifiedPoints.map((p, i) => {
    const relativePoint: Point = [p[0] - origin[0], p[1] - origin[1]];
    const prev = simplifiedPoints[(i - 1 + n) % n];
    const next = simplifiedPoints[(i + 1) % n];

    // 计算当前点的曲率
    const curvature = calculateCurvature(prev, p, next);

    // 如果曲率小于阈值，认为是曲线上的点，需要平滑
    if (curvature < cornerThreshold) {
      const { handleIn, handleOut } = generateSmoothHandles(prev, p, next, 0.3);
      return {
        point: relativePoint,
        handleIn: [handleIn[0] - origin[0], handleIn[1] - origin[1]] as Point,
        handleOut: [handleOut[0] - origin[0], handleOut[1] - origin[1]] as Point,
        type: 'smooth' as const,
      };
    }

    // 角点
    return {
      point: relativePoint,
      type: 'corner' as const,
    };
  });

  const penPath: PenPath = {
    id: idCreator(),
    type: PEN_TYPE,
    shape: PenShape.pen,
    points: [origin, [maxX, maxY]],
    anchors,
    closed: true,
    strokeColor,
    fill,
    strokeWidth,
  };

  return penPath;
}

/**
 * 加载 clipper-lib（动态导入）
 */
async function loadClipperLib(): Promise<ClipperLibType> {
  // clipper-lib 没有类型声明
  // @ts-expect-error - clipper-lib doesn't have type definitions
  const clipper = await import('clipper-lib');
  return clipper.default || clipper;
}

/**
 * 执行布尔运算
 */
async function executeBooleanOperation(
  board: PlaitBoard,
  clipType: number,
  language: 'zh' | 'en'
): Promise<void> {
  const selectedElements = getSelectedElements(board);

  if (selectedElements.length < 2) {
    MessagePlugin.warning(
      language === 'zh' ? '请选择至少2个闭合图形' : 'Please select at least 2 closed shapes'
    );
    return;
  }

  // 转换所有元素为多边形
  const polygons: { element: PlaitElement; polygon: Point[] }[] = [];
  for (const element of selectedElements) {
    const polygon = elementToPolygon(board, element);
    if (polygon && polygon.length >= 3) {
      polygons.push({ element, polygon });
    }
  }

  if (polygons.length < 2) {
    MessagePlugin.warning(
      language === 'zh'
        ? '请确保选中的图形都是闭合的（如矩形、椭圆、闭合钢笔路径等）'
        : 'Please make sure all selected shapes are closed (rectangles, ellipses, closed pen paths, etc.)'
    );
    return;
  }

  const loadingInstance = MessagePlugin.loading(
    language === 'zh' ? '正在处理...' : 'Processing...',
    0
  );

  try {
    const ClipperLib = await loadClipperLib();

    const clipper = new ClipperLib.Clipper();
    const solution: ClipperPath[] = [];

    // 第一个多边形作为 Subject
    const subjectPath = pointsToClipperPath(polygons[0].polygon);
    console.log('[Boolean] Subject polygon points:', polygons[0].polygon.length);
    console.log('[Boolean] Subject clipper path points:', subjectPath.length);
    clipper.AddPath(subjectPath, ClipperLib.PolyType.ptSubject, true);

    // 其余多边形作为 Clip
    for (let i = 1; i < polygons.length; i++) {
      const clipPath = pointsToClipperPath(polygons[i].polygon);
      console.log(`[Boolean] Clip ${i} polygon points:`, polygons[i].polygon.length);
      console.log(`[Boolean] Clip ${i} clipper path points:`, clipPath.length);
      clipper.AddPath(clipPath, ClipperLib.PolyType.ptClip, true);
    }

    // 执行布尔运算
    const success = clipper.Execute(
      clipType,
      solution,
      ClipperLib.PolyFillType.pftNonZero,
      ClipperLib.PolyFillType.pftNonZero
    );

    console.log('[Boolean] Clipper execution success:', success);
    console.log('[Boolean] Solution paths count:', solution.length);
    if (solution.length > 0) {
      console.log('[Boolean] Solution[0] points count:', solution[0].length);
      console.log('[Boolean] Solution[0] sample (first 5):', solution[0].slice(0, 5));
    }

    if (!success || solution.length === 0) {
      MessagePlugin.close(loadingInstance);
      MessagePlugin.warning(
        language === 'zh' ? '布尔运算无结果（图形可能不相交）' : 'No result (shapes may not intersect)'
      );
      return;
    }

    // 获取第一个元素的样式
    const firstElement = polygons[0].element;
    let strokeColor = '#333333';
    let fillColor = '#FFFFFF';
    let strokeWidth = 2;

    if (PenPath.isPenPath(firstElement)) {
      strokeColor = firstElement.strokeColor || strokeColor;
      fillColor = firstElement.fill || fillColor;
      strokeWidth = firstElement.strokeWidth || strokeWidth;
    } else if (PlaitDrawElement.isDrawElement(firstElement)) {
      strokeColor = (firstElement as any).strokeColor || strokeColor;
      fillColor = (firstElement as any).fill || fillColor;
      strokeWidth = (firstElement as any).strokeWidth || strokeWidth;
    }

    // 删除原元素
    deleteFragment(board);

    // 为每个结果多边形创建新元素
    const newElements: PenPath[] = [];
    for (const resultPath of solution) {
      const resultPoints = clipperPathToPoints(resultPath);
      if (resultPoints.length >= 3) {
        const newElement = polygonToPenPath(resultPoints, strokeColor, fillColor, strokeWidth);
        newElements.push(newElement);
      }
    }

    // 插入新元素并收集实际插入到 board 中的元素引用
    const insertedElements: PenPath[] = [];
    for (const newElement of newElements) {
      const insertIndex = board.children.length;
      Transforms.insertNode(board, newElement, [insertIndex]);
      // 获取实际插入到 board 中的元素（通过 ID 查找）
      const insertedElement = board.children.find((child) => child.id === newElement.id);
      if (insertedElement) {
        insertedElements.push(insertedElement as PenPath);
      }
    }

    // 选中新元素
    clearSelectedElement(board);
    for (const element of insertedElements) {
      addSelectedElement(board, element);
    }

    MessagePlugin.close(loadingInstance);

    const operationNames = {
      [ClipperLib.ClipType.ctUnion]: language === 'zh' ? '合并' : 'Union',
      [ClipperLib.ClipType.ctDifference]: language === 'zh' ? '减去' : 'Subtract',
      [ClipperLib.ClipType.ctIntersection]: language === 'zh' ? '相交' : 'Intersect',
      [ClipperLib.ClipType.ctXor]: language === 'zh' ? '排除' : 'Exclude',
    };

    MessagePlugin.success(
      language === 'zh'
        ? `${operationNames[clipType]}完成，生成 ${newElements.length} 个图形`
        : `${operationNames[clipType]} completed, ${newElements.length} shape(s) created`
    );
  } catch (error: any) {
    MessagePlugin.close(loadingInstance);
    console.error('Boolean operation error:', error);
    MessagePlugin.error(error.message || (language === 'zh' ? '操作失败' : 'Operation failed'));
  }
}

/**
 * 合并操作 (Union)
 */
const booleanUnion = async (board: PlaitBoard, language: 'zh' | 'en' = 'zh') => {
  const ClipperLib = await loadClipperLib();
  await executeBooleanOperation(board, ClipperLib.ClipType.ctUnion, language);
};

/**
 * 减去操作 (Subtract)
 */
const booleanSubtract = async (board: PlaitBoard, language: 'zh' | 'en' = 'zh') => {
  const ClipperLib = await loadClipperLib();
  await executeBooleanOperation(board, ClipperLib.ClipType.ctDifference, language);
};

/**
 * 相交操作 (Intersect)
 */
const booleanIntersect = async (board: PlaitBoard, language: 'zh' | 'en' = 'zh') => {
  const ClipperLib = await loadClipperLib();
  await executeBooleanOperation(board, ClipperLib.ClipType.ctIntersection, language);
};

/**
 * 排除操作 (Exclude)
 */
const booleanExclude = async (board: PlaitBoard, language: 'zh' | 'en' = 'zh') => {
  const ClipperLib = await loadClipperLib();
  await executeBooleanOperation(board, ClipperLib.ClipType.ctXor, language);
};

/**
 * 扁平化操作 (Flatten)
 * 将所有选中的闭合图形合并为单一轮廓
 */
const booleanFlatten = async (board: PlaitBoard, language: 'zh' | 'en' = 'zh') => {
  // Flatten 使用 Union 操作，但确保所有图形都被处理
  const ClipperLib = await loadClipperLib();
  await executeBooleanOperation(board, ClipperLib.ClipType.ctUnion, language);
};

/**
 * 布尔运算 Transforms 命名空间
 */
export const BooleanTransforms = {
  /**
   * 合并 (Union)
   */
  union: booleanUnion,

  /**
   * 减去 (Subtract)
   */
  subtract: booleanSubtract,

  /**
   * 相交 (Intersect)
   */
  intersect: booleanIntersect,

  /**
   * 排除 (Exclude)
   */
  exclude: booleanExclude,

  /**
   * 扁平化 (Flatten)
   */
  flatten: booleanFlatten,
};
