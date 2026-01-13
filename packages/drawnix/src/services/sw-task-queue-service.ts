/**
 * Service Worker Task Queue Service
 *
 * Delegates task execution to the Service Worker.
 *
 * Design principle: SW is the single source of truth for task data.
 * This service maintains a read-only view of SW's task state,
 * updated entirely through SW push notifications.
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
  generateParamsHash,
  sanitizeGenerationParams,
} from '../utils/validation-utils';
import { DUPLICATE_SUBMISSION_WINDOW } from '../constants/TASK_CONSTANTS';
import { swTaskQueueClient } from './sw-client';
import type { SWTask } from './sw-client';
import { geminiSettings, settingsManager } from '../utils/settings-manager';

/**
 * Service Worker Task Queue Service
 */
class SWTaskQueueService {
  private static instance: SWTaskQueueService;
  /** Read-only view of SW's task state, updated via SW push */
  private tasks: Map<string, Task>;
  private taskUpdates$: Subject<TaskEvent>;
  private recentSubmissions: Map<string, number>;
  private initialized = false;

  private constructor() {
    this.tasks = new Map();
    this.taskUpdates$ = new Subject();
    this.recentSubmissions = new Map();

    // Clean up old submissions periodically
    setInterval(() => this.cleanupRecentSubmissions(), 60000);

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
        console.warn('[SWTaskQueueService] Gemini settings not configured');
        return false;
      }

      const success = await swTaskQueueClient.initialize(
        {
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl,
          modelName: settings.imageModelName,
        },
        {
          baseUrl: settings.baseUrl || 'https://api.tu-zi.com',
          apiKey: settings.apiKey,
        }
      );

      this.initialized = success;
      // SW will push all tasks after initialization via TASK_ALL_RESPONSE

