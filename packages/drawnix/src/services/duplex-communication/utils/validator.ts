/**
 * Message Validator
 * 
 * 提供消息验证、格式检查和数据清理功能
 */

import {
  DuplexMessage,
  RequestMessage,
  ResponseMessage,
  PushMessage,
  MessageMode,
  MessagePriority,
  ErrorInfo,
  RetryConfig,
} from '../core/types';

// ============================================================================
// 验证结果类型
// ============================================================================

export interface ValidationResult {
  /** 验证是否通过 */
  valid: boolean;
  
  /** 错误信息列表 */
  errors: string[];
  
  /** 警告信息列表 */
  warnings: string[];
  
  /** 清理后的数据 (如果需要) */
  cleaned?: unknown;
}

// ============================================================================
// 基础验证函数
// ============================================================================

/**
 * 验证字符串字段
 */
function validateString(
  value: unknown,
  fieldName: string,
  options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
  } = {}
): string[] {
  const errors: string[] = [];
  
  if (options.required && (value === undefined || value === null)) {
    errors.push(`${fieldName} is required`);
    return errors;
  }
  
  if (value !== undefined && value !== null) {
    if (typeof value !== 'string') {
      errors.push(`${fieldName} must be a string`);
      return errors;
    }
    
    if (options.minLength !== undefined && value.length < options.minLength) {
      errors.push(`${fieldName} must be at least ${options.minLength} characters`);
    }
    
    if (options.maxLength !== undefined && value.length > options.maxLength) {
      errors.push(`${fieldName} must be at most ${options.maxLength} characters`);
    }
    
    if (options.pattern && !options.pattern.test(value)) {
      errors.push(`${fieldName} format is invalid`);
    }
  }
  
  return errors;
}

/**
 * 验证数字字段
 */
function validateNumber(
  value: unknown,
  fieldName: string,
  options: {
    required?: boolean;
    min?: number;
    max?: number;
    integer?: boolean;
  } = {}
): string[] {
  const errors: string[] = [];
  
  if (options.required && (value === undefined || value === null)) {
    errors.push(`${fieldName} is required`);
    return errors;
  }
  
  if (value !== undefined && value !== null) {
    if (typeof value !== 'number' || isNaN(value)) {
      errors.push(`${fieldName} must be a valid number`);
      return errors;
    }
    
    if (options.integer && !Number.isInteger(value)) {
      errors.push(`${fieldName} must be an integer`);
    }
    
    if (options.min !== undefined && value < options.min) {
      errors.push(`${fieldName} must be at least ${options.min}`);
    }
    
    if (options.max !== undefined && value > options.max) {
      errors.push(`${fieldName} must be at most ${options.max}`);
    }
  }
  
  return errors;
}

/**
 * 验证枚举字段
 */
function validateEnum<T>(
  value: unknown,
  fieldName: string,
  enumValues: T[],
  required: boolean = false
): string[] {
  const errors: string[] = [];
  
  if (required && (value === undefined || value === null)) {
    errors.push(`${fieldName} is required`);
    return errors;
  }
  
  if (value !== undefined && value !== null) {
    if (!enumValues.includes(value as T)) {
      errors.push(`${fieldName} must be one of: ${enumValues.join(', ')}`);
    }
  }
  
  return errors;
}

// ============================================================================
// 消息ID验证
// ============================================================================

/**
 * 消息ID格式正则表达式
 */
const MESSAGE_ID_PATTERN = /^msg_\d+_[a-z0-9]{9}$/;

/**
 * 验证消息ID格式
 */
export function validateMessageId(id: unknown): ValidationResult {
  const errors = validateString(id, 'id', {
    required: true,
    pattern: MESSAGE_ID_PATTERN,
  });
  
  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
  };
}

// ============================================================================
// 基础消息验证
// ============================================================================

/**
 * 验证基础消息结构
 */
