/**
 * Task Queue System Type Definitions
 *
 * This file re-exports types from the unified domain model.
 * Enums are provided for backward compatibility but are deprecated.
 *
 * @see packages/drawnix/src/domain/task/task.model.ts for the source of truth
 */

// Re-export all types from domain model
export type {
  TaskStatus,
  TaskType,
  TaskExecutionPhase,
  GenerationParams,
  ChatToolCall,
  TaskResult,
  TaskErrorDetails,
  TaskError,
  Task,
  TaskEvent,
  TaskEventType,
  TaskQueueState,
  TaskFilter,
  TaskPaginationParams,
} from '../domain/task';

// ============================================================================
// Backward Compatibility - Enums
// ============================================================================

/**
 * Task status enumeration
 * @deprecated Use string literal type 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' instead
 */
export enum TaskStatus {
  /** Task is waiting to be executed */
  PENDING = 'pending',
  /** Task is currently being processed */
  PROCESSING = 'processing',
  /** Task completed successfully */
  COMPLETED = 'completed',
  /** Task failed */
  FAILED = 'failed',
  /** Task was cancelled by the user */
  CANCELLED = 'cancelled'
}

/**
 * Task type enumeration
 * @deprecated Use string literal type 'image' | 'video' | 'character' | 'inspiration_board' | 'chat' instead
 */
export enum TaskType {
  /** Image generation task */
  IMAGE = 'image',
  /** Video generation task */
  VIDEO = 'video',
  /** Character extraction task */
  CHARACTER = 'character',
  /** Inspiration board generation task (image + split + layout) */
  INSPIRATION_BOARD = 'inspiration_board',
  /** Chat/AI analysis task (text model streaming) */
  CHAT = 'chat',
}

/**
 * Task execution phase enumeration
 * @deprecated Use string literal type 'submitting' | 'polling' | 'downloading' instead
 */
export enum TaskExecutionPhase {
  /** Task is being submitted to the API */
  SUBMITTING = 'submitting',
  /** Task submitted, polling for completion (video only) */
  POLLING = 'polling',
  /** Task completed, downloading result */
  DOWNLOADING = 'downloading'
}
