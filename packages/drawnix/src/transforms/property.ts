import { PropertyTransforms } from '@plait/common';
import {
  isNullOrUndefined,
  Path,
  PlaitBoard,
  PlaitElement,
  Transforms,
} from '@plait/core';
import { getMemorizeKey } from '@plait/draw';
import {
  applyOpacityToHex,
  hexAlphaToOpacity,
  isFullyOpaque,
  isNoColor,
  isValidColor,
  removeHexAlpha,
} from '@aitu/utils';
import {
  getCurrentFill,
  getCurrentStrokeColor,
  isClosedElement,
} from '../utils/property';
import { TextTransforms, FontSizes, setSelection } from '@plait/text-plugins';
import { getTextEditors } from '@plait/common';
import { Editor, Transforms } from 'slate';

export const setFillColorOpacity = (board: PlaitBoard, fillOpacity: number) => {
  PropertyTransforms.setFillColor(board, null, {
    getMemorizeKey,
    callback: (element: PlaitElement, path: Path) => {
      if (!isClosedElement(board, element)) {
        return;
      }
      const currentFill = getCurrentFill(board, element);
      if (!isValidColor(currentFill)) {
        return;
      }
      const currentFillColor = removeHexAlpha(currentFill);
      const newFill = isFullyOpaque(fillOpacity)
        ? currentFillColor
        : applyOpacityToHex(currentFillColor, fillOpacity);
      Transforms.setNode(board, { fill: newFill }, path);
    },
  });
};

export const setFillColor = (board: PlaitBoard, fillColor: string) => {
  PropertyTransforms.setFillColor(board, null, {
    getMemorizeKey,
    callback: (element: PlaitElement, path: Path) => {
      if (!isClosedElement(board, element)) {
        return;
      }
      const currentFill = getCurrentFill(board, element);
      const currentOpacity = hexAlphaToOpacity(currentFill);
      if (isNoColor(fillColor)) {
        Transforms.setNode(board, { fill: null }, path);
      } else {
        if (
          isNullOrUndefined(currentOpacity) ||
          isFullyOpaque(currentOpacity)
        ) {
          Transforms.setNode(board, { fill: fillColor }, path);
        } else {
          Transforms.setNode(
            board,
            { fill: applyOpacityToHex(fillColor, currentOpacity) },
            path
          );
        }
      }
    },
  });
};

export const setStrokeColorOpacity = (
  board: PlaitBoard,
  fillOpacity: number
) => {
  PropertyTransforms.setStrokeColor(board, null, {
    getMemorizeKey,
    callback: (element: PlaitElement, path: Path) => {
      const currentStrokeColor = getCurrentStrokeColor(board, element);
      const currentStrokeColorValue = removeHexAlpha(currentStrokeColor);
      const newStrokeColor = isFullyOpaque(fillOpacity)
        ? currentStrokeColorValue
        : applyOpacityToHex(currentStrokeColorValue, fillOpacity);
      Transforms.setNode(board, { strokeColor: newStrokeColor }, path);
    },
  });
};

export const setStrokeColor = (board: PlaitBoard, newColor: string) => {
  PropertyTransforms.setStrokeColor(board, null, {
    getMemorizeKey,
    callback: (element: PlaitElement, path: Path) => {
      const currentStrokeColor = getCurrentStrokeColor(board, element);
      const currentOpacity = hexAlphaToOpacity(currentStrokeColor);
      if (isNoColor(newColor)) {
        Transforms.setNode(board, { strokeColor: null }, path);
      } else {
        if (
          isNullOrUndefined(currentOpacity) ||
          isFullyOpaque(currentOpacity)
        ) {
          Transforms.setNode(board, { strokeColor: newColor }, path);
        } else {
          Transforms.setNode(
            board,
            { strokeColor: applyOpacityToHex(newColor, currentOpacity) },
            path
          );
        }
      }
    },
  });
};

