/**
 * Workflow Handler for Service Worker
 *
 * Handles workflow-related messages from main thread.
 * Integrates with WorkflowExecutor for execution.
 * Also handles Chat Workflow messages.
 */

import type {
  Workflow,
  WorkflowMainToSWMessage,
  WorkflowSWToMainMessage,
  CanvasOperationRequestMessage,
  MainThreadToolRequestMessage,
  MainThreadToolResponseMessage,
} from './workflow-types';
import type { GeminiConfig, VideoAPIConfig, SWToMainMessage } from './types';
import { WorkflowExecutor } from './workflow-executor';
import { ChatWorkflowHandler } from './chat-workflow/handler';
import { getTaskQueue } from './queue';
import type {
  ChatWorkflowMainToSWMessage,
  ChatWorkflowSWToMainMessage,
} from './chat-workflow/types';
import { taskQueueStorage } from './storage';
import {
  sendToClient as sendToClientWithLogging,
  broadcastToAllClients,
  sendToClientById,
} from './utils/message-bus';
import { getChannelManager } from './channel-manager';

// Workflow executor instance
let workflowExecutor: WorkflowExecutor | null = null;

// Chat workflow handler instance
let chatWorkflowHandler: ChatWorkflowHandler | null = null;

// Keep latest merged configs for partial updates
let currentGeminiConfig: GeminiConfig | null = null;
let currentVideoConfig: VideoAPIConfig | null = null;

// Reference to SW global scope
let swGlobal: ServiceWorkerGlobalScope | null = null;

/**
 * Initialize workflow handler
 */
