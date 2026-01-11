/**
 * Service Worker 消息类型定义
 *
 * 定义应用层与 Service Worker 之间的通信协议
 */

import type { Task, TaskType, TaskStatus, GenerationParams, TaskResult, TaskError, TaskExecutionPhase } from './store';

// ==================== 应用层 → Service Worker ====================

/**
 * 创建任务的参数
 */
export interface CreateTaskPayload {
  type: TaskType;
  params: GenerationParams;
}

/**
 * 工作流启动参数
 */
export interface WorkflowStartPayload {
  id: string;
  definition: WorkflowDefinition;
}

/**
 * 工作流定义
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  steps: WorkflowStep[];
  metadata?: Record<string, unknown>;
}

/**
 * 工作流步骤
 */
export interface WorkflowStep {
  id: string;
  name: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  params?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  duration?: number;
}

/**
 * 应用层发送给 Service Worker 的消息类型
 */
export type AppToSWMessage =
  // 任务相关
  | { type: 'TASK_CREATE'; payload: CreateTaskPayload; requestId?: string }
  | { type: 'TASK_CANCEL'; payload: { taskId: string } }
  | { type: 'TASK_RETRY'; payload: { taskId: string } }
  | { type: 'TASK_DELETE'; payload: { taskId: string } }
  | { type: 'TASK_CLEAR_COMPLETED' }
  | { type: 'TASK_CLEAR_FAILED' }
  // 工作流相关
  | { type: 'WORKFLOW_START'; payload: WorkflowStartPayload; requestId?: string }
  | { type: 'WORKFLOW_ABORT'; payload: { workflowId: string } }
  // 查询相关
  | { type: 'GET_ALL_TASKS'; requestId: string }
  | { type: 'GET_TASK'; payload: { taskId: string }; requestId: string }
  | { type: 'GET_WORKFLOW_STATE'; requestId: string }
  // 同步相关
  | { type: 'SYNC_REQUEST'; requestId: string };

// ==================== Service Worker → 应用层 ====================

/**
 * 同步数据
 */
export interface SyncData {
  tasks: Task[];
  workflows: WorkflowState[];
}

/**
 * 工作流状态
 */
export interface WorkflowState {
  id: string;
  definition: WorkflowDefinition;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStepIndex: number;
  steps: WorkflowStep[];
  result?: WorkflowResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 工作流结果
 */
export interface WorkflowResult {
  success: boolean;
  output: string;
  finalOutput: string;
  iterations: number;
  error?: string;
}

/**
 * 工作流步骤更新
 */
export interface WorkflowStepUpdate {
  workflowId: string;
  stepId: string;
  status: WorkflowStep['status'];
  result?: unknown;
  error?: string;
  duration?: number;
}

/**
 * Service Worker 发送给应用层的消息类型
 */
export type SWToAppMessage =
  // 任务相关
  | { type: 'TASK_CREATED'; payload: Task }
  | { type: 'TASK_UPDATED'; payload: Task }
  | { type: 'TASK_PROGRESS'; payload: { taskId: string; progress: number } }
  | { type: 'TASK_COMPLETED'; payload: Task }
  | { type: 'TASK_FAILED'; payload: Task }
  | { type: 'TASK_DELETED'; payload: { taskId: string } }
  // 工作流相关
  | { type: 'WORKFLOW_STARTED'; payload: WorkflowState }
  | { type: 'WORKFLOW_STEP_UPDATE'; payload: WorkflowStepUpdate }
  | { type: 'WORKFLOW_COMPLETED'; payload: WorkflowState }
  | { type: 'WORKFLOW_FAILED'; payload: WorkflowState }
  | { type: 'WORKFLOW_ABORTED'; payload: { workflowId: string } }
  // 响应相关
  | { type: 'SYNC_RESPONSE'; payload: SyncData; requestId: string }
  | { type: 'RESPONSE'; payload: unknown; requestId: string }
  | { type: 'ERROR'; error: string; requestId?: string };

/**
 * 所有消息类型的联合
 */
export type SWMessage = AppToSWMessage | SWToAppMessage;

/**
 * 消息类型字符串
 */
export type AppToSWMessageType = AppToSWMessage['type'];
export type SWToAppMessageType = SWToAppMessage['type'];
