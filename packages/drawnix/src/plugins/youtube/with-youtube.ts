/**
 * YouTube Plugin
 *
 * YouTube 视频嵌入插件
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
  PlaitYouTube,
  YouTubeCreateOptions,
  DEFAULT_YOUTUBE_SIZE,
  parseYouTubeUrl,
} from '../../types/youtube.types';
import { YouTubeEmbed } from './YouTubeEmbed';

/**
 * 判断是否为 YouTube 元素
 */
export function isYouTubeElement(element: any): element is PlaitYouTube {
  return element && element.type === 'youtube';
}

/**
 * YouTube 元素组件
 */
export class YouTubeComponent extends CommonElementFlavour<PlaitYouTube, PlaitBoard> {
  private g: SVGGElement | null = null;
  private container: HTMLElement | null = null;
  private reactRoot: Root | null = null;
  activeGenerator!: ActiveGenerator<PlaitYouTube>;

  initialize(): void {
    super.initialize();

    // 创建选中状态生成器
    this.activeGenerator = createActiveGenerator(this.board, {
      getRectangle: (element: PlaitYouTube) => {
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
    this.g.classList.add('plait-youtube-element');
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
      React.createElement(YouTubeEmbed, {
        videoId: this.element.videoId,
        title: this.element.title,
        originalUrl: this.element.originalUrl,
        readonly: false,
      })
    );
  }

  /**
   * 响应元素变化
   */
  onContextChanged(
    value: PlaitPluginElementContext<PlaitYouTube, PlaitBoard>,
    previous: PlaitPluginElementContext<PlaitYouTube, PlaitBoard>
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

      // 重新渲染 React 内容（如果 videoId 变化）
      if (value.element.videoId !== previous.element.videoId && this.reactRoot) {
        this.reactRoot.render(
          React.createElement(YouTubeEmbed, {
            videoId: value.element.videoId,
            title: value.element.title,
            originalUrl: value.element.originalUrl,
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
 * 获取当前选中的 YouTube 元素
 */
function getSelectedYouTubeElements(board: PlaitBoard): PlaitYouTube[] {
  const selectedElements = getSelectedElements(board);
  return selectedElements.filter(isYouTubeElement);
}

/**
 * YouTube 插件
 */
export const withYouTube: PlaitPlugin = (board: PlaitBoard) => {
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
    if (context.element.type === 'youtube') {
      return YouTubeComponent;
    }
    return drawElement(context);
  };

  // 注册 getRectangle
  board.getRectangle = (element: PlaitElement) => {
    if (isYouTubeElement(element)) {
      return RectangleClient.getRectangleByPoints(element.points);
    }
    return getRectangle(element);
  };

  // 注册 isHit
  board.isHit = (element: PlaitElement, point: Point) => {
    if (isYouTubeElement(element)) {
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
    if (isYouTubeElement(element)) {
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
    if (isYouTubeElement(element)) {
      return true;
    }
    return isMovable(element);
  };

  // 注册 isAlign
  board.isAlign = (element: PlaitElement) => {
    if (isYouTubeElement(element)) {
      return true;
    }
    return isAlign(element);
  };

  // 注册 getDeletedFragment - 支持删除
  board.getDeletedFragment = (data: PlaitElement[]) => {
    const youtubeElements = getSelectedYouTubeElements(board);
    if (youtubeElements.length) {
      data.push(...youtubeElements);
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
    const youtubeElements = getSelectedYouTubeElements(board);
    if (youtubeElements.length) {
      const elements = buildClipboardData(
        board,
        youtubeElements,
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
    const youtubeElements = clipboardData?.elements?.filter((value) =>
      isYouTubeElement(value)
    ) as PlaitYouTube[];
    if (youtubeElements && youtubeElements.length > 0) {
      insertClipboardData(board, youtubeElements, targetPoint);
    }
    insertFragment(clipboardData, targetPoint, operationType);
  };

  return board;
};

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `youtube_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * YouTube 操作 API
 */
export const YouTubeTransforms = {
  /**
   * 插入 YouTube 视频到画布
   */
  insertYouTube(board: PlaitBoard, options: YouTubeCreateOptions): PlaitYouTube | null {
    const {
      position,
      size = DEFAULT_YOUTUBE_SIZE,
      videoIdOrUrl,
      title,
    } = options;

    // 解析 URL 或直接使用 video ID
    const parseResult = parseYouTubeUrl(videoIdOrUrl);
    if (!parseResult.valid || !parseResult.videoId) {
      console.error('Invalid YouTube URL or video ID:', videoIdOrUrl);
      return null;
    }

    const youtubeElement: PlaitYouTube = {
      id: generateId(),
      type: 'youtube',
      points: [position, [position[0] + size.width, position[1] + size.height]],
      angle: 0,
      videoId: parseResult.videoId,
      title,
      thumbnailUrl: parseResult.thumbnailUrl,
      originalUrl: videoIdOrUrl.includes('://') ? videoIdOrUrl : undefined,
      createdAt: Date.now(),
    };

    Transforms.insertNode(board, youtubeElement, [board.children.length]);

    return youtubeElement;
  },

  /**
   * 更新 YouTube 视频
   */
  updateVideo(board: PlaitBoard, elementId: string, videoIdOrUrl: string, title?: string): void {
    const parseResult = parseYouTubeUrl(videoIdOrUrl);
    if (!parseResult.valid || !parseResult.videoId) {
      console.error('Invalid YouTube URL or video ID:', videoIdOrUrl);
      return;
    }

    const index = board.children.findIndex((el: any) => el.id === elementId);
    if (index >= 0) {
      Transforms.setNode(
        board,
        {
          videoId: parseResult.videoId,
          title,
          thumbnailUrl: parseResult.thumbnailUrl,
          originalUrl: videoIdOrUrl.includes('://') ? videoIdOrUrl : undefined,
        } as Partial<PlaitYouTube>,
        [index]
      );
    }
  },

  /**
   * 删除 YouTube 视频
   */
  removeYouTube(board: PlaitBoard, elementId: string): void {
    const index = board.children.findIndex((el: any) => el.id === elementId);
    if (index >= 0) {
      Transforms.removeNode(board, [index]);
    }
  },

  /**
   * 根据 ID 获取 YouTube 元素
   */
  getYouTubeById(board: PlaitBoard, elementId: string): PlaitYouTube | null {
    const element = board.children.find((el: any) => el.id === elementId);
    return element && isYouTubeElement(element) ? element : null;
  },

  /**
   * 获取所有 YouTube 元素
   */
  getAllYouTubes(board: PlaitBoard): PlaitYouTube[] {
    return board.children.filter(isYouTubeElement);
  },
};

export default withYouTube;
