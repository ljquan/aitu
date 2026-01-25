/**
 * 画笔设置状态管理
 * 管理画笔的 strokeWidth、strokeColor 和 strokeStyle
 * 管理橡皮擦的 eraserWidth
 * 支持 localStorage 持久化
 */

import { PlaitBoard, DEFAULT_COLOR } from '@plait/core';
import { StrokeStyle } from '@plait/common';

/**
 * 扩展 StrokeStyle，添加双层线样式
 * 使用"类型 + 同名常量对象"模式扩展外部库枚举
 */
export type FreehandStrokeStyle = StrokeStyle | 'double';

export const FreehandStrokeStyle = {
  ...StrokeStyle,
  double: 'double' as const,
};

/**
 * 笔刷形状类型（画笔和橡皮擦通用）
 */
export type BrushShape = 'circle' | 'square';

export const BrushShape = {
  circle: 'circle' as const,
  square: 'square' as const,
};

/**
 * 橡皮擦形状类型（兼容旧代码）
 * @deprecated 使用 BrushShape 代替
 */
export type EraserShape = BrushShape;
export const EraserShape = BrushShape;

export interface FreehandSettings {
  strokeWidth: number;
  strokeColor: string;
  strokeStyle: FreehandStrokeStyle;
  pencilShape: BrushShape;
  eraserWidth: number;
  eraserShape: BrushShape;
  pressureEnabled: boolean;
  preciseEraserEnabled: boolean;
}

// localStorage 存储键
const STORAGE_KEY = 'aitu_freehand_settings';

// 默认画笔设置（精准擦除默认开启）
const DEFAULT_FREEHAND_SETTINGS: FreehandSettings = {
  strokeWidth: 2,
  strokeColor: DEFAULT_COLOR,
  strokeStyle: StrokeStyle.solid,
  pencilShape: BrushShape.circle,
  eraserWidth: 20,
  eraserShape: BrushShape.circle,
  pressureEnabled: false,
  preciseEraserEnabled: true, // 默认开启精准擦除
};

// 使用 WeakMap 存储每个 board 的画笔设置
const FREEHAND_SETTINGS = new WeakMap<PlaitBoard, FreehandSettings>();

// 缓存的持久化设置（避免重复读取 localStorage）
let cachedPersistedSettings: Partial<FreehandSettings> | null = null;

/**
 * 从 localStorage 加载持久化的设置
 */
function loadPersistedSettings(): Partial<FreehandSettings> {
  if (cachedPersistedSettings !== null) {
    return cachedPersistedSettings;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      cachedPersistedSettings = JSON.parse(stored);
      return cachedPersistedSettings!;
    }
  } catch {
    // localStorage 不可用或解析失败，使用默认值
  }
  
  cachedPersistedSettings = {};
  return cachedPersistedSettings;
}

/**
 * 保存设置到 localStorage
 */
function persistSettings(settings: FreehandSettings): void {
  try {
    // 只持久化需要记忆的设置（不包括颜色，因为颜色通常每次都会选择）
    const toPersist: Partial<FreehandSettings> = {
      strokeWidth: settings.strokeWidth,
      strokeStyle: settings.strokeStyle,
      pencilShape: settings.pencilShape,
      eraserWidth: settings.eraserWidth,
      eraserShape: settings.eraserShape,
      pressureEnabled: settings.pressureEnabled,
      preciseEraserEnabled: settings.preciseEraserEnabled,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
    cachedPersistedSettings = toPersist;
  } catch {
    // localStorage 不可用，静默失败
  }
}

/**
 * 获取当前画笔设置
 * 首次获取时会从 localStorage 加载持久化的设置
 */
export const getFreehandSettings = (board: PlaitBoard): FreehandSettings => {
  let settings = FREEHAND_SETTINGS.get(board);
  
  if (!settings) {
    // 合并默认设置和持久化设置
    const persisted = loadPersistedSettings();
    settings = {
      ...DEFAULT_FREEHAND_SETTINGS,
      ...persisted,
    };
    FREEHAND_SETTINGS.set(board, settings);
  }
  
  return settings;
};

/**
 * 内部更新设置并持久化
 */
function updateAndPersist(board: PlaitBoard, updates: Partial<FreehandSettings>): void {
  const current = getFreehandSettings(board);
  const newSettings = { ...current, ...updates };
  FREEHAND_SETTINGS.set(board, newSettings);
  persistSettings(newSettings);
}

/**
 * 设置画笔宽度
 */
export const setFreehandStrokeWidth = (board: PlaitBoard, strokeWidth: number) => {
  updateAndPersist(board, { strokeWidth });
};

/**
 * 设置画笔颜色
 * 注意：颜色不会持久化，每次启动使用默认颜色
 */
export const setFreehandStrokeColor = (board: PlaitBoard, strokeColor: string) => {
  const current = getFreehandSettings(board);
  FREEHAND_SETTINGS.set(board, { ...current, strokeColor });
  // 颜色不持久化
};

/**
 * 设置画笔描边样式
 */
export const setFreehandStrokeStyle = (board: PlaitBoard, strokeStyle: FreehandStrokeStyle) => {
  updateAndPersist(board, { strokeStyle });
};

/**
 * 设置画笔形状
 */
export const setPencilShape = (board: PlaitBoard, pencilShape: BrushShape) => {
  updateAndPersist(board, { pencilShape });
};

/**
 * 设置橡皮擦宽度
 */
export const setEraserWidth = (board: PlaitBoard, eraserWidth: number) => {
  updateAndPersist(board, { eraserWidth });
};

/**
 * 设置橡皮擦形状
 */
export const setEraserShape = (board: PlaitBoard, eraserShape: EraserShape) => {
  updateAndPersist(board, { eraserShape });
};

/**
 * 设置压力感应开关
 */
export const setFreehandPressureEnabled = (board: PlaitBoard, pressureEnabled: boolean) => {
  updateAndPersist(board, { pressureEnabled });
};

/**
 * 设置精确橡皮擦开关
 */
export const setPreciseEraserEnabled = (board: PlaitBoard, preciseEraserEnabled: boolean) => {
  updateAndPersist(board, { preciseEraserEnabled });
};

/**
 * 更新画笔设置
 */
export const updateFreehandSettings = (board: PlaitBoard, settings: Partial<FreehandSettings>) => {
  updateAndPersist(board, settings);
};

/**
 * 重置为默认设置
 */
export const resetFreehandSettings = (board: PlaitBoard): void => {
  FREEHAND_SETTINGS.set(board, { ...DEFAULT_FREEHAND_SETTINGS });
  persistSettings(DEFAULT_FREEHAND_SETTINGS);
};
