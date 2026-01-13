/**
 * Workflow Completion Service
 *
 * 追踪工作流的完整执行状态，包括图片生成后的拆分和插入画布等后处理步骤。
 *
 * 工作流完成的完整流程：
 * 1. MCP 工具执行（如 generate_inspiration_board）→ 创建任务
 * 2. 任务队列处理 → 生成图片 → 任务完成
 * 3. useAutoInsertToCanvas 处理 → 拆分图片 → 插入画布
 * 4. 只有当第 3 步完成后，工作流才真正完成
 */

import { Subject, BehaviorSubject } from 'rxjs';
import type { Point } from '@plait/core';

/**
 * 工作流后处理状态
 */
export type WorkflowPostProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * 工作流后处理结果
 */
export interface WorkflowPostProcessingResult {
  /** 任务 ID */
  taskId: string;
  /** 处理状态 */
  status: WorkflowPostProcessingStatus;
  /** 处理类型 */
  type: 'split_and_insert' | 'direct_insert' | 'group_insert';
  /** 插入的元素数量 */
  insertedCount?: number;
  /** 第一个插入元素的位置（用于滚动定位） */
  firstElementPosition?: Point;
  /** 错误信息 */
  error?: string;
  /** 完成时间戳 */
  completedAt?: number;
}

/**
 * 工作流完成事件
 */
export interface WorkflowCompletionEvent {
  /** 任务 ID */
  taskId: string;
  /** 批次 ID（同一工作流的多个任务共享） */
  batchId?: string;
  /** 事件类型 */
  type: 'postProcessingStarted' | 'postProcessingCompleted' | 'postProcessingFailed';
  /** 后处理结果 */
  result: WorkflowPostProcessingResult;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 批次完成事件
 */
export interface BatchCompletionEvent {
  /** 批次 ID */
  batchId: string;
  /** 所有任务的结果 */
  results: WorkflowPostProcessingResult[];
  /** 是否全部成功 */
  allSuccess: boolean;
  /** 总插入数量 */
  totalInsertedCount: number;
  /** 第一个元素的位置 */
  firstElementPosition?: Point;
  /** 时间戳 */
  timestamp: number;
}

/**
 * Workflow Completion Service 类
 */
class WorkflowCompletionService {
  /** 后处理结果映射：taskId -> result */
  private postProcessingResults = new Map<string, WorkflowPostProcessingResult>();

  /** 批次任务映射：batchId -> taskIds */
  private batchTasks = new Map<string, Set<string>>();

  /** 任务到批次的映射：taskId -> batchId */
  private taskToBatch = new Map<string, string>();

  /** 事件流 */
  private completionEvents$ = new Subject<WorkflowCompletionEvent>();

  /** 批次完成事件流 */
  private batchCompletionEvents$ = new Subject<BatchCompletionEvent>();

  /** 是否有正在处理的后处理任务 */
  private isProcessing$ = new BehaviorSubject<boolean>(false);

  /**
   * 注册任务到批次
   */
  registerTask(taskId: string, batchId?: string): void {
    if (batchId) {
      this.taskToBatch.set(taskId, batchId);

      if (!this.batchTasks.has(batchId)) {
        this.batchTasks.set(batchId, new Set());
      }
      this.batchTasks.get(batchId)!.add(taskId);
    }

    // 初始化为 pending 状态
    this.postProcessingResults.set(taskId, {
      taskId,
      status: 'pending',
      type: 'direct_insert',
    });
  }

  /**
   * 标记后处理开始
   */
  startPostProcessing(
    taskId: string,
    type: WorkflowPostProcessingResult['type']
  ): void {
    const result: WorkflowPostProcessingResult = {
      taskId,
      status: 'processing',
      type,
    };

    this.postProcessingResults.set(taskId, result);
    this.isProcessing$.next(true);

    this.completionEvents$.next({
      taskId,
      batchId: this.taskToBatch.get(taskId),
      type: 'postProcessingStarted',
      result,
      timestamp: Date.now(),
    });

    // console.log(`[WorkflowCompletion] Post-processing started for task ${taskId}, type: ${type}`);
  }

