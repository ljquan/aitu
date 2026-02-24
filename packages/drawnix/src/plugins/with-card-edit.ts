/**
 * With Card Edit Plugin
 *
 * 实现 Card 标签贴的双击编辑功能：
 * - 双击 Card 进入编辑模式（MarkdownEditor 可交互）
 * - 单击 Card 外部退出编辑模式，内容自动保存
 */

import {
  PlaitBoard,
  PlaitPlugin,
  Point,
  RectangleClient,
  toHostPoint,
  toViewBoxPoint,
} from '@plait/core';
import { PlaitCard, isCardElement } from '../types/card.types';
import { CardGenerator } from '../components/card-element/card.generator';

/**
 * 全局存储所有 CardGenerator 实例
 * key: board 实例, value: Map<elementId, CardGenerator>
 */
const cardGenerators = new WeakMap<PlaitBoard, Map<string, CardGenerator>>();

/** 当前处于编辑模式的 Card ID（全局唯一） */
let editingCardId: string | null = null;

/**
 * 注册 CardGenerator 实例（由 CardComponent 调用）
 */
export function registerCardGenerator(
  board: PlaitBoard,
  elementId: string,
  generator: CardGenerator
): void {
  if (!cardGenerators.has(board)) {
    cardGenerators.set(board, new Map());
  }
  cardGenerators.get(board)!.set(elementId, generator);
}

/**
 * 取消注册 CardGenerator 实例（由 CardComponent 销毁时调用）
 */
export function unregisterCardGenerator(
  board: PlaitBoard,
  elementId: string
): void {
  const generators = cardGenerators.get(board);
  if (generators) {
    generators.delete(elementId);
    // 如果正在编辑的 Card 被销毁，清除编辑状态
    if (editingCardId === elementId) {
      editingCardId = null;
    }
  }
}

/**
 * 获取 CardGenerator 实例
 */
function getCardGenerator(
  board: PlaitBoard,
  elementId: string
): CardGenerator | undefined {
  return cardGenerators.get(board)?.get(elementId);
}

/**
 * 退出当前编辑中的 Card
 */
function blurEditingCard(board: PlaitBoard): void {
  if (!editingCardId) return;
  const generator = getCardGenerator(board, editingCardId);
  if (generator) {
    generator.setEditing(false);
  }
  editingCardId = null;
}

/**
 * 进入 Card 编辑模式
 */
function focusCard(board: PlaitBoard, card: PlaitCard): void {
  // 先退出当前编辑
  if (editingCardId && editingCardId !== card.id) {
    blurEditingCard(board);
  }

  const generator = getCardGenerator(board, card.id);
  if (generator) {
    generator.setEditing(true);
    editingCardId = card.id;
  }
}

/**
 * 获取视口坐标下命中的 Card 元素
 */
function getCardAtPoint(board: PlaitBoard, viewBoxPoint: Point): PlaitCard | null {
  for (const element of board.children) {
    if (!isCardElement(element)) continue;
    const card = element as PlaitCard;
    const rect = RectangleClient.getRectangleByPoints(card.points);
    if (
      viewBoxPoint[0] >= rect.x &&
      viewBoxPoint[0] <= rect.x + rect.width &&
      viewBoxPoint[1] >= rect.y &&
      viewBoxPoint[1] <= rect.y + rect.height
    ) {
      return card;
    }
  }
  return null;
}

/**
 * Card 编辑插件
 */
export const withCardEdit: PlaitPlugin = (board: PlaitBoard) => {
  const { dblClick, pointerDown } = board;

  // 双击进入编辑模式
  board.dblClick = (event: MouseEvent) => {
    const viewBoxPoint = toViewBoxPoint(
      board,
      toHostPoint(board, event.x, event.y)
    ) as Point;

    const hitCard = getCardAtPoint(board, viewBoxPoint);
    if (hitCard) {
      focusCard(board, hitCard);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    dblClick(event);
  };

  // 单击外部退出编辑模式
  board.pointerDown = (event: PointerEvent) => {
    if (editingCardId) {
      const viewBoxPoint = toViewBoxPoint(
        board,
        toHostPoint(board, event.clientX, event.clientY)
      ) as Point;

      const hitCard = getCardAtPoint(board, viewBoxPoint);
      // 点击的不是当前编辑的 Card，退出编辑
      if (!hitCard || hitCard.id !== editingCardId) {
        blurEditingCard(board);
      }
    }

    pointerDown(event);
  };

  return board;
};
