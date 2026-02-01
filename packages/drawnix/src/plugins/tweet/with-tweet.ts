/**
 * Tweet Plugin
 *
 * Twitter/X 推文嵌入插件
 */

import {
  PlaitBoard,
  PlaitPlugin,
  PlaitPluginElementContext,
  Point,
  Transforms,
  RectangleClient,
  PlaitElement,
  Selection,
  ClipboardData,
  WritableClipboardContext,
  WritableClipboardOperationType,
  WritableClipboardType,
  addOrCreateClipboardContext,
  getSelectedElements,
} from '@plait/core';
import {
  CommonElementFlavour,
  ActiveGenerator,
  createActiveGenerator,
  hasResizeHandle,
  buildClipboardData,
  insertClipboardData,
} from '@plait/common';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import {
  PlaitTweet,
  TweetCreateOptions,
  DEFAULT_TWEET_SIZE,
  parseTweetUrl,
} from '../../types/tweet.types';
import { TweetEmbed } from './TweetEmbed';

/**
 * 判断是否为推文元素
 */
export function isTweetElement(element: any): element is PlaitTweet {
  return element && element.type === 'tweet';
}

/**
 * 推文元素组件
 */
export class TweetComponent extends CommonElementFlavour<PlaitTweet, PlaitBoard> {
  private g: SVGGElement | null = null;
  private container: HTMLElement | null = null;
  private reactRoot: Root | null = null;
  activeGenerator!: ActiveGenerator<PlaitTweet>;

  initialize(): void {
    super.initialize();

    // 创建选中状态生成器
    this.activeGenerator = createActiveGenerator(this.board, {
      getRectangle: (element: PlaitTweet) => {
        return RectangleClient.getRectangleByPoints(element.points);
      },
      getStrokeWidth: () => 2,
      getStrokeOpacity: () => 1,
      hasResizeHandle: () => hasResizeHandle(this.board, this.element),
    });

    // 创建 SVG 结构
    this.createSVGStructure();

    // 渲染 React 内容
    this.renderContent();
  }

  /**
   * 创建 SVG foreignObject 结构
   */
  private createSVGStructure(): void {
    const rect = RectangleClient.getRectangleByPoints(this.element.points);

    // 创建 SVG group
    this.g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.g.setAttribute('data-element-id', this.element.id);
    this.g.classList.add('plait-tweet-element');
    this.g.style.pointerEvents = 'auto';

    // 创建 foreignObject
    const foreignObject = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'foreignObject'
    );
    foreignObject.setAttribute('x', String(rect.x));
    foreignObject.setAttribute('y', String(rect.y));
    foreignObject.setAttribute('width', String(rect.width));
    foreignObject.setAttribute('height', String(rect.height));
    foreignObject.style.overflow = 'visible';
    foreignObject.style.pointerEvents = 'auto';

    // 创建 HTML 容器
    this.container = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.pointerEvents = 'auto';
    this.container.style.cursor = 'default';

    foreignObject.appendChild(this.container);
    this.g.appendChild(foreignObject);

