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
 * 使用多个变宽的线段组成
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

  // 方案：使用多段 polyline，每段的宽度基于两端点压力的平均值
  for (let i = 0; i < smoothedPoints.length - 1; i++) {
    const p1 = smoothedPoints[i];
    const p2 = smoothedPoints[i + 1];
    
    // 使用两端点压力的平均值
    const pressure1 = pressures[i] ?? 0.5;
    const pressure2 = pressures[i + 1] ?? 0.5;
    const avgPressure = (pressure1 + pressure2) / 2;
    const width = calculateWidthFromPressure(avgPressure, baseWidth);
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(p1[0]));
    line.setAttribute('y1', String(p1[1]));
    line.setAttribute('x2', String(p2[0]));
    line.setAttribute('y2', String(p2[1]));
    line.setAttribute('stroke', strokeColor);
    line.setAttribute('stroke-width', String(width));
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    if (dashArray) {
      line.setAttribute('stroke-dasharray', dashArray);
    }
    g.appendChild(line);
  }

  return g;
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
