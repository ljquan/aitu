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
  nw = '0',
  n = '4',
  ne = '1',
  e = '5',
  se = '2',
  s = '6',
  sw = '3',
  w = '7'
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
  lockAspectRatio = false,
  minSize = 20
): RectangleClient {
  let newX = startRectangle.x;
  let newY = startRectangle.y;
  let newWidth = startRectangle.width;
  let newHeight = startRectangle.height;

  // 原始宽高比
  const aspectRatio = startRectangle.width / startRectangle.height;

  // 根据手柄类型计算新尺寸
  switch (handle) {
    case ResizeHandle.nw: // 左上角
      newX = startRectangle.x + dx;
      newY = startRectangle.y + dy;
      newWidth = startRectangle.width - dx;
      newHeight = startRectangle.height - dy;
      break;
    case ResizeHandle.ne: // 右上角
      newY = startRectangle.y + dy;
      newWidth = startRectangle.width + dx;
      newHeight = startRectangle.height - dy;
      break;
    case ResizeHandle.se: // 右下角
      newWidth = startRectangle.width + dx;
      newHeight = startRectangle.height + dy;
      break;
    case ResizeHandle.sw: // 左下角
      newX = startRectangle.x + dx;
      newWidth = startRectangle.width - dx;
      newHeight = startRectangle.height + dy;
      break;
    case ResizeHandle.n: // 上边
      newY = startRectangle.y + dy;
      newHeight = startRectangle.height - dy;
      break;
    case ResizeHandle.e: // 右边
      newWidth = startRectangle.width + dx;
      break;
    case ResizeHandle.s: // 下边
      newHeight = startRectangle.height + dy;
      break;
    case ResizeHandle.w: // 左边
      newX = startRectangle.x + dx;
      newWidth = startRectangle.width - dx;
      break;
  }

  // 如果锁定比例，调整宽高以保持比例
  if (lockAspectRatio) {
    const isCornerHandle = [
      ResizeHandle.nw,
      ResizeHandle.ne,
      ResizeHandle.se,
      ResizeHandle.sw,
    ].includes(handle as ResizeHandle);

    const isHorizontalEdge = [ResizeHandle.e, ResizeHandle.w].includes(
      handle as ResizeHandle
    );
    const isVerticalEdge = [ResizeHandle.n, ResizeHandle.s].includes(
      handle as ResizeHandle
    );

    if (isCornerHandle) {
      // 角落手柄：根据拖拽距离较大的方向决定缩放
      const widthChange = Math.abs(newWidth - startRectangle.width);
      const heightChange = Math.abs(newHeight - startRectangle.height);

      if (widthChange > heightChange) {
        // 以宽度变化为主
        const targetHeight = newWidth / aspectRatio;

        switch (handle) {
          case ResizeHandle.nw:
          case ResizeHandle.ne:
            // 上方手柄：调整 Y 坐标和高度
            newY = startRectangle.y + startRectangle.height - targetHeight;
            newHeight = targetHeight;
            break;
          case ResizeHandle.se:
          case ResizeHandle.sw:
            // 下方手柄：只调整高度
            newHeight = targetHeight;
            break;
        }
      } else {
        // 以高度变化为主
        const targetWidth = newHeight * aspectRatio;

        switch (handle) {
          case ResizeHandle.nw:
          case ResizeHandle.sw:
            // 左侧手柄：调整 X 坐标和宽度
            newX = startRectangle.x + startRectangle.width - targetWidth;
            newWidth = targetWidth;
            break;
          case ResizeHandle.ne:
          case ResizeHandle.se:
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
      handle === ResizeHandle.nw ||
      handle === ResizeHandle.w ||
      handle === ResizeHandle.sw
    ) {
      newX = startRectangle.x + startRectangle.width - minSize;
    }
    newWidth = minSize;

    // 如果锁定比例，同时调整高度
    if (lockAspectRatio) {
      const targetHeight = minSize / aspectRatio;
      if (
        handle === ResizeHandle.nw ||
        handle === ResizeHandle.n ||
        handle === ResizeHandle.ne
      ) {
        newY = startRectangle.y + startRectangle.height - targetHeight;
      }
      newHeight = targetHeight;
    }
  }

  if (newHeight < minSize) {
    if (
      handle === ResizeHandle.nw ||
      handle === ResizeHandle.n ||
      handle === ResizeHandle.ne
    ) {
      newY = startRectangle.y + startRectangle.height - minSize;
    }
    newHeight = minSize;

    // 如果锁定比例，同时调整宽度
    if (lockAspectRatio) {
      const targetWidth = minSize * aspectRatio;
      if (
        handle === ResizeHandle.nw ||
        handle === ResizeHandle.w ||
        handle === ResizeHandle.sw
      ) {
        newX = startRectangle.x + startRectangle.width - targetWidth;
      }
      newWidth = targetWidth;
    }
  }

  return { x: newX, y: newY, width: newWidth, height: newHeight };
}