export function initWorkflowHandler(
  sw: ServiceWorkerGlobalScope,
  geminiConfig: GeminiConfig,
  videoConfig: VideoAPIConfig
): void {
  swGlobal = sw;
  currentGeminiConfig = geminiConfig;
  currentVideoConfig = videoConfig;

  workflowExecutor = new WorkflowExecutor({
    geminiConfig,
    videoConfig,
  });

  // Link TaskQueue events to WorkflowExecutor
  const taskQueue = getTaskQueue();
  if (taskQueue) {
    taskQueue.setTaskStatusChangeCallback((taskId, status, result, error) => {
      workflowExecutor?.updateWorkflowStepForTask(taskId, status, result, error);
    });
  }

  // Initialize chat workflow handler
  chatWorkflowHandler = new ChatWorkflowHandler({
    geminiConfig,
    videoConfig,
    broadcast: (message) => broadcastToClients(message),
    sendToClient: (clientId, message) => sendToClient(clientId, message),
    requestMainThreadTool: async (clientId, chatId, toolCallId, toolName, args) => {
      // Send request to main thread and wait for response
      const requestId = `chat_tool_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

      return new Promise((resolve, reject) => {
        // Set timeout
        const timeout = setTimeout(() => {
          pendingChatToolRequests.delete(requestId);
          // Remove from IndexedDB on timeout
          taskQueueStorage.deletePendingToolRequest(requestId);
          reject(new Error(`Tool request timed out: ${toolName}`));
        }, 300000); // 5 minutes

        // Store pending request with info for re-sending
        pendingChatToolRequests.set(requestId, {
          resolve: (response) => {
            clearTimeout(timeout);
            // Remove from IndexedDB on resolve
            taskQueueStorage.deletePendingToolRequest(requestId);
            resolve(response);
          },
          reject: (error) => {
            clearTimeout(timeout);
            // Remove from IndexedDB on reject
            taskQueueStorage.deletePendingToolRequest(requestId);
            reject(error);
          },
          requestInfo: {
            requestId,
            chatId,
            toolCallId,
            toolName,
            args,
            clientId,
          },
          timeout,
        });

        // Persist to IndexedDB for recovery after SW restart
        taskQueueStorage.savePendingToolRequest({
          requestId,
          workflowId: chatId, // Use chatId as workflowId for chat workflows
          stepId: toolCallId,
          toolName,
          args,
          createdAt: Date.now(),
          clientId,
        });

        // Send request to specific client only (not broadcast)
        sendToClient(clientId, {
          type: 'MAIN_THREAD_TOOL_REQUEST',
          requestId,
          workflowId: chatId,
          stepId: toolCallId,
          toolName,
          args,
        });
      });
    },
    isClientAvailable: (clientId) => {
      const cm = getChannelManager();
      return cm ? cm.hasClientChannel(clientId) : false;
    },
  });

  // console.log('[WorkflowHandler] Initialized');
}

// Pending chat tool requests
interface PendingChatToolRequest {
  resolve: (response: MainThreadToolResponseMessage) => void;
  reject: (error: Error) => void;
  // Store request info for re-sending on page refresh
  requestInfo: {
    requestId: string;
    chatId: string;
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    clientId: string;
  };
  timeout: ReturnType<typeof setTimeout>;
}
const pendingChatToolRequests = new Map<string, PendingChatToolRequest>();

/**
 * Update workflow handler configuration
 */
export function updateWorkflowConfig(
  geminiConfig?: Partial<GeminiConfig>,
  videoConfig?: Partial<VideoAPIConfig>
): void {
  if (!workflowExecutor) {
    console.warn('[WorkflowHandler] Not initialized');
    return;
  }

  if (geminiConfig) {
    currentGeminiConfig = {
      ...(currentGeminiConfig || ({} as GeminiConfig)),
      ...geminiConfig,
    };
  }

  if (videoConfig) {
    currentVideoConfig = {
      ...(currentVideoConfig || ({} as VideoAPIConfig)),
      ...videoConfig,
    };
  }

  // If we still don't have full configs, skip updating to avoid breaking execution.
  if (!currentGeminiConfig || !currentVideoConfig) {
    return;
  }

  workflowExecutor.updateConfig({
    geminiConfig: currentGeminiConfig,
    videoConfig: currentVideoConfig,
  });

  // Update chat workflow handler config
  if (chatWorkflowHandler) {
    chatWorkflowHandler.updateConfig({
      geminiConfig: currentGeminiConfig,
      videoConfig: currentVideoConfig,
    });
  }
}

/**
 * Check if message is a workflow message
 */
export function isWorkflowMessage(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const msg = data as { type?: string };
  return msg.type?.startsWith('WORKFLOW_') || msg.type?.startsWith('CHAT_WORKFLOW_') || false;
}

/**
 * Handle workflow message from main thread
 */
export function handleWorkflowMessage(
  message: WorkflowMainToSWMessage | ChatWorkflowMainToSWMessage,
  clientId: string
): void {
  // Handle chat workflow messages
  if (message.type.startsWith('CHAT_WORKFLOW_')) {
    handleChatWorkflowMessage(message as ChatWorkflowMainToSWMessage, clientId);
    return;
  }

  if (!workflowExecutor) {
    console.error('[WorkflowHandler] Not initialized, ignoring message:', message.type);
    return;
  }

  const workflowMessage = message as WorkflowMainToSWMessage;

  switch (workflowMessage.type) {
    case 'WORKFLOW_SUBMIT':
      workflowExecutor.submitWorkflow(workflowMessage.workflow);
      break;

    case 'WORKFLOW_CANCEL':
      // console.log('[WorkflowHandler] Processing WORKFLOW_CANCEL:', workflowMessage.workflowId);
      workflowExecutor.cancelWorkflow(workflowMessage.workflowId);
      break;

    case 'WORKFLOW_GET_STATUS': {
      const workflow = workflowExecutor.getWorkflow(workflowMessage.workflowId);
      // Return full workflow data for status query (点对点发送给发起查询的客户端)
      sendToClient(clientId, {
        type: 'WORKFLOW_STATUS_RESPONSE',
        workflowId: workflowMessage.workflowId,
        workflow: workflow || null,
      });
      break;
    }

    case 'WORKFLOW_GET_ALL': {
      const workflows = workflowExecutor.getAllWorkflows();
      // Return all workflows in a single message (点对点发送给发起查询的客户端)
      sendToClient(clientId, {
        type: 'WORKFLOW_ALL_RESPONSE',
        workflows,
      });
      break;
    }
  }
}

/**
 * Handle chat workflow message
 */
function handleChatWorkflowMessage(message: ChatWorkflowMainToSWMessage, clientId: string): void {
  if (!chatWorkflowHandler) {
    console.error('[WorkflowHandler] ✗ Chat workflow handler not initialized');
    return;
  }

  switch (message.type) {
    case 'CHAT_WORKFLOW_START':
      // console.log('[SW-Workflow] ▶ CHAT_WORKFLOW_START received:', {
      //   chatId: message.chatId,
      //   clientId,
      //   stepsCount: message.params.steps?.length,
      //   timestamp: new Date().toISOString(),
      // });
      chatWorkflowHandler.startWorkflow(message.chatId, message.params, clientId);
      break;

    case 'CHAT_WORKFLOW_CANCEL':
      chatWorkflowHandler.cancelWorkflow(message.chatId);
      break;

    case 'CHAT_WORKFLOW_GET_STATUS': {
      const workflow = chatWorkflowHandler.getWorkflow(message.chatId);
      // 点对点发送给发起查询的客户端
      sendToClient(clientId, {
        type: 'CHAT_WORKFLOW_STATUS_RESPONSE',
        chatId: message.chatId,
        workflow: workflow || null,
      });
      break;
    }

    case 'CHAT_WORKFLOW_GET_ALL': {
      const workflows = chatWorkflowHandler.getAllWorkflows();
      // 点对点发送给发起查询的客户端
      sendToClient(clientId, {
        type: 'CHAT_WORKFLOW_ALL_RESPONSE',
        workflows,
      });
      break;
    }
  }
}

/**
 * Handle main thread tool response
 */
export async function handleMainThreadToolResponse(
  response: MainThreadToolResponseMessage
): Promise<void> {
  // Check if this is for a chat workflow tool request
  const pendingChatRequest = pendingChatToolRequests.get(response.requestId);
  if (pendingChatRequest) {
    pendingChatToolRequests.delete(response.requestId);
    pendingChatRequest.resolve(response);
    return;
  }

  // Check if this is an orphaned request (SW restarted)
  // Clean it up from IndexedDB since we received a response
  await taskQueueStorage.deletePendingToolRequest(response.requestId);

  // Otherwise, forward to workflow executor
  if (!workflowExecutor) {
    console.error('[WorkflowHandler] ✗ Not initialized, ignoring tool response');
    return;
  }

  // console.log('[WorkflowHandler] ◀ Main thread tool response:', response.requestId, response.success);
  workflowExecutor.handleMainThreadToolResponse(response);
}

/**
 * Re-send all pending main thread tool requests and send recovered workflows to a new client
 * Called when a new client connects (page refresh) to continue workflow execution and sync state
 * @param clientId The new client that connected (for point-to-point messaging)
 */
export function resendPendingToolRequests(clientId?: string): void {
  // Send all recovered workflows to the new client
  if (workflowExecutor) {
    if (clientId) {
      workflowExecutor.sendRecoveredWorkflowsToClient(clientId);
    }
    workflowExecutor.resendPendingToolRequests();
  }

  if (chatWorkflowHandler && clientId) {
    chatWorkflowHandler.sendRecoveredWorkflowsToClient(clientId);
  }

  if (pendingChatToolRequests.size === 0) {
    return;
  }

  for (const [, pending] of pendingChatToolRequests) {
    const { requestInfo } = pending;

    // Re-send the request to the specific client (or broadcast if client not found)
    sendToClient(requestInfo.clientId, {
      type: 'MAIN_THREAD_TOOL_REQUEST',
      requestId: requestInfo.requestId,
      workflowId: requestInfo.chatId,
      stepId: requestInfo.toolCallId,
      toolName: requestInfo.toolName,
      args: requestInfo.args,
    });
  }
}

/**
 * Broadcast message to all clients (uses unified message sender with logging)
 */
function broadcastToClients(
  message: WorkflowSWToMainMessage | SWToMainMessage | CanvasOperationRequestMessage | MainThreadToolRequestMessage | ChatWorkflowSWToMainMessage
): void {
  broadcastToAllClients(message);
}

/**
 * Send message to a specific client (uses unified message sender with logging)
 */
async function sendToClient(
  clientId: string,
  message: WorkflowSWToMainMessage | SWToMainMessage | CanvasOperationRequestMessage | MainThreadToolRequestMessage | ChatWorkflowSWToMainMessage
): Promise<void> {
  const sent = await sendToClientById(clientId, message);
  if (!sent) {
    // Fallback to broadcast if client not found (e.g., page refreshed)
    broadcastToAllClients(message);
  }
}

/**
 * Get workflow executor instance (for testing/debugging)
 */
export function getWorkflowExecutor(): WorkflowExecutor | null {
  return workflowExecutor;
}

/**
 * Get chat workflow handler instance (for testing/debugging)
 */
export function getChatWorkflowHandler(): ChatWorkflowHandler | null {
  return chatWorkflowHandler;
}
