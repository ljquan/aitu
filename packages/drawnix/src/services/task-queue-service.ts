/**
 * Task Queue Service
 * 
 * Core service for managing the task queue lifecycle.
 * Implements singleton pattern and uses RxJS for event-driven architecture.
 * 
 * In fallback mode (SW disabled), this service directly writes to IndexedDB
 * via taskStorageWriter to ensure data persistence.
 */

import { Subject, Observable } from 'rxjs';
import { Task, TaskStatus, TaskType, TaskEvent, GenerationParams, TaskExecutionPhase } from '../types/task.types';
import { generateTaskId, isTaskActive } from '../utils/task-utils';
import { validateGenerationParams, sanitizeGenerationParams } from '../utils/validation-utils';
import { taskStorageWriter, type SWTask } from './media-executor/task-storage-writer';
import { taskStorageReader } from './task-storage-reader';
import { executorFactory, waitForTaskCompletion } from './media-executor';
import { geminiSettings } from '../utils/settings-manager';

/**
 * Task Queue Service
 * Manages task creation, updates, and lifecycle events
 */
class TaskQueueService {
  private static instance: TaskQueueService;
  private tasks: Map<string, Task>;
  private taskUpdates$: Subject<TaskEvent>;

  private constructor() {
    this.tasks = new Map();
    this.taskUpdates$ = new Subject();
  }

  /**
   * Converts Task to SWTask format for IndexedDB storage
   */
  private convertToSWTask(task: Task): SWTask {
    return {
      id: task.id,
      type: task.type,
      status: task.status,
      params: task.params as SWTask['params'],
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      result: task.result,
      error: task.error,
      progress: task.progress,
      remoteId: task.remoteId,
      executionPhase: task.executionPhase,
      savedToLibrary: task.savedToLibrary,
      insertedToCanvas: task.insertedToCanvas,
    };
  }

  /**
   * Persist task to IndexedDB (async, fire-and-forget)
   */
  private persistTask(task: Task): void {
    const swTask = this.convertToSWTask(task);
    taskStorageWriter.saveTask(swTask).catch((error) => {
      console.error('[TaskQueueService] Failed to persist task:', error);
    });
    // Invalidate reader cache after write
    taskStorageReader.invalidateCache();
  }

  /**
   * Delete task from IndexedDB (async, fire-and-forget)
   */
  private persistDelete(taskId: string): void {
    taskStorageWriter.deleteTask(taskId).catch((error) => {
      console.error('[TaskQueueService] Failed to delete task from storage:', error);
    });
    // Invalidate reader cache after delete
    taskStorageReader.invalidateCache();
  }

  /**
   * Execute task using fallback executor (for legacy/fallback mode)
   * This is called automatically after task creation
   */
  private async executeTask(task: Task): Promise<void> {
    try {
      // Check API configuration
      const settings = geminiSettings.get();
      if (!settings.apiKey || !settings.baseUrl) {
        console.warn('[TaskQueueService] No API configuration, cannot execute task');
        this.updateTaskStatus(task.id, TaskStatus.FAILED, {
          error: { code: 'NO_API_KEY', message: '未配置 API Key' },
        });
        return;
      }

      // Get executor
      const executor = await executorFactory.getExecutor();

      // Execute based on task type
      switch (task.type) {
        case TaskType.IMAGE:
          await executor.generateImage({
            taskId: task.id,
            prompt: task.params.prompt,
            model: task.params.model,
            size: task.params.size,
            referenceImages: task.params.referenceImages as string[] | undefined,
            count: task.params.count as number | undefined,
            uploadedImages: task.params.uploadedImages as Array<{ url?: string }> | undefined,
          });
          break;
        case TaskType.VIDEO: {
          const refImages = task.params.referenceImages as string[] | undefined;
          const inputRef = (task.params as { inputReference?: string }).inputReference;
          await executor.generateVideo({
            taskId: task.id,
            prompt: task.params.prompt,
            model: task.params.model,
            duration: task.params.duration?.toString(),
            size: task.params.size,
            referenceImages:
              refImages && refImages.length > 0
                ? refImages
                : inputRef
                  ? [inputRef]
                  : undefined,
          });
          break;
        }
        default:
          throw new Error(`Unsupported task type: ${task.type}`);
      }

      // Poll for task completion
      const result = await waitForTaskCompletion(task.id, {
        timeout: 10 * 60 * 1000, // 10 minutes
        onProgress: (updatedTask) => {
          // Update local state with progress
          const localTask = this.tasks.get(task.id);
          if (localTask) {
            localTask.status = updatedTask.status as TaskStatus;
            localTask.progress = updatedTask.progress;
            localTask.updatedAt = Date.now();
            this.emitEvent('taskUpdated', localTask);
          }
        },
      });

      // Update final state
      const localTask = this.tasks.get(task.id);
      if (localTask && result.task) {
        localTask.status = result.task.status as TaskStatus;
        localTask.result = result.task.result;
        localTask.error = result.task.error;
        localTask.completedAt = result.task.completedAt;
        localTask.updatedAt = Date.now();

        // Persist final state
        this.persistTask(localTask);

        if (result.success) {
          this.emitEvent('taskUpdated', localTask);
        } else {
          this.emitEvent('taskUpdated', localTask);
        }
      }
    } catch (error: any) {
      console.error('[TaskQueueService] Task execution failed:', error);
      const localTask = this.tasks.get(task.id);
      if (localTask) {
        const now = Date.now();
        const failedTask: Task = {
          ...localTask,
          status: TaskStatus.FAILED,
          error: {
            code: 'EXECUTION_ERROR',
            message: error.message || 'Task execution failed',
          },
          updatedAt: now,
          completedAt: now,
          progress: undefined, // 清除进行中进度，避免仍显示百分比
        };
        this.tasks.set(task.id, failedTask);
        this.persistTask(failedTask);
        this.emitEvent('taskUpdated', failedTask);
      }
    }
  }

