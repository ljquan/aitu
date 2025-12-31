/**
 * 工作流引擎类型定义
 */

import type { MCPTool, MCPToolResult } from './mcp.types';
import type { GuardCheckResult } from './guard.types';
import type { WorkflowResponse, WorkflowMCPCall } from '../prompts/workflow';

/**
 * 工作流执行配置
 */
export interface WorkflowConfig {
  /** 最大迭代次数 */
  maxIterations: number;
  /** 工具执行超时（毫秒） */
  toolTimeout: number;
  /** 是否启用详细日志 */
  verbose: boolean;
  /** 使用的模型 */
  model?: string;
  /** 是否启用循环检测 */
  enableLoopDetection?: boolean;
  /** 警告阈值 */
  warningThreshold?: number;
  /** 软限制 */
  softLimit?: number;
  /** 是否启用参数映射 */
  enableParameterMapping?: boolean;
  /** 参数映射日志级别 */
  parameterMappingLogLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * 默认配置
 */
export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  maxIterations: 20,
  toolTimeout: 30000,
  verbose: false,
  enableLoopDetection: true,
  warningThreshold: 10,
  softLimit: 15,
  enableParameterMapping: true,
  parameterMappingLogLevel: 'info',
};

/**
 * 工作流执行结果
 */
export interface WorkflowResult {
  success: boolean;
  output: string;
  finalOutput: string;
  iterations: number;
  mcpCalls: MCPCallRecord[];
  error?: string;
  terminationReason?: string;
}

/**
 * MCP 调用记录
 */
export interface MCPCallRecord {
  mcp: string;
  args: Record<string, unknown>;
  result?: string;
  rawResult?: string;
  success: boolean;
  error?: string;
  duration: number;
  terminateWorkflow?: boolean;
  progressMessage?: string;
}

/**
 * 工作流事件类型
 */
export type WorkflowEvent =
  | { type: 'iteration_start'; iteration: number }
  | { type: 'iteration_started'; iteration: number; prompt?: { system: string; user: string } }
  | { type: 'iteration_completed'; iteration: number; content: string }
  | { type: 'llm_response'; response: WorkflowResponse }
  | { type: 'mcp_call_start'; call: WorkflowMCPCall }
  | { type: 'mcp_call_complete'; call: WorkflowMCPCall; result: string }
  | { type: 'mcp_call_error'; call: WorkflowMCPCall; error: string }
  | { type: 'mcp_call'; mcpName: string; args: Record<string, unknown>; result?: string; success: boolean; error?: string; duration?: number }
  | { type: 'workflow_complete'; result: WorkflowResult }
  | { type: 'workflow_error'; error: string }
  | { type: 'guard_warning'; message: string; checkResult: GuardCheckResult }
  | { type: 'loop_detected'; description: string }
  | { type: 'force_terminate'; reason: string }
  | { type: 'progress_update'; message: string }
  | { type: 'display_result'; content: string; terminateWorkflow: boolean };

/**
 * 事件监听器
 */
export type WorkflowEventListener = (event: WorkflowEvent) => void;

/**
 * AI 服务接口
 */
export interface AIService {
  chat(messages: Array<{ role: string; content: string }>, model?: string, requestId?: string): Promise<string>;
  stopGeneration?(requestId: string): boolean;
}

/**
 * 工具执行器接口
 */
export interface ToolExecutor {
  execute(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult>;
}

/**
 * 步骤状态
 */
export enum StepStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/**
 * 系统状态
 */
export enum SystemStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}
