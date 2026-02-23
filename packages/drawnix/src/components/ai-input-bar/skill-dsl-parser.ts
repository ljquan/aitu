/**
 * Skill 工作流 DSL 正则解析器
 *
 * 通过正则表达式将符合 DSL 规范的 Skill 笔记内容解析为 WorkflowStep[]。
 * 无需调用大模型，执行快速确定。
 *
 * DSL 语法示例：
 * ```
 * 调用 generate_inspiration_board
 * - imageCount: 9
 * - imageSize: 16x9
 * ```
 *
 * 用户输入会自动注入到工具的主要文本参数（theme / prompt）中，
 * 无需在笔记中写 {{input}} 占位符。
 *
 * 参考设计：
 * - n8n 节点参数风格（key: value）
 * - LangChain 工具链式调用（多个调用块顺序执行）
 */

import type { WorkflowStep } from './workflow-converter';
import type { SkillDSLVariables, SkillParseResult } from './skill-dsl.types';

/**
 * 工具调用声明行正则
 * 匹配：`调用 <工具名>` 或 `CALL <tool_name>`（不区分大小写）
 */
const TOOL_CALL_REGEX = /^(调用|CALL)\s+(\S+)/im;

/**
 * 参数行正则
 * 匹配：`- <参数名>: <参数值>`
 */
const PARAM_LINE_REGEX = /^-\s*([\w]+)\s*:\s*(.+)/;

/**
 * 纯数字字符串正则
 * 用于自动将数字字符串转换为 number 类型
 */
const NUMERIC_STRING_REGEX = /^\d+(\.\d+)?$/;

/**
 * 注释行正则
 * 匹配以 `#` 或 `//` 开头的行
 */
const COMMENT_LINE_REGEX = /^\s*(#|\/\/)/;

/**
 * Skill 工作流 DSL 正则解析器
 */
export class SkillDSLParser {
  /**
   * 将 Skill 笔记内容解析为工作流步骤列表
   *
   * @param content - Skill 笔记内容（Markdown 格式）
   * @param variables - 运行时变量（用于替换 {{变量名}} 占位符）
   * @param workflowIdPrefix - 工作流 ID 前缀（用于生成步骤 ID）
   * @returns 解析结果，若内容不符合 DSL 规范则返回 null
   */
  static parse(
    content: string,
    variables: SkillDSLVariables,
    workflowIdPrefix: string = 'skill',
    userInput?: string
  ): SkillParseResult | null {
    if (!content || !content.trim()) {
      return null;
    }

    const lines = content.split('\n');
    const steps: WorkflowStep[] = [];
    let currentStep: WorkflowStep | null = null;
    let stepIndex = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();

      // 跳过空行
      if (!line) {
        continue;
      }

      // 跳过注释行
      if (COMMENT_LINE_REGEX.test(line)) {
        continue;
      }

      // 检测工具调用声明行
      const toolCallMatch = line.match(TOOL_CALL_REGEX);
      if (toolCallMatch) {
        // 保存上一个步骤
        if (currentStep) {
          steps.push(currentStep);
        }

        stepIndex++;
        // 去掉 Milkdown 对下划线等特殊字符的反斜杠转义（如 generate\_grid\_image → generate_grid_image）
        const toolName = toolCallMatch[2].replace(/\\(.)/g, '$1');

        currentStep = {
          id: `${workflowIdPrefix}-step-${stepIndex}`,
          mcp: toolName,
          args: {},
          options: {
            mode: 'async',
          },
          description: `执行 ${toolName}`,
          status: 'pending',
        };
        continue;
      }

      // 检测参数行（必须在工具调用声明行之后）
      if (currentStep) {
        const paramMatch = line.match(PARAM_LINE_REGEX);
        if (paramMatch) {
          const paramName = paramMatch[1].trim();
          // 去掉 Milkdown 对特殊字符的反斜杠转义（如 \_ → _）
          const rawValue = paramMatch[2].trim().replace(/\\(.)/g, '$1');

          // 自动转换数字类型
          const finalValue = NUMERIC_STRING_REGEX.test(rawValue)
            ? Number(rawValue)
            : rawValue;

          currentStep.args[paramName] = finalValue;
        }
        // 格式错误的参数行：跳过，不抛异常（容错设计）
      }
    }

    // 保存最后一个步骤
    if (currentStep) {
      steps.push(currentStep);
    }

    // 没有找到任何工具调用声明行，返回 null
    if (steps.length === 0) {
      return null;
    }

    // 自动注入用户输入：如果步骤中没有 theme / prompt 等主要文本参数，
    // 将用户输入注入到第一个缺失的主要文本参数中
    const input = userInput || variables.input;
    if (input) {
      for (const step of steps) {
        SkillDSLParser.injectUserInput(step, String(input));
      }
    }

    return {
      steps,
      parseMethod: 'regex',
    };
  }

  /**
   * 将用户输入自动注入到步骤的主要文本参数中
   *
   * 主要文本参数优先级：theme > prompt > query > text > content
   * 如果这些参数都不存在，则注入到第一个字符串类型的参数中
   *
   * @param step - 工作流步骤
   * @param userInput - 用户输入文本
   */
  static injectUserInput(step: import('./workflow-converter').WorkflowStep, userInput: string): void {
    const PRIMARY_TEXT_PARAMS = ['theme', 'prompt', 'query', 'text', 'content'];

    // 检查是否已有主要文本参数
    for (const paramName of PRIMARY_TEXT_PARAMS) {
      if (paramName in step.args) {
        // 已有该参数，不覆盖
        return;
      }
    }

    // 没有主要文本参数，注入用户输入到第一个主要文本参数位置
    // 优先使用 theme（最常见的主要文本参数）
    step.args['theme'] = userInput;
  }

  /**
   * 检测内容是否符合 DSL 规范（快速检测，不做完整解析）
   *
   * @param content - Skill 笔记内容
   * @returns 是否包含工具调用声明行
   */
  static isDSLContent(content: string): boolean {
    if (!content || !content.trim()) {
      return false;
    }
    const lines = content.split('\n');
    return lines.some(line => TOOL_CALL_REGEX.test(line.trim()));
  }
}
