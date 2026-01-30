/**
 * Tool Parser for Service Worker
 *
 * Imports from @aitu/utils and adds SW-specific type conversions.
 */

// Re-export from @aitu/utils
export {
  cleanLLMResponse,
  parseWorkflowJson,
  extractTextContent,
  hasToolCalls,
  type WorkflowJsonResponse,
} from '@aitu/utils';

import { parseToolCalls as sharedParseToolCalls } from '@aitu/utils';
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
