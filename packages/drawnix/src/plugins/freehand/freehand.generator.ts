import { Generator, getStrokeLineDash, StrokeStyle } from '@plait/common';
import { PlaitBoard, setStrokeLinecap, Point } from '@plait/core';
import { Options } from 'roughjs/bin/core';
import { Freehand } from './type';
import {
  gaussianSmooth,
  getFillByElement,
  getStrokeColorByElement,
} from './utils';
import { getStrokeWidthByElement, getStrokeStyleByElement } from '@plait/draw';
import { FreehandStrokeStyle } from './freehand-settings';

/**
 * 根据压力计算线宽
 * 压力范围 0-1
 * 小画笔：变化范围更大（如 1px -> 0.5px~6px）
 * 大画笔：变化范围较小（如 50px -> 15px~100px）
 */
function calculateWidthFromPressure(pressure: number, baseWidth: number): number {
  // 基于画笔大小动态调整缩放范围
  const t = Math.min(baseWidth / 50, 1); // 0~1，画笔越大 t 越大
  
  // 插值计算缩放范围 - 增强效果
  const minScale = 0.2 + t * 0.1;  // 小画笔 0.2，大画笔 0.3
  const maxScale = 6.0 - t * 4.0;  // 小画笔 6.0，大画笔 2.0
  
  const scale = minScale + pressure * (maxScale - minScale);
  
  // 确保最小宽度不小于 0.5px
  return Math.max(0.5, baseWidth * scale);
}

/**
 * 创建压力感应笔迹的 SVG 路径
 * 使用单个 path 元素绘制变宽笔迹（性能优化）
 */
function createPressurePath(
  points: Point[],
  pressures: number[],
  baseWidth: number,
  strokeColor: string,
  strokeStyle: FreehandStrokeStyle
): SVGGElement {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  
  if (points.length < 2) {
    // 单点绘制为圆点
    if (points.length === 1) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const width = calculateWidthFromPressure(pressures[0] ?? 0.5, baseWidth);
      circle.setAttribute('cx', String(points[0][0]));
      circle.setAttribute('cy', String(points[0][1]));
      circle.setAttribute('r', String(width / 2));
      circle.setAttribute('fill', strokeColor);
      g.appendChild(circle);
    }
    return g;
  }

  // 平滑点
  const smoothedPoints = gaussianSmooth(points, 1, 3);
  
  // 双层线样式：绘制两条平行线
  if (strokeStyle === FreehandStrokeStyle.double) {
    const lineSpacing = baseWidth * 0.8; // 两条线之间的间距
    const lineWidth = baseWidth * 0.4; // 每条线的宽度
    
    // 生成两条平行线的路径
    const [upperPath, lowerPath] = generateDoubleLinePaths(smoothedPoints, pressures, lineWidth, lineSpacing);
    
    if (upperPath) {
      const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path1.setAttribute('d', upperPath);
      path1.setAttribute('fill', strokeColor);
      path1.setAttribute('stroke', 'none');
      g.appendChild(path1);
    }
    
    if (lowerPath) {
      const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path2.setAttribute('d', lowerPath);
      path2.setAttribute('fill', strokeColor);
      path2.setAttribute('stroke', 'none');
      g.appendChild(path2);
    }
    
    return g;
  }
  
  // 计算虚线样式
  const strokeLineDash = getStrokeLineDash(strokeStyle as StrokeStyle, baseWidth);
  const dashArray = strokeStyle !== StrokeStyle.solid && strokeLineDash ? strokeLineDash.join(' ') : '';

  // 生成变宽笔迹的轮廓路径
  const outline = generateVariableWidthOutline(smoothedPoints, pressures, baseWidth);
  
  if (outline.length > 0) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', outline);
    path.setAttribute('fill', strokeColor);
    path.setAttribute('stroke', 'none');
    if (dashArray) {
      // 虚线模式下使用 stroke 而不是 fill
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', strokeColor);
      path.setAttribute('stroke-width', String(baseWidth));
      path.setAttribute('stroke-dasharray', dashArray);
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
    }
    g.appendChild(path);
  }

  return g;
}

/**
 * 创建无压力感应的双层线
 */
