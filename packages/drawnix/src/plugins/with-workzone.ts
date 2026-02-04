/**
 * WorkZone 插件
 *
 * 注册 WorkZone 画布元素，支持在画布上直接显示工作流进度
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
  PlaitHistoryBoard,
} from '@plait/core';
import {
  CommonElementFlavour,
  ActiveGenerator,
  createActiveGenerator,
} from '@plait/common';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import type { PlaitWorkZone, WorkZoneCreateOptions } from '../types/workzone.types';
import { DEFAULT_WORKZONE_SIZE } from '../types/workzone.types';
import { WorkZoneContent } from '../components/workzone-element/WorkZoneContent';
import { ToolProviderWrapper } from '../components/toolbox-drawer/ToolProviderWrapper';
import { workflowStatusSyncService } from '../services/workflow-status-sync';

/**
 * 判断是否为 WorkZone 元素
 */
export function isWorkZoneElement(element: any): element is PlaitWorkZone {
  return element && element.type === 'workzone';
}

/**
 * WorkZone 元素组件
 */
export class WorkZoneComponent extends CommonElementFlavour<PlaitWorkZone, PlaitBoard> {
  private g: SVGGElement | null = null;
  private container: HTMLElement | null = null;
  private reactRoot: Root | null = null;
  private statusSyncUnsubscribe: (() => void) | null = null;
  activeGenerator!: ActiveGenerator<PlaitWorkZone>;

  initialize(): void {
    super.initialize();

    // 订阅工作流状态同步
    this.setupStatusSync();

    // 创建选中状态生成器
    this.activeGenerator = createActiveGenerator(this.board, {
      getRectangle: (element: PlaitWorkZone) => {
        const rect = RectangleClient.getRectangleByPoints(element.points);
        // 根据 zoom 调整选中框大小，使其与缩放后的内容匹配
        const scale = 1 / element.zoom;
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width * scale,
          height: rect.height * scale,
        };
      },
      getStrokeWidth: () => 2,
      getStrokeOpacity: () => 1,
      hasResizeHandle: () => false,
    });

    // 创建 SVG 结构
    this.createSVGStructure();

    // 渲染 React 内容
    this.renderContent();

