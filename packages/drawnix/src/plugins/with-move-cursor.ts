/**
 * With Move Cursor Plugin
 *
 * 当鼠标悬停在可移动的元素上时，将光标变为 move 样式，
 * 提示用户该元素可以拖动移动。
 *
 * 实现原理：
 * 拦截 board.pointerMove，在 selection 模式下通过 getHitElementByPoint
 * 检测鼠标是否位于可移动元素上。命中时给 boardContainer 添加 'element-hover'
 * CSS class，由 CSS 规则设置 cursor: move（通过 :not() 确保 resize 光标优先）。
 */

import {
  PlaitBoard,
  PlaitPlugin,
  PlaitPointerType,
  getHitElementByPoint,
  toHostPoint,
  toViewBoxPoint,
  throttleRAF,
} from '@plait/core';
import { isResizing } from '@plait/common';

const ELEMENT_HOVER_CLASS = 'element-hover';

export const withMoveCursor: PlaitPlugin = (board: PlaitBoard) => {
  const { pointerMove, globalPointerUp } = board;
  let isHovering = false;

  const clearHover = () => {
    if (isHovering) {
      PlaitBoard.getBoardContainer(board).classList.remove(ELEMENT_HOVER_CLASS);
      isHovering = false;
    }
  };

  board.pointerMove = (event: PointerEvent) => {
    // 仅在 selection 模式、非文本编辑、非缩放中检测
    if (
      PlaitBoard.isPointer(board, PlaitPointerType.selection) &&
      !PlaitBoard.hasBeenTextEditing(board) &&
      !PlaitBoard.isReadonly(board) &&
      !isResizing(board)
    ) {
      throttleRAF(board, 'with-move-cursor', () => {
        const point = toViewBoxPoint(
          board,
          toHostPoint(board, event.x, event.y)
        );
        const hitElement = getHitElementByPoint(
          board,
          point,
          (el) => board.isMovable(el)
        );
        if (hitElement) {
          if (!isHovering) {
            PlaitBoard.getBoardContainer(board).classList.add(
              ELEMENT_HOVER_CLASS
            );
            isHovering = true;
          }
        } else {
          clearHover();
        }
      });
    } else {
      clearHover();
    }

    pointerMove(event);
  };

  board.globalPointerUp = (event: PointerEvent) => {
    clearHover();
    globalPointerUp(event);
  };

  return board;
};
