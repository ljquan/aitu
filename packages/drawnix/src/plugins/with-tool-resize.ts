/**
 * With Tool Resize Plugin
 *
 * 实现工具元素的拖拽缩放功能
 * 使用 Plait 的 withResize API
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
  getRectangleResizeHandleRefs,
  getRotatedResizeCursorClassByAngle,
  RESIZE_HANDLE_DIAMETER,
} from '@plait/common';
import { PlaitTool } from '../types/toolbox.types';
import { isToolElement } from './with-tool';
import {
  ResizeHandle,
  calculateResizedRect,
  getShiftKeyState,
} from '../utils/resize-utils';

/**
 * 命中测试辅助函数 - 检测点是否在缩放手柄上
 * 参考 @plait/draw 的 getHitRectangleResizeHandleRef 实现
 */
function getHitRectangleResizeHandleRef(
  board: PlaitBoard,
  rectangle: RectangleClient,
  point: Point,
  angle: number = 0
) {
  const centerPoint = RectangleClient.getCenterPoint(rectangle);
  const resizeHandleRefs = getRectangleResizeHandleRefs(
    rectangle,
    RESIZE_HANDLE_DIAMETER
  );

  if (angle) {
    // 如果有旋转角度,需要将点旋转回去再进行碰撞检测
    const rotatedPoint = rotatePoint(point, centerPoint, -angle);
    let result = resizeHandleRefs.find((resizeHandleRef) => {
      return RectangleClient.isHit(
        RectangleClient.getRectangleByPoints([rotatedPoint, rotatedPoint]),
        resizeHandleRef.rectangle
      );
    });
    if (result) {
      // 根据旋转角度调整光标样式
      result.cursorClass = getRotatedResizeCursorClassByAngle(
        result.cursorClass,
        angle
      );
    }
    return result;
  } else {
    return resizeHandleRefs.find((resizeHandleRef) => {
      return RectangleClient.isHit(
        RectangleClient.getRectangleByPoints([point, point]),
        resizeHandleRef.rectangle
      );
    });
  }
}

/**
 * 旋转点 - 简化版实现
 */
function rotatePoint(point: Point, center: Point, angle: number): Point {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const dx = point[0] - center[0];
  const dy = point[1] - center[1];

  return [
    center[0] + dx * cos - dy * sin,
    center[1] + dx * sin + dy * cos,
  ];
}

/**
 * 判断当前选中的元素是否可以缩放
 */
function canResize(board: PlaitBoard): boolean {
  const selectedElements = getSelectedElements(board);

  // 只有当选中单个工具元素时才能缩放
  if (selectedElements.length !== 1) {
    return false;
  }

  return isToolElement(selectedElements[0]);
}

/**
 * 命中测试 - 检测鼠标是否点击到缩放手柄
 */
function hitTest(board: PlaitBoard, point: Point) {
  const selectedElements = getSelectedElements(board);

  if (selectedElements.length !== 1 || !isToolElement(selectedElements[0])) {
    return null;
  }

  const toolElement = selectedElements[0] as PlaitTool;
  const rectangle = RectangleClient.getRectangleByPoints(toolElement.points);
  const angle = toolElement.angle || 0;

  // 检测是否点击到缩放手柄
  const handleRef = getHitRectangleResizeHandleRef(board, rectangle, point, angle);

  if (handleRef) {
    return {
      element: toolElement,
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
  resizeRef: ResizeRef<PlaitTool, ResizeHandle>,
  resizeState: ResizeState
): void {
  const { element, rectangle: startRectangle, handle } = resizeRef;
  const { startPoint, endPoint } = resizeState;

  if (!startRectangle) {
    console.warn('startRectangle is undefined');
    return;
  }

  // 计算拖拽偏移量
  const dx = endPoint[0] - startPoint[0];
  const dy = endPoint[1] - startPoint[1];

  // 使用公共函数计算新矩形，支持 Shift 锁定比例
  const newRect = calculateResizedRect(
    startRectangle,
    handle,
    dx,
    dy,
    getShiftKeyState(), // Shift 键锁定比例
    100 // 最小尺寸
  );

  // 计算新的 points
  const newPoints: [Point, Point] = [
    [newRect.x, newRect.y],
    [newRect.x + newRect.width, newRect.y + newRect.height],
  ];

  // 查找元素路径
  const path = board.children.findIndex((el: any) => el.id === element.id);

  if (path >= 0) {
    // 更新元素的 points
    Transforms.setNode(
      board,
      {
        points: newPoints,
      } as Partial<PlaitTool>,
      [path]
    );
  }
}

/**
 * 工具缩放插件
 *
 * 使用 Plait 的 withResize 高阶函数实现缩放功能
 */
export const withToolResize: PlaitPlugin = (board: PlaitBoard) => {
  // 使用 Plait 的 withResize 高阶函数
  // 它会自动处理:
  // 1. 鼠标悬停时显示对应方向的光标
  // 2. 拖拽时显示缩放预览
  // 3. 缩放过程中的所有交互逻辑
  return withResize<PlaitTool, ResizeHandle>(board, {
    key: 'tool-elements',
    canResize: () => canResize(board),
    hitTest: (point: Point) => hitTest(board, point),
    onResize: (resizeRef, resizeState) => onResize(board, resizeRef, resizeState),
  });
};
