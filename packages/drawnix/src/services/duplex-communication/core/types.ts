/**
 * Duplex Communication Core Types
 * 
 * 定义双工通讯机制的核心类型和接口
 */

// ============================================================================
// 基础类型定义
// ============================================================================

/**
 * 消息通讯模式
 */
export enum MessageMode {
  /** 请求模式 - 需要响应 */
  REQUEST = 'request',
  /** 响应模式 - 对请求的回复 */
  RESPONSE = 'response',
  /** 推送模式 - 单向通知 */
  PUSH = 'push',
}

/**
 * 消息优先级
 */
export enum MessagePriority {
  /** 低优先级 - 普通消息 */
  LOW = 0,
  /** 正常优先级 - 默认级别 */
  NORMAL = 1,
  /** 高优先级 - 重要消息 */
  HIGH = 2,
  /** 紧急优先级 - 立即处理 */
  URGENT = 3,
}

/**
 * 消息状态
 */
export enum MessageStatus {
  /** 待发送 */
  PENDING = 'pending',
  /** 已发送 */
  SENT = 'sent',
  /** 已接收 */
  RECEIVED = 'received',
  /** 处理中 */
  PROCESSING = 'processing',
  /** 已完成 */
  COMPLETED = 'completed',
  /** 已失败 */
  FAILED = 'failed',
  /** 已超时 */
  TIMEOUT = 'timeout',
  /** 已取消 */
  CANCELLED = 'cancelled',
}

// ============================================================================
// 核心消息接口
// ============================================================================

/**
 * 双工通讯消息基础接口
 */
export interface DuplexMessage {
  /** 消息唯一标识符 (UUID v4) */
  id: string;
  
  /** 消息类型标识 */
  type: string;
  
  /** 通讯模式 */
  mode: MessageMode;
  
  /** 消息创建时间戳 (Unix milliseconds) */
  timestamp: number;
  
  /** 消息优先级 */
  priority?: MessagePriority;
  
  /** 消息载荷数据 */
  data?: unknown;
  
  /** 消息元数据 */
  metadata?: MessageMetadata;
}

/**
 * 请求消息接口
 */
export interface RequestMessage extends DuplexMessage {
  mode: MessageMode.REQUEST;
  
  /** 请求超时时间 (毫秒) */
  timeout?: number;
  
  /** 是否需要确认收到 */
  requiresAck?: boolean;
  
  /** 重试配置 */
  retryConfig?: RetryConfig;
}

/**
 * 响应消息接口
 */
export interface ResponseMessage extends DuplexMessage {
  mode: MessageMode.RESPONSE;
  
  /** 关联的请求消息ID */
  requestId: string;
  
  /** 响应状态 */
  status: 'success' | 'error';
  
  /** 错误信息 (status为error时) */
  error?: ErrorInfo;
}

/**
 * 推送消息接口
 */
export interface PushMessage extends DuplexMessage {
  mode: MessageMode.PUSH;
  
  /** 事件类型 */
  eventType: string;
  
  /** 目标客户端ID (可选，为空则广播) */
  targetClientId?: string;
  
  /** 是否需要持久化 */
  persistent?: boolean;
}

/**
 * 消息元数据
 */
export interface MessageMetadata {
  /** 发送方标识 */
  sender?: string;
  
  /** 接收方标识 */
  receiver?: string;
  
  /** 消息来源 */
  source?: 'main-thread' | 'service-worker' | 'debug-panel';
  
  /** 消息路由信息 */
  route?: string[];
  
  /** 自定义标签 */
  tags?: string[];
  
  /** 关联的会话ID */
  sessionId?: string;
  
  /** 批处理ID */
  batchId?: string;
  
  /** 调试信息 */
  debug?: {
    /** 是否记录到调试面板 */
    logToPanel?: boolean;
    /** 调试级别 */
    level?: 'debug' | 'info' | 'warn' | 'error';
    /** 调试标签 */
    tags?: string[];
  };
}

/**
 * 错误信息接口
 */
export interface ErrorInfo {
  /** 错误代码 */
  code: string;
  
  /** 错误消息 */
  message: string;
  
  /** 错误详情 */
  details?: unknown;
  
  /** 错误堆栈 */
  stack?: string;
  
  /** 是否可重试 */
  retryable?: boolean;
}

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxAttempts: number;
  
  /** 重试间隔 (毫秒) */
  interval: number;
  
  /** 退避策略 */
  backoff?: 'fixed' | 'linear' | 'exponential';
  
  /** 退避倍数 (用于linear和exponential) */
  backoffMultiplier?: number;
  
  /** 最大重试间隔 */
  maxInterval?: number;
  
  /** 重试条件判断函数 */
  shouldRetry?: (error: ErrorInfo) => boolean;
}

// ============================================================================
// 请求-响应类型定义
// ============================================================================

/**
 * 待处理的请求信息
 */
export interface PendingRequest {
  /** 请求消息 */
  message: RequestMessage;
  
  /** Promise resolve 函数 */
  resolve: (value: unknown) => void;
  
  /** Promise reject 函数 */
  reject: (error: Error) => void;
  
  /** 超时定时器 */
  timeoutHandle?: ReturnType<typeof setTimeout>;
  
  /** 重试次数 */
  retryCount: number;
  
  /** 创建时间 */
  createdAt: number;
  
  /** 最后重试时间 */
  lastRetryAt?: number;
}

