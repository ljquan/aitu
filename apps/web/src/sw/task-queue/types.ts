/**
 * Service Worker Task Queue Type Definitions
 *
 * Defines all types for SW-based task queue management and
 * postMessage communication between main thread and Service Worker.
 *
 * Note: Types are defined independently here to avoid import issues in SW context.
 * Keep in sync with packages/drawnix/src/types/task.types.ts
 */

// ============================================================================
// Task Enums and Core Types (mirrored from task.types.ts)
// ============================================================================

/**
 * Task status enumeration
 */
export enum TaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  RETRYING = 'retrying',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Task type enumeration
 */
export enum TaskType {
  IMAGE = 'image',
  VIDEO = 'video',
  CHARACTER = 'character',
  INSPIRATION_BOARD = 'inspiration_board',
  CHAT = 'chat',
}

/**
 * Task execution phase enumeration
 */
export enum TaskExecutionPhase {
  SUBMITTING = 'submitting',
  POLLING = 'polling',
  DOWNLOADING = 'downloading',
}

/**
 * Generation parameters interface
 */
export interface GenerationParams {
  prompt: string;
  width?: number;
  height?: number;
  size?: string;
  duration?: number;
  style?: string;
  model?: string;
  seed?: number;
  sourceVideoTaskId?: string;
  characterTimestamps?: string;
  sourceLocalTaskId?: string;
  gridImageRows?: number;
  gridImageCols?: number;
  gridImageLayoutStyle?: 'scattered' | 'grid' | 'circular';
  inspirationBoardLayoutStyle?: 'inspiration-board';
  isInspirationBoard?: boolean;
  inspirationBoardImageCount?: number;
  /** Whether to auto-insert the result to canvas when task completes */
  autoInsertToCanvas?: boolean;
  [key: string]: unknown;
}

/**
 * Task result interface
 */
export interface TaskResult {
  url: string;
  format: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailUrl?: string;
  characterUsername?: string;
  characterProfileUrl?: string;
  characterPermalink?: string;
  /** Chat response content (chat only) */
  chatResponse?: string;
  /** Tool calls made during chat (chat only) */
  toolCalls?: ChatToolCall[];
}

/**
 * Task error details interface
 */
export interface TaskErrorDetails {
  originalError?: string;
  apiResponse?: unknown;
  timestamp?: number;
}

/**
 * Task error interface
 */
export interface TaskError {
  code: string;
  message: string;
  details?: TaskErrorDetails;
}

// ============================================================================
// SW Task Definition
// ============================================================================

/**
 * Task stored and managed within Service Worker
 */
export interface SWTask {
  /** Unique task identifier (UUID v4) */
  id: string;
  /** Type of content to generate */
  type: TaskType;
  /** Current task status */
  status: TaskStatus;
  /** Parameters for content generation */
  params: GenerationParams;
  /** Task creation timestamp (Unix milliseconds) */
  createdAt: number;
  /** Last update timestamp (Unix milliseconds) */
  updatedAt: number;
  /** Execution start timestamp (Unix milliseconds) */
  startedAt?: number;
  /** Completion timestamp (Unix milliseconds) */
  completedAt?: number;
  /** Generation result (if successful) */
  result?: TaskResult;
  /** Error information (if failed) */
  error?: TaskError;
  /** Number of retry attempts made */
  retryCount: number;
  /** Next scheduled retry timestamp (Unix milliseconds) */
  nextRetryAt?: number;
  /** Task progress percentage (0-100) for video generation */
  progress?: number;
  /** Remote task ID from API (e.g., videoId for video generation) */
  remoteId?: string;
  /** Current execution phase for recovery support */
  executionPhase?: TaskExecutionPhase;
  /** Whether the task result has been saved to the media library */
  savedToLibrary?: boolean;
  /** Whether the task result has been inserted to canvas */
  insertedToCanvas?: boolean;
}

// ============================================================================
// Chat Types
// ============================================================================

/**
 * Chat message for streaming
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** Attachments (base64 encoded) */
  attachments?: ChatAttachment[];
}

/**
 * Chat attachment (image/file)
 */
export interface ChatAttachment {
  type: 'image' | 'file';
  name: string;
  mimeType: string;
  /** Base64 encoded data */
  data: string;
}

/**
 * Chat request parameters
 */
