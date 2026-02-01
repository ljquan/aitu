/**
 * Service Worker Chat Service
 *
 * Chat service that delegates streaming to Service Worker.
 * Provides the same API as chat-service.ts but uses SW for background processing.
 */

import type { ChatMessage, StreamEvent } from '../types/chat.types';
import { MessageRole } from '../types/chat.types';
import { swChannelClient, ChatAttachment, ChatStartParams, ChatMessage as SWChatMessage } from './sw-channel';
import { geminiSettings, settingsManager } from '../utils/settings-manager';
import { analytics } from '../utils/posthog-analytics';

// Track active chat sessions
const activeChatSessions = new Map<string, {
  controller: AbortController;
  onStream: (event: StreamEvent) => void;
  resolve: (content: string) => void;
  reject: (error: Error) => void;
  fullContent: string;
  startTime: number;
  modelName: string;
}>();

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
function convertMessages(messages: ChatMessage[]): SWChatMessage[] {
  return messages
    .filter((m) => m.status === 'success' || m.status === 'streaming')
    .map((m) => ({
      role: m.role === MessageRole.USER ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));
}

/**
 * Initialize chat event handlers
 */
let handlersInitialized = false;
function ensureChatEventHandlers(): void {
  if (handlersInitialized) return;
  handlersInitialized = true;

  swChannelClient.setEventHandlers({
    onChatChunk: (event) => {
      const session = activeChatSessions.get(event.chatId);
      if (!session) return;
      
      session.fullContent = event.content;
      session.onStream({ type: 'content', content: event.content });
    },
    onChatDone: (event) => {
      const session = activeChatSessions.get(event.chatId);
      if (!session) return;

      activeChatSessions.delete(event.chatId);

      const duration = Date.now() - session.startTime;
      analytics.trackModelSuccess({
        taskId: event.chatId,
        taskType: 'chat',
        model: session.modelName,
        duration,
        resultSize: event.fullContent.length,
      });

      session.onStream({ type: 'done' });
      session.resolve(event.fullContent);
    },
    onChatError: (event) => {
      const session = activeChatSessions.get(event.chatId);
      if (!session) return;

      activeChatSessions.delete(event.chatId);

      const duration = Date.now() - session.startTime;
      analytics.trackModelFailure({
        taskId: event.chatId,
        taskType: 'chat',
        model: session.modelName,
        duration,
        error: event.error,
      });

      session.onStream({ type: 'error', error: event.error });
      session.reject(new Error(event.error));
    },
  });
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
    if (!swChannelClient.isInitialized()) {
      await settingsManager.waitForInitialization();
      await swChannelClient.initialize();
      await swChannelClient.init({
        geminiConfig: {
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl,
          modelName: settings.chatModel,
        },
        videoConfig: {
          baseUrl: 'https://api.tu-zi.com',
        },
      });
    }

    // Ensure event handlers are set up
    ensureChatEventHandlers();

    // Convert attachments to base64
    const swAttachments = await Promise.all(attachments.map(fileToAttachment));

    // Prepare chat params
    const params: ChatStartParams = {
      chatId,
      messages: convertMessages(messages),
      newContent,
      attachments: swAttachments,
      temporaryModel,
      systemPrompt,
    };

    // Start chat via SW with promise wrapper
    return new Promise((resolve, reject) => {
      // Register session
      activeChatSessions.set(chatId, {
        controller: abortController,
        onStream,
        resolve,
        reject,
        fullContent: '',
        startTime,
        modelName,
      });

      // Handle abort
      abortController.signal.addEventListener('abort', () => {
        swChannelClient.stopChat(chatId);
        activeChatSessions.delete(chatId);
        reject(new Error('Request cancelled'));
      });

      // Start the chat
      swChannelClient.startChat(params).catch((err) => {
        activeChatSessions.delete(chatId);
        reject(err);
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
  for (const [chatId, session] of activeChatSessions) {
    session.controller.abort();
    swChannelClient.stopChat(chatId);
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
