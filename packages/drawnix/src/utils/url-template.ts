/**
 * URL 模板变量处理工具
 *
 * 支持在 URL 中使用模板变量，如 ${apiKey}
 * 变量会在运行时被替换为实际值
 */

import { geminiSettings } from './settings-manager';

/**
 * 支持的模板变量
 */
export type TemplateVariable = 'apiKey' | 'baseUrl';

/**
 * 模板变量映射表
 */
const VARIABLE_GETTERS: Record<TemplateVariable, () => string> = {
  apiKey: () => geminiSettings.get().apiKey || '',
  baseUrl: () => geminiSettings.get().baseUrl || '',
};

/**
 * 检查 URL 是否包含模板变量
 * @param url URL 字符串
 * @returns 是否包含模板变量
 */
export function hasTemplateVariables(url: string): boolean {
  return /\$\{(\w+)\}/.test(url);
}

/**
 * 提取 URL 中的所有模板变量
 * @param url URL 字符串
 * @returns 变量名列表
 */
export function extractTemplateVariables(url: string): string[] {
  const matches = url.matchAll(/\$\{(\w+)\}/g);
  const variables: string[] = [];
  for (const match of matches) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }
  return variables;
}

/**
 * 检查哪些模板变量的值缺失
 * @param url URL 字符串
 * @returns 缺失值的变量列表
 */
export function getMissingVariables(url: string): string[] {
  const variables = extractTemplateVariables(url);
  const missing: string[] = [];

  for (const variable of variables) {
    const getter = VARIABLE_GETTERS[variable as TemplateVariable];
    if (getter) {
      const value = getter();
      if (!value) {
        missing.push(variable);
      }
    } else {
      // 不支持的变量视为缺失
      missing.push(variable);
    }
  }

  return missing;
}

/**
 * 替换 URL 中的模板变量
 * @param url URL 字符串
 * @returns 替换后的 URL
 */
export function replaceTemplateVariables(url: string): string {
  return url.replace(/\$\{(\w+)\}/g, (match, variableName) => {
    const getter = VARIABLE_GETTERS[variableName as TemplateVariable];
    if (getter) {
      const value = getter();
      return value || match; // 如果值为空，保留原始模板
    }
    return match; // 不支持的变量保留原始模板
  });
}

/**
 * 处理工具 URL，进行模板变量替换
 * @param url 原始 URL
 * @returns { url: 替换后的URL, missingVariables: 缺失的变量列表 }
 */
export function processToolUrl(url: string): {
  url: string;
  missingVariables: string[];
} {
  if (!url || !hasTemplateVariables(url)) {
    return { url, missingVariables: [] };
  }

  const missingVariables = getMissingVariables(url);
  const processedUrl = replaceTemplateVariables(url);

  return {
    url: processedUrl,
    missingVariables,
  };
}

/**
 * 检查是否需要配置 API Key
 * 如果 URL 包含 ${apiKey} 且 API Key 未配置，返回 true
 * @param url URL 字符串
 * @returns 是否需要配置 API Key
 */
export function needsApiKeyConfiguration(url: string): boolean {
  if (!url) return false;
  const missingVariables = getMissingVariables(url);
  return missingVariables.includes('apiKey');
}
