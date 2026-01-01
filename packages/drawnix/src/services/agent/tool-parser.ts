/**
 * 工具调用解析器
 *
 * 从 LLM 响应中解析工具调用
 */

import type { ToolCall } from '../../mcp/types';

/**
 * 工作流 JSON 响应格式
 */
export interface WorkflowJsonResponse {
  content: string;
  next: Array<{
    mcp: string;
    args: Record<string, unknown>;
  }>;
}

/**
 * 尝试解析 JSON 字符串，失败时尝试修复
 */
function tryParseJson(jsonStr: string): Record<string, unknown> | null {
  const trimmed = jsonStr.trim();

  // 首先直接尝试解析
  try {
    return JSON.parse(trimmed);
  } catch {
    // 尝试修复后再解析
    try {
      return JSON.parse(healJson(trimmed));
    } catch {
      return null;
    }
  }
}

/**
 * 解析新格式的工作流 JSON 响应
 * 格式: {"content": "...", "next": [{"mcp": "tool_name", "args": {...}}]}
 */
export function parseWorkflowJson(response: string): WorkflowJsonResponse | null {
  // 先尝试直接解析整个响应
  let parsed = tryParseJson(response);

  // 如果直接解析失败，尝试从响应中提取 JSON
  if (!parsed) {
    // 移除可能的代码块标记
    let cleaned = response.replace(/```(?:json)?\s*\n?/gi, '').replace(/\n?```/gi, '');
    parsed = tryParseJson(cleaned);
  }

  // 如果还是失败，尝试从文本中找到 JSON 对象
  if (!parsed) {
    const jsonMatch = response.match(/\{[\s\S]*"content"[\s\S]*"next"[\s\S]*\}/);
    if (jsonMatch) {
      parsed = tryParseJson(jsonMatch[0]);
    }
  }

  if (!parsed) {
    console.warn('[ToolParser] Failed to parse workflow JSON from response');
    return null;
  }

  // 验证格式
  if (typeof parsed.content !== 'string') {
    console.warn('[ToolParser] Invalid workflow JSON: missing or invalid content field');
    return null;
  }

  // next 可以不存在或为空数组
  const next = Array.isArray(parsed.next) ? parsed.next : [];

  // 验证 next 数组中的每个项
  const validNext = next.filter((item: any) => {
    return typeof item === 'object' &&
           item !== null &&
           typeof item.mcp === 'string' &&
           typeof item.args === 'object';
  }).map((item: any) => ({
    mcp: item.mcp,
    args: item.args as Record<string, unknown>,
  }));

  return {
    content: parsed.content as string,
    next: validNext,
  };
}

/**
 * 从工作流 JSON 响应中提取工具调用
 */
