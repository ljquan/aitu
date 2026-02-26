/**
 * Skill 工作流 DSL 类型定义
 *
 * 定义 DSL 解析所需的变量接口、解析结果接口等类型
 */

import type { WorkflowStep } from './workflow-converter';

/**
 * DSL 变量接口
 *
 * 运行时可用的内置变量，对应 {{变量名}} 占位符
 */
export interface SkillDSLVariables {
  /** 用户在 AI 输入框中输入的文本（必须支持） */
  input: string;
  /** 生成数量（来自 metadata.count，默认 1） */
  count?: number;
  /** 尺寸参数（来自 metadata.size，如 '16x9'） */
  size?: string;
  /** 当前选中的模型名称 */
  model?: string;
  /** 允许扩展其他自定义变量 */
  [key: string]: string | number | undefined;
}

/**
 * DSL 解析方式
 *
 * - `regex`：通过正则表达式解析，快速确定，无需 LLM
 * - `llm`：通过大模型解析，适用于自由文本 Skill
 * - `agent_fallback`：降级为 Agent 工作流（注入 Skill 内容作为系统提示词）
 */
export type SkillParseMethod = 'regex' | 'llm' | 'agent_fallback';

/**
 * DSL 解析结果
 */
export interface SkillParseResult {
  /** 解析出的工作流步骤列表 */
  steps: WorkflowStep[];
  /** 解析方式标记，用于调试和监控 */
  parseMethod: SkillParseMethod;
}
