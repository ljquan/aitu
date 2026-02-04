/**
 * Service Worker Task Queue Service
 *
 * Delegates task execution to the Service Worker.
 *
 * Design principle: SW is the single source of truth for task data.
 * This service maintains a read-only view of SW's task state,
 * updated entirely through SW push notifications.
 * 
 * Uses postmessage-duplex for reliable duplex communication.
 */

import { Subject, Observable } from 'rxjs';
import {
  Task,
  TaskStatus,
  TaskType,
  TaskEvent,
  GenerationParams,
  TaskExecutionPhase,
  TaskResult,
  TaskError,
} from '../types/task.types';
import { generateTaskId } from '../utils/task-utils';
import {
  validateGenerationParams,
  sanitizeGenerationParams,
} from '../utils/validation-utils';
import { swChannelClient, SWTask } from './sw-channel';
import { geminiSettings, settingsManager } from '../utils/settings-manager';
import { taskStorageReader } from './task-storage-reader';
import {
  executorFactory,
  taskStorageWriter,
  waitForTaskCompletion,
} from './media-executor';

/**
 * Service Worker Task Queue Service
 */
class SWTaskQueueService {
  private static instance: SWTaskQueueService;
  /** Read-only view of SW's task state, updated via SW push */
  private tasks: Map<string, Task>;
  private taskUpdates$: Subject<TaskEvent>;
  private initialized = false;
  /** Lock to prevent concurrent initialization */
  private initializingPromise: Promise<boolean> | null = null;
  /** Flag to prevent duplicate visibility listener registration */
  private visibilityListenerRegistered = false;

  private constructor() {
    this.tasks = new Map();
    this.taskUpdates$ = new Subject();

    // Setup SW client handlers
    this.setupSWClientHandlers();
  }

  static getInstance(): SWTaskQueueService {
    if (!SWTaskQueueService.instance) {
      SWTaskQueueService.instance = new SWTaskQueueService();
    }
    return SWTaskQueueService.instance;
  }

