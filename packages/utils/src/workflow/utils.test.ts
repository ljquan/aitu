import { describe, it, expect } from 'vitest';
import {
  updateStepStatus,
  addStepsToWorkflow,
  removeStepsFromWorkflow,
  getWorkflowStatus,
  findStepById,
  getStepsByStatus,
  isWorkflowComplete,
  hasWorkflowFailed,
  getWorkflowProgress,
  getNextPendingStep,
  createStep,
  generateWorkflowId,
  generateStepId,
} from './utils';
import type { BaseWorkflow, BaseWorkflowStep } from './types';
import { StepStatus } from './types';

// Test types
interface TestStep extends BaseWorkflowStep {
  name?: string;
  data?: unknown;
}

interface TestWorkflow extends BaseWorkflow<TestStep> {
  name: string;
}

// Helper to create test workflow
function createTestWorkflow(steps: TestStep[] = []): TestWorkflow {
  return {
    id: 'test-workflow',
    name: 'Test Workflow',
    steps,
  };
}

describe('updateStepStatus', () => {
  it('should update step status', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'pending' },
      { id: 'step-2', status: 'pending' },
    ]);

    const updated = updateStepStatus(workflow, 'step-1', 'running');
    expect(updated.steps[0].status).toBe('running');
    expect(updated.steps[1].status).toBe('pending');
  });

  it('should not mutate original workflow', () => {
    const workflow = createTestWorkflow([{ id: 'step-1', status: 'pending' }]);

    const updated = updateStepStatus(workflow, 'step-1', 'running');
    expect(workflow.steps[0].status).toBe('pending');
    expect(updated.steps[0].status).toBe('running');
    expect(workflow).not.toBe(updated);
  });

  it('should update with result, error, and duration', () => {
    const workflow = createTestWorkflow([{ id: 'step-1', status: 'running' }]);

    const updated = updateStepStatus(
      workflow,
      'step-1',
      'completed',
      { data: 'result' },
      undefined,
      1000
    );

    expect(updated.steps[0].status).toBe('completed');
    expect(updated.steps[0].result).toEqual({ data: 'result' });
    expect(updated.steps[0].duration).toBe(1000);
  });

  it('should update with error message', () => {
    const workflow = createTestWorkflow([{ id: 'step-1', status: 'running' }]);

    const updated = updateStepStatus(
      workflow,
      'step-1',
      'failed',
      undefined,
      'Something went wrong'
    );

    expect(updated.steps[0].status).toBe('failed');
    expect(updated.steps[0].error).toBe('Something went wrong');
  });

  it('should work with StepStatus enum', () => {
    const workflow = createTestWorkflow([{ id: 'step-1', status: 'pending' }]);

    const updated = updateStepStatus(workflow, 'step-1', StepStatus.RUNNING);
    expect(updated.steps[0].status).toBe(StepStatus.RUNNING);
  });

  it('should preserve other step properties', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'pending', name: 'Test Step', data: { key: 'value' } },
    ]);

    const updated = updateStepStatus(workflow, 'step-1', 'running');
    expect(updated.steps[0].name).toBe('Test Step');
    expect(updated.steps[0].data).toEqual({ key: 'value' });
  });

  it('should handle non-existent step ID', () => {
    const workflow = createTestWorkflow([{ id: 'step-1', status: 'pending' }]);

    const updated = updateStepStatus(workflow, 'non-existent', 'running');
    expect(updated.steps[0].status).toBe('pending');
  });
});

describe('addStepsToWorkflow', () => {
  it('should add new steps', () => {
    const workflow = createTestWorkflow([{ id: 'step-1', status: 'pending' }]);

    const updated = addStepsToWorkflow(workflow, [
      { id: 'step-2', status: 'pending' },
      { id: 'step-3', status: 'pending' },
    ]);

    expect(updated.steps.length).toBe(3);
    expect(updated.steps[1].id).toBe('step-2');
    expect(updated.steps[2].id).toBe('step-3');
  });

  it('should not mutate original workflow', () => {
    const workflow = createTestWorkflow([{ id: 'step-1', status: 'pending' }]);

    const updated = addStepsToWorkflow(workflow, [{ id: 'step-2', status: 'pending' }]);
    expect(workflow.steps.length).toBe(1);
    expect(updated.steps.length).toBe(2);
  });

  it('should deduplicate by ID', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'pending' },
      { id: 'step-2', status: 'pending' },
    ]);

    const updated = addStepsToWorkflow(workflow, [
      { id: 'step-2', status: 'running' }, // Duplicate
      { id: 'step-3', status: 'pending' },
    ]);

    expect(updated.steps.length).toBe(3);
    expect(updated.steps[1].status).toBe('pending'); // Original preserved
    expect(updated.steps[2].id).toBe('step-3');
  });

  it('should return same workflow if no new steps', () => {
    const workflow = createTestWorkflow([{ id: 'step-1', status: 'pending' }]);

    const updated = addStepsToWorkflow(workflow, [{ id: 'step-1', status: 'running' }]);
    expect(updated).toBe(workflow); // Same reference
  });

  it('should handle empty new steps array', () => {
    const workflow = createTestWorkflow([{ id: 'step-1', status: 'pending' }]);

    const updated = addStepsToWorkflow(workflow, []);
    expect(updated).toBe(workflow);
  });
});

