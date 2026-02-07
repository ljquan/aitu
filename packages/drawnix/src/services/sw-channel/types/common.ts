/**
 * Common Types
 *
 * 通用类型定义，包括初始化、RPC 方法映射、事件映射等
 */

import type { Methods, PostResponse } from 'postmessage-duplex';

// 导入其他模块的类型用于 SWMethods 和 SWEvents
import type {
  TaskStatus,
  TaskType,
  SWTask,
  TaskCreateParams,
  TaskCreateResult,
  TaskListPaginatedParams,
  TaskListPaginatedResult,
  TaskOperationParams,
  TaskOperationResult,
  TaskStatusEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskCreatedEvent,
} from './task';

import type {
  ChatStartParams,
  ChatStopParams,
  ChatChunkEvent,
  ChatDoneEvent,
  ChatErrorEvent,
} from './chat';

import type {
  WorkflowSubmitParams,
  WorkflowSubmitResult,
  WorkflowStatusResponse,
  WorkflowAllResponse,
  CanvasOperationResponse,
  MainThreadToolResponse,
  WorkflowStatusEvent,
  WorkflowStepStatusEvent,
  WorkflowCompletedEvent,
  WorkflowFailedEvent,
  WorkflowStepsAddedEvent,
  CanvasOperationRequestEvent,
  MainThreadToolRequestEvent,
  WorkflowRecoveredEvent,
} from './workflow';

import type {
  DebugStatusResult,
  DebugLogEvent,
  DebugLLMLogEvent,
  DebugStatusChangedEvent,
  DebugNewCrashSnapshotEvent,
  PostMessageLogEvent,
  PostMessageLogBatchEvent,
  CrashSnapshotParams,
  HeartbeatParams,
  ConsoleLogEvent,
  ConsoleReportParams,
} from './debug';

// ============================================================================
// 初始化类型
// ============================================================================

/**
 * 初始化参数
 */
export interface InitParams {
  geminiConfig: {
    apiKey: string;
    baseUrl: string;
    modelName?: string;
    /** Text model for ai_analyze (e.g., 'deepseek-v3.2') */
    textModelName?: string;
  };
  videoConfig: {
    baseUrl: string;
    apiKey?: string;
  };
}

/**
 * 初始化响应
 */
export interface InitResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// Cache 事件类型
// ============================================================================

/**
 * 图片缓存事件
 */
export interface CacheImageCachedEvent {
  url: string;
  size?: number;
  thumbnailUrl?: string;
}

/**
 * 缓存删除事件
 */
export interface CacheDeletedEvent {
  url: string;
}

/**
 * 缓存配额警告事件
 */
export interface CacheQuotaWarningEvent {
  usage: number;
  quota: number;
  percentUsed: number;
}

// ============================================================================
// SW 状态事件类型
// ============================================================================

/**
 * 新版本就绪事件
 */
export interface SWNewVersionReadyEvent {
  version: string;
}

/**
 * SW 激活事件
 */
export interface SWActivatedEvent {
  version: string;
}

/**
 * SW 更新事件
 */
export interface SWUpdatedEvent {
  version?: string;
}

/**
 * SW 请求配置事件
 */
export interface SWRequestConfigEvent {
  reason: string;
}

// ============================================================================
// 缩略图类型
// ============================================================================

/**
 * 视频缩略图请求事件（SW -> 主线程）
 */
export interface ThumbnailVideoRequestEvent {
  requestId: string;
  url: string;
  timestamp?: number;
}

/**
 * 生成缩略图参数
 */
export interface ThumbnailGenerateParams {
  url: string;
  mediaType: 'image' | 'video';
  blob: ArrayBuffer;
  mimeType: string;
}

/**
 * 视频缩略图响应参数
 */
export interface ThumbnailVideoResponseParams {
  requestId: string;
  thumbnailUrl?: string;
  error?: string;
}

// ============================================================================
// MCP 事件类型
// ============================================================================

/**
 * MCP 工具结果事件
 */
export interface MCPToolResultEvent {
  requestId: string;
  result: unknown;
  error?: string;
}

// ============================================================================
// RPC 方法映射
// ============================================================================

/**
 * SW RPC 方法定义
 * 格式: methodName: (params) => result
 */
export interface SWMethods extends Methods {
  // 初始化
  'init': (params: InitParams) => InitResult;
  'updateConfig': (params: Partial<InitParams>) => InitResult;

