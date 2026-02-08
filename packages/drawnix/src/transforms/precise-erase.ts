/**
 * 精确橡皮擦功能
 * 使用布尔运算（Difference）从元素中精确擦除经过的区域
 */

import {
  PlaitBoard,
  PlaitElement,
  Point,
  Transforms,
  idCreator,
  RectangleClient,
} from '@plait/core';
import { CoreTransforms } from '@plait/core';
import { PlaitDrawElement } from '@plait/draw';
import { PenPath, PenAnchor, PEN_TYPE, PenShape } from '../plugins/pen/type';
import { Freehand } from '../plugins/freehand/type';
import { EraserShape } from '../plugins/freehand/freehand-settings';
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
  Execute: (
    clipType: number,
    solution: ClipperPath[],
    fillType1?: number,
    fillType2?: number
  ) => boolean;
}

interface ClipperOffsetInstance {
  AddPath: (path: ClipperPath, joinType: number, endType: number) => void;
  Execute: (solution: ClipperPath[], delta: number) => void;
}

interface ClipperLibType {
  Clipper: new () => ClipperInstance;
  ClipperOffset: new () => ClipperOffsetInstance;
  PolyType: {
    ptSubject: number;
    ptClip: number;
  };
  ClipType: {
    ctDifference: number;
    ctIntersection: number;
  };
  PolyFillType: {
    pftNonZero: number;
  };
  JoinType: {
    jtRound: number;
    jtMiter: number;
    jtSquare: number;
  };
  EndType: {
    etOpenRound: number;
    etOpenSquare: number;
    etOpenButt: number;
  };
}

// Clipper 使用整数运算，需要缩放因子
const CLIPPER_SCALE = 1000;

/**
 * 加载 clipper-lib
 */
async function loadClipperLib(): Promise<ClipperLibType> {
  // @ts-expect-error - clipper-lib doesn't have type definitions
  const clipper = await import('clipper-lib');
  return clipper.default || clipper;
}

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
 * 将橡皮擦路径转换为有宽度的多边形
 * 使用 ClipperOffset 将线段扩展为带宽度的区域
 * @param points 路径点
 * @param width 橡皮擦宽度
 * @param shape 橡皮擦形状（圆形使用圆角，方形使用直角）
 */
export async function eraserPathToPolygon(
  points: Point[],
  width: number,
  shape: EraserShape = EraserShape.circle
): Promise<Point[]> {
  if (points.length < 2) return [];

  const ClipperLib = await loadClipperLib();

  // 将路径转换为 Clipper 格式
  const clipperPath = pointsToClipperPath(points);

  // 使用 ClipperOffset 扩展路径
  const offset = new ClipperLib.ClipperOffset();
  
  // 根据形状选择不同的连接和端点类型
  if (shape === EraserShape.square) {
    // 方形：使用直角连接和直角端点
    offset.AddPath(
      clipperPath,
      ClipperLib.JoinType.jtMiter,
      ClipperLib.EndType.etOpenSquare
    );
  } else {
    // 圆形：使用圆角连接和圆角端点
    offset.AddPath(
      clipperPath,
      ClipperLib.JoinType.jtRound,
      ClipperLib.EndType.etOpenRound
    );
  }

  const result: ClipperPath[] = [];
  offset.Execute(result, (width / 2) * CLIPPER_SCALE);

  if (result.length === 0) return [];

  // 转换回 Point 格式
  return clipperPathToPoints(result[0]);
}

/**
 * 检查 Freehand 是否闭合
 */
function isFreehandClosed(element: Freehand): boolean {
  const points = element.points;
  if (!points || points.length < 3) return false;
  const first = points[0];
  const last = points[points.length - 1];
  const distance = Math.hypot(last[0] - first[0], last[1] - first[1]);
  return distance <= 10;
}

/**
 * 将元素转换为多边形点数组
 * 仅支持闭合路径，非闭合路径返回 null
 */
function elementToPolygon(
  element: PlaitElement,
  samplesPerSegment: number = 20
): Point[] | null {
  // PenPath 元素 - 仅支持闭合路径
  if (PenPath.isPenPath(element)) {
    if (!element.closed) {
      return null;
    }
    const absoluteAnchors = getAbsoluteAnchors(element);
    return getPathSamplePoints(absoluteAnchors, true, samplesPerSegment);
  }

  // Freehand 元素 - 仅支持闭合路径
  if (Freehand.isFreehand(element)) {
    const points = element.points;
    if (!points || points.length < 3) return null;
    if (!isFreehandClosed(element)) {
      return null;
    }
    return points;
  }

  // PlaitDrawElement 形状元素
  if (PlaitDrawElement.isDrawElement(element) && PlaitDrawElement.isShapeElement(element)) {
    if (PlaitDrawElement.isImage(element) || PlaitDrawElement.isText(element)) {
      return null;
    }
    return getShapePolygon(element, samplesPerSegment);
  }

  return null;
}

