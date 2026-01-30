/**
 * Workflow Response Parser
 *
 * Parses tool calls from LLM responses.
 * Supports the standard workflow JSON format and legacy formats.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Tool call parsed from LLM response
 */
export interface ToolCall {
  /** Unique tool call ID */
  id: string;
  /** Tool name (MCP tool name) */
  name: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
}

/**
 * Workflow JSON response format from LLM
 *
 * This is the standard format for AI workflow responses:
 * ```json
 * {
 *   "content": "AI 的分析和说明",
 *   "next": [
 *     {"mcp": "generate_image", "args": {"prompt": "a cat"}},
 *     {"mcp": "generate_video", "args": {"prompt": "a dog"}}
 *   ]
 * }
 * ```
 */
export interface WorkflowJsonResponse {
  /** AI analysis text content */
  content: string;
  /** Tool calls to execute */
  next: Array<{
    /** MCP tool name */
    mcp: string;
    /** Tool arguments */
    args: Record<string, unknown>;
  }>;
}

/**
 * Workflow parse result
 */
export interface WorkflowParseResult {
  /** Whether parsing was successful */
  success: boolean;
  /** Parsed workflow response (if successful) */
  workflow: WorkflowJsonResponse | null;
  /** Tool calls extracted from the response */
  toolCalls: ToolCall[];
  /** Text content extracted from the response */
  textContent: string;
  /** Original response (cleaned) */
  cleanedResponse: string;
}

/**
 * Tool execution result
 *
 * Each tool call returns a result that can either:
 * 1. Be a final result (data only, no next workflow)
 * 2. Trigger recursive workflow execution (return another WorkflowJsonResponse)
 */
export interface ToolExecutionResult {
  /** Whether execution was successful */
  success: boolean;
  /** Result data from tool execution */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /**
   * Next workflow to execute (recursive call)
   * If not null, the workflow engine should continue with this response
   */
  nextWorkflow?: WorkflowJsonResponse | null;
  /**
   * Context information to pass to subsequent tool calls
   * Accumulated across the workflow execution chain
   */
  context?: Record<string, unknown>;
}

/**
 * Workflow execution context
 *
 * Accumulated context that flows through the workflow execution.
 * Each tool call can read from and contribute to this context.
 */
