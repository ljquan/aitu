/**
 * TaskQueue Adapter
 * 
 * 将现有的 TaskQueue 系统适配到双工通讯机制
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
  adaptTaskQueueMessage,
} from '../core/protocol';
import { DuplexClient } from '../core/client';
import { DuplexServer } from '../core/server';

// 导入现有 TaskQueue 类型 (兼容现有系统)
import type {
  TaskType,
  TaskStatus,
  GenerationParams,
  TaskResult,
  TaskError,
  SWTask,
  GeminiConfig,
  VideoAPIConfig,
} from '../../../sw/task-queue/types';

// ============================================================================
// TaskQueue 客户端适配器
// ============================================================================

export class TaskQueueClientAdapter {
  private duplexClient: DuplexClient;
  private eventHandlers = new Map<string, Function[]>();

  constructor(duplexClient: DuplexClient) {
    this.duplexClient = duplexClient;
    this.setupEventListeners();
  }

  /**
   * 初始化任务队列
   */
  async initialize(
    geminiConfig: GeminiConfig,
    videoConfig: VideoAPIConfig
  ): Promise<boolean> {
    try {
      const result = await this.duplexClient.request<{ success: boolean }>(
        MESSAGE_TYPES.TASK.INIT,
        {
          geminiConfig,
          videoConfig,
        },
        {
          timeout: 10000,
          priority: MessagePriority.HIGH,
        }
      );
      
      return result.success;
    } catch (error) {
      console.error('[TaskQueueAdapter] Initialization failed:', error);
      return false;
    }
  }

  /**
   * 更新配置
   */
  async updateConfig(
    geminiConfig?: Partial<GeminiConfig>,
    videoConfig?: Partial<VideoAPIConfig>
  ): Promise<void> {
    await this.duplexClient.request(
      MESSAGE_TYPES.TASK.UPDATE_CONFIG,
      {
        geminiConfig,
        videoConfig,
      },
      {
        priority: MessagePriority.HIGH,
      }
    );
  }

  /**
   * 提交任务
   */
  async submitTask(
    taskId: string,
    taskType: TaskType,
    params: GenerationParams
  ): Promise<SWTask> {
    const result = await this.duplexClient.request<SWTask>(
      MESSAGE_TYPES.TASK.SUBMIT,
      {
        taskId,
        taskType,
        params,
      },
      {
        timeout: 30000,
      }
    );
    
    return result;
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const result = await this.duplexClient.request<{ success: boolean }>(
      MESSAGE_TYPES.TASK.CANCEL,
      { taskId }
    );
    
    return result.success;
  }

  /**
   * 重试任务
   */
  async retryTask(taskId: string): Promise<SWTask> {
    const result = await this.duplexClient.request<SWTask>(
      MESSAGE_TYPES.TASK.RETRY,
      { taskId }
    );
    
    return result;
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string): Promise<boolean> {
    const result = await this.duplexClient.request<{ success: boolean }>(
      MESSAGE_TYPES.TASK.DELETE,
      { taskId }
    );
    
    return result.success;
  }

  /**
   * 获取任务状态
   */
  async getTaskStatus(taskId: string): Promise<SWTask | null> {
    const result = await this.duplexClient.request<{ task: SWTask | null }>(
      MESSAGE_TYPES.TASK.GET_STATUS,
      { taskId }
    );
    
    return result.task;
  }

  /**
   * 获取所有任务
   */
  async getAllTasks(): Promise<SWTask[]> {
    const result = await this.duplexClient.request<{ tasks: SWTask[] }>(
      MESSAGE_TYPES.TASK.GET_ALL,
      {}
    );
    
    return result.tasks;
  }

  /**
   * 获取分页任务
   */
  async getPaginatedTasks(
    offset: number,
    limit: number,
    filters?: {
      status?: TaskStatus;
      type?: TaskType;
    }
  ): Promise<{
    tasks: SWTask[];
    total: number;
    hasMore: boolean;
  }> {
    const result = await this.duplexClient.request<{
      tasks: SWTask[];
      total: number;
      hasMore: boolean;
    }>(
      MESSAGE_TYPES.TASK.GET_PAGINATED,
      {
        offset,
        limit,
        filters,
      }
    );
    
    return result;
  }

  /**
   * 批量提交任务
   */
  async submitBatchTasks(
    tasks: Array<{
      taskId: string;
      taskType: TaskType;
      params: GenerationParams;
    }>
  ): Promise<SWTask[]> {
    const result = await this.duplexClient.request<{ tasks: SWTask[] }>(
      MESSAGE_TYPES.TASK.BATCH_SUBMIT,
      { tasks },
      {
        timeout: 60000, // 批量操作需要更长时间
      }
    );
    
    return result.tasks;
  }

  /**
   * 批量取消任务
   */
  async cancelBatchTasks(taskIds: string[]): Promise<{
    cancelled: string[];
    failed: string[];
  }> {
    const result = await this.duplexClient.request<{
      cancelled: string[];
      failed: string[];
    }>(
      MESSAGE_TYPES.TASK.BATCH_CANCEL,
      { taskIds }
    );
    
    return result;
  }

  /**
   * 监听任务状态更新
   */
  onTaskStatusUpdate(callback: (taskId: string, status: TaskStatus, progress?: number) => void): void {
    this.addEventListener('taskStatusUpdate', callback);
  }

  /**
   * 监听任务完成
   */
  onTaskCompleted(callback: (taskId: string, result: TaskResult) => void): void {
    this.addEventListener('taskCompleted', callback);
  }

  /**
   * 监听任务失败
   */
  onTaskFailed(callback: (taskId: string, error: TaskError) => void): void {
    this.addEventListener('taskFailed', callback);
  }

  /**
   * 监听任务进度
   */
  onTaskProgress(callback: (taskId: string, progress: number, phase?: string) => void): void {
    this.addEventListener('taskProgress', callback);
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
    // 监听任务状态更新
    this.duplexClient.onPush('taskStatusUpdate').subscribe((message) => {
      const data = message.data as any;
      this.emitEvent('taskStatusUpdate', data.taskId, data.status, data.progress);
    });

    // 监听任务完成
    this.duplexClient.onPush('taskCompleted').subscribe((message) => {
      const data = message.data as any;
      this.emitEvent('taskCompleted', data.taskId, data.result);
    });

    // 监听任务失败
    this.duplexClient.onPush('taskFailed').subscribe((message) => {
      const data = message.data as any;
      this.emitEvent('taskFailed', data.taskId, data.error);
    });

    // 监听任务进度
    this.duplexClient.onPush('taskProgress').subscribe((message) => {
      const data = message.data as any;
      this.emitEvent('taskProgress', data.taskId, data.progress, data.phase);
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
          console.error(`[TaskQueueAdapter] Event handler error for ${eventType}:`, error);
        }
      });
    }
  }
}

