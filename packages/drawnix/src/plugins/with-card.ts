/**
 * Card 标签贴插件
 *
 * 功能：
 * 1. 注册 Card 元素渲染组件
 * 2. 处理元素命中检测
 * 3. 支持拖拽移动、缩放、选中、删除
 */
import {
  PlaitBoard,
  PlaitPlugin,
  PlaitPluginElementContext,
  PlaitElement,
  Selection,
  RectangleClient,
  Point,
  Transforms,
  getSelectedElements,
  addOrCreateClipboardContext,
  WritableClipboardType,
  WritableClipboardOperationType,
  idCreator,
  addSelectedElement,
  clearSelectedElement,
} from '@plait/core';
import { PlaitCard, isCardElement } from '../types/card.types';
import { CardComponent } from '../components/card-element/card.component';
import { getCardColorByIndex } from '../constants/card-colors';

/** Card 计数器（用于默认命名） */
let cardCounter = 0;

/** 生成唯一的 Card ID */
const generateCardId = () => {
  return `card-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
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
 * Card 操作变换集
 */
export const CardTransforms = {
  /**
   * 插入一张新 Card
   */
  insertCard(
    board: PlaitBoard,
    points: [Point, Point],
    body: string,
    title?: string,
    fillColor?: string
  ): PlaitCard {
    cardCounter++;
    const color = fillColor || getCardColorByIndex(cardCounter - 1);
    const card: PlaitCard = {
      id: generateCardId(),
      type: 'card',
      title,
      body,
      fillColor: color,
      points,
      children: [],
    };

    Transforms.insertNode(board, card, [board.children.length]);
    return card;
  },

  /**
   * 更新 Card 的填充颜色
   */
  setFillColor(board: PlaitBoard, card: PlaitCard, fillColor: string): void {
    const index = board.children.findIndex((el) => el.id === card.id);
    if (index !== -1) {
      Transforms.setNode(board, { fillColor } as any, [index]);
    }
  },
};

/**
 * Card 插件
 */
export const withCard: PlaitPlugin = (board: PlaitBoard) => {
  const {
    drawElement,
    getRectangle,
    isHit,
    isRectangleHit,
    isMovable,
    isAlign,
    getDeletedFragment,
    buildFragment,
    insertFragment,
  } = board;

  // 注册 Card 元素渲染组件
  board.drawElement = (context: PlaitPluginElementContext) => {
    if (isCardElement(context.element)) {
      return CardComponent;
    }
    return drawElement(context);
  };

  // 注册 getRectangle 方法
  board.getRectangle = (element: PlaitElement) => {
    if (isCardElement(element)) {
      return RectangleClient.getRectangleByPoints(element.points);
    }
    return getRectangle(element);
  };

  // 注册 isHit 方法（整个卡片区域可点击）
  board.isHit = (element: PlaitElement, point: Point, isStrict?: boolean) => {
    if (isCardElement(element)) {
      const rect = RectangleClient.getRectangleByPoints(element.points);
      return (
        point[0] >= rect.x &&
        point[0] <= rect.x + rect.width &&
        point[1] >= rect.y &&
        point[1] <= rect.y + rect.height
      );
    }
    return isHit(element, point, isStrict);
  };

  // 注册 isRectangleHit 方法（框选命中）
  board.isRectangleHit = (element: PlaitElement, selection: Selection) => {
    if (isCardElement(element)) {
      const rect = RectangleClient.getRectangleByPoints(element.points);
      const selectionRect = RectangleClient.getRectangleByPoints([
        selection.anchor,
        selection.focus,
      ]);
      return isRectIntersect(rect, selectionRect);
    }
    return isRectangleHit(element, selection);
  };

  // Card 可移动
  board.isMovable = (element: PlaitElement) => {
    if (isCardElement(element)) {
      return true;
    }
    return isMovable(element);
  };

  // Card 可对齐
  board.isAlign = (element: PlaitElement) => {
    if (isCardElement(element)) {
      return true;
    }
    return isAlign(element);
  };

  // 支持删除 Card 元素
  board.getDeletedFragment = (data: PlaitElement[]) => {
    const selectedCards = getSelectedElements(board).filter(isCardElement);
    if (selectedCards.length > 0) {
      data.push(...selectedCards);
    }
    return getDeletedFragment(data);
  };

  // 支持复制 Card 元素（buildFragment）
  board.buildFragment = (clipboardContext: any, rectangle: any, operationType: WritableClipboardOperationType, originData?: PlaitElement[]) => {
    const targetElements = originData?.length ? originData : getSelectedElements(board);
    const cardElements = targetElements.filter(isCardElement) as PlaitCard[];

    if (cardElements.length > 0 && rectangle) {
      // 将 Card 的 points 相对于 rectangle 原点进行偏移
      const relativeCards = cardElements.map(card => ({
        ...card,
        points: card.points.map(p => [p[0] - rectangle.x, p[1] - rectangle.y]) as [Point, Point],
      }));

      const addition = {
        text: '',
        type: WritableClipboardType.elements,
        elements: relativeCards,
      };
      clipboardContext = addOrCreateClipboardContext(clipboardContext, addition);
    }

    return buildFragment(clipboardContext, rectangle, operationType, originData);
  };

  // 支持粘贴/复制 Card 元素（insertFragment）
  (board as any).insertFragment = (clipboardData: any, targetPoint: Point, operationType: WritableClipboardOperationType) => {
    if (clipboardData?.elements?.length) {
      const cardElements = clipboardData.elements.filter(isCardElement) as PlaitCard[];
      if (cardElements.length > 0) {
        const insertedCards: PlaitCard[] = [];
        cardElements.forEach(card => {
          const newCard: PlaitCard = {
            ...card,
            id: idCreator(),
            points: card.points.map(p => [targetPoint[0] + p[0], targetPoint[1] + p[1]]) as [Point, Point],
          };
          Transforms.insertNode(board, newCard, [board.children.length]);
          insertedCards.push(newCard);
        });

        // 选中新插入的 Card 元素
        if (insertedCards.length > 0) {
          clearSelectedElement(board);
          insertedCards.forEach(card => addSelectedElement(board, card));
        }
      }
    }

    // 过滤掉 Card 元素，避免下游重复插入
    const nonCardClipboardData = clipboardData?.elements?.length
      ? { ...clipboardData, elements: clipboardData.elements.filter((el: PlaitElement) => !isCardElement(el)) }
      : clipboardData;
    insertFragment(nonCardClipboardData, targetPoint, operationType);
  };

  return board;
};
