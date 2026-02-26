/**
 * Card 标签贴元素类型定义
 */
import { PlaitElement, Point } from '@plait/core';

export interface PlaitCard extends PlaitElement {
  type: 'card';
  /** 标题（可选） */
  title?: string;
  /** 正文内容 */
  body: string;
  /** 填充颜色（主色，十六进制） */
  fillColor: string;
  /** 位置和尺寸：[左上角, 右下角] */
  points: [Point, Point];
  /** 关联的知识库笔记 ID（可选） */
  noteId?: string;
}

export const isCardElement = (element: PlaitElement): element is PlaitCard => {
  return element.type === 'card';
};
