/**
 * Resize Utils
 *
 * 缩放相关的工具函数
 * 包括 Shift 键状态跟踪和比例锁定计算
 */

import { RectangleClient } from '@plait/core';

// Shift 键状态跟踪
let isShiftPressed = false;

// 初始化 Shift 键监听（在模块加载时自动执行）
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') {
      isShiftPressed = true;
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
      isShiftPressed = false;
    }
  });

  // 窗口失焦时重置状态，防止在其他窗口松开 Shift 键导致状态不一致
  window.addEventListener('blur', () => {
    isShiftPressed = false;
  });
}

/**
 * 获取当前 Shift 键状态
 */
export function getShiftKeyState(): boolean {
  return isShiftPressed;
}

// ResizeHandle 枚举值
export enum ResizeHandle {
  NW = '0', // 左上
  NE = '1', // 右上
  SE = '2', // 右下
  SW = '3', // 左下
  N = '4',  // 上
  E = '5',  // 右
  S = '6',  // 下
  W = '7',  // 左
}

/**
 * 计算新的矩形尺寸（支持 Shift 锁定比例）
 *
 * @param startRectangle 起始矩形
 * @param handle 当前拖拽的手柄
 * @param dx X 方向偏移量
 * @param dy Y 方向偏移量
 * @param lockAspectRatio 是否锁定比例（通常由 Shift 键控制）
 * @param minSize 最小尺寸
 */
export function calculateResizedRect(
  startRectangle: RectangleClient,
  handle: ResizeHandle | string,
  dx: number,
  dy: number,
  lockAspectRatio: boolean = false,
  minSize: number = 20
): RectangleClient {
  let newX = startRectangle.x;
  let newY = startRectangle.y;
  let newWidth = startRectangle.width;
  let newHeight = startRectangle.height;

  // 原始宽高比
  const aspectRatio = startRectangle.width / startRectangle.height;

  // 根据手柄类型计算新尺寸
  switch (handle) {
    case ResizeHandle.NW: // 左上角
      newX = startRectangle.x + dx;
      newY = startRectangle.y + dy;
      newWidth = startRectangle.width - dx;
      newHeight = startRectangle.height - dy;
      break;
    case ResizeHandle.NE: // 右上角
      newY = startRectangle.y + dy;
      newWidth = startRectangle.width + dx;
      newHeight = startRectangle.height - dy;
      break;
    case ResizeHandle.SE: // 右下角
      newWidth = startRectangle.width + dx;
      newHeight = startRectangle.height + dy;
      break;
    case ResizeHandle.SW: // 左下角
      newX = startRectangle.x + dx;
      newWidth = startRectangle.width - dx;
      newHeight = startRectangle.height + dy;
      break;
    case ResizeHandle.N: // 上边
      newY = startRectangle.y + dy;
      newHeight = startRectangle.height - dy;
      break;
    case ResizeHandle.E: // 右边
      newWidth = startRectangle.width + dx;
      break;
    case ResizeHandle.S: // 下边
      newHeight = startRectangle.height + dy;
      break;
    case ResizeHandle.W: // 左边
      newX = startRectangle.x + dx;
      newWidth = startRectangle.width - dx;
      break;
  }

  // 如果锁定比例，调整宽高以保持比例
  if (lockAspectRatio) {
    const isCornerHandle = [
      ResizeHandle.NW,
      ResizeHandle.NE,
      ResizeHandle.SE,
      ResizeHandle.SW,
    ].includes(handle as ResizeHandle);

    const isHorizontalEdge = [ResizeHandle.E, ResizeHandle.W].includes(
      handle as ResizeHandle
    );
    const isVerticalEdge = [ResizeHandle.N, ResizeHandle.S].includes(
      handle as ResizeHandle
    );

    if (isCornerHandle) {
      // 角落手柄：根据拖拽距离较大的方向决定缩放
      const widthChange = Math.abs(newWidth - startRectangle.width);
      const heightChange = Math.abs(newHeight - startRectangle.height);

      if (widthChange > heightChange) {
        // 以宽度变化为主
        const targetHeight = newWidth / aspectRatio;
        const heightDiff = targetHeight - startRectangle.height;

        switch (handle) {
          case ResizeHandle.NW:
          case ResizeHandle.NE:
            // 上方手柄：调整 Y 坐标和高度
            newY = startRectangle.y + startRectangle.height - targetHeight;
            newHeight = targetHeight;
            break;
          case ResizeHandle.SE:
          case ResizeHandle.SW:
            // 下方手柄：只调整高度
            newHeight = targetHeight;
            break;
        }
      } else {
        // 以高度变化为主
        const targetWidth = newHeight * aspectRatio;
        const widthDiff = targetWidth - startRectangle.width;

        switch (handle) {
          case ResizeHandle.NW:
          case ResizeHandle.SW:
            // 左侧手柄：调整 X 坐标和宽度
            newX = startRectangle.x + startRectangle.width - targetWidth;
            newWidth = targetWidth;
            break;
          case ResizeHandle.NE:
          case ResizeHandle.SE:
            // 右侧手柄：只调整宽度
            newWidth = targetWidth;
            break;
        }
      }
    } else if (isHorizontalEdge) {
      // 水平边缘：根据宽度计算高度
      const targetHeight = newWidth / aspectRatio;
      const heightDiff = targetHeight - startRectangle.height;
      // 从中心缩放
      newY = startRectangle.y - heightDiff / 2;
      newHeight = targetHeight;
    } else if (isVerticalEdge) {
      // 垂直边缘：根据高度计算宽度
      const targetWidth = newHeight * aspectRatio;
      const widthDiff = targetWidth - startRectangle.width;
      // 从中心缩放
      newX = startRectangle.x - widthDiff / 2;
      newWidth = targetWidth;
    }
  }

  // 确保最小尺寸
  if (newWidth < minSize) {
    if (
      handle === ResizeHandle.NW ||
      handle === ResizeHandle.W ||
      handle === ResizeHandle.SW
    ) {
      newX = startRectangle.x + startRectangle.width - minSize;
    }
    newWidth = minSize;

    // 如果锁定比例，同时调整高度
    if (lockAspectRatio) {
      const targetHeight = minSize / aspectRatio;
      if (
        handle === ResizeHandle.NW ||
        handle === ResizeHandle.N ||
        handle === ResizeHandle.NE
      ) {
        newY = startRectangle.y + startRectangle.height - targetHeight;
      }
      newHeight = targetHeight;
    }
  }

  if (newHeight < minSize) {
    if (
      handle === ResizeHandle.NW ||
      handle === ResizeHandle.N ||
      handle === ResizeHandle.NE
    ) {
      newY = startRectangle.y + startRectangle.height - minSize;
    }
    newHeight = minSize;

    // 如果锁定比例，同时调整宽度
    if (lockAspectRatio) {
      const targetWidth = minSize * aspectRatio;
      if (
        handle === ResizeHandle.NW ||
        handle === ResizeHandle.W ||
        handle === ResizeHandle.SW
      ) {
        newX = startRectangle.x + startRectangle.width - targetWidth;
      }
      newWidth = targetWidth;
    }
  }

  return { x: newX, y: newY, width: newWidth, height: newHeight };
}