// ============================================================================
// TaskQueue 服务端适配器
// ============================================================================

export class TaskQueueServerAdapter {
  private duplexServer: DuplexServer;
  private taskQueueInstance: any; // 现有的 TaskQueue 实例

  constructor(duplexServer: DuplexServer, taskQueueInstance: any) {
    this.duplexServer = duplexServer;
    this.taskQueueInstance = taskQueueInstance;
    this.registerHandlers();
  }

  /**
   * 注册消息处理器
   */
  private registerHandlers(): void {
    // 初始化处理器
    this.duplexServer.registerHandler({
      name: 'task-init',
      supportedTypes: [MESSAGE_TYPES.TASK.INIT],
      canHandle: (type) => type === MESSAGE_TYPES.TASK.INIT,
      handle: async (message) => {
        const { geminiConfig, videoConfig } = message.data as any;
        
        try {
          await this.taskQueueInstance.initialize(geminiConfig, videoConfig);
          return { success: true };
        } catch (error) {
          console.error('[TaskQueueAdapter] Initialization failed:', error);
          throw error;
        }
      },
    });

    // 配置更新处理器
    this.duplexServer.registerHandler({
      name: 'task-update-config',
      supportedTypes: [MESSAGE_TYPES.TASK.UPDATE_CONFIG],
      canHandle: (type) => type === MESSAGE_TYPES.TASK.UPDATE_CONFIG,
      handle: async (message) => {
        const { geminiConfig, videoConfig } = message.data as any;
        
        this.taskQueueInstance.updateConfig(geminiConfig, videoConfig);
        return { success: true };
      },
    });

    // 任务提交处理器
    this.duplexServer.registerHandler({
      name: 'task-submit',
      supportedTypes: [MESSAGE_TYPES.TASK.SUBMIT],
      canHandle: (type) => type === MESSAGE_TYPES.TASK.SUBMIT,
      handle: async (message) => {
        const { taskId, taskType, params } = message.data as any;
        const clientId = message.metadata?.sender || 'unknown';
        
        const task = await this.taskQueueInstance.submitTask(taskId, taskType, params, clientId);
        return task;
      },
    });

    // 任务取消处理器
    this.duplexServer.registerHandler({
      name: 'task-cancel',
      supportedTypes: [MESSAGE_TYPES.TASK.CANCEL],
      canHandle: (type) => type === MESSAGE_TYPES.TASK.CANCEL,
      handle: async (message) => {
        const { taskId } = message.data as any;
        
        const success = await this.taskQueueInstance.cancelTask(taskId);
        return { success };
      },
    });

    // 任务重试处理器
    this.duplexServer.registerHandler({
      name: 'task-retry',
      supportedTypes: [MESSAGE_TYPES.TASK.RETRY],
      canHandle: (type) => type === MESSAGE_TYPES.TASK.RETRY,
      handle: async (message) => {
        const { taskId } = message.data as any;
        
        const task = await this.taskQueueInstance.retryTask(taskId);
        return task;
      },
    });

    // 任务删除处理器
    this.duplexServer.registerHandler({
      name: 'task-delete',
      supportedTypes: [MESSAGE_TYPES.TASK.DELETE],
      canHandle: (type) => type === MESSAGE_TYPES.TASK.DELETE,
      handle: async (message) => {
        const { taskId } = message.data as any;
        
        const success = await this.taskQueueInstance.deleteTask(taskId);
        return { success };
      },
    });

    // 任务状态查询处理器
    this.duplexServer.registerHandler({
      name: 'task-get-status',
      supportedTypes: [MESSAGE_TYPES.TASK.GET_STATUS],
      canHandle: (type) => type === MESSAGE_TYPES.TASK.GET_STATUS,
      handle: async (message) => {
        const { taskId } = message.data as any;
        
        const task = await this.taskQueueInstance.getTask(taskId);
        return { task };
      },
    });

    // 获取所有任务处理器
    this.duplexServer.registerHandler({
      name: 'task-get-all',
      supportedTypes: [MESSAGE_TYPES.TASK.GET_ALL],
      canHandle: (type) => type === MESSAGE_TYPES.TASK.GET_ALL,
      handle: async () => {
        const tasks = await this.taskQueueInstance.getAllTasks();
        return { tasks };
      },
    });

    // 分页获取任务处理器
    this.duplexServer.registerHandler({
      name: 'task-get-paginated',
      supportedTypes: [MESSAGE_TYPES.TASK.GET_PAGINATED],
      canHandle: (type) => type === MESSAGE_TYPES.TASK.GET_PAGINATED,
      handle: async (message) => {
        const { offset, limit, filters } = message.data as any;
        
        const result = await this.taskQueueInstance.getPaginatedTasks(offset, limit, filters);
        return result;
      },
    });

    // 批量提交任务处理器
    this.duplexServer.registerHandler({
      name: 'task-batch-submit',
      supportedTypes: [MESSAGE_TYPES.TASK.BATCH_SUBMIT],
      canHandle: (type) => type === MESSAGE_TYPES.TASK.BATCH_SUBMIT,
      handle: async (message) => {
        const { tasks } = message.data as any;
        const clientId = message.metadata?.sender || 'unknown';
        
        const results = [];
        for (const taskData of tasks) {
          const task = await this.taskQueueInstance.submitTask(
            taskData.taskId,
            taskData.taskType,
            taskData.params,
            clientId
          );
          results.push(task);
        }
        
        return { tasks: results };
      },
    });

    // 批量取消任务处理器
    this.duplexServer.registerHandler({
      name: 'task-batch-cancel',
      supportedTypes: [MESSAGE_TYPES.TASK.BATCH_CANCEL],
      canHandle: (type) => type === MESSAGE_TYPES.TASK.BATCH_CANCEL,
      handle: async (message) => {
        const { taskIds } = message.data as any;
        
        const cancelled: string[] = [];
        const failed: string[] = [];
        
        for (const taskId of taskIds) {
          try {
            const success = await this.taskQueueInstance.cancelTask(taskId);
            if (success) {
              cancelled.push(taskId);
            } else {
              failed.push(taskId);
            }
          } catch (error) {
            failed.push(taskId);
          }
        }
        
        return { cancelled, failed };
      },
    });
  }

