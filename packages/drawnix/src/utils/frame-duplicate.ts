/**
 * Frame 复制工具函数
 *
 * 复制 Frame 及其内部相交的所有元素，并平移到合适位置
 * 后续的 Frame 会自动后移
 */

import {
  PlaitBoard,
  PlaitElement,
  RectangleClient,
  Transforms,
  idCreator,
  clearSelectedElement,
  addSelectedElement,
  BoardTransforms,
} from '@plait/core';
import { PlaitFrame, isFrameElement } from '../types/frame.types';
import { MessagePlugin } from 'tdesign-react';

/**
 * 深度克隆元素并生成新 ID
 */
function deepCloneElement(element: PlaitElement): PlaitElement {
  const cloned = { ...element };
  cloned.id = idCreator();

  if (cloned.children && Array.isArray(cloned.children)) {
    cloned.children = cloned.children.map((child) => deepCloneElement(child as PlaitElement));
  }

  return cloned;
}

/**
 * 判断元素是否与矩形相交
 * @param element 要检测的元素
 * @param rect 矩形区域
 * @returns 是否相交
 */
export function isElementIntersectingRect(element: PlaitElement, rect: RectangleClient): boolean {
  // 获取元素的边界矩形
  let elementRect: RectangleClient | null = null;

  if ((element as any).points) {
    // Frame、线条等有 points 属性的元素
    elementRect = RectangleClient.getRectangleByPoints((element as any).points);
  } else if ((element as any).x !== undefined && (element as any).y !== undefined) {
    // 图片、文本等有 x, y, width, height 的元素
    elementRect = {
      x: (element as any).x,
      y: (element as any).y,
      width: (element as any).width || 0,
      height: (element as any).height || 0,
    };
  }

  if (!elementRect) return false;

  // 判断两个矩形是否相交
  return !(
    elementRect.x + elementRect.width < rect.x ||
    elementRect.x > rect.x + rect.width ||
    elementRect.y + elementRect.height < rect.y ||
    elementRect.y > rect.y + rect.height
  );
}

/**
 * 平移元素坐标
 * @param element 要平移的元素
 * @param dx X 轴偏移量
 * @param dy Y 轴偏移量
 * @returns 平移后的元素
 */
export function translateElement(element: PlaitElement, dx: number, dy: number): PlaitElement {
  const translated = { ...element };

  if ((translated as any).points) {
    // 有 points 属性的元素（Frame、线条等）
    (translated as any).points = (translated as any).points.map((point: [number, number]) => [
      point[0] + dx,
      point[1] + dy,
    ]);
  } else if ((translated as any).x !== undefined && (translated as any).y !== undefined) {
    // 有 x, y 属性的元素（图片、文本等）
    (translated as any).x += dx;
    (translated as any).y += dy;
  }

  // 递归处理子元素
  if (translated.children && Array.isArray(translated.children)) {
    translated.children = translated.children.map((child) =>
      translateElement(child as PlaitElement, dx, dy)
    );
  }

  return translated;
}

/**
 * 判断两个矩形在 Y 轴上是否有重叠（用于判断是否在同一行）
 */
function hasYAxisOverlap(rect1: RectangleClient, rect2: RectangleClient): boolean {
  return rect1.y < rect2.y + rect2.height && rect2.y < rect1.y + rect1.height;
}

/**
 * 检查指定位置的矩形是否与其他 Frame 碰撞
 */