describe('removeStepsFromWorkflow', () => {
  it('should remove steps by ID', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'pending' },
      { id: 'step-2', status: 'pending' },
      { id: 'step-3', status: 'pending' },
    ]);

    const updated = removeStepsFromWorkflow(workflow, ['step-2']);
    expect(updated.steps.length).toBe(2);
    expect(updated.steps.map((s) => s.id)).toEqual(['step-1', 'step-3']);
  });

  it('should remove multiple steps', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'pending' },
      { id: 'step-2', status: 'pending' },
      { id: 'step-3', status: 'pending' },
    ]);

    const updated = removeStepsFromWorkflow(workflow, ['step-1', 'step-3']);
    expect(updated.steps.length).toBe(1);
    expect(updated.steps[0].id).toBe('step-2');
  });

  it('should not mutate original workflow', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'pending' },
      { id: 'step-2', status: 'pending' },
    ]);

    const updated = removeStepsFromWorkflow(workflow, ['step-1']);
    expect(workflow.steps.length).toBe(2);
    expect(updated.steps.length).toBe(1);
  });

  it('should handle non-existent IDs', () => {
    const workflow = createTestWorkflow([{ id: 'step-1', status: 'pending' }]);

    const updated = removeStepsFromWorkflow(workflow, ['non-existent']);
    expect(updated.steps.length).toBe(1);
  });
});

describe('getWorkflowStatus', () => {
  it('should return pending for new workflow', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'pending' },
      { id: 'step-2', status: 'pending' },
    ]);

    const status = getWorkflowStatus(workflow);
    expect(status.status).toBe('pending');
    expect(status.completedSteps).toBe(0);
    expect(status.totalSteps).toBe(2);
  });

  it('should return running when step is running', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'completed' },
      { id: 'step-2', status: 'running' },
      { id: 'step-3', status: 'pending' },
    ]);

    const status = getWorkflowStatus(workflow);
    expect(status.status).toBe('running');
    expect(status.currentStep?.id).toBe('step-2');
  });

  it('should return completed when all steps done', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'completed' },
      { id: 'step-2', status: 'completed' },
    ]);

    const status = getWorkflowStatus(workflow);
    expect(status.status).toBe('completed');
    expect(status.completedSteps).toBe(2);
  });

  it('should return failed when any step failed', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'completed' },
      { id: 'step-2', status: 'failed' },
      { id: 'step-3', status: 'pending' },
    ]);

    const status = getWorkflowStatus(workflow);
    expect(status.status).toBe('failed');
  });

  it('should return current step as first pending if no running', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'completed' },
      { id: 'step-2', status: 'pending' },
      { id: 'step-3', status: 'pending' },
    ]);

    const status = getWorkflowStatus(workflow);
    expect(status.currentStep?.id).toBe('step-2');
  });

  it('should work with StepStatus enum values', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: StepStatus.COMPLETED },
      { id: 'step-2', status: StepStatus.RUNNING },
    ]);

    const status = getWorkflowStatus(workflow);
    expect(status.status).toBe('running');
    expect(status.completedSteps).toBe(1);
  });
});

describe('findStepById', () => {
  it('should find step by ID', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'pending', name: 'First' },
      { id: 'step-2', status: 'pending', name: 'Second' },
    ]);

    const step = findStepById(workflow, 'step-2');
    expect(step?.name).toBe('Second');
  });

  it('should return undefined for non-existent ID', () => {
    const workflow = createTestWorkflow([{ id: 'step-1', status: 'pending' }]);

    const step = findStepById(workflow, 'non-existent');
    expect(step).toBeUndefined();
  });
});

describe('getStepsByStatus', () => {
  it('should get steps by status', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'completed' },
      { id: 'step-2', status: 'pending' },
      { id: 'step-3', status: 'pending' },
      { id: 'step-4', status: 'completed' },
    ]);

    const pending = getStepsByStatus(workflow, 'pending');
    expect(pending.length).toBe(2);
    expect(pending.map((s) => s.id)).toEqual(['step-2', 'step-3']);
  });

  it('should work with StepStatus enum', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: StepStatus.COMPLETED },
      { id: 'step-2', status: StepStatus.PENDING },
    ]);

    const completed = getStepsByStatus(workflow, StepStatus.COMPLETED);
    expect(completed.length).toBe(1);
    expect(completed[0].id).toBe('step-1');
  });

  it('should return empty array if no matching status', () => {
    const workflow = createTestWorkflow([{ id: 'step-1', status: 'pending' }]);

    const failed = getStepsByStatus(workflow, 'failed');
    expect(failed).toEqual([]);
  });
});