  /**
   * 推送任务状态更新
   */
  async pushTaskStatusUpdate(
    taskId: string,
    status: TaskStatus,
    progress?: number,
    phase?: string
  ): Promise<void> {
    await this.duplexServer.broadcast(
      MESSAGE_TYPES.TASK.STATUS_UPDATE,
      'taskStatusUpdate',
      {
        taskId,
        status,
        progress,
        phase,
        timestamp: Date.now(),
      }
    );
  }

  /**
   * 推送任务完成
   */
  async pushTaskCompleted(taskId: string, result: TaskResult): Promise<void> {
    await this.duplexServer.broadcast(
      MESSAGE_TYPES.TASK.COMPLETED,
      'taskCompleted',
      {
        taskId,
        result,
        timestamp: Date.now(),
      }
    );
  }

  /**
   * 推送任务失败
   */
  async pushTaskFailed(taskId: string, error: TaskError): Promise<void> {
    await this.duplexServer.broadcast(
      MESSAGE_TYPES.TASK.FAILED,
      'taskFailed',
      {
        taskId,
        error,
        timestamp: Date.now(),
      }
    );
  }

  /**
   * 推送任务进度
   */
  async pushTaskProgress(
    taskId: string,
    progress: number,
    phase?: string
  ): Promise<void> {
    await this.duplexServer.broadcast(
      MESSAGE_TYPES.TASK.PROGRESS,
      'taskProgress',
      {
        taskId,
        progress,
        phase,
        timestamp: Date.now(),
      }
    );
  }
}

