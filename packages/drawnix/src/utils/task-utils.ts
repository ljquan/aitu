/**
 * Task Utility Functions
 * 
 * Provides helper functions for task management including ID generation,
 * status checking, timeout detection, and duration formatting.
 */

import { Task, TaskStatus, TaskType } from '../types/task.types';
import { TASK_TIMEOUT, MAX_RETRY_COUNT } from '../constants/TASK_CONSTANTS';

/**
 * Generates a unique task ID using UUID v4 algorithm
 * 
 * @returns A unique task identifier string
 * 
 * @example
 * generateTaskId() // Returns "550e8400-e29b-41d4-a716-446655440000"
 */
export function generateTaskId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Checks if a task is in an active state (pending, processing, or retrying)
 * 
 * @param task - The task to check
 * @returns True if the task is active, false otherwise
 * 
 * @example
 * isTaskActive({ status: 'processing' }) // Returns true
 * isTaskActive({ status: 'completed' }) // Returns false
 */
export function isTaskActive(task: Task): boolean {
  return task.status === TaskStatus.PENDING || 
         task.status === TaskStatus.PROCESSING || 
         task.status === TaskStatus.RETRYING;
}

/**
 * Checks if a task has exceeded its timeout limit
 * 
 * @param task - The task to check
 * @returns True if the task has timed out, false otherwise
 * 
 * @example
 * const task = { type: 'image', startedAt: Date.now() - 11 * 60 * 1000 };
 * isTaskTimeout(task) // Returns true (started > 10 minutes ago)
 */
export function isTaskTimeout(task: Task): boolean {
  if (!task.startedAt || task.status !== TaskStatus.PROCESSING) {
    return false;
  }
  
  const timeout = getTaskTimeout(task.type);
  const elapsed = Date.now() - task.startedAt;
  
  return elapsed > timeout;
}

/**
 * Gets the timeout duration for a specific task type
 * 
 * @param taskType - The type of task
 * @returns Timeout duration in milliseconds
 * 
 * @example
 * getTaskTimeout('image') // Returns 600000 (10 minutes)
 * getTaskTimeout('video') // Returns 1800000 (30 minutes)
 */
export function getTaskTimeout(taskType: TaskType): number {
  return TASK_TIMEOUT[taskType.toUpperCase() as keyof typeof TASK_TIMEOUT] || TASK_TIMEOUT.IMAGE;
}

/**
 * Checks if a task can be retried
 * 
 * @param task - The task to check
 * @returns True if the task can be retried, false otherwise
 */
export function canRetry(task: Task): boolean {
  return task.retryCount < MAX_RETRY_COUNT && 
         (task.status === TaskStatus.FAILED || task.status === TaskStatus.RETRYING);
}

/**
 * Formats a duration in milliseconds to a human-readable string
 * 
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 * 
 * @example
 * formatTaskDuration(1500) // Returns "1s"
 * formatTaskDuration(65000) // Returns "1m 5s"
 * formatTaskDuration(3665000) // Returns "1h 1m 5s"
 */
export function formatTaskDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Calculates the elapsed time since a task was created
 * 
 * @param task - The task to calculate elapsed time for
 * @returns Elapsed time in milliseconds
 */
export function getTaskElapsedTime(task: Task): number {
  if (task.completedAt) {
    return task.completedAt - task.createdAt;
  }
  return Date.now() - task.createdAt;
}

/**
 * Gets a human-readable relative time string
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Human-readable relative time (e.g., "2 minutes ago")
 * 
 * @example
 * getRelativeTime(Date.now() - 120000) // Returns "2 minutes ago"
 * getRelativeTime(Date.now() - 3600000) // Returns "1 hour ago"
 */
export function getRelativeTime(timestamp: number): string {
  const elapsed = Date.now() - timestamp;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  } else if (hours > 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  } else if (minutes > 0) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  } else {
    return `${seconds} ${seconds === 1 ? 'second' : 'seconds'} ago`;
  }
}

/**
 * Truncates a string to a maximum length with ellipsis
 *
 * @param str - The string to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated string
 *
 * @example
 * truncateString("A very long prompt text", 10) // Returns "A very lon..."
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength) + '...';
}

/**
 * Formats a timestamp to a localized date-time string
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date-time string (e.g., "2025-12-18 14:30:25")
 *
 * @example
 * formatDateTime(Date.now()) // Returns "2025-12-18 14:30:25"
 */
export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
