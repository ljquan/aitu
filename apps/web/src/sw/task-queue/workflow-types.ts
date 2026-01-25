/**
 * Workflow Types for Service Worker
 *
 * Defines the workflow structure that can be submitted to SW for execution.
 * Workflows contain one or more steps, each step is an MCP tool call.
 */

import type { TaskStatus, TaskExecutionPhase, GeminiConfig, VideoAPIConfig } from './types';

// ============================================================================
// Workflow Definition
// ============================================================================

/**
 * Workflow step status
 */
export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * Workflow step execution options (batch generation etc.)
 */
export interface WorkflowStepOptions {
  /** Execution mode */
  mode?: 'async' | 'queue';
  /** Batch ID for batch generation */
  batchId?: string;
  /** Batch index (1-based) */
  batchIndex?: number;
  /** Total batch count */
  batchTotal?: number;
  /** Global index */
  globalIndex?: number;
}

/**
 * A single step in a workflow
 */
export interface WorkflowStep {
  /** Unique step ID */
  id: string;
  /** MCP tool name to execute */
  mcp: string;
  /** Tool arguments */
  args: Record<string, unknown>;
  /** Human-readable description */
  description: string;
  /** Step status */
  status: WorkflowStepStatus;
  /** Step result (if completed) */
  result?: WorkflowStepResult;
  /** Error message (if failed) */
  error?: string;
  /** Execution duration in ms */
  duration?: number;
  /** Dependencies - step IDs that must complete before this step */
  dependsOn?: string[];
  /** Execution options (batch info etc.) */
  options?: WorkflowStepOptions;
}

/**
 * Result of a workflow step
 */
export interface WorkflowStepResult {
  /** Whether the step succeeded */
  success: boolean;
  /** Result type */
  type: 'image' | 'video' | 'text' | 'canvas' | 'error';
  /** Result data */
  data?: {
    /** Generated content URL */
    url?: string;
    /** Task ID (for queued tasks) */
    taskId?: string;
    /** Multiple task IDs (for batch generation) */
    taskIds?: string[];
    /** Text content */
    content?: string;
    /** Additional metadata */
    [key: string]: unknown;
  };
  /** Error message */
  error?: string;
}

/**
 * Workflow definition submitted to SW
 */
export interface Workflow {
  /** Unique workflow ID */
  id: string;
  /** Workflow steps */
  steps: WorkflowStep[];
  /** Workflow status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Completion timestamp */
  completedAt?: number;
  /** Overall error (if failed) */
  error?: string;
  /** Source context (for debugging) */
  context?: WorkflowContext;
}

/**
 * Context information for workflow
 */
export interface WorkflowContext {
  /** Original user input */
  userInput?: string;
  /** Selected model */
  model?: string;
  /** Generation parameters */
  params?: {
    count?: number;
    size?: string;
    duration?: string;
  };
  /** Selected canvas elements */
  selection?: {
    texts?: string[];
    images?: string[];
    videos?: string[];
  };
  /** Reference images (actual URLs for [图片1], [图片2], etc.) */
  referenceImages?: string[];
  /** Text model used for AI analysis */
  textModel?: string;
}

// ============================================================================
// MCP Tool Types (SW-compatible)
// ============================================================================

/**
 * MCP tool execution mode
 */
export type MCPExecuteMode = 'async' | 'queue';

/**
 * MCP tool result
 */
export interface MCPResult {
  success: boolean;
  data?: unknown;
  error?: string;
  type?: 'image' | 'video' | 'text' | 'canvas' | 'error';
  /** Task ID (for queue mode) */
  taskId?: string;
  /** Multiple task IDs (for batch) */
  taskIds?: string[];
  /** Additional workflow steps (for ai_analyze) */
  addSteps?: Array<{
    id: string;
    mcp: string;
    args: Record<string, unknown>;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
  }>;
}

/**
 * MCP tool definition (SW-compatible subset)
 */
export interface SWMCPTool {
  name: string;
  description: string;
  /** Execute the tool */
  execute: (
    args: Record<string, unknown>,
    config: SWMCPToolConfig
  ) => Promise<MCPResult>;
}

/**
 * Configuration passed to MCP tools in SW
 */
