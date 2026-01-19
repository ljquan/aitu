/**
 * Service Worker Task Queue Core
 *
 * Manages task queue within Service Worker context.
 * Handles task scheduling, execution, status tracking, and client communication.
 * Uses IndexedDB for persistence to survive page refreshes.
 */

import type {
  SWTask,
  TaskResult,
  TaskError,
  GeminiConfig,
  VideoAPIConfig,
  TaskQueueConfig,
  HandlerConfig,
  MainToSWMessage,
  SWToMainMessage,
} from './types';
import {
  TaskStatus,
  TaskType,
  TaskExecutionPhase,
  DEFAULT_TASK_QUEUE_CONFIG,
} from './types';
import { taskQueueStorage } from './storage';
import { sendToClient, sendToClientById } from './utils/message-bus';
import { migrateBase64UrlIfNeeded } from './utils/media-generation-utils';

// Handler imports
import { ImageHandler } from './handlers/image';
import { VideoHandler } from './handlers/video';
import { CharacterHandler } from './handlers/character';
import { ChatHandler } from './handlers/chat';

/**
 * Chat result cache entry
 */
interface ChatResultCache {
  chatId: string;
  fullContent: string;
  timestamp: number;
  delivered: boolean;
}

/**
 * Task Queue Manager for Service Worker
 */
export class SWTaskQueue {
  private tasks: Map<string, SWTask> = new Map();
  private runningTasks: Set<string> = new Set();
  private config: TaskQueueConfig;
  private geminiConfig: GeminiConfig | null = null;
  private videoConfig: VideoAPIConfig | null = null;
  private initialized = false;

  // Chat result cache - stores recent chat results for recovery after page refresh
  private chatResultCache: Map<string, ChatResultCache> = new Map();
  private readonly CHAT_CACHE_TTL = 60 * 1000; // 1 minute TTL

  // Handlers
  private imageHandler: ImageHandler;
  private videoHandler: VideoHandler;
  private characterHandler: CharacterHandler;
  private chatHandler: ChatHandler;

  // Reference to SW global scope
  private sw: ServiceWorkerGlobalScope;

  private onTaskStatusChange?: (taskId: string, status: 'completed' | 'failed', result?: any, error?: string) => void;

  // Track storage restoration completion
  private storageRestorePromise: Promise<void>;

  constructor(sw: ServiceWorkerGlobalScope, config?: Partial<TaskQueueConfig>) {
    this.sw = sw;
    this.config = { ...DEFAULT_TASK_QUEUE_CONFIG, ...config };

    // Initialize handlers
    this.imageHandler = new ImageHandler();
    this.videoHandler = new VideoHandler();
    this.characterHandler = new CharacterHandler();
    this.chatHandler = new ChatHandler();

    // Auto-restore on construction and track the promise
    this.storageRestorePromise = this.restoreFromStorage();
  }

  /**
   * Set callback for internal task status changes
   */
  setTaskStatusChangeCallback(callback: (taskId: string, status: 'completed' | 'failed', result?: any, error?: string) => void): void {
    this.onTaskStatusChange = callback;
  }

  /**
   * Get Gemini config for MCP tool execution
   */
  getGeminiConfig(): GeminiConfig | null {
    return this.geminiConfig;
  }

  /**
   * Get Video config for MCP tool execution
   */
  getVideoConfig(): VideoAPIConfig | null {
    return this.videoConfig;
  }

  /**
   * Get SW global scope for MCP tool execution
   */
  getSW(): ServiceWorkerGlobalScope {
    return this.sw;
  }

