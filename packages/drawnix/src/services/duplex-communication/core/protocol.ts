/**
 * Duplex Communication Protocol
 * 
 * 定义双工通讯协议的消息类型、验证规则和序列化方法
 */

import { 
  DuplexMessage, 
  RequestMessage, 
  ResponseMessage, 
  PushMessage,
  MessageMode,
  MessagePriority,
  ErrorInfo,
  MessageMetadata,
} from './types';

// ============================================================================
// 消息类型常量
// ============================================================================

/**
 * 系统级消息类型
 */
export const SYSTEM_MESSAGE_TYPES = {
  // 连接管理
  PING: 'SYSTEM_PING',
  PONG: 'SYSTEM_PONG',
  CONNECT: 'SYSTEM_CONNECT',
  DISCONNECT: 'SYSTEM_DISCONNECT',
  
  // 配置管理
  CONFIG_UPDATE: 'SYSTEM_CONFIG_UPDATE',
  CONFIG_REQUEST: 'SYSTEM_CONFIG_REQUEST',
  
  // 状态同步
  STATUS_REQUEST: 'SYSTEM_STATUS_REQUEST',
  STATUS_RESPONSE: 'SYSTEM_STATUS_RESPONSE',
  
  // 错误处理
  ERROR_REPORT: 'SYSTEM_ERROR_REPORT',
  
  // 调试支持
  DEBUG_ENABLE: 'SYSTEM_DEBUG_ENABLE',
  DEBUG_DISABLE: 'SYSTEM_DEBUG_DISABLE',
  DEBUG_LOG: 'SYSTEM_DEBUG_LOG',
} as const;

/**
 * TaskQueue 相关消息类型 (兼容现有系统)
 */
export const TASK_MESSAGE_TYPES = {
  // 初始化和配置
  INIT: 'TASK_INIT',
  UPDATE_CONFIG: 'TASK_UPDATE_CONFIG',
  
  // 任务管理
  SUBMIT: 'TASK_SUBMIT',
  CANCEL: 'TASK_CANCEL',
  RETRY: 'TASK_RETRY',
  DELETE: 'TASK_DELETE',
  
  // 状态查询
  GET_STATUS: 'TASK_GET_STATUS',
  GET_ALL: 'TASK_GET_ALL',
  GET_PAGINATED: 'TASK_GET_PAGINATED',
  
  // 状态推送
  STATUS_UPDATE: 'TASK_STATUS_UPDATE',
  COMPLETED: 'TASK_COMPLETED',
  FAILED: 'TASK_FAILED',
  PROGRESS: 'TASK_PROGRESS',
  
  // 批量操作
  BATCH_SUBMIT: 'TASK_BATCH_SUBMIT',
  BATCH_CANCEL: 'TASK_BATCH_CANCEL',
} as const;

/**
 * Workflow 相关消息类型
 */
export const WORKFLOW_MESSAGE_TYPES = {
  // 工作流管理
  SUBMIT: 'WORKFLOW_SUBMIT',
  CANCEL: 'WORKFLOW_CANCEL',
  PAUSE: 'WORKFLOW_PAUSE',
  RESUME: 'WORKFLOW_RESUME',
  
  // 状态查询
  GET_STATUS: 'WORKFLOW_GET_STATUS',
  GET_HISTORY: 'WORKFLOW_GET_HISTORY',
  
  // 状态推送
  STATUS_UPDATE: 'WORKFLOW_STATUS_UPDATE',
  STEP_UPDATE: 'WORKFLOW_STEP_UPDATE',
  COMPLETED: 'WORKFLOW_COMPLETED',
  FAILED: 'WORKFLOW_FAILED',
  
  // 工具执行
  TOOL_REQUEST: 'WORKFLOW_TOOL_REQUEST',
  TOOL_RESPONSE: 'WORKFLOW_TOOL_RESPONSE',
  
  // 画布操作
  CANVAS_OPERATION: 'WORKFLOW_CANVAS_OPERATION',
} as const;

/**
 * Chat 相关消息类型
 */
export const CHAT_MESSAGE_TYPES = {
  // 聊天管理
  START: 'CHAT_START',
  STOP: 'CHAT_STOP',
  
  // 流式响应
  CHUNK: 'CHAT_CHUNK',
  DONE: 'CHAT_DONE',
  ERROR: 'CHAT_ERROR',
  
  // 缓存管理
  GET_CACHED: 'CHAT_GET_CACHED',
  CLEAR_CACHE: 'CHAT_CLEAR_CACHE',
} as const;

/**
 * 所有消息类型
 */
export const MESSAGE_TYPES = {
  SYSTEM: SYSTEM_MESSAGE_TYPES,
  TASK: TASK_MESSAGE_TYPES,
  WORKFLOW: WORKFLOW_MESSAGE_TYPES,
  CHAT: CHAT_MESSAGE_TYPES,
} as const;