export interface SWMCPToolConfig {
  geminiConfig: GeminiConfig;
  videoConfig: VideoAPIConfig;
  /** Callback for progress updates */
  onProgress?: (progress: number, phase?: TaskExecutionPhase) => void;
  /** Callback when remote ID is received (for polling tasks) */
  onRemoteId?: (remoteId: string) => void;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

// ============================================================================
// Main Thread → Service Worker Messages
// ============================================================================

/**
 * Submit a workflow for execution
 */
export interface WorkflowSubmitMessage {
  type: 'WORKFLOW_SUBMIT';
  workflow: Workflow;
}

/**
 * Cancel a workflow
 */
export interface WorkflowCancelMessage {
  type: 'WORKFLOW_CANCEL';
  workflowId: string;
}

/**
 * Get workflow status
 */
export interface WorkflowGetStatusMessage {
  type: 'WORKFLOW_GET_STATUS';
  workflowId: string;
}

/**
 * Get all workflows
 */
export interface WorkflowGetAllMessage {
  type: 'WORKFLOW_GET_ALL';
}

/**
 * Get workflow status response (with full workflow data)
 */
export interface WorkflowStatusResponseMessage {
  type: 'WORKFLOW_STATUS_RESPONSE';
  workflowId: string;
  workflow: Workflow | null;
}

/**
 * Get all workflows response
 */
export interface WorkflowAllResponseMessage {
  type: 'WORKFLOW_ALL_RESPONSE';
  workflows: Workflow[];
}

/**
 * Union type for workflow-related messages from main thread
 */
export type WorkflowMainToSWMessage =
  | WorkflowSubmitMessage
  | WorkflowCancelMessage
  | WorkflowGetStatusMessage
  | WorkflowGetAllMessage;

// ============================================================================
// Service Worker → Main Thread Messages
// ============================================================================

/**
 * Workflow status update
 */
export interface WorkflowStatusMessage {
  type: 'WORKFLOW_STATUS';
  workflowId: string;
  status: Workflow['status'];
  updatedAt: number;
}

/**
 * Workflow step status update
 */
export interface WorkflowStepStatusMessage {
  type: 'WORKFLOW_STEP_STATUS';
  workflowId: string;
  stepId: string;
  status: WorkflowStepStatus;
  result?: WorkflowStepResult;
  error?: string;
  duration?: number;
}

/**
 * Workflow completed
 */
export interface WorkflowCompletedMessage {
  type: 'WORKFLOW_COMPLETED';
  workflowId: string;
  workflow: Workflow;
}

/**
 * Workflow failed
 */
export interface WorkflowFailedMessage {
  type: 'WORKFLOW_FAILED';
  workflowId: string;
  error: string;
}

/**
 * Request canvas operation from main thread
 * SW cannot directly manipulate canvas, so it sends this message
 */
export interface CanvasOperationRequestMessage {
  type: 'CANVAS_OPERATION_REQUEST';
  /** Unique request ID for response correlation */
  requestId: string;
  /** Operation type */
  operation: 'insert_image' | 'insert_video' | 'insert_text';
  /** Operation parameters */
  params: {
    url?: string;
    content?: string;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
  };
}

/**
 * Response to canvas operation request
 */
export interface CanvasOperationResponseMessage {
  type: 'CANVAS_OPERATION_RESPONSE';
  requestId: string;
  success: boolean;
  error?: string;
}

/**
 * Request main thread to execute an MCP tool
 * Used for tools that cannot run in SW (e.g., ai_analyze, canvas operations)
 */
export interface MainThreadToolRequestMessage {
  type: 'MAIN_THREAD_TOOL_REQUEST';
  /** Unique request ID for response correlation */
  requestId: string;
  /** Workflow ID this request belongs to */
  workflowId: string;
  /** Step ID this request belongs to */
  stepId: string;
  /** MCP tool name */
  toolName: string;
  /** Tool arguments */
  args: Record<string, unknown>;
}

/**
 * Response from main thread tool execution
 */
export interface MainThreadToolResponseMessage {
  type: 'MAIN_THREAD_TOOL_RESPONSE';
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  /** Task ID (for queued operations like generate_image/generate_video) */
  taskId?: string;
  /** Multiple task IDs (for batch operations) */
  taskIds?: string[];
  /** Additional steps to add (for ai_analyze) */
  addSteps?: Array<{
    id: string;
    mcp: string;
    args: Record<string, unknown>;
    description: string;
    status: WorkflowStepStatus;
  }>;
}

/**
 * Workflow recovered after SW restart
 */
export interface WorkflowRecoveredMessage {
  type: 'WORKFLOW_RECOVERED';
  workflowId: string;
  workflow: Workflow;
}

/**
 * New steps added to workflow (from ai_analyze)
 */
export interface WorkflowStepsAddedMessage {
  type: 'WORKFLOW_STEPS_ADDED';
  workflowId: string;
  steps: Array<{
    id: string;
    mcp: string;
    args: Record<string, unknown>;
    description: string;
    status: WorkflowStepStatus;
  }>;
}

/**
 * Union type for workflow-related messages from SW
 */
export type WorkflowSWToMainMessage =
  | WorkflowStatusMessage
  | WorkflowStepStatusMessage
  | WorkflowCompletedMessage
  | WorkflowFailedMessage
  | CanvasOperationRequestMessage
  | MainThreadToolRequestMessage
  | WorkflowStatusResponseMessage
  | WorkflowAllResponseMessage
  | WorkflowRecoveredMessage
  | WorkflowStepsAddedMessage;
