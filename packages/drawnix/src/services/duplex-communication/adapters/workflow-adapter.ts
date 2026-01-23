/**
 * Workflow Adapter
 * 
 * 将现有的 Workflow 系统适配到双工通讯机制
 */

import {
  DuplexMessage,
  MessageHandler,
  MessageMode,
  MessagePriority,
} from '../core/types';
import {
  MESSAGE_TYPES,
  createPushMessage,
  adaptWorkflowMessage,
} from '../core/protocol';
import { DuplexClient } from '../core/client';
import { DuplexServer } from '../core/server';

// 导入现有 Workflow 类型 (兼容现有系统)
import type {
  Workflow,
  WorkflowStep,
  WorkflowStatus,
  WorkflowStepStatus,
  WorkflowExecutionContext,
  ToolCall,
  CanvasOperation,
} from '../../../sw/task-queue/workflow-types';

// ============================================================================
// Workflow 客户端适配器
// ============================================================================

export class WorkflowClientAdapter {
  private duplexClient: DuplexClient;
  private eventHandlers = new Map<string, Function[]>();

  constructor(duplexClient: DuplexClient) {
    this.duplexClient = duplexClient;
    this.setupEventListeners();
  }

  /**
   * 提交工作流
   */
  async submitWorkflow(workflow: Workflow): Promise<{
    workflowId: string;
    status: WorkflowStatus;
  }> {
    const result = await this.duplexClient.request<{
      workflowId: string;
      status: WorkflowStatus;
    }>(
      MESSAGE_TYPES.WORKFLOW.SUBMIT,
      { workflow },
      {
        timeout: 30000,
        priority: MessagePriority.HIGH,
      }
    );
    
    return result;
  }

  /**
   * 取消工作流
   */
  async cancelWorkflow(workflowId: string): Promise<boolean> {
    const result = await this.duplexClient.request<{ success: boolean }>(
      MESSAGE_TYPES.WORKFLOW.CANCEL,
      { workflowId }
    );
    
    return result.success;
  }

  /**
   * 暂停工作流
   */
  async pauseWorkflow(workflowId: string): Promise<boolean> {
    const result = await this.duplexClient.request<{ success: boolean }>(
      MESSAGE_TYPES.WORKFLOW.PAUSE,
      { workflowId }
    );
    
    return result.success;
  }

  /**
   * 恢复工作流
   */
  async resumeWorkflow(workflowId: string): Promise<boolean> {
    const result = await this.duplexClient.request<{ success: boolean }>(
      MESSAGE_TYPES.WORKFLOW.RESUME,
      { workflowId }
    );
    
    return result.success;
  }

  /**
   * 获取工作流状态
   */
  async getWorkflowStatus(workflowId: string): Promise<{
    workflow: Workflow;
    status: WorkflowStatus;
    currentStep?: number;
    steps: WorkflowStep[];
  } | null> {
    const result = await this.duplexClient.request<{
      workflow: Workflow;
      status: WorkflowStatus;
      currentStep?: number;
      steps: WorkflowStep[];
    } | null>(
      MESSAGE_TYPES.WORKFLOW.GET_STATUS,
      { workflowId }
    );
    
    return result;
  }

  /**
   * 获取工作流历史
   */
  async getWorkflowHistory(workflowId: string): Promise<{
    workflow: Workflow;
    executionHistory: Array<{
      stepIndex: number;
      status: WorkflowStepStatus;
      startedAt: number;
      completedAt?: number;
      result?: unknown;
      error?: string;
    }>;
  } | null> {
    const result = await this.duplexClient.request<{
      workflow: Workflow;
      executionHistory: Array<{
        stepIndex: number;
        status: WorkflowStepStatus;
        startedAt: number;
        completedAt?: number;
        result?: unknown;
        error?: string;
      }>;
    } | null>(
      MESSAGE_TYPES.WORKFLOW.GET_HISTORY,
      { workflowId }
    );
    
    return result;
  }

