/**
 * useAutoInsertToCanvas Hook
 *
 * 监听任务完成事件，自动将生成的图片/视频插入到画布中
 * 支持 AI 对话产生的所有产物自动插入
 * 支持宫格图任务的自动拆分和插入
 */

import { useEffect, useRef } from 'react';
import { taskQueueService } from '../services/task-queue-service';
import { imageSplitService } from '../services/image-split-service';
import { Task, TaskStatus, TaskType } from '../types/task.types';
import { getCanvasBoard, insertAIFlow, insertImageGroup } from '../mcp';
import type { LayoutStyle } from '../types/photo-wall.types';

/**
 * 配置项
 */
export interface AutoInsertConfig {
  /** 是否启用自动插入 */
  enabled: boolean;
  /** 是否插入 Prompt 文本 */
  insertPrompt?: boolean;
  /** 是否将同时完成的任务水平排列 */
  groupSimilarTasks?: boolean;
  /** 同组任务的时间窗口（毫秒），在此时间窗口内完成的同 Prompt 任务会水平排列 */
  groupTimeWindow?: number;
}

const DEFAULT_CONFIG: AutoInsertConfig = {
  enabled: true,
  insertPrompt: false,
  groupSimilarTasks: true,
  groupTimeWindow: 5000, // 5秒内完成的同 Prompt 任务会分组
};

/**
 * 已插入任务的记录，防止重复插入
 */
const insertedTaskIds = new Set<string>();

/**
 * 待插入任务的缓冲区，用于分组
 */
interface PendingInsert {
  task: Task;
  completedAt: number;
}

/**
 * 自动插入到画布的 Hook
 */
