/**
 * Frame 容器插件
 *
 * 功能：
 * 1. 注册 Frame 元素渲染组件
 * 2. 处理元素命中检测
 * 3. 管理 Frame-子元素绑定关系（通过 frameId）
 * 4. Frame 移动时同步移动子元素
 * 5. 拖拽元素进出 Frame 时绑定/解绑
 */
import {
  PlaitBoard,
  PlaitPlugin,
  PlaitPluginElementContext,
  Point,
  Transforms,
  RectangleClient,
  PlaitElement,
  Selection,
  getSelectedElements,
  PlaitPointerType,
  BoardTransforms,
  clearSelectedElement,
  addSelectedElement,
  toHostPoint,
  toViewBoxPoint,
  createG,
} from '@plait/core';
import { PlaitFrame, isFrameElement } from '../types/frame.types';
import { FrameComponent } from '../components/frame-element/frame.component';
import {
  FRAME_STROKE_COLOR,
  FRAME_FILL_COLOR,
} from '../components/frame-element/frame.generator';
import {
  getFrameTitleRect,
  isPointInRect,
  createFrameTitleEditor,
} from '../utils/frame-title-utils';
/** Frame 指针类型 */
export const FramePointerType = 'frame' as const;

/** Frame 计数器（用于默认命名） */
let frameCounter = 0;

/**
 * 判断两个矩形是否相交
 */
function isRectIntersect(
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
}

/**
 * 判断元素是否完全在 Frame 内
 */
function isElementInFrame(board: PlaitBoard, element: PlaitElement, frame: PlaitFrame): boolean {
  if (isFrameElement(element)) return false;
  if (!element.points || element.points.length < 2) return false;

  const frameRect = RectangleClient.getRectangleByPoints(frame.points);
  const elementRect = RectangleClient.getRectangleByPoints(element.points);

  return (
    elementRect.x >= frameRect.x &&
    elementRect.y >= frameRect.y &&
    elementRect.x + elementRect.width <= frameRect.x + frameRect.width &&
    elementRect.y + elementRect.height <= frameRect.y + frameRect.height
  );
}

/**
 * Frame 操作变换集
 */
export const FrameTransforms = {
  /**
   * 插入一个新 Frame
   */
  insertFrame(board: PlaitBoard, points: [Point, Point], name?: string): PlaitFrame {
    frameCounter++;
    const frame: PlaitFrame = {
      id: `frame-${Date.now()}`,
      type: 'frame',
      name: name || `Frame ${frameCounter}`,
      points,
      children: [],
    };

    // Frame 应该在最底层渲染（在其他元素之下）
    Transforms.insertNode(board, frame, [0]);

    return frame;
  },

  /**
   * 获取 Frame 的所有子元素
   */
  getFrameChildren(board: PlaitBoard, frame: PlaitFrame): PlaitElement[] {
    return board.children.filter(
      (el) => (el as PlaitElement & { frameId?: string }).frameId === frame.id
    );
  },

  /**
   * 绑定元素到 Frame
   */
  bindToFrame(board: PlaitBoard, element: PlaitElement, frame: PlaitFrame): void {
    const index = board.children.findIndex((el) => el.id === element.id);
    if (index !== -1) {
      Transforms.setNode(board, { frameId: frame.id } as any, [index]);
    }
  },

  /**
   * 解除元素与 Frame 的绑定
   */
  unbindFromFrame(board: PlaitBoard, element: PlaitElement): void {
    const index = board.children.findIndex((el) => el.id === element.id);
    if (index !== -1) {
      Transforms.setNode(board, { frameId: undefined } as any, [index]);
    }
  },

  /**
   * 重命名 Frame
   */
  renameFrame(board: PlaitBoard, frame: PlaitFrame, newName: string): void {
    const index = board.children.findIndex((el) => el.id === frame.id);
    if (index !== -1) {
      Transforms.setNode(board, { name: newName } as any, [index]);
    }
  },

  /**
   * 更新 Frame 的子元素绑定（基于位置）
   */
  updateFrameMembers(board: PlaitBoard, frame: PlaitFrame): void {
    for (const element of board.children) {
      if (element.id === frame.id) continue;
      if (isFrameElement(element)) continue;

      const currentFrameId = (element as PlaitElement & { frameId?: string }).frameId;

      if (isElementInFrame(board, element, frame)) {
        // 元素在 Frame 内且未绑定 → 绑定
        if (currentFrameId !== frame.id) {
          FrameTransforms.bindToFrame(board, element, frame);
        }
      } else {
        // 元素不在 Frame 内但绑定到此 Frame → 解绑
        if (currentFrameId === frame.id) {
          FrameTransforms.unbindFromFrame(board, element);
        }
      }
    }
  },
};

/**
 * Frame 插件
 */
