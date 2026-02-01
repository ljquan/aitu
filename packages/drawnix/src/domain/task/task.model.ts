/**
 * Unified Task Domain Model
 *
 * This is the single source of truth for task-related types.
 * Used by both main thread and Service Worker.
 *
 * Design decisions:
 * - Use string literal unions instead of enums for better tree-shaking and SW compatibility
 * - All fields are clearly documented
 * - Timestamps are grouped in a nested object for clarity
 */

// ============================================================================
// Status and Type Definitions (String Literals)
// ============================================================================

/**
 * Task status - represents all possible states a task can be in
 */
export type TaskStatus =
  | 'pending'      // Task is waiting to be executed
  | 'processing'   // Task is currently being processed
  | 'completed'    // Task completed successfully
  | 'failed'       // Task failed
  | 'cancelled';   // Task was cancelled by the user

/**
 * Task type - defines the types of content that can be generated
 */
export type TaskType =
  | 'image'              // Image generation task
  | 'video'              // Video generation task
  | 'character'          // Character extraction task
  | 'inspiration_board'  // Inspiration board generation task
  | 'chat';              // Chat/AI analysis task

/**
 * Task execution phase - used for tracking async task progress
 */
export type TaskExecutionPhase =
  | 'submitting'    // Task is being submitted to the API
  | 'polling'       // Task submitted, polling for completion (video only)
  | 'downloading';  // Task completed, downloading result

// ============================================================================
// Parameter Types
// ============================================================================

/**
 * Generation parameters interface
 * Contains all parameters needed for AI content generation
 */
