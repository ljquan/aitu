/**
 * Service Worker Client Types
 *
 * Types for communication between main thread and Service Worker task queue.
 * These types mirror the SW types but are defined separately to avoid
 * circular dependencies and SW-specific imports.
 */

import type {
  TaskType,
  TaskStatus,
  TaskExecutionPhase,
  GenerationParams,
  TaskResult,
  TaskError,
} from '../../types/task.types';

// Re-export for convenience
export { TaskType, TaskStatus, TaskExecutionPhase };
export type { GenerationParams, TaskResult, TaskError };

// ============================================================================
// SW Task Definition
// ============================================================================

/**
 * Task as received from Service Worker
 */
export interface SWTask {
  id: string;
  type: TaskType;
  status: TaskStatus;
  params: GenerationParams;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: TaskResult;
  error?: TaskError;
  retryCount: number;
  nextRetryAt?: number;
  progress?: number;
  remoteId?: string;
  executionPhase?: TaskExecutionPhase;
  savedToLibrary?: boolean;
  insertedToCanvas?: boolean;
}

// ============================================================================
// Chat Types
// ============================================================================

/**
 * Chat attachment for SW communication
 */
export interface ChatAttachment {
  type: 'image' | 'file';
  name: string;
  mimeType: string;
  data: string; // Base64 encoded
}

/**
 * Chat message for SW communication
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: ChatAttachment[];
}

/**
 * Chat request parameters
 */
export interface ChatParams {
  messages: ChatMessage[];
  newContent: string;
  attachments?: ChatAttachment[];
  temporaryModel?: string;
  systemPrompt?: string;
}

// ============================================================================
// API Configuration
// ============================================================================

/**
 * Gemini API configuration
 */
