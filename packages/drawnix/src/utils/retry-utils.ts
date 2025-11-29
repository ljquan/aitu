/**
 * Retry Strategy Utilities
 * 
 * Implements exponential backoff retry logic for failed tasks.
 * Provides functions to calculate retry delays and determine retry eligibility.
 */

import { Task, TaskType } from '../types/task.types';
import { RETRY_DELAYS, MAX_RETRY_COUNT } from '../constants/TASK_CONSTANTS';

/**
 * Calculates the delay before the next retry attempt
 * Uses exponential backoff strategy with predefined intervals
 * 
 * @param retryCount - Number of retries already attempted (0-indexed)
 * @returns Delay in milliseconds, or 0 if retry count exceeds maximum
 * 
 * @example
 * calculateRetryDelay(0) // Returns 60000 (1 minute)
 * calculateRetryDelay(1) // Returns 300000 (5 minutes)
 * calculateRetryDelay(2) // Returns 900000 (15 minutes)
 * calculateRetryDelay(3) // Returns 0 (no more retries)
 */
export function calculateRetryDelay(retryCount: number): number {
  if (retryCount < 0 || retryCount >= RETRY_DELAYS.length) {
    return 0;
  }
  return RETRY_DELAYS[retryCount];
}

/**
 * Determines if a task should be retried based on its current state
 *
 * @param task - The task to evaluate
 * @returns True if the task is eligible for retry, false otherwise
 *
 * Note: Both image and video tasks do NOT auto-retry because:
 * 1. Generation is expensive (time and cost)
 * 2. If generation fails, it's usually due to content policy, quota, or API issues
 * 3. User can manually retry if needed
 *
 * @example
 * shouldRetry({ ...task, type: 'image', retryCount: 2, status: 'failed' }) // Returns false
 * shouldRetry({ ...task, type: 'video', retryCount: 0, status: 'failed' }) // Returns false
 */
export function shouldRetry(task: Task): boolean {
  // Disable auto-retry for all tasks
  // User can manually retry if needed
  return false;
}

/**
 * Calculates the next retry timestamp for a task
 * 
 * @param task - The task to calculate retry time for
 * @returns Unix timestamp (in milliseconds) when retry should occur, or null if no retry
 * 
 * @example
 * const task = { retryCount: 1, updatedAt: Date.now() };
 * getNextRetryTime(task) // Returns timestamp 5 minutes in the future
 */
export function getNextRetryTime(task: Task): number | null {
  if (!shouldRetry(task)) {
    return null;
  }
  
  const delay = calculateRetryDelay(task.retryCount);
  if (delay === 0) {
    return null;
  }
  
  return task.updatedAt + delay;
}

/**
 * Checks if a task is ready to be retried based on current time
 * 
 * @param task - The task to check
 * @returns True if the task should be retried now, false otherwise
 */
export function isReadyForRetry(task: Task): boolean {
  if (!task.nextRetryAt) {
    return false;
  }
  
  return Date.now() >= task.nextRetryAt;
}

/**
 * Formats retry delay for human-readable display
 * 
 * @param retryCount - The retry attempt number (0-indexed)
 * @returns Human-readable delay string
 * 
 * @example
 * formatRetryDelay(0) // Returns "1 minute"
 * formatRetryDelay(1) // Returns "5 minutes"
 * formatRetryDelay(2) // Returns "15 minutes"
 */
export function formatRetryDelay(retryCount: number): string {
  const delay = calculateRetryDelay(retryCount);
  if (delay === 0) {
    return 'N/A';
  }
  
  const minutes = Math.floor(delay / 60000);
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}
