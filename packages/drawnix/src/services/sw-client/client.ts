/**
 * Service Worker Task Queue Client
 *
 * Provides a high-level API for communicating with the Service Worker
 * task queue from the main thread.
 */

import { Subject, Observable, filter, map, take, firstValueFrom, timeout } from 'rxjs';
import type {
  GeminiConfig,
  VideoAPIConfig,
  TaskType,
  GenerationParams,
  TaskResult,
  TaskError,
  TaskStatus,
  TaskExecutionPhase,
  SWTask,
  ChatParams,
  MainToSWMessage,
  SWToMainMessage,
  TaskEventHandlers,
  ChatEventHandlers,
} from './types';

/**
 * Service Worker Task Queue Client
 */
export class SWTaskQueueClient {
  private static instance: SWTaskQueueClient | null = null;

  private initialized = false;
  private messageSubject = new Subject<SWToMainMessage>();
  private taskHandlers: TaskEventHandlers = {};
  private chatHandlers: Map<string, ChatEventHandlers> = new Map();
  private tasksSubject = new Subject<SWTask[]>();

  // Local task cache for fast access
  private localTaskCache: Map<string, SWTask> = new Map();

  // Store last config for re-sending when SW requests it
  private lastGeminiConfig: GeminiConfig | null = null;
  private lastVideoConfig: VideoAPIConfig | null = null;

  private constructor() {
    this.setupMessageListener();
    this.setupControllerChangeListener();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SWTaskQueueClient {
    if (!SWTaskQueueClient.instance) {
      SWTaskQueueClient.instance = new SWTaskQueueClient();
    }
    return SWTaskQueueClient.instance;
  }

  /**
   * Initialize the task queue with API configurations
   */
  async initialize(
    geminiConfig: GeminiConfig,
    videoConfig: VideoAPIConfig
  ): Promise<boolean> {
    // Store config for re-sending when SW requests it
    this.lastGeminiConfig = geminiConfig;
    this.lastVideoConfig = videoConfig;

    // 防止重复初始化
    if (this.initialized) {
      return true;
    }

    if (!this.isServiceWorkerSupported()) {
      console.warn('[SWClient] Service Worker not supported');
      return false;
    }

    // Wait for SW to be ready
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) {
      console.warn('[SWClient] No active Service Worker');
      return false;
    }

    // Send init message
    await this.postMessage({
      type: 'TASK_QUEUE_INIT',
      geminiConfig,
      videoConfig,
    });

    // Wait for initialization response
    return new Promise((resolve) => {
      const initTimeout = setTimeout(() => {
        // Even if we timeout, assume initialized if SW is active
        this.initialized = true;
        resolve(true);
      }, 5000);

      this.messageSubject
        .pipe(
          filter((msg) => msg.type === 'TASK_QUEUE_INITIALIZED'),
          take(1)
        )
        .subscribe((msg) => {
          clearTimeout(initTimeout);
          if (msg.type === 'TASK_QUEUE_INITIALIZED') {
            this.initialized = msg.success;
            resolve(msg.success);
          }
        });
    });
  }

  /**
   * Update API configurations
   */
  updateConfig(
    geminiConfig?: Partial<GeminiConfig>,
    videoConfig?: Partial<VideoAPIConfig>
  ): void {
    // Update stored config
    if (geminiConfig && this.lastGeminiConfig) {
      this.lastGeminiConfig = { ...this.lastGeminiConfig, ...geminiConfig };
    }
    if (videoConfig && this.lastVideoConfig) {
      this.lastVideoConfig = { ...this.lastVideoConfig, ...videoConfig };
    }

    this.postMessage({
      type: 'TASK_QUEUE_UPDATE_CONFIG',
      geminiConfig,
      videoConfig,
    });
  }