export interface ChatParams {
  /** Chat history messages */
  messages: ChatMessage[];
  /** New message content */
  newContent: string;
  /** Attachments for the new message */
  attachments?: ChatAttachment[];
  /** Temporary model override */
  temporaryModel?: string;
  /** System prompt (for MCP tools) */
  systemPrompt?: string;
}

/**
 * Chat stream event types
 */
export type ChatStreamEventType = 'content' | 'done' | 'error';

/**
 * Chat stream event
 */
export interface ChatStreamEvent {
  type: ChatStreamEventType;
  content?: string;
  error?: string;
}

// ============================================================================
// API Configuration
// ============================================================================

/**
 * Gemini API configuration passed from main thread
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

/**
 * Initialize SW task queue with configuration
 */
export interface InitTaskQueueMessage {
  type: 'TASK_QUEUE_INIT';
  geminiConfig: GeminiConfig;
  videoConfig: VideoAPIConfig;
}

/**
 * Update API configuration
 */
export interface UpdateConfigMessage {
  type: 'TASK_QUEUE_UPDATE_CONFIG';
  geminiConfig?: Partial<GeminiConfig>;
  videoConfig?: Partial<VideoAPIConfig>;
}

/**
 * Submit a new task
 */
export interface TaskSubmitMessage {
  type: 'TASK_SUBMIT';
  taskId: string;
  taskType: TaskType;
  params: GenerationParams;
}

/**
 * Cancel a task
 */
export interface TaskCancelMessage {
  type: 'TASK_CANCEL';
  taskId: string;
}

/**
 * Retry a failed task
 */
export interface TaskRetryMessage {
  type: 'TASK_RETRY';
  taskId: string;
}

/**
 * Resume a task after page refresh
 */
export interface TaskResumeMessage {
  type: 'TASK_RESUME';
  taskId: string;
  remoteId: string;
  taskType: TaskType;
}

/**
 * Get current status of a task
 */
export interface TaskGetStatusMessage {
  type: 'TASK_GET_STATUS';
  taskId: string;
}

/**
 * Get all tasks
 */
export interface TaskGetAllMessage {
  type: 'TASK_GET_ALL';
}

/**
 * Delete a task
 */
export interface TaskDeleteMessage {
  type: 'TASK_DELETE';
  taskId: string;
}

/**
 * Start a chat stream
 */
export interface ChatStartMessage {
  type: 'CHAT_START';
  chatId: string;
  params: ChatParams;
}

/**
 * Stop a chat stream
 */
export interface ChatStopMessage {
  type: 'CHAT_STOP';
  chatId: string;
}

/**
 * Restore tasks from storage (after SW activation)
 */
export interface TaskRestoreMessage {
  type: 'TASK_RESTORE';
  tasks: SWTask[];
}

/**
 * Mark a task as inserted to canvas
 */
