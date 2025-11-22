/**
 * Task Queue System Constants
 * 
 * Centralized constant definitions for the task queue system.
 * All timing, limits, and configuration values are defined here.
 */

/**
 * Task timeout durations (in milliseconds)
 * Different timeouts for different content types
 */
export const TASK_TIMEOUT = {
  /** Image generation timeout: 10 minutes */
  IMAGE: 10 * 60 * 1000,
  /** Video generation timeout: 30 minutes */
  VIDEO: 30 * 60 * 1000,
} as const;

/**
 * Retry delay intervals for exponential backoff (in milliseconds)
 * Applied sequentially on each retry attempt
 */
export const RETRY_DELAYS = [
  1 * 60 * 1000,  // 1st retry: 1 minute
  5 * 60 * 1000,  // 2nd retry: 5 minutes
  15 * 60 * 1000, // 3rd retry: 15 minutes
] as const;

/**
 * Maximum number of retry attempts
 * After this many retries, the task is marked as failed
 */
export const MAX_RETRY_COUNT = 3;

/**
 * Duplicate submission prevention window (in milliseconds)
 * Tasks with identical parameters submitted within this window are rejected
 */
export const DUPLICATE_SUBMISSION_WINDOW = 5 * 1000; // 5 seconds

/**
 * Form reset delay (in milliseconds)
 * Delay before resetting the form after task creation
 */
export const FORM_RESET_DELAY = 100; // 100ms for smooth UX

/**
 * IndexedDB configuration
 * Database settings for task persistence
 */
export const INDEXEDDB_CONFIG = {
  /** Database name */
  DATABASE_NAME: 'aitu-task-queue',
  /** Database version */
  DATABASE_VERSION: 1,
  /** Object store name for tasks */
  TASKS_STORE_NAME: 'tasks',
  /** Storage key for task queue state */
  STORAGE_KEY: 'taskQueueState',
} as const;

/**
 * Storage limits and thresholds
 */
export const STORAGE_LIMITS = {
  /** Warning threshold (50MB in bytes) */
  WARNING_THRESHOLD: 50 * 1024 * 1024,
  /** Maximum number of completed tasks to retain */
  MAX_RETAINED_TASKS: 100,
} as const;

/**
 * UI update intervals (in milliseconds)
 */
export const UPDATE_INTERVALS = {
  /** Task status polling interval */
  STATUS_POLL: 5 * 1000, // 5 seconds
  /** Storage sync debounce delay */
  STORAGE_SYNC: 500, // 500ms
  /** UI refresh throttle */
  UI_REFRESH: 100, // 100ms
} as const;

/**
 * Animation durations (in milliseconds)
 */
export const ANIMATION_DURATIONS = {
  /** Panel expand/collapse animation */
  PANEL_TOGGLE: 200,
  /** Notification display duration */
  NOTIFICATION: 5000, // 5 seconds
} as const;