export function extractToolCallsFromWorkflowJson(workflowJson: WorkflowJsonResponse): ToolCall[] {
  return workflowJson.next.map((item, index) => ({
    name: item.mcp,
    arguments: item.args,
    id: `tc_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
  }));
}

/**
 * 从 LLM 响应中解析工具调用
 *
 * 支持多种格式：
 * 1. 新格式: {"content": "...", "next": [{"mcp": "...", "args": {...}}]}
 * 2. ```tool_call\n{...}\n``` 格式
 * 3. ```json\n{"name": "...", "arguments": {...}}\n``` 格式
 * 4. <tool_call>{...}</tool_call> 格式
 */
export function parseToolCalls(response: string): ToolCall[] {
  // 首先尝试新的工作流 JSON 格式
  const workflowJson = parseWorkflowJson(response);
  if (workflowJson && workflowJson.next.length > 0) {
    console.log('[ToolParser] Parsed workflow JSON format');
    return extractToolCallsFromWorkflowJson(workflowJson);
  }

  // 回退到旧格式解析
  const toolCalls: ToolCall[] = [];

  /**
   * 从解析结果创建 ToolCall（旧格式）
   */
  const createToolCall = (parsed: Record<string, unknown>): ToolCall | null => {
    if (!parsed.name || typeof parsed.name !== 'string') {
      return null;
    }

    // 支持 arguments、params、parameters 等多种命名
    const args = parsed.arguments || parsed.params || parsed.parameters || {};

    return {
      name: parsed.name,
      arguments: typeof args === 'object' && args !== null ? args as Record<string, unknown> : {},
      id: `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  };

  // 格式 1: ```tool_call\n{...}\n```
  const toolCallBlockRegex = /```tool_call\s*\n?([\s\S]*?)\n?```/gi;
  let match;

  while ((match = toolCallBlockRegex.exec(response)) !== null) {
    const parsed = tryParseJson(match[1]);
    if (parsed) {
      const toolCall = createToolCall(parsed);
      if (toolCall) {
        toolCalls.push(toolCall);
      }
    } else {
      console.warn('[ToolParser] Failed to parse tool_call block:', match[1].substring(0, 100));
    }
  }

  // 如果格式 1 没有找到，尝试格式 2: ```json\n{...}\n```
  if (toolCalls.length === 0) {
    const jsonBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/gi;

    while ((match = jsonBlockRegex.exec(response)) !== null) {
      const parsed = tryParseJson(match[1]);
      if (parsed) {
        const toolCall = createToolCall(parsed);
        if (toolCall) {
          toolCalls.push(toolCall);
        }
      }
    }
  }

  // 格式 3: <tool_call>{...}</tool_call>
  if (toolCalls.length === 0) {
    const xmlTagRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;

    while ((match = xmlTagRegex.exec(response)) !== null) {
      const parsed = tryParseJson(match[1]);
      if (parsed) {
        const toolCall = createToolCall(parsed);
        if (toolCall) {
          toolCalls.push(toolCall);
        }
      } else {
        console.warn('[ToolParser] Failed to parse tool_call tag:', match[1].substring(0, 100));
      }
    }
  }

  // 格式 4: 直接在文本中的 JSON（无代码块包裹，旧格式）
  if (toolCalls.length === 0) {
    // 匹配看起来像工具调用的 JSON 对象
    const directJsonRegex = /\{[\s\S]*?"name"\s*:\s*"(?:generate_image|generate_video|generate_photo_wall)"[\s\S]*?\}/g;

    while ((match = directJsonRegex.exec(response)) !== null) {
      const parsed = tryParseJson(match[0]);
      if (parsed) {
        const toolCall = createToolCall(parsed);
        if (toolCall) {
          toolCalls.push(toolCall);
          break; // 只取第一个匹配
        }
      }
    }
  }

  return toolCalls;
}

/**
 * 从响应中提取纯文本内容
 * 优先从新格式的 content 字段提取，否则移除工具调用部分
 */
export function extractTextContent(response: string): string {
  // 首先尝试从新格式中提取 content
  const workflowJson = parseWorkflowJson(response);
  if (workflowJson) {
    return workflowJson.content;
  }

  // 回退到旧格式处理
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

  // 移除可能的前缀文本（找到第一个 { ）
  const jsonStart = healed.indexOf('{');
  if (jsonStart > 0) {
    healed = healed.substring(jsonStart);
  }

  // 移除可能的后缀文本（找到最后一个 } ）
  const jsonEnd = healed.lastIndexOf('}');
  if (jsonEnd < healed.length - 1 && jsonEnd > 0) {
    healed = healed.substring(0, jsonEnd + 1);
  }

  // 修复常见问题

  // 1. 处理未转义的换行符（在字符串值中）
  // 这个需要在单引号替换之前处理
  healed = healed.replace(/:\s*"([^"]*)\n([^"]*)"/g, (match, p1, p2) => {
    return `: "${p1}\\n${p2}"`;
  });

  // 2. 单引号替换为双引号（但要小心字符串内容中的单引号）
  // 先保护 prompt 等字符串内容中的单引号
  healed = healed.replace(/'([^']*?)'/g, (match, content) => {
    // 如果内容像是属性值（没有 : ），替换为双引号
    if (!content.includes(':') || content.length > 50) {
      return `"${content}"`;
    }
    return match;
  });

  // 3. 修复属性名没有引号的情况
  healed = healed.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');

  // 4. 移除尾部逗号
  healed = healed.replace(/,(\s*[}\]])/g, '$1');

  // 5. 修复多余的逗号
  healed = healed.replace(/,\s*,/g, ',');

  // 6. 移除 JavaScript 风格的注释
  healed = healed.replace(/\/\/[^\n]*/g, '');
  healed = healed.replace(/\/\*[\s\S]*?\*\//g, '');

  // 7. 修复 undefined 和 null 的字符串表示
  healed = healed.replace(/:\s*undefined\b/g, ': null');

  return healed;
}
