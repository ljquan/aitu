import { describe, it, expect, beforeEach } from 'vitest';
import { LoopDetector } from './loop-detector';
import { LoopType, DEFAULT_LOOP_DETECTOR_CONFIG } from './types';

describe('LoopDetector', () => {
  let detector: LoopDetector;

  beforeEach(() => {
    detector = new LoopDetector();
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const config = detector.getConfig();
      expect(config).toEqual(DEFAULT_LOOP_DETECTOR_CONFIG);
    });

    it('should merge custom config with defaults', () => {
      const customDetector = new LoopDetector({
        repeatThreshold: 5,
        windowSize: 20,
      });
      const config = customDetector.getConfig();
      expect(config.repeatThreshold).toBe(5);
      expect(config.windowSize).toBe(20);
      expect(config.similarityThreshold).toBe(DEFAULT_LOOP_DETECTOR_CONFIG.similarityThreshold);
    });
  });

  describe('reset', () => {
    it('should clear call history', () => {
      detector.recordCall('toolA', { arg: 1 });
      detector.recordCall('toolB', { arg: 2 });
      expect(detector.getCallHistory().length).toBe(2);

      detector.reset();
      expect(detector.getCallHistory().length).toBe(0);
    });
  });

  describe('recordCall', () => {
    it('should record tool calls', () => {
      detector.recordCall('toolA', { arg: 1 });
      detector.recordCall('toolB', { arg: 2 });

      const history = detector.getCallHistory();
      expect(history.length).toBe(2);
      expect(history[0].toolName).toBe('toolA');
      expect(history[1].toolName).toBe('toolB');
    });

    it('should maintain window size limit', () => {
      const customDetector = new LoopDetector({ windowSize: 5 });

      // Record more than windowSize * 2 calls
      for (let i = 0; i < 15; i++) {
        customDetector.recordCall('tool', { index: i });
      }

      // Should keep only windowSize * 2 entries
      const history = customDetector.getCallHistory();
      expect(history.length).toBeLessThanOrEqual(10);
    });

    it('should generate unique hashes for different args', () => {
      detector.recordCall('tool', { a: 1 });
      detector.recordCall('tool', { a: 2 });

      const history = detector.getCallHistory();
      expect(history[0].argsHash).not.toBe(history[1].argsHash);
    });

    it('should generate same hash for same args', () => {
      detector.recordCall('tool', { a: 1, b: 2 });
      detector.recordCall('tool', { a: 1, b: 2 });

      const history = detector.getCallHistory();
      expect(history[0].argsHash).toBe(history[1].argsHash);
    });
  });

  describe('detect - no loop', () => {
    it('should return no loop when history is empty', () => {
      const result = detector.detect();
      expect(result.loopDetected).toBe(false);
    });

    it('should return no loop when below threshold', () => {
      detector.recordCall('toolA', { arg: 1 });
      detector.recordCall('toolB', { arg: 2 });

      const result = detector.detect();
      expect(result.loopDetected).toBe(false);
    });

    it('should return no loop for normal varied calls', () => {
      detector.recordCall('toolA', { arg: 1 });
      detector.recordCall('toolB', { arg: 2 });
      detector.recordCall('toolC', { arg: 3 });
      detector.recordCall('toolD', { arg: 4 });
      detector.recordCall('toolE', { arg: 5 });

      const result = detector.detect();
      expect(result.loopDetected).toBe(false);
    });
  });

  describe('detect - exact repeat', () => {
    it('should detect exact repeat', () => {
      const customDetector = new LoopDetector({ repeatThreshold: 3 });

      customDetector.recordCall('tool', { arg: 'same' });
      customDetector.recordCall('tool', { arg: 'same' });
      customDetector.recordCall('tool', { arg: 'same' });

      const result = customDetector.detect();
      expect(result.loopDetected).toBe(true);
      expect(result.loopType).toBe(LoopType.EXACT);
      expect(result.loopLength).toBe(3);
      expect(result.involvedTools).toContain('tool');
      expect(result.description).toContain('Exact repeat');
    });

    it('should not detect exact repeat with different args', () => {
      const customDetector = new LoopDetector({ repeatThreshold: 3 });

      customDetector.recordCall('tool', { arg: 1 });
      customDetector.recordCall('tool', { arg: 2 });
      customDetector.recordCall('tool', { arg: 3 });

      const result = customDetector.detect();
      // Should not be exact repeat, might be similar
      expect(result.loopType !== LoopType.EXACT || !result.loopDetected).toBe(true);
    });

    it('should not detect exact repeat with different tools', () => {
      const customDetector = new LoopDetector({ repeatThreshold: 3 });

      customDetector.recordCall('toolA', { arg: 'same' });
      customDetector.recordCall('toolB', { arg: 'same' });
      customDetector.recordCall('toolC', { arg: 'same' });

      const result = customDetector.detect();
      expect(result.loopType !== LoopType.EXACT || !result.loopDetected).toBe(true);
    });
  });

  describe('detect - similar repeat', () => {
    it('should detect similar repeat', () => {
      const customDetector = new LoopDetector({
        repeatThreshold: 3,
        similarityThreshold: 0.5, // Lower threshold to catch similarity
      });

      // Same tool, mostly same args with small differences
      // Each pair has 4/5 = 0.8 similarity (only 'c' differs)
      customDetector.recordCall('tool', { a: 1, b: 2, c: 3, d: 4, e: 5 });
      customDetector.recordCall('tool', { a: 1, b: 2, c: 4, d: 4, e: 5 }); // c differs
      customDetector.recordCall('tool', { a: 1, b: 2, c: 5, d: 4, e: 5 }); // c differs

      const result = customDetector.detect();
      expect(result.loopDetected).toBe(true);
      expect(result.loopType).toBe(LoopType.SIMILAR);
    });

    it('should not detect similar repeat with low similarity', () => {
      const customDetector = new LoopDetector({
        repeatThreshold: 3,
        similarityThreshold: 0.9,
      });

      // Same tool, but different args
      customDetector.recordCall('tool', { a: 1, b: 2 });
      customDetector.recordCall('tool', { a: 3, b: 4 });
      customDetector.recordCall('tool', { a: 5, b: 6 });

      const result = customDetector.detect();
      expect(result.loopType !== LoopType.SIMILAR || !result.loopDetected).toBe(true);
    });
  });

  describe('detect - oscillating pattern', () => {
    it('should detect A-B-A-B pattern', () => {
      const customDetector = new LoopDetector({ enablePatternDetection: true });

      customDetector.recordCall('toolA', { arg: 1 });
      customDetector.recordCall('toolB', { arg: 2 });
      customDetector.recordCall('toolA', { arg: 1 });
      customDetector.recordCall('toolB', { arg: 2 });

      const result = customDetector.detect();
      expect(result.loopDetected).toBe(true);
      expect(result.loopType).toBe(LoopType.OSCILLATING);
      expect(result.loopLength).toBe(2);
      expect(result.involvedTools).toContain('toolA');
      expect(result.involvedTools).toContain('toolB');
    });

    it('should not detect when pattern detection is disabled', () => {
      const customDetector = new LoopDetector({ enablePatternDetection: false });

      customDetector.recordCall('toolA', { arg: 1 });
      customDetector.recordCall('toolB', { arg: 2 });
      customDetector.recordCall('toolA', { arg: 1 });
      customDetector.recordCall('toolB', { arg: 2 });

      const result = customDetector.detect();
      expect(result.loopType !== LoopType.OSCILLATING || !result.loopDetected).toBe(true);
    });

    it('should not detect oscillating with same tool', () => {
      const customDetector = new LoopDetector({ enablePatternDetection: true });

      // A-A-A-A is not oscillating, it's exact repeat
      customDetector.recordCall('toolA', { arg: 1 });
      customDetector.recordCall('toolA', { arg: 1 });
      customDetector.recordCall('toolA', { arg: 1 });
      customDetector.recordCall('toolA', { arg: 1 });

      const result = customDetector.detect();
      if (result.loopDetected) {
        expect(result.loopType).not.toBe(LoopType.OSCILLATING);
      }
    });
  });

  describe('detect - periodic pattern', () => {
    it('should detect A-B-C-A-B-C pattern (period 3)', () => {
      const customDetector = new LoopDetector({ enablePatternDetection: true });

      customDetector.recordCall('toolA', { arg: 1 });
      customDetector.recordCall('toolB', { arg: 2 });
      customDetector.recordCall('toolC', { arg: 3 });
      customDetector.recordCall('toolA', { arg: 1 });
      customDetector.recordCall('toolB', { arg: 2 });
      customDetector.recordCall('toolC', { arg: 3 });

      const result = customDetector.detect();
      expect(result.loopDetected).toBe(true);
      expect(result.loopType).toBe(LoopType.PERIODIC);
      expect(result.loopLength).toBe(3);
    });

    it('should detect period 4 pattern', () => {
      const customDetector = new LoopDetector({ enablePatternDetection: true });

      // A-B-C-D-A-B-C-D
      customDetector.recordCall('toolA', { arg: 1 });
      customDetector.recordCall('toolB', { arg: 2 });
      customDetector.recordCall('toolC', { arg: 3 });
      customDetector.recordCall('toolD', { arg: 4 });
      customDetector.recordCall('toolA', { arg: 1 });
      customDetector.recordCall('toolB', { arg: 2 });
      customDetector.recordCall('toolC', { arg: 3 });
      customDetector.recordCall('toolD', { arg: 4 });

      const result = customDetector.detect();
      expect(result.loopDetected).toBe(true);
      expect(result.loopType).toBe(LoopType.PERIODIC);
      expect(result.loopLength).toBe(4);
    });

    it('should detect period 5 pattern', () => {
      const customDetector = new LoopDetector({ enablePatternDetection: true });

      // A-B-C-D-E-A-B-C-D-E
      customDetector.recordCall('toolA', { arg: 1 });
      customDetector.recordCall('toolB', { arg: 2 });
      customDetector.recordCall('toolC', { arg: 3 });
      customDetector.recordCall('toolD', { arg: 4 });
      customDetector.recordCall('toolE', { arg: 5 });
      customDetector.recordCall('toolA', { arg: 1 });
      customDetector.recordCall('toolB', { arg: 2 });
      customDetector.recordCall('toolC', { arg: 3 });
      customDetector.recordCall('toolD', { arg: 4 });
      customDetector.recordCall('toolE', { arg: 5 });

      const result = customDetector.detect();
      expect(result.loopDetected).toBe(true);
      expect(result.loopType).toBe(LoopType.PERIODIC);
      expect(result.loopLength).toBe(5);
    });
  });

  describe('generateHistorySummary', () => {
    it('should return message for empty history', () => {
      const summary = detector.generateHistorySummary();
      expect(summary).toBe('No call history');
    });

    it('should generate summary for recent calls', () => {
      detector.recordCall('toolA', { arg: 1 });
      detector.recordCall('toolB', { arg: 2 });
      detector.recordCall('toolC', { arg: 3 });

      const summary = detector.generateHistorySummary();
      expect(summary).toContain('toolA');
      expect(summary).toContain('toolB');
      expect(summary).toContain('toolC');
    });

    it('should limit summary to last 5 calls', () => {
      for (let i = 0; i < 10; i++) {
        detector.recordCall(`tool${i}`, { index: i });
      }

      const summary = detector.generateHistorySummary();
      const lines = summary.split('\n');
      expect(lines.length).toBeLessThanOrEqual(5);
    });
  });

  describe('edge cases', () => {
    it('should handle empty args', () => {
      detector.recordCall('tool', {});
      detector.recordCall('tool', {});
      detector.recordCall('tool', {});

      const result = detector.detect();
      expect(result.loopDetected).toBe(true);
    });

    it('should handle complex nested args', () => {
      const complexArgs = {
        nested: { deep: { value: 1 } },
        array: [1, 2, 3],
        null: null,
      };

      detector.recordCall('tool', complexArgs);
      detector.recordCall('tool', complexArgs);
      detector.recordCall('tool', complexArgs);

      const result = detector.detect();
      expect(result.loopDetected).toBe(true);
      expect(result.loopType).toBe(LoopType.EXACT);
    });

    it('should handle args with different key order', () => {
      detector.recordCall('tool', { a: 1, b: 2 });
      detector.recordCall('tool', { b: 2, a: 1 });
      detector.recordCall('tool', { a: 1, b: 2 });

      // Same args, different order - should be considered same
      const history = detector.getCallHistory();
      expect(history[0].argsHash).toBe(history[1].argsHash);
    });

    it('should detect loop priority: exact > similar > oscillating > periodic', () => {
      // Exact repeat should be detected first
      detector.recordCall('tool', { arg: 1 });
      detector.recordCall('tool', { arg: 1 });
      detector.recordCall('tool', { arg: 1 });

      const result = detector.detect();
      expect(result.loopDetected).toBe(true);
      expect(result.loopType).toBe(LoopType.EXACT);
    });
  });
});
