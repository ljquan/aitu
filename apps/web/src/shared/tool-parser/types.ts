/**
 * Shared Tool Parser Types
 *
 * Types for parsing tool calls from LLM responses.
 * Used by both Service Worker and main thread.
 */

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
 * Format: {"content": "...", "next": [{"mcp": "tool_name", "args": {...}}]}
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
