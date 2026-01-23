/**
 * Task Queue Service
 * 
 * Core service for managing the task queue lifecycle.
 * Implements singleton pattern and uses RxJS for event-driven architecture.
 */

import { Subject, Observable } from 'rxjs';
import { Task, TaskStatus, TaskType, TaskEvent, GenerationParams } from '../types/task.types';
import { generateTaskId, isTaskActive } from '../utils/task-utils';
import { validateGenerationParams, sanitizeGenerationParams } from '../utils/validation-utils';

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

    // Create new task
    const now = Date.now();
    const task: Task = {
      id: generateTaskId(),
      type,
      status: TaskStatus.PENDING,
      params: sanitizedParams,
      createdAt: now,
      updatedAt: now,
      // Initialize progress for video tasks
      ...(type === TaskType.VIDEO && { progress: 0 }),
    };

    // Add to queue
    this.tasks.set(task.id, task);

    // Emit event
    this.emitEvent('taskCreated', task);

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

    // Reset task for retry - clear timing fields to prevent immediate timeout
    this.updateTaskStatus(taskId, TaskStatus.PENDING, {
      error: undefined,
      startedAt: undefined,  // Reset start time so timeout is recalculated
      completedAt: undefined, // Clear completion time
      remoteId: undefined,   // Clear remote ID for fresh submission
      executionPhase: undefined, // Clear execution phase
      progress: task.type === TaskType.VIDEO ? 0 : undefined, // Reset progress for video
    });

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
