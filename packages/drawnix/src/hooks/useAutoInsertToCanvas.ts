/**
 * useAutoInsertToCanvas Hook
 *
 * 监听任务完成事件，自动将生成的图片/视频插入到画布中
 * 支持 AI 对话产生的所有产物自动插入
 * 支持宫格图任务的自动拆分和插入
 *
 * 集成 workflowCompletionService 追踪后处理状态：
 * - 开始后处理时发送 startPostProcessing
 * - 完成插入后发送 completePostProcessing（包含插入数量和位置）
 * - 失败时发送 failPostProcessing
 */

import { useEffect, useRef } from 'react';
import type { Point } from '@plait/core';
import { getTaskQueueService } from '../services/task-queue';
import { workflowCompletionService } from '../services/workflow-completion-service';
import { Task, TaskStatus, TaskType } from '../types/task.types';
import { getCanvasBoard, insertAIFlow, insertImageGroup, parseSizeToPixels, quickInsert } from '../services/canvas-operations';
import { getInsertionPointBelowBottommostElement } from '../utils/selection-utils';
import { WorkZoneTransforms } from '../plugins/with-workzone';
import type { PlaitWorkZone } from '../types/workzone.types';
import {
  isGridImageTask as checkGridImageTask,
  isInspirationBoardTask as checkInspirationBoardTask,
  handleSplitAndInsertTask,
  type TaskParams,
} from '../services/media-result-handler';

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
 * 查找与任务关联的 WorkZone
 * @param taskId 任务 ID
 * @returns WorkZone 元素或 null
 */
function findWorkZoneForTask(taskId: string): PlaitWorkZone | null {
  const board = getCanvasBoard();
  if (!board) return null;

  const allWorkZones = WorkZoneTransforms.getAllWorkZones(board);
  for (const workzone of allWorkZones) {
    // 检查 workflow 的 steps 中是否包含此任务的 taskId
    const hasTask = workzone.workflow.steps?.some(step => {
      const result = step.result as { taskId?: string } | undefined;
      return result?.taskId === taskId;
    });
    if (hasTask) {
      return workzone;
    }
  }
  return null;
}

/**
 * 更新 WorkZone 中与任务关联的步骤状态
 * @param taskId 任务 ID
 * @param status 新状态
 * @param result 任务结果（可选）
 * @param error 错误信息（可选）
 */