  /**
   * Submit a new task
   */
  submitTask(
    taskId: string,
    taskType: TaskType,
    params: GenerationParams
  ): void {
    // Add to local cache immediately
    const now = Date.now();
    const pendingTask: SWTask = {
      id: taskId,
      type: taskType,
      status: 'pending' as TaskStatus,
      params,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
    };
    this.localTaskCache.set(taskId, pendingTask);

    // Submit to SW
    this.postMessage({
      type: 'TASK_SUBMIT',
      taskId,
      taskType,
      params,
    });
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): void {
    // Update local cache
    const task = this.localTaskCache.get(taskId);
    if (task) {
      task.status = 'cancelled' as TaskStatus;
      task.updatedAt = Date.now();
    }

    this.postMessage({
      type: 'TASK_CANCEL',
      taskId,
    });
  }

  /**
   * Retry a failed task
   */
  retryTask(taskId: string): void {
    this.postMessage({
      type: 'TASK_RETRY',
      taskId,
    });
  }

  /**
   * Resume a task after page refresh
   */
  resumeTask(taskId: string, remoteId: string, taskType: TaskType): void {
    this.postMessage({
      type: 'TASK_RESUME',
      taskId,
      remoteId,
      taskType,
    });
  }

  /**
   * Delete a task
   */
  deleteTask(taskId: string): void {
    this.postMessage({
      type: 'TASK_DELETE',
      taskId,
    });
  }

  /**
   * Restore tasks from storage
   */
  async restoreTasks(tasks: SWTask[]): Promise<void> {
    await this.postMessage({
      type: 'TASK_RESTORE',
      tasks,
    });
  }

  /**
   * Mark a task as inserted to canvas
   */
  markTaskInserted(taskId: string): void {
    this.postMessage({
      type: 'TASK_MARK_INSERTED',
      taskId,
    });
  }

  /**
   * Start a chat stream
   */
  startChat(chatId: string, params: ChatParams, handlers: ChatEventHandlers): void {
    this.chatHandlers.set(chatId, handlers);
    this.postMessage({
      type: 'CHAT_START',
      chatId,
      params,
    });
  }

  /**
   * Stop a chat stream
   */
  stopChat(chatId: string): void {
    this.postMessage({
      type: 'CHAT_STOP',
      chatId,
    });
    this.chatHandlers.delete(chatId);
  }

  /**
   * Set task event handlers
   */
  setTaskHandlers(handlers: TaskEventHandlers): void {
    this.taskHandlers = handlers;
  }

