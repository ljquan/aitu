/**
 * 工作流综合防护
 * 整合递归守卫和循环检测器，提供统一的防护接口
 */

import { RecursionGuard } from './recursion-guard';
import { LoopDetector } from './loop-detector';
import {
  type RecursionGuardConfig,
  type LoopDetectorConfig,
  type GuardCheckResult,
  type WorkflowExecutionContext,
  type ToolCallSignature,
  DEFAULT_RECURSION_GUARD_CONFIG,
  DEFAULT_LOOP_DETECTOR_CONFIG,
} from '../types';

/**
 * 工作流防护配置
 */
export interface WorkflowGuardConfig {
  recursion: RecursionGuardConfig;
  loopDetection: LoopDetectorConfig;
  /** 是否启用详细日志 */
  verbose: boolean;
}

/**
 * 默认工作流防护配置
 */
export const DEFAULT_WORKFLOW_GUARD_CONFIG: WorkflowGuardConfig = {
  recursion: DEFAULT_RECURSION_GUARD_CONFIG,
  loopDetection: DEFAULT_LOOP_DETECTOR_CONFIG,
  verbose: false,
};

/**
 * 工作流综合防护类
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
   * 重置防护状态
   */
  reset(): void {
    this.recursionGuard.reset();
    this.loopDetector.reset();
    this.context = this.createInitialContext();
  }

  /**
   * 开始新的迭代
   * 在每次 AI 调用前调用此方法
   */
  startIteration(): GuardCheckResult {
    const recursionCheck = this.recursionGuard.increment();
    const loopCheck = this.loopDetector.detect();

    this.context.currentIteration = recursionCheck.currentIteration;
    this.context.lastActivityTime = Date.now();

    return this.buildCheckResult(recursionCheck, loopCheck);
  }

  /**
   * 记录工具调用
   * 在每次 MCP 工具调用后调用此方法
   */
  recordToolCall(toolName: string, args: Record<string, unknown>): void {
    this.loopDetector.recordCall(toolName, args);
    this.context.lastActivityTime = Date.now();
  }

  /**
   * 检查当前状态
   * 不增加迭代计数，仅检查状态
   */
  check(): GuardCheckResult {
    const recursionCheck = this.recursionGuard.check();
    const loopCheck = this.loopDetector.detect();
    return this.buildCheckResult(recursionCheck, loopCheck);
  }

  /**
   * 标记工作流终止
   */
  terminate(reason: string): void {
    this.context.isTerminated = true;
    this.context.terminationReason = reason;
  }

  /**
   * 获取执行上下文
   */
  getContext(): WorkflowExecutionContext {
    return { ...this.context };
  }

  /**
   * 获取调用历史
   */
  getCallHistory(): ToolCallSignature[] {
    return this.loopDetector.getCallHistory();
  }

  /**
   * 生成提示词注入内容
   * 用于在提示词中添加警告信息
   */
  generatePromptInjection(): string | null {
    const result = this.check();
    const parts: string[] = [];

    // 递归警告
    const recursionInjection = this.recursionGuard.generatePromptInjection();
    if (recursionInjection) {
      parts.push(recursionInjection);
    }

    // 循环检测警告
    if (result.loopCheck.loopDetected) {
      parts.push(this.generateLoopWarning(result));
    }

    if (parts.length === 0) {
      return null;
    }

    return parts.join('\n');
  }

  /**
   * 生成执行摘要
   */
  generateSummary(): string {
    const { currentIteration, startTime, lastActivityTime } = this.context;
    const duration = lastActivityTime - startTime;
    const callHistory = this.loopDetector.getCallHistory();

    return `## 工作流执行摘要
- 执行 ID: ${this.context.executionId}
- 迭代次数: ${currentIteration}
- 执行时长: ${Math.round(duration / 1000)}秒
- 工具调用次数: ${callHistory.length}
- 状态: ${this.context.isTerminated ? '已终止' : '运行中'}
${this.context.terminationReason ? `- 终止原因: ${this.context.terminationReason}` : ''}

### 最近调用
${this.loopDetector.generateHistorySummary()}`;
  }

  /**
   * 构建检查结果
   */
  private buildCheckResult(
    recursionCheck: ReturnType<RecursionGuard['check']>,
    loopCheck: ReturnType<LoopDetector['detect']>
  ): GuardCheckResult {
    // 判断是否强制终止
    const forceTerminate = recursionCheck.isHardLimit || loopCheck.loopDetected;
    
    // 构建警告消息
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

    // 确定强制终止原因
    let forceTerminateReason: string | undefined;
    if (recursionCheck.isHardLimit) {
      forceTerminateReason = '达到最大迭代次数限制';
    } else if (loopCheck.loopDetected) {
      forceTerminateReason = `检测到循环: ${loopCheck.description}`;
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
   * 生成循环警告
   */
  private generateLoopWarning(result: GuardCheckResult): string {
    const { loopCheck } = result;
    return `
---
## 🔁 循环检测警告

${loopCheck.description}

**涉及的工具**: ${loopCheck.involvedTools?.join(', ') || '未知'}
**循环类型**: ${loopCheck.loopType}
**建议**: ${loopCheck.suggestion}

⚠️ 请立即检查并采取以下措施之一：
1. 终止工作流并返回当前结果
2. 改变执行策略，避免重复调用
3. 如果任务已完成，直接返回结果
---`;
  }

  /**
   * 创建初始上下文
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
   * 生成执行 ID
   */
  private generateExecutionId(): string {
    return `wf-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}
