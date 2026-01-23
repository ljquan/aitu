/**
 * Request Manager
 * 
 * 管理请求-响应生命周期，包括超时、重试和错误处理
 */

import { Subject, Observable, filter, map, take, timeout, catchError, retry, timer } from 'rxjs';
import {
  RequestMessage,
  ResponseMessage,
  PendingRequest,
  RetryConfig,
  ErrorInfo,
  MessagePriority,
  DEFAULT_DUPLEX_CONFIG,
} from '../core/types';
import { createErrorInfo, ERROR_CODES } from '../core/protocol';

// ============================================================================
// 请求管理器类
// ============================================================================

export class RequestManager {
  private pendingRequests = new Map<string, PendingRequest>();
  private responseSubject = new Subject<ResponseMessage>();
  private maxConcurrentRequests = 100;
  private defaultTimeout = DEFAULT_DUPLEX_CONFIG.defaultTimeout;
  private defaultRetryConfig = DEFAULT_DUPLEX_CONFIG.defaultRetryConfig;
  private cleanupTimerId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private postMessage: (message: RequestMessage) => Promise<void>,
    options: {
      maxConcurrentRequests?: number;
      defaultTimeout?: number;
      defaultRetryConfig?: RetryConfig;
    } = {}
  ) {
    if (options.maxConcurrentRequests) {
      this.maxConcurrentRequests = options.maxConcurrentRequests;
    }
    if (options.defaultTimeout) {
      this.defaultTimeout = options.defaultTimeout;
    }
    if (options.defaultRetryConfig) {
      this.defaultRetryConfig = options.defaultRetryConfig;
    }

    // 定期清理过期请求
    this.startCleanupTimer();
  }

  /**
   * 发送请求并等待响应
   */
  async sendRequest<T = unknown>(
    message: RequestMessage,
    options: {
      timeout?: number;
      retryConfig?: RetryConfig;
    } = {}
  ): Promise<T> {
    // 检查并发限制
    if (this.pendingRequests.size >= this.maxConcurrentRequests) {
      throw new Error(`Too many concurrent requests (max: ${this.maxConcurrentRequests})`);
    }

    const timeout = options.timeout || message.timeout || this.defaultTimeout;
    const retryConfig = options.retryConfig || message.retryConfig || this.defaultRetryConfig;

    return this.executeWithRetry<T>(message, timeout, retryConfig);
  }

  /**
   * 处理收到的响应消息
   */
  handleResponse(response: ResponseMessage): void {
    const pending = this.pendingRequests.get(response.requestId);
    if (!pending) {
      console.warn(`[RequestManager] Received response for unknown request: ${response.requestId}`);
      return;
    }

    // 清理超时定时器
    if (pending.timeoutHandle) {
      clearTimeout(pending.timeoutHandle);
    }

    // 移除待处理请求
    this.pendingRequests.delete(response.requestId);

    // 处理响应
    if (response.status === 'success') {
      pending.resolve(response.data);
    } else {
      const error = new Error(response.error?.message || 'Request failed');
      (error as any).code = response.error?.code || ERROR_CODES.UNKNOWN_ERROR;
      (error as any).details = response.error?.details;
      (error as any).retryable = response.error?.retryable || false;
      pending.reject(error);
    }

    // 发送响应到响应流
    this.responseSubject.next(response);
  }

  /**
   * 取消请求
   */
  cancelRequest(requestId: string): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return false;
    }

    // 清理超时定时器
    if (pending.timeoutHandle) {
      clearTimeout(pending.timeoutHandle);
    }

    // 移除待处理请求
    this.pendingRequests.delete(requestId);

    // 拒绝 Promise
    const error = new Error('Request cancelled');
    (error as any).code = ERROR_CODES.TIMEOUT;
    pending.reject(error);

    return true;
  }

  /**
   * 取消所有待处理请求
   */
  cancelAllRequests(): void {
    const requestIds = Array.from(this.pendingRequests.keys());
    requestIds.forEach(id => this.cancelRequest(id));
  }

  /**
   * 获取待处理请求数量
   */
  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * 获取待处理请求列表
   */
  getPendingRequests(): PendingRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * 观察响应流
   */
  observeResponses(): Observable<ResponseMessage> {
    return this.responseSubject.asObservable();
  }

  /**
   * 观察特定请求的响应
   */
  observeResponse(requestId: string): Observable<ResponseMessage> {
    return this.responseSubject.pipe(
      filter(response => response.requestId === requestId),
      take(1)
    );
  }

  /**
   * 销毁请求管理器
   */
  destroy(): void {
    this.cancelAllRequests();
    this.responseSubject.complete();
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 执行带重试的请求
   */
  private async executeWithRetry<T>(
    message: RequestMessage,
    timeout: number,
    retryConfig: RetryConfig
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        return await this.executeSingleRequest<T>(message, timeout);
      } catch (error) {
        lastError = error as Error;
        
        // 检查是否应该重试
        if (attempt >= retryConfig.maxAttempts) {
          break; // 已达到最大重试次数
        }
        
        if (!this.shouldRetry(error as Error, retryConfig)) {
          break; // 不应该重试的错误
        }
        
        // 计算重试延迟
        const delay = this.calculateRetryDelay(attempt, retryConfig);
        console.warn(`[RequestManager] Request ${message.id} failed (attempt ${attempt + 1}), retrying in ${delay}ms:`, error);
        
        // 等待重试延迟
        await this.delay(delay);
      }
    }
    
    // 所有重试都失败了
    throw lastError || new Error('Request failed after all retries');
  }

  /**
   * 执行单次请求
   */
  private async executeSingleRequest<T>(
    message: RequestMessage,
    timeout: number
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // 设置超时定时器
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        const error = new Error(`Request timeout after ${timeout}ms`);
        (error as any).code = ERROR_CODES.TIMEOUT;
        reject(error);
      }, timeout);

      // 创建待处理请求
      const pending: PendingRequest = {
        message,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutHandle,
        retryCount: 0,
        createdAt: Date.now(),
      };

      // 添加到待处理列表
      this.pendingRequests.set(message.id, pending);

      // 发送消息
      this.postMessage(message).catch(error => {
        // 发送失败，清理并拒绝
        clearTimeout(timeoutHandle);
        this.pendingRequests.delete(message.id);
        reject(error);
      });
    });
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(error: Error, retryConfig: RetryConfig): boolean {
    // 如果有自定义重试判断函数，使用它
    if (retryConfig.shouldRetry) {
      const errorInfo: ErrorInfo = {
        code: (error as any).code || ERROR_CODES.UNKNOWN_ERROR,
        message: error.message,
        details: (error as any).details,
        retryable: (error as any).retryable,
      };
      return retryConfig.shouldRetry(errorInfo);
    }

    // 默认重试逻辑
    const code = (error as any).code;
    const retryableCodes = [
      ERROR_CODES.TIMEOUT,
      ERROR_CODES.NETWORK_ERROR,
      ERROR_CODES.CONNECTION_LOST,
      ERROR_CODES.SERVICE_UNAVAILABLE,
    ];

    return retryableCodes.includes(code) || (error as any).retryable === true;
  }

  /**
   * 计算重试延迟
   */
  private calculateRetryDelay(attempt: number, retryConfig: RetryConfig): number {
    let delay = retryConfig.interval;

    switch (retryConfig.backoff) {
      case 'linear':
        delay = retryConfig.interval * (attempt + 1) * (retryConfig.backoffMultiplier || 1);
        break;
      case 'exponential':
        delay = retryConfig.interval * Math.pow(retryConfig.backoffMultiplier || 2, attempt);
        break;
      case 'fixed':
      default:
        delay = retryConfig.interval;
        break;
    }

    // 限制最大延迟
    if (retryConfig.maxInterval && delay > retryConfig.maxInterval) {
      delay = retryConfig.maxInterval;
    }

    return delay;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimerId) {
      clearInterval(this.cleanupTimerId);
    }
    this.cleanupTimerId = setInterval(() => {
      this.cleanupExpiredRequests();
    }, 60000); // 每分钟清理一次
  }

  /**
   * 清理过期请求
   */
  private cleanupExpiredRequests(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5分钟

    for (const [requestId, pending] of this.pendingRequests.entries()) {
      if (now - pending.createdAt > maxAge) {
        console.warn(`[RequestManager] Cleaning up expired request: ${requestId}`);
        this.cancelRequest(requestId);
      }
    }
  }

  /**
   * 销毁请求管理器，清理所有资源
   */
  destroy(): void {
    if (this.cleanupTimerId) {
      clearInterval(this.cleanupTimerId);
      this.cleanupTimerId = null;
    }
    // 取消所有待处理的请求
    for (const requestId of this.pendingRequests.keys()) {
      this.cancelRequest(requestId);
    }
    this.pendingRequests.clear();
    this.responseSubject.complete();
  }
}

