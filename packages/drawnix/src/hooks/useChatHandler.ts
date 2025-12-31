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
import type { ChatMessage } from '../types/chat.types';
import type { ChatHandler, Message, MessagePart } from '@llamaindex/chat-ui';

interface UseChatHandlerOptions {
  sessionId: string | null;
  onSessionTitleUpdate?: (sessionId: string, title: string) => void;
  /** 临时模型（仅在当前会话中使用，不影响全局设置） */
  temporaryModel?: string;
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
  const { sessionId, onSessionTitleUpdate, temporaryModel } = options;

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

  // Generate session title from first user message
  const generateTitle = useCallback(
    (content: string) => {
      if (!sessionId) return;
      const title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
      onSessionTitleUpdate?.(sessionId, title);
    },
    [sessionId, onSessionTitleUpdate]
  );

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

      // Update session title from first message
      const session = await chatStorageService.getSession(sessionId);
      if (session && session.messageCount === 0) {
        const textContent = msg.parts
          .filter((p) => p.type === 'text')
          .map((p) => (p as { type: 'text'; text: string }).text)
          .join('');
        generateTitle(textContent);
      }

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
              setStatus('ready');

              // Save assistant message
              const assistantChatMsg: ChatMessage = {
                id: assistantMsgId,
                sessionId,
                role: MessageRole.ASSISTANT,
                content: fullContent,
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
          temporaryModel // 传递临时模型
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
    [sessionId, messages, generateTitle]
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
    (opts?: { messageId?: string }) => {
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
