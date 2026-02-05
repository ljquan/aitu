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
import { taskQueueStorage, type StoredPendingToolRequest } from './storage';
import {
  isPostMessageLoggerDebugMode,
  logReceivedMessage,
  updateRequestWithResponse,
  getAllLogs as getAllPostMessageLogs,
} from './postmessage-logger';
import { withTimeout } from './utils/timeout-utils';

// 从 channel-manager 模块导入常量
export { RPC_METHODS, SW_EVENTS } from './channel-manager/constants';
import { RPC_METHODS, SW_EVENTS } from './channel-manager/constants';

// ============================================================================
// 类型定义
// ============================================================================

interface ClientChannel {
  channel: ServiceWorkerChannel;
  clientId: string;
  createdAt: number;
  isDebugClient: boolean;  // 是否是调试页面客户端
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

// Executor types (媒体执行器 - SW 可选降级方案)
interface ExecutorExecuteParams {
  taskId: string;
  type: 'image' | 'video' | 'ai_analyze';
  params: Record<string, unknown>;
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

  // 调试客户端状态变化回调
  private onDebugClientCountChanged: ((count: number) => void) | null = null;

  private constructor(sw: ServiceWorkerGlobalScope) {
    this.sw = sw;
    
    // SW 启动时立即清理所有旧通道（SW 重启后旧通道都无效）
    this.channels.clear();
    
    // 启用 postmessage-duplex 的全局路由
    // 当收到来自未知客户端的消息时，自动创建 channel 并处理消息
    ServiceWorkerChannel.enableGlobalRouting((clientId, event) => {
      // 创建 channel
      this.ensureChannel(clientId);
      // 使用 postmessage-duplex 的 handleMessage 处理当前消息
      const channel = this.channels.get(clientId)?.channel;
      if (channel) {
        channel.handleMessage(event as MessageEvent);
      }
    });
    
    // 定期清理断开的客户端（每 60 秒）
    setInterval(() => {
      this.cleanupDisconnectedClients().catch(() => {});
    }, 60000);
  }

  /**
   * 设置调试客户端数量变化回调
   * 用于自动启用/禁用调试模式
   */
  setDebugClientCountChangedCallback(callback: (count: number) => void): void {
    this.onDebugClientCountChanged = callback;
  }

  /**
   * 获取当前调试客户端数量
   */
  getDebugClientCount(): number {
    let count = 0;
    for (const client of this.channels.values()) {
      if (client.isDebugClient) {
        count++;
      }
    }
    return count;
  }

  /**
   * 检测客户端是否是调试页面
   */
  private async isDebugClient(clientId: string): Promise<boolean> {
    try {
      const client = await this.sw.clients.get(clientId);
      if (client && client.url) {
        return client.url.includes('sw-debug');
      }
    } catch {
      // 静默忽略错误
    }
    return false;
  }

  /**
   * 更新调试客户端状态并触发回调
   */
  private notifyDebugClientCountChanged(): void {
    if (this.onDebugClientCountChanged) {
      const count = this.getDebugClientCount();
      this.onDebugClientCountChanged(count);
    }
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
      // RPC 调用的日志通过 wrapRpcHandler 记录到 postmessage-logger
      // 使用较长的超时时间（120秒）以支持慢速 IndexedDB 操作
      const channel = ServiceWorkerChannel.createFromWorker(clientId, {
        timeout: 120000,
        subscribeMap: this.createSubscribeMap(clientId),
        log: { log: () => {}, warn: () => {}, error: () => {} },
      });
      
      clientChannel = {
        channel,
        clientId,
        createdAt: Date.now(),
        isDebugClient: false,  // 初始设为 false，异步检测后更新
      };
      
      this.channels.set(clientId, clientChannel);
      
      // 异步检测是否是调试客户端
      this.checkAndUpdateDebugClient(clientId);
    }
    
    return clientChannel.channel;
  }

  /**
   * 异步检测并更新调试客户端状态
   */
  private async checkAndUpdateDebugClient(clientId: string): Promise<void> {
    const isDebug = await this.isDebugClient(clientId);
    const clientChannel = this.channels.get(clientId);
    if (clientChannel && isDebug) {
      clientChannel.isDebugClient = true;
      this.notifyDebugClientCountChanged();
    }
  }

