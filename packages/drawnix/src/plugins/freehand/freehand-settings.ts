/**
 * 画笔设置状态管理
 * 管理画笔的 strokeWidth、strokeColor 和 strokeStyle
 * 管理橡皮擦的 eraserWidth
 */

import { PlaitBoard, DEFAULT_COLOR } from '@plait/core';
import { StrokeStyle } from '@plait/common';

export interface FreehandSettings {
  strokeWidth: number;
  strokeColor: string;
  strokeStyle: StrokeStyle;
  eraserWidth: number;
  pressureEnabled: boolean;
}

// 默认画笔设置
const DEFAULT_FREEHAND_SETTINGS: FreehandSettings = {
  strokeWidth: 2,
  strokeColor: DEFAULT_COLOR,
  strokeStyle: StrokeStyle.solid,
  eraserWidth: 20,
  pressureEnabled: false,
};

// 使用 WeakMap 存储每个 board 的画笔设置
const FREEHAND_SETTINGS = new WeakMap<PlaitBoard, FreehandSettings>();

/**
 * 获取当前画笔设置
 */
export const getFreehandSettings = (board: PlaitBoard): FreehandSettings => {
  return FREEHAND_SETTINGS.get(board) || { ...DEFAULT_FREEHAND_SETTINGS };
};

/**
 * 设置画笔宽度
 */
export const setFreehandStrokeWidth = (board: PlaitBoard, strokeWidth: number) => {
  const current = getFreehandSettings(board);
  FREEHAND_SETTINGS.set(board, { ...current, strokeWidth });
};

/**
 * 设置画笔颜色
 */
export const setFreehandStrokeColor = (board: PlaitBoard, strokeColor: string) => {
  const current = getFreehandSettings(board);
  FREEHAND_SETTINGS.set(board, { ...current, strokeColor });
};

/**
 * 设置画笔描边样式
 */
export const setFreehandStrokeStyle = (board: PlaitBoard, strokeStyle: StrokeStyle) => {
  const current = getFreehandSettings(board);
  FREEHAND_SETTINGS.set(board, { ...current, strokeStyle });
};

/**
 * 设置橡皮擦宽度
 */
export const setEraserWidth = (board: PlaitBoard, eraserWidth: number) => {
  const current = getFreehandSettings(board);
  FREEHAND_SETTINGS.set(board, { ...current, eraserWidth });
};

/**
 * 设置压力感应开关
 */
export const setFreehandPressureEnabled = (board: PlaitBoard, pressureEnabled: boolean) => {
  const current = getFreehandSettings(board);
  FREEHAND_SETTINGS.set(board, { ...current, pressureEnabled });
};

/**
 * 更新画笔设置
 */
export const updateFreehandSettings = (board: PlaitBoard, settings: Partial<FreehandSettings>) => {
  const current = getFreehandSettings(board);
  FREEHAND_SETTINGS.set(board, { ...current, ...settings });
};