describe('isWorkflowComplete', () => {
  it('should return true for empty workflow', () => {
    const workflow = createTestWorkflow([]);
    expect(isWorkflowComplete(workflow)).toBe(true);
  });

  it('should return true when all steps are terminal', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'completed' },
      { id: 'step-2', status: 'failed' },
      { id: 'step-3', status: 'skipped' },
    ]);
    expect(isWorkflowComplete(workflow)).toBe(true);
  });

  it('should return false when pending steps exist', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'completed' },
      { id: 'step-2', status: 'pending' },
    ]);
    expect(isWorkflowComplete(workflow)).toBe(false);
  });

  it('should return false when running steps exist', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'completed' },
      { id: 'step-2', status: 'running' },
    ]);
    expect(isWorkflowComplete(workflow)).toBe(false);
  });
});

describe('hasWorkflowFailed', () => {
  it('should return true when any step failed', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'completed' },
      { id: 'step-2', status: 'failed' },
    ]);
    expect(hasWorkflowFailed(workflow)).toBe(true);
  });

  it('should return false when no failures', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'completed' },
      { id: 'step-2', status: 'pending' },
    ]);
    expect(hasWorkflowFailed(workflow)).toBe(false);
  });

  it('should return false for empty workflow', () => {
    const workflow = createTestWorkflow([]);
    expect(hasWorkflowFailed(workflow)).toBe(false);
  });
});

describe('getWorkflowProgress', () => {
  it('should return 100 for empty workflow', () => {
    const workflow = createTestWorkflow([]);
    expect(getWorkflowProgress(workflow)).toBe(100);
  });

  it('should return 0 for all pending', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'pending' },
      { id: 'step-2', status: 'pending' },
    ]);
    expect(getWorkflowProgress(workflow)).toBe(0);
  });

  it('should return 50 for half completed', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'completed' },
      { id: 'step-2', status: 'pending' },
    ]);
    expect(getWorkflowProgress(workflow)).toBe(50);
  });

  it('should return 100 for all completed', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'completed' },
      { id: 'step-2', status: 'completed' },
    ]);
    expect(getWorkflowProgress(workflow)).toBe(100);
  });

  it('should count failed and skipped as complete', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'completed' },
      { id: 'step-2', status: 'failed' },
      { id: 'step-3', status: 'skipped' },
      { id: 'step-4', status: 'pending' },
    ]);
    expect(getWorkflowProgress(workflow)).toBe(75);
  });
});

describe('getNextPendingStep', () => {
  it('should return first pending step', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'completed' },
      { id: 'step-2', status: 'pending' },
      { id: 'step-3', status: 'pending' },
    ]);

    const next = getNextPendingStep(workflow);
    expect(next?.id).toBe('step-2');
  });

  it('should return undefined if no pending steps', () => {
    const workflow = createTestWorkflow([
      { id: 'step-1', status: 'completed' },
      { id: 'step-2', status: 'running' },
    ]);

    const next = getNextPendingStep(workflow);
    expect(next).toBeUndefined();
  });
});

describe('createStep', () => {
  it('should create step with pending status', () => {
    const step = createStep<TestStep>('test-step');
    expect(step.id).toBe('test-step');
    expect(step.status).toBe('pending');
  });

  it('should include additional properties', () => {
    const step = createStep<TestStep>('test-step', { name: 'Test', data: { key: 'value' } });
    expect(step.id).toBe('test-step');
    expect(step.status).toBe('pending');
    expect(step.name).toBe('Test');
    expect(step.data).toEqual({ key: 'value' });
  });
});

describe('generateWorkflowId', () => {
  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateWorkflowId());
    }
    expect(ids.size).toBe(100);
  });

  it('should use default prefix', () => {
    const id = generateWorkflowId();
    expect(id).toMatch(/^wf-\d+-[a-z0-9]+$/);
  });

  it('should use custom prefix', () => {
    const id = generateWorkflowId('custom');
    expect(id).toMatch(/^custom-\d+-[a-z0-9]+$/);
  });
});

describe('generateStepId', () => {
  it('should generate step ID from workflow ID', () => {
    const stepId = generateStepId('wf-123', 1);
    expect(stepId).toBe('wf-123-step-1');
  });

  it('should handle different indices', () => {
    expect(generateStepId('wf-abc', 0)).toBe('wf-abc-step-0');
    expect(generateStepId('wf-abc', 10)).toBe('wf-abc-step-10');
  });
});
