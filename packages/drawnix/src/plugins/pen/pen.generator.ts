import { PlaitBoard, createG } from '@plait/core';
import { Generator, StrokeStyle } from '@plait/common';
import { PenPath, PenAnchor, ANCHOR_HIT_RADIUS, HANDLE_HIT_RADIUS } from './type';
import { generatePathFromAnchors } from './bezier-utils';
import { getAbsoluteAnchors } from './utils';

/**
 * 获取 stroke-dasharray 值
 */
function getStrokeDashArray(strokeStyle: StrokeStyle | undefined, strokeWidth: number): string | null {
  if (!strokeStyle || strokeStyle === StrokeStyle.solid) {
    return null;
  }
  if (strokeStyle === StrokeStyle.dashed) {
    return `${strokeWidth * 3},${strokeWidth * 2}`;
  }
  if (strokeStyle === StrokeStyle.dotted) {
    return `${strokeWidth},${strokeWidth * 2}`;
  }
  return null;
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
 * 钢笔路径渲染生成器
 */
export class PenGenerator extends Generator<PenPath> {
  constructor(board: PlaitBoard) {
    super(board);
  }

  canDraw(element: PenPath): boolean {
    return element.anchors && element.anchors.length > 0;
  }

  draw(element: PenPath): SVGGElement {
    const g = createG();
    g.classList.add('pen-path');

    // 使用绝对坐标生成路径（支持圆角）
    const absoluteAnchors = getAbsoluteAnchors(element);
    const cornerRadius = element.cornerRadius || 0;
    const pathData = generatePathFromAnchors(absoluteAnchors, element.closed, cornerRadius);
    const strokeWidth = element.strokeWidth || 2;

    // 创建路径元素
    const pathElement = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path'
    );
    pathElement.setAttribute('d', pathData);
    pathElement.setAttribute('fill', element.fill || 'none');
    pathElement.setAttribute('stroke', element.strokeColor || '#000000');
    pathElement.setAttribute('stroke-width', String(strokeWidth));
    pathElement.setAttribute('stroke-linecap', 'round');
    pathElement.setAttribute('stroke-linejoin', 'round');
    
    // 设置虚线样式
    const dashArray = getStrokeDashArray(element.strokeStyle, strokeWidth);
    if (dashArray) {
      pathElement.setAttribute('stroke-dasharray', dashArray);
    }

    g.appendChild(pathElement);

    return g;
  }
}

/**
 * 创建锚点图形
 */
function createAnchorPoint(anchor: PenAnchor, isSelected: boolean): SVGElement {
  const point = anchor.point;
  const size = ANCHOR_HIT_RADIUS;

  if (anchor.type === 'corner') {
    // 角点使用矩形
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(point[0] - size / 2));
    rect.setAttribute('y', String(point[1] - size / 2));
    rect.setAttribute('width', String(size));
    rect.setAttribute('height', String(size));
    rect.setAttribute('fill', isSelected ? '#1890ff' : '#ffffff');
    rect.setAttribute('stroke', '#1890ff');
    rect.setAttribute('stroke-width', '1.5');
    rect.classList.add('pen-anchor');
    return rect;
  } else {
    // 平滑点和对称点使用圆形
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(point[0]));
    circle.setAttribute('cy', String(point[1]));
    circle.setAttribute('r', String(size / 2));
    circle.setAttribute('fill', isSelected ? '#1890ff' : '#ffffff');
    circle.setAttribute('stroke', '#1890ff');
    circle.setAttribute('stroke-width', '1.5');
    circle.classList.add('pen-anchor');
    return circle;
  }
}

/**
 * 创建控制柄点
 */
function createHandlePoint(point: [number, number]): SVGCircleElement {
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', String(point[0]));
  circle.setAttribute('cy', String(point[1]));
  circle.setAttribute('r', String(HANDLE_HIT_RADIUS / 2));
  circle.setAttribute('fill', '#ffffff');
  circle.setAttribute('stroke', '#1890ff');
  circle.setAttribute('stroke-width', '1');
  circle.classList.add('pen-handle');
  return circle;
}

/**
 * 创建控制柄连线
 */
function createHandleLine(
  from: [number, number],
  to: [number, number]
): SVGLineElement {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', String(from[0]));
  line.setAttribute('y1', String(from[1]));
  line.setAttribute('x2', String(to[0]));
  line.setAttribute('y2', String(to[1]));
  line.setAttribute('stroke', '#1890ff');
  line.setAttribute('stroke-width', '1');
  line.setAttribute('stroke-dasharray', '3,3');
  line.classList.add('pen-handle-line');
  return line;
}

/**
 * 对齐信息接口
 */
interface AlignmentInfo {
  horizontal: boolean;
  vertical: boolean;
  horizontalRefPoint?: [number, number] | null;
  verticalRefPoint?: [number, number] | null;
  referencePoint: [number, number] | null;
}

/** 辅助线延伸长度 */
const GUIDE_LINE_EXTENSION = 2000;

/**
 * 绘制对齐辅助线
 */
