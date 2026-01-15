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
  strokeStyle: StrokeStyle
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
  
  // 计算虚线样式
  const strokeLineDash = getStrokeLineDash(strokeStyle, baseWidth);
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
    const strokeStyle = getStrokeStyleByElement(this.board, element);
    const strokeLineDash = getStrokeLineDash(strokeStyle, strokeWidth);
    
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
