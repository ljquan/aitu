/**
 * Loop Detector
 *
 * Detects repeated call patterns using a sliding window to prevent workflow deadlocks.
 * This is a framework-agnostic utility that can be used in any workflow system.
 */

import type { LoopDetectorConfig, ToolCallSignature, LoopDetectionResult } from './types';
import { LoopType, DEFAULT_LOOP_DETECTOR_CONFIG } from './types';

/**
 * Loop detector class
 */
export class LoopDetector {
  private config: LoopDetectorConfig;
  private callHistory: ToolCallSignature[] = [];

  constructor(config: Partial<LoopDetectorConfig> = {}) {
    this.config = { ...DEFAULT_LOOP_DETECTOR_CONFIG, ...config };
  }

  /**
   * Reset history
   */
  reset(): void {
    this.callHistory = [];
  }

  /**
   * Record a tool call
   */
  recordCall(toolName: string, args: Record<string, unknown>): void {
    const signature: ToolCallSignature = {
      toolName,
      argsHash: this.hashArgs(args),
      timestamp: Date.now(),
      args,
    };

    this.callHistory.push(signature);

    // Maintain window size
    if (this.callHistory.length > this.config.windowSize * 2) {
      this.callHistory = this.callHistory.slice(-this.config.windowSize * 2);
    }
  }

  /**
   * Detect if there is a loop
   */
  detect(): LoopDetectionResult {
    if (this.callHistory.length < this.config.repeatThreshold) {
      return { loopDetected: false };
    }

    // 1. Detect exact repeat
    const exactResult = this.detectExactRepeat();
    if (exactResult.loopDetected) {
      return exactResult;
    }

    // 2. Detect similar repeat
    const similarResult = this.detectSimilarRepeat();
    if (similarResult.loopDetected) {
      return similarResult;
    }

    // 3. Detect oscillating pattern (A-B-A-B)
    if (this.config.enablePatternDetection) {
      const oscillatingResult = this.detectOscillatingPattern();
      if (oscillatingResult.loopDetected) {
        return oscillatingResult;
      }

      // 4. Detect periodic pattern (A-B-C-A-B-C)
      const periodicResult = this.detectPeriodicPattern();
      if (periodicResult.loopDetected) {
        return periodicResult;
      }
    }

    return { loopDetected: false };
  }

  /**
   * Get call history
   */
  getCallHistory(): ToolCallSignature[] {
    return [...this.callHistory];
  }

  /**
   * Get configuration
   */
  getConfig(): LoopDetectorConfig {
    return { ...this.config };
  }

  /**
   * Generate call history summary
   */
  generateHistorySummary(): string {
    if (this.callHistory.length === 0) {
      return 'No call history';
    }

    const recent = this.callHistory.slice(-5);
    return recent
      .map((call, i) => `${i + 1}. ${call.toolName}(${this.truncateHash(call.argsHash)})`)
      .join('\n');
  }

  /**
   * Detect exact repeat
   */
  private detectExactRepeat(): LoopDetectionResult {
    const { repeatThreshold } = this.config;
    const recent = this.callHistory.slice(-repeatThreshold);

    if (recent.length < repeatThreshold) {
      return { loopDetected: false };
    }

    const first = recent[0];
    if (!first) {
      return { loopDetected: false };
    }

    // Check if last N calls are exactly the same
    const firstSignature = `${first.toolName}:${first.argsHash}`;
    const allSame = recent.every(
      (call) => `${call.toolName}:${call.argsHash}` === firstSignature
    );

    if (allSame) {
      return {
        loopDetected: true,
        loopType: LoopType.EXACT,
        loopLength: repeatThreshold,
        involvedTools: [first.toolName],
        description: `Exact repeat detected: tool "${first.toolName}" called ${repeatThreshold} times consecutively with identical arguments`,
        suggestion: 'Check for deadlock, consider changing strategy or terminating the task',
      };
    }

    return { loopDetected: false };
  }

  /**
   * Detect similar repeat (same tool, slightly different arguments)
   */
  private detectSimilarRepeat(): LoopDetectionResult {
    const { repeatThreshold, similarityThreshold } = this.config;
    const recent = this.callHistory.slice(-repeatThreshold);

    if (recent.length < repeatThreshold) {
      return { loopDetected: false };
    }

    // Check if all calls are the same tool
    const first = recent[0];
    if (!first) return { loopDetected: false };

    const toolName = first.toolName;
    const allSameTool = recent.every((call) => call.toolName === toolName);

    if (!allSameTool) {
      return { loopDetected: false };
    }

    // Calculate argument similarity
    let similarCount = 0;
    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i - 1];
      const curr = recent[i];
      if (!prev || !curr) continue;

