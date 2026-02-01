/**
 * useFilteredTaskQueue Hook
 * 
 * 用于弹窗中的任务列表，支持按类型过滤和分页加载。
 * 与 useTaskQueue 不同，这个 hook 直接从 SW 查询数据，
 * 支持类型过滤，并且不会影响全局任务缓存。
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Task, TaskStatus, TaskType } from '../types/task.types';
import { swTaskQueueService, shouldUseSWTaskQueue } from '../services/task-queue';

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
  const initialLoadDone = useRef(false);

  // 加载任务数据
  const loadTasks = useCallback(async (offset: number = 0, append: boolean = false) => {
    if (!shouldUseSWTaskQueue() || taskType === undefined) {
      setIsLoading(false);
      return;
    }

    try {
      const result = await swTaskQueueService.loadTasksByType(taskType, offset, pageSize);
      
      // PaginatedTaskResult 没有 success 字段，直接使用返回的数据
      // 如果请求失败，loadTasksByType 会返回空数组
      if (append) {
        // 追加数据，避免重复
        setTasks(prev => {
          const existingIds = new Set(prev.map(t => t.id));
          const newTasks = result.tasks.filter(t => !existingIds.has(t.id));
          return [...prev, ...newTasks];
        });
      } else {
        // 替换数据
        setTasks(result.tasks);
      }
      setTotalCount(result.total);
      setHasMore(result.hasMore);
    } catch {
      // 静默忽略错误
    }
  }, [taskType, pageSize]);

  // 初始加载
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    const init = async () => {
      setIsLoading(true);
      await loadTasks(0, false);
      setIsLoading(false);
    };

    init();
  }, [loadTasks]);

  // 监听任务更新事件（新任务创建、状态变化等）
  useEffect(() => {
    if (!shouldUseSWTaskQueue()) return;

    const subscription = swTaskQueueService.observeTaskUpdates().subscribe((event) => {
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

  // 刷新数据
  const refresh = useCallback(async () => {
    setIsLoading(true);
    await loadTasks(0, false);
    setIsLoading(false);
  }, [loadTasks]);

  // 重试任务
  const retryTask = useCallback((taskId: string) => {
    swTaskQueueService.retryTask(taskId);
  }, []);

  // 删除任务
  const deleteTask = useCallback((taskId: string) => {
    swTaskQueueService.deleteTask(taskId);
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
