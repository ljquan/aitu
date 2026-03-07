/**
 * useTaskQueue Hook
 * 
 * Provides React components with task queue state and operations.
 * Subscribes to task updates and provides memoized selectors.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { taskQueueService } from '../services/task-queue';
import { taskStorageReader } from '../services/task-storage-reader';
import { Task, TaskStatus, TaskType, GenerationParams } from '../types/task.types';

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
  /** Whether data is being loaded from SW */
  isLoading: boolean;
  /** Whether more tasks are being loaded */
  isLoadingMore: boolean;
  /** Whether there are more tasks to load */
  hasMore: boolean;
  /** Total count of tasks in SW */
  totalCount: number;
  /** Loaded count of tasks */
  loadedCount: number;
  /** Load more tasks (pagination) */
  loadMore: () => Promise<void>;
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
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore] = useState(false);
  const [hasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);

  // Subscribe to task updates (useTaskStorage handles IndexedDB loading and restoreTasks)
  useEffect(() => {
    let cancelled = false;

    // Initialize with current in-memory tasks
    const currentTasks = taskQueueService.getAllTasks();
    setTasks(currentTasks);
    setTotalCount(currentTasks.length);
    setLoadedCount(currentTasks.length);
    if (currentTasks.length > 0) {
      console.warn(`[useTaskQueue] Init: ${currentTasks.length} tasks from memory`);
      setIsLoading(false);
    } else {
      console.warn('[useTaskQueue] Init: memory empty, waiting for restore or DB fallback');
    }

    // Subscribe to updates — catches tasks restored by useTaskStorage
    const subscription = taskQueueService.observeTaskUpdates().subscribe(() => {
      const allTasks = taskQueueService.getAllTasks();
      setTasks(allTasks);
      setUpdateCounter(prev => prev + 1);
      setTotalCount(allTasks.length);
      setLoadedCount(allTasks.length);
      setIsLoading(false);
    });

    // 如果内存中没有数据（useTaskStorage 可能还没完成），
    // 延迟从 IndexedDB 补充加载，避免面板打开时显示空数据
    if (currentTasks.length === 0) {
      const loadFromDB = async () => {
        // 先等一小段时间，给 useTaskStorage 机会先完成
        await new Promise(r => setTimeout(r, 500));
        if (cancelled) return;

        // 再次检查内存，useTaskStorage 可能已经完成了
        const memTasks = taskQueueService.getAllTasks();
        if (memTasks.length > 0) {
          console.warn(`[useTaskQueue] Fallback: ${memTasks.length} tasks appeared in memory`);
          setTasks(memTasks);
          setTotalCount(memTasks.length);
          setLoadedCount(memTasks.length);
          setIsLoading(false);
          return;
        }

        // 内存仍为空，直接从 IndexedDB 读取
        console.warn('[useTaskQueue] Fallback: loading from IndexedDB');
        try {
          const isAvailable = await taskStorageReader.isAvailable();
          if (!isAvailable || cancelled) {
            console.warn('[useTaskQueue] Fallback: IndexedDB not available');
            setIsLoading(false);
            return;
          }
          const storedTasks = await taskStorageReader.getAllTasks();
          if (cancelled) return;

          console.warn(`[useTaskQueue] Fallback: loaded ${storedTasks.length} tasks from IndexedDB`);
          if (storedTasks.length > 0) {
            taskQueueService.restoreTasks(storedTasks);
          }
          const allTasks = taskQueueService.getAllTasks();
          setTasks(allTasks);
          setTotalCount(allTasks.length);
          setLoadedCount(allTasks.length);
        } catch (error) {
          console.warn('[useTaskQueue] Fallback: IndexedDB load failed', error);
        }
        if (!cancelled) {
          setIsLoading(false);
        }
      };
      loadFromDB();
    }

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // 加载更多任务（不再需要 SW 分页，直接返回）
  const loadMore = useCallback(async () => {
    // All tasks loaded from IndexedDB on mount, no pagination needed
  }, []);

  // 注意：任务状态更新主要依赖 SW 的广播事件
  // visibility 监听器会在页面变为可见时同步第一页
  // 不再使用轮询，避免重置分页状态和内存问题

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
    } catch {
      return null;
    }
  }, []);

  const cancelTask = useCallback((taskId: string) => {
    taskQueueService.cancelTask(taskId);
  }, []);

  const retryTask = useCallback((taskId: string) => {
    // taskQueueService 在 SW 模式下已经是 swTaskQueueService
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
    isLoading,
    isLoadingMore,
    hasMore,
    totalCount,
    loadedCount,
    loadMore,
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