/**
 * 获取形状元素的多边形点
 */
function getShapePolygon(element: PlaitDrawElement, samplesPerSegment: number = 20): Point[] {
  const points = element.points;
  if (!points || points.length < 2) return [];

  const [p1, p2] = points;
  const x = Math.min(p1[0], p2[0]);
  const y = Math.min(p1[1], p2[1]);
  const width = Math.abs(p2[0] - p1[0]);
  const height = Math.abs(p2[1] - p1[1]);
  const shape = (element as any).shape;

  if (shape === 'ellipse' || shape === 'circle') {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rx = width / 2;
    const ry = height / 2;
    const polygonPoints: Point[] = [];
    const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    const numPoints = Math.max(180, Math.ceil(perimeter / 2));

    for (let i = 0; i < numPoints; i++) {
      const angle = (2 * Math.PI * i) / numPoints;
      polygonPoints.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
    }
    return polygonPoints;
  }

  // 默认矩形
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
}

/**
 * 将多边形点数组转换为 PenPath 元素
 */
function polygonToPenPath(
  points: Point[],
  strokeColor: string,
  fill: string,
  strokeWidth: number
): PenPath {
  if (points.length < 3) {
    throw new Error('Polygon must have at least 3 points');
  }

  // 计算包围盒
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }

  const origin: Point = [minX, minY];

  // 转换为相对坐标的锚点
  const anchors: PenAnchor[] = points.map((p) => ({
    point: [p[0] - origin[0], p[1] - origin[1]] as Point,
    type: 'corner' as const,
  }));

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
 * 获取元素的样式属性
 */
function getElementStyle(element: PlaitElement): {
  strokeColor: string;
  fill: string;
  strokeWidth: number;
} {
  let strokeColor = '#333333';
  let fill = '#FFFFFF';
  let strokeWidth = 2;

  if (PenPath.isPenPath(element)) {
    strokeColor = element.strokeColor || strokeColor;
    fill = element.fill || fill;
    strokeWidth = element.strokeWidth || strokeWidth;
  } else if (Freehand.isFreehand(element)) {
    strokeColor = (element as any).strokeColor || strokeColor;
    strokeWidth = element.strokeWidth || strokeWidth;
  } else if (PlaitDrawElement.isDrawElement(element)) {
    strokeColor = (element as any).strokeColor || strokeColor;
    fill = (element as any).fill || fill;
    strokeWidth = (element as any).strokeWidth || strokeWidth;
  }

  return { strokeColor, fill, strokeWidth };
}

/**
 * 检测两个多边形是否真正相交
 * 使用 Intersection 操作，如果结果非空则相交
 */
async function polygonsIntersect(
  polygon1: Point[],
  polygon2: Point[]
): Promise<boolean> {
  const ClipperLib = await loadClipperLib();
  const clipper = new ClipperLib.Clipper();
  const intersection: ClipperPath[] = [];

  clipper.AddPath(
    pointsToClipperPath(polygon1),
    ClipperLib.PolyType.ptSubject,
    true
  );

  clipper.AddPath(
    pointsToClipperPath(polygon2),
    ClipperLib.PolyType.ptClip,
    true
  );

  clipper.Execute(
    ClipperLib.ClipType.ctIntersection,
    intersection,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero
  );

  // 如果有相交区域，则认为相交
  return intersection.length > 0;
}

/**
 * 从单个元素中擦除指定区域
 * 返回 null 表示不需要处理（没有相交），返回空数组表示完全擦除，返回非空数组表示部分擦除
 */
