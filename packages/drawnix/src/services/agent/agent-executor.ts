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
      
      // 如果有参考图片，添加补充说明
      if (referenceImages && referenceImages.length > 0) {
        systemPrompt += generateReferenceImagesPrompt(referenceImages.length, 'zh');
      }

      // 构建消息
      const messages: GeminiMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: systemPrompt },
          ],
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: '我明白了，我会根据用户的需求选择合适的工具来生成图片或视频。' },
          ],
        },
      ];

      // 添加用户消息（包含参考图片）
      const userContent: GeminiMessage['content'] = [
        { type: 'text', text: input },
      ];

      // 添加参考图片
      if (referenceImages && referenceImages.length > 0) {
        for (const imageUrl of referenceImages) {
          userContent.push({
            type: 'image_url',
            image_url: { url: imageUrl },
          });
        }
      }

      messages.push({
        role: 'user',
        content: userContent,
      });

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
        for (const toolCall of toolCalls) {
          console.log(`[AgentExecutor] Executing tool: ${toolCall.name}`);
          onToolCall?.(toolCall);

          // 如果有参考图片且工具调用中没有，自动添加
          if (referenceImages && referenceImages.length > 0 && !toolCall.arguments.referenceImages) {
            toolCall.arguments.referenceImages = referenceImages;
          }

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
