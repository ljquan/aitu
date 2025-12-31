/**
 * 新手引导工具函数
 */

import { ElementRect } from '../types/tutorial.types';

/** 高亮框的内边距 */
export const SPOTLIGHT_PADDING = 16;

/** 高亮框的圆角 */
export const SPOTLIGHT_BORDER_RADIUS = 12;

/** 本地存储键名 */
export const TUTORIAL_STORAGE_KEY = 'aitu_tutorial_completed';

/**
 * 获取元素的位置信息
 * @param id 元素 ID
 * @returns 元素位置信息，如果元素不存在则返回 null
 */
export const getElementRect = (id: string): ElementRect | null => {
  const element = document.getElementById(id);
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    bottom: rect.bottom,
    right: rect.right,
  };
};

/**
 * 检查用户是否已完成引导
 * @returns 是否已完成引导
 */
export const hasCompletedTutorial = (): boolean => {
  try {
    return localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

/**
 * 标记用户已完成引导
 */
export const markTutorialCompleted = (): void => {
  try {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
  } catch {
    // localStorage 不可用时静默失败
  }
};

/**
 * 重置引导状态（用于测试或用户主动触发）
 */
export const resetTutorialStatus = (): void => {
  try {
    localStorage.removeItem(TUTORIAL_STORAGE_KEY);
  } catch {
    // localStorage 不可用时静默失败
  }
};
