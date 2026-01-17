/**
 * Message Router
 * 
 * 负责消息路由、处理器管理和消息分发
 */

import {
  DuplexMessage,
  MessageHandler,
  MessageRouter as IMessageRouter,
  MessageMode,
  ErrorInfo,
} from '../core/types';
import { createErrorInfo, ERROR_CODES, getMessageCategory } from '../core/protocol';

// ============================================================================
// 路由统计信息
// ============================================================================

interface RouteStats {
  /** 处理的消息总数 */
  totalMessages: number;
  
  /** 成功处理的消息数 */
  successCount: number;
  
  /** 失败处理的消息数 */
  errorCount: number;
  
  /** 平均处理时间 (毫秒) */
  averageProcessingTime: number;
  
  /** 最后处理时间 */
  lastProcessedAt: number;
  
  /** 按消息类型分组的统计 */
  byMessageType: Record<string, {
    count: number;
    averageTime: number;
    errorRate: number;
  }>;
}

// ============================================================================
// 消息路由器实现
// ============================================================================

export class MessageRouter implements IMessageRouter {
  private handlers = new Map<string, MessageHandler>();
  private wildcardHandlers: MessageHandler[] = [];
  private stats: RouteStats = {
    totalMessages: 0,
    successCount: 0,
    errorCount: 0,
    averageProcessingTime: 0,
    lastProcessedAt: 0,
    byMessageType: {},
  };
  
  private middlewares: MiddlewareFunction[] = [];
  private errorHandlers: ErrorHandlerFunction[] = [];

  /**
   * 注册消息处理器
   */
  registerHandler(handler: MessageHandler): void {
    // 验证处理器
    if (!handler.name) {
      throw new Error('Handler must have a name');
    }
    
    if (!handler.handle || typeof handler.handle !== 'function') {
      throw new Error('Handler must have a handle function');
    }
    
    if (!handler.canHandle || typeof handler.canHandle !== 'function') {
      throw new Error('Handler must have a canHandle function');
    }

    // 检查是否已存在同名处理器
    if (this.handlers.has(handler.name)) {
      console.warn(`[MessageRouter] Handler ${handler.name} already exists, replacing...`);
    }

    // 注册处理器
    this.handlers.set(handler.name, handler);
    
    // 如果是通配符处理器，也添加到通配符列表
    if (handler.supportedTypes.includes('*')) {
      this.wildcardHandlers.push(handler);
      // 按优先级排序
      this.wildcardHandlers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }

    console.log(`[MessageRouter] Registered handler: ${handler.name} for types: ${handler.supportedTypes.join(', ')}`);
  }

  /**
   * 注销消息处理器
   */
  unregisterHandler(handlerName: string): void {
    const handler = this.handlers.get(handlerName);
    if (!handler) {
      console.warn(`[MessageRouter] Handler ${handlerName} not found`);
      return;
    }

    // 从主处理器列表移除
    this.handlers.delete(handlerName);
    
    // 从通配符处理器列表移除
    const wildcardIndex = this.wildcardHandlers.findIndex(h => h.name === handlerName);
    if (wildcardIndex >= 0) {
      this.wildcardHandlers.splice(wildcardIndex, 1);
    }

    console.log(`[MessageRouter] Unregistered handler: ${handlerName}`);
  }

  /**
   * 路由消息到对应处理器
   */
  async route(message: DuplexMessage): Promise<unknown> {
    const startTime = Date.now();
    
    try {
      // 更新统计
      this.stats.totalMessages++;
      this.stats.lastProcessedAt = startTime;
      
      // 执行中间件
      const processedMessage = await this.executeMiddlewares(message);
      
      // 查找处理器
      const handler = this.findHandler(processedMessage);
      if (!handler) {
        const error = createErrorInfo(
          ERROR_CODES.HANDLER_NOT_FOUND,
          `No handler found for message type: ${processedMessage.type}`,
          { messageType: processedMessage.type, messageId: processedMessage.id }
        );
        throw new Error(error.message);
      }

      // 执行处理器
      const result = await handler.handle(processedMessage);
      
      // 更新成功统计
      this.updateStats(processedMessage, startTime, true);
      
      return result;
      
    } catch (error) {
      // 更新失败统计
      this.updateStats(message, startTime, false);
      
      // 执行错误处理器
      const handledError = await this.executeErrorHandlers(error as Error, message);
      
      throw handledError;
    }
  }

