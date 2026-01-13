/**
 * Service Worker Chat Workflow Service
 *
 * High-level service for chat workflow via Service Worker.
 * Provides the same API as sw-chat-service.ts but with full workflow support
 * (streaming + tool execution).
 */

import type { ChatMessage } from '../types/chat.types';
import { MessageRole } from '../types/chat.types';
import {
  chatWorkflowClient,
  type ChatParams,
  type ChatAttachment,
  type ChatToolCall,
  type ChatWorkflowEventHandlers,
} from './sw-client';
import { swTaskQueueClient } from './sw-client';
import { geminiSettings } from '../utils/settings-manager';
import { analytics } from '../utils/posthog-analytics';

// Track active chat workflows
const activeChatWorkflows = new Map<string, AbortController>();

// Generate unique chat ID
function generateChatId(): string {
  return `chat_wf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Convert File to ChatAttachment (base64 encoded)
 */
async function fileToAttachment(file: File): Promise<ChatAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      resolve({
        type: file.type.startsWith('image/') ? 'image' : 'file',
        name: file.name,
        mimeType: file.type,
        data: base64,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Convert ChatMessage array to SW format
 */
function convertMessages(messages: ChatMessage[]): import('./sw-client').ChatMessage[] {
  return messages
    .filter((m) => m.status === 'success' || m.status === 'streaming')
    .map((m) => ({
      role: m.role === MessageRole.USER ? 'user' : 'assistant',
      content: m.content,
    }));
}

/**
 * Chat workflow event callbacks
 */
export interface ChatWorkflowCallbacks {
  /** Called when streaming content is received */
  onStream?: (content: string) => void;
  /** Called when tool calls are parsed from response */
  onToolCalls?: (toolCalls: ChatToolCall[], aiAnalysis?: string) => void;
  /** Called when a tool execution starts */
  onToolStart?: (toolCallId: string, toolName: string) => void;
  /** Called when a tool execution completes */
  onToolComplete?: (
    toolCallId: string,
    success: boolean,
    result?: unknown,
    error?: string,
    taskId?: string
  ) => void;
  /** Called when workflow completes */
  onComplete?: (content: string, toolCalls: ChatToolCall[], aiAnalysis?: string) => void;
  /** Called when workflow fails */
  onError?: (error: string) => void;
}

/**
 * Send message and execute full chat workflow via Service Worker
 *
 * This includes:
 * 1. Streaming LLM response
 * 2. Parsing tool calls
 * 3. Executing tools (in SW or delegated to main thread)
 * 4. Returning results
 */
export async function sendChatWorkflow(
  messages: ChatMessage[],
  newContent: string,
  attachments: File[] = [],
  callbacks: ChatWorkflowCallbacks,
  temporaryModel?: string,
  systemPrompt?: string
): Promise<{
  content: string;
  toolCalls: ChatToolCall[];
  aiAnalysis?: string;
}> {
  const chatId = generateChatId();
  const abortController = new AbortController();
  activeChatWorkflows.set(chatId, abortController);

  const startTime = Date.now();
  const settings = geminiSettings.get();
  const modelName = temporaryModel || settings.chatModel || 'unknown';

  try {
    // Track chat start
    analytics.trackModelCall({
      taskId: chatId,
      taskType: 'chat',
      model: modelName,
      promptLength: newContent.length,
      hasUploadedImage: attachments.length > 0,
      startTime,
    });

    // Ensure SW client is initialized
    if (!swTaskQueueClient.isInitialized()) {
      await swTaskQueueClient.initialize(
        {
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl,
          modelName: settings.chatModel,
        },
        {
          baseUrl: 'https://api.tu-zi.com',
        }
      );
    }

    // Convert attachments to base64
    const swAttachments = await Promise.all(attachments.map(fileToAttachment));

    // Prepare chat params
    const params: ChatParams = {
      messages: convertMessages(messages),
      newContent,
      attachments: swAttachments,
      temporaryModel,
      systemPrompt,
    };

    // Start workflow via SW
    return new Promise((resolve, reject) => {
      // Handle abort
      abortController.signal.addEventListener('abort', () => {
        chatWorkflowClient.cancelWorkflow(chatId);
        reject(new Error('Request cancelled'));
      });

      // Create event handlers
      const handlers: ChatWorkflowEventHandlers = {
        onStream: (id, content) => {
          if (id !== chatId) return;
          callbacks.onStream?.(content);
        },
        onToolCalls: (id, toolCalls, aiAnalysis) => {
          if (id !== chatId) return;
          callbacks.onToolCalls?.(toolCalls, aiAnalysis);
        },
        onToolStart: (id, toolCallId, toolName) => {
          if (id !== chatId) return;
          callbacks.onToolStart?.(toolCallId, toolName);
        },
        onToolComplete: (id, toolCallId, success, result, error, taskId) => {
          if (id !== chatId) return;
          callbacks.onToolComplete?.(toolCallId, success, result, error, taskId);
        },
        onComplete: (id, content, toolCalls, aiAnalysis) => {
          if (id !== chatId) return;
          activeChatWorkflows.delete(chatId);

          // Track success
          const duration = Date.now() - startTime;
          analytics.trackModelSuccess({
            taskId: chatId,
            taskType: 'chat',
            model: modelName,
            duration,
            resultSize: content.length,
          });

          callbacks.onComplete?.(content, toolCalls, aiAnalysis);
          resolve({ content, toolCalls, aiAnalysis });
        },
        onError: (id, error) => {
          if (id !== chatId) return;
          activeChatWorkflows.delete(chatId);

          // Track failure
          const duration = Date.now() - startTime;
          analytics.trackModelFailure({
            taskId: chatId,
            taskType: 'chat',
            model: modelName,
            duration,
            error,
          });

          callbacks.onError?.(error);
          reject(new Error(error));
        },
      };

      // Start workflow
      chatWorkflowClient.startWorkflow(chatId, params, handlers);
    });
  } catch (error) {
    activeChatWorkflows.delete(chatId);

    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage === 'Request cancelled') {
      analytics.trackTaskCancellation({
        taskId: chatId,
        taskType: 'chat',
        duration,
      });
    } else {
      analytics.trackModelFailure({
        taskId: chatId,
        taskType: 'chat',
        model: modelName,
        duration,
        error: errorMessage,
      });
    }

    throw error;
  }
}

/**
 * Stop current workflow
 */
export function stopWorkflow(): void {
  for (const [chatId, controller] of activeChatWorkflows) {
    controller.abort();
    chatWorkflowClient.cancelWorkflow(chatId);
  }
  activeChatWorkflows.clear();
}

/**
 * Check if workflow is in progress
 */
export function isWorkflowInProgress(): boolean {
  return activeChatWorkflows.size > 0;
}

// Export as service object
export const swChatWorkflowService = {
  sendChatWorkflow,
  stopWorkflow,
  isWorkflowInProgress,
};
