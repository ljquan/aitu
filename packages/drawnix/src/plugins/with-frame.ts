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
import { isElementIntersectingRect } from '../utils/frame-duplicate';
/** Frame 指针类型 */
export const FramePointerType = 'frame' as const;

/** Frame 计数器（用于默认命名） */
let frameCounter = 0;

/** 生成唯一的 Frame ID（避免同毫秒批量创建冲突） */
const generateFrameId = () => {
  return `frame-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
};

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
   * 插入一个新 Frame（始终追加到已有 Frame 列表末尾）
   */
  insertFrame(board: PlaitBoard, points: [Point, Point], name?: string): PlaitFrame {
    frameCounter++;
    const frame: PlaitFrame = {
      id: generateFrameId(),
      type: 'frame',
      name: name || `Frame ${frameCounter}`,
      points,
      children: [],
    };

    let lastFrameIndex = -1;
    for (let i = 0; i < board.children.length; i++) {
      if (isFrameElement(board.children[i])) {
        lastFrameIndex = i;
      }
    }
    const insertIndex = lastFrameIndex + 1;
    Transforms.insertNode(board, frame, [insertIndex]);

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
    getDeletedFragment,
  } = board;

  // 跟踪 Frame 移动
  let movingFrameId: string | null = null;
  let lastFramePoints: [Point, Point] | null = null;
  const movingElementIds: Set<string> = new Set(); // 记录拖动开始时与 Frame 相交的元素 ID

  // 跟踪 Frame 创建
  let isCreatingFrame = false;
  let createStartPoint: Point | null = null;
  let previewG: SVGGElement | null = null;

  // 注册 getDeletedFragment：将选中的 Frame 加入删除列表，并先解绑子元素
  board.getDeletedFragment = (data: PlaitElement[]) => {
    const selectedElements = getSelectedElements(board);
    const selectedFrames = selectedElements.filter(isFrameElement) as PlaitFrame[];
    if (selectedFrames.length) {
      for (const frame of selectedFrames) {
        const children = FrameTransforms.getFrameChildren(board, frame);
        for (const child of children) {
          FrameTransforms.unbindFromFrame(board, child);
        }
      }
      data.push(...selectedFrames);
    }
    return getDeletedFragment(data);
  };

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
      const selectionRect = RectangleClient.getRectangleByPoints([
        selection.anchor,
        selection.focus
      ]);
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
  board.dblClick = (event: MouseEvent) => {
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

      // 记录拖动开始时与 Frame 相交的元素 ID
      movingElementIds.clear();
      const frameRect = RectangleClient.getRectangleByPoints(lastFramePoints);
      board.children.forEach((el) => {
        if (el.id === movingFrameId) return;
        if (isFrameElement(el)) return;
        if (isElementIntersectingRect(el, frameRect)) {
          movingElementIds.add(el.id);
        }
      });
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

  // 监听变化：Frame 移动时同步移动相交的元素
  board.afterChange = () => {
    if (movingFrameId) {
      const frame = board.children.find((el) => el.id === movingFrameId) as PlaitFrame | undefined;
      if (frame && lastFramePoints) {
        const currentPoints = frame.points;
        const deltaX = currentPoints[0][0] - lastFramePoints[0][0];
        const deltaY = currentPoints[0][1] - lastFramePoints[0][1];

        if (deltaX !== 0 || deltaY !== 0) {
          // 只移动拖动开始时就与 Frame 相交的元素（避免移动过程中"吸附"路过的元素）
          const elementsToMove = board.children.filter((el) => {
            return movingElementIds.has(el.id);
          });

          // 移动预先记录的元素
          for (const element of elementsToMove) {
            const elementIndex = board.children.findIndex((el) => el.id === element.id);
            if (elementIndex !== -1) {
              if ((element as any).points) {
                // 有 points 属性的元素
                const newPoints = (element as any).points.map((p: Point) => [
                  p[0] + deltaX,
                  p[1] + deltaY,
                ] as Point);
                Transforms.setNode(board, { points: newPoints } as any, [elementIndex]);
              } else if ((element as any).x !== undefined && (element as any).y !== undefined) {
                // 有 x, y 属性的元素
                Transforms.setNode(
                  board,
                  {
                    x: (element as any).x + deltaX,
                    y: (element as any).y + deltaY,
                  } as any,
                  [elementIndex]
                );
              }
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
      movingElementIds.clear(); // 清理记录的元素 ID
    }

    globalPointerUp(event);
  };

  return board;
};
