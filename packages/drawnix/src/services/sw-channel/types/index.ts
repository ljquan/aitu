/**
 * Service Worker 双工通信类型定义
 *
 * 统一导出所有类型
 */

// Task 相关类型
export type {
  TaskStatus,
  TaskType,
  TaskExecutionPhase,
  GenerationParams,
  TaskResult,
  TaskError,
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

// Chat 相关类型
export type {
  ChatMessage,
  ChatAttachment,
  ChatStartParams,
  ChatStopParams,
  ChatChunkEvent,
  ChatDoneEvent,
  ChatErrorEvent,
} from './chat';

// Workflow 相关类型
export type {
  WorkflowStepStatus,
  WorkflowStatus,
  WorkflowStepOptions,
  WorkflowStep,
  WorkflowDefinition,
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

// Debug 相关类型
export type {
  DebugStatusResult,
  DebugLogEvent,
  DebugLLMLogEvent,
  DebugStatusChangedEvent,
  DebugNewCrashSnapshotEvent,
  CrashSnapshot,
  PostMessageLogEvent,
  PostMessageLogBatchEvent,
  CrashSnapshotParams,
  HeartbeatParams,
  ConsoleLogEvent,
  ConsoleReportParams,
} from './debug';

// Common 类型
export type {
  InitParams,
  InitResult,
  CacheImageCachedEvent,
  CacheDeletedEvent,
  CacheQuotaWarningEvent,
  SWNewVersionReadyEvent,
  SWActivatedEvent,
  SWUpdatedEvent,
  SWRequestConfigEvent,
  ThumbnailVideoRequestEvent,
  ThumbnailGenerateParams,
  ThumbnailVideoResponseParams,
  MCPToolResultEvent,
  SWMethods,
  SWEvents,
  TypedPostResponse,
} from './common';

// 重新导出 ReturnCode (值导出)
export { ReturnCode } from './common';
