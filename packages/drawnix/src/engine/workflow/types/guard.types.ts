/**
 * 工作流防护机制类型定义
 * 用于防止死循环和无限递归
 */

// ============================================================================
// 工具执行状态枚举
// ============================================================================

/**
 * 工具执行状态
 * 用于标识工具执行结果的状态，帮助大模型判断是否应该终止
 */
export enum ToolExecutionStatus {
  /** 任务完成，应终止工作流 */
  COMPLETED = 'completed',
  /** 需要继续执行后续步骤 */
  CONTINUE = 'continue',
  /** 执行失败，应终止工作流 */
  FAILED = 'failed',
  /** 需要用户输入，应暂停工作流 */
  NEEDS_INPUT = 'needs_input',
  /** 部分完成，可以继续也可以终止 */
  PARTIAL = 'partial',
}

// ============================================================================
// 标准化工具响应
// ============================================================================

/**
 * 标准化工具响应接口
 * 所有 MCP 工具应返回符合此格式的响应
 */
export interface StandardToolResponse<T = unknown> {
  /** 执行状态 */
  status: ToolExecutionStatus;
  /** 状态描述信息 */
  message: string;
  /** 实际数据 */
  data?: T;
  /** 是否建议终止工作流 */
  shouldTerminate: boolean;
  /** 终止原因（如果 shouldTerminate 为 true） */
  terminationReason?: string;
  /** 下一步建议（如果有） */
  nextStepHint?: string;
}

// ============================================================================
// 递归守卫配置
// ============================================================================

/**
 * 递归守卫配置
 */
export interface RecursionGuardConfig {
  /** 最大迭代次数（硬限制） */
  maxIterations: number;
  /** 警告阈值（达到此值时发出警告） */
  warningThreshold: number;
  /** 软限制（达到此值时强烈建议终止） */
  softLimit: number;
  /** 硬限制（达到此值时强制终止） */
  hardLimit: number;
}

/**
 * 默认递归守卫配置
 */
export const DEFAULT_RECURSION_GUARD_CONFIG: RecursionGuardConfig = {
  maxIterations: 20,
  warningThreshold: 10,
  softLimit: 15,
  hardLimit: 20,
};

/**
 * 递归深度检查结果
 */
export interface RecursionCheckResult {
  /** 当前迭代次数 */
  currentIteration: number;
  /** 是否应该继续 */
  shouldContinue: boolean;
  /** 是否达到警告阈值 */
  isWarning: boolean;
  /** 是否达到软限制 */
  isSoftLimit: boolean;
  /** 是否达到硬限制（强制终止） */
  isHardLimit: boolean;
  /** 提示消息（用于注入到提示词中） */
  warningMessage?: string;
}

// ============================================================================
// 循环检测配置
// ============================================================================

/**
 * 循环检测配置
 */
export interface LoopDetectorConfig {
  /** 检测窗口大小（检查最近 N 次调用） */
  windowSize: number;
  /** 重复阈值（连续重复 N 次视为循环） */
  repeatThreshold: number;
  /** 相似度阈值 (0-1)，用于检测相似调用 */
  similarityThreshold: number;
  /** 是否启用模式检测（检测 A-B-A-B 等模式） */
  enablePatternDetection: boolean;
}

/**
 * 默认循环检测配置
 */
export const DEFAULT_LOOP_DETECTOR_CONFIG: LoopDetectorConfig = {
  windowSize: 10,
  repeatThreshold: 3,
  similarityThreshold: 0.9,
  enablePatternDetection: true,
};

/**
 * 工具调用签名
 * 用于唯一标识一次工具调用
 */
export interface ToolCallSignature {
  /** 工具名称 */
  toolName: string;
  /** 参数哈希 */
  argsHash: string;
  /** 时间戳 */
  timestamp: number;
  /** 完整参数（用于调试） */
  args?: Record<string, unknown>;
}

/**
 * 循环类型
 */
export enum LoopType {
  /** 精确重复（完全相同的调用） */
  EXACT = 'exact',
  /** 相似重复（参数略有不同） */
  SIMILAR = 'similar',
  /** 振荡模式（A-B-A-B） */
  OSCILLATING = 'oscillating',
  /** 周期模式（A-B-C-A-B-C） */
  PERIODIC = 'periodic',
}

/**
 * 循环检测结果
 */
export interface LoopDetectionResult {
  /** 是否检测到循环 */
  loopDetected: boolean;
  /** 循环类型 */
  loopType?: LoopType;
  /** 循环长度（重复次数或周期长度） */
  loopLength?: number;
  /** 涉及的工具名称 */
  involvedTools?: string[];
  /** 循环描述 */
  description?: string;
  /** 建议的处理方式 */
  suggestion?: string;
}

// ============================================================================
// 工作流执行上下文
// ============================================================================

/**
 * 工作流执行上下文
 * 用于追踪执行状态和历史
 */
export interface WorkflowExecutionContext {
  /** 执行 ID */
  executionId: string;
  /** 当前迭代次数 */
  currentIteration: number;
  /** 工具调用历史 */
  callHistory: ToolCallSignature[];
  /** 开始时间 */
  startTime: number;
  /** 最后活动时间 */
  lastActivityTime: number;
  /** 是否已终止 */
  isTerminated: boolean;
  /** 终止原因 */
  terminationReason?: string;
}

// ============================================================================
// 防护机制综合结果
// ============================================================================

/**
 * 防护检查综合结果
 */
export interface GuardCheckResult {
  /** 是否允许继续执行 */
  allowContinue: boolean;
  /** 递归检查结果 */
  recursionCheck: RecursionCheckResult;
  /** 循环检测结果 */
  loopCheck: LoopDetectionResult;
  /** 综合警告消息（用于注入提示词） */
  warningMessage?: string;
  /** 是否强制终止 */
  forceTerminate: boolean;
  /** 强制终止原因 */
  forceTerminateReason?: string;
}
