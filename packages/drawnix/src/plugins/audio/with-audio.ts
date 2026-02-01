/**
 * Audio Plugin
 *
 * 音频插件 - 支持在画布上嵌入音频播放器
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
  PlaitAudio,
  AudioCreateOptions,
  DEFAULT_AUDIO_SIZE,
  extractAudioTitle,
} from '../../types/audio.types';
import { AudioPlayer } from './AudioPlayer';

/**
 * 判断是否为音频元素
 */
export function isAudioElement(element: any): element is PlaitAudio {
  return element && element.type === 'audio';
}

/**
 * 音频元素组件
 */
export class AudioComponent extends CommonElementFlavour<PlaitAudio, PlaitBoard> {
  private g: SVGGElement | null = null;
  private container: HTMLElement | null = null;
  private reactRoot: Root | null = null;
  activeGenerator!: ActiveGenerator<PlaitAudio>;

  initialize(): void {
    super.initialize();

    // 创建选中状态生成器
    this.activeGenerator = createActiveGenerator(this.board, {
      getRectangle: (element: PlaitAudio) => {
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
    this.g.classList.add('plait-audio-element');
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
   * 播放状态变化处理
   */
  private handlePlayStateChange = (isPlaying: boolean): void => {
    const index = this.board.children.findIndex((el: any) => el.id === this.element.id);
    if (index >= 0) {
      Transforms.setNode(
        this.board,
        { isPlaying } as Partial<PlaitAudio>,
        [index]
      );
    }
  };

  /**
   * 时长获取处理
   */
  private handleDurationChange = (duration: number): void => {
    const index = this.board.children.findIndex((el: any) => el.id === this.element.id);
    if (index >= 0 && !this.element.duration) {
      Transforms.setNode(
        this.board,
        { duration } as Partial<PlaitAudio>,
        [index]
      );
    }
  };

  /**
   * 使用 React 渲染内容
   */
  private renderContent(): void {
    if (!this.container) return;

    this.reactRoot = createRoot(this.container);
    this.reactRoot.render(
      React.createElement(AudioPlayer, {
        url: this.element.url,
        title: this.element.title,
        initialVolume: this.element.volume ?? 0.8,
        readonly: false,
        onPlayStateChange: this.handlePlayStateChange,
        onDurationChange: this.handleDurationChange,
      })
    );
  }

  /**
   * 响应元素变化
   */
  onContextChanged(
    value: PlaitPluginElementContext<PlaitAudio, PlaitBoard>,
    previous: PlaitPluginElementContext<PlaitAudio, PlaitBoard>
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

      // 重新渲染 React 内容（如果 URL 变化）
      if (value.element.url !== previous.element.url && this.reactRoot) {
        this.reactRoot.render(
          React.createElement(AudioPlayer, {
            url: value.element.url,
            title: value.element.title,
            initialVolume: value.element.volume ?? 0.8,
            readonly: false,
            onPlayStateChange: this.handlePlayStateChange,
            onDurationChange: this.handleDurationChange,
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
 * 获取当前选中的音频元素
 */
function getSelectedAudioElements(board: PlaitBoard): PlaitAudio[] {
  const selectedElements = getSelectedElements(board);
  return selectedElements.filter(isAudioElement);
}

/**
 * 音频插件
 */
export const withAudio: PlaitPlugin = (board: PlaitBoard) => {
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
    if (context.element.type === 'audio') {
      return AudioComponent;
    }
    return drawElement(context);
  };

  // 注册 getRectangle
  board.getRectangle = (element: PlaitElement) => {
    if (isAudioElement(element)) {
      return RectangleClient.getRectangleByPoints(element.points);
    }
    return getRectangle(element);
  };

  // 注册 isHit
  board.isHit = (element: PlaitElement, point: Point) => {
    if (isAudioElement(element)) {
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
    if (isAudioElement(element)) {
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
    if (isAudioElement(element)) {
      return true;
    }
    return isMovable(element);
  };

  // 注册 isAlign
  board.isAlign = (element: PlaitElement) => {
    if (isAudioElement(element)) {
      return true;
    }
    return isAlign(element);
  };

  // 注册 getDeletedFragment - 支持删除
  board.getDeletedFragment = (data: PlaitElement[]) => {
    const audioElements = getSelectedAudioElements(board);
    if (audioElements.length) {
      data.push(...audioElements);
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
    const audioElements = getSelectedAudioElements(board);
    if (audioElements.length) {
      const elements = buildClipboardData(
        board,
        audioElements,
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
    const audioElements = clipboardData?.elements?.filter((value) =>
      isAudioElement(value)
    ) as PlaitAudio[];
    if (audioElements && audioElements.length > 0) {
      insertClipboardData(board, audioElements, targetPoint);
    }
    insertFragment(clipboardData, targetPoint, operationType);
  };

  return board;
};

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `audio_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 音频操作 API
 */
export const AudioTransforms = {
  /**
   * 插入音频到画布
   */
  insertAudio(board: PlaitBoard, options: AudioCreateOptions): PlaitAudio {
    const {
      position,
      size = DEFAULT_AUDIO_SIZE,
      url,
      title,
      duration,
    } = options;

    const audioElement: PlaitAudio = {
      id: generateId(),
      type: 'audio',
      points: [position, [position[0] + size.width, position[1] + size.height]],
      angle: 0,
      url,
      title: title || extractAudioTitle(url),
      duration,
      volume: 0.8,
      isPlaying: false,
      createdAt: Date.now(),
    };

    Transforms.insertNode(board, audioElement, [board.children.length]);

    return audioElement;
  },

  /**
   * 更新音频 URL
   */
  updateUrl(board: PlaitBoard, elementId: string, url: string, title?: string): void {
    const index = board.children.findIndex((el: any) => el.id === elementId);
    if (index >= 0) {
      Transforms.setNode(
        board,
        {
          url,
          title: title || extractAudioTitle(url),
        } as Partial<PlaitAudio>,
        [index]
      );
    }
  },

  /**
   * 删除音频
   */
  removeAudio(board: PlaitBoard, elementId: string): void {
    const index = board.children.findIndex((el: any) => el.id === elementId);
    if (index >= 0) {
      Transforms.removeNode(board, [index]);
    }
  },

  /**
   * 根据 ID 获取音频
   */
  getAudioById(board: PlaitBoard, elementId: string): PlaitAudio | null {
    const element = board.children.find((el: any) => el.id === elementId);
    return element && isAudioElement(element) ? element : null;
  },

  /**
   * 获取所有音频
   */
  getAllAudios(board: PlaitBoard): PlaitAudio[] {
    return board.children.filter(isAudioElement);
  },
};

export default withAudio;
