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
import { taskQueueStorage } from '../storage';

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
   * Restore chat workflows from IndexedDB on SW startup
   * Strategy: Mark interrupted workflows as failed (streaming cannot resume)
   */
  private async restoreFromStorage(): Promise<void> {
    try {
      // console.log('[ChatWorkflowHandler] Restoring workflows from storage...');
      const workflows = await taskQueueStorage.getAllChatWorkflows();

      // console.log(`[ChatWorkflowHandler] Found ${workflows.length} chat workflows`);

      for (const workflow of workflows) {
        // Skip completed/cancelled/failed workflows (keep in memory for queries)
        if (workflow.status === 'completed' || workflow.status === 'cancelled' || workflow.status === 'failed') {
          this.workflows.set(workflow.id, workflow);
          continue;
        }

        // Handle interrupted workflows - mark as failed
        // Streaming phase cannot be resumed, so we fail the workflow
        await this.handleInterruptedWorkflow(workflow);
      }

      this.storageRestored = true;
      // console.log('[ChatWorkflowHandler] Storage restoration complete');
    } catch (error) {
      console.error('[ChatWorkflowHandler] Failed to restore from storage:', error);
      this.storageRestored = true; // Mark as done even on error
    }
  }

  /**
   * Handle an interrupted chat workflow
   * Strategy: Mark as failed with appropriate message
   */
  private async handleInterruptedWorkflow(workflow: ChatWorkflow): Promise<void> {
    // console.log(`[ChatWorkflowHandler] Handling interrupted workflow: ${workflow.id}, status: ${workflow.status}`);

    let errorMessage: string;
    switch (workflow.status) {
      case 'streaming':
        errorMessage = 'AI 响应流传输时中断，请重试';
        break;
      case 'parsing':
        errorMessage = '工具调用解析时中断，请重试';
        break;
      case 'executing_tools':
        errorMessage = '工具执行时中断，请重试';
        break;
      case 'pending':
        errorMessage = '工作流尚未开始执行，请重试';
        break;
      default:
        errorMessage = '工作流执行时中断，请重试';
    }

    // Mark as failed
    workflow.status = 'failed';
    workflow.error = errorMessage;
    workflow.updatedAt = Date.now();

    // Mark any running tool calls as failed
    for (const toolCall of workflow.toolCalls) {
      if (toolCall.status === 'running' || toolCall.status === 'pending') {
        toolCall.status = 'failed';
        toolCall.result = {
          success: false,
          error: 'Service Worker 重启导致执行中断',
        };
      }
    }

    // Store in memory
    this.workflows.set(workflow.id, workflow);

    // Update in IndexedDB
    await taskQueueStorage.saveChatWorkflow(workflow);

    // console.log(`[ChatWorkflowHandler] Marked workflow ${workflow.id} as failed due to interruption`);
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
    console.log('[SW-ChatWorkflow] ▶ startWorkflow:', {
      chatId,
      clientId,
      existingWorkflows: this.workflows.size,
      timestamp: new Date().toISOString(),
    });
    
    // Check for duplicate
    const existing = this.workflows.get(chatId);
    if (existing) {
      if (existing.status === 'streaming' || existing.status === 'pending' || existing.status === 'executing_tools') {
        console.log('[SW-ChatWorkflow] Re-claiming active workflow:', {
          chatId,
          status: existing.status,
        });
        this.broadcastStatus(existing);
        return;
      }
      console.warn('[SW-ChatWorkflow] Workflow already exists, skipping:', {
        chatId,
        status: existing.status,
      });
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
   * Broadcast all workflows that were recovered from storage
   * This is called when a new client connects to sync state
   */
  broadcastRecoveredWorkflows(): void {
    // console.log(`[ChatWorkflowHandler] Broadcasting ${this.workflows.size} chat workflows to sync state`);
    for (const workflow of this.workflows.values()) {
      this.config.broadcast({
        type: 'CHAT_WORKFLOW_RECOVERED',
        chatId: workflow.id,
        workflow,
      });
    }
  }

  /**
   * Get workflow by ID
   */
  getWorkflow(chatId: string): ChatWorkflow | undefined {
    return this.workflows.get(chatId);
  }

  /**
   * Get all active workflows (for page refresh recovery)
   */
  getAllWorkflows(): ChatWorkflow[] {
    return Array.from(this.workflows.values()).filter(
      workflow => workflow.status !== 'completed' && 
                  workflow.status !== 'failed' && 
                  workflow.status !== 'cancelled'
    );
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

      // Broadcast tool calls
      if (toolCalls.length > 0) {
        this.config.broadcast({
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
      }

      // Phase 4: Complete
      workflow.status = 'completed';
      workflow.completedAt = Date.now();
      workflow.updatedAt = Date.now();

      // Persist completed state
      await taskQueueStorage.saveChatWorkflow(workflow);

      this.config.broadcast({
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

        this.config.broadcast({
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
    
    console.log('[SW-ChatWorkflow] streamChat called:', {
      workflowId: workflow.id,
      model,
      messagesCount: messages.length,
      timestamp: new Date().toISOString(),
    });

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
                // Broadcast accumulated content
                this.config.broadcast({
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
              this.config.broadcast({
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

      // Update tool status to running
      toolCall.status = 'running';
      this.config.broadcast({
        type: 'CHAT_WORKFLOW_TOOL_START',
        chatId: workflow.id,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
      });

      try {
        let result: { success: boolean; data?: unknown; error?: string; taskId?: string };

        // Check if tool needs main thread
        if (requiresMainThread(toolCall.name) || !getSWMCPTool(toolCall.name)) {
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

        this.config.broadcast({
          type: 'CHAT_WORKFLOW_TOOL_COMPLETE',
          chatId: workflow.id,
          toolCallId: toolCall.id,
          success: result.success,
          result: result.data,
          error: result.error,
          taskId: result.taskId,
        });

      } catch (error: any) {
        toolCall.status = 'failed';
        toolCall.result = {
          success: false,
          error: error.message,
        };

        // Persist tool failure
        await taskQueueStorage.saveChatWorkflow(workflow);

        this.config.broadcast({
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
   * Broadcast workflow status
   */
  private broadcastStatus(workflow: ChatWorkflow): void {
    this.config.broadcast({
      type: 'CHAT_WORKFLOW_STATUS',
      chatId: workflow.id,
      status: workflow.status,
      updatedAt: workflow.updatedAt,
    });
  }
}
