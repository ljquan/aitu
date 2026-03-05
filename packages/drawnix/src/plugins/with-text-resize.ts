/**
 * With Text Resize Plugin
 *
 * 文本框只能等比缩放（仅角落手柄），缩放时字体大小实时同步变化
 * 同时拦截边缘手柄的点击和 hover 光标，防止 withDrawResize 处理
 * 多选缩放时也同步缩放文本框的字体大小
 */

import {
  PlaitBoard,
  PlaitElement,
  PlaitOperation,
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
import {
  calculateScaledTextHeight,
  getMinTextContentSize,
} from '../utils/text-measurement';

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

/** Slate 文本节点结构：含 text/font-size 或 children */
interface SlateTextNode {
  text?: string;
  'font-size'?: string;
  children?: SlateTextNode[];
}

function hitTestAllHandles(
  rectangle: RectangleClient,
  point: Point,
  angle = 0
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
function scaleTextContent(
  node: SlateTextNode | null | undefined,
  scaleFactor: number
): SlateTextNode | null | undefined {
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
      children: node.children
        .map((c) => scaleTextContent(c, scaleFactor))
        .filter((x): x is SlateTextNode => x != null),
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
  text: SlateTextNode | undefined;
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
      const angle = (el as PlaitText & { angle?: number }).angle ?? 0;
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
      
      // 计算缩放后文本内容的实际高度
      const targetScale = (diag + proj) / diag;
      const scaledWidth = w * targetScale;
      const requiredHeight = calculateScaledTextHeight(element.text, scaledWidth, targetScale);
      
      // 最小缩放：确保容器不小于能容纳文字内容的最小尺寸（取内容最小宽高的最大值）
      const minScaleForContent = requiredHeight / h;
      const contentMin = getMinTextContentSize(element.text);
      const minScaleForBox = Math.max(contentMin.width / w, contentMin.height / h);
      const minScale = Math.max(minScaleForContent, minScaleForBox);
      
      const scale = Math.max(minScale, targetScale);

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
      const path = board.children.findIndex(
        (c: PlaitElement) => (c as PlaitDrawElement).id === element.id
      );
      if (path < 0) return;

      // 必须在同一次 setNode 中同时设置 text，否则 onContextChanged
      // 会用原始 text 去 updateText，在 React 下一帧覆盖掉字体缩放
      const scaledText = element.text
        ? scaleTextContent(element.text, scale)
        : undefined;

      const props: Record<string, unknown> = {
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
        (c: PlaitElement) =>
          (c as PlaitDrawElement).id === (resizeRef.element as PlaitText).id
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
  board.apply = (operation: PlaitOperation) => {
    if (
      operation.type === 'set_node' &&
      textSnapshots.size > 0 &&
      !handledBySingleResize &&
      'newProperties' in operation &&
      operation.newProperties &&
      typeof operation.newProperties === 'object' &&
      'points' in operation.newProperties &&
      operation.newProperties.points &&
      !('text' in operation.newProperties && operation.newProperties.text)
    ) {
      const pathIndex = operation.path?.[0];
      const node = pathIndex != null ? board.children[pathIndex] : null;
      if (node && PlaitDrawElement.isText(node)) {
        const textNode = node as PlaitText;
        const snapshot = textSnapshots.get(textNode.id);
        if (snapshot) {
          const newRect = RectangleClient.getRectangleByPoints(
            operation.newProperties.points as [Point, Point]
          );
          const scale = newRect.width / snapshot.width;
          if (Math.abs(scale - 1) > 0.001 && snapshot.text) {
            const scaledText = scaleTextContent(snapshot.text, scale);
            Object.assign(operation.newProperties, {
              text: scaledText ?? undefined,
              textHeight: newRect.height,
            });
            if (operation.properties && typeof operation.properties === 'object') {
              Object.assign(operation.properties, { text: textNode.text });
            }
          }
        }
      }
    }
    apply(operation);
  };

  // globalPointerUp: 多选缩放完成后，修正过小元素到最小尺寸
  const { globalPointerUp } = board;
  board.globalPointerUp = (event: PointerEvent) => {
    globalPointerUp(event);

    if (!handledBySingleResize && textSnapshots.size > 0) {
      textSnapshots.forEach((snapshot, elementId) => {
        const path = board.children.findIndex(
          (c: PlaitElement) => (c as PlaitDrawElement).id === elementId
        );
        if (path < 0) return;
        const cur = board.children[path] as PlaitText;
        const curRect = RectangleClient.getRectangleByPoints(cur.points);

        // 计算当前文本内容实际需要的高度
        const currentScale = curRect.width / snapshot.width;
        const requiredHeight = calculateScaledTextHeight(cur.text, curRect.width, currentScale);
        const contentMin = getMinTextContentSize(cur.text);
        // 修正系数：确保宽高不小于能容纳文字内容的最小尺寸，且高度不小于内容实际需要
        const scaleW =
          curRect.width >= contentMin.width ? 1 : contentMin.width / curRect.width;
        const scaleH =
          curRect.height >= contentMin.height ? 1 : contentMin.height / curRect.height;
        const scaleContent = curRect.height >= requiredHeight ? 1 : requiredHeight / curRect.height;
        const correction = Math.max(1, scaleW, scaleH, scaleContent);

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
            { text: scaledText, autoSize: false } as Partial<PlaitText>,
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
          Transforms.setNode(
            board,
            { textHeight: rect.height } as Partial<PlaitText>,
            [i]
          );
        }
      }
    } finally {
      isFixingTextHeight = false;
    }
  };

  return board;
};