async function eraseFromElement(
  board: PlaitBoard,
  element: PlaitElement,
  eraserPolygon: Point[]
): Promise<PenPath[] | null> {
  // 将元素转换为多边形（仅支持闭合路径）
  const elementPolygon = elementToPolygon(element);
  if (!elementPolygon || elementPolygon.length < 3) {
    return null;
  }

  // 先检测是否真正相交，避免对不相交的元素进行处理
  // 这可以防止 Clipper 对自相交多边形进行不必要的"规范化"
  const hasIntersection = await polygonsIntersect(elementPolygon, eraserPolygon);
  if (!hasIntersection) {
    // 没有相交，不需要处理此元素
    return null;
  }

  const ClipperLib = await loadClipperLib();
  const clipper = new ClipperLib.Clipper();
  const solution: ClipperPath[] = [];

  // 元素作为 Subject
  clipper.AddPath(
    pointsToClipperPath(elementPolygon),
    ClipperLib.PolyType.ptSubject,
    true
  );

  // 橡皮擦区域作为 Clip
  clipper.AddPath(
    pointsToClipperPath(eraserPolygon),
    ClipperLib.PolyType.ptClip,
    true
  );

  // 执行 Difference
  const success = clipper.Execute(
    ClipperLib.ClipType.ctDifference,
    solution,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero
  );

  if (!success) {
    return null;
  }

  // 获取元素样式
  const { strokeColor, fill, strokeWidth } = getElementStyle(element);

  // 计算每个路径的有符号面积（Shoelace 公式）
  // 正面积 = 逆时针（外环），负面积 = 顺时针（孔洞）
  const pathsWithArea: { path: ClipperPath; signedArea: number; absArea: number }[] = [];
  
  for (const resultPath of solution) {
    if (resultPath.length >= 3) {
      let signedArea = 0;
      for (let i = 0; i < resultPath.length; i++) {
        const j = (i + 1) % resultPath.length;
        signedArea += resultPath[i].X * resultPath[j].Y;
        signedArea -= resultPath[j].X * resultPath[i].Y;
      }
      signedArea = signedArea / 2;
      pathsWithArea.push({
        path: resultPath,
        signedArea,
        absArea: Math.abs(signedArea),
      });
    }
  }

  // 如果没有有效路径，返回空数组（完全擦除）
  if (pathsWithArea.length === 0) {
    return [];
  }

  // 面积最大的是外环，其他所有路径都视为孔洞（不依赖面积符号判断）
  const sortedByArea = [...pathsWithArea].sort((a, b) => b.absArea - a.absArea);
  const outerRing = sortedByArea[0];
  const holes = sortedByArea.slice(1); // 所有较小的路径都是孔洞
  
  // 将所有孔洞通过"切口"合并到外环，保持为单一图形
  let finalPath: ClipperPath;
  if (holes.length > 0) {
    finalPath = mergeOuterWithHoles(outerRing.path, holes.map(h => h.path));
  } else {
    finalPath = outerRing.path;
  }

  const resultPoints = clipperPathToPoints(finalPath);
  try {
    const newElement = polygonToPenPath(resultPoints, strokeColor, fill, strokeWidth);
    return [newElement];
  } catch {
    return [];
  }
}

/**
 * 将外环和孔洞通过"切口"合并成单一闭合路径
 * 切口是一条从外环到孔洞的连接线，使整体仍是一个闭合多边形
 */
function mergeOuterWithHoles(outer: ClipperPath, holes: ClipperPath[]): ClipperPath {
  let result = [...outer];
  
  for (const hole of holes) {
    // 找到外环和孔洞之间最近的点对
    let minDist = Infinity;
    let outerIdx = 0;
    let holeIdx = 0;
    
    for (let i = 0; i < result.length; i++) {
      for (let j = 0; j < hole.length; j++) {
        const dx = result[i].X - hole[j].X;
        const dy = result[i].Y - hole[j].Y;
        const dist = dx * dx + dy * dy;
        if (dist < minDist) {
          minDist = dist;
          outerIdx = i;
          holeIdx = j;
        }
      }
    }
    
    // 构建合并后的路径：
    // 从外环起点走到切口点 -> 进入孔洞绕一圈 -> 回到外环切口点 -> 继续外环剩余部分
    const merged: ClipperPath = [];
    
    // 外环：从起点到切口点（包含切口点）
    for (let i = 0; i <= outerIdx; i++) {
      merged.push(result[i]);
    }
    
    // 孔洞：从切口点开始绕一圈
    for (let i = 0; i < hole.length; i++) {
      const idx = (holeIdx + i) % hole.length;
      merged.push(hole[idx]);
    }
    
    // 回到孔洞切口点，形成闭合
    merged.push(hole[holeIdx]);
    
    // 外环：从切口点继续到终点
    for (let i = outerIdx; i < result.length; i++) {
      merged.push(result[i]);
    }
    
    result = merged;
  }
  
  return result;
}

/**
 * 获取元素的边界框
 */