  /**
   * 获取所有注册的处理器
   */
  getHandlers(): MessageHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * 获取路由统计信息
   */
  getStats(): RouteStats {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      totalMessages: 0,
      successCount: 0,
      errorCount: 0,
      averageProcessingTime: 0,
      lastProcessedAt: 0,
      byMessageType: {},
    };
  }

  /**
   * 注册中间件
   */
  use(middleware: MiddlewareFunction): void {
    this.middlewares.push(middleware);
  }

  /**
   * 注册错误处理器
   */
  onError(errorHandler: ErrorHandlerFunction): void {
    this.errorHandlers.push(errorHandler);
  }

  /**
   * 检查是否有处理器可以处理指定类型的消息
   */
  canRoute(messageType: string): boolean {
    return this.findHandler({ type: messageType } as DuplexMessage) !== null;
  }

  /**
   * 获取支持指定消息类型的处理器列表
   */
  getHandlersForType(messageType: string): MessageHandler[] {
    const handlers: MessageHandler[] = [];
    
    // 查找精确匹配的处理器
    for (const handler of this.handlers.values()) {
      if (handler.canHandle(messageType)) {
        handlers.push(handler);
      }
    }
    
    // 添加通配符处理器
    handlers.push(...this.wildcardHandlers);
    
    // 按优先级排序
    return handlers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 查找合适的处理器
   */
  private findHandler(message: DuplexMessage): MessageHandler | null {
    // 首先查找精确匹配的处理器
    for (const handler of this.handlers.values()) {
      if (handler.canHandle(message.type)) {
        return handler;
      }
    }
    
    // 然后查找通配符处理器
    for (const handler of this.wildcardHandlers) {
      if (handler.canHandle(message.type)) {
        return handler;
      }
    }
    
    return null;
  }

  /**
   * 执行中间件
   */
  private async executeMiddlewares(message: DuplexMessage): Promise<DuplexMessage> {
    let processedMessage = message;
    
    for (const middleware of this.middlewares) {
      try {
        processedMessage = await middleware(processedMessage);
      } catch (error) {
        console.error('[MessageRouter] Middleware error:', error);
        throw error;
      }
    }
    
    return processedMessage;
  }

  /**
   * 执行错误处理器
   */
  private async executeErrorHandlers(error: Error, message: DuplexMessage): Promise<Error> {
    let processedError = error;
    
    for (const errorHandler of this.errorHandlers) {
      try {
        processedError = await errorHandler(processedError, message);
      } catch (handlerError) {
        console.error('[MessageRouter] Error handler failed:', handlerError);
        // 继续使用原始错误
      }
    }
    
    return processedError;
  }

  /**
   * 更新统计信息
   */
  private updateStats(message: DuplexMessage, startTime: number, success: boolean): void {
    const processingTime = Date.now() - startTime;
    
    if (success) {
      this.stats.successCount++;
    } else {
      this.stats.errorCount++;
    }
    
    // 更新平均处理时间
    const totalProcessedMessages = this.stats.successCount + this.stats.errorCount;
    this.stats.averageProcessingTime = 
      (this.stats.averageProcessingTime * (totalProcessedMessages - 1) + processingTime) / totalProcessedMessages;
    
    // 更新按消息类型的统计
    if (!this.stats.byMessageType[message.type]) {
      this.stats.byMessageType[message.type] = {
        count: 0,
        averageTime: 0,
        errorRate: 0,
      };
    }
    
    const typeStats = this.stats.byMessageType[message.type];
    typeStats.count++;
    typeStats.averageTime = 
      (typeStats.averageTime * (typeStats.count - 1) + processingTime) / typeStats.count;
    
    if (!success) {
      const errorCount = Math.round(typeStats.count * typeStats.errorRate) + 1;
      typeStats.errorRate = errorCount / typeStats.count;
    }
  }
}