function createDoubleLineWithoutPressure(
  points: Point[],
  baseWidth: number,
  strokeColor: string
): SVGGElement {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  
  if (points.length < 2) {
    if (points.length === 1) {
      // 单点绘制两个圆点
      const lineSpacing = baseWidth * 0.8;
      const lineWidth = baseWidth * 0.4;
      
      const circle1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle1.setAttribute('cx', String(points[0][0]));
      circle1.setAttribute('cy', String(points[0][1] - lineSpacing / 2));
      circle1.setAttribute('r', String(lineWidth / 2));
      circle1.setAttribute('fill', strokeColor);
      g.appendChild(circle1);
      
      const circle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle2.setAttribute('cx', String(points[0][0]));
      circle2.setAttribute('cy', String(points[0][1] + lineSpacing / 2));
      circle2.setAttribute('r', String(lineWidth / 2));
      circle2.setAttribute('fill', strokeColor);
      g.appendChild(circle2);
    }
    return g;
  }
  
  // 平滑点
  const smoothedPoints = gaussianSmooth(points, 1, 3);
  
  const lineSpacing = baseWidth * 0.8;
  const lineWidth = baseWidth * 0.4;
  
  // 计算两条平行线
  const upperPoints: Point[] = [];
  const lowerPoints: Point[] = [];
  
  for (let i = 0; i < smoothedPoints.length; i++) {
    let dx: number, dy: number;
    if (i === 0) {
      dx = smoothedPoints[1][0] - smoothedPoints[0][0];
      dy = smoothedPoints[1][1] - smoothedPoints[0][1];
    } else if (i === smoothedPoints.length - 1) {
      dx = smoothedPoints[i][0] - smoothedPoints[i - 1][0];
      dy = smoothedPoints[i][1] - smoothedPoints[i - 1][1];
    } else {
      dx = smoothedPoints[i + 1][0] - smoothedPoints[i - 1][0];
      dy = smoothedPoints[i + 1][1] - smoothedPoints[i - 1][1];
    }
    
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const nx = -dy / len;
      const ny = dx / len;
      const offset = lineSpacing / 2;
      
      upperPoints.push([
        smoothedPoints[i][0] + nx * offset,
        smoothedPoints[i][1] + ny * offset
      ]);
      lowerPoints.push([
        smoothedPoints[i][0] - nx * offset,
        smoothedPoints[i][1] - ny * offset
      ]);
    } else {
      upperPoints.push(smoothedPoints[i]);
      lowerPoints.push(smoothedPoints[i]);
    }
  }
  
  // 绘制上线
  const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  let d1 = `M ${upperPoints[0][0]} ${upperPoints[0][1]}`;
  for (let i = 1; i < upperPoints.length; i++) {
    const prev = upperPoints[i - 1];
    const curr = upperPoints[i];
    const midX = (prev[0] + curr[0]) / 2;
    const midY = (prev[1] + curr[1]) / 2;
    d1 += ` Q ${prev[0]} ${prev[1]} ${midX} ${midY}`;
  }
  d1 += ` L ${upperPoints[upperPoints.length - 1][0]} ${upperPoints[upperPoints.length - 1][1]}`;
  path1.setAttribute('d', d1);
  path1.setAttribute('fill', 'none');
  path1.setAttribute('stroke', strokeColor);
  path1.setAttribute('stroke-width', String(lineWidth));
  path1.setAttribute('stroke-linecap', 'round');
  path1.setAttribute('stroke-linejoin', 'round');
  g.appendChild(path1);
  
  // 绘制下线
  const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  let d2 = `M ${lowerPoints[0][0]} ${lowerPoints[0][1]}`;
  for (let i = 1; i < lowerPoints.length; i++) {
    const prev = lowerPoints[i - 1];
    const curr = lowerPoints[i];
    const midX = (prev[0] + curr[0]) / 2;
    const midY = (prev[1] + curr[1]) / 2;
    d2 += ` Q ${prev[0]} ${prev[1]} ${midX} ${midY}`;
  }
  d2 += ` L ${lowerPoints[lowerPoints.length - 1][0]} ${lowerPoints[lowerPoints.length - 1][1]}`;
  path2.setAttribute('d', d2);
  path2.setAttribute('fill', 'none');
  path2.setAttribute('stroke', strokeColor);
  path2.setAttribute('stroke-width', String(lineWidth));
  path2.setAttribute('stroke-linecap', 'round');
  path2.setAttribute('stroke-linejoin', 'round');
  g.appendChild(path2);
  
  return g;
}

/**
 * 生成双层线的两条平行路径
 * 返回 [上线路径, 下线路径]
 */
