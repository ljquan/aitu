/**
 * useTaskStorage Hook
 *
 * Manages automatic synchronization between task queue state and IndexedDB storage.
 * Handles loading tasks on mount and debounced saving on updates.
 *
 * In SW mode: Tasks are managed by Service Worker's IndexedDB, this hook only
 * handles saving updates to local storage for backup/caching purposes.
 */

import { useEffect } from 'react';
import {
  taskQueueService,
  shouldUseSWTaskQueue,
  legacyTaskQueueService,
} from '../services/task-queue';
import { storageService } from '../services/storage-service';
import { UPDATE_INTERVALS } from '../constants/TASK_CONSTANTS';
import { migrateLegacyHistory } from '../utils/history-migration';
import {
  Task,
  TaskType,
  TaskStatus,
  TaskExecutionPhase,
} from '../types/task.types';
import { debounce } from '@aitu/utils';
import { isAsyncImageModel } from '../constants/model-config';

// Global flag to prevent multiple initializations (persists across HMR)
let globalInitialized = false;

/**
 * Wait for browser idle time to execute heavy operations
 * Falls back to setTimeout if requestIdleCallback is not available
 */
function waitForIdle(timeout = 100): Promise<void> {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in window) {
      (window as Window).requestIdleCallback(() => resolve(), { timeout });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Hook for automatic task storage synchronization
 *
 * Responsibilities:
 * - Initialize storage service on mount
 * - Load tasks from storage on mount
 * - Listen to task updates and save to storage (debounced)
 * - Clean up subscriptions on unmount
 *
 * @example
 * function App() {
 *   useTaskStorage(); // Automatic sync enabled
 *   return <YourComponents />;
 * }
 */
export function useTaskStorage(): void {
  useEffect(() => {
    let subscriptionActive = true;
    const usingSW = shouldUseSWTaskQueue();

    // Initialize storage and load tasks (deferred to browser idle time)
    const initializeStorage = async () => {
      if (globalInitialized) {
        // console.log('[useTaskStorage] Already initialized, skipping');
        return;
      }

      // Set flag immediately to prevent concurrent initialization
      globalInitialized = true;

      // Wait for browser idle time to avoid blocking page load
      await waitForIdle(50);

      // console.log('[useTaskStorage] Starting initialization...');

      try {
        // Initialize storage service
        await storageService.initialize();

        // Wait for browser idle between heavy operations
        await waitForIdle(50);

        // Migrate legacy history data from localStorage to task queue
        await migrateLegacyHistory();

        // In SW mode, tasks are managed by Service Worker's IndexedDB
        // Initialize SW service and sync tasks from SW
        if (usingSW) {
          // Import and initialize SW task queue service
          const { swTaskQueueService } = await import(
            '../services/sw-task-queue-service'
          );
          await swTaskQueueService.initialize();

          // Wait for browser idle
          await waitForIdle(50);

          // Migrate legacy tasks from old storage to SW (one-time migration)
          const legacyTasks = await storageService.loadTasks();
          if (legacyTasks.length > 0) {
            // Restore legacy tasks to SW service (which will sync to SW)
            await swTaskQueueService.restoreTasks(legacyTasks);

            // Clear legacy storage after successful migration
            for (const task of legacyTasks) {
              await storageService.deleteTask(task.id);
            }
          }

          // Sync tasks from SW to local state
          await swTaskQueueService.syncTasksFromSW();

          return;
        }

        // Legacy mode: Load tasks from storage (including migrated history)
        const storedTasks = await storageService.loadTasks();
        // console.log(`[useTaskStorage] Loaded ${storedTasks.length} tasks from IndexedDB`);

        if (storedTasks.length > 0 && subscriptionActive) {
          taskQueueService.restoreTasks(storedTasks);
          // console.log(`[useTaskStorage] Restored ${storedTasks.length} tasks from storage`);

          // Handle interrupted processing tasks based on task type and remoteId
          const processingTasks = storedTasks.filter(
            (task) => task.status === 'processing'
          );

          if (processingTasks.length > 0) {
            // console.log(`[useTaskStorage] Found ${processingTasks.length} interrupted processing tasks`);

            processingTasks.forEach((task) => {
              const isAsyncImageResumable =
                task.type === TaskType.IMAGE &&
                task.remoteId &&
                isAsyncImageModel(task.params?.model);

              // Video或异步图片任务且有 remoteId：允许后续恢复轮询
              if (
                (task.type === TaskType.VIDEO && task.remoteId) ||
                isAsyncImageResumable
              ) {
                // 留待 useTaskExecutor 恢复
              } else {
                // 其他任务视为中断失败
                let errorMessage = '任务被中断（页面刷新）';
                let errorCode = 'INTERRUPTED';

                if (
                  task.type === TaskType.VIDEO &&
                  task.executionPhase === TaskExecutionPhase.SUBMITTING
                ) {
                  errorMessage = '任务在提交过程中被中断，可能已在后台执行';
                  errorCode = 'INTERRUPTED_DURING_SUBMISSION';
                }

                legacyTaskQueueService.updateTaskStatus(
                  task.id,
                  TaskStatus.FAILED,
                  {
                    startedAt: undefined,
                    executionPhase: undefined,
                    error: {
                      code: errorCode,
                      message: errorMessage,
                      details: {
                        originalError: `Task interrupted by page refresh before completion (phase: ${
                          task.executionPhase || 'unknown'
                        })`,
                        timestamp: Date.now(),
                      },
                    },
                  }
                );
              }
            });
          }

          // Check for failed remote tasks that can be recovered (network errors with remoteId)
          const failedRemoteTasks = storedTasks.filter(
            (task) =>
              task.status === 'failed' &&
              task.remoteId &&
              (task.type === TaskType.VIDEO ||
                (task.type === TaskType.IMAGE &&
                  isAsyncImageModel(task.params?.model)))
          );

          if (failedRemoteTasks.length > 0) {
            // Helper function to check if error is a network error (not a business failure)
            const isNetworkError = (task: Task): boolean => {
              const errorMessage = task.error?.message || '';
              const originalError = task.error?.details?.originalError || '';
              const errorCode = task.error?.code || '';
              const combinedError =
                `${errorMessage} ${originalError}`.toLowerCase();

              // Exclude business failures - these should not be retried
              const isBusinessFailure =
                combinedError.includes('generation_failed') ||
                combinedError.includes('invalid_argument') ||
                combinedError.includes('prohibited') ||
                combinedError.includes('content policy') ||
                combinedError.includes('视频生成失败') ||
                errorCode.includes('generation_failed') ||
                errorCode.includes('INVALID');

              if (isBusinessFailure) {
                return false;
              }

              // Check for network-related errors
              return (
                combinedError.includes('failed to fetch') ||
                combinedError.includes('network') ||
                combinedError.includes('fetch') ||
                combinedError.includes('timeout') ||
                combinedError.includes('aborted') ||
                combinedError.includes('connection') ||
                combinedError.includes('status query failed')
              );
            };

            failedRemoteTasks.forEach((task) => {
              if (isNetworkError(task)) {
                // console.log(`[useTaskStorage] Recovering failed remote task ${task.id} (network error, has remoteId: ${task.remoteId})`);

                // Reset to processing status so useTaskExecutor can resume polling
                legacyTaskQueueService.updateTaskStatus(
                  task.id,
                  TaskStatus.PROCESSING,
                  {
                    error: undefined, // Clear error
                    executionPhase: TaskExecutionPhase.POLLING, // Set to polling phase
                  }
                );
              }
            });
          }

          // Count all incomplete tasks for logging
          const incompleteTasks = storedTasks.filter(
            (task) => task.status === 'pending'
          );
          const resumableTasks = processingTasks.filter(
            (task) =>
              (task.type === TaskType.VIDEO && task.remoteId) ||
              (task.type === TaskType.IMAGE &&
                task.remoteId &&
                isAsyncImageModel(task.params?.model))
          );

          if (incompleteTasks.length > 0 || resumableTasks.length > 0) {
            const totalIncomplete =
              incompleteTasks.length + resumableTasks.length;
            // console.log(`[useTaskStorage] Total ${totalIncomplete} incomplete tasks ready for execution`);
          }
        }
      } catch (error) {
        // Reset flag on error so retry is possible
        globalInitialized = false;
        console.error('[useTaskStorage] Failed to initialize storage:', error);
      }
    };

    // Create a debounced save function
    const debouncedSave = debounce(async (task: Task) => {
      try {
        await storageService.saveTask(task);
        // console.log(`[useTaskStorage] Saved task ${task.id} to storage`);
      } catch (error) {
        console.error('[useTaskStorage] Failed to save task:', error);
      }
    }, UPDATE_INTERVALS.STORAGE_SYNC);

    // Subscribe to task updates
    const subscription = taskQueueService
      .observeTaskUpdates()
      .subscribe((event) => {
        if (!subscriptionActive) {
          return;
        }

        // Handle different event types
        if (event.type === 'taskDeleted') {
          // Delete from storage immediately (no debounce)
          storageService.deleteTask(event.task.id).catch((error) => {
            console.error(
              '[useTaskStorage] Failed to delete task from storage:',
              error
            );
          });
        } else {
          // Debounce save operation for created/updated tasks
          debouncedSave(event.task);
        }
      });

    // Initialize
    initializeStorage();

    // Cleanup
    return () => {
      subscriptionActive = false;
      subscription.unsubscribe();
    };
  }, []);
}