  // 任务操作
  'task:create': (params: TaskCreateParams) => TaskCreateResult;
  'task:cancel': (params: TaskOperationParams) => TaskOperationResult;
  'task:retry': (params: TaskOperationParams) => TaskOperationResult;
  'task:delete': (params: TaskOperationParams) => TaskOperationResult;
  'task:markInserted': (params: TaskOperationParams) => TaskOperationResult;

  // 任务查询
  'task:get': (params: TaskOperationParams) => { task: SWTask | null };
  'task:listPaginated': (params: TaskListPaginatedParams) => TaskListPaginatedResult;

  // Chat
  'chat:start': (params: ChatStartParams) => TaskOperationResult;
  'chat:stop': (params: ChatStopParams) => TaskOperationResult;
  'chat:getCached': (params: { chatId: string }) => { found: boolean; fullContent?: string };

  // Workflow
  'workflow:submit': (params: WorkflowSubmitParams) => WorkflowSubmitResult;
  'workflow:cancel': (params: { workflowId: string }) => TaskOperationResult;
  'workflow:getStatus': (params: { workflowId: string }) => WorkflowStatusResponse;
  'workflow:getAll': (params?: undefined) => WorkflowAllResponse;
  'workflow:respondCanvas': (params: CanvasOperationResponse) => TaskOperationResult;
  'workflow:respondTool': (params: MainThreadToolResponse) => TaskOperationResult;

  // Thumbnail
  'thumbnail:generate': (params: ThumbnailGenerateParams) => TaskOperationResult;
  'thumbnail:videoResponse': (params: ThumbnailVideoResponseParams) => TaskOperationResult;

  // Crash monitoring
  'crash:snapshot': (params: CrashSnapshotParams) => TaskOperationResult;
  'crash:heartbeat': (params: HeartbeatParams) => TaskOperationResult;

  // Console
  'console:report': (params: ConsoleReportParams) => TaskOperationResult;

  // Debug
  'debug:getStatus': (params?: undefined) => DebugStatusResult;
}

// ============================================================================
// 事件类型映射
// ============================================================================

/**
 * SW 事件类型映射
 */
export interface SWEvents {
  'task:status': TaskStatusEvent;
  'task:completed': TaskCompletedEvent;
  'task:failed': TaskFailedEvent;
  'task:created': TaskCreatedEvent;
  'task:cancelled': { taskId: string };
  'task:deleted': { taskId: string };
  'chat:chunk': ChatChunkEvent;
  'chat:done': ChatDoneEvent;
  'chat:error': ChatErrorEvent;
  // Workflow events
  'workflow:status': WorkflowStatusEvent;
  'workflow:stepStatus': WorkflowStepStatusEvent;
  'workflow:completed': WorkflowCompletedEvent;
  'workflow:failed': WorkflowFailedEvent;
  'workflow:stepsAdded': WorkflowStepsAddedEvent;
  'workflow:canvasRequest': CanvasOperationRequestEvent;
  'workflow:toolRequest': MainThreadToolRequestEvent;
  'workflow:recovered': WorkflowRecoveredEvent;
  // Cache events
  'cache:imageCached': CacheImageCachedEvent;
  'cache:deleted': CacheDeletedEvent;
  'cache:quotaWarning': CacheQuotaWarningEvent;
  // SW status events
  'sw:newVersionReady': SWNewVersionReadyEvent;
  'sw:activated': SWActivatedEvent;
  'sw:updated': SWUpdatedEvent;
  'sw:requestConfig': SWRequestConfigEvent;
  // Thumbnail events
  'thumbnail:videoRequest': ThumbnailVideoRequestEvent;
  // MCP events
  'mcp:toolResult': MCPToolResultEvent;
  // Console events
  'console:log': ConsoleLogEvent;
  // Debug events
  'debug:log': DebugLogEvent;
  'debug:llmLog': DebugLLMLogEvent;
  'debug:statusChanged': DebugStatusChangedEvent;
  'debug:newCrashSnapshot': DebugNewCrashSnapshotEvent;
  'postmessage:log': PostMessageLogEvent;
  'postmessage:logBatch': PostMessageLogBatchEvent;
}

// ============================================================================
// 工具类型
// ============================================================================

/**
 * 类型安全的 PostResponse
 */
export { ReturnCode } from 'postmessage-duplex';
export type TypedPostResponse<T> = PostResponse & { data?: T };
