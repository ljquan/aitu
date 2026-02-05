/**
 * Task Queue Service Entry Point
 *
 * Provides a unified interface for task queue services.
 * Automatically selects between SW-based and legacy implementations
 * based on browser support and configuration.
 *
 * CIRCULAR DEPENDENCY RESOLUTION:
 * The original circular dependency was:
 *   task-queue/index.ts → sw-task-queue-service.ts → sw-channel/client.ts → task-queue/index.ts
 *
 * This was broken by:
 * 1. Moving shouldUseSWTaskQueue to isolated sw-detection.ts (no service imports)
 * 2. sw-channel/client.ts imports from sw-detection.ts instead of task-queue/index.ts
 * 3. sw-task-queue-service.ts defers setupSWClientHandlers via queueMicrotask
 *
 * Now static imports work correctly without circular dependency issues.
 */

// Import shouldUseSWTaskQueue from isolated module to avoid circular dependencies
// IMPORTANT: sw-detection.ts must NOT import any task queue services
import { shouldUseSWTaskQueue } from './sw-detection';

// Re-export for external consumers
export { shouldUseSWTaskQueue } from './sw-detection';

// Re-export types
export type { Task, TaskStatus, TaskType, TaskEvent, GenerationParams } from '../../types/task.types';

// ============================================================================
// Static imports - safe now that circular dependency is broken
// ============================================================================

// Import services directly - the circular dependency has been resolved
import { swTaskQueueService as _swService } from '../sw-task-queue-service';
import { taskQueueService as _legacyService } from '../task-queue-service';

// Re-export both services for explicit usage
export { swTaskQueueService } from '../sw-task-queue-service';
export { taskQueueService as legacyTaskQueueService } from '../task-queue-service';

/**
 * Get the appropriate task queue service instance
 */
export function getTaskQueueService() {
  if (shouldUseSWTaskQueue()) {
    return _swService;
  }
  return _legacyService;
}

// Export the default service (SW-based when available)
export const taskQueueService = shouldUseSWTaskQueue() ? _swService : _legacyService;
