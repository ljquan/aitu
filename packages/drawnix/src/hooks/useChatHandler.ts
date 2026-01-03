/**
 * useChatHandler Hook
 *
 * Adapter hook that connects our Gemini API and storage
 * with @llamaindex/chat-ui's ChatHandler interface.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { chatStorageService } from '../services/chat-storage-service';
import { chatService } from '../services/chat-service';
import { MessageStatus, MessageRole } from '../types/chat.types';
import type { ChatMessage, WorkflowMessageData } from '../types/chat.types';
import type { ChatHandler, Message, MessagePart } from '@llamaindex/chat-ui';
import { generateSystemPrompt } from '../services/agent';
import { parseToolCalls, extractTextContent } from '../services/agent/tool-parser';
import { mcpRegistry, initializeMCP } from '../mcp';
import type { ToolCall, MCPTaskResult } from '../mcp/types';
import { geminiSettings } from '../utils/settings-manager';
import { getModelType, IMAGE_MODELS } from '../mcp/types';

// 确保 MCP 模块已初始化
initializeMCP();

// 生成类工具列表
const GENERATION_TOOLS = ['generate_image', 'generate_video', 'generate_grid_image', 'generate_photo_wall'];

/**
 * 为生成工具注入正确的模型
 * 如果 AI 没有指定模型或指定了文本模型，使用默认的图片/视频模型
 */
function injectModelForGenerationTool(toolCall: ToolCall): ToolCall {
  if (!GENERATION_TOOLS.includes(toolCall.name)) {
    return toolCall;
  }

  const args = { ...toolCall.arguments };
  const specifiedModel = args.model as string | undefined;

  // 判断是否需要注入模型
  let needsInjection = false;
  let targetModel: string;

  if (!specifiedModel) {
    // 没有指定模型
    needsInjection = true;
  } else {
    // 检查指定的模型类型是否正确
    const modelType = getModelType(specifiedModel);
    const isVideoTool = toolCall.name === 'generate_video';

    if (isVideoTool && modelType !== 'video') {
      needsInjection = true;
    } else if (!isVideoTool && modelType !== 'image') {
      needsInjection = true;
    }
  }

  if (needsInjection) {
    // 获取默认模型
    const settings = geminiSettings.get();
    const isVideoTool = toolCall.name === 'generate_video';

    if (isVideoTool) {
      targetModel = settings.videoModelName || 'veo3';
    } else {
      targetModel = settings.imageModelName || IMAGE_MODELS[0]?.id || 'gemini-2.5-flash-image-vip';
    }

    args.model = targetModel;
    console.log(`[useChatHandler] Injected model '${targetModel}' into ${toolCall.name} (was: ${specifiedModel || 'undefined'})`);
  }

  return { ...toolCall, arguments: args };
}

/** 工具调用结果 */
interface ToolCallResult {
  toolCall: ToolCall;
  success: boolean;
  data?: unknown;
  error?: string;
  taskId?: string;
}

interface UseChatHandlerOptions {
  sessionId: string | null;
  /** 临时模型（仅在当前会话中使用，不影响全局设置） */
  temporaryModel?: string;
  /** 工具调用回调 - 当 AI 响应中包含工具调用时触发 */
  onToolCalls?: (
    toolCalls: ToolCall[],
    messageId: string,
    executeTools: () => Promise<ToolCallResult[]>
  ) => void;
  /** 工作流消息更新回调 */
  onWorkflowUpdate?: (messageId: string, workflow: WorkflowMessageData) => void;
}

// Convert our ChatMessage to chat-ui Message format
function toChatUIMessage(msg: ChatMessage): Message {
  const parts: MessagePart[] = [{ type: 'text', text: msg.content }];

  // Add file parts for attachments
  if (msg.attachments && msg.attachments.length > 0) {
    for (const att of msg.attachments) {
      parts.push({
        type: 'data-file',
        data: {
          filename: att.name,
          mediaType: att.type,
          url: att.data,
        },
      });
    }
  }

  return {
    id: msg.id,
    role: msg.role === MessageRole.USER ? 'user' : 'assistant',
    parts,
  };
}

