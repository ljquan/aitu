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
import { geminiSettings } from '../utils/settings-manager';
import { taskStorageReader } from './task-storage-reader';
import {
  executorFactory,
  taskStorageWriter,
  waitForTaskCompletion,
} from './media-executor';
import type { SWTask as StorageSWTask } from './media-executor/task-storage-writer';
import { isAuthError, dispatchApiAuthError } from '../utils/api-auth-error-event';

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
  /** Polling interval ID for fallback mode */
  private pollingIntervalId: ReturnType<typeof setInterval> | null = null;
  /** Polling interval in ms (only active when SW unavailable) */
  private readonly POLLING_INTERVAL_MS = 2000;
  /** Flag indicating if polling is active */
  private isPollingActive = false;
  /** SW availability state (maintained internally) */
  private swAvailable = false;
  /** Count of consecutive SW failures (for auto-fallback) */
  private swFailureCount = 0;
  /** Max failures before switching to fallback mode */
  private readonly SW_FAILURE_THRESHOLD = 3;

  private constructor() {
    this.tasks = new Map();
    this.taskUpdates$ = new Subject();

    // Defer SW client handler setup to avoid circular dependency issues
    // swChannelClient may not be initialized at this point due to module load order
    queueMicrotask(() => {
      this.setupSWClientHandlers();
    });
  }

  static getInstance(): SWTaskQueueService {
    if (!SWTaskQueueService.instance) {
      SWTaskQueueService.instance = new SWTaskQueueService();
    }
    return SWTaskQueueService.instance;
  }

  /**
   * 设置 visibility 变化监听器
   * 当页面变为可见时，主动从 IndexedDB 同步最新状态
   * 这样即使 SW 事件丢失（如 SW 更新、连接断开），也能获取到最新状态
   */
  private setupVisibilityListener(): void {
    if (typeof document === 'undefined') return;
    if (this.visibilityListenerRegistered) return;
    
    this.visibilityListenerRegistered = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // 页面变为可见时，主动从 IndexedDB 同步最新状态
        // 这是关键的解耦点：不依赖 SW 广播，主动拉取数据
        this.syncFromIndexedDB().catch((error) => {
          console.warn('[SWTaskQueue] Visibility sync failed:', error);
        });
        
        // 如果有正在处理的任务且 SW 不可用，启动轮询
        const hasProcessingTasks = this.getTasksByStatus(TaskStatus.PROCESSING).length > 0;
        if (hasProcessingTasks && !swChannelClient.isInitialized()) {
          this.startPolling();
        }
        
        // 尝试恢复 SW 连接（如果之前不可用）
        if (!this.swAvailable) {
          this.tryRestoreSWConnection();
        }
      } else {
        // 页面隐藏时停止轮询（节省资源）
        this.stopPolling();
      }
    });
  }

  /**
   * 尝试恢复 SW 连接
   * 在页面可见时调用，如果 SW 之前不可用
   */
  private async tryRestoreSWConnection(): Promise<void> {
    try {
      const success = await swChannelClient.initializeChannel();
      if (success) {
        this.markSWAvailable();
        console.log('[SWTaskQueue] SW connection restored');
        
        // 停止轮询（SW 已恢复）
        this.stopPolling();
      }
    } catch (error) {
      // 恢复失败，保持降级模式，只记录 debug 信息
      console.debug('[SWTaskQueue] SW restore attempt failed:', error);
    }
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
   * 只初始化 SW channel，不同步配置（配置随任务传递）
   */
  private async doInitialize(): Promise<boolean> {
    try {
      // 无论 SW 是否可用，都设置 visibility 监听器
      // 这样即使 SW 不可用，也能通过轮询机制获取状态更新
      this.setupVisibilityListener();
      
      // 只初始化 SW channel，不检查配置（配置随任务传递）
      const success = await swChannelClient.initializeChannel();
      
      this.initialized = success;
      this.swAvailable = success;
      
      // 成功初始化时重置失败计数
      if (success) {
        this.swFailureCount = 0;
      }
      
      return this.initialized;
    } catch (error) {
      // SW 初始化失败，但 visibility 监听器已设置，可以使用轮询作为后备
      console.warn('[SWTaskQueue] Initialization failed, using fallback mode:', error);
      this.swAvailable = false;
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
   * Check if SW is currently available for task execution
   * This is used internally to decide between SW and fallback execution
   */
  isSWAvailable(): boolean {
    return this.swAvailable && this.initialized && swChannelClient.isInitialized();
  }

  /**
   * Mark SW as unavailable (called when SW communication fails)
   */
  private markSWUnavailable(): void {
    this.swFailureCount++;
    if (this.swFailureCount >= this.SW_FAILURE_THRESHOLD) {
      this.swAvailable = false;
      console.warn(
        `[SWTaskQueue] SW marked unavailable after ${this.swFailureCount} consecutive failures`
      );
    }
  }

  /**
   * Mark SW as available (called when SW communication succeeds)
   */
  private markSWAvailable(): void {
    if (!this.swAvailable) {
      console.log('[SWTaskQueue] SW restored to available state');
    }
    this.swAvailable = true;
    this.swFailureCount = 0;
  }

  /**
   * Re-initialize SW (for cases where init RPC timed out but channel is ready)
   * This is a public wrapper around doInitialize that resets the initialized flag
   */
  async initializeSW(): Promise<boolean> {
    // Reset initialized flag to allow re-initialization
    this.initialized = false;
    this.swAvailable = false;
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
    
    // 优先尝试通过 SW 取消
    if (this.isSWAvailable()) {
      try {
        await swChannelClient.cancelTask(taskId);
        this.markSWAvailable();
        return;
      } catch (error) {
        console.warn('[SWTaskQueue] SW cancel failed, using fallback:', error);
        this.markSWUnavailable();
      }
    }
    
    // SW 不可用，直接更新本地状态和 IndexedDB
    const task = this.tasks.get(taskId);
    if (task && task.status === TaskStatus.PROCESSING) {
      task.status = TaskStatus.CANCELLED;
      task.updatedAt = Date.now();
      this.tasks.set(taskId, task);
      this.emitEvent('taskUpdated', task);
      
      // 直接更新 IndexedDB
      try {
        await taskStorageWriter.updateStatus(taskId, 'cancelled');
      } catch (error) {
        console.warn('[SWTaskQueue] Failed to update IndexedDB for cancel:', error);
      }
    }
  }

  async retryTask(taskId: string): Promise<void> {
    // 检查本地状态（如果有）
    const task = this.tasks.get(taskId);
    if (task && task.status !== TaskStatus.FAILED && task.status !== TaskStatus.CANCELLED) {
      return;
    }
    
    // 优先尝试 SW 执行
    if (this.isSWAvailable()) {
      try {
        console.log('[SWTaskQueueService] Retrying task via SW:', taskId);
        await swChannelClient.retryTask(taskId);
        this.markSWAvailable();
        return;
      } catch (error) {
        console.warn('[SWTaskQueue] SW retry failed:', error);
        this.markSWUnavailable();
      }
    }
    
    // SW 不可用时，使用降级执行器
    console.log('[SWTaskQueueService] SW not available, trying fallback for retry:', taskId);
    if (task) {
      // 重置任务状态
      task.status = TaskStatus.PROCESSING;
      task.error = undefined;
      task.progress = 0;
      task.startedAt = Date.now();
      task.remoteId = undefined;
      this.tasks.set(taskId, task);
      this.emitEvent('taskUpdated', task);
      
      // 尝试降级执行
      const canFallback = await this.tryFallbackExecution(task);
      if (!canFallback) {
        // 降级也失败，标记任务失败
        task.status = TaskStatus.FAILED;
        task.error = { code: 'FALLBACK_UNAVAILABLE', message: 'SW 和降级模式都不可用' };
        this.tasks.set(taskId, task);
        this.emitEvent('taskUpdated', task);
      }
    } else {
      console.warn('[SWTaskQueueService] Cannot retry: task not found and SW not available');
    }
  }

  async deleteTask(taskId: string): Promise<void> {
    // 优先尝试通过 SW 删除
    if (this.isSWAvailable()) {
      try {
        await swChannelClient.deleteTask(taskId);
        this.markSWAvailable();
      } catch (error) {
        console.warn('[SWTaskQueue] SW delete failed, using fallback:', error);
        this.markSWUnavailable();
        // 降级：直接从 IndexedDB 删除
        try {
          await taskStorageWriter.deleteTask(taskId);
        } catch (dbError) {
          console.warn('[SWTaskQueue] Failed to delete from IndexedDB:', dbError);
        }
      }
    } else {
      // SW 不可用，直接从 IndexedDB 删除
      try {
        await taskStorageWriter.deleteTask(taskId);
      } catch (error) {
        console.warn('[SWTaskQueue] Failed to delete from IndexedDB:', error);
      }
    }
    
    // 更新本地状态
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
   * 恢复任务到本地状态、持久化到 IndexedDB 并通知 UI 更新
   * 
   * 设计原则：优先直接写入 IndexedDB，不依赖 SW 连接
   * - 先写入 IndexedDB 确保数据持久化
   * - 然后异步通知 SW（如果可用）以保持同步
   */
  async restoreTasks(tasks: Task[]): Promise<void> {
    // 过滤出本地不存在的任务
    const tasksToRestore = tasks.filter(task => !this.tasks.has(task.id));

    if (tasksToRestore.length === 0) {
      return;
    }

    // 转换为存储格式（用于 IndexedDB）
    const storageTasks: StorageSWTask[] = tasksToRestore.map(task => this.convertTaskToStorageFormat(task));

    // 直接写入 IndexedDB，不依赖 SW
    try {
      const result = await taskStorageWriter.importTasks(storageTasks);
      console.log(`[SWTaskQueue] Imported ${result.imported} tasks, skipped ${result.skipped}`);
      
      // 添加到本地内存
      for (const task of tasksToRestore) {
        this.tasks.set(task.id, task);
        this.emitEvent('taskCreated', task);
      }
      
      // 更新分页状态
      this.paginationState.total = this.tasks.size;
      this.paginationState.loadedCount = this.tasks.size;
      
      // 清除读取缓存，确保下次读取时获取最新数据
      taskStorageReader.invalidateCache();
      
      // 异步通知 SW（如果可用），fire-and-forget
      // 这样 SW 可以更新其内部状态（如任务计数等）
      if (swChannelClient.isInitialized()) {
        const swTasks: SWTask[] = tasksToRestore.map(task => this.convertTaskToSWTask(task));
        swChannelClient.importTasks(swTasks).catch((error) => {
          // SW 同步失败不影响主流程，数据已持久化到 IndexedDB
          console.warn('[SWTaskQueue] SW sync failed (data already persisted):', error);
        });
      }
    } catch (error) {
      console.error('[SWTaskQueue] Failed to import tasks to IndexedDB:', error);
      throw error;
    }
  }
  
  /**
   * 将 Task 转换为存储格式（用于 IndexedDB）
   */
  private convertTaskToStorageFormat(task: Task): StorageSWTask {
    return {
      id: task.id,
      type: task.type as 'image' | 'video' | 'character' | 'inspiration_board' | 'chat',
      params: task.params as StorageSWTask['params'],
      status: task.status as StorageSWTask['status'],
      createdAt: task.createdAt,
      updatedAt: task.updatedAt || task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      result: task.result as StorageSWTask['result'],
      error: task.error as StorageSWTask['error'],
      progress: task.progress,
      remoteId: task.remoteId,
      executionPhase: task.executionPhase,
      insertedToCanvas: task.insertedToCanvas,
      syncedFromRemote: task.syncedFromRemote,
    };
  }
  
  /**
   * 将 Task 转换为 SWTask 格式（用于 SW RPC）
   */
  private convertTaskToSWTask(task: Task): SWTask {
    return {
      id: task.id,
      type: task.type as 'image' | 'video',
      params: task.params as SWTask['params'],
      config: { apiKey: '', baseUrl: '' }, // SW import 不需要 config
      status: task.status as SWTask['status'],
      createdAt: task.createdAt,
      updatedAt: task.updatedAt || task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      result: task.result as SWTask['result'],
      error: task.error as SWTask['error'],
      progress: task.progress,
      remoteId: task.remoteId,
      executionPhase: task.executionPhase as SWTask['executionPhase'],
      insertedToCanvas: task.insertedToCanvas,
      syncedFromRemote: task.syncedFromRemote,
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
    } catch (error) {
      console.warn('[SWTaskQueue] loadMoreTasks failed:', error);
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
   * Marks a task as inserted to canvas
   * 直接写入 IndexedDB，不依赖 SW RPC
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
    
    // 直接写入 IndexedDB，避免 RPC 超时问题
    taskStorageWriter.markInserted(taskId).catch((error) => {
      console.warn('[SWTaskQueue] Failed to persist insertedToCanvas flag:', error);
    });
  }

  observeTaskUpdates(): Observable<TaskEvent> {
    return this.taskUpdates$.asObservable();
  }

  isServiceWorkerAvailable(): boolean {
    return 'serviceWorker' in navigator;
  }

  // ============================================================================
  // Polling Methods (Fallback when SW unavailable)
  // ============================================================================

  /**
   * Start polling IndexedDB for task status updates
   * Used as fallback when SW broadcast is unavailable
   */
  startPolling(): void {
    if (this.isPollingActive) return;
    
    this.isPollingActive = true;
    this.pollingIntervalId = setInterval(() => {
      this.pollTaskStatus();
    }, this.POLLING_INTERVAL_MS);
    
    // 立即执行一次
    this.pollTaskStatus();
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
    }
    this.isPollingActive = false;
  }

  /**
   * Check if polling is currently active
   */
  isPolling(): boolean {
    return this.isPollingActive;
  }

  /**
   * Poll IndexedDB for task status updates
   * Compares with local state and emits events for changes
   */
  private async pollTaskStatus(): Promise<void> {
    try {
      // 获取本地正在处理的任务
      const processingTasks = this.getTasksByStatus(TaskStatus.PROCESSING);
      if (processingTasks.length === 0) {
        // 没有正在处理的任务，可以停止轮询
        this.stopPolling();
        return;
      }

      // 从 IndexedDB 读取最新状态
      const storedTasks = await taskStorageReader.getAllTasks();
      const storedTaskMap = new Map(storedTasks.map(t => [t.id, t]));

      // 检查每个正在处理的任务
      for (const localTask of processingTasks) {
        const storedTask = storedTaskMap.get(localTask.id);
        if (!storedTask) continue;

        // 状态发生变化
        if (storedTask.status !== localTask.status) {
          this.tasks.set(localTask.id, storedTask);
          
          if (storedTask.status === TaskStatus.COMPLETED) {
            this.emitEvent('taskCompleted', storedTask);
          } else if (storedTask.status === TaskStatus.FAILED) {
            this.emitEvent('taskFailed', storedTask);
          } else if (storedTask.status === TaskStatus.CANCELLED) {
            this.emitEvent('taskUpdated', storedTask);
          } else {
            this.emitEvent('taskStatus', storedTask);
          }
        } else if (storedTask.progress !== localTask.progress) {
          // 进度变化
          this.tasks.set(localTask.id, storedTask);
          this.emitEvent('taskStatus', storedTask);
        }
      }

      // 清除缓存以便下次获取最新数据
      taskStorageReader.invalidateCache();
    } catch (error) {
      console.warn('[SWTaskQueue] Polling error:', error);
    }
  }

  /**
   * 同步本地状态与 IndexedDB
   * 用于页面可见性变化时或手动触发同步
   */
  async syncFromIndexedDB(): Promise<void> {
    try {
      // 清除缓存
      taskStorageReader.invalidateCache();
      
      // 从 IndexedDB 读取所有任务
      const storedTasks = await taskStorageReader.getAllTasks();
      const storedTaskMap = new Map(storedTasks.map(t => [t.id, t]));

      // 更新本地状态
      for (const storedTask of storedTasks) {
        const localTask = this.tasks.get(storedTask.id);
        
        if (!localTask) {
          // 新任务
          this.tasks.set(storedTask.id, storedTask);
          this.emitEvent('taskCreated', storedTask);
        } else if (storedTask.updatedAt > (localTask.updatedAt || 0)) {
          // 更新的任务
          this.tasks.set(storedTask.id, storedTask);
          
          if (storedTask.status !== localTask.status) {
            if (storedTask.status === TaskStatus.COMPLETED) {
              this.emitEvent('taskCompleted', storedTask);
            } else if (storedTask.status === TaskStatus.FAILED) {
              this.emitEvent('taskFailed', storedTask);
            } else {
              this.emitEvent('taskUpdated', storedTask);
            }
          } else {
            this.emitEvent('taskUpdated', storedTask);
          }
        }
      }

      // 检查已删除的任务
      for (const [taskId, localTask] of this.tasks) {
        if (!storedTaskMap.has(taskId)) {
          this.tasks.delete(taskId);
          this.emitEvent('taskDeleted', localTask);
        }
      }
      
      // 更新分页状态
      this.paginationState.total = storedTasks.length;
      this.paginationState.loadedCount = this.tasks.size;
      this.paginationState.hasMore = false;
    } catch (error) {
      console.warn('[SWTaskQueue] Sync from IndexedDB error:', error);
    }
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
    // 获取当前配置
    const settings = geminiSettings.get();
    if (!settings.apiKey || !settings.baseUrl) {
      // 没有配置，尝试降级模式（降级模式也会检查配置）
      const canFallback = await this.tryFallbackExecution(task);
      if (!canFallback) {
        this.tasks.delete(task.id);
        this.emitEvent('taskRejected', task, 'NO_API_KEY');
      }
      return;
    }

    // 构建任务配置
    const taskConfig = {
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      modelName: settings.imageModelName,
      textModelName: settings.textModelName,
    };

    // 检查 SW 是否已知不可用，直接使用降级模式
    if (!this.swAvailable && this.swFailureCount >= this.SW_FAILURE_THRESHOLD) {
      console.log('[SWTaskQueue] SW unavailable, using fallback execution directly');
      const canFallback = await this.tryFallbackExecution(task);
      if (!canFallback) {
        this.tasks.delete(task.id);
        this.emitEvent('taskRejected', task, 'SW_UNAVAILABLE');
      }
      return;
    }

    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) {
        // SW 初始化失败，尝试降级模式
        const canFallback = await this.tryFallbackExecution(task);
        if (!canFallback) {
          this.tasks.delete(task.id);
          this.emitEvent('taskRejected', task, 'SW_INIT_FAILED');
        }
        return;
      }
    }

    // 尝试使用 SW 执行，带上配置
    try {
      const result = await swChannelClient.createTask({
        taskId: task.id,
        taskType: task.type as 'image' | 'video',
        params: task.params,
        config: taskConfig,
      });

      if (result.success) {
        // SW 执行成功，标记为可用
        this.markSWAvailable();
      } else {
        if (result.reason === 'duplicate') {
          this.tasks.delete(task.id);
          this.emitEvent('taskRejected', task, 'DUPLICATE');
        } else {
          // SW 执行失败，记录失败并尝试降级模式
          this.markSWUnavailable();
          const canFallback = await this.tryFallbackExecution(task);
          if (!canFallback) {
            this.tasks.delete(task.id);
            this.emitEvent('taskRejected', task, result.reason || 'UNKNOWN');
          }
        }
      }
    } catch (error) {
      // SW 通信异常，标记为不可用
      console.error('[SWTaskQueue] SW communication error:', error);
      this.markSWUnavailable();
      
      // 尝试降级模式
      const canFallback = await this.tryFallbackExecution(task);
      if (!canFallback) {
        this.tasks.delete(task.id);
        this.emitEvent('taskRejected', task, 'SW_ERROR');
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
        task.params as { prompt: string; [key: string]: unknown }
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
      } catch (error) {
        console.debug('[SWTaskQueue] handleSWStatus: getTask failed for', taskId, error);
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
      } catch (error) {
        console.debug('[SWTaskQueue] handleSWCompleted: getTask failed for', taskId, error);
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
      } catch (error) {
        console.debug('[SWTaskQueue] handleSWFailed: getTask failed for', taskId, error);
        return;
      }
    }

    // 检测认证错误，触发设置弹窗
    const errorMessage = error.message || '';
    if (isAuthError(errorMessage)) {
      dispatchApiAuthError({ message: errorMessage, source: task?.type || 'task' });
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
      } catch (error) {
        console.debug('[SWTaskQueue] handleSWCancelled: getTask failed for', taskId, error);
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
      } catch (error) {
        console.debug('[SWTaskQueue] handleSWDeleted: getTask failed for', taskId, error);
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

  private emitEvent(type: 'taskCreated' | 'taskUpdated' | 'taskDeleted' | 'taskSynced' | 'taskStatus' | 'taskCompleted' | 'taskFailed', task: Task): void;
  private emitEvent(type: 'taskRejected', task: Task, reason: string): void;
  private emitEvent(type: 'taskCreated' | 'taskUpdated' | 'taskDeleted' | 'taskSynced' | 'taskRejected' | 'taskStatus' | 'taskCompleted' | 'taskFailed', task: Task, reason?: string): void {
    // 任务变更时清除读取缓存
    if (type !== 'taskSynced') {
      taskStorageReader.invalidateCache();
    }
    this.taskUpdates$.next({ type, task, timestamp: Date.now(), reason });
  }
}

export const swTaskQueueService = SWTaskQueueService.getInstance();
export { SWTaskQueueService };
