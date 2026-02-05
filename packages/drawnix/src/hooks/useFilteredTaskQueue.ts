/**
 * useFilteredTaskQueue Hook
 * 
 * 用于弹窗中的任务列表，支持按类型过滤和分页加载。
 * 与 useTaskQueue 不同，这个 hook 直接从 SW 查询数据，
 * 支持类型过滤，并且不会影响全局任务缓存。
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Task, TaskType } from '../types/task.types';
import { taskQueueService, swTaskQueueService, shouldUseSWTaskQueue } from '../services/task-queue';
import { taskStorageReader } from '../services/task-storage-reader';

export interface UseFilteredTaskQueueOptions {
  /** 任务类型过滤 */
  taskType?: TaskType;
  /** 每页加载数量 */
  pageSize?: number;
}

export interface UseFilteredTaskQueueReturn {
  /** 已加载的任务列表 */
  tasks: Task[];
  /** 是否正在加载初始数据 */
  isLoading: boolean;
  /** 是否正在加载更多 */
  isLoadingMore: boolean;
  /** 是否还有更多数据 */
  hasMore: boolean;
  /** 总任务数 */
  totalCount: number;
  /** 已加载任务数 */
  loadedCount: number;
  /** 加载更多 */
  loadMore: () => Promise<void>;
  /** 刷新数据 */
  refresh: () => Promise<void>;
  /** 重试任务 */
  retryTask: (taskId: string) => void;
  /** 删除任务 */
  deleteTask: (taskId: string) => void;
}

/**
 * 用于弹窗中按类型过滤的任务列表 hook
 */
export function useFilteredTaskQueue(
  options: UseFilteredTaskQueueOptions = {}
): UseFilteredTaskQueueReturn {
  const { taskType, pageSize = 50 } = options;
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  
  const loadMoreLock = useRef(false);
  // 跟踪已成功加载的 taskType，避免重复加载相同类型
  const loadedTaskType = useRef<TaskType | undefined>(undefined);
  // 重试计数器，用于触发重新加载
  const [retryCount, setRetryCount] = useState(0);
  // 最大重试次数
  const maxRetries = 3;
  // 重试延迟（毫秒）
  const retryDelay = 500;

  // 加载任务数据（直接读取 IndexedDB，无论 SW 模式还是降级模式）
  const loadTasks = useCallback(async (offset = 0, append = false): Promise<boolean> => {
    if (taskType === undefined) {
      setIsLoading(false);
      return false;
    }

    try {
      // 直接从 IndexedDB 读取（SW 模式和降级模式都使用同一个数据库）
      if (await taskStorageReader.isAvailable()) {
        const result = await taskStorageReader.getTasksByType(taskType, offset, pageSize);
        
        if (append) {
          setTasks(prev => {
            const existingIds = new Set(prev.map(t => t.id));
            const newTasks = result.tasks.filter(t => !existingIds.has(t.id));
            return [...prev, ...newTasks];
          });
        } else {
          setTasks(result.tasks);
        }
        setTotalCount(result.total);
        setHasMore(result.hasMore);
        return true;
      }
      
      // Fallback: 通过 swTaskQueueService 获取（仅 SW 模式可用）
      if (shouldUseSWTaskQueue()) {
        const result = await swTaskQueueService.loadTasksByType(taskType, offset, pageSize);
        
        if (result.success) {
          if (append) {
            setTasks(prev => {
              const existingIds = new Set(prev.map(t => t.id));
              const newTasks = result.tasks.filter(t => !existingIds.has(t.id));
              return [...prev, ...newTasks];
            });
          } else {
            setTasks(result.tasks);
          }
          setTotalCount(result.total);
          setHasMore(result.hasMore);
          return true;
        }
      }
      return false;
    } catch {
      // 静默忽略错误
      return false;
    }
  }, [taskType, pageSize]);

  // 初始加载 - 当 taskType 变化或首次加载失败时重试
  useEffect(() => {
    // 如果已经成功加载过相同的 taskType，跳过
    if (loadedTaskType.current === taskType) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const init = async () => {
      setIsLoading(true);
      const success = await loadTasks(0, false);
      
      if (cancelled) return;
      
      setIsLoading(false);
      
      // 只有成功加载后才标记为已加载
      if (success) {
        loadedTaskType.current = taskType;
      } else if (retryCount < maxRetries) {
        // 加载失败，安排重试
        retryTimer = setTimeout(() => {
          if (!cancelled) {
            setRetryCount(prev => prev + 1);
          }
        }, retryDelay * (retryCount + 1)); // 指数退避
      }
    };

    init();

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [loadTasks, taskType, retryCount]);

  // 监听任务更新事件（新任务创建、状态变化等）
  // SW 模式和降级模式都使用 taskQueueService（它会根据模式选择正确的服务）
  useEffect(() => {
    const subscription = taskQueueService.observeTaskUpdates().subscribe((event) => {
      if (event.type === 'taskCreated' && event.task.type === taskType) {
        // 新任务添加到列表头部
        setTasks(prev => {
          if (prev.some(t => t.id === event.task.id)) return prev;
          return [event.task, ...prev];
        });
        setTotalCount(prev => prev + 1);
      } else if (event.type === 'taskUpdated' && event.task.type === taskType) {
        // 更新任务状态
        setTasks(prev => prev.map(t => t.id === event.task.id ? event.task : t));
      } else if (event.type === 'taskDeleted' && event.task.type === taskType) {
        // 删除任务
        setTasks(prev => prev.filter(t => t.id !== event.task.id));
        setTotalCount(prev => Math.max(0, prev - 1));
      }
    });

    return () => subscription.unsubscribe();
  }, [taskType]);

  // 加载更多
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || loadMoreLock.current) return;

    loadMoreLock.current = true;
    setIsLoadingMore(true);

    try {
      await loadTasks(tasks.length, true);
    } finally {
      setIsLoadingMore(false);
      loadMoreLock.current = false;
    }
  }, [hasMore, isLoadingMore, tasks.length, loadTasks]);

  // 刷新数据（强制重新加载，清除已加载标记和重试计数器）
  const refresh = useCallback(async () => {
    loadedTaskType.current = undefined; // 清除标记以允许重新加载
    setRetryCount(0); // 重置重试计数器
    setIsLoading(true);
    const success = await loadTasks(0, false);
    setIsLoading(false);
    if (success) {
      loadedTaskType.current = taskType;
    }
  }, [loadTasks, taskType]);

  // 重试任务（使用 taskQueueService，它会根据模式选择正确的服务）
  const retryTask = useCallback((taskId: string) => {
    taskQueueService.retryTask(taskId);
  }, []);

  // 删除任务（使用 taskQueueService，它会根据模式选择正确的服务）
  const deleteTask = useCallback((taskId: string) => {
    taskQueueService.deleteTask(taskId);
  }, []);

  // 计算已加载数量
  const loadedCount = useMemo(() => tasks.length, [tasks]);

  return {
    tasks,
    isLoading,
    isLoadingMore,
    hasMore,
    totalCount,
    loadedCount,
    loadMore,
    refresh,
    retryTask,
    deleteTask,
  };
}