// ============================================================================
// 请求队列管理器
// ============================================================================

export class RequestQueue {
  private queue: RequestMessage[] = [];
  private processing = false;
  private maxQueueSize = 1000;
  private processingDelay = 10; // 处理间隔 (毫秒)

  constructor(
    private requestManager: RequestManager,
    options: {
      maxQueueSize?: number;
      processingDelay?: number;
    } = {}
  ) {
    if (options.maxQueueSize) {
      this.maxQueueSize = options.maxQueueSize;
    }
    if (options.processingDelay) {
      this.processingDelay = options.processingDelay;
    }
  }

  /**
   * 添加请求到队列
   */
  enqueue(message: RequestMessage): void {
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(`Request queue is full (max: ${this.maxQueueSize})`);
    }

    // 按优先级插入
    const priority = message.priority || MessagePriority.NORMAL;
    let insertIndex = this.queue.length;

    for (let i = 0; i < this.queue.length; i++) {
      const queuedPriority = this.queue[i].priority || MessagePriority.NORMAL;
      if (priority > queuedPriority) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, message);

    // 开始处理队列
    if (!this.processing) {
      this.startProcessing();
    }
  }

  /**
   * 获取队列长度
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue.length = 0;
  }

  /**
   * 停止处理
   */
  stop(): void {
    this.processing = false;
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 开始处理队列
   */
  private async startProcessing(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.processing && this.queue.length > 0) {
      const message = this.queue.shift();
      if (message) {
        try {
          await this.requestManager.sendRequest(message);
        } catch (error) {
          console.error(`[RequestQueue] Failed to process request ${message.id}:`, error);
        }
      }

      // 短暂延迟，避免阻塞
      if (this.processingDelay > 0) {
        await this.delay(this.processingDelay);
      }
    }

    this.processing = false;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}