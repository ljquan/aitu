/**
 * MultiSelectionHandles
 *
 * 多选时在选区四角渲染缩放控制点
 * 与 withMultiResize 插件配合使用
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  PlaitBoard,
  RectangleClient,
  getSelectedElements,
  getRectangleByElements,
  toHostPointFromViewBoxPoint,
  PlaitElement,
  ATTACHED_ELEMENT_CLASS_NAME,
  isDragging,
  isMovingElements,
  isSelectionMoving,
} from '@plait/core';
import { useBoard } from '@plait-board/react-board';
import { RESIZE_HANDLE_DIAMETER } from '@plait/common';
import { Freehand } from '../../plugins/freehand/type';
import { PenPath } from '../../plugins/pen/type';
import classNames from 'classnames';
import './multi-selection-handles.scss';

/**
 * 检查选中元素是否包含需要特殊处理的类型
 */
function hasCustomResizableElements(elements: PlaitElement[]): boolean {
  const result = elements.some(
    (el) => Freehand.isFreehand(el) || PenPath.isPenPath(el)
  );
  return result;
}

/**
 * 获取多选信息
 */
function getMultiSelectionInfo(board: PlaitBoard): RectangleClient | null {
  const selectedElements = getSelectedElements(board);

  // 需要至少2个元素，且至少包含一个需要特殊处理的元素
  if (selectedElements.length < 2) {
    return null;
  }

  if (!hasCustomResizableElements(selectedElements)) {
    return null;
  }

  try {
    return getRectangleByElements(board, selectedElements, false);
  } catch {
    return null;
  }
}

interface HandlePosition {
  x: number;
  y: number;
  cursor: string;
}

export const MultiSelectionHandles = () => {
  const board = useBoard();
  const [handles, setHandles] = useState<HandlePosition[]>([]);
  const [visible, setVisible] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const isInteractingRef = useRef(false);



  const updateHandles = useCallback(() => {
    // 检查是否正在拖拽或移动
    const interacting = isDragging(board) || isMovingElements(board) || isSelectionMoving(board);
    setIsInteracting(interacting);

    if (interacting) {
      return;
    }

    const selectedElements = getSelectedElements(board);
    const rectangle = getMultiSelectionInfo(board);

    if (!rectangle) {
      setVisible(false);
      return;
    }

    // 获取矩形的四个角点（在画布坐标系中）
    const corners = [
      { x: rectangle.x, y: rectangle.y, cursor: 'nwse-resize' }, // 左上
      { x: rectangle.x + rectangle.width, y: rectangle.y, cursor: 'nesw-resize' }, // 右上
      { x: rectangle.x + rectangle.width, y: rectangle.y + rectangle.height, cursor: 'nwse-resize' }, // 右下
      { x: rectangle.x, y: rectangle.y + rectangle.height, cursor: 'nesw-resize' }, // 左下
    ];

    // 将画布坐标转换为宿主坐标（相对于画布容器）
    const hostCorners = corners.map((corner) => {
      const hostPoint = toHostPointFromViewBoxPoint(board, [corner.x, corner.y]);
      return {
        x: hostPoint[0],
        y: hostPoint[1],
        cursor: corner.cursor,
      };
    });

    setHandles(hostCorners);
    setVisible(true);
  }, [board]);

  useEffect(() => {
    isInteractingRef.current = isInteracting;
  }, [isInteracting]);

  useEffect(() => {
    // 初始更新
    updateHandles();

    // 使用 requestAnimationFrame 来监听变化
    let animationFrameId: number;
    let lastViewport = JSON.stringify(board.viewport);
    let lastSelection = JSON.stringify(board.selection);
    let lastChildrenLength = board.children.length;

    const checkChanges = () => {
      const currentViewport = JSON.stringify(board.viewport);
      const currentSelection = JSON.stringify(board.selection);
      const currentChildrenLength = board.children.length;

      // 检查是否有变化或正在交互
      const interacting = isDragging(board) || isMovingElements(board) || isSelectionMoving(board);

      if (
        currentViewport !== lastViewport ||
        currentSelection !== lastSelection ||
        currentChildrenLength !== lastChildrenLength ||
        interacting !== isInteractingRef.current
      ) {
        lastViewport = currentViewport;
        lastSelection = currentSelection;
        lastChildrenLength = currentChildrenLength;
        updateHandles();
      }

      animationFrameId = requestAnimationFrame(checkChanges);
    };

    animationFrameId = requestAnimationFrame(checkChanges);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [board, updateHandles]);

  // 拖拽或移动时隐藏控制点
  if (!visible || handles.length === 0 || isInteracting) {
    return null;
  }

  const handleSize = RESIZE_HANDLE_DIAMETER;
  const halfSize = handleSize / 2;

  return (
    <div className={classNames('multi-selection-handles', ATTACHED_ELEMENT_CLASS_NAME)}>
      {handles.map((handle, index) => (
        <div
          key={index}
          className="multi-selection-handle"
          style={{
            left: handle.x - halfSize,
            top: handle.y - halfSize,
            width: handleSize,
            height: handleSize,
            cursor: handle.cursor,
          }}
        />
      ))}
    </div>
  );
};
