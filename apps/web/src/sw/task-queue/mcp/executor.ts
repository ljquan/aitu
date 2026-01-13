/**
 * MCP Tool Executor for Service Worker
 *
 * Handles MCP_TOOL_EXECUTE messages from main thread.
 * Only executes tools that can run directly in SW (API calls).
 * Tools requiring DOM/Board access should be handled by main thread.
 */

import type { GeminiConfig, VideoAPIConfig, MCPToolResultMessage } from '../types';
import type { MCPResult } from '../workflow-types';
import { executeSWMCPTool, requiresMainThread } from './tools';

/**
 * Execute an MCP tool in the Service Worker
 *
 * @param requestId - Unique request ID for response correlation
 * @param toolName - Name of the tool to execute
 * @param args - Tool arguments
 * @param geminiConfig - Gemini API configuration
 * @param videoConfig - Video API configuration
 * @param clientId - Client ID to send response to
 * @param sw - Service Worker global scope
 */
export async function executeMCPTool(
  requestId: string,
  toolName: string,
  args: Record<string, unknown>,
  geminiConfig: GeminiConfig,
  videoConfig: VideoAPIConfig,
  clientId: string,
  sw: ServiceWorkerGlobalScope
): Promise<void> {
  try {
    // Check if tool requires main thread - return error to let main thread handle it
    if (requiresMainThread(toolName)) {
      sendResult(
        requestId,
        {
          success: false,
          error: `Tool "${toolName}" requires main thread execution`,
          type: 'error',
        },
        clientId,
        sw
      );
      return;
    }

    // Execute directly in SW
    const result = await executeSWMCPTool(toolName, args, {
      geminiConfig,
      videoConfig,
      onProgress: () => {}, // No progress for direct execution
    });

    sendResult(requestId, result, clientId, sw);
  } catch (error: any) {
    sendResult(
      requestId,
      {
        success: false,
        error: error.message || 'Tool execution failed',
        type: 'error',
      },
      clientId,
      sw
    );
  }
}

/**
 * Send result back to main thread
 */
function sendResult(
  requestId: string,
  result: MCPResult,
  clientId: string,
  sw: ServiceWorkerGlobalScope
): void {
  const message: MCPToolResultMessage = {
    type: 'MCP_TOOL_RESULT',
    requestId,
    success: result.success,
    data: result.data,
    error: result.error,
    resultType: result.type,
  };

  sw.clients.get(clientId).then((client) => {
    if (client) {
      client.postMessage(message);
    }
  });
}
