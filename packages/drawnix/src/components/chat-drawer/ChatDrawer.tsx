/**
 * ChatDrawer Component
 *
 * Main chat drawer component using @llamaindex/chat-ui.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { CloseIcon, AddIcon, ViewListIcon } from 'tdesign-icons-react';
import { Tooltip } from 'tdesign-react';
import {
  ChatSection,
  ChatMessages,
  ChatInput,
  ChatMessage,
} from '@llamaindex/chat-ui';
import '@llamaindex/chat-ui/styles/markdown.css';
import '@llamaindex/chat-ui/styles/pdf.css';
import { SessionList } from './SessionList';
import { ChatDrawerTrigger } from './ChatDrawerTrigger';
import { MermaidRenderer } from './MermaidRenderer';
import { ModelSelector } from './ModelSelector';
import { chatStorageService } from '../../services/chat-storage-service';
import { useChatHandler } from '../../hooks/useChatHandler';
import { geminiSettings } from '../../utils/settings-manager';
import { useDrawnix } from '../../hooks/use-drawnix';
import type { ChatDrawerProps, ChatSession } from '../../types/chat.types';
import type { Message } from '@llamaindex/chat-ui';

export const ChatDrawer: React.FC<ChatDrawerProps> = React.memo(
  ({ defaultOpen = false, onOpenChange }) => {
    // Initialize state from cache synchronously to prevent flash
    const [isOpen, setIsOpen] = useState(() => {
      const cached = chatStorageService.getDrawerState();
      return cached.isOpen ?? defaultOpen;
    });
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [showSessions, setShowSessions] = useState(false);

    // Refs for click outside detection
    const sessionListRef = React.useRef<HTMLDivElement>(null);
    const toggleButtonRef = React.useRef<HTMLButtonElement>(null);

    // Get app state for settings dialog
    const { appState, setAppState } = useDrawnix();

    // Handle session title updates
    const handleSessionTitleUpdate = useCallback(
      async (sessionId: string, title: string) => {
        await chatStorageService.updateSession(sessionId, { title });
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
        );
      },
      []
    );

    const chatHandler = useChatHandler({
      sessionId: activeSessionId,
      onSessionTitleUpdate: handleSessionTitleUpdate,
    });

    // Load initial sessions and active session
    useEffect(() => {
      const init = async () => {
        const drawerState = chatStorageService.getDrawerState();
        const loadedSessions = await chatStorageService.getAllSessions();
        setSessions(loadedSessions);

        if (drawerState.activeSessionId) {
          setActiveSessionId(drawerState.activeSessionId);
        } else if (loadedSessions.length > 0) {
          setActiveSessionId(loadedSessions[0].id);
        }
      };

      init();
    }, []);

    // Save drawer state when it changes
    useEffect(() => {
      chatStorageService.setDrawerState({
        isOpen,
        activeSessionId,
      });
    }, [isOpen, activeSessionId]);

    // Send pending message when session is ready
    useEffect(() => {
      if (activeSessionId && pendingMessageRef.current) {
        const msg = pendingMessageRef.current;
        pendingMessageRef.current = null;
        // Use setTimeout to ensure handler is updated
        setTimeout(() => {
          chatHandler.sendMessage(msg);
        }, 100);
      }
    }, [activeSessionId, chatHandler]);

    // Send pending message when API key is configured and settings dialog closes
    useEffect(() => {
      // When settings dialog closes, check if we have a pending message and API key
      if (!appState.openSettings && pendingMessageRef.current) {
        const settings = geminiSettings.get();
        if (settings?.apiKey) {
          const msg = pendingMessageRef.current;
          pendingMessageRef.current = null;
          // If there's no active session, create one first
          if (!activeSessionId) {
            (async () => {
              const newSession = await chatStorageService.createSession();
              setSessions((prev) => [newSession, ...prev]);
              setActiveSessionId(newSession.id);
              // Store message again for the session effect to pick up
              pendingMessageRef.current = msg;
            })();
          } else {
            // Send immediately if session exists
            setTimeout(() => {
              chatHandler.sendMessage(msg);
            }, 100);
          }
        }
      }
    }, [appState.openSettings, activeSessionId, chatHandler]);

    // Handle Escape key to close drawer
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && isOpen) {
          setIsOpen(false);
          onOpenChange?.(false);
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onOpenChange]);

    // Handle click outside to close session list
    useEffect(() => {
      if (!showSessions) return;

      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;

        // Check if click is inside a TDesign Dialog (rendered outside the component tree)
        const isInDialog = target.closest('.t-dialog') !== null;
        if (isInDialog) {
          return;
        }

        // Check if click is outside session list and toggle button
        if (
          sessionListRef.current &&
          !sessionListRef.current.contains(target) &&
          toggleButtonRef.current &&
          !toggleButtonRef.current.contains(target)
        ) {
          setShowSessions(false);
        }
      };

      // Add small delay to avoid immediate closing when opening
      const timer = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);

      return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [showSessions]);

    // Toggle drawer
    const handleToggle = useCallback(() => {
      setIsOpen((prev) => {
        const newValue = !prev;
        onOpenChange?.(newValue);
        return newValue;
      });
    }, [onOpenChange]);

    // Close drawer
    const handleClose = useCallback(() => {
      setIsOpen(false);
      onOpenChange?.(false);
    }, [onOpenChange]);

    // Create new session
    const handleNewSession = useCallback(async () => {
      const newSession = await chatStorageService.createSession();
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      setShowSessions(false);
    }, []);

    // Toggle session list
    const handleToggleSessions = useCallback(() => {
      setShowSessions((prev) => !prev);
    }, []);

    // Select session
    const handleSelectSession = useCallback((sessionId: string) => {
      setActiveSessionId(sessionId);
      setShowSessions(false);
    }, []);

    // Delete session
    const handleDeleteSession = useCallback(
      async (sessionId: string) => {
        await chatStorageService.deleteSession(sessionId);
        setSessions((prev) => {
          const updated = prev.filter((s) => s.id !== sessionId);
          if (activeSessionId === sessionId) {
            const newActive = updated[0] || null;
            setActiveSessionId(newActive?.id || null);
          }
          return updated;
        });
      },
      [activeSessionId]
    );

    // Store pending message for retry after session creation or API key config
    const pendingMessageRef = React.useRef<Message | null>(null);

    // Handle send with auto-create session
    const handleSendWrapper = useCallback(
      async (msg: Message) => {
        // Check if API key is configured
        const settings = geminiSettings.get();
        if (!settings?.apiKey) {
          // Store message for sending after API key is configured
          pendingMessageRef.current = msg;
          // Open settings dialog to configure API key
          setAppState({ ...appState, openSettings: true });
          return;
        }

        // Clear pending message since we're processing it
        pendingMessageRef.current = null;

        if (!activeSessionId) {
          const newSession = await chatStorageService.createSession();
          setSessions((prev) => [newSession, ...prev]);
          setActiveSessionId(newSession.id);
          // Store message to send after session is created
          pendingMessageRef.current = msg;
          return;
        }

        await chatHandler.sendMessage(msg);
      },
      [activeSessionId, chatHandler, appState, setAppState]
    );

    // Wrapped handler for ChatSection
    const wrappedHandler = useMemo(
      () => ({
        ...chatHandler,
        sendMessage: handleSendWrapper,
      }),
      [chatHandler, handleSendWrapper]
    );

    // Get current session title
    const currentSession = sessions.find((s) => s.id === activeSessionId);
    const title = currentSession?.title || '新对话';

    return (
      <>
        <ChatDrawerTrigger isOpen={isOpen} onClick={handleToggle} />

        <div className={`chat-drawer ${isOpen ? 'chat-drawer--open' : ''}`}>
          <div className="chat-drawer__header">
            <div className="chat-drawer__header-left">
              <h2 className="chat-drawer__title">{title}</h2>
              <ModelSelector />
            </div>
            <div className="chat-drawer__actions">
              <Tooltip content="会话列表" theme="light">
                <button
                  ref={toggleButtonRef}
                  className={`chat-drawer__close-btn ${showSessions ? 'chat-drawer__close-btn--active' : ''}`}
                  data-track="chat_click_sessions_toggle"
                  onClick={handleToggleSessions}
                  aria-label="会话列表"
                >
                  <ViewListIcon size={18} />
                </button>
              </Tooltip>
              <Tooltip content="新对话" theme="light">
                <button
                  className="chat-drawer__close-btn"
                  data-track="chat_click_new_session"
                  onClick={handleNewSession}
                  aria-label="新对话"
                >
                  <AddIcon size={18} />
                </button>
              </Tooltip>
              <Tooltip content="关闭" theme="light">
                <button
                  className="chat-drawer__close-btn"
                  data-track="chat_click_drawer_close"
                  onClick={handleClose}
                  aria-label="关闭对话"
                >
                  <CloseIcon size={18} />
                </button>
              </Tooltip>
            </div>
          </div>

          {showSessions && (
            <div ref={sessionListRef}>
              <SessionList
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSelectSession={handleSelectSession}
                onNewSession={handleNewSession}
                onDeleteSession={handleDeleteSession}
              />
            </div>
          )}

          <div className="chat-drawer__content">
            <ChatSection handler={wrappedHandler} className="chat-section">
              <ChatMessages className="chat-messages">
                <ChatMessages.List className="chat-messages-list">
                  {chatHandler.messages.map((message, index) => {
                    // Check if message is an error
                    const isError = message.parts.some(
                      (part) =>
                        part.type === 'text' &&
                        (part as any).text?.startsWith('❌ 错误')
                    );
                    const messageClass = `chat-message chat-message--${message.role} ${
                      isError ? 'chat-message--error' : ''
                    }`;

                    return (
                      <ChatMessage
                        key={message.id}
                        message={message}
                        isLast={index === chatHandler.messages.length - 1}
                        className={messageClass}
                      >
                        <ChatMessage.Avatar className="chat-message-avatar" />
                        <ChatMessage.Content className="chat-message-content">
                          <ChatMessage.Content.Markdown
                            className="chat-markdown"
                            languageRenderers={{
                              mermaid: MermaidRenderer,
                            }}
                          />
                        </ChatMessage.Content>
                        {message.role === 'assistant' && !isError && (
                          <ChatMessage.Actions className="chat-message-actions" />
                        )}
                      </ChatMessage>
                    );
                  })}
                </ChatMessages.List>
                <ChatMessages.Loading className="chat-loading">
                  <div className="chat-loading__spinner" />
                  <span>思考中...</span>
                </ChatMessages.Loading>
                <ChatMessages.Empty
                  className="chat-empty"
                  heading="开始对话"
                  subheading="输入消息与AI助手交流"
                />
                <ChatMessages.Actions className="chat-actions" />
              </ChatMessages>

              <ChatInput className="chat-input">
                <ChatInput.Form className="chat-input-form">
                  <ChatInput.Field
                    className="chat-input-field"
                    placeholder="输入消息..."
                  />
                  <ChatInput.Submit className="chat-input-submit" />
                </ChatInput.Form>
              </ChatInput>
            </ChatSection>
          </div>
        </div>
      </>
    );
  }
);

ChatDrawer.displayName = 'ChatDrawer';

ChatDrawer.displayName = 'ChatDrawer';
