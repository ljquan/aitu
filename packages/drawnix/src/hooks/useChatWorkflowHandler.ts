/**
 * useChatWorkflowHandler Hook
 *
 * Chat handler that uses Service Worker workflow for full chat + tool execution.
 * This replaces the original useChatHandler's tool execution logic with SW-based execution.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { chatStorageService } from '../services/chat-storage-service';
import { swChatWorkflowService } from '../services/sw-chat-workflow-service';
import { MessageStatus, MessageRole } from '../types/chat.types';
import type { ChatMessage, WorkflowMessageData, WorkflowStepData } from '../types/chat.types';
import type { ChatHandler, Message } from '@llamaindex/chat-ui';
import { generateSystemPrompt } from '../services/agent';
import { taskQueueService } from '../services/task-queue';
import { TaskStatus } from '../types/task.types';
import {
  WORKFLOW_MESSAGE_PREFIX,
  injectModelForGenerationTool,
  toChatUIMessage,
  fromChatUIMessage,
  toApiMessage,
  extractMessageText,
} from './chat-utils';

interface UseChatWorkflowHandlerOptions {
  sessionId: string | null;
  /** 临时模型 */
  temporaryModel?: string;
  /** 工作流更新回调 */
  onWorkflowUpdate?: (messageId: string, workflow: WorkflowMessageData) => void;
}

