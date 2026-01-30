/**
 * Service Worker 通道管理器
 * 
 * 基于 postmessage-duplex 库管理与多个客户端的双工通信
 * 
 * 核心设计：
 * 1. 使用 createFromWorker 预创建通道（在收到客户端连接请求时）
 * 2. subscribeMap 处理器直接返回响应值（而不是手动 publish）
 * 3. 通过 publish 向客户端推送事件（进度、完成、失败等）
 */

import { ServiceWorkerChannel } from 'postmessage-duplex';
import type { SWTaskQueue } from './queue';
import { TaskStatus, TaskType, TaskExecutionPhase } from './types';
import type { SWTask, GeminiConfig, VideoAPIConfig } from './types';
import {
  getWorkflowExecutor,
  handleMainThreadToolResponse,
  initWorkflowHandler,
  resendPendingToolRequests,
} from './workflow-handler';
import type { Workflow, MainThreadToolResponseMessage } from './workflow-types';

// ============================================================================
// RPC 方法名常量
// ============================================================================

export const RPC_METHODS = {
  // 初始化
  INIT: 'init',
  UPDATE_CONFIG: 'updateConfig',
  
  // 任务操作
  TASK_CREATE: 'task:create',
  TASK_CANCEL: 'task:cancel',
  TASK_RETRY: 'task:retry',
  TASK_DELETE: 'task:delete',
  TASK_MARK_INSERTED: 'task:markInserted',
  
  // 任务查询
  TASK_GET: 'task:get',
  TASK_LIST: 'task:list',
  TASK_LIST_PAGINATED: 'task:listPaginated',
  
  // Chat
  CHAT_START: 'chat:start',
  CHAT_STOP: 'chat:stop',
  CHAT_GET_CACHED: 'chat:getCached',
  
  // Workflow
  WORKFLOW_SUBMIT: 'workflow:submit',
  WORKFLOW_CANCEL: 'workflow:cancel',
  WORKFLOW_GET_STATUS: 'workflow:getStatus',
  WORKFLOW_GET_ALL: 'workflow:getAll',
  WORKFLOW_RESPOND_TOOL: 'workflow:respondTool',
  
  // Thumbnail (图片缩略图，由 SW 生成)
  THUMBNAIL_GENERATE: 'thumbnail:generate',
  
  // Crash monitoring
  CRASH_SNAPSHOT: 'crash:snapshot',
  CRASH_HEARTBEAT: 'crash:heartbeat',
  
  // Console
  CONSOLE_REPORT: 'console:report',
  
  // Debug
  DEBUG_GET_STATUS: 'debug:getStatus',
  DEBUG_ENABLE: 'debug:enable',
  DEBUG_DISABLE: 'debug:disable',
  DEBUG_GET_LOGS: 'debug:getLogs',
  DEBUG_CLEAR_LOGS: 'debug:clearLogs',
  DEBUG_GET_CONSOLE_LOGS: 'debug:getConsoleLogs',
  DEBUG_CLEAR_CONSOLE_LOGS: 'debug:clearConsoleLogs',
  DEBUG_GET_POSTMESSAGE_LOGS: 'debug:getPostMessageLogs',
  DEBUG_CLEAR_POSTMESSAGE_LOGS: 'debug:clearPostMessageLogs',
  DEBUG_GET_CRASH_SNAPSHOTS: 'debug:getCrashSnapshots',
  DEBUG_CLEAR_CRASH_SNAPSHOTS: 'debug:clearCrashSnapshots',
  DEBUG_GET_LLM_API_LOGS: 'debug:getLLMApiLogs',
  DEBUG_CLEAR_LLM_API_LOGS: 'debug:clearLLMApiLogs',
  DEBUG_GET_CACHE_ENTRIES: 'debug:getCacheEntries',
  DEBUG_GET_CACHE_STATS: 'debug:getCacheStats',
  DEBUG_EXPORT_LOGS: 'debug:exportLogs',
  // CDN
  CDN_GET_STATUS: 'cdn:getStatus',
  CDN_RESET_STATUS: 'cdn:resetStatus',
  CDN_HEALTH_CHECK: 'cdn:healthCheck',
  // Upgrade
  UPGRADE_GET_STATUS: 'upgrade:getStatus',
  UPGRADE_FORCE: 'upgrade:force',
  // Cache management
  CACHE_DELETE: 'cache:delete',
} as const;

// ============================================================================
// 事件名常量（SW 推送给客户端）
// ============================================================================

export const SW_EVENTS = {
  // Task events
  TASK_CREATED: 'task:created',
  TASK_STATUS: 'task:status',
  TASK_PROGRESS: 'task:progress',
  TASK_COMPLETED: 'task:completed',
  TASK_FAILED: 'task:failed',
  TASK_CANCELLED: 'task:cancelled',
  TASK_DELETED: 'task:deleted',
  TASK_REJECTED: 'task:rejected',
  TASK_SUBMITTED: 'task:submitted',
  TASK_ALL_RESPONSE: 'task:allResponse',
  TASK_PAGINATED_RESPONSE: 'task:paginatedResponse',
  QUEUE_INITIALIZED: 'queue:initialized',
  // Chat events
  CHAT_CHUNK: 'chat:chunk',
  CHAT_DONE: 'chat:done',
  CHAT_ERROR: 'chat:error',
  // Workflow events
  WORKFLOW_STATUS: 'workflow:status',
  WORKFLOW_STEP_STATUS: 'workflow:stepStatus',
  WORKFLOW_COMPLETED: 'workflow:completed',
  WORKFLOW_FAILED: 'workflow:failed',
  WORKFLOW_STEPS_ADDED: 'workflow:stepsAdded',
  WORKFLOW_TOOL_REQUEST: 'workflow:toolRequest',
  WORKFLOW_RECOVERED: 'workflow:recovered',
  // Cache events
  CACHE_IMAGE_CACHED: 'cache:imageCached',
  CACHE_DELETED: 'cache:deleted',
  CACHE_QUOTA_WARNING: 'cache:quotaWarning',
  // SW status events
  SW_NEW_VERSION_READY: 'sw:newVersionReady',
  SW_ACTIVATED: 'sw:activated',
  SW_UPDATED: 'sw:updated',
  SW_REQUEST_CONFIG: 'sw:requestConfig',
  // MCP events
  MCP_TOOL_RESULT: 'mcp:toolResult',
  // Console events
  CONSOLE_LOG: 'console:log',
  // Debug events
  DEBUG_LOG: 'debug:log',
  DEBUG_LLM_LOG: 'debug:llmLog',
  DEBUG_STATUS_CHANGED: 'debug:statusChanged',
  DEBUG_NEW_CRASH_SNAPSHOT: 'debug:newCrashSnapshot',
  POSTMESSAGE_LOG: 'postmessage:log',
  POSTMESSAGE_LOG_BATCH: 'postmessage:logBatch',
} as const;

// ============================================================================
// 类型定义
// ============================================================================

interface ClientChannel {
  channel: ServiceWorkerChannel;
  clientId: string;
  createdAt: number;
}

interface TaskCreateParams {
  taskId: string;
  taskType: TaskType;
  params: SWTask['params'];
}

// Thumbnail types
interface ThumbnailGenerateParams {
  url: string;
  mediaType: 'image' | 'video';
  blob: ArrayBuffer;
  mimeType: string;
}

// Crash monitoring types
interface CrashSnapshotParams {
  snapshot: {
    id: string;
    timestamp: number;
    error?: {
      message: string;
      stack?: string;
      name?: string;
    };
    url?: string;
    userAgent?: string;
    memory?: {
      usedJSHeapSize?: number;
      totalJSHeapSize?: number;
    };
  };
}

interface HeartbeatParams {
  timestamp: number;
}

// Console types
interface ConsoleReportParams {
  logLevel: string;
  logArgs: unknown[];
  timestamp: number;
}

interface ChatStartParams {
  chatId: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    attachments?: Array<{
      type: 'image' | 'file';
      name: string;
      mimeType: string;
      data: string;
    }>;
  }>;
  newContent: string;
  attachments?: Array<{
    type: 'image' | 'file';
    name: string;
    mimeType: string;
    data: string;
  }>;
  temporaryModel?: string;
  systemPrompt?: string;
}

// ============================================================================
// 通道管理器
// ============================================================================

export class SWChannelManager {
  private static instance: SWChannelManager | null = null;
  
  private sw: ServiceWorkerGlobalScope;
  private taskQueue: SWTaskQueue | null = null;
  private channels: Map<string, ClientChannel> = new Map();
  