    // console.log('[WorkZone] Element initialized:', this.element.id);
  }

  /**
   * 创建 SVG foreignObject 结构
   */
  private createSVGStructure(): void {
    const rect = RectangleClient.getRectangleByPoints(this.element.points);

    // 创建 SVG group
    this.g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.g.setAttribute('data-element-id', this.element.id);
    this.g.classList.add('plait-workzone-element');
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

    // 创建 HTML 容器（需要在 XHTML 命名空间中）
    this.container = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.pointerEvents = 'auto';
    this.container.style.cursor = 'default';
    this.container.style.position = 'relative';

    // 应用缩放以保持内容视觉大小恒定
    const scale = 1 / this.element.zoom;
    this.container.style.transform = `scale(${scale})`;
    this.container.style.transformOrigin = 'top left';

    foreignObject.appendChild(this.container);
    this.g.appendChild(foreignObject);

    // 添加到 elementG（普通元素层），这样可以接收鼠标事件
    const elementG = this.getElementG();
    elementG.appendChild(this.g);
  }

  /**
   * 删除当前 WorkZone
   */
  private handleDelete = (): void => {
    // console.log('[WorkZone] Delete button clicked:', this.element.id);
    // console.log('[WorkZone] Board children before delete:', this.board.children.length);
    WorkZoneTransforms.removeWorkZone(this.board, this.element.id);
    // console.log('[WorkZone] Board children after delete:', this.board.children.length);
  };

  /**
   * 处理工作流状态变更（来自 SW claim 结果）
   * 当 SW 中的工作流已完成/失败/不存在时更新 UI
   */
  private handleWorkflowStateChange = (workflowId: string, status: 'completed' | 'failed', error?: string): void => {
    console.log(`[WorkZoneComponent] 🔄 Workflow state change: ${workflowId} -> ${status}`, error);
    
    // 更新 workflow 状态
    const updatedWorkflow = {
      ...this.element.workflow,
      status,
      error: error || (status === 'failed' ? '工作流执行失败' : undefined),
    };
    
    // 更新步骤状态
    if (status === 'failed') {
      updatedWorkflow.steps = this.element.workflow.steps.map(step => {
        if (step.status === 'running' || step.status === 'pending') {
          return { ...step, status: 'failed' as const, error: error || '执行中断' };
        }
        return step;
      });
    }
    
    // 通过 WorkZoneTransforms 更新工作流
    WorkZoneTransforms.updateWorkflow(this.board, this.element.id, updatedWorkflow);
  };

  /**
   * 使用 React 渲染内容
   */
  private renderContent(): void {
    if (!this.container) return;

    // 创建 React root
    this.reactRoot = createRoot(this.container);
    this.reactRoot.render(
      React.createElement(ToolProviderWrapper, { board: this.board },
        React.createElement(WorkZoneContent, {
          workflow: this.element.workflow,
          onDelete: this.handleDelete,
          onWorkflowStateChange: this.handleWorkflowStateChange,
        })
      )
    );
  }

  /**
   * 响应元素变化
   */
  onContextChanged(
    value: PlaitPluginElementContext<PlaitWorkZone, PlaitBoard>,
    previous: PlaitPluginElementContext<PlaitWorkZone, PlaitBoard>
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

      // 更新容器缩放
      if (this.container && value.element.zoom !== previous.element.zoom) {
        const scale = 1 / value.element.zoom;
        this.container.style.transform = `scale(${scale})`;
      }

      // 重新渲染 React 内容（workflow 数据可能变化）
      if (this.reactRoot) {
        this.reactRoot.render(
          React.createElement(ToolProviderWrapper, { board: this.board },
            React.createElement(WorkZoneContent, {
              workflow: value.element.workflow,
              onDelete: this.handleDelete,
              onWorkflowStateChange: this.handleWorkflowStateChange,
            })
          )
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
   * 设置工作流状态同步
   * 通过轮询 IndexedDB 获取最新状态，确保 UI 与数据同步
   */
  private setupStatusSync(): void {
    const workflowId = this.element.workflow.id;
    
    // 检查工作流是否需要同步（运行中或有 pending 步骤）
    const needsSync = 
      this.element.workflow.status === 'running' || 
      this.element.workflow.status === 'pending' ||
      this.element.workflow.steps.some(s => 
        s.status === 'running' || s.status === 'pending'
      );
    
    if (!needsSync) return;

    this.statusSyncUnsubscribe = workflowStatusSyncService.subscribe(workflowId, (change) => {
      // 更新 WorkZone 的 workflow 数据
      WorkZoneTransforms.updateWorkflow(this.board, this.element.id, {
        status: change.currentStatus as PlaitWorkZone['workflow']['status'],
        steps: change.steps.map(s => ({
          id: s.id,
          mcp: s.mcp,
          args: s.args,
          description: s.description,
          status: s.status as 'pending' | 'running' | 'completed' | 'failed' | 'skipped',
          result: s.result,
          error: s.error,
          duration: s.duration,
          options: s.options,
        })),
      });

      // 如果工作流完成，取消订阅
      if (change.currentStatus === 'completed' || change.currentStatus === 'failed' || change.currentStatus === 'cancelled') {
        this.statusSyncUnsubscribe?.();
        this.statusSyncUnsubscribe = null;
      }
    });
  }

  /**
   * 销毁
   */
  destroy(): void {
    // console.log('[WorkZone] destroy() called for:', this.element?.id);

    // 取消状态同步订阅
    if (this.statusSyncUnsubscribe) {
      this.statusSyncUnsubscribe();
      this.statusSyncUnsubscribe = null;
    }

    // 先从 DOM 中移除 SVG 元素（同步）
    if (this.g && this.g.parentNode) {
      // console.log('[WorkZone] Removing g from DOM');
      this.g.parentNode.removeChild(this.g);
    }

    // 清理 ActiveGenerator
    if (this.activeGenerator) {
      this.activeGenerator.destroy();
    }

    // 异步卸载 React root 以避免竞态条件
    const reactRoot = this.reactRoot;
    if (reactRoot) {
      // console.log('[WorkZone] Scheduling React root unmount');
      this.reactRoot = null;
      // 使用 setTimeout 延迟卸载，避免在 React 渲染期间同步卸载
      setTimeout(() => {
        reactRoot.unmount();
        // console.log('[WorkZone] React root unmounted');
      }, 0);
    }

    this.g = null;
    this.container = null;

    super.destroy();

    // console.log('[WorkZone] Element destroyed successfully:', this.element?.id);
  }
}

/**
 * WorkZone 插件
 */
export const withWorkZone: PlaitPlugin = (board: PlaitBoard) => {
  const { drawElement, getRectangle, isHit, isRectangleHit, isMovable } = board;

  // 注册元素渲染
  board.drawElement = (context: PlaitPluginElementContext) => {
    if (context.element.type === 'workzone') {
      return WorkZoneComponent;
    }
    return drawElement(context);
  };

  // 注册 getRectangle
  board.getRectangle = (element: PlaitElement) => {
    if (isWorkZoneElement(element)) {
      return RectangleClient.getRectangleByPoints(element.points);
    }
    return getRectangle(element);
  };

  // 注册 isHit
  board.isHit = (element: PlaitElement, point: Point) => {
    if (isWorkZoneElement(element)) {
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
    if (isWorkZoneElement(element)) {
      const rect = RectangleClient.getRectangleByPoints(
        (element as PlaitWorkZone).points
      );
      const selectionRect = RectangleClient.getRectangleByPoints([
        selection.anchor,
        selection.focus,
      ]);
      return RectangleClient.isHit(rect, selectionRect);
    }
    return isRectangleHit(element, selection);
  };

  // 注册 isMovable（WorkZone 可移动）
  board.isMovable = (element: PlaitElement) => {
    if (isWorkZoneElement(element)) {
      return true;
    }
    return isMovable(element);
  };

  // console.log('[WorkZone] Plugin initialized');
  return board;
};

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `workzone_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * WorkZone 操作 API
 */
export const WorkZoneTransforms = {
  /**
   * 插入 WorkZone 到画布（不记录到撤销历史）
   * WorkZone 是临时的 AI 生成面板，不应该被撤销恢复
   */
  insertWorkZone(board: PlaitBoard, options: WorkZoneCreateOptions): PlaitWorkZone {
    const { workflow, position, size = DEFAULT_WORKZONE_SIZE, expectedInsertPosition, zoom } = options;

    const workzoneElement: PlaitWorkZone = {
      id: generateId(),
      type: 'workzone',
      points: [position, [position[0] + size.width, position[1] + size.height]],
      angle: 0,
      workflow,
      createdAt: Date.now(),
      expectedInsertPosition,
      zoom,
    };

    // 使用 withoutSaving 来跳过撤销历史
    PlaitHistoryBoard.withoutSaving(board, () => {
      Transforms.insertNode(board, workzoneElement, [board.children.length]);
    });

    // console.log('[WorkZone] Inserted (without history):', workzoneElement.id);
    return workzoneElement;
  },

  /**
   * 更新 WorkZone 的 workflow 数据（不记录到撤销历史）
   */
  updateWorkflow(board: PlaitBoard, elementId: string, workflow: Partial<PlaitWorkZone['workflow']>): void {
    const index = board.children.findIndex((el: any) => el.id === elementId);
    if (index >= 0) {
      const element = board.children[index] as PlaitWorkZone;
      const updatedWorkflow = { ...element.workflow, ...workflow };
      // 使用 withoutSaving 来跳过撤销历史
      PlaitHistoryBoard.withoutSaving(board, () => {
        Transforms.setNode(board, { workflow: updatedWorkflow } as Partial<PlaitWorkZone>, [index]);
      });
    }
  },

  /**
   * 删除 WorkZone（不记录到撤销历史）
   * WorkZone 是临时的 AI 生成面板，不应该被撤销恢复
   */
  removeWorkZone(board: PlaitBoard, elementId: string): void {
    const index = board.children.findIndex((el: any) => el.id === elementId);
    if (index >= 0) {
      // 使用 withoutSaving 来跳过撤销历史
      PlaitHistoryBoard.withoutSaving(board, () => {
        Transforms.removeNode(board, [index]);
      });
      // console.log('[WorkZone] Removed (without history):', elementId);
    }
  },

  /**
   * 根据 ID 获取 WorkZone
   */
  getWorkZoneById(board: PlaitBoard, elementId: string): PlaitWorkZone | null {
    const element = board.children.find((el: any) => el.id === elementId);
    return element && isWorkZoneElement(element) ? element : null;
  },

  /**
   * 获取所有 WorkZone
   */
  getAllWorkZones(board: PlaitBoard): PlaitWorkZone[] {
    return board.children.filter(isWorkZoneElement) as PlaitWorkZone[];
  },
};

export default withWorkZone;
