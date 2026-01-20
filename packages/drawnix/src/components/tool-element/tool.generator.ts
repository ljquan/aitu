/**
 * Tool Generator
 *
 * 工具元素渲染生成器
 * 负责在 SVG 画布上使用 foreignObject 渲染 iframe
 */

import { PlaitBoard, RectangleClient } from '@plait/core';
import { PlaitTool, ToolDefinition } from '../../types/toolbox.types';
import { ToolLoadState, ToolErrorType, ToolErrorEventDetail } from '../../types/tool-error.types';
import { createRoot, Root } from 'react-dom/client';
import React, { Suspense } from 'react';
import { InternalToolComponents } from '../toolbox-drawer/InternalToolComponents';
import { ToolProviderWrapper } from '../toolbox-drawer/ToolProviderWrapper';
import { ToolTransforms } from '../../plugins/with-tool';
import { toolWindowService } from '../../services/tool-window-service';
import { BUILT_IN_TOOLS } from '../../constants/built-in-tools';

/**
 * 工具元素渲染生成器
 */
export class ToolGenerator {
  private board: PlaitBoard;
  private iframeCache = new Map<string, HTMLIFrameElement>();
  private reactRoots = new Map<string, Root>();
  private loadStates = new Map<string, ToolLoadState>();
  private loadTimeouts = new Map<string, NodeJS.Timeout>();
  private canvasClickHandler: ((e: MouseEvent) => void) | null = null;

  // 加载超时时间（毫秒）
  private static readonly LOAD_TIMEOUT = 10000; // 10 秒

  constructor(board: PlaitBoard) {
    this.board = board;

    // 监听画布点击事件，恢复所有 iframe 蒙层
    this.setupCanvasClickHandler();
  }

  /**
   * 设置画布点击处理，恢复所有蒙层
   */
  private setupCanvasClickHandler(): void {
    this.canvasClickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // 如果点击的是 iframe 或蒙层本身，不处理
      if (target.tagName === 'IFRAME' ||
          target.closest('iframe') ||
          target.classList.contains('iframe-protection-overlay') ||
          target.closest('.plait-tool-content') ||
          target.closest('.plait-tool-react-content')) {
        return;
      }

      // 恢复所有蒙层
      const overlays = document.querySelectorAll('.iframe-protection-overlay') as NodeListOf<HTMLElement>;
      overlays.forEach((overlay) => {
        overlay.style.display = 'flex';
      });
    };

