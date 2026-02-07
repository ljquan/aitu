/**
 * 活跃 LLM 任务检测工具
 *
 * 用于 beforeunload 拦截和 location.reload() 保护，
 * 防止用户在 AI 任务执行期间意外关闭或刷新页面。
 */

import { taskQueueService } from '../services/task-queue';
import { workflowSubmissionService } from '../services/workflow-submission-service';
import { TaskStatus } from '../types/task.types';

/**
 * 检查是否有活跃的 LLM 任务（正在执行的任务或工作流）
 */
export function hasActiveLLMTasks(): boolean {
  const tasks = taskQueueService.getAllTasks();
  const hasActiveTasks = tasks.some(
    (t) => t.status === TaskStatus.PENDING || t.status === TaskStatus.PROCESSING
  );
  if (hasActiveTasks) return true;

  const runningWorkflows = workflowSubmissionService.getRunningWorkflows();
  return runningWorkflows.length > 0;
}

/**
 * 安全刷新页面：如果有活跃任务，提示用户确认
 * @returns 是否执行了刷新
 */
export function safeReload(): boolean {
  if (hasActiveLLMTasks()) {
    const confirmed = window.confirm(
      '当前有正在进行的 AI 生成任务，刷新页面会中断这些任务。确定要刷新吗？'
    );
    if (!confirmed) return false;
  }
  window.location.reload();
  return true;
}
