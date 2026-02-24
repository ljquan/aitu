/**
 * With Text Resize Plugin
 *
 * 文本框只能等比缩放（仅角落手柄），缩放时字体大小实时同步变化
 * 同时拦截边缘手柄的点击和 hover 光标，防止 withDrawResize 处理
 * 多选缩放时也同步缩放文本框的字体大小
 */

import {
  PlaitBoard,
  PlaitPlugin,
  Point,
  RectangleClient,
  getSelectedElements,
  getRectangleByElements,
  Transforms,
} from '@plait/core';
import {
  withResize,
  ResizeRef,
  ResizeState,
  getRectangleResizeHandleRefs,
  RESIZE_HANDLE_DIAMETER,
  getRotatedResizeCursorClassByAngle,
  normalizeShapePoints,
} from '@plait/common';
import { PlaitDrawElement, PlaitText, DrawTransforms } from '@plait/draw';
import { DEFAULT_FONT_SIZE } from '@plait/text-plugins';
import { ResizeHandle } from '../utils/resize-utils';

const MIN_BOX_SIZE = 10;
const LINE_HEIGHT_FACTOR = 1.4;
const MIN_TEXT_BOX_HEIGHT = DEFAULT_FONT_SIZE * LINE_HEIGHT_FACTOR;
const EDGE_CURSOR_CLASSES = ['ns-resize', 'ew-resize'];

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

function hitTestAllHandles(
  rectangle: RectangleClient,
  point: Point,
  angle: number = 0
) {
  const refs = getRectangleResizeHandleRefs(rectangle, RESIZE_HANDLE_DIAMETER);
  const testPoint = angle
    ? rotatePoint(point, RectangleClient.getCenterPoint(rectangle), -angle)
    : point;

  const hit = refs.find((r) =>
    RectangleClient.isHit(
      RectangleClient.getRectangleByPoints([testPoint, testPoint]),
      r.rectangle
    )
  );

  if (!hit) return null;
  const handleIndex = parseInt(hit.handle, 10);
  const isCorner = handleIndex < 4;
  const cursorClass = angle
    ? getRotatedResizeCursorClassByAngle(hit.cursorClass, angle)
    : hit.cursorClass;

  return {
    ...hit,
    isCorner,
    cursorClass: isCorner ? cursorClass : undefined,
  };
}

/**
 * 递归缩放文本节点的 font-size
 */
function scaleTextContent(node: any, scaleFactor: number): any {
  if (!node) return node;
  if ('text' in node && typeof node.text === 'string') {
    const cur = node['font-size']
      ? parseFloat(node['font-size'])
      : DEFAULT_FONT_SIZE;
    const next = Math.max(1, parseFloat((cur * scaleFactor).toFixed(1)));
    return { ...node, 'font-size': `${next}` };
  }
  if ('children' in node && Array.isArray(node.children)) {
    return {
      ...node,
      children: node.children.map((c: any) => scaleTextContent(c, scaleFactor)),
    };
  }
  return node;
}

function getSelectedTextElement(board: PlaitBoard): PlaitText | null {
  const sel = getSelectedElements(board);
  if (sel.length === 1 && PlaitDrawElement.isText(sel[0])) {
    return sel[0] as PlaitText;
  }
  return null;
}

interface TextSnapshot {
  width: number;
  height: number;
  text: any;
}

