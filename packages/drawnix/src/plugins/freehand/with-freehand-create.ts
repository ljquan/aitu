import {
  PlaitBoard,
  Point,
  Transforms,
  distanceBetweenPointAndPoint,
  toHostPoint,
  toViewBoxPoint,
} from '@plait/core';
import { isDrawingMode } from '@plait/common';
import { createFreehandElement, getFreehandPointers } from './utils';
import { Freehand, FreehandShape } from './type';
import { FreehandGenerator } from './freehand.generator';
import { FreehandSmoother } from './smoother';
import { getFreehandSettings } from './freehand-settings';

export const withFreehandCreate = (board: PlaitBoard) => {
  const { pointerDown, pointerMove, pointerUp, globalPointerUp } = board;

  let isDrawing = false;

  let isSnappingStartAndEnd = false;

  let points: Point[] = [];

  let originScreenPoint: Point | null = null;

  const generator = new FreehandGenerator(board);

  const smoother = new FreehandSmoother({
    smoothing: 0.7,
    pressureSensitivity: 0.6,
  });

  let temporaryElement: Freehand | null = null;

  // 获取当前画笔设置
  const getCurrentSettings = () => {
    const settings = getFreehandSettings(board);
    return {
      strokeWidth: settings.strokeWidth,
      strokeColor: settings.strokeColor,
      strokeStyle: settings.strokeStyle,
    };
  };

  const complete = (cancel?: boolean) => {
    if (isDrawing) {
      const pointer = PlaitBoard.getPointer(board) as FreehandShape;
      if (isSnappingStartAndEnd) {
        points.push(points[0]);
      }
      const settings = getCurrentSettings();
      temporaryElement = createFreehandElement(pointer, points, settings);
    }
    if (temporaryElement && !cancel) {
      Transforms.insertNode(board, temporaryElement, [board.children.length]);
    }
    generator?.destroy();
    temporaryElement = null;
    isDrawing = false;
    points = [];
    smoother.reset();
  };

  board.pointerDown = (event: PointerEvent) => {
    const freehandPointers = getFreehandPointers();
    const isFreehandPointer = PlaitBoard.isInPointer(board, freehandPointers);
    if (isFreehandPointer && isDrawingMode(board)) {
      isDrawing = true;
      originScreenPoint = [event.x, event.y];
      const smoothingPoint = smoother.process(originScreenPoint) as Point;
      const point = toViewBoxPoint(
        board,
        toHostPoint(board, smoothingPoint[0], smoothingPoint[1])
      );
      points.push(point);
    }
    pointerDown(event);
  };

  board.pointerMove = (event: PointerEvent) => {
    if (isDrawing) {
      const currentScreenPoint: Point = [event.x, event.y];
      if (
        originScreenPoint &&
        distanceBetweenPointAndPoint(
          originScreenPoint[0],
          originScreenPoint[1],
          currentScreenPoint[0],
          currentScreenPoint[1]
        ) < 8
      ) {
        isSnappingStartAndEnd = true;
      } else {
        isSnappingStartAndEnd = false;
      }
      const smoothingPoint = smoother.process(currentScreenPoint);
      if (smoothingPoint) {
        generator?.destroy();
        const newPoint = toViewBoxPoint(
          board,
          toHostPoint(board, smoothingPoint[0], smoothingPoint[1])
        );
        points.push(newPoint);
        const pointer = PlaitBoard.getPointer(board) as FreehandShape;
        const settings = getCurrentSettings();
        temporaryElement = createFreehandElement(pointer, points, settings);
        generator.processDrawing(
          temporaryElement,
          PlaitBoard.getElementTopHost(board)
        );
      }
      return;
    }

    pointerMove(event);
  };

  board.pointerUp = (event: PointerEvent) => {
    complete();
    pointerUp(event);
  };

  board.globalPointerUp = (event: PointerEvent) => {
    complete(true);
    globalPointerUp(event);
  };

  return board;
};
