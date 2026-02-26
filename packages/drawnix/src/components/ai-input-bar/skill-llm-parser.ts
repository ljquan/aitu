/**
 * Skill 工作流 DSL 大模型兜底解析器
 *
 * 当正则解析器（SkillDSLParser）无法解析 Skill 笔记内容时，
 * 调用大模型将自由文本描述解析为结构化的工作流步骤列表。
 *
 * 参考设计：
 * - OpenAI Assistants Tool Use：工具名 + 参数 JSON 的标准化描述
 * - Claude MCP：工具调用的自然语言描述与结构化参数结合
 */

import type { WorkflowStep } from './workflow-converter';
import type { SkillDSLVariables, SkillParseResult } from './skill-dsl.types';
import { defaultGeminiClient } from '../../utils/gemini-api';
import { geminiSettings } from '../../utils/settings-manager';
import { mcpRegistry } from '../../mcp/registry';
import { cleanLLMResponse } from '../../services/agent/tool-parser';

/**
 * LLM 解析超时时间（毫秒）
 */
const LLM_PARSE_TIMEOUT_MS = 15000;

/**
 * 构建 LLM 解析的 System Prompt
 */
function buildSystemPrompt(): string {
  // 获取可用工具列表
  const tools = mcpRegistry.getAllTools();
  const toolsDesc = tools.length > 0
    ? tools.map(tool => {
        const params = tool.inputSchema.properties || {};
        const required = tool.inputSchema.required || [];
        const paramLines = Object.entries(params).map(([name, schema]) => {
          const isRequired = required.includes(name);
          return `    - ${name}（${isRequired ? '必填' : '可选'}，${schema.type}）: ${schema.description || ''}`;
        }).join('\n');
        return `- **${tool.name}**: ${tool.description}\n  参数：\n${paramLines || '    无参数'}`;
      }).join('\n\n')
    : '（暂无已注册工具）';

  return `你是一个工作流解析助手。根据用户输入和 Skill 笔记内容，解析并输出结构化的工作流步骤列表（JSON 格式）。

## 可用的 MCP 工具

${toolsDesc}

## 输出格式要求

请严格按照以下 JSON 格式输出，不要包含任何其他内容：

\`\`\`json
{
  "steps": [
    {
      "mcp": "工具名称",
      "args": {
        "参数名": "参数値"
      },
      "description": "步骤描述"
    }
  ]
}
\`\`\`

## 注意事项

1. 只使用上面列出的可用 MCP 工具
2. 用户输入是主题/内容，应填入工具的主要文本参数（theme / prompt 等）
3. Skill 笔记中的固定参数（如 rows: 3）直接使用，数字类型不加引号
4. 如果 Skill 笔记描述了多个步骤，请按顺序列出所有步骤
5. 如果无法确定应该调用哪个工具，请返回空的 steps 数组`;}

/**
 * 验证解析出的步骤格式是否合法
 */
function validateSteps(steps: unknown[]): steps is Array<{ mcp: string; args: Record<string, unknown>; description?: string }> {
  return steps.every(step =>
    typeof step === 'object' &&
    step !== null &&
    typeof (step as any).mcp === 'string' &&
    (step as any).mcp.length > 0 &&
    typeof (step as any).args === 'object' &&
    (step as any).args !== null
  );
}

/**
 * Skill 工作流 DSL 大模型兜底解析器
 */
export class SkillLLMParser {
  /**
   * 使用大模型将 Skill 笔记内容解析为工作流步骤列表
   *
   * @param content - Skill 笔记内容（自由文本）
   * @param variables - 运行时变量（用于替换占位符）
   * @param workflowIdPrefix - 工作流 ID 前缀（用于生成步骤 ID）
   * @returns 解析结果，若解析失败则返回 null
   */
  static async parse(
    content: string,
    variables: SkillDSLVariables,
    workflowIdPrefix: string = 'skill'
  ): Promise<SkillParseResult | null> {
    if (!content || !content.trim()) {
      return null;
    }

    try {
      const globalSettings = geminiSettings.get();
      const textModel = globalSettings.textModelName;

      const systemPrompt = buildSystemPrompt();
      // 构建用户消息：用户输入 + Skill 笔记全文，让大模型自行理解并填充参数
      const userInputText = variables.input ? `用户输入：${variables.input}` : '';
      const userMessage = [
        userInputText,
        `Skill 笔记内容：`,
        `---`,
        content,
        `---`,
        `请根据以上信息解析并输出工作流 JSON，不要有任何额外说明。`,
      ].filter(Boolean).join('\n\n');

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userMessage },
      ];

      // 带超时的 LLM 调用
      let fullResponse = '';
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM 解析超时')), LLM_PARSE_TIMEOUT_MS)
      );

      const chatPromise = defaultGeminiClient.sendChat(
        messages as any,
        (accumulatedContent) => {
          fullResponse = accumulatedContent;
        },
        undefined,
        textModel
      );

      const response = await Promise.race([chatPromise, timeoutPromise]);

      // 获取完整响应
      if (response.choices && response.choices.length > 0) {
        fullResponse = response.choices[0].message.content || fullResponse;
      }

      if (!fullResponse) {
        return null;
      }

      // 清理 LLM 响应（去除 markdown 代码块等）
      const cleaned = cleanLLMResponse(fullResponse);

      // 尝试解析 JSON
      let parsed: unknown;
      try {
        // 先尝试直接解析
        parsed = JSON.parse(cleaned);
      } catch {
        // 尝试提取 JSON 块
        const jsonMatch = cleaned.match(/\{[\s\S]*"steps"[\s\S]*\}/);
        if (!jsonMatch) {
          console.warn('[SkillLLMParser] 无法从 LLM 响应中提取 JSON');
          return null;
        }
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          console.warn('[SkillLLMParser] JSON 解析失败');
          return null;
        }
      }

      // 验证格式
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !Array.isArray((parsed as any).steps)
      ) {
        console.warn('[SkillLLMParser] 响应格式不符合预期');
        return null;
      }

      const rawSteps = (parsed as any).steps as unknown[];

      if (rawSteps.length === 0) {
        return null;
      }

      if (!validateSteps(rawSteps)) {
        console.warn('[SkillLLMParser] 步骤格式验证失败');
        return null;
      }

      // 转换为 WorkflowStep[]
      const steps: WorkflowStep[] = rawSteps.map((rawStep, index) => ({
        id: `${workflowIdPrefix}-step-${index + 1}`,
        mcp: rawStep.mcp,
        args: rawStep.args,
        options: {
          mode: 'async',
        },
        description: rawStep.description || `执行 ${rawStep.mcp}`,
        status: 'pending',
      }));

      return {
        steps,
        parseMethod: 'llm',
      };
    } catch (error) {
      console.warn('[SkillLLMParser] 解析失败:', error);
      return null;
    }
  }
}