  /**
   * 标记后处理完成
   */
  completePostProcessing(
    taskId: string,
    insertedCount: number,
    firstElementPosition?: Point
  ): void {
    const existingResult = this.postProcessingResults.get(taskId);

    const result: WorkflowPostProcessingResult = {
      taskId,
      status: 'completed',
      type: existingResult?.type || 'direct_insert',
      insertedCount,
      firstElementPosition,
      completedAt: Date.now(),
    };

    this.postProcessingResults.set(taskId, result);

    // console.log(`[WorkflowCompletion] Emitting postProcessingCompleted event for task ${taskId}`);
    this.completionEvents$.next({
      taskId,
      batchId: this.taskToBatch.get(taskId),
      type: 'postProcessingCompleted',
      result,
      timestamp: Date.now(),
    });

    // console.log(`[WorkflowCompletion] Post-processing completed for task ${taskId}, inserted: ${insertedCount}`);

    // 检查批次是否全部完成
    this.checkBatchCompletion(taskId);
    this.updateProcessingStatus();
  }

  /**
   * 标记后处理失败
   */
  failPostProcessing(taskId: string, error: string): void {
    const existingResult = this.postProcessingResults.get(taskId);

    const result: WorkflowPostProcessingResult = {
      taskId,
      status: 'failed',
      type: existingResult?.type || 'direct_insert',
      error,
      completedAt: Date.now(),
    };

    this.postProcessingResults.set(taskId, result);

    this.completionEvents$.next({
      taskId,
      batchId: this.taskToBatch.get(taskId),
      type: 'postProcessingFailed',
      result,
      timestamp: Date.now(),
    });

    // console.log(`[WorkflowCompletion] Post-processing failed for task ${taskId}: ${error}`);

    // 检查批次是否全部完成
    this.checkBatchCompletion(taskId);
    this.updateProcessingStatus();
  }

  /**
   * 检查批次是否全部完成
   */
  private checkBatchCompletion(taskId: string): void {
    const batchId = this.taskToBatch.get(taskId);
    if (!batchId) return;

    const taskIds = this.batchTasks.get(batchId);
    if (!taskIds) return;

    // 检查是否所有任务都完成了后处理
    const results: WorkflowPostProcessingResult[] = [];
    for (const id of taskIds) {
      const result = this.postProcessingResults.get(id);
      if (!result || (result.status !== 'completed' && result.status !== 'failed')) {
        // 还有任务未完成
        return;
      }
      results.push(result);
    }

    // 所有任务都完成了
    const allSuccess = results.every(r => r.status === 'completed');
    const totalInsertedCount = results.reduce((sum, r) => sum + (r.insertedCount || 0), 0);
    const firstPosition = results.find(r => r.firstElementPosition)?.firstElementPosition;

    const batchEvent: BatchCompletionEvent = {
      batchId,
      results,
      allSuccess,
      totalInsertedCount,
      firstElementPosition: firstPosition,
      timestamp: Date.now(),
    };

    this.batchCompletionEvents$.next(batchEvent);

    // console.log(`[WorkflowCompletion] Batch ${batchId} completed, success: ${allSuccess}, total inserted: ${totalInsertedCount}`);
  }

  /**
   * 更新处理状态
   */
  private updateProcessingStatus(): void {
    const hasProcessing = Array.from(this.postProcessingResults.values()).some(
      r => r.status === 'processing'
    );
    this.isProcessing$.next(hasProcessing);
  }

  /**
   * 获取任务的后处理状态
   */
  getPostProcessingStatus(taskId: string): WorkflowPostProcessingResult | undefined {
    return this.postProcessingResults.get(taskId);
  }

  /**
   * 检查任务是否完成了后处理
   */
  isPostProcessingCompleted(taskId: string): boolean {
    const result = this.postProcessingResults.get(taskId);
    return result?.status === 'completed' || result?.status === 'failed';
  }

  /**
   * 订阅完成事件
   */
  observeCompletionEvents() {
    return this.completionEvents$.asObservable();
  }

  /**
   * 订阅批次完成事件
   */
  observeBatchCompletionEvents() {
    return this.batchCompletionEvents$.asObservable();
  }

  /**
   * 订阅处理状态
   */
  observeProcessingStatus() {
    return this.isProcessing$.asObservable();
  }

  /**
   * 清除任务数据
   */
  clearTask(taskId: string): void {
    const batchId = this.taskToBatch.get(taskId);
    if (batchId) {
      const taskIds = this.batchTasks.get(batchId);
      if (taskIds) {
        taskIds.delete(taskId);
        if (taskIds.size === 0) {
          this.batchTasks.delete(batchId);
        }
      }
      this.taskToBatch.delete(taskId);
    }
    this.postProcessingResults.delete(taskId);
  }

  /**
   * 清除所有数据
   */
  clear(): void {
    this.postProcessingResults.clear();
    this.batchTasks.clear();
    this.taskToBatch.clear();
    this.isProcessing$.next(false);
  }
}

/**
 * 默认的 WorkflowCompletionService 实例
 */
export const workflowCompletionService = new WorkflowCompletionService();
