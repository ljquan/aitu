/**
 * Duplex Communication Server
 * 
 * Service Worker 端双工通讯服务器，处理来自主线程的请求和推送消息
 */

import {
  DuplexMessage,
  RequestMessage,
  ResponseMessage,
  PushMessage,
  MessageMode,
  MessageHandler,
  DuplexConfig,
  DEFAULT_DUPLEX_CONFIG,
  MessageStats,
  PerformanceMetrics,
} from './types';
import {
  createResponseMessage,
  createPushMessage,
  validateDuplexMessage,
  serializeMessage,
  deserializeMessage,
  MESSAGE_TYPES,
  ERROR_CODES,
  createErrorInfo,
} from './protocol';
import { MessageRouter, createLoggingMiddleware, createValidationMiddleware } from '../utils/message-router';
import { validateDuplexMessage as validate, sanitizeMessage } from '../utils/validator';

// ============================================================================
// 客户端连接管理
// ============================================================================

interface ClientConnection {
  /** 客户端ID */
  id: string;
  
  /** 客户端对象 */
  client: Client;
  
  /** 连接时间 */
  connectedAt: number;
  
  /** 最后活跃时间 */
  lastActiveAt: number;
  
  /** 是否启用调试 */
  debugEnabled: boolean;
  
  /** 发送的消息数 */
  messagesSent: number;
  
  /** 接收的消息数 */
  messagesReceived: number;
}

// ============================================================================
// 双工服务器类
// ============================================================================

export class DuplexServer {
  private static instance: DuplexServer | null = null;
  
  private config: DuplexConfig;
  private messageRouter: MessageRouter;
  private clients = new Map<string, ClientConnection>();
  private stats: MessageStats;
  private performanceMetrics: PerformanceMetrics;
  
  // 调试和监控
  private debugEnabled = false;
  private debugLogger?: (message: DuplexMessage, direction: 'send' | 'receive', clientId?: string) => void;
  
  // 消息缓存 (用于离线客户端)
  private messageCache = new Map<string, PushMessage[]>();
  private maxCacheSize = 100;

  private constructor(config: Partial<DuplexConfig> = {}) {
    this.config = { ...DEFAULT_DUPLEX_CONFIG, ...config };
    
    // 初始化统计信息
    this.stats = {
      totalMessages: 0,
      successMessages: 0,
      failedMessages: 0,
      timeoutMessages: 0,
      averageResponseTime: 0,
      maxResponseTime: 0,
      minResponseTime: Infinity,
      byType: {},
      timeRange: {
        start: Date.now(),
        end: Date.now(),
      },
    };
    
    this.performanceMetrics = {
      throughput: 0,
      queueLength: 0,
      activeConnections: 0,
      memoryUsage: {
        pendingRequests: 0,
        cachedMessages: 0,
        estimatedBytes: 0,
      },
      errorRate: 0,
      slowRequests: [],
    };
    
    // 初始化消息路由器
    this.messageRouter = new MessageRouter();
    this.setupMessageRouter();
    this.registerSystemHandlers();
    
    // 启动性能监控
    this.startPerformanceMonitoring();
    
    // 启动客户端清理
    this.startClientCleanup();
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Partial<DuplexConfig>): DuplexServer {
    if (!DuplexServer.instance) {
      DuplexServer.instance = new DuplexServer(config);
    }
    return DuplexServer.instance;
  }

  /**
   * 处理来自主线程的消息
   */
  async handleMessage(event: ExtendableMessageEvent): Promise<void> {
    const clientId = (event.source as Client)?.id || 'unknown';
    
    try {
      const message = this.parseMessage(event.data);
      if (!message) {
        return;
      }

      // 记录调试日志
      if (this.debugEnabled && this.debugLogger) {
        this.debugLogger(message, 'receive', clientId);
      }

      // 更新客户端活跃时间
      this.updateClientActivity(clientId, event.source as Client);
      
      // 更新统计
      this.updateStats(message, 'receive');

      // 路由消息到处理器
      const result = await this.messageRouter.route(message);
      
      // 如果是请求消息，发送响应
      if (message.mode === MessageMode.REQUEST) {
        await this.sendResponse(
          clientId,
          message as RequestMessage,
          result
        );
      }
      
    } catch (error) {
      console.error('[DuplexServer] Error handling message:', error);
      
      // 如果是请求消息，发送错误响应
      try {
        const message = this.parseMessage(event.data);
        if (message && message.mode === MessageMode.REQUEST) {
          await this.sendErrorResponse(
            clientId,
            message as RequestMessage,
            error as Error
          );
        }
      } catch (responseError) {
        console.error('[DuplexServer] Error sending error response:', responseError);
      }
    }
  }

