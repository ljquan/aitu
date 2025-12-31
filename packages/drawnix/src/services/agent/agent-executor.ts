/**
 * Agent 执行器
 *
 * 协调 LLM 调用和 MCP 工具执行的核心服务
 */

import { defaultGeminiClient } from '../../utils/gemini-api';
import type { GeminiMessage } from '../../utils/gemini-api/types';
import { mcpRegistry } from '../../mcp/registry';
import type { AgentResult, AgentExecuteOptions, MCPResult, ToolCall } from '../../mcp/types';
import { generateSystemPrompt, generateReferenceImagesPrompt } from './system-prompts';
import { parseToolCalls, extractTextContent } from './tool-parser';

/**
 * 生成图片占位符
 * 格式: [图片1], [图片2], ...
 * 用于在发送给文本大模型时替代真实图片 URL，节省 token
 */
function generateImagePlaceholder(index: number): string {
  return `[图片${index}]`;
}

/**
 * 将占位符替换为真实图片 URL
 */
function replacePlaceholdersWithUrls(
  text: string,
  imageUrls: string[]
): string {
  let result = text;

  // 替换中文占位符 [图片1], [图片2], ...
  // 每次调用创建新的正则实例，避免 global flag 状态问题
  result = result.replace(/\[图片(\d+)\]/g, (match, indexStr) => {
    const index = parseInt(indexStr, 10) - 1; // 占位符从 1 开始，数组从 0 开始
    if (index >= 0 && index < imageUrls.length) {
      return imageUrls[index];
    }
    return match; // 保持原样
  });

  // 替换英文占位符 [Image 1], [Image 2], ...
  result = result.replace(/\[Image\s*(\d+)\]/gi, (match, indexStr) => {
    const index = parseInt(indexStr, 10) - 1;
    if (index >= 0 && index < imageUrls.length) {
      return imageUrls[index];
    }
    return match;
  });

  return result;
}

/**
 * 替换工具调用参数中的占位符
 */
function replaceToolCallPlaceholders(
  toolCall: ToolCall,
  imageUrls: string[]
): ToolCall {
  const newArgs: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(toolCall.arguments)) {
    if (key === 'referenceImages' && Array.isArray(value)) {
      // referenceImages 数组，将占位符替换为真实 URL
      const replacedUrls = value
        .map(item => {
          if (typeof item === 'string') {
            // 检查是否是占位符格式
            const zhMatch = item.match(/^\[图片(\d+)\]$/);
            const enMatch = item.match(/^\[Image\s*(\d+)\]$/i);
            const match = zhMatch || enMatch;
            if (match) {
              const index = parseInt(match[1], 10) - 1;
              if (index >= 0 && index < imageUrls.length) {
                return imageUrls[index];
              }
            }
            // 不是占位符，可能已经是 URL
            return item;
          }
          return item;
        })
        .filter(Boolean);
      newArgs[key] = replacedUrls.length > 0 ? replacedUrls : imageUrls;
    } else if (typeof value === 'string') {
      // 字符串参数，替换占位符
      newArgs[key] = replacePlaceholdersWithUrls(value, imageUrls);
    } else if (Array.isArray(value)) {
      // 其他数组参数，递归替换
      newArgs[key] = value.map(item =>
        typeof item === 'string' ? replacePlaceholdersWithUrls(item, imageUrls) : item
      );
    } else {
      newArgs[key] = value;
    }
  }

  // 如果参数中没有 referenceImages 但有图片 URL，自动添加
  if (!newArgs.referenceImages && imageUrls.length > 0) {
    newArgs.referenceImages = imageUrls;
  }

  return {
    ...toolCall,
    arguments: newArgs,
  };
}

/**
 * Agent 执行器类
 */