export const setTextColor = (
  board: PlaitBoard,
  currentColor: string,
  newColor: string
) => {
  const currentOpacity = hexAlphaToOpacity(currentColor);
  if (isNoColor(newColor)) {
    TextTransforms.setTextColor(board, null);
  } else {
    // 如果透明度未定义或为100%，直接使用新颜色
    if (isNullOrUndefined(currentOpacity) || isFullyOpaque(currentOpacity)) {
      TextTransforms.setTextColor(board, newColor);
    } else {
      TextTransforms.setTextColor(
        board,
        applyOpacityToHex(newColor, currentOpacity)
      );
    }
  }
};

export const setTextColorOpacity = (
  board: PlaitBoard,
  currentColor: string,
  opacity: number
) => {
  const currentFontColorValue = removeHexAlpha(currentColor);
  const newFontColor = isFullyOpaque(opacity)
    ? currentFontColorValue
    : applyOpacityToHex(currentFontColorValue, opacity);
  TextTransforms.setTextColor(board, newFontColor);
};

export const setTextFontSize = (
  board: PlaitBoard,
  fontSize: FontSizes
) => {
  // 尝试使用TextTransforms.setFontSize
  try {
    TextTransforms.setFontSize(board, fontSize, 16);
  } catch (error) {
    // 如果失败，尝试直接操作编辑器
    const textEditors = getTextEditors(board);
    if (textEditors && textEditors.length > 0) {
      textEditors.forEach((editor) => {
        try {
          // 直接使用编辑器的addMark方法
          (editor as any).addMark('font-size', fontSize);
        } catch (markError) {
          console.error('Failed to set font size mark:', markError);
        }
      });
    }
  }
};

/**
 * 设置文本字体
 */
export const setTextFontFamily = (board: PlaitBoard, fontFamily: string) => {
  const textEditors = getTextEditors(board);
  console.log('[setTextFontFamily] textEditors:', textEditors, 'fontFamily:', fontFamily);
  if (textEditors && textEditors.length > 0) {
    textEditors.forEach((editor) => {
      try {
        // 确保有选区
        setSelection(editor);
        console.log('[setTextFontFamily] Adding mark to editor, selection:', editor.selection);
        Editor.addMark(editor, 'font-family', fontFamily);
        console.log('[setTextFontFamily] Mark added successfully');
      } catch (error) {
        console.error('Failed to set font family:', error);
      }
    });
  } else {
    console.warn('[setTextFontFamily] No text editors found');
  }
};

/**
 * 设置文本阴影
 */
export const setTextShadow = (board: PlaitBoard, shadow: string | null) => {
  const textEditors = getTextEditors(board);
  console.log('[setTextShadow] textEditors:', textEditors, 'shadow:', shadow);
  if (textEditors && textEditors.length > 0) {
    textEditors.forEach((editor) => {
      try {
        // 确保有选区
        setSelection(editor);
        if (shadow) {
          Editor.addMark(editor, 'text-shadow', shadow);
        } else {
          Editor.removeMark(editor, 'text-shadow');
        }
      } catch (error) {
        console.error('Failed to set text shadow:', error);
      }
    });
  } else {
    console.warn('[setTextShadow] No text editors found');
  }
};

/**
 * 设置文本渐变色
 */
export const setTextGradient = (board: PlaitBoard, gradient: string | null) => {
  const textEditors = getTextEditors(board);
  console.log('[setTextGradient] textEditors:', textEditors, 'gradient:', gradient);
  if (textEditors && textEditors.length > 0) {
    textEditors.forEach((editor) => {
      try {
        // 确保有选区
        setSelection(editor);
        if (gradient) {
          Editor.addMark(editor, 'background', gradient);
          Editor.addMark(editor, '-webkit-background-clip', 'text');
          Editor.addMark(editor, 'background-clip', 'text');
          Editor.addMark(editor, '-webkit-text-fill-color', 'transparent');
        } else {
          Editor.removeMark(editor, 'background');
          Editor.removeMark(editor, '-webkit-background-clip');
          Editor.removeMark(editor, 'background-clip');
          Editor.removeMark(editor, '-webkit-text-fill-color');
        }
      } catch (error) {
        console.error('Failed to set text gradient:', error);
      }
    });
  } else {
    console.warn('[setTextGradient] No text editors found');
  }
};
