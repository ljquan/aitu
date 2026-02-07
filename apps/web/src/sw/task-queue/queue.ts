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
  SWToMainMessage,
} from './types';
import {
  TaskStatus,
  TaskType,
  TaskExecutionPhase,
  DEFAULT_TASK_QUEUE_CONFIG,
} from './types';
import { taskQueueStorage } from './storage';
import { migrateBase64UrlIfNeeded } from './utils/media-generation-utils';
import { isPostMessageLoggerDebugMode } from './postmessage-logger';
import { getChannelManager, type SWChannelManager } from './channel-manager';
import { taskStepRegistry } from './task-step-registry';

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
 * 
 * 设计原则：SW 不维护配置状态，配置随任务传递
 */
export class SWTaskQueue {
  private tasks: Map<string, SWTask> = new Map();
  private runningTasks: Set<string> = new Set();
  private config: TaskQueueConfig;
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

  // Reference to channel manager for duplex communication
  private channelManager: SWChannelManager | null = null;

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
   * Set channel manager for duplex communication
   * Called from index.ts after initialization
   */
  setChannelManager(channelManager: SWChannelManager): void {
    this.channelManager = channelManager;
  }

  /**
   * 检查 SW 是否已初始化（通道已建立）
   * 配置不再由 SW 维护，而是随任务传递
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get SW global scope for MCP tool execution
   */
  getSW(): ServiceWorkerGlobalScope {
    return this.sw;
  }

  /**
   * Wait for storage restoration to complete
   * Should be called before accessing tasks to ensure data is loaded
   */
  async waitForStorageRestore(): Promise<void> {
    await this.storageRestorePromise;
  }

