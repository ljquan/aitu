/**
 * Task Repository
 *
 * Encapsulates the communication with Service Worker for task persistence.
 * This is the single point of truth for task data access.
 *
 * The repository pattern provides:
 * - Abstraction over SW communication
 * - Unified API for CRUD operations
 * - Observable for real-time updates
 * - Pagination support
 */

import { Subject, Observable, Subscription } from 'rxjs';
import type {
  Task,
  TaskStatus,
  TaskType,
  TaskEvent,
  TaskFilter,
  TaskPaginationParams,
  GenerationParams,
  TaskResult,
  TaskError,
} from './task.model';
import { swChannelClient } from '../../services/sw-channel';
import { geminiSettings, settingsManager } from '../../utils/settings-manager';

// ============================================================================
// Types
// ============================================================================

/**
 * Create task parameters
 */
export interface CreateTaskParams {
  type: TaskType;
  params: GenerationParams;
}

/**
 * Paginated task result
 */
export interface PaginatedTaskResult {
  tasks: Task[];
  total: number;
  hasMore: boolean;
  offset: number;
}

/**
 * Repository event handlers from SW
 */
interface SWEventHandlers {
  onTaskCreated?: (task: Task) => void;
  onTaskStatus?: (taskId: string, status: TaskStatus, progress?: number, phase?: string) => void;
  onTaskCompleted?: (taskId: string, result: TaskResult, remoteId?: string) => void;
  onTaskFailed?: (taskId: string, error: TaskError) => void;
  onTaskCancelled?: (taskId: string) => void;
  onTaskDeleted?: (taskId: string) => void;
}

// ============================================================================
// Task Repository Implementation
// ============================================================================

/**
 * Task Repository
 *
 * Provides a unified interface for task CRUD operations.
 * Internally manages SW communication and state synchronization.
 */
class TaskRepository {
  private static instance: TaskRepository;
  
  /** Local cache of tasks */
  private tasks: Map<string, Task> = new Map();
  
  /** Event subject for task updates */
  private events$ = new Subject<TaskEvent>();
  
  /** Initialization state */
  private initialized = false;
  private initializingPromise: Promise<boolean> | null = null;
  
  /** Pagination state */
  private paginationState = {
    total: 0,
    loadedCount: 0,
    hasMore: true,
    pageSize: 50,
  };
  
  /** Visibility listener registered flag */
  private visibilityListenerRegistered = false;

  private constructor() {
    this.setupSWEventHandlers();
  }

  static getInstance(): TaskRepository {
    if (!TaskRepository.instance) {
      TaskRepository.instance = new TaskRepository();
    }
    return TaskRepository.instance;
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the repository
   * Always sends init message to SW (idempotent) to handle SW restarts
   */
  async initialize(): Promise<boolean> {
    if (this.initializingPromise) return this.initializingPromise;

    this.initializingPromise = this.doInitialize();
    
    try {
      return await this.initializingPromise;
    } finally {
      this.initializingPromise = null;
    }
  }

  private async doInitialize(): Promise<boolean> {
    try {
      await settingsManager.waitForInitialization();
      
      const settings = geminiSettings.get();
      if (!settings.apiKey || !settings.baseUrl) {
        return false;
      }

      const success = await swChannelClient.initialize();
      if (!success) {
        return false;
      }

      // Always send init to SW (idempotent) - handles SW restart scenarios
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

      if (initResult.success && !this.initialized) {
        this.setupVisibilityListener();
      }
      this.initialized = initResult.success;
      return this.initialized;
    } catch {
      return false;
    }
  }

  /**
   * Check if repository is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Force re-initialize
   */
  async reinitialize(): Promise<boolean> {
    this.initialized = false;
    return this.initialize();
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  /**
   * Create a new task
   */
  async create(params: CreateTaskParams): Promise<Task> {
    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) {
        throw new Error('Task repository not initialized');
      }
    }

    const taskId = this.generateTaskId();
    const now = Date.now();
    
    const task: Task = {
      id: taskId,
      type: params.type,
      status: 'processing',
      params: params.params,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      executionPhase: 'submitting',
      ...(params.type === 'video' && { progress: 0 }),
    };

    // Add to local cache immediately for UI feedback
    this.tasks.set(task.id, task);
    this.emitEvent('taskCreated', task);

    // Submit to SW
    const result = await swChannelClient.createTask({
      taskId: task.id,
      taskType: task.type,
      params: task.params,
    });

    if (!result.success) {
      this.tasks.delete(task.id);
      this.emitEvent('taskRejected', task, result.reason || 'UNKNOWN');
      throw new Error(result.reason || 'Failed to create task');
    }

    return task;
  }

  /**
   * Get a task by ID
   */
  async getById(id: string): Promise<Task | null> {
    // Check local cache first
    const cached = this.tasks.get(id);
    if (cached) return cached;

    // Fetch from SW
    try {
      const task = await swChannelClient.getTask(id);
      if (task) {
        this.tasks.set(id, task);
      }
      return task;
    } catch {
      return null;
    }
  }