  /**
   * 注册消息处理器
   */
  registerHandler(handler: MessageHandler): void {
    this.messageRouter.registerHandler(handler);
  }

  /**
   * 注销消息处理器
   */
  unregisterHandler(handlerName: string): void {
    this.messageRouter.unregisterHandler(handlerName);
  }

  /**
   * 向指定客户端发送推送消息
   */
  async pushToClient(
    clientId: string,
    type: string,
    eventType: string,
    data?: unknown
  ): Promise<boolean> {
    const connection = this.clients.get(clientId);
    if (!connection) {
      // 客户端不在线，缓存消息
      this.cacheMessage(clientId, type, eventType, data);
      return false;
    }

    const message = createPushMessage(type, eventType, data, {
      targetClientId: clientId,
      metadata: {
        source: 'service-worker',
      },
    });

    return this.sendMessageToClient(connection, message);
  }

  /**
   * 向所有客户端广播推送消息
   */
  async broadcast(
    type: string,
    eventType: string,
    data?: unknown,
    options: {
      excludeClientId?: string;
      onlyDebugClients?: boolean;
    } = {}
  ): Promise<number> {
    let sentCount = 0;
    
    for (const [clientId, connection] of this.clients.entries()) {
      // 跳过排除的客户端
      if (options.excludeClientId && clientId === options.excludeClientId) {
        continue;
      }
      
      // 只发送给调试客户端
      if (options.onlyDebugClients && !connection.debugEnabled) {
        continue;
      }
      
      const message = createPushMessage(type, eventType, data, {
        metadata: {
          source: 'service-worker',
        },
      });
      
      if (await this.sendMessageToClient(connection, message)) {
        sentCount++;
      }
    }
    
    return sentCount;
  }

  /**
   * 获取连接的客户端列表
   */
  getConnectedClients(): ClientConnection[] {
    return Array.from(this.clients.values());
  }

  /**
   * 获取统计信息
   */
  getStats(): MessageStats {
    return { ...this.stats };
  }

  /**
   * 获取性能指标
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * 启用调试模式
   */
  enableDebug(logger?: (message: DuplexMessage, direction: 'send' | 'receive', clientId?: string) => void): void {
    this.debugEnabled = true;
    this.debugLogger = logger;
    console.log('[DuplexServer] Debug mode enabled');
  }