    // 添加到 document，确保能捕获所有点击
    document.addEventListener('click', this.canvasClickHandler);
  }

  /**
   * 判断是否可以绘制该元素
   */
  canDraw(element: PlaitTool): boolean {
    return !!(element && element.type === 'tool' && (element.url || element.component));
  }

  /**
   * 绘制工具元素
   * 返回包含 foreignObject 的 SVG group
   */
  draw(element: PlaitTool): SVGGElement {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-element-id', element.id);
    g.classList.add('plait-tool-element');

    // 创建 foreignObject
    const foreignObject = this.createForeignObject(element);
    g.appendChild(foreignObject);

    // 应用旋转
    this.applyRotation(g, element);

    return g;
  }

  /**
   * 更新工具元素
   * 当元素属性变化时调用
   */
  updateImage(
    nodeG: SVGGElement,
    previous: PlaitTool,
    current: PlaitTool
  ): void {
    // 如果是组件类型，检查 component 标识是否变化
    if (current.component) {
      if (previous.component !== current.component) {
        this.recreateContent(nodeG, current);
        return;
      }
      
      // 更新 React 内容（如果需要的话，比如 props 变化，虽然目前 PlaitTool 没带业务 props）
      this.renderReactContent(current);
    } 
    // 如果是 URL 类型，检查 URL 是否变化
    else if (previous.url !== current.url) {
      this.recreateContent(nodeG, current);
      return;
    }

    // 更新位置和尺寸
    const foreignObject = nodeG.querySelector('foreignObject');
    if (foreignObject) {
      const rect = this.getRectangle(current);
      foreignObject.setAttribute('x', rect.x.toString());
      foreignObject.setAttribute('y', rect.y.toString());
      foreignObject.setAttribute('width', rect.width.toString());
      foreignObject.setAttribute('height', rect.height.toString());
    }

    // 更新旋转
    this.applyRotation(nodeG, current);
  }

  /**
   * 重新创建整个内容
   */
  private recreateContent(nodeG: SVGGElement, element: PlaitTool): void {
    // 清理旧的 React Root
    const oldRoot = this.reactRoots.get(element.id);
    if (oldRoot) {
      oldRoot.unmount();
      this.reactRoots.delete(element.id);
    }

    nodeG.innerHTML = '';
    const foreignObject = this.createForeignObject(element);
    nodeG.appendChild(foreignObject);
    this.applyRotation(nodeG, element);
  }

  /**
   * 创建 foreignObject 容器
   */
  private createForeignObject(element: PlaitTool): SVGForeignObjectElement {
    const rect = this.getRectangle(element);

    // 创建 foreignObject（SVG 中嵌入 HTML 的容器）
    const foreignObject = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'foreignObject'
    );
    foreignObject.setAttribute('x', rect.x.toString());
    foreignObject.setAttribute('y', rect.y.toString());
    foreignObject.setAttribute('width', rect.width.toString());
    foreignObject.setAttribute('height', rect.height.toString());
    foreignObject.classList.add('plait-tool-foreign-object');

    // 禁用 foreignObject 的焦点样式和背景,避免出现蒙版效果
    foreignObject.style.outline = 'none';
    foreignObject.style.background = 'transparent';

    // 创建 HTML 容器
    const container = document.createElement('div');
    container.className = 'plait-tool-container';
    container.style.cssText = `
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      border-radius: 8px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
      background-color: #fff;
      position: relative;
      outline: none;
      overflow: hidden;
    `;

    // 创建标题栏
    const titleBar = this.createTitleBar(element);
    container.appendChild(titleBar);

    // 根据类型创建内容区域
    if (element.component) {
      // 创建 React 内容容器
      const reactContentArea = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      (reactContentArea as HTMLElement).className = 'plait-tool-content plait-tool-react-content';
      (reactContentArea as HTMLElement).style.cssText = `
        flex: 1;
        position: relative;
        overflow: hidden;
        background: #fff;
      `;
      container.appendChild(reactContentArea as HTMLElement);
      
      // 延迟渲染以确保 DOM 已挂载
      setTimeout(() => this.renderReactContent(element, reactContentArea as HTMLElement), 0);
    } else {
      // 创建 iframe 内容区域
      const contentArea = document.createElement('div');
      contentArea.className = 'plait-tool-content';
      contentArea.style.cssText = `
        flex: 1;
        position: relative;
        overflow: hidden;
        background: #fff;
      `;

      // 创建加载提示
      const loader = this.createLoader();
      contentArea.appendChild(loader);

      // 创建 iframe
      const iframe = this.createIframe(element);
      contentArea.appendChild(iframe);

      // 创建保护蒙层（防止 iframe 内缩放页面）
      const overlay = this.createIframeOverlay();
      contentArea.appendChild(overlay);

      // iframe 加载完成后移除 loader
      iframe.onload = () => {
        loader.remove();
      };

      // iframe 加载失败处理
      iframe.onerror = () => {
        loader.textContent = '加载失败';
        loader.style.color = '#f5222d';
      };

      container.appendChild(contentArea);
    }

    foreignObject.appendChild(container);
    return foreignObject;
  }

  /**
   * 渲染 React 内部组件内容
   */
  private renderReactContent(element: PlaitTool, container?: HTMLElement): void {
    if (!element.component) return;

    const Component = InternalToolComponents[element.component];
    if (!Component) {
      if (container) {
        container.innerHTML = `<div style="padding: 20px; color: #f5222d;">未找到组件: ${element.component}</div>`;
      }
      return;
    }

    let root = this.reactRoots.get(element.id);
    if (!root && container) {
      root = createRoot(container);
      this.reactRoots.set(element.id, root);
    }

    if (root) {
      root.render(
        React.createElement(ToolProviderWrapper, { board: this.board }, 
          React.createElement(Suspense, {
            fallback: React.createElement('div', { 
              style: { padding: 20, textAlign: 'center', color: '#999' } 
            }, '加载中...')
          }, React.createElement(Component, { 
            // 传递 board 和 element 供内部组件使用（如果需要）
            board: this.board,
            element: element
          }))
        )
      );
    }
  }

  /**
   * 创建标题栏
   */
  private createTitleBar(element: PlaitTool): HTMLDivElement {
    const titleBar = document.createElement('div');
    titleBar.className = 'plait-tool-titlebar';
    titleBar.setAttribute('data-draggable', 'true'); // 标记为可拖动区域
    titleBar.style.cssText = `
      height: 36px;
      min-height: 36px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      background: linear-gradient(180deg, #f5f5f5 0%, #ebebeb 100%);
      border-bottom: 1px solid #d9d9d9;
      cursor: move;
      user-select: none;
      flex-shrink: 0;
    `;

    // 左侧：工具图标和名称
    const titleLeft = document.createElement('div');
    titleLeft.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      overflow: hidden;
    `;

    // 工具图标
    const icon = document.createElement('span');
    icon.textContent = '🔧';
    icon.style.cssText = `
      font-size: 16px;
      line-height: 1;
    `;

    // 工具名称
    const title = document.createElement('span');
    title.className = 'plait-tool-title';
    title.textContent = element.metadata?.name || '工具';
    title.style.cssText = `
      font-size: 13px;
      font-weight: 500;
      color: #333;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;

    titleLeft.appendChild(icon);
    titleLeft.appendChild(title);

    // 右侧：操作按钮
    const titleRight = document.createElement('div');
    titleRight.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
    `;

    // 刷新按钮（仅 iframe 工具显示）
    if (!element.component) {
      const refreshBtn = this.createTitleButton('↻', '刷新', () => {
        const iframe = this.iframeCache.get(element.id);
        if (iframe) {
          iframe.src = iframe.src; // 重新加载
        }
      });
      titleRight.appendChild(refreshBtn);
    }

    // 打开为弹窗按钮
    const popoutBtn = this.createTitleButton('⧉', '打开为弹窗', () => {
      this.openAsPopup(element);
    });
    titleRight.appendChild(popoutBtn);

    titleBar.appendChild(titleLeft);
    titleBar.appendChild(titleRight);

    return titleBar;
  }

  /**
   * 创建标题栏按钮
   */
  private createTitleButton(
    text: string,
    title: string,
    onClick: () => void
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.title = title;
    button.style.cssText = `
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      color: #666;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      padding: 0;
    `;

    // Hover 效果
    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(0, 0, 0, 0.05)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = 'transparent';
    });

    // 点击事件，阻止事件冒泡
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onClick();
    });

    // 阻止鼠标按下事件冒泡，避免触发拖动
    button.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    return button;
  }

  /**
   * 创建 iframe 保护蒙层
   * 防止用户在 iframe 内缩放页面
   */
  private createIframeOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = 'iframe-protection-overlay';
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.01);
      z-index: 100;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 1;
      transition: opacity 0.2s ease;
    `;

    // 添加提示文字（鼠标悬停时显示）
    const hint = document.createElement('div');
    hint.className = 'iframe-overlay-hint';
    hint.textContent = '点击以交互';
    hint.style.cssText = `
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: none;
    `;
    overlay.appendChild(hint);

    // 鼠标悬停时显示提示
    overlay.addEventListener('mouseenter', () => {
      hint.style.opacity = '1';
    });

    overlay.addEventListener('mouseleave', () => {
      hint.style.opacity = '0';
    });

    // 点击蒙层时隐藏蒙层（允许与 iframe 交互）
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      overlay.style.display = 'none';
    });

    return overlay;
  }

  /**
   * 创建加载提示元素
   */
  private createLoader(): HTMLDivElement {
    const loader = document.createElement('div');
    loader.className = 'plait-tool-loader';
    loader.textContent = '加载中...';
    loader.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #999;
      font-size: 14px;
      pointer-events: none;
      z-index: 1;
    `;
    return loader;
  }

  /**
   * 创建 iframe 元素
   */
  private createIframe(element: PlaitTool): HTMLIFrameElement {
    const iframe = document.createElement('iframe');

    // 初始化加载状态
    const loadState: ToolLoadState = {
      status: 'loading',
      loadStartTime: Date.now(),
      retryCount: 0,
    };
    this.loadStates.set(element.id, loadState);

    // 成功加载
    iframe.onload = () => {
      // 检测 CORS 错误
      if (this.detectCorsError(iframe)) {
        this.handleLoadError(element.id, ToolErrorType.CORS_BLOCKED);
      } else {
        this.handleLoadSuccess(element.id);
      }
    };

    // 加载失败
    iframe.onerror = () => {
      this.handleLoadError(element.id, ToolErrorType.LOAD_FAILED);
    };

    // 设置超时检测
    this.setupLoadTimeout(element.id);

    // 设置 iframe URL，添加 toolId 参数用于通信
    const url = new URL(element.url, window.location.origin);
    url.searchParams.set('toolId', element.id);
    iframe.src = url.toString();

    // 关键修改：默认启用 iframe 的鼠标事件，因为拖动只在标题栏上
    // 这样 iframe 内的页面可以正常点击和滚动
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      display: block;
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: auto;
      background: #fff;
      z-index: 10;
    `;

    // 设置 sandbox 权限
    const permissions = element.metadata?.permissions || [
      'allow-scripts',
      'allow-same-origin',
    ];
    iframe.setAttribute('sandbox', permissions.join(' '));

    // 设置 allow 属性（Feature Policy）
    iframe.setAttribute('allow', 'clipboard-read; clipboard-write');

    // 设置 title 用于可访问性
    iframe.setAttribute('title', element.metadata?.name || 'Tool');

    // 缓存 iframe 引用
    this.iframeCache.set(element.id, iframe);

    return iframe;
  }

  /**
   * 应用旋转变换
   */
  private applyRotation(g: SVGGElement, element: PlaitTool): void {
    if (element.angle && element.angle !== 0) {
      const rect = this.getRectangle(element);
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      g.setAttribute(
        'transform',
        `rotate(${element.angle} ${centerX} ${centerY})`
      );
    } else {
      g.removeAttribute('transform');
    }
  }

  /**
   * 获取工具元素的矩形区域
   */
  private getRectangle(element: PlaitTool): RectangleClient {
    // 检查 points 数组是否有效
    if (!element.points || element.points.length !== 2) {
      console.error('Invalid points in tool element:', element);
      return { x: 0, y: 0, width: 400, height: 300 }; // 返回默认值
    }

    const [start, end] = element.points;

    // 检查每个点是否有效
    if (!start || !end || start.length !== 2 || end.length !== 2) {
      console.error('Invalid point data:', { start, end, element });
      return { x: 0, y: 0, width: 400, height: 300 }; // 返回默认值
    }

    const x = Math.min(start[0], end[0]);
    const y = Math.min(start[1], end[1]);
    const width = Math.abs(end[0] - start[0]);
    const height = Math.abs(end[1] - start[1]);

    // 确保宽高不为 0
    const finalWidth = width > 0 ? width : 400;
    const finalHeight = height > 0 ? height : 300;

    return { x, y, width: finalWidth, height: finalHeight };
  }

  /**
   * 获取缓存的 iframe
   */
  getIframe(elementId: string): HTMLIFrameElement | undefined {
    return this.iframeCache.get(elementId);
  }

  /**
   * 设置 iframe 的交互状态
   * @param elementId - 工具元素 ID
   * @param enabled - 是否启用交互
   */
  setIframeInteraction(elementId: string, enabled: boolean): void {
    const iframe = this.iframeCache.get(elementId);
    if (iframe) {
      iframe.style.pointerEvents = enabled ? 'auto' : 'none';
    }
  }

  /**
   * 设置加载超时检测
   */
  private setupLoadTimeout(elementId: string): void {
    const timeoutId = setTimeout(() => {
      const state = this.loadStates.get(elementId);
      if (state && state.status === 'loading') {
        this.handleLoadError(elementId, ToolErrorType.TIMEOUT);
      }
    }, ToolGenerator.LOAD_TIMEOUT);

    this.loadTimeouts.set(elementId, timeoutId);
  }

  /**
   * 检测 CORS 错误
   * 尝试访问 iframe.contentWindow.location，如果抛出异常则可能是 CORS
   */
  private detectCorsError(iframe: HTMLIFrameElement): boolean {
    try {
      // 如果可以访问 location，说明没有 CORS 限制
      void iframe.contentWindow?.location.href;
      return false;
    } catch (e) {
      // 访问被拒绝，可能是 X-Frame-Options 或 CSP
      return true;
    }
  }

  /**
   * 处理加载成功
   */
  private handleLoadSuccess(elementId: string): void {
    const state = this.loadStates.get(elementId);
    if (state) {
      state.status = 'loaded';
      this.loadStates.set(elementId, state);

      // 清除超时定时器
      const timeoutId = this.loadTimeouts.get(elementId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.loadTimeouts.delete(elementId);
      }
    }
  }

  /**
   * 处理加载错误
   */
  private handleLoadError(elementId: string, errorType: ToolErrorType): void {
    const state = this.loadStates.get(elementId);
    if (state) {
      state.status = 'error';
      state.errorType = errorType;
      state.errorMessage = this.getErrorMessage(errorType);
      this.loadStates.set(elementId, state);

      // 清除超时定时器
      const timeoutId = this.loadTimeouts.get(elementId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.loadTimeouts.delete(elementId);
      }

      // 触发错误事件
      this.emitErrorEvent(elementId, errorType, state.errorMessage);
    }
  }

  /**
   * 获取错误提示文案
   */
  private getErrorMessage(errorType: ToolErrorType): string {
    const messages: Record<ToolErrorType, string> = {
      [ToolErrorType.LOAD_FAILED]: '工具加载失败，请检查网络连接',
      [ToolErrorType.CORS_BLOCKED]: '该网站禁止嵌入，无法显示',
      [ToolErrorType.PERMISSION_DENIED]: '权限不足，无法加载工具',
      [ToolErrorType.TIMEOUT]: '加载超时，请重试',
    };
    return messages[errorType] || '未知错误';
  }

  /**
   * 触发错误事件
   */
  private emitErrorEvent(
    elementId: string,
    errorType: ToolErrorType,
    errorMessage?: string
  ): void {
    const detail: ToolErrorEventDetail = {
      elementId,
      errorType,
      errorMessage,
    };

    const event = new CustomEvent('tool-load-error', { detail });
    window.dispatchEvent(event);
  }

  /**
   * 获取工具加载状态
   */
  getLoadState(elementId: string): ToolLoadState | undefined {
    return this.loadStates.get(elementId);
  }

  /**
   * 重试加载工具
   */
  retryLoad(elementId: string): void {
    const state = this.loadStates.get(elementId);
    if (state) {
      state.status = 'loading';
      state.retryCount += 1;
      state.loadStartTime = Date.now();
      delete state.errorType;
      delete state.errorMessage;
      this.loadStates.set(elementId, state);

      // 重新加载 iframe
      const iframe = this.iframeCache.get(elementId);
      if (iframe) {
        // 重新设置超时
        this.setupLoadTimeout(elementId);
        // 重新加载（触发 src 赋值）
        const currentSrc = iframe.src;
        iframe.src = 'about:blank';
        setTimeout(() => {
          iframe.src = currentSrc;
        }, 100);
      }
    }
  }

  /**
   * 打开为弹窗
   * 从画布移除工具元素，以 WinBox 弹窗形式打开
   */
  private openAsPopup(element: PlaitTool): void {
    // 查找对应的工具定义
    const toolDefinition = this.findToolDefinition(element);
    if (!toolDefinition) {
      console.warn('Tool definition not found for:', element.toolId);
      return;
    }

    // 先从画布移除该元素
    ToolTransforms.removeTool(this.board, element.id);

    // 以弹窗形式打开
    toolWindowService.openTool(toolDefinition);
  }

  /**
   * 查找工具定义
   */
  private findToolDefinition(element: PlaitTool): ToolDefinition | undefined {
    // 首先从内置工具中查找
    const builtInTool = BUILT_IN_TOOLS.find(t => t.id === element.toolId);
    if (builtInTool) {
      return builtInTool;
    }

    // 如果不是内置工具，根据元素信息构建工具定义
    if (element.url || element.component) {
      return {
        id: element.toolId,
        name: element.metadata?.name || '工具',
        description: '',
        icon: '🔧',
        category: element.metadata?.category,
        ...(element.url ? { url: element.url } : {}),
        ...(element.component ? { component: element.component } : {}),
        permissions: element.metadata?.permissions,
      } as ToolDefinition;
    }

    return undefined;
  }

  /**
   * 清理资源
   */
  destroy(): void {
    // 移除画布点击监听器
    if (this.canvasClickHandler) {
      document.removeEventListener('click', this.canvasClickHandler);
      this.canvasClickHandler = null;
    }

    // 清理所有超时定时器
    this.loadTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.loadTimeouts.clear();

    // 清理所有 iframe 引用
    this.iframeCache.forEach((iframe) => {
      // 清除 src 以停止加载
      iframe.src = 'about:blank';
    });
    this.iframeCache.clear();

    // 清理所有 React Roots
    this.reactRoots.forEach((root) => {
      root.unmount();
    });
    this.reactRoots.clear();

    // 清理加载状态
    this.loadStates.clear();

    // 移除所有蒙层
    const overlays = document.querySelectorAll('.iframe-protection-overlay');
    overlays.forEach((overlay) => overlay.remove());
  }
}