// ============================================================================
// 兼容性包装器
// ============================================================================

/**
 * 为现有代码提供兼容性包装器
 */
export class LegacyTaskQueueWrapper {
  private adapter: TaskQueueClientAdapter;

  constructor(adapter: TaskQueueClientAdapter) {
    this.adapter = adapter;
  }

  // 兼容现有的 SWTaskQueueClient 接口
  async initialize(geminiConfig: GeminiConfig, videoConfig: VideoAPIConfig): Promise<boolean> {
    return this.adapter.initialize(geminiConfig, videoConfig);
  }

  updateConfig(geminiConfig?: Partial<GeminiConfig>, videoConfig?: Partial<VideoAPIConfig>): void {
    this.adapter.updateConfig(geminiConfig, videoConfig);
  }

  submitTask(taskId: string, taskType: TaskType, params: GenerationParams): void {
    this.adapter.submitTask(taskId, taskType, params);
  }

  cancelTask(taskId: string): void {
    this.adapter.cancelTask(taskId);
  }

  retryTask(taskId: string): void {
    this.adapter.retryTask(taskId);
  }

  // 事件处理器设置
  setTaskHandlers(handlers: any): void {
    if (handlers.onStatus) {
      this.adapter.onTaskStatusUpdate(handlers.onStatus);
    }
    if (handlers.onCompleted) {
      this.adapter.onTaskCompleted(handlers.onCompleted);
    }
    if (handlers.onFailed) {
      this.adapter.onTaskFailed(handlers.onFailed);
    }
  }

  // 其他兼容方法...
}