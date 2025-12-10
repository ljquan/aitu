/**
 * Chat Service
 *
 * Handles AI chat API communication with streaming support using the unified Gemini API client.
 * Supports generic OpenAI-compatible APIs via the client configuration.
 */

import { defaultGeminiClient } from '../utils/gemini-api';
import { prepareImageData } from '../utils/gemini-api/utils';
import type { GeminiMessage } from '../utils/gemini-api/types';
import type { ChatMessage, StreamEvent } from '../types/chat.types';
import { MessageRole } from '../types/chat.types';
import { analytics } from '../utils/posthog-analytics';

// Current abort controller for cancellation
let currentAbortController: AbortController | null = null;

/** Convert ChatMessage to GeminiMessage format */
function convertToGeminiMessages(messages: ChatMessage[]): GeminiMessage[] {
  return messages
    .filter((m) => m.status === 'success' || m.status === 'streaming')
    .map((m) => ({
      role: m.role === MessageRole.USER ? 'user' : 'assistant',
      content: [{ type: 'text', text: m.content }],
    }));
}

/** Send message and get streaming response */
export async function sendChatMessage(
  messages: ChatMessage[],
  newContent: string,
  attachments: File[] = [],
  onStream: (event: StreamEvent) => void
): Promise<string> {
  // Cancel any existing request
  if (currentAbortController) {
    currentAbortController.abort();
  }

  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;
  const taskId = Date.now().toString();
  const startTime = Date.now();

  try {
    // Track chat start
    analytics.trackModelCall({
      taskId,
      taskType: 'chat',
      model: defaultGeminiClient.getConfig().modelName || 'unknown',
      promptLength: newContent.length,
      hasUploadedImage: attachments.length > 0,
      startTime,
    });

    // Build history
    const history = convertToGeminiMessages(messages);

    // Prepare current message content
    const currentMessageContent: GeminiMessage['content'] = [
      { type: 'text', text: newContent }
    ];

    // Process attachments
    if (attachments.length > 0) {
      for (const file of attachments) {
        try {
          // prepareImageData handles file -> base64 conversion
          const imageUrl = await prepareImageData({ file });
          currentMessageContent.push({
            type: 'image_url',
            image_url: { url: imageUrl }
          });
        } catch (e) {
          console.error('Failed to process attachment:', e);
          // Continue without this attachment or throw?
          // Let's log and continue
        }
      }
    }

    // Combine into full message list
    const geminiMessages: GeminiMessage[] = [
      ...history,
      {
        role: 'user',
        content: currentMessageContent
      }
    ];

    let fullContent = '';

    // Call API using unified client
    await defaultGeminiClient.sendChat(
      geminiMessages,
      (chunk) => {
        if (signal.aborted) return;
        fullContent += chunk;
        onStream({ type: 'content', content: chunk });
      },
      signal
    );

    if (signal.aborted) {
      throw new Error('Request cancelled');
    }

    // Track success
    const duration = Date.now() - startTime;
    analytics.trackModelSuccess({
      taskId,
      taskType: 'chat',
      model: defaultGeminiClient.getConfig().modelName || 'unknown',
      duration,
      resultSize: fullContent.length,
    });

    onStream({ type: 'done' });
    currentAbortController = null;
    return fullContent;

  } catch (error: any) {
    currentAbortController = null;
    const duration = Date.now() - startTime;

    if (signal.aborted || error.message === 'Request cancelled' || error.name === 'AbortError') {
      analytics.trackTaskCancellation({
        taskId,
        taskType: 'chat',
        duration,
      });
      onStream({ type: 'done' });
      throw new Error('Request cancelled');
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    analytics.trackModelFailure({
      taskId,
      taskType: 'chat',
      model: defaultGeminiClient.getConfig().modelName || 'unknown',
      duration,
      error: errorMessage,
    });

    onStream({ type: 'error', error: errorMessage });
    throw error;
  }
}

/** Stop current generation */
export function stopGeneration(): void {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}

/** Check if generation is in progress */
export function isGenerating(): boolean {
  return currentAbortController !== null;
}

// Export as service object
export const chatService = {
  sendChatMessage,
  stopGeneration,
  isGenerating,
};