/**
 * WorkZone 画布元素组件
 *
 * 使用 React Portal 将 WorkZoneContent 渲染到画布的 foreignObject 中
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RectangleClient } from '@plait/core';
import type { PlaitWorkZone } from '../../types/workzone.types';
import { WorkZoneContent } from './WorkZoneContent';

interface WorkZoneElementProps {
  element: PlaitWorkZone;
  /** foreignObject 容器元素 */
  container: HTMLDivElement;
}

/**
 * WorkZone 元素的 React 渲染器
 * 通过 Portal 将内容渲染到 foreignObject 的 container 中
 */
export const WorkZoneElement: React.FC<WorkZoneElementProps> = ({
  element,
  container,
}) => {
  return createPortal(
    <WorkZoneContent workflow={element.workflow} />,
    container
  );
};

/**
 * 创建 WorkZone 的 SVG foreignObject 结构
 */
export function createWorkZoneForeignObject(element: PlaitWorkZone): {
  g: SVGGElement;
  container: HTMLDivElement;
} {
  const rect = RectangleClient.getRectangleByPoints(element.points);

  // 创建 SVG group
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('data-element-id', element.id);
  g.classList.add('plait-workzone-element');

  // 创建 foreignObject
  const foreignObject = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'foreignObject'
  );
  foreignObject.setAttribute('x', String(rect.x));
  foreignObject.setAttribute('y', String(rect.y));
  foreignObject.setAttribute('width', String(rect.width));
  foreignObject.setAttribute('height', String(rect.height));
  foreignObject.style.overflow = 'visible';

  // 创建 HTML 容器
  const container = document.createElement('div');
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.pointerEvents = 'auto'; // 允许交互

  foreignObject.appendChild(container);
  g.appendChild(foreignObject);

  return { g, container };
}

/**
 * 更新 WorkZone foreignObject 的位置和大小
 */
export function updateWorkZoneForeignObject(
  g: SVGGElement,
  element: PlaitWorkZone
): void {
  const rect = RectangleClient.getRectangleByPoints(element.points);
  const foreignObject = g.querySelector('foreignObject');

  if (foreignObject) {
    foreignObject.setAttribute('x', String(rect.x));
    foreignObject.setAttribute('y', String(rect.y));
    foreignObject.setAttribute('width', String(rect.width));
    foreignObject.setAttribute('height', String(rect.height));
  }
}

export default WorkZoneElement;
