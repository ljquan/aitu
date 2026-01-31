/**
 * AI Analyze Tool for Service Worker
 *
 * This tool calls the text LLM to analyze user requests and generate
 * workflow steps (tool calls) to execute.
 *
 * The systemPrompt and userMessage are passed from the main thread,
 * keeping all prompt logic in the application layer.
 * 
 * Supports streaming mode for better UX and intermediate state persistence.
 */

import type { SWMCPTool, MCPResult } from '../workflow-types';
import { parseToolCalls, extractTextContent } from '@aitu/utils';

// ============================================================================
// SSE Stream Parser
// ============================================================================

/**
 * Parse SSE stream and accumulate content
 */
async function parseSSEStream(
  response: Response,
  signal?: AbortSignal,
  onChunk?: (content: string, accumulated: string) => void
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) {
        reader.cancel();
        throw new Error('Request aborted');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      // Process complete SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              accumulated += content;
              onChunk?.(content, accumulated);
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return accumulated;
}

// ============================================================================
// AI Analyze Tool
// ============================================================================

/**
 * AI Analyze tool - calls text LLM to generate workflow steps
 *
 * Accepts pre-built messages from main thread, so prompt generation
 * logic stays in the application layer (no duplication).
 * 
 * Uses streaming for better responsiveness and intermediate state tracking.
 */
export const aiAnalyzeTool: SWMCPTool = {
  name: 'ai_analyze',
  description: 'Analyze user request and generate workflow steps',

  async execute(args, config): Promise<MCPResult> {
    const { geminiConfig, signal, onProgress } = config;
    const {
      // Pre-built messages from main thread (preferred)
      messages,
      // Legacy: individual fields (for backward compatibility)
      systemPrompt,
      userMessage,
      // Reference images for placeholder replacement
      referenceImages = [],
      // Option to disable streaming (for testing)
      useStream = true,
      // User-selected text model (priority over system config)
      textModel: userSelectedModel,
    } = args as {
      messages?: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string | Array<{ type: string; text?: string }>;
      }>;
      systemPrompt?: string;
      userMessage?: string;
      referenceImages?: string[];
      useStream?: boolean;
      textModel?: string;
    };

    // Build messages array
    let chatMessages: Array<{
      role: string;
      content: string | Array<{ type: string; text?: string }>;
    }>;

    if (messages && messages.length > 0) {
      // Use pre-built messages from main thread
      chatMessages = messages;
    } else if (systemPrompt && userMessage) {
      // Legacy: build from individual fields
      chatMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ];
    } else {
      return {
        success: false,
        error: '缺少必填参数：需要 messages 或 (systemPrompt + userMessage)',
        type: 'error',
      };
    }

    // Use user-selected model first, fallback to system config
    const textModel = userSelectedModel || geminiConfig.textModelName;
    if (!textModel) {
      return {
        success: false,
        error: '未配置文本模型 (textModelName)，无法执行 ai_analyze',
        type: 'error',
      };
    }

    try {
      // Call LLM with logging
      const { debugFetch } = await import('../debug-fetch');
      const { startLLMApiLog, completeLLMApiLog, failLLMApiLog } = await import('../llm-api-logger');
      
      const startTime = Date.now();
      const requestBody = {
        model: textModel,
        messages: chatMessages,
        stream: useStream,
      };
      
      // Extract prompt preview from user message
      const lastUserMsg = chatMessages.filter(m => m.role === 'user').pop();
      const promptPreview = typeof lastUserMsg?.content === 'string' 
        ? lastUserMsg.content 
        : (lastUserMsg?.content?.find((c: { type: string; text?: string }) => c.type === 'text') as { text?: string })?.text || '';
      
      // Start LLM API log
      const logId = startLLMApiLog({
        endpoint: '/chat/completions',
        model: textModel,
        taskType: 'chat',
        prompt: promptPreview,
        requestBody: JSON.stringify(requestBody, null, 2),
      });
      
      const response = await debugFetch(`${geminiConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${geminiConfig.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal,
      }, {
        label: `🧠 AI 分析 (${textModel})`,
        logRequestBody: true,
        logResponseBody: !useStream, // Only log response body for non-streaming
      });

      if (!response.ok) {
        const errorText = await response.text();
        failLLMApiLog(logId, {
          httpStatus: response.status,
          duration: Date.now() - startTime,
          errorMessage: errorText,
        });
        throw new Error(`AI analyze failed: ${response.status} - ${errorText}`);
      }

      let fullResponse: string;

      if (useStream) {
        // Streaming mode: parse SSE and accumulate content
        fullResponse = await parseSSEStream(response, signal, (chunk, accumulated) => {
          // Notify progress (for UI updates and intermediate state saving)
          onProgress?.({
            type: 'streaming',
            chunk,
            accumulated,
            timestamp: Date.now(),
          });
        });
      } else {
        // Non-streaming mode: parse JSON response
        const data = await response.json();
        fullResponse = data.choices?.[0]?.message?.content || '';
      }
      
      // Complete LLM API log
      // 流式响应完成后，构造一个类似非流式的响应体用于调试显示
      const responseBodyForLog = useStream ? JSON.stringify({
        choices: [{ message: { content: fullResponse } }],
        _note: 'Reconstructed from streaming response',
      }, null, 2) : undefined;
      
      completeLLMApiLog(logId, {
        httpStatus: response.status,
        duration: Date.now() - startTime,
        resultType: 'text',
        resultCount: 1,
        resultText: fullResponse,
        responseBody: responseBodyForLog,
      });

      // Parse tool calls from response
      const toolCalls = parseToolCalls(fullResponse);
      const textContent = extractTextContent(fullResponse);

      // Convert tool calls to addSteps format
      const addSteps = toolCalls.map((tc, index) => {
        // Replace image placeholders with actual URLs
        let processedArgs = { ...tc.arguments };
        if (referenceImages.length > 0 && processedArgs.referenceImages) {
          const refs = processedArgs.referenceImages as string[];
          processedArgs.referenceImages = refs.map(placeholder => {
            const match = placeholder.match(/\[图片(\d+)\]/);
            if (match) {
              const idx = parseInt(match[1], 10) - 1;
              return referenceImages[idx] || placeholder;
            }
            return placeholder;
          });
        }

        return {
          id: `ai-step-${Date.now()}-${index}`,
          mcp: tc.name,
          args: processedArgs,
          description: textContent || `执行 ${tc.name}`,
          status: 'pending' as const,
        };
      });

      return {
        success: true,
        type: 'text',
        data: {
          content: textContent,
          toolCallCount: toolCalls.length,
          responseLength: fullResponse.length,
        },
        addSteps,
      };
    } catch (error: any) {
      console.error('[SW:aiAnalyze] ✗ Error:', error.message);
      return {
        success: false,
        error: error.message || 'AI 分析失败',
        type: 'error',
      };
    }
  },
};
