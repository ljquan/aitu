/**
 * 钢笔工具设置状态管理
 * 管理钢笔的 strokeWidth、strokeColor、strokeStyle 和默认锚点类型
 */

import { PlaitBoard, DEFAULT_COLOR } from '@plait/core';
import { StrokeStyle } from '@plait/common';
import { AnchorType } from './type';

export interface PenSettings {
  strokeWidth: number;
  strokeColor: string;
  strokeStyle: StrokeStyle;
  defaultAnchorType: AnchorType;
}

// 默认钢笔设置
const DEFAULT_PEN_SETTINGS: PenSettings = {
  strokeWidth: 2,
  strokeColor: DEFAULT_COLOR,
  strokeStyle: StrokeStyle.solid,
  defaultAnchorType: 'smooth',
};

// LocalStorage key
const PEN_SETTINGS_KEY = 'pen-settings';

// 使用 WeakMap 存储每个 board 的钢笔设置
const PEN_SETTINGS = new WeakMap<PlaitBoard, PenSettings>();

/**
 * 从 localStorage 加载设置
 */
const loadSettingsFromStorage = (): Partial<PenSettings> => {
  try {
    const stored = localStorage.getItem(PEN_SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return {};
};

/**
 * 保存设置到 localStorage
 */
const saveSettingsToStorage = (settings: PenSettings) => {
  try {
    localStorage.setItem(PEN_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
};

/**
 * 获取当前钢笔设置
 */
export const getPenSettings = (board: PlaitBoard): PenSettings => {
  let settings = PEN_SETTINGS.get(board);
  if (!settings) {
    const stored = loadSettingsFromStorage();
    settings = { ...DEFAULT_PEN_SETTINGS, ...stored };
    PEN_SETTINGS.set(board, settings);
  }
  return settings;
};

/**
 * 设置钢笔线条宽度
 */
export const setPenStrokeWidth = (board: PlaitBoard, strokeWidth: number) => {
  const current = getPenSettings(board);
  const updated = { ...current, strokeWidth };
  PEN_SETTINGS.set(board, updated);
  saveSettingsToStorage(updated);
};

/**
 * 设置钢笔颜色
 */
export const setPenStrokeColor = (board: PlaitBoard, strokeColor: string) => {
  const current = getPenSettings(board);
  const updated = { ...current, strokeColor };
  PEN_SETTINGS.set(board, updated);
  saveSettingsToStorage(updated);
};

/**
 * 设置钢笔描边样式
 */
export const setPenStrokeStyle = (board: PlaitBoard, strokeStyle: StrokeStyle) => {
  const current = getPenSettings(board);
  const updated = { ...current, strokeStyle };
  PEN_SETTINGS.set(board, updated);
  saveSettingsToStorage(updated);
};

/**
 * 设置默认锚点类型
 */
export const setPenDefaultAnchorType = (board: PlaitBoard, anchorType: AnchorType) => {
  const current = getPenSettings(board);
  const updated = { ...current, defaultAnchorType: anchorType };
  PEN_SETTINGS.set(board, updated);
  saveSettingsToStorage(updated);
};

/**
 * 更新钢笔设置
 */
export const updatePenSettings = (board: PlaitBoard, settings: Partial<PenSettings>) => {
  const current = getPenSettings(board);
  const updated = { ...current, ...settings };
  PEN_SETTINGS.set(board, updated);
  saveSettingsToStorage(updated);
};
