/**
 * WorkZone 类型定义
 *
 * WorkZone 是一个画布元素，用于在画布上直接显示工作流进度
 * 类似于 ChatDrawer 中的 WorkflowMessageBubble，但固定在画布上
 */

import type { PlaitElement, Point } from '@plait/core';
import type { WorkflowMessageData } from './chat.types';

/**
 * WorkZone 画布元素
 */
export interface PlaitWorkZone extends PlaitElement {
  type: 'workzone';
  /** 两个点定义矩形区域 [左上角, 右下角] */
  points: [Point, Point];
  /** 旋转角度 */
  angle: number;
  /** 关联的工作流数据 */
  workflow: WorkflowMessageData;
  /** 创建时间 */
  createdAt: number;
}

/**
 * WorkZone 创建选项
 */
export interface WorkZoneCreateOptions {
  /** 初始工作流数据 */
  workflow: WorkflowMessageData;
  /** 位置 */
  position: Point;
  /** 尺寸 */
  size?: { width: number; height: number };
}

/**
 * 默认 WorkZone 尺寸
 */
export const DEFAULT_WORKZONE_SIZE = {
  width: 360,
  height: 200,
};