  /**
   * Check if a client has an active channel
   * Used to determine if main thread tools can be executed
   */
  hasClientChannel(clientId: string): boolean {
    return this.channels.has(clientId);
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

  /**
   * 广播 PostMessage 日志到调试面板
   */
  private broadcastPostMessageLog(logId: string): void {
    if (!logId) return;
    
    const logs = getAllPostMessageLogs();
    const entry = logs.find((l) => l.id === logId);
    if (entry) {
      this.sendPostMessageLog(entry as unknown as Record<string, unknown>);
    }
  }

  /**
   * 检查客户端是否是调试面板
   */
  private isDebugClientById(clientId: string): boolean {
    const clientChannel = this.channels.get(clientId);
    return clientChannel?.isDebugClient ?? false;
  }

  /**
   * 包装 RPC 处理器，添加日志记录
   * 将 postmessage-duplex 的 RPC 调用记录到 postmessage-logger
   */
  private wrapRpcHandler<T, R>(
    methodName: string,
    clientId: string,
    handler: (data: T) => Promise<R> | R
  ): (rawData: any) => Promise<R> {
    return async (rawData: any) => {
      const data = this.unwrapRpcData<T>(rawData);
      const startTime = Date.now();
      const requestId = rawData?.requestId;
      
      // 跳过调试面板客户端的日志记录
      const shouldLog = isPostMessageLoggerDebugMode() && !this.isDebugClientById(clientId);
      
      // 记录收到的 RPC 请求并广播
      if (shouldLog) {
        const logId = logReceivedMessage(
          `RPC:${methodName}`,
          { params: data, requestId },
          clientId
        );
        this.broadcastPostMessageLog(logId);
      }
      
      try {
        const result = await handler(data);
        
        // 验证结果可以序列化（捕获序列化错误）
        try {
          JSON.stringify(result);
        } catch (serializeError) {
          console.error(`[SW wrapRpcHandler] ${methodName} result serialization failed:`, serializeError);
          throw new Error(`Result serialization failed: ${serializeError}`);
        }
        
        // 更新请求日志的响应数据（不创建新的日志条目）
        if (shouldLog && requestId) {
          const logId = updateRequestWithResponse(
            requestId,
            { result },
            Date.now() - startTime
          );
          // 广播更新后的请求日志
          if (logId) {
            this.broadcastPostMessageLog(logId);
          }
        }
        
        return result;
      } catch (error) {
        console.error(`[SW wrapRpcHandler] ${methodName} error:`, error);
        // 更新请求日志的错误信息
        if (shouldLog && requestId) {
          const logId = updateRequestWithResponse(
            requestId,
            null,
            Date.now() - startTime,
            String(error)
          );
          // 广播更新后的请求日志
          if (logId) {
            this.broadcastPostMessageLog(logId);
          }
        }
        throw error;
      }
    };
  }

  private createSubscribeMap(clientId: string): Record<string, (data: any) => any> {
    return {
      // 初始化
      [RPC_METHODS.INIT]: this.wrapRpcHandler<{ geminiConfig: GeminiConfig; videoConfig: VideoAPIConfig }, any>(
        RPC_METHODS.INIT, clientId, (data) => this.handleInit(data)
      ),
      
      [RPC_METHODS.UPDATE_CONFIG]: this.wrapRpcHandler<Partial<{ geminiConfig: Partial<GeminiConfig>; videoConfig: Partial<VideoAPIConfig> }>, any>(
        RPC_METHODS.UPDATE_CONFIG, clientId, (data) => this.handleUpdateConfig(data)
      ),
      
      // 任务操作
      [RPC_METHODS.TASK_CREATE]: this.wrapRpcHandler<TaskCreateParams, any>(
        RPC_METHODS.TASK_CREATE, clientId, (data) => this.handleTaskCreate(clientId, data)
      ),
      
      [RPC_METHODS.TASK_CANCEL]: this.wrapRpcHandler<{ taskId: string }, any>(
        RPC_METHODS.TASK_CANCEL, clientId, (data) => this.handleTaskCancel(data.taskId)
      ),
      
      [RPC_METHODS.TASK_RETRY]: this.wrapRpcHandler<{ taskId: string }, any>(
        RPC_METHODS.TASK_RETRY, clientId, (data) => this.handleTaskRetry(data.taskId)
      ),
      
      [RPC_METHODS.TASK_DELETE]: this.wrapRpcHandler<{ taskId: string }, any>(
        RPC_METHODS.TASK_DELETE, clientId, (data) => this.handleTaskDelete(data.taskId)
      ),
      
      [RPC_METHODS.TASK_MARK_INSERTED]: this.wrapRpcHandler<{ taskId: string }, any>(
        RPC_METHODS.TASK_MARK_INSERTED, clientId, (data) => this.handleTaskMarkInserted(data.taskId)
      ),
      
      [RPC_METHODS.TASK_IMPORT]: this.wrapRpcHandler<{ tasks: SWTask[] }, any>(
        RPC_METHODS.TASK_IMPORT, clientId, (data) => this.handleTaskImport(data.tasks)
      ),
      
      // 任务查询
      [RPC_METHODS.TASK_GET]: this.wrapRpcHandler<{ taskId: string }, any>(
        RPC_METHODS.TASK_GET, clientId, (data) => this.handleTaskGet(data.taskId)
      ),
      
      // Note: TASK_LIST_PAGINATED 已移除，主线程直接从 IndexedDB 读取任务数据
      // 这避免了 postMessage 的 1MB 大小限制问题
      
      // Chat
      [RPC_METHODS.CHAT_START]: this.wrapRpcHandler<ChatStartParams, any>(
        RPC_METHODS.CHAT_START, clientId, (data) => this.handleChatStart(clientId, data)
      ),
      
      [RPC_METHODS.CHAT_STOP]: this.wrapRpcHandler<{ chatId: string }, any>(
        RPC_METHODS.CHAT_STOP, clientId, (data) => this.handleChatStop(data.chatId)
      ),
      
      [RPC_METHODS.CHAT_GET_CACHED]: this.wrapRpcHandler<{ chatId: string }, any>(
        RPC_METHODS.CHAT_GET_CACHED, clientId, (data) => this.handleChatGetCached(data.chatId)
      ),
      
      // Workflow
      [RPC_METHODS.WORKFLOW_SUBMIT]: this.wrapRpcHandler<{ workflow: Workflow }, any>(
        RPC_METHODS.WORKFLOW_SUBMIT, clientId, (data) => this.handleWorkflowSubmit(clientId, data)
      ),
      
      [RPC_METHODS.WORKFLOW_CANCEL]: this.wrapRpcHandler<{ workflowId: string }, any>(
        RPC_METHODS.WORKFLOW_CANCEL, clientId, (data) => this.handleWorkflowCancel(data.workflowId)
      ),
      
      // Note: WORKFLOW_GET_STATUS 和 WORKFLOW_GET_ALL 已移除
      // 主线程现在直接从 IndexedDB 读取工作流数据
      
      // 客户端声明接管工作流（用于页面刷新后恢复）
      [RPC_METHODS.WORKFLOW_CLAIM]: this.wrapRpcHandler<{ workflowId: string }, any>(
        RPC_METHODS.WORKFLOW_CLAIM, clientId, (data) => this.handleWorkflowClaim(clientId, data.workflowId)
      ),
      
      // Thumbnail (图片缩略图，由 SW 生成)
      [RPC_METHODS.THUMBNAIL_GENERATE]: this.wrapRpcHandler<ThumbnailGenerateParams, any>(
        RPC_METHODS.THUMBNAIL_GENERATE, clientId, (data) => this.handleThumbnailGenerate(data)
      ),
      
      // Crash monitoring (不记录日志，避免死循环)
      [RPC_METHODS.CRASH_SNAPSHOT]: async (rawData: any) => {
        const data = this.unwrapRpcData<CrashSnapshotParams>(rawData);
        return this.handleCrashSnapshot(data);
      },
      
      [RPC_METHODS.CRASH_HEARTBEAT]: async (rawData: any) => {
        const data = this.unwrapRpcData<HeartbeatParams>(rawData);
        return this.handleHeartbeat(data);
      },
      
      // Console (不记录日志，避免死循环)
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
      [RPC_METHODS.DEBUG_GET_LLM_API_LOGS]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ page?: number; pageSize?: number; taskType?: string; status?: string }>(rawData);
        return this.handleDebugGetLLMApiLogs(data);
      },
      [RPC_METHODS.DEBUG_GET_LLM_API_LOG_BY_ID]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ logId: string }>(rawData);
        return this.handleDebugGetLLMApiLogById(data?.logId);
      },
      [RPC_METHODS.DEBUG_CLEAR_LLM_API_LOGS]: async () => {
        return this.handleDebugClearLLMApiLogs();
      },
      [RPC_METHODS.DEBUG_DELETE_LLM_API_LOGS]: async (rawData: any) => {
        const data = this.unwrapRpcData<{ logIds: string[] }>(rawData);
        return this.handleDebugDeleteLLMApiLogs(data);
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

      // Executor (媒体执行器 - SW 可选降级方案)
      [RPC_METHODS.PING]: async () => {
        return this.handlePing();
      },
      [RPC_METHODS.EXECUTOR_EXECUTE]: this.wrapRpcHandler<ExecutorExecuteParams, any>(
        RPC_METHODS.EXECUTOR_EXECUTE, clientId, (data) => this.handleExecutorExecute(clientId, data)
      ),
    };
  }

  // ============================================================================
  // RPC 处理器（直接返回响应值）
  // ============================================================================

  private workflowHandlerInitialized = false;

  private async handleInit(data: { geminiConfig: GeminiConfig; videoConfig: VideoAPIConfig }): Promise<{ success: boolean; error?: string }> {
    console.log('[SWChannelManager] handleInit called with:', {
      hasGeminiConfig: !!data?.geminiConfig,
      hasVideoConfig: !!data?.videoConfig,
      geminiApiKey: data?.geminiConfig?.apiKey ? `${data.geminiConfig.apiKey.slice(0, 8)}...` : 'missing',
      geminiBaseUrl: data?.geminiConfig?.baseUrl || 'missing',
      videoBaseUrl: data?.videoConfig?.baseUrl || 'missing',
    });
    
    if (!data || !data.geminiConfig || !data.videoConfig) {
      console.error('[SWChannelManager] handleInit: Missing config data');
      return { success: false, error: 'Missing config data' };
    }

    try {
      // 先清理无效的客户端通道（避免向已关闭的页面广播）
      await this.cleanupDisconnectedClients();
      
      // 初始化任务队列
      console.log('[SWChannelManager] handleInit: Calling taskQueue.initialize...');
      await this.taskQueue?.initialize(data.geminiConfig, data.videoConfig);
      console.log('[SWChannelManager] handleInit: taskQueue.initialize completed');
      
      // 初始化工作流处理器
      // 注意：不能只依赖 workflowHandlerInitialized 标志，因为 SW 空闲后模块级变量可能被重置
      // 检查 workflowExecutor 是否存在，如果不存在则重新初始化
      const executor = getWorkflowExecutor();
      if (!executor) {
        initWorkflowHandler(this.sw, data.geminiConfig, data.videoConfig);
        this.workflowHandlerInitialized = true;
      }
      
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
    if (!data) {
      return { success: false, reason: 'Missing task data' };
    }

    const { taskId, taskType, params } = data;

    // 检查任务队列是否存在并已初始化
    if (!this.taskQueue) {
      return { success: false, reason: 'not_initialized' };
    }

    // 检查任务队列是否已初始化（有 API config）
    if (!this.taskQueue.getGeminiConfig() || !this.taskQueue.getVideoConfig()) {
      return { success: false, reason: 'not_initialized' };
    }

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
      await this.taskQueue.submitTask(taskId, taskType, params, clientId);
      const task = this.taskQueue.getTask(taskId);

      // 记录 taskId -> channel 映射，用于后续点对点通讯
      const clientChannel = this.channels.get(clientId);
      if (clientChannel) {
        this.taskChannels.set(taskId, clientChannel);
      }

      // 只广播给其他客户端（不包括创建者），避免重复
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

  /**
   * 导入任务（用于云同步恢复已完成的任务）
   * 与 restoreTasks 不同，这个方法会保存所有任务（包括已完成的）
   */
  private async handleTaskImport(tasks: SWTask[]): Promise<{ success: boolean; imported: number; error?: string }> {
    if (!tasks || !Array.isArray(tasks)) {
      return { success: false, imported: 0, error: 'Invalid tasks array' };
    }

    if (!this.taskQueue) {
      return { success: false, imported: 0, error: 'Task queue not initialized' };
    }

    try {
      let imported = 0;
      for (const task of tasks) {
        // 检查任务是否已存在
        const existingTask = this.taskQueue.getTask(task.id);
        if (!existingTask) {
          // 直接保存到存储（不触发队列处理）
          await taskQueueStorage.saveTask(task);
          // 添加到内存中的任务列表
          this.taskQueue.importTask(task);
          imported++;
        }
      }
      
      return { success: true, imported };
    } catch (error) {
      console.error('[SWChannelManager] Failed to import tasks:', error);
      return { 
        success: false, 
        imported: 0, 
        error: error instanceof Error ? error.message : 'Import failed' 
      };
    }
  }

  private async handleTaskGet(taskId: string): Promise<{ success: boolean; task?: SWTask; error?: string }> {
    if (!taskId) {
      return { success: false, error: 'Missing taskId' };
    }

    // 确保存储恢复完成后再获取任务
    await this.taskQueue?.waitForStorageRestore();

    const task = this.taskQueue?.getTask(taskId);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    return { success: true, task };
  }

  // Note: handleTaskListPaginated 已移除
  // 主线程现在直接从 IndexedDB 读取任务数据，避免 postMessage 的 1MB 大小限制问题

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

  // Note: handleWorkflowGetStatus 和 handleWorkflowGetAll 已移除
  // 主线程现在直接从 IndexedDB 读取工作流数据

  /**
   * 客户端声明接管工作流
   * 用于页面刷新后，WorkZone 重新建立与工作流的连接
   * 
   * @param clientId 客户端 ID
   * @param workflowId 工作流 ID
   * @returns 工作流状态和是否有待处理的工具请求
   */
  private async handleWorkflowClaim(clientId: string, workflowId: string): Promise<{
    success: boolean;
    workflow?: Workflow;
    hasPendingToolRequest?: boolean;
    error?: string;
  }> {
    if (!workflowId) {
      return { success: false, error: 'Missing workflowId' };
    }

    try {
      // 尝试从 executor 获取工作流
      let workflow: Workflow | null = null;
      const executor = getWorkflowExecutor();
      
      if (executor) {
        workflow = executor.getWorkflow(workflowId) || null;
      }
      
      // 如果 executor 不存在或找不到工作流，直接从 IndexedDB 查询
      // 这处理了 init RPC 还没完成的情况
      if (!workflow) {
        workflow = await taskQueueStorage.getWorkflow(workflowId);
      }
      
      if (!workflow) {
        return { success: false, error: 'Workflow not found' };
      }

      // 建立 workflowId -> ClientChannel 映射
      const clientChannel = this.channels.get(clientId);
      if (clientChannel) {
        this.workflowChannels.set(workflowId, clientChannel);
      }

      // 检查是否有待处理的主线程工具请求
      const pendingRequests = await taskQueueStorage.getAllPendingToolRequests();
      const workflowPendingRequests = pendingRequests.filter(
        (r: StoredPendingToolRequest) => r.workflowId === workflowId
      );
      const hasPendingToolRequest = workflowPendingRequests.length > 0;

      // 如果工作流处于活跃状态且有待处理请求，重新发送
      // 注意：如果 executor 还不存在（init 未完成），这里不会重新发送
      // 待处理的请求会在 init 完成后通过 resendPendingToolRequests() 发送
      if ((workflow.status === 'running' || workflow.status === 'pending') && hasPendingToolRequest) {
        // 延迟重新发送待处理的工具请求，给主线程时间注册处理器
        // 这避免了时序问题：claim 完成后主线程的 registerToolRequestHandler 可能还没准备好
        setTimeout(() => {
          this.resendPendingToolRequestsForWorkflow(workflowId);
        }, 500);
      }

      return {
        success: true,
        workflow,
        hasPendingToolRequest,
      };
    } catch (error: any) {
      console.error('[SWChannelManager] ❌ Workflow claim failed:', error);
      return { success: false, error: error.message || 'Claim failed' };
    }
  }

  /**
   * 重新发送指定工作流的待处理工具请求
   */
  private async resendPendingToolRequestsForWorkflow(workflowId: string): Promise<void> {
    const executor = getWorkflowExecutor();
    if (!executor) return;

    // 调用 executor 的重新发送方法
    executor.resendPendingToolRequestsForWorkflow(workflowId);
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
      return null;
    }
    
    try {
      // 使用 withTimeout 工具控制超时
      const response = await withTimeout(
        clientChannel.channel.publish('thumbnail:generate', { url }),
        timeoutMs,
        null
      );
      
      if (!response || typeof response !== 'object') {
        return null;
      }
      
      const result = response as { data?: { thumbnailUrl?: string; error?: string } };
      if (result.data?.error) {
        return null;
      }
      
      return result.data?.thumbnailUrl || null;
    } catch {
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

  /**
   * 将单个日志参数序列化为字符串，避免对象显示为 [object Object]
   */
  private serializeLogArg(arg: unknown): string {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }

  private async handleConsoleReport(data: ConsoleReportParams): Promise<{ success: boolean; error?: string }> {
    try {
      const { addConsoleLog } = await import('../index');
      const logArgs = data.logArgs ?? [];
      const parts = Array.isArray(logArgs) ? logArgs.map((a) => this.serializeLogArg(a)) : [this.serializeLogArg(logArgs)];
      const logMessage = parts.join(' ');
      addConsoleLog({
        logLevel: data.logLevel as 'log' | 'info' | 'warn' | 'error' | 'debug',
        logMessage: logMessage || '-',
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
      // 返回完整状态，同时提供 enabled 别名以兼容 DebugStatusResult 类型
      return { ...status, enabled: status.debugModeEnabled, cacheStats };
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

  private async handleDebugGetLLMApiLogs(params?: { page?: number; pageSize?: number; taskType?: string; status?: string }): Promise<{ 
    logs: unknown[]; 
    total: number; 
    page: number;
    pageSize: number;
    totalPages: number;
    error?: string 
  }> {
    try {
      // Ensure page and pageSize are numbers (postmessage-duplex may pass objects)
      const page = typeof params?.page === 'number' ? params.page : (Number(params?.page) || 1);
      const pageSize = typeof params?.pageSize === 'number' ? params.pageSize : (Number(params?.pageSize) || 20);
      const filter = {
        taskType: typeof params?.taskType === 'string' ? params.taskType : undefined,
        status: typeof params?.status === 'string' ? params.status : undefined,
      };
      
      const { getLLMApiLogsPaginated } = await import('./llm-api-logger');
      const result = await getLLMApiLogsPaginated(page, pageSize, filter);
      return result;
    } catch (error: any) {
      console.error('[SWChannelManager] handleDebugGetLLMApiLogs error:', error);
      return { logs: [], total: 0, page: 1, pageSize: 20, totalPages: 0, error: String(error) };
    }
  }

  private async handleDebugGetLLMApiLogById(logId?: string): Promise<{ log: unknown | null; error?: string }> {
    try {
      if (!logId) {
        return { log: null, error: 'Missing logId' };
      }
      const { getLLMApiLogById } = await import('./llm-api-logger');
      const log = await getLLMApiLogById(logId);
      return { log };
    } catch (error: any) {
      console.error('[SWChannelManager] handleDebugGetLLMApiLogById error:', error);
      return { log: null, error: String(error) };
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

  private async handleDebugDeleteLLMApiLogs(params?: { logIds: string[] }): Promise<{ success: boolean; deletedCount: number }> {
    try {
      if (!params?.logIds || params.logIds.length === 0) {
        return { success: false, deletedCount: 0 };
      }
      const { deleteLLMApiLogs } = await import('./llm-api-logger');
      const deletedCount = await deleteLLMApiLogs(params.logIds);
      return { success: true, deletedCount };
    } catch {
      return { success: false, deletedCount: 0 };
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
  // Executor 处理器（媒体执行器 - SW 可选降级方案）
  // ============================================================================

  /**
   * 健康检查 - 用于检测 SW 是否可用
   */
  private async handlePing(): Promise<{ success: boolean }> {
    return { success: true };
  }

  /**
   * 执行媒体生成任务
   *
   * 接收执行请求后立即返回，任务在后台执行。
   * 结果直接写入 IndexedDB 的 tasks 表。
   */
  private async handleExecutorExecute(
    clientId: string,
    data: ExecutorExecuteParams
  ): Promise<{ success: boolean; error?: string }> {
    if (!data || !data.taskId || !data.type) {
      return { success: false, error: 'Missing required parameters' };
    }

    const { taskId, type, params } = data;

    try {
      // 异步执行任务（fire-and-forget）
      // 不等待任务完成，立即返回
      this.executeMediaTask(clientId, taskId, type, params).catch((error) => {
        console.error(`[SWChannelManager] Executor task ${taskId} failed:`, error);
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Executor failed' };
    }
  }

  /**
   * 执行媒体生成任务（内部方法）
   * 使用统一的媒体执行器
   */
  private async executeMediaTask(
    clientId: string,
    taskId: string,
    type: 'image' | 'video' | 'ai_analyze',
    params: Record<string, unknown>
  ): Promise<void> {
    const { executeMediaTask: executeMedia } = await import('./media-executor');

    // 绑定任务到客户端
    this.taskChannels.set(taskId, this.channels.get(clientId)!);

    try {
      const config = await this.getToolConfig(taskId);

      // 更新任务状态为 processing
      await this.updateTaskStatus(taskId, TaskStatus.PROCESSING);

      // 使用统一执行器执行任务
      const result = await executeMedia(type, params, config);

      if (result.success) {
        await this.completeTask(taskId, result.data);
      } else {
        await this.failTask(taskId, result.error || `${type} task failed`);
      }
    } catch (error: any) {
      await this.failTask(taskId, error.message || `${type} task error`);
    } finally {
      // 清理任务通道映射
      this.taskChannels.delete(taskId);
    }
  }

  /**
   * 获取工具执行配置
   */
  private async getToolConfig(taskId: string): Promise<{
    geminiConfig: GeminiConfig;
    videoConfig: VideoAPIConfig;
    onProgress: (progress: number, phase?: string) => void;
    onRemoteId?: (remoteId: string) => void;
    signal?: AbortSignal;
  }> {
    const geminiConfig = await taskQueueStorage.getConfig<GeminiConfig>('gemini');
    const videoConfig = await taskQueueStorage.getConfig<VideoAPIConfig>('video');

    if (!geminiConfig || !videoConfig) {
      throw new Error('Missing API configuration');
    }

    return {
      geminiConfig,
      videoConfig,
      onProgress: (progress: number, phase?: string) => {
        this.updateTaskProgress(taskId, progress, phase);
      },
      onRemoteId: (remoteId: string) => {
        this.updateTaskRemoteId(taskId, remoteId);
      },
    };
  }

  /**
   * 更新任务状态
   */
  private async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    const task = await taskQueueStorage.getTask(taskId);
    if (task) {
      task.status = status;
      task.updatedAt = Date.now();
      if (status === TaskStatus.PROCESSING && !task.startedAt) {
        task.startedAt = Date.now();
      }
      await taskQueueStorage.saveTask(task);
      this.sendTaskStatus(taskId, status);
    }
  }

  /**
   * 更新任务进度
   */
  private updateTaskProgress(taskId: string, progress: number, phase?: string): void {
    // 异步更新，不阻塞
    taskQueueStorage.getTask(taskId).then((task) => {
      if (task) {
        task.progress = progress;
        task.updatedAt = Date.now();
        if (phase) {
          task.executionPhase = phase as TaskExecutionPhase;
        }
        taskQueueStorage.saveTask(task);
        this.sendTaskProgress(taskId, progress);
      }
    });
  }

  /**
   * 更新任务远程 ID
   */
  private updateTaskRemoteId(taskId: string, remoteId: string): void {
    taskQueueStorage.getTask(taskId).then((task) => {
      if (task) {
        task.remoteId = remoteId;
        task.updatedAt = Date.now();
        taskQueueStorage.saveTask(task);
      }
    });
  }

  /**
   * 完成任务
   */
  private async completeTask(taskId: string, result: unknown): Promise<void> {
    const task = await taskQueueStorage.getTask(taskId);
    if (task) {
      task.status = TaskStatus.COMPLETED;
      task.result = result as any;
      task.completedAt = Date.now();
      task.updatedAt = Date.now();
      task.progress = 100;
      await taskQueueStorage.saveTask(task);
      this.sendTaskCompleted(taskId, task.result, task.remoteId);
    }
  }

  /**
   * 任务失败
   */
  private async failTask(taskId: string, errorMessage: string): Promise<void> {
    const task = await taskQueueStorage.getTask(taskId);
    if (task) {
      task.status = TaskStatus.FAILED;
      task.error = { code: 'EXECUTOR_ERROR', message: errorMessage };
      task.updatedAt = Date.now();
      await taskQueueStorage.saveTask(task);
      this.sendTaskFailed(taskId, task.error);
    }
  }

  // ============================================================================
  // 事件推送方法（SW 主动推送给客户端）
  // ============================================================================

  /**
   * 广播给所有客户端（fire-and-forget 模式）
   * 使用 postmessage-duplex 的 broadcast() 方法，不等待响应
   */
  broadcastToAll(event: string, data: Record<string, unknown>): void {
    // 注意：不能在这里使用 console.log，会导致死循环（console 日志被捕获并广播）
    this.channels.forEach((clientChannel) => {
      // 使用 broadcast() 进行单向消息发送，不等待响应
      clientChannel.channel.broadcast(event, data);
    });
  }

  /**
   * 广播给除指定客户端外的所有客户端（fire-and-forget 模式）
   */
  broadcastToOthers(event: string, data: Record<string, unknown>, excludeClientId: string): void {
    this.channels.forEach((clientChannel) => {
      if (clientChannel.clientId !== excludeClientId) {
        clientChannel.channel.broadcast(event, data);
      }
    });
  }

  /**
   * 发送给特定客户端（fire-and-forget 模式）
   */
  publishToClient(clientId: string, event: string, data: Record<string, unknown>): void {
    const clientChannel = this.channels.get(clientId);
    if (clientChannel) {
      clientChannel.channel.broadcast(event, data);
    }
  }

  /**
   * 通用点对点发送方法
   * 从映射中查找客户端并发送消息，未找到时可选择静默广播
   *
   * @param map - ID 到 ClientChannel 的映射
   * @param id - 业务 ID（taskId/chatId/workflowId）
   * @param event - 事件名称
   * @param data - 事件数据
   * @param fallbackBroadcast - 未找到映射时是否广播给所有客户端
   */
  private sendToMappedClient(
    map: Map<string, ClientChannel>,
    id: string,
    event: string,
    data: Record<string, unknown>,
    fallbackBroadcast: boolean = false
  ): void {
    const clientChannel = map.get(id);
    if (clientChannel) {
      clientChannel.channel.broadcast(event, data);
    } else if (fallbackBroadcast) {
      this.broadcastToAll(event, data);
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
    // 使用通用方法，任务事件在未找到映射时静默广播
    this.sendToMappedClient(this.taskChannels, taskId, event, data, true);
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
    // 使用通用方法，Chat 事件在未找到映射时静默广播
    this.sendToMappedClient(this.chatChannels, chatId, event, data, true);
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
    // 使用通用方法，工作流事件在未找到映射时广播给所有客户端
    // 这确保即使客户端重连后映射丢失，消息仍能送达
    this.sendToMappedClient(this.workflowChannels, workflowId, event, data, true);
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
    // 优先使用工作流关联的 channel
    let clientChannel = this.workflowChannels.get(workflowId);
    
    // 如果没有映射，查找第一个非调试客户端
    if (!clientChannel) {
      for (const [, channel] of this.channels) {
        if (!channel.isDebugClient) {
          clientChannel = channel;
          // 更新映射以便后续请求使用
          this.workflowChannels.set(workflowId, channel);
          break;
        }
      }
    }
    
    if (!clientChannel) {
      return null;
    }
    
    try {
      
      // 使用 withTimeout 工具控制超时
      const response = await withTimeout(
        clientChannel.channel.publish(SW_EVENTS.WORKFLOW_TOOL_REQUEST, {
          requestId,
          workflowId,
          stepId,
          toolName,
          args,
        }),
        timeoutMs,
        null
      );
      
      if (!response || typeof response !== 'object') {
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
      
      return toolResult;
    } catch {
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
      // 使用 broadcast() 进行单向消息发送
      clientChannel.channel.broadcast(SW_EVENTS.WORKFLOW_RECOVERED, { workflowId, workflow });
    }
  }

  /**
   * 请求 Canvas 操作（双工通讯，使用工作流关联的 channel）
   */
  async requestCanvasOperation(workflowId: string, operation: string, params: Record<string, unknown>, timeoutMs: number = 30000): Promise<{ success: boolean; error?: string }> {
    // 优先使用工作流关联的 channel
    let clientChannel = this.workflowChannels.get(workflowId);
    
    // 如果没有映射，查找第一个非调试客户端
    if (!clientChannel) {
      for (const [, channel] of this.channels) {
        if (!channel.isDebugClient) {
          clientChannel = channel;
          break;
        }
      }
    }
    
    if (!clientChannel) {
      return { success: false, error: 'No connected clients' };
    }
    
    try {
      // 使用 withTimeout 工具控制超时
      const response = await withTimeout(
        clientChannel.channel.publish('canvas:execute', { operation, params }),
        timeoutMs,
        null
      );
      
      if (!response || typeof response !== 'object') {
        return { success: false, error: 'Canvas operation timeout' };
      }
      
      const result = response as { data?: { success?: boolean; error?: string } };
      return { success: result.data?.success ?? false, error: result.data?.error };
    } catch (error) {
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

    let debugClientRemoved = false;
    for (const [clientId, clientChannel] of this.channels) {
      if (!activeClientIds.has(clientId)) {
        if (clientChannel.isDebugClient) {
          debugClientRemoved = true;
        }
        this.channels.delete(clientId);
      }
    }

    // 如果有调试客户端被移除，通知状态变化
    if (debugClientRemoved) {
      this.notifyDebugClientCountChanged();
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