  /**
   * Restore tasks and config from IndexedDB on SW startup
   */
  private async restoreFromStorage(): Promise<void> {
    try {
      // Load saved config
      const { geminiConfig, videoConfig } = await taskQueueStorage.loadConfig();
      
      if (geminiConfig && videoConfig) {
        this.geminiConfig = geminiConfig;
        this.videoConfig = videoConfig;
        this.initialized = true;
      }

      // Load all tasks
      const tasks = await taskQueueStorage.getAllTasks();

      // 迁移计数器
      let migratedCount = 0;

      for (const task of tasks) {
        // 迁移旧的 Base64 URL（已完成的图片/视频任务）
        if (
          task.status === TaskStatus.COMPLETED &&
          task.result?.url &&
          task.result.url.startsWith('data:image/')
        ) {
          const { url: newUrl, migrated } = await migrateBase64UrlIfNeeded(task.result.url);
          if (migrated) {
            task.result.url = newUrl;
            // 更新存储
            await taskQueueStorage.updateTask(task);
            migratedCount++;
          }
        }

        this.tasks.set(task.id, task);

        // Handle interrupted Chat tasks - mark as failed since streaming can't be resumed
        if (task.type === TaskType.CHAT && task.status === TaskStatus.PROCESSING) {
          await this.markTaskFailed(task.id, {
            code: 'INTERRUPTED',
            message: 'Chat 请求被中断（页面刷新），请重试',
          });
          continue;
        }

        // Resume active tasks
        if (this.shouldResumeTask(task)) {
          this.resumeTaskExecution(task);
        }
      }

      if (migratedCount > 0) {
        console.log(`[SWTaskQueue] Migrated ${migratedCount} Base64 URLs to cache`);
      }

      // NOTE: Removed automatic cleanup of old tasks
      // Tasks are needed for asset library display, do not auto-delete
    } catch (error) {
      console.error('[SWTaskQueue] Failed to restore from storage:', error);
    }
  }

