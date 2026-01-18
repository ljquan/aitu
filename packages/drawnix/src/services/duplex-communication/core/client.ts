/**
 * Duplex Communication Client
 * 
 * 主线程双工通讯客户端，提供请求-响应和推送消息功能
 */

import { Subject, Observable, filter, map, fromEvent, merge } from 'rxjs';
import {
  DuplexMessage,
  RequestMessage,
  ResponseMessage,
  PushMessage,
  MessageMode,
  MessagePriority,
  DuplexConfig,
  DEFAULT_DUPLEX_CONFIG,
  EventEmitter,
  EventListener,
  MessageStats,
  PerformanceMetrics,
} from './types';
import {
  createRequestMessage,
  createResponseMessage,
  generateMessageId,
  validateDuplexMessage,
  serializeMessage,
  deserializeMessage,
  MESSAGE_TYPES,
  ERROR_CODES,
  createErrorInfo,
} from './protocol';
import { RequestManager } from '../utils/request-manager';
import { MessageRouter, createLoggingMiddleware, createValidationMiddleware } from '../utils/message-router';
import { validateDuplexMessage as validate, sanitizeMessage } from '../utils/validator';

// ============================================================================
// 双工客户端类
// ============================================================================

export class DuplexClient implements EventEmitter {
  private static instance: DuplexClient | null = null;
  
  private config: DuplexConfig;
  private requestManager: RequestManager;
  private messageRouter: MessageRouter;
  private messageSubject = new Subject<DuplexMessage>();
  private pushSubject = new Subject<PushMessage>();
  private eventListeners = new Map<string, Set<EventListener>>();
  
  private serviceWorkerReady = false;
  private connectionId: string;
  private stats: MessageStats;
  private performanceMetrics: PerformanceMetrics;
  
  // 调试和监控
  private debugEnabled = false;
  private debugLogger?: (message: DuplexMessage, direction: 'send' | 'receive') => void;
  private performanceMonitoringTimerId: ReturnType<typeof setInterval> | null = null;

  private constructor(config: Partial<DuplexConfig> = {}) {
    this.config = { ...DEFAULT_DUPLEX_CONFIG, ...config };
    this.connectionId = generateMessageId();
    
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
    
    // 初始化请求管理器
    this.requestManager = new RequestManager(
      this.postMessageToSW.bind(this),
      {
        maxConcurrentRequests: 100,
        defaultTimeout: this.config.defaultTimeout,
        defaultRetryConfig: this.config.defaultRetryConfig,
      }
    );
    
    // 初始化消息路由器
    this.messageRouter = new MessageRouter();
    this.setupMessageRouter();
    
    // 设置 Service Worker 消息监听
    this.setupServiceWorkerListener();
    
    // 启动性能监控
    this.startPerformanceMonitoring();
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Partial<DuplexConfig>): DuplexClient {
    if (!DuplexClient.instance) {
      DuplexClient.instance = new DuplexClient(config);
    }
    return DuplexClient.instance;
  }

  /**
   * 初始化客户端
   */
  async initialize(): Promise<boolean> {
    try {
      // 检查 Service Worker 支持
      if (!('serviceWorker' in navigator)) {
        console.error('[DuplexClient] Service Worker not supported');
        return false;
      }

      // 等待 Service Worker 就绪
      const registration = await navigator.serviceWorker.ready;
      if (!registration.active) {
        console.error('[DuplexClient] No active Service Worker');
        return false;
      }

      this.serviceWorkerReady = true;
      
      // 发送连接消息
      await this.sendSystemMessage(MESSAGE_TYPES.SYSTEM.CONNECT, {
        clientId: this.connectionId,
        timestamp: Date.now(),
      });

      console.log('[DuplexClient] Initialized successfully');
      return true;
      
    } catch (error) {
      console.error('[DuplexClient] Initialization failed:', error);
      return false;
    }
  }

  /**
   * 发送请求并等待响应
   */
  async request<T = unknown>(
    type: string,
    data?: unknown,
    options: {
      timeout?: number;
      priority?: MessagePriority;
      retryConfig?: any;
    } = {}
  ): Promise<T> {
    if (!this.serviceWorkerReady) {
      throw new Error('Service Worker not ready');
    }

    const message = createRequestMessage(type, data, {
      timeout: options.timeout || this.config.defaultTimeout,
      priority: options.priority,
      metadata: {
        source: 'main-thread',
        sender: this.connectionId,
      },
    });

    // 验证消息
    const validation = validate(message);
    if (!validation.valid) {
      throw new Error(`Invalid request message: ${validation.errors.join(', ')}`);
    }

    // 记录调试日志
    if (this.debugEnabled && this.debugLogger) {
      this.debugLogger(message, 'send');
    }

    // 更新统计
    this.updateStats(message, 'request');

    try {
      const result = await this.requestManager.sendRequest<T>(message, options);
      this.updateStats(message, 'success');
      return result;
    } catch (error) {
      this.updateStats(message, 'error');
      throw error;
    }
  }

