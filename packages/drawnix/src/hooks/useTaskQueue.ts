/**
 * useTaskQueue Hook
 * 
 * Provides React components with task queue state and operations.
 * Subscribes to task updates and provides memoized selectors.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const loadSucceeded = useRef(false);
  const loadMoreLock = useRef(false);
  // 重试计数器
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;
  const retryDelay = 500;

  // 分页状态（不再使用 SW 分页，数据直接从 IndexedDB 加载）
  const updatePaginationState = useCallback(() => {
    // No-op: all data loaded from IndexedDB directly
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

  // 渲染时从 IndexedDB 加载任务数据（带重试逻辑）
  useEffect(() => {
    // 如果已成功加载，跳过
    if (loadSucceeded.current) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const loadTasks = async (): Promise<boolean> => {
      try {
        // 检查 IndexedDB 是否可用
        const isAvailable = await taskStorageReader.isAvailable();
        if (!isAvailable) {
          return false;
        }
        // 直接从 IndexedDB 读取任务（SW 和降级模式统一逻辑）
        const storedTasks = await taskStorageReader.getAllTasks();
        
        // 先恢复到 taskQueueService 内存中（merge 模式，不会覆盖正在执行的任务）
        // 然后从内存读取合并后的最新状态，确保 UI 显示与内存一致
        if (storedTasks.length > 0) {
          taskQueueService.restoreTasks(storedTasks);
        }
        
        // 从 taskQueueService 内存获取合并后的状态（比 storedTasks 更准确）
        setTasks(taskQueueService.getAllTasks());
        
        // 设置分页状态
        const allTasks = taskQueueService.getAllTasks();
        setTotalCount(allTasks.length);
        setLoadedCount(allTasks.length);
        setHasMore(false); // 直接从 IndexedDB 加载的是全部数据
        return true;
      } catch {
        return false;
      }
    };

    const init = async () => {
      setIsLoading(true);
      const success = await loadTasks();

      if (cancelled) return;

      setIsLoading(false);

      if (success) {
        loadSucceeded.current = true;
      } else if (retryCount < maxRetries) {
        // 加载失败，安排重试（指数退避）
        retryTimer = setTimeout(() => {
          if (!cancelled) {
            setRetryCount(prev => prev + 1);
          }
        }, retryDelay * (retryCount + 1));
      }
    };

    init();

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [updatePaginationState, retryCount]);

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
