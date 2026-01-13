/**
 * Service Worker Chat Service
 *
 * Chat service that delegates streaming to Service Worker.
 * Provides the same API as chat-service.ts but uses SW for background processing.
 */

import type { ChatMessage, StreamEvent } from '../types/chat.types';
import { MessageRole } from '../types/chat.types';
import { swTaskQueueClient, type ChatAttachment, type ChatParams } from './sw-client';
import { geminiSettings } from '../utils/settings-manager';
import { analytics } from '../utils/posthog-analytics';

// Track active chat sessions
const activeChatSessions = new Map<string, AbortController>();

// Generate unique chat ID
function generateChatId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Convert File to ChatAttachment (base64 encoded)
 */
async function fileToAttachment(file: File): Promise<ChatAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix to get pure base64
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
 * Send message and get streaming response via Service Worker
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  newContent: string,
  attachments: File[] = [],
  onStream: (event: StreamEvent) => void,
  temporaryModel?: string,
  systemPrompt?: string
): Promise<string> {
  const chatId = generateChatId();
  const abortController = new AbortController();
  activeChatSessions.set(chatId, abortController);

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

    // Track full content for completion
    let fullContent = '';

    // Start chat via SW with promise wrapper
    return new Promise((resolve, reject) => {
      // Handle abort
      abortController.signal.addEventListener('abort', () => {
        swTaskQueueClient.stopChat(chatId);
        reject(new Error('Request cancelled'));
      });

      swTaskQueueClient.startChat(chatId, params, {
        onChunk: (id, content) => {
          if (id !== chatId) return;
          // content 已经是累积的完整内容，直接使用
          fullContent = content;
          onStream({ type: 'content', content });
        },
        onDone: (id, content) => {
          if (id !== chatId) return;
          activeChatSessions.delete(chatId);

          // Track success
          const duration = Date.now() - startTime;
          analytics.trackModelSuccess({
            taskId: chatId,
            taskType: 'chat',
            model: modelName,
            duration,
            resultSize: content.length,
          });

          onStream({ type: 'done' });
          resolve(content);
        },
        onError: (id, error) => {
          if (id !== chatId) return;
          activeChatSessions.delete(chatId);

          // Track failure
          const duration = Date.now() - startTime;
          analytics.trackModelFailure({
            taskId: chatId,
            taskType: 'chat',
            model: modelName,
            duration,
            error,
          });

          onStream({ type: 'error', error });
          reject(new Error(error));
        },
      });
    });
  } catch (error) {
    activeChatSessions.delete(chatId);

    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage === 'Request cancelled') {
      analytics.trackTaskCancellation({
        taskId: chatId,
        taskType: 'chat',
        duration,
      });
      onStream({ type: 'done' });
    } else {
      analytics.trackModelFailure({
        taskId: chatId,
        taskType: 'chat',
        model: modelName,
        duration,
        error: errorMessage,
      });
      onStream({ type: 'error', error: errorMessage });
    }

    throw error;
  }
}

/**
 * Stop current generation
 */
export function stopGeneration(): void {
  // Stop all active sessions
  for (const [chatId, controller] of activeChatSessions) {
    controller.abort();
    swTaskQueueClient.stopChat(chatId);
  }
  activeChatSessions.clear();
}

/**
 * Check if generation is in progress
 */
export function isGenerating(): boolean {
  return activeChatSessions.size > 0;
}

// Export as service object
export const swChatService = {
  sendChatMessage,
  stopGeneration,
  isGenerating,
};
