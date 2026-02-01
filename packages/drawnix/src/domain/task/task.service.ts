/**
 * Task Service
 *
 * Business logic layer for task management.
 * Uses TaskRepository for data access and publishes domain events.
 */

import { Observable, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import type {
  Task,
  TaskStatus,
  TaskType,
  TaskEvent,
  GenerationParams,
} from './task.model';
import { taskRepository, type PaginatedTaskResult } from './task.repository';
import {
  domainEventBus,
  createTaskCreatedEvent,
  createTaskCompletedEvent,
  createTaskFailedEvent,
  createTaskDeletedEvent,
} from '../shared/event-bus';
import { validateGenerationParams, sanitizeGenerationParams } from '../../utils/validation-utils';

/**
 * Task Service - unified task management
 */
class TaskService {
  private static instance: TaskService;
  private eventSubscription: Subscription | null = null;

  private constructor() {
    this.setupEventForwarding();
  }

  static getInstance(): TaskService {
    if (!TaskService.instance) {
      TaskService.instance = new TaskService();
    }
    return TaskService.instance;
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  async initialize(): Promise<boolean> {
    return taskRepository.initialize();
  }

  isInitialized(): boolean {
    return taskRepository.isInitialized();
  }

  async reinitialize(): Promise<boolean> {
    return taskRepository.reinitialize();
  }

  /** Alias for initialize() */
  async initializeSW(): Promise<boolean> {
    return this.initialize();
  }

  // ============================================================================
  // Task Operations
  // ============================================================================

  /**
   * Create a new task - returns synchronously for immediate UI feedback
   */
  createTask(params: GenerationParams, type: TaskType): Task {
    const validation = validateGenerationParams(params, type);
    if (!validation.valid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
    }

    const sanitizedParams = sanitizeGenerationParams(params);
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    const task: Task = {
      id: taskId,
      type,
      status: 'processing',
      params: sanitizedParams,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      executionPhase: 'submitting',
      ...(type === 'video' && { progress: 0 }),
    };

    // Submit to repository asynchronously
    taskRepository.create({ type, params: sanitizedParams }).catch(err => {
      console.error('[TaskService] Failed to submit task:', err);
    });

    return task;
  }

  /** Create task (async version) */
  async createTaskAsync(params: GenerationParams, type: TaskType): Promise<Task> {
    const validation = validateGenerationParams(params, type);
    if (!validation.valid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
    }
    const sanitizedParams = sanitizeGenerationParams(params);
    return taskRepository.create({ type, params: sanitizedParams });
  }

  /** Get task from local cache */
  getTask(taskId: string): Task | undefined {
    return taskRepository.getAll().find(t => t.id === taskId);
  }

  /** Get task (may fetch from SW) */
  async getTaskAsync(taskId: string): Promise<Task | null> {
    return taskRepository.getById(taskId);
  }

  /** Alias for getTask() */
  getTaskSync(taskId: string): Task | undefined {
    return this.getTask(taskId);
  }

  getAllTasks(): Task[] {
    return taskRepository.getAll();
  }

  getTasksByStatus(status: TaskStatus): Task[] {
    return taskRepository.getByStatus(status);
  }

  getTasksByType(type: TaskType): Task[] {
    return taskRepository.getByType(type);
  }

  getActiveTasks(): Task[] {
    return this.getAllTasks().filter(t => 
      t.status === 'pending' || t.status === 'processing'
    );
  }

  hasActiveTasks(): boolean {
    return this.getActiveTasks().length > 0;
  }

  async cancelTask(taskId: string): Promise<void> {
    return taskRepository.cancel(taskId);
  }

  async retryTask(taskId: string): Promise<void> {
    return taskRepository.retry(taskId);
  }

  async deleteTask(taskId: string): Promise<void> {
    return taskRepository.delete(taskId);
  }

  markAsSaved(taskId: string): void {
    taskRepository.update(taskId, { savedToLibrary: true });
  }

  markAsInserted(taskId: string): void {
    taskRepository.update(taskId, { insertedToCanvas: true });
  }

  async clearCompletedTasks(): Promise<void> {
    const completedTasks = this.getTasksByStatus('completed');
    for (const task of completedTasks) {
      await this.deleteTask(task.id);
    }
  }

  async clearFailedTasks(): Promise<void> {
    const failedTasks = this.getTasksByStatus('failed');
    for (const task of failedTasks) {
      await this.deleteTask(task.id);
    }
  }

  // ============================================================================
  // Sync and Pagination
  // ============================================================================

  async syncFromSW(): Promise<void> {
    return taskRepository.sync();
  }

  /** Alias for syncFromSW() */
  async syncTasksFromSW(): Promise<void> {
    return this.syncFromSW();
  }

  async loadMoreTasks(): Promise<boolean> {
    return taskRepository.loadMore();
  }

  getPaginationState(): { total: number; loadedCount: number; hasMore: boolean } {
    return taskRepository.getPaginationState();
  }

  async loadTasksByType(
    type: TaskType,
    offset: number = 0,
    limit: number = 50
  ): Promise<PaginatedTaskResult> {
    return taskRepository.loadByType(type, { offset, limit });
  }

  // ============================================================================
  // Import/Export
  // ============================================================================

  async importTasks(tasks: Task[]): Promise<boolean> {
    return taskRepository.importTasks(tasks);
  }

  /** Alias for importTasks() */
  async restoreTasks(tasks: Task[]): Promise<void> {
    await this.importTasks(tasks);
  }

  // ============================================================================
  // Legacy Methods
  // ============================================================================

  updateTaskProgress(taskId: string, progress: number): void {
    taskRepository.update(taskId, { progress: Math.min(100, Math.max(0, progress)) });
  }

  updateTaskStatus(taskId: string, status: TaskStatus, updates?: Partial<Task>): void {
    taskRepository.update(taskId, { ...updates, status });
  }

  // ============================================================================
  // Observable
  // ============================================================================

  observeTaskUpdates(): Observable<TaskEvent> {
    return taskRepository.observe();
  }

  observeTask(taskId: string): Observable<TaskEvent> {
    return taskRepository.observe().pipe(
      filter(event => event.task.id === taskId)
    );
  }

  observeCompletedTasks(): Observable<TaskEvent> {
    return taskRepository.observe().pipe(
      filter(event => 
        event.type === 'taskUpdated' && 
        event.task.status === 'completed'
      )
    );
  }

  observeFailedTasks(): Observable<TaskEvent> {
    return taskRepository.observe().pipe(
      filter(event => 
        event.type === 'taskUpdated' && 
        event.task.status === 'failed'
      )
    );
  }

  // ============================================================================
  // Private
  // ============================================================================

  private setupEventForwarding(): void {
    this.eventSubscription = taskRepository.observe().subscribe(event => {
      switch (event.type) {
        case 'taskCreated':
          domainEventBus.publish(createTaskCreatedEvent(event.task));
          break;
        case 'taskUpdated':
          if (event.task.status === 'completed') {
            domainEventBus.publish(createTaskCompletedEvent(event.task));
          } else if (event.task.status === 'failed' && event.task.error) {
            domainEventBus.publish(createTaskFailedEvent(event.task, event.task.error));
          }
          break;
        case 'taskDeleted':
          domainEventBus.publish(createTaskDeletedEvent(event.task.id, event.task));
          break;
      }
    });
  }

  destroy(): void {
    if (this.eventSubscription) {
      this.eventSubscription.unsubscribe();
      this.eventSubscription = null;
    }
    taskRepository.destroy();
  }
}

export const taskService = TaskService.getInstance();