function generateDoubleLinePaths(
  points: Point[],
  pressures: number[],
  lineWidth: number,
  lineSpacing: number
): [string, string] {
  if (points.length < 2) return ['', ''];

  // 计算每个点的上下偏移路径
  const upperPoints: Point[] = [];
  const lowerPoints: Point[] = [];

  for (let i = 0; i < points.length; i++) {
    // 计算当前点的切线方向
    let dx: number, dy: number;
    if (i === 0) {
      dx = points[1][0] - points[0][0];
      dy = points[1][1] - points[0][1];
    } else if (i === points.length - 1) {
      dx = points[i][0] - points[i - 1][0];
      dy = points[i][1] - points[i - 1][1];
    } else {
      dx = points[i + 1][0] - points[i - 1][0];
      dy = points[i + 1][1] - points[i - 1][1];
    }

    // 归一化并计算法向量
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const nx = -dy / len;
      const ny = dx / len;
      const offset = lineSpacing / 2;

      // 计算上下两条线的中心点
      upperPoints.push([
        points[i][0] + nx * offset,
        points[i][1] + ny * offset
      ]);
      lowerPoints.push([
        points[i][0] - nx * offset,
        points[i][1] - ny * offset
      ]);
    } else {
      upperPoints.push(points[i]);
      lowerPoints.push(points[i]);
    }
  }

  // 为每条线生成变宽轮廓
  const upperOutline = generateVariableWidthOutlineFromCenterLine(upperPoints, pressures, lineWidth);
  const lowerOutline = generateVariableWidthOutlineFromCenterLine(lowerPoints, pressures, lineWidth);

  return [upperOutline, lowerOutline];
}

/**
 * 从中心线生成变宽笔迹的轮廓路径
 */
function generateVariableWidthOutlineFromCenterLine(
  points: Point[],
  pressures: number[],
  baseWidth: number
): string {
  if (points.length < 2) return '';

  const leftPoints: Point[] = [];
  const rightPoints: Point[] = [];

  for (let i = 0; i < points.length; i++) {
    const pressure = pressures[i] ?? 0.5;
    const width = calculateWidthFromPressure(pressure, baseWidth);
    const halfWidth = width / 2;

    // 计算当前点的切线方向
    let dx: number, dy: number;
    if (i === 0) {
      dx = points[1][0] - points[0][0];
      dy = points[1][1] - points[0][1];
    } else if (i === points.length - 1) {
      dx = points[i][0] - points[i - 1][0];
      dy = points[i][1] - points[i - 1][1];
    } else {
      dx = points[i + 1][0] - points[i - 1][0];
      dy = points[i + 1][1] - points[i - 1][1];
    }

    // 归一化并计算法向量
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const nx = -dy / len;
      const ny = dx / len;

      leftPoints.push([
        points[i][0] + nx * halfWidth,
        points[i][1] + ny * halfWidth
      ]);
      rightPoints.push([
        points[i][0] - nx * halfWidth,
        points[i][1] - ny * halfWidth
      ]);
    } else {
      leftPoints.push(points[i]);
      rightPoints.push(points[i]);
    }
  }

  // 构建闭合路径
  let d = `M ${leftPoints[0][0]} ${leftPoints[0][1]}`;
  
  for (let i = 1; i < leftPoints.length; i++) {
    const prev = leftPoints[i - 1];
    const curr = leftPoints[i];
    const midX = (prev[0] + curr[0]) / 2;
    const midY = (prev[1] + curr[1]) / 2;
    d += ` Q ${prev[0]} ${prev[1]} ${midX} ${midY}`;
  }
  d += ` L ${leftPoints[leftPoints.length - 1][0]} ${leftPoints[leftPoints.length - 1][1]}`;
  
  d += ` L ${rightPoints[rightPoints.length - 1][0]} ${rightPoints[rightPoints.length - 1][1]}`;
  
  for (let i = rightPoints.length - 2; i >= 0; i--) {
    const prev = rightPoints[i + 1];
    const curr = rightPoints[i];
    const midX = (prev[0] + curr[0]) / 2;
    const midY = (prev[1] + curr[1]) / 2;
    d += ` Q ${prev[0]} ${prev[1]} ${midX} ${midY}`;
  }
  d += ` L ${rightPoints[0][0]} ${rightPoints[0][1]}`;
  
  d += ' Z';

  return d;
}

/**
 * 生成变宽笔迹的轮廓路径
 * 通过计算每个点两侧的偏移点来构建闭合路径
 */