export interface TaskMarkInsertedMessage {
  type: 'TASK_MARK_INSERTED';
  taskId: string;
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

/**
 * Union type for all main thread to SW messages
 */
export type MainToSWMessage =
  | InitTaskQueueMessage
  | UpdateConfigMessage
  | TaskSubmitMessage
  | TaskCancelMessage
  | TaskRetryMessage
  | TaskResumeMessage
  | TaskGetStatusMessage
  | TaskGetAllMessage
  | TaskDeleteMessage
  | ChatStartMessage
  | ChatStopMessage
  | TaskRestoreMessage
  | TaskMarkInsertedMessage
  | MCPToolExecuteMessage;

// ============================================================================
// Service Worker → Main Thread Messages
// ============================================================================

/**
 * Task queue initialized
 */
export interface TaskQueueInitializedMessage {
  type: 'TASK_QUEUE_INITIALIZED';
  success: boolean;
  error?: string;
}

/**
 * Task status update
 */
export interface TaskStatusMessage {
  type: 'TASK_STATUS';
  taskId: string;
  status: TaskStatus;
  progress?: number;
  phase?: TaskExecutionPhase;
  remoteId?: string;
  updatedAt: number;
}

/**
 * Task completed successfully
 */
export interface TaskCompletedMessage {
  type: 'TASK_COMPLETED';
  taskId: string;
  result: TaskResult;
  completedAt: number;
}

/**
 * Task failed
 */
export interface TaskFailedMessage {
  type: 'TASK_FAILED';
  taskId: string;
  error: TaskError;
  retryCount: number;
  nextRetryAt?: number;
}

/**
 * Task submitted to remote API
 */
export interface TaskSubmittedMessage {
  type: 'TASK_SUBMITTED';
  taskId: string;
  remoteId: string;
}

/**
 * Task created (new task added to queue)
 */
export interface TaskCreatedMessage {
  type: 'TASK_CREATED';
  task: SWTask;
}

/**
 * Task cancelled
 */
export interface TaskCancelledMessage {
  type: 'TASK_CANCELLED';
  taskId: string;
}

/**
 * Task deleted
 */
export interface TaskDeletedMessage {
  type: 'TASK_DELETED';
  taskId: string;
}

/**
 * Response to TASK_GET_STATUS
 */
export interface TaskStatusResponseMessage {
  type: 'TASK_STATUS_RESPONSE';
  taskId: string;
  task: SWTask | null;
}

/**
 * Response to TASK_GET_ALL
 */
export interface TaskAllResponseMessage {
  type: 'TASK_ALL_RESPONSE';
  tasks: SWTask[];
}

/**
 * Chat stream chunk
 */
export interface ChatChunkMessage {
  type: 'CHAT_CHUNK';
  chatId: string;
  content: string;
}

/**
 * Chat stream completed
 */
export interface ChatDoneMessage {
  type: 'CHAT_DONE';
  chatId: string;
  fullContent: string;
}

/**
 * Chat stream error
 */
export interface ChatErrorMessage {
  type: 'CHAT_ERROR';
  chatId: string;
  error: string;
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

/**
 * Union type for all SW to main thread messages
 */
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
  | ChatChunkMessage
  | ChatDoneMessage
  | ChatErrorMessage
  | MCPToolResultMessage;

// ============================================================================
// Handler Types
// ============================================================================

/**
 * Task handler interface
 */
export interface TaskHandler {
  /** Execute the task */
  execute(task: SWTask, config: HandlerConfig): Promise<TaskResult>;
  /** Cancel the task */
  cancel(taskId: string): void;
  /** Resume a task (for video polling) */
  resume?(task: SWTask, config: HandlerConfig): Promise<TaskResult>;
}

/**
 * Handler configuration
 */
export interface HandlerConfig {
  geminiConfig: GeminiConfig;
  videoConfig: VideoAPIConfig;
  /** Callback to send progress updates */
  onProgress: (taskId: string, progress: number, phase?: TaskExecutionPhase) => void;
  /** Callback when remote ID is received */
  onRemoteId: (taskId: string, remoteId: string) => void;
}

/**
 * Chat handler interface
 */
export interface ChatHandler {
  /** Start streaming chat */
  stream(
    chatId: string,
    params: ChatParams,
    config: GeminiConfig,
    onChunk: (content: string) => void
  ): Promise<string>;
  /** Stop streaming */
  stop(chatId: string): void;
}

// ============================================================================
// Queue Configuration
// ============================================================================

/**
 * Task queue configuration
 */
export interface TaskQueueConfig {
  /** Maximum concurrent tasks */
  maxConcurrent: number;
  /** Maximum retry count */
  maxRetries: number;
  /** Retry delays in milliseconds (exponential backoff) */
  retryDelays: number[];
  /** Task timeout in milliseconds by type */
  timeouts: Record<TaskType, number>;
}

/**
 * Default task queue configuration
 */
export const DEFAULT_TASK_QUEUE_CONFIG: TaskQueueConfig = {
  maxConcurrent: Infinity, // No concurrent limit for image/video generation
  maxRetries: 3,
  retryDelays: [
    1 * 60 * 1000,   // 1 minute
    5 * 60 * 1000,   // 5 minutes
    15 * 60 * 1000,  // 15 minutes
  ],
  timeouts: {
    [TaskType.IMAGE]: 10 * 60 * 1000,             // 10 minutes for image
    [TaskType.VIDEO]: 20 * 60 * 1000,             // 20 minutes for video
    [TaskType.CHARACTER]: 10 * 60 * 1000,         // 10 minutes
    [TaskType.INSPIRATION_BOARD]: 10 * 60 * 1000, // 10 minutes (same as image)
    [TaskType.CHAT]: 10 * 60 * 1000,              // 10 minutes
  },
};
