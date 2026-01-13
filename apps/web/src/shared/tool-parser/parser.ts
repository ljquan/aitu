/**
 * Shared Tool Parser
 *
 * Parses tool calls from LLM responses.
 * Used by both Service Worker and main thread.
 */

import type { ToolCall, WorkflowJsonResponse } from './types';

/**
 * Generate unique tool call ID
 */
function generateToolCallId(index: number = 0): string {
  return `tc_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Try to parse JSON string, with healing on failure
 */
function tryParseJson(jsonStr: string): Record<string, unknown> | null {
  const trimmed = jsonStr.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    try {
      return JSON.parse(healJson(trimmed));
    } catch {
      return null;
    }
  }
}

/**
 * Clean LLM response text
 * Remove common interference content
 */
export function cleanLLMResponse(response: string): string {
  let cleaned = response;

  // Remove <think>...</think> tags
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>\s*/gi, '');

  // Remove code block markers
  cleaned = cleaned.replace(/```(?:json)?\s*\n?/gi, '').replace(/\n?```/gi, '');

  return cleaned.trim();
}

/**
 * Check if response is likely a complete workflow JSON
 * Used to avoid parsing incomplete streaming data
 */
function isLikelyCompleteWorkflowJson(response: string): boolean {
  const trimmed = response.trim();

  // Must start with { and end with }
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return false;
  }

  // Must contain content and next fields
  if (!trimmed.includes('"content"') || !trimmed.includes('"next"')) {
    return false;
  }

  // Check bracket balance (simple check)
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escape = false;

  for (const char of trimmed) {
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') braceCount++;
    else if (char === '}') braceCount--;
    else if (char === '[') bracketCount++;
    else if (char === ']') bracketCount--;
  }

  return braceCount === 0 && bracketCount === 0;
}

/**
 * Parse workflow JSON response format
 * Format: {"content": "...", "next": [{"mcp": "tool_name", "args": {...}}]}
 */
export function parseWorkflowJson(response: string): WorkflowJsonResponse | null {
  const cleaned = cleanLLMResponse(response);

  // Quick check: if response is obviously incomplete, return null (no warning)
  if (!isLikelyCompleteWorkflowJson(cleaned)) {
    return null;
  }

  // Try direct parse
  let parsed = tryParseJson(cleaned);

  // Try to extract JSON from text (precise match)
  if (!parsed) {
    const jsonMatch = cleaned.match(/\{\s*"content"\s*:\s*"[^"]*"\s*,\s*"next"\s*:\s*\[[\s\S]*?\]\s*\}/);
    if (jsonMatch) {
      parsed = tryParseJson(jsonMatch[0]);
    }
  }

  // Try looser match
  if (!parsed) {
    const jsonMatch = cleaned.match(/\{[\s\S]*"content"[\s\S]*"next"[\s\S]*\}/);
    if (jsonMatch) {
      parsed = tryParseJson(jsonMatch[0]);
    }
  }

  if (!parsed) {
    // Only log warning when it looks complete but fails to parse
    // Incomplete streaming data is already filtered above
    return null;
  }

  // Validate format
  if (typeof parsed.content !== 'string') {
    return null;
  }

  const next = Array.isArray(parsed.next) ? parsed.next : [];

  // Validate next array items
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
 * Parse tool calls from LLM response
 *
 * Supports multiple formats:
 * 1. New format: {"content": "...", "next": [{"mcp": "...", "args": {...}}]}
 * 2. ```tool_call\n{...}\n``` format
 * 3. ```json\n{"name": "...", "arguments": {...}}\n``` format
 * 4. <tool_call>{...}</tool_call> format
 */
export function parseToolCalls(response: string): ToolCall[] {
  // Try workflow JSON format first
  const workflowJson = parseWorkflowJson(response);
  if (workflowJson && workflowJson.next.length > 0) {
    return workflowJson.next.map((item, index) => ({
      id: generateToolCallId(index),
      name: item.mcp,
      arguments: item.args,
    }));
  }

  // Fallback to legacy formats
  const toolCalls: ToolCall[] = [];

  const createToolCall = (parsed: Record<string, unknown>): ToolCall | null => {
    if (!parsed.name || typeof parsed.name !== 'string') {
      return null;
    }

    const args = parsed.arguments || parsed.params || parsed.parameters || {};

    return {
      id: generateToolCallId(),
      name: parsed.name,
      arguments: typeof args === 'object' && args !== null ? args as Record<string, unknown> : {},
    };
  };

  // Format 1: ```tool_call\n{...}\n```
  const toolCallBlockRegex = /```tool_call\s*\n?([\s\S]*?)\n?```/gi;
  let match;

  while ((match = toolCallBlockRegex.exec(response)) !== null) {
    const parsed = tryParseJson(match[1]);
    if (parsed) {
      const toolCall = createToolCall(parsed);
      if (toolCall) {
        toolCalls.push(toolCall);
      }
    }
  }

  // Format 2: ```json\n{...}\n```
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

  // Format 3: <tool_call>{...}</tool_call>
  if (toolCalls.length === 0) {
    const xmlTagRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;

    while ((match = xmlTagRegex.exec(response)) !== null) {
      const parsed = tryParseJson(match[1]);
      if (parsed) {
        const toolCall = createToolCall(parsed);
        if (toolCall) {
          toolCalls.push(toolCall);
        }
      }
    }
  }

  // Format 4: Direct JSON in text (legacy)
  if (toolCalls.length === 0) {
    const directJsonRegex = /\{[\s\S]*?"name"\s*:\s*"(?:generate_image|generate_video|generate_grid_image|generate_photo_wall)"[\s\S]*?\}/g;

    while ((match = directJsonRegex.exec(response)) !== null) {
      const parsed = tryParseJson(match[0]);
      if (parsed) {
        const toolCall = createToolCall(parsed);
        if (toolCall) {
          toolCalls.push(toolCall);
          break; // Only take first match
        }
      }
    }
  }

  return toolCalls;
}

/**
 * Extract text content from LLM response
 * Prefers content field from workflow JSON format
 */
export function extractTextContent(response: string): string {
  // Try workflow JSON format first
  const workflowJson = parseWorkflowJson(response);
  if (workflowJson) {
    return workflowJson.content;
  }

  // Fallback: clean response
  let text = cleanLLMResponse(response);

  // Remove tool call blocks
  text = text.replace(/```tool_call\s*\n?[\s\S]*?\n?```/gi, '');
  text = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
  text = text.replace(/```(?:json)?\s*\n?\s*\{\s*"name"\s*:[\s\S]*?\n?```/gi, '');
  text = text.replace(/\{\s*"content"\s*:\s*"[^"]*"\s*,\s*"next"\s*:\s*\[[\s\S]*?\]\s*\}/gi, '');

  // Clean extra newlines
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Check if response contains tool calls
 */
export function hasToolCall(response: string): boolean {
  return parseToolCalls(response).length > 0;
}

/**
 * Heal potentially broken JSON
 */
function healJson(jsonStr: string): string {
  let healed = jsonStr.trim();

  // Find first {
  const jsonStart = healed.indexOf('{');
  if (jsonStart > 0) {
    healed = healed.substring(jsonStart);
  }

  // Find last }
  const jsonEnd = healed.lastIndexOf('}');
  if (jsonEnd < healed.length - 1 && jsonEnd > 0) {
    healed = healed.substring(0, jsonEnd + 1);
  }

  // Fix unescaped newlines in strings
  healed = healed.replace(/:\s*"([^"]*)\n([^"]*)"/g, (match, p1, p2) => {
    return `: "${p1}\\n${p2}"`;
  });

  // Fix single quotes
  healed = healed.replace(/'([^']*?)'/g, (match, content) => {
    if (!content.includes(':') || content.length > 50) {
      return `"${content}"`;
    }
    return match;
  });

  // Fix unquoted property names
  healed = healed.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');

  // Remove trailing commas
  healed = healed.replace(/,(\s*[}\]])/g, '$1');

  // Remove duplicate commas
  healed = healed.replace(/,\s*,/g, ',');

  // Remove comments
  healed = healed.replace(/\/\/[^\n]*/g, '');
  healed = healed.replace(/\/\*[\s\S]*?\*\//g, '');

  // Fix undefined
  healed = healed.replace(/:\s*undefined\b/g, ': null');

  return healed;
}