// ============================================================================
// 消息构建器
// ============================================================================

/**
 * 生成唯一消息ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 创建请求消息
 */
export function createRequestMessage(
  type: string,
  data?: unknown,
  options: {
    timeout?: number;
    priority?: MessagePriority;
    requiresAck?: boolean;
    metadata?: Partial<MessageMetadata>;
  } = {}
): RequestMessage {
  return {
    id: generateMessageId(),
    type,
    mode: MessageMode.REQUEST,
    timestamp: Date.now(),
    priority: options.priority || MessagePriority.NORMAL,
    data,
    timeout: options.timeout,
    requiresAck: options.requiresAck,
    metadata: {
      source: 'main-thread',
      ...options.metadata,
    },
  };
}

/**
 * 创建响应消息
 */
export function createResponseMessage(
  requestId: string,
  result: unknown,
  error?: ErrorInfo,
  options: {
    metadata?: Partial<MessageMetadata>;
  } = {}
): ResponseMessage {
  return {
    id: generateMessageId(),
    type: 'RESPONSE',
    mode: MessageMode.RESPONSE,
    timestamp: Date.now(),
    requestId,
    status: error ? 'error' : 'success',
    data: result,
    error,
    metadata: {
      source: 'service-worker',
      ...options.metadata,
    },
  };
}

/**
 * 创建推送消息
 */
export function createPushMessage(
  type: string,
  eventType: string,
  data?: unknown,
  options: {
    targetClientId?: string;
    priority?: MessagePriority;
    persistent?: boolean;
    metadata?: Partial<MessageMetadata>;
  } = {}
): PushMessage {
  return {
    id: generateMessageId(),
    type,
    mode: MessageMode.PUSH,
    timestamp: Date.now(),
    priority: options.priority || MessagePriority.NORMAL,
    eventType,
    data,
    targetClientId: options.targetClientId,
    persistent: options.persistent,
    metadata: {
      source: 'service-worker',
      ...options.metadata,
    },
  };
}

// ============================================================================
// 消息验证
// ============================================================================

/**
 * 验证消息基础结构
 */
export function validateMessage(message: unknown): message is DuplexMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const msg = message as any;
  
  // 检查必需字段
  if (!msg.id || typeof msg.id !== 'string') return false;
  if (!msg.type || typeof msg.type !== 'string') return false;
  if (!msg.mode || !Object.values(MessageMode).includes(msg.mode)) return false;
  if (!msg.timestamp || typeof msg.timestamp !== 'number') return false;

  return true;
}

/**
 * 验证请求消息
 */
export function validateRequestMessage(message: unknown): message is RequestMessage {
  if (!validateMessage(message)) return false;
  
  const msg = message as DuplexMessage;
  return msg.mode === MessageMode.REQUEST;
}

/**
 * 验证响应消息
 */
export function validateResponseMessage(message: unknown): message is ResponseMessage {
  if (!validateMessage(message)) return false;
  
  const msg = message as any;
  if (msg.mode !== MessageMode.RESPONSE) return false;
  if (!msg.requestId || typeof msg.requestId !== 'string') return false;
  if (!msg.status || !['success', 'error'].includes(msg.status)) return false;
  
  return true;
}

/**
 * 验证推送消息
 */
export function validatePushMessage(message: unknown): message is PushMessage {
  if (!validateMessage(message)) return false;
  
  const msg = message as any;
  if (msg.mode !== MessageMode.PUSH) return false;
  if (!msg.eventType || typeof msg.eventType !== 'string') return false;
  
  return true;
}

// ============================================================================
// 消息序列化
// ============================================================================

/**
 * 序列化消息 (准备通过 postMessage 发送)
 */
export function serializeMessage(message: DuplexMessage): string {
  try {
    // 移除不可序列化的字段
    const serializable = {
      ...message,
      // 移除函数类型的字段
      retryConfig: message.mode === MessageMode.REQUEST && (message as RequestMessage).retryConfig
        ? {
            ...(message as RequestMessage).retryConfig!,
            shouldRetry: undefined, // 移除函数
          }
        : undefined,
    };
    
    return JSON.stringify(serializable);
  } catch (error) {
    throw new Error(`Failed to serialize message: ${error}`);
  }
}

/**
 * 反序列化消息
 */
export function deserializeMessage(data: string): DuplexMessage {
  try {
    const message = JSON.parse(data);
    
    if (!validateMessage(message)) {
      throw new Error('Invalid message format');
    }
    
    return message;
  } catch (error) {
    throw new Error(`Failed to deserialize message: ${error}`);
  }
}

// ============================================================================
// 消息路由辅助函数
// ============================================================================

/**
 * 检查消息是否为系统消息
 */
export function isSystemMessage(message: DuplexMessage): boolean {
  return Object.values(SYSTEM_MESSAGE_TYPES).includes(message.type as any);
}

/**
 * 检查消息是否为任务相关消息
 */
