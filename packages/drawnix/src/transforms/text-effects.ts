/**
 * 文本特效 Transforms
 * Text Effects Transforms
 */

import { PlaitBoard, Transforms, getSelectedElements } from '@plait/core';
import type { GradientConfig, ShadowEffectConfig, FontConfig } from '../types/text-effects.types';

/**
 * 图层操作 Transforms
 */
export const LayerTransforms = {
  /**
   * 将元素移动到最顶层
   */
  bringToFront(board: PlaitBoard): void {
    const selectedElements = getSelectedElements(board);
    if (selectedElements.length === 0) return;

    const maxIndex = board.children.length - 1;
    
    // 按当前索引排序，从后往前移动
    const elementsWithIndex = selectedElements.map((el) => ({
      element: el,
      index: board.children.findIndex((child) => child.id === el.id),
    })).sort((a, b) => b.index - a.index);

    for (const { element, index } of elementsWithIndex) {
      if (index >= 0 && index < maxIndex) {
        Transforms.moveNode(board, [index], [maxIndex]);
      }
    }
  },

  /**
   * 将元素上移一层
   */
  bringForward(board: PlaitBoard): void {
    const selectedElements = getSelectedElements(board);
    if (selectedElements.length === 0) return;

    const maxIndex = board.children.length - 1;
    
    // 按当前索引排序，从后往前移动
    const elementsWithIndex = selectedElements.map((el) => ({
      element: el,
      index: board.children.findIndex((child) => child.id === el.id),
    })).sort((a, b) => b.index - a.index);

    for (const { element, index } of elementsWithIndex) {
      if (index >= 0 && index < maxIndex) {
        Transforms.moveNode(board, [index], [index + 2]);
      }
    }
  },

  /**
   * 将元素下移一层
   */
  sendBackward(board: PlaitBoard): void {
    const selectedElements = getSelectedElements(board);
    if (selectedElements.length === 0) return;

    // 按当前索引排序，从前往后移动
    const elementsWithIndex = selectedElements.map((el) => ({
      element: el,
      index: board.children.findIndex((child) => child.id === el.id),
    })).sort((a, b) => a.index - b.index);

    for (const { element, index } of elementsWithIndex) {
      if (index > 0) {
        Transforms.moveNode(board, [index], [index - 1]);
      }
    }
  },

  /**
   * 将元素移动到最底层
   */
  sendToBack(board: PlaitBoard): void {
    const selectedElements = getSelectedElements(board);
    if (selectedElements.length === 0) return;

    // 按当前索引排序，从前往后移动
    const elementsWithIndex = selectedElements.map((el) => ({
      element: el,
      index: board.children.findIndex((child) => child.id === el.id),
    })).sort((a, b) => a.index - b.index);

    for (const { element, index } of elementsWithIndex) {
      if (index > 0) {
        Transforms.moveNode(board, [index], [0]);
      }
    }
  },

  /**
   * 获取元素的图层信息
   */
  getLayerInfo(board: PlaitBoard, elementId: string): { index: number; total: number; canMoveUp: boolean; canMoveDown: boolean } | null {
    const index = board.children.findIndex((child) => child.id === elementId);
    if (index < 0) return null;

    const total = board.children.length;
    return {
      index,
      total,
      canMoveUp: index < total - 1,
      canMoveDown: index > 0,
    };
  },
};

/**
 * 文本特效 Transforms
 */
export const TextEffectTransforms = {
  /**
   * 设置元素的字体
   */
  setFont(board: PlaitBoard, fontConfig: FontConfig): void {
    const selectedElements = getSelectedElements(board);
    if (selectedElements.length === 0) return;

    for (const element of selectedElements) {
      const index = board.children.findIndex((child) => child.id === element.id);
      if (index >= 0) {
        Transforms.setNode(board, {
          textEffects: {
            ...(element as any).textEffects,
            font: fontConfig,
          },
        }, [index]);
      }
    }
  },

  /**
   * 设置元素的阴影效果
   */
  setShadow(board: PlaitBoard, shadowConfig: ShadowEffectConfig): void {
    const selectedElements = getSelectedElements(board);
    if (selectedElements.length === 0) return;

    for (const element of selectedElements) {
      const index = board.children.findIndex((child) => child.id === element.id);
      if (index >= 0) {
        Transforms.setNode(board, {
          textEffects: {
            ...(element as any).textEffects,
            shadow: shadowConfig,
          },
        }, [index]);
      }
    }
  },

  /**
   * 设置元素的渐变效果
   */
  setGradient(board: PlaitBoard, gradientConfig: GradientConfig): void {
    const selectedElements = getSelectedElements(board);
    if (selectedElements.length === 0) return;

    for (const element of selectedElements) {
      const index = board.children.findIndex((child) => child.id === element.id);
      if (index >= 0) {
        Transforms.setNode(board, {
          textEffects: {
            ...(element as any).textEffects,
            gradient: gradientConfig,
          },
        }, [index]);
      }
    }
  },

  /**
   * 清除元素的所有特效
   */
  clearEffects(board: PlaitBoard): void {
    const selectedElements = getSelectedElements(board);
    if (selectedElements.length === 0) return;

    for (const element of selectedElements) {
      const index = board.children.findIndex((child) => child.id === element.id);
      if (index >= 0) {
        Transforms.setNode(board, { textEffects: undefined }, [index]);
      }
    }
  },
};
