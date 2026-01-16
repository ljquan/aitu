import {
  ClipboardData,
  PlaitBoard,
  PlaitElement,
  Point,
  RectangleClient,
  WritableClipboardContext,
  WritableClipboardOperationType,
  WritableClipboardType,
  addOrCreateClipboardContext,
} from '@plait/core';
import { getSelectedPenPathElements } from './utils';
import { PenPath } from './type';
import { buildClipboardData, insertClipboardData } from '@plait/common';

/**
 * 钢笔工具 Fragment 插件
 * 支持复制、粘贴、删除等剪贴板操作
 */
export const withPenFragment = (baseBoard: PlaitBoard) => {
  const board = baseBoard as PlaitBoard;
  const { getDeletedFragment, buildFragment, insertFragment } = board;

  /**
   * 获取删除时需要包含的元素
   */
  board.getDeletedFragment = (data: PlaitElement[]) => {
    const penPathElements = getSelectedPenPathElements(board);
    if (penPathElements.length) {
      data.push(...penPathElements);
    }
    return getDeletedFragment(data);
  };

  /**
   * 构建剪贴板数据（复制/剪切）
   */
  board.buildFragment = (
    clipboardContext: WritableClipboardContext | null,
    rectangle: RectangleClient | null,
    operationType: WritableClipboardOperationType,
    originData?: PlaitElement[]
  ) => {
    const penPathElements = getSelectedPenPathElements(board);
    if (penPathElements.length) {
      const elements = buildClipboardData(
        board,
        penPathElements,
        rectangle ? [rectangle.x, rectangle.y] : [0, 0]
      );
      clipboardContext = addOrCreateClipboardContext(clipboardContext, {
        text: '',
        type: WritableClipboardType.elements,
        elements,
      });
    }
    return buildFragment(
      clipboardContext,
      rectangle,
      operationType,
      originData
    );
  };

  /**
   * 插入剪贴板数据（粘贴）
   */
  board.insertFragment = (
    clipboardData: ClipboardData | null,
    targetPoint: Point,
    operationType?: WritableClipboardOperationType
  ) => {
    const penPathElements = clipboardData?.elements?.filter((value) =>
      PenPath.isPenPath(value)
    ) as PenPath[];
    if (penPathElements && penPathElements.length > 0) {
      insertClipboardData(board, penPathElements, targetPoint);
    }
    insertFragment(clipboardData, targetPoint, operationType);
  };

  return board;
};