export function isTaskMessage(message: DuplexMessage): boolean {
  return Object.values(TASK_MESSAGE_TYPES).includes(message.type as any);
}

/**
 * 检查消息是否为工作流相关消息
 */
export function isWorkflowMessage(message: DuplexMessage): boolean {
  return Object.values(WORKFLOW_MESSAGE_TYPES).includes(message.type as any);
}

/**
 * 检查消息是否为聊天相关消息
 */
export function isChatMessage(message: DuplexMessage): boolean {
  return Object.values(CHAT_MESSAGE_TYPES).includes(message.type as any);
}

/**
 * 获取消息类别
 */
export function getMessageCategory(message: DuplexMessage): string {
  if (isSystemMessage(message)) return 'system';
  if (isTaskMessage(message)) return 'task';
  if (isWorkflowMessage(message)) return 'workflow';
  if (isChatMessage(message)) return 'chat';
  return 'unknown';
}

// ============================================================================
// 错误处理辅助函数
// ============================================================================

/**
 * 创建标准错误信息
 */
export function createErrorInfo(
  code: string,
  message: string,
  details?: unknown,
  retryable: boolean = false
): ErrorInfo {
  return {
    code,
    message,
    details,
    retryable,
    stack: new Error().stack,
  };
}

/**
 * 常见错误代码
 */
export const ERROR_CODES = {
  // 通用错误
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  SERIALIZATION_ERROR: 'SERIALIZATION_ERROR',
  
  // 网络错误
  TIMEOUT: 'TIMEOUT',
  CONNECTION_LOST: 'CONNECTION_LOST',
  NETWORK_ERROR: 'NETWORK_ERROR',
  
  // 处理错误
  HANDLER_NOT_FOUND: 'HANDLER_NOT_FOUND',
  HANDLER_ERROR: 'HANDLER_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  
  // 系统错误
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  
  // 权限错误
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
} as const;

// ============================================================================
// 兼容性适配器
// ============================================================================

/**
 * 将现有 TaskQueue 消息转换为双工消息格式
 */
export function adaptTaskQueueMessage(legacyMessage: any): DuplexMessage {
  const messageTypeMap: Record<string, string> = {
    'TASK_QUEUE_INIT': TASK_MESSAGE_TYPES.INIT,
    'TASK_SUBMIT': TASK_MESSAGE_TYPES.SUBMIT,
    'TASK_CANCEL': TASK_MESSAGE_TYPES.CANCEL,
    'TASK_STATUS': TASK_MESSAGE_TYPES.STATUS_UPDATE,
    'TASK_COMPLETED': TASK_MESSAGE_TYPES.COMPLETED,
    'TASK_FAILED': TASK_MESSAGE_TYPES.FAILED,
    // 添加更多映射...
  };

  const duplexType = messageTypeMap[legacyMessage.type] || legacyMessage.type;
  
  // 根据消息类型判断模式
  let mode: MessageMode;
  if (legacyMessage.type.includes('_RESPONSE') || 
      legacyMessage.type === 'TASK_STATUS' ||
      legacyMessage.type === 'TASK_COMPLETED' ||
      legacyMessage.type === 'TASK_FAILED') {
    mode = MessageMode.PUSH;
  } else {
    mode = MessageMode.REQUEST;
  }

  return {
    id: legacyMessage.id || generateMessageId(),
    type: duplexType,
    mode,
    timestamp: legacyMessage.timestamp || Date.now(),
    data: legacyMessage,
    metadata: {
      source: 'legacy-adapter',
      tags: ['legacy', 'task-queue'],
    },
  };
}

/**
 * 将现有 Workflow 消息转换为双工消息格式
 */
export function adaptWorkflowMessage(legacyMessage: any): DuplexMessage {
  const messageTypeMap: Record<string, string> = {
    'WORKFLOW_SUBMIT': WORKFLOW_MESSAGE_TYPES.SUBMIT,
    'WORKFLOW_CANCEL': WORKFLOW_MESSAGE_TYPES.CANCEL,
    'WORKFLOW_STATUS': WORKFLOW_MESSAGE_TYPES.STATUS_UPDATE,
    'WORKFLOW_STEP_STATUS': WORKFLOW_MESSAGE_TYPES.STEP_UPDATE,
    // 添加更多映射...
  };

  const duplexType = messageTypeMap[legacyMessage.type] || legacyMessage.type;
  
  let mode: MessageMode;
  if (legacyMessage.type.includes('_STATUS') || 
      legacyMessage.type.includes('_UPDATE')) {
    mode = MessageMode.PUSH;
  } else {
    mode = MessageMode.REQUEST;
  }

  return {
    id: legacyMessage.id || generateMessageId(),
    type: duplexType,
    mode,
    timestamp: legacyMessage.timestamp || Date.now(),
    data: legacyMessage,
    metadata: {
      source: 'legacy-adapter',
      tags: ['legacy', 'workflow'],
    },
  };
}