  /**
   * 禁用调试模式
   */
  disableDebug(): void {
    this.debugEnabled = false;
    this.debugLogger = undefined;
    console.log('[DuplexServer] Debug mode disabled');
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 解析消息
   */
  private parseMessage(data: unknown): DuplexMessage | null {
    try {
      let message: DuplexMessage;
      
      if (typeof data === 'string') {
        message = deserializeMessage(data);
      } else if (typeof data === 'object' && data !== null) {
        message = data as DuplexMessage;
      } else {
        console.warn('[DuplexServer] Invalid message format:', data);
        return null;
      }
      
      // 验证消息
      if (!validateDuplexMessage(message)) {
        console.warn('[DuplexServer] Invalid message structure:', message);
        return null;
      }
      
      return sanitizeMessage(message);
      
    } catch (error) {
      console.error('[DuplexServer] Failed to parse message:', error);
      return null;
    }
  }

  /**
   * 发送响应消息
   */
  private async sendResponse(
    clientId: string,
    request: RequestMessage,
    result: unknown
  ): Promise<void> {
    const connection = this.clients.get(clientId);
    if (!connection) {
      console.warn(`[DuplexServer] Client ${clientId} not found for response`);
      return;
    }

    const response = createResponseMessage(request.id, result, undefined, {
      metadata: {
        source: 'service-worker',
      },
    });

    await this.sendMessageToClient(connection, response);
    this.updateStats(response, 'send');
  }

  /**
   * 发送错误响应
   */
  private async sendErrorResponse(
    clientId: string,
    request: RequestMessage,
    error: Error
  ): Promise<void> {
    const connection = this.clients.get(clientId);
    if (!connection) {
      console.warn(`[DuplexServer] Client ${clientId} not found for error response`);
      return;
    }

    const errorInfo = createErrorInfo(
      (error as any).code || ERROR_CODES.HANDLER_ERROR,
      error.message,
      (error as any).details,
      (error as any).retryable || false
    );

    const response = createResponseMessage(request.id, undefined, errorInfo, {
      metadata: {
        source: 'service-worker',
      },
    });

    await this.sendMessageToClient(connection, response);
    this.updateStats(response, 'error');
  }

  /**
   * 向客户端发送消息
   */
  private async sendMessageToClient(
    connection: ClientConnection,
    message: DuplexMessage
  ): Promise<boolean> {
    try {
      // 记录调试日志
      if (this.debugEnabled && this.debugLogger) {
        this.debugLogger(message, 'send', connection.id);
      }

      // 序列化消息 (如果需要)
      const messageData = this.config.debug ? message : serializeMessage(message);
      
      connection.client.postMessage(messageData);
      connection.messagesSent++;
      
      return true;
      
    } catch (error) {
      console.error(`[DuplexServer] Failed to send message to client ${connection.id}:`, error);
      
      // 移除失效的客户端连接
      this.clients.delete(connection.id);
      
      return false;
    }
  }

  /**
   * 更新客户端活跃状态
   */
  private updateClientActivity(clientId: string, client: Client): void {
    let connection = this.clients.get(clientId);
    
    if (!connection) {
      // 新客户端连接
      connection = {
        id: clientId,
        client,
        connectedAt: Date.now(),
        lastActiveAt: Date.now(),
        debugEnabled: false,
        messagesSent: 0,
        messagesReceived: 0,
      };
      
      this.clients.set(clientId, connection);
      console.log(`[DuplexServer] New client connected: ${clientId}`);
      
      // 发送缓存的消息
      this.sendCachedMessages(clientId);
      
    } else {
      // 更新现有连接
      connection.lastActiveAt = Date.now();
      connection.client = client; // 更新客户端引用
    }
    
    connection.messagesReceived++;
  }

  /**
   * 缓存离线消息
   */
  private cacheMessage(
    clientId: string,
    type: string,
    eventType: string,
    data?: unknown
  ): void {
    if (!this.messageCache.has(clientId)) {
      this.messageCache.set(clientId, []);
    }
    
    const cache = this.messageCache.get(clientId)!;
    const message = createPushMessage(type, eventType, data, {
      targetClientId: clientId,
      persistent: true,
      metadata: {
        source: 'service-worker',
        tags: ['cached'],
      },
    });
    
    cache.push(message);
    
    // 限制缓存大小
    if (cache.length > this.maxCacheSize) {
      cache.shift(); // 移除最旧的消息
    }
  }

  /**
   * 发送缓存的消息
   */
  private async sendCachedMessages(clientId: string): Promise<void> {
    const cache = this.messageCache.get(clientId);
    if (!cache || cache.length === 0) {
      return;
    }
    
    const connection = this.clients.get(clientId);
    if (!connection) {
      return;
    }
    
    console.log(`[DuplexServer] Sending ${cache.length} cached messages to client ${clientId}`);
    
    for (const message of cache) {
      await this.sendMessageToClient(connection, message);
    }
    
    // 清空缓存
    this.messageCache.delete(clientId);
  }

  /**
   * 设置消息路由器
   */
  private setupMessageRouter(): void {
    // 添加中间件
    if (this.config.debug) {
      this.messageRouter.use(createLoggingMiddleware({ 
        logLevel: 'debug',
        includeData: true,
      }));
    }
    
    this.messageRouter.use(createValidationMiddleware());
  }

  /**
   * 注册系统消息处理器
   */
  private registerSystemHandlers(): void {
    // 连接处理器
    this.registerHandler({
      name: 'system-connect',
      supportedTypes: [MESSAGE_TYPES.SYSTEM.CONNECT],
      canHandle: (type) => type === MESSAGE_TYPES.SYSTEM.CONNECT,
      handle: async (message) => {
        const clientId = message.metadata?.sender || 'unknown';
        console.log(`[DuplexServer] Client ${clientId} connected`);
        return { status: 'connected', timestamp: Date.now() };
      },
    });

    // 断开连接处理器
    this.registerHandler({
      name: 'system-disconnect',
      supportedTypes: [MESSAGE_TYPES.SYSTEM.DISCONNECT],
      canHandle: (type) => type === MESSAGE_TYPES.SYSTEM.DISCONNECT,
      handle: async (message) => {
        const clientId = message.metadata?.sender || 'unknown';
        this.clients.delete(clientId);
        this.messageCache.delete(clientId);
        console.log(`[DuplexServer] Client ${clientId} disconnected`);
        return { status: 'disconnected', timestamp: Date.now() };
      },
    });

    // Ping 处理器
    this.registerHandler({
      name: 'system-ping',
      supportedTypes: [MESSAGE_TYPES.SYSTEM.PING],
      canHandle: (type) => type === MESSAGE_TYPES.SYSTEM.PING,
      handle: async (message) => {
        return { 
          type: MESSAGE_TYPES.SYSTEM.PONG,
          timestamp: Date.now(),
          originalTimestamp: (message.data as any)?.timestamp,
        };
      },
    });

    // 调试启用处理器
    this.registerHandler({
      name: 'system-debug-enable',
      supportedTypes: [MESSAGE_TYPES.SYSTEM.DEBUG_ENABLE],
      canHandle: (type) => type === MESSAGE_TYPES.SYSTEM.DEBUG_ENABLE,
      handle: async (message) => {
        const clientId = message.metadata?.sender || 'unknown';
        const connection = this.clients.get(clientId);
        if (connection) {
          connection.debugEnabled = true;
        }
        console.log(`[DuplexServer] Debug enabled for client ${clientId}`);
        return { status: 'debug_enabled', timestamp: Date.now() };
      },
    });

    // 调试禁用处理器
    this.registerHandler({
      name: 'system-debug-disable',
      supportedTypes: [MESSAGE_TYPES.SYSTEM.DEBUG_DISABLE],
      canHandle: (type) => type === MESSAGE_TYPES.SYSTEM.DEBUG_DISABLE,
      handle: async (message) => {
        const clientId = message.metadata?.sender || 'unknown';
        const connection = this.clients.get(clientId);
        if (connection) {
          connection.debugEnabled = false;
        }
        console.log(`[DuplexServer] Debug disabled for client ${clientId}`);
        return { status: 'debug_disabled', timestamp: Date.now() };
      },
    });

    // 状态查询处理器
    this.registerHandler({
      name: 'system-status',
      supportedTypes: [MESSAGE_TYPES.SYSTEM.STATUS_REQUEST],
      canHandle: (type) => type === MESSAGE_TYPES.SYSTEM.STATUS_REQUEST,
      handle: async () => {
        return {
          stats: this.getStats(),
          performance: this.getPerformanceMetrics(),
          clients: this.getConnectedClients().map(c => ({
            id: c.id,
            connectedAt: c.connectedAt,
            lastActiveAt: c.lastActiveAt,
            debugEnabled: c.debugEnabled,
            messagesSent: c.messagesSent,
            messagesReceived: c.messagesReceived,
          })),
          timestamp: Date.now(),
        };
      },
    });
  }

  /**
   * 更新统计信息
   */
  private updateStats(message: DuplexMessage, type: 'receive' | 'send' | 'error'): void {
    const now = Date.now();
    this.stats.timeRange.end = now;
    
    switch (type) {
      case 'receive':
        this.stats.totalMessages++;
        break;
      case 'send':
        this.stats.successMessages++;
        break;
      case 'error':
        this.stats.failedMessages++;
        break;
    }

    // 更新按类型统计
    if (!this.stats.byType[message.type]) {
      this.stats.byType[message.type] = {
        count: 0,
        averageTime: 0,
        successRate: 0,
      };
    }
    
    const typeStats = this.stats.byType[message.type];
    typeStats.count++;
  }

  /**
   * 启动性能监控
   */
  private startPerformanceMonitoring(): void {
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, 5000); // 每5秒更新一次
  }

