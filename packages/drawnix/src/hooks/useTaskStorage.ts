/**
 * useTaskStorage Hook
 *
 * Manages task queue initialization and state restoration from IndexedDB.
 * Handles data migration from legacy databases and restores interrupted tasks.
 *
 * 注意：任务持久化由 taskQueueService.persistTask() 统一写入 aitu-app 数据库，
 * 此 hook 只负责启动时的数据加载和恢复，不再额外订阅写入。
 */

import { useEffect } from 'react';
import {
  taskQueueService,
  legacyTaskQueueService,
} from '../services/task-queue';
import { taskStorageReader } from '../services/task-storage-reader';
import {
  Task,
  TaskType,
  TaskStatus,
  TaskExecutionPhase,
} from '../types/task.types';
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
 * Hook for task queue initialization and restoration
 *
 * Responsibilities:
 * - Migrate data from legacy databases (sw-task-queue → aitu-app)
 * - Load tasks from IndexedDB on mount
 * - Restore interrupted tasks
 */
export function useTaskStorage(): void {
  useEffect(() => {
    let subscriptionActive = true;

    // Initialize storage and load tasks (deferred to browser idle time)
    const initializeStorage = async () => {
      if (globalInitialized) {
        return;
      }

      // Set flag immediately to prevent concurrent initialization
      globalInitialized = true;

      // Wait for browser idle time to avoid blocking page load
      await waitForIdle(50);

      try {
        // 数据迁移：从旧 sw-task-queue 数据库迁移到 aitu-app（一次性）
        // 必须在 taskStorageReader.getAllTasks() 之前完成，
        // 否则读取 aitu-app 时数据还在 sw-task-queue 中，导致首次打开为空
        const { migrateFromLegacyDB } = await import('../services/app-database');
        await migrateFromLegacyDB();

        // Load tasks from IndexedDB (aitu-app)
        const storedTasks = await taskStorageReader.getAllTasks();
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

    // 断舍离：移除了 storageService 的订阅写入。
    // taskQueueService.persistTask() 已统一将任务写入 aitu-app 数据库，
    // 旧的 storageService 写入 aitu-task-queue 是冗余且写错数据库。

    // Initialize
    initializeStorage();

    // Cleanup
    return () => {
      subscriptionActive = false;
    };
  }, []);
}
