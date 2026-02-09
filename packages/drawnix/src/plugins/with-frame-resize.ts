/**
 * With Frame Resize Plugin
 *
 * 实现 Frame 容器的拖拽缩放功能
 * 使用 Plait 的 withResize API（与 with-tool-resize 模式一致）
 */

import {
  PlaitBoard,
  PlaitPlugin,
  Point,
  RectangleClient,
  getSelectedElements,
  Transforms,
} from '@plait/core';
import {
  withResize,
  ResizeRef,
  ResizeState,
  ResizeHandle,
  getRectangleResizeHandleRefs,
  RESIZE_HANDLE_DIAMETER,
} from '@plait/common';
import { PlaitFrame, isFrameElement } from '../types/frame.types';
import {
  calculateResizedRect,
  getShiftKeyState,
} from '../utils/resize-utils';
import { FrameTransforms } from './with-frame';

/**
 * 命中测试辅助函数 - 检测点是否在缩放手柄上
 */
function getHitRectangleResizeHandleRef(
  rectangle: RectangleClient,
  point: Point,
) {
  const resizeHandleRefs = getRectangleResizeHandleRefs(
    rectangle,
    RESIZE_HANDLE_DIAMETER
  );

  return resizeHandleRefs.find((resizeHandleRef) => {
    return RectangleClient.isHit(
      RectangleClient.getRectangleByPoints([point, point]),
      resizeHandleRef.rectangle
    );
  });
}

/**
 * 判断当前选中的元素是否为可缩放的 Frame
 */
function canResize(board: PlaitBoard): boolean {
  const selectedElements = getSelectedElements(board);
  if (selectedElements.length !== 1) {
    return false;
  }
  return isFrameElement(selectedElements[0]);
}

/**
 * 命中测试 - 检测鼠标是否点击到 Frame 的缩放手柄
 */
function hitTest(board: PlaitBoard, point: Point) {
  const selectedElements = getSelectedElements(board);

  if (selectedElements.length !== 1 || !isFrameElement(selectedElements[0])) {
    return null;
  }

  const frame = selectedElements[0] as PlaitFrame;
  const rectangle = RectangleClient.getRectangleByPoints(frame.points);

  const handleRef = getHitRectangleResizeHandleRef(rectangle, point);

  if (handleRef) {
    return {
      element: frame,
      rectangle,
      handle: handleRef.handle,
      cursorClass: handleRef.cursorClass,
    };
  }

  return null;
}

/**
 * 缩放回调 - 当用户拖拽缩放手柄时调用
 */
function onResize(
  board: PlaitBoard,
  resizeRef: ResizeRef<PlaitFrame, ResizeHandle>,
  resizeState: ResizeState
): void {
  const { element, rectangle: startRectangle, handle } = resizeRef;

  if (!startRectangle) {
    return;
  }

  const { startPoint, endPoint } = resizeState;

  const dx = endPoint[0] - startPoint[0];
  const dy = endPoint[1] - startPoint[1];

  // ResizeHandle 值（"0"-"7"）与 calculateResizedRect 兼容
  const newRect = calculateResizedRect(
    startRectangle,
    handle as unknown as string,
    dx,
    dy,
    getShiftKeyState(),
    60 // Frame 最小尺寸
  );

  const newPoints: [Point, Point] = [
    [newRect.x, newRect.y],
    [newRect.x + newRect.width, newRect.y + newRect.height],
  ];

  const path = board.children.findIndex((el: any) => el.id === element.id);

  if (path >= 0) {
    Transforms.setNode(
      board,
      { points: newPoints } as Partial<PlaitFrame>,
      [path]
    );
  }
}

/**
 * 缩放结束回调 - 更新 Frame 子元素绑定
 */
function onResizeEnd(
  board: PlaitBoard,
  resizeRef: ResizeRef<PlaitFrame, ResizeHandle>,
): void {
  const { element } = resizeRef;
  const frame = board.children.find((el) => el.id === element.id) as PlaitFrame | undefined;
  if (frame) {
    FrameTransforms.updateFrameMembers(board, frame);
  }
}

/**
 * Frame 缩放插件
 */
export const withFrameResize: PlaitPlugin = (board: PlaitBoard) => {
  return withResize<PlaitFrame, ResizeHandle>(board, {
    key: 'frame-elements',
    canResize: () => canResize(board),
    hitTest: (point: Point) => hitTest(board, point),
    onResize: (resizeRef, resizeState) => onResize(board, resizeRef, resizeState),
    afterResize: (resizeRef) => onResizeEnd(board, resizeRef),
  });
};
