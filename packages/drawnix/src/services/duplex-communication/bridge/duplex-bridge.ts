/**
 * Duplex Communication Bridge
 * 
 * 统一的应用层与Service Worker通讯桥接层
 * 封装请求-响应模式和推送模式，支持调试日志、状态恢复和平滑迁移
 */

import { Subject, Observable, filter, take, timeout, firstValueFrom } from 'rxjs';

// ============================================================================
// 类型定义
// ============================================================================

export interface BridgeConfig {
  /** 默认请求超时时间（毫秒） */
  defaultTimeout: number;
  /** 是否启用调试日志 */
  debug: boolean;
  /** 调试日志回调 */
  debugLogger?: (entry: BridgeLogEntry) => void;
}

export interface BridgeLogEntry {
  id: string;
  timestamp: number;
  direction: 'send' | 'receive';
  messageType: string;
  data?: unknown;
  response?: unknown;
  error?: string;
  duration?: number;
}

export interface RequestOptions {
  timeout?: number;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface PendingRequest {
  requestId: string;
  messageType: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
  startTime: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: BridgeConfig = {
  defaultTimeout: 30000,
  debug: false,
};

// ============================================================================
// DuplexBridge 类
// ============================================================================

export class DuplexBridge {
  private static instance: DuplexBridge | null = null;
  
  private config: BridgeConfig;
  private initialized = false;
  private messageSubject = new Subject<any>();
  private pendingRequests = new Map<string, PendingRequest>();
  private messageHandlers = new Map<string, ((data: any) => void)[]>();
  private logIdCounter = 0;
  
  // 存储配置用于SW重新初始化
  private storedGeminiConfig: any = null;
  private storedVideoConfig: any = null;

  private constructor(config: Partial<BridgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupMessageListener();
    this.setupControllerChangeListener();
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Partial<BridgeConfig>): DuplexBridge {
    if (!DuplexBridge.instance) {
      DuplexBridge.instance = new DuplexBridge(config);
    }
    return DuplexBridge.instance;
  }

  /**
   * 重置实例（主要用于测试）
   */
  static resetInstance(): void {
    if (DuplexBridge.instance) {
      DuplexBridge.instance.destroy();
      DuplexBridge.instance = null;
    }
  }

  /**
   * 初始化通讯桥接
   */
  async initialize(
    geminiConfig: any,
    videoConfig: any
  ): Promise<boolean> {
    if (this.initialized) {
      // 更新配置
      this.storedGeminiConfig = geminiConfig;
      this.storedVideoConfig = videoConfig;
      return true;
    }

    if (!this.isServiceWorkerSupported()) {
      console.warn('[DuplexBridge] Service Worker not supported');
      return false;
    }

    // 存储配置
    this.storedGeminiConfig = geminiConfig;
    this.storedVideoConfig = videoConfig;

    // 等待SW就绪
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) {
      console.warn('[DuplexBridge] No active Service Worker');
      return false;
    }

    // 发送初始化消息
    await this.sendMessage({
      type: 'TASK_QUEUE_INIT',
      geminiConfig,
      videoConfig,
    });

    // 等待初始化响应
    try {
      const response = await this.waitForMessage(
        'TASK_QUEUE_INITIALIZED',
        5000
      );
      this.initialized = (response as any)?.success ?? true;
      
      if (this.initialized) {
        // 尝试恢复工作流状态
        await this.recoverWorkflows();
      }
      
      return this.initialized;
    } catch {
      // 超时但假设初始化成功
      this.initialized = true;
      return true;
    }
  }

  /**
   * 发送请求并等待响应
   */
  async request<T = unknown>(
    messageType: string,
    data?: unknown,
    options: RequestOptions = {}
  ): Promise<T> {
    const requestId = this.generateRequestId();
    const timeoutMs = options.timeout || this.config.defaultTimeout;

    // 创建Promise并存储
    return new Promise<T>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout: ${messageType}`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        requestId,
        messageType,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutHandle,
        startTime: Date.now(),
      });

      // 发送消息
      this.sendMessage({
        type: messageType,
        requestId,
        ...data,
      }).catch(error => {
        this.pendingRequests.delete(requestId);
        clearTimeout(timeoutHandle);
        reject(error);
      });
    });
  }

  /**
   * 发送消息（不等待响应）
   */
  async sendMessage(message: any): Promise<void> {
    if (!this.isServiceWorkerSupported()) {
      throw new Error('Service Worker not supported');
    }

    const controller = navigator.serviceWorker.controller;
    if (!controller) {
      // 等待SW就绪
      const registration = await navigator.serviceWorker.ready;
      if (!registration.active) {
        throw new Error('No active Service Worker');
      }
      registration.active.postMessage(message);
    } else {
      controller.postMessage(message);
    }

    // 记录调试日志
    this.logMessage('send', message.type, message);
  }

  /**
   * 等待特定类型的消息
   */
  async waitForMessage(
    messageType: string,
    timeoutMs?: number
  ): Promise<unknown> {
    const observable = this.messageSubject.pipe(
      filter((msg) => msg.type === messageType),
      take(1)
    );

    if (timeoutMs) {
      return firstValueFrom(observable.pipe(timeout(timeoutMs)));
    }

    return firstValueFrom(observable);
  }

  /**
   * 订阅消息
   */
  onMessage(messageType?: string): Observable<any> {
    if (messageType) {
      return this.messageSubject.pipe(
        filter((msg) => msg.type === messageType)
      );
    }
    return this.messageSubject.asObservable();
  }

  /**
   * 注册消息处理器
   */
  registerHandler(messageType: string, handler: (data: any) => void): void {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, []);
    }
    this.messageHandlers.get(messageType)!.push(handler);
  }

  /**
   * 取消注册消息处理器
   */
  unregisterHandler(messageType: string, handler: (data: any) => void): void {
    const handlers = this.messageHandlers.get(messageType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 检查SW是否可用
   */
  isServiceWorkerSupported(): boolean {
    return 'serviceWorker' in navigator;
  }

  /**
   * 检查SW是否已连接
   */
  isConnected(): boolean {
    return this.isServiceWorkerSupported() && navigator.serviceWorker.controller !== null;
  }

  /**
   * 启用调试模式
   */
  enableDebug(logger?: (entry: BridgeLogEntry) => void): void {
    this.config.debug = true;
    if (logger) {
      this.config.debugLogger = logger;
    }
  }

  /**
   * 禁用调试模式
   */
  disableDebug(): void {
    this.config.debug = false;
    this.config.debugLogger = undefined;
  }

  /**
   * 获取存储的配置
   */
  getStoredConfig(): { geminiConfig: any; videoConfig: any } {
    return {
      geminiConfig: this.storedGeminiConfig,
      videoConfig: this.storedVideoConfig,
    };
  }

  /**
   * 销毁实例
   */
  destroy(): void {
    // 清理待处理请求
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(new Error('Bridge destroyed'));
    }
    this.pendingRequests.clear();
    this.messageHandlers.clear();
    this.messageSubject.complete();
    this.initialized = false;
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 设置消息监听器
   */
  private setupMessageListener(): void {
    if (!this.isServiceWorkerSupported()) return;

    navigator.serviceWorker.addEventListener('message', (event) => {
      const message = event.data;
      if (!message || typeof message !== 'object' || !message.type) return;

      // 记录调试日志
      this.logMessage('receive', message.type, message);

      // 处理响应类消息
      this.handleResponse(message);

      // 发送到Subject供订阅者使用
      this.messageSubject.next(message);

      // 调用注册的处理器
      const handlers = this.messageHandlers.get(message.type);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(message);
          } catch (error) {
            console.error(`[DuplexBridge] Handler error for ${message.type}:`, error);
          }
        });
      }

      // 处理SW请求配置重新发送
      if (message.type === 'SW_REQUEST_CONFIG') {
        this.handleConfigRequest();
      }
    });
  }

  /**
   * 设置控制器变更监听
   */
  private setupControllerChangeListener(): void {
    if (!this.isServiceWorkerSupported()) return;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // console.log('[DuplexBridge] Service Worker controller changed');
      // 重新初始化
      if (this.storedGeminiConfig && this.storedVideoConfig) {
        this.initialized = false;
        this.initialize(this.storedGeminiConfig, this.storedVideoConfig);
      }
    });
  }

  /**
   * 处理响应消息
   */
  private handleResponse(message: any): void {
    const requestId = message.requestId;
    if (!requestId) return;

    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timeoutHandle);
    this.pendingRequests.delete(requestId);

    // 根据消息内容判断成功或失败
    if (message.error) {
      pending.reject(new Error(message.error));
    } else {
      pending.resolve(message);
    }
  }

  /**
   * 处理配置请求
   */
  private handleConfigRequest(): void {
    if (this.storedGeminiConfig && this.storedVideoConfig) {
      this.sendMessage({
        type: 'TASK_QUEUE_INIT',
        geminiConfig: this.storedGeminiConfig,
        videoConfig: this.storedVideoConfig,
      }).catch(error => {
        console.error('[DuplexBridge] Failed to resend config:', error);
      });
    }
  }

  /**
   * 恢复工作流状态
   */
  private async recoverWorkflows(): Promise<void> {
    try {
      // 请求所有工作流状态
      this.sendMessage({ type: 'WORKFLOW_GET_ALL' });
    } catch (error) {
      console.warn('[DuplexBridge] Failed to recover workflows:', error);
    }
  }

  /**
   * 生成请求ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 记录调试日志
   */
  private logMessage(
    direction: 'send' | 'receive',
    messageType: string,
    data: unknown
  ): void {
    if (!this.config.debug) return;

    const entry: BridgeLogEntry = {
      id: `bridge-${Date.now()}-${++this.logIdCounter}`,
      timestamp: Date.now(),
      direction,
      messageType,
      data: this.sanitizeData(data),
    };

    if (this.config.debugLogger) {
      this.config.debugLogger(entry);
    } else {
      // console.log(`[DuplexBridge] ${direction === 'send' ? '→' : '←'} ${messageType}`, data);
    }
  }

  /**
   * 清理敏感数据
   */
  private sanitizeData(data: unknown): unknown {
    if (!data) return data;
    try {
      const sanitized = JSON.parse(JSON.stringify(data));
      this.sanitizeObject(sanitized);
      return sanitized;
    } catch {
      return '[Non-serializable]';
    }
  }

  /**
   * 递归清理对象中的敏感字段
   */
  private sanitizeObject(obj: any): void {
    if (!obj || typeof obj !== 'object') return;
    const sensitiveFields = ['apiKey', 'password', 'token', 'secret'];
    for (const key in obj) {
      if (sensitiveFields.some(f => key.toLowerCase().includes(f))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        this.sanitizeObject(obj[key]);
      }
    }
  }
}

// 导出单例获取函数
export function getDuplexBridge(config?: Partial<BridgeConfig>): DuplexBridge {
  return DuplexBridge.getInstance(config);
}