function getElementBoundingBox(element: PlaitElement): RectangleClient | null {
  // Freehand 元素：points 是路径点数组
  if (Freehand.isFreehand(element)) {
    const points = element.points;
    if (!points || points.length < 2) return null;
    const baseRect = RectangleClient.getRectangleByPoints(points);
    const strokeWidth = element.strokeWidth ?? 2;
    const padding = strokeWidth / 2;
    return {
      x: baseRect.x - padding,
      y: baseRect.y - padding,
      width: baseRect.width + strokeWidth,
      height: baseRect.height + strokeWidth,
    };
  }

  // PenPath 元素：points 是 [p1, p2] 包围盒
  if (PenPath.isPenPath(element)) {
    const points = element.points;
    if (!points || points.length < 2) return null;
    const [p1, p2] = points;
    return {
      x: Math.min(p1[0], p2[0]),
      y: Math.min(p1[1], p2[1]),
      width: Math.abs(p2[0] - p1[0]),
      height: Math.abs(p2[1] - p1[1]),
    };
  }

  // 其他元素：points 是 [p1, p2] 包围盒
  const elementPoints = (element as any).points;
  if (!elementPoints || elementPoints.length < 2) return null;
  const [p1, p2] = elementPoints;
  return {
    x: Math.min(p1[0], p2[0]),
    y: Math.min(p1[1], p2[1]),
    width: Math.abs(p2[0] - p1[0]),
    height: Math.abs(p2[1] - p1[1]),
  };
}

/**
 * 检测与橡皮擦路径相交的元素
 */
export function findElementsInEraserPath(
  board: PlaitBoard,
  eraserPath: Point[],
  eraserWidth: number
): PlaitElement[] {
  if (eraserPath.length < 2) return [];

  // 计算橡皮擦路径的包围盒（扩展宽度）
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of eraserPath) {
    minX = Math.min(minX, p[0] - eraserWidth);
    minY = Math.min(minY, p[1] - eraserWidth);
    maxX = Math.max(maxX, p[0] + eraserWidth);
    maxY = Math.max(maxY, p[1] + eraserWidth);
  }

  const intersectingElements: PlaitElement[] = [];

  for (const element of board.children) {
    // 跳过不支持布尔运算的元素
    if (!canElementBePreciseErased(element)) {
      continue;
    }

    // 获取元素边界框
    const elementRect = getElementBoundingBox(element);
    if (!elementRect) continue;

    const { x: ex, y: ey, width: ew, height: eh } = elementRect;

    // 检测包围盒是否相交
    if (ex + ew >= minX && ex <= maxX && ey + eh >= minY && ey <= maxY) {
      intersectingElements.push(element);
    }
  }

  return intersectingElements;
}

/**
 * 不支持精确擦除的原因
 */
export type UnsupportedEraseReason = 
  | 'openPath'      // 未闭合路径（线条）
  | 'image'         // 图片
  | 'text'          // 文本
  | 'arrowLine'     // 箭头线
  | 'vectorLine'    // 矢量线
  | 'unsupported';  // 其他不支持的类型

/**
 * 检查元素是否支持精确擦除
 * 仅支持闭合路径，非闭合线条不支持
 */
function canElementBePreciseErased(element: PlaitElement): boolean {
  // 钢笔路径 - 仅支持闭合
  if (PenPath.isPenPath(element)) {
    return element.closed;
  }

  // 手绘路径 - 仅支持闭合
  if (Freehand.isFreehand(element)) {
    return isFreehandClosed(element);
  }

  // PlaitDrawElement 形状元素
  if (PlaitDrawElement.isDrawElement(element)) {
    if (
      PlaitDrawElement.isImage(element) ||
      PlaitDrawElement.isText(element) ||
      PlaitDrawElement.isArrowLine(element) ||
      PlaitDrawElement.isVectorLine(element)
    ) {
      return false;
    }
    return PlaitDrawElement.isShapeElement(element);
  }

  return false;
}

/**
 * 获取元素不支持精确擦除的原因
 */
