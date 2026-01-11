/**
 * Service Worker 广播工具
 *
 * 用于向所有客户端（标签页）广播消息
 */

import type { SWToAppMessage } from '../types';

// Service Worker 全局作用域引用
declare const self: ServiceWorkerGlobalScope;

/**
 * 向所有客户端广播消息
 *
 * @param message - 要广播的消息
 */
export async function broadcast(message: SWToAppMessage): Promise<void> {
  try {
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    // console.log(`[Broadcast] Sending ${message.type} to ${clients.length} clients`);

    clients.forEach((client) => {
      client.postMessage(message);
    });
  } catch (error) {
    console.error('[Broadcast] Failed to broadcast message:', error);
  }
}

/**
 * 向特定客户端发送消息
 *
 * @param clientId - 客户端 ID
 * @param message - 要发送的消息
 */
export async function sendToClient(
  clientId: string,
  message: SWToAppMessage
): Promise<boolean> {
  try {
    const client = await self.clients.get(clientId);

    if (client) {
      client.postMessage(message);
      return true;
    }

    console.warn(`[Broadcast] Client not found: ${clientId}`);
    return false;
  } catch (error) {
    console.error(`[Broadcast] Failed to send to client ${clientId}:`, error);
    return false;
  }
}

/**
 * 向消息来源客户端发送响应
 *
 * @param source - 消息来源（Client 或 MessagePort）
 * @param message - 要发送的消息
 */
export function sendResponse(
  source: Client | MessagePort | ServiceWorker | null,
  message: SWToAppMessage
): void {
  if (source && 'postMessage' in source) {
    source.postMessage(message);
  } else {
    console.warn('[Broadcast] Invalid message source, cannot send response');
  }
}

/**
 * 广播任务创建事件
 */
export function broadcastTaskCreated(task: import('../types').Task): void {
  broadcast({ type: 'TASK_CREATED', payload: task });
}

/**
 * 广播任务更新事件
 */
export function broadcastTaskUpdated(task: import('../types').Task): void {
  broadcast({ type: 'TASK_UPDATED', payload: task });
}

/**
 * 广播任务进度事件
 */
export function broadcastTaskProgress(taskId: string, progress: number): void {
  broadcast({ type: 'TASK_PROGRESS', payload: { taskId, progress } });
}

/**
 * 广播任务完成事件
 */
export function broadcastTaskCompleted(task: import('../types').Task): void {
  broadcast({ type: 'TASK_COMPLETED', payload: task });
}

/**
 * 广播任务失败事件
 */
export function broadcastTaskFailed(task: import('../types').Task): void {
  broadcast({ type: 'TASK_FAILED', payload: task });
}

/**
 * 广播任务删除事件
 */
export function broadcastTaskDeleted(taskId: string): void {
  broadcast({ type: 'TASK_DELETED', payload: { taskId } });
}

/**
 * 广播工作流启动事件
 */
export function broadcastWorkflowStarted(
  workflow: import('../types').WorkflowState
): void {
  broadcast({ type: 'WORKFLOW_STARTED', payload: workflow });
}

/**
 * 广播工作流步骤更新事件
 */
export function broadcastWorkflowStepUpdate(
  update: import('../types').WorkflowStepUpdate
): void {
  broadcast({ type: 'WORKFLOW_STEP_UPDATE', payload: update });
}

/**
 * 广播工作流完成事件
 */
export function broadcastWorkflowCompleted(
  workflow: import('../types').WorkflowState
): void {
  broadcast({ type: 'WORKFLOW_COMPLETED', payload: workflow });
}

/**
 * 广播工作流失败事件
 */
export function broadcastWorkflowFailed(
  workflow: import('../types').WorkflowState
): void {
  broadcast({ type: 'WORKFLOW_FAILED', payload: workflow });
}

/**
 * 广播工作流中止事件
 */
export function broadcastWorkflowAborted(workflowId: string): void {
  broadcast({ type: 'WORKFLOW_ABORTED', payload: { workflowId } });
}
