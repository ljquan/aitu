/**
 * Workflow Utility Functions
 *
 * Generic utility functions for workflow state management.
 * These are pure functions that work with any workflow structure
 * that conforms to the base interfaces.
 */

import type { BaseWorkflow, BaseWorkflowStep, WorkflowStatusSummary, StepStatus } from './types';

/**
 * Step status type (supports both enum and string literal)
 */
type StepStatusValue = StepStatus | 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * Update step status in a workflow
 *
 * Returns a new workflow object with the updated step.
 * This is a pure function that does not mutate the input.
 *
 * @param workflow - The workflow to update
 * @param stepId - The ID of the step to update
 * @param status - The new status
 * @param result - Optional result data
 * @param error - Optional error message
 * @param duration - Optional execution duration in ms
 * @returns A new workflow with the updated step
 */
export function updateStepStatus<
  TStep extends BaseWorkflowStep,
  TWorkflow extends BaseWorkflow<TStep>
>(
  workflow: TWorkflow,
  stepId: string,
  status: StepStatusValue,
  result?: unknown,
  error?: string,
  duration?: number
): TWorkflow {
  return {
    ...workflow,
    steps: workflow.steps.map((step) =>
      step.id === stepId
        ? {
            ...step,
            status,
            ...(result !== undefined && { result }),
            ...(error !== undefined && { error }),
            ...(duration !== undefined && { duration }),
          }
        : step
    ),
  };
}

/**
 * Add steps to a workflow (with deduplication)
 *
 * Returns a new workflow object with the new steps appended.
 * Steps with IDs that already exist in the workflow are skipped.
 * This is a pure function that does not mutate the input.
 *
 * @param workflow - The workflow to update
 * @param newSteps - The steps to add
 * @returns A new workflow with the new steps added
 */
export function addStepsToWorkflow<
  TStep extends BaseWorkflowStep,
  TWorkflow extends BaseWorkflow<TStep>
>(workflow: TWorkflow, newSteps: TStep[]): TWorkflow {
  // Filter out steps that already exist (by ID)
  const existingIds = new Set(workflow.steps.map((s) => s.id));
  const uniqueNewSteps = newSteps.filter((step) => !existingIds.has(step.id));

  if (uniqueNewSteps.length === 0) {
    return workflow; // No new steps to add
  }

  return {
    ...workflow,
    steps: [...workflow.steps, ...uniqueNewSteps],
  };
}

/**
 * Remove steps from a workflow by IDs
 *
 * Returns a new workflow object with the specified steps removed.
 * This is a pure function that does not mutate the input.
 *
 * @param workflow - The workflow to update
 * @param stepIds - The IDs of steps to remove
 * @returns A new workflow with the specified steps removed
 */
export function removeStepsFromWorkflow<
  TStep extends BaseWorkflowStep,
  TWorkflow extends BaseWorkflow<TStep>
>(workflow: TWorkflow, stepIds: string[]): TWorkflow {
  const idsToRemove = new Set(stepIds);
  return {
    ...workflow,
    steps: workflow.steps.filter((step) => !idsToRemove.has(step.id)),
  };
}

/**
 * Get workflow status summary
 *
 * Analyzes the workflow steps and returns a status summary.
 * This is a pure function that does not mutate the input.
 *
 * @param workflow - The workflow to analyze
 * @returns Status summary including overall status, progress, and current step
 */
export function getWorkflowStatus<
  TStep extends BaseWorkflowStep,
  TWorkflow extends BaseWorkflow<TStep>
>(workflow: TWorkflow): WorkflowStatusSummary<TStep> {
  const steps = workflow.steps;
  const completedSteps = steps.filter((s) => normalizeStatus(s.status) === 'completed').length;
  const failedSteps = steps.filter((s) => normalizeStatus(s.status) === 'failed').length;
  const runningStep = steps.find((s) => normalizeStatus(s.status) === 'running');
  const pendingSteps = steps.filter((s) => normalizeStatus(s.status) === 'pending').length;

  let status: 'pending' | 'running' | 'completed' | 'failed';

  if (failedSteps > 0) {
    status = 'failed';
  } else if (runningStep) {
    status = 'running';
  } else if (pendingSteps === 0 && completedSteps > 0) {
    status = 'completed';
  } else {
    status = 'pending';
  }

  return {
    status,
    completedSteps,
    totalSteps: steps.length,
    currentStep: runningStep || steps.find((s) => normalizeStatus(s.status) === 'pending'),
  };
}