  /**
   * 设置 visibility 变化监听器
   * 当页面变为可见时，主动从 SW 同步任务状态
   * 这样即使事件丢失（如 SW 更新），也能获取到最新状态
   */
  private setupVisibilityListener(): void {
    if (typeof document === 'undefined') return;
    if (this.visibilityListenerRegistered) return;
    
    this.visibilityListenerRegistered = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.initialized) {
        // 页面变为可见时，静默同步任务状态
        this.syncTasksFromSW().catch(() => {
          // 静默忽略错误
        });
      }
    });
  }

  /**
   * Initialize the service with API configurations
   * Uses a lock to prevent concurrent initialization attempts
   */
  async initialize(): Promise<boolean> {
    // Already initialized
    if (this.initialized) return true;

    // If initialization is in progress, wait for it
    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    // Start initialization with lock
    this.initializingPromise = this.doInitialize();
    
    try {
      return await this.initializingPromise;
    } finally {
      this.initializingPromise = null;
    }
  }

  /**
   * Internal initialization logic
   */
  private async doInitialize(): Promise<boolean> {
    try {
      // Wait for settings manager to finish decrypting sensitive data
      await settingsManager.waitForInitialization();
      
      const settings = geminiSettings.get();
      if (!settings.apiKey || !settings.baseUrl) {
        return false;
      }

      // Initialize SW channel
      const success = await swChannelClient.initialize();
      if (!success) {
        return false;
      }

      // Initialize SW with config
      const initResult = await swChannelClient.init({
        geminiConfig: {
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl,
          modelName: settings.imageModelName,
          textModelName: settings.textModelName,
        },
        videoConfig: {
          baseUrl: settings.baseUrl || 'https://api.tu-zi.com',
          apiKey: settings.apiKey,
        },
      });

      this.initialized = initResult.success;
      if (this.initialized) {
        // 设置 visibility 监听器，页面可见时同步状态
        this.setupVisibilityListener();
      }
      return this.initialized;
    } catch {
      return false;
    }
  }

  /**
   * Check if the service is initialized (SW init RPC succeeded)
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Re-initialize SW (for cases where init RPC timed out but channel is ready)
   * This is a public wrapper around doInitialize that resets the initialized flag
   */
  async initializeSW(): Promise<boolean> {
    // Reset initialized flag to allow re-initialization
    this.initialized = false;
    return this.initialize();
  }

  /**
   * Creates a new task and submits it to the Service Worker
   */
  createTask(params: GenerationParams, type: TaskType): Task {
    const validation = validateGenerationParams(params, type);
    if (!validation.valid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
    }

    const sanitizedParams = sanitizeGenerationParams(params);

    // Create task locally for immediate UI feedback
    const now = Date.now();
    const task: Task = {
      id: generateTaskId(),
      type,
      status: TaskStatus.PROCESSING,
      params: sanitizedParams,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      executionPhase: TaskExecutionPhase.SUBMITTING,
      ...(type === TaskType.VIDEO && { progress: 0 }),
    };

    this.tasks.set(task.id, task);
    this.emitEvent('taskCreated', task);

    // Submit to SW
    this.submitToSW(task);

    return task;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取内存中已加载的任务
   * 注意：由于分页机制，这只返回已加载的任务（默认第一页50条）
   * 如需获取所有任务，请使用 getAllTasksFromSW()
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取所有任务（用于备份/同步）
   * 直接从 IndexedDB 读取，无 postMessage 大小限制
   * @param options 可选过滤条件
   */
  async getAllTasksFromSW(options?: { status?: TaskStatus; type?: TaskType }): Promise<Task[]> {
    try {
      if (await taskStorageReader.isAvailable()) {
        return taskStorageReader.getAllTasks(options);
      }
    } catch (error) {
      console.warn('[SWTaskQueue] Failed to read from IndexedDB:', error);
    }

    // Fallback: 返回内存中的任务
    let tasks = this.getAllTasks();
    if (options?.status !== undefined) {
      tasks = tasks.filter(t => t.status === options.status);
    }
    if (options?.type !== undefined) {
      tasks = tasks.filter(t => t.type === options.type);
    }
    return tasks;
  }

  /**
   * 获取内存中已加载的指定状态的任务
   * 注意：由于分页机制，这只返回已加载的任务
   * 如需获取所有任务，请使用 getAllTasksFromSW({ status })
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    return this.getAllTasks().filter((t) => t.status === status);
  }

  async cancelTask(taskId: string): Promise<void> {
    if (!this.tasks.has(taskId)) return;
    await swChannelClient.cancelTask(taskId);
  }

  async retryTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || (task.status !== TaskStatus.FAILED && task.status !== TaskStatus.CANCELLED)) {
      return;
    }
    await swChannelClient.retryTask(taskId);
  }

  async deleteTask(taskId: string): Promise<void> {
    await swChannelClient.deleteTask(taskId);
    if (this.tasks.has(taskId)) {
      const task = this.tasks.get(taskId)!;
      this.tasks.delete(taskId);
      this.emitEvent('taskDeleted', task);
    }
  }

  clearCompletedTasks(): void {
    this.getTasksByStatus(TaskStatus.COMPLETED).forEach((task) => this.deleteTask(task.id));
  }

  clearFailedTasks(): void {
    this.getTasksByStatus(TaskStatus.FAILED).forEach((task) => this.deleteTask(task.id));
  }

  /**
   * Restore tasks from storage (for cloud sync or migration)
   * 恢复任务到本地状态、持久化到 SW 并通知 UI 更新
   */
  async restoreTasks(tasks: Task[]): Promise<void> {
    // 过滤出本地不存在的任务
    const tasksToRestore = tasks.filter(task => !this.tasks.has(task.id));

    if (tasksToRestore.length === 0) {
      return;
    }

    // 转换为 SWTask 格式并导入到 SW
    const swTasks: SWTask[] = tasksToRestore.map(task => this.convertTaskToSWTask(task));

    // 调用 SW 的 importTasks 方法持久化任务
    const result = await swChannelClient.importTasks(swTasks);
    
    if (result.success) {
      // 添加到本地内存
      for (const task of tasksToRestore) {
        this.tasks.set(task.id, task);
        this.emitEvent('taskCreated', task);
      }
      
      // 更新分页状态
      this.paginationState.total = this.tasks.size;
      this.paginationState.loadedCount = this.tasks.size;
    } else {
      console.error('[SWTaskQueue] Failed to import tasks:', result.error);
    }
  }
  
  /**
   * 将 Task 转换为 SWTask 格式
   */
  private convertTaskToSWTask(task: Task): SWTask {
    return {
      id: task.id,
      type: task.type as 'image' | 'video',
      params: task.params as SWTask['params'],
      status: task.status as SWTask['status'],
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      result: task.result,
      error: task.error,
      progress: task.progress,
      phase: task.executionPhase as SWTask['phase'],
      insertedToCanvas: task.insertedToCanvas,
    };
  }

  /** 分页状态 */
  private paginationState = {
    total: 0,
    loadedCount: 0,
    hasMore: true,
    pageSize: 50,
  };

  /**
   * Sync tasks from IndexedDB to local state
   * 只加载第一页，避免内存溢出
   */
  async syncTasksFromSW(): Promise<void> {
    try {
      if (await taskStorageReader.isAvailable()) {
        // 获取所有任务并只取第一页
        const allTasks = await taskStorageReader.getAllTasks();
        const firstPageTasks = allTasks.slice(0, this.paginationState.pageSize);
        
        // 清空现有任务，重新加载
        this.tasks.clear();
        
        for (const task of firstPageTasks) {
          this.tasks.set(task.id, task);
        }
        
        // 更新分页状态
        this.paginationState.total = allTasks.length;
        this.paginationState.loadedCount = firstPageTasks.length;
        this.paginationState.hasMore = firstPageTasks.length < allTasks.length;
        
        // 如果同步到任务数据，标记为已初始化
        if (this.paginationState.loadedCount > 0 && !this.initialized) {
          this.initialized = true;
          this.setupVisibilityListener();
        }
      }
    } catch {
      // 静默忽略同步错误
    }
  }

  /**
   * 加载更多任务（分页）
   * @returns 是否还有更多数据
   */
  async loadMoreTasks(): Promise<boolean> {
    if (!this.paginationState.hasMore) {
      return false;
    }

    try {
      if (await taskStorageReader.isAvailable()) {
        const allTasks = await taskStorageReader.getAllTasks();
        const offset = this.paginationState.loadedCount;
        const limit = this.paginationState.pageSize;
        const nextPageTasks = allTasks.slice(offset, offset + limit);

        // 追加新任务
        for (const task of nextPageTasks) {
          if (!this.tasks.has(task.id)) {
            this.tasks.set(task.id, task);
          }
        }

        // 更新分页状态
        this.paginationState.total = allTasks.length;
        this.paginationState.loadedCount += nextPageTasks.length;
        this.paginationState.hasMore = this.paginationState.loadedCount < allTasks.length;

        // 通知 UI 更新
        this.emitEvent('taskSynced', Array.from(this.tasks.values())[0] || ({} as Task));

        return this.paginationState.hasMore;
      }
    } catch {
      // 静默忽略错误
    }
    
    return false;
  }

  /**
   * 获取分页状态
   */
  getPaginationState(): { total: number; loadedCount: number; hasMore: boolean } {
    return {
      total: this.paginationState.total,
      loadedCount: this.paginationState.loadedCount,
      hasMore: this.paginationState.hasMore,
    };
  }

  /**
   * 按类型加载任务（用于弹窗中的任务列表）
   * 优先直接从 IndexedDB 读取，避免 postMessage 的 1MB 限制
   * 
   * @param type 任务类型（image/video）
   * @param offset 偏移量
   * @param limit 每页数量
   * @returns 分页结果
   */
  async loadTasksByType(
    type: TaskType,
    offset = 0,
    limit = 50
  ): Promise<{ 
    success: boolean; 
    tasks: Task[]; 
    total: number; 
    hasMore: boolean;
  }> {
    // 直接从 IndexedDB 读取
    try {
      if (await taskStorageReader.isAvailable()) {
        const result = await taskStorageReader.getTasksByType(type, offset, limit);
        return {
          success: true,
          tasks: result.tasks,
          total: result.total,
          hasMore: result.hasMore,
        };
      }
    } catch (error) {
      console.warn('[SWTaskQueue] Failed to read from IndexedDB:', error);
    }
    
    // Fallback: 返回空结果
    return { success: false, tasks: [], total: 0, hasMore: false };
  }

  /**
   * Marks a task as saved to the media library (local-only flag)
   */
  markAsSaved(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const updatedTask: Task = {
      ...task,
      savedToLibrary: true,
      updatedAt: Date.now(),
    };
    this.tasks.set(taskId, updatedTask);
    this.emitEvent('taskUpdated', updatedTask);
  }

  /**
   * Marks a task as inserted to canvas (local-only flag, persisted to SW)
   */
  markAsInserted(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const updatedTask: Task = {
      ...task,
      insertedToCanvas: true,
      updatedAt: Date.now(),
    };
    this.tasks.set(taskId, updatedTask);
    swChannelClient.markTaskInserted(taskId);
  }

  observeTaskUpdates(): Observable<TaskEvent> {
    return this.taskUpdates$.asObservable();
  }

  isServiceWorkerAvailable(): boolean {
    return 'serviceWorker' in navigator;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private setupSWClientHandlers(): void {
    swChannelClient.setEventHandlers({
      onTaskCreated: (event) => this.handleSWTaskCreated(event.task),
      onTaskStatus: (event) => this.handleSWStatus(event.taskId, event.status as TaskStatus, event.progress, event.phase as TaskExecutionPhase),
      onTaskCompleted: (event) => this.handleSWCompleted(event.taskId, event.result as TaskResult, event.remoteId),
      onTaskFailed: (event) => this.handleSWFailed(event.taskId, event.error as TaskError),
      onTaskCancelled: (taskId) => this.handleSWCancelled(taskId),
      onTaskDeleted: (taskId) => this.handleSWDeleted(taskId),
    });
  }

  private handleSWTaskCreated(swTask: SWTask): void {
    const task = this.convertSWTaskToTask(swTask);
    const existing = this.tasks.get(task.id);

    if (existing) {
      // 任务已存在，只更新状态
      this.tasks.set(task.id, task);
    } else {
      // 新任务（来自其他客户端），添加并通知 UI
      this.tasks.set(task.id, task);
      this.emitEvent('taskCreated', task);
    }
  }

  private convertSWTaskToTask(swTask: SWTask): Task {
    return {
      id: swTask.id,
      type: swTask.type as TaskType,
      status: swTask.status as TaskStatus,
      params: swTask.params,
      createdAt: swTask.createdAt,
      updatedAt: swTask.updatedAt,
      startedAt: swTask.startedAt,
      completedAt: swTask.completedAt,
      result: swTask.result,
      error: swTask.error,
      progress: swTask.progress,
      remoteId: swTask.remoteId,
      executionPhase: swTask.executionPhase as TaskExecutionPhase,
      insertedToCanvas: swTask.insertedToCanvas,
    };
  }

  private async submitToSW(task: Task): Promise<void> {
    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) {
        // SW 初始化失败，尝试降级模式
        const canFallback = await this.tryFallbackExecution(task);
        if (!canFallback) {
          this.tasks.delete(task.id);
          this.emitEvent('taskRejected', task, 'NO_API_KEY');
        }
        return;
      }
    }

    // 尝试使用 SW 执行
    const result = await swChannelClient.createTask({
      taskId: task.id,
      taskType: task.type as 'image' | 'video',
      params: task.params,
    });

    if (!result.success) {
      if (result.reason === 'duplicate') {
        this.tasks.delete(task.id);
        this.emitEvent('taskRejected', task, 'DUPLICATE');
      } else {
        // SW 执行失败，尝试降级模式
        const canFallback = await this.tryFallbackExecution(task);
        if (!canFallback) {
          this.tasks.delete(task.id);
          this.emitEvent('taskRejected', task, result.reason || 'UNKNOWN');
        }
      }
    }
  }

  /**
   * 尝试使用降级执行器执行任务
   * 当 SW 不可用时调用
   */
  private async tryFallbackExecution(task: Task): Promise<boolean> {
    try {
      // 检查是否有 API 配置
      const settings = geminiSettings.get();
      if (!settings.apiKey || !settings.baseUrl) {
        return false;
      }

      // 使用执行器工厂获取执行器（会自动选择降级执行器）
      const executor = await executorFactory.getExecutor();

      // 先创建任务记录
      await taskStorageWriter.createTask(
        task.id,
        task.type as 'image' | 'video' | 'character' | 'inspiration_board' | 'chat',
        {
          prompt: task.params.prompt,
          ...task.params,
        }
      );

      // 异步执行任务（fire-and-forget）
      this.executeWithFallback(task, executor).catch((error) => {
        console.error('[SWTaskQueue] Fallback execution error:', error);
      });

      return true;
    } catch (error) {
      console.error('[SWTaskQueue] Failed to start fallback execution:', error);
      return false;
    }
  }

  /**
   * 使用降级执行器执行任务并监听结果
   */
  private async executeWithFallback(
    task: Task,
    executor: Awaited<ReturnType<typeof executorFactory.getExecutor>>
  ): Promise<void> {
    try {
      // 根据任务类型执行
      switch (task.type) {
        case TaskType.IMAGE:
          await executor.generateImage({
            taskId: task.id,
            prompt: task.params.prompt,
            model: task.params.model,
            size: task.params.size,
            referenceImages: task.params.referenceImages as string[] | undefined,
            count: task.params.count as number | undefined,
          });
          break;
        case TaskType.VIDEO:
          await executor.generateVideo({
            taskId: task.id,
            prompt: task.params.prompt,
            model: task.params.model,
            duration: task.params.duration?.toString(),
            size: task.params.size,
          });
          break;
        default:
          throw new Error(`Unsupported task type for fallback: ${task.type}`);
      }

      // 轮询等待任务完成
      const result = await waitForTaskCompletion(task.id, {
        timeout: 10 * 60 * 1000, // 10 分钟
        onProgress: (updatedTask) => {
          // 更新本地状态
          const localTask = this.tasks.get(task.id);
          if (localTask) {
            localTask.status = updatedTask.status;
            localTask.progress = updatedTask.progress;
            localTask.updatedAt = Date.now();
            this.emitEvent('taskStatus', localTask);
          }
        },
      });

      // 更新本地状态
      const localTask = this.tasks.get(task.id);
      if (localTask && result.task) {
        localTask.status = result.task.status;
        localTask.result = result.task.result;
        localTask.error = result.task.error;
        localTask.completedAt = result.task.completedAt;
        localTask.updatedAt = Date.now();

        if (result.success) {
          this.emitEvent('taskCompleted', localTask);
        } else {
          this.emitEvent('taskFailed', localTask);
        }
      }
    } catch (error: any) {
      // 更新任务失败状态
      const localTask = this.tasks.get(task.id);
      if (localTask) {
        localTask.status = TaskStatus.FAILED;
        localTask.error = {
          code: 'FALLBACK_ERROR',
          message: error.message || 'Fallback execution failed',
        };
        localTask.updatedAt = Date.now();
        this.emitEvent('taskFailed', localTask);
      }
    }
  }

  private async handleSWStatus(
    taskId: string,
    status: TaskStatus,
    progress?: number,
    phase?: TaskExecutionPhase
  ): Promise<void> {
    if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED || status === TaskStatus.CANCELLED) {
      return;
    }

    let task = this.tasks.get(taskId);
    if (!task) {
      // 任务不在本地，可能是其他页面创建的任务，尝试从 SW 获取
      try {
        const swTask = await swChannelClient.getTask(taskId);
        if (swTask) {
          task = this.convertSWTaskToTask(swTask);
          this.tasks.set(taskId, task);
        } else {
          return;
        }
      } catch {
        return;
      }
    }

    const updates: Partial<Task> = {};
    if (progress !== undefined) updates.progress = progress;
    if (phase !== undefined) updates.executionPhase = phase;

    this.updateTaskStatus(taskId, status, updates);
  }

  private async handleSWCompleted(taskId: string, result: TaskResult, remoteId?: string): Promise<void> {
    let task = this.tasks.get(taskId);
    
    if (!task) {
      // 任务不在本地，尝试从 SW 获取
      try {
        const swTask = await swChannelClient.getTask(taskId);
        if (swTask) {
          task = this.convertSWTaskToTask(swTask);
          this.tasks.set(taskId, task);
        } else {
          return;
        }
      } catch {
        return;
      }
    }

    const finalRemoteId = task.remoteId || remoteId;

    this.updateTaskStatus(taskId, TaskStatus.COMPLETED, {
      result,
      progress: 100,
      completedAt: Date.now(),
      remoteId: finalRemoteId,
    });
  }

  private async handleSWFailed(taskId: string, error: TaskError): Promise<void> {
    let task = this.tasks.get(taskId);
    if (!task) {
      // 任务不在本地，尝试从 SW 获取
      try {
        const swTask = await swChannelClient.getTask(taskId);
        if (swTask) {
          task = this.convertSWTaskToTask(swTask);
          this.tasks.set(taskId, task);
        } else {
          return;
        }
      } catch {
        return;
      }
    }

    this.updateTaskStatus(taskId, TaskStatus.FAILED, { error });
  }

  private async handleSWCancelled(taskId: string): Promise<void> {
    let task = this.tasks.get(taskId);
    if (!task) {
      // 任务不在本地，尝试从 SW 获取
      try {
        const swTask = await swChannelClient.getTask(taskId);
        if (swTask) {
          task = this.convertSWTaskToTask(swTask);
          this.tasks.set(taskId, task);
        } else {
          return;
        }
      } catch {
        return;
      }
    }
    this.updateTaskStatus(taskId, TaskStatus.CANCELLED);
  }

  private async handleSWDeleted(taskId: string): Promise<void> {
    let task = this.tasks.get(taskId);
    if (!task) {
      // 即使任务不在本地，也尝试从 SW 获取以便发出正确的事件
      try {
        const swTask = await swChannelClient.getTask(taskId);
        if (swTask) {
          task = this.convertSWTaskToTask(swTask);
        }
      } catch {
        // 忽略错误
      }
    }
    if (task) {
      this.tasks.delete(taskId);
      this.emitEvent('taskDeleted', task);
    }
  }

  private updateTaskStatus(taskId: string, status: TaskStatus, updates?: Partial<Task>): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const now = Date.now();
    const updatedTask: Task = {
      ...task,
      ...updates,
      status,
      updatedAt: now,
    };

    if (status === TaskStatus.PROCESSING && !updatedTask.startedAt) {
      updatedTask.startedAt = now;
    } else if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) {
      updatedTask.completedAt = now;
    }

    this.tasks.set(taskId, updatedTask);
    this.emitEvent('taskUpdated', updatedTask);
  }

  private emitEvent(type: 'taskCreated' | 'taskUpdated' | 'taskDeleted' | 'taskSynced', task: Task): void;
  private emitEvent(type: 'taskRejected', task: Task, reason: string): void;
  private emitEvent(type: 'taskCreated' | 'taskUpdated' | 'taskDeleted' | 'taskSynced' | 'taskRejected', task: Task, reason?: string): void {
    // 任务变更时清除读取缓存
    if (type !== 'taskSynced') {
      taskStorageReader.invalidateCache();
    }
    this.taskUpdates$.next({ type, task, timestamp: Date.now(), reason });
  }
}

export const swTaskQueueService = SWTaskQueueService.getInstance();
export { SWTaskQueueService };
