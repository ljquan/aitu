/**
 * Minimap Types
 *
 * 小地图相关类型定义
 */

import { PlaitBoard, RectangleClient } from '@plait/core';

/**
 * Minimap 配置
 */
export interface MinimapConfig {
  /** Minimap 宽度（像素） */
  width: number;
  /** Minimap 高度（像素） */
  height: number;
  /** 位置 */
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** 与边缘的间距 */
  margin: number;
  /** 是否可折叠 */
  collapsible: boolean;
  /** 默认是否展开 */
  defaultExpanded: boolean;
  /** 背景色 */
  backgroundColor: string;
  /** 边框色 */
  borderColor: string;
  /** Viewport 框颜色 */
  viewportColor: string;
  /** 元素颜色 */
  elementColor: string;
}

/**
 * Minimap 元素简化表示
 */
export interface MinimapElement {
  /** 元素 ID */
  id: string;
  /** 边界矩形 */
  bounds: RectangleClient;
  /** 元素类型（用于不同颜色渲染） */
  type?: string;
}

/**
 * Minimap 状态
 */
export interface MinimapState {
  /** 是否展开 */
  expanded: boolean;
  /** 是否正在拖拽 */
  dragging: boolean;
  /** 是否自动显示模式 */
  autoMode: boolean;
  /** 用户是否手动展开（手动展开则不自动隐藏） */
  manuallyExpanded: boolean;
}

/**
 * 智能显示模式
 */
export type MinimapDisplayMode = 'always' | 'auto' | 'manual';

/**
 * 智能显示触发器配置（方案 A：简化版）
 */
export interface MinimapAutoTriggerConfig {
  /** 交互停止后自动隐藏的延迟时间（毫秒） */
  autoHideDelay: number;
}

/**
 * Minimap 组件 Props
 */
export interface MinimapProps {
  /** Plait Board 实例 */
  board: PlaitBoard;
  /** 配置（可选，使用默认值） */
  config?: Partial<MinimapConfig>;
  /** 自定义样式类名 */
  className?: string;
  /** 显示模式：always=始终显示, auto=智能显示, manual=手动控制 */
  displayMode?: MinimapDisplayMode;
  /** 智能触发器配置 */
  autoTriggerConfig?: Partial<MinimapAutoTriggerConfig>;
}

/**
 * 默认配置
 */
export const DEFAULT_MINIMAP_CONFIG: MinimapConfig = {
  width: 200,
  height: 150,
  position: 'bottom-right',
  margin: 16,
  collapsible: true,
  defaultExpanded: false, // 改为默认折叠，由智能显示控制
  backgroundColor: 'rgba(255, 255, 255, 0.95)',
  borderColor: 'rgba(0, 0, 0, 0.1)',
  viewportColor: 'rgba(90, 79, 207, 0.3)',
  elementColor: 'rgba(0, 0, 0, 0.2)',
};

/**
 * 默认智能触发器配置
 */
export const DEFAULT_AUTO_TRIGGER_CONFIG: MinimapAutoTriggerConfig = {
  autoHideDelay: 3000,  // 交互停止 3 秒后自动隐藏
};
