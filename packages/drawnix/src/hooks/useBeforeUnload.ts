/**
 * useBeforeUnload Hook
 *
 * Warns users when they try to leave/refresh the page while tasks are in progress.
 * Uses the browser's beforeunload event to show a confirmation dialog.
 *
 * Note: Some browsers (especially newer Chrome versions) may not show the dialog
 * due to security restrictions. In this case, the hook still attempts to register
 * the handler and will work in browsers that support it.
 */

import { useEffect } from 'react';
import { taskQueueService } from '../services/task-queue';
import { TaskStatus } from '../types/task.types';

/**
 * Hook to prevent accidental page navigation when tasks are active
 */
export function useBeforeUnload(): void {
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent): string | undefined => {
      const tasks = taskQueueService.getAllTasks();
      const activeTasks = tasks.filter(
        task =>
          task.status === TaskStatus.PENDING ||
          task.status === TaskStatus.PROCESSING
      );

      if (activeTasks.length > 0) {
        // 标准方式：同时使用 preventDefault 和 returnValue
        event.preventDefault();
        event.returnValue = '';
        return '';
      }
      return undefined;
    };

    // 注册事件处理器
    window.onbeforeunload = handleBeforeUnload;

    return () => {
      window.onbeforeunload = null;
    };
  }, []);
}
