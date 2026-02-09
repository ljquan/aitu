/**
 * Task Queue Service Entry Point
 *
 * All task execution happens on the main thread.
 * SW is no longer used for LLM task management.
 */

// Re-export types
export type { Task, TaskStatus, TaskType, TaskEvent, GenerationParams } from '../../types/task.types';

// Export the main-thread task queue service
import { taskQueueService as _service } from '../task-queue-service';
export { taskQueueService } from '../task-queue-service';
export { taskQueueService as legacyTaskQueueService } from '../task-queue-service';

/**
 * Get the task queue service instance
 */
export function getTaskQueueService() {
  return _service;
}