export function useAutoInsertToCanvas(config: Partial<AutoInsertConfig> = {}): void {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const pendingInsertsRef = useRef<Map<string, PendingInsert[]>>(new Map());
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!mergedConfig.enabled) return;

    let isActive = true;

    /**
     * 执行批量插入
     */
    const flushPendingInserts = async () => {
      const board = getCanvasBoard();
      if (!board || !isActive) return;

      const pendingMap = pendingInsertsRef.current;
      if (pendingMap.size === 0) return;

      // 复制并清空待插入列表
      const toInsert = new Map(pendingMap);
      pendingMap.clear();

      for (const [promptKey, inserts] of toInsert) {
        if (!isActive) break;

        try {
          if (inserts.length === 1) {
            // 单个任务，直接插入
            const { task } = inserts[0];
            const url = task.result?.url;
            if (!url) continue;

            const type = task.type === TaskType.VIDEO ? 'video' : 'image';

            if (mergedConfig.insertPrompt) {
              // 插入 Prompt + 结果
              await insertAIFlow(task.params.prompt, [{ type, url }]);
            } else {
              // 只插入结果
              const { quickInsert } = await import('../mcp');
              await quickInsert(type, url);
            }

            console.log(`[AutoInsert] Inserted ${type} for task ${task.id}`);
          } else {
            // 多个同 Prompt 任务，水平排列
            const urls = inserts
              .map(({ task }) => task.result?.url)
              .filter((url): url is string => !!url);

            if (urls.length === 0) continue;

            const firstTask = inserts[0].task;
            const type = firstTask.type === TaskType.VIDEO ? 'video' : 'image';

            if (mergedConfig.insertPrompt) {
              // 插入 Prompt + 多个结果（水平排列）
              await insertAIFlow(
                firstTask.params.prompt,
                urls.map(url => ({ type, url }))
              );
            } else {
              // 只插入多个结果（水平排列）
              if (type === 'image') {
                await insertImageGroup(urls);
              } else {
                // 视频也可以用类似的方式
                for (const url of urls) {
                  const { quickInsert } = await import('../mcp');
                  await quickInsert('video', url);
                }
              }
            }

            console.log(`[AutoInsert] Inserted ${urls.length} ${type}s for prompt: ${promptKey.substring(0, 50)}...`);
          }
        } catch (error) {
          console.error(`[AutoInsert] Failed to insert for prompt ${promptKey}:`, error);
        }
      }
    };

    /**
     * 调度 flush 操作
     */
    const scheduleFlush = () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
      flushTimerRef.current = setTimeout(() => {
        flushPendingInserts();
      }, mergedConfig.groupTimeWindow);
    };

    /**
     * 检查是否为宫格图任务
     */
    const isGridImageTask = (task: Task): boolean => {
      const params = task.params as Record<string, unknown>;
      return !!(params.photoWallRows && params.photoWallCols);
    };

    /**
     * 检查是否为照片墙任务
     */
    const isPhotoWallTask = (task: Task): boolean => {
      const params = task.params as Record<string, unknown>;
      return !!(params.isPhotoWall && params.photoWallLayoutStyle === 'photo-wall');
    };

    /**
     * 处理宫格图任务：拆分并插入
     */
    const handleGridImageTask = async (task: Task) => {
      const board = getCanvasBoard();
      if (!board) {
        console.error('[AutoInsert] Board not available for grid image task');
        return;
      }

      const params = task.params as Record<string, unknown>;
      const rows = params.photoWallRows as number;
      const cols = params.photoWallCols as number;
      const layoutStyle = (params.photoWallLayoutStyle as LayoutStyle) || 'scattered';
      const url = task.result?.url;

      if (!url) {
        console.error('[AutoInsert] Grid image task has no result URL');
        return;
      }

      console.log(`[AutoInsert] Processing grid image task ${task.id}: ${rows}x${cols}, style=${layoutStyle}`);

      try {
        const result = await imageSplitService.splitAndInsert(board, url, {
          mode: 'grid',
          gridConfig: { rows, cols },
          layoutStyle,
          gap: 20,
        });

        if (result.success) {
          console.log(`[AutoInsert] Grid image split into ${result.count} images`);
        } else {
          console.error(`[AutoInsert] Grid image split failed: ${result.error}`);
        }
      } catch (error) {
        console.error('[AutoInsert] Grid image processing error:', error);
      }
    };

    /**
     * 处理照片墙任务：智能检测并分割，以照片墙布局插入
     */
    const handlePhotoWallTask = async (task: Task) => {
      const board = getCanvasBoard();
      if (!board) {
        console.error('[AutoInsert] Board not available for photo wall task');
        return;
      }

      const url = task.result?.url;

      if (!url) {
        console.error('[AutoInsert] Photo wall task has no result URL');
        return;
      }

      console.log(`[AutoInsert] Processing photo wall task ${task.id} with intelligent detection`);

      try {
        // 使用智能检测模式拆分照片墙（自动检测不规则区域）
        const result = await imageSplitService.splitAndInsert(board, url, {
          mode: 'photo-wall', // 使用智能检测模式
          layoutStyle: 'photo-wall', // 使用照片墙布局
          gap: 15,
        });

        if (result.success) {
          console.log(`[AutoInsert] Photo wall split into ${result.count} images using intelligent detection`);
        } else {
          console.error(`[AutoInsert] Photo wall split failed: ${result.error}`);
        }
      } catch (error) {
        console.error('[AutoInsert] Photo wall processing error:', error);
      }
    };

    /**
     * 处理任务完成事件
     */
    const handleTaskCompleted = (task: Task) => {
      // 检查是否已经插入过
      if (insertedTaskIds.has(task.id)) {
        return;
      }

      // 只处理图片和视频任务
      if (task.type !== TaskType.IMAGE && task.type !== TaskType.VIDEO) {
        return;
      }

      // 检查是否有结果 URL
      if (!task.result?.url) {
        console.warn(`[AutoInsert] Task ${task.id} completed but has no result URL`);
        return;
      }

      // 标记为已处理
      insertedTaskIds.add(task.id);

      // 检查是否为照片墙任务（需要在宫格图之前检查）
      if (isPhotoWallTask(task)) {
        handlePhotoWallTask(task);
        return;
      }

      // 检查是否为宫格图任务
      if (isGridImageTask(task)) {
        handleGridImageTask(task);
        return;
      }

      // 获取 Prompt 作为分组 key
      const promptKey = task.params.prompt || 'unknown';

      // 添加到待插入列表
      const pendingList = pendingInsertsRef.current.get(promptKey) || [];
      pendingList.push({ task, completedAt: Date.now() });
      pendingInsertsRef.current.set(promptKey, pendingList);

      console.log(`[AutoInsert] Queued task ${task.id} for insertion`);

      // 调度 flush
      if (mergedConfig.groupSimilarTasks) {
        scheduleFlush();
      } else {
        // 不分组，立即插入
        flushPendingInserts();
      }
    };

    // 订阅任务更新事件
    const subscription = taskQueueService.observeTaskUpdates().subscribe(event => {
      if (!isActive) return;

      if (event.type === 'taskUpdated' && event.task.status === TaskStatus.COMPLETED) {
        handleTaskCompleted(event.task);
      }
    });

    // 清理函数
    return () => {
      isActive = false;
      subscription.unsubscribe();
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
    };
  }, [mergedConfig.enabled, mergedConfig.insertPrompt, mergedConfig.groupSimilarTasks, mergedConfig.groupTimeWindow]);
}

/**
 * 清除已插入任务的记录（用于测试或重置）
 */
export function clearInsertedTaskIds(): void {
  insertedTaskIds.clear();
}

export default useAutoInsertToCanvas;
