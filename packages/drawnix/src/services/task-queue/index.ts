/**
 * Task Queue Service Entry Point
 *
 * Provides a unified interface for task queue services.
 * Automatically selects between SW-based and legacy implementations
 * based on browser support and configuration.
 */

import { swTaskQueueService, SWTaskQueueService } from '../sw-task-queue-service';
import { taskQueueService as legacyTaskQueueService } from '../task-queue-service';

// Feature flag for SW task queue (can be configured via environment or settings)
const USE_SW_TASK_QUEUE = true;

/**
 * Check if Service Worker task queue should be used
 */
export function shouldUseSWTaskQueue(): boolean {
  if (!USE_SW_TASK_QUEUE) return false;
  if (typeof navigator === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  return true;
}

/**
 * Get the appropriate task queue service instance
 */
export function getTaskQueueService() {
  if (shouldUseSWTaskQueue()) {
    return swTaskQueueService;
  }
  return legacyTaskQueueService;
}

// Export both services for explicit usage
export { swTaskQueueService } from '../sw-task-queue-service';
export { taskQueueService as legacyTaskQueueService } from '../task-queue-service';

// Export the default service (SW-based when available)
export const taskQueueService = shouldUseSWTaskQueue()
  ? swTaskQueueService
  : legacyTaskQueueService;

// Re-export types
export type { Task, TaskStatus, TaskType, TaskEvent, GenerationParams } from '../../types/task.types';