  // 维护 workflowId/taskId/chatId -> ClientChannel 的映射
  // 这样应用层不需要关心 clientId，由 channelManager 管理点对点通讯
  private workflowChannels: Map<string, ClientChannel> = new Map();
  private taskChannels: Map<string, ClientChannel> = new Map();
  private chatChannels: Map<string, ClientChannel> = new Map();

  private constructor(sw: ServiceWorkerGlobalScope) {
    this.sw = sw;
    
    // SW 启动时立即清理所有旧通道（SW 重启后旧通道都无效）
    this.channels.clear();
    console.log('[SWChannelManager] Initialized, cleared all stale channels');
    
    // 定期清理断开的客户端（每 60 秒）
    setInterval(() => {
      this.cleanupDisconnectedClients().catch(() => {});
    }, 60000);
  }

  // ============================================================================
  // 通用操作 wrapper
  // ============================================================================

  /**
   * 包装需要 taskId 验证的操作，统一错误处理
   */
  private async wrapTaskOperation(
    taskId: string,
    operation: () => Promise<void>
  ): Promise<{ success: boolean; error?: string }> {
    if (!taskId) {
      return { success: false, error: 'Missing taskId' };
    }
    try {
      await operation();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取单例实例
   */
  static getInstance(sw: ServiceWorkerGlobalScope): SWChannelManager {
    if (!SWChannelManager.instance) {
      SWChannelManager.instance = new SWChannelManager(sw);
    }
    return SWChannelManager.instance;
  }

  /**
   * 设置任务队列实例
   */
  setTaskQueue(taskQueue: SWTaskQueue): void {
    this.taskQueue = taskQueue;
  }

  /**
   * 确保客户端通道存在
   * 使用 createFromWorker 创建通道，通道会自动监听来自该客户端的消息
   */
  ensureChannel(clientId: string): ServiceWorkerChannel {
    let clientChannel = this.channels.get(clientId);
    
    if (!clientChannel) {
      // 使用 createFromWorker 创建通道，禁用内部日志
      // 注意：禁用 error 日志以避免 fire-and-forget 广播的超时错误噪音
      // 这些超时是预期行为（某些客户端没有处理器）
      const channel = ServiceWorkerChannel.createFromWorker(clientId, {
        timeout: 30000,
        subscribeMap: this.createSubscribeMap(clientId),
        log: { log: () => {}, warn: () => {}, error: () => {} },
      });
      
      clientChannel = {
        channel,
        clientId,
        createdAt: Date.now(),
      };
      
      this.channels.set(clientId, clientChannel);
      console.log(`[SWChannelManager] New client connected: ${clientId.substring(0, 8)}..., total: ${this.channels.size}`);
    }
    
    return clientChannel.channel;
  }

  /**
   * 处理客户端连接请求
   * 当客户端发送 SW_CHANNEL_CONNECT 消息时调用
   */
  handleClientConnect(clientId: string): void {
    this.ensureChannel(clientId);
  }

  /**
   * 创建 RPC 订阅映射
   * 处理器直接返回响应值（Promise 或同步值）
   */
  /**
   * 解包 RPC 数据
   * postmessage-duplex 的 subscribeMap 回调接收的是完整的请求对象:
   * { requestId, cmdname, data: <实际参数>, time, t }
   * 我们需要提取 data 字段作为实际参数
   */
  private unwrapRpcData<T>(rawData: any): T {
    // 如果有 cmdname 字段，说明是 postmessage-duplex 包装格式
    if (rawData && typeof rawData === 'object' && 'cmdname' in rawData) {
      return rawData.data as T;
    }
    // 否则直接返回
    return rawData as T;
  }

  private createSubscribeMap(clientId: string): Record<string, (data: any) => any> {
    return {
      // 初始化
      [RPC_METHODS.INIT]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ geminiConfig: GeminiConfig; videoConfig: VideoAPIConfig }>(rawData);
        return this.handleInit(data);
      },
      
      [RPC_METHODS.UPDATE_CONFIG]: async (rawData: any) => {
        const data = this.unwrapRpcData<Partial<{ geminiConfig: Partial<GeminiConfig>; videoConfig: Partial<VideoAPIConfig> }>>(rawData);
        return this.handleUpdateConfig(data);
      },
      
      // 任务操作
      [RPC_METHODS.TASK_CREATE]: async (rawData: any) => {
        const data = this.unwrapRpcData<TaskCreateParams>(rawData);
        return this.handleTaskCreate(clientId, data);
      },
      
      [RPC_METHODS.TASK_CANCEL]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ taskId: string }>(rawData);
        return this.handleTaskCancel(data.taskId);
      },
      
