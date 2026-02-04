/**
 * useWorkflowStatusSync Hook
 *
 * 用于订阅工作流状态变化的 React Hook
 * 通过轮询 IndexedDB 实现可靠的状态同步
 */

import { useEffect, useCallback, useRef } from 'react';
import {
  workflowStatusSyncService,
  type WorkflowStatusChange,
  type WorkflowStatusData,
} from '../services/workflow-status-sync';

export type { WorkflowStatusChange, WorkflowStatusData };

/**
 * 订阅工作流状态变化
 *
 * @param workflowId 工作流 ID，null 表示不订阅
 * @param onStatusChange 状态变化回调
 */
export function useWorkflowStatusSync(
  workflowId: string | null | undefined,
  onStatusChange: (change: WorkflowStatusChange) => void
): void {
  const callbackRef = useRef(onStatusChange);

  // 更新回调引用
  useEffect(() => {
    callbackRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    if (!workflowId) return;

    const unsubscribe = workflowStatusSyncService.subscribe(
      workflowId,
      (change) => callbackRef.current(change)
    );

    return unsubscribe;
  }, [workflowId]);
}

/**
 * 订阅多个工作流的状态变化
 *
 * @param workflowIds 工作流 ID 列表
 * @param onStatusChange 状态变化回调
 */
export function useMultiWorkflowStatusSync(
  workflowIds: string[],
  onStatusChange: (change: WorkflowStatusChange) => void
): void {
  const callbackRef = useRef(onStatusChange);

  useEffect(() => {
    callbackRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    if (workflowIds.length === 0) return;

    const unsubscribes: (() => void)[] = [];

    for (const workflowId of workflowIds) {
      const unsubscribe = workflowStatusSyncService.subscribe(
        workflowId,
        (change) => callbackRef.current(change)
      );
      unsubscribes.push(unsubscribe);
    }

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [workflowIds.join(',')]); // 使用 join 作为依赖，避免数组引用变化导致重复订阅
}

/**
 * 强制刷新工作流状态
 */
export function useWorkflowStatusRefresh(): (
  workflowId: string
) => Promise<WorkflowStatusData | null> {
  return useCallback(async (workflowId: string) => {
    return workflowStatusSyncService.refresh(workflowId);
  }, []);
}