export function useChatWorkflowHandler(options: UseChatWorkflowHandlerOptions): ChatHandler & {
  isLoading: boolean;
  setMessagesWithRaw: (newMessages: Message[], rawChatMessages?: ChatMessage[]) => void;
  updateRawMessageWorkflow: (messageId: string, workflow: WorkflowMessageData) => void;
} {
  const { sessionId, temporaryModel, onWorkflowUpdate } = options;

  const systemPromptRef = useRef<string>(generateSystemPrompt());
  const onWorkflowUpdateRef = useRef(onWorkflowUpdate);
  onWorkflowUpdateRef.current = onWorkflowUpdate;

  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ChatHandler['status']>('ready');
  const [isLoading, setIsLoading] = useState(false);
  const currentAssistantMsgRef = useRef<string | null>(null);
  const rawMessagesRef = useRef<ChatMessage[]>([]);
  const workflowDataRef = useRef<Map<string, WorkflowMessageData>>(new Map());

  // Load messages when session changes
  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      rawMessagesRef.current = [];
      workflowDataRef.current.clear();
      return;
    }

    const loadMessages = async () => {
      setIsLoading(true);
      try {
        const loaded = await chatStorageService.getMessages(sessionId);
        rawMessagesRef.current = loaded;
        setMessages(loaded.map(toChatUIMessage));

        // Restore workflow data
        for (const msg of loaded) {
          if (msg.workflow) {
            workflowDataRef.current.set(msg.id, msg.workflow);
          }
        }
      } catch (error) {
        console.error('[useChatWorkflowHandler] Failed to load messages:', error);
        setMessages([]);
        rawMessagesRef.current = [];
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [sessionId]);

  // Send message implementation using SW workflow
  const sendMessage = useCallback(
    async (msg: Message) => {
      if (!sessionId) return;

      setStatus('submitted');

      // Convert to our format and save
      const ourMsg = fromChatUIMessage(msg, sessionId);
      await chatStorageService.addMessage(ourMsg);

      // Update messages state
      setMessages((prev) => [...prev, msg]);

      // Get current session for message count
      const session = await chatStorageService.getSession(sessionId);

      await chatStorageService.updateSession(sessionId, {
        updatedAt: Date.now(),
        messageCount: (session?.messageCount || 0) + 1,
      });

      // Create assistant message placeholder
      const assistantMsgId = chatStorageService.generateId();
      currentAssistantMsgRef.current = assistantMsgId;

      const assistantMsg: Message = {
        id: assistantMsgId,
        role: 'assistant',
        parts: [{ type: 'text', text: '' }],
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStatus('streaming');

      // Build conversation history
      const history: ChatMessage[] = rawMessagesRef.current.map(toApiMessage);
      history.push(ourMsg);
      rawMessagesRef.current = [...rawMessagesRef.current, ourMsg];

      // Get user message content
      const userContent = extractMessageText(msg);

      // Initialize workflow data for this message
      let currentWorkflow: WorkflowMessageData = {
        id: assistantMsgId,
        name: '分析中...',
        generationType: 'image',
        prompt: userContent,
        count: 1,
        steps: [],
      };

      try {
        await swChatWorkflowService.sendChatWorkflow(
          history.slice(0, -1),
          userContent,
          [],
          {
            onStream: (content) => {
              // Update message with streaming content
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, parts: [{ type: 'text', text: content }] }
                    : m
                )
              );
            },
            onToolCalls: (toolCalls, aiAnalysis) => {
              // Process tool calls - inject models
              const processedToolCalls = toolCalls.map(injectModelForGenerationTool);

              // Determine generation type from tool calls
              const hasVideo = processedToolCalls.some(tc => tc.name === 'generate_video');
              const generationType = hasVideo ? 'video' : 'image';

              // Update workflow data
              currentWorkflow = {
                id: assistantMsgId,
                name: aiAnalysis || '执行任务',
                generationType,
                prompt: userContent,
                aiAnalysis,
                count: processedToolCalls.length,
                steps: processedToolCalls.map((tc): WorkflowStepData => ({
                  id: tc.id,
                  description: `执行 ${tc.name}`,
                  mcp: tc.name,
                  args: tc.arguments,
                  status: 'pending',
                })),
              };

              workflowDataRef.current.set(assistantMsgId, currentWorkflow);

              // Update message to workflow format
              const workflowMessageContent = `${WORKFLOW_MESSAGE_PREFIX}${assistantMsgId}`;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, parts: [{ type: 'text', text: workflowMessageContent }] }
                    : m
                )
              );

              // Notify workflow update
              onWorkflowUpdateRef.current?.(assistantMsgId, currentWorkflow);
            },
            onToolStart: (toolCallId, _toolName) => {
              // Update step status to running
              const workflow = workflowDataRef.current.get(assistantMsgId);
              if (workflow) {
                const step = workflow.steps.find((s) => s.id === toolCallId);
                if (step) {
                  step.status = 'running';
                  onWorkflowUpdateRef.current?.(assistantMsgId, { ...workflow });
                }
              }
            },
            onToolComplete: (toolCallId, success, result, error, taskId) => {
              // Update step status and result
              const workflow = workflowDataRef.current.get(assistantMsgId);
              if (workflow) {
                const step = workflow.steps.find((s) => s.id === toolCallId);
                if (step) {
                  // 如果返回了 taskId，说明是队列任务，状态保持 running，等待任务真正完成
                  // 只有没有 taskId 的同步任务才立即标记为 completed/failed
                  if (taskId) {
                    step.status = 'running';
                  } else {
                    step.status = success ? 'completed' : 'failed';
                  }
                  step.result = {
                    success,
                    data: result,
                    error,
                    taskId,
                  };
                  onWorkflowUpdateRef.current?.(assistantMsgId, { ...workflow });
                }
              }
            },
            onComplete: (content, toolCalls, _aiAnalysis) => {
              // Finalize workflow - all steps should be completed
              const workflow = workflowDataRef.current.get(assistantMsgId);
              if (workflow) {
                onWorkflowUpdateRef.current?.(assistantMsgId, { ...workflow });
              }

              setStatus('ready');

              // Save assistant message
              const hasToolCalls = toolCalls.length > 0;
              const finalWorkflow = workflowDataRef.current.get(assistantMsgId);

              const assistantChatMsg: ChatMessage = {
                id: assistantMsgId,
                sessionId,
                role: MessageRole.ASSISTANT,
                content: hasToolCalls ? `${WORKFLOW_MESSAGE_PREFIX}${assistantMsgId}` : content,
                timestamp: Date.now(),
                status: MessageStatus.SUCCESS,
                workflow: finalWorkflow,
              };

              chatStorageService.addMessage(assistantChatMsg);
              rawMessagesRef.current = [...rawMessagesRef.current, assistantChatMsg];
              chatStorageService.updateSession(sessionId, {
                updatedAt: Date.now(),
                messageCount: (session?.messageCount || 0) + 2,
              });

              currentAssistantMsgRef.current = null;
            },
            onError: (error) => {
              setStatus('error');

              // Update workflow - mark all pending steps as failed
              const workflow = workflowDataRef.current.get(assistantMsgId);
              if (workflow) {
                for (const step of workflow.steps) {
                  if (step.status === 'pending' || step.status === 'running') {
                    step.status = 'failed';
                    step.error = error;
                  }
                }
                onWorkflowUpdateRef.current?.(assistantMsgId, { ...workflow });
              }

              // Display error
              const errorText = `❌ 错误: ${error}`;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, parts: [{ type: 'text', text: errorText }] }
                    : m
                )
              );

              // Save error message
              const errorChatMsg: ChatMessage = {
                id: assistantMsgId,
                sessionId,
                role: MessageRole.ASSISTANT,
                content: errorText,
                timestamp: Date.now(),
                status: MessageStatus.FAILED,
                error,
              };
              chatStorageService.addMessage(errorChatMsg);
              rawMessagesRef.current = [...rawMessagesRef.current, errorChatMsg];

              currentAssistantMsgRef.current = null;
            },
          },
          temporaryModel,
          systemPromptRef.current
        );
      } catch (error: any) {
        if (error.message !== 'Request cancelled') {
          setStatus('error');
          console.error('[useChatWorkflowHandler] Error:', error);

          const errorText = `❌ 错误: ${error.message || '未知错误'}`;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, parts: [{ type: 'text', text: errorText }] }
                : m
            )
          );

          if (sessionId && assistantMsgId) {
            const errorChatMsg: ChatMessage = {
              id: assistantMsgId,
              sessionId,
              role: MessageRole.ASSISTANT,
              content: errorText,
              timestamp: Date.now(),
              status: MessageStatus.FAILED,
              error: error.message || '未知错误',
            };
            chatStorageService.addMessage(errorChatMsg);
            rawMessagesRef.current = [...rawMessagesRef.current, errorChatMsg];
          }
        }
        currentAssistantMsgRef.current = null;
      }
    },
    [sessionId, temporaryModel]
  );

  // Stop generation
  const stop = useCallback(async () => {
    swChatWorkflowService.stopWorkflow();
    setStatus('ready');

    if (currentAssistantMsgRef.current && sessionId) {
      const currentMsg = messages.find((m) => m.id === currentAssistantMsgRef.current);
      if (currentMsg) {
        const content = extractMessageText(currentMsg);

        const assistantChatMsg: ChatMessage = {
          id: currentMsg.id,
          sessionId,
          role: MessageRole.ASSISTANT,
          content,
          timestamp: Date.now(),
          status: MessageStatus.SUCCESS,
        };
        await chatStorageService.addMessage(assistantChatMsg);
      }
      currentAssistantMsgRef.current = null;
    }
  }, [sessionId, messages]);

  // Regenerate last response
  const regenerate = useCallback(
    (_opts?: { messageId?: string }) => {
      if (messages.length < 2) return;

      const lastUserMsgIndex = [...messages]
        .reverse()
        .findIndex((m) => m.role === 'user');
      if (lastUserMsgIndex === -1) return;

      const actualIndex = messages.length - 1 - lastUserMsgIndex;
      const lastUserMsg = messages[actualIndex];

      const newMessages = messages.slice(0, actualIndex + 1);
      setMessages(newMessages);

      sendMessage(lastUserMsg);
    },
    [messages, sendMessage]
  );

  // 监听任务状态变化，更新工作流中的步骤状态
  useEffect(() => {
    const subscription = taskQueueService.observeTaskUpdates().subscribe((event) => {
      if (event.type !== 'taskUpdated') return;

      const task = event.task;

      // 遍历所有工作流，查找包含此任务的步骤
      workflowDataRef.current.forEach((workflow, messageId) => {
        const step = workflow.steps.find((s) => {
          const result = s.result as { taskId?: string } | undefined;
          return result?.taskId === task.id;
        });

        if (!step) return;

        // 根据任务状态更新步骤状态
        let newStatus: WorkflowStepData['status'] = step.status;

        switch (task.status) {
          case TaskStatus.PENDING:
          case TaskStatus.PROCESSING:
          case TaskStatus.RETRYING:
            newStatus = 'running';
            break;
          case TaskStatus.COMPLETED:
            newStatus = 'completed';
            break;
          case TaskStatus.FAILED:
            newStatus = 'failed';
            break;
          case TaskStatus.CANCELLED:
            newStatus = 'skipped';
            break;
        }

        // 只有状态变化时才更新
        if (newStatus !== step.status) {
          step.status = newStatus;
          if (task.status === TaskStatus.COMPLETED && task.result) {
            step.result = {
              ...(typeof step.result === 'object' && step.result !== null ? step.result : {}),
              url: task.result.url,
              success: true,
            };
          } else if (task.status === TaskStatus.FAILED) {
            step.error = task.error?.message || '任务执行失败';
          }

          // 触发更新
          onWorkflowUpdateRef.current?.(messageId, { ...workflow });

          // 更新存储
          rawMessagesRef.current = rawMessagesRef.current.map(msg =>
            msg.id === messageId ? { ...msg, workflow: { ...workflow } } : msg
          );
        }
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  const setMessagesWithRaw = useCallback((
    newMessages: Message[],
    rawChatMessages?: ChatMessage[]
  ) => {
    setMessages(newMessages);
    if (rawChatMessages) {
      rawMessagesRef.current = rawChatMessages;
    }
  }, []);

  const updateRawMessageWorkflow = useCallback((
    messageId: string,
    workflow: WorkflowMessageData
  ) => {
    rawMessagesRef.current = rawMessagesRef.current.map(msg =>
      msg.id === messageId ? { ...msg, workflow } : msg
    );
    workflowDataRef.current.set(messageId, workflow);
  }, []);

  return {
    messages,
    status,
    sendMessage,
    stop,
    regenerate,
    setMessages,
    setMessagesWithRaw,
    updateRawMessageWorkflow,
    isLoading,
  };
}
