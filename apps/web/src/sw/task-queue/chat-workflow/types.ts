/**
 * Chat Workflow Types for Service Worker
 *
 * Defines types for chat workflow execution in SW.
 * A chat workflow includes:
 * 1. Streaming LLM response
 * 2. Parsing tool calls from response
 * 3. Executing tools (in SW or delegated to main thread)
 * 4. Returning results
 */

import type { ChatParams } from '../types';

// ============================================================================
// Chat Workflow Definition
// ============================================================================

/**
 * Tool call parsed from LLM response
 */
export interface ChatToolCall {
  /** Unique tool call ID */
  id: string;
  /** MCP tool name */
  name: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Tool execution status */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Tool result */
  result?: {
    success: boolean;
    data?: unknown;
    error?: string;
    taskId?: string;
  };
}

/**
 * Chat workflow status
 * 
 * State transitions:
 * - pending → streaming → parsing → executing_tools → completed
 * - executing_tools → awaiting_client (when main thread tool needs client but none available)
 * - awaiting_client → executing_tools (when client reconnects)
 * - Any state → failed/cancelled
 */
export type ChatWorkflowStatus =
  | 'pending'
  | 'streaming'
  | 'parsing'
  | 'executing_tools'
  | 'awaiting_client'  // Waiting for client to reconnect for DOM operations
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Chat workflow state
 */
export interface ChatWorkflow {
  /** Unique workflow ID (same as chatId) */
  id: string;
  /** Workflow status */
  status: ChatWorkflowStatus;
  /** Chat parameters */
  params: ChatParams;
  /** Streaming content (accumulated) */
  content: string;
  /** AI analysis text (extracted from JSON response) */
  aiAnalysis?: string;
  /** Parsed tool calls */
  toolCalls: ChatToolCall[];
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Completion timestamp */
  completedAt?: number;
  /** Error message */
  error?: string;
}

// ============================================================================
// Main Thread → Service Worker Messages
// ============================================================================

/**
 * Start a chat workflow
 */
export interface ChatWorkflowStartMessage {
  type: 'CHAT_WORKFLOW_START';
  /** Unique chat workflow ID */
  chatId: string;
  /** Chat parameters */
  params: ChatParams;
}

/**
 * Cancel a chat workflow
 */
export interface ChatWorkflowCancelMessage {
  type: 'CHAT_WORKFLOW_CANCEL';
  chatId: string;
}

/**
 * Get chat workflow status
 */
export interface ChatWorkflowGetStatusMessage {
  type: 'CHAT_WORKFLOW_GET_STATUS';
  chatId: string;
}

/**
 * Get all active chat workflows (for page refresh recovery)
 */
export interface ChatWorkflowGetAllMessage {
  type: 'CHAT_WORKFLOW_GET_ALL';
}

/**
 * Union type for chat workflow messages from main thread
 */
export type ChatWorkflowMainToSWMessage =
  | ChatWorkflowStartMessage
  | ChatWorkflowCancelMessage
  | ChatWorkflowGetStatusMessage
  | ChatWorkflowGetAllMessage;

// ============================================================================
// Service Worker → Main Thread Messages
// ============================================================================

/**
 * Chat workflow streaming content update
 */
export interface ChatWorkflowStreamMessage {
  type: 'CHAT_WORKFLOW_STREAM';
  chatId: string;
  /** Accumulated content */
  content: string;
}

/**
 * Chat workflow status update
 */
export interface ChatWorkflowStatusMessage {
  type: 'CHAT_WORKFLOW_STATUS';
  chatId: string;
  status: ChatWorkflowStatus;
  updatedAt: number;
}

/**
 * Chat workflow tool calls parsed
 */
export interface ChatWorkflowToolCallsMessage {
  type: 'CHAT_WORKFLOW_TOOL_CALLS';
  chatId: string;
  /** AI analysis text */
  aiAnalysis?: string;
  /** Parsed tool calls */
  toolCalls: ChatToolCall[];
}

/**
 * Chat workflow tool execution started
 */
export interface ChatWorkflowToolStartMessage {
  type: 'CHAT_WORKFLOW_TOOL_START';
  chatId: string;
  toolCallId: string;
  toolName: string;
}

/**
 * Chat workflow tool execution completed
 */
export interface ChatWorkflowToolCompleteMessage {
  type: 'CHAT_WORKFLOW_TOOL_COMPLETE';
  chatId: string;
  toolCallId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  taskId?: string;
}

/**
 * Chat workflow completed
 */
export interface ChatWorkflowCompleteMessage {
  type: 'CHAT_WORKFLOW_COMPLETE';
  chatId: string;
  /** Final content */
  content: string;
  /** AI analysis text */
  aiAnalysis?: string;
  /** All tool calls with results */
  toolCalls: ChatToolCall[];
}

/**
 * Chat workflow failed
 */
export interface ChatWorkflowFailedMessage {
  type: 'CHAT_WORKFLOW_FAILED';
  chatId: string;
  error: string;
}

/**
 * Chat workflow status response
 */
export interface ChatWorkflowStatusResponseMessage {
  type: 'CHAT_WORKFLOW_STATUS_RESPONSE';
  chatId: string;
  workflow: ChatWorkflow | null;
}

/**
 * All active chat workflows response (for page refresh recovery)
 */
export interface ChatWorkflowAllResponseMessage {
  type: 'CHAT_WORKFLOW_ALL_RESPONSE';
  workflows: ChatWorkflow[];
}

/**
 * Chat workflow recovered after SW restart
 */
export interface ChatWorkflowRecoveredMessage {
  type: 'CHAT_WORKFLOW_RECOVERED';
  chatId: string;
  workflow: ChatWorkflow;
}

/**
 * Union type for chat workflow messages from SW
 */
export type ChatWorkflowSWToMainMessage =
  | ChatWorkflowStreamMessage
  | ChatWorkflowStatusMessage
  | ChatWorkflowToolCallsMessage
  | ChatWorkflowToolStartMessage
  | ChatWorkflowToolCompleteMessage
  | ChatWorkflowCompleteMessage
  | ChatWorkflowFailedMessage
  | ChatWorkflowStatusResponseMessage
  | ChatWorkflowAllResponseMessage
  | ChatWorkflowRecoveredMessage;
