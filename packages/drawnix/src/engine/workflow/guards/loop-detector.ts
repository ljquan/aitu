/**
 * 循环检测器
 * 基于滑动窗口检测重复调用模式，防止工作流陷入死循环
 */

import {
  type LoopDetectorConfig,
  type ToolCallSignature,
  type LoopDetectionResult,
  LoopType,
  DEFAULT_LOOP_DETECTOR_CONFIG,
} from '../types';

/**
 * 循环检测器类
 */
export class LoopDetector {
  private config: LoopDetectorConfig;
  private callHistory: ToolCallSignature[] = [];

  constructor(config: Partial<LoopDetectorConfig> = {}) {
    this.config = { ...DEFAULT_LOOP_DETECTOR_CONFIG, ...config };
  }

  /**
   * 重置历史记录
   */
  reset(): void {
    this.callHistory = [];
  }

  /**
   * 记录一次工具调用
   */
  recordCall(toolName: string, args: Record<string, unknown>): void {
    const signature: ToolCallSignature = {
      toolName,
      argsHash: this.hashArgs(args),
      timestamp: Date.now(),
      args,
    };

    this.callHistory.push(signature);

    // 保持窗口大小
    if (this.callHistory.length > this.config.windowSize * 2) {
      this.callHistory = this.callHistory.slice(-this.config.windowSize * 2);
    }
  }

  /**
   * 检测是否存在循环
   */
  detect(): LoopDetectionResult {
    if (this.callHistory.length < this.config.repeatThreshold) {
      return { loopDetected: false };
    }

    // 1. 检测精确重复
    const exactResult = this.detectExactRepeat();
    if (exactResult.loopDetected) {
      return exactResult;
    }

    // 2. 检测相似重复
    const similarResult = this.detectSimilarRepeat();
    if (similarResult.loopDetected) {
      return similarResult;
    }

    // 3. 检测振荡模式 (A-B-A-B)
    if (this.config.enablePatternDetection) {
      const oscillatingResult = this.detectOscillatingPattern();
      if (oscillatingResult.loopDetected) {
        return oscillatingResult;
      }

      // 4. 检测周期模式 (A-B-C-A-B-C)
      const periodicResult = this.detectPeriodicPattern();
      if (periodicResult.loopDetected) {
        return periodicResult;
      }
    }

    return { loopDetected: false };
  }

  /**
   * 获取调用历史
   */
  getCallHistory(): ToolCallSignature[] {
    return [...this.callHistory];
  }

  /**
   * 生成调用历史摘要
   */
  generateHistorySummary(): string {
    if (this.callHistory.length === 0) {
      return '无调用历史';
    }

    const recent = this.callHistory.slice(-5);
    return recent.map((call, i) => 
      `${i + 1}. ${call.toolName}(${this.truncateHash(call.argsHash)})`
    ).join('\n');
  }

  /**
   * 检测精确重复
   */
  private detectExactRepeat(): LoopDetectionResult {
    const { repeatThreshold } = this.config;
    const recent = this.callHistory.slice(-repeatThreshold);

    if (recent.length < repeatThreshold) {
      return { loopDetected: false };
    }

    // 检查最近 N 次调用是否完全相同
    const firstSignature = `${recent[0].toolName}:${recent[0].argsHash}`;
    const allSame = recent.every(
      call => `${call.toolName}:${call.argsHash}` === firstSignature
    );

    if (allSame) {
      return {
        loopDetected: true,
        loopType: LoopType.EXACT,
        loopLength: repeatThreshold,
        involvedTools: [recent[0].toolName],
        description: `检测到精确重复：工具 "${recent[0].toolName}" 连续被调用 ${repeatThreshold} 次，参数完全相同`,
        suggestion: '请检查是否陷入死循环，考虑更换策略或终止任务',
      };
    }

    return { loopDetected: false };
  }

