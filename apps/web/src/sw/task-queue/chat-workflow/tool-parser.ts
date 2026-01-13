/**
 * Tool Parser for Service Worker
 *
 * Re-exports shared tool parser utilities.
 * Adds SW-specific type conversions.
 */

// Re-export shared parser
export {
  cleanLLMResponse,
  parseWorkflowJson,
  extractTextContent,
  hasToolCall,
} from '../../../shared/tool-parser';

export type { WorkflowJsonResponse } from '../../../shared/tool-parser';

import { parseToolCalls as sharedParseToolCalls } from '../../../shared/tool-parser';
import type { ChatToolCall } from './types';

/**
 * Parse tool calls from LLM response
 * Returns ChatToolCall with status field for SW workflow
 */
export function parseToolCalls(response: string): ChatToolCall[] {
  const toolCalls = sharedParseToolCalls(response);
  return toolCalls.map((tc) => ({
    ...tc,
    status: 'pending' as const,
  }));
}