  /**
   * 发送推送消息 (单向)
   */
  async push(
    type: string,
    eventType: string,
    data?: unknown,
    options: {
      priority?: MessagePriority;
      targetClientId?: string;
    } = {}
  ): Promise<void> {
    if (!this.serviceWorkerReady) {
      throw new Error('Service Worker not ready');
    }

    const message: PushMessage = {
      id: generateMessageId(),
      type,
      mode: MessageMode.PUSH,
      timestamp: Date.now(),
      priority: options.priority || MessagePriority.NORMAL,
      eventType,
      data,
      targetClientId: options.targetClientId,
      metadata: {
        source: 'main-thread',
        sender: this.connectionId,
      },
    };

    // 验证消息
    const validation = validate(message);
    if (!validation.valid) {
      throw new Error(`Invalid push message: ${validation.errors.join(', ')}`);
    }

    // 记录调试日志
    if (this.debugEnabled && this.debugLogger) {
      this.debugLogger(message, 'send');
    }

    await this.postMessageToSW(message);
  }

  /**
   * 监听推送消息
   */
  onPush(eventType?: string): Observable<PushMessage> {
    let stream = this.pushSubject.asObservable();
    
    if (eventType) {
      stream = stream.pipe(
        filter(message => message.eventType === eventType)
      );
    }
    
    return stream;
  }

  /**
   * 监听特定类型的消息
   */
  onMessage(messageType?: string): Observable<DuplexMessage> {
    let stream = this.messageSubject.asObservable();
    
    if (messageType) {
      stream = stream.pipe(
        filter(message => message.type === messageType)
      );
    }
    
    return stream;
  }

  /**
   * 获取连接状态
   */
  isConnected(): boolean {
    return this.serviceWorkerReady && navigator.serviceWorker.controller !== null;
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
  enableDebug(logger?: (message: DuplexMessage, direction: 'send' | 'receive') => void): void {
    this.debugEnabled = true;
    this.debugLogger = logger;
    
    // 发送调试启用消息到 SW
    this.sendSystemMessage(MESSAGE_TYPES.SYSTEM.DEBUG_ENABLE, {
      clientId: this.connectionId,
    }).catch(error => {
      console.error('[DuplexClient] Failed to enable debug mode:', error);
    });
  }

  /**
   * 禁用调试模式
   */
  disableDebug(): void {
    this.debugEnabled = false;
    this.debugLogger = undefined;
    
    // 发送调试禁用消息到 SW
    this.sendSystemMessage(MESSAGE_TYPES.SYSTEM.DEBUG_DISABLE, {
      clientId: this.connectionId,
    }).catch(error => {
      console.error('[DuplexClient] Failed to disable debug mode:', error);
    });
  }

  /**
   * 销毁客户端
   */
  destroy(): void {
    // 发送断开连接消息
    if (this.serviceWorkerReady) {
      this.sendSystemMessage(MESSAGE_TYPES.SYSTEM.DISCONNECT, {
        clientId: this.connectionId,
      }).catch(error => {
        console.error('[DuplexClient] Failed to send disconnect message:', error);
      });
    }

    // 清理资源
    this.requestManager.destroy();
    this.messageSubject.complete();
    this.pushSubject.complete();
    this.eventListeners.clear();
    
    // 重置单例
    DuplexClient.instance = null;
  }

  // ============================================================================
  // EventEmitter 接口实现
  // ============================================================================

  on<T = unknown>(eventType: string, listener: EventListener<T>): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(listener as EventListener);
  }

  once<T = unknown>(eventType: string, listener: EventListener<T>): void {
    const onceListener: EventListener<T> = (event: T) => {
      listener(event);
      this.off(eventType, onceListener);
    };
    this.on(eventType, onceListener);
  }

