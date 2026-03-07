/**
 * With Text Resize Plugin
 *
 * 实现文本元素的拖拽缩放功能，连带字体大小按比例缩放
 * 参考 text.html demo 的行为：拖动缩放手柄时，文本框和字体一起等比缩放
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
  RESIZE_HANDLE_DIAMETER,
} from '@plait/common';
import { PlaitDrawElement } from '@plait/draw';
import {
  ResizeHandle,
  calculateResizedRect,
} from '../utils/resize-utils';

const DEFAULT_FONT_SIZE = 14;

interface TextNode {
  text?: string;
  'font-size'?: string;
  children?: TextNode[];
  [key: string]: unknown;
}

let originalElement: Record<string, unknown> | null = null;
let originalRectangle: RectangleClient | null = null;

function getHitRectangleResizeHandleRef(
  rectangle: RectangleClient,
  point: Point
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
 * 递归缩放文本节点树中的所有 font-size 值
 * 没有显式 font-size 的叶子节点会用默认值 × scaleFactor
 */
function scaleTextFontSizes(node: TextNode, scaleFactor: number): TextNode {
  const result: TextNode = { ...node };

  if ('text' in node && typeof node.text === 'string') {
    const currentSize = node['font-size']
      ? parseFloat(node['font-size'])
      : DEFAULT_FONT_SIZE;
    const newSize = Math.max(1, Math.round(currentSize * scaleFactor * 10) / 10);
    result['font-size'] = `${newSize}`;
  }

  if (Array.isArray(node.children)) {
    result.children = node.children.map((child) =>
      scaleTextFontSizes(child, scaleFactor)
    );
  }

  return result;
}

function canResize(board: PlaitBoard): boolean {
  const selectedElements = getSelectedElements(board);
  if (selectedElements.length !== 1) return false;
  return PlaitDrawElement.isText(selectedElements[0]);
}

function hitTest(board: PlaitBoard, point: Point) {
  const selectedElements = getSelectedElements(board);
  if (
    selectedElements.length !== 1 ||
    !PlaitDrawElement.isText(selectedElements[0])
  ) {
    return null;
  }

  const element = selectedElements[0] as any;
  const rectangle = RectangleClient.getRectangleByPoints(element.points);
  const handleRef = getHitRectangleResizeHandleRef(rectangle, point);

  if (handleRef) {
    originalElement = JSON.parse(JSON.stringify(element));
    originalRectangle = { ...rectangle };

    return {
      element,
      rectangle,
      handle: handleRef.handle,
      cursorClass: handleRef.cursorClass,
    };
  }

  return null;
}

function onResize(
  board: PlaitBoard,
  resizeRef: ResizeRef<any, ResizeHandle>,
  resizeState: ResizeState
): void {
  const { element, rectangle: startRectangle, handle } = resizeRef;
  const { startPoint, endPoint } = resizeState;

  if (!startRectangle || !originalElement || !originalRectangle) return;

  const dx = endPoint[0] - startPoint[0];
  const dy = endPoint[1] - startPoint[1];

  // 等比缩放：锁定宽高比，确保字体与文本框同步缩放
  const newRect = calculateResizedRect(
    startRectangle,
    handle,
    dx,
    dy,
    true,
    20
  );

  const scaleFactor = newRect.width / originalRectangle.width;
  if (scaleFactor <= 0) return;

  const scaledText = scaleTextFontSizes(
    originalElement.text as TextNode,
    scaleFactor
  );

  const origTextHeight =
    (originalElement.textHeight as number) || DEFAULT_FONT_SIZE * 1.4;
  const newTextHeight = origTextHeight * scaleFactor;

  const newPoints: [Point, Point] = [
    [newRect.x, newRect.y],
    [newRect.x + newRect.width, newRect.y + newRect.height],
  ];

  const path = board.children.findIndex((el: any) => el.id === element.id);
  if (path >= 0) {
    Transforms.setNode(
      board,
      {
        points: newPoints,
        text: scaledText,
        textHeight: newTextHeight,
        autoSize: false,
      } as any,
      [path]
    );
  }
}

export const withTextResize: PlaitPlugin = (board: PlaitBoard) => {
  return withResize<any, ResizeHandle>(board, {
    key: 'text-resize',
    canResize: () => canResize(board),
    hitTest: (point: Point) => hitTest(board, point),
    onResize: (resizeRef, resizeState) =>
      onResize(board, resizeRef, resizeState),
  });
};