      const similarity = this.calculateSimilarity(
        prev.args || {},
        curr.args || {}
      );
      if (similarity >= similarityThreshold) {
        similarCount++;
      }
    }

    const similarityRatio = similarCount / (recent.length - 1);
    if (similarityRatio >= 0.8) {
      return {
        loopDetected: true,
        loopType: LoopType.SIMILAR,
        loopLength: repeatThreshold,
        involvedTools: [toolName],
        description: `Similar repeat detected: tool "${toolName}" called ${repeatThreshold} times consecutively with highly similar arguments`,
        suggestion: 'Check if repeatedly attempting the same operation, consider changing approach or terminating',
      };
    }

    return { loopDetected: false };
  }

  /**
   * Detect oscillating pattern (A-B-A-B)
   */
  private detectOscillatingPattern(): LoopDetectionResult {
    if (this.callHistory.length < 4) return { loopDetected: false };

    // Simple oscillating check: A -> B -> A -> B
    // Look at last 4 calls
    const last4 = this.callHistory.slice(-4);
    const [c1, c2, c3, c4] = last4;

    if (!c1 || !c2 || !c3 || !c4) return { loopDetected: false };

    if (
      c1.toolName === c3.toolName &&
      c1.argsHash === c3.argsHash &&
      c2.toolName === c4.toolName &&
      c2.argsHash === c4.argsHash &&
      (c1.toolName !== c2.toolName || c1.argsHash !== c2.argsHash)
    ) {
      return {
        loopDetected: true,
        loopType: LoopType.OSCILLATING,
        loopLength: 2,
        involvedTools: [c1.toolName, c2.toolName],
        description: `Oscillating loop detected: ${c1.toolName} <-> ${c2.toolName}`,
        suggestion: 'The model is flipping between two states. Consider adding a new constraint or stopping.',
      };
    }

    return { loopDetected: false };
  }

  /**
   * Detect periodic pattern (A-B-C-A-B-C)
   */
  private detectPeriodicPattern(): LoopDetectionResult {
    const minLength = 6; // Need at least 6 calls to detect period-3 pattern
    if (this.callHistory.length < minLength) {
      return { loopDetected: false };
    }

    const recent = this.callHistory.slice(-12);
    const signatures = recent.map((c) => `${c.toolName}:${c.argsHash}`);

    // Try to detect period 3-5 patterns
    for (let period = 3; period <= 5; period++) {
      if (signatures.length < period * 2) continue;

      const lastPeriod = signatures.slice(-period);
      const prevPeriod = signatures.slice(-period * 2, -period);

      const isMatch = lastPeriod.every((sig, i) => sig === prevPeriod[i]);
      if (isMatch) {
        const involvedTools = [
          ...new Set(
            lastPeriod
              .map((s) => s.split(':')[0])
              .filter((s): s is string => s !== undefined)
          ),
        ];
        return {
          loopDetected: true,
          loopType: LoopType.PERIODIC,
          loopLength: period,
          involvedTools,
          description: `Periodic pattern detected: call sequence repeating with period ${period}`,
          suggestion: 'Check for cyclic dependencies, consider changing execution order or terminating',
        };
      }
    }

    return { loopDetected: false };
  }

  /**
   * Calculate similarity between two argument objects
   */
  private calculateSimilarity(
    args1: Record<string, unknown>,
    args2: Record<string, unknown>
  ): number {
    const keys1 = Object.keys(args1);
    const keys2 = Object.keys(args2);
    const allKeys = new Set([...keys1, ...keys2]);

    if (allKeys.size === 0) return 1;

    let matchCount = 0;
    for (const key of allKeys) {
      if (key in args1 && key in args2) {
        if (JSON.stringify(args1[key]) === JSON.stringify(args2[key])) {
          matchCount++;
        }
      }
    }

    return matchCount / allKeys.size;
  }

  /**
   * Calculate arguments hash
   */
  private hashArgs(args: Record<string, unknown>): string {
    const str = JSON.stringify(args, Object.keys(args).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Truncate hash for display
   */
  private truncateHash(hash: string): string {
    return hash.length > 8 ? hash.substring(0, 8) + '...' : hash;
  }
}