export interface WorkflowContext {
  /** Unique workflow execution ID */
  executionId: string;
  /** Current recursion depth */
  depth: number;
  /** Maximum allowed recursion depth */
  maxDepth: number;
  /** Accumulated results from previous tool calls */
  results: Array<{
    toolName: string;
    result: unknown;
    timestamp: number;
  }>;
  /** Shared data between tool calls */
  sharedData: Record<string, unknown>;
  /** Parent workflow context (for nested workflows) */
  parent?: WorkflowContext;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Generate unique tool call ID
 */
function generateToolCallId(index = 0): string {
  return `tc_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 11)}`;
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
  healed = healed.replace(/:\s*"([^"]*)\n([^"]*)"/g, (_match, p1, p2) => {
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

// ============================================================================
// Public API
// ============================================================================

/**
 * Clean LLM response text
 *
 * Removes common interference content like:
 * - `<think>...</think>` tags (reasoning tokens)
 * - Code block markers (```)
 *
 * @param response - Raw LLM response
 * @returns Cleaned response
 *
 * @example
 * cleanLLMResponse('<think>thinking...</think>```json\n{"content": "hello"}\n```')
 * // Returns: '{"content": "hello"}'
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
 * Parse workflow JSON response format
 *
 * Parses the standard workflow response format:
 * ```json
 * {"content": "...", "next": [{"mcp": "tool_name", "args": {...}}]}
 * ```
 *
 * @param response - LLM response string
 * @returns Parsed workflow response or null if parsing fails
 *
 * @example
 * const result = parseWorkflowJson('{"content": "分析完成", "next": [{"mcp": "generate_image", "args": {"prompt": "cat"}}]}');
 * // Returns: { content: "分析完成", next: [{mcp: "generate_image", args: {prompt: "cat"}}] }
 */
export function parseWorkflowJson(response: string): WorkflowJsonResponse | null {
  const cleaned = cleanLLMResponse(response);

  // Quick check: if response is obviously incomplete, return null
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
    return null;
  }

  // Validate format
  if (typeof parsed.content !== 'string') {
    return null;
  }

  const next = Array.isArray(parsed.next) ? parsed.next : [];

  // Validate next array items
  const validNext = next
    .filter((item: unknown): item is { mcp: string; args: Record<string, unknown> } => {
      return (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { mcp?: unknown }).mcp === 'string' &&
        typeof (item as { args?: unknown }).args === 'object'
      );
    })
    .map((item) => ({
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
 * 1. Workflow JSON: `{"content": "...", "next": [{"mcp": "...", "args": {...}}]}`
 * 2. Tool call block: ` ```tool_call\n{...}\n``` `
 * 3. JSON block: ` ```json\n{"name": "...", "arguments": {...}}\n``` `
 * 4. XML tag: `<tool_call>{...}</tool_call>`
 *
 * @param response - LLM response string
 * @returns Array of parsed tool calls
 *
 * @example
 * const calls = parseToolCalls('{"content": "ok", "next": [{"mcp": "generate_image", "args": {"prompt": "cat"}}]}');
 * // Returns: [{id: "tc_...", name: "generate_image", arguments: {prompt: "cat"}}]
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
      arguments: typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {},
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

  return toolCalls;
}

/**
 * Extract text content from LLM response
 *
 * Prefers the `content` field from workflow JSON format.
 * Falls back to cleaning the response and removing tool call blocks.
 *
 * @param response - LLM response string
 * @returns Extracted text content
 *
 * @example
 * extractTextContent('{"content": "这是分析结果", "next": []}')
 * // Returns: "这是分析结果"
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
 *
 * @param response - LLM response string
 * @returns True if response contains tool calls
 *
 * @example
 * hasToolCalls('{"content": "ok", "next": [{"mcp": "test", "args": {}}]}')
 * // Returns: true
 */
export function hasToolCalls(response: string): boolean {
  return parseToolCalls(response).length > 0;
}

/**
 * Parse workflow response completely
 *
 * Combines all parsing functions into a single result.
 *
 * @param response - LLM response string
 * @returns Complete parse result
 *
 * @example
 * const result = parseWorkflowResponse('{"content": "分析完成", "next": [{"mcp": "generate_image", "args": {"prompt": "cat"}}]}');
 * // Returns: {
 * //   success: true,
 * //   workflow: { content: "分析完成", next: [...] },
 * //   toolCalls: [{id: "tc_...", name: "generate_image", arguments: {...}}],
 * //   textContent: "分析完成",
 * //   cleanedResponse: '{"content": "分析完成", ...}'
 * // }
 */
export function parseWorkflowResponse(response: string): WorkflowParseResult {
  const cleanedResponse = cleanLLMResponse(response);
  const workflow = parseWorkflowJson(response);
  const toolCalls = parseToolCalls(response);
  const textContent = extractTextContent(response);

  return {
    success: workflow !== null || toolCalls.length > 0,
    workflow,
    toolCalls,
    textContent,
    cleanedResponse,
  };
}

/**
 * Create a workflow JSON response
 *
 * Helper function to create properly formatted workflow responses.
 *
 * @param content - AI analysis text
 * @param toolCalls - Tool calls to include
 * @returns Workflow JSON response object
 *
 * @example
 * const workflow = createWorkflowResponse('分析完成', [
 *   { mcp: 'generate_image', args: { prompt: 'cat' } }
 * ]);
 */
export function createWorkflowResponse(
  content: string,
  toolCalls: Array<{ mcp: string; args: Record<string, unknown> }> = []
): WorkflowJsonResponse {
  return {
    content,
    next: toolCalls,
  };
}

/**
 * Serialize workflow response to JSON string
 *
 * @param workflow - Workflow response object
 * @returns JSON string
 *
 * @example
 * const json = serializeWorkflowResponse({ content: 'ok', next: [] });
 * // Returns: '{"content":"ok","next":[]}'
 */
export function serializeWorkflowResponse(workflow: WorkflowJsonResponse): string {
  return JSON.stringify(workflow);
}
