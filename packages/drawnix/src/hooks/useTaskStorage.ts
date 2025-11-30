/**
 * useTaskStorage Hook
 *
 * Manages automatic synchronization between task queue state and IndexedDB storage.
 * Handles loading tasks on mount and debounced saving on updates.
 */

import { useEffect, useRef } from 'react';
import { taskQueueService } from '../services/task-queue-service';
import { storageService } from '../services/storage-service';
import { UPDATE_INTERVALS } from '../constants/TASK_CONSTANTS';
import { migrateLegacyHistory } from '../utils/history-migration';
import { TaskType, TaskStatus, TaskExecutionPhase } from '../types/task.types';

// Global flag to prevent multiple initializations (persists across HMR)
let globalInitialized = false;

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
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let subscriptionActive = true;

    // Initialize storage and load tasks
    const initializeStorage = async () => {
      if (globalInitialized) {
        console.log('[useTaskStorage] Already initialized, skipping');
        return;
      }

      console.log('[useTaskStorage] Starting initialization...');

      try {
        // Initialize storage service
        await storageService.initialize();

        // Migrate legacy history data from localStorage to task queue
        await migrateLegacyHistory();

        // Load tasks from storage (including migrated history)
        const storedTasks = await storageService.loadTasks();
        console.log(`[useTaskStorage] Loaded ${storedTasks.length} tasks from IndexedDB`);

        if (storedTasks.length > 0 && subscriptionActive) {
          taskQueueService.restoreTasks(storedTasks);
          console.log(`[useTaskStorage] Restored ${storedTasks.length} tasks from storage`);

          // Handle interrupted processing tasks based on task type and remoteId
          const processingTasks = storedTasks.filter(task => task.status === 'processing');

          if (processingTasks.length > 0) {
            console.log(`[useTaskStorage] Found ${processingTasks.length} interrupted processing tasks`);

            processingTasks.forEach(task => {
              // Video tasks with remoteId can be resumed (polling can continue)
              if (task.type === TaskType.VIDEO && task.remoteId) {
                console.log(`[useTaskStorage] Video task ${task.id} can resume polling (remoteId: ${task.remoteId})`);
                // Keep as processing, useTaskExecutor will handle resumption
              } else {
                // Image tasks or video tasks without remoteId cannot be resumed
                // Mark as failed and let user decide to retry
                console.log(`[useTaskStorage] Task ${task.id} (${task.type}) cannot be resumed, marking as failed`);

                // Provide more specific error message based on execution phase
                let errorMessage = '任务被中断（页面刷新）';
                let errorCode = 'INTERRUPTED';

                // Check if video task was in submitting phase (API request may have succeeded on server)
                if (task.type === TaskType.VIDEO && task.executionPhase === TaskExecutionPhase.SUBMITTING) {
                  errorMessage = '任务在提交过程中被中断，可能已在后台执行';
                  errorCode = 'INTERRUPTED_DURING_SUBMISSION';
                }

                taskQueueService.updateTaskStatus(task.id, TaskStatus.FAILED, {
                  startedAt: undefined,
                  executionPhase: undefined, // Clear execution phase
                  error: {
                    code: errorCode,
                    message: errorMessage,
                    details: {
                      originalError: `Task interrupted by page refresh before completion (phase: ${task.executionPhase || 'unknown'})`,
                      timestamp: Date.now(),
                    },
                  },
                });
              }
            });
          }

          // Count all incomplete tasks for logging
          const incompleteTasks = storedTasks.filter(task =>
            task.status === 'pending' ||
            task.status === 'retrying'
          );
          const resumableTasks = processingTasks.filter(
            task => task.type === TaskType.VIDEO && task.remoteId
          );

          if (incompleteTasks.length > 0 || resumableTasks.length > 0) {
            const totalIncomplete = incompleteTasks.length + resumableTasks.length;
            console.log(`[useTaskStorage] Total ${totalIncomplete} incomplete tasks ready for execution`);
          }
        }

        globalInitialized = true;
      } catch (error) {
        console.error('[useTaskStorage] Failed to initialize storage:', error);
      }
    };

    // Subscribe to task updates
    const subscription = taskQueueService.observeTaskUpdates().subscribe(event => {
      if (!subscriptionActive) {
        return;
      }

      // Handle different event types
      if (event.type === 'taskDeleted') {
        // Delete from storage immediately (no debounce)
        storageService.deleteTask(event.task.id).catch(error => {
          console.error('[useTaskStorage] Failed to delete task from storage:', error);
        });
      } else {
        // Debounce save operation for created/updated tasks
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
        }

        saveTimerRef.current = setTimeout(async () => {
          try {
            await storageService.saveTask(event.task);
            console.log(`[useTaskStorage] Saved task ${event.task.id} to storage`);
          } catch (error) {
            console.error('[useTaskStorage] Failed to save task:', error);
          }
        }, UPDATE_INTERVALS.STORAGE_SYNC);
      }
    });

    // Initialize
    initializeStorage();

    // Cleanup
    return () => {
      subscriptionActive = false;
      subscription.unsubscribe();
      
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);
}