  /**
   * Restore tasks from IndexedDB on SW startup
   * 配置不再恢复，而是随任务传递
   */
  private async restoreFromStorage(): Promise<void> {
    try {
      // SW 启动时标记为已初始化（不再依赖配置）
      this.initialized = true;

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
            await taskQueueStorage.saveTask(task);
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
        // console.log(`[SWTaskQueue] Migrated ${migratedCount} Base64 URLs to cache`);
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
    // Never resume tasks synced from remote (avoid duplicate execution across devices)
    if (task.syncedFromRemote) {
      return false;
    }

    // Chat tasks cannot be resumed if they were processing (streaming is stateless)
    // Mark them as failed instead
    if (task.type === TaskType.CHAT && task.status === TaskStatus.PROCESSING) {
      return false; // Will be handled separately to mark as failed
    }

    // Resume tasks that were processing
    if (task.status === TaskStatus.PROCESSING) {
      return true;
    }

    // Resume legacy PENDING tasks (deprecated: new tasks start as PROCESSING)
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
    // VideoGenerationFailedError indicates the API explicitly returned a failed status,
    // even if the error message contains "429" it's a permanent failure not a network issue
    const isBusinessFailure = (
      combinedError.includes('videogenerationfailederror') ||
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
    // Note: 429/too many requests is only a network error if not a business failure
    // (the check above already excluded business failures like VideoGenerationFailedError)
    return (
      combinedError.includes('failed to fetch') ||
      combinedError.includes('network') ||
      combinedError.includes('fetch') ||
      combinedError.includes('timeout') ||
      combinedError.includes('aborted') ||
      combinedError.includes('connection') ||
      combinedError.includes('status query failed') ||
      combinedError.includes('429') ||
      combinedError.includes('too many requests')
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
      // Handle legacy PENDING tasks - convert to PROCESSING and execute directly
      const now = Date.now();
      task.status = TaskStatus.PROCESSING;
      task.startedAt = now;
      task.updatedAt = now;
      task.executionPhase = TaskExecutionPhase.SUBMITTING;
      this.tasks.set(task.id, task);
      this.runningTasks.add(task.id);
      
      await taskQueueStorage.saveTask(task);
      
      this.broadcastToClients({
        type: 'TASK_STATUS',
        taskId: task.id,
        status: task.status,
        phase: task.executionPhase,
        updatedAt: task.updatedAt,
      });

      this.executeTaskInternal(task).catch((error) => {
        console.error(`[SWTaskQueue] Resume legacy task ${task.id} execution failed:`, error);
      });
    } else if (
      // Video/Character task in processing but no remoteId - try to recover from LLM API logs
      (task.type === TaskType.VIDEO || task.type === TaskType.CHARACTER) &&
      task.status === TaskStatus.PROCESSING &&
      !task.remoteId
    ) {
      // Try to find completed result from LLM API logs
      const { findSuccessLogByTaskId, findLatestLogByTaskId } = await import('./llm-api-logger');
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

      // If not completed, try to find the remoteId from any log to resume polling
      const latestLog = await findLatestLogByTaskId(task.id);
      let recoveredRemoteId = latestLog?.remoteId;

      // If no explicit remoteId, try to parse from responseBody if it was captured
      if (!recoveredRemoteId && latestLog?.responseBody) {
        try {
          const data = JSON.parse(latestLog.responseBody);
          if (data.id) {
            recoveredRemoteId = data.id;
          }
        } catch {
          // Ignore
        }
      }

      if (recoveredRemoteId) {
        // Recover the remoteId and resume polling
        task.remoteId = recoveredRemoteId;
        task.executionPhase = TaskExecutionPhase.POLLING;
        task.updatedAt = Date.now();
        this.tasks.set(task.id, task);
        await taskQueueStorage.saveTask(task);
        
        this.resumeTaskExecution(task); // Re-call with remoteId
        return;
      }
      
      // 检查任务是否刚刚开始（SUBMITTING 阶段），如果是则重新执行
      // 这样 SW 更新不会导致刚开始的任务直接失败
      if (task.executionPhase === TaskExecutionPhase.SUBMITTING) {
        // 重置进度并重新执行
        task.progress = 0;
        task.updatedAt = Date.now();
        this.tasks.set(task.id, task);
        this.runningTasks.add(task.id);
        
        await taskQueueStorage.saveTask(task);
        
        this.broadcastToClients({
          type: 'TASK_STATUS',
          taskId: task.id,
          status: task.status,
          progress: 0,
          phase: task.executionPhase,
          updatedAt: task.updatedAt,
        });

        this.executeTaskInternal(task).catch(() => {
          // 静默忽略执行错误，错误会在 handleTaskError 中处理
        });
        return;
      }
      
      // No success log or remoteId found and not in submitting phase - mark as failed (don't re-submit to avoid extra cost)
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
      
      // 检查任务是否刚刚开始（SUBMITTING 阶段），如果是则重新执行
      // 这样 SW 更新不会导致刚开始的任务直接失败
      if (task.executionPhase === TaskExecutionPhase.SUBMITTING) {
        // 重置进度并重新执行
        task.progress = 0;
        task.updatedAt = Date.now();
        this.tasks.set(task.id, task);
        this.runningTasks.add(task.id);
        
        await taskQueueStorage.saveTask(task);
        
        this.broadcastToClients({
          type: 'TASK_STATUS',
          taskId: task.id,
          status: task.status,
          progress: 0,
          phase: task.executionPhase,
          updatedAt: task.updatedAt,
        });

        this.executeTaskInternal(task).catch(() => {
          // 静默忽略执行错误，错误会在 handleTaskError 中处理
        });
        return;
      }
      
      // No success log found and not in submitting phase - mark as failed (don't re-submit to avoid extra cost)
      await this.handleTaskError(task.id, new Error('任务中断且无法恢复（未找到已完成的结果）'));
    }
  }

  /**
   * Initialize the task queue
   * 
   * 简化版：SW 不再维护配置状态，配置随任务传递
   * init RPC 只用于建立通道连接
   */
  async initialize(): Promise<void> {
    this.initialized = true;

    // 立即广播初始化成功
    this.broadcastToClients({ type: 'TASK_QUEUE_INITIALIZED', success: true });

    // 后台清理孤儿任务
    this.performBackgroundInitialization();
  }

  /**
   * 后台执行初始化相关的 IndexedDB 操作
   */
  private async performBackgroundInitialization(): Promise<void> {
    try {
      // 等待存储恢复完成
      await this.storageRestorePromise;

      // 清理孤儿任务（无配置的 pending 任务或无 remoteId 的 processing 任务）
      const orphanTasksToRemove: string[] = [];
      for (const task of this.tasks.values()) {
        // 没有 config 的任务无法执行，标记为孤儿
        const hasConfig = task.config && task.config.apiKey && task.config.baseUrl;
        const isOrphan = 
          task.status === TaskStatus.PENDING ||
          (task.status === TaskStatus.PROCESSING && !task.remoteId && !this.runningTasks.has(task.id) && !hasConfig);
        if (isOrphan) {
          orphanTasksToRemove.push(task.id);
        }
      }
      
      if (orphanTasksToRemove.length > 0) {
        for (const taskId of orphanTasksToRemove) {
          this.tasks.delete(taskId);
          await taskQueueStorage.deleteTask(taskId);
        }
      }

      // 处理队列中的待处理任务
      this.processQueue();
    } catch (error) {
      console.error('[SWTaskQueue] Background initialization error:', error);
    }
  }

  /**
   * Submit a new task
   * 配置随任务传递，不再依赖预先初始化的配置
   */
  async submitTask(
    taskId: string,
    taskType: TaskType,
    params: SWTask['params'],
    config: SWTask['config'],
    _clientId: string // clientId is no longer used for targeting
  ): Promise<void> {
    // 验证配置
    if (!config || !config.apiKey || !config.baseUrl) {
      this.broadcastToClients({
        type: 'TASK_REJECTED',
        taskId,
        reason: 'NO_API_KEY',
      });
      return;
    }

    // Check for duplicate by taskId
    if (this.tasks.has(taskId)) {
      return;
    }

    // Check for similar task with same prompt that's already processing or pending
    // This prevents duplicate submissions after page refresh
    // NOTE: Skip this check for batch generation (tasks with batchId, batchIndex, or batchTotal)
    // These fields indicate intentional batch generation, not accidental duplicate submission
    const isBatchTask = !!(
      params.batchId || 
      'batchIndex' in params || 
      params.batchTotal ||
      params.globalIndex
    );
    if (!isBatchTask) {
      const existingTask = Array.from(this.tasks.values()).find(
        t => (t.status === TaskStatus.PROCESSING || t.status === TaskStatus.PENDING) &&
             t.type === taskType &&
             t.params.prompt === params.prompt
      );
      if (existingTask) {
        // Broadcast the existing task's status to sync the client
        this.broadcastToClients({
          type: 'TASK_STATUS',
          taskId: existingTask.id,
          status: existingTask.status,
          progress: existingTask.progress,
          phase: existingTask.executionPhase,
          updatedAt: existingTask.updatedAt,
        });
        return;
      }
    }

    // Debug logging for task submission
    if (isPostMessageLoggerDebugMode()) {
      console.log(`[SWTaskQueue] Submitting task ${taskId} (${taskType})`);
    }

    const now = Date.now();
    const task: SWTask = {
      id: taskId,
      type: taskType,
      status: TaskStatus.PROCESSING,
      params,
      config, // 配置保存在任务中
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      executionPhase: TaskExecutionPhase.SUBMITTING,
    };

    this.tasks.set(taskId, task);
    this.runningTasks.add(taskId);

    // Persist to IndexedDB
    await taskQueueStorage.saveTask(task);

    // 注意：不在这里广播 TASK_CREATED，由 handleTaskCreate 统一处理
    // handleTaskCreate 使用 broadcastToOthers 只广播给其他客户端，避免重复

    // Execute task immediately (no PENDING state, direct execution)
    this.executeTaskInternal(task).catch(() => {
      // 静默忽略，错误会在 handleTaskError 中处理
    });
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
    console.log('[SW retryTask] Called with taskId:', taskId);
    console.log('[SW retryTask] Tasks in memory:', this.tasks.size);
    
    let task = this.tasks.get(taskId);
    console.log('[SW retryTask] Task from memory:', task ? `${task.id} (${task.status})` : 'not found');
    
    // 如果内存中没有任务，尝试从 IndexedDB 加载
    if (!task) {
      console.log('[SW retryTask] Loading from IndexedDB...');
      const storedTask = await taskQueueStorage.getTask(taskId);
      console.log('[SW retryTask] Task from storage:', storedTask ? `${storedTask.id} (${storedTask.status})` : 'not found');
      if (storedTask && (storedTask.status === TaskStatus.FAILED || storedTask.status === TaskStatus.CANCELLED)) {
        this.tasks.set(taskId, storedTask);
        task = storedTask;
      } else {
        console.warn('[SW retryTask] Task not found or not retryable, returning');
        return;
      }
    }
    
    if (task.status !== TaskStatus.FAILED && task.status !== TaskStatus.CANCELLED) {
      console.warn('[SW retryTask] Task status not retryable:', task.status);
      return;
    }

    console.log('[SW retryTask] Resetting task for retry, type:', task.type, 'params:', JSON.stringify(task.params).substring(0, 200));

    // 重试时清除 remoteId，强制重新提交任务（获取新的 remoteId）
    // 不恢复 remoteId，因为失败的任务需要重新生成
    task.remoteId = undefined;

    const now = Date.now();
    task.status = TaskStatus.PROCESSING;
    task.error = undefined;
    task.progress = 0; // 重置进度为 0
    task.startedAt = now;
    task.updatedAt = now;
    task.executionPhase = TaskExecutionPhase.SUBMITTING;
    this.tasks.set(taskId, task);
    this.runningTasks.add(taskId);

    // Persist
    await taskQueueStorage.saveTask(task);
    console.log('[SW retryTask] Task saved, broadcasting status change');

    // Broadcast status change to all clients
    this.broadcastToClients({
      type: 'TASK_STATUS',
      taskId: task.id,
      status: task.status,
      progress: 0, // 广播进度重置
      phase: task.executionPhase,
      updatedAt: task.updatedAt,
    });

    console.log('[SW retryTask] Calling executeTaskInternal...');
    // Execute task immediately (no PENDING state, direct execution)
    this.executeTaskInternal(task).catch((error) => {
      console.error('[SW retryTask] executeTaskInternal failed:', error);
    });
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
      // 从 IndexedDB 获取配置
      const { geminiConfig } = await taskQueueStorage.loadConfig();
      if (!geminiConfig) {
        console.warn('[SWTaskQueue] resumeTask: config not available, skipping');
        return;
      }

      // Create a placeholder task for resumption
      const now = Date.now();
      task = {
        id: taskId,
        type: taskType,
        status: TaskStatus.PROCESSING,
        params: { prompt: '' },
        config: {
          apiKey: geminiConfig.apiKey,
          baseUrl: geminiConfig.baseUrl,
          modelName: geminiConfig.modelName,
          textModelName: geminiConfig.textModelName,
        },
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
    if (!task) {
      return;
    }

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
    // 从 IndexedDB 读取配置（SW 不维护配置状态）
    const geminiConfig = await taskQueueStorage.getConfig<GeminiConfig>('gemini');
    if (!geminiConfig) {
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
        geminiConfig,
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

  // 注意：syncPaginatedTasksToClients 已删除，客户端应使用 RPC 调用 TASK_LIST_PAGINATED

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Process the task queue (legacy compatibility only)
   * Note: New tasks are created with PROCESSING status and executed immediately.
   * This method only handles legacy PENDING tasks from older versions.
   */
  private processQueue(): void {
    if (!this.initialized) {
      console.warn('[SWTaskQueue] Not initialized, skipping queue processing');
      return;
    }

    // Get legacy pending tasks that are not already running
    const pendingTasks = Array.from(this.tasks.values())
      .filter((t) => t.status === TaskStatus.PENDING && !this.runningTasks.has(t.id))
      .sort((a, b) => a.createdAt - b.createdAt);

    // Execute all pending tasks immediately (no concurrent limit)
    for (const task of pendingTasks) {
      this.executeTask(task);
    }
  }

  /**
   * Execute a single task (called from processQueue for legacy PENDING tasks)
   * For new tasks, use executeTaskInternal directly after setting up status
   * 
   * Note: 配置随任务传递（task.config），在 executeTaskInternal 中验证
   */
  private async executeTask(task: SWTask): Promise<void> {
    // Prevent duplicate execution - check if already running
    if (this.runningTasks.has(task.id)) {
      console.warn(`[SWTaskQueue] Task ${task.id} is already running, skipping duplicate execution`);
      return;
    }

    // Check if task is ready for execution (PENDING or PROCESSING without being in runningTasks)
    const currentTask = this.tasks.get(task.id);
    if (!currentTask) {
      console.warn(`[SWTaskQueue] Task ${task.id} not found, skipping`);
      return;
    }
    
    // Skip if task is in terminal state
    if (currentTask.status === TaskStatus.COMPLETED || 
        currentTask.status === TaskStatus.FAILED || 
        currentTask.status === TaskStatus.CANCELLED) {
      console.warn(`[SWTaskQueue] Task ${task.id} is in terminal state (${currentTask.status}), skipping`);
      return;
    }

    this.runningTasks.add(task.id);

    // Update status to processing (handles legacy PENDING tasks)
    task.status = TaskStatus.PROCESSING;
    task.startedAt = task.startedAt || Date.now();
    task.updatedAt = Date.now();
    task.executionPhase = task.executionPhase || TaskExecutionPhase.SUBMITTING;
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

    // Execute the task
    await this.executeTaskInternal(task);
  }

  /**
   * Internal task execution - assumes task is already set to PROCESSING and in runningTasks
   */
  private async executeTaskInternal(task: SWTask): Promise<void> {
    console.log('[SW executeTaskInternal] Starting task:', task.id, 'type:', task.type, 'remoteId:', task.remoteId);
    // 从任务获取配置
    const { config } = task;
    console.log('[SW executeTaskInternal] config:', config ? `apiKey=${config.apiKey ? 'set' : 'null'}, baseUrl=${config.baseUrl}` : 'null');
    
    if (!config || !config.apiKey || !config.baseUrl) {
      console.error('[SW executeTaskInternal] Config not set in task, failing task');
      await this.handleTaskError(task.id, new Error('API configuration not provided with task. Please check your API key settings.'));
      return;
    }

    // 构建 GeminiConfig 和 VideoAPIConfig
    const geminiConfig: GeminiConfig = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      modelName: config.modelName,
      textModelName: config.textModelName,
    };
    const videoConfig: VideoAPIConfig = {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
    };

    // 如果任务已经有 remoteId（视频/角色），则直接进入恢复流程，跳过提交阶段，只重试获取进度的接口
    if (task.remoteId && (task.type === TaskType.VIDEO || task.type === TaskType.CHARACTER)) {
      console.log('[SW executeTaskInternal] Task has remoteId, entering resume flow');
      task.executionPhase = TaskExecutionPhase.POLLING;
      task.updatedAt = Date.now();
      // 更新存储
      await taskQueueStorage.saveTask(task);
      
      this.broadcastToClients({
        type: 'TASK_STATUS',
        taskId: task.id,
        status: task.status,
        phase: task.executionPhase,
        updatedAt: task.updatedAt,
      });
      this.executeResume(task, task.remoteId);
      return;
    }

    const handlerConfig: HandlerConfig = {
      geminiConfig,
      videoConfig,
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
        } else {
          console.warn(`[SW:TaskQueue] onRemoteId: task ${taskId} not found in tasks map`);
        }
      },
    };

    try {
      console.log('[SW executeTaskInternal] Getting handler for type:', task.type);
      const handler = this.getHandler(task.type);
      if (!handler) {
        console.error('[SW executeTaskInternal] No handler found for type:', task.type);
        throw new Error(`No handler for task type: ${task.type}`);
      }
      console.log('[SW executeTaskInternal] Handler found, executing task...');

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
   * 从任务获取配置
   */
  private async executeResume(task: SWTask, remoteId: string): Promise<void> {
    const { config } = task;
    if (!config || !config.apiKey || !config.baseUrl) {
      // 配置不存在时，清理 runningTasks 避免任务被"锁定"
      this.runningTasks.delete(task.id);
      console.warn(`[SWTaskQueue] executeResume: config not set for task ${task.id}, skipping`);
      return;
    }

    // 从任务配置构建 HandlerConfig
    const geminiConfig: GeminiConfig = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      modelName: config.modelName,
      textModelName: config.textModelName,
    };
    const videoConfig: VideoAPIConfig = {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
    };

    const handlerConfig: HandlerConfig = {
      geminiConfig,
      videoConfig,
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
      if (!handler || typeof (handler as any).resume !== 'function') {
        throw new Error(`Handler does not support resume: ${task.type}`);
      }

      task.remoteId = remoteId;
      const result = await (handler as any).resume(task, handlerConfig);
      await this.handleTaskSuccess(task.id, result);
    } catch (error) {
      // 检查任务是否已被删除或取消（正常情况，不需要记录错误）
      const currentTask = this.tasks.get(task.id);
      const isCancelledOrDeleted = !currentTask || 
        currentTask.status === TaskStatus.CANCELLED ||
        (error instanceof Error && error.message.includes('cancelled'));
      
      if (isCancelledOrDeleted) {
        // 任务被取消或删除，这是正常行为，但需要清理 runningTasks
        this.runningTasks.delete(task.id);
      } else {
        await this.handleTaskError(task.id, error);
      }
    }
  }

  /**
   * Handle successful task completion
   */
  private async handleTaskSuccess(taskId: string, result: TaskResult): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Debug logging for task completion
    if (isPostMessageLoggerDebugMode()) {
      console.log(`[SWTaskQueue] Task ${taskId} (${task.type}) completed successfully`);
    }

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
      remoteId: task.remoteId, // Include remoteId for recovery
    });

    // Broadcast workflow step status update if this task is associated with a workflow step
    // This ensures WorkZone, ChatDrawer, and Task Queue all receive the same update
    const stepInfo = taskStepRegistry.getStepForTask(taskId);
    if (stepInfo) {
      this.channelManager?.sendWorkflowStepStatus(
        stepInfo.workflowId,
        stepInfo.stepId,
        'completed',
        { success: true, url: result.url, data: result },
        undefined,
        undefined
      );
      // Clean up the mapping after broadcasting
      await taskStepRegistry.unregister(taskId);
    }

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

    // Debug logging for task failure
    if (isPostMessageLoggerDebugMode()) {
      console.log(`[SWTaskQueue] Task ${taskId} (${task.type}) failed:`, error instanceof Error ? error.message : String(error));
    }

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

    // Broadcast workflow step status update if this task is associated with a workflow step
    // This ensures WorkZone, ChatDrawer, and Task Queue all receive the same update
    const stepInfoFailed = taskStepRegistry.getStepForTask(taskId);
    if (stepInfoFailed) {
      this.channelManager?.sendWorkflowStepStatus(
        stepInfoFailed.workflowId,
        stepInfoFailed.stepId,
        'failed',
        undefined,
        taskError.message,
        undefined
      );
      // Clean up the mapping after broadcasting
      await taskStepRegistry.unregister(taskId);
    }

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
   * 消息路由映射表，将消息类型映射到 channelManager 方法调用
   */
  private readonly messageRouters: Record<string, (msg: SWToMainMessage) => void> = {
    'TASK_CREATED': (m) => {
      const msg = m as { task: SWTask };
      this.channelManager?.sendTaskCreated(msg.task.id, msg.task);
    },
    'TASK_STATUS': (m) => {
      const msg = m as { taskId: string; status: TaskStatus; progress?: number; phase?: TaskExecutionPhase };
      this.channelManager?.sendTaskStatus(msg.taskId, msg.status, msg.progress, msg.phase);
    },
    'TASK_COMPLETED': (m) => {
      const msg = m as { taskId: string; result: TaskResult; remoteId?: string };
      this.channelManager?.sendTaskCompleted(msg.taskId, msg.result, msg.remoteId);
    },
    'TASK_FAILED': (m) => {
      const msg = m as { taskId: string; error: TaskError };
      this.channelManager?.sendTaskFailed(msg.taskId, msg.error);
    },
    'TASK_CANCELLED': (m) => {
      const msg = m as { taskId: string };
      this.channelManager?.sendTaskCancelled(msg.taskId);
    },
    'TASK_DELETED': (m) => {
      const msg = m as { taskId: string };
      this.channelManager?.sendTaskDeleted(msg.taskId);
    },
    'TASK_REJECTED': (m) => {
      const msg = m as { taskId: string };
      this.channelManager?.sendTaskRejected(msg.taskId);
    },
    'TASK_QUEUE_INITIALIZED': () => {
      this.channelManager?.sendQueueInitialized();
    },
    'TASK_SUBMITTED': (m) => {
      const msg = m as { taskId: string };
      this.channelManager?.sendTaskSubmitted(msg.taskId);
    },
    'CHAT_CHUNK': (m) => {
      const msg = m as { chatId: string; content: string };
      this.channelManager?.sendChatChunk(msg.chatId, msg.content);
    },
    'CHAT_DONE': (m) => {
      const msg = m as { chatId: string; fullContent: string };
      this.channelManager?.sendChatDone(msg.chatId, msg.fullContent);
    },
    'CHAT_ERROR': (m) => {
      const msg = m as { chatId: string; error: string };
      this.channelManager?.sendChatError(msg.chatId, msg.error);
    },
  };

  /**
   * Broadcast message to all clients via ChannelManager
   */
  private broadcastToClients(message: SWToMainMessage): void {
    if (!this.channelManager) {
      console.warn('[SWTaskQueue] ChannelManager not initialized, message dropped:', message.type);
      return;
    }

    const handler = this.messageRouters[message.type];
    if (handler) {
      handler(message);
    } else {
      console.warn('[SWTaskQueue] Unknown message type:', message.type);
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

