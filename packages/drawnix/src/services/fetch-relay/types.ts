/**
 * Fetch Relay Types
 *
 * SW Fetch Relay 的共享类型定义。
 * 主线程和 SW 端共用这些类型来通信。
 */

// ============================================================================
// RPC 方法名 & 事件名
// ============================================================================

/** Fetch Relay RPC 方法 (主线程 → SW) */
export const FETCH_RELAY_METHODS = {
  /** 发起一个代理 fetch 请求 */
  START: 'fetchRelay:start',
  /** 取消一个正在进行的请求 */
  CANCEL: 'fetchRelay:cancel',
  /** 恢复断开期间完成的请求结果 */
  RECOVER: 'fetchRelay:recover',
  /** 健康检查 */
  PING: 'fetchRelay:ping',
} as const;

/** Fetch Relay 事件 (SW → 主线程, broadcast) */
export const FETCH_RELAY_EVENTS = {
  /** 流式 chunk */
  STREAM_CHUNK: 'fetchRelay:chunk',
  /** 流式完成 */
  STREAM_DONE: 'fetchRelay:done',
  /** 流式错误 */
  STREAM_ERROR: 'fetchRelay:error',
} as const;

// ============================================================================
// 请求 & 响应类型
// ============================================================================

/** 发起 fetch 请求的参数 */
export interface FetchRelayRequest {
  /** 唯一请求 ID */
  requestId: string;
  /** 请求 URL */
  url: string;
  /** HTTP 方法 */
  method: string;
  /** 请求头 */
  headers: Record<string, string>;
  /** 请求体 (JSON 字符串) */
  body?: string;
  /** 是否流式响应 */
  stream: boolean;
}

/** 非流式请求的完整响应 */
export interface FetchRelayResponse {
  /** 请求 ID */
  requestId: string;
  /** HTTP 状态码 */
  status: number;
  /** HTTP 状态文本 */
  statusText: string;
  /** 响应头 */
  headers: Record<string, string>;
  /** 响应体 (文本) */
  body: string;
  /** 是否成功 */
  ok: boolean;
}

/** 流式 chunk 事件 */
export interface FetchRelayChunkEvent {
  /** 请求 ID */
  requestId: string;
  /** 本次 chunk 文本 */
  chunk: string;
}

/** 流式完成事件 */
export interface FetchRelayDoneEvent {
  /** 请求 ID */
  requestId: string;
  /** HTTP 状态码 */
  status: number;
  /** 累积的完整响应体 */
  body: string;
}

/** 流式错误事件 */
export interface FetchRelayErrorEvent {
  /** 请求 ID */
  requestId: string;
  /** 错误信息 */
  error: string;
}

/** 取消请求的参数 */
export interface FetchRelayCancelRequest {
  requestId: string;
}

/** 恢复结果 */
export interface FetchRelayRecoveredResult {
  /** 请求 ID */
  requestId: string;
  /** HTTP 状态码 */
  status: number;
  /** 响应体 */
  body: string;
  /** 完成时间 */
  completedAt: number;
}

// ============================================================================
// SW 端 IDB 记录类型
// ============================================================================

/** 正在执行的请求记录 (IDB inflight store) */
export interface InflightRecord {
  requestId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  stream: boolean;
  startedAt: number;
}

/** 断开后保存的结果 (IDB results store) */
export interface CompletedResultRecord {
  requestId: string;
  status: number;
  body: string;
  completedAt: number;
}