    // 添加到 elementG
    const elementG = this.getElementG();
    elementG.appendChild(this.g);
  }

  /**
   * 使用 React 渲染内容
   */
  private renderContent(): void {
    if (!this.container) return;

    this.reactRoot = createRoot(this.container);
    this.reactRoot.render(
      React.createElement(TweetEmbed, {
        tweetId: this.element.tweetId,
        authorHandle: this.element.authorHandle,
        originalUrl: this.element.originalUrl,
        theme: this.element.theme || 'light',
        readonly: false,
      })
    );
  }

  /**
   * 响应元素变化
   */
  onContextChanged(
    value: PlaitPluginElementContext<PlaitTweet, PlaitBoard>,
    previous: PlaitPluginElementContext<PlaitTweet, PlaitBoard>
  ): void {
    // 更新位置和大小
    if (value.element !== previous.element && this.g) {
      const rect = RectangleClient.getRectangleByPoints(value.element.points);
      const foreignObject = this.g.querySelector('foreignObject');
      if (foreignObject) {
        foreignObject.setAttribute('x', String(rect.x));
        foreignObject.setAttribute('y', String(rect.y));
        foreignObject.setAttribute('width', String(rect.width));
        foreignObject.setAttribute('height', String(rect.height));
      }

      // 重新渲染 React 内容（如果 tweetId 或 theme 变化）
      if (
        (value.element.tweetId !== previous.element.tweetId ||
        value.element.theme !== previous.element.theme) &&
        this.reactRoot
      ) {
        this.reactRoot.render(
          React.createElement(TweetEmbed, {
            tweetId: value.element.tweetId,
            authorHandle: value.element.authorHandle,
            originalUrl: value.element.originalUrl,
            theme: value.element.theme || 'light',
            readonly: false,
          })
        );
      }
    }

    // 更新选中状态
    this.activeGenerator.processDrawing(
      this.element,
      PlaitBoard.getActiveHost(this.board),
      { selected: this.selected }
    );
  }

  /**
   * 销毁
   */
  destroy(): void {
    // 从 DOM 中移除 SVG 元素
    if (this.g && this.g.parentNode) {
      this.g.parentNode.removeChild(this.g);
    }

    // 清理 ActiveGenerator
    if (this.activeGenerator) {
      this.activeGenerator.destroy();
    }

    // 异步卸载 React root
    const reactRoot = this.reactRoot;
    if (reactRoot) {
      this.reactRoot = null;
      setTimeout(() => {
        reactRoot.unmount();
      }, 0);
    }

    this.g = null;
    this.container = null;

    super.destroy();
  }
}

/**
 * 获取当前选中的推文元素
 */
function getSelectedTweetElements(board: PlaitBoard): PlaitTweet[] {
  const selectedElements = getSelectedElements(board);
  return selectedElements.filter(isTweetElement);
}

/**
 * 推文插件
 */
