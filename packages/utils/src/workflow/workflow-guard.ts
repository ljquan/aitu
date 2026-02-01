/**
 * Workflow Guard
 *
 * Combines recursion guard and loop detector to provide unified protection.
 * This is a framework-agnostic utility that can be used in any workflow system.
 */

import { RecursionGuard } from './recursion-guard';
import { LoopDetector } from './loop-detector';
import type {
  WorkflowGuardConfig,
  GuardCheckResult,
  WorkflowExecutionContext,
  ToolCallSignature,
  RecursionCheckResult,
  LoopDetectionResult,
} from './types';
import {
  DEFAULT_RECURSION_GUARD_CONFIG,
  DEFAULT_LOOP_DETECTOR_CONFIG,
} from './types';

/**
 * Workflow guard class
 */
export class WorkflowGuard {
  private config: WorkflowGuardConfig;
  private recursionGuard: RecursionGuard;
  private loopDetector: LoopDetector;
  private context: WorkflowExecutionContext;

  constructor(config: Partial<WorkflowGuardConfig> = {}) {
    this.config = {
      recursion: { ...DEFAULT_RECURSION_GUARD_CONFIG, ...config.recursion },
      loopDetection: { ...DEFAULT_LOOP_DETECTOR_CONFIG, ...config.loopDetection },
      verbose: config.verbose ?? false,
    };

    this.recursionGuard = new RecursionGuard(this.config.recursion);
    this.loopDetector = new LoopDetector(this.config.loopDetection);
    this.context = this.createInitialContext();
  }

  /**
   * Reset guard state
   */
  reset(): void {
    this.recursionGuard.reset();
    this.loopDetector.reset();
    this.context = this.createInitialContext();
  }

  /**
   * Start a new iteration
   * Call this method before each AI call
   */
  startIteration(): GuardCheckResult {
    const recursionCheck = this.recursionGuard.increment();
    const loopCheck = this.loopDetector.detect();

    this.context.currentIteration = recursionCheck.currentIteration;
    this.context.lastActivityTime = Date.now();

    return this.buildCheckResult(recursionCheck, loopCheck);
  }

  /**
   * Record a tool call
   * Call this method after each MCP tool call
   */
  recordToolCall(toolName: string, args: Record<string, unknown>): void {
    this.loopDetector.recordCall(toolName, args);
    this.context.lastActivityTime = Date.now();
  }

  /**
   * Check current state
   * Does not increment iteration count, only checks state
   */
  check(): GuardCheckResult {
    const recursionCheck = this.recursionGuard.check();
    const loopCheck = this.loopDetector.detect();
    return this.buildCheckResult(recursionCheck, loopCheck);
  }

  /**
   * Mark workflow as terminated
   */
  terminate(reason: string): void {
    this.context.isTerminated = true;
    this.context.terminationReason = reason;
  }

  /**
   * Get execution context
   */
  getContext(): WorkflowExecutionContext {
    return { ...this.context };
  }

  /**
   * Get call history
   */
  getCallHistory(): ToolCallSignature[] {
    return this.loopDetector.getCallHistory();
  }

  /**
   * Get configuration
   */
  getConfig(): WorkflowGuardConfig {
    return {
      recursion: this.recursionGuard.getConfig(),
      loopDetection: this.loopDetector.getConfig(),
      verbose: this.config.verbose,
    };
  }

  /**
   * Generate prompt injection content
   * Used to add warning information to prompts
   */
  generatePromptInjection(): string | null {
    const result = this.check();
    const parts: string[] = [];

    // Recursion warning
    const recursionInjection = this.recursionGuard.generatePromptInjection();
    if (recursionInjection) {
      parts.push(recursionInjection);
    }

    // Loop detection warning
    if (result.loopCheck.loopDetected) {
      parts.push(this.generateLoopWarning(result));
    }

    if (parts.length === 0) {
      return null;
    }

    return parts.join('\n');
  }

  /**
   * Generate execution summary
   */
  generateSummary(): string {
    const { currentIteration, startTime, lastActivityTime } = this.context;
    const duration = lastActivityTime - startTime;
    const callHistory = this.loopDetector.getCallHistory();

    return `## Workflow Execution Summary
- Execution ID: ${this.context.executionId}
- Iterations: ${currentIteration}
- Duration: ${Math.round(duration / 1000)}s
- Tool calls: ${callHistory.length}
- Status: ${this.context.isTerminated ? 'Terminated' : 'Running'}
${this.context.terminationReason ? `- Termination reason: ${this.context.terminationReason}` : ''}

### Recent Calls
${this.loopDetector.generateHistorySummary()}`;
  }

  /**
   * Build check result
   */
  private buildCheckResult(
    recursionCheck: RecursionCheckResult,
    loopCheck: LoopDetectionResult
  ): GuardCheckResult {
    // Determine if force terminate
    const forceTerminate = recursionCheck.isHardLimit || loopCheck.loopDetected;

    // Build warning messages
    const warnings: string[] = [];
    if (recursionCheck.warningMessage) {
      warnings.push(recursionCheck.warningMessage);
    }
    if (loopCheck.loopDetected && loopCheck.description) {
      warnings.push(`🔁 ${loopCheck.description}`);
      if (loopCheck.suggestion) {
        warnings.push(`💡 ${loopCheck.suggestion}`);
      }
    }

    // Determine force termination reason
    let forceTerminateReason: string | undefined;
    if (recursionCheck.isHardLimit) {
      forceTerminateReason = 'Maximum iteration limit reached';
    } else if (loopCheck.loopDetected) {
      forceTerminateReason = `Loop detected: ${loopCheck.description}`;
    }

    return {
      allowContinue: !forceTerminate,
      recursionCheck,
      loopCheck,
      warningMessage: warnings.length > 0 ? warnings.join('\n') : undefined,
      forceTerminate,
      forceTerminateReason,
    };
  }

  /**
   * Generate loop warning
   */
  private generateLoopWarning(result: GuardCheckResult): string {
    const { loopCheck } = result;
    return `
---
## 🔁 Loop Detection Warning

${loopCheck.description}

**Involved tools**: ${loopCheck.involvedTools?.join(', ') || 'Unknown'}
**Loop type**: ${loopCheck.loopType}
**Suggestion**: ${loopCheck.suggestion}

⚠️ Please check immediately and take one of the following actions:
1. Terminate workflow and return current results
2. Change execution strategy to avoid repeated calls
3. If task is complete, return results directly
---`;
  }

  /**
   * Create initial context
   */
  private createInitialContext(): WorkflowExecutionContext {
    return {
      executionId: this.generateExecutionId(),
      currentIteration: 0,
      callHistory: [],
      startTime: Date.now(),
      lastActivityTime: Date.now(),
      isTerminated: false,
    };
  }

  /**
   * Generate execution ID
   */
  private generateExecutionId(): string {
    return `wf-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}
