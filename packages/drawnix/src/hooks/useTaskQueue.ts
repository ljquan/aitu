/**
 * useTaskQueue Hook
 * 
 * Provides React components with task queue state and operations.
 * Subscribes to task updates and provides memoized selectors.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { taskQueueService } from '../services/task-queue';
import { Task, TaskStatus, TaskType, GenerationParams } from '../types/task.types';
import { swTaskQueueService, shouldUseSWTaskQueue } from '../services/task-queue';

/**
 * Return type for useTaskQueue hook
 */
export interface UseTaskQueueReturn {
  /** All tasks in the queue */
  tasks: Task[];
  /** Tasks that are pending, processing, or retrying */
  activeTasks: Task[];
  /** Successfully completed tasks */
  completedTasks: Task[];
  /** Failed tasks */
  failedTasks: Task[];
  /** Cancelled tasks */
  cancelledTasks: Task[];
  /** Creates a new task */
  createTask: (params: GenerationParams, type: TaskType) => Task | null;
  /** Cancels a task */
  cancelTask: (taskId: string) => void;
  /** Retries a failed task */
  retryTask: (taskId: string) => void;
  /** Deletes a task */
  deleteTask: (taskId: string) => void;
  /** Clears all completed tasks */
  clearCompleted: () => void;
  /** Clears all failed tasks */
  clearFailed: () => void;
  /** Gets a specific task by ID */
  getTask: (taskId: string) => Task | undefined;
  /** Batch delete multiple tasks */
  batchDeleteTasks: (taskIds: string[]) => void;
  /** Batch retry multiple failed tasks */
  batchRetryTasks: (taskIds: string[]) => void;
  /** Batch cancel multiple active tasks */
  batchCancelTasks: (taskIds: string[]) => void;
}

/**
 * Hook for managing task queue state and operations
 * 
 * @example
 * function TaskManager() {
 *   const { tasks, createTask, cancelTask } = useTaskQueue();
 *   
 *   const handleCreate = () => {
 *     createTask({ prompt: "cat" }, 'image');
 *   };
 *   
 *   return (
 *     <div>
 *       <button onClick={handleCreate}>Create Task</button>
 *       {tasks.map(task => (
 *         <div key={task.id}>{task.params.prompt}</div>
 *       ))}
 *     </div>
 *   );
 * }
 */
export function useTaskQueue(): UseTaskQueueReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [updateCounter, setUpdateCounter] = useState(0);
  const syncAttempted = useRef(false);

  // Subscribe to task updates
  useEffect(() => {
    // Initialize with current tasks
    setTasks(taskQueueService.getAllTasks());

    // Subscribe to updates
    const subscription = taskQueueService.observeTaskUpdates().subscribe(() => {
      setTasks(taskQueueService.getAllTasks());
      setUpdateCounter(prev => prev + 1);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 渲染时从 SW 同步任务数据（确保数据加载）
  useEffect(() => {
    if (syncAttempted.current) return;
    syncAttempted.current = true;

    const syncFromSW = async () => {
      if (!shouldUseSWTaskQueue()) return;
      
      try {
        // 同步 SW 任务到本地
        await swTaskQueueService.syncTasksFromSW();
        // 从 swTaskQueueService 获取任务并更新本地 taskQueueService
        const swTasks = swTaskQueueService.getAllTasks();
        if (swTasks.length > 0) {
          taskQueueService.restoreTasks(swTasks);
        }
      } catch {
        // 静默忽略同步错误
      }
    };

    syncFromSW();
  }, []);

  // Memoized selectors
  const activeTasks = useMemo(() => {
    return tasks.filter(task => 
      task.status === TaskStatus.PENDING ||
      task.status === TaskStatus.PROCESSING
    );
  }, [tasks]);

  const completedTasks = useMemo(() => {
    return tasks.filter(task => task.status === TaskStatus.COMPLETED);
  }, [tasks]);

  const failedTasks = useMemo(() => {
    return tasks.filter(task => task.status === TaskStatus.FAILED);
  }, [tasks]);

  const cancelledTasks = useMemo(() => {
    return tasks.filter(task => task.status === TaskStatus.CANCELLED);
  }, [tasks]);

  // Task operations
  const createTask = useCallback((params: GenerationParams, type: TaskType): Task | null => {
    try {
      const task = taskQueueService.createTask(params, type);
      return task;
    } catch (error) {
      console.error('[useTaskQueue] Failed to create task:', error);
      return null;
    }
  }, []);

  const cancelTask = useCallback((taskId: string) => {
    taskQueueService.cancelTask(taskId);
  }, []);

  const retryTask = useCallback((taskId: string) => {
    taskQueueService.retryTask(taskId);
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    taskQueueService.deleteTask(taskId);
  }, []);

  const clearCompleted = useCallback(() => {
    taskQueueService.clearCompletedTasks();
  }, []);

  const clearFailed = useCallback(() => {
    taskQueueService.clearFailedTasks();
  }, []);

  const getTask = useCallback((taskId: string) => {
    return taskQueueService.getTask(taskId);
  }, [updateCounter]); // Re-create when tasks update

  const batchDeleteTasks = useCallback((taskIds: string[]) => {
    taskIds.forEach(taskId => {
      taskQueueService.deleteTask(taskId);
    });
  }, []);

  const batchRetryTasks = useCallback((taskIds: string[]) => {
    taskIds.forEach(taskId => {
      taskQueueService.retryTask(taskId);
    });
  }, []);

  const batchCancelTasks = useCallback((taskIds: string[]) => {
    taskIds.forEach(taskId => {
      taskQueueService.cancelTask(taskId);
    });
  }, []);

  return {
    tasks,
    activeTasks,
    completedTasks,
    failedTasks,
    cancelledTasks,
    createTask,
    cancelTask,
    retryTask,
    deleteTask,
    clearCompleted,
    clearFailed,
    getTask,
    batchDeleteTasks,
    batchRetryTasks,
    batchCancelTasks,
  };
}
