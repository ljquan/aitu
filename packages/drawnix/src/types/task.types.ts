/**
 * Task Queue System Type Definitions
 *
 * This file re-exports core types from the shared types module.
 * The shared types are the single source of truth used by both main thread and SW.
 *
 * 此文件从共享类型模块重新导出核心类型。
 * 共享类型是主线程和 SW 使用的唯一真相来源。
 */

// ============================================================================
// Re-export Core Types from Shared Module
// ============================================================================

// Re-export all types from shared module
export * from './shared/core.types';

// Import types for use in this file
import type { Task } from './shared/core.types';

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

/**
 * Task event interface
 * Represents state change events emitted by the task queue
 */
export interface TaskEvent {
  /** Event type */
  type: 'taskCreated' | 'taskUpdated' | 'taskDeleted' | 'taskSynced' | 'taskRejected';
  /** The task that triggered the event */
  task: Task;
  /** Timestamp when the event occurred */
  timestamp: number;
  /** Reason for rejection (only for taskRejected events) */
  reason?: string;
}
