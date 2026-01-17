/**
 * Service Worker Task Queue Client
 *
 * Provides a high-level API for communicating with the Service Worker
 * task queue from the main thread.
 */

import { Subject, Observable, filter, map, take, firstValueFrom, timeout } from 'rxjs';
import type {
  GeminiConfig,
  VideoAPIConfig,
  TaskType,
  GenerationParams,
  TaskResult,
  TaskError,
  TaskStatus,
  TaskExecutionPhase,
  SWTask,
  ChatParams,
  MainToSWMessage,
  SWToMainMessage,
  TaskEventHandlers,
  ChatEventHandlers,
} from './types';
import { parseWorkflowJson } from '../agent/tool-parser';
import { initializeMCP } from '../../mcp';
import { generateSystemPrompt } from '../agent/system-prompts';
import { saveMCPSystemPrompt } from '../mcp-storage-service';

/**
 * Service Worker Task Queue Client
 */
export class SWTaskQueueClient {
  private static instance: SWTaskQueueClient | null = null;

  private initialized = false;
  private messageSubject = new Subject<SWToMainMessage>();
  private taskHandlers: TaskEventHandlers = {};
  private chatHandlers: Map<string, ChatEventHandlers> = new Map();
  private tasksSubject = new Subject<SWTask[]>();

  // Local task cache for fast access
  private localTaskCache: Map<string, SWTask> = new Map();

  // Store last config for re-sending when SW requests it
  private lastGeminiConfig: GeminiConfig | null = null;
  private lastVideoConfig: VideoAPIConfig | null = null;

  // Track processed/in-progress tool requests to avoid duplicate execution on page refresh
  private processedToolRequests: Set<string> = new Set();
  private inProgressToolRequests: Set<string> = new Set();
  
  // Track current tool request ID for chat-workflow association
  // This allows us to associate chatIds with the tool request that initiated them
  private currentToolRequestId: string | null = null;
  