      [RPC_METHODS.TASK_RETRY]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ taskId: string }>(rawData);
        return this.handleTaskRetry(data.taskId);
      },
      
      [RPC_METHODS.TASK_DELETE]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ taskId: string }>(rawData);
        return this.handleTaskDelete(data.taskId);
      },
      
      [RPC_METHODS.TASK_MARK_INSERTED]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ taskId: string }>(rawData);
        return this.handleTaskMarkInserted(data.taskId);
      },
      
      // 任务查询
      [RPC_METHODS.TASK_GET]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ taskId: string }>(rawData);
        return this.handleTaskGet(data.taskId);
      },
      
      [RPC_METHODS.TASK_LIST]: async () => {
        return this.handleTaskList();
      },
      
      [RPC_METHODS.TASK_LIST_PAGINATED]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ offset?: number; limit?: number; type?: TaskType; status?: TaskStatus }>(rawData);
        return this.handleTaskListPaginated(data);
      },
      
      // Chat
      [RPC_METHODS.CHAT_START]: async (rawData: any) => {
        const data = this.unwrapRpcData<ChatStartParams>(rawData);
        return this.handleChatStart(clientId, data);
      },
      
      [RPC_METHODS.CHAT_STOP]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ chatId: string }>(rawData);
        return this.handleChatStop(data.chatId);
      },
      
      [RPC_METHODS.CHAT_GET_CACHED]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ chatId: string }>(rawData);
        return this.handleChatGetCached(data.chatId);
      },
      
      // Workflow
      [RPC_METHODS.WORKFLOW_SUBMIT]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ workflow: Workflow }>(rawData);
        return this.handleWorkflowSubmit(clientId, data);
      },
      
      [RPC_METHODS.WORKFLOW_CANCEL]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ workflowId: string }>(rawData);
        return this.handleWorkflowCancel(data.workflowId);
      },
      
      [RPC_METHODS.WORKFLOW_GET_STATUS]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ workflowId: string }>(rawData);
        return this.handleWorkflowGetStatus(data.workflowId);
      },
      
      [RPC_METHODS.WORKFLOW_GET_ALL]: async () => {
        return this.handleWorkflowGetAll();
      },
      
      // Deprecated: Use sendToolRequest() which receives response directly
      [RPC_METHODS.WORKFLOW_RESPOND_TOOL]: async (rawData: any) => {
        const data = this.unwrapRpcData<MainThreadToolResponseMessage>(rawData);
        return this.handleToolResponse(data);
      },
      
      // Thumbnail (图片缩略图，由 SW 生成)
      [RPC_METHODS.THUMBNAIL_GENERATE]: async (rawData: any) => {
        const data = this.unwrapRpcData<ThumbnailGenerateParams>(rawData);
        return this.handleThumbnailGenerate(data);
      },
      
      // Crash monitoring
      [RPC_METHODS.CRASH_SNAPSHOT]: async (rawData: any) => {
        const data = this.unwrapRpcData<CrashSnapshotParams>(rawData);
        return this.handleCrashSnapshot(data);
      },
      
      [RPC_METHODS.CRASH_HEARTBEAT]: async (rawData: any) => {
        const data = this.unwrapRpcData<HeartbeatParams>(rawData);
        return this.handleHeartbeat(data);
      },
      
      // Console
      [RPC_METHODS.CONSOLE_REPORT]: async (rawData: any) => {
        const data = this.unwrapRpcData<ConsoleReportParams>(rawData);
        return this.handleConsoleReport(data);
      },
      
      // Debug (无参数的方法不需要解包)
      [RPC_METHODS.DEBUG_GET_STATUS]: async () => {
        return this.handleDebugGetStatus();
      },
      [RPC_METHODS.DEBUG_ENABLE]: async () => {
        return this.handleDebugEnable();
      },
      [RPC_METHODS.DEBUG_DISABLE]: async () => {
        return this.handleDebugDisable();
      },
      [RPC_METHODS.DEBUG_GET_LOGS]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ limit?: number; offset?: number; filter?: Record<string, unknown> }>(rawData);
        return this.handleDebugGetLogs(data);
      },
      [RPC_METHODS.DEBUG_CLEAR_LOGS]: async () => {
        return this.handleDebugClearLogs();
      },
      [RPC_METHODS.DEBUG_GET_CONSOLE_LOGS]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ limit?: number; offset?: number; filter?: Record<string, unknown> }>(rawData);
        return this.handleDebugGetConsoleLogs(data);
      },
      [RPC_METHODS.DEBUG_CLEAR_CONSOLE_LOGS]: async () => {
        return this.handleDebugClearConsoleLogs();
      },
      [RPC_METHODS.DEBUG_GET_POSTMESSAGE_LOGS]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ limit?: number; offset?: number; filter?: Record<string, unknown> }>(rawData);
        return this.handleDebugGetPostMessageLogs(data);
      },
      [RPC_METHODS.DEBUG_CLEAR_POSTMESSAGE_LOGS]: async () => {
        return this.handleDebugClearPostMessageLogs();
      },
      [RPC_METHODS.DEBUG_GET_CRASH_SNAPSHOTS]: async () => {
        return this.handleDebugGetCrashSnapshots();
      },
      [RPC_METHODS.DEBUG_CLEAR_CRASH_SNAPSHOTS]: async () => {
        return this.handleDebugClearCrashSnapshots();
      },
      [RPC_METHODS.DEBUG_GET_LLM_API_LOGS]: async () => {
        return this.handleDebugGetLLMApiLogs();
      },
      [RPC_METHODS.DEBUG_CLEAR_LLM_API_LOGS]: async () => {
        return this.handleDebugClearLLMApiLogs();
      },
      [RPC_METHODS.DEBUG_GET_CACHE_ENTRIES]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ cacheName?: string; limit?: number; offset?: number }>(rawData);
        return this.handleDebugGetCacheEntries(data);
      },
      [RPC_METHODS.DEBUG_GET_CACHE_STATS]: async () => {
        return this.handleDebugGetCacheStats();
      },
      [RPC_METHODS.DEBUG_EXPORT_LOGS]: async () => {
        return this.handleDebugExportLogs();
      },
      // CDN
      [RPC_METHODS.CDN_GET_STATUS]: async () => {
        return this.handleCDNGetStatus();
      },
      [RPC_METHODS.CDN_RESET_STATUS]: async () => {
        return this.handleCDNResetStatus();
      },
      [RPC_METHODS.CDN_HEALTH_CHECK]: async () => {
        return this.handleCDNHealthCheck();
      },
      // Upgrade
      [RPC_METHODS.UPGRADE_GET_STATUS]: async () => {
        return this.handleUpgradeGetStatus();
      },
      [RPC_METHODS.UPGRADE_FORCE]: async () => {
        return this.handleUpgradeForce();
      },
      // Cache management
      [RPC_METHODS.CACHE_DELETE]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ url: string }>(rawData);
        return this.handleCacheDelete(data);
      },
    };
  }

  // ============================================================================
  // RPC 处理器（直接返回响应值）
  // ============================================================================

  private workflowHandlerInitialized = false;

  private async handleInit(data: { geminiConfig: GeminiConfig; videoConfig: VideoAPIConfig }): Promise<{ success: boolean; error?: string }> {
    if (!data || !data.geminiConfig || !data.videoConfig) {
      console.error('[SWChannelManager] handleInit: Missing config data');
      return { success: false, error: 'Missing config data' };
    }

    try {
      // 先清理无效的客户端通道（避免向已关闭的页面广播）
      await this.cleanupDisconnectedClients();
      
      // 初始化任务队列
      await this.taskQueue?.initialize(data.geminiConfig, data.videoConfig);
      
      // 初始化工作流处理器（只初始化一次）
      if (!this.workflowHandlerInitialized) {
        initWorkflowHandler(this.sw, data.geminiConfig, data.videoConfig);
        this.workflowHandlerInitialized = true;
      }
      
      console.log('[SWChannelManager] SW initialized with API config, clients:', this.channels.size);
      
      // 重新发送待处理的工具请求（处理页面刷新场景）
      // 获取发起初始化请求的客户端 ID
      const clientId = this.channels.keys().next().value as string | undefined;
      if (clientId) {
        resendPendingToolRequests(clientId);
      }
      
      return { success: true };
    } catch (error: any) {
      console.error('[SWChannelManager] handleInit error:', error);
      return { success: false, error: error.message || 'Init failed' };
    }
  }

  private async handleUpdateConfig(data: Partial<{ geminiConfig: Partial<GeminiConfig>; videoConfig: Partial<VideoAPIConfig> }>): Promise<{ success: boolean; error?: string }> {
    try {
      await this.taskQueue?.updateConfig(data?.geminiConfig, data?.videoConfig);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Update config failed' };
    }
  }

  private async handleTaskCreate(clientId: string, data: TaskCreateParams): Promise<{ success: boolean; task?: SWTask; existingTaskId?: string; reason?: string }> {
    console.log(`[SWChannelManager] handleTaskCreate called: taskId=${data?.taskId}, type=${data?.taskType}, hasTaskQueue=${!!this.taskQueue}`);

    if (!data) {
      return { success: false, reason: 'Missing task data' };
    }

    const { taskId, taskType, params } = data;

    // 检查任务队列是否存在并已初始化
    if (!this.taskQueue) {
      console.warn('[SWChannelManager] Task queue not set');
      return { success: false, reason: 'not_initialized' };
    }

    // 检查任务队列是否已初始化（有 API config）
    if (!this.taskQueue.getGeminiConfig() || !this.taskQueue.getVideoConfig()) {
      console.warn('[SWChannelManager] Task queue not initialized (no API config)');
      return { success: false, reason: 'not_initialized' };
    }

    console.log('[SWChannelManager] Task queue initialized, checking duplicates...');

    // 检查重复任务（相同 taskId）
    const existingTask = this.taskQueue.getTask(taskId);
    if (existingTask) {
      return { success: false, existingTaskId: taskId, reason: 'duplicate' };
    }

    // 检查相同 prompt 的任务（非批量生成时）
    if (!params.batchId) {
      const allTasks = this.taskQueue.getAllTasks();
      const duplicatePromptTask = allTasks.find(
        t => (t.status === TaskStatus.PROCESSING || t.status === TaskStatus.PENDING) &&
             t.type === taskType &&
             t.params.prompt === params.prompt
      );
      
      if (duplicatePromptTask) {
        return { success: false, existingTaskId: duplicatePromptTask.id, reason: 'duplicate' };
      }
    }

    // 创建任务
    try {
      console.log(`[SWChannelManager] Calling taskQueue.submitTask for ${taskId}...`);
      await this.taskQueue.submitTask(taskId, taskType, params, clientId);
      const task = this.taskQueue.getTask(taskId);

      console.log(`[SWChannelManager] Task ${taskId} created successfully, task status=${task?.status}`);

      // 记录 taskId -> channel 映射，用于后续点对点通讯
      const clientChannel = this.channels.get(clientId);
      if (clientChannel) {
        this.taskChannels.set(taskId, clientChannel);
      }

      // 广播给其他客户端（通知新任务创建）
      this.broadcastToOthers(SW_EVENTS.TASK_CREATED, { task }, clientId);

      return { success: true, task };
    } catch (error: any) {
      console.error('[SWChannelManager] Task creation failed:', error);
      return { success: false, reason: error.message || 'Create task failed' };
    }
  }

  private handleTaskCancel(taskId: string): Promise<{ success: boolean; error?: string }> {
    return this.wrapTaskOperation(taskId, async () => {
      await this.taskQueue?.cancelTask(taskId);
    });
  }

  private handleTaskRetry(taskId: string): Promise<{ success: boolean; error?: string }> {
    return this.wrapTaskOperation(taskId, async () => {
      await this.taskQueue?.retryTask(taskId);
    });
  }

  private handleTaskDelete(taskId: string): Promise<{ success: boolean; error?: string }> {
    return this.wrapTaskOperation(taskId, async () => {
      await this.taskQueue?.deleteTask(taskId);
    });
  }

  private handleTaskMarkInserted(taskId: string): Promise<{ success: boolean; error?: string }> {
    return this.wrapTaskOperation(taskId, async () => {
      await this.taskQueue?.markTaskInserted(taskId);
    });
  }

  private async handleTaskGet(taskId: string): Promise<{ success: boolean; task?: SWTask; error?: string }> {
    if (!taskId) {
      return { success: false, error: 'Missing taskId' };
    }

    const task = this.taskQueue?.getTask(taskId);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    return { success: true, task };
  }

  private async handleTaskList(): Promise<{ success: boolean; tasks: SWTask[]; total: number }> {
    const tasks = this.taskQueue?.getAllTasks() || [];
    return { success: true, tasks, total: tasks.length };
  }

  private async handleTaskListPaginated(data: { offset?: number; limit?: number; type?: TaskType; status?: TaskStatus }): Promise<{ success: boolean; tasks: SWTask[]; total: number; offset: number; hasMore: boolean }> {
    const { offset = 0, limit = 20, type, status } = data || {};
    
    let tasks = this.taskQueue?.getAllTasks() || [];
    
    // 过滤
    if (type !== undefined) {
      tasks = tasks.filter(t => t.type === type);
    }
    if (status !== undefined) {
      tasks = tasks.filter(t => t.status === status);
    }
    
    // 按创建时间倒序
    tasks.sort((a, b) => b.createdAt - a.createdAt);
    
    const total = tasks.length;
    const paginatedTasks = tasks.slice(offset, offset + limit);
    const hasMore = offset + limit < total;
    
    return { success: true, tasks: paginatedTasks, total, offset, hasMore };
  }

  private async handleChatStart(clientId: string, data: ChatStartParams): Promise<{ success: boolean; chatId?: string; error?: string }> {
    if (!data?.chatId) {
      return { success: false, error: 'Missing chatId' };
    }

    try {
      // 记录 chatId -> channel 映射，用于后续点对点通讯
      const clientChannel = this.channels.get(clientId);
      if (clientChannel) {
        this.chatChannels.set(data.chatId, clientChannel);
      }

      // 实际的聊天流通过 taskQueue.startChat 处理，消息通过 channelManager 点对点发送
      // 注意：startChat 是异步的，会通过 sendChatChunk/sendChatDone/sendChatError 发送消息
      if (this.taskQueue) {
        // 构造 ChatParams
        const chatParams = {
          messages: data.messages,
          newContent: data.newContent,
          attachments: data.attachments,
          temporaryModel: data.temporaryModel,
          systemPrompt: data.systemPrompt,
        };
        // 不等待完成，让聊天流异步处理
        this.taskQueue.startChat(data.chatId, chatParams, clientId).catch(error => {
          console.error('[SWChannelManager] Chat start error:', error);
        });
      }

      return { success: true, chatId: data.chatId };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async handleChatStop(chatId: string): Promise<{ success: boolean; error?: string }> {
    if (!chatId) {
      return { success: false, error: 'Missing chatId' };
    }

    try {
      // 停止 Chat 的逻辑
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async handleChatGetCached(chatId: string): Promise<{ success: boolean; content?: string; error?: string }> {
    if (!chatId) {
      return { success: false, error: 'Missing chatId' };
    }

    try {
      // 获取缓存的 Chat 内容
      return { success: true, content: '' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // Workflow RPC 处理器
  // ============================================================================

  private async handleWorkflowSubmit(clientId: string, data: { workflow: Workflow }): Promise<{ success: boolean; workflowId?: string; error?: string }> {
    if (!data?.workflow) {
      return { success: false, error: 'Missing workflow data' };
    }

    try {
      const executor = getWorkflowExecutor();
      if (!executor) {
        return { success: false, error: 'Workflow executor not initialized' };
      }

      // 注册 workflow -> channel 映射，实现点对点通讯
      const clientChannel = this.channels.get(clientId);
      if (clientChannel) {
        this.workflowChannels.set(data.workflow.id, clientChannel);
      }

      // WorkflowExecutor 不再需要 clientId，通过 channelManager 发送消息
      await executor.submitWorkflow(data.workflow);
      return { success: true, workflowId: data.workflow.id };
    } catch (error: any) {
      console.error('[SWChannelManager] Workflow submit failed:', error);
      return { success: false, error: error.message || 'Submit workflow failed' };
    }
  }

  private async handleWorkflowCancel(workflowId: string): Promise<{ success: boolean; error?: string }> {
    if (!workflowId) {
      return { success: false, error: 'Missing workflowId' };
    }

    try {
      const executor = getWorkflowExecutor();
      if (!executor) {
        return { success: false, error: 'Workflow executor not initialized' };
      }

      await executor.cancelWorkflow(workflowId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async handleWorkflowGetStatus(workflowId: string): Promise<{ success: boolean; workflow?: Workflow; error?: string }> {
    if (!workflowId) {
      return { success: false, error: 'Missing workflowId' };
    }

    try {
      const executor = getWorkflowExecutor();
      if (!executor) {
        return { success: false, error: 'Workflow executor not initialized' };
      }

      const workflow = executor.getWorkflow(workflowId);
      return { success: true, workflow };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async handleWorkflowGetAll(): Promise<{ success: boolean; workflows: Workflow[] }> {
    try {
      const executor = getWorkflowExecutor();
      if (!executor) {
        return { success: true, workflows: [] };
      }

      const workflows = executor.getAllWorkflows();
      return { success: true, workflows };
    } catch (error: any) {
      console.error('[SWChannelManager] Get all workflows failed:', error);
      return { success: true, workflows: [] };
    }
  }

  /**
   * Handle tool response from main thread via RPC
   * @deprecated This handler is kept for backward compatibility.
   * New code should use sendToolRequest() which receives response directly.
   */
  private async handleToolResponse(data: MainThreadToolResponseMessage): Promise<{ success: boolean; error?: string }> {
    try {
      await handleMainThreadToolResponse(data);
      return { success: true };
    } catch (error: any) {
      console.error('[SWChannelManager] Tool response handling failed:', error);
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // Thumbnail RPC 处理器
  // ============================================================================

  private async handleThumbnailGenerate(data: ThumbnailGenerateParams): Promise<{ success: boolean; error?: string }> {
    try {
      const { url, mediaType, blob, mimeType } = data;
      
      // 动态导入缩略图工具
      const { generateThumbnailAsync } = await import('./utils/thumbnail-utils');
      
      // 将 ArrayBuffer 转换为 Blob
      const mediaBlob = new Blob([blob], { type: mimeType || (mediaType === 'video' ? 'video/mp4' : 'image/png') });
      
      // 生成缩略图 (参数顺序: blob, url, mediaType)
      generateThumbnailAsync(mediaBlob, url, mediaType);
      
      return { success: true };
    } catch (error: any) {
      console.error('[SWChannelManager] Thumbnail generation failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 请求视频缩略图生成
   * 使用 publish 直接向主线程发起请求并等待响应（双工通讯）
   */
  async requestVideoThumbnail(url: string, timeoutMs: number = 30000): Promise<string | null> {
    // 找到一个可用的 channel 来发送请求
    const clientChannel = this.channels.values().next().value as ClientChannel | undefined;
    if (!clientChannel) {
      console.warn('[SWChannelManager] No connected clients for video thumbnail request');
      return null;
    }
    
    try {
      // 使用 publish 发起请求，主线程通过 subscribe 注册的处理器响应
      const response = await Promise.race([
        clientChannel.channel.publish('thumbnail:generate', { url }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
      ]);
      
      if (!response || typeof response !== 'object') {
        return null;
      }
      
      const result = response as { data?: { thumbnailUrl?: string; error?: string } };
      if (result.data?.error) {
        console.warn('[SWChannelManager] Video thumbnail request failed:', result.data.error);
        return null;
      }
      
      return result.data?.thumbnailUrl || null;
    } catch (error) {
      console.warn('[SWChannelManager] Video thumbnail request error:', error);
      return null;
    }
  }

  // ============================================================================
  // Crash monitoring RPC 处理器
  // ============================================================================

  private async handleCrashSnapshot(data: CrashSnapshotParams): Promise<{ success: boolean; error?: string }> {
    try {
      const { saveCrashSnapshot } = await import('../index');
      await saveCrashSnapshot(data.snapshot);
      return { success: true };
    } catch (error: any) {
      console.error('[SWChannelManager] Crash snapshot save failed:', error);
      return { success: false, error: error.message };
    }
  }

  private async handleHeartbeat(data: HeartbeatParams): Promise<{ success: boolean; error?: string }> {
    // 心跳处理 - 更新客户端最后活跃时间
    // 可用于检测客户端是否还活跃
    return { success: true };
  }

  // ============================================================================
  // Console RPC 处理器
  // ============================================================================

  private async handleConsoleReport(data: ConsoleReportParams): Promise<{ success: boolean; error?: string }> {
    try {
      const { addConsoleLog } = await import('../index');
      // addConsoleLog expects a single entry object, not separate arguments
      addConsoleLog({
        logLevel: data.logLevel as 'log' | 'info' | 'warn' | 'error' | 'debug',
        logMessage: Array.isArray(data.logArgs) ? data.logArgs.map(String).join(' ') : String(data.logArgs),
      });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // Debug RPC 处理器
  // ============================================================================

  private async handleDebugGetStatus(): Promise<Record<string, unknown>> {
    try {
      const { getDebugStatus, getCacheStats } = await import('../index');
      const status = getDebugStatus();
      const cacheStats = await getCacheStats();
      // Return the full status object with cacheStats merged in
      return { ...status, cacheStats };
    } catch {
      return { debugModeEnabled: false };
    }
  }

  private async handleDebugEnable(): Promise<{ success: boolean; status?: Record<string, unknown> }> {
    try {
      const { enableDebugMode, getDebugStatus } = await import('../index');
      await enableDebugMode();
      const status = getDebugStatus();
      // 广播调试状态变更
      this.sendDebugStatusChanged(true);
      return { success: true, status };
    } catch (error: any) {
      return { success: false };
    }
  }

  private async handleDebugDisable(): Promise<{ success: boolean; status?: Record<string, unknown> }> {
    try {
      const { disableDebugMode, getDebugStatus } = await import('../index');
      await disableDebugMode();
      const status = getDebugStatus();
      // 广播调试状态变更
      this.sendDebugStatusChanged(false);
      return { success: true, status };
    } catch (error: any) {
      return { success: false };
    }
  }

  private async handleDebugGetLogs(data: { limit?: number; offset?: number; filter?: Record<string, unknown> }): Promise<{
    logs: unknown[];
    total: number;
    offset: number;
    limit: number;
  }> {
    try {
      const { getDebugLogs, getInternalFetchLogs } = await import('../index');
      const { limit = 100, offset = 0, filter } = data || {};
      
      // Merge internal fetch logs with debug logs
      const internalLogs = getInternalFetchLogs().map((log) => ({
        ...log,
        type: 'fetch' as const,
      }));
      const debugLogs = getDebugLogs();


      // Combine and deduplicate by ID
      const logMap = new Map<string, unknown>();
      for (const log of debugLogs) {
        logMap.set((log as { id: string }).id, log);
      }
      for (const log of internalLogs) {
        logMap.set((log as { id: string }).id, log);
      }

      // Sort by timestamp descending
      let logs = Array.from(logMap.values()).sort(
        (a: any, b: any) => b.timestamp - a.timestamp
      );

      // Apply filters
      if (filter) {
        if (filter.type) {
          logs = logs.filter((l: any) => l.type === filter.type);
        }
        if (filter.status) {
          logs = logs.filter((l: any) => l.status === filter.status);
        }
      }

      const paginatedLogs = logs.slice(offset, offset + limit);
      return { logs: paginatedLogs, total: logs.length, offset, limit };
    } catch {
      return { logs: [], total: 0, offset: data?.offset || 0, limit: data?.limit || 100 };
    }
  }

  private async handleDebugClearLogs(): Promise<{ success: boolean }> {
    try {
      const { clearDebugLogs } = await import('../index');
      clearDebugLogs();
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  private async handleDebugGetConsoleLogs(data: { limit?: number; offset?: number; filter?: Record<string, unknown> }): Promise<{
    logs: unknown[];
    total: number;
    offset: number;
    limit: number;
    error?: string;
  }> {
    try {
      const { loadConsoleLogsFromDB } = await import('../index');
      const { limit = 500, offset = 0, filter } = data || {};
      let logs = await loadConsoleLogsFromDB();

      // Apply filters
      if (filter) {
        if (filter.logLevel) {
          logs = logs.filter((l: any) => l.logLevel === filter.logLevel);
        }
        if (filter.search) {
          const search = (filter.search as string).toLowerCase();
          logs = logs.filter(
            (l: any) =>
              l.logMessage?.toLowerCase().includes(search) ||
              l.logStack?.toLowerCase().includes(search)
          );
        }
      }

      const paginatedLogs = logs.slice(offset, offset + limit);
      return { logs: paginatedLogs, total: logs.length, offset, limit };
    } catch (error: any) {
      return { logs: [], total: 0, offset: data?.offset || 0, limit: data?.limit || 500, error: String(error) };
    }
  }

  private async handleDebugClearConsoleLogs(): Promise<{ success: boolean }> {
    try {
      const { clearConsoleLogs, clearAllConsoleLogs } = await import('../index');
      clearConsoleLogs();
      await clearAllConsoleLogs();
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  private async handleDebugGetPostMessageLogs(data: { limit?: number; offset?: number; filter?: Record<string, unknown> }): Promise<{
    logs: unknown[];
    total: number;
    offset: number;
    limit: number;
    stats?: Record<string, unknown>;
  }> {
    try {
      const { getAllLogs, getLogStats } = await import('./postmessage-logger');
      const { limit = 200, offset = 0, filter } = data || {};
      let logs = getAllLogs();

      // Apply filters
      if (filter) {
        if (filter.direction) {
          logs = logs.filter((l) => l.direction === filter.direction);
        }
        if (filter.messageType) {
          const search = (filter.messageType as string).toLowerCase();
          logs = logs.filter((l) => l.messageType?.toLowerCase().includes(search));
        }
      }

      const paginatedLogs = logs.slice(offset, offset + limit);
      return { logs: paginatedLogs, total: logs.length, offset, limit, stats: getLogStats() };
    } catch {
      return { logs: [], total: 0, offset: data?.offset || 0, limit: data?.limit || 200 };
    }
  }

  private async handleDebugClearPostMessageLogs(): Promise<{ success: boolean }> {
    try {
      const { clearLogs } = await import('./postmessage-logger');
      clearLogs();
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  private async handleDebugGetCrashSnapshots(): Promise<{ snapshots: unknown[]; total: number; error?: string }> {
    try {
      const { getCrashSnapshots } = await import('../index');
      const snapshots = await getCrashSnapshots();
      return { snapshots, total: snapshots.length };
    } catch (error: any) {
      return { snapshots: [], total: 0, error: String(error) };
    }
  }

  private async handleDebugClearCrashSnapshots(): Promise<{ success: boolean }> {
    try {
      const { clearCrashSnapshots } = await import('../index');
      await clearCrashSnapshots();
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  private async handleDebugGetLLMApiLogs(): Promise<{ logs: unknown[]; total: number; error?: string }> {
    try {
      const { getAllLLMApiLogs } = await import('./llm-api-logger');
      const logs = await getAllLLMApiLogs();
      return { logs, total: logs.length };
    } catch (error: any) {
      return { logs: [], total: 0, error: String(error) };
    }
  }

  private async handleDebugClearLLMApiLogs(): Promise<{ success: boolean }> {
    try {
      const { clearAllLLMApiLogs } = await import('./llm-api-logger');
      await clearAllLLMApiLogs();
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  private async handleDebugGetCacheEntries(data: { cacheName?: string; limit?: number; offset?: number }): Promise<{
    cacheName: string;
    entries: { url: string; cacheDate?: number; size?: number }[];
    total: number;
    offset: number;
    limit: number;
    error?: string;
  }> {
    try {
      const { IMAGE_CACHE_NAME } = await import('../index');
      const { cacheName = IMAGE_CACHE_NAME, limit = 50, offset = 0 } = data || {};
      
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      const entries: { url: string; cacheDate?: number; size?: number }[] = [];

      for (let i = offset; i < Math.min(offset + limit, requests.length); i++) {
        const request = requests[i];
        const response = await cache.match(request);
        if (response) {
          const cacheDate = response.headers.get('sw-cache-date');
          const size = response.headers.get('sw-image-size') || response.headers.get('content-length');
          entries.push({
            url: request.url,
            cacheDate: cacheDate ? parseInt(cacheDate) : undefined,
            size: size ? parseInt(size) : undefined,
          });
        }
      }

      return { cacheName, entries, total: requests.length, offset, limit };
    } catch (error: any) {
      return { cacheName: data?.cacheName || '', entries: [], total: 0, offset: data?.offset || 0, limit: data?.limit || 50, error: String(error) };
    }
  }

  private async handleDebugGetCacheStats(): Promise<{
    stats: {
      caches: { name: string; count: number; size: number }[];
      totalCount: number;
      totalSize: number;
    };
    error?: string;
  }> {
    try {
      const cacheNames = await caches.keys();
      const cacheStats: { name: string; count: number; size: number }[] = [];
      let totalCount = 0;
      let totalSize = 0;

      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        let cacheSize = 0;

        for (const request of requests) {
          const response = await cache.match(request);
          if (response) {
            const size = response.headers.get('content-length');
            if (size) {
              cacheSize += parseInt(size);
            }
          }
        }

        cacheStats.push({ name, count: requests.length, size: cacheSize });
        totalCount += requests.length;
        totalSize += cacheSize;
      }

      return {
        stats: { caches: cacheStats, totalCount, totalSize },
      };
    } catch (error: any) {
      return {
        stats: { caches: [], totalCount: 0, totalSize: 0 },
        error: String(error),
      };
    }
  }

  private async handleDebugExportLogs(): Promise<{
    exportTime: string;
    swVersion: string;
    status: Record<string, unknown>;
    fetchLogs: unknown[];
    consoleLogs: unknown[];
    postmessageLogs: unknown[];
  }> {
    try {
      const { getDebugStatus, getDebugLogs, loadConsoleLogsFromDB, APP_VERSION } = await import('../index');
      const { getAllLogs } = await import('./postmessage-logger');
      
      const allConsoleLogs = await loadConsoleLogsFromDB();
      const postmessageLogs = getAllLogs();
      const debugLogs = getDebugLogs();
      
      return {
        exportTime: new Date().toISOString(),
        swVersion: APP_VERSION,
        status: getDebugStatus(),
        fetchLogs: debugLogs,
        consoleLogs: allConsoleLogs,
        postmessageLogs,
      };
    } catch {
      return {
        exportTime: new Date().toISOString(),
        swVersion: 'unknown',
        status: {},
        fetchLogs: [],
        consoleLogs: [],
        postmessageLogs: [],
      };
    }
  }

  // ============================================================================
  // CDN RPC 处理器
  // ============================================================================

  private async handleCDNGetStatus(): Promise<{ status: Record<string, unknown> }> {
    try {
      const { getCDNStatusReport } = await import('../index');
      return { status: getCDNStatusReport() };
    } catch {
      return { status: {} };
    }
  }

  private async handleCDNResetStatus(): Promise<{ success: boolean }> {
    try {
      const { resetCDNStatus } = await import('../index');
      resetCDNStatus();
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  private async handleCDNHealthCheck(): Promise<{ results: Record<string, unknown> }> {
    try {
      const { performHealthCheck, APP_VERSION } = await import('../index');
      const results = await performHealthCheck(APP_VERSION);
      return { results: Object.fromEntries(results) };
    } catch {
      return { results: {} };
    }
  }

  // ============================================================================
  // Upgrade RPC 处理器
  // ============================================================================

  private async handleUpgradeGetStatus(): Promise<{ version: string }> {
    try {
      const { APP_VERSION } = await import('../index');
      return { version: APP_VERSION };
    } catch {
      return { version: 'unknown' };
    }
  }

  private async handleUpgradeForce(): Promise<{ success: boolean }> {
    try {
      const sw = self as unknown as ServiceWorkerGlobalScope;
      sw.skipWaiting();
      // 广播 SW 已更新
      const { APP_VERSION } = await import('../index');
      this.sendSWUpdated(APP_VERSION);
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  // ============================================================================
  // Cache RPC 处理器
  // ============================================================================

  private async handleCacheDelete(data: { url: string }): Promise<{ success: boolean; error?: string }> {
    try {
      const { deleteCacheByUrl } = await import('../index');
      await deleteCacheByUrl(data.url);
      // 广播缓存删除事件
      this.sendCacheDeleted(data.url);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: String(error) };
    }
  }

  // ============================================================================
  // 事件推送方法（SW 主动推送给客户端）
  // ============================================================================

  /**
   * 广播给所有客户端（fire-and-forget 模式）
   * 使用短超时并忽略所有错误，因为广播不需要确认
   */
  broadcastToAll(event: string, data: Record<string, unknown>): void {
    this.channels.forEach((clientChannel) => {
      // 使用短超时(500ms)并立即忽略响应/错误
      // 这是 fire-and-forget 模式，不需要等待客户端确认
      // 注意：不要等待 Promise，直接触发并忘记
      clientChannel.channel.publish(event, data, { timeout: 500 }).catch(() => {
        // 静默忽略 - 广播不需要确认
      });
    });
  }

  /**
   * 广播给除指定客户端外的所有客户端（fire-and-forget 模式）
   */
  broadcastToOthers(event: string, data: Record<string, unknown>, excludeClientId: string): void {
    this.channels.forEach((clientChannel) => {
      if (clientChannel.clientId !== excludeClientId) {
        clientChannel.channel.publish(event, data, { timeout: 1000 }).catch(() => {
          // 静默忽略错误
        });
      }
    });
  }

  /**
   * 发送给特定客户端（fire-and-forget 模式）
   */
  publishToClient(clientId: string, event: string, data: Record<string, unknown>): void {
    const clientChannel = this.channels.get(clientId);
    if (clientChannel) {
      clientChannel.channel.publish(event, data, { timeout: 1000 }).catch(() => {
        // 静默忽略错误
      });
    }
  }

  // ============================================================================
  // 任务事件发送方法（点对点，通过 taskChannels 映射）
  // ============================================================================

  /**
   * 发送任务事件到发起该任务的客户端
   * 使用 taskChannels 映射实现点对点通讯
   */
  private sendToTaskClient(taskId: string, event: string, data: Record<string, unknown>): void {
    const clientChannel = this.taskChannels.get(taskId);
    if (clientChannel) {
      console.log(`[SWChannelManager] sendToTaskClient point-to-point: ${event}`, { taskId });
      try {
        clientChannel.channel.publish(event, data);
      } catch (error) {
        console.warn(`[SWChannelManager] Failed to send to task client ${taskId}:`, error);
      }
    } else {
      // 如果没有映射（可能是恢复的任务或 SW 重启后），静默广播
      // 这是预期行为，不需要警告
      console.log(`[SWChannelManager] sendToTaskClient fallback to broadcastToAll: ${event}`, { taskId, clientCount: this.channels.size });
      this.broadcastToAll(event, data);
    }
  }

  /**
   * 发送任务创建事件（点对点 + 广播给其他客户端）
   */
  sendTaskCreated(taskId: string, task: SWTask): void {
    // 任务创建事件需要广播给所有客户端，让它们知道有新任务
    this.broadcastToAll(SW_EVENTS.TASK_CREATED, { taskId, task });
  }

  /**
   * 发送任务状态事件（点对点）
   */
  sendTaskStatus(taskId: string, status: TaskStatus, progress?: number, phase?: TaskExecutionPhase): void {
    console.log('[SWChannelManager] sendTaskStatus:', { taskId, status, phase });
    this.sendToTaskClient(taskId, SW_EVENTS.TASK_STATUS, { taskId, status, progress, phase });
  }

  /**
   * 发送任务进度事件（点对点）
   */
  sendTaskProgress(taskId: string, progress: number): void {
    this.sendToTaskClient(taskId, SW_EVENTS.TASK_PROGRESS, { taskId, progress });
  }

  /**
   * 发送任务完成事件（点对点，并清理映射）
   */
  sendTaskCompleted(taskId: string, result: SWTask['result'], remoteId?: string): void {
    this.sendToTaskClient(taskId, SW_EVENTS.TASK_COMPLETED, { taskId, result, remoteId });
    // 任务完成后清理映射
    this.taskChannels.delete(taskId);
  }

  /**
   * 发送任务失败事件（点对点，并清理映射）
   */
  sendTaskFailed(taskId: string, error: SWTask['error']): void {
    this.sendToTaskClient(taskId, SW_EVENTS.TASK_FAILED, { taskId, error });
    // 任务失败后清理映射
    this.taskChannels.delete(taskId);
  }

  /**
   * 发送任务取消事件（点对点，并清理映射）
   */
  sendTaskCancelled(taskId: string): void {
    this.sendToTaskClient(taskId, SW_EVENTS.TASK_CANCELLED, { taskId });
    // 任务取消后清理映射
    this.taskChannels.delete(taskId);
  }

  /**
   * 发送任务删除事件（点对点，并清理映射）
   */
  sendTaskDeleted(taskId: string): void {
    this.sendToTaskClient(taskId, SW_EVENTS.TASK_DELETED, { taskId });
    // 任务删除后清理映射
    this.taskChannels.delete(taskId);
  }

  // ============================================================================
  // Chat 事件发送方法（点对点，通过 chatChannels 映射）
  // ============================================================================

  /**
   * 发送 Chat 事件到发起该聊天的客户端
   * 使用 chatChannels 映射实现点对点通讯
   */
  private sendToChatClient(chatId: string, event: string, data: Record<string, unknown>): void {
    const clientChannel = this.chatChannels.get(chatId);
    if (clientChannel) {
      try {
        clientChannel.channel.publish(event, data);
      } catch (error) {
        console.warn(`[SWChannelManager] Failed to send to chat client ${chatId}:`, error);
      }
    } else {
      // 如果没有映射（可能是恢复的会话或 SW 重启后），静默广播
      this.broadcastToAll(event, data);
    }
  }

  /**
   * 发送 Chat 数据块（点对点）
   */
  sendChatChunk(chatId: string, content: string): void {
    this.sendToChatClient(chatId, SW_EVENTS.CHAT_CHUNK, { chatId, content });
  }

  /**
   * 发送 Chat 完成（点对点，并清理映射）
   */
  sendChatDone(chatId: string, fullContent: string): void {
    this.sendToChatClient(chatId, SW_EVENTS.CHAT_DONE, { chatId, fullContent });
    // 聊天完成后清理映射
    this.chatChannels.delete(chatId);
  }

  /**
   * 发送 Chat 错误（点对点，并清理映射）
   */
  sendChatError(chatId: string, error: string): void {
    this.sendToChatClient(chatId, SW_EVENTS.CHAT_ERROR, { chatId, error });
    // 聊天错误后清理映射
    this.chatChannels.delete(chatId);
  }

  // ============================================================================
  // 其他任务相关事件发送方法
  // ============================================================================

  /**
   * 发送任务被拒绝事件（点对点）
   */
  sendTaskRejected(taskId: string): void {
    this.sendToTaskClient(taskId, SW_EVENTS.TASK_REJECTED, { taskId });
    // 任务被拒绝后清理映射
    this.taskChannels.delete(taskId);
  }

  /**
   * 发送队列初始化完成事件（广播给所有客户端）
   */
  sendQueueInitialized(): void {
    this.broadcastToAll(SW_EVENTS.QUEUE_INITIALIZED, { success: true });
  }

  /**
   * 发送全部任务列表（广播给所有客户端，用于初始化同步状态）
   * 注意：这是初始化时的广播，不是查询响应。查询响应应使用 RPC。
   */
  sendAllTasks(tasks: SWTask[]): void {
    this.broadcastToAll(SW_EVENTS.TASK_ALL_RESPONSE, { tasks });
  }

  // 注意：sendPaginatedTasks 已删除，客户端应使用 RPC 调用 TASK_LIST_PAGINATED

  /**
   * 发送任务已提交事件（点对点）
   */
  sendTaskSubmitted(taskId: string): void {
    this.sendToTaskClient(taskId, SW_EVENTS.TASK_SUBMITTED, { taskId });
  }

  // ============================================================================
  // 工作流事件发送方法（点对点，通过 workflowChannels 映射）
  // ============================================================================

  /**
   * 发送工作流事件到发起该工作流的客户端
   * 使用 workflowChannels 映射实现点对点通讯
   */
  private sendToWorkflowClient(workflowId: string, event: string, data: Record<string, unknown>): void {
    const clientChannel = this.workflowChannels.get(workflowId);
    if (clientChannel) {
      try {
        clientChannel.channel.publish(event, data);
      } catch (error) {
        console.warn(`[SWChannelManager] Failed to send ${event} to workflow ${workflowId}:`, error);
      }
    } else {
      // 工作流可能是从存储恢复的，还没有关联的客户端
      // console.warn(`[SWChannelManager] No channel found for workflow ${workflowId}`);
    }
  }

  /**
   * 发送工作流状态变更（点对点）
   */
  sendWorkflowStatus(workflowId: string, status: string): void {
    this.sendToWorkflowClient(workflowId, SW_EVENTS.WORKFLOW_STATUS, { workflowId, status, updatedAt: Date.now() });
  }

  /**
   * 发送工作流步骤状态（点对点）
   */
  sendWorkflowStepStatus(workflowId: string, stepId: string, status: string, result?: unknown, error?: string, duration?: number): void {
    this.sendToWorkflowClient(workflowId, SW_EVENTS.WORKFLOW_STEP_STATUS, { workflowId, stepId, status, result, error, duration });
  }

  /**
   * 发送工作流完成（点对点）
   */
  sendWorkflowCompleted(workflowId: string, workflow: Workflow): void {
    this.sendToWorkflowClient(workflowId, SW_EVENTS.WORKFLOW_COMPLETED, { workflowId, workflow });
    // 工作流完成后清理映射
    this.workflowChannels.delete(workflowId);
  }

  /**
   * 发送工作流失败（点对点）
   */
  sendWorkflowFailed(workflowId: string, error: string): void {
    this.sendToWorkflowClient(workflowId, SW_EVENTS.WORKFLOW_FAILED, { workflowId, error });
    // 工作流失败后清理映射
    this.workflowChannels.delete(workflowId);
  }

  /**
   * 发送工作流步骤添加（点对点）
   */
  sendWorkflowStepsAdded(workflowId: string, steps: Workflow['steps']): void {
    this.sendToWorkflowClient(workflowId, SW_EVENTS.WORKFLOW_STEPS_ADDED, { workflowId, steps });
  }

  /**
   * 发送主线程工具请求并等待响应（双工通讯）
   * 主线程通过 registerToolRequestHandler 处理请求并直接返回结果
   * 这样可以减少一次交互，不需要再通过 workflow:respondTool 发送结果
   * 
   * @param workflowId 工作流 ID
   * @param requestId 请求 ID
   * @param stepId 步骤 ID
   * @param toolName 工具名称
   * @param args 工具参数
   * @param timeoutMs 超时时间（默认 60 秒，AI 工具可能需要较长时间）
   * @returns 工具执行结果，超时或失败返回 null
   */
  async sendToolRequest(
    workflowId: string,
    requestId: string,
    stepId: string,
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number = 60000
  ): Promise<{
    success: boolean;
    result?: unknown;
    error?: string;
    taskId?: string;
    taskIds?: string[];
    addSteps?: Array<{
      id: string;
      mcp: string;
      args: Record<string, unknown>;
      description: string;
      status: string;
    }>;
  } | null> {
    const clientChannel = this.workflowChannels.get(workflowId) || this.channels.values().next().value as ClientChannel | undefined;
    if (!clientChannel) {
      console.warn('[SWChannelManager] No connected clients for tool request');
      return null;
    }
    
    try {
      console.log('[SWChannelManager] sendToolRequest sending:', { requestId, workflowId, stepId, toolName });
      const response = await Promise.race([
        clientChannel.channel.publish(SW_EVENTS.WORKFLOW_TOOL_REQUEST, {
          requestId,
          workflowId,
          stepId,
          toolName,
          args,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
      ]);
      
      console.log('[SWChannelManager] sendToolRequest response:', { 
        requestId, 
        hasResponse: !!response, 
        responseType: typeof response,
        responseKeys: response && typeof response === 'object' ? Object.keys(response) : [],
        responseRaw: JSON.stringify(response).substring(0, 500),
      });
      
      if (!response || typeof response !== 'object') {
        console.warn('[SWChannelManager] Tool request timeout or invalid response');
        return null;
      }
      
      // postmessage-duplex publish 响应格式可能是:
      // 1. { ret: 0, data: { success: true, ... } } - 标准格式
      // 2. { success: true, ... } - 直接返回数据（某些情况）
      // 3. { ret: 0, msg: ..., data: { ret: 0, data: { success: ... } } } - 嵌套格式
      const rawResponse = response as Record<string, unknown>;
      
      let toolResult: {
        success: boolean;
        result?: unknown;
        error?: string;
        taskId?: string;
        taskIds?: string[];
        addSteps?: Array<{
          id: string;
          mcp: string;
          args: Record<string, unknown>;
          description: string;
          status: string;
        }>;
      } | null = null;
      
      // 尝试解析不同格式
      if ('success' in rawResponse) {
        // 格式 2: 直接返回数据
        toolResult = rawResponse as typeof toolResult;
      } else if (rawResponse.data && typeof rawResponse.data === 'object') {
        const data = rawResponse.data as Record<string, unknown>;
        if ('success' in data) {
          // 格式 1: { ret, data: { success, ... } }
          toolResult = data as typeof toolResult;
        } else if (data.data && typeof data.data === 'object') {
          // 格式 3: 嵌套格式 { ret, data: { ret, data: { success, ... } } }
          const innerData = data.data as Record<string, unknown>;
          if ('success' in innerData) {
            toolResult = innerData as typeof toolResult;
          }
        }
      }
      
      console.log('[SWChannelManager] sendToolRequest parsed result:', { 
        requestId, 
        toolResultFound: !!toolResult,
        success: toolResult?.success,
        error: toolResult?.error,
        taskId: toolResult?.taskId,
      });
      
      return toolResult;
    } catch (error) {
      console.warn('[SWChannelManager] Tool request error:', error);
      return null;
    }
  }

  /**
   * 发送工作流恢复事件到特定客户端
   * @param clientId 客户端 ID（用于恢复场景，此时工作流还没有关联的 channel）
   */
  sendWorkflowRecoveredToClient(clientId: string, workflowId: string, workflow: Workflow): void {
    const clientChannel = this.channels.get(clientId);
    if (clientChannel) {
      // 同时更新 workflowChannels 映射
      if (workflow.status === 'running' || workflow.status === 'pending') {
        this.workflowChannels.set(workflowId, clientChannel);
      }
      try {
        clientChannel.channel.publish(SW_EVENTS.WORKFLOW_RECOVERED, { workflowId, workflow });
      } catch (error) {
        console.warn(`[SWChannelManager] Failed to send workflow recovered to ${clientId}:`, error);
      }
    }
  }

  /**
   * 请求 Canvas 操作（双工通讯，使用工作流关联的 channel）
   */
  async requestCanvasOperation(workflowId: string, operation: string, params: Record<string, unknown>, timeoutMs: number = 30000): Promise<{ success: boolean; error?: string }> {
    const clientChannel = this.workflowChannels.get(workflowId) || this.channels.values().next().value as ClientChannel | undefined;
    if (!clientChannel) {
      console.warn('[SWChannelManager] No connected clients for canvas operation');
      return { success: false, error: 'No connected clients' };
    }
    
    try {
      const response = await Promise.race([
        clientChannel.channel.publish('canvas:execute', { operation, params }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
      ]);
      
      if (!response || typeof response !== 'object') {
        return { success: false, error: 'Canvas operation timeout' };
      }
      
      const result = response as { data?: { success?: boolean; error?: string } };
      return { success: result.data?.success ?? false, error: result.data?.error };
    } catch (error) {
      console.warn('[SWChannelManager] Canvas operation error:', error);
      return { success: false, error: String(error) };
    }
  }

  // ============================================================================
  // 缓存事件发送方法
  // ============================================================================

  /**
   * 发送图片缓存完成事件
   */
  sendCacheImageCached(url: string, size?: number, thumbnailUrl?: string): void {
    this.broadcastToAll(SW_EVENTS.CACHE_IMAGE_CACHED, { url, size, thumbnailUrl });
  }

  /**
   * 发送缓存删除事件
   */
  sendCacheDeleted(url: string): void {
    this.broadcastToAll(SW_EVENTS.CACHE_DELETED, { url });
  }

  /**
   * 发送缓存配额警告事件
   */
  sendCacheQuotaWarning(usage: number, quota: number, percentUsed: number): void {
    this.broadcastToAll(SW_EVENTS.CACHE_QUOTA_WARNING, { usage, quota, percentUsed });
  }

  // ============================================================================
  // SW 状态事件发送方法
  // ============================================================================

  /**
   * 发送新版本就绪事件
   */
  sendSWNewVersionReady(version: string): void {
    this.broadcastToAll(SW_EVENTS.SW_NEW_VERSION_READY, { version });
  }

  /**
   * 发送 SW 激活事件
   */
  sendSWActivated(version: string): void {
    this.broadcastToAll(SW_EVENTS.SW_ACTIVATED, { version });
  }

  /**
   * 发送 SW 更新事件
   */
  sendSWUpdated(version?: string): void {
    this.broadcastToAll(SW_EVENTS.SW_UPDATED, { version });
  }

  /**
   * 发送请求配置事件
   */
  sendSWRequestConfig(reason: string): void {
    this.broadcastToAll(SW_EVENTS.SW_REQUEST_CONFIG, { reason });
  }

  // ============================================================================
  // MCP 事件发送方法
  // ============================================================================

  /**
   * 发送 MCP 工具结果事件
   */
  sendMCPToolResult(clientId: string, requestId: string, result: unknown, error?: string): void {
    this.publishToClient(clientId, SW_EVENTS.MCP_TOOL_RESULT, { requestId, result, error });
  }

  // ============================================================================
  // 调试事件发送方法
  // ============================================================================

  /**
   * 发送调试状态变更事件
   */
  sendDebugStatusChanged(enabled: boolean): void {
    this.broadcastToAll(SW_EVENTS.DEBUG_STATUS_CHANGED, { enabled });
  }

  /**
   * 发送调试日志事件（SW 内部 API 日志）
   */
  sendDebugLog(entry: Record<string, unknown>): void {
    this.broadcastToAll(SW_EVENTS.DEBUG_LOG, { entry });
  }

  /**
   * 发送控制台日志事件
   */
  sendConsoleLog(entry: Record<string, unknown>): void {
    this.broadcastToAll(SW_EVENTS.CONSOLE_LOG, { entry });
  }

  /**
   * 发送 LLM API 日志事件
   */
  sendDebugLLMLog(log: Record<string, unknown>): void {
    this.broadcastToAll(SW_EVENTS.DEBUG_LLM_LOG, { log });
  }

  // PostMessage 日志批量发送缓冲区
  private postMessageLogBuffer: Record<string, unknown>[] = [];
  private postMessageLogTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly POSTMESSAGE_LOG_BATCH_INTERVAL = 500; // 500ms 批量发送间隔

  /**
   * 发送 PostMessage 日志事件（批量发送以避免速率限制）
   */
  sendPostMessageLog(entry: Record<string, unknown>): void {
    // 添加到缓冲区
    this.postMessageLogBuffer.push(entry);
    
    // 如果没有定时器，启动一个
    if (!this.postMessageLogTimer) {
      this.postMessageLogTimer = setTimeout(() => {
        this.flushPostMessageLogs();
      }, this.POSTMESSAGE_LOG_BATCH_INTERVAL);
    }
  }

  /**
   * 刷新 PostMessage 日志缓冲区
   */
  private flushPostMessageLogs(): void {
    this.postMessageLogTimer = null;
    
    if (this.postMessageLogBuffer.length === 0) {
      return;
    }
    
    // 批量发送所有缓冲的日志
    const entries = this.postMessageLogBuffer;
    this.postMessageLogBuffer = [];
    
    this.broadcastToAll(SW_EVENTS.POSTMESSAGE_LOG_BATCH, { entries });
  }

  /**
   * 发送新崩溃快照事件
   */
  sendNewCrashSnapshot(snapshot: Record<string, unknown>): void {
    this.broadcastToAll(SW_EVENTS.DEBUG_NEW_CRASH_SNAPSHOT, { snapshot });
  }

  // ============================================================================
  // 工具方法
  // ============================================================================

  /**
   * 获取连接的客户端列表
   */
  getConnectedClients(): string[] {
    return Array.from(this.channels.keys());
  }

  /**
   * 获取连接的客户端数量
   */
  getConnectedClientCount(): number {
    return this.channels.size;
  }

  /**
   * 清理断开的客户端
   */
  async cleanupDisconnectedClients(): Promise<void> {
    const clients = await this.sw.clients.matchAll({ type: 'window' });
    const activeClientIds = new Set(clients.map(c => c.id));

    for (const [clientId] of this.channels) {
      if (!activeClientIds.has(clientId)) {
        this.channels.delete(clientId);
      }
    }
  }
}

// 导出单例获取函数
let channelManagerInstance: SWChannelManager | null = null;

export function initChannelManager(sw: ServiceWorkerGlobalScope): SWChannelManager {
  if (!channelManagerInstance) {
    channelManagerInstance = SWChannelManager.getInstance(sw);
  }
  return channelManagerInstance;
}

export function getChannelManager(): SWChannelManager | null {
  return channelManagerInstance;
}
