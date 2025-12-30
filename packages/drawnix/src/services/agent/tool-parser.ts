/**
 * 工具调用解析器
 * 
 * 从 LLM 响应中解析工具调用
 */

import type { ToolCall } from '../../mcp/types';

/**
 * 从 LLM 响应中解析工具调用
 * 
 * 支持多种格式：
 * 1. ```tool_call\n{...}\n``` 格式
 * 2. ```json\n{"name": "...", "arguments": {...}}\n``` 格式
 * 3. <tool_call>{...}</tool_call> 格式
 */
export function parseToolCalls(response: string): ToolCall[] {
  const toolCalls: ToolCall[] = [];

  // 格式 1: ```tool_call\n{...}\n```
  const toolCallBlockRegex = /```tool_call\s*\n?([\s\S]*?)\n?```/gi;
  let match;
  
  while ((match = toolCallBlockRegex.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.name) {
        toolCalls.push({
          name: parsed.name,
          arguments: parsed.arguments || {},
          id: `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        });
      }
    } catch (e) {
      console.warn('[ToolParser] Failed to parse tool_call block:', e);
    }
  }

  // 如果格式 1 没有找到，尝试格式 2: ```json\n{...}\n```
  if (toolCalls.length === 0) {
    const jsonBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/gi;
    
    while ((match = jsonBlockRegex.exec(response)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        // 检查是否是工具调用格式
        if (parsed.name && (parsed.arguments !== undefined || parsed.params !== undefined)) {
          toolCalls.push({
            name: parsed.name,
            arguments: parsed.arguments || parsed.params || {},
            id: `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          });
        }
      } catch (e) {
        // 不是有效的 JSON，跳过
      }
    }
  }

  // 格式 3: <tool_call>{...}</tool_call>
  if (toolCalls.length === 0) {
    const xmlTagRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
    
    while ((match = xmlTagRegex.exec(response)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed.name) {
          toolCalls.push({
            name: parsed.name,
            arguments: parsed.arguments || {},
            id: `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          });
        }
      } catch (e) {
        console.warn('[ToolParser] Failed to parse tool_call tag:', e);
      }
    }
  }

  return toolCalls;
}

/**
 * 从响应中提取纯文本内容（移除工具调用部分）
 */
export function extractTextContent(response: string): string {
  let text = response;

  // 移除 ```tool_call...``` 块
  text = text.replace(/```tool_call\s*\n?[\s\S]*?\n?```/gi, '');
  
  // 移除 <tool_call>...</tool_call> 标签
  text = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
  
  // 移除包含工具调用的 JSON 块
  text = text.replace(/```(?:json)?\s*\n?\s*\{\s*"name"\s*:[\s\S]*?\n?```/gi, '');

  // 清理多余的空行
  text = text.replace(/\n{3,}/g, '\n\n');
  
  return text.trim();
}

/**
 * 检查响应是否包含工具调用
 */
export function hasToolCall(response: string): boolean {
  return parseToolCalls(response).length > 0;
}

/**
 * 修复可能损坏的 JSON
 */
export function healJson(jsonStr: string): string {
  let healed = jsonStr.trim();

  // 移除可能的前缀文本
  const jsonStart = healed.indexOf('{');
  if (jsonStart > 0) {
    healed = healed.substring(jsonStart);
  }

  // 移除可能的后缀文本
  const jsonEnd = healed.lastIndexOf('}');
  if (jsonEnd < healed.length - 1 && jsonEnd > 0) {
    healed = healed.substring(0, jsonEnd + 1);
  }

  // 尝试修复常见问题
  // 1. 单引号替换为双引号
  healed = healed.replace(/'/g, '"');
  
  // 2. 移除尾部逗号
  healed = healed.replace(/,\s*}/g, '}');
  healed = healed.replace(/,\s*]/g, ']');

  return healed;
}