  /**
   * Get all tasks from local cache
   */
  getAll(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get tasks by status
   */
  getByStatus(status: TaskStatus): Task[] {
    return this.getAll().filter(t => t.status === status);
  }

  /**
   * Get tasks by type
   */
  getByType(type: TaskType): Task[] {
    return this.getAll().filter(t => t.type === type);
  }

  /**
   * Update a task locally (for flags like savedToLibrary, insertedToCanvas)
   */
  update(id: string, updates: Partial<Task>): Task | null {
    const task = this.tasks.get(id);
    if (!task) return null;

    const updatedTask: Task = {
      ...task,
      ...updates,
      updatedAt: Date.now(),
    };

    this.tasks.set(id, updatedTask);
    this.emitEvent('taskUpdated', updatedTask);

    // Sync specific flags to SW
    if (updates.insertedToCanvas !== undefined) {
      swChannelClient.markTaskInserted(id);
    }

    return updatedTask;
  }

  /**
   * Cancel a task
   */
  async cancel(id: string): Promise<void> {
    if (!this.tasks.has(id)) return;
    await swChannelClient.cancelTask(id);
  }

  /**
   * Retry a failed task
   */
  async retry(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task || (task.status !== 'failed' && task.status !== 'cancelled')) {
      return;
    }
    await swChannelClient.retryTask(id);
  }

  /**
   * Delete a task
   */
  async delete(id: string): Promise<void> {
    await swChannelClient.deleteTask(id);
    const task = this.tasks.get(id);
    if (task) {
      this.tasks.delete(id);
      this.emitEvent('taskDeleted', task);
    }
  }

  /**
   * Import tasks (for cloud sync restore)
   */
  async importTasks(tasks: Task[]): Promise<boolean> {
    const tasksToRestore = tasks.filter(task => !this.tasks.has(task.id));
    if (tasksToRestore.length === 0) return true;

    const result = await swChannelClient.importTasks(tasksToRestore);
    
    if (result.success) {
      for (const task of tasksToRestore) {
        this.tasks.set(task.id, task);
        this.emitEvent('taskCreated', task);
      }
      this.paginationState.total = this.tasks.size;
      this.paginationState.loadedCount = this.tasks.size;
    }

    return result.success;
  }

  // ============================================================================
  // Pagination
  // ============================================================================

  /**
   * Sync tasks from SW (first page)
   */
  async sync(): Promise<void> {
    if (!swChannelClient.isInitialized()) {
      const channelReady = await swChannelClient.initialize();
      if (!channelReady) return;
    }

    try {
      const result = await swChannelClient.listTasksPaginated({
        offset: 0,
        limit: this.paginationState.pageSize,
      });

      if (!result.success) return;

      this.tasks.clear();
      for (const task of result.tasks || []) {
        this.tasks.set(task.id, task);
      }

      this.paginationState.total = result.total;
      this.paginationState.loadedCount = result.tasks?.length || 0;
      this.paginationState.hasMore = result.hasMore;

      if (this.paginationState.loadedCount > 0 && !this.initialized) {
        this.initialized = true;
        this.setupVisibilityListener();
      }
    } catch {
      // Silent failure
    }
  }

  /**
   * Load more tasks (pagination)
   */
  async loadMore(): Promise<boolean> {
    if (!this.paginationState.hasMore) return false;

    if (!swChannelClient.isInitialized()) {
      const channelReady = await swChannelClient.initialize();
      if (!channelReady) return false;
    }

    try {
      const result = await swChannelClient.listTasksPaginated({
        offset: this.paginationState.loadedCount,
        limit: this.paginationState.pageSize,
      });

      if (!result.success) return false;

      for (const task of result.tasks || []) {
        if (!this.tasks.has(task.id)) {
          this.tasks.set(task.id, task);
        }
      }

      this.paginationState.total = result.total;
      this.paginationState.loadedCount += result.tasks?.length || 0;
      this.paginationState.hasMore = result.hasMore;

      return this.paginationState.hasMore;
    } catch {
      return false;
    }
  }

  /**
   * Get pagination state
   */
  getPaginationState(): { total: number; loadedCount: number; hasMore: boolean } {
    return { ...this.paginationState };
  }

  /**
   * Load tasks by type (direct SW query, doesn't affect global cache)
   */
  async loadByType(
    type: TaskType,
    params: TaskPaginationParams
  ): Promise<PaginatedTaskResult> {
    if (!swChannelClient.isInitialized()) {
      const channelReady = await swChannelClient.initialize();
      if (!channelReady) {
        return { tasks: [], total: 0, hasMore: false, offset: params.offset };
      }
    }

    try {
      const result = await swChannelClient.listTasksPaginated({
        offset: params.offset,
        limit: params.limit,
        type,
      });

      if (!result.success) {
        return { tasks: [], total: 0, hasMore: false, offset: params.offset };
      }

      return {
        tasks: result.tasks || [],
        total: result.total,
        hasMore: result.hasMore,
        offset: result.offset,
      };
    } catch {
      return { tasks: [], total: 0, hasMore: false, offset: params.offset };
    }
  }