  /**
   * Execute an MCP tool via Service Worker
   * Returns the result of the tool execution
   */
  async executeMCPTool(
    toolName: string,
    args: Record<string, unknown>,
    options?: {
      mode?: 'async' | 'queue';
      batchId?: string;
      batchIndex?: number;
      batchTotal?: number;
      timeoutMs?: number;
    }
  ): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
    type?: 'image' | 'video' | 'text' | 'canvas' | 'error';
    taskId?: string;
  }> {
    const requestId = `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timeoutMs = options?.timeoutMs || 60000; // Default 60 seconds

    // Send execute request to SW
    await this.postMessage({
      type: 'MCP_TOOL_EXECUTE',
      requestId,
      toolName,
      args,
      options: {
        mode: options?.mode,
        batchId: options?.batchId,
        batchIndex: options?.batchIndex,
        batchTotal: options?.batchTotal,
      },
    });

    // Wait for result
    try {
      const response = await firstValueFrom(
        this.messageSubject.pipe(
          filter((msg) => msg.type === 'MCP_TOOL_RESULT' && msg.requestId === requestId),
          take(1),
          timeout(timeoutMs)
        )
      );

      if (response.type === 'MCP_TOOL_RESULT') {
        return {
          success: response.success,
          data: response.data,
          error: response.error,
          type: response.resultType,
          taskId: response.taskId,
        };
      }

      return { success: false, error: 'Unexpected response type', type: 'error' };
    } catch (error: any) {
      if (error.name === 'TimeoutError') {
        return { success: false, error: `Tool execution timed out: ${toolName}`, type: 'error' };
      }
      return { success: false, error: error.message || 'Tool execution failed', type: 'error' };
    }
  }

  /**
   * Observe all messages from SW
   */
  observeMessages(): Observable<SWToMainMessage> {
    return this.messageSubject.asObservable();
  }

  /**
   * Observe task status updates
   */
  observeTaskStatus(taskId: string): Observable<{
    status: TaskStatus;
    progress?: number;
    phase?: TaskExecutionPhase;
  }> {
    return this.messageSubject.pipe(
      filter(
        (msg) =>
          msg.type === 'TASK_STATUS' && msg.taskId === taskId
      ),
      map((msg) => {
        if (msg.type === 'TASK_STATUS') {
          return {
            status: msg.status,
            progress: msg.progress,
            phase: msg.phase,
          };
        }
        throw new Error('Unexpected message type');
      })
    );
  }

  /**
   * Observe task completion
   */
  observeTaskCompletion(taskId: string): Observable<TaskResult> {
    return this.messageSubject.pipe(
      filter(
        (msg) =>
          msg.type === 'TASK_COMPLETED' && msg.taskId === taskId
      ),
      map((msg) => {
        if (msg.type === 'TASK_COMPLETED') {
          return msg.result;
        }
        throw new Error('Unexpected message type');
      }),
      take(1)
    );
  }

  /**
   * Observe task failure
   */
  observeTaskFailure(taskId: string): Observable<{
    error: TaskError;
    retryCount: number;
    nextRetryAt?: number;
  }> {
    return this.messageSubject.pipe(
      filter(
        (msg) =>
          msg.type === 'TASK_FAILED' && msg.taskId === taskId
      ),
      map((msg) => {
        if (msg.type === 'TASK_FAILED') {
          return {
            error: msg.error,
            retryCount: msg.retryCount,
            nextRetryAt: msg.nextRetryAt,
          };
        }
        throw new Error('Unexpected message type');
      })
    );
  }

  /**
   * Check if Service Worker is supported
   */
  isServiceWorkerSupported(): boolean {
    return 'serviceWorker' in navigator;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Request all tasks from SW (for sync after page load)
   */
  async requestAllTasks(): Promise<SWTask[]> {
    await this.postMessage({ type: 'TASK_GET_ALL' });

    try {
      const response = await firstValueFrom(
        this.messageSubject.pipe(
          filter((msg) => msg.type === 'TASK_ALL_RESPONSE'),
          take(1),
          timeout(5000)
        )
      );

      if (response.type === 'TASK_ALL_RESPONSE') {
        return response.tasks;
      }
      return [];
    } catch {
      console.warn('[SWClient] Timeout waiting for tasks response');
      return [];
    }
  }

  /**
   * Request paginated tasks from SW
   * @param options Pagination options
   * @returns Paginated tasks with metadata
   */
  async requestPaginatedTasks(options: {
    offset: number;
    limit: number;
    status?: TaskStatus;
    type?: TaskType;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    tasks: SWTask[];
    total: number;
    offset: number;
    hasMore: boolean;
  }> {
    await this.postMessage({
      type: 'TASK_GET_PAGINATED',
      offset: options.offset,
      limit: options.limit,
      filters: {
        status: options.status,
        type: options.type,
      },
      sortOrder: options.sortOrder,
    });

    try {
      const response = await firstValueFrom(
        this.messageSubject.pipe(
          filter((msg) => msg.type === 'TASK_PAGINATED_RESPONSE'),
          take(1),
          timeout(5000)
        )
      );

      if (response.type === 'TASK_PAGINATED_RESPONSE') {
        return {
          tasks: response.tasks,
          total: response.total,
          offset: response.offset,
          hasMore: response.hasMore,
        };
      }
      return { tasks: [], total: 0, offset: 0, hasMore: false };
    } catch {
      console.warn('[SWClient] Timeout waiting for paginated tasks response');
      return { tasks: [], total: 0, offset: 0, hasMore: false };
    }
  }

  /**
   * Observe tasks sync from SW
   */
  observeTasks(): Observable<SWTask[]> {
    return this.tasksSubject.asObservable();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Setup message listener
   */
  private setupMessageListener(): void {
    if (!this.isServiceWorkerSupported()) return;

    navigator.serviceWorker.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || !message.type) return;

      // Handle SW_REQUEST_CONFIG message - SW needs config to be re-sent
      if (message.type === 'SW_REQUEST_CONFIG') {
        // Re-send the stored config
        if (this.lastGeminiConfig && this.lastVideoConfig) {
          this.postMessage({
            type: 'TASK_QUEUE_INIT',
            geminiConfig: this.lastGeminiConfig,
            videoConfig: this.lastVideoConfig,
          });
        } else {
          console.warn('[SWClient] Cannot re-send config: no stored config');
        }
        return;
      }

      // Check if it's a task queue message
      if (!this.isTaskQueueMessage(message as SWToMainMessage)) return;

      // Emit to subject
      this.messageSubject.next(message as SWToMainMessage);

      // Call handlers
      this.handleMessage(message as SWToMainMessage);
    });
  }

  /**
   * Setup controller change listener for SW updates
   */
  private setupControllerChangeListener(): void {
    if (!this.isServiceWorkerSupported()) return;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // console.log('[SWClient] Controller changed, re-initializing...');
      // When SW is updated, we need to sync tasks
      this.requestAllTasks().then((tasks) => {
        if (tasks.length > 0) {
          this.tasksSubject.next(tasks);
          // Sync local cache
          this.syncLocalCache(tasks);
        }
      });
    });
  }

  /**
   * Sync local cache with tasks from SW
   */
  private syncLocalCache(tasks: SWTask[]): void {
    // Clear and rebuild cache
    this.localTaskCache.clear();

    for (const task of tasks) {
      this.localTaskCache.set(task.id, task);
    }
  }

  /**
   * Update local cache for a single task
   */
  private updateLocalCache(task: SWTask): void {
    this.localTaskCache.set(task.id, task);
  }

  /**
   * Check if message is from task queue
   */
  private isTaskQueueMessage(message: SWToMainMessage): boolean {
    const taskQueueTypes = [
      'TASK_QUEUE_INITIALIZED',
      'TASK_STATUS',
      'TASK_COMPLETED',
      'TASK_FAILED',
      'TASK_SUBMITTED',
      'TASK_CREATED',
      'TASK_CANCELLED',
      'TASK_DELETED',
      'TASK_STATUS_RESPONSE',
      'TASK_ALL_RESPONSE',
      'TASK_PAGINATED_RESPONSE',
      'CHAT_CHUNK',
      'CHAT_DONE',
      'CHAT_ERROR',
      'MAIN_THREAD_TOOL_REQUEST',
      'MCP_TOOL_RESULT',
    ];
    return taskQueueTypes.includes(message.type);
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: SWToMainMessage): void {
    switch (message.type) {
      case 'TASK_CREATED':
        // Update local cache
        this.updateLocalCache(message.task);
        this.taskHandlers.onCreated?.(message.task);
        break;

      case 'TASK_STATUS': {
        // Update local cache
        const task = this.localTaskCache.get(message.taskId);
        if (task) {
          task.status = message.status;
          task.progress = message.progress;
          task.updatedAt = message.updatedAt;
          this.updateLocalCache(task);
        }
        this.taskHandlers.onStatus?.(
          message.taskId,
          message.status,
          message.progress,
          message.phase
        );
        break;
      }

      case 'TASK_COMPLETED': {
        // console.log('[SWClient] Received TASK_COMPLETED:', message.taskId, 'result:', message.result);
        // Update local cache
        const completedTask = this.localTaskCache.get(message.taskId);
        if (completedTask) {
          completedTask.status = 'completed' as TaskStatus;
          completedTask.result = message.result;
          completedTask.completedAt = message.completedAt;
          this.updateLocalCache(completedTask);
        }
        this.taskHandlers.onCompleted?.(message.taskId, message.result);
        break;
      }

      case 'TASK_FAILED': {
        // Update local cache
        const failedTask = this.localTaskCache.get(message.taskId);
        if (failedTask) {
          failedTask.status = 'failed' as TaskStatus;
          failedTask.error = message.error;
          failedTask.retryCount = message.retryCount;
          this.updateLocalCache(failedTask);
        }
        this.taskHandlers.onFailed?.(
          message.taskId,
          message.error,
          message.retryCount,
          message.nextRetryAt
        );
        break;
      }

      case 'TASK_SUBMITTED':
        this.taskHandlers.onSubmitted?.(message.taskId, message.remoteId);
        break;

      case 'TASK_CANCELLED': {
        // Update local cache
        const cancelledTask = this.localTaskCache.get(message.taskId);
        if (cancelledTask) {
          cancelledTask.status = 'cancelled' as TaskStatus;
          this.updateLocalCache(cancelledTask);
        }
        this.taskHandlers.onCancelled?.(message.taskId);
        break;
      }

      case 'TASK_DELETED': {
        // Remove from local cache
        this.localTaskCache.delete(message.taskId);
        this.taskHandlers.onDeleted?.(message.taskId);
        break;
      }

      case 'TASK_ALL_RESPONSE':
        // Emit tasks to subject for observers
        this.tasksSubject.next(message.tasks);
        // Sync local cache
        this.syncLocalCache(message.tasks);
        this.taskHandlers.onTasksSync?.(message.tasks);
        break;

      case 'CHAT_CHUNK': {
        const chatHandlers = this.chatHandlers.get(message.chatId);
        chatHandlers?.onChunk?.(message.chatId, message.content);
        break;
      }

      case 'CHAT_DONE': {
        const chatHandlers = this.chatHandlers.get(message.chatId);
        chatHandlers?.onDone?.(message.chatId, message.fullContent);
        this.chatHandlers.delete(message.chatId);
        break;
      }

      case 'CHAT_ERROR': {
        const chatHandlers = this.chatHandlers.get(message.chatId);
        chatHandlers?.onError?.(message.chatId, message.error);
        this.chatHandlers.delete(message.chatId);
        break;
      }

      case 'MAIN_THREAD_TOOL_REQUEST':
        this.handleMainThreadToolRequest(message);
        break;
    }
  }

  /**
   * Handle main thread tool request from SW
   */
  private async handleMainThreadToolRequest(message: {
    type: 'MAIN_THREAD_TOOL_REQUEST';
    requestId: string;
    workflowId: string;
    stepId: string;
    toolName: string;
    args: Record<string, unknown>;
  }): Promise<void> {
    const { requestId, toolName, args } = message;
    // console.log('[SWClient] ◀ Received main thread tool request:', toolName, requestId);

    try {
      // Dynamic import to avoid circular dependencies
      const { swCapabilitiesHandler } = await import('../sw-capabilities');

      // Execute the delegated operation
      const result = await swCapabilitiesHandler.execute({
        operation: toolName as any,
        args,
        requestId,
        workflowId: message.workflowId,
        stepId: message.stepId,
      });

      // console.log('[SWClient] ▶ Sending tool response:', toolName, result.success);
      // Send response back to SW
      await this.postMessage({
        type: 'MAIN_THREAD_TOOL_RESPONSE',
        requestId,
        success: result.success,
        result: result.data,
        error: result.error,
        addSteps: result.addSteps,
        taskId: result.taskId,
        taskIds: result.taskIds,
      } as any);
    } catch (error: any) {
      console.error('[SWClient] ✗ Tool execution error:', toolName, error.message);
      // Send error response
      await this.postMessage({
        type: 'MAIN_THREAD_TOOL_RESPONSE',
        requestId,
        success: false,
        error: error.message || 'Unknown error',
      } as any);
    }
  }

  /**
   * Post message to Service Worker
   */
  private async postMessage(message: MainToSWMessage): Promise<void> {
    if (!this.isServiceWorkerSupported()) {
      console.warn('[SWClient] Service Worker not supported');
      return;
    }

    // Try to get controller, if not available wait for SW ready
    let controller = navigator.serviceWorker.controller;
    if (!controller) {
      // Wait for SW to be ready and get the active worker
      const registration = await navigator.serviceWorker.ready;
      controller = registration.active;
      if (!controller) {
        console.warn('[SWClient] No active Service Worker after ready');
        return;
      }
    }

    controller.postMessage(message);
  }
}

// Export singleton instance getter
export const swTaskQueueClient = SWTaskQueueClient.getInstance();