function generateVariableWidthOutline(
  points: Point[],
  pressures: number[],
  baseWidth: number
): string {
  if (points.length < 2) return '';

  const leftPoints: Point[] = [];
  const rightPoints: Point[] = [];

  for (let i = 0; i < points.length; i++) {
    const pressure = pressures[i] ?? 0.5;
    const width = calculateWidthFromPressure(pressure, baseWidth);
    const halfWidth = width / 2;

    // 计算当前点的切线方向
    let dx: number, dy: number;
    if (i === 0) {
      dx = points[1][0] - points[0][0];
      dy = points[1][1] - points[0][1];
    } else if (i === points.length - 1) {
      dx = points[i][0] - points[i - 1][0];
      dy = points[i][1] - points[i - 1][1];
    } else {
      dx = points[i + 1][0] - points[i - 1][0];
      dy = points[i + 1][1] - points[i - 1][1];
    }

    // 归一化并计算法向量
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const nx = -dy / len;
      const ny = dx / len;

      // 计算两侧偏移点
      leftPoints.push([
        points[i][0] + nx * halfWidth,
        points[i][1] + ny * halfWidth
      ]);
      rightPoints.push([
        points[i][0] - nx * halfWidth,
        points[i][1] - ny * halfWidth
      ]);
    } else {
      leftPoints.push(points[i]);
      rightPoints.push(points[i]);
    }
  }

  // 构建闭合路径：左边点顺序 + 右边点逆序
  let d = `M ${leftPoints[0][0]} ${leftPoints[0][1]}`;
  
  // 使用二次贝塞尔曲线平滑连接左侧点
  for (let i = 1; i < leftPoints.length; i++) {
    const prev = leftPoints[i - 1];
    const curr = leftPoints[i];
    const midX = (prev[0] + curr[0]) / 2;
    const midY = (prev[1] + curr[1]) / 2;
    d += ` Q ${prev[0]} ${prev[1]} ${midX} ${midY}`;
  }
  d += ` L ${leftPoints[leftPoints.length - 1][0]} ${leftPoints[leftPoints.length - 1][1]}`;
  
  // 连接到右侧终点
  d += ` L ${rightPoints[rightPoints.length - 1][0]} ${rightPoints[rightPoints.length - 1][1]}`;
  
  // 使用二次贝塞尔曲线平滑连接右侧点（逆序）
  for (let i = rightPoints.length - 2; i >= 0; i--) {
    const prev = rightPoints[i + 1];
    const curr = rightPoints[i];
    const midX = (prev[0] + curr[0]) / 2;
    const midY = (prev[1] + curr[1]) / 2;
    d += ` Q ${prev[0]} ${prev[1]} ${midX} ${midY}`;
  }
  d += ` L ${rightPoints[0][0]} ${rightPoints[0][1]}`;
  
  d += ' Z';

  return d;
}

export class FreehandGenerator extends Generator<Freehand> {
  protected draw(element: Freehand): SVGGElement | undefined {
    const strokeWidth = getStrokeWidthByElement(element);
    const strokeColor = getStrokeColorByElement(this.board, element);
    const fill = getFillByElement(this.board, element);
    const strokeStyle = getStrokeStyleByElement(this.board, element) as FreehandStrokeStyle;
    const strokeLineDash = getStrokeLineDash(strokeStyle as StrokeStyle, strokeWidth);
    
    // 如果有压力数据，使用压力感应绘制
    if (element.pressures && element.pressures.length > 0) {
      return createPressurePath(
        element.points,
        element.pressures,
        strokeWidth,
        strokeColor,
        strokeStyle
      );
    }
    
    // 双层线样式（无压力数据）
    if (strokeStyle === FreehandStrokeStyle.double) {
      return createDoubleLineWithoutPressure(
        element.points,
        strokeWidth,
        strokeColor
      );
    }
    
    // 无压力数据，使用原始绘制方式
    const option: Options = { 
      strokeWidth, 
      stroke: strokeColor, 
      fill, 
      fillStyle: 'solid',
      strokeLineDash: strokeStyle !== StrokeStyle.solid ? strokeLineDash : undefined,
    };
    const g = PlaitBoard.getRoughSVG(this.board).curve(
      gaussianSmooth(element.points, 1, 3),
      option
    );
    setStrokeLinecap(g, 'round');
    return g;
  }

  canDraw(element: Freehand): boolean {
    return true;
  }
}
