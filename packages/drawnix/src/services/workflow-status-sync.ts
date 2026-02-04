/**
 * Workflow Status Sync Service
 *
 * 通过轮询 IndexedDB 同步工作流状态
 * 提供可靠的状态同步机制，不依赖 SW 事件推送
 *
 * 使用场景：
 * - ChatDrawer 中的工作流状态更新
 * - WorkZone 中的工作流状态更新
 * - 任何需要监听工作流状态变化的组件
 */

import { workflowStorageReader } from './workflow-storage-reader';

export interface WorkflowStepData {
  id: string;
  mcp: string;
  args: Record<string, unknown>;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'pending_main_thread';
  result?: unknown;
  error?: string;
  duration?: number;
  options?: Record<string, unknown>;
}

export interface WorkflowStatusData {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  steps: WorkflowStepData[];
  error?: string;
  completedAt?: number;
}

export interface WorkflowStatusChange {
  workflowId: string;
  previousStatus?: string;
  currentStatus: string;
  steps: WorkflowStepData[];
  hasStepChanges: boolean;
  hasNewSteps: boolean;
  hasStatusChange: boolean;
}

type StatusChangeCallback = (change: WorkflowStatusChange) => void;

interface WorkflowSubscription {
  workflowId: string;
  callback: StatusChangeCallback;
  lastStatus?: WorkflowStatusData;
}

/**
 * 工作流状态同步服务
 */
class WorkflowStatusSyncService {
  private subscriptions: Map<string, WorkflowSubscription[]> = new Map();
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private readonly POLLING_INTERVAL = 1000; // 1秒

  /**
   * 订阅工作流状态变化
   * @param workflowId 工作流 ID
   * @param callback 状态变化回调
   * @returns 取消订阅函数
   */
  subscribe(workflowId: string, callback: StatusChangeCallback): () => void {
    const subscription: WorkflowSubscription = {
      workflowId,
      callback,
    };

    const subs = this.subscriptions.get(workflowId) || [];
    subs.push(subscription);
    this.subscriptions.set(workflowId, subs);

    // 启动轮询
    this.startPolling();

    // 返回取消订阅函数
    return () => {
      this.unsubscribe(workflowId, callback);
    };
  }

  /**
   * 取消订阅
   */
  private unsubscribe(workflowId: string, callback: StatusChangeCallback): void {
    const subs = this.subscriptions.get(workflowId);
    if (subs) {
      const filtered = subs.filter(s => s.callback !== callback);
      if (filtered.length > 0) {
        this.subscriptions.set(workflowId, filtered);
      } else {
        this.subscriptions.delete(workflowId);
      }
    }

    // 如果没有订阅了，停止轮询
    if (this.subscriptions.size === 0) {
      this.stopPolling();
    }
  }

  /**
   * 启动轮询
   */
  private startPolling(): void {
    if (this.pollingTimer) return;

    this.pollingTimer = setInterval(() => {
      this.poll().catch(error => {
        console.error('[WorkflowStatusSync] Poll error:', error);
      });
    }, this.POLLING_INTERVAL);
  }

  /**
   * 停止轮询
   */
  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * 执行轮询
   */
  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      for (const [workflowId, subs] of this.subscriptions.entries()) {
        const dbWorkflow = await workflowStorageReader.getWorkflow(workflowId);
        if (!dbWorkflow) continue;

        const currentStatus: WorkflowStatusData = {
          id: dbWorkflow.id,
          status: dbWorkflow.status as WorkflowStatusData['status'],
          steps: dbWorkflow.steps.map(s => ({
            id: s.id,
            mcp: s.mcp,
            args: s.args,
            description: s.description || '',
            status: s.status as WorkflowStepData['status'],
            result: s.result,
            error: s.error,
            duration: s.duration,
            options: s.options,
          })),
          error: dbWorkflow.error,
          completedAt: dbWorkflow.completedAt,
        };

        // 通知所有订阅者
        for (const sub of subs) {
          const lastStatus = sub.lastStatus;

          // 检查是否有变化
          const hasStepChanges = currentStatus.steps.some((step, idx) => {
            const lastStep = lastStatus?.steps[idx];
            return !lastStep || step.status !== lastStep.status;
          });
          const hasNewSteps = currentStatus.steps.length > (lastStatus?.steps.length || 0);
          const hasStatusChange = currentStatus.status !== lastStatus?.status;

          if (hasStepChanges || hasNewSteps || hasStatusChange || !lastStatus) {
            sub.lastStatus = currentStatus;
            sub.callback({
              workflowId,
              previousStatus: lastStatus?.status,
              currentStatus: currentStatus.status,
              steps: currentStatus.steps,
              hasStepChanges,
              hasNewSteps,
              hasStatusChange,
            });
          }
        }
      }
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * 强制刷新指定工作流的状态
   */
  async refresh(workflowId: string): Promise<WorkflowStatusData | null> {
    const dbWorkflow = await workflowStorageReader.getWorkflow(workflowId);
    if (!dbWorkflow) return null;

    return {
      id: dbWorkflow.id,
      status: dbWorkflow.status as WorkflowStatusData['status'],
      steps: dbWorkflow.steps.map(s => ({
        id: s.id,
        mcp: s.mcp,
        args: s.args,
        description: s.description || '',
        status: s.status as WorkflowStepData['status'],
        result: s.result,
        error: s.error,
        duration: s.duration,
        options: s.options,
      })),
      error: dbWorkflow.error,
      completedAt: dbWorkflow.completedAt,
    };
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.stopPolling();
    this.subscriptions.clear();
  }
}

// 单例导出
export const workflowStatusSyncService = new WorkflowStatusSyncService();
