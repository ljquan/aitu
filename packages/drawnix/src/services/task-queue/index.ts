/**
 * Task Queue Service Entry Point
 *
 * Provides a unified interface for task queue services.
 * Automatically selects between SW-based and legacy implementations
 * based on browser support and configuration.
 */

import { swTaskQueueService } from '../sw-task-queue-service';
import { taskQueueService as legacyTaskQueueService } from '../task-queue-service';

// Feature flag for SW task queue (can be configured via environment or settings)
const USE_SW_TASK_QUEUE = true;

// Cache URL parameter check result (evaluated once on module load)
let urlParamSwEnabled: boolean | null = null;

/**
 * Check URL parameter for SW mode control
 * URL params:
 *   - ?sw=0 or ?sw=false: Force disable SW, use fallback mode
 *   - ?sw=1 or ?sw=true: Force enable SW (default behavior)
 */
function checkUrlSwParam(): boolean | null {
  if (urlParamSwEnabled !== null) {
    return urlParamSwEnabled;
  }

  if (typeof window === 'undefined' || !window.location) {
    return null;
  }

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const swParam = urlParams.get('sw');

    if (swParam === null) {
      // No parameter specified, use default behavior
      urlParamSwEnabled = null;
      return null;
    }

    // Parse the parameter value
    const lowered = swParam.toLowerCase();
    if (lowered === '0' || lowered === 'false' || lowered === 'off') {
      urlParamSwEnabled = false;
      console.log('[TaskQueue] SW disabled via URL parameter (?sw=0), using fallback mode');
      return false;
    }

    if (lowered === '1' || lowered === 'true' || lowered === 'on') {
      urlParamSwEnabled = true;
      return true;
    }

    // Invalid value, use default
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if Service Worker task queue should be used
 *
 * Priority:
 * 1. URL parameter ?sw=0/false/off forces fallback mode
 * 2. URL parameter ?sw=1/true/on forces SW mode (if supported)
 * 3. Default: use SW if supported
 */
export function shouldUseSWTaskQueue(): boolean {
  // Check URL parameter first
  const urlOverride = checkUrlSwParam();
  if (urlOverride === false) {
    return false;
  }

  // Check feature flag and browser support
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
