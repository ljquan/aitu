/**
 * Tweet Stub Plugin
 *
 * 用于处理已移除的 Twitter/X 推文功能
 * 提供空组件跳过渲染，防止应用崩溃
 */

import {
  PlaitBoard,
  PlaitPlugin,
  PlaitPluginElementContext,
  PlaitElement,
} from '@plait/core';
import { CommonElementFlavour } from '@plait/common';

/**
 * 判断是否为推文元素
 */
function isTweetElement(element: any): boolean {
  return element && element.type === 'tweet';
}

/**
 * 空组件 - 不渲染任何内容
 */
class EmptyComponent extends CommonElementFlavour<PlaitElement, PlaitBoard> {
  initializeWeakMap(): void {}
  initialize(): void {}
  updateWeakMap(): void {}
  draw(): SVGGElement {
    return document.createElementNS('http://www.w3.org/2000/svg', 'g');
  }
  destroy(): void {}
}

/**
 * Tweet 存根插件 - 返回空组件跳过 tweet 元素渲染
 */
export const withTweetStub: PlaitPlugin = (board: PlaitBoard) => {
  const { drawElement } = board;

  board.drawElement = (context: PlaitPluginElementContext) => {
    if (isTweetElement(context.element)) {
      return EmptyComponent;
    }
    return drawElement(context);
  };

  return board;
};

export default withTweetStub;