function hasCollisionWithFrames(
  testRect: RectangleClient,
  allFrames: { frame: PlaitFrame; index: number }[],
  excludeFrameId: string
): boolean {
  for (const { frame } of allFrames) {
    if (frame.id === excludeFrameId) continue;
    const rect = RectangleClient.getRectangleByPoints(frame.points);
    // 检查矩形是否相交
    if (
      testRect.x < rect.x + rect.width &&
      testRect.x + testRect.width > rect.x &&
      testRect.y < rect.y + rect.height &&
      testRect.y + testRect.height > rect.y
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 复制 Frame 及其内部元素
 * @param board Plait 画板
 * @param frame 要复制的 Frame
 * @param language 语言（用于提示消息）
 * @returns 复制后的 Frame，如果失败则返回 null
 */
export function duplicateFrame(
  board: PlaitBoard,
  frame: PlaitFrame,
  language: 'zh' | 'en' = 'zh'
): PlaitFrame | null {
  // 找到 Frame 在 board.children 中的索引
  const frameIndex = board.children.findIndex((child) => child.id === frame.id);
  if (frameIndex === -1) {
    MessagePlugin.warning(language === 'zh' ? 'Frame 不存在' : 'Frame not found');
    return null;
  }

  // 只支持根级别 Frame 的复制
  const isRootFrame = board.children[frameIndex] === frame;
  if (!isRootFrame) {
    MessagePlugin.warning(language === 'zh' ? '暂不支持复制嵌套 Frame' : 'Nested Frame duplication not supported');
    return null;
  }

  // 获取当前 Frame 的矩形区域
  const frameRect = RectangleClient.getRectangleByPoints(frame.points);

  // 收集所有根级别的 Frame
  const allRootFrames: { frame: PlaitFrame; index: number }[] = [];
  board.children.forEach((element, index) => {
    if (isFrameElement(element)) {
      allRootFrames.push({ frame: element as PlaitFrame, index });
    }
  });

  // 找到当前 Frame 在根 Frame 列表中的位置
  const currentFrameIndexInList = allRootFrames.findIndex((f) => f.index === frameIndex);

  // 计算平移距离和判断是否需要移动后续 Frame
  let dx = 0;
  let dy = 0;
  let shouldShiftSubsequentFrames = false;

  if (currentFrameIndexInList < allRootFrames.length - 1) {
    // 有下一个 Frame
    const nextFrame = allRootFrames[currentFrameIndexInList + 1].frame;
    const nextFrameRect = RectangleClient.getRectangleByPoints(nextFrame.points);

    // 检查下一个 Frame 是否与当前 Frame 在同一行（Y 轴有重叠）
    const isInSameRow = hasYAxisOverlap(frameRect, nextFrameRect);

    if (isInSameRow) {
      // 在同一行，使用到下一个 Frame 的距离，并标记需要移动后续 Frame
      dx = nextFrameRect.x - frameRect.x;
      dy = nextFrameRect.y - frameRect.y;
      shouldShiftSubsequentFrames = true;
    } else {
      // 不在同一行，尝试放在右侧，如果右侧有碰撞则放在下方
      const padding = 100;
      const rightPosition = {
        x: frameRect.x + frameRect.width + padding,
        y: frameRect.y,
        width: frameRect.width,
        height: frameRect.height,
      };

      if (!hasCollisionWithFrames(rightPosition, allRootFrames, frame.id)) {
        // 右侧无碰撞，放在右侧
        dx = frameRect.width + padding;
        dy = 0;
      } else {
        // 右侧有碰撞，放在下方
        dx = 0;
        dy = frameRect.height + padding;
      }
      shouldShiftSubsequentFrames = false;
    }
  } else {
    // 是最后一个 Frame，使用固定偏移（Frame 宽度 + 100px 间距）
    dx = frameRect.width + 100;
    dy = 0;
    shouldShiftSubsequentFrames = false;
  }

  // 收集所有与 Frame 相交的非 Frame 元素
  const intersectingElements: { element: PlaitElement; index: number }[] = [];
  board.children.forEach((element, index) => {
    if (!isFrameElement(element) && isElementIntersectingRect(element, frameRect)) {
      intersectingElements.push({ element, index });
    }
  });

  // 深度克隆并平移 Frame
  let clonedFrame = deepCloneElement(frame) as PlaitFrame;
  clonedFrame.name = `${frame.name} (${language === 'zh' ? '副本' : 'Copy'})`;
  clonedFrame = translateElement(clonedFrame, dx, dy) as PlaitFrame;

  // 克隆并平移相交的元素
  const clonedElements = intersectingElements.map((item) => {
    let cloned = deepCloneElement(item.element);
    cloned = translateElement(cloned, dx, dy);
    return cloned;
  });

  // 只有在需要移动后续 Frame 时才执行移动逻辑
  if (shouldShiftSubsequentFrames) {
    // 收集需要平移的后续 Frame（只包括与当前 Frame 在同一行的）
    const framesToShift = allRootFrames
      .slice(currentFrameIndexInList + 1)
      .filter(({ frame: f }) => {
        const rect = RectangleClient.getRectangleByPoints(f.points);
        return hasYAxisOverlap(frameRect, rect);
      });

    const elementsToShift: { element: PlaitElement; index: number }[] = [];

    // 先收集所有需要平移的元素（在平移 Frame 之前）
    board.children.forEach((element, index) => {
      if (isFrameElement(element)) return;

      // 检查元素是否与后续任一需要移动的 Frame 相交
      for (const { frame: f } of framesToShift) {
        const rect = RectangleClient.getRectangleByPoints(f.points);
        if (isElementIntersectingRect(element, rect)) {
          elementsToShift.push({ element, index });
          break;
        }
      }
    });

    // 平移后续的同一行 Frame
    for (const { frame: f, index } of framesToShift) {
      const shifted = translateElement(f, dx, dy);
      Transforms.setNode(board, shifted, [index]);
    }

    // 平移收集到的元素
    for (const { element, index } of elementsToShift) {
      const shifted = translateElement(element, dx, dy);
      Transforms.setNode(board, shifted, [index]);
    }
  }

  // 插入克隆的 Frame
  Transforms.insertNode(board, clonedFrame, [frameIndex + 1]);

  // 插入克隆的元素（在 Frame 之后）
  clonedElements.forEach((element, i) => {
    Transforms.insertNode(board, element, [frameIndex + 2 + i]);
  });

  MessagePlugin.success(
    language === 'zh'
      ? `已复制 Frame 及 ${clonedElements.length} 个元素`
      : `Duplicated Frame with ${clonedElements.length} elements`
  );

  return clonedFrame;
}

/**
 * 聚焦到指定的 Frame
 * 选中 Frame 并将视口移动到 Frame 位置
 * @param board Plait 画板
 * @param frame 要聚焦的 Frame
 */
export function focusFrame(board: PlaitBoard, frame: PlaitFrame): void {
  // 选中该 Frame
  clearSelectedElement(board);
  addSelectedElement(board, frame);

  // 计算 Frame 矩形
  const rect = RectangleClient.getRectangleByPoints(frame.points);
  const padding = 80;

  // 获取画布容器尺寸
  const container = PlaitBoard.getBoardContainer(board);
  let viewportWidth = container.clientWidth;
  let viewportHeight = container.clientHeight;

  // 获取左侧抽屉宽度（如果存在）
  const drawer = document.querySelector('.project-drawer');
  const drawerWidth = drawer ? (drawer as HTMLElement).offsetWidth : 0;

  // 获取底部输入框高度（如果存在）
  const inputBar = document.querySelector('.ai-input-bar');
  const inputBarHeight = inputBar ? (inputBar as HTMLElement).offsetHeight : 0;

  // 计算实际可见区域尺寸
  const visibleWidth = viewportWidth - drawerWidth;
  const visibleHeight = viewportHeight - inputBarHeight;

  // 计算缩放比例，让 Frame 适应可见区域
  const scaleX = visibleWidth / (rect.width + padding * 2);
  const scaleY = visibleHeight / (rect.height + padding * 2);
  const zoom = Math.min(scaleX, scaleY, 2);

  // 计算 Frame 中心点
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  // 计算可见区域的中心点（考虑抽屉和输入框的偏移）
  const visibleCenterX = drawerWidth + visibleWidth / 2;
  const visibleCenterY = visibleHeight / 2;

  // 计算 origination：使 Frame 中心对齐可见区域中心
  const origination: [number, number] = [
    centerX - visibleCenterX / zoom,
    centerY - visibleCenterY / zoom,
  ];

  BoardTransforms.updateViewport(board, origination, zoom);
}
