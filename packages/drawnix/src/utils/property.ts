import { PlaitBoard, PlaitElement } from '@plait/core';
import {
  isClosedCustomGeometry,
  isClosedDrawElement,
  PlaitDrawElement,
} from '@plait/draw';
import {
  getFillByElement,
  getStrokeColorByElement,
  MindElement,
} from '@plait/mind';
import {
  getFillByElement as getFillByDrawElement,
  getStrokeColorByElement as getStrokeColorByDrawElement,
} from '@plait/draw';
import { getTextMarksByElement } from '@plait/text-plugins';
import { Freehand } from '../plugins/freehand/type';
import { PenPath, PenThemeColors } from '../plugins/pen/type';
import {
  getStrokeColorByElement as getStrokeColorByFreehandElement,
  getFillByElement as getFillByFreehandElement,
} from '../plugins/freehand/utils';
import { getFillRenderColor, isFillConfig } from '../types/fill.types';

export const isClosedElement = (board: PlaitBoard, element: PlaitElement) => {
  return (
    MindElement.isMindElement(board, element) ||
    (PlaitDrawElement.isDrawElement(element) && isClosedDrawElement(element)) ||
    isClosedCustomGeometry(board, element) ||
    Freehand.isFreehand(element) ||
    (PenPath.isPenPath(element) && element.closed)
  );
};

export const getCurrentFill = (board: PlaitBoard, element: PlaitElement) => {
  // 处理 FillConfig 对象，返回可渲染的颜色值
  if (element.fill) {
    if (isFillConfig(element.fill)) {
      return getFillRenderColor(element.fill);
    }
    if (typeof element.fill === 'string') {
      return element.fill;
    }
  }
  
  // 无填充时获取默认值
  let currentFill: string | null = null;
  if (MindElement.isMindElement(board, element)) {
    currentFill = getFillByElement(board, element);
  } else if (Freehand.isFreehand(element)) {
    currentFill = getFillByFreehandElement(board, element);
  } else if (PenPath.isPenPath(element)) {
    // PenPath 使用主题默认填充色
    const themeColors = PenThemeColors[board.theme.themeColorMode];
    currentFill = (element.closed ? themeColors?.fill : 'none') || '#FFFFFF';
  } else if (
    PlaitDrawElement.isDrawElement(element) ||
    PlaitDrawElement.isCustomGeometryElement(board, element)
  ) {
    currentFill = getFillByDrawElement(board, element);
  }
  return currentFill as string;
};

export const getCurrentStrokeColor = (
  board: PlaitBoard,
  element: PlaitElement
) => {
  let strokeColor: string | null = element.strokeColor;
  if (!strokeColor) {
    if (MindElement.isMindElement(board, element)) {
      strokeColor = getStrokeColorByElement(board, element);
    }
    if (Freehand.isFreehand(element)) {
      strokeColor = getStrokeColorByFreehandElement(board, element);
    } else if (PenPath.isPenPath(element)) {
      // PenPath 使用主题默认颜色
      const themeColors = PenThemeColors[board.theme.themeColorMode];
      strokeColor = element.strokeColor || themeColors?.strokeColor || '#000000';
    } else if (
      PlaitDrawElement.isDrawElement(element) ||
      PlaitDrawElement.isCustomGeometryElement(board, element)
    ) {
      strokeColor = getStrokeColorByDrawElement(board, element);
    }
  }
  return strokeColor as string;
};

export const getCurrentFontColor = (
  board: PlaitBoard,
  element: PlaitElement
) => {
  const marks = getTextMarksByElement(element);
  return marks.color;
};
