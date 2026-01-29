/**
 * GIF 录制 DSL 类型定义
 * 
 * 用于定义用户手册中的 GIF 动画录制动作
 */

// ============ 动作类型定义 ============

/** 点击元素动作 */
export interface ClickAction {
  type: 'click';
  /** 元素选择器 (Playwright 选择器语法) */
  target: string;
  /** 点击时显示的标签文字 */
  label?: string;
  /** 点击后等待时间 (ms)，默认 1500 */
  wait?: number;
  /** 是否可选，如果元素不存在则跳过 */
  optional?: boolean;
  /** 等待元素出现的超时时间 (ms)，默认 5000 */
  timeout?: number;
}

/** 按键动作 */
export interface PressAction {
  type: 'press';
  /** 按键名称 (如 'Tab', 'Enter', 'Escape') */
  key: string;
  /** 按键后等待时间 (ms)，默认 500 */
  wait?: number;
}

/** 输入文字动作 */
export interface TypeAction {
  type: 'type';
  /** 要输入的文字 */
  text: string;
  /** 每个字符的输入延迟 (ms)，默认 100 */
  delay?: number;
  /** 输入后等待时间 (ms)，默认 500 */
  wait?: number;
}

/** 显示快捷键提示动作 */
export interface KeyHintAction {
  type: 'keyHint';
  /** 快捷键名称 */
  key: string;
  /** 显示的提示文字 */
  hint: string;
  /** 提示显示时长 (ms)，默认 1500 */
  duration?: number;
}

/** 坐标点击动作 */
export interface MouseClickAction {
  type: 'mouseClick';
  /** X 坐标 */
  x: number;
  /** Y 坐标 */
  y: number;
  /** 点击时显示的标签文字 */
  label?: string;
  /** 点击后等待时间 (ms)，默认 500 */
  wait?: number;
}

/** 绘制路径点 */
export interface DrawPoint {
  x: number;
  y: number;
}

/** 鼠标绘制动作 */
export interface MouseDrawAction {
  type: 'mouseDraw';
  /** 绘制路径点 */
  points: DrawPoint[];
  /** 每个点之间的延迟 (ms)，默认 50 */
  stepDelay?: number;
  /** 绘制后等待时间 (ms)，默认 500 */
  wait?: number;
}

/** 等待动作 */
export interface WaitAction {
  type: 'wait';
  /** 等待时长 (ms) */
  duration: number;
}

/** 滚动动作 */
export interface ScrollAction {
  type: 'scroll';
  /** 滚动目标元素选择器，不指定则滚动页面 */
  target?: string;
  /** 垂直滚动距离 (正数向下，负数向上) */
  deltaY: number;
  /** 滚动后等待时间 (ms)，默认 500 */
  wait?: number;
}

/** 悬停动作 */
export interface HoverAction {
  type: 'hover';
  /** 元素选择器 */
  target: string;
  /** 悬停时显示的标签文字 */
  label?: string;
  /** 悬停后等待时间 (ms)，默认 1000 */
  wait?: number;
}

/** 所有动作类型的联合 */
export type GifAction =
  | ClickAction
  | PressAction
  | TypeAction
  | KeyHintAction
  | MouseClickAction
  | MouseDrawAction
  | WaitAction
  | ScrollAction
  | HoverAction;

// ============ GIF 定义 ============

/** GIF 定义 */
export interface GifDefinition {
  /** 唯一标识符 */
  id: string;
  /** GIF 名称 (显示用) */
  name: string;
  /** 输出文件名 */
  output: string;
  /** 目标页面路径 (对应 MDX 文件路径) */
  targetPage: string;
  /** 动作序列 */
  actions: GifAction[];
  /** 片段开始前的等待时间 (ms)，默认 1000 */
  preWait?: number;
  /** 片段结束后的等待时间 (ms)，默认 1500 */
  postWait?: number;
}

// ============ 时间清单 ============

/** 单个 GIF 的时间信息 */
export interface GifTimeSegment {
  /** GIF 标识符 */
  id: string;
  /** 输出文件名 */
  output: string;
  /** 开始时间 (秒) */
  startTime: number;
  /** 结束时间 (秒) */
  endTime: number;
}

/** GIF 时间清单 */
export interface GifManifest {
  /** 视频文件路径 */
  videoPath: string;
  /** 录制时间戳 */
  recordedAt: string;
  /** GIF 片段列表 */
  gifs: GifTimeSegment[];
}

// ============ 执行器配置 ============

/** 执行器配置 */
export interface ExecutorConfig {
  /** 是否显示点击效果，默认 true */
  showClickEffect?: boolean;
  /** 是否显示快捷键提示，默认 true */
  showKeyHint?: boolean;
  /** 默认点击后等待时间 (ms) */
  defaultClickWait?: number;
  /** 默认按键后等待时间 (ms) */
  defaultPressWait?: number;
  /** 默认输入延迟 (ms) */
  defaultTypeDelay?: number;
  /** 片段间隔时间 (ms)，用于视觉分隔 */
  segmentGap?: number;
}

/** 默认执行器配置 */
export const DEFAULT_EXECUTOR_CONFIG: Required<ExecutorConfig> = {
  showClickEffect: true,
  showKeyHint: true,
  defaultClickWait: 1500,
  defaultPressWait: 500,
  defaultTypeDelay: 100,
  segmentGap: 1000,
};
