/**
 * Sticky Note Plugin
 *
 * 便利贴插件 - 支持 Markdown 格式的便利贴元素
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
  PlaitStickyNote,
  StickyNoteColor,
  StickyNoteCreateOptions,
  DEFAULT_STICKY_NOTE_SIZE,
} from '../../types/sticky-note.types';
import { StickyNoteContent } from './StickyNoteContent';

/**
 * 判断是否为便利贴元素
 */
export function isStickyNoteElement(element: any): element is PlaitStickyNote {
  return element && element.type === 'sticky-note';
}

/**
 * 便利贴元素组件
 */
export class StickyNoteComponent extends CommonElementFlavour<PlaitStickyNote, PlaitBoard> {
  private g: SVGGElement | null = null;
  private container: HTMLElement | null = null;
  private reactRoot: Root | null = null;
  activeGenerator!: ActiveGenerator<PlaitStickyNote>;

  initialize(): void {
    super.initialize();

    // 创建选中状态生成器
    this.activeGenerator = createActiveGenerator(this.board, {
      getRectangle: (element: PlaitStickyNote) => {
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
    this.g.classList.add('plait-sticky-note-element');
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
   * 内容变化处理
   */
  private handleContentChange = (content: string): void => {
    const index = this.board.children.findIndex((el: any) => el.id === this.element.id);
    if (index >= 0) {
      Transforms.setNode(
        this.board,
        { content } as Partial<PlaitStickyNote>,
        [index]
      );
    }
  };

  /**
   * 编辑模式变化处理
   */
  private handleEditingChange = (isEditing: boolean): void => {
    const index = this.board.children.findIndex((el: any) => el.id === this.element.id);
    if (index >= 0) {
      Transforms.setNode(
        this.board,
        { isEditing } as Partial<PlaitStickyNote>,
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
      React.createElement(StickyNoteContent, {
        content: this.element.content,
        backgroundColor: this.element.backgroundColor,
        isEditing: this.element.isEditing,
        onContentChange: this.handleContentChange,
        onEditingChange: this.handleEditingChange,
        readonly: false,
      })
    );
  }

  /**
   * 响应元素变化
   */
  onContextChanged(
    value: PlaitPluginElementContext<PlaitStickyNote, PlaitBoard>,
    previous: PlaitPluginElementContext<PlaitStickyNote, PlaitBoard>
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

      // 重新渲染 React 内容
      if (this.reactRoot) {
        this.reactRoot.render(
          React.createElement(StickyNoteContent, {
            content: value.element.content,
            backgroundColor: value.element.backgroundColor,
            isEditing: value.element.isEditing,
            onContentChange: this.handleContentChange,
            onEditingChange: this.handleEditingChange,
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
 * 获取当前选中的便利贴元素
 */
function getSelectedStickyNoteElements(board: PlaitBoard): PlaitStickyNote[] {
  const selectedElements = getSelectedElements(board);
  return selectedElements.filter(isStickyNoteElement);
}

/**
 * 便利贴插件
 */
export const withStickyNote: PlaitPlugin = (board: PlaitBoard) => {
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
    if (context.element.type === 'sticky-note') {
      return StickyNoteComponent;
    }
    return drawElement(context);
  };

  // 注册 getRectangle
  board.getRectangle = (element: PlaitElement) => {
    if (isStickyNoteElement(element)) {
      return RectangleClient.getRectangleByPoints(element.points);
    }
    return getRectangle(element);
  };

  // 注册 isHit
  board.isHit = (element: PlaitElement, point: Point) => {
    if (isStickyNoteElement(element)) {
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
    if (isStickyNoteElement(element)) {
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
    if (isStickyNoteElement(element)) {
      return true;
    }
    return isMovable(element);
  };

  // 注册 isAlign
  board.isAlign = (element: PlaitElement) => {
    if (isStickyNoteElement(element)) {
      return true;
    }
    return isAlign(element);
  };

  // 注册 getDeletedFragment - 支持删除
  board.getDeletedFragment = (data: PlaitElement[]) => {
    const stickyNotes = getSelectedStickyNoteElements(board);
    if (stickyNotes.length) {
      data.push(...stickyNotes);
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
    const stickyNotes = getSelectedStickyNoteElements(board);
    if (stickyNotes.length) {
      const elements = buildClipboardData(
        board,
        stickyNotes,
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
    const stickyNotes = clipboardData?.elements?.filter((value) =>
      isStickyNoteElement(value)
    ) as PlaitStickyNote[];
    if (stickyNotes && stickyNotes.length > 0) {
      insertClipboardData(board, stickyNotes, targetPoint);
    }
    insertFragment(clipboardData, targetPoint, operationType);
  };

  return board;
};

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `sticky_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 便利贴操作 API
 */
export const StickyNoteTransforms = {
  /**
   * 插入便利贴到画布
   */
  insertStickyNote(board: PlaitBoard, options: StickyNoteCreateOptions): PlaitStickyNote {
    const {
      position,
      size = DEFAULT_STICKY_NOTE_SIZE,
      content = '',
      backgroundColor = StickyNoteColor.YELLOW,
    } = options;

    const stickyNoteElement: PlaitStickyNote = {
      id: generateId(),
      type: 'sticky-note',
      points: [position, [position[0] + size.width, position[1] + size.height]],
      angle: 0,
      content,
      backgroundColor,
      isEditing: false,
      createdAt: Date.now(),
    };

    Transforms.insertNode(board, stickyNoteElement, [board.children.length]);

    return stickyNoteElement;
  },

  /**
   * 更新便利贴内容
   */
  updateContent(board: PlaitBoard, elementId: string, content: string): void {
    const index = board.children.findIndex((el: any) => el.id === elementId);
    if (index >= 0) {
      Transforms.setNode(
        board,
        { content } as Partial<PlaitStickyNote>,
        [index]
      );
    }
  },

  /**
   * 更新便利贴背景颜色
   */
  updateBackgroundColor(board: PlaitBoard, elementId: string, backgroundColor: StickyNoteColor): void {
    const index = board.children.findIndex((el: any) => el.id === elementId);
    if (index >= 0) {
      Transforms.setNode(
        board,
        { backgroundColor } as Partial<PlaitStickyNote>,
        [index]
      );
    }
  },

  /**
   * 删除便利贴
   */
  removeStickyNote(board: PlaitBoard, elementId: string): void {
    const index = board.children.findIndex((el: any) => el.id === elementId);
    if (index >= 0) {
      Transforms.removeNode(board, [index]);
    }
  },

  /**
   * 根据 ID 获取便利贴
   */
  getStickyNoteById(board: PlaitBoard, elementId: string): PlaitStickyNote | null {
    const element = board.children.find((el: any) => el.id === elementId);
    return element && isStickyNoteElement(element) ? element : null;
  },

  /**
   * 获取所有便利贴
   */
  getAllStickyNotes(board: PlaitBoard): PlaitStickyNote[] {
    return board.children.filter(isStickyNoteElement);
  },
};

export default withStickyNote;