// ============================================================================
// 中间件和错误处理器类型
// ============================================================================

/**
 * 中间件函数类型
 */
export type MiddlewareFunction = (message: DuplexMessage) => Promise<DuplexMessage>;

/**
 * 错误处理器函数类型
 */
export type ErrorHandlerFunction = (error: Error, message: DuplexMessage) => Promise<Error>;

// ============================================================================
// 内置中间件
// ============================================================================

/**
 * 日志中间件
 */
export function createLoggingMiddleware(
  options: {
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    includeData?: boolean;
  } = {}
): MiddlewareFunction {
  const { logLevel = 'debug', includeData = false } = options;
  
  return async (message: DuplexMessage): Promise<DuplexMessage> => {
    const logData = includeData 
      ? { type: message.type, mode: message.mode, data: message.data }
      : { type: message.type, mode: message.mode };
    
    switch (logLevel) {
      case 'debug':
        console.debug('[MessageRouter] Processing message:', logData);
        break;
      case 'info':
        console.info('[MessageRouter] Processing message:', logData);
        break;
      case 'warn':
        console.warn('[MessageRouter] Processing message:', logData);
        break;
      case 'error':
        console.error('[MessageRouter] Processing message:', logData);
        break;
    }
    
    return message;
  };
}

/**
 * 验证中间件
 */
export function createValidationMiddleware(): MiddlewareFunction {
  return async (message: DuplexMessage): Promise<DuplexMessage> => {
    // 这里可以添加消息验证逻辑
    // 例如检查必需字段、数据格式等
    
    if (!message.id) {
      throw new Error('Message ID is required');
    }
    
    if (!message.type) {
      throw new Error('Message type is required');
    }
    
    return message;
  };
}

/**
 * 性能监控中间件
 */
export function createPerformanceMiddleware(
  onSlowMessage?: (message: DuplexMessage, duration: number) => void,
  slowThreshold: number = 1000
): MiddlewareFunction {
  return async (message: DuplexMessage): Promise<DuplexMessage> => {
    const startTime = Date.now();
    
    // 在消息元数据中添加性能标记
    if (!message.metadata) {
      message.metadata = {};
    }
    
    message.metadata.performanceStart = startTime;
    
    // 如果有回调，设置定时器检查慢消息
    if (onSlowMessage) {
      const timer = setTimeout(() => {
        const duration = Date.now() - startTime;
        onSlowMessage(message, duration);
      }, slowThreshold);
      
      message.metadata.performanceTimer = timer as any;
    }
    
    return message;
  };
}

// ============================================================================
// 内置错误处理器
// ============================================================================

/**
 * 重试错误处理器
 */
export function createRetryErrorHandler(
  shouldRetry: (error: Error) => boolean = () => true,
  maxRetries: number = 3
): ErrorHandlerFunction {
  const retryCount = new Map<string, number>();
  
  return async (error: Error, message: DuplexMessage): Promise<Error> => {
    const messageId = message.id;
    const currentRetries = retryCount.get(messageId) || 0;
    
    if (shouldRetry(error) && currentRetries < maxRetries) {
      retryCount.set(messageId, currentRetries + 1);
      console.warn(`[MessageRouter] Retrying message ${messageId} (attempt ${currentRetries + 1}/${maxRetries})`);
      
      // 这里可以重新路由消息，但需要小心避免无限循环
      // 暂时只记录重试信息
    } else {
      retryCount.delete(messageId);
    }
    
    return error;
  };
}

/**
 * 错误报告处理器
 */
export function createErrorReportingHandler(
  onError: (error: Error, message: DuplexMessage) => void
): ErrorHandlerFunction {
  return async (error: Error, message: DuplexMessage): Promise<Error> => {
    try {
      onError(error, message);
    } catch (reportingError) {
      console.error('[MessageRouter] Error reporting failed:', reportingError);
    }
    
    return error;
  };
}