  /**
   * Check if a task should be resumed
   */
  private shouldResumeTask(task: SWTask): boolean {
    // Chat tasks cannot be resumed if they were processing (streaming is stateless)
    // Mark them as failed instead
    if (task.type === TaskType.CHAT && task.status === TaskStatus.PROCESSING) {
      return false; // Will be handled separately to mark as failed
    }

    // Resume tasks that were processing
    if (task.status === TaskStatus.PROCESSING) {
      return true;
    }

    // Resume pending tasks
    if (task.status === TaskStatus.PENDING) {
      return true;
    }

    // Resume failed video/character tasks with remoteId that failed due to network errors
    if (
      (task.type === TaskType.VIDEO || task.type === TaskType.CHARACTER) &&
      task.status === TaskStatus.FAILED &&
      task.remoteId &&
      this.isNetworkError(task)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Check if task error is a network error that can be recovered
   * Returns false for business failures (API returned explicit failure)
   */
  private isNetworkError(task: SWTask): boolean {
    const errorMessage = task.error?.message || '';
    const originalError = task.error?.details?.originalError || '';
    const errorCode = task.error?.code || '';
    const combinedError = `${errorMessage} ${originalError}`.toLowerCase();
    
    // Exclude business failures - these should not be retried
    const isBusinessFailure = (
      combinedError.includes('generation_failed') ||
      combinedError.includes('invalid_argument') ||
      combinedError.includes('prohibited') ||
      combinedError.includes('content policy') ||
      combinedError.includes('视频生成失败') ||
      errorCode.includes('generation_failed') ||
      errorCode.includes('INVALID')
    );
    
    if (isBusinessFailure) {
      return false;
    }
    
    // Check for network-related errors
    return (
      combinedError.includes('failed to fetch') ||
      combinedError.includes('network') ||
      combinedError.includes('fetch') ||
      combinedError.includes('timeout') ||
      combinedError.includes('aborted') ||
      combinedError.includes('connection') ||
      combinedError.includes('status query failed')
    );
  }

  /**
   * Resume task execution after SW restart
   */
  private async resumeTaskExecution(task: SWTask): Promise<void> {
    if (!this.initialized) {
      return;
    }

    // If task has remoteId, it was in polling phase - resume polling
    if (task.remoteId && (task.type === TaskType.VIDEO || task.type === TaskType.CHARACTER)) {
      
      // If task was failed (network error recovery), reset status to processing
      if (task.status === TaskStatus.FAILED) {
        task.status = TaskStatus.PROCESSING;
        task.error = undefined; // Clear error
        task.executionPhase = TaskExecutionPhase.POLLING;
        task.updatedAt = Date.now();
        this.tasks.set(task.id, task);
        await taskQueueStorage.saveTask(task);
      }
      
      this.runningTasks.add(task.id);

      // Broadcast status update to clients
      this.broadcastToClients({
        type: 'TASK_STATUS',
        taskId: task.id,
        status: TaskStatus.PROCESSING,
        progress: task.progress,
        phase: TaskExecutionPhase.POLLING,
        updatedAt: task.updatedAt,
      });

      this.executeResume(task, task.remoteId);
    } else if (task.status === TaskStatus.PENDING) {
      // Re-execute pending tasks
      this.processQueue();
    } else if (
      // Video/Character task in processing but no remoteId - try to recover from LLM API logs
      (task.type === TaskType.VIDEO || task.type === TaskType.CHARACTER) &&
      task.status === TaskStatus.PROCESSING &&
      !task.remoteId
    ) {
      // Try to find completed result from LLM API logs
      const { findSuccessLogByTaskId } = await import('./llm-api-logger');
      const successLog = await findSuccessLogByTaskId(task.id);
      
      if (successLog && successLog.resultUrl) {
        
        // Parse response body for additional info
        let width: number | undefined;
        let height: number | undefined;
        let duration: number | undefined;
        
        if (successLog.responseBody) {
          try {
            const responseData = JSON.parse(successLog.responseBody);
            width = responseData.width;
            height = responseData.height;
            duration = parseInt(responseData.seconds || '0') || 0;
          } catch {
            // Ignore parse errors
          }
        }
        
        // Mark task as completed with the recovered result
        await this.handleTaskSuccess(task.id, {
          url: successLog.resultUrl,
          format: task.type === TaskType.VIDEO ? 'mp4' : 'png',
          size: 0,
          width,
          height,
          duration,
        });
        return;
      }
      
      // No success log found - mark as failed (don't re-submit to avoid extra cost)
      await this.handleTaskError(task.id, new Error('任务中断且无法恢复（未找到已完成的结果）'));
    } else if (
      // Image/inspiration board task in processing - try to recover from LLM API logs
      (task.type === TaskType.IMAGE || task.type === TaskType.INSPIRATION_BOARD) &&
      task.status === TaskStatus.PROCESSING
    ) {
      // Try to find completed result from LLM API logs (same as video/character)
      const { findSuccessLogByTaskId } = await import('./llm-api-logger');
      const successLog = await findSuccessLogByTaskId(task.id);
      
      if (successLog && successLog.resultUrl) {
        // Mark task as completed with the recovered result
        await this.handleTaskSuccess(task.id, {
          url: successLog.resultUrl,
          format: 'png',
          size: 0,
        });
        return;
      }
      
      // No success log found - mark as failed (don't re-submit to avoid extra cost)
      await this.handleTaskError(task.id, new Error('任务中断且无法恢复（未找到已完成的结果）'));
    }
  }

  /**
   * Initialize with API configurations
   */
  async initialize(geminiConfig: GeminiConfig, videoConfig: VideoAPIConfig): Promise<void> {
    // Wait for storage restoration to complete first
    await this.storageRestorePromise;

    this.geminiConfig = geminiConfig;
    this.videoConfig = videoConfig;
    this.initialized = true;

    // Save config to storage for persistence
    await taskQueueStorage.saveConfig(geminiConfig, videoConfig);

    this.broadcastToClients({ type: 'TASK_QUEUE_INITIALIZED', success: true });

    // Push all current tasks to clients for initial sync
    this.syncTasksToClients();

    // Resume processing tasks that have remoteId (video/character polling)
    // This handles the case where restoreFromStorage ran before config was available
    for (const task of this.tasks.values()) {
      if (this.shouldResumeTask(task) && !this.runningTasks.has(task.id)) {
        this.resumeTaskExecution(task);
      }
    }

    // Process any pending tasks
    this.processQueue();
  }

  /**
   * Update API configurations
   */
  async updateConfig(
    geminiConfig?: Partial<GeminiConfig>,
    videoConfig?: Partial<VideoAPIConfig>
  ): Promise<void> {
    if (geminiConfig && this.geminiConfig) {
      this.geminiConfig = { ...this.geminiConfig, ...geminiConfig };
    }
    if (videoConfig && this.videoConfig) {
      this.videoConfig = { ...this.videoConfig, ...videoConfig };
    }

    // Save updated config
    await taskQueueStorage.saveConfig(this.geminiConfig, this.videoConfig);
  }

  /**
   * Submit a new task
   */
  async submitTask(
    taskId: string,
    taskType: TaskType,
    params: SWTask['params'],
    _clientId: string // clientId is no longer used for targeting
  ): Promise<void> {
    // Check for duplicate by taskId only
    if (this.tasks.has(taskId)) {
      console.warn(`[SWTaskQueue] Task ${taskId} already exists`);
      return;
    }

    const now = Date.now();
    const task: SWTask = {
      id: taskId,
      type: taskType,
      status: TaskStatus.PENDING,
      params,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(taskId, task);

    // Persist to IndexedDB
    await taskQueueStorage.saveTask(task);

    // Broadcast task created to all clients
    this.broadcastToClients({
      type: 'TASK_CREATED',
      task,
    });

    // console.log(`[SWTaskQueue] Task submitted: ${taskId}`);
    this.processQueue();
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Cancel running handler
    if (this.runningTasks.has(taskId)) {
      this.getHandler(task.type)?.cancel(taskId);
      this.runningTasks.delete(taskId);
    }

    // Update status
    task.status = TaskStatus.CANCELLED;
    task.updatedAt = Date.now();
    this.tasks.set(taskId, task);

    // Persist
    await taskQueueStorage.saveTask(task);

    this.broadcastToClients({
      type: 'TASK_CANCELLED',
      taskId,
    });
  }

  /**
   * Retry a failed or cancelled task
   */
  async retryTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || (task.status !== TaskStatus.FAILED && task.status !== TaskStatus.CANCELLED)) return;

    task.status = TaskStatus.PENDING;
    task.error = undefined;
    task.updatedAt = Date.now();
    this.tasks.set(taskId, task);

    // Persist
    await taskQueueStorage.saveTask(task);

    // Broadcast status change to all clients
    this.broadcastToClients({
      type: 'TASK_STATUS',
      taskId: task.id,
      status: task.status,
      updatedAt: task.updatedAt,
    });

    this.processQueue();
  }

  /**
   * Resume a task after page refresh (called from client)
   */
  async resumeTask(
    taskId: string,
    remoteId: string,
    taskType: TaskType,
    _clientId: string
  ): Promise<void> {
    let task = this.tasks.get(taskId);

    if (!task) {
      // Create a placeholder task for resumption
      const now = Date.now();
      task = {
        id: taskId,
        type: taskType,
        status: TaskStatus.PROCESSING,
        params: { prompt: '' },
        createdAt: now,
        updatedAt: now,
        remoteId,
        executionPhase: TaskExecutionPhase.POLLING,
      };
      this.tasks.set(taskId, task);
      await taskQueueStorage.saveTask(task);
    }

    // Resume polling
    if (taskType === TaskType.VIDEO || taskType === TaskType.CHARACTER) {
      this.runningTasks.add(taskId);
      this.executeResume(task, remoteId);
    }
  }

  /**
   * Get task status
   */
  getTask(taskId: string): SWTask | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Get all tasks
   */
  getAllTasks(): SWTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Cancel if running
    if (this.runningTasks.has(taskId)) {
      this.getHandler(task.type)?.cancel(taskId);
      this.runningTasks.delete(taskId);
    }

    this.tasks.delete(taskId);

    // Remove from storage
    await taskQueueStorage.deleteTask(taskId);

    this.broadcastToClients({
      type: 'TASK_DELETED',
      taskId,
    });
  }