class AgentExecutor {
  private static instance: AgentExecutor;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): AgentExecutor {
    if (!AgentExecutor.instance) {
      AgentExecutor.instance = new AgentExecutor();
    }
    return AgentExecutor.instance;
  }

  /**
   * 执行 Agent 请求
   * 
   * @param input 用户输入
   * @param options 执行选项
   */
  async execute(input: string, options: AgentExecuteOptions = {}): Promise<AgentResult> {
    const {
      model,
      onChunk,
      onToolCall,
      onToolResult,
      signal,
      maxIterations = 3,
      referenceImages,
    } = options;

    try {
      console.log('[AgentExecutor] Starting execution with input:', input.substring(0, 100));

      // 生成系统提示词
      const toolsDescription = mcpRegistry.generateToolsDescription();
      let systemPrompt = generateSystemPrompt(toolsDescription, 'zh');

      // 如果有参考图片，添加补充说明（使用占位符方式）
      if (referenceImages && referenceImages.length > 0) {
        systemPrompt += generateReferenceImagesPrompt(referenceImages.length, 'zh');
      }

      // 构建用户消息
      // 使用占位符代替真实图片 URL，节省 token
      let userMessage = input;
      if (referenceImages && referenceImages.length > 0) {
        // 在用户消息中添加图片占位符说明
        const placeholders = referenceImages.map((_, i) => generateImagePlaceholder(i + 1)).join('、');
        userMessage = `${input}\n\n[参考图片: ${placeholders}]`;
      }

      // 构建消息（不传递实际图片给文本大模型）
      const messages: GeminiMessage[] = [
        {
          role: 'system',
          content: [
            { type: 'text', text: systemPrompt },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: userMessage },
          ],
        },
      ];

      // 执行循环
      let iterations = 0;
      const toolResults: MCPResult[] = [];
      let finalResponse = '';

      while (iterations < maxIterations) {
        iterations++;
        console.log(`[AgentExecutor] Iteration ${iterations}/${maxIterations}`);

        // 调用 LLM
        let fullResponse = '';
        const response = await defaultGeminiClient.sendChat(
          messages,
          (chunk) => {
            fullResponse += chunk;
            onChunk?.(chunk);
          },
          signal
        );

        // 获取完整响应
        if (response.choices && response.choices.length > 0) {
          fullResponse = response.choices[0].message.content || fullResponse;
        }

        console.log('[AgentExecutor] LLM response:', fullResponse.substring(0, 200));

        // 解析工具调用
        const toolCalls = parseToolCalls(fullResponse);
        
        if (toolCalls.length === 0) {
          // 没有工具调用，返回文本响应
          finalResponse = extractTextContent(fullResponse) || fullResponse;
          break;
        }

        // 执行工具调用
        for (const rawToolCall of toolCalls) {
          // 替换占位符为真实图片 URL
          const toolCall = referenceImages && referenceImages.length > 0
            ? replaceToolCallPlaceholders(rawToolCall, referenceImages)
            : rawToolCall;

          console.log(`[AgentExecutor] Executing tool: ${toolCall.name}`, toolCall.arguments);
          onToolCall?.(toolCall);

          const result = await mcpRegistry.executeTool(toolCall);
          toolResults.push(result);
          onToolResult?.(result);

          // 如果工具执行成功，直接返回结果
          if (result.success) {
            finalResponse = this.formatToolResult(result);
            return {
              success: true,
              response: finalResponse,
              toolResults,
              model,
            };
          }

          // 工具执行失败，将错误添加到对话历史，让 LLM 重试或给出解释
          messages.push({
            role: 'assistant',
            content: [{ type: 'text', text: fullResponse }],
          });
          messages.push({
            role: 'user',
            content: [{ 
              type: 'text', 
              text: `工具执行失败：${result.error}。请尝试其他方式或解释原因。` 
            }],
          });
        }
      }

      return {
        success: toolResults.some(r => r.success),
        response: finalResponse,
        toolResults,
        model,
      };
    } catch (error: any) {
      console.error('[AgentExecutor] Execution failed:', error);
      return {
        success: false,
        error: error.message || 'Agent 执行失败',
        model,
      };
    }
  }

  /**
   * 格式化工具结果为用户友好的文本
   */
  private formatToolResult(result: MCPResult): string {
    if (!result.success) {
      return `生成失败：${result.error}`;
    }

    const data = result.data as any;
    
    if (result.type === 'image') {
      return `图片已生成！\n\n提示词：${data.prompt}\n尺寸：${data.size}`;
    }
    
    if (result.type === 'video') {
      return `视频已生成！\n\n提示词：${data.prompt}\n模型：${data.model}\n时长：${data.seconds}秒`;
    }

    return '生成完成！';
  }
}

// 导出单例实例
export const agentExecutor = AgentExecutor.getInstance();

// 导出类型
export { AgentExecutor };
