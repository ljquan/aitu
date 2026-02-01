import { describe, it, expect, beforeEach } from 'vitest';
import { RecursionGuard } from './recursion-guard';
import { DEFAULT_RECURSION_GUARD_CONFIG } from './types';

describe('RecursionGuard', () => {
  let guard: RecursionGuard;

  beforeEach(() => {
    guard = new RecursionGuard();
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const config = guard.getConfig();
      expect(config).toEqual(DEFAULT_RECURSION_GUARD_CONFIG);
    });

    it('should merge custom config with defaults', () => {
      const customGuard = new RecursionGuard({
        warningThreshold: 5,
        hardLimit: 30,
      });
      const config = customGuard.getConfig();
      expect(config.warningThreshold).toBe(5);
      expect(config.hardLimit).toBe(30);
      expect(config.softLimit).toBe(DEFAULT_RECURSION_GUARD_CONFIG.softLimit);
    });
  });

  describe('reset', () => {
    it('should reset iteration count to 0', () => {
      guard.increment();
      guard.increment();
      expect(guard.getCurrentIteration()).toBe(2);
      
      guard.reset();
      expect(guard.getCurrentIteration()).toBe(0);
    });
  });

  describe('increment', () => {
    it('should increment iteration count', () => {
      expect(guard.getCurrentIteration()).toBe(0);
      
      guard.increment();
      expect(guard.getCurrentIteration()).toBe(1);
      
      guard.increment();
      expect(guard.getCurrentIteration()).toBe(2);
    });

    it('should return check result after increment', () => {
      const result = guard.increment();
      expect(result.currentIteration).toBe(1);
      expect(result.shouldContinue).toBe(true);
    });
  });

  describe('check', () => {
    it('should return initial state correctly', () => {
      const result = guard.check();
      expect(result.currentIteration).toBe(0);
      expect(result.shouldContinue).toBe(true);
      expect(result.isWarning).toBe(false);
      expect(result.isSoftLimit).toBe(false);
      expect(result.isHardLimit).toBe(false);
      expect(result.warningMessage).toBeUndefined();
    });

    it('should detect warning threshold', () => {
      const customGuard = new RecursionGuard({
        warningThreshold: 3,
        softLimit: 5,
        hardLimit: 10,
      });
      
      // Iterate to warning threshold
      for (let i = 0; i < 3; i++) {
        customGuard.increment();
      }
      
      const result = customGuard.check();
      expect(result.isWarning).toBe(true);
      expect(result.isSoftLimit).toBe(false);
      expect(result.isHardLimit).toBe(false);
      expect(result.shouldContinue).toBe(true);
      expect(result.warningMessage).toContain('Warning');
    });

    it('should detect soft limit', () => {
      const customGuard = new RecursionGuard({
        warningThreshold: 3,
        softLimit: 5,
        hardLimit: 10,
      });
      
      // Iterate to soft limit
      for (let i = 0; i < 5; i++) {
        customGuard.increment();
      }
      
      const result = customGuard.check();
      expect(result.isWarning).toBe(false);
      expect(result.isSoftLimit).toBe(true);
      expect(result.isHardLimit).toBe(false);
      expect(result.shouldContinue).toBe(true);
      expect(result.warningMessage).toContain('Approaching Limit');
    });

    it('should detect hard limit', () => {
      const customGuard = new RecursionGuard({
        warningThreshold: 3,
        softLimit: 5,
        hardLimit: 10,
      });
      
      // Iterate to hard limit
      for (let i = 0; i < 10; i++) {
        customGuard.increment();
      }
      
      const result = customGuard.check();
      expect(result.isWarning).toBe(false);
      expect(result.isSoftLimit).toBe(false);
      expect(result.isHardLimit).toBe(true);
      expect(result.shouldContinue).toBe(false);
      expect(result.warningMessage).toContain('Forced Termination');
    });

    it('should continue detecting hard limit after exceeding', () => {
      const customGuard = new RecursionGuard({
        warningThreshold: 3,
        softLimit: 5,
        hardLimit: 10,
      });
      
      // Iterate beyond hard limit
      for (let i = 0; i < 15; i++) {
        customGuard.increment();
      }
      
      const result = customGuard.check();
      expect(result.isHardLimit).toBe(true);
      expect(result.shouldContinue).toBe(false);
    });
  });

  describe('getCurrentIteration', () => {
    it('should return current iteration count', () => {
      expect(guard.getCurrentIteration()).toBe(0);
      
      guard.increment();
      guard.increment();
      guard.increment();
      
      expect(guard.getCurrentIteration()).toBe(3);
    });
  });

  describe('getRemainingIterations', () => {
    it('should return remaining iterations correctly', () => {
      const customGuard = new RecursionGuard({ hardLimit: 10 });
      
      expect(customGuard.getRemainingIterations()).toBe(10);
      
      customGuard.increment();
      customGuard.increment();
      
      expect(customGuard.getRemainingIterations()).toBe(8);
    });

    it('should return 0 when at or beyond hard limit', () => {
      const customGuard = new RecursionGuard({ hardLimit: 5 });
      
      for (let i = 0; i < 5; i++) {
        customGuard.increment();
      }
      
      expect(customGuard.getRemainingIterations()).toBe(0);
      
      // Beyond limit
      customGuard.increment();
      expect(customGuard.getRemainingIterations()).toBe(0);
    });
  });

  describe('generatePromptInjection', () => {
    it('should return null when below warning threshold', () => {
      const customGuard = new RecursionGuard({
        warningThreshold: 5,
        softLimit: 10,
        hardLimit: 15,
      });
      
      customGuard.increment();
      customGuard.increment();
      
      expect(customGuard.generatePromptInjection()).toBeNull();
    });

    it('should return status when at warning threshold', () => {
      const customGuard = new RecursionGuard({
        warningThreshold: 3,
        softLimit: 5,
        hardLimit: 10,
      });
      
      for (let i = 0; i < 3; i++) {
        customGuard.increment();
      }
      
      const injection = customGuard.generatePromptInjection();
      expect(injection).not.toBeNull();
      expect(injection).toContain('Workflow Status');
      expect(injection).toContain('Iteration Progress');
    });

    it('should return status when at soft limit', () => {
      const customGuard = new RecursionGuard({
        warningThreshold: 3,
        softLimit: 5,
        hardLimit: 10,
      });
      
      for (let i = 0; i < 5; i++) {
        customGuard.increment();
      }
      
      const injection = customGuard.generatePromptInjection();
      expect(injection).not.toBeNull();
      expect(injection).toContain('Approaching Limit');
    });

    it('should return status when at hard limit', () => {
      const customGuard = new RecursionGuard({
        warningThreshold: 3,
        softLimit: 5,
        hardLimit: 10,
      });
      
      for (let i = 0; i < 10; i++) {
        customGuard.increment();
      }
      
      const injection = customGuard.generatePromptInjection();
      expect(injection).not.toBeNull();
      expect(injection).toContain('Forced Termination');
    });
  });

  describe('edge cases', () => {
    it('should handle config where warning equals soft limit', () => {
      const customGuard = new RecursionGuard({
        warningThreshold: 5,
        softLimit: 5,
        hardLimit: 10,
      });
      
      for (let i = 0; i < 5; i++) {
        customGuard.increment();
      }
      
      const result = customGuard.check();
      // When equal, soft limit takes precedence
      expect(result.isWarning).toBe(false);
      expect(result.isSoftLimit).toBe(true);
    });

    it('should handle config where soft equals hard limit', () => {
      const customGuard = new RecursionGuard({
        warningThreshold: 5,
        softLimit: 10,
        hardLimit: 10,
      });
      
      for (let i = 0; i < 10; i++) {
        customGuard.increment();
      }
      
      const result = customGuard.check();
      // When equal, hard limit takes precedence
      expect(result.isSoftLimit).toBe(false);
      expect(result.isHardLimit).toBe(true);
      expect(result.shouldContinue).toBe(false);
    });

    it('should handle zero config values', () => {
      const customGuard = new RecursionGuard({
        warningThreshold: 0,
        softLimit: 0,
        hardLimit: 1,
      });
      
      const initialResult = customGuard.check();
      expect(initialResult.isHardLimit).toBe(false);
      
      customGuard.increment();
      const afterResult = customGuard.check();
      expect(afterResult.isHardLimit).toBe(true);
    });
  });
});