/**
 * Find step by ID
 *
 * @param workflow - The workflow to search
 * @param stepId - The ID of the step to find
 * @returns The step if found, undefined otherwise
 */
export function findStepById<
  TStep extends BaseWorkflowStep,
  TWorkflow extends BaseWorkflow<TStep>
>(workflow: TWorkflow, stepId: string): TStep | undefined {
  return workflow.steps.find((step) => step.id === stepId);
}

/**
 * Get steps by status
 *
 * @param workflow - The workflow to search
 * @param status - The status to filter by
 * @returns Array of steps with the specified status
 */
export function getStepsByStatus<
  TStep extends BaseWorkflowStep,
  TWorkflow extends BaseWorkflow<TStep>
>(workflow: TWorkflow, status: StepStatusValue): TStep[] {
  const normalizedTarget = normalizeStatus(status);
  return workflow.steps.filter((step) => normalizeStatus(step.status) === normalizedTarget);
}

/**
 * Check if workflow is complete
 *
 * A workflow is complete when all steps are either completed, failed, or skipped.
 *
 * @param workflow - The workflow to check
 * @returns True if the workflow is complete
 */
export function isWorkflowComplete<
  TStep extends BaseWorkflowStep,
  TWorkflow extends BaseWorkflow<TStep>
>(workflow: TWorkflow): boolean {
  if (workflow.steps.length === 0) {
    return true;
  }

  const terminalStatuses = new Set(['completed', 'failed', 'skipped']);
  return workflow.steps.every((step) => terminalStatuses.has(normalizeStatus(step.status)));
}

/**
 * Check if workflow has failed
 *
 * A workflow has failed if any step has failed.
 *
 * @param workflow - The workflow to check
 * @returns True if any step has failed
 */
export function hasWorkflowFailed<
  TStep extends BaseWorkflowStep,
  TWorkflow extends BaseWorkflow<TStep>
>(workflow: TWorkflow): boolean {
  return workflow.steps.some((step) => normalizeStatus(step.status) === 'failed');
}

/**
 * Calculate workflow progress percentage
 *
 * @param workflow - The workflow to calculate progress for
 * @returns Progress as a number between 0 and 100
 */
export function getWorkflowProgress<
  TStep extends BaseWorkflowStep,
  TWorkflow extends BaseWorkflow<TStep>
>(workflow: TWorkflow): number {
  if (workflow.steps.length === 0) {
    return 100;
  }

  const terminalStatuses = new Set(['completed', 'failed', 'skipped']);
  const completedCount = workflow.steps.filter((step) =>
    terminalStatuses.has(normalizeStatus(step.status))
  ).length;

  return Math.round((completedCount / workflow.steps.length) * 100);
}

/**
 * Get next pending step
 *
 * @param workflow - The workflow to search
 * @returns The first pending step, or undefined if none
 */
export function getNextPendingStep<
  TStep extends BaseWorkflowStep,
  TWorkflow extends BaseWorkflow<TStep>
>(workflow: TWorkflow): TStep | undefined {
  return workflow.steps.find((step) => normalizeStatus(step.status) === 'pending');
}

/**
 * Create a new step with pending status
 *
 * @param id - Step ID
 * @param additionalProps - Additional properties to include
 * @returns A new step object
 */
export function createStep<TStep extends BaseWorkflowStep>(
  id: string,
  additionalProps: Omit<TStep, 'id' | 'status'> = {} as Omit<TStep, 'id' | 'status'>
): TStep {
  return {
    id,
    status: 'pending',
    ...additionalProps,
  } as TStep;
}

/**
 * Generate a unique workflow ID
 *
 * @param prefix - Optional prefix for the ID (default: 'wf')
 * @returns A unique workflow ID
 */
export function generateWorkflowId(prefix: string = 'wf'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Generate a unique step ID
 *
 * @param workflowId - The parent workflow ID
 * @param index - The step index
 * @returns A unique step ID
 */
export function generateStepId(workflowId: string, index: number): string {
  return `${workflowId}-step-${index}`;
}

/**
 * Normalize status to string literal
 * Handles both enum values and string literals
 */
function normalizeStatus(status: StepStatusValue): string {
  return typeof status === 'string' ? status : String(status);
}