  off<T = unknown>(eventType: string, listener: EventListener<T>): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.delete(listener as EventListener);
      if (listeners.size === 0) {
        this.eventListeners.delete(eventType);
      }
    }
  }

  emit<T = unknown>(eventType: string, data: T): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`[DuplexClient] Event listener error for ${eventType}:`, error);
        }
      });
    }
  }

  removeAllListeners(eventType?: string): void {
    if (eventType) {
      this.eventListeners.delete(eventType);
    } else {
      this.eventListeners.clear();
    }
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 发送消息到 Service Worker
   */
  private async postMessageToSW(message: DuplexMessage): Promise<void> {
    if (!navigator.serviceWorker.controller) {
      throw new Error('No Service Worker controller available');
    }

    try {
      // 清理和验证消息
      const cleanMessage = sanitizeMessage(message);
      
      // 序列化消息 (如果需要)
      const messageData = this.config.debug ? cleanMessage : serializeMessage(cleanMessage);
      
      navigator.serviceWorker.controller.postMessage(messageData);
      
    } catch (error) {
      throw new Error(`Failed to send message to Service Worker: ${error}`);
    }
  }

  /**
   * 发送系统消息
   */
  private async sendSystemMessage(type: string, data?: unknown): Promise<void> {
    const message = createRequestMessage(type, data, {
      priority: MessagePriority.HIGH,
      metadata: {
        source: 'main-thread',
        sender: this.connectionId,
        tags: ['system'],
      },
    });

    await this.postMessageToSW(message);
  }

  /**
   * 设置 Service Worker 消息监听
   */
  private setupServiceWorkerListener(): void {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    navigator.serviceWorker.addEventListener('message', (event) => {
      try {
        this.handleServiceWorkerMessage(event.data);
      } catch (error) {
        console.error('[DuplexClient] Error handling Service Worker message:', error);
      }
    });

    // 监听 Service Worker 控制器变化
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[DuplexClient] Service Worker controller changed');
      this.serviceWorkerReady = false;
      
      // 重新初始化
      this.initialize().then(success => {
        if (success) {
          this.emit('reconnected', { timestamp: Date.now() });
        } else {
          this.emit('disconnected', { timestamp: Date.now() });
        }
      });
    });
  }

  /**
   * 处理来自 Service Worker 的消息
   */
  private handleServiceWorkerMessage(data: unknown): void {
    let message: DuplexMessage;
    
    try {
      // 尝试反序列化消息
      if (typeof data === 'string') {
        message = deserializeMessage(data);
      } else if (typeof data === 'object' && data !== null) {
        message = data as DuplexMessage;
      } else {
        console.warn('[DuplexClient] Invalid message format:', data);
        return;
      }
      
      // 验证消息
      if (!validateDuplexMessage(message)) {
        console.warn('[DuplexClient] Invalid message structure:', message);
        return;
      }
      
    } catch (error) {
      console.error('[DuplexClient] Failed to parse message:', error);
      return;
    }

    // 记录调试日志
    if (this.debugEnabled && this.debugLogger) {
      this.debugLogger(message, 'receive');
    }

    // 根据消息模式处理
    switch (message.mode) {
      case MessageMode.RESPONSE:
        this.handleResponseMessage(message as ResponseMessage);
        break;
      case MessageMode.PUSH:
        this.handlePushMessage(message as PushMessage);
        break;
      case MessageMode.REQUEST:
        // 主线程通常不处理来自 SW 的请求，但可以扩展支持
        console.warn('[DuplexClient] Received request from Service Worker (not implemented):', message);
        break;
    }

    // 发送到消息流
    this.messageSubject.next(message);
  }

  /**
   * 处理响应消息
   */
  private handleResponseMessage(response: ResponseMessage): void {
    this.requestManager.handleResponse(response);
    this.updateStats(response, response.status === 'success' ? 'success' : 'error');
  }

  /**
   * 处理推送消息
   */
  private handlePushMessage(push: PushMessage): void {
    this.pushSubject.next(push);
    this.emit(push.eventType, push.data);
    this.updateStats(push, 'push');
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
   * 更新统计信息
   */
  private updateStats(message: DuplexMessage, type: 'request' | 'success' | 'error' | 'push'): void {
    const now = Date.now();
    this.stats.timeRange.end = now;
    
    switch (type) {
      case 'request':
        this.stats.totalMessages++;
        break;
      case 'success':
        this.stats.successMessages++;
        break;
      case 'error':
        this.stats.failedMessages++;
        break;
      case 'push':
        // 推送消息不计入请求统计
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
    
    if (type === 'success' || type === 'error') {
      const successCount = type === 'success' ? 1 : 0;
      typeStats.successRate = (typeStats.successRate * (typeStats.count - 1) + successCount) / typeStats.count;
    }
  }

  /**
   * 启动性能监控
   */
  private startPerformanceMonitoring(): void {
    if (this.performanceMonitoringTimerId) {
      clearInterval(this.performanceMonitoringTimerId);
    }
    this.performanceMonitoringTimerId = setInterval(() => {
      this.updatePerformanceMetrics();
    }, 5000); // 每5秒更新一次
  }

  /**
   * 更新性能指标
   */
  private updatePerformanceMetrics(): void {
    const now = Date.now();
    const timeWindow = 60000; // 1分钟窗口
    
    // 计算吞吐量
    const recentMessages = this.stats.totalMessages; // 简化计算
    this.performanceMetrics.throughput = recentMessages / (timeWindow / 1000);
    
    // 更新队列长度
    this.performanceMetrics.queueLength = this.requestManager.getPendingRequestCount();
    
    // 更新内存使用情况
    this.performanceMetrics.memoryUsage.pendingRequests = this.requestManager.getPendingRequestCount();
    
    // 计算错误率
    const totalMessages = this.stats.successMessages + this.stats.failedMessages;
    this.performanceMetrics.errorRate = totalMessages > 0 
      ? this.stats.failedMessages / totalMessages 
      : 0;
  }

  /**
   * 销毁客户端，清理所有资源
   */
  destroy(): void {
    if (this.performanceMonitoringTimerId) {
      clearInterval(this.performanceMonitoringTimerId);
      this.performanceMonitoringTimerId = null;
    }
    this.requestManager.destroy();
    this.messageSubject.complete();
    this.pushSubject.complete();
    this.eventListeners.clear();
    DuplexClient.instance = null;
  }
}