export const withFrame: PlaitPlugin = (board: PlaitBoard) => {
  const {
    drawElement,
    getRectangle,
    isHit,
    isRectangleHit,
    isMovable,
    isAlign,
    afterChange,
    pointerDown,
    pointerMove,
    pointerUp,
    dblClick,
  } = board;

  // 跟踪 Frame 移动
  let movingFrameId: string | null = null;
  let lastFramePoints: [Point, Point] | null = null;

  // 跟踪 Frame 创建
  let isCreatingFrame = false;
  let createStartPoint: Point | null = null;
  let previewG: SVGGElement | null = null;

  // 注册 Frame 元素渲染组件
  board.drawElement = (context: PlaitPluginElementContext) => {
    if (isFrameElement(context.element)) {
      return FrameComponent;
    }
    return drawElement(context);
  };

  // 注册 getRectangle 方法
  board.getRectangle = (element: PlaitElement) => {
    if (isFrameElement(element)) {
      return RectangleClient.getRectangleByPoints(element.points);
    }
    return getRectangle(element);
  };

  // 注册 isHit 方法
  board.isHit = (element: PlaitElement, point: Point, isStrict?: boolean) => {
    if (isFrameElement(element)) {
      const rect = RectangleClient.getRectangleByPoints(element.points);

      // 检查标题区域命中
      const titleRect = getFrameTitleRect(element);
      if (isPointInRect(point, titleRect)) {
        return true;
      }

      // Frame 只在边框区域可点击（内部不拦截点击）
      const borderWidth = 8;
      const outerRect = {
        x: rect.x - borderWidth,
        y: rect.y - borderWidth,
        width: rect.width + borderWidth * 2,
        height: rect.height + borderWidth * 2,
      };
      const innerRect = {
        x: rect.x + borderWidth,
        y: rect.y + borderWidth,
        width: Math.max(0, rect.width - borderWidth * 2),
        height: Math.max(0, rect.height - borderWidth * 2),
      };

      const inOuter = isPointInRect(point, outerRect);
      const inInner = isPointInRect(point, innerRect);

      // 在边框区域内（外矩形内但内矩形外）
      return inOuter && !inInner;
    }
    return isHit(element, point, isStrict);
  };

  // 注册 isRectangleHit 方法（框选命中）
  board.isRectangleHit = (element: PlaitElement, selection: Selection) => {
    if (isFrameElement(element)) {
      const rect = RectangleClient.getRectangleByPoints(element.points);
      const selectionRect = RectangleClient.getRectangleByPoints(selection.ranges[0]);
      return isRectIntersect(rect, selectionRect);
    }
    return isRectangleHit(element, selection);
  };

  // Frame 可移动
  board.isMovable = (element: PlaitElement) => {
    if (isFrameElement(element)) {
      return true;
    }
    return isMovable(element);
  };

  // Frame 可对齐
  board.isAlign = (element: PlaitElement) => {
    if (isFrameElement(element)) {
      return true;
    }
    return isAlign(element);
  };

  // 双击 Frame 或标题：进入标题编辑模式
  board.dblClick = (event: PointerEvent) => {
    const viewBoxPoint = toViewBoxPoint(
      board,
      toHostPoint(board, event.x, event.y)
    ) as Point;

    // 查找是否双击了某个 Frame（标题区域或边框区域）
    for (const element of board.children) {
      if (!isFrameElement(element)) continue;
      const frame = element as PlaitFrame;

      // 检查标题区域
      const titleRect = getFrameTitleRect(frame);
      if (isPointInRect(viewBoxPoint, titleRect)) {
        createFrameTitleEditor(board, frame);
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // 检查边框区域（同 isHit 逻辑）
      const rect = RectangleClient.getRectangleByPoints(frame.points);
      const borderWidth = 8;
      const outerRect = {
        x: rect.x - borderWidth,
        y: rect.y - borderWidth,
        width: rect.width + borderWidth * 2,
        height: rect.height + borderWidth * 2,
      };
      const innerRect = {
        x: rect.x + borderWidth,
        y: rect.y + borderWidth,
        width: Math.max(0, rect.width - borderWidth * 2),
        height: Math.max(0, rect.height - borderWidth * 2),
      };
      if (isPointInRect(viewBoxPoint, outerRect) && !isPointInRect(viewBoxPoint, innerRect)) {
        createFrameTitleEditor(board, frame);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }

    dblClick(event);
  };

  // Frame 创建：指针按下
  board.pointerDown = (event: PointerEvent) => {
    if (board.pointer === FramePointerType) {
      isCreatingFrame = true;
      // 转换坐标到画布坐标系（viewBox 坐标）
      const point = toViewBoxPoint(board, toHostPoint(board, event.x, event.y)) as Point;
      createStartPoint = point;
      return;
    }

    // 记录 Frame 移动前的位置
    const selected = getSelectedElements(board);
    if (selected.length === 1 && isFrameElement(selected[0])) {
      movingFrameId = selected[0].id;
      lastFramePoints = [...(selected[0] as PlaitFrame).points] as [Point, Point];
    }

    pointerDown(event);
  };

  // Frame 创建：指针移动 — 绘制实时预览
  board.pointerMove = (event: PointerEvent) => {
    if (isCreatingFrame && createStartPoint) {
      const currentPoint = toViewBoxPoint(
        board,
        toHostPoint(board, event.x, event.y)
      ) as Point;

      const x1 = Math.min(createStartPoint[0], currentPoint[0]);
      const y1 = Math.min(createStartPoint[1], currentPoint[1]);
      const width = Math.abs(currentPoint[0] - createStartPoint[0]);
      const height = Math.abs(currentPoint[1] - createStartPoint[1]);

      const host = PlaitBoard.getElementHost(board);

      if (!previewG) {
        previewG = createG();
        previewG.classList.add('frame-creating-preview');
        host.appendChild(previewG);
      }

      // 清除旧内容并重绘
      previewG.innerHTML = '';

      const rectEl = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'rect'
      );
      rectEl.setAttribute('x', String(x1));
      rectEl.setAttribute('y', String(y1));
      rectEl.setAttribute('width', String(width));
      rectEl.setAttribute('height', String(height));
      rectEl.setAttribute('rx', '8');
      rectEl.setAttribute('ry', '8');
      rectEl.setAttribute('fill', FRAME_FILL_COLOR);
      rectEl.setAttribute('stroke', FRAME_STROKE_COLOR);
      rectEl.setAttribute('stroke-width', '1.5');
      rectEl.setAttribute('stroke-dasharray', '8 4');
      previewG.appendChild(rectEl);

      return;
    }
    pointerMove(event);
  };

  // Frame 创建：指针松开
  board.pointerUp = (event: PointerEvent) => {
    if (isCreatingFrame && createStartPoint) {
      // 移除预览
      if (previewG) {
        previewG.remove();
        previewG = null;
      }

      const endPoint = toViewBoxPoint(board, toHostPoint(board, event.x, event.y)) as Point;
      if (endPoint) {
        const width = Math.abs(endPoint[0] - createStartPoint[0]);
        const height = Math.abs(endPoint[1] - createStartPoint[1]);

        // 只在拖拽了一定距离时创建 Frame
        if (width > 20 && height > 20) {
          const x1 = Math.min(createStartPoint[0], endPoint[0]);
          const y1 = Math.min(createStartPoint[1], endPoint[1]);
          const x2 = Math.max(createStartPoint[0], endPoint[0]);
          const y2 = Math.max(createStartPoint[1], endPoint[1]);

          const frame = FrameTransforms.insertFrame(board, [
            [x1, y1],
            [x2, y2],
          ]);

          // 自动绑定已在 Frame 区域内的元素
          FrameTransforms.updateFrameMembers(board, frame);

          // 选中新创建的 Frame
          setTimeout(() => {
            const inserted = board.children.find((el) => el.id === frame.id);
            if (inserted) {
              clearSelectedElement(board);
              addSelectedElement(board, inserted);
            }
          }, 50);
        }
      }

      isCreatingFrame = false;
      createStartPoint = null;
      BoardTransforms.updatePointerType(board, PlaitPointerType.selection);
      return;
    }

    pointerUp(event);
  };

  // 监听变化：Frame 移动时同步移动子元素
  board.afterChange = () => {
    if (movingFrameId) {
      const frame = board.children.find((el) => el.id === movingFrameId) as PlaitFrame | undefined;
      if (frame && lastFramePoints) {
        const currentPoints = frame.points;
        const deltaX = currentPoints[0][0] - lastFramePoints[0][0];
        const deltaY = currentPoints[0][1] - lastFramePoints[0][1];

        if (deltaX !== 0 || deltaY !== 0) {
          // 移动所有子元素
          const children = FrameTransforms.getFrameChildren(board, frame);
          for (const child of children) {
            const childIndex = board.children.findIndex((el) => el.id === child.id);
            if (childIndex !== -1 && child.points) {
              const newPoints = child.points.map((p: Point) => [
                p[0] + deltaX,
                p[1] + deltaY,
              ] as Point);
              Transforms.setNode(board, { points: newPoints } as any, [childIndex]);
            }
          }

          lastFramePoints = [...currentPoints] as [Point, Point];
        }
      }
    }

    afterChange();
  };

  // 重写 globalPointerUp 来清理移动状态
  const { globalPointerUp } = board;
  board.globalPointerUp = (event: PointerEvent) => {
    if (movingFrameId) {
      // 移动结束后更新成员关系
      const frame = board.children.find((el) => el.id === movingFrameId) as PlaitFrame | undefined;
      if (frame) {
        FrameTransforms.updateFrameMembers(board, frame);
      }
      movingFrameId = null;
      lastFramePoints = null;
    }

    globalPointerUp(event);
  };

  return board;
};