  /**
   * Gets the singleton instance of TaskQueueService
   */
  static getInstance(): TaskQueueService {
    if (!TaskQueueService.instance) {
      TaskQueueService.instance = new TaskQueueService();
    }
    return TaskQueueService.instance;
  }

  /**
   * Creates a new task and adds it to the queue
   * 
   * @param params - Generation parameters
   * @param type - Task type (image or video)
   * @returns The created task
   * @throws Error if validation fails
   */
  createTask(params: GenerationParams, type: TaskType): Task {
    // Validate parameters
    const validation = validateGenerationParams(params, type);
    if (!validation.valid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
    }

    // Sanitize parameters
    const sanitizedParams = sanitizeGenerationParams(params);

    // Create new task - starts as PROCESSING since it will be executed immediately
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
      // Initialize progress for video tasks
      ...(type === TaskType.VIDEO && { progress: 0 }),
    };

    // Add to queue
    this.tasks.set(task.id, task);

    // Persist to IndexedDB
    this.persistTask(task);

    // Emit event
    this.emitEvent('taskCreated', task);

    // Execute task asynchronously (fire-and-forget)
    this.executeTask(task).catch((error) => {
      console.error('[TaskQueueService] Task execution error:', error);
    });

    // console.log(`[TaskQueueService] Created task ${task.id} (${type})`);
    return task;
  }

  /**
   * Updates a task's status
   * 
   * @param taskId - The task ID
   * @param status - New status
   * @param updates - Additional fields to update
   */
  updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    updates?: Partial<Task>
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn(`[TaskQueueService] Task ${taskId} not found`);
      return;
    }

    const now = Date.now();
    const updatedTask: Task = {
      ...task,
      ...updates,
      status,
      updatedAt: now,
    };

    // Set timestamps based on status
    if (status === TaskStatus.PROCESSING && !updatedTask.startedAt) {
      updatedTask.startedAt = now;
    } else if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) {
      updatedTask.completedAt = now;
    }

    this.tasks.set(taskId, updatedTask);

    // Persist to IndexedDB
    this.persistTask(updatedTask);

    this.emitEvent('taskUpdated', updatedTask);

    // console.log(`[TaskQueueService] Updated task ${taskId} to ${status}`);
  }

  /**
   * Updates a task's progress
   *
   * @param taskId - The task ID
   * @param progress - Progress percentage (0-100)
   */
  updateTaskProgress(taskId: string, progress: number): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn(`[TaskQueueService] Task ${taskId} not found`);
      return;
    }

    const updatedTask: Task = {
      ...task,
      progress: Math.min(100, Math.max(0, progress)),
      updatedAt: Date.now(),
    };

    this.tasks.set(taskId, updatedTask);

    // Persist to IndexedDB
    this.persistTask(updatedTask);

    this.emitEvent('taskUpdated', updatedTask);
  }

  /**
   * Gets a task by ID
   *
   * @param taskId - The task ID
   * @returns The task or undefined
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Gets all tasks
   * 
   * @returns Array of all tasks
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Gets tasks by status
   * 
   * @param status - The status to filter by
   * @returns Array of tasks with the specified status
   */
  getTasksByStatus(status: TaskStatus): Task[] {
    return this.getAllTasks().filter(task => task.status === status);
  }

  /**
   * Gets active tasks (pending, processing, retrying)
   * 
   * @returns Array of active tasks
   */
  getActiveTasks(): Task[] {
    return this.getAllTasks().filter(isTaskActive);
  }

  /**
   * Cancels a task
   * 
   * @param taskId - The task ID to cancel
   */
  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn(`[TaskQueueService] Task ${taskId} not found`);
      return;
    }

    if (!isTaskActive(task)) {
      console.warn(`[TaskQueueService] Task ${taskId} is not active, cannot cancel`);
      return;
    }

    this.updateTaskStatus(taskId, TaskStatus.CANCELLED);
    // console.log(`[TaskQueueService] Cancelled task ${taskId}`);
  }

  /**
   * Retries a failed task
   *
   * @param taskId - The task ID to retry
   */
  retryTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn(`[TaskQueueService] Task ${taskId} not found`);
      return;
    }

    if (task.status !== TaskStatus.FAILED) {
      console.warn(`[TaskQueueService] Task ${taskId} is not failed, cannot retry`);
      return;
    }

    // Reset task for retry - set to PROCESSING for immediate execution
    const now = Date.now();
    this.updateTaskStatus(taskId, TaskStatus.PROCESSING, {
      error: undefined,
      startedAt: now,  // Set new start time
      completedAt: undefined, // Clear completion time
      remoteId: undefined,   // Clear remote ID for fresh submission
      executionPhase: TaskExecutionPhase.SUBMITTING,
      progress: task.type === TaskType.VIDEO ? 0 : undefined, // Reset progress for video
    });

    // Execute task after retry
    const updatedTask = this.tasks.get(taskId);
    if (updatedTask) {
      this.executeTask(updatedTask).catch((error) => {
        console.error('[TaskQueueService] Retry execution error:', error);
      });
    }

    // console.log(`[TaskQueueService] Retrying task ${taskId}`);
  }

  /**
   * Deletes a task from the queue
   * 
   * @param taskId - The task ID to delete
   */
  deleteTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn(`[TaskQueueService] Task ${taskId} not found`);
      return;
    }

    this.tasks.delete(taskId);

    // Delete from IndexedDB
    this.persistDelete(taskId);

    this.emitEvent('taskDeleted', task);

    // console.log(`[TaskQueueService] Deleted task ${taskId}`);
  }

  /**
   * Clears completed tasks
   */
  clearCompletedTasks(): void {
    const completedTasks = this.getTasksByStatus(TaskStatus.COMPLETED);
    completedTasks.forEach(task => this.deleteTask(task.id));
    // console.log(`[TaskQueueService] Cleared ${completedTasks.length} completed tasks`);
  }

  /**
   * Clears failed tasks
   */
  clearFailedTasks(): void {
    const failedTasks = this.getTasksByStatus(TaskStatus.FAILED);
    failedTasks.forEach(task => this.deleteTask(task.id));
    // console.log(`[TaskQueueService] Cleared ${failedTasks.length} failed tasks`);
  }

  /**
   * Restores tasks from storage
   *
   * @param tasks - Array of tasks to restore
   */
  restoreTasks(tasks: Task[]): void {
    this.tasks.clear();
    tasks.forEach(task => {
      // Ensure video tasks have progress field (for backward compatibility)
      const restoredTask: Task = task.type === TaskType.VIDEO && task.progress === undefined
        ? { ...task, progress: 0 }
        : task;

      this.tasks.set(restoredTask.id, restoredTask);
      // Emit event for each restored task so subscribers can update UI
      this.emitEvent('taskCreated', restoredTask);
    });
    // console.log(`[TaskQueueService] Restored ${tasks.length} tasks`);
  }

  /**
   * Observes task update events
   *
   * @returns Observable stream of task events
   */
  observeTaskUpdates(): Observable<TaskEvent> {
    return this.taskUpdates$.asObservable();
  }

  /**
   * Marks a task as saved to the media library
   * This prevents duplicate saves when task updates occur
   *
   * @param taskId - The task ID to mark as saved
   */
  markAsSaved(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn(`[TaskQueueService] Task ${taskId} not found`);
      return;
    }

    this.updateTaskStatus(taskId, task.status, {
      savedToLibrary: true,
    });

    // console.log(`[TaskQueueService] Marked task ${taskId} as saved to library`);
  }

  /**
   * Marks a task as inserted to canvas
   * @param taskId - The task ID to mark as inserted
   */
  markAsInserted(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.warn(`[TaskQueueService] Task ${taskId} not found`);
      return;
    }

    this.updateTaskStatus(taskId, task.status, {
      insertedToCanvas: true,
    });
  }

  /**
   * Emits a task event
   * @private
   */
  private emitEvent(type: TaskEvent['type'], task: Task): void {
    this.taskUpdates$.next({
      type,
      task,
      timestamp: Date.now(),
    });
  }
}

// Export singleton instance
export const taskQueueService = TaskQueueService.getInstance();
