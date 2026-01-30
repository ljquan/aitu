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

/**
 * Service Worker Task Queue Service
 */
class SWTaskQueueService {
  private static instance: SWTaskQueueService;
  /** Read-only view of SW's task state, updated via SW push */
  private tasks: Map<string, Task>;
  private taskUpdates$: Subject<TaskEvent>;
  private initialized = false;

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
   * Initialize the service with API configurations
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

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
        },
        videoConfig: {
          baseUrl: settings.baseUrl || 'https://api.tu-zi.com',
          apiKey: settings.apiKey,
        },
      });

      this.initialized = initResult.success;
      if (this.initialized) {
        console.log('[SWTaskQueueService] Initialized successfully');
      }
      return this.initialized;
    } catch (error) {
      console.error('[SWTaskQueueService] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Creates a new task and submits it to the Service Worker
   */
  createTask(params: GenerationParams, type: TaskType): Task {
    console.log('[SWTaskQueueService] createTask called:', {
      type,
      hasPrompt: !!params.prompt,
      initialized: this.initialized,
    });

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

    console.log('[SWTaskQueueService] Task created locally, calling submitToSW:', task.id);
    // Submit to SW
    this.submitToSW(task);

    return task;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getTasksByStatus(status: TaskStatus): Task[] {
    return this.getAllTasks().filter((t) => t.status === status);
  }

  async cancelTask(taskId: string): Promise<void> {
    if (!this.tasks.has(taskId)) return;
    await swChannelClient.cancelTask(taskId);
  }

  async retryTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || (task.status !== TaskStatus.FAILED && task.status !== TaskStatus.CANCELLED)) return;
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
   * Restore tasks from storage (for migration from legacy storage)
   * @deprecated Legacy migration - new tasks are created via createTask()
   */
  async restoreTasks(tasks: Task[]): Promise<void> {
    for (const task of tasks) {
      this.tasks.set(task.id, task);
    }
  }

  /**
   * Sync tasks from Service Worker to local state
   */
  async syncTasksFromSW(): Promise<void> {
    // 如果 swChannelClient 未初始化，跳过同步
    if (!swChannelClient.isInitialized()) {
      return;
    }
    
    try {
      const result = await swChannelClient.listTasks();
      if (!result.success) return;
      
      for (const swTask of result.tasks || []) {
        const task = this.convertSWTaskToTask(swTask);
        this.tasks.set(task.id, task);
      }
    } catch (error) {
      console.error('[SWTaskQueueService] Failed to sync tasks from SW:', error);
    }
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
      this.tasks.set(task.id, task);
    } else {
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
    console.log('[SWTaskQueueService] submitToSW called:', {
      taskId: task.id,
      type: task.type,
      initialized: this.initialized,
    });

    if (!this.initialized) {
      console.log('[SWTaskQueueService] Not initialized, calling initialize()...');
      const success = await this.initialize();
      console.log('[SWTaskQueueService] initialize() result:', success);
      if (!success) {
        console.error('[SWTaskQueueService] Initialize failed, rejecting task');
        this.tasks.delete(task.id);
        this.emitEvent('taskRejected', task, 'NO_API_KEY');
        return;
      }
    }

    console.log('[SWTaskQueueService] Calling swChannelClient.createTask...');
    const result = await swChannelClient.createTask({
      taskId: task.id,
      taskType: task.type as 'image' | 'video',
      params: task.params,
    });

    console.log('[SWTaskQueueService] swChannelClient.createTask result:', result);

    if (!result.success) {
      console.error('[SWTaskQueueService] Task creation failed:', result.reason);
      if (result.reason === 'duplicate') {
        this.tasks.delete(task.id);
        this.emitEvent('taskRejected', task, 'DUPLICATE');
      } else {
        this.tasks.delete(task.id);
        this.emitEvent('taskRejected', task, result.reason || 'UNKNOWN');
      }
    }
  }

  private handleSWStatus(
    taskId: string,
    status: TaskStatus,
    progress?: number,
    phase?: TaskExecutionPhase
  ): void {
    if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED || status === TaskStatus.CANCELLED) {
      return;
    }

    const task = this.tasks.get(taskId);
    if (!task) return;

    const updates: Partial<Task> = {};
    if (progress !== undefined) updates.progress = progress;
    if (phase !== undefined) updates.executionPhase = phase;

    this.updateTaskStatus(taskId, status, updates);
  }

  private handleSWCompleted(taskId: string, result: TaskResult, remoteId?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const finalRemoteId = task.remoteId || remoteId;

    this.updateTaskStatus(taskId, TaskStatus.COMPLETED, {
      result,
      progress: 100,
      completedAt: Date.now(),
      remoteId: finalRemoteId,
    });
  }

  private handleSWFailed(taskId: string, error: TaskError): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    this.updateTaskStatus(taskId, TaskStatus.FAILED, { error });
  }

  private handleSWCancelled(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    this.updateTaskStatus(taskId, TaskStatus.CANCELLED);
  }

  private handleSWDeleted(taskId: string): void {
    const task = this.tasks.get(taskId);
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
    this.taskUpdates$.next({ type, task, timestamp: Date.now(), reason });
  }
}

export const swTaskQueueService = SWTaskQueueService.getInstance();
export { SWTaskQueueService };