  // ============================================================================
  // Observable
  // ============================================================================

  /**
   * Observe task events
   */
  observe(): Observable<TaskEvent> {
    return this.events$.asObservable();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupVisibilityListener(): void {
    if (typeof document === 'undefined') return;
    if (this.visibilityListenerRegistered) return;
    
    this.visibilityListenerRegistered = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.initialized) {
        this.sync().catch(() => {});
      }
    });
  }

  private setupSWEventHandlers(): void {
    swChannelClient.setEventHandlers({
      onTaskCreated: (event) => this.handleTaskCreated(event.task),
      onTaskStatus: (event) => this.handleTaskStatus(
        event.taskId,
        event.status as TaskStatus,
        event.progress,
        event.phase as string
      ),
      onTaskCompleted: (event) => this.handleTaskCompleted(
        event.taskId,
        event.result as TaskResult,
        event.remoteId
      ),
      onTaskFailed: (event) => this.handleTaskFailed(
        event.taskId,
        event.error as TaskError
      ),
      onTaskCancelled: (taskId) => this.handleTaskCancelled(taskId),
      onTaskDeleted: (taskId) => this.handleTaskDeleted(taskId),
    });
  }

  private handleTaskCreated(task: Task): void {
    const existing = this.tasks.get(task.id);
    if (existing) {
      this.tasks.set(task.id, task);
    } else {
      this.tasks.set(task.id, task);
      this.emitEvent('taskCreated', task);
    }
  }

  private async handleTaskStatus(
    taskId: string,
    status: TaskStatus,
    progress?: number,
    phase?: string
  ): Promise<void> {
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      return;
    }

    let task = this.tasks.get(taskId);
    if (!task) {
      task = await swChannelClient.getTask(taskId);
      if (task) {
        this.tasks.set(taskId, task);
      } else {
        return;
      }
    }

    const updates: Partial<Task> = { updatedAt: Date.now() };
    if (progress !== undefined) updates.progress = progress;
    if (phase !== undefined) updates.executionPhase = phase as Task['executionPhase'];

    const updatedTask: Task = { ...task, ...updates, status };
    if (status === 'processing' && !updatedTask.startedAt) {
      updatedTask.startedAt = Date.now();
    }

    this.tasks.set(taskId, updatedTask);
    this.emitEvent('taskUpdated', updatedTask);
  }

  private async handleTaskCompleted(
    taskId: string,
    result: TaskResult,
    remoteId?: string
  ): Promise<void> {
    let task = this.tasks.get(taskId);
    if (!task) {
      task = await swChannelClient.getTask(taskId);
      if (task) {
        this.tasks.set(taskId, task);
      } else {
        return;
      }
    }

    const updatedTask: Task = {
      ...task,
      status: 'completed',
      result,
      progress: 100,
      completedAt: Date.now(),
      updatedAt: Date.now(),
      remoteId: task.remoteId || remoteId,
    };

    this.tasks.set(taskId, updatedTask);
    this.emitEvent('taskUpdated', updatedTask);
  }

  private async handleTaskFailed(taskId: string, error: TaskError): Promise<void> {
    let task = this.tasks.get(taskId);
    if (!task) {
      task = await swChannelClient.getTask(taskId);
      if (task) {
        this.tasks.set(taskId, task);
      } else {
        return;
      }
    }

    const updatedTask: Task = {
      ...task,
      status: 'failed',
      error,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.tasks.set(taskId, updatedTask);
    this.emitEvent('taskUpdated', updatedTask);
  }

  private async handleTaskCancelled(taskId: string): Promise<void> {
    let task = this.tasks.get(taskId);
    if (!task) {
      task = await swChannelClient.getTask(taskId);
      if (task) {
        this.tasks.set(taskId, task);
      } else {
        return;
      }
    }

    const updatedTask: Task = {
      ...task,
      status: 'cancelled',
      updatedAt: Date.now(),
    };

    this.tasks.set(taskId, updatedTask);
    this.emitEvent('taskUpdated', updatedTask);
  }

  private async handleTaskDeleted(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      this.tasks.delete(taskId);
      this.emitEvent('taskDeleted', task);
    }
  }

  private emitEvent(type: 'taskCreated' | 'taskUpdated' | 'taskDeleted' | 'taskSynced', task: Task): void;
  private emitEvent(type: 'taskRejected', task: Task, reason: string): void;
  private emitEvent(
    type: 'taskCreated' | 'taskUpdated' | 'taskDeleted' | 'taskSynced' | 'taskRejected',
    task: Task,
    reason?: string
  ): void {
    this.events$.next({ type, task, timestamp: Date.now(), reason });
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.events$.complete();
  }
}

// Export singleton instance
export const taskRepository = TaskRepository.getInstance();
