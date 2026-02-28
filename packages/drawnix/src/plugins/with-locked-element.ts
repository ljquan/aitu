import { PlaitBoard, PlaitElement, Selection } from '@plait/core';

function isLocked(element: PlaitElement): boolean {
  return !!(element as any).locked;
}

export const withLockedElement = (board: PlaitBoard) => {
  const { isHit, isRectangleHit, isMovable } = board;

  board.isHit = (element: PlaitElement, point: [number, number], isStrict?: boolean) => {
    if (isLocked(element)) {
      return false;
    }
    return isHit(element, point, isStrict);
  };

  board.isRectangleHit = (element: PlaitElement, selection: Selection) => {
    if (isLocked(element)) {
      return false;
    }
    return isRectangleHit(element, selection);
  };

  board.isMovable = (element: PlaitElement) => {
    if (isLocked(element)) {
      return false;
    }
    return isMovable(element);
  };

  return board;
};
