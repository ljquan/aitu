/**
 * Frame 标题相关工具函数
 *
 * 标题区域命中检测和画布内编辑器
 */
import { PlaitBoard, RectangleClient, Point, Transforms } from '@plait/core';
import { PlaitFrame } from '../types/frame.types';
import {
  FRAME_TITLE_FONT_SIZE,
  FRAME_TITLE_PADDING,
  FRAME_TITLE_OFFSET_Y,
  FRAME_TITLE_HEIGHT,
} from '../components/frame-element/frame.generator';

/**
 * 获取 Frame 标题区域的矩形范围（估算，基于 name 字符数）
 */
export function getFrameTitleRect(
  frame: PlaitFrame
): { x: number; y: number; width: number; height: number } {
  const rect = RectangleClient.getRectangleByPoints(frame.points);
  const name = frame.name || 'Frame';
  // 估算文本宽度：每个字符约 7px（12px font-size, monospace-ish）
  const estimatedCharWidth = FRAME_TITLE_FONT_SIZE * 0.6;
  const textWidth = name.length * estimatedCharWidth;
  return {
    x: rect.x,
    y: rect.y + FRAME_TITLE_OFFSET_Y - FRAME_TITLE_HEIGHT,
    width: textWidth + FRAME_TITLE_PADDING * 2,
    height: FRAME_TITLE_HEIGHT + 4,
  };
}

/**
 * 判断点是否在矩形内
 */
export function isPointInRect(
  point: Point,
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    point[0] >= rect.x &&
    point[0] <= rect.x + rect.width &&
    point[1] >= rect.y &&
    point[1] <= rect.y + rect.height
  );
}

/**
 * 在画布上创建 Frame 标题编辑器（HTML input overlay）
 */
export function createFrameTitleEditor(
  board: PlaitBoard,
  frame: PlaitFrame,
): void {
  const host = PlaitBoard.getHost(board);
  const boardContainer = host.closest('.plait-board-container') as HTMLElement;
  if (!boardContainer) return;

  const rect = RectangleClient.getRectangleByPoints(frame.points);
  const viewport = board.viewport;
  const zoom = viewport?.zoom ?? 1;

  // viewBox 坐标转为屏幕坐标
  const hostRect = host.getBoundingClientRect();
  const viewBox = host.viewBox?.baseVal;
  const viewBoxX = viewBox?.x ?? 0;
  const viewBoxY = viewBox?.y ?? 0;

  const screenX = (rect.x - viewBoxX) * zoom + hostRect.left;
  const screenY =
    (rect.y + FRAME_TITLE_OFFSET_Y - FRAME_TITLE_HEIGHT - viewBoxY) * zoom +
    hostRect.top;

  // 创建编辑容器
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    left: ${screenX}px;
    top: ${screenY}px;
    z-index: 10000;
  `;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = frame.name || 'Frame';
  input.style.cssText = `
    font-size: ${FRAME_TITLE_FONT_SIZE * zoom}px;
    font-family: system-ui, -apple-system, sans-serif;
    color: #333;
    background: white;
    border: 2px solid var(--td-brand-color, #0052d9);
    border-radius: 4px;
    padding: 2px ${FRAME_TITLE_PADDING * zoom}px;
    outline: none;
    min-width: 60px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  `;

  overlay.appendChild(input);
  document.body.appendChild(overlay);

  const commitAndClose = () => {
    const newName = input.value.trim();
    if (newName && newName !== frame.name) {
      const index = board.children.findIndex((el) => el.id === frame.id);
      if (index !== -1) {
        Transforms.setNode(board, { name: newName } as any, [index]);
      }
    }
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  };

  input.addEventListener('blur', commitAndClose);
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      input.value = frame.name || 'Frame';
      input.blur();
    }
    e.stopPropagation();
  });
  // 防止输入事件冒泡到画布
  input.addEventListener('keyup', (e) => e.stopPropagation());
  input.addEventListener('input', (e) => e.stopPropagation());
  input.addEventListener('pointerdown', (e) => e.stopPropagation());

  // 聚焦并选中文本
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}
