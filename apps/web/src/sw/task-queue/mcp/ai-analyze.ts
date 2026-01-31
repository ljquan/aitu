/**
 * AI Analyze Tool for Service Worker
 *
 * This tool calls the text LLM to analyze user requests and generate
 * workflow steps (tool calls) to execute.
 *
 * The systemPrompt and userMessage are passed from the main thread,
 * keeping all prompt logic in the application layer.
 */

import type { SWMCPTool, MCPResult } from '../workflow-types';
import { parseToolCalls, extractTextContent } from '@aitu/utils';

// ============================================================================
// AI Analyze Tool
// ============================================================================

/**
 * AI Analyze tool - calls text LLM to generate workflow steps
 *
 * Accepts pre-built messages from main thread, so prompt generation
 * logic stays in the application layer (no duplication).
 */
export const aiAnalyzeTool: SWMCPTool = {
  name: 'ai_analyze',
  description: 'Analyze user request and generate workflow steps',

  async execute(args, config): Promise<MCPResult> {
    const { geminiConfig, signal } = config;
    const {
      // Pre-built messages from main thread (preferred)
      messages,
      // Legacy: individual fields (for backward compatibility)
      systemPrompt,
      userMessage,
      // Reference images for placeholder replacement
      referenceImages = [],
    } = args as {
      messages?: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string | Array<{ type: string; text?: string }>;
      }>;
      systemPrompt?: string;
      userMessage?: string;
      referenceImages?: string[];
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

    // Check text model configuration
    const textModel = geminiConfig.textModelName;
    if (!textModel) {
      return {
        success: false,
        error: '未配置文本模型 (textModelName)，无法执行 ai_analyze',
        type: 'error',
      };
    }

    try {
      // Call LLM
      const { debugFetch } = await import('../debug-fetch');
      const response = await debugFetch(`${geminiConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${geminiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: textModel,
          messages: chatMessages,
          stream: false,
        }),
        signal,
      }, {
        label: `🧠 AI 分析 (${textModel})`,
        logRequestBody: true,
        logResponseBody: true,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI analyze failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const fullResponse = data.choices?.[0]?.message?.content || '';

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
