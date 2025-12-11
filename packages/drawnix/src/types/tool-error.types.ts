/**
 * Tool Error Type Definitions
 *
 * 工具加载错误类型定义
 */

/**
 * 工具加载错误类型
 */
export enum ToolErrorType {
  /** 加载失败 - iframe onerror */
  LOAD_FAILED = 'load-failed',

  /** CORS 阻止 - X-Frame-Options */
  CORS_BLOCKED = 'cors-blocked',

  /** 权限被拒绝 - iframe sandbox */
  PERMISSION_DENIED = 'permission-denied',

  /** 加载超时 - 超过 10 秒 */
  TIMEOUT = 'timeout',
}

/**
 * 工具加载状态
 */
export interface ToolLoadState {
  /** 加载状态 */
  status: 'loading' | 'loaded' | 'error';

  /** 错误类型 */
  errorType?: ToolErrorType;

  /** 错误消息 */
  errorMessage?: string;

  /** 加载开始时间 */
  loadStartTime: number;

  /** 重试次数 */
  retryCount: number;
}

/**
 * 工具错误事件详情
 */
export interface ToolErrorEventDetail {
  /** 工具元素 ID */
  elementId: string;

  /** 错误类型 */
  errorType: ToolErrorType;

  /** 错误消息 */
  errorMessage?: string;
}
