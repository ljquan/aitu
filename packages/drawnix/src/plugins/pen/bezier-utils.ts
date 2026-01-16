import { Point } from '@plait/core';
import { PenAnchor } from './type';

/**
 * 计算三次贝塞尔曲线上的点
 * @param t 参数 0-1
 * @param p0 起点
 * @param p1 控制点1
 * @param p2 控制点2
 * @param p3 终点
 */
export function cubicBezierPoint(
  t: number,
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point
): Point {
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;

  return [
    mt3 * p0[0] + 3 * mt2 * t * p1[0] + 3 * mt * t2 * p2[0] + t3 * p3[0],
    mt3 * p0[1] + 3 * mt2 * t * p1[1] + 3 * mt * t2 * p2[1] + t3 * p3[1],
  ];
}

/**
 * 计算点到三次贝塞尔曲线的最近距离
 * 使用采样方法近似计算
 */
export function distanceToCubicBezier(
  point: Point,
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  samples: number = 50
): number {
  let minDistance = Infinity;

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const bezierPoint = cubicBezierPoint(t, p0, p1, p2, p3);
    const distance = Math.hypot(point[0] - bezierPoint[0], point[1] - bezierPoint[1]);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

/**
 * 计算两点之间的距离
 */
export function distanceBetweenPoints(p1: Point, p2: Point): number {
  return Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
}

/**
 * 计算两点的中点
 */
export function midPoint(p1: Point, p2: Point): Point {
  return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
}

/**
 * 将点绕另一个点旋转180度（镜像）
 */
export function mirrorPoint(point: Point, center: Point): Point {
  return [2 * center[0] - point[0], 2 * center[1] - point[1]];
}

/**
 * 计算从 center 到 point 的向量，并按 length 缩放
 */
export function scaleVector(center: Point, point: Point, length: number): Point {
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  const currentLength = Math.hypot(dx, dy);
  if (currentLength === 0) return center;
  const scale = length / currentLength;
  return [center[0] + dx * scale, center[1] + dy * scale];
}

/**
 * 检查点是否有效（非 NaN）
 */
function isValidPoint(point: [number, number] | undefined): boolean {
  return point !== undefined && 
         !isNaN(point[0]) && 
         !isNaN(point[1]) && 
         isFinite(point[0]) && 
         isFinite(point[1]);
}

/**
 * 根据锚点数组生成 SVG 路径数据
 * @param anchors 锚点数组
 * @param closed 是否闭合
 * @param cornerRadius 圆角半径 (0-100)
 */
export function generatePathFromAnchors(anchors: PenAnchor[], closed: boolean, cornerRadius: number = 0): string {
  // 过滤掉无效的锚点
  const validAnchors = anchors.filter(anchor => isValidPoint(anchor.point));
  
  if (validAnchors.length === 0) return '';
  if (validAnchors.length === 1) {
    // 单点，绘制一个小圆点
    const p = validAnchors[0].point;
    return `M ${p[0]} ${p[1]} L ${p[0]} ${p[1]}`;
  }

  // 如果没有圆角，使用原有逻辑
  if (cornerRadius <= 0) {
    return generatePathWithoutCornerRadius(validAnchors, closed);
  }

  // 有圆角时使用圆角生成逻辑
  return generatePathWithCornerRadius(validAnchors, closed, cornerRadius);
}

/**
 * 生成不带圆角的路径（原有逻辑）
 */
function generatePathWithoutCornerRadius(validAnchors: PenAnchor[], closed: boolean): string {
  const parts: string[] = [];

  // 起点
  const start = validAnchors[0];
  parts.push(`M ${start.point[0]} ${start.point[1]}`);

  // 绘制各段
  for (let i = 1; i < validAnchors.length; i++) {
    const prev = validAnchors[i - 1];
    const curr = validAnchors[i];
    parts.push(generateSegment(prev, curr));
  }

  // 如果闭合，绘制最后一段回到起点
  if (closed && validAnchors.length > 1) {
    const last = validAnchors[validAnchors.length - 1];
    parts.push(generateSegment(last, start));
    parts.push('Z');
  }

  return parts.join(' ');
}

/**
 * 生成带圆角的路径
 * 对所有锚点应用圆角效果
 */
function generatePathWithCornerRadius(validAnchors: PenAnchor[], closed: boolean, cornerRadius: number): string {
  const parts: string[] = [];
  const n = validAnchors.length;
  
  // 计算每个锚点的入边和出边方向
  // 对于有控制柄的锚点，使用控制柄方向；否则使用相邻锚点方向
  const getEdgeVectors = (index: number) => {
    const curr = validAnchors[index];
    const prev = validAnchors[(index - 1 + n) % n];
    const next = validAnchors[(index + 1) % n];
    
    // 入边方向：
    // - 如果当前锚点有 handleIn，方向是从 handleIn 到锚点
    // - 如果前一个锚点有 handleOut，方向是从 handleOut 到当前锚点
    // - 否则是从前一个锚点到当前锚点
    let inDir: Point;
    if (curr.handleIn) {
      // 从 handleIn 到锚点的方向
      inDir = [
        curr.point[0] - curr.handleIn[0],
        curr.point[1] - curr.handleIn[1]
      ];
    } else if (prev.handleOut) {
      // 从前一个锚点的 handleOut 到当前锚点
      inDir = [
        curr.point[0] - prev.handleOut[0],
        curr.point[1] - prev.handleOut[1]
      ];
    } else {
      // 从前一个锚点到当前锚点
      inDir = [
        curr.point[0] - prev.point[0],
        curr.point[1] - prev.point[1]
      ];
    }
    const inLen = Math.sqrt(inDir[0] * inDir[0] + inDir[1] * inDir[1]);
    
    // 出边方向：
    // - 如果当前锚点有 handleOut，方向是从锚点到 handleOut
    // - 如果下一个锚点有 handleIn，方向是从当前锚点到 handleIn
    // - 否则是从当前锚点到下一个锚点
    let outDir: Point;
    if (curr.handleOut) {
      // 从锚点到 handleOut 的方向
      outDir = [
        curr.handleOut[0] - curr.point[0],
        curr.handleOut[1] - curr.point[1]
      ];
    } else if (next.handleIn) {
      // 从当前锚点到下一个锚点的 handleIn
      outDir = [
        next.handleIn[0] - curr.point[0],
        next.handleIn[1] - curr.point[1]
      ];
    } else {
      // 从当前锚点到下一个锚点
      outDir = [
        next.point[0] - curr.point[0],
        next.point[1] - curr.point[1]
      ];
    }
    const outLen = Math.sqrt(outDir[0] * outDir[0] + outDir[1] * outDir[1]);
    
    return { inDir, inLen, outDir, outLen };
  };

  // 计算圆角的起点和终点
  const getCornerPoints = (index: number, radiusPercent: number) => {
    const curr = validAnchors[index];
    const { inDir, inLen, outDir, outLen } = getEdgeVectors(index);
    
    // 计算最大圆角半径（边长的一半）
    const maxRadius = Math.min(inLen / 2, outLen / 2);
    // 将百分比转换为实际像素值 (0% = 0, 100% = maxRadius)
    const actualRadius = (radiusPercent / 100) * maxRadius;
    
    if (actualRadius <= 0 || inLen === 0 || outLen === 0) {
      return { start: curr.point, end: curr.point, hasCorner: false };
    }
    
    // 圆角起点：沿入边方向回退（反方向）
    const start: Point = [
      curr.point[0] - (inDir[0] / inLen) * actualRadius,
      curr.point[1] - (inDir[1] / inLen) * actualRadius
    ];
    
    // 圆角终点：沿出边方向前进
    const end: Point = [
      curr.point[0] + (outDir[0] / outLen) * actualRadius,
      curr.point[1] + (outDir[1] / outLen) * actualRadius
    ];
    
    return { start, end, hasCorner: true, center: curr.point };
  };

  // 先计算所有锚点的圆角信息
  type CornerInfo = {
    index: number;
    anchor: PenAnchor;
    hasCorner: boolean;
    start: Point;
    end: Point;
    center: Point;
  };
  
  const corners: CornerInfo[] = validAnchors.map((anchor, i) => {
    // 第一个和最后一个锚点在非闭合路径中不需要圆角
    const needsCorner = closed || (i > 0 && i < n - 1);
    
    if (!needsCorner) {
      return {
        index: i,
        anchor,
        hasCorner: false,
        start: anchor.point,
        end: anchor.point,
        center: anchor.point,
      };
    }
    
    const result = getCornerPoints(i, cornerRadius);
    return {
      index: i,
      anchor,
      hasCorner: result.hasCorner,
      start: result.start,
      end: result.end,
      center: anchor.point,
    };
  });

  // 开始生成路径
  const firstCorner = corners[0];
  
  // 起点
  if (closed && firstCorner.hasCorner) {
    // 闭合路径从第一个圆角的终点开始（因为我们最后会画回来）
    parts.push(`M ${firstCorner.end[0]} ${firstCorner.end[1]}`);
  } else {
    parts.push(`M ${firstCorner.anchor.point[0]} ${firstCorner.anchor.point[1]}`);
  }

  // 绘制从第一个点到后续点的路径
  for (let i = 1; i < n; i++) {
    const prevCorner = corners[i - 1];
    const currCorner = corners[i];
    const prevAnchor = validAnchors[i - 1];
    const currAnchor = validAnchors[i];
    
    // 确定这段路径的起点（上一个锚点的圆角终点或锚点本身）
    const segmentStartPoint = prevCorner.hasCorner ? prevCorner.end : prevAnchor.point;
    
    if (currCorner.hasCorner) {
      // 画到当前圆角的起点
      parts.push(generateSegmentBetweenPoints(
        segmentStartPoint,
        prevAnchor.handleOut,
        currAnchor.handleIn,
        currCorner.start
      ));
      // 画圆角（二次贝塞尔曲线）
      parts.push(`Q ${currCorner.center[0]} ${currCorner.center[1]}, ${currCorner.end[0]} ${currCorner.end[1]}`);
    } else {
      // 直接画到锚点
      parts.push(generateSegmentBetweenPoints(
        segmentStartPoint,
        prevAnchor.handleOut,
        currAnchor.handleIn,
        currAnchor.point
      ));
    }
  }

  // 如果闭合，画回到第一个点
  if (closed && n > 1) {
    const lastCorner = corners[n - 1];
    const lastAnchor = validAnchors[n - 1];
    const firstAnchor = validAnchors[0];
    
    const segmentStartPoint = lastCorner.hasCorner ? lastCorner.end : lastAnchor.point;
    
    if (firstCorner.hasCorner) {
      // 画到第一个圆角的起点
      parts.push(generateSegmentBetweenPoints(
        segmentStartPoint,
        lastAnchor.handleOut,
        firstAnchor.handleIn,
        firstCorner.start
      ));
      // 画第一个点的圆角
      parts.push(`Q ${firstCorner.center[0]} ${firstCorner.center[1]}, ${firstCorner.end[0]} ${firstCorner.end[1]}`);
    } else {
      // 直接画到第一个点
      parts.push(generateSegmentBetweenPoints(
        segmentStartPoint,
        lastAnchor.handleOut,
        firstAnchor.handleIn,
        firstAnchor.point
      ));
    }
    parts.push('Z');
  }

  return parts.join(' ');
}

/**
 * 生成两个点之间的路径段，考虑控制柄
 */
function generateSegmentBetweenPoints(
  startPoint: Point,
  handleOut: Point | undefined,
  handleIn: Point | undefined,
  endPoint: Point
): string {
  // 检查是否有有效的控制柄
  const hasHandleOut = handleOut && 
    (handleOut[0] !== startPoint[0] || handleOut[1] !== startPoint[1]);
  const hasHandleIn = handleIn && 
    (handleIn[0] !== endPoint[0] || handleIn[1] !== endPoint[1]);
  
  if (!hasHandleOut && !hasHandleIn) {
    // 直线
    return `L ${endPoint[0]} ${endPoint[1]}`;
  } else if (hasHandleOut && hasHandleIn) {
    // 三次贝塞尔曲线
    return `C ${handleOut![0]} ${handleOut![1]}, ${handleIn![0]} ${handleIn![1]}, ${endPoint[0]} ${endPoint[1]}`;
  } else if (hasHandleOut) {
    // 二次贝塞尔曲线（只有出控制柄）
    return `Q ${handleOut![0]} ${handleOut![1]}, ${endPoint[0]} ${endPoint[1]}`;
  } else {
    // 二次贝塞尔曲线（只有入控制柄）
    return `Q ${handleIn![0]} ${handleIn![1]}, ${endPoint[0]} ${endPoint[1]}`;
  }
}

/**
 * 生成两个锚点之间的路径段
 */
function generateSegment(from: PenAnchor, to: PenAnchor): string {
  const p0 = from.point;
  const p3 = to.point;

  // 获取控制点，如果没有则使用锚点本身
  const p1 = from.handleOut || p0;
  const p2 = to.handleIn || p3;

  // 判断是否需要使用曲线
  const hasHandle1 = from.handleOut && 
    (from.handleOut[0] !== p0[0] || from.handleOut[1] !== p0[1]);
  const hasHandle2 = to.handleIn && 
    (to.handleIn[0] !== p3[0] || to.handleIn[1] !== p3[1]);

  if (!hasHandle1 && !hasHandle2) {
    // 直线
    return `L ${p3[0]} ${p3[1]}`;
  } else {
    // 三次贝塞尔曲线
    return `C ${p1[0]} ${p1[1]}, ${p2[0]} ${p2[1]}, ${p3[0]} ${p3[1]}`;
  }
}

/**
 * 根据拖拽方向创建对称的控制柄
 * @param anchor 锚点位置
 * @param dragEnd 拖拽终点
 */
export function createSymmetricHandles(
  anchor: Point,
  dragEnd: Point
): { handleIn: Point; handleOut: Point } {
  const handleOut = dragEnd;
  const handleIn = mirrorPoint(dragEnd, anchor);
  return { handleIn, handleOut };
}

/**
 * 计算点到路径的最近距离
 */
export function distanceToPath(
  point: Point,
  anchors: PenAnchor[],
  closed: boolean
): number {
  if (anchors.length === 0) return Infinity;
  if (anchors.length === 1) {
    return distanceBetweenPoints(point, anchors[0].point);
  }

  let minDistance = Infinity;

  // 检查每一段
  for (let i = 1; i < anchors.length; i++) {
    const prev = anchors[i - 1];
    const curr = anchors[i];
    const distance = distanceToSegment(point, prev, curr);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  // 如果闭合，检查最后一段
  if (closed && anchors.length > 1) {
    const last = anchors[anchors.length - 1];
    const first = anchors[0];
    const distance = distanceToSegment(point, last, first);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

/**
 * 计算点到单个路径段的距离
 */
function distanceToSegment(point: Point, from: PenAnchor, to: PenAnchor): number {
  const p0 = from.point;
  const p3 = to.point;
  const p1 = from.handleOut || p0;
  const p2 = to.handleIn || p3;

  const hasHandle1 = from.handleOut && 
    (from.handleOut[0] !== p0[0] || from.handleOut[1] !== p0[1]);
  const hasHandle2 = to.handleIn && 
    (to.handleIn[0] !== p3[0] || to.handleIn[1] !== p3[1]);

  if (!hasHandle1 && !hasHandle2) {
    // 直线段
    return distanceToLineSegment(point, p0, p3);
  } else {
    // 贝塞尔曲线
    return distanceToCubicBezier(point, p0, p1, p2, p3);
  }
}

/**
 * 计算点到直线段的距离
 */
function distanceToLineSegment(point: Point, start: Point, end: Point): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return distanceBetweenPoints(point, start);
  }

  // 计算投影参数 t
  let t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  // 计算最近点
  const closestX = start[0] + t * dx;
  const closestY = start[1] + t * dy;

  return distanceBetweenPoints(point, [closestX, closestY]);
}

/**
 * 获取路径的包围盒
 */
export function getPathBoundingBox(
  anchors: PenAnchor[],
  closed: boolean,
  padding: number = 0
): { x: number; y: number; width: number; height: number } {
  if (anchors.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  // 遍历所有锚点和控制柄
  for (const anchor of anchors) {
    // 锚点
    minX = Math.min(minX, anchor.point[0]);
    minY = Math.min(minY, anchor.point[1]);
    maxX = Math.max(maxX, anchor.point[0]);
    maxY = Math.max(maxY, anchor.point[1]);

    // 控制柄
    if (anchor.handleIn) {
      minX = Math.min(minX, anchor.handleIn[0]);
      minY = Math.min(minY, anchor.handleIn[1]);
      maxX = Math.max(maxX, anchor.handleIn[0]);
      maxY = Math.max(maxY, anchor.handleIn[1]);
    }
    if (anchor.handleOut) {
      minX = Math.min(minX, anchor.handleOut[0]);
      minY = Math.min(minY, anchor.handleOut[1]);
      maxX = Math.max(maxX, anchor.handleOut[0]);
      maxY = Math.max(maxY, anchor.handleOut[1]);
    }
  }

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

/**
 * 获取路径上的采样点，用于闭合路径的多边形命中检测
 * @param anchors 锚点数组
 * @param closed 是否闭合
 * @param samplesPerSegment 每段的采样数
 */
export function getPathSamplePoints(
  anchors: PenAnchor[],
  closed: boolean,
  samplesPerSegment: number = 10
): Point[] {
  if (anchors.length === 0) return [];
  if (anchors.length === 1) return [anchors[0].point];

  const points: Point[] = [];
  const segmentCount = closed ? anchors.length : anchors.length - 1;

  for (let i = 0; i < segmentCount; i++) {
    const from = anchors[i];
    const to = anchors[(i + 1) % anchors.length];

    const p0 = from.point;
    const p3 = to.point;
    const p1 = from.handleOut || p0;
    const p2 = to.handleIn || p3;

    const hasHandle1 = from.handleOut &&
      (from.handleOut[0] !== p0[0] || from.handleOut[1] !== p0[1]);
    const hasHandle2 = to.handleIn &&
      (to.handleIn[0] !== p3[0] || to.handleIn[1] !== p3[1]);

    if (!hasHandle1 && !hasHandle2) {
      // 直线段，只需起点
      points.push(p0);
    } else {
      // 贝塞尔曲线段，采样多个点
      for (let j = 0; j < samplesPerSegment; j++) {
        const t = j / samplesPerSegment;
        points.push(cubicBezierPoint(t, p0, p1, p2, p3));
      }
    }
  }

  return points;
}