// Convert chat-ui Message to our ChatMessage format
function fromChatUIMessage(msg: Message, sessionId: string): ChatMessage {
  // Extract text content
  const textParts = msg.parts.filter((p) => p.type === 'text');
  const content = textParts.map((p) => (p as { type: 'text'; text: string }).text).join('');

  // Extract attachments
  const fileParts = msg.parts.filter((p) => p.type === 'data-file');
  const attachments = fileParts.map((p, idx) => {
    const data = (p as any).data;
    return {
      id: `${msg.id}-att-${idx}`,
      name: data.filename,
      type: data.mediaType,
      size: 0,
      data: data.url,
      isBlob: false,
    };
  });

  return {
    id: msg.id,
    sessionId,
    role: msg.role === 'user' ? MessageRole.USER : MessageRole.ASSISTANT,
    content,
    timestamp: Date.now(),
    status: MessageStatus.SUCCESS,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

export function useChatHandler(options: UseChatHandlerOptions): ChatHandler & {
  isLoading: boolean;
} {
  const { sessionId, temporaryModel, onToolCalls, onWorkflowUpdate } = options;

  // 生成系统提示词（包含 MCP 工具定义）
  const systemPromptRef = useRef<string>(generateSystemPrompt());

  // 存储回调的 ref，避免依赖变化
  const onToolCallsRef = useRef(onToolCalls);
  onToolCallsRef.current = onToolCalls;
  const onWorkflowUpdateRef = useRef(onWorkflowUpdate);
  onWorkflowUpdateRef.current = onWorkflowUpdate;

  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ChatHandler['status']>('ready');
  const [isLoading, setIsLoading] = useState(false);
  const currentAssistantMsgRef = useRef<string | null>(null);

  // Load messages when session changes
  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      setIsLoading(true);
      try {
        const loaded = await chatStorageService.getMessages(sessionId);
        setMessages(loaded.map(toChatUIMessage));
      } catch (error) {
        console.error('[useChatHandler] Failed to load messages:', error);
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [sessionId]);

  // Send message implementation
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
      const history: ChatMessage[] = messages.map((m) => fromChatUIMessage(m, sessionId));
      history.push(ourMsg);

      // Get the user message content
      const userContent = msg.parts
        .filter((p) => p.type === 'text')
        .map((p) => (p as { type: 'text'; text: string }).text)
        .join('');

      let fullContent = '';

      try {
        await chatService.sendChatMessage(
          history.slice(0, -1), // Exclude the new user message from history
          userContent,
          [], // Attachments handled separately
          (event) => {
            if (event.type === 'content' && event.content) {
              fullContent += event.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, parts: [{ type: 'text', text: fullContent }] }
                    : m
                )
              );
            } else if (event.type === 'done') {
              // 解析工具调用
              const toolCalls = parseToolCalls(fullContent);
              const textContent = extractTextContent(fullContent) || fullContent;

              if (toolCalls.length > 0 && onToolCallsRef.current) {
                // 为生成工具注入正确的模型
                const processedToolCalls = toolCalls.map(injectModelForGenerationTool);

                // 有工具调用，创建执行函数
                const executeTools = async (): Promise<ToolCallResult[]> => {
                  const results: ToolCallResult[] = [];
                  for (const toolCall of processedToolCalls) {
                    try {
                      const result = await mcpRegistry.executeTool(toolCall) as MCPTaskResult;
                      results.push({
                        toolCall,
                        success: result.success,
                        data: result.data,
                        error: result.error,
                        taskId: result.taskId,
                      });
                    } catch (error: any) {
                      results.push({
                        toolCall,
                        success: false,
                        error: error.message || '工具执行失败',
                      });
                    }
                  }
                  return results;
                };

                // 更新消息为纯文本内容（移除 JSON 格式）
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, parts: [{ type: 'text', text: textContent }] }
                      : m
                  )
                );

                // 触发回调，让 ChatDrawer 处理工具执行和 UI 显示
                onToolCallsRef.current(processedToolCalls, assistantMsgId, executeTools);
              }

              setStatus('ready');

              // Save assistant message（保存原始内容或提取后的文本）
              const assistantChatMsg: ChatMessage = {
                id: assistantMsgId,
                sessionId,
                role: MessageRole.ASSISTANT,
                content: toolCalls.length > 0 ? textContent : fullContent,
                timestamp: Date.now(),
                status: MessageStatus.SUCCESS,
              };
              chatStorageService.addMessage(assistantChatMsg);
              chatStorageService.updateSession(sessionId, {
                updatedAt: Date.now(),
                messageCount: (session?.messageCount || 0) + 2,
              });

              currentAssistantMsgRef.current = null;
            } else if (event.type === 'error' && event.error) {
              setStatus('error');

              // Display error message in chat
              const errorText = `❌ 错误: ${event.error}`;
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
                error: event.error,
              };
              chatStorageService.addMessage(errorChatMsg);

              currentAssistantMsgRef.current = null;
            }
          },
          temporaryModel, // 传递临时模型
          systemPromptRef.current // 传递系统提示词
        );
      } catch (error: any) {
        if (error.message !== 'Request cancelled') {
          setStatus('error');
          console.error('[useChatHandler] Stream error:', error);

          // Display error in chat
          const errorText = `❌ 错误: ${error.message || '未知错误'}`;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, parts: [{ type: 'text', text: errorText }] }
                : m
            )
          );

          // Save error message
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
          }
        }
        currentAssistantMsgRef.current = null;
      }
    },
    [sessionId, messages]
  );

  // Stop generation
  const stop = useCallback(async () => {
    chatService.stopGeneration();
    setStatus('ready');

    if (currentAssistantMsgRef.current && sessionId) {
      // Save current content
      const currentMsg = messages.find(
        (m) => m.id === currentAssistantMsgRef.current
      );
      if (currentMsg) {
        const content = currentMsg.parts
          .filter((p) => p.type === 'text')
          .map((p) => (p as { type: 'text'; text: string }).text)
          .join('');

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

      // Find the last user message
      const lastUserMsgIndex = [...messages]
        .reverse()
        .findIndex((m) => m.role === 'user');
      if (lastUserMsgIndex === -1) return;

      const actualIndex = messages.length - 1 - lastUserMsgIndex;
      const lastUserMsg = messages[actualIndex];

      // Remove messages after the user message
      const newMessages = messages.slice(0, actualIndex + 1);
      setMessages(newMessages);

      // Re-send the user message
      sendMessage(lastUserMsg);
    },
    [messages, sendMessage]
  );

  return {
    messages,
    status,
    sendMessage,
    stop,
    regenerate,
    setMessages,
    isLoading,
  };
}
