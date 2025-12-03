/**
 * Chat Service
 *
 * Handles AI chat API communication with streaming support.
 * Supports OpenAI-compatible APIs (like 兔子 API).
 */

import { geminiSettings } from '../utils/settings-manager';
import type { ChatMessage, StreamEvent } from '../types/chat.types';
import { MessageRole } from '../types/chat.types';

// Current abort controller for cancellation
let currentAbortController: AbortController | null = null;

/** Convert attachments to base64 for API */
async function prepareAttachments(
  files: File[]
): Promise<{ name: string; type: string; data: string }[]> {
  const result = [];
  for (const file of files) {
    const data = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.readAsDataURL(file);
    });
    result.push({ name: file.name, type: file.type, data });
  }
  return result;
}

/** Build conversation history for OpenAI-compatible API */
function buildOpenAIHistory(
  messages: ChatMessage[]
): { role: string; content: string }[] {
  return messages
    .filter((m) => m.status === 'success' || m.status === 'streaming')
    .map((m) => ({
      role: m.role === MessageRole.USER ? 'user' : 'assistant',
      content: m.content,
    }));
}

/** Send message using OpenAI-compatible API */
async function sendOpenAIMessage(
  settings: any,
  messages: ChatMessage[],
  newContent: string,
  attachments: File[],
  signal: AbortSignal,
  onStream: (event: StreamEvent) => void
): Promise<string> {
  const history = buildOpenAIHistory(messages);

  // Build messages array
  const messagesArray = [
    ...history,
    {
      role: 'user',
      content: newContent,
    },
  ];

  // Add attachments if supported (for vision models)
  if (attachments.length > 0) {
    const preparedAttachments = await prepareAttachments(attachments);
    const lastMessage = messagesArray[messagesArray.length - 1];
    lastMessage.content = [
      { type: 'text', text: newContent },
      ...preparedAttachments.map((att) => ({
        type: 'image_url',
        image_url: {
          url: `data:${att.type};base64,${att.data}`,
        },
      })),
    ] as any;
  }

  const baseUrl = settings.baseUrl || 'https://api.openai.com';
  const model = settings.chatModel || 'gpt-4o-mini';
  const url = `${baseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messagesArray,
      temperature: 0.7,
      max_tokens: 8192,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${errorText}`);
  }

  // Process OpenAI SSE stream
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onStream({ type: 'content', content: delta });
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  return fullContent;
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

  try {
    const settings = geminiSettings.get();
    if (!settings?.apiKey) {
      throw new Error('API key not configured. Please set up in Settings.');
    }

    const fullContent = await sendOpenAIMessage(
      settings,
      messages,
      newContent,
      attachments,
      signal,
      onStream
    );

    onStream({ type: 'done' });
    currentAbortController = null;
    return fullContent;
  } catch (error) {
    currentAbortController = null;

    if (signal.aborted) {
      onStream({ type: 'done' });
      throw new Error('Request cancelled');
    }

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
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
