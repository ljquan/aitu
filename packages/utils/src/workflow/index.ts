/**
 * Workflow Utilities
 *
 * Framework-agnostic utilities for workflow protection, parsing, and state management.
 *
 * @example
 * ```typescript
 * import {
 *   // Parser
 *   parseWorkflowJson,
 *   parseToolCalls,
 *   createWorkflowResponse,
 *   // Guards
 *   WorkflowGuard,
 *   RecursionGuard,
 *   LoopDetector,
 *   // State utilities
 *   updateStepStatus,
 *   getWorkflowStatus,
 * } from '@aitu/utils';
 *
 * // Parse AI response
 * const response = '{"content": "分析完成", "next": [{"mcp": "generate_image", "args": {"prompt": "cat"}}]}';
 * const workflow = parseWorkflowJson(response);
 * const toolCalls = parseToolCalls(response);
 *
 * // Create workflow guard
 * const guard = new WorkflowGuard();
 *
 * // Execute workflow loop
 * for (const call of toolCalls) {
 *   guard.recordToolCall(call.name, call.arguments);
 *   // ... execute tool
 * }
 * ```
 */

// Types
export * from './types';

// Parser - Core workflow response parsing
export {
  // Types
  type ToolCall,
  type WorkflowJsonResponse,
  type WorkflowParseResult,
  type ToolExecutionResult,
  type WorkflowContext,
  // Parsing functions
  cleanLLMResponse,
  parseWorkflowJson,
  parseToolCalls,
  extractTextContent,
  hasToolCalls,
  parseWorkflowResponse,
  // Creation functions
  createWorkflowResponse,
  serializeWorkflowResponse,
} from './parser';

// Guards - Workflow protection mechanisms
export { RecursionGuard } from './recursion-guard';
export { LoopDetector } from './loop-detector';
export { WorkflowGuard } from './workflow-guard';

// Utility functions - State management
export {
  updateStepStatus,
  addStepsToWorkflow,
  removeStepsFromWorkflow,
  getWorkflowStatus,
  findStepById,
  getStepsByStatus,
  isWorkflowComplete,
  hasWorkflowFailed,
  getWorkflowProgress,
  getNextPendingStep,
  createStep,
  generateWorkflowId,
  generateStepId,
} from './utils';
