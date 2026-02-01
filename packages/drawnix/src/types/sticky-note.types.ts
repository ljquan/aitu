/**
 * Sticky Note Type Definitions
 *
 * 定义便利贴元素的类型和接口
 */

import { PlaitElement, Point } from '@plait/core';

/**
 * 便利贴背景颜色选项
 */
export enum StickyNoteColor {
  /** 黄色 */
  YELLOW = '#FEF3C7',
  /** 绿色 */
  GREEN = '#D1FAE5',
  /** 蓝色 */
  BLUE = '#DBEAFE',
  /** 粉色 */
  PINK = '#FCE7F3',
  /** 紫色 */
  PURPLE = '#EDE9FE',
  /** 橙色 */
  ORANGE = '#FFEDD5',
}

/**
 * 便利贴文字颜色（根据背景色自动匹配）
 */
export const STICKY_NOTE_TEXT_COLORS: Record<StickyNoteColor, string> = {
  [StickyNoteColor.YELLOW]: '#92400E',
  [StickyNoteColor.GREEN]: '#065F46',
  [StickyNoteColor.BLUE]: '#1E40AF',
  [StickyNoteColor.PINK]: '#9D174D',
  [StickyNoteColor.PURPLE]: '#5B21B6',
  [StickyNoteColor.ORANGE]: '#9A3412',
};

/**
 * 便利贴默认尺寸
 */
export const DEFAULT_STICKY_NOTE_SIZE = {
  width: 280,
  height: 200,
};

/**
 * 便利贴元素 - 画布上的便利贴实例
 */
export interface PlaitStickyNote extends PlaitElement {
  /** 元素类型标识 */
  type: 'sticky-note';

  /** 位置和尺寸（画布坐标）[左上角, 右下角] */
  points: [Point, Point];

  /** 旋转角度（度数） */
  angle: number;

  /** Markdown 内容 */
  content: string;

  /** 背景颜色 */
  backgroundColor: StickyNoteColor;

  /** 是否处于编辑模式 */
  isEditing?: boolean;

  /** 创建时间 */
  createdAt?: number;
}

/**
 * 创建便利贴的选项
 */
export interface StickyNoteCreateOptions {
  /** 插入位置 */
  position: Point;

  /** 尺寸（可选） */
  size?: { width: number; height: number };

  /** 初始内容 */
  content?: string;

  /** 背景颜色 */
  backgroundColor?: StickyNoteColor;
}