export function getUnsupportedEraseReason(element: PlaitElement): UnsupportedEraseReason | null {
  // 钢笔路径
  if (PenPath.isPenPath(element)) {
    if (!element.closed) {
      return 'openPath';
    }
    return null;
  }

  // 手绘路径
  if (Freehand.isFreehand(element)) {
    if (!isFreehandClosed(element)) {
      return 'openPath';
    }
    return null;
  }

  // PlaitDrawElement 形状元素
  if (PlaitDrawElement.isDrawElement(element)) {
    if (PlaitDrawElement.isImage(element)) {
      return 'image';
    }
    if (PlaitDrawElement.isText(element)) {
      return 'text';
    }
    if (PlaitDrawElement.isArrowLine(element)) {
      return 'arrowLine';
    }
    if (PlaitDrawElement.isVectorLine(element)) {
      return 'vectorLine';
    }
    if (PlaitDrawElement.isShapeElement(element)) {
      return null;
    }
  }

  return 'unsupported';
}

/**
 * 检测橡皮擦路径上不支持精确擦除的元素
 * 返回检测到的第一个不支持的原因
 */
export function findUnsupportedElementsInPath(
  board: PlaitBoard,
  eraserPath: Point[],
  eraserWidth: number
): UnsupportedEraseReason | null {
  if (eraserPath.length < 2) return null;

  // 计算橡皮擦路径的包围盒（扩展宽度）
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of eraserPath) {
    minX = Math.min(minX, p[0] - eraserWidth);
    minY = Math.min(minY, p[1] - eraserWidth);
    maxX = Math.max(maxX, p[0] + eraserWidth);
    maxY = Math.max(maxY, p[1] + eraserWidth);
  }

  for (const element of board.children) {
    // 获取元素边界框
    const elementRect = getElementBoundingBox(element);
    if (!elementRect) continue;

    const { x: ex, y: ey, width: ew, height: eh } = elementRect;

    // 检测包围盒是否相交
    if (ex + ew >= minX && ex <= maxX && ey + eh >= minY && ey <= maxY) {
      // 检查是否不支持
      const reason = getUnsupportedEraseReason(element);
      if (reason) {
        return reason;
      }
    }
  }

  return null;
}

/**
 * 查找橡皮擦路径上不支持精确擦除的元素（用于直接删除）
 */
export function findUnsupportedElementsInEraserPath(
  board: PlaitBoard,
  eraserPath: Point[],
  eraserWidth: number
): PlaitElement[] {
  if (eraserPath.length < 2) return [];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of eraserPath) {
    minX = Math.min(minX, p[0] - eraserWidth);
    minY = Math.min(minY, p[1] - eraserWidth);
    maxX = Math.max(maxX, p[0] + eraserWidth);
    maxY = Math.max(maxY, p[1] + eraserWidth);
  }

  const result: PlaitElement[] = [];
  for (const element of board.children) {
    const elementRect = getElementBoundingBox(element);
    if (!elementRect) continue;

    const { x: ex, y: ey, width: ew, height: eh } = elementRect;
    if (ex + ew >= minX && ex <= maxX && ey + eh >= minY && ey <= maxY) {
      if (getUnsupportedEraseReason(element)) {
        result.push(element);
      }
    }
  }
  return result;
}

/**
 * 执行精确擦除操作
 * @param board 画板
 * @param eraserPath 橡皮擦路径点
 * @param eraserWidth 橡皮擦宽度
 * @param eraserShape 橡皮擦形状
 * @param targetElements 目标元素列表
 */
export async function executePreciseErase(
  board: PlaitBoard,
  eraserPath: Point[],
  eraserWidth: number,
  eraserShape: EraserShape,
  targetElements: PlaitElement[]
): Promise<void> {
  if (targetElements.length === 0) return;

  // 将橡皮擦路径转换为多边形
  const eraserPolygon = await eraserPathToPolygon(eraserPath, eraserWidth, eraserShape);
  if (eraserPolygon.length < 3) return;

  // 收集所有需要删除的元素和新创建的元素
  const elementsToRemove: PlaitElement[] = [];
  const elementsToAdd: PenPath[] = [];

  // 对每个目标元素执行 Difference 操作
  for (const element of targetElements) {
    const newElements = await eraseFromElement(board, element, eraserPolygon);
    
    // null 表示没有相交，跳过此元素（不删除也不替换）
    if (newElements === null) {
      continue;
    }
    
    // 有结果（空数组表示完全擦除，非空数组表示部分擦除），标记原元素删除
    elementsToRemove.push(element);
    
    // 添加新元素
    elementsToAdd.push(...newElements);
  }

  // 批量删除原元素
  if (elementsToRemove.length > 0) {
    CoreTransforms.removeElements(board, elementsToRemove);
  }

  // 批量插入新元素
  for (const newElement of elementsToAdd) {
    Transforms.insertNode(board, newElement, [board.children.length]);
  }
}
