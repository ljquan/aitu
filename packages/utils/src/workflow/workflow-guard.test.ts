import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowGuard } from './workflow-guard';
import { LoopType, DEFAULT_WORKFLOW_GUARD_CONFIG } from './types';

describe('WorkflowGuard', () => {
  let guard: WorkflowGuard;

  beforeEach(() => {
    guard = new WorkflowGuard();
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const config = guard.getConfig();
      expect(config.recursion).toEqual(DEFAULT_WORKFLOW_GUARD_CONFIG.recursion);
      expect(config.loopDetection).toEqual(DEFAULT_WORKFLOW_GUARD_CONFIG.loopDetection);
      expect(config.verbose).toBe(DEFAULT_WORKFLOW_GUARD_CONFIG.verbose);
    });

    it('should merge custom config with defaults', () => {
      const customGuard = new WorkflowGuard({
        recursion: { warningThreshold: 5 },
        loopDetection: { repeatThreshold: 5 },
        verbose: true,
      });
      const config = customGuard.getConfig();
      expect(config.recursion.warningThreshold).toBe(5);
      expect(config.loopDetection.repeatThreshold).toBe(5);
      expect(config.verbose).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      guard.startIteration();
      guard.recordToolCall('tool', { arg: 1 });
      guard.terminate('test');

      guard.reset();

      const context = guard.getContext();
      expect(context.currentIteration).toBe(0);
      expect(context.isTerminated).toBe(false);
      expect(guard.getCallHistory().length).toBe(0);
    });
  });

  describe('startIteration', () => {
    it('should increment iteration count', () => {
      guard.startIteration();
      expect(guard.getContext().currentIteration).toBe(1);

      guard.startIteration();
      expect(guard.getContext().currentIteration).toBe(2);
    });

    it('should return check result', () => {
      const result = guard.startIteration();
      expect(result.recursionCheck.currentIteration).toBe(1);
      expect(result.allowContinue).toBe(true);
    });

    it('should update last activity time', () => {
      const before = Date.now();
      guard.startIteration();
      const after = Date.now();

      const context = guard.getContext();
      expect(context.lastActivityTime).toBeGreaterThanOrEqual(before);
      expect(context.lastActivityTime).toBeLessThanOrEqual(after);
    });
  });

  describe('recordToolCall', () => {
    it('should record tool calls', () => {
      guard.recordToolCall('toolA', { arg: 1 });
      guard.recordToolCall('toolB', { arg: 2 });

      const history = guard.getCallHistory();
      expect(history.length).toBe(2);
      expect(history[0].toolName).toBe('toolA');
      expect(history[1].toolName).toBe('toolB');
    });

    it('should update last activity time', () => {
      const before = Date.now();
      guard.recordToolCall('tool', {});
      const after = Date.now();

      const context = guard.getContext();
      expect(context.lastActivityTime).toBeGreaterThanOrEqual(before);
      expect(context.lastActivityTime).toBeLessThanOrEqual(after);
    });
  });

  describe('check', () => {
    it('should not increment iteration count', () => {
      guard.startIteration();
      expect(guard.getContext().currentIteration).toBe(1);

      guard.check();
      guard.check();
      guard.check();

      expect(guard.getContext().currentIteration).toBe(1);
    });

    it('should return current state', () => {
      guard.startIteration();
      guard.recordToolCall('tool', { arg: 1 });

      const result = guard.check();
      expect(result.recursionCheck.currentIteration).toBe(1);
      expect(result.allowContinue).toBe(true);
    });
  });

  describe('terminate', () => {
    it('should mark workflow as terminated', () => {
      guard.terminate('Test reason');

      const context = guard.getContext();
      expect(context.isTerminated).toBe(true);
      expect(context.terminationReason).toBe('Test reason');
    });
  });

  describe('getContext', () => {
    it('should return execution context', () => {
      const context = guard.getContext();
      expect(context.executionId).toMatch(/^wf-\d+-[a-z0-9]+$/);
      expect(context.currentIteration).toBe(0);
      expect(context.isTerminated).toBe(false);
    });

    it('should return a copy of context', () => {
      const context1 = guard.getContext();
      const context2 = guard.getContext();
      expect(context1).not.toBe(context2);
      expect(context1).toEqual(context2);
    });
  });

  describe('integration - recursion limit', () => {
    it('should detect warning threshold', () => {
      const customGuard = new WorkflowGuard({
        recursion: {
          warningThreshold: 3,
          softLimit: 5,
          hardLimit: 10,
          maxIterations: 10,
        },
      });

      for (let i = 0; i < 3; i++) {
        customGuard.startIteration();
      }

      const result = customGuard.check();
      expect(result.recursionCheck.isWarning).toBe(true);
      expect(result.allowContinue).toBe(true);
    });

    it('should force terminate at hard limit', () => {
      const customGuard = new WorkflowGuard({
        recursion: {
          warningThreshold: 3,
          softLimit: 5,
          hardLimit: 10,
          maxIterations: 10,
        },
      });

      for (let i = 0; i < 10; i++) {
        customGuard.startIteration();
      }

      const result = customGuard.check();
      expect(result.recursionCheck.isHardLimit).toBe(true);
      expect(result.forceTerminate).toBe(true);
      expect(result.allowContinue).toBe(false);
      expect(result.forceTerminateReason).toContain('Maximum iteration limit');
    });
  });

  describe('integration - loop detection', () => {
    it('should detect exact repeat loop', () => {
      const customGuard = new WorkflowGuard({
        loopDetection: { repeatThreshold: 3 },
      });

      customGuard.recordToolCall('tool', { arg: 'same' });
      customGuard.recordToolCall('tool', { arg: 'same' });
      customGuard.recordToolCall('tool', { arg: 'same' });

      const result = customGuard.check();
      expect(result.loopCheck.loopDetected).toBe(true);
      expect(result.loopCheck.loopType).toBe(LoopType.EXACT);
      expect(result.forceTerminate).toBe(true);
      expect(result.allowContinue).toBe(false);
    });

    it('should detect oscillating pattern', () => {
      const customGuard = new WorkflowGuard({
        loopDetection: { enablePatternDetection: true },
      });

      customGuard.recordToolCall('toolA', { arg: 1 });
      customGuard.recordToolCall('toolB', { arg: 2 });
      customGuard.recordToolCall('toolA', { arg: 1 });
      customGuard.recordToolCall('toolB', { arg: 2 });

      const result = customGuard.check();
      expect(result.loopCheck.loopDetected).toBe(true);
      expect(result.loopCheck.loopType).toBe(LoopType.OSCILLATING);
    });
  });

  describe('generatePromptInjection', () => {
    it('should return null when no warnings', () => {
      const injection = guard.generatePromptInjection();
      expect(injection).toBeNull();
    });

    it('should return warning when at recursion warning', () => {
      const customGuard = new WorkflowGuard({
        recursion: {
          warningThreshold: 2,
          softLimit: 5,
          hardLimit: 10,
          maxIterations: 10,
        },
      });

      customGuard.startIteration();
      customGuard.startIteration();

      const injection = customGuard.generatePromptInjection();
      expect(injection).not.toBeNull();
      expect(injection).toContain('Workflow Status');
    });

    it('should return loop warning when loop detected', () => {
      const customGuard = new WorkflowGuard({
        loopDetection: { repeatThreshold: 3 },
      });

      customGuard.recordToolCall('tool', { arg: 1 });
      customGuard.recordToolCall('tool', { arg: 1 });
      customGuard.recordToolCall('tool', { arg: 1 });

      const injection = customGuard.generatePromptInjection();
      expect(injection).not.toBeNull();
      expect(injection).toContain('Loop Detection Warning');
    });
  });

  describe('generateSummary', () => {
    it('should generate execution summary', () => {
      guard.startIteration();
      guard.recordToolCall('toolA', { arg: 1 });
      guard.recordToolCall('toolB', { arg: 2 });

      const summary = guard.generateSummary();
      expect(summary).toContain('Workflow Execution Summary');
      expect(summary).toContain('Iterations: 1');
      expect(summary).toContain('Tool calls: 2');
      expect(summary).toContain('Status: Running');
    });

    it('should show terminated status', () => {
      guard.startIteration();
      guard.terminate('Test termination');

      const summary = guard.generateSummary();
      expect(summary).toContain('Status: Terminated');
      expect(summary).toContain('Termination reason: Test termination');
    });
  });

  describe('combined warnings', () => {
    it('should combine recursion and loop warnings', () => {
      const customGuard = new WorkflowGuard({
        recursion: {
          warningThreshold: 2,
          softLimit: 5,
          hardLimit: 10,
          maxIterations: 10,
        },
        loopDetection: { repeatThreshold: 3 },
      });

      // Trigger recursion warning
      customGuard.startIteration();
      customGuard.startIteration();

      // Trigger loop detection
      customGuard.recordToolCall('tool', { arg: 1 });
      customGuard.recordToolCall('tool', { arg: 1 });
      customGuard.recordToolCall('tool', { arg: 1 });

      const result = customGuard.check();
      expect(result.warningMessage).toContain('Warning');
      expect(result.warningMessage).toContain('Exact repeat');
    });
  });

  describe('edge cases', () => {
    it('should handle reset after termination', () => {
      guard.terminate('Test');
      expect(guard.getContext().isTerminated).toBe(true);

      guard.reset();
      expect(guard.getContext().isTerminated).toBe(false);
    });

    it('should generate unique execution IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const newGuard = new WorkflowGuard();
        ids.add(newGuard.getContext().executionId);
      }
      expect(ids.size).toBe(10);
    });

    it('should handle multiple resets', () => {
      guard.startIteration();
      guard.reset();
      guard.startIteration();
      guard.reset();
      guard.startIteration();

      expect(guard.getContext().currentIteration).toBe(1);
    });
  });
});
