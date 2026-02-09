/**
 * With Geometry Min Size Plugin
 *
 * 防止包含文本的几何元素（矩形、文本框等）在缩放时小于文本内容的最小尺寸。
 *
 * 实现原理：
 * 拦截 board.apply 中的 set_node 操作，当检测到 points 变更时，
 * 用 textManage.getSize(undefined, 新宽度) 测量文本在「提议的新宽度」
 * 下实际折行后的高度。如果折行后的文本高度超过新元素的高度，
 * 就把 newProperties.points 回退为 oldProperties.points（保持当前
 * 尺寸不变），同时允许 textHeight 等其他属性正常更新。
 *
 * 安全系数说明：
 * measureElement 使用 ceil(totalWidth / containerWidth) 估算折行数，
 * 但实际 CSS 渲染是逐字符分行的。当容器很窄时（如刚好放 1-2 个字符），
 * 估算值会显著低于实际值（最多低 ~50%）。因此对测量高度乘以 1.5 安全系数。
 */

import {
  PlaitBoard,
  PlaitPlugin,
  PlaitNode,
  RectangleClient,
  Point,
} from '@plait/core';
import {
  PlaitDrawElement,
  isGeometryIncludeText,
} from '@plait/draw';
import { getFirstTextManage } from '@plait/common';

/** 文本与几何形状边框之间的内边距，与 @plait/draw ShapeDefaultSpace.rectangleAndText 一致 */
const SHAPE_TEXT_PADDING = 4;

/** 默认字体大小，与 @plait/text-plugins DEFAULT_FONT_SIZE 一致 */
const DEFAULT_FONT_SIZE = 14;

/**
 * 从元素的 TextManage 中获取实际使用的字体大小
 */
function getFontSizeFromElement(element: unknown): number {
  try {
    const textManage = getFirstTextManage(element as any);
    if (textManage?.foreignObject) {
      const firstChild = textManage.foreignObject.children[0] as Element;
      if (firstChild) {
        const computedStyle = window.getComputedStyle(firstChild);
        const fontSize = parseFloat(computedStyle.fontSize);
        if (fontSize > 0) {
          return fontSize;
        }
      }
    }
  } catch {
    // 静默回退到默认值
  }
  return DEFAULT_FONT_SIZE;
}

export const withGeometryMinSize: PlaitPlugin = (board: PlaitBoard) => {
  const { apply } = board;

  board.apply = (operation) => {
    if (operation.type === 'set_node') {
      const newProps = operation.newProperties as Record<string, unknown>;
      const oldProps = operation.properties as Record<string, unknown>;

      if (newProps?.points && oldProps?.points) {
        try {
          const element = PlaitNode.get(board, operation.path);

          if (
            PlaitDrawElement.isGeometry(element as any) &&
            isGeometryIncludeText(element as any)
          ) {
            const textManage = getFirstTextManage(element as any);

            if (textManage) {
              const newPoints = newProps.points as Point[];
              const newRect = RectangleClient.getRectangleByPoints(newPoints);

              const strokeWidth = PlaitDrawElement.isText(element as any)
                ? 0
                : ((element as any).strokeWidth || 2);
              const horizontalPadding =
                SHAPE_TEXT_PADDING * 2 + strokeWidth * 2;

              // 绝对最小值：至少放一个字符宽，一行高
              const fontSize = getFontSizeFromElement(element);
              const absMinWidth = fontSize + horizontalPadding;
              const absMinHeight = fontSize * 1.4 + horizontalPadding;

              if (
                newRect.width < absMinWidth ||
                newRect.height < absMinHeight
              ) {
                // 小于绝对最小值，直接阻止
                newProps.points = oldProps.points;
              } else {
                // 用提议的新宽度测量文本折行后的实际高度
                const newTextAreaWidth = newRect.width - horizontalPadding;

                if (newTextAreaWidth > 0) {
                  const textSize = textManage.getSize(
                    undefined,
                    newTextAreaWidth
                  );

                  // measureElement 使用 ceil(totalWidth/containerWidth) 估算折行数，
                  // 但 CSS 渲染是逐字符分行的，窄容器下会低估高度（最多 ~50%）。
                  // 乘以 1.5 安全系数来弥补这个误差。
                  const safeTextHeight = textSize.height * 1.5;

                  // 如果折行后的文本高度 > 元素高度，文本会溢出 → 阻止
                  if (safeTextHeight > newRect.height) {
                    newProps.points = oldProps.points;
                  }
                } else {
                  newProps.points = oldProps.points;
                }
              }
            }
          }
        } catch {
          // 静默忽略，不影响正常流程
        }
      }
    }

    apply(operation);
  };

  return board;
};
