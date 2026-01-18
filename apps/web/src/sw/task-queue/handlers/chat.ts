/**
 * Chat Streaming Handler for Service Worker
 *
 * Handles chat requests with streaming response support.
 * Supports both streaming mode (for real-time UI) and task mode (for persistence).
 */

import type {
  ChatParams,
  GeminiConfig,
  ChatHandler as IChatHandler,
  TaskHandler,
  SWTask,
  HandlerConfig,
  TaskResult,
} from '../types';

/**
 * Gemini message format
 */
interface GeminiMessage {
  role: 'user' | 'assistant' | 'system';
  content: Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
  }>;
}

/**
 * Chat streaming handler
 * Implements both ChatHandler (for streaming) and TaskHandler (for task queue)
 */
export class ChatHandler implements IChatHandler, TaskHandler {
  private abortControllers: Map<string, AbortController> = new Map();

  /**
   * Execute chat as a task (TaskHandler interface)
   * Used for task queue persistence and recovery
   */
  async execute(task: SWTask, config: HandlerConfig): Promise<TaskResult> {
    const params = task.params as unknown as ChatParams;

    // Create abort controller for this task
    const abortController = new AbortController();
    this.abortControllers.set(task.id, abortController);

    try {
      // Convert messages to Gemini format
      const geminiMessages = this.convertToGeminiMessages(params);

      // Make streaming request and collect full response
      const fullContent = await this.streamChat(
        geminiMessages,
        config.geminiConfig,
        params.temporaryModel,
        params.systemPrompt,
        abortController.signal,
        // No chunk callback for task mode - we just collect the full response
        undefined
      );

      // Return result with chat response
      return {
        url: '', // Chat doesn't produce a URL
        format: 'text',
        size: fullContent.length,
        chatResponse: fullContent,
        toolCalls: [], // TODO: Parse tool calls from response if needed
      };
    } finally {
      this.abortControllers.delete(task.id);
    }
  }

  /**
   * Cancel a task (TaskHandler interface)
   */
  cancel(taskId: string): void {
    this.stop(taskId);
  }

  /**
   * Start streaming chat (ChatHandler interface)
   * Used for real-time streaming to UI
   */
  async stream(
    chatId: string,
    params: ChatParams,
    config: GeminiConfig,
    onChunk: (content: string) => void
  ): Promise<string> {
    const abortController = new AbortController();
    this.abortControllers.set(chatId, abortController);

    try {
      // Convert messages to Gemini format
      const geminiMessages = this.convertToGeminiMessages(params);

      // Make streaming request
      const fullContent = await this.streamChat(
        geminiMessages,
        config,
        params.temporaryModel,
        params.systemPrompt,
        abortController.signal,
        onChunk
      );

      return fullContent;
    } finally {
      this.abortControllers.delete(chatId);
    }
  }

  /**
   * Stop streaming
   */
  stop(chatId: string): void {
    const controller = this.abortControllers.get(chatId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(chatId);
    }
  }

  /**
   * Convert chat params to Gemini message format
   */
  private convertToGeminiMessages(params: ChatParams): GeminiMessage[] {
    const messages: GeminiMessage[] = [];

    // Add system prompt if provided
    if (params.systemPrompt) {
      messages.push({
        role: 'system',
        content: [{ type: 'text', text: params.systemPrompt }],
      });
    }

    // Add history messages
    for (const msg of params.messages) {
      const content: GeminiMessage['content'] = [];

      // Add text content
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }

      // Add attachments
      if (msg.attachments) {
        for (const attachment of msg.attachments) {
          if (attachment.type === 'image') {
            content.push({
              type: 'image_url',
              image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` },
            });
          }
        }
      }

      messages.push({
        role: msg.role,
        content,
      });
    }

    // Add new message
    if (params.newContent || params.attachments?.length) {
      const content: GeminiMessage['content'] = [];

      if (params.newContent) {
        content.push({ type: 'text', text: params.newContent });
      }

      if (params.attachments) {
        for (const attachment of params.attachments) {
          if (attachment.type === 'image') {
            content.push({
              type: 'image_url',
              image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` },
            });
          }
        }
      }

      messages.push({
        role: 'user',
        content,
      });
    }

    return messages;
  }

  /**
   * Make streaming chat request
   */
  private async streamChat(
    messages: GeminiMessage[],
    config: GeminiConfig,
    temporaryModel?: string,
    systemPrompt?: string,
    signal?: AbortSignal,
    onChunk?: (content: string) => void
  ): Promise<string> {
    const model = temporaryModel || config.modelName || 'gemini-2.5-flash';

    const requestBody = {
      model,
      messages,
      stream: true,
    };

    // Import loggers
    const { debugFetch } = await import('../debug-fetch');
    const { startLLMApiLog, completeLLMApiLog, failLLMApiLog } = await import('../llm-api-logger');
    
    const startTime = Date.now();
    // 获取最后一条用户消息作为 prompt 预览
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    const promptPreview = lastUserMsg?.content?.[0]?.text || '';
    
    const logId = startLLMApiLog({
      endpoint: '/chat/completions',
      model,
      taskType: 'chat',
      prompt: promptPreview,
      requestBody: JSON.stringify(requestBody, null, 2),  // 完整请求体，不截断
    });

    // Use debugFetch for logging (stream response won't be fully captured)
    const response = await debugFetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    }, {
      label: `💬 对话请求 (${model})`,
      logRequestBody: true,
      isStreaming: true,
    });

    if (!response.ok) {
      const errorText = await response.text();
      failLLMApiLog(logId, {
        httpStatus: response.status,
        duration: Date.now() - startTime,
        errorMessage: errorText,
      });
      throw new Error(`Chat request failed: ${response.status} - ${errorText}`);
    }
    
    // 标记开始时间用于完成时计算
    const chatStartTime = startTime;
    const chatLogId = logId;

    if (!response.body) {
      throw new Error('No response body');
    }

    // Read stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();

            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;

              if (content) {
                fullContent += content;
                // 返回累积的所有数据，而不是只返回新增的 chunk
                onChunk?.(fullContent);
              }
            } catch {
              // Ignore parse errors for incomplete JSON
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6).trim();
        if (data && data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              // 返回累积的所有数据，而不是只返回新增的 chunk
              onChunk?.(fullContent);
            }
          } catch {
            // Ignore
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Update debug log with final streaming content
    if ((response as any).__debugLogId && fullContent) {
      const { updateLogResponseBody } = await import('../debug-fetch');
      updateLogResponseBody((response as any).__debugLogId, fullContent);
    }

    // 完成 LLM API 日志
    const { completeLLMApiLog: completeLog } = await import('../llm-api-logger');
    completeLog(chatLogId, {
      httpStatus: response.status,
      duration: Date.now() - chatStartTime,
      resultType: 'text',
      resultCount: 1,
      resultText: fullContent,
    });

    return fullContent;
  }
}
