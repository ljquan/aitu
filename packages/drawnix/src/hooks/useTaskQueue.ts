/**
 * useTaskQueue Hook
 * 
 * Provides React components with task queue state and operations.
 * Subscribes to task updates and provides memoized selectors.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { taskQueueService, swTaskQueueService, shouldUseSWTaskQueue } from '../services/task-queue';
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
  const [isLoading, setIsLoading] = useState(() => shouldUseSWTaskQueue());
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const syncAttempted = useRef(false);
  const loadMoreLock = useRef(false);

  // 更新分页状态
  const updatePaginationState = useCallback(() => {
    if (shouldUseSWTaskQueue()) {
      const state = swTaskQueueService.getPaginationState();
      setHasMore(state.hasMore);
      setTotalCount(state.total);
      setLoadedCount(state.loadedCount);
    }
  }, []);

  // Subscribe to task updates
  useEffect(() => {
    // Initialize with current tasks
    setTasks(taskQueueService.getAllTasks());

    // Subscribe to updates
    const subscription = taskQueueService.observeTaskUpdates().subscribe(() => {
      setTasks(taskQueueService.getAllTasks());
      setUpdateCounter(prev => prev + 1);
      // 更新分页状态
      updatePaginationState();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [updatePaginationState]);

  // 渲染时从 IndexedDB 加载任务数据
  useEffect(() => {
    if (syncAttempted.current) return;
    syncAttempted.current = true;

    const loadTasks = async () => {
      try {
        // 直接从 IndexedDB 读取任务（SW 和降级模式统一逻辑）
        const storedTasks = await taskStorageReader.getAllTasks();
        if (storedTasks.length > 0) {
          // 恢复任务到 taskQueueService 内存中（用于后续的实时更新）
          taskQueueService.restoreTasks(storedTasks);
        }
        // 加载完成后，刷新任务列表
        setTasks(taskQueueService.getAllTasks());
        // 更新分页状态
        updatePaginationState();
      } catch {
        // 静默忽略错误
      } finally {
        setIsLoading(false);
      }
    };

    loadTasks();
  }, [updatePaginationState]);

  // 加载更多任务
  const loadMore = useCallback(async () => {
    if (!shouldUseSWTaskQueue() || !hasMore || isLoadingMore || loadMoreLock.current) {
      return;
    }

    loadMoreLock.current = true;
    setIsLoadingMore(true);

    try {
      const stillHasMore = await swTaskQueueService.loadMoreTasks();
      // 从 swTaskQueueService 获取任务并更新本地 taskQueueService
      const swTasks = swTaskQueueService.getAllTasks();
      if (swTasks.length > 0) {
        taskQueueService.restoreTasks(swTasks);
      }
      setTasks(taskQueueService.getAllTasks());
      setHasMore(stillHasMore);
      updatePaginationState();
    } catch {
      // 静默忽略错误
    } finally {
      setIsLoadingMore(false);
      loadMoreLock.current = false;
    }
  }, [hasMore, isLoadingMore, updatePaginationState]);

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
    } catch (error) {
      console.error('[useTaskQueue] Failed to create task:', error);
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
