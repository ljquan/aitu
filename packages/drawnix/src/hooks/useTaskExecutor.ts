/**
 * useTaskExecutor Hook
 * 
 * Automatically monitors and executes pending tasks in the background.
 * Handles task lifecycle: execution, timeout detection, retry logic.
 */

import { useEffect, useRef } from 'react';
import { taskQueueService } from '../services/task-queue-service';
import { generationAPIService } from '../services/generation-api-service';
import { Task, TaskStatus } from '../types/task.types';
import { isTaskTimeout } from '../utils/task-utils';
import { shouldRetry, getNextRetryTime } from '../utils/retry-utils';

/**
 * Hook for automatic task execution
 * 
 * Responsibilities:
 * - Monitor pending tasks and start execution
 * - Handle task timeout detection
 * - Implement retry logic with exponential backoff
 * - Update task status based on results
 * 
 * @example
 * function App() {
 *   useTaskExecutor(); // Tasks will execute automatically
 *   return <YourComponents />;
 * }
 */
export function useTaskExecutor(): void {
  const executingTasksRef = useRef<Set<string>>(new Set());
  const timeoutCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isActive = true;

    // Function to execute a single task
    const executeTask = async (task: Task) => {
      const taskId = task.id;

      // Prevent duplicate execution
      if (executingTasksRef.current.has(taskId)) {
        console.log(`[TaskExecutor] Task ${taskId} is already executing`);
        return;
      }

      executingTasksRef.current.add(taskId);
      console.log(`[TaskExecutor] Starting execution of task ${taskId}`);

      try {
        // Update status to processing
        taskQueueService.updateTaskStatus(taskId, TaskStatus.PROCESSING);

        // Execute the generation
        const result = await generationAPIService.generate(
          taskId,
          task.params,
          task.type
        );

        if (!isActive) return;

        // Mark as completed with result
        taskQueueService.updateTaskStatus(taskId, TaskStatus.COMPLETED, {
          result,
        });

        console.log(`[TaskExecutor] Task ${taskId} completed successfully`);
      } catch (error: any) {
        if (!isActive) return;

        console.error(`[TaskExecutor] Task ${taskId} failed:`, error);

        const updatedTask = taskQueueService.getTask(taskId);
        if (!updatedTask) return;

        // Check if we should retry
        if (shouldRetry(updatedTask)) {
          const nextRetryAt = getNextRetryTime(updatedTask);
          
          taskQueueService.updateTaskStatus(taskId, TaskStatus.RETRYING, {
            error: {
              code: error.name || 'ERROR',
              message: error.message || '生成失败',
            },
          });

          console.log(
            `[TaskExecutor] Task ${taskId} will retry (attempt ${updatedTask.retryCount + 1}/3) at ${new Date(nextRetryAt!).toLocaleTimeString()}`
          );

          // Schedule retry
          if (nextRetryAt) {
            const delay = nextRetryAt - Date.now();
            setTimeout(() => {
              if (!isActive) return;
              const task = taskQueueService.getTask(taskId);
              if (task && task.status === TaskStatus.RETRYING) {
                // Reset to pending to trigger re-execution
                taskQueueService.updateTaskStatus(taskId, TaskStatus.PENDING);
              }
            }, delay);
          }
        } else {
          // Mark as failed (no more retries)
          taskQueueService.updateTaskStatus(taskId, TaskStatus.FAILED, {
            error: {
              code: error.name || 'ERROR',
              message: error.message || '生成失败',
            },
          });

          console.log(`[TaskExecutor] Task ${taskId} failed permanently`);
        }
      } finally {
        executingTasksRef.current.delete(taskId);
      }
    };

    // Function to check for pending tasks and execute them
    const processPendingTasks = () => {
      if (!isActive) return;

      const tasks = taskQueueService.getAllTasks();
      const pendingTasks = tasks.filter(task => task.status === TaskStatus.PENDING);

      pendingTasks.forEach(task => {
        executeTask(task);
      });
    };

    // Function to check for timed out tasks
    const checkTimeouts = () => {
      if (!isActive) return;

      const tasks = taskQueueService.getAllTasks();
      const processingTasks = tasks.filter(task => task.status === TaskStatus.PROCESSING);

      processingTasks.forEach(task => {
        if (isTaskTimeout(task)) {
          console.warn(`[TaskExecutor] Task ${task.id} timed out`);
          
          // Cancel the API request
          generationAPIService.cancelRequest(task.id);
          
          // Check if we should retry
          if (shouldRetry(task)) {
            const nextRetryAt = getNextRetryTime(task);
            
            taskQueueService.updateTaskStatus(task.id, TaskStatus.RETRYING, {
              error: {
                code: 'TIMEOUT',
                message: '任务执行超时',
              },
            });

            // Schedule retry
            if (nextRetryAt) {
              const delay = nextRetryAt - Date.now();
              setTimeout(() => {
                if (!isActive) return;
                const t = taskQueueService.getTask(task.id);
                if (t && t.status === TaskStatus.RETRYING) {
                  taskQueueService.updateTaskStatus(task.id, TaskStatus.PENDING);
                }
              }, delay);
            }
          } else {
            taskQueueService.updateTaskStatus(task.id, TaskStatus.FAILED, {
              error: {
                code: 'TIMEOUT',
                message: '任务执行超时，已达最大重试次数',
              },
            });
          }
        }
      });
    };

    // Subscribe to task updates to catch new pending tasks
    const subscription = taskQueueService.observeTaskUpdates().subscribe(event => {
      if (!isActive) return;

      if (event.type === 'taskCreated' || event.type === 'taskUpdated') {
        if (event.task.status === TaskStatus.PENDING) {
          // New pending task, execute it
          executeTask(event.task);
        }
      }
    });

    // Process existing pending tasks on mount
    processPendingTasks();

    // Set up timeout checker (every 10 seconds)
    timeoutCheckIntervalRef.current = setInterval(checkTimeouts, 10000);

    // Cleanup
    return () => {
      isActive = false;
      subscription.unsubscribe();
      
      if (timeoutCheckIntervalRef.current) {
        clearInterval(timeoutCheckIntervalRef.current);
      }

      // Cancel all ongoing requests
      executingTasksRef.current.forEach(taskId => {
        generationAPIService.cancelRequest(taskId);
      });
      executingTasksRef.current.clear();
    };
  }, []);
}