function drawAlignmentGuides(
  g: SVGGElement,
  currentPoint: [number, number],
  alignment: AlignmentInfo
): void {
  const guideColor = '#ff4d4f'; // 红色辅助线
  const guideWidth = 1;

  // 垂直对齐线（X 坐标相同）- 连接到垂直对齐的参考点
  if (alignment.vertical && alignment.verticalRefPoint) {
    const refPoint = alignment.verticalRefPoint;
    const verticalLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    verticalLine.setAttribute('x1', String(currentPoint[0]));
    verticalLine.setAttribute('y1', String(Math.min(currentPoint[1], refPoint[1]) - 50));
    verticalLine.setAttribute('x2', String(currentPoint[0]));
    verticalLine.setAttribute('y2', String(Math.max(currentPoint[1], refPoint[1]) + 50));
    verticalLine.setAttribute('stroke', guideColor);
    verticalLine.setAttribute('stroke-width', String(guideWidth));
    verticalLine.setAttribute('stroke-dasharray', '4,4');
    verticalLine.classList.add('pen-alignment-guide');
    g.appendChild(verticalLine);

    // 在参考点位置绘制小圆点标记
    const refMarker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    refMarker.setAttribute('cx', String(refPoint[0]));
    refMarker.setAttribute('cy', String(refPoint[1]));
    refMarker.setAttribute('r', '3');
    refMarker.setAttribute('fill', guideColor);
    refMarker.setAttribute('opacity', '0.6');
    refMarker.classList.add('pen-alignment-marker');
    g.appendChild(refMarker);
  }

  // 水平对齐线（Y 坐标相同）- 连接到水平对齐的参考点
  if (alignment.horizontal && alignment.horizontalRefPoint) {
    const refPoint = alignment.horizontalRefPoint;
    const horizontalLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    horizontalLine.setAttribute('x1', String(Math.min(currentPoint[0], refPoint[0]) - 50));
    horizontalLine.setAttribute('y1', String(currentPoint[1]));
    horizontalLine.setAttribute('x2', String(Math.max(currentPoint[0], refPoint[0]) + 50));
    horizontalLine.setAttribute('y2', String(currentPoint[1]));
    horizontalLine.setAttribute('stroke', guideColor);
    horizontalLine.setAttribute('stroke-width', String(guideWidth));
    horizontalLine.setAttribute('stroke-dasharray', '4,4');
    horizontalLine.classList.add('pen-alignment-guide');
    g.appendChild(horizontalLine);

    // 在参考点位置绘制小圆点标记（如果和垂直参考点不同）
    if (!alignment.verticalRefPoint || 
        alignment.horizontalRefPoint[0] !== alignment.verticalRefPoint[0] ||
        alignment.horizontalRefPoint[1] !== alignment.verticalRefPoint[1]) {
      const refMarker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      refMarker.setAttribute('cx', String(refPoint[0]));
      refMarker.setAttribute('cy', String(refPoint[1]));
      refMarker.setAttribute('r', '3');
      refMarker.setAttribute('fill', guideColor);
      refMarker.setAttribute('opacity', '0.6');
      refMarker.classList.add('pen-alignment-marker');
      g.appendChild(refMarker);
    }
  }
}

/**
 * 绘制路径预览（创建过程中）
 */
export function drawPenPreview(
  anchors: PenAnchor[],
  currentPoint: [number, number] | null,
  strokeColor: string = '#1890ff',
  strokeWidth: number = 2,
  alignment?: AlignmentInfo
): SVGGElement {
  const g = createG();
  g.classList.add('pen-preview');

  if (anchors.length === 0) return g;

  // 绘制对齐辅助线（先绘制，在最底层）
  if (currentPoint && isValidPoint(currentPoint) && alignment && (alignment.horizontal || alignment.vertical)) {
    drawAlignmentGuides(g, currentPoint, alignment);
  }

  // 绘制已确定的路径
  if (anchors.length > 0) {
    const pathData = generatePathFromAnchors(anchors, false);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', strokeColor);
    path.setAttribute('stroke-width', String(strokeWidth));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    g.appendChild(path);
  }

  // 绘制到当前鼠标位置的预览线
  if (currentPoint && isValidPoint(currentPoint) && anchors.length > 0) {
    const lastAnchor = anchors[anchors.length - 1];
    if (isValidPoint(lastAnchor.point)) {
      const previewLine = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'line'
      );
      
      const startPoint = (lastAnchor.handleOut && isValidPoint(lastAnchor.handleOut)) 
        ? lastAnchor.handleOut 
        : lastAnchor.point;
      previewLine.setAttribute('x1', String(startPoint[0]));
      previewLine.setAttribute('y1', String(startPoint[1]));
      previewLine.setAttribute('x2', String(currentPoint[0]));
      previewLine.setAttribute('y2', String(currentPoint[1]));
      previewLine.setAttribute('stroke', strokeColor);
      previewLine.setAttribute('stroke-width', '1');
      previewLine.setAttribute('stroke-dasharray', '5,5');
      previewLine.setAttribute('opacity', '0.6');
      g.appendChild(previewLine);
    }
  }

  // 绘制锚点
  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i];

    // 跳过无效锚点
    if (!isValidPoint(anchor.point)) continue;

    // 绘制控制柄
    if (anchor.handleIn && isValidPoint(anchor.handleIn)) {
      const handleLine = createHandleLine(anchor.point, anchor.handleIn);
      g.appendChild(handleLine);
      const handlePoint = createHandlePoint(anchor.handleIn);
      g.appendChild(handlePoint);
    }
    if (anchor.handleOut && isValidPoint(anchor.handleOut)) {
      const handleLine = createHandleLine(anchor.point, anchor.handleOut);
      g.appendChild(handleLine);
      const handlePoint = createHandlePoint(anchor.handleOut);
      g.appendChild(handlePoint);
    }

    // 绘制锚点
    const anchorEl = createAnchorPoint(anchor, i === anchors.length - 1);
    g.appendChild(anchorEl);
  }

  return g;
}