export const withTextResize: PlaitPlugin = (board: PlaitBoard) => {
  let handledBySingleResize = false;
  const textSnapshots = new Map<string, TextSnapshot>();

  withResize<PlaitText, ResizeHandle>(board, {
    key: 'text-resize',
    canResize: () => getSelectedTextElement(board) !== null,
    hitTest: (point: Point) => {
      const el = getSelectedTextElement(board);
      if (!el) return null;
      const rect = getRectangleByElements(board, [el], false);
      const angle = (el as any).angle || 0;
      const hit = hitTestAllHandles(rect, point, angle);
      if (hit) {
        return {
          element: el,
          rectangle: rect,
          handle: hit.handle as unknown as ResizeHandle,
          cursorClass: hit.cursorClass,
        };
      }
      return null;
    },
    onResize: (
      resizeRef: ResizeRef<PlaitText, ResizeHandle>,
      resizeState: ResizeState
    ) => {
      const handleIndex = parseInt(resizeRef.handle as unknown as string, 10);
      if (handleIndex >= 4) return;

      handledBySingleResize = true;
      const { element, rectangle: startRect, handle } = resizeRef;
      const { startPoint, endPoint } = resizeState;
      if (!startRect) return;

      const dx = endPoint[0] - startPoint[0];
      const dy = endPoint[1] - startPoint[1];
      const handleStr = handle as unknown as string;

      const { x, y, width: w, height: h } = startRect;
      const diag = Math.sqrt(w * w + h * h);
      let projDx = dx, projDy = dy;

      switch (handleStr) {
        case '0': projDx = -dx; projDy = -dy; break;
        case '1': projDy = -dy; break;
        case '3': projDx = -dx; break;
      }

      const proj = (projDx * w + projDy * h) / diag;
      // 最小缩放：确保元素不会小于 CSS 行框 strut 高度，防止文本溢出裁切
      const minScale = Math.min(1.0, Math.max(MIN_BOX_SIZE / w, MIN_TEXT_BOX_HEIGHT / h));
      const scale = Math.max(minScale, (diag + proj) / diag);

      const nw = w * scale;
      const nh = h * scale;

      let nx: number, ny: number;
      switch (handleStr) {
        case '0': nx = x + w - nw; ny = y + h - nh; break;
        case '1': nx = x;          ny = y + h - nh; break;
        case '3': nx = x + w - nw; ny = y;          break;
        default:  nx = x;          ny = y;          break;
      }

      const newPoints: [Point, Point] = [[nx, ny], [nx + nw, ny + nh]];
      const path = board.children.findIndex((c: any) => c.id === element.id);
      if (path < 0) return;

      // 必须在同一次 setNode 中同时设置 text，否则 onContextChanged
      // 会用原始 text 去 updateText，在 React 下一帧覆盖掉字体缩放
      const scaledText = element.text
        ? scaleTextContent(element.text, scale)
        : undefined;

      const props: Record<string, any> = {
        points: normalizeShapePoints(newPoints),
        textHeight: nh,
        autoSize: false,
      };
      if (scaledText !== undefined) {
        props.text = scaledText;
      }

      Transforms.setNode(board, props, [path]);
    },
    afterResize: (resizeRef: ResizeRef<PlaitText, ResizeHandle>) => {
      if (!resizeRef) return;
      const path = board.children.findIndex(
        (c: any) => c.id === (resizeRef.element as PlaitText).id
      );
      if (path < 0) return;
      const cur = board.children[path] as PlaitText;
      const curRect = RectangleClient.getRectangleByPoints(cur.points);
      DrawTransforms.resizeGeometry(board, cur.points, curRect.height, [path]);
    },
  });

  // pointerDown: 记录所有选中文本元素的初始状态
  const { pointerDown } = board;
  board.pointerDown = (event: PointerEvent) => {
    textSnapshots.clear();
    handledBySingleResize = false;
    const sel = getSelectedElements(board);
    sel.forEach((el) => {
      if (PlaitDrawElement.isText(el)) {
        const textEl = el as PlaitText;
        const rect = RectangleClient.getRectangleByPoints(textEl.points);
        textSnapshots.set(textEl.id, {
          width: rect.width,
          height: rect.height,
          text: textEl.text,
        });
      }
    });
    pointerDown(event);
  };

  // apply: 拦截框架多选缩放对 text 元素 set_node(points) 的操作，
  // 同步注入字体缩放，确保 points 和 text 在同一操作中更新
  const { apply } = board;
  board.apply = (operation: any) => {
    if (
      operation.type === 'set_node' &&
      textSnapshots.size > 0 &&
      !handledBySingleResize &&
      operation.newProperties?.points &&
      !operation.newProperties?.text
    ) {
      const pathIndex = operation.path?.[0];
      const node = pathIndex != null ? board.children[pathIndex] : null;
      if (node && PlaitDrawElement.isText(node)) {
        const snapshot = textSnapshots.get((node as any).id);
        if (snapshot) {
          const newRect = RectangleClient.getRectangleByPoints(operation.newProperties.points);
          const scale = newRect.width / snapshot.width;
          if (Math.abs(scale - 1) > 0.001 && snapshot.text) {
            const scaledText = scaleTextContent(snapshot.text, scale);
            operation.newProperties = {
              ...operation.newProperties,
              text: scaledText,
              textHeight: newRect.height,
            };
            operation.properties = {
              ...operation.properties,
              text: (node as any).text,
            };
          }
        }
      }
    }
    apply(operation);
  };

  // globalPointerUp: 多选缩放完成后，修正过小元素到最小尺寸（与单选 minScale 一致：宽度不小于 MIN_BOX_SIZE，高度不小于 MIN_TEXT_BOX_HEIGHT）
  const { globalPointerUp } = board;
  board.globalPointerUp = (event: PointerEvent) => {
    globalPointerUp(event);

    if (!handledBySingleResize && textSnapshots.size > 0) {
      textSnapshots.forEach((snapshot, elementId) => {
        const path = board.children.findIndex((c: any) => c.id === elementId);
        if (path < 0) return;
        const cur = board.children[path] as PlaitText;
        const curRect = RectangleClient.getRectangleByPoints(cur.points);

        const scaleW =
          curRect.width >= MIN_BOX_SIZE ? 1 : MIN_BOX_SIZE / curRect.width;
        const scaleH =
          curRect.height >= MIN_TEXT_BOX_HEIGHT
            ? 1
            : MIN_TEXT_BOX_HEIGHT / curRect.height;
        const correction = Math.max(1, scaleW, scaleH);

        if (correction > 1) {
          const newW = curRect.width * correction;
          const newH = curRect.height * correction;
          const cx = curRect.x + curRect.width / 2;
          const cy = curRect.y + curRect.height / 2;
          const correctedPoints: [Point, Point] = [
            [cx - newW / 2, cy - newH / 2],
            [cx + newW / 2, cy + newH / 2],
          ];
          const effectiveScale = newW / snapshot.width;
          const scaledText =
            Math.abs(effectiveScale - 1) > 0.001 && snapshot.text
              ? scaleTextContent(snapshot.text, effectiveScale)
              : cur.text;
          const normalizedPoints = normalizeShapePoints(correctedPoints);
          DrawTransforms.resizeGeometry(board, normalizedPoints, newH, [path]);
          Transforms.setNode(
            board,
            { text: scaledText, autoSize: false } as any,
            [path]
          );
        }
      });
    }

    textSnapshots.clear();
    handledBySingleResize = false;
  };

  // pointerMove: 清除 withDrawResize 为文本元素添加的边缘手柄光标
  const { pointerMove } = board;
  board.pointerMove = (event: PointerEvent) => {
    pointerMove(event);
    if (getSelectedTextElement(board)) {
      requestAnimationFrame(() => {
        if (getSelectedTextElement(board)) {
          const container = PlaitBoard.getBoardContainer(board);
          EDGE_CURSOR_CLASSES.forEach((cls) => container.classList.remove(cls));
        }
      });
    }
  };

  // onChange: 拦截框架异步重新测量文本后对 textHeight 的覆盖
  // 当 autoSize 为 false 时，textHeight 必须始终等于 points 高度，
  // 框架的 TextManage 会在 React 异步重渲染后用测量值覆盖 textHeight，
  // 这里在每次 onChange 中将其纠正回来
  let isFixingTextHeight = false;
  const { onChange } = board;
  board.onChange = () => {
    onChange();
    if (isFixingTextHeight) return;
    isFixingTextHeight = true;
    try {
      for (let i = 0; i < board.children.length; i++) {
        const child = board.children[i];
        if (!PlaitDrawElement.isText(child)) continue;
        const textEl = child as PlaitText;
        if (textEl.autoSize) continue;
        const rect = RectangleClient.getRectangleByPoints(textEl.points);
        if (textEl.textHeight !== undefined && Math.abs(textEl.textHeight - rect.height) > 0.01) {
          Transforms.setNode(board, { textHeight: rect.height } as any, [i]);
        }
      }
    } finally {
      isFixingTextHeight = false;
    }
  };

  return board;
};
