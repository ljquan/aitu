/**
 * Frame 容器类型定义
 */
import { PlaitElement, Point } from '@plait/core';

export interface PlaitFrame extends PlaitElement {
  type: 'frame';
  name: string;
  points: [Point, Point];
  /** 背景图 URL */
  backgroundUrl?: string;
}

export const isFrameElement = (element: PlaitElement): element is PlaitFrame => {
  return element.type === 'frame';
};
