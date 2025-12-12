/**
 * Tool Generator
 *
 * 工具元素渲染生成器
 * 负责在 SVG 画布上使用 foreignObject 渲染 iframe
 */

import { PlaitBoard, RectangleClient } from '@plait/core';
import { PlaitTool } from '../../types/toolbox.types';
import { ToolLoadState, ToolErrorType, ToolErrorEventDetail } from '../../types/tool-error.types';

/**
 * 工具元素渲染生成器
 */
export class ToolGenerator {
  private board: PlaitBoard;
  private iframeCache = new Map<string, HTMLIFrameElement>();
  private loadStates = new Map<string, ToolLoadState>();
  private loadTimeouts = new Map<string, NodeJS.Timeout>();

  // 加载超时时间（毫秒）
  private static readonly LOAD_TIMEOUT = 10000; // 10 秒

  constructor(board: PlaitBoard) {
    this.board = board;
  }

  /**
   * 判断是否可以绘制该元素
   */
  canDraw(element: PlaitTool): boolean {
    return !!(element && element.type === 'tool' && element.url);
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
    // 如果 URL 变化，需要重新创建 iframe
    if (previous.url !== current.url) {
      nodeG.innerHTML = '';
      const foreignObject = this.createForeignObject(current);
      nodeG.appendChild(foreignObject);
      this.applyRotation(nodeG, current);
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
      overflow: hidden;
      border-radius: 8px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
      background-color: transparent;
      position: relative;
      outline: none;
    `;

    // 创建加载提示
    const loader = this.createLoader();
    container.appendChild(loader);

    // 创建 iframe
    const iframe = this.createIframe(element);
    container.appendChild(iframe);

    // iframe 加载完成后移除 loader
    iframe.onload = () => {
      loader.remove();
    };

    // iframe 加载失败处理
    iframe.onerror = () => {
      loader.textContent = '加载失败';
      loader.style.color = '#f5222d';
    };

    foreignObject.appendChild(container);
    return foreignObject;
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

    // 关键：默认禁用 iframe 的鼠标事件，让画布可以接收选中、拖拽等事件
    // 当元素被双击进入编辑模式时，再启用 iframe 交互
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      display: block;
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
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
   * 清理资源
   */
  destroy(): void {
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

    // 清理加载状态
    this.loadStates.clear();
  }
}
