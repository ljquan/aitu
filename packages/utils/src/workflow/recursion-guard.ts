/**
 * Recursion Depth Guard
 *
 * Monitors workflow iteration count, provides tiered warnings and forced termination.
 * This is a framework-agnostic utility that can be used in any workflow system.
 */

import type { RecursionGuardConfig, RecursionCheckResult } from './types';
import { DEFAULT_RECURSION_GUARD_CONFIG } from './types';

/**
 * Recursion depth guard class
 */
export class RecursionGuard {
  private config: RecursionGuardConfig;
  private currentIteration = 0;

  constructor(config: Partial<RecursionGuardConfig> = {}) {
    this.config = { ...DEFAULT_RECURSION_GUARD_CONFIG, ...config };
  }

  /**
   * Reset counter
   */
  reset(): void {
    this.currentIteration = 0;
  }

  /**
   * Increment iteration count and check status
   */
  increment(): RecursionCheckResult {
    this.currentIteration++;
    return this.check();
  }

  /**
   * Check current iteration status
   */
  check(): RecursionCheckResult {
    const { warningThreshold, softLimit, hardLimit } = this.config;
    const current = this.currentIteration;

    const isWarning = current >= warningThreshold && current < softLimit;
    const isSoftLimit = current >= softLimit && current < hardLimit;
    const isHardLimit = current >= hardLimit;

    const result: RecursionCheckResult = {
      currentIteration: current,
      shouldContinue: !isHardLimit,
      isWarning,
      isSoftLimit,
      isHardLimit,
    };

    // Generate warning message
    if (isHardLimit) {
      result.warningMessage = this.getHardLimitMessage();
    } else if (isSoftLimit) {
      result.warningMessage = this.getSoftLimitMessage();
    } else if (isWarning) {
      result.warningMessage = this.getWarningMessage();
    }

    return result;
  }

  /**
   * Get current iteration count
   */
  getCurrentIteration(): number {
    return this.currentIteration;
  }

  /**
   * Get remaining iterations
   */
  getRemainingIterations(): number {
    return Math.max(0, this.config.hardLimit - this.currentIteration);
  }

  /**
   * Get configuration
   */
  getConfig(): RecursionGuardConfig {
    return { ...this.config };
  }

  /**
   * Generate warning threshold message
   */
  private getWarningMessage(): string {
    const remaining = this.config.hardLimit - this.currentIteration;
    return `⚠️ [Iteration Warning] Current iteration: ${this.currentIteration}, remaining: ${remaining}. Please check if the task can be completed, avoid unnecessary repeated calls.`;
  }

  /**
   * Generate soft limit message
   */
  private getSoftLimitMessage(): string {
    const remaining = this.config.hardLimit - this.currentIteration;
    return `🚨 [Approaching Limit] Current iteration: ${this.currentIteration}, only ${remaining} remaining! Please evaluate immediately:
1. Is the task already completed? If so, terminate and return results
2. Is there a loop? If so, change strategy or terminate
3. Is the task feasible? If not, terminate and explain`;
  }

  /**
   * Generate hard limit message
   */
  private getHardLimitMessage(): string {
    return `🛑 [Forced Termination] Maximum iterations ${this.config.hardLimit} reached, workflow will be forcibly terminated. Please summarize current progress and return available results.`;
  }

  /**
   * Generate status information for prompt injection
   */
  generatePromptInjection(): string | null {
    const result = this.check();

    if (result.isHardLimit || result.isSoftLimit || result.isWarning) {
      const statusBar = this.generateStatusBar();
      return `\n\n---\n## 🔄 Workflow Status\n${statusBar}\n${result.warningMessage}\n---\n`;
    }

    return null;
  }

  /**
   * Generate progress bar status
   */
  private generateStatusBar(): string {
    const { hardLimit } = this.config;
    const current = this.currentIteration;
    const percentage = Math.round((current / hardLimit) * 100);
    const filled = Math.round(percentage / 5);
    const empty = 20 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `Iteration Progress: [${bar}] ${current}/${hardLimit} (${percentage}%)`;
  }
}
