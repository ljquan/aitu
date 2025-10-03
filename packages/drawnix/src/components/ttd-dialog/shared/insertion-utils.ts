import { PlaitBoard, getSelectedElements, getRectangleByElements, Point } from '@plait/core';
import { INSERTION_OFFSET } from './size-constants';

/**
 * 根据保存的选中元素IDs计算插入位置
 */
export const calculateInsertionPointFromIds = (
  board: PlaitBoard | null,
  selectedElementIds: string[]
): Point | undefined => {
  if (!board || selectedElementIds.length === 0) {
    return undefined;
  }

  // 查找对应的元素
  const elements = [];
  for (const id of selectedElementIds) {
    const element = board.children.find((el: any) => el.id === id);
    if (element) {
      elements.push(element);
    }
  }

  if (elements.length === 0) {
    console.warn('No elements found for saved selected element IDs:', selectedElementIds);
    return undefined;
  }

  try {
    // 计算边界矩形
    const boundingRect = getRectangleByElements(board, elements, false);
    
    // 计算几何中心X坐标
    const centerX = boundingRect.x + boundingRect.width / 2;
    
    // 计算底部Y坐标 + 偏移
    const insertionY = boundingRect.y + boundingRect.height + INSERTION_OFFSET;
    
    console.log('Calculated insertion point from saved selection:', { centerX, insertionY, boundingRect });
    
    return [centerX, insertionY] as Point;
  } catch (error) {
    console.warn('Error calculating insertion point from saved selection:', error);
    return undefined;
  }
};

/**
 * 获取当前选中元素的插入点
 */
export const calculateCurrentSelectionInsertionPoint = (board: PlaitBoard | null): Point | undefined => {
  if (!board) return undefined;
  
  const selectedElements = getSelectedElements(board);
  if (selectedElements.length === 0) return undefined;
  
  const elementIds = selectedElements.map(el => el.id);
  return calculateInsertionPointFromIds(board, elementIds);
};