  /**
   * Mark a task as inserted to canvas
   */
  async markTaskInserted(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const updatedTask: SWTask = {
      ...task,
      insertedToCanvas: true,
      updatedAt: Date.now(),
    };

    this.tasks.set(taskId, updatedTask);
    await taskQueueStorage.saveTask(updatedTask);
  }

  /**
   * Restore tasks from client storage (legacy support)
   */
  async restoreTasks(tasks: SWTask[]): Promise<void> {
    for (const task of tasks) {
      // Only restore non-terminal tasks
      if (
        task.status !== TaskStatus.COMPLETED &&
        task.status !== TaskStatus.CANCELLED
      ) {
        this.tasks.set(task.id, task);
        await taskQueueStorage.saveTask(task);
      }
    }
    this.processQueue();
  }

  /**
   * Handle chat start
   */
  async startChat(
    chatId: string,
    params: import('./types').ChatParams,
    _clientId: string
  ): Promise<void> {
    if (!this.geminiConfig) {
      this.broadcastToClients({
        type: 'CHAT_ERROR',
        chatId,
        error: 'Gemini config not initialized',
      });
      return;
    }

    try {
      const fullContent = await this.chatHandler.stream(
        chatId,
        params,
        this.geminiConfig,
        (content) => {
          this.broadcastToClients({
            type: 'CHAT_CHUNK',
            chatId,
            content,
          });
        }
      );

      // Cache the result before broadcasting (for recovery after page refresh)
      this.chatResultCache.set(chatId, {
        chatId,
        fullContent,
        timestamp: Date.now(),
        delivered: false,
      });

      this.broadcastToClients({
        type: 'CHAT_DONE',
        chatId,
        fullContent,
      });

      // Mark as delivered after broadcast
      const cached = this.chatResultCache.get(chatId);
      if (cached) {
        cached.delivered = true;
      }

      // Clean up old cache entries
      this.cleanupChatCache();
    } catch (error) {
      this.broadcastToClients({
        type: 'CHAT_ERROR',
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get cached chat result (for recovery after page refresh)
   */
  getCachedChatResult(chatId: string): ChatResultCache | undefined {
    return this.chatResultCache.get(chatId);
  }

  /**
   * Get all cached chat results
   */
  getAllCachedChatResults(): ChatResultCache[] {
    return Array.from(this.chatResultCache.values());
  }

  /**
   * Clean up expired chat cache entries
   */
  private cleanupChatCache(): void {
    const now = Date.now();
    for (const [chatId, entry] of this.chatResultCache.entries()) {
      if (now - entry.timestamp > this.CHAT_CACHE_TTL) {
        this.chatResultCache.delete(chatId);
      }
    }
  }

  /**
   * Handle chat stop
   */
  stopChat(chatId: string): void {
    this.chatHandler.stop(chatId);
  }

  /**
   * Sync all tasks to clients (for reconnection)
   */
  syncTasksToClients(): void {
    const tasks = this.getAllTasks();
    this.broadcastToClients({
      type: 'TASK_ALL_RESPONSE',
      tasks,
    });
  }

  /**
   * Get tasks with pagination
   * @param options Pagination options
   */
  async getTasksPaginated(options: {
    offset: number;
    limit: number;
    status?: string;
    type?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ tasks: SWTask[]; total: number; hasMore: boolean }> {
    return taskQueueStorage.getTasksPaginated(options);
  }

  /**
   * Sync paginated tasks to clients
   */
  async syncPaginatedTasksToClients(options: {
    offset: number;
    limit: number;
    status?: string;
    type?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<void> {
    const result = await this.getTasksPaginated(options);
    this.broadcastToClients({
      type: 'TASK_PAGINATED_RESPONSE',
      tasks: result.tasks,
      total: result.total,
      offset: options.offset,
      hasMore: result.hasMore,
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Process the task queue
   */
  private processQueue(): void {
    if (!this.initialized) {
      console.warn('[SWTaskQueue] Not initialized, skipping queue processing');
      return;
    }

    // Get pending tasks
    const pendingTasks = Array.from(this.tasks.values())
      .filter((t) => t.status === TaskStatus.PENDING)
      .sort((a, b) => a.createdAt - b.createdAt);

    // Execute all pending tasks immediately (no concurrent limit)
    for (const task of pendingTasks) {
      this.executeTask(task);
    }
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: SWTask): Promise<void> {
    if (!this.geminiConfig || !this.videoConfig) {
      console.warn('[SWTaskQueue] Config not set, cannot execute task:', task.id);
      return;
    }

    this.runningTasks.add(task.id);

    // Update status to processing
    task.status = TaskStatus.PROCESSING;
    task.startedAt = Date.now();
    task.updatedAt = Date.now();
    task.executionPhase = TaskExecutionPhase.SUBMITTING;
    this.tasks.set(task.id, task);

    // Persist status change
    await taskQueueStorage.saveTask(task);

    this.broadcastToClients({
      type: 'TASK_STATUS',
      taskId: task.id,
      status: task.status,
      phase: task.executionPhase,
      updatedAt: task.updatedAt,
    });

    const handlerConfig: HandlerConfig = {
      geminiConfig: this.geminiConfig,
      videoConfig: this.videoConfig,
      onProgress: async (taskId, progress, phase) => {
        const t = this.tasks.get(taskId);
        // Only send progress updates for non-terminal states
        // This prevents race conditions where TASK_STATUS with COMPLETED status
        // is sent before TASK_COMPLETED message
        if (t && t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.FAILED && t.status !== TaskStatus.CANCELLED) {
          const currentStatus = t.status; // Capture status before async operations
          t.progress = progress;
          if (phase) t.executionPhase = phase;
          t.updatedAt = Date.now();
          this.tasks.set(taskId, t);

          // Persist progress
          await taskQueueStorage.saveTask(t);

          // Re-check status after async operation to avoid race condition
          const taskAfterSave = this.tasks.get(taskId);
          if (taskAfterSave && taskAfterSave.status === currentStatus) {
            this.broadcastToClients({
              type: 'TASK_STATUS',
              taskId,
              status: currentStatus,
              progress,
              phase,
              updatedAt: t.updatedAt,
            });
          }
        }
      },
      onRemoteId: async (taskId, remoteId) => {
        const t = this.tasks.get(taskId);
        if (t) {
          t.remoteId = remoteId;
          t.executionPhase = TaskExecutionPhase.POLLING;
          t.updatedAt = Date.now();
          this.tasks.set(taskId, t);

          // Persist remoteId - critical for resume
          await taskQueueStorage.saveTask(t);

          this.broadcastToClients({
            type: 'TASK_SUBMITTED',
            taskId,
            remoteId,
          });
        }
      },
    };

    try {
      const handler = this.getHandler(task.type);
      if (!handler) {
        throw new Error(`No handler for task type: ${task.type}`);
      }

      // Get timeout for this task type
      const taskTimeout = this.config.timeouts[task.type] || 10 * 60 * 1000; // Default 10 minutes

      // Execute with timeout
      const result = await Promise.race([
        handler.execute(task, handlerConfig),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            // Cancel the handler when timeout occurs
            handler.cancel?.(task.id);
            reject(new Error(`Task timeout after ${Math.round(taskTimeout / 60000)} minutes`));
          }, taskTimeout);
        }),
      ]);

      await this.handleTaskSuccess(task.id, result);
    } catch (error) {
      await this.handleTaskError(task.id, error);
    }
  }

  /**
   * Execute task resumption
   */
  private async executeResume(task: SWTask, remoteId: string): Promise<void> {
    if (!this.geminiConfig || !this.videoConfig) {
      return;
    }

    const handlerConfig: HandlerConfig = {
      geminiConfig: this.geminiConfig,
      videoConfig: this.videoConfig,
      onProgress: async (taskId, progress, phase) => {
        const t = this.tasks.get(taskId);
        // Only send progress updates for non-terminal states
        if (t && t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.FAILED && t.status !== TaskStatus.CANCELLED) {
          const currentStatus = t.status;
          t.progress = progress;
          if (phase) t.executionPhase = phase;
          t.updatedAt = Date.now();
          this.tasks.set(taskId, t);

          await taskQueueStorage.saveTask(t);

          // Re-check status after async operation
          const taskAfterSave = this.tasks.get(taskId);
          if (taskAfterSave && taskAfterSave.status === currentStatus) {
            this.broadcastToClients({
              type: 'TASK_STATUS',
              taskId,
              status: currentStatus,
              progress,
              phase,
              updatedAt: t.updatedAt,
            });
          }
        }
      },
      onRemoteId: () => {}, // Already have remoteId
    };

    try {
      const handler = this.getHandler(task.type);
      if (!handler?.resume) {
        throw new Error(`Handler does not support resume: ${task.type}`);
      }

      task.remoteId = remoteId;
      const result = await handler.resume(task, handlerConfig);
      await this.handleTaskSuccess(task.id, result);
    } catch (error) {
      console.error(`[SWTaskQueue] executeResume: 任务 ${task.id} 恢复失败`, error);
      await this.handleTaskError(task.id, error);
    }
  }

  /**
   * Handle successful task completion
   */
  private async handleTaskSuccess(taskId: string, result: TaskResult): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // console.log('[TaskQueue] Task completed:', taskId, 'result:', JSON.stringify(result));

    task.status = TaskStatus.COMPLETED;
    task.result = result;
    task.completedAt = Date.now();
    task.updatedAt = Date.now();
    task.executionPhase = undefined;
    this.tasks.set(taskId, task);

    this.runningTasks.delete(taskId);

    // Persist completion
    await taskQueueStorage.saveTask(task);

    this.broadcastToClients({
      type: 'TASK_COMPLETED',
      taskId,
      result,
      completedAt: task.completedAt,
    });

    // Notify internal listeners
    this.onTaskStatusChange?.(taskId, 'completed', result);

    // Process next task
    this.processQueue();
  }

  /**
   * Handle task error
   */
  private async handleTaskError(taskId: string, error: unknown): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    this.runningTasks.delete(taskId);

    const taskError: TaskError = {
      code: 'EXECUTION_ERROR',
      message: error instanceof Error ? error.message : String(error),
      details: {
        originalError: error instanceof Error ? error.stack : String(error),
        timestamp: Date.now(),
      },
    };

    // 不再重试，直接标记为失败
    task.status = TaskStatus.FAILED;
    task.error = taskError;
    task.updatedAt = Date.now();
    this.tasks.set(taskId, task);

    // Persist failure
    await taskQueueStorage.saveTask(task);

    this.broadcastToClients({
      type: 'TASK_FAILED',
      taskId,
      error: taskError,
    });

    // Notify internal listeners
    this.onTaskStatusChange?.(taskId, 'failed', undefined, taskError.message);

    // Process next task
    this.processQueue();
  }

  /**
   * Mark a task as failed (helper for interrupted tasks)
   */
  private async markTaskFailed(taskId: string, error: TaskError): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = TaskStatus.FAILED;
    task.error = error;
    task.updatedAt = Date.now();
    this.tasks.set(taskId, task);

    // Persist failure
    await taskQueueStorage.saveTask(task);

    this.broadcastToClients({
      type: 'TASK_FAILED',
      taskId,
      error,
    });
  }

  /**
   * Get handler for task type
   */
  private getHandler(type: TaskType) {
    switch (type) {
      case TaskType.IMAGE:
      case TaskType.INSPIRATION_BOARD:
        return this.imageHandler;
      case TaskType.VIDEO:
        return this.videoHandler;
      case TaskType.CHARACTER:
        return this.characterHandler;
      case TaskType.CHAT:
        return this.chatHandler;
      default:
        return null;
    }
  }

  /**
   * Broadcast message to all clients
   * This is the primary communication method - no longer targeting specific clients
   */
  private async broadcastToClients(message: SWToMainMessage): Promise<void> {
    try {
      const clients = await this.sw.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        sendToClient(client, message);
      }
    } catch (error) {
      console.error('[SWTaskQueue] Failed to broadcast:', error);
    }
  }
}

// Singleton instance
let taskQueueInstance: SWTaskQueue | null = null;

/**
 * Initialize task queue singleton
 */
export function initTaskQueue(
  sw: ServiceWorkerGlobalScope,
  config?: Partial<TaskQueueConfig>
): SWTaskQueue {
  if (!taskQueueInstance) {
    taskQueueInstance = new SWTaskQueue(sw, config);
  }
  return taskQueueInstance;
}

/**
 * Get task queue instance
 */
export function getTaskQueue(): SWTaskQueue | null {
  return taskQueueInstance;
}

/**
 * Handle incoming message from main thread
 */
export function handleTaskQueueMessage(
  message: MainToSWMessage,
  clientId: string
): void {
  const queue = getTaskQueue();
  if (!queue && message.type !== 'TASK_QUEUE_INIT') {
    console.warn('[SWTaskQueue] Queue not initialized');
    return;
  }

  switch (message.type) {
    case 'TASK_QUEUE_INIT':
      if (queue) {
        queue.initialize(message.geminiConfig, message.videoConfig);
      }
      // System prompt is saved to IndexedDB by main thread
      // ai_analyze is delegated to main thread for correct text model
      break;

    case 'TASK_QUEUE_UPDATE_CONFIG':
      queue?.updateConfig(message.geminiConfig, message.videoConfig);
      break;

    case 'TASK_SUBMIT':
      queue?.submitTask(message.taskId, message.taskType, message.params, clientId);
      break;

    case 'TASK_CANCEL':
      queue?.cancelTask(message.taskId);
      break;

    case 'TASK_RETRY':
      queue?.retryTask(message.taskId);
      break;

    case 'TASK_RESUME':
      queue?.resumeTask(message.taskId, message.remoteId, message.taskType, clientId);
      break;

    case 'TASK_GET_STATUS': {
      // Sync all tasks to the requesting client
      queue?.syncTasksToClients();
      break;
    }

    case 'TASK_GET_ALL': {
      queue?.syncTasksToClients();
      break;
    }

    case 'TASK_GET_PAGINATED': {
      queue?.syncPaginatedTasksToClients({
        offset: message.offset,
        limit: message.limit,
        status: message.filters?.status,
        type: message.filters?.type,
        sortOrder: message.sortOrder,
      });
      break;
    }

    case 'TASK_DELETE':
      queue?.deleteTask(message.taskId);
      break;

    case 'TASK_MARK_INSERTED':
      queue?.markTaskInserted(message.taskId);
      break;

    case 'CHAT_START':
      queue?.startChat(message.chatId, message.params, clientId);
      break;

    case 'CHAT_STOP':
      queue?.stopChat(message.chatId);
      break;

    case 'CHAT_GET_CACHED': {
      // Return cached chat result for a specific chatId
      const cached = queue?.getCachedChatResult(message.chatId);
      
      if (cached) {
        // Send the result to the requesting client
        sendToClientById(clientId, {
          type: 'CHAT_CACHED_RESULT',
          chatId: message.chatId,
          fullContent: cached.fullContent,
          found: true,
        }).then(sent => {
          if (!sent) {
            console.warn('[SWTaskQueue] Failed to send CHAT_CACHED_RESULT to client:', clientId);
          }
        });
      } else {
        // No cached result found
        sendToClientById(clientId, {
          type: 'CHAT_CACHED_RESULT',
          chatId: message.chatId,
          found: false,
        }).then(sent => {
          if (!sent) {
            console.warn('[SWTaskQueue] Failed to send CHAT_CACHED_RESULT (not found) to client:', clientId);
          }
        });
      }
      break;
    }

    case 'TASK_RESTORE':
      queue?.restoreTasks(message.tasks);
      break;

    case 'MCP_TOOL_EXECUTE': {
      // Import executor dynamically to avoid circular dependencies
      import('./mcp/executor').then(({ executeMCPTool }) => {
        const q = getTaskQueue();
        const geminiConfig = q?.getGeminiConfig();
        const videoConfig = q?.getVideoConfig();
        const sw = q?.getSW();

        if (q && geminiConfig && videoConfig && sw) {
          executeMCPTool(
            message.requestId,
            message.toolName,
            message.args,
            geminiConfig,
            videoConfig,
            clientId,
            sw
          );
        } else {
          // Send error if not initialized
          sw?.clients.get(clientId).then((client: Client | undefined) => {
            if (client) {
              client.postMessage({
                type: 'MCP_TOOL_RESULT',
                requestId: message.requestId,
                success: false,
                error: 'Task queue not initialized',
                resultType: 'error',
              });
            }
          });
        }
      });
      break;
    }
  }
}