export interface GenerationParams {
  /** Text prompt describing the desired content */
  prompt: string;
  /** Image/video width in pixels */
  width?: number;
  /** Image/video height in pixels */
  height?: number;
  /** Size parameter for API (e.g., '16x9', '1x1') */
  size?: string;
  /** Video duration in seconds (video only) */
  duration?: number;
  /** Style or model to use for generation */
  style?: string;
  /** AI model to use (e.g., 'veo3', 'sora-2') */
  model?: string;
  /** Random seed for reproducible generation */
  seed?: number;
  /** Batch ID for grouped operations */
  batchId?: string;
  /** Image aspect ratio token (e.g. '16:9') */
  aspectRatio?: string;
  /** Whether to auto-insert the result to canvas when task completes */
  autoInsertToCanvas?: boolean;
  /** Source video task ID for character extraction */
  sourceVideoTaskId?: string;
  /** Time range for character extraction (format: "start,end") */
  characterTimestamps?: string;
  /** Local task ID of source video */
  sourceLocalTaskId?: string;
  /** Grid image grid rows (grid_image only) */
  gridImageRows?: number;
  /** Grid image grid columns (grid_image only) */
  gridImageCols?: number;
  /** Grid image layout style (grid_image only) */
  gridImageLayoutStyle?: 'scattered' | 'grid' | 'circular';
  /** Inspiration board layout style (inspiration_board only) */
  inspirationBoardLayoutStyle?: 'inspiration-board';
  /** Whether this is an inspiration board task */
  isInspirationBoard?: boolean;
  /** Inspiration board image count */
  inspirationBoardImageCount?: number;
  /** Additional parameters for specific generation types */
  [key: string]: unknown;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Chat tool call interface
 * Represents a tool call made during AI chat/analysis
 */
export interface ChatToolCall {
  /** Tool name (e.g., 'generate_image', 'generate_video') */
  name: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Tool call result */
  result?: {
    success: boolean;
    taskId?: string;
    error?: string;
    data?: unknown;
  };
}

/**
 * Task result interface
 * Contains the output from a successfully completed task
 */
export interface TaskResult {
  /** URL to the generated content */
  url: string;
  /** File format (e.g., 'png', 'jpg', 'mp4') */
  format: string;
  /** File size in bytes */
  size: number;
  /** Content width in pixels */
  width?: number;
  /** Content height in pixels */
  height?: number;
  /** Video duration in seconds (video only) */
  duration?: number;
  /** Video thumbnail URL (video only) */
  thumbnailUrl?: string;
  /** Character username for @mention (character only) */
  characterUsername?: string;
  /** Character profile picture URL (character only) */
  characterProfileUrl?: string;
  /** Character permalink (character only) */
  characterPermalink?: string;
  /** Chat response content (chat only) */
  chatResponse?: string;
  /** Tool calls made during chat (chat only) */
  toolCalls?: ChatToolCall[];
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Task error details interface
 * Contains the original error information for debugging
 */
export interface TaskErrorDetails {
  /** Original error message from the API or system */
  originalError?: string;
  /** API response data (sensitive info filtered) */
  apiResponse?: unknown;
  /** Error occurrence timestamp */
  timestamp?: number;
}

/**
 * Task error interface
 * Contains detailed information about task failures
 */
export interface TaskError {
  /** Error code for categorization (e.g., 'TIMEOUT', 'NETWORK', 'API_ERROR') */
  code: string;
  /** Human-readable error message (user-friendly) */
  message: string;
  /** Detailed error information for debugging */
  details?: TaskErrorDetails;
}

// ============================================================================
// Core Task Model
// ============================================================================

/**
 * Unified Task interface
 *
 * This is the single task model used throughout the application.
 * Both main thread and Service Worker use this same type.
 */
export interface Task {
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
  /** User identifier (reserved for multi-user support) */
  userId?: string;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Task event type
 */
export type TaskEventType =
  | 'taskCreated'
  | 'taskUpdated'
  | 'taskDeleted'
  | 'taskSynced'
  | 'taskRejected';

/**
 * Task event interface
 * Represents state change events emitted by the task system
 */
export interface TaskEvent {
  /** Event type */
  type: TaskEventType;
  /** The task that triggered the event */
  task: Task;
  /** Timestamp when the event occurred */
  timestamp: number;
  /** Reason for rejection (only for taskRejected events) */
  reason?: string;
}

// ============================================================================
// State Types
// ============================================================================

/**
 * Task queue state interface
 * Represents the complete state of the task queue system
 */
export interface TaskQueueState {
  /** Map of task ID to task object */
  tasks: Map<string, Task>;
  /** Array of task IDs ordered by creation time */
  taskOrder: string[];
}

// ============================================================================
// Filter and Query Types
// ============================================================================

/**
 * Task filter for querying tasks
 */
export interface TaskFilter {
  /** Filter by status */
  status?: TaskStatus;
  /** Filter by type */
  type?: TaskType;
  /** Filter by creation time (start) */
  createdAfter?: number;
  /** Filter by creation time (end) */
  createdBefore?: number;
}

/**
 * Pagination parameters for task listing
 */
export interface TaskPaginationParams {
  /** Offset for pagination */
  offset: number;
  /** Limit per page */
  limit: number;
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// Backward Compatibility - Enum Aliases
// ============================================================================

/**
 * TaskStatus enum for backward compatibility
 * @deprecated Use string literal type instead
 */
export const TaskStatusEnum = {
  PENDING: 'pending' as const,
  PROCESSING: 'processing' as const,
  COMPLETED: 'completed' as const,
  FAILED: 'failed' as const,
  CANCELLED: 'cancelled' as const,
} as const;

/**
 * TaskType enum for backward compatibility
 * @deprecated Use string literal type instead
 */
export const TaskTypeEnum = {
  IMAGE: 'image' as const,
  VIDEO: 'video' as const,
  CHARACTER: 'character' as const,
  INSPIRATION_BOARD: 'inspiration_board' as const,
  CHAT: 'chat' as const,
} as const;

/**
 * TaskExecutionPhase enum for backward compatibility
 * @deprecated Use string literal type instead
 */
export const TaskExecutionPhaseEnum = {
  SUBMITTING: 'submitting' as const,
  POLLING: 'polling' as const,
  DOWNLOADING: 'downloading' as const,
} as const;