export function validateBaseMessage(message: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!message || typeof message !== 'object') {
    return {
      valid: false,
      errors: ['Message must be an object'],
      warnings: [],
    };
  }
  
  const msg = message as any;
  
  // 验证必需字段
  errors.push(...validateString(msg.id, 'id', { required: true }));
  errors.push(...validateString(msg.type, 'type', { required: true, minLength: 1 }));
  errors.push(...validateEnum(msg.mode, 'mode', Object.values(MessageMode), true));
  errors.push(...validateNumber(msg.timestamp, 'timestamp', { required: true, min: 0 }));
  
  // 验证可选字段
  if (msg.priority !== undefined) {
    errors.push(...validateEnum(msg.priority, 'priority', Object.values(MessagePriority)));
  }
  
  // 验证时间戳合理性
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneHourLater = now + 60 * 60 * 1000;
  
  if (msg.timestamp < oneHourAgo) {
    warnings.push('Message timestamp is more than 1 hour old');
  } else if (msg.timestamp > oneHourLater) {
    warnings.push('Message timestamp is in the future');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// 请求消息验证
// ============================================================================

/**
 * 验证重试配置
 */
function validateRetryConfig(config: unknown): string[] {
  const errors: string[] = [];
  
  if (!config || typeof config !== 'object') {
    return ['retryConfig must be an object'];
  }
  
  const retry = config as any;
  
  errors.push(...validateNumber(retry.maxAttempts, 'retryConfig.maxAttempts', {
    required: true,
    min: 1,
    max: 10,
    integer: true,
  }));
  
  errors.push(...validateNumber(retry.interval, 'retryConfig.interval', {
    required: true,
    min: 100,
    max: 60000,
    integer: true,
  }));
  
  if (retry.backoff !== undefined) {
    errors.push(...validateEnum(retry.backoff, 'retryConfig.backoff', 
      ['fixed', 'linear', 'exponential']));
  }
  
  if (retry.backoffMultiplier !== undefined) {
    errors.push(...validateNumber(retry.backoffMultiplier, 'retryConfig.backoffMultiplier', {
      min: 1,
      max: 10,
    }));
  }
  
  if (retry.maxInterval !== undefined) {
    errors.push(...validateNumber(retry.maxInterval, 'retryConfig.maxInterval', {
      min: retry.interval || 1000,
      max: 300000,
      integer: true,
    }));
  }
  
  return errors;
}

/**
 * 验证请求消息
 */
export function validateRequestMessage(message: unknown): ValidationResult {
  const baseResult = validateBaseMessage(message);
  if (!baseResult.valid) {
    return baseResult;
  }
  
  const errors = [...baseResult.errors];
  const warnings = [...baseResult.warnings];
  
  const msg = message as any;
  
  // 验证模式
  if (msg.mode !== MessageMode.REQUEST) {
    errors.push('Message mode must be REQUEST');
  }
  
  // 验证超时时间
  if (msg.timeout !== undefined) {
    errors.push(...validateNumber(msg.timeout, 'timeout', {
      min: 1000,    // 最少1秒
      max: 300000,  // 最多5分钟
      integer: true,
    }));
  }
  
  // 验证重试配置
  if (msg.retryConfig !== undefined) {
    errors.push(...validateRetryConfig(msg.retryConfig));
  }
  
  // 验证数据大小
  if (msg.data !== undefined) {
    try {
      const dataSize = JSON.stringify(msg.data).length;
      if (dataSize > 1024 * 1024) { // 1MB
        warnings.push('Message data is larger than 1MB, consider using streaming');
      }
    } catch {
      warnings.push('Message data contains non-serializable content');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// 响应消息验证
// ============================================================================

/**
 * 验证错误信息
 */
function validateErrorInfo(error: unknown): string[] {
  const errors: string[] = [];
  
  if (!error || typeof error !== 'object') {
    return ['error must be an object'];
  }
  
  const err = error as any;
  
  errors.push(...validateString(err.code, 'error.code', { required: true, minLength: 1 }));
  errors.push(...validateString(err.message, 'error.message', { required: true, minLength: 1 }));
  
  if (err.retryable !== undefined && typeof err.retryable !== 'boolean') {
    errors.push('error.retryable must be a boolean');
  }
  
  return errors;
}

/**
 * 验证响应消息
 */
export function validateResponseMessage(message: unknown): ValidationResult {
  const baseResult = validateBaseMessage(message);
  if (!baseResult.valid) {
    return baseResult;
  }
  
  const errors = [...baseResult.errors];
  const warnings = [...baseResult.warnings];
  
  const msg = message as any;
  
  // 验证模式
  if (msg.mode !== MessageMode.RESPONSE) {
    errors.push('Message mode must be RESPONSE');
  }
  
  // 验证请求ID
  errors.push(...validateString(msg.requestId, 'requestId', { required: true }));
  
  // 验证状态
  errors.push(...validateEnum(msg.status, 'status', ['success', 'error'], true));
  
  // 验证错误信息
  if (msg.status === 'error') {
    if (!msg.error) {
      errors.push('error field is required when status is error');
    } else {
      errors.push(...validateErrorInfo(msg.error));
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// 推送消息验证
// ============================================================================

/**
 * 验证推送消息
 */
export function validatePushMessage(message: unknown): ValidationResult {
  const baseResult = validateBaseMessage(message);
  if (!baseResult.valid) {
    return baseResult;
  }
  
  const errors = [...baseResult.errors];
  const warnings = [...baseResult.warnings];
  
  const msg = message as any;
  
  // 验证模式
  if (msg.mode !== MessageMode.PUSH) {
    errors.push('Message mode must be PUSH');
  }
  
  // 验证事件类型
  errors.push(...validateString(msg.eventType, 'eventType', { 
    required: true, 
    minLength: 1,
    maxLength: 100,
  }));
  
  // 验证目标客户端ID
  if (msg.targetClientId !== undefined) {
    errors.push(...validateString(msg.targetClientId, 'targetClientId', { minLength: 1 }));
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// 综合消息验证
// ============================================================================

/**
 * 验证任意类型的双工消息
 */
export function validateDuplexMessage(message: unknown): ValidationResult {
  const baseResult = validateBaseMessage(message);
  if (!baseResult.valid) {
    return baseResult;
  }
  
  const msg = message as DuplexMessage;
  
  switch (msg.mode) {
    case MessageMode.REQUEST:
      return validateRequestMessage(message);
    case MessageMode.RESPONSE:
      return validateResponseMessage(message);
    case MessageMode.PUSH:
      return validatePushMessage(message);
    default:
      return {
        valid: false,
        errors: [`Unknown message mode: ${msg.mode}`],
        warnings: [],
      };
  }
}

// ============================================================================
// 数据清理和标准化
// ============================================================================

/**
 * 清理和标准化消息数据
 */
export function sanitizeMessage(message: DuplexMessage): DuplexMessage {
  const sanitized = { ...message };
  
  // 确保时间戳是合理的
  const now = Date.now();
  if (!sanitized.timestamp || sanitized.timestamp > now + 60000) {
    sanitized.timestamp = now;
  }
  
  // 设置默认优先级
  if (sanitized.priority === undefined) {
    sanitized.priority = MessagePriority.NORMAL;
  }
  
  // 清理元数据
  if (sanitized.metadata) {
    // 移除空值
    Object.keys(sanitized.metadata).forEach(key => {
      if (sanitized.metadata![key as keyof typeof sanitized.metadata] === undefined ||
          sanitized.metadata![key as keyof typeof sanitized.metadata] === null) {
        delete sanitized.metadata![key as keyof typeof sanitized.metadata];
      }
    });
    
    // 如果元数据为空，则移除
    if (Object.keys(sanitized.metadata).length === 0) {
      delete sanitized.metadata;
    }
  }
  
  // 特定类型的清理
  if (sanitized.mode === MessageMode.REQUEST) {
    const req = sanitized as RequestMessage;
    
    // 设置默认超时
    if (!req.timeout) {
      req.timeout = 30000; // 30秒
    }
    
    // 限制超时范围
    if (req.timeout < 1000) req.timeout = 1000;
    if (req.timeout > 300000) req.timeout = 300000;
  }
  
  return sanitized;
}

// ============================================================================
// 批量验证
// ============================================================================

/**
 * 批量验证消息
 */
export function validateMessages(messages: unknown[]): {
  valid: DuplexMessage[];
  invalid: Array<{ message: unknown; errors: string[] }>;
  warnings: string[];
} {
  const valid: DuplexMessage[] = [];
  const invalid: Array<{ message: unknown; errors: string[] }> = [];
  const allWarnings: string[] = [];
  
  messages.forEach((message, index) => {
    const result = validateDuplexMessage(message);
    
    if (result.valid) {
      valid.push(sanitizeMessage(message as DuplexMessage));
    } else {
      invalid.push({
        message,
        errors: result.errors.map(err => `[${index}] ${err}`),
      });
    }
    
    if (result.warnings.length > 0) {
      allWarnings.push(...result.warnings.map(warn => `[${index}] ${warn}`));
    }
  });
  
  return {
    valid,
    invalid,
    warnings: allWarnings,
  };
}