  // Pending chat ID queries waiting for SW response
  private pendingChatQueries: Map<string, {
    resolve: (result: { found: boolean; fullContent?: string }) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();

  private constructor() {
    this.setupMessageListener();
    this.setupControllerChangeListener();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SWTaskQueueClient {
    if (!SWTaskQueueClient.instance) {
      SWTaskQueueClient.instance = new SWTaskQueueClient();
    }
    return SWTaskQueueClient.instance;
  }

  /**
   * Initialize the task queue with API configurations
   */
  async initialize(
    geminiConfig: GeminiConfig,
    videoConfig: VideoAPIConfig
  ): Promise<boolean> {
    // Store config for re-sending when SW requests it
    this.lastGeminiConfig = geminiConfig;
    this.lastVideoConfig = videoConfig;

    // 防止重复初始化
    if (this.initialized) {
      return true;
    }

    if (!this.isServiceWorkerSupported()) {
      console.warn('[SWClient] Service Worker not supported');
      return false;
    }

    // Wait for SW to be ready
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) {
      console.warn('[SWClient] No active Service Worker');
      return false;
    }

    // Ensure MCP tools are registered and save system prompt to IndexedDB
    // SW will read from IndexedDB, no need to pass via postMessage
    initializeMCP();
    try {
      const systemPrompt = generateSystemPrompt();
      await saveMCPSystemPrompt(systemPrompt);
    } catch (error) {
      console.warn('[SWClient] Failed to save system prompt to IndexedDB:', error);
    }

    // Send init message (system prompt is now in IndexedDB)
    await this.postMessage({
      type: 'TASK_QUEUE_INIT',
      geminiConfig,
      videoConfig,
    });

    // Wait for initialization response
    return new Promise((resolve) => {
      const initTimeout = setTimeout(() => {
        // Even if we timeout, assume initialized if SW is active
        this.initialized = true;
        resolve(true);
      }, 5000);

      this.messageSubject
        .pipe(
          filter((msg) => msg.type === 'TASK_QUEUE_INITIALIZED'),
          take(1)
        )
        .subscribe(async (msg) => {
          clearTimeout(initTimeout);
          if (msg.type === 'TASK_QUEUE_INITIALIZED') {
            console.log('[SWClient] Task queue initialized, checking pending responses...');
            this.initialized = msg.success;
            
            // After initialization, resend any pending tool responses
            // This ensures workflow continues after page refresh
            if (msg.success) {
              await this.resendPendingResponses();
            }
            
            resolve(msg.success);
          }
        });
    });
  }

  /**
   * Update API configurations
   */
  updateConfig(
    geminiConfig?: Partial<GeminiConfig>,
    videoConfig?: Partial<VideoAPIConfig>
  ): void {
    // Update stored config
    if (geminiConfig && this.lastGeminiConfig) {
      this.lastGeminiConfig = { ...this.lastGeminiConfig, ...geminiConfig };
    }
    if (videoConfig && this.lastVideoConfig) {
      this.lastVideoConfig = { ...this.lastVideoConfig, ...videoConfig };
    }

    this.postMessage({
      type: 'TASK_QUEUE_UPDATE_CONFIG',
      geminiConfig,
      videoConfig,
    });
  }

  /**
   * Submit a new task
   */
  submitTask(
    taskId: string,
    taskType: TaskType,
    params: GenerationParams
  ): void {
    // Add to local cache immediately
    const now = Date.now();
    const pendingTask: SWTask = {
      id: taskId,
      type: taskType,
      status: 'pending' as TaskStatus,
      params,
      createdAt: now,
      updatedAt: now,
    };
    this.localTaskCache.set(taskId, pendingTask);

    // Submit to SW
    this.postMessage({
      type: 'TASK_SUBMIT',
      taskId,
      taskType,
      params,
    });
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): void {
    // Update local cache
    const task = this.localTaskCache.get(taskId);
    if (task) {
      task.status = 'cancelled' as TaskStatus;
      task.updatedAt = Date.now();
    }

    this.postMessage({
      type: 'TASK_CANCEL',
      taskId,
    });
  }

  /**
   * Retry a failed task
   */
  retryTask(taskId: string): void {
    this.postMessage({
      type: 'TASK_RETRY',
      taskId,
    });
  }

  /**
   * Resume a task after page refresh
   */
  resumeTask(taskId: string, remoteId: string, taskType: TaskType): void {
    this.postMessage({
      type: 'TASK_RESUME',
      taskId,
      remoteId,
      taskType,
    });
  }

  /**
   * Delete a task
   */
  deleteTask(taskId: string): void {
    this.postMessage({
      type: 'TASK_DELETE',
      taskId,
    });
  }

  /**
   * Restore tasks from storage
   */
  async restoreTasks(tasks: SWTask[]): Promise<void> {
    await this.postMessage({
      type: 'TASK_RESTORE',
      tasks,
    });
  }

  /**
   * Mark a task as inserted to canvas
   */
  markTaskInserted(taskId: string): void {
    this.postMessage({
      type: 'TASK_MARK_INSERTED',
      taskId,
    });
  }

  /**
   * Start a chat stream
   */
  startChat(chatId: string, params: ChatParams, handlers: ChatEventHandlers): void {
    this.chatHandlers.set(chatId, handlers);
    
    // If there's a current tool request, save the chatId association
    if (this.currentToolRequestId) {
      this.saveChatIdAssociation(this.currentToolRequestId, chatId);
    }
    
    this.postMessage({
      type: 'CHAT_START',
      chatId,
      params,
    });
  }
  
  /**
   * Save chatId association with a tool request to IndexedDB
   */
  private async saveChatIdAssociation(requestId: string, chatId: string): Promise<void> {
    try {
      const db = await this.openToolRequestDB();
      const tx = db.transaction('processedRequests', 'readwrite');
      const store = tx.objectStore('processedRequests');
      
      // Get existing record and add chatId
      const getRequest = store.get(requestId);
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (existing) {
          store.put({
            ...existing,
            chatId, // Add chatId association
          });
          console.log('[SWClient] ChatId associated with tool request:', requestId, chatId);
        }
      };
      
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.warn('[SWClient] Failed to save chatId association:', error);
    }
  }

  /**
   * Stop a chat stream
   */
  stopChat(chatId: string): void {
    this.postMessage({
      type: 'CHAT_STOP',
      chatId,
    });
    this.chatHandlers.delete(chatId);
  }

  /**
   * Set task event handlers
   */
  setTaskHandlers(handlers: TaskEventHandlers): void {
    this.taskHandlers = handlers;
  }