/**
 * 消息处理器接口
 */
export interface MessageHandler {
  /** 处理器名称 */
  name: string;
  
  /** 支持的消息类型 */
  supportedTypes: string[];
  
  /** 处理消息 */
  handle: (message: DuplexMessage) => Promise<unknown>;
  
  /** 是否可以处理该消息类型 */
  canHandle: (messageType: string) => boolean;
  
  /** 处理器优先级 */
  priority?: number;
}

/**
 * 消息路由器接口
 */
export interface MessageRouter {
  /** 注册消息处理器 */
  registerHandler(handler: MessageHandler): void;
  
  /** 注销消息处理器 */
  unregisterHandler(handlerName: string): void;
  
  /** 路由消息到对应处理器 */
  route(message: DuplexMessage): Promise<unknown>;
  
  /** 获取所有注册的处理器 */
  getHandlers(): MessageHandler[];
}

// ============================================================================
// 事件系统类型
// ============================================================================

/**
 * 事件监听器接口
 */
export interface EventListener<T = unknown> {
  (event: T): void | Promise<void>;
}

/**
 * 事件发射器接口
 */
export interface EventEmitter {
  /** 注册事件监听器 */
  on<T = unknown>(eventType: string, listener: EventListener<T>): void;
  
  /** 注册一次性事件监听器 */
  once<T = unknown>(eventType: string, listener: EventListener<T>): void;
  
  /** 移除事件监听器 */
  off<T = unknown>(eventType: string, listener: EventListener<T>): void;
  
  /** 触发事件 */
  emit<T = unknown>(eventType: string, data: T): void;
  
  /** 移除所有监听器 */
  removeAllListeners(eventType?: string): void;
}

// ============================================================================
// 配置接口
// ============================================================================

/**
 * 双工通讯配置
 */
export interface DuplexConfig {
  /** 默认请求超时时间 (毫秒) */
  defaultTimeout: number;
  
  /** 默认重试配置 */
  defaultRetryConfig: RetryConfig;
  
  /** 消息队列最大长度 */
  maxQueueSize: number;
  
  /** 是否启用调试模式 */
  debug: boolean;
  
  /** 调试面板配置 */
  debugPanel?: {
    /** 是否自动记录所有消息 */
    autoLog: boolean;
    /** 日志级别过滤 */
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    /** 最大日志条数 */
    maxLogEntries: number;
  };
  
  /** 性能监控配置 */
  performance?: {
    /** 是否启用性能监控 */
    enabled: boolean;
    /** 性能数据采样率 (0-1) */
    sampleRate: number;
    /** 慢请求阈值 (毫秒) */
    slowRequestThreshold: number;
  };
}

/**
 * 默认配置
 */
export const DEFAULT_DUPLEX_CONFIG: DuplexConfig = {
  defaultTimeout: 30000, // 30秒
  defaultRetryConfig: {
    maxAttempts: 3,
    interval: 1000,
    backoff: 'exponential',
    backoffMultiplier: 2,
    maxInterval: 10000,
  },
  maxQueueSize: 1000,
  debug: false,
  debugPanel: {
    autoLog: true,
    logLevel: 'info',
    maxLogEntries: 1000,
  },
  performance: {
    enabled: true,
    sampleRate: 0.1,
    slowRequestThreshold: 5000,
  },
};

// ============================================================================
// 统计和监控类型
// ============================================================================

/**
 * 消息统计信息
 */
export interface MessageStats {
  /** 总消息数 */
  totalMessages: number;
  
  /** 成功消息数 */
  successMessages: number;
  
  /** 失败消息数 */
  failedMessages: number;
  
  /** 超时消息数 */
  timeoutMessages: number;
  
  /** 平均响应时间 (毫秒) */
  averageResponseTime: number;
  
  /** 最大响应时间 (毫秒) */
  maxResponseTime: number;
  
  /** 最小响应时间 (毫秒) */
  minResponseTime: number;
  
  /** 按消息类型分组的统计 */
  byType: Record<string, {
    count: number;
    averageTime: number;
    successRate: number;
  }>;
  
  /** 统计时间范围 */
  timeRange: {
    start: number;
    end: number;
  };
}

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  /** 消息吞吐量 (消息/秒) */
  throughput: number;
  
  /** 队列长度 */
  queueLength: number;
  
  /** 活跃连接数 */
  activeConnections: number;
  
  /** 内存使用情况 */
  memoryUsage: {
    /** 待处理请求数 */
    pendingRequests: number;
    /** 缓存消息数 */
    cachedMessages: number;
    /** 估计内存占用 (字节) */
    estimatedBytes: number;
  };
  
  /** 错误率 */
  errorRate: number;
  
  /** 最近的慢请求 */
  slowRequests: Array<{
    messageId: string;
    type: string;
    duration: number;
    timestamp: number;
  }>;
}

// ============================================================================
// 导出联合类型
// ============================================================================

/**
 * 所有消息类型的联合
 */
export type AnyMessage = RequestMessage | ResponseMessage | PushMessage;

/**
 * 消息处理结果
 */
export type MessageResult<T = unknown> = {
  success: true;
  data: T;
} | {
  success: false;
  error: ErrorInfo;
};

/**
 * 消息过滤器函数
 */
export type MessageFilter = (message: DuplexMessage) => boolean;

/**
 * 消息转换器函数
 */
export type MessageTransformer<T = unknown, R = unknown> = (data: T) => R;