  /**
   * 响应工具请求 (从 SW 发来的工具执行请求)
   */
  async respondToToolRequest(
    requestId: string,
    result: unknown,
    error?: string
  ): Promise<void> {
    await this.duplexClient.push(
      MESSAGE_TYPES.WORKFLOW.TOOL_RESPONSE,
      'toolResponse',
      {
        requestId,
        result,
        error,
        timestamp: Date.now(),
      }
    );
  }

  /**
   * 执行画布操作
   */
  async executeCanvasOperation(operation: CanvasOperation): Promise<{
    success: boolean;
    result?: unknown;
    error?: string;
  }> {
    const result = await this.duplexClient.request<{
      success: boolean;
      result?: unknown;
      error?: string;
    }>(
      MESSAGE_TYPES.WORKFLOW.CANVAS_OPERATION,
      { operation },
      {
        timeout: 15000,
      }
    );
    
    return result;
  }

  /**
   * 监听工作流状态更新
   */
  onWorkflowStatusUpdate(callback: (workflowId: string, status: WorkflowStatus) => void): void {
    this.addEventListener('workflowStatusUpdate', callback);
  }

  /**
   * 监听工作流步骤更新
   */
  onWorkflowStepUpdate(callback: (
    workflowId: string,
    stepIndex: number,
    status: WorkflowStepStatus,
    result?: unknown,
    error?: string
  ) => void): void {
    this.addEventListener('workflowStepUpdate', callback);
  }

  /**
   * 监听工作流完成
   */
  onWorkflowCompleted(callback: (workflowId: string, result: unknown) => void): void {
    this.addEventListener('workflowCompleted', callback);
  }

  /**
   * 监听工作流失败
   */
  onWorkflowFailed(callback: (workflowId: string, error: string) => void): void {
    this.addEventListener('workflowFailed', callback);
  }

  /**
   * 监听工具执行请求 (SW 请求主线程执行工具)
   */
  onToolRequest(callback: (
    requestId: string,
    workflowId: string,
    stepIndex: number,
    toolCall: ToolCall
  ) => void): void {
    this.addEventListener('toolRequest', callback);
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(eventType: string, callback: Function): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(callback);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * 销毁适配器
   */
  destroy(): void {
    this.eventHandlers.clear();
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 添加事件监听器
   */
  private addEventListener(eventType: string, callback: Function): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(callback);
  }

  /**
   * 设置推送消息监听器
   */
  private setupEventListeners(): void {
    // 监听工作流状态更新
    this.duplexClient.onPush('workflowStatusUpdate').subscribe((message) => {
      const data = message.data as any;
      this.emitEvent('workflowStatusUpdate', data.workflowId, data.status);
    });

    // 监听工作流步骤更新
    this.duplexClient.onPush('workflowStepUpdate').subscribe((message) => {
      const data = message.data as any;
      this.emitEvent(
        'workflowStepUpdate',
        data.workflowId,
        data.stepIndex,
        data.status,
        data.result,
        data.error
      );
    });

    // 监听工作流完成
    this.duplexClient.onPush('workflowCompleted').subscribe((message) => {
      const data = message.data as any;
      this.emitEvent('workflowCompleted', data.workflowId, data.result);
    });

    // 监听工作流失败
    this.duplexClient.onPush('workflowFailed').subscribe((message) => {
      const data = message.data as any;
      this.emitEvent('workflowFailed', data.workflowId, data.error);
    });

    // 监听工具执行请求
    this.duplexClient.onPush('toolRequest').subscribe((message) => {
      const data = message.data as any;
      this.emitEvent(
        'toolRequest',
        data.requestId,
        data.workflowId,
        data.stepIndex,
        data.toolCall
      );
    });
  }

  /**
   * 触发事件
   */
  private emitEvent(eventType: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`[WorkflowAdapter] Event handler error for ${eventType}:`, error);
        }
      });
    }
  }
}

// ============================================================================
// Workflow 服务端适配器
// ============================================================================

export class WorkflowServerAdapter {
  private duplexServer: DuplexServer;
  private workflowExecutor: any; // 现有的 WorkflowExecutor 实例

  constructor(duplexServer: DuplexServer, workflowExecutor: any) {
    this.duplexServer = duplexServer;
    this.workflowExecutor = workflowExecutor;
    this.registerHandlers();
  }

  /**
   * 注册消息处理器
   */
  private registerHandlers(): void {
    // 工作流提交处理器
    this.duplexServer.registerHandler({
      name: 'workflow-submit',
      supportedTypes: [MESSAGE_TYPES.WORKFLOW.SUBMIT],
      canHandle: (type) => type === MESSAGE_TYPES.WORKFLOW.SUBMIT,
      handle: async (message) => {
        const { workflow } = message.data as any;
        const clientId = message.metadata?.sender || 'unknown';
        
        try {
          const result = await this.workflowExecutor.submitWorkflow(workflow, clientId);
          return result;
        } catch (error) {
          console.error('[WorkflowAdapter] Workflow submission failed:', error);
          throw error;
        }
      },
    });

    // 工作流取消处理器
    this.duplexServer.registerHandler({
      name: 'workflow-cancel',
      supportedTypes: [MESSAGE_TYPES.WORKFLOW.CANCEL],
      canHandle: (type) => type === MESSAGE_TYPES.WORKFLOW.CANCEL,
      handle: async (message) => {
        const { workflowId } = message.data as any;
        
        const success = await this.workflowExecutor.cancelWorkflow(workflowId);
        return { success };
      },
    });

    // 工作流暂停处理器
    this.duplexServer.registerHandler({
      name: 'workflow-pause',
      supportedTypes: [MESSAGE_TYPES.WORKFLOW.PAUSE],
      canHandle: (type) => type === MESSAGE_TYPES.WORKFLOW.PAUSE,
      handle: async (message) => {
        const { workflowId } = message.data as any;
        
        const success = await this.workflowExecutor.pauseWorkflow(workflowId);
        return { success };
      },
    });

    // 工作流恢复处理器
    this.duplexServer.registerHandler({
      name: 'workflow-resume',
      supportedTypes: [MESSAGE_TYPES.WORKFLOW.RESUME],
      canHandle: (type) => type === MESSAGE_TYPES.WORKFLOW.RESUME,
      handle: async (message) => {
        const { workflowId } = message.data as any;
        
        const success = await this.workflowExecutor.resumeWorkflow(workflowId);
        return { success };
      },
    });

    // 工作流状态查询处理器
    this.duplexServer.registerHandler({
      name: 'workflow-get-status',
      supportedTypes: [MESSAGE_TYPES.WORKFLOW.GET_STATUS],
      canHandle: (type) => type === MESSAGE_TYPES.WORKFLOW.GET_STATUS,
      handle: async (message) => {
        const { workflowId } = message.data as any;
        
        const status = await this.workflowExecutor.getWorkflowStatus(workflowId);
        return status;
      },
    });

    // 工作流历史查询处理器
    this.duplexServer.registerHandler({
      name: 'workflow-get-history',
      supportedTypes: [MESSAGE_TYPES.WORKFLOW.GET_HISTORY],
      canHandle: (type) => type === MESSAGE_TYPES.WORKFLOW.GET_HISTORY,
      handle: async (message) => {
        const { workflowId } = message.data as any;
        
        const history = await this.workflowExecutor.getWorkflowHistory(workflowId);
        return history;
      },
    });

    // 画布操作处理器
    this.duplexServer.registerHandler({
      name: 'workflow-canvas-operation',
      supportedTypes: [MESSAGE_TYPES.WORKFLOW.CANVAS_OPERATION],
      canHandle: (type) => type === MESSAGE_TYPES.WORKFLOW.CANVAS_OPERATION,
      handle: async (message) => {
        const { operation } = message.data as any;
        
        try {
          const result = await this.workflowExecutor.executeCanvasOperation(operation);
          return { success: true, result };
        } catch (error) {
          console.error('[WorkflowAdapter] Canvas operation failed:', error);
          return { success: false, error: (error as Error).message };
        }
      },
    });
  }

  /**
   * 推送工作流状态更新
   */
  async pushWorkflowStatusUpdate(
    workflowId: string,
    status: WorkflowStatus
  ): Promise<void> {
    await this.duplexServer.broadcast(
      MESSAGE_TYPES.WORKFLOW.STATUS_UPDATE,
      'workflowStatusUpdate',
      {
        workflowId,
        status,
        timestamp: Date.now(),
      }
    );
  }

  /**
   * 推送工作流步骤更新
   */
  async pushWorkflowStepUpdate(
    workflowId: string,
    stepIndex: number,
    status: WorkflowStepStatus,
    result?: unknown,
    error?: string
  ): Promise<void> {
    await this.duplexServer.broadcast(
      MESSAGE_TYPES.WORKFLOW.STEP_UPDATE,
      'workflowStepUpdate',
      {
        workflowId,
        stepIndex,
        status,
        result,
        error,
        timestamp: Date.now(),
      }
    );
  }

  /**
   * 推送工作流完成
   */
  async pushWorkflowCompleted(
    workflowId: string,
    result: unknown
  ): Promise<void> {
    await this.duplexServer.broadcast(
      MESSAGE_TYPES.WORKFLOW.COMPLETED,
      'workflowCompleted',
      {
        workflowId,
        result,
        timestamp: Date.now(),
      }
    );
  }

  /**
   * 推送工作流失败
   */
  async pushWorkflowFailed(
    workflowId: string,
    error: string
  ): Promise<void> {
    await this.duplexServer.broadcast(
      MESSAGE_TYPES.WORKFLOW.FAILED,
      'workflowFailed',
      {
        workflowId,
        error,
        timestamp: Date.now(),
      }
    );
  }

  /**
   * 请求主线程执行工具
   */
  async requestMainThreadTool(
    workflowId: string,
    stepIndex: number,
    toolCall: ToolCall
  ): Promise<unknown> {
    const requestId = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 发送工具执行请求
    await this.duplexServer.broadcast(
      MESSAGE_TYPES.WORKFLOW.TOOL_REQUEST,
      'toolRequest',
      {
        requestId,
        workflowId,
        stepIndex,
        toolCall,
        timestamp: Date.now(),
      }
    );

    // 等待工具响应 (通过监听推送消息)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Tool request timeout: ${requestId}`));
      }, 30000); // 30秒超时

      // 监听工具响应
      const subscription = this.duplexServer.observeMessages?.().subscribe?.((message: DuplexMessage) => {
        if (message.type === MESSAGE_TYPES.WORKFLOW.TOOL_RESPONSE) {
          const data = message.data as any;
          if (data.requestId === requestId) {
            clearTimeout(timeout);
            subscription?.unsubscribe?.();
            
            if (data.error) {
              reject(new Error(data.error));
            } else {
              resolve(data.result);
            }
          }
        }
      });
    });
  }
}

// ============================================================================
// 兼容性包装器
// ============================================================================

/**
 * 为现有代码提供兼容性包装器
 */
export class LegacyWorkflowWrapper {
  private adapter: WorkflowClientAdapter;

  constructor(adapter: WorkflowClientAdapter) {
    this.adapter = adapter;
  }

  // 兼容现有的 WorkflowClient 接口
  async submitWorkflow(workflow: Workflow): Promise<{ workflowId: string; status: WorkflowStatus }> {
    return this.adapter.submitWorkflow(workflow);
  }

  async cancelWorkflow(workflowId: string): Promise<boolean> {
    return this.adapter.cancelWorkflow(workflowId);
  }

  async getWorkflowStatus(workflowId: string) {
    return this.adapter.getWorkflowStatus(workflowId);
  }

  // 事件处理器设置
  setWorkflowHandlers(handlers: any): void {
    if (handlers.onStatusUpdate) {
      this.adapter.onWorkflowStatusUpdate(handlers.onStatusUpdate);
    }
    if (handlers.onStepUpdate) {
      this.adapter.onWorkflowStepUpdate(handlers.onStepUpdate);
    }
    if (handlers.onCompleted) {
      this.adapter.onWorkflowCompleted(handlers.onCompleted);
    }
    if (handlers.onFailed) {
      this.adapter.onWorkflowFailed(handlers.onFailed);
    }
    if (handlers.onToolRequest) {
      this.adapter.onToolRequest(handlers.onToolRequest);
    }
  }

  // 其他兼容方法...
}