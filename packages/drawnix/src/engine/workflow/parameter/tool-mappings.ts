/**
 * 常用工具间的硬编码映射规则配置
 */

import type { ToolMappingConfig, MappingRule } from './types';

// 通用映射规则模板
const GENERIC_TO_CONTENT: MappingRule = {
  source: '$',
  target: 'content',
  type: 'any',
  transform: 'toString',
};

const GENERIC_TO_TEXT: MappingRule = {
  source: '$',
  target: 'text',
  type: 'any',
  transform: 'toString',
};

const GENERIC_TO_PROMPT: MappingRule = {
  source: '$',
  target: 'prompt',
  type: 'any',
  transform: 'toString',
};

const RESULT_TO_CONTENT: MappingRule = {
  source: 'result',
  target: 'content',
  type: 'string',
  transform: 'toString',
};

const CONTENT_PASSTHROUGH: MappingRule = {
  source: 'content',
  target: 'content',
  type: 'string',
};

const TEXT_TO_CONTENT: MappingRule = {
  source: 'text',
  target: 'content',
  type: 'string',
};

/**
 * 预定义的工具映射配置
 */
export const DEFAULT_TOOL_MAPPINGS: ToolMappingConfig = {
  // AI 生成 -> 显示结果
  'ai_generate->show_result': [GENERIC_TO_CONTENT],

  // 抓取 -> 显示结果
  'fetch->show_result': [CONTENT_PASSTHROUGH, TEXT_TO_CONTENT, GENERIC_TO_CONTENT],

  // 格式化 -> 显示结果
  'format_markdown->show_result': [RESULT_TO_CONTENT, GENERIC_TO_CONTENT],
};

/**
 * 通用映射规则集合
 */
export const COMMON_MAPPINGS = {
  GENERIC_TO_CONTENT,
  GENERIC_TO_TEXT,
  GENERIC_TO_PROMPT,
  RESULT_TO_CONTENT,
  CONTENT_PASSTHROUGH,
  TEXT_TO_CONTENT,
} as const;

export function getToolMapping(
  sourceToolId: string,
  targetToolId: string
): MappingRule[] | undefined {
  const key = `${sourceToolId}->${targetToolId}`;
  return DEFAULT_TOOL_MAPPINGS[key];
}

export function hasToolMapping(
  sourceToolId: string,
  targetToolId: string
): boolean {
  const key = `${sourceToolId}->${targetToolId}`;
  return key in DEFAULT_TOOL_MAPPINGS;
}

export function getRegisteredToolPairs(): string[] {
  return Object.keys(DEFAULT_TOOL_MAPPINGS);
}

export function createMappingRule(
  source: string,
  target: string,
  options: Partial<Omit<MappingRule, 'source' | 'target'>> = {}
): MappingRule {
  return { source, target, ...options };
}

export function createContentMapping(targetParam: string = 'content'): MappingRule[] {
  return [
    {
      source: '$',
      target: targetParam,
      type: 'any',
      transform: 'toString',
    },
  ];
}

export function mergeToolMappings(...configs: ToolMappingConfig[]): ToolMappingConfig {
  const merged: ToolMappingConfig = {};
  
  for (const config of configs) {
    for (const [key, rules] of Object.entries(config)) {
      if (merged[key]) {
        merged[key] = [...merged[key], ...rules];
      } else {
        merged[key] = rules;
      }
    }
  }
  
  return merged;
}