  /**
   * Execute an MCP tool via Service Worker
   * Returns the result of the tool execution
   */
  async executeMCPTool(
    toolName: string,
    args: Record<string, unknown>,
    options?: {
      mode?: 'async' | 'queue';
      batchId?: string;
      batchIndex?: number;
      batchTotal?: number;
      timeoutMs?: number;
    }
  ): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
    type?: 'image' | 'video' | 'text' | 'canvas' | 'error';
    taskId?: string;
  }> {
    const requestId = `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timeoutMs = options?.timeoutMs || 60000; // Default 60 seconds

    // Send execute request to SW
    await this.postMessage({
      type: 'MCP_TOOL_EXECUTE',
      requestId,
      toolName,
      args,
      options: {
        mode: options?.mode,
        batchId: options?.batchId,
        batchIndex: options?.batchIndex,
        batchTotal: options?.batchTotal,
      },
    });

    // Wait for result
    try {
      const response = await firstValueFrom(
        this.messageSubject.pipe(
          filter((msg) => msg.type === 'MCP_TOOL_RESULT' && msg.requestId === requestId),
          take(1),
          timeout(timeoutMs)
        )
      );

      if (response.type === 'MCP_TOOL_RESULT') {
        return {
          success: response.success,
          data: response.data,
          error: response.error,
          type: response.resultType,
          taskId: response.taskId,
        };
      }

      return { success: false, error: 'Unexpected response type', type: 'error' };
    } catch (error: any) {
      if (error.name === 'TimeoutError') {
        return { success: false, error: `Tool execution timed out: ${toolName}`, type: 'error' };
      }
      return { success: false, error: error.message || 'Tool execution failed', type: 'error' };
    }
  }

  /**
   * Observe all messages from SW
   */
  observeMessages(): Observable<SWToMainMessage> {
    return this.messageSubject.asObservable();
  }

  /**
   * Observe task status updates
   */
  observeTaskStatus(taskId: string): Observable<{
    status: TaskStatus;
    progress?: number;
    phase?: TaskExecutionPhase;
  }> {
    return this.messageSubject.pipe(
      filter(
        (msg) =>
          msg.type === 'TASK_STATUS' && msg.taskId === taskId
      ),
      map((msg) => {
        if (msg.type === 'TASK_STATUS') {
          return {
            status: msg.status,
            progress: msg.progress,
            phase: msg.phase,
          };
        }
        throw new Error('Unexpected message type');
      })
    );
  }

  /**
   * Observe task completion
   */
  observeTaskCompletion(taskId: string): Observable<TaskResult> {
    return this.messageSubject.pipe(
      filter(
        (msg) =>
          msg.type === 'TASK_COMPLETED' && msg.taskId === taskId
      ),
      map((msg) => {
        if (msg.type === 'TASK_COMPLETED') {
          return msg.result;
        }
        throw new Error('Unexpected message type');
      }),
      take(1)
    );
  }

  /**
   * Observe task failure
   */
  observeTaskFailure(taskId: string): Observable<{
    error: TaskError;
  }> {
    return this.messageSubject.pipe(
      filter(
        (msg) =>
          msg.type === 'TASK_FAILED' && msg.taskId === taskId
      ),
      map((msg) => {
        if (msg.type === 'TASK_FAILED') {
          return {
            error: msg.error,
          };
        }
        throw new Error('Unexpected message type');
      })
    );
  }

  /**
   * Check if Service Worker is supported
   */
  isServiceWorkerSupported(): boolean {
    return 'serviceWorker' in navigator;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Request all tasks from SW (for sync after page load)
   */
  async requestAllTasks(): Promise<SWTask[]> {
    await this.postMessage({ type: 'TASK_GET_ALL' });

    try {
      const response = await firstValueFrom(
        this.messageSubject.pipe(
          filter((msg) => msg.type === 'TASK_ALL_RESPONSE'),
          take(1),
          timeout(5000)
        )
      );

      if (response.type === 'TASK_ALL_RESPONSE') {
        return response.tasks;
      }
      return [];
    } catch {
      console.warn('[SWClient] Timeout waiting for tasks response');
      return [];
    }
  }

  /**
   * Request paginated tasks from SW
   * @param options Pagination options
   * @returns Paginated tasks with metadata
   */
  async requestPaginatedTasks(options: {
    offset: number;
    limit: number;
    status?: TaskStatus;
    type?: TaskType;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    tasks: SWTask[];
    total: number;
    offset: number;
    hasMore: boolean;
  }> {
    await this.postMessage({
      type: 'TASK_GET_PAGINATED',
      offset: options.offset,
      limit: options.limit,
      filters: {
        status: options.status,
        type: options.type,
      },
      sortOrder: options.sortOrder,
    });

    try {
      const response = await firstValueFrom(
        this.messageSubject.pipe(
          filter((msg) => msg.type === 'TASK_PAGINATED_RESPONSE'),
          take(1),
          timeout(5000)
        )
      );

      if (response.type === 'TASK_PAGINATED_RESPONSE') {
        return {
          tasks: response.tasks,
          total: response.total,
          offset: response.offset,
          hasMore: response.hasMore,
        };
      }
      return { tasks: [], total: 0, offset: 0, hasMore: false };
    } catch {
      console.warn('[SWClient] Timeout waiting for paginated tasks response');
      return { tasks: [], total: 0, offset: 0, hasMore: false };
    }
  }

  /**
   * Observe tasks sync from SW
   */
  observeTasks(): Observable<SWTask[]> {
    return this.tasksSubject.asObservable();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Setup message listener
   */
  private setupMessageListener(): void {
    if (!this.isServiceWorkerSupported()) return;

    navigator.serviceWorker.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || !message.type) return;

      // Handle SW_REQUEST_CONFIG message - SW needs config to be re-sent
      if (message.type === 'SW_REQUEST_CONFIG') {
        // Re-send the stored config
        if (this.lastGeminiConfig && this.lastVideoConfig) {
          this.postMessage({
            type: 'TASK_QUEUE_INIT',
            geminiConfig: this.lastGeminiConfig,
            videoConfig: this.lastVideoConfig,
          });
        } else {
          console.warn('[SWClient] Cannot re-send config: no stored config');
        }
        return;
      }

      // Check if it's a task queue message
      if (!this.isTaskQueueMessage(message as SWToMainMessage)) return;

      // Emit to subject
      this.messageSubject.next(message as SWToMainMessage);

      // Call handlers
      this.handleMessage(message as SWToMainMessage);
    });
  }

  /**
   * Setup controller change listener for SW updates
   */
  private setupControllerChangeListener(): void {
    if (!this.isServiceWorkerSupported()) return;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // console.log('[SWClient] Controller changed, re-initializing...');
      // When SW is updated, we need to sync tasks
      this.requestAllTasks().then((tasks) => {
        if (tasks.length > 0) {
          this.tasksSubject.next(tasks);
          // Sync local cache
          this.syncLocalCache(tasks);
        }
      });
    });
  }

  /**
   * Sync local cache with tasks from SW
   */
  private syncLocalCache(tasks: SWTask[]): void {
    // Clear and rebuild cache
    this.localTaskCache.clear();

    for (const task of tasks) {
      this.localTaskCache.set(task.id, task);
    }
  }

  /**
   * Update local cache for a single task
   */
  private updateLocalCache(task: SWTask): void {
    this.localTaskCache.set(task.id, task);
  }

  /**
   * Check if message is from task queue
   */
  private isTaskQueueMessage(message: SWToMainMessage): boolean {
    const taskQueueTypes = [
      'TASK_QUEUE_INITIALIZED',
      'TASK_STATUS',
      'TASK_COMPLETED',
      'TASK_FAILED',
      'TASK_SUBMITTED',
      'TASK_CREATED',
      'TASK_CANCELLED',
      'TASK_DELETED',
      'TASK_STATUS_RESPONSE',
      'TASK_ALL_RESPONSE',
      'TASK_PAGINATED_RESPONSE',
      'CHAT_CHUNK',
      'CHAT_DONE',
      'CHAT_ERROR',
      'CHAT_CACHED_RESULT',
      'MAIN_THREAD_TOOL_REQUEST',
      'MCP_TOOL_RESULT',
    ];
    return taskQueueTypes.includes(message.type);
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: SWToMainMessage): void {
    switch (message.type) {
      case 'TASK_CREATED':
        // Update local cache
        this.updateLocalCache(message.task);
        this.taskHandlers.onCreated?.(message.task);
        break;

      case 'TASK_STATUS': {
        // Update local cache
        const task = this.localTaskCache.get(message.taskId);
        if (task) {
          task.status = message.status;
          task.progress = message.progress;
          task.updatedAt = message.updatedAt;
          this.updateLocalCache(task);
        }
        this.taskHandlers.onStatus?.(
          message.taskId,
          message.status,
          message.progress,
          message.phase
        );
        break;
      }

      case 'TASK_COMPLETED': {
        // console.log('[SWClient] Received TASK_COMPLETED:', message.taskId, 'result:', message.result);
        // Update local cache
        const completedTask = this.localTaskCache.get(message.taskId);
        if (completedTask) {
          completedTask.status = 'completed' as TaskStatus;
          completedTask.result = message.result;
          completedTask.completedAt = message.completedAt;
          this.updateLocalCache(completedTask);
        }
        this.taskHandlers.onCompleted?.(message.taskId, message.result);
        break;
      }

      case 'TASK_FAILED': {
        // Update local cache
        const failedTask = this.localTaskCache.get(message.taskId);
        if (failedTask) {
          failedTask.status = 'failed' as TaskStatus;
          failedTask.error = message.error;
          this.updateLocalCache(failedTask);
        }
        this.taskHandlers.onFailed?.(
          message.taskId,
          message.error
        );
        break;
      }

      case 'TASK_SUBMITTED':
        this.taskHandlers.onSubmitted?.(message.taskId, message.remoteId);
        break;

      case 'TASK_CANCELLED': {
        // Update local cache
        const cancelledTask = this.localTaskCache.get(message.taskId);
        if (cancelledTask) {
          cancelledTask.status = 'cancelled' as TaskStatus;
          this.updateLocalCache(cancelledTask);
        }
        this.taskHandlers.onCancelled?.(message.taskId);
        break;
      }

      case 'TASK_DELETED': {
        // Remove from local cache
        this.localTaskCache.delete(message.taskId);
        this.taskHandlers.onDeleted?.(message.taskId);
        break;
      }

      case 'TASK_ALL_RESPONSE':
        // Emit tasks to subject for observers
        this.tasksSubject.next(message.tasks);
        // Sync local cache
        this.syncLocalCache(message.tasks);
        this.taskHandlers.onTasksSync?.(message.tasks);
        break;

      case 'CHAT_CHUNK': {
        const chatHandlers = this.chatHandlers.get(message.chatId);
        chatHandlers?.onChunk?.(message.chatId, message.content);
        break;
      }

      case 'CHAT_DONE': {
        const chatHandlers = this.chatHandlers.get(message.chatId);
        chatHandlers?.onDone?.(message.chatId, message.fullContent);
        this.chatHandlers.delete(message.chatId);
        break;
      }

      case 'CHAT_ERROR': {
        const chatHandlers = this.chatHandlers.get(message.chatId);
        chatHandlers?.onError?.(message.chatId, message.error);
        this.chatHandlers.delete(message.chatId);
        break;
      }

      case 'CHAT_CACHED_RESULT': {
        // Handle cached chat result response
        const pending = this.pendingChatQueries.get(message.chatId);
        if (pending) {
          clearTimeout(pending.timeout);
          pending.resolve({
            found: message.found,
            fullContent: message.fullContent,
          });
          this.pendingChatQueries.delete(message.chatId);
        }
        break;
      }

      case 'MAIN_THREAD_TOOL_REQUEST':
        this.handleMainThreadToolRequest(message);
        break;
    }
  }

  /**
   * Handle main thread tool request from SW
   */
  private async handleMainThreadToolRequest(message: {
    type: 'MAIN_THREAD_TOOL_REQUEST';
    requestId: string;
    workflowId: string;
    stepId: string;
    toolName: string;
    args: Record<string, unknown>;
  }): Promise<void> {
    const { requestId, toolName, args } = message;
    
    // Check for duplicate request (already processed or in progress) - memory cache
    if (this.processedToolRequests.has(requestId)) {
      console.log('[SWClient] Ignoring duplicate tool request (already processed in memory):', toolName, requestId);
      return;
    }
    
    if (this.inProgressToolRequests.has(requestId)) {
      console.log('[SWClient] Ignoring duplicate tool request (in progress):', toolName, requestId);
      return;
    }
    
    // Check IndexedDB for persisted processed requests (survives page refresh)
    const isProcessedInDB = await this.checkProcessedRequestInDB(requestId);
    if (isProcessedInDB) {
      console.log('[SWClient] Ignoring duplicate tool request (already processed in DB):', toolName, requestId);
      return;
    }
    
    // Mark as in progress (both in memory and IndexedDB)
    this.inProgressToolRequests.add(requestId);
    await this.saveInProgressRequestToDB(requestId, toolName, message.workflowId);
    console.log('[SWClient] ◀ Received main thread tool request:', toolName, requestId);
    
    // Set current tool request ID for chat-workflow association
    this.currentToolRequestId = requestId;

    try {
      // Dynamic import to avoid circular dependencies
      const { swCapabilitiesHandler } = await import('../sw-capabilities');

      // Execute the delegated operation
      const result = await swCapabilitiesHandler.execute({
        operation: toolName as any,
        args,
        requestId,
        workflowId: message.workflowId,
        stepId: message.stepId,
      });

      // Prepare response
      const response = {
        success: result.success,
        result: result.data,
        error: result.error,
        addSteps: result.addSteps,
        taskId: result.taskId,
        taskIds: result.taskIds,
      };
      
      // Save to IndexedDB BEFORE sending (so it survives page refresh)
      this.inProgressToolRequests.delete(requestId);
      this.processedToolRequests.add(requestId);
      await this.saveProcessedRequestToDB(requestId, response);
      
      // Limit the size of processed requests set to avoid memory leak
      if (this.processedToolRequests.size > 1000) {
        const iterator = this.processedToolRequests.values();
        for (let i = 0; i < 500; i++) {
          const value = iterator.next().value;
          if (value) this.processedToolRequests.delete(value);
        }
      }

      console.log('[SWClient] ▶ Sending tool response:', toolName, result.success);
      // Send response back to SW
      await this.postMessage({
        type: 'MAIN_THREAD_TOOL_RESPONSE',
        requestId,
        ...response,
      } as any);
      
      // Mark as sent
      await this.markResponseSentToDB(requestId);
      
      // Clear current tool request ID
      this.currentToolRequestId = null;
    } catch (error: any) {
      // Prepare error response
      const errorResponse = {
        success: false,
        error: error.message || 'Unknown error',
      };
      
      // Save to IndexedDB BEFORE sending
      this.inProgressToolRequests.delete(requestId);
      this.processedToolRequests.add(requestId);
      await this.saveProcessedRequestToDB(requestId, errorResponse);
      
      console.error('[SWClient] ✗ Tool execution error:', toolName, error.message);
      // Send error response
      await this.postMessage({
        type: 'MAIN_THREAD_TOOL_RESPONSE',
        requestId,
        ...errorResponse,
      } as any);
      
      // Mark as sent
      await this.markResponseSentToDB(requestId);
      
      // Clear current tool request ID
      this.currentToolRequestId = null;
    }
  }
  
  /**
   * Check if a request has been processed or is in progress (stored in IndexedDB)
   * Returns true for both completed and in_progress requests to prevent duplicate execution
   */
  private async checkProcessedRequestInDB(requestId: string): Promise<boolean> {
    try {
      const db = await this.openToolRequestDB();
      return new Promise((resolve) => {
        const tx = db.transaction('processedRequests', 'readonly');
        const store = tx.objectStore('processedRequests');
        const request = store.get(requestId);
        request.onsuccess = () => {
          const result = request.result;
          // Consider it processed if it exists (either completed or in_progress)
          // This prevents duplicate execution after page refresh
          if (result) {
            resolve(true);
          } else {
            resolve(false);
          }
        };
        request.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }
  
  /**
   * Save a processed request with its response to IndexedDB
   * This allows us to resend the response after page refresh
   */
  private async saveProcessedRequestToDB(requestId: string, response?: {
    success: boolean;
    result?: unknown;
    error?: string;
    addSteps?: unknown[];
    taskId?: string;
    taskIds?: string[];
  }): Promise<void> {
    console.log('[SWClient] Saving tool response to IndexedDB:', requestId, response?.success);
    try {
      const db = await this.openToolRequestDB();
      const tx = db.transaction('processedRequests', 'readwrite');
      const store = tx.objectStore('processedRequests');
      
      // First, get existing record to preserve toolName and workflowId
      const existingRequest = store.get(requestId);
      existingRequest.onsuccess = () => {
        const existing = existingRequest.result || {};
        store.put({ 
          id: requestId, 
          timestamp: Date.now(),
          toolName: existing.toolName, // Preserve from in_progress record
          workflowId: existing.workflowId, // Preserve from in_progress record
          status: 'completed', // Mark as completed
          response: response || null,
          responseSent: false, // Will be set to true after SW receives it
        });
      };
      
      // Wait for transaction to complete
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      console.log('[SWClient] ✓ Tool response saved to IndexedDB:', requestId);
      
      // Clean up old entries (older than 1 hour) in a separate transaction
      const cleanupTx = db.transaction('processedRequests', 'readwrite');
      const cleanupStore = cleanupTx.objectStore('processedRequests');
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const index = cleanupStore.index('timestamp');
      const range = IDBKeyRange.upperBound(oneHourAgo);
      index.openCursor(range).onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    } catch (error) {
      console.warn('[SWClient] Failed to save processed request to DB:', error);
    }
  }
  
  /**
   * Mark a request's response as sent to SW
   */
  private async markResponseSentToDB(requestId: string): Promise<void> {
    try {
      const db = await this.openToolRequestDB();
      const tx = db.transaction('processedRequests', 'readwrite');
      const store = tx.objectStore('processedRequests');
      const request = store.get(requestId);
      request.onsuccess = () => {
        if (request.result) {
          store.put({ ...request.result, responseSent: true });
        }
      };
    } catch (error) {
      console.warn('[SWClient] Failed to mark response sent:', error);
    }
  }
  
  /**
   * Save an in-progress request to IndexedDB
   * This allows us to detect interrupted requests after page refresh
   */
  private async saveInProgressRequestToDB(requestId: string, toolName: string, workflowId: string): Promise<void> {
    try {
      const db = await this.openToolRequestDB();
      const tx = db.transaction('processedRequests', 'readwrite');
      const store = tx.objectStore('processedRequests');
      store.put({ 
        id: requestId, 
        timestamp: Date.now(),
        toolName,
        workflowId,
        status: 'in_progress', // Not completed yet
        response: null,
        responseSent: false,
      });
      // Wait for transaction to complete to ensure data is persisted before page refresh
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      console.log('[SWClient] Tool request marked as in_progress:', requestId);
    } catch (error) {
      console.warn('[SWClient] Failed to save in-progress request:', error);
    }
  }
  
  /**
   * Get all pending responses (processed but not sent to SW)
   * Called on page load to resend responses that were lost during refresh
   */
  async getPendingResponses(): Promise<Array<{
    requestId: string;
    response: {
      success: boolean;
      result?: unknown;
      error?: string;
      addSteps?: unknown[];
      taskId?: string;
      taskIds?: string[];
    };
  }>> {
    try {
      const db = await this.openToolRequestDB();
      return new Promise((resolve) => {
        const tx = db.transaction('processedRequests', 'readonly');
        const store = tx.objectStore('processedRequests');
        const request = store.getAll();
        request.onsuccess = () => {
          const pending = (request.result || [])
            .filter((r: any) => r.response && !r.responseSent)
            .map((r: any) => ({ requestId: r.id, response: r.response }));
          resolve(pending);
        };
        request.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }
  
  /**
   * Get all interrupted requests (started but not completed before refresh)
   */
  async getInterruptedRequests(): Promise<Array<{
    requestId: string;
    toolName: string;
    workflowId: string;
    chatId?: string;
  }>> {
    try {
      const db = await this.openToolRequestDB();
      return new Promise((resolve) => {
        const tx = db.transaction('processedRequests', 'readonly');
        const store = tx.objectStore('processedRequests');
        const request = store.getAll();
        request.onsuccess = () => {
          const interrupted = (request.result || [])
            .filter((r: any) => r.status === 'in_progress' && !r.response)
            .map((r: any) => ({ 
              requestId: r.id, 
              toolName: r.toolName || 'unknown',
              workflowId: r.workflowId || 'unknown',
              chatId: r.chatId, // Include chatId if available
            }));
          resolve(interrupted);
        };
        request.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }
  
  /**
   * Query cached chat result from SW
   */
  async queryCachedChatResult(chatId: string): Promise<{ found: boolean; fullContent?: string }> {
    return new Promise((resolve) => {
      // Set timeout for query
      const timeout = setTimeout(() => {
        this.pendingChatQueries.delete(chatId);
        resolve({ found: false });
      }, 5000);
      
      this.pendingChatQueries.set(chatId, { resolve, timeout });
      
      this.postMessage({
        type: 'CHAT_GET_CACHED',
        chatId,
      });
    });
  }

  /**
   * Recover chat result using notification-based approach:
   * 1. Initial query - check if result is already cached (handles race condition)
   * 2. Event notification - listen for CHAT_DONE event
   * 3. Timeout protection - max 5 minutes wait
   * 
   * No polling needed: initial query handles "already done" case,
   * event listener handles "in progress" case.
   */
  private async recoverChatResultWithNotification(
    requestId: string,
    chatId: string
  ): Promise<boolean> {
    // Track if we've already processed this to avoid duplicate execution
    if (this.processedToolRequests.has(requestId)) {
      console.log('[SWClient] Request already processed:', requestId);
      return true;
    }

    // Step 1: Initial query - maybe it's already cached
    // This handles the race condition where chat completed before we registered the listener
    const initialResult = await this.queryCachedChatResult(chatId);
    if (initialResult.found && initialResult.fullContent) {
      console.log('[SWClient] ✓ Chat result found on initial query:', requestId);
      return this.sendRecoveredChatResponse(requestId, initialResult.fullContent);
    }

    console.log('[SWClient] Chat result not cached yet, waiting for CHAT_DONE notification...');

    // Step 2: Wait for CHAT_DONE event with timeout
    return new Promise<boolean>((resolve) => {
      const maxWaitTime = 300000; // 5 minutes max
      let resolved = false;
      let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        navigator.serviceWorker?.removeEventListener('message', messageHandler);
      };

      const handleSuccess = async (fullContent: string) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        
        const success = await this.sendRecoveredChatResponse(requestId, fullContent);
        resolve(success);
      };

      const handleTimeout = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        console.log('[SWClient] Chat recovery timed out after', maxWaitTime / 1000, 'seconds');
        resolve(false);
      };

      // Message handler for CHAT_DONE event
      const messageHandler = async (event: MessageEvent) => {
        const data = event.data;
        if (!data || resolved) return;

        // Listen for CHAT_DONE with our chatId
        if (data.type === 'CHAT_DONE' && data.chatId === chatId) {
          console.log('[SWClient] ✓ Received CHAT_DONE notification for:', chatId);
          await handleSuccess(data.fullContent);
        }
      };

      // Register event listener
      navigator.serviceWorker?.addEventListener('message', messageHandler);

      // Step 3: Timeout protection
      timeoutTimer = setTimeout(handleTimeout, maxWaitTime);
    });
  }

  /**
   * Send recovered chat response to SW with parsed addSteps
   */
  private async sendRecoveredChatResponse(
    requestId: string,
    fullContent: string
  ): Promise<boolean> {
    // Avoid duplicate processing
    if (this.processedToolRequests.has(requestId)) {
      console.log('[SWClient] Skipping duplicate response for:', requestId);
      return true;
    }

    // Parse the response to extract addSteps (for ai_analyze)
    let addSteps: Array<{
      id: string;
      mcp: string;
      args: Record<string, unknown>;
      description: string;
      status: 'pending';
    }> | undefined;

    const workflowJson = parseWorkflowJson(fullContent);
    if (workflowJson && workflowJson.next.length > 0) {
      console.log('[SWClient] Parsed workflow JSON, found', workflowJson.next.length, 'steps');
      // Use requestId as prefix to ensure uniqueness across requests
      addSteps = workflowJson.next.map((item, index) => ({
        id: `${requestId}-step-${index}`,
        mcp: item.mcp,
        args: item.args,
        description: `执行 ${item.mcp}`,
        status: 'pending' as const,
      }));
    }

    // Build response
    const response = {
      success: true,
      result: { response: fullContent },
      addSteps,
    };

    // Mark as processed BEFORE sending to prevent duplicate
    this.processedToolRequests.add(requestId);

    // Send to SW
    await this.postMessage({
      type: 'MAIN_THREAD_TOOL_RESPONSE',
      requestId,
      ...response,
    } as any);

    // Save to IndexedDB
    await this.saveProcessedRequestToDB(requestId, response);
    
    console.log('[SWClient] ✓ Chat result response sent:', requestId, addSteps ? `with ${addSteps.length} steps` : 'no steps');
    return true;
  }
  
  /**
   * Resend pending tool responses to SW after page refresh
   * This ensures workflow continues even after page refresh
   */
  async resendPendingResponses(): Promise<void> {
    console.log('[SWClient] Checking for pending tool responses to resend...');
    
    // Debug: List all entries in IndexedDB
    try {
      const db = await this.openToolRequestDB();
      const tx = db.transaction('processedRequests', 'readonly');
      const store = tx.objectStore('processedRequests');
      const allRequest = store.getAll();
      allRequest.onsuccess = () => {
        const all = allRequest.result || [];
        console.log('[SWClient] IndexedDB entries:', all.length, all.map((r: any) => ({
          id: r.id,
          status: r.status,
          hasResponse: !!r.response,
          responseSent: r.responseSent,
          toolName: r.toolName,
        })));
      };
    } catch (e) {
      console.warn('[SWClient] Failed to list IndexedDB entries:', e);
    }
    
    // First, check for completed but unsent responses
    const pending = await this.getPendingResponses();
    
    if (pending.length > 0) {
      console.log('[SWClient] Resending pending tool responses:', pending.length);
      
      for (const { requestId, response } of pending) {
        console.log('[SWClient] ▶ Resending saved response:', requestId, response.success);
        
        await this.postMessage({
          type: 'MAIN_THREAD_TOOL_RESPONSE',
          requestId,
          success: response.success,
          result: response.result,
          error: response.error,
          addSteps: response.addSteps,
          taskId: response.taskId,
          taskIds: response.taskIds,
        } as any);
        
        // Mark as sent
        await this.markResponseSentToDB(requestId);
        console.log('[SWClient] ✓ Response resent and marked:', requestId);
      }
    }
    
    // Then, check for interrupted requests (started but never completed)
    const interrupted = await this.getInterruptedRequests();
    
    if (interrupted.length > 0) {
      console.log('[SWClient] Found interrupted tool requests:', interrupted.length);
      
      for (const { requestId, toolName, chatId } of interrupted) {
        // If there's an associated chatId, try to recover the result from SW cache
        // Chat might still be in progress, so we retry a few times with delay
        if (chatId) {
          console.log('[SWClient] ▶ Attempting to recover chat result for:', requestId, chatId);
          
          // Try hybrid approach: initial query + event notification + timeout
          const recovered = await this.recoverChatResultWithNotification(requestId, chatId);
          
          if (recovered) {
            continue; // Skip failure handling
          }
          
          console.log('[SWClient] Chat result not recovered for:', requestId);
        }
        
        // No cached result or no chatId - send failure response
        console.log('[SWClient] ▶ Sending failure response for interrupted request:', requestId, toolName);
        
        // Send failure response to SW so workflow can continue (fail gracefully)
        await this.postMessage({
          type: 'MAIN_THREAD_TOOL_RESPONSE',
          requestId,
          success: false,
          error: '页面刷新导致工具执行中断，请重试',
        } as any);
        
        // Mark as processed (failed)
        await this.saveProcessedRequestToDB(requestId, {
          success: false,
          error: '页面刷新导致工具执行中断',
        });
        console.log('[SWClient] ✓ Interrupted request marked as failed:', requestId);
      }
    }
    
    if (pending.length === 0 && interrupted.length === 0) {
      console.log('[SWClient] No pending tool responses to resend');
    }
  }
  
  /**
   * Open IndexedDB for tool request tracking
   */
  private openToolRequestDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('sw-tool-requests', 2); // Bump version for schema change
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('processedRequests')) {
          const store = db.createObjectStore('processedRequests', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  /**
   * Post message to Service Worker
   */
  private async postMessage(message: MainToSWMessage): Promise<void> {
    if (!this.isServiceWorkerSupported()) {
      console.warn('[SWClient] Service Worker not supported');
      return;
    }

    // Try to get controller, if not available wait for SW ready
    let controller = navigator.serviceWorker.controller;
    if (!controller) {
      // Wait for SW to be ready and get the active worker
      const registration = await navigator.serviceWorker.ready;
      controller = registration.active;
      if (!controller) {
        console.warn('[SWClient] No active Service Worker after ready');
        return;
      }
    }

    controller.postMessage(message);
  }
}

// Export singleton instance getter
export const swTaskQueueClient = SWTaskQueueClient.getInstance();
