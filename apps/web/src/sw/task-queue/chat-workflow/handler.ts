/**
 * Chat Workflow Handler for Service Worker
 *
 * Handles the complete chat workflow:
 * 1. Stream LLM response
 * 2. Parse tool calls from response
 * 3. Execute tools (in SW or delegate to main thread)
 * 4. Return results
 */

import type { GeminiConfig, VideoAPIConfig, ChatParams } from '../types';
import type {
  ChatWorkflow,
  ChatWorkflowStatus,
  ChatToolCall,
  ChatWorkflowSWToMainMessage,
} from './types';
import { parseToolCalls, extractTextContent, parseWorkflowJson } from './tool-parser';
import { executeSWMCPTool, requiresMainThread, getSWMCPTool } from '../mcp/tools';
import type { SWMCPToolConfig, MainThreadToolResponseMessage } from '../workflow-types';
import { taskQueueStorage, type PendingDomOperation } from '../storage';

/**
 * Gemini message format
 */
interface GeminiMessage {
  role: 'user' | 'assistant' | 'system';
  content: Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
  }>;
}

/**
 * Chat workflow handler configuration
 */
export interface ChatWorkflowHandlerConfig {
  geminiConfig: GeminiConfig;
  videoConfig: VideoAPIConfig;
  /** Broadcast message to all clients */
  broadcast: (message: ChatWorkflowSWToMainMessage) => void;
  /** Send message to a specific client */
  sendToClient: (clientId: string, message: ChatWorkflowSWToMainMessage) => void;
  /** Request main thread to execute a tool */
  requestMainThreadTool: (
    clientId: string,
    chatId: string,
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>
  ) => Promise<MainThreadToolResponseMessage>;
  /** Check if a client is available (has an active channel) */
  isClientAvailable?: (clientId: string) => boolean;
}

/**
 * Chat Workflow Handler
 */
export class ChatWorkflowHandler {
  private workflows: Map<string, ChatWorkflow> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  /** Map of chatId to clientId that initiated the workflow */
  private workflowClients: Map<string, string> = new Map();
  private config: ChatWorkflowHandlerConfig;
  /** Pending main thread tool requests */
  private pendingToolRequests: Map<string, {
    resolve: (response: MainThreadToolResponseMessage) => void;
    reject: (error: Error) => void;
  }> = new Map();
  /** Whether storage restoration has been completed */
  private storageRestored = false;

  constructor(config: ChatWorkflowHandlerConfig) {
    this.config = config;
    // Restore workflows from storage asynchronously
    this.restoreFromStorage();
  }

