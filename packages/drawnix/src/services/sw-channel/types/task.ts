/**
 * Task Related Types for SW Channel
 *
 * This file re-exports types from the unified domain model and adds
 * SW-specific RPC and event types.
 *
 * @see packages/drawnix/src/domain/task/task.model.ts for the source of truth
 */

// Re-export core types from domain model
export type {
  TaskStatus,
  TaskType,
  TaskExecutionPhase,
  GenerationParams,
  TaskResult,
  TaskError,
  Task,
} from '../../../domain/task';

// ============================================================================
// SW Task Alias
// ============================================================================

/**
 * SWTask is now an alias for Task
 * They use the same unified model
 */
export type { Task as SWTask } from '../../../domain/task';

// ============================================================================
// RPC Parameters and Responses
// ============================================================================

/**
 * Task creation request parameters
 */
export interface TaskCreateParams {
  taskId: string;
  taskType: import('../../../domain/task').TaskType;
  params: import('../../../domain/task').GenerationParams;
}

/**
 * Task creation response
 */
export interface TaskCreateResult {
  success: boolean;
  task?: import('../../../domain/task').Task;
  existingTaskId?: string;
  reason?: 'duplicate' | 'not_initialized' | string;
}

/**
 * Paginated task list request
 */
export interface TaskListPaginatedParams {
  offset: number;
  limit: number;
  status?: import('../../../domain/task').TaskStatus;
  type?: import('../../../domain/task').TaskType;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated task list response
 */
export interface TaskListPaginatedResult {
  success: boolean;
  tasks: import('../../../domain/task').Task[];
  total: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Task operation parameters
 */
export interface TaskOperationParams {
  taskId: string;
}

/**
 * Task operation response
 */
export interface TaskOperationResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Task status change event
 */
export interface TaskStatusEvent {
  taskId: string;
  status: import('../../../domain/task').TaskStatus;
  progress?: number;
  phase?: import('../../../domain/task').TaskExecutionPhase;
  updatedAt: number;
}

/**
 * Task completed event
 */
export interface TaskCompletedEvent {
  taskId: string;
  result: import('../../../domain/task').TaskResult;
  completedAt: number;
  remoteId?: string;
}

/**
 * Task failed event
 */
export interface TaskFailedEvent {
  taskId: string;
  error: import('../../../domain/task').TaskError;
}

/**
 * Task created event (broadcast to other clients)
 */
export interface TaskCreatedEvent {
  task: import('../../../domain/task').Task;
  sourceClientId?: string;
}
