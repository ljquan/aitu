/**
 * Debug Related Types
 *
 * 调试、监控相关类型定义
 */

// ============================================================================
// 调试状态
// ============================================================================

/**
 * 调试状态结果
 */
export interface DebugStatusResult {
  enabled: boolean;
  logCount?: number;
  cacheStats?: {
    imageCount: number;
    totalSize: number;
  };
}

// ============================================================================
// 调试事件类型
// ============================================================================

/**
 * 调试日志事件
 */
export interface DebugLogEvent {
  id: string;
  timestamp: number;
  type: string;
  data?: unknown;
}

/**
 * LLM API 日志事件
 */
export interface DebugLLMLogEvent {
  id: string;
  timestamp: number;
  type: string;
  url?: string;
  method?: string;
  status?: number;
  duration?: number;
  error?: string;
}

/**
 * 调试状态变更事件
 */
export interface DebugStatusChangedEvent {
  enabled: boolean;
}

/**
 * 新崩溃快照事件
 */
export interface DebugNewCrashSnapshotEvent {
  snapshot: CrashSnapshot;
}

/**
 * 崩溃快照
 */
export interface CrashSnapshot {
  id: string;
  timestamp: number;
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
  url?: string;
  userAgent?: string;
  memory?: {
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
  };
}

/**
 * PostMessage 日志事件
 */
export interface PostMessageLogEvent {
  id: string;
  timestamp: number;
  direction: 'sent' | 'received';
  type: string;
  data?: unknown;
  clientId?: string;
}

/**
 * PostMessage 批量日志事件
 */
export interface PostMessageLogBatchEvent {
  entries: PostMessageLogEvent[];
}

// ============================================================================
// 崩溃监控参数
// ============================================================================

/**
 * 崩溃快照上报参数
 */
export interface CrashSnapshotParams {
  snapshot: CrashSnapshot;
}

/**
 * 心跳参数
 */
export interface HeartbeatParams {
  timestamp: number;
}

// ============================================================================
// 控制台类型
// ============================================================================

/**
 * 控制台日志事件
 */
export interface ConsoleLogEvent {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  args: unknown[];
  timestamp: number;
  source?: string;
}

/**
 * 控制台日志上报参数
 */
export interface ConsoleReportParams {
  logLevel: string;
  logArgs: unknown[];
  timestamp: number;
}
