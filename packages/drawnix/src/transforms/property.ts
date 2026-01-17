import { PropertyTransforms, Alignment, StrokeStyle } from '@plait/common';
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
import { Editor, Transforms as SlateTransforms } from 'slate';
import type {
  FillConfig,
  FillType,
  GradientFillConfig,
  ImageFillConfig,
} from '../types/fill.types';
import { isFillConfig, computeFallbackColor, getGradientPrimaryColor } from '../types/fill.types';

/**
 * 从填充值中提取颜色字符串
 * 支持字符串和 FillConfig 对象
 */
const extractColorFromFill = (fill: string | FillConfig | null | undefined): string | null => {
  if (!fill) return null;
  if (typeof fill === 'string') return fill;
  if (isFillConfig(fill)) {
    if (fill.type === 'solid' && fill.solid) {
      return fill.solid.color;
    }
    // 渐变和图片填充不返回颜色
    return null;
  }
  return null;
};

export const setFillColorOpacity = (board: PlaitBoard, fillOpacity: number) => {
  PropertyTransforms.setFillColor(board, null, {
    getMemorizeKey,
    callback: (element: PlaitElement, path: Path) => {
      if (!isClosedElement(board, element)) {
        return;
      }
      // 直接从 element.fill 获取，可能是 FillConfig
      const rawFill = element.fill;
      const currentFill = extractColorFromFill(rawFill as string | FillConfig) || getCurrentFill(board, element);
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
      // 直接从 element.fill 获取，可能是 FillConfig
      const rawFill = element.fill;
      const currentFillStr = extractColorFromFill(rawFill as string | FillConfig) || getCurrentFill(board, element);
      const currentOpacity = typeof currentFillStr === 'string' ? hexAlphaToOpacity(currentFillStr) : undefined;
      if (isNoColor(fillColor)) {
        Transforms.setNode(board, { fill: 'none' }, path);
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
        Transforms.setNode(board, { strokeColor: 'none' }, path);
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

export const setStrokeStyle = (board: PlaitBoard, strokeStyle: StrokeStyle) => {
  PropertyTransforms.setStrokeStyle(board, strokeStyle, {
    getMemorizeKey,
    callback: (element: PlaitElement, path: Path) => {
      Transforms.setNode(board, { strokeStyle }, path);
    },
  });
};

export const setStrokeWidth = (board: PlaitBoard, strokeWidth: number) => {
  PropertyTransforms.setStrokeWidth(board, strokeWidth, {
    getMemorizeKey,
    callback: (element: PlaitElement, path: Path) => {
      Transforms.setNode(board, { strokeWidth }, path);
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
  // console.log('[setTextFontFamily] textEditors:', textEditors, 'fontFamily:', fontFamily);
  if (textEditors && textEditors.length > 0) {
    textEditors.forEach((editor) => {
      try {
        // 确保有选区
        setSelection(editor);
        // console.log('[setTextFontFamily] Adding mark to editor, selection:', editor.selection);
        Editor.addMark(editor, 'font-family', fontFamily);
        // console.log('[setTextFontFamily] Mark added successfully');
      } catch (error) {
        console.error('Failed to set font family:', error);
      }
    });
  } else {
    // console.warn('[setTextFontFamily] No text editors found');
  }
};

/**
 * 设置文本阴影
 */
export const setTextShadow = (board: PlaitBoard, shadow: string | null) => {
  const textEditors = getTextEditors(board);
  // console.log('[setTextShadow] textEditors:', textEditors, 'shadow:', shadow);
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
    // console.warn('[setTextShadow] No text editors found');
  }
};

/**
 * 设置文本渐变色
 * 使用统一的 text-gradient mark 存储渐变 CSS，在 Leaf 组件中解析渲染
 */
export const setTextGradient = (board: PlaitBoard, gradient: string | null) => {
  const textEditors = getTextEditors(board);
  // console.log('[setTextGradient] textEditors:', textEditors, 'gradient:', gradient);
  if (textEditors && textEditors.length > 0) {
    textEditors.forEach((editor) => {
      try {
        // 确保有选区
        setSelection(editor);
        
        if (gradient) {
          // 使用统一的 text-gradient mark
          Editor.addMark(editor, 'text-gradient', gradient);
        } else {
          Editor.removeMark(editor, 'text-gradient');
        }
      } catch (error) {
        console.error('Failed to set text gradient:', error);
      }
    });
  } else {
    // console.warn('[setTextGradient] No text editors found');
  }
};

/**
 * 设置文本字重
 */
export const setTextFontWeight = (board: PlaitBoard, fontWeight: number | string) => {
  const textEditors = getTextEditors(board);
  if (textEditors && textEditors.length > 0) {
    textEditors.forEach((editor) => {
      try {
        setSelection(editor);
        Editor.addMark(editor, 'font-weight', String(fontWeight));
      } catch (error) {
        console.error('Failed to set font weight:', error);
      }
    });
  }
};

/**
 * 设置文本对齐
 * 使用 Plait 内置的 TextTransforms.setTextAlign 方法
 */
export const setTextAlign = (board: PlaitBoard, textAlign: 'left' | 'center' | 'right') => {
  try {
    // 使用 Plait 的内置方法设置文本对齐
    let alignment: Alignment;
    if (textAlign === 'left') {
      alignment = Alignment.left;
    } else if (textAlign === 'center') {
      alignment = Alignment.center;
    } else {
      alignment = Alignment.right;
    }
    TextTransforms.setTextAlign(board, alignment);
  } catch (error) {
    console.error('Failed to set text align:', error);
  }
};

/**
 * 设置行高
 */
export const setTextLineHeight = (board: PlaitBoard, lineHeight: number | string) => {
  const textEditors = getTextEditors(board);
  if (textEditors && textEditors.length > 0) {
    textEditors.forEach((editor) => {
      try {
        setSelection(editor);
        Editor.addMark(editor, 'line-height', String(lineHeight));
      } catch (error) {
        console.error('Failed to set line height:', error);
      }
    });
  }
};

/**
 * 设置字间距
 */
export const setTextLetterSpacing = (board: PlaitBoard, letterSpacing: number | string) => {
  const textEditors = getTextEditors(board);
  if (textEditors && textEditors.length > 0) {
    textEditors.forEach((editor) => {
      try {
        setSelection(editor);
        // 如果是数字，添加 px 单位
        const value = typeof letterSpacing === 'number' ? `${letterSpacing}px` : letterSpacing;
        Editor.addMark(editor, 'letter-spacing', value);
      } catch (error) {
        console.error('Failed to set letter spacing:', error);
      }
    });
  }
};

/**
 * 获取当前文本的自定义样式 marks
 * 用于属性面板的反显
 */
export const getTextCustomMarks = (board: PlaitBoard): Record<string, any> => {
  const textEditors = getTextEditors(board);
  if (textEditors && textEditors.length > 0) {
    const editor = textEditors[0];
    try {
      // 确保有选区，否则 Editor.marks 会返回 null
      setSelection(editor);
      const marks = Editor.marks(editor);
      // console.log('[getTextCustomMarks] editor.selection:', editor.selection, 'marks:', marks);
      return marks || {};
    } catch (error) {
      console.error('Failed to get text marks:', error);
      return {};
    }
  }
  return {};
};

/**
 * 获取当前段落的对齐方式
 * 用于属性面板的反显
 */
export const getTextAlign = (board: PlaitBoard): 'left' | 'center' | 'right' => {
  const textEditors = getTextEditors(board);

  if (textEditors && textEditors.length > 0) {
    const editor = textEditors[0];
    try {
      const { selection } = editor;

      if (selection) {
        // 获取当前选区的所有节点，查找 ParagraphElement
        const nodes = Array.from(Editor.nodes(editor, {
          at: selection,
          match: n => {
            // 检查是否是段落元素（有 type 属性且为 'paragraph'，或者有 align 属性）
            const hasType = (n as any).type === 'paragraph';
            const hasAlign = 'align' in n;
            const isElement = Editor.isBlock(editor, n);
            return isElement && (hasType || hasAlign);
          }
        }));

        if (nodes.length > 0) {
          const [node] = nodes[0];
          const align = (node as any).align;

          // 如果有 align 属性，返回对应的值
          if (align === Alignment.right || align === 'right') {
            return 'right';
          } else if (align === Alignment.center || align === 'center') {
            return 'center';
          } else if (align === Alignment.left || align === 'left') {
            return 'left';
          }
        }
      }
    } catch (error) {
      console.error('Failed to get text align:', error);
    }
  }
  return 'left';
};

// ============ 填充类型相关 Transform ============

/**
 * 设置渐变填充
 * 
 * 数据存储策略：
 * - element.fill: 存储 fallbackColor（渐变第一个色标颜色），供 Plait 渲染使用
 * - element.fillConfig: 存储完整的 FillConfig 对象，供渐变插件使用
 * 
 * 这样 Plait 库渲染时会正确显示颜色，而不是黑色
 */
export const setGradientFill = (board: PlaitBoard, gradientConfig: GradientFillConfig) => {
  PropertyTransforms.setFillColor(board, null, {
    getMemorizeKey,
    callback: (element: PlaitElement, path: Path) => {
      if (!isClosedElement(board, element)) {
        return;
      }
      const fallbackColor = getGradientPrimaryColor(gradientConfig);
      const fillConfig: FillConfig = {
        type: 'gradient',
        gradient: gradientConfig,
        fallbackColor,
      };
      // fill 存储字符串供 Plait 使用，fillConfig 存储完整配置供插件使用
      Transforms.setNode(board, { 
        fill: fallbackColor, 
        fillConfig 
      }, path);
    },
  });
};

/**
 * 设置图片填充
 */
export const setImageFill = (board: PlaitBoard, imageConfig: ImageFillConfig) => {
  PropertyTransforms.setFillColor(board, null, {
    getMemorizeKey,
    callback: (element: PlaitElement, path: Path) => {
      if (!isClosedElement(board, element)) {
        return;
      }
      const fallbackColor = '#FFFFFF';
      const fillConfig: FillConfig = {
        type: 'image',
        image: imageConfig,
        fallbackColor,
      };
      // fill 存储字符串供 Plait 使用，fillConfig 存储完整配置供插件使用
      Transforms.setNode(board, { 
        fill: fallbackColor, 
        fillConfig 
      }, path);
    },
  });
};

/**
 * 设置填充类型（切换纯色/渐变/图片）
 * 当切换类型时，保留当前类型的配置
 */
export const setFillType = (board: PlaitBoard, fillType: FillType) => {
  PropertyTransforms.setFillColor(board, null, {
    getMemorizeKey,
    callback: (element: PlaitElement, path: Path) => {
      if (!isClosedElement(board, element)) {
        return;
      }
      
      // 获取当前的 fillConfig（如果有）
      const currentFillConfig = (element as any).fillConfig as FillConfig | undefined;
      const currentFill = element.fill;
      
      // 如果当前是相同类型，不做操作
      if (currentFillConfig?.type === fillType) {
        return;
      }
      
      // 根据目标类型创建新的配置
      switch (fillType) {
        case 'solid': {
          // 切换到纯色：清除 fillConfig，只保留 fill 字符串
          let solidColor = '#FFFFFF';
          if (typeof currentFill === 'string' && currentFill !== 'none') {
            solidColor = currentFill;
          } else if (currentFillConfig?.solid) {
            solidColor = currentFillConfig.solid.color;
          }
          // 纯色不需要 fillConfig
          Transforms.setNode(board, { 
            fill: solidColor, 
            fillConfig: undefined 
          }, path);
          break;
        }
          
        case 'gradient': {
          const defaultGradient: GradientFillConfig = {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#FFFFFF' },
              { offset: 1, color: '#000000' },
            ],
          };
          // 如果当前有渐变配置，保留它
          const gradientToUse = currentFillConfig?.gradient || defaultGradient;
          const fallbackColor = getGradientPrimaryColor(gradientToUse);
          const newFillConfig: FillConfig = {
            type: 'gradient',
            gradient: gradientToUse,
            fallbackColor,
          };
          Transforms.setNode(board, { 
            fill: fallbackColor, 
            fillConfig: newFillConfig 
          }, path);
          break;
        }
          
        case 'image': {
          const defaultImage: ImageFillConfig = {
            imageUrl: '',
            mode: 'stretch',
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            rotation: 0,
          };
          const fallbackColor = '#FFFFFF';
          const newFillConfig: FillConfig = {
            type: 'image',
            image: currentFillConfig?.image || defaultImage,
            fallbackColor,
          };
          Transforms.setNode(board, { 
            fill: fallbackColor, 
            fillConfig: newFillConfig 
          }, path);
          break;
        }
          
        default:
          return;
      }
    },
  });
};