  /**
   * 检测相似重复（同一工具，参数略有不同）
   */
  private detectSimilarRepeat(): LoopDetectionResult {
    const { repeatThreshold, similarityThreshold } = this.config;
    const recent = this.callHistory.slice(-repeatThreshold);

    if (recent.length < repeatThreshold) {
      return { loopDetected: false };
    }

    // 检查是否都是同一个工具
    const toolName = recent[0].toolName;
    const allSameTool = recent.every(call => call.toolName === toolName);

    if (!allSameTool) {
      return { loopDetected: false };
    }

    // 计算参数相似度
    let similarCount = 0;
    for (let i = 1; i < recent.length; i++) {
      const similarity = this.calculateSimilarity(
        recent[i - 1].args || {},
        recent[i].args || {}
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
        description: `检测到相似重复：工具 "${toolName}" 连续被调用 ${repeatThreshold} 次，参数高度相似`,
        suggestion: '请检查是否在重复尝试相同操作，考虑更换方法或终止',
      };
    }

    return { loopDetected: false };
  }

  /**
   * 检测振荡模式 (A-B-A-B)
   */
  private detectOscillatingPattern(): LoopDetectionResult {
    const minLength = 4; // 至少需要 4 次调用才能检测 A-B-A-B
    if (this.callHistory.length < minLength) {
      return { loopDetected: false };
    }

    const recent = this.callHistory.slice(-6);
    if (recent.length < 4) {
      return { loopDetected: false };
    }

    // 检查 A-B-A-B 模式
    const signatures = recent.map(c => `${c.toolName}:${c.argsHash}`);
    
    // 检查最后 4 个是否形成 A-B-A-B
    const last4 = signatures.slice(-4);
    if (last4[0] === last4[2] && last4[1] === last4[3] && last4[0] !== last4[1]) {
      const toolA = recent[recent.length - 4].toolName;
      const toolB = recent[recent.length - 3].toolName;
      return {
        loopDetected: true,
        loopType: LoopType.OSCILLATING,
        loopLength: 2,
        involvedTools: [toolA, toolB],
        description: `检测到振荡模式：工具在 "${toolA}" 和 "${toolB}" 之间来回切换`,
        suggestion: '请检查是否两个工具在互相触发，考虑打破循环或终止',
      };
    }

    return { loopDetected: false };
  }

  /**
   * 检测周期模式 (A-B-C-A-B-C)
   */
  private detectPeriodicPattern(): LoopDetectionResult {
    const minLength = 6; // 至少需要 6 次调用才能检测周期为 3 的模式
    if (this.callHistory.length < minLength) {
      return { loopDetected: false };
    }

    const recent = this.callHistory.slice(-12);
    const signatures = recent.map(c => `${c.toolName}:${c.argsHash}`);

    // 尝试检测周期 3-5 的模式
    for (let period = 3; period <= 5; period++) {
      if (signatures.length < period * 2) continue;

      const lastPeriod = signatures.slice(-period);
      const prevPeriod = signatures.slice(-period * 2, -period);

      const isMatch = lastPeriod.every((sig, i) => sig === prevPeriod[i]);
      if (isMatch) {
        const involvedTools = [...new Set(lastPeriod.map(s => s.split(':')[0]))];
        return {
          loopDetected: true,
          loopType: LoopType.PERIODIC,
          loopLength: period,
          involvedTools,
          description: `检测到周期模式：工具调用序列以周期 ${period} 重复`,
          suggestion: '请检查是否存在循环依赖，考虑改变执行顺序或终止',
        };
      }
    }

    return { loopDetected: false };
  }

  /**
   * 计算两个参数对象的相似度
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
   * 计算参数哈希
   */
  private hashArgs(args: Record<string, unknown>): string {
    const str = JSON.stringify(args, Object.keys(args).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * 截断哈希用于显示
   */
  private truncateHash(hash: string): string {
    return hash.length > 8 ? hash.substring(0, 8) + '...' : hash;
  }
}
