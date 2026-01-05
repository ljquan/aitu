/**
 * 递归深度守卫
 * 监控工作流迭代次数，提供分级警告和强制终止机制
 */

import {
  type RecursionGuardConfig,
  type RecursionCheckResult,
  DEFAULT_RECURSION_GUARD_CONFIG,
} from '../types';

/**
 * 递归深度守卫类
 */
export class RecursionGuard {
  private config: RecursionGuardConfig;
  private currentIteration: number = 0;

  constructor(config: Partial<RecursionGuardConfig> = {}) {
    this.config = { ...DEFAULT_RECURSION_GUARD_CONFIG, ...config };
  }

  /**
   * 重置计数器
   */
  reset(): void {
    this.currentIteration = 0;
  }

  /**
   * 增加迭代计数并检查状态
   */
  increment(): RecursionCheckResult {
    this.currentIteration++;
    return this.check();
  }

  /**
   * 检查当前迭代状态
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

    // 生成警告消息
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
   * 获取当前迭代次数
   */
  getCurrentIteration(): number {
    return this.currentIteration;
  }

  /**
   * 获取剩余迭代次数
   */
  getRemainingIterations(): number {
    return Math.max(0, this.config.hardLimit - this.currentIteration);
  }

  /**
   * 生成警告阈值消息
   */
  private getWarningMessage(): string {
    const remaining = this.config.hardLimit - this.currentIteration;
    return `⚠️ 【迭代警告】当前已执行 ${this.currentIteration} 次迭代，剩余 ${remaining} 次。请检查任务是否可以完成，避免不必要的重复调用。`;
  }

  /**
   * 生成软限制消息
   */
  private getSoftLimitMessage(): string {
    const remaining = this.config.hardLimit - this.currentIteration;
    return `🚨 【即将达到限制】当前已执行 ${this.currentIteration} 次迭代，仅剩 ${remaining} 次！请立即评估：
1. 任务是否已经完成？如果是，请终止并返回结果
2. 是否陷入循环？如果是，请改变策略或终止
3. 任务是否可行？如果不可行，请终止并说明原因`;
  }

  /**
   * 生成硬限制消息
   */
  private getHardLimitMessage(): string {
    return `🛑 【强制终止】已达到最大迭代次数 ${this.config.hardLimit}，工作流将被强制终止。请总结当前进度并返回可用的结果。`;
  }

  /**
   * 生成注入到提示词中的状态信息
   */
  generatePromptInjection(): string | null {
    const result = this.check();
    
    if (result.isHardLimit || result.isSoftLimit || result.isWarning) {
      const statusBar = this.generateStatusBar();
      return `\n\n---\n## 🔄 工作流状态\n${statusBar}\n${result.warningMessage}\n---\n`;
    }

    return null;
  }

  /**
   * 生成进度条状态
   */
  private generateStatusBar(): string {
    const { hardLimit } = this.config;
    const current = this.currentIteration;
    const percentage = Math.round((current / hardLimit) * 100);
    const filled = Math.round(percentage / 5);
    const empty = 20 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `迭代进度: [${bar}] ${current}/${hardLimit} (${percentage}%)`;
  }
}