export const withTweet: PlaitPlugin = (board: PlaitBoard) => {
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

  // 注册元素渲染
  board.drawElement = (context: PlaitPluginElementContext) => {
    if (context.element.type === 'tweet') {
      return TweetComponent;
    }
    return drawElement(context);
  };

  // 注册 getRectangle
  board.getRectangle = (element: PlaitElement) => {
    if (isTweetElement(element)) {
      return RectangleClient.getRectangleByPoints(element.points);
    }
    return getRectangle(element);
  };

  // 注册 isHit
  board.isHit = (element: PlaitElement, point: Point) => {
    if (isTweetElement(element)) {
      const rect = RectangleClient.getRectangleByPoints(element.points);
      const [x, y] = point;
      return (
        x >= rect.x &&
        x <= rect.x + rect.width &&
        y >= rect.y &&
        y <= rect.y + rect.height
      );
    }
    return isHit(element, point);
  };

  // 注册 isRectangleHit
  board.isRectangleHit = (element: PlaitElement, selection: Selection) => {
    if (isTweetElement(element)) {
      const rect = RectangleClient.getRectangleByPoints(element.points);
      const selectionRect = RectangleClient.getRectangleByPoints([
        selection.anchor,
        selection.focus,
      ]);
      return RectangleClient.isHit(rect, selectionRect);
    }
    return isRectangleHit(element, selection);
  };

  // 注册 isMovable
  board.isMovable = (element: PlaitElement) => {
    if (isTweetElement(element)) {
      return true;
    }
    return isMovable(element);
  };

  // 注册 isAlign
  board.isAlign = (element: PlaitElement) => {
    if (isTweetElement(element)) {
      return true;
    }
    return isAlign(element);
  };

  // 注册 getDeletedFragment - 支持删除
  board.getDeletedFragment = (data: PlaitElement[]) => {
    const tweetElements = getSelectedTweetElements(board);
    if (tweetElements.length) {
      data.push(...tweetElements);
    }
    return getDeletedFragment(data);
  };

  // 注册 buildFragment - 支持复制
  board.buildFragment = (
    clipboardContext: WritableClipboardContext | null,
    rectangle: RectangleClient | null,
    operationType: WritableClipboardOperationType,
    originData?: PlaitElement[]
  ) => {
    const tweetElements = getSelectedTweetElements(board);
    if (tweetElements.length) {
      const elements = buildClipboardData(
        board,
        tweetElements,
        rectangle ? [rectangle.x, rectangle.y] : [0, 0]
      );
      clipboardContext = addOrCreateClipboardContext(clipboardContext, {
        text: '',
        type: WritableClipboardType.elements,
        elements,
      });
    }
    return buildFragment(clipboardContext, rectangle, operationType, originData);
  };

  // 注册 insertFragment - 支持粘贴
  board.insertFragment = (
    clipboardData: ClipboardData | null,
    targetPoint: Point,
    operationType?: WritableClipboardOperationType
  ) => {
    const tweetElements = clipboardData?.elements?.filter((value) =>
      isTweetElement(value)
    ) as PlaitTweet[];
    if (tweetElements && tweetElements.length > 0) {
      insertClipboardData(board, tweetElements, targetPoint);
    }
    insertFragment(clipboardData, targetPoint, operationType);
  };

  return board;
};

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `tweet_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 推文操作 API
 */
export const TweetTransforms = {
  /**
   * 插入推文到画布
   */
  insertTweet(board: PlaitBoard, options: TweetCreateOptions): PlaitTweet | null {
    const {
      position,
      size = DEFAULT_TWEET_SIZE,
      tweetIdOrUrl,
      theme = 'light',
    } = options;

    // 解析 URL 或直接使用 tweet ID
    const parseResult = parseTweetUrl(tweetIdOrUrl);
    if (!parseResult.valid || !parseResult.tweetId) {
      console.error('Invalid Tweet URL or ID:', tweetIdOrUrl);
      return null;
    }

    const tweetElement: PlaitTweet = {
      id: generateId(),
      type: 'tweet',
      points: [position, [position[0] + size.width, position[1] + size.height]],
      angle: 0,
      tweetId: parseResult.tweetId,
      authorHandle: parseResult.authorHandle,
      originalUrl: tweetIdOrUrl.includes('://') ? tweetIdOrUrl : undefined,
      theme,
      createdAt: Date.now(),
    };

    Transforms.insertNode(board, tweetElement, [board.children.length]);

    return tweetElement;
  },

  /**
   * 更新推文
   */
  updateTweet(board: PlaitBoard, elementId: string, tweetIdOrUrl: string): void {
    const parseResult = parseTweetUrl(tweetIdOrUrl);
    if (!parseResult.valid || !parseResult.tweetId) {
      console.error('Invalid Tweet URL or ID:', tweetIdOrUrl);
      return;
    }

    const index = board.children.findIndex((el: any) => el.id === elementId);
    if (index >= 0) {
      Transforms.setNode(
        board,
        {
          tweetId: parseResult.tweetId,
          authorHandle: parseResult.authorHandle,
          originalUrl: tweetIdOrUrl.includes('://') ? tweetIdOrUrl : undefined,
        } as Partial<PlaitTweet>,
        [index]
      );
    }
  },

  /**
   * 更新推文主题
   */
  updateTheme(board: PlaitBoard, elementId: string, theme: 'light' | 'dark'): void {
    const index = board.children.findIndex((el: any) => el.id === elementId);
    if (index >= 0) {
      Transforms.setNode(
        board,
        { theme } as Partial<PlaitTweet>,
        [index]
      );
    }
  },

  /**
   * 删除推文
   */
  removeTweet(board: PlaitBoard, elementId: string): void {
    const index = board.children.findIndex((el: any) => el.id === elementId);
    if (index >= 0) {
      Transforms.removeNode(board, [index]);
    }
  },

  /**
   * 根据 ID 获取推文元素
   */
  getTweetById(board: PlaitBoard, elementId: string): PlaitTweet | null {
    const element = board.children.find((el: any) => el.id === elementId);
    return element && isTweetElement(element) ? element : null;
  },

  /**
   * 获取所有推文元素
   */
  getAllTweets(board: PlaitBoard): PlaitTweet[] {
    return board.children.filter(isTweetElement);
  },
};

export default withTweet;