export interface GeminiConfig {
  apiKey: string;
  baseUrl: string;
  modelName?: string;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

/**
 * Video API configuration
 */
export interface VideoAPIConfig {
  baseUrl: string;
  apiKey?: string;
}

// ============================================================================
// Main Thread → Service Worker Messages
// ============================================================================

export interface InitTaskQueueMessage {
  type: 'TASK_QUEUE_INIT';
  geminiConfig: GeminiConfig;
  videoConfig: VideoAPIConfig;
}

export interface UpdateConfigMessage {
  type: 'TASK_QUEUE_UPDATE_CONFIG';
  geminiConfig?: Partial<GeminiConfig>;
  videoConfig?: Partial<VideoAPIConfig>;
}

export interface TaskSubmitMessage {
  type: 'TASK_SUBMIT';
  taskId: string;
  taskType: TaskType;
  params: GenerationParams;
}

export interface TaskCancelMessage {
  type: 'TASK_CANCEL';
  taskId: string;
}

export interface TaskRetryMessage {
  type: 'TASK_RETRY';
  taskId: string;
}

export interface TaskResumeMessage {
  type: 'TASK_RESUME';
  taskId: string;
  remoteId: string;
  taskType: TaskType;
}

export interface TaskGetStatusMessage {
  type: 'TASK_GET_STATUS';
  taskId: string;
}

export interface TaskGetAllMessage {
  type: 'TASK_GET_ALL';
}

export interface TaskGetPaginatedMessage {
  type: 'TASK_GET_PAGINATED';
  offset: number;
  limit: number;
  filters?: {
    status?: TaskStatus;
    type?: TaskType;
  };
  sortOrder?: 'asc' | 'desc';
}

export interface TaskDeleteMessage {
  type: 'TASK_DELETE';
  taskId: string;
}

export interface ChatStartMessage {
  type: 'CHAT_START';
  chatId: string;
  params: ChatParams;
}

export interface ChatStopMessage {
  type: 'CHAT_STOP';
  chatId: string;
}

export interface TaskRestoreMessage {
  type: 'TASK_RESTORE';
  tasks: SWTask[];
}

export interface TaskMarkInsertedMessage {
  type: 'TASK_MARK_INSERTED';
  taskId: string;
}

export interface MainThreadToolResponseMessage {
  type: 'MAIN_THREAD_TOOL_RESPONSE';
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  addSteps?: Array<{
    id: string;
    mcp: string;
    args: Record<string, unknown>;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  }>;
}

/**
 * MCP Tool Execute Request - Main thread requests SW to execute a tool
 */
export interface MCPToolExecuteMessage {
  type: 'MCP_TOOL_EXECUTE';
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
  options?: {
    mode?: 'async' | 'queue';
    batchId?: string;
    batchIndex?: number;
    batchTotal?: number;
  };
}

export type MainToSWMessage =
  | InitTaskQueueMessage
  | UpdateConfigMessage
  | TaskSubmitMessage
  | TaskCancelMessage
  | TaskRetryMessage
  | TaskResumeMessage
  | TaskGetStatusMessage
  | TaskGetAllMessage
  | TaskGetPaginatedMessage
  | TaskDeleteMessage
  | ChatStartMessage
  | ChatStopMessage
  | TaskRestoreMessage
  | TaskMarkInsertedMessage
  | MainThreadToolResponseMessage
  | MCPToolExecuteMessage;

// ============================================================================
// Service Worker → Main Thread Messages
// ============================================================================

export interface TaskQueueInitializedMessage {
  type: 'TASK_QUEUE_INITIALIZED';
  success: boolean;
  error?: string;
}

export interface TaskStatusMessage {
  type: 'TASK_STATUS';
  taskId: string;
  status: TaskStatus;
  progress?: number;
  phase?: TaskExecutionPhase;
  remoteId?: string;
  updatedAt: number;
}

export interface TaskCompletedMessage {
  type: 'TASK_COMPLETED';
  taskId: string;
  result: TaskResult;
  completedAt: number;
}

export interface TaskFailedMessage {
  type: 'TASK_FAILED';
  taskId: string;
  error: TaskError;
  retryCount: number;
  nextRetryAt?: number;
}

export interface TaskSubmittedMessage {
  type: 'TASK_SUBMITTED';
  taskId: string;
  remoteId: string;
}

export interface TaskCancelledMessage {
  type: 'TASK_CANCELLED';
  taskId: string;
}

export interface TaskCreatedMessage {
  type: 'TASK_CREATED';
  task: SWTask;
}

export interface TaskDeletedMessage {
  type: 'TASK_DELETED';
  taskId: string;
}

export interface TaskStatusResponseMessage {
  type: 'TASK_STATUS_RESPONSE';
  taskId: string;
  task: SWTask | null;
}

export interface TaskAllResponseMessage {
  type: 'TASK_ALL_RESPONSE';
  tasks: SWTask[];
}

export interface TaskPaginatedResponseMessage {
  type: 'TASK_PAGINATED_RESPONSE';
  tasks: SWTask[];
  total: number;
  offset: number;
  hasMore: boolean;
}

export interface ChatChunkMessage {
  type: 'CHAT_CHUNK';
  chatId: string;
  content: string;
}

export interface ChatDoneMessage {
  type: 'CHAT_DONE';
  chatId: string;
  fullContent: string;
}

export interface ChatErrorMessage {
  type: 'CHAT_ERROR';
  chatId: string;
  error: string;
}

export interface MainThreadToolRequestMessage {
  type: 'MAIN_THREAD_TOOL_REQUEST';
  requestId: string;
  workflowId: string;
  stepId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * MCP Tool Execute Result - SW returns tool execution result
 */
export interface MCPToolResultMessage {
  type: 'MCP_TOOL_RESULT';
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  resultType?: 'image' | 'video' | 'text' | 'canvas' | 'error';
  taskId?: string;
}

export type SWToMainMessage =
  | TaskQueueInitializedMessage
  | TaskStatusMessage
  | TaskCompletedMessage
  | TaskFailedMessage
  | TaskSubmittedMessage
  | TaskCreatedMessage
  | TaskCancelledMessage
  | TaskDeletedMessage
  | TaskStatusResponseMessage
  | TaskAllResponseMessage
  | TaskPaginatedResponseMessage
  | ChatChunkMessage
  | ChatDoneMessage
  | ChatErrorMessage
  | MainThreadToolRequestMessage
  | MCPToolResultMessage;

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Task event handler types
 */
export interface TaskEventHandlers {
  onCreated?: (task: SWTask) => void;
  onStatus?: (taskId: string, status: TaskStatus, progress?: number, phase?: TaskExecutionPhase) => void;
  onCompleted?: (taskId: string, result: TaskResult) => void;
  onFailed?: (taskId: string, error: TaskError, retryCount: number, nextRetryAt?: number) => void;
  onSubmitted?: (taskId: string, remoteId: string) => void;
  onCancelled?: (taskId: string) => void;
  onDeleted?: (taskId: string) => void;
  onTasksSync?: (tasks: SWTask[]) => void;
}

/**
 * Chat event handler types
 */
export interface ChatEventHandlers {
  onChunk?: (chatId: string, content: string) => void;
  onDone?: (chatId: string, fullContent: string) => void;
  onError?: (chatId: string, error: string) => void;
}