function updateWorkflowStepForTask(
  taskId: string,
  status: 'completed' | 'failed',
  result?: { url?: string },
  error?: string
): void {
  const board = getCanvasBoard();
  if (!board) return;

  const workzone = findWorkZoneForTask(taskId);
  if (!workzone) return;

  // 找到包含此 taskId 的步骤并更新状态
  const updatedSteps = workzone.workflow.steps?.map(step => {
    const stepResult = step.result as { taskId?: string } | undefined;
    if (stepResult?.taskId === taskId) {
      const existingResult = typeof step.result === 'object' && step.result !== null ? step.result : {};
      return {
        ...step,
        status,
        result: result ? {
          ...existingResult,
          url: result.url,
          success: status === 'completed',
        } : step.result,
        error: error,
      };
    }
    return step;
  });

  if (updatedSteps) {
    WorkZoneTransforms.updateWorkflow(board, workzone.id, {
      steps: updatedSteps,
    });

    // 检查是否所有步骤都已完成或失败
    const allStepsFinished = updatedSteps.every(
      step => step.status === 'completed' || step.status === 'failed' || step.status === 'skipped'
    );

    if (allStepsFinished) {
      // 延迟删除 WorkZone，让用户有时间看到完成状态
      setTimeout(() => {
        WorkZoneTransforms.removeWorkZone(board, workzone.id);
      }, 1500);
    }
  }
}

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
      // console.log('[AutoInsert] flushPendingInserts called');
      const board = getCanvasBoard();
      if (!board || !isActive) {
        // console.log(`[AutoInsert] flushPendingInserts aborted: board=${!!board}, isActive=${isActive}`);
        return;
      }

      const pendingMap = pendingInsertsRef.current;
      if (pendingMap.size === 0) {
        // console.log('[AutoInsert] flushPendingInserts: no pending tasks');
        return;
      }

      // console.log(`[AutoInsert] flushPendingInserts: ${pendingMap.size} prompt groups to insert`);

      // 复制并清空待插入列表
      const toInsert = new Map(pendingMap);
      pendingMap.clear();

      // 尝试查找与第一个任务关联的 WorkZone，获取预期插入位置
      const firstTask = Array.from(toInsert.values())[0]?.[0]?.task;
      let insertionPoint: Point | undefined;

      if (firstTask) {
        const workzone = findWorkZoneForTask(firstTask.id);
        if (workzone?.expectedInsertPosition) {
          insertionPoint = workzone.expectedInsertPosition;
        }
      }

      // 如果没有找到 WorkZone 或没有预期位置，回退到原来的逻辑
      if (!insertionPoint) {
        insertionPoint = getInsertionPointBelowBottommostElement(board);
      }

      // console.log(`[AutoInsert] Insertion point:`, insertionPoint);

      for (const [promptKey, inserts] of toInsert) {
        if (!isActive) break;

        // console.log(`[AutoInsert] Processing prompt group "${promptKey.substring(0, 30)}..." with ${inserts.length} tasks`);

        // 注册所有任务
        for (const { task } of inserts) {
          const batchId = (task.params as Record<string, unknown>).batchId as string | undefined;
          workflowCompletionService.registerTask(task.id, batchId);
          workflowCompletionService.startPostProcessing(
            task.id,
            inserts.length === 1 ? 'direct_insert' : 'group_insert'
          );
        }

        try {
          if (inserts.length === 1) {
            // 单个任务，直接插入
            const { task } = inserts[0];
            const url = task.result?.url;
            if (!url) {
              // console.log(`[AutoInsert] Task ${task.id} has no result URL, skipping`);
              workflowCompletionService.failPostProcessing(task.id, 'No result URL');
              continue;
            }

            const type = task.type === TaskType.VIDEO ? 'video' : 'image';
            const dimensions = parseSizeToPixels(task.params.size);

            // console.log(`[AutoInsert] Inserting single ${type} for task ${task.id}, url: ${url.substring(0, 80)}...`);
            // console.log(`[AutoInsert] dimensions:`, dimensions, `insertionPoint:`, insertionPoint);

            if (mergedConfig.insertPrompt) {
              const result = await insertAIFlow(task.params.prompt, [{ type, url, dimensions }], insertionPoint);
              // console.log(`[AutoInsert] insertAIFlow result:`, result);
            } else {
              const result = await quickInsert(type, url, insertionPoint, dimensions);
              // console.log(`[AutoInsert] quickInsert result:`, result);
            }

            // console.log(`[AutoInsert] Successfully inserted ${type} for task ${task.id}`);
            workflowCompletionService.completePostProcessing(task.id, 1, insertionPoint);
          } else {
            // 多个同 Prompt 任务，水平排列
            const urls = inserts
              .map(({ task }) => task.result?.url)
              .filter((url): url is string => !!url);

            if (urls.length === 0) {
              // console.log(`[AutoInsert] No valid URLs in group, skipping`);
              for (const { task } of inserts) {
                workflowCompletionService.failPostProcessing(task.id, 'No result URL');
              }
              continue;
            }

            const firstInsertTask = inserts[0].task;
            const type = firstInsertTask.type === TaskType.VIDEO ? 'video' : 'image';
            const dimensions = parseSizeToPixels(firstInsertTask.params.size);

            // console.log(`[AutoInsert] Inserting group of ${urls.length} ${type}s`);

            if (mergedConfig.insertPrompt) {
              await insertAIFlow(
                firstInsertTask.params.prompt,
                urls.map(url => ({ type, url, dimensions })),
                insertionPoint
              );
            } else {
              if (type === 'image') {
                await insertImageGroup(urls, insertionPoint, dimensions);
              } else {
                for (const url of urls) {
                  await quickInsert('video', url, insertionPoint, dimensions);
                }
              }
            }

            // console.log(`[AutoInsert] Successfully inserted group of ${urls.length} ${type}s`);

            // 标记所有任务完成
            for (const { task } of inserts) {
              workflowCompletionService.completePostProcessing(task.id, 1, insertionPoint);
            }
          }
        } catch (error) {
          console.error(`[AutoInsert] Failed to insert for prompt ${promptKey}:`, error);
          for (const { task } of inserts) {
            workflowCompletionService.failPostProcessing(task.id, String(error));
          }
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
     * 处理宫格图/灵感图任务：使用统一的媒体结果处理服务
     */
    const handleSplitTask = async (task: Task) => {
      const url = task.result?.url;
      if (!url) {
        console.error('[AutoInsert] Split task has no result URL');
        workflowCompletionService.failPostProcessing(task.id, 'No result URL');
        return;
      }

      const params = task.params as TaskParams;
      await handleSplitAndInsertTask(task.id, url, params, { scrollToResult: true });
    };

    /**
     * 处理任务完成事件
     */
    const handleTaskCompleted = (task: Task) => {
      // console.log(`[AutoInsert] handleTaskCompleted called for task ${task.id}, type: ${task.type}, status: ${task.status}`);
      // console.log(`[AutoInsert] Task params:`, {
      //   autoInsertToCanvas: task.params.autoInsertToCanvas,
      //   prompt: task.params.prompt?.substring(0, 50),
      //   hasResult: !!task.result,
      //   resultUrl: task.result?.url?.substring(0, 100),
      // });

      // 检查任务是否配置了自动插入画布
      if (!task.params.autoInsertToCanvas) {
        // console.log(`[AutoInsert] Task ${task.id} skipped: autoInsertToCanvas is false/undefined`);
        return;
      }

      // 检查是否已经插入过（内存中的记录）
      if (insertedTaskIds.has(task.id)) {
        // console.log(`[AutoInsert] Task ${task.id} skipped: already in insertedTaskIds (memory)`);
        return;
      }

      // 检查是否已经插入过（持久化的标记）
      if (task.insertedToCanvas) {
        // console.log(`[AutoInsert] Task ${task.id} skipped: insertedToCanvas flag is true (persisted)`);
        insertedTaskIds.add(task.id);
        return;
      }

      // 只处理图片和视频任务
      if (task.type !== TaskType.IMAGE && task.type !== TaskType.VIDEO) {
        // console.log(`[AutoInsert] Task ${task.id} skipped: type is ${task.type}, not IMAGE or VIDEO`);
        return;
      }

      // 检查是否有结果 URL
      if (!task.result?.url) {
        console.warn(`[AutoInsert] Task ${task.id} completed but has no result URL`);
        return;
      }

      // console.log(`[AutoInsert] Task ${task.id} passed all checks, will be inserted`);

      // 更新关联的工作流步骤状态为 completed
      updateWorkflowStepForTask(task.id, 'completed', { url: task.result.url });

      // 标记为已处理（内存）
      insertedTaskIds.add(task.id);

      // 标记为已插入（持久化到 SW）
      const taskQueueService = getTaskQueueService();
      taskQueueService.markAsInserted(task.id);

      const params = task.params as TaskParams;

      // 检查是否为灵感图任务（需要在宫格图之前检查）
      if (checkInspirationBoardTask(params)) {
        // console.log(`[AutoInsert] Task ${task.id} is inspiration board task, handling split`);
        handleSplitTask(task);
        return;
      }

      // 检查是否为宫格图任务
      if (checkGridImageTask(params)) {
        // console.log(`[AutoInsert] Task ${task.id} is grid image task, handling split`);
        handleSplitTask(task);
        return;
      }

      // 获取 Prompt 作为分组 key
      const promptKey = task.params.prompt || 'unknown';
      // console.log(`[AutoInsert] Task ${task.id} added to pending inserts with promptKey: ${promptKey.substring(0, 30)}`);

      // 添加到待插入列表
      const pendingList = pendingInsertsRef.current.get(promptKey) || [];
      pendingList.push({ task, completedAt: Date.now() });
      pendingInsertsRef.current.set(promptKey, pendingList);

      // 调度 flush
      if (mergedConfig.groupSimilarTasks) {
        // console.log(`[AutoInsert] Scheduling flush in ${mergedConfig.groupTimeWindow}ms`);
        scheduleFlush();
      } else {
        // console.log(`[AutoInsert] Flushing immediately`);
        flushPendingInserts();
      }
    };

    /**
     * 处理任务失败事件
     */
    const handleTaskFailed = (task: Task) => {
      updateWorkflowStepForTask(task.id, 'failed', undefined, task.error?.message || '任务执行失败');
    };

    // 订阅任务更新事件
    const taskQueueService = getTaskQueueService();
    // console.log('[AutoInsert] Subscribing to task updates');
    const subscription = taskQueueService.observeTaskUpdates().subscribe(event => {
      if (!isActive) {
        // console.log('[AutoInsert] Received event but hook is inactive, ignoring');
        return;
      }

      // console.log(`[AutoInsert] Received event: ${event.type}, task: ${event.task.id}, status: ${event.task.status}`);

      if (event.type === 'taskUpdated') {
        if (event.task.status === TaskStatus.COMPLETED) {
          handleTaskCompleted(event.task);
        } else if (event.task.status === TaskStatus.FAILED) {
          handleTaskFailed(event.task);
        }
      } else if (event.type === 'taskSynced') {
        if (event.task.status === TaskStatus.COMPLETED) {
          handleTaskCompleted(event.task);
        }
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
