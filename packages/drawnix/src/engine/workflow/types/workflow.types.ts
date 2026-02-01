/**
 * 工作流引擎类型定义
 */

import type { MCPToolResult } from './mcp.types';
import type { GuardCheckResult } from './guard.types';
import type { WorkflowResponse, WorkflowMCPCall } from '../prompts/workflow';

// Re-export generic types from @aitu/utils
export {
  type WorkflowConfig,
  DEFAULT_WORKFLOW_CONFIG,
  StepStatus,
  SystemStatus,
} from '@aitu/utils';

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