  /**
   * Restore chat workflows from IndexedDB on SW startup/restart
   * 
   * IMPORTANT: This is ONLY called when SW starts/restarts, NOT on page refresh!
   * 
   * When page refreshes but SW continues running:
   * - Workflows continue executing normally (streaming continues, tools execute)
   * - No recovery needed - SW maintains state in memory
   * - Only when tool needs main thread and no client available, it defers and waits
   * 
   * When SW actually restarts (browser closed, SW crashed, etc.):
   * - Memory state is lost, need to restore from IndexedDB
   * - pending/streaming: API call interrupted, mark as failed (can't re-execute - would double charge)
   * - parsing: Can re-parse if content was saved
   * - executing_tools: Check tool states, resume what's possible
   * - awaiting_client: Already waiting, just load into memory
   */
  private async restoreFromStorage(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const workflows = await taskQueueStorage.getAllChatWorkflows();

      let recoveredCount = 0;
      let failedCount = 0;

      for (const workflow of workflows) {
        // Skip completed/cancelled/failed workflows (keep in memory for queries)
        if (workflow.status === 'completed' || workflow.status === 'cancelled' || workflow.status === 'failed') {
          this.workflows.set(workflow.id, workflow);
          continue;
        }

        // Handle interrupted workflows based on their state
        const prevStatus = workflow.status;
        await this.handleInterruptedWorkflow(workflow);
        
        // After handleInterruptedWorkflow, status can change to 'failed', 'awaiting_client', or 'completed'
        if ((workflow.status as ChatWorkflowStatus) === 'failed') {
          failedCount++;
        } else {
          recoveredCount++;
        }
      }

      this.storageRestored = true;
    } catch (error) {
      console.error('[SW:ChatWorkflow] ❌ Failed to restore from storage:', error);
      this.storageRestored = true; // Mark as done even on error
    }
  }

  /**
   * Handle an interrupted chat workflow (called only on SW restart)
   * 
   * IMPORTANT: This is only called when SW restarts, NOT on page refresh!
   * On page refresh, SW continues running and workflows continue executing normally.
   * 
   * Recovery strategy based on workflow status at SW restart:
   * - pending: Mark as failed - request may have been sent, can't re-execute (would double charge)
   * - streaming: Mark as failed - stream data is lost when SW restarts
   * - parsing: Can re-parse if fullContent was persisted
   * - executing_tools: Check each tool - completed results are preserved, pending tools wait for client
   * - awaiting_client: Already waiting for client, just load into memory
   */
  private async handleInterruptedWorkflow(workflow: ChatWorkflow): Promise<void> {
    switch (workflow.status) {
      case 'pending':
        // SW restarted while workflow was pending
        // We can't know if the API request was sent - marking as failed to avoid double charging
        await this.markWorkflowFailed(workflow, 'Service Worker 重启时工作流尚未完成，请重试');
        break;

      case 'streaming':
        // SW restarted while streaming - stream data is lost
        // Note: On page refresh (SW continues), streaming continues normally and won't reach here
        await this.markWorkflowFailed(workflow, 'Service Worker 重启导致流式响应中断，请重试');
        break;

      case 'parsing':
        // If we have content, we can try to re-parse
        if (workflow.content && workflow.content.length > 0) {
          try {
            const toolCalls = parseToolCalls(workflow.content);
            const aiAnalysis = extractTextContent(workflow.content);
            workflow.toolCalls = toolCalls;
            workflow.aiAnalysis = aiAnalysis;
            
            if (toolCalls.length > 0) {
              // Has tools to execute, wait for client
              workflow.status = 'awaiting_client';
            } else {
              // No tools, mark as completed
              workflow.status = 'completed';
              workflow.completedAt = Date.now();
            }
            workflow.updatedAt = Date.now();
            this.workflows.set(workflow.id, workflow);
            await taskQueueStorage.saveChatWorkflow(workflow);
          } catch (error) {
            console.error(`[SW:ChatWorkflow] Failed to re-parse workflow ${workflow.id}:`, error);
            await this.markWorkflowFailed(workflow, '工具调用解析失败，请重试');
          }
        } else {
          await this.markWorkflowFailed(workflow, 'Service Worker 重启时内容为空，请重试');
        }
        break;

      case 'executing_tools':
        // Check if there are pending tools that need execution
        await this.handleInterruptedToolExecution(workflow);
        break;

      case 'awaiting_client':
        // Already waiting for client, just load into memory
        this.workflows.set(workflow.id, workflow);
        break;

      default:
        // Unknown state, mark as failed
        await this.markWorkflowFailed(workflow, 'Service Worker 重启时工作流状态异常，请重试');
    }
  }

  /**
   * Handle interrupted tool execution
   * Check which tools need to be resumed or re-executed
   */
  private async handleInterruptedToolExecution(workflow: ChatWorkflow): Promise<void> {

    // Check for pending DOM operations that were stored
    const pendingOps = await taskQueueStorage.getPendingDomOperationsByChatId(workflow.id);
    
    // Count pending and running tools
    let hasPendingTools = false;
    let hasRunningMainThreadTool = false;

    for (const toolCall of workflow.toolCalls) {
      if (toolCall.status === 'pending') {
        hasPendingTools = true;
      }
      if (toolCall.status === 'running') {
        // Check if this is a main thread tool
        if (requiresMainThread(toolCall.name) || !getSWMCPTool(toolCall.name)) {
          hasRunningMainThreadTool = true;
          // Mark as pending so it can be re-executed when client connects
          toolCall.status = 'pending';
        } else {
          // SW tool that was running - mark as pending for retry
          toolCall.status = 'pending';
          hasPendingTools = true;
        }
      }
    }

    if (hasPendingTools || hasRunningMainThreadTool || pendingOps.length > 0) {
      // Has work to do, wait for client
      workflow.status = 'awaiting_client';
    } else {
      // All tools completed, check if workflow should be completed
      const allCompleted = workflow.toolCalls.every(tc => 
        tc.status === 'completed' || tc.status === 'failed'
      );
      if (allCompleted) {
        workflow.status = 'completed';
        workflow.completedAt = Date.now();
      } else {
        workflow.status = 'awaiting_client';
      }
    }

    workflow.updatedAt = Date.now();
    this.workflows.set(workflow.id, workflow);
    await taskQueueStorage.saveChatWorkflow(workflow);
  }

  /**
   * Mark workflow as failed with error message
   */
  private async markWorkflowFailed(workflow: ChatWorkflow, errorMessage: string): Promise<void> {
    workflow.status = 'failed';
    workflow.error = errorMessage;
    workflow.updatedAt = Date.now();

    // Mark any running/pending tool calls as failed
    for (const toolCall of workflow.toolCalls) {
      if (toolCall.status === 'running' || toolCall.status === 'pending') {
        toolCall.status = 'failed';
        toolCall.result = {
          success: false,
          error: 'Service Worker 重启导致执行中断',
        };
      }
    }

    this.workflows.set(workflow.id, workflow);
    await taskQueueStorage.saveChatWorkflow(workflow);
  }

  /**
   * Defer a DOM operation to be executed when a client reconnects
   * This is called when a main-thread tool result is ready but no client is available
   */
  private async deferDomOperation(
    workflow: ChatWorkflow,
    toolCall: ChatToolCall,
    result?: unknown
  ): Promise<void> {
    const operation: PendingDomOperation = {
      id: `dom_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      workflowId: workflow.id,
      chatId: workflow.id,
      toolName: toolCall.name,
      toolArgs: toolCall.arguments,
      toolResult: result,
      toolCallId: toolCall.id,
      createdAt: Date.now(),
    };

    await taskQueueStorage.savePendingDomOperation(operation);
  }

  /**
   * Check if a client is available for the workflow
   */
  private isClientAvailable(chatId: string): boolean {
    const clientId = this.workflowClients.get(chatId);
    if (!clientId) {
      return false;
    }
    // Use the config callback if available
    if (this.config.isClientAvailable) {
      return this.config.isClientAvailable(clientId);
    }
    // If no callback, assume client is available (will fail later if not)
    return true;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ChatWorkflowHandlerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Start a chat workflow
   * @param chatId Unique chat ID
   * @param params Chat parameters
   * @param clientId ID of the client that initiated the workflow
   */
  async startWorkflow(chatId: string, params: ChatParams, clientId: string): Promise<void> {
    // Check for duplicate
    const existing = this.workflows.get(chatId);
    if (existing) {
      if (existing.status === 'streaming' || existing.status === 'pending' || existing.status === 'executing_tools') {
        this.workflowClients.set(chatId, clientId);
        this.broadcastStatus(existing);
        return;
      }
      console.warn(`[SW:ChatWorkflow] Workflow ${chatId} already exists with status: ${existing.status}`);
      this.broadcastStatus(existing);
      return;
    }

    // Store the client ID that initiated this workflow
    this.workflowClients.set(chatId, clientId);

    // Create workflow
    const workflow: ChatWorkflow = {
      id: chatId,
      status: 'pending',
      params,
      content: '',
      toolCalls: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.workflows.set(chatId, workflow);

    // Persist to IndexedDB
    await taskQueueStorage.saveChatWorkflow(workflow);

    // Create abort controller
    const abortController = new AbortController();
    this.abortControllers.set(chatId, abortController);
    
    // Execute workflow
    this.executeWorkflow(workflow, abortController.signal);
  }

  /**
   * Cancel a chat workflow
   */
  async cancelWorkflow(chatId: string): Promise<void> {
    const controller = this.abortControllers.get(chatId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(chatId);
    }

    const workflow = this.workflows.get(chatId);
    if (workflow) {
      workflow.status = 'cancelled';
      workflow.updatedAt = Date.now();

      // Persist cancelled state
      await taskQueueStorage.saveChatWorkflow(workflow);

      this.broadcastStatus(workflow);
    }
  }

  /**
   * Send all active (non-terminal) workflows to a specific client
   * This is called when a new client connects to sync state
   * Only workflows that need further processing are sent (pending/running)
   * Terminal state workflows (completed/failed/cancelled) are not sent
   * because they don't need client interaction anymore
   * @param clientId The client to send recovered workflows to
   */
  sendRecoveredWorkflowsToClient(clientId: string): void {
    // ChatWorkflowStatus active states: 'pending' | 'streaming' | 'parsing' | 'executing_tools' | 'awaiting_client'
    // Terminal states: 'completed' | 'failed' | 'cancelled'
    const terminalStatuses: ChatWorkflowStatus[] = ['completed', 'failed', 'cancelled'];
    
    for (const workflow of this.workflows.values()) {
      // Only send active workflows that need client interaction
      if (!terminalStatuses.includes(workflow.status)) {
        // Update clientId mapping for active workflows so they can continue
        this.workflowClients.set(workflow.id, clientId);
        
        this.config.sendToClient(clientId, {
          type: 'CHAT_WORKFLOW_RECOVERED',
          chatId: workflow.id,
          workflow,
        });

        // If workflow was awaiting client, resume execution
        if (workflow.status === 'awaiting_client') {
          this.resumeAwaitingWorkflow(workflow, clientId);
        }
      }
      // Terminal state workflows (completed/failed/cancelled) are not sent
      // because they don't need client interaction anymore
    }
  }

  /**
   * Resume a workflow that was waiting for a client
   * Called when a new client connects and claims the workflow
   */
  private async resumeAwaitingWorkflow(workflow: ChatWorkflow, clientId: string): Promise<void> {
    try {
      // Check for pending DOM operations
      const pendingOps = await taskQueueStorage.getPendingDomOperationsByChatId(workflow.id);
      
      if (pendingOps.length > 0) {
        
        // Process each pending DOM operation
        for (const op of pendingOps) {
          // Find the corresponding tool call
          const toolCall = workflow.toolCalls.find(tc => tc.id === op.toolCallId);
          
          if (toolCall && toolCall.status === 'pending') {
            
            try {
              // Notify client that tool is starting
              this.config.sendToClient(clientId, {
                type: 'CHAT_WORKFLOW_TOOL_START',
                chatId: workflow.id,
                toolCallId: toolCall.id,
                toolName: toolCall.name,
              });

              toolCall.status = 'running';
              
              const response = await this.config.requestMainThreadTool(
                clientId,
                workflow.id,
                toolCall.id,
                toolCall.name,
                toolCall.arguments
              );

              toolCall.status = response.success ? 'completed' : 'failed';
              toolCall.result = {
                success: response.success,
                data: response.result,
                error: response.error,
              };

              // Notify client of completion
              this.config.sendToClient(clientId, {
                type: 'CHAT_WORKFLOW_TOOL_COMPLETE',
                chatId: workflow.id,
                toolCallId: toolCall.id,
                success: response.success,
                result: response.result,
                error: response.error,
              });

              // Delete the processed pending operation
              await taskQueueStorage.deletePendingDomOperation(op.id);
            } catch (error: any) {
              console.error(`[SW:ChatWorkflow] Failed to execute deferred tool ${op.toolName}:`, error);
              toolCall.status = 'failed';
              toolCall.result = {
                success: false,
                error: error.message,
              };
            }
          } else {
            // Tool not found or already processed, clean up the pending operation
            await taskQueueStorage.deletePendingDomOperation(op.id);
          }
        }
      }

      // Check if there are more pending tools to execute
      const hasPendingTools = workflow.toolCalls.some(tc => tc.status === 'pending');
      
      if (hasPendingTools) {
        // Continue executing remaining tools
        workflow.status = 'executing_tools';
        workflow.updatedAt = Date.now();
        await taskQueueStorage.saveChatWorkflow(workflow);

        // Create new abort controller and continue execution
        const abortController = new AbortController();
        this.abortControllers.set(workflow.id, abortController);

        // Execute remaining tools
        await this.executeTools(workflow, abortController.signal);

        // Check final status after execution
        if (workflow.status === 'executing_tools') {
          // All tools completed
          workflow.status = 'completed';
          workflow.completedAt = Date.now();
          workflow.updatedAt = Date.now();
          await taskQueueStorage.saveChatWorkflow(workflow);

          this.config.sendToClient(clientId, {
            type: 'CHAT_WORKFLOW_COMPLETE',
            chatId: workflow.id,
            content: workflow.content,
            aiAnalysis: workflow.aiAnalysis,
            toolCalls: workflow.toolCalls,
          });
        }
      } else {
        // No more pending tools, mark as completed
        const allCompleted = workflow.toolCalls.every(tc => 
          tc.status === 'completed' || tc.status === 'failed'
        );
        
        if (allCompleted) {
          workflow.status = 'completed';
          workflow.completedAt = Date.now();
          workflow.updatedAt = Date.now();
          await taskQueueStorage.saveChatWorkflow(workflow);

          this.config.sendToClient(clientId, {
            type: 'CHAT_WORKFLOW_COMPLETE',
            chatId: workflow.id,
            content: workflow.content,
            aiAnalysis: workflow.aiAnalysis,
            toolCalls: workflow.toolCalls,
          });

        }
      }
    } catch (error: any) {
      console.error(`[SW:ChatWorkflow] Failed to resume workflow ${workflow.id}:`, error);
      workflow.status = 'failed';
      workflow.error = `恢复执行时失败: ${error.message}`;
      workflow.updatedAt = Date.now();
      await taskQueueStorage.saveChatWorkflow(workflow);

      this.config.sendToClient(clientId, {
        type: 'CHAT_WORKFLOW_FAILED',
        chatId: workflow.id,
        error: workflow.error,
      });
    } finally {
      this.abortControllers.delete(workflow.id);
    }
  }

  /**
   * Get workflow by ID
   */
  getWorkflow(chatId: string): ChatWorkflow | undefined {
    return this.workflows.get(chatId);
  }

  /**
   * Get all workflows (for page refresh recovery)
   * Returns ALL workflows including completed/failed ones so frontend can sync state correctly
   */
  getAllWorkflows(): ChatWorkflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Handle response from main thread tool execution
   */
  handleMainThreadToolResponse(response: MainThreadToolResponseMessage): void {
    const pending = this.pendingToolRequests.get(response.requestId);
    if (pending) {
      this.pendingToolRequests.delete(response.requestId);
      pending.resolve(response);
    }
  }

  /**
   * Execute the workflow
   */
  private async executeWorkflow(
    workflow: ChatWorkflow,
    signal: AbortSignal
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Phase 1: Stream LLM response
      workflow.status = 'streaming';
      await taskQueueStorage.saveChatWorkflow(workflow);
      this.broadcastStatus(workflow);

      const fullContent = await this.streamChat(workflow, signal);
      workflow.content = fullContent;

      if (signal.aborted) {
        throw new Error('Workflow cancelled');
      }

      // Phase 2: Parse tool calls
      workflow.status = 'parsing';
      await taskQueueStorage.saveChatWorkflow(workflow);
      this.broadcastStatus(workflow);

      const toolCalls = parseToolCalls(fullContent);
      const aiAnalysis = extractTextContent(fullContent);

      workflow.toolCalls = toolCalls;
      workflow.aiAnalysis = aiAnalysis;

      // 发送 tool calls（点对点）
      if (toolCalls.length > 0) {
        this.sendToWorkflowClient(workflow.id, {
          type: 'CHAT_WORKFLOW_TOOL_CALLS',
          chatId: workflow.id,
          aiAnalysis,
          toolCalls,
        });
      }

      // Phase 3: Execute tools
      if (toolCalls.length > 0) {
        workflow.status = 'executing_tools';
        await taskQueueStorage.saveChatWorkflow(workflow);
        this.broadcastStatus(workflow);

        await this.executeTools(workflow, signal);
        
        // Check if workflow is awaiting client (deferred due to no client)
        // executeTools may change status to 'awaiting_client' when no client is available
        if ((workflow.status as ChatWorkflowStatus) === 'awaiting_client') {
          return;
        }
      }

      // Phase 4: Complete
      workflow.status = 'completed';
      workflow.completedAt = Date.now();
      workflow.updatedAt = Date.now();

      // Persist completed state
      await taskQueueStorage.saveChatWorkflow(workflow);

      this.sendToWorkflowClient(workflow.id, {
        type: 'CHAT_WORKFLOW_COMPLETE',
        chatId: workflow.id,
        content: workflow.content,
        aiAnalysis: workflow.aiAnalysis,
        toolCalls: workflow.toolCalls,
      });

    } catch (error: any) {
      if (error.message === 'Workflow cancelled') {
        workflow.status = 'cancelled';
      } else {
        workflow.status = 'failed';
        workflow.error = error.message;
        console.error(`[SW:ChatWorkflow] ❌ Workflow ${workflow.id} failed:`, error.message);

        this.sendToWorkflowClient(workflow.id, {
          type: 'CHAT_WORKFLOW_FAILED',
          chatId: workflow.id,
          error: error.message,
        });
      }
      workflow.updatedAt = Date.now();

      // Persist error/cancelled state
      await taskQueueStorage.saveChatWorkflow(workflow);
    } finally {
      this.abortControllers.delete(workflow.id);
    }
  }

  /**
   * Stream chat response from LLM
   */
  private async streamChat(
    workflow: ChatWorkflow,
    signal: AbortSignal
  ): Promise<string> {
    const { params } = workflow;
    const { geminiConfig } = this.config;

    // Convert messages to Gemini format
    const messages = this.convertToGeminiMessages(params);

    const model = params.temporaryModel || geminiConfig.modelName || 'gemini-2.5-flash';
    
    // console.log('[SW-ChatWorkflow] streamChat called:', {
    //   workflowId: workflow.id,
    //   model,
    //   messagesCount: messages.length,
    //   timestamp: new Date().toISOString(),
    // });

    const requestBody = {
      model,
      messages,
      stream: true,
    };

    // Use debugFetch for logging (stream response won't be fully captured)
    const { debugFetch } = await import('../debug-fetch');
    const response = await debugFetch(`${geminiConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${geminiConfig.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    }, {
      label: `💬 工作流对话 (${model})`,
      logRequestBody: true,
      isStreaming: true,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat request failed: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    // Read stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();

            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;

              if (content) {
                fullContent += content;
                // 点对点发送累积内容
                this.sendToWorkflowClient(workflow.id, {
                  type: 'CHAT_WORKFLOW_STREAM',
                  chatId: workflow.id,
                  content: fullContent,
                });
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6).trim();
        if (data && data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              this.sendToWorkflowClient(workflow.id, {
                type: 'CHAT_WORKFLOW_STREAM',
                chatId: workflow.id,
                content: fullContent,
              });
            }
          } catch {
            // Ignore
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Update debug log with final streaming content
    if ((response as any).__debugLogId && fullContent) {
      const { updateLogResponseBody } = await import('../debug-fetch');
      updateLogResponseBody((response as any).__debugLogId, fullContent);
    }

    return fullContent;
  }

  /**
   * Execute tool calls
   */
  private async executeTools(
    workflow: ChatWorkflow,
    signal: AbortSignal
  ): Promise<void> {
    // Get the client ID that initiated this workflow
    const clientId = this.workflowClients.get(workflow.id);

    for (const toolCall of workflow.toolCalls) {
      if (signal.aborted) {
        throw new Error('Workflow cancelled');
      }

      // Skip already completed/failed tools
      if (toolCall.status === 'completed' || toolCall.status === 'failed') {
        continue;
      }

      // Check if tool needs main thread
      const needsMainThread = requiresMainThread(toolCall.name) || !getSWMCPTool(toolCall.name);

      // If tool needs main thread, check if client is available
      if (needsMainThread) {
        if (!clientId || !this.isClientAvailable(workflow.id)) {
          // No client available, defer the operation and wait
          await this.deferDomOperation(workflow, toolCall);
          
          // Mark workflow as awaiting client
          workflow.status = 'awaiting_client';
          workflow.updatedAt = Date.now();
          await taskQueueStorage.saveChatWorkflow(workflow);
          
          // Stop execution here, will be resumed when client reconnects
          return;
        }
      }

      // Update tool status to running
      toolCall.status = 'running';
      this.sendToWorkflowClient(workflow.id, {
        type: 'CHAT_WORKFLOW_TOOL_START',
        chatId: workflow.id,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
      });

      try {
        let result: { success: boolean; data?: unknown; error?: string; taskId?: string };

        // Check if tool needs main thread
        if (needsMainThread) {
          // Delegate to main thread - only send to the client that initiated the workflow
          if (!clientId) {
            throw new Error('No client ID found for workflow');
          }

          const response = await this.config.requestMainThreadTool(
            clientId,
            workflow.id,
            toolCall.id,
            toolCall.name,
            toolCall.arguments
          );

          result = {
            success: response.success,
            data: response.result,
            error: response.error,
          };
        } else {
          // Execute in SW
          const toolConfig: SWMCPToolConfig = {
            geminiConfig: this.config.geminiConfig,
            videoConfig: this.config.videoConfig,
            signal,
          };

          const mcpResult = await executeSWMCPTool(toolCall.name, toolCall.arguments, toolConfig);

          result = {
            success: mcpResult.success,
            data: mcpResult.data,
            error: mcpResult.error,
            taskId: mcpResult.taskId,
          };
        }

        // Update tool result
        toolCall.status = result.success ? 'completed' : 'failed';
        toolCall.result = result;

        // Persist tool completion
        await taskQueueStorage.saveChatWorkflow(workflow);

        this.sendToWorkflowClient(workflow.id, {
          type: 'CHAT_WORKFLOW_TOOL_COMPLETE',
          chatId: workflow.id,
          toolCallId: toolCall.id,
          success: result.success,
          result: result.data,
          error: result.error,
          taskId: result.taskId,
        });

      } catch (error: any) {
        // Check if error is due to client unavailable
        if (error.message?.includes('No client') || error.message?.includes('timeout')) {
          toolCall.status = 'pending';
          await this.deferDomOperation(workflow, toolCall);
          
          workflow.status = 'awaiting_client';
          workflow.updatedAt = Date.now();
          await taskQueueStorage.saveChatWorkflow(workflow);
          return;
        }

        toolCall.status = 'failed';
        toolCall.result = {
          success: false,
          error: error.message,
        };

        // Persist tool failure
        await taskQueueStorage.saveChatWorkflow(workflow);

        this.sendToWorkflowClient(workflow.id, {
          type: 'CHAT_WORKFLOW_TOOL_COMPLETE',
          chatId: workflow.id,
          toolCallId: toolCall.id,
          success: false,
          error: error.message,
        });
      }
    }
  }

  /**
   * Convert chat params to Gemini message format
   */
  private convertToGeminiMessages(params: ChatParams): GeminiMessage[] {
    const messages: GeminiMessage[] = [];

    // Add system prompt
    if (params.systemPrompt) {
      messages.push({
        role: 'system',
        content: [{ type: 'text', text: params.systemPrompt }],
      });
    }

    // Add history messages
    for (const msg of params.messages) {
      const content: GeminiMessage['content'] = [];

      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }

      if (msg.attachments) {
        for (const attachment of msg.attachments) {
          if (attachment.type === 'image') {
            content.push({
              type: 'image_url',
              image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` },
            });
          }
        }
      }

      messages.push({
        role: msg.role,
        content,
      });
    }

    // Add new message
    if (params.newContent || params.attachments?.length) {
      const content: GeminiMessage['content'] = [];

      if (params.newContent) {
        content.push({ type: 'text', text: params.newContent });
      }

      if (params.attachments) {
        for (const attachment of params.attachments) {
          if (attachment.type === 'image') {
            content.push({
              type: 'image_url',
              image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` },
            });
          }
        }
      }

      messages.push({
        role: 'user',
        content,
      });
    }

    return messages;
  }

  /**
   * Broadcast workflow status (点对点发送给发起工作流的客户端)
   */
  private broadcastStatus(workflow: ChatWorkflow): void {
    this.sendToWorkflowClient(workflow.id, {
      type: 'CHAT_WORKFLOW_STATUS',
      chatId: workflow.id,
      status: workflow.status,
      updatedAt: workflow.updatedAt,
    });
  }

  /**
   * 发送消息到发起该工作流的客户端（点对点通讯）
   */
  private sendToWorkflowClient(chatId: string, message: ChatWorkflowSWToMainMessage): void {
    const clientId = this.workflowClients.get(chatId);
    if (clientId) {
      this.config.sendToClient(clientId, message);
    } else {
      // 如果没有客户端映射（可能是恢复的工作流），则广播
      console.warn(`[ChatWorkflowHandler] No client mapping for chat ${chatId}, broadcasting`);
      this.config.broadcast(message);
    }
  }
}
