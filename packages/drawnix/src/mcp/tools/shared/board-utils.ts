/**
 * Board 引用管理工具
 * 
 * 提供统一的 Board 引用管理，供多个 MCP 工具共享使用
 */

import { PlaitBoard } from '@plait/core';

/**
 * Board 引用持有器
 */
let boardRef: PlaitBoard | null = null;

/**
 * 设置 Board 引用
 */
export function setBoard(board: PlaitBoard | null): void {
  boardRef = board;
  // console.log('[BoardUtils] Board reference set:', !!board);
}

/**
 * 获取 Board 引用
 */
export function getBoard(): PlaitBoard | null {
  return boardRef;
}

/**
 * 检查 Board 是否可用
 */
export function isBoardAvailable(): boolean {
  return boardRef !== null;
}

/**
 * 获取 Board 引用，如果不可用则抛出错误
 */
export function requireBoard(): PlaitBoard {
  if (!boardRef) {
    throw new Error('画布未初始化，请先打开画布');
  }
  return boardRef;
}