      return success;
    } catch (error) {
      console.error('[SWTaskQueueService] Failed to initialize:', error);
      return false;
    }
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
    const paramsHash = generateParamsHash(sanitizedParams, type);

    if (this.isDuplicateSubmission(paramsHash)) {
      throw new Error(
        'Duplicate submission detected. Please wait before submitting the same task again.'
      );
    }

    // Create task locally for immediate UI feedback
    const now = Date.now();
    const task: Task = {
      id: generateTaskId(),
      type,
      status: TaskStatus.PENDING,
      params: sanitizedParams,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      ...(type === TaskType.VIDEO && { progress: 0 }),
    };

    this.tasks.set(task.id, task);
    this.recentSubmissions.set(paramsHash, now);
    this.emitEvent('taskCreated', task);

    // Submit to SW (SW will broadcast TASK_CREATED to confirm)
    this.submitToSW(task);

    return task;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getPendingTasks(): Task[] {
    return this.getAllTasks().filter((t) => t.status === TaskStatus.PENDING);
  }

  getTasksByStatus(status: TaskStatus): Task[] {
    return this.getAllTasks().filter((t) => t.status === status);
  }

  cancelTask(taskId: string): void {
    if (!this.tasks.has(taskId)) return;
    swTaskQueueClient.cancelTask(taskId);
  }

  retryTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || (task.status !== TaskStatus.FAILED && task.status !== TaskStatus.CANCELLED)) return;
    swTaskQueueClient.retryTask(taskId);
  }

  deleteTask(taskId: string): void {
    // Always send delete request to SW, even if task is not in local cache
    // SW is the source of truth and will handle the deletion
    swTaskQueueClient.deleteTask(taskId);
    // Also remove from local cache immediately for responsive UI
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
   * This adds tasks to local state and syncs them to SW
   */
  async restoreTasks(tasks: Task[]): Promise<void> {
    // Convert Task to SWTask format for SW
    const swTasks = tasks.map((task) => ({
      id: task.id,
      type: task.type,
      params: task.params,
      status: task.status,
      progress: task.progress,
      result: task.result,
      error: task.error,
      retryCount: task.retryCount,
      remoteId: task.remoteId,
      executionPhase: task.executionPhase,
      nextRetryAt: task.nextRetryAt,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      updatedAt: task.updatedAt,
    }));

    // Restore to SW
    await swTaskQueueClient.restoreTasks(swTasks);

    // Add to local state (don't emit events to avoid triggering auto-insert)
    for (const task of tasks) {
      this.tasks.set(task.id, task);
    }
  }

  /**
   * Sync tasks from Service Worker to local state
   * Called after page load to get current task state from SW
   */
  async syncTasksFromSW(): Promise<void> {
    try {
      const swTasks = await swTaskQueueClient.requestAllTasks();
      
      for (const swTask of swTasks) {
        const task: Task = {
          id: swTask.id,
          type: swTask.type,
          params: swTask.params,
          status: swTask.status,
          progress: swTask.progress || 0,
          result: swTask.result,
          error: swTask.error,
          retryCount: swTask.retryCount || 0,
          remoteId: swTask.remoteId,
          executionPhase: swTask.executionPhase,
          nextRetryAt: swTask.nextRetryAt,
          createdAt: swTask.createdAt,
          startedAt: swTask.startedAt,
          completedAt: swTask.completedAt,
          updatedAt: swTask.updatedAt,
        };
        
        // Add to local state without emitting events (to avoid duplicate auto-insert)
        this.tasks.set(task.id, task);
      }
      
      // console.log(`[SWTaskQueueService] Synced ${swTasks.length} tasks from SW`);
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
    // Notify SW to persist this flag
    swTaskQueueClient.markTaskInserted(taskId);
  }

  observeTaskUpdates(): Observable<TaskEvent> {
    return this.taskUpdates$.asObservable();
  }

  isServiceWorkerAvailable(): boolean {
    return swTaskQueueClient.isServiceWorkerSupported();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private setupSWClientHandlers(): void {
    swTaskQueueClient.setTaskHandlers({
      onCreated: (swTask) => this.handleSWTaskCreated(swTask),
      onStatus: (taskId, status, progress, phase) => this.handleSWStatus(taskId, status, progress, phase),
      onCompleted: (taskId, result) => this.handleSWCompleted(taskId, result),
      onFailed: (taskId, error, retryCount, nextRetryAt) => this.handleSWFailed(taskId, error, retryCount, nextRetryAt),
      onSubmitted: (taskId, remoteId) => this.handleSWSubmitted(taskId, remoteId),
      onCancelled: (taskId) => this.handleSWCancelled(taskId),
      onDeleted: (taskId) => this.handleSWDeleted(taskId),
      onTasksSync: (swTasks) => this.handleTasksSync(swTasks),
    });
  }

  private handleSWTaskCreated(swTask: SWTask): void {
    const task = this.convertSWTaskToTask(swTask);
    const existing = this.tasks.get(task.id);

    if (existing) {
      // Update with SW's authoritative state
      this.tasks.set(task.id, task);
    } else {
      // Task created by SW (e.g., from another tab)
      this.tasks.set(task.id, task);
      this.emitEvent('taskCreated', task);
    }
  }

  private handleTasksSync(swTasks: SWTask[]): void {
    for (const swTask of swTasks) {
      const task = this.convertSWTaskToTask(swTask);
      const existingTask = this.tasks.get(task.id);

      if (!existingTask || existingTask.updatedAt < task.updatedAt) {
        this.tasks.set(task.id, task);

        // Use 'taskSynced' for terminal states to avoid triggering auto-insert
        if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
          this.emitEvent('taskSynced', task);
        } else {
          this.emitEvent('taskUpdated', task);
        }
      }
    }
  }

  private convertSWTaskToTask(swTask: SWTask): Task {
    return {
      id: swTask.id,
      type: swTask.type,
      status: swTask.status,
      params: swTask.params,
      createdAt: swTask.createdAt,
      updatedAt: swTask.updatedAt,
      startedAt: swTask.startedAt,
      completedAt: swTask.completedAt,
      result: swTask.result,
      error: swTask.error,
      retryCount: swTask.retryCount,
      nextRetryAt: swTask.nextRetryAt,
      progress: swTask.progress,
      remoteId: swTask.remoteId,
      executionPhase: swTask.executionPhase,
      savedToLibrary: swTask.savedToLibrary,
      insertedToCanvas: swTask.insertedToCanvas,
    };
  }

  private async submitToSW(task: Task): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    swTaskQueueClient.submitTask(task.id, task.type, task.params);
  }

  private handleSWStatus(
    taskId: string,
    status: TaskStatus,
    progress?: number,
    phase?: TaskExecutionPhase
  ): void {
    // Terminal states handled by specific handlers
    if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED || status === TaskStatus.CANCELLED) {
      return;
    }

    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn(`[SWTaskQueueService] Task ${taskId} not found for status update`);
      return;
    }

    const updates: Partial<Task> = {};
    if (progress !== undefined) updates.progress = progress;
    if (phase !== undefined) updates.executionPhase = phase;

    this.updateTaskStatus(taskId, status, updates);
  }

  private handleSWCompleted(taskId: string, result: TaskResult): void {
    // console.log(`[SWTaskQueueService] handleSWCompleted called for task ${taskId}, result:`, result);
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn(`[SWTaskQueueService] Task ${taskId} not found for completion`);
      return;
    }

    // console.log(`[SWTaskQueueService] Task ${taskId} found, updating status to COMPLETED`);
    this.updateTaskStatus(taskId, TaskStatus.COMPLETED, {
      result,
      progress: 100,
      completedAt: Date.now(),
    });
  }

  private handleSWFailed(
    taskId: string,
    error: TaskError,
    retryCount: number,
    nextRetryAt?: number
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn(`[SWTaskQueueService] Task ${taskId} not found for failure`);
      return;
    }

    const status = nextRetryAt !== undefined ? TaskStatus.RETRYING : TaskStatus.FAILED;
    this.updateTaskStatus(taskId, status, { error, retryCount, nextRetryAt });
  }

  private handleSWSubmitted(taskId: string, remoteId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn(`[SWTaskQueueService] Task ${taskId} not found for submission`);
      return;
    }

    const updatedTask: Task = {
      ...task,
      remoteId,
      executionPhase: TaskExecutionPhase.POLLING,
      updatedAt: Date.now(),
    };

    this.tasks.set(taskId, updatedTask);
    this.emitEvent('taskUpdated', updatedTask);
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
    if (!task) {
      console.warn(`[SWTaskQueueService] updateTaskStatus: task ${taskId} not found`);
      return;
    }

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
    // console.log(`[SWTaskQueueService] Emitting taskUpdated for ${taskId}, status: ${status}, autoInsertToCanvas: ${updatedTask.params?.autoInsertToCanvas}`);
    this.emitEvent('taskUpdated', updatedTask);
  }

  private isDuplicateSubmission(paramsHash: string): boolean {
    const lastSubmission = this.recentSubmissions.get(paramsHash);
    if (!lastSubmission) return false;
    return Date.now() - lastSubmission < DUPLICATE_SUBMISSION_WINDOW;
  }

  private cleanupRecentSubmissions(): void {
    const now = Date.now();
    for (const [hash, timestamp] of this.recentSubmissions) {
      if (now - timestamp > DUPLICATE_SUBMISSION_WINDOW * 2) {
        this.recentSubmissions.delete(hash);
      }
    }
  }

  private emitEvent(type: 'taskCreated' | 'taskUpdated' | 'taskDeleted' | 'taskSynced', task: Task): void {
    this.taskUpdates$.next({ type, task, timestamp: Date.now() });
  }
}

export const swTaskQueueService = SWTaskQueueService.getInstance();
export { SWTaskQueueService };
