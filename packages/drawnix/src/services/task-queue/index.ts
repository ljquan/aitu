/**
 * Task Queue Service Entry Point
 *
 * Unified task queue service based on domain layer.
 */

import { taskService } from '../../domain/task';

// All task queue services now use the unified taskService
export const taskQueueService = taskService;
export const swTaskQueueService = taskService;
export const legacyTaskQueueService = taskService;

// Legacy function exports for backward compatibility
export function shouldUseSWTaskQueue(): boolean {
  return true; // Always use the unified service
}

export function getTaskQueueService() {
  return taskService;
}

// Re-export types from domain model
export type {
  Task,
  TaskStatus,
  TaskType,
  TaskEvent,
  GenerationParams,
  TaskExecutionPhase,
} from '../../domain/task';

// Re-export enums for backward compatibility
export {
  TaskStatus,
  TaskType,
  TaskExecutionPhase,
} from '../../types/task.types';