  /**
   * 更新性能指标
   */
  private updatePerformanceMetrics(): void {
    // 更新活跃连接数
    this.performanceMetrics.activeConnections = this.clients.size;
    
    // 更新缓存消息数
    let totalCachedMessages = 0;
    for (const cache of this.messageCache.values()) {
      totalCachedMessages += cache.length;
    }
    this.performanceMetrics.memoryUsage.cachedMessages = totalCachedMessages;
    
    // 计算错误率
    const totalMessages = this.stats.successMessages + this.stats.failedMessages;
    this.performanceMetrics.errorRate = totalMessages > 0 
      ? this.stats.failedMessages / totalMessages 
      : 0;
  }

  /**
   * 启动客户端清理
   */
  private startClientCleanup(): void {
    setInterval(() => {
      this.cleanupInactiveClients();
    }, 60000); // 每分钟清理一次
  }

  /**
   * 清理不活跃的客户端
   */
  private cleanupInactiveClients(): void {
    const now = Date.now();
    const maxInactiveTime = 5 * 60 * 1000; // 5分钟
    
    for (const [clientId, connection] of this.clients.entries()) {
      if (now - connection.lastActiveAt > maxInactiveTime) {
        console.log(`[DuplexServer] Removing inactive client: ${clientId}`);
        this.clients.delete(clientId);
        this.messageCache.delete(clientId);
      }
    }
  }
}