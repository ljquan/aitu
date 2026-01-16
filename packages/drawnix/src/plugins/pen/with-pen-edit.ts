import { PlaitBoard } from '@plait/core';

/**
 * 钢笔工具编辑插件（简化版）
 * 
 * 当前不需要锚点编辑功能，钢笔路径使用默认的选框缩放逻辑
 */
export const withPenEdit = (board: PlaitBoard) => {
  // 直接返回 board，使用默认的选框缩放逻辑
  return board;
};
