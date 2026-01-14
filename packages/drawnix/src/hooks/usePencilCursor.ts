/**
 * 画笔/橡皮擦自定义光标 Hook
 * 根据画笔颜色和大小生成动态光标，考虑画布缩放
 */

import { useEffect, useCallback, useRef } from 'react';
import { PlaitBoard } from '@plait/core';
import { getFreehandSettings } from '../plugins/freehand/freehand-settings';
import { FreehandShape } from '../plugins/freehand/type';
import { getFreehandPointers } from '../plugins/freehand/utils';

interface UsePencilCursorOptions {
  board: PlaitBoard | null;
  pointer: string;
}

// 橡皮擦颜色
const ERASER_COLOR = '#f5f5f5';

/**
 * 生成圆形光标的 SVG data URL
 * @param color 颜色
 * @param size 大小（直径），已考虑缩放
 */
function generateCircleCursorSvg(color: string, size: number): string {
  // 限制光标大小范围：最小 4px，最大 256px
  const cursorSize = Math.max(4, Math.min(256, size));
  
  // SVG 画布大小需要比圆点大一些，留出边框空间
  const svgSize = cursorSize + 4;
  const center = svgSize / 2;
  const radius = cursorSize / 2;
  
  // 生成 SVG
  const svg = `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${center}" cy="${center}" r="${radius}" fill="${color}" stroke="#fff" stroke-width="1"/>
    <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="#333" stroke-width="0.5" stroke-opacity="0.5"/>
  </svg>`;
  
  // 转换为 base64 data URL
  const encoded = btoa(svg);
  return `url('data:image/svg+xml;base64,${encoded}') ${center} ${center}, crosshair`;
}

/**
 * 检查当前指针是否为画笔工具（不包括橡皮擦）
 */
function isPencilPointer(pointer: string): boolean {
  const freehandPointers = getFreehandPointers();
  return freehandPointers.includes(pointer as FreehandShape) && 
         pointer !== FreehandShape.eraser;
}

/**
 * 检查当前指针是否为橡皮擦
 */
function isEraserPointer(pointer: string): boolean {
  const result = pointer === FreehandShape.eraser;
  console.log('[Cursor] isEraserPointer check:', { pointer, expected: FreehandShape.eraser, result });
  return result;
}

/**
 * 应用光标样式
 */
function applyCursorStyle(board: PlaitBoard, pointer: string) {
  const boardContainer = document.querySelector('.plait-board-container');
  const hostSvg = boardContainer?.querySelector('.board-host-svg') as HTMLElement | null;
  
  if (!hostSvg) {
    console.log('[Cursor] hostSvg not found');
    return;
  }
  
  const settings = getFreehandSettings(board);
  const zoom = board.viewport?.zoom || 1;
  
  console.log('[Cursor] applyCursorStyle:', {
    pointer,
    isPencil: isPencilPointer(pointer),
    isEraser: isEraserPointer(pointer),
    settings,
    zoom,
  });
  
  if (isPencilPointer(pointer)) {
    // 画笔光标
    const scaledSize = settings.strokeWidth * zoom;
    console.log('[Cursor] Pencil scaledSize:', scaledSize);
    const cursorStyle = generateCircleCursorSvg(settings.strokeColor, scaledSize);
    hostSvg.style.cursor = cursorStyle;
  } else if (isEraserPointer(pointer)) {
    // 橡皮擦光标
    const scaledSize = settings.eraserWidth * zoom;
    console.log('[Cursor] Eraser scaledSize:', scaledSize, 'eraserWidth:', settings.eraserWidth);
    const cursorStyle = generateCircleCursorSvg(ERASER_COLOR, scaledSize);
    hostSvg.style.cursor = cursorStyle;
  } else {
    hostSvg.style.cursor = '';
  }
}

/**
 * 画笔/橡皮擦自定义光标 Hook
 * 当选择画笔或橡皮擦工具时，将光标显示为配置的颜色和大小的圆点
 * 光标大小会根据画布缩放比例自动调整
 */
export function usePencilCursor({ board, pointer }: UsePencilCursorOptions) {
  const lastZoomRef = useRef<number>(1);
  const rafIdRef = useRef<number | null>(null);

  // 应用光标样式到画布
  useEffect(() => {
    console.log('[Cursor] usePencilCursor useEffect triggered:', { board: !!board, pointer });
    if (!board) return;

    applyCursorStyle(board, pointer);
    lastZoomRef.current = board.viewport?.zoom || 1;

    // 监听 viewport 变化（缩放）
    let checkInterval: ReturnType<typeof setInterval> | null = null;
    
    if (isPencilPointer(pointer) || isEraserPointer(pointer)) {
      // 定时检查缩放变化
      checkInterval = setInterval(() => {
        const currentZoom = board.viewport?.zoom || 1;
        if (Math.abs(currentZoom - lastZoomRef.current) > 0.01) {
          lastZoomRef.current = currentZoom;
          applyCursorStyle(board, pointer);
        }
      }, 100);
    }

    return () => {
      if (checkInterval) {
        clearInterval(checkInterval);
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      // 清理时恢复默认光标
      const boardContainer = document.querySelector('.plait-board-container');
      const hostSvg = boardContainer?.querySelector('.board-host-svg') as HTMLElement | null;
      if (hostSvg) {
        hostSvg.style.cursor = '';
      }
    };
  }, [board, pointer]);

  // 返回更新光标的方法，供外部在设置变化时调用
  const updateCursor = useCallback(() => {
    if (!board) return;
    applyCursorStyle(board, pointer);
  }, [board, pointer]);

  return { updateCursor };
}

/**
 * 直接更新画笔光标（用于设置变化时立即更新）
 */
export function updatePencilCursor(board: PlaitBoard, pointer: string) {
  applyCursorStyle(board, pointer);
}

/**
 * 直接更新橡皮擦光标（用于设置变化时立即更新）
 */
export function updateEraserCursor(board: PlaitBoard) {
  applyCursorStyle(board, FreehandShape.eraser);
}
