import { IS_APPLE, IS_MAC, PlaitBoard, toImage, ToImageOptions } from '@plait/core';

/**
 * Convert Plait board to image (Plait-specific)
 *
 * @param board - Plait board instance
 * @param options - Image export options
 * @returns Promise resolving to image data URL
 */
export const boardToImage = (
  board: PlaitBoard,
  options: ToImageOptions = {}
) => {
  return toImage(board, {
    fillStyle: 'transparent',
    inlineStyleClassNames: '.extend,.emojis,.text',
    padding: 20,
    ratio: 4,
    ...options,
  });
};

/**
 * Format keyboard shortcut for current platform (Plait-specific)
 *
 * @param shortcut - Shortcut string with placeholders
 * @returns Platform-specific shortcut string
 */
export const getShortcutKey = (shortcut: string): string => {
  shortcut = shortcut
    .replace(/\bAlt\b/i, "Alt")
    .replace(/\bShift\b/i, "Shift")
    .replace(/\b(Enter|Return)\b/i, "Enter");
  if (IS_APPLE || IS_MAC) {
    return shortcut
      .replace(/\bCtrlOrCmd\b/gi, "Cmd")
      .replace(/\bAlt\b/i, "Option");
  }
  return shortcut.replace(/\bCtrlOrCmd\b/gi, "Ctrl");
};

// ==================== 内存监控 ====================

/**
 * 轻量级内存追踪
 * 使用全局 __memoryLog（由 crash-logger 初始化），如果可用
 * 只在内存变化超过 50MB 时才输出日志，避免干扰正常使用
 * 
 * @param label - 操作名称，如 "图片合并"、"批量导入"
 * @returns 结束函数，在操作完成后调用
 * 
 * @example
 * const end = trackMemory('图片合并');
 * await mergeImages();
 * end(); // 只在内存变化 > 50MB 时输出日志
 */
export function trackMemory(label: string): () => void {
  const tracker = (window as any).__memoryLog?.track;
  return tracker ? tracker(label) : () => {};
}