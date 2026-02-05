/**
 * Task Utility Functions
 * 
 * Provides helper functions for task management including ID generation,
 * status checking, timeout detection, and duration formatting.
 */

import { Task, TaskStatus, TaskType } from '../types/task.types';
import { TASK_TIMEOUT } from '../constants/TASK_CONSTANTS';
import { generateUUID, formatDate } from '@aitu/utils';

/**
 * Generates a unique task ID using UUID v4 algorithm
 * 
 * @returns A unique task identifier string
 * 
 * @example
 * generateTaskId() // Returns "550e8400-e29b-41d4-a716-446655440000"
 */
export function generateTaskId(): string {
  return generateUUID();
}

/**
 * Checks if a task is in an active state (pending or processing)
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
         task.status === TaskStatus.PROCESSING;
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
 * Formats a timestamp to a localized date-time string
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date-time string (e.g., "2025-12-18 14:30:25")
 *
 * @example
 * formatDateTime(Date.now()) // Returns "2025-12-18 14:30:25"
 */
export const formatDateTime = formatDate;
