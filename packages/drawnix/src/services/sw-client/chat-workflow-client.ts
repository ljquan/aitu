/**
 * Chat Workflow Client for Main Thread
 *
 * Provides API for starting and managing chat workflows via Service Worker.
 */

import { Subject, Observable, filter, map, take, firstValueFrom, timeout } from 'rxjs';
import type {
  ChatWorkflowStatus,
  ChatToolCall,
  ChatWorkflow,
  ChatWorkflowMainToSWMessage,
  ChatWorkflowSWToMainMessage,
  ChatWorkflowEventHandlers,
  ChatWorkflowAllResponseMessage,
} from './chat-workflow-types';
import type { ChatParams } from './types';

/**
 * Chat Workflow Client
 */
export class ChatWorkflowClient {
  private static instance: ChatWorkflowClient | null = null;

  private messageSubject = new Subject<ChatWorkflowSWToMainMessage>();
  private workflowHandlers: Map<string, ChatWorkflowEventHandlers> = new Map();
  /** Global handlers for workflows without specific handlers (e.g., recovered workflows) */
  private globalHandlers: ChatWorkflowEventHandlers | null = null;
  private initialized = false;

  private constructor() {
    this.setupMessageListener();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ChatWorkflowClient {
    if (!ChatWorkflowClient.instance) {
      ChatWorkflowClient.instance = new ChatWorkflowClient();
    }
    return ChatWorkflowClient.instance;
  }

  /**
   * Start a chat workflow
   */
  startWorkflow(
    chatId: string,
    params: ChatParams,
    handlers: ChatWorkflowEventHandlers
  ): void {
    // Store handlers
    this.workflowHandlers.set(chatId, handlers);

    // Send start message to SW
    this.postMessage({
      type: 'CHAT_WORKFLOW_START',
      chatId,
      params,
    });
  }

  /**
   * Cancel a chat workflow
   */
  cancelWorkflow(chatId: string): void {
    this.postMessage({
      type: 'CHAT_WORKFLOW_CANCEL',
      chatId,
    });
    this.workflowHandlers.delete(chatId);
  }

  /**
   * Set global handlers for recovered workflows
   * These handlers will be used when no specific handlers are registered
   */
  setGlobalHandlers(handlers: ChatWorkflowEventHandlers | null): void {
    this.globalHandlers = handlers;
  }

  /**
   * Get all active workflows from SW (for page refresh recovery)
   */
  async getAllActiveWorkflows(): Promise<ChatWorkflow[]> {
    this.postMessage({
      type: 'CHAT_WORKFLOW_GET_ALL',
    });

    try {
      const response = await firstValueFrom(
        this.messageSubject.pipe(
          filter((msg) => msg.type === 'CHAT_WORKFLOW_ALL_RESPONSE'),
          take(1),
          timeout(5000)
        )
      );

      if (response.type === 'CHAT_WORKFLOW_ALL_RESPONSE') {
        return (response as ChatWorkflowAllResponseMessage).workflows;
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(chatId: string): Promise<ChatWorkflow | null> {
    this.postMessage({
      type: 'CHAT_WORKFLOW_GET_STATUS',
      chatId,
    });

    try {
      const response = await firstValueFrom(
        this.messageSubject.pipe(
          filter((msg) => msg.type === 'CHAT_WORKFLOW_STATUS_RESPONSE' && msg.chatId === chatId),
          take(1),
          timeout(5000)
        )
      );

      if (response.type === 'CHAT_WORKFLOW_STATUS_RESPONSE') {
        return response.workflow;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Observe workflow messages
   */
  observeMessages(): Observable<ChatWorkflowSWToMainMessage> {
    return this.messageSubject.asObservable();
  }

  /**
   * Observe workflow stream for a specific chat
   */
  observeStream(chatId: string): Observable<string> {
    return this.messageSubject.pipe(
      filter((msg) => msg.type === 'CHAT_WORKFLOW_STREAM' && msg.chatId === chatId),
      map((msg) => (msg as { type: 'CHAT_WORKFLOW_STREAM'; chatId: string; content: string }).content)
    );
  }

  /**
   * Observe workflow completion
   */
  observeCompletion(chatId: string): Observable<{
    content: string;
    toolCalls: ChatToolCall[];
    aiAnalysis?: string;
  }> {
    return this.messageSubject.pipe(
      filter((msg) => msg.type === 'CHAT_WORKFLOW_COMPLETE' && msg.chatId === chatId),
      map((msg) => {
        const m = msg as {
          type: 'CHAT_WORKFLOW_COMPLETE';
          chatId: string;
          content: string;
          toolCalls: ChatToolCall[];
          aiAnalysis?: string;
        };
        return {
          content: m.content,
          toolCalls: m.toolCalls,
          aiAnalysis: m.aiAnalysis,
        };
      }),
      take(1)
    );
  }

  /**
   * Check if Service Worker is supported
   */
  isServiceWorkerSupported(): boolean {
    return 'serviceWorker' in navigator;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Setup message listener
   */
  private setupMessageListener(): void {
    if (!this.isServiceWorkerSupported()) return;

    navigator.serviceWorker.addEventListener('message', (event) => {
      const message = event.data as ChatWorkflowSWToMainMessage;
      if (!message || !message.type) return;

      // Check if it's a chat workflow message
      if (!this.isChatWorkflowMessage(message)) return;

      // Emit to subject
      this.messageSubject.next(message);

      // Call handlers
      this.handleMessage(message);
    });

    this.initialized = true;
  }

  /**
   * Check if message is a chat workflow message
   */
  private isChatWorkflowMessage(message: any): boolean {
    return message.type?.startsWith('CHAT_WORKFLOW_') || false;
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: ChatWorkflowSWToMainMessage): void {
    const chatId = (message as { chatId?: string }).chatId;
    if (!chatId) return;

    // Try specific handlers first, then fall back to global handlers
    const handlers = this.workflowHandlers.get(chatId) || this.globalHandlers;
    if (!handlers) return;

    switch (message.type) {
      case 'CHAT_WORKFLOW_STREAM':
        handlers.onStream?.(chatId, message.content);
        break;

      case 'CHAT_WORKFLOW_STATUS':
        handlers.onStatusChange?.(chatId, message.status);
        break;

      case 'CHAT_WORKFLOW_TOOL_CALLS':
        handlers.onToolCalls?.(chatId, message.toolCalls, message.aiAnalysis);
        break;

      case 'CHAT_WORKFLOW_TOOL_START':
        handlers.onToolStart?.(chatId, message.toolCallId, message.toolName);
        break;

      case 'CHAT_WORKFLOW_TOOL_COMPLETE':
        handlers.onToolComplete?.(
          chatId,
          message.toolCallId,
          message.success,
          message.result,
          message.error,
          message.taskId
        );
        break;

      case 'CHAT_WORKFLOW_COMPLETE':
        handlers.onComplete?.(chatId, message.content, message.toolCalls, message.aiAnalysis);
        this.workflowHandlers.delete(chatId);
        break;

      case 'CHAT_WORKFLOW_FAILED':
        handlers.onError?.(chatId, message.error);
        this.workflowHandlers.delete(chatId);
        break;

      case 'CHAT_WORKFLOW_RECOVERED':
        handlers.onRecovered?.(chatId, message.workflow);
        break;
    }
  }

  /**
   * Post message to Service Worker
   */
  private async postMessage(message: ChatWorkflowMainToSWMessage): Promise<void> {
    if (!this.isServiceWorkerSupported()) {
      console.warn('[ChatWorkflowClient] Service Worker not supported');
      return;
    }

    let controller = navigator.serviceWorker.controller;
    if (!controller) {
      const registration = await navigator.serviceWorker.ready;
      controller = registration.active;
      if (!controller) {
        console.warn('[ChatWorkflowClient] No active Service Worker');
        return;
      }
    }

    controller.postMessage(message);
  }
}

// Export singleton instance
export const chatWorkflowClient = ChatWorkflowClient.getInstance();
