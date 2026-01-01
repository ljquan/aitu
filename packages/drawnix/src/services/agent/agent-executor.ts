/**
 * Agent 执行器
 *
 * 协调 LLM 调用和 MCP 工具执行的核心服务
 */

import { defaultGeminiClient } from '../../utils/gemini-api';
import type { GeminiMessage } from '../../utils/gemini-api/types';
import type { AgentResult, AgentExecuteOptions, ToolCall, AgentExecutionContext } from '../../mcp/types';
import { generateSystemPrompt, generateReferenceImagesPrompt } from './system-prompts';
import { parseToolCalls, extractTextContent } from './tool-parser';
import { geminiSettings } from '../../utils/settings-manager';

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
 * 构建结构化的用户消息
 * 使用 Markdown 格式清晰展示所有上下文信息
 */
function buildStructuredUserMessage(context: AgentExecutionContext): string {
  const parts: string[] = [];

  // 1. 模型和参数信息
  parts.push('## 生成配置');
  parts.push('');
  const modelStatus = context.model.isExplicit ? '(用户指定)' : '(默认)';
  parts.push(`- **模型**: ${context.model.id} ${modelStatus}`);
  parts.push(`- **类型**: ${context.model.type === 'image' ? '图片生成' : '视频生成'}`);
  parts.push(`- **数量**: ${context.params.count}`);
  if (context.params.size) {
    parts.push(`- **尺寸**: ${context.params.size}`);
  }
  if (context.params.duration) {
    parts.push(`- **时长**: ${context.params.duration}秒`);
  }
  parts.push('');

  // 2. 选中的文本元素（作为生成 prompt 的主要来源）
  if (context.selection.texts.length > 0) {
    parts.push('## 选中的文本内容（作为生成提示词）');
    parts.push('');
    parts.push('```');
    parts.push(context.selection.texts.join('\n'));
    parts.push('```');
    parts.push('');
  }

  // 3. 用户输入的指令（额外要求）
  if (context.userInstruction) {
    parts.push('## 用户指令');
    parts.push('');
    parts.push(context.userInstruction);
    parts.push('');
  }

  // 4. 参考素材
  const hasImages = context.selection.images.length > 0 || context.selection.graphics.length > 0;
  const hasVideos = context.selection.videos.length > 0;

  if (hasImages || hasVideos) {
    parts.push('## 参考素材（已把url替换为占位符，严格返回即可）');
    parts.push('');

    // 图片（包括图形转换的图片）
    if (hasImages) {
      const allImages = [...context.selection.images, ...context.selection.graphics];
      const placeholders = allImages.map((_, i) => `[图片${i + 1}]`).join('、');
      parts.push(`- **参考图片**: ${placeholders}`);
    }

    // 视频
    if (hasVideos) {
      const placeholders = context.selection.videos.map((_, i) => `[视频${i + 1}]`).join('、');
      parts.push(`- **参考视频**: ${placeholders}`);
    }
    parts.push('');
  }

  // 5. 最终 prompt（如果没有用户指令和选中文本，则显示默认 prompt）
  if (!context.userInstruction && context.selection.texts.length === 0 && context.finalPrompt) {
    parts.push('## 生成提示词');
    parts.push('');
    parts.push(context.finalPrompt);
    parts.push('');
  }

  return parts.join('\n');
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
   * @param context 完整的执行上下文
   * @param options 执行选项
   */
  async execute(context: AgentExecutionContext, options: AgentExecuteOptions = {}): Promise<AgentResult> {
    const {
      model,
      onChunk,
      onToolCall,
      signal,
      maxIterations = 3,
    } = options;

    try {
      console.log('[AgentExecutor] Starting execution with context:', context.userInstruction.substring(0, 100));

      // 收集所有参考图片 URL
      const allReferenceImages = [...context.selection.images, ...context.selection.graphics];

      // 生成系统提示词（自动从 registry 获取工具描述）
      let systemPrompt = generateSystemPrompt();

      // 如果有参考图片，添加补充说明（使用占位符方式）
      if (allReferenceImages.length > 0) {
        systemPrompt += generateReferenceImagesPrompt(allReferenceImages.length);
      }

      // 构建结构化用户消息
      const userMessage = buildStructuredUserMessage(context);
      console.log('[AgentExecutor] Structured user message:\n', userMessage);

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
      let finalResponse = '';

      // 获取全局设置的文本模型
      const globalSettings = geminiSettings.get();
      const textModel = globalSettings.textModelName;
      console.log('[AgentExecutor] Using text model from global settings:', textModel);

      while (iterations < maxIterations) {
        iterations++;
        console.log(`[AgentExecutor] Iteration ${iterations}/${maxIterations}`);

        // 调用 LLM，使用全局设置的文本模型
        let fullResponse = '';
        const response = await defaultGeminiClient.sendChat(
          messages,
          (chunk) => {
            fullResponse += chunk;
            onChunk?.(chunk);
          },
          signal,
          textModel // 使用全局设置的文本模型
        );

        // 获取完整响应
        if (response.choices && response.choices.length > 0) {
          fullResponse = response.choices[0].message.content || fullResponse;
        }

        console.log('[AgentExecutor] LLM response:', fullResponse.substring(0, 200));

        // 解析工具调用
        const toolCalls = parseToolCalls(fullResponse);

        // 提取文本内容
        finalResponse = extractTextContent(fullResponse) || fullResponse;

        if (toolCalls.length === 0) {
          // 没有工具调用，返回文本响应
          break;
        }

        // 报告工具调用（不执行，由调用方执行）
        // 这样 AIInputBar 可以在 UI 中显示步骤并统一管理执行
        for (const rawToolCall of toolCalls) {
          // 替换占位符为真实图片 URL
          const toolCall = allReferenceImages.length > 0
            ? replaceToolCallPlaceholders(rawToolCall, allReferenceImages)
            : rawToolCall;

          console.log(`[AgentExecutor] Reporting tool call: ${toolCall.name}`, toolCall.arguments);
          onToolCall?.(toolCall);
        }

        // 工具调用已报告，返回成功
        // 实际执行由调用方（AIInputBar）在接收到 onAddSteps 后处理
        return {
          success: true,
          response: finalResponse,
          toolResults: [], // 工具尚未执行，没有结果
          model,
        };
      }

      return {
        success: true,
        response: finalResponse,
        toolResults: [],
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
}

// 导出单例实例
export const agentExecutor = AgentExecutor.getInstance();

// 导出类型
export { AgentExecutor };
