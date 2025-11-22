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

        // Load tasks from storage
        const storedTasks = await storageService.loadTasks();
        console.log(`[useTaskStorage] Loaded ${storedTasks.length} tasks from IndexedDB`);

        if (storedTasks.length > 0 && subscriptionActive) {
          taskQueueService.restoreTasks(storedTasks);
          console.log(`[useTaskStorage] Restored ${storedTasks.length} tasks from storage`);

          // Resume incomplete tasks (processing tasks were interrupted by page reload)
          const processingTasks = storedTasks.filter(task => task.status === 'processing');

          if (processingTasks.length > 0) {
            console.log(`[useTaskStorage] Resetting ${processingTasks.length} interrupted processing tasks to pending`);

            // Reset processing tasks back to pending (they were interrupted)
            processingTasks.forEach(task => {
              taskQueueService.updateTaskStatus(task.id, 'pending' as any, {
                startedAt: undefined,
              });
            });
          }

          // Count all incomplete tasks for logging
          const incompleteTasks = storedTasks.filter(task =>
            task.status === 'pending' ||
            task.status === 'retrying'
          );

          if (incompleteTasks.length > 0 || processingTasks.length > 0) {
            const totalIncomplete = incompleteTasks.length + processingTasks.length;
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
