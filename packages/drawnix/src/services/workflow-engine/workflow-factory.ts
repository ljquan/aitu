/**
 * Workflow Factory
 *
 * 工作流创建辅助函数
 */

import { generateUUID } from '@aitu/utils';
import type { Workflow, WorkflowStep, WorkflowStepStatus } from './types';

/**
 * 创建工作流定义
 *
 * @param name 工作流名称
 * @param steps 步骤定义（不含 status）
 * @param context 上下文数据
 * @returns 完整的工作流定义
 *
 * @example
 * ```typescript
 * const workflow = createWorkflow('My Workflow', [
 *   { id: 'step1', name: 'Step 1', tool: 'generate_image', params: { prompt: '...' } },
 *   { id: 'step2', name: 'Step 2', tool: 'generate_video', params: { ... }, dependsOn: ['step1'] },
 * ]);
 * ```
 */
export function createWorkflow(
  name: string,
  steps: Omit<WorkflowStep, 'status'>[],
  context?: Workflow['context']
): Workflow {
  const now = Date.now();
  return {
    id: generateUUID(),
    name,
    steps: steps.map((step) => ({
      ...step,
      status: 'pending' as WorkflowStepStatus,
    })),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    context,
  };
}

/**
 * 查找工作流中的第一个错误
 */
export function getFirstError(workflow: Workflow): string {
  const failedStep = workflow.steps.find((s) => s.status === 'failed');
  return failedStep?.error || 'Unknown error';
}

/**
 * 查找可执行的步骤（依赖已完成的 pending 步骤）
 */
export function findExecutableSteps(workflow: Workflow): WorkflowStep[] {
  return workflow.steps.filter((step) => {
    // 只处理 pending 状态的步骤
    if (step.status !== 'pending') return false;

    // 检查依赖
    if (step.dependsOn && step.dependsOn.length > 0) {
      return step.dependsOn.every((depId) => {
        const depStep = workflow.steps.find((s) => s.id === depId);
        return depStep?.status === 'completed';
      });
    }

    return true;
  });
}
