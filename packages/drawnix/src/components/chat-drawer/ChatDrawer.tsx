/**
 * ChatDrawer Component
 *
 * Main chat drawer component using @llamaindex/chat-ui.
 */

import React, { useState, useCallback, useEffect, useMemo, useImperativeHandle, forwardRef, useRef } from 'react';
import { CloseIcon, AddIcon, ViewListIcon } from 'tdesign-icons-react';
import { Tooltip } from 'tdesign-react';
import {
  ChatSection,
  ChatMessages,
  ChatMessage,
} from '@llamaindex/chat-ui';
import '@llamaindex/chat-ui/styles/markdown.css';
import '@llamaindex/chat-ui/styles/pdf.css';
import { ATTACHED_ELEMENT_CLASS_NAME } from '@plait/core';
import { SessionList } from './SessionList';
import { ChatDrawerTrigger } from './ChatDrawerTrigger';
import { MermaidRenderer } from './MermaidRenderer';
import { ModelSelector } from './ModelSelector';
import { WorkflowMessageBubble } from './WorkflowMessageBubble';
import { UserMessageBubble } from './UserMessageBubble';
import { EnhancedChatInput } from './EnhancedChatInput';
import { chatStorageService } from '../../services/chat-storage-service';
import { useChatHandler } from '../../hooks/useChatHandler';
import { geminiSettings } from '../../utils/settings-manager';
import { useDrawnix } from '../../hooks/use-drawnix';
import { useChatDrawer } from '../../contexts/ChatDrawerContext';
import type { ChatDrawerProps, ChatDrawerRef, ChatSession, WorkflowMessageData, WorkflowMessageParams, AgentLogEntry, ChatMessage as ChatMessageType } from '../../types/chat.types';
import { MessageRole, MessageStatus } from '../../types/chat.types';
import type { Message } from '@llamaindex/chat-ui';
import { useTextSelection } from '../../hooks/useTextSelection';
import { analytics } from '../../utils/posthog-analytics';

// 工作流消息的特殊标记前缀
const WORKFLOW_MESSAGE_PREFIX = '[[WORKFLOW_MESSAGE]]';

/**
 * 根据工具名称生成描述
 */
function getToolDescription(toolName: string, args?: Record<string, unknown>): string {
  switch (toolName) {
    case 'generate_image':
      return `生成图片: ${((args?.prompt as string) || '').substring(0, 30)}...`;
    case 'generate_video':
      return `生成视频: ${((args?.prompt as string) || '').substring(0, 30)}...`;
    case 'generate_grid_image':
      return `生成宫格图: ${((args?.theme as string) || '').substring(0, 30)}...`;
    case 'canvas_insertion':
      return '插入到画布';
    case 'generate_mermaid':
      return '生成流程图';
    case 'generate_mindmap':
      return '生成思维导图';
    default:
      return `执行 ${toolName}`;
  }
}

// 抽屉宽度缓存 key
const DRAWER_WIDTH_CACHE_KEY = 'chat-drawer-width';
// 默认宽度（与 SCSS 中的 50vw 对应）
const DEFAULT_DRAWER_WIDTH = Math.max(375, window.innerWidth * 0.5);
// 最小宽度
const MIN_DRAWER_WIDTH = 375;

export const ChatDrawer = forwardRef<ChatDrawerRef, ChatDrawerProps>(
  ({ defaultOpen = false, onOpenChange }, ref) => {
    // Initialize state from cache synchronously to prevent flash
    const [isOpen, setIsOpen] = useState(() => {
      const cached = chatStorageService.getDrawerState();
      return cached.isOpen ?? defaultOpen;
    });
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [showSessions, setShowSessions] = useState(false);
    
    // 抽屉宽度状态（从缓存初始化）
    const [drawerWidth, setDrawerWidth] = useState(() => {
      const cached = localStorage.getItem(DRAWER_WIDTH_CACHE_KEY);
      if (cached) {
        const width = parseInt(cached, 10);
        if (!isNaN(width) && width >= MIN_DRAWER_WIDTH) {
          return Math.min(width, window.innerWidth - 60);
        }
      }
      return DEFAULT_DRAWER_WIDTH;
    });
    // 是否正在拖动
    const [isDragging, setIsDragging] = useState(false);
    // 拖动手柄 ref
    const resizeHandleRef = useRef<HTMLDivElement>(null);
    
    // 临时模型选择（仅在当前会话中有效，不影响全局设置）
    const [sessionModel, setSessionModel] = useState<string | undefined>(undefined);
    
    // 工作流消息状态：存储当前会话中的工作流数据
    const [workflowMessages, setWorkflowMessages] = useState<Map<string, WorkflowMessageData>>(new Map());
    // 当前正在更新的工作流消息 ID
    const currentWorkflowMsgIdRef = useRef<string | null>(null);
    // 正在重试的工作流 ID
    const [retryingWorkflowId, setRetryingWorkflowId] = useState<string | null>(null);

    // 获取重试执行器和选中内容（从 Context）
    const { executeRetry, selectedContent } = useChatDrawer();

    // Refs for click outside detection
    const sessionListRef = React.useRef<HTMLDivElement>(null);
    const toggleButtonRef = React.useRef<HTMLButtonElement>(null);

    // Get app state for settings dialog
    const { appState, setAppState } = useDrawnix();
    
    // 处理拖动调整宽度
    useEffect(() => {
      if (!isDragging) return;

      const handleMouseMove = (e: MouseEvent) => {
        const newWidth = window.innerWidth - e.clientX;
        const clampedWidth = Math.max(MIN_DRAWER_WIDTH, Math.min(newWidth, window.innerWidth - 60));
        setDrawerWidth(clampedWidth);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        // 保存到缓存
        localStorage.setItem(DRAWER_WIDTH_CACHE_KEY, String(drawerWidth));
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      // 拖动时禁用文本选择
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }, [isDragging, drawerWidth]);

    // 窗口大小变化时调整宽度
    useEffect(() => {
      const handleResize = () => {
        const maxWidth = window.innerWidth - 60;
        if (drawerWidth > maxWidth) {
          setDrawerWidth(maxWidth);
        }
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, [drawerWidth]);

    // 开始拖动
    const handleResizeStart = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
    }, []);

    // 处理工具调用回调
    const handleToolCalls = useCallback(
      async (
        toolCalls: Array<{ name: string; arguments: Record<string, unknown>; id?: string }>,
        messageId: string,
        executeTools: () => Promise<Array<{
          toolCall: { name: string; arguments: Record<string, unknown> };
          success: boolean;
          data?: unknown;
          error?: string;
          taskId?: string;
        }>>,
        aiAnalysis?: string
      ) => {
        console.log('[ChatDrawer] Tool calls received:', toolCalls.length, 'aiAnalysis:', aiAnalysis?.substring(0, 50));

        // 创建工作流数据
        const workflowId = `workflow-${Date.now()}`;
        const workflowData: WorkflowMessageData = {
          id: workflowId,
          name: 'AI 智能生成',
          generationType: toolCalls[0]?.name.includes('video') ? 'video' : 'image',
          prompt: aiAnalysis || '',
          aiAnalysis: aiAnalysis,
          count: toolCalls.length,
          steps: toolCalls.map((tc, idx) => ({
            id: `step-${idx}`,
            mcp: tc.name,
            status: 'pending' as const,
            description: getToolDescription(tc.name, tc.arguments),
            args: tc.arguments,
          })),
        };

        // 更新工作流状态
        setWorkflowMessages((prev) => {
          const newMap = new Map(prev);
          newMap.set(messageId, workflowData);
          return newMap;
        });
        currentWorkflowMsgIdRef.current = messageId;

        // 持久化工作流数据到存储
        chatStorageService.updateMessage(messageId, { workflow: workflowData });

        // 执行工具
        try {
          const results = await executeTools();
          analytics.track('chat_tool_execution_complete', { success: true, resultCount: results.length });

          // 更新步骤状态
          setWorkflowMessages((prev) => {
            const newMap = new Map(prev);
            const workflow = newMap.get(messageId);
            if (workflow) {
              const updatedWorkflow = {
                ...workflow,
                steps: workflow.steps.map((step, idx) => {
                  const result = results[idx];
                  return {
                    ...step,
                    status: result?.success ? 'completed' as const : 'failed' as const,
                    error: result?.error,
                    result: result?.data,
                  };
                }),
              };
              newMap.set(messageId, updatedWorkflow);
              // 持久化更新后的工作流
              chatStorageService.updateMessage(messageId, {
                workflow: updatedWorkflow,
                status: MessageStatus.SUCCESS,
              });
            }
            return newMap;
          });

          console.log('[ChatDrawer] Tools executed:', results.length);
        } catch (error: any) {
          console.error('[ChatDrawer] Tool execution failed:', error);
          // 标记所有步骤失败
          setWorkflowMessages((prev) => {
            const newMap = new Map(prev);
            const workflow = newMap.get(messageId);
            if (workflow) {
              const updatedWorkflow = {
                ...workflow,
                steps: workflow.steps.map((step) => ({
                  ...step,
                  status: 'failed' as const,
                  error: error.message || '执行失败',
                })),
              };
              newMap.set(messageId, updatedWorkflow);
              // 持久化失败状态
              chatStorageService.updateMessage(messageId, {
                workflow: updatedWorkflow,
                status: MessageStatus.FAILED,
              });
            }
            return newMap;
          });
        }
      },
      []
    );

    const chatHandler = useChatHandler({
      sessionId: activeSessionId,
      temporaryModel: sessionModel, // 传递临时模型
      onToolCalls: handleToolCalls, // 传递工具调用回调
    });

    // Load initial sessions and active session
    useEffect(() => {
      const init = async () => {
        const drawerState = chatStorageService.getDrawerState();
        const loadedSessions = await chatStorageService.getAllSessions();
        setSessions(loadedSessions);

        let activeId: string | null = null;
        if (drawerState.activeSessionId) {
          activeId = drawerState.activeSessionId;
          setActiveSessionId(drawerState.activeSessionId);
        } else if (loadedSessions.length > 0) {
          activeId = loadedSessions[0].id;
          setActiveSessionId(loadedSessions[0].id);
        }

        // 加载活动会话的工作流数据
        if (activeId) {
          try {
            const messages = await chatStorageService.getMessages(activeId);
            const newWorkflowMessages = new Map<string, WorkflowMessageData>();

            for (const msg of messages) {
              if (msg.workflow) {
                newWorkflowMessages.set(msg.id, msg.workflow);
              }
            }

            setWorkflowMessages(newWorkflowMessages);
            // 如果有正在进行的工作流，设置为当前工作流
            const runningWorkflow = messages.find(
              (m) => m.workflow && m.status === MessageStatus.STREAMING
            );
            currentWorkflowMsgIdRef.current = runningWorkflow?.id || null;
          } catch (error) {
            console.error('[ChatDrawer] Failed to load workflow messages:', error);
          }
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
      analytics.track('chat_session_create');
      const newSession = await chatStorageService.createSession();
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      setShowSessions(false);
      // 清空工作流消息
      setWorkflowMessages(new Map());
      currentWorkflowMsgIdRef.current = null;
      // 重置临时模型选择
      setSessionModel(undefined);
    }, []);

    // Toggle session list
    const handleToggleSessions = useCallback(() => {
      setShowSessions((prev) => !prev);
    }, []);

    // Select session（从存储中加载工作流数据）
    const handleSelectSession = useCallback(async (sessionId: string) => {
      analytics.track('chat_session_select');
      setActiveSessionId(sessionId);
      setShowSessions(false);
      // 重置临时模型选择
      setSessionModel(undefined);

      // 从存储中加载会话的消息，提取工作流数据
      try {
        const messages = await chatStorageService.getMessages(sessionId);
        const newWorkflowMessages = new Map<string, WorkflowMessageData>();

        for (const msg of messages) {
          if (msg.workflow) {
            newWorkflowMessages.set(msg.id, msg.workflow);
          }
        }

        setWorkflowMessages(newWorkflowMessages);
        // 如果有正在进行的工作流，设置为当前工作流
        const runningWorkflow = messages.find(
          (m) => m.workflow && m.status === MessageStatus.STREAMING
        );
        currentWorkflowMsgIdRef.current = runningWorkflow?.id || null;
      } catch (error) {
        console.error('[ChatDrawer] Failed to load workflow messages:', error);
        setWorkflowMessages(new Map());
        currentWorkflowMsgIdRef.current = null;
      }
    }, []);

    // Delete session
    const handleDeleteSession = useCallback(
      async (sessionId: string) => {
        analytics.track('chat_session_delete');
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

    // Rename session
    const handleRenameSession = useCallback(
      async (sessionId: string, newTitle: string) => {
        analytics.track('chat_session_rename');
        await chatStorageService.updateSession(sessionId, { title: newTitle });
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title: newTitle } : s))
        );
      },
      []
    );

    // Store pending message for retry after session creation or API key config
    const pendingMessageRef = React.useRef<Message | null>(null);

    // Handle send with auto-create session
    const handleSendWrapper = useCallback(
      async (msg: Message) => {
        analytics.track('chat_message_send', {
          hasImages: msg.parts.some(p => p.type === 'image_url') // Message parts uses image_url usually
        });
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

    // 发送工作流消息（创建新对话）
    const handleSendWorkflowMessage = useCallback(
      async (params: WorkflowMessageParams) => {
        const { context, workflow, textModel, autoOpen = true } = params;

        // 根据 autoOpen 参数决定是否打开抽屉
        if (autoOpen) {
          setIsOpen(true);
          onOpenChange?.(true);
        }

        // 如果传入了文本模型，设置为当前会话的临时模型
        if (textModel) {
          setSessionModel(textModel);
        }

        // 创建新对话
        const newSession = await chatStorageService.createSession();

        // 构建显示用的消息内容
        // 区分：选中的文本元素（作为 prompt）vs 用户输入的指令（额外要求）
        const displayParts: string[] = [];


        // 显示用户输入的指令（额外要求）
        if (context.userInstruction) {
          displayParts.push(`\n💬 用户指令:\n${context.userInstruction}`);
        }

        // 如果两者都没有，显示 finalPrompt
        if (context.selection.texts.length === 0 && !context.userInstruction && context.finalPrompt) {
          displayParts.push(`\n提示词:\n${context.finalPrompt}`);
        }
        // 显示模型和参数信息
        const modelInfo = context.model.isExplicit
          ? `模型: ${context.model.id}`
          : `模型: ${context.model.id} (默认)`;
        displayParts.push(modelInfo);

        if (context.params.count > 1) {
          displayParts.push(`数量: ${context.params.count}`);
        }

        // 显示选中的文本元素（作为生成 prompt）
        if (context.selection.texts.length > 0) {
          displayParts.push(`\n📝 选中的文本:\n${context.selection.texts.join('\n')}`);
        }

        const userDisplayText = displayParts.join('\n');

        // 生成标题优先级：
        // 1. finalPrompt（最终用于生成的提示词，最能代表任务内容）
        // 2. 选中的文本元素（作为生成 prompt 的来源）
        // 3. 用户指令冒号后面的内容（如 "生成灵感图: xxx" 取 "xxx"）
        // 4. 模型名称（兜底）
        let titleText = '新任务';
        if (context.finalPrompt) {
          titleText = context.finalPrompt;
        } else if (context.selection.texts.length > 0) {
          titleText = context.selection.texts[0];
        } else if (context.userInstruction) {
          // 提取冒号后面的内容作为标题
          const colonIndex = context.userInstruction.indexOf(':');
          const chineseColonIndex = context.userInstruction.indexOf('：');
          const actualColonIndex = colonIndex >= 0 && chineseColonIndex >= 0 
            ? Math.min(colonIndex, chineseColonIndex)
            : Math.max(colonIndex, chineseColonIndex);
          
          if (actualColonIndex >= 0 && actualColonIndex < context.userInstruction.length - 1) {
            titleText = context.userInstruction.substring(actualColonIndex + 1).trim();
          } else {
            titleText = context.userInstruction;
          }
        } else if (context.model.id) {
          titleText = `模型: ${context.model.id}`;
        }
        const title = titleText;//.length > 30 ? titleText.slice(0, 30) + '...' : titleText;
        await chatStorageService.updateSession(newSession.id, { title });
        newSession.title = title;

        setSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(newSession.id);

        // 创建用户消息（包含图片和视频）
        const timestamp = Date.now();
        const userMsgId = `msg_${timestamp}_user`;
        const userMsgParts: Message['parts'] = [{ type: 'text', text: userDisplayText }];

        // 添加参考图片
        const allImages = [...context.selection.images, ...context.selection.graphics];
        for (let i = 0; i < allImages.length; i++) {
          userMsgParts.push({
            type: 'data-file',
            data: {
              filename: `image-${i + 1}.png`,
              mediaType: 'image/png',
              url: allImages[i],
            },
          } as any);
        }

        // 添加参考视频
        for (let i = 0; i < context.selection.videos.length; i++) {
          userMsgParts.push({
            type: 'data-file',
            data: {
              filename: `video-${i + 1}.mp4`,
              mediaType: 'video/mp4',
              url: context.selection.videos[i],
            },
          } as any);
        }

        const userMsg: Message = {
          id: userMsgId,
          role: 'user',
          parts: userMsgParts,
        };

        // 创建工作流消息（助手消息）
        const workflowMsgId = `msg_${timestamp}_workflow`;
        const workflowMsg: Message = {
          id: workflowMsgId,
          role: 'assistant',
          parts: [{ type: 'text', text: `${WORKFLOW_MESSAGE_PREFIX}${workflowMsgId}` }],
        };

        // 存储工作流数据到内存
        setWorkflowMessages((prev) => {
          const newMap = new Map(prev);
          newMap.set(workflowMsgId, workflow);
          return newMap;
        });
        currentWorkflowMsgIdRef.current = workflowMsgId;

        // 持久化用户消息到本地存储
        const userChatMsg: ChatMessageType = {
          id: userMsgId,
          sessionId: newSession.id,
          role: MessageRole.USER,
          content: userDisplayText,
          timestamp: Date.now(),
          status: MessageStatus.SUCCESS,
          attachments: allImages.length > 0 || context.selection.videos.length > 0
            ? [
                ...allImages.map((url, i) => ({
                  id: `${userMsgId}-img-${i}`,
                  name: `image-${i + 1}.png`,
                  type: 'image/png',
                  size: 0,
                  data: url,
                  isBlob: false,
                })),
                ...context.selection.videos.map((url, i) => ({
                  id: `${userMsgId}-vid-${i}`,
                  name: `video-${i + 1}.mp4`,
                  type: 'video/mp4',
                  size: 0,
                  data: url,
                  isBlob: false,
                })),
              ]
            : undefined,
        };
        await chatStorageService.addMessage(userChatMsg);

        // 持久化工作流消息到本地存储
        const workflowChatMsg: ChatMessageType = {
          id: workflowMsgId,
          sessionId: newSession.id,
          role: MessageRole.ASSISTANT,
          content: `${WORKFLOW_MESSAGE_PREFIX}${workflowMsgId}`,
          timestamp: Date.now(),
          status: MessageStatus.STREAMING,
          workflow: workflow,
        };
        await chatStorageService.addMessage(workflowChatMsg);

        // 直接设置消息（不通过 sendMessage，因为这不是普通对话）
        // 同时设置原始消息以确保多轮对话时上下文正确
        chatHandler.setMessagesWithRaw?.(
          [userMsg, workflowMsg],
          [userChatMsg, workflowChatMsg]
        );
      },
      [chatHandler, onOpenChange]
    );

    // 更新当前工作流消息（同时持久化到本地存储）
    const handleUpdateWorkflowMessage = useCallback(
      async (workflow: WorkflowMessageData) => {
        const msgId = currentWorkflowMsgIdRef.current;
        if (!msgId) return;

        setWorkflowMessages((prev) => {
          const newMap = new Map(prev);
          newMap.set(msgId, workflow);
          return newMap;
        });

        // 持久化到本地存储
        chatStorageService.updateMessage(msgId, { workflow });

        // 同步更新 chatHandler 中的原始消息，确保多轮对话上下文正确
        chatHandler.updateRawMessageWorkflow?.(msgId, workflow);
      },
      [activeSessionId, sessions, chatHandler]
    );

    // 追加 Agent 执行日志（同时持久化）
    const handleAppendAgentLog = useCallback(
      (log: AgentLogEntry) => {
        const msgId = currentWorkflowMsgIdRef.current;
        if (!msgId) return;

        setWorkflowMessages((prev) => {
          const newMap = new Map(prev);
          const workflow = newMap.get(msgId);
          if (workflow) {
            const logs = workflow.logs || [];
            const updatedWorkflow = {
              ...workflow,
              logs: [...logs, log],
            };
            newMap.set(msgId, updatedWorkflow);
            // 持久化到本地存储
            chatStorageService.updateMessage(msgId, { workflow: updatedWorkflow });
            // 同步更新 chatHandler 中的原始消息
            chatHandler.updateRawMessageWorkflow?.(msgId, updatedWorkflow);
          }
          return newMap;
        });
      },
      [chatHandler]
    );

    // 更新 AI 思考内容（流式追加，使用防抖减少存储频率）
    const thinkingUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const handleUpdateThinkingContent = useCallback(
      (content: string) => {
        const msgId = currentWorkflowMsgIdRef.current;
        if (!msgId) return;

        setWorkflowMessages((prev) => {
          const newMap = new Map(prev);
          const workflow = newMap.get(msgId);
          if (workflow) {
            const logs = workflow.logs || [];
            // 查找最后一个 thinking 日志（从后向前遍历）
            let lastThinkingIndex = -1;
            for (let i = logs.length - 1; i >= 0; i--) {
              if (logs[i].type === 'thinking') {
                lastThinkingIndex = i;
                break;
              }
            }

            let updatedWorkflow: WorkflowMessageData;
            if (lastThinkingIndex >= 0) {
              // 更新现有的 thinking 日志
              const updatedLogs = [...logs];
              const thinkingLog = updatedLogs[lastThinkingIndex] as Extract<AgentLogEntry, { type: 'thinking' }>;
              updatedLogs[lastThinkingIndex] = {
                ...thinkingLog,
                content: thinkingLog.content + content,
              };
              updatedWorkflow = { ...workflow, logs: updatedLogs };
            } else {
              // 创建新的 thinking 日志
              updatedWorkflow = {
                ...workflow,
                logs: [
                  ...logs,
                  { type: 'thinking' as const, timestamp: Date.now(), content },
                ],
              };
            }
            newMap.set(msgId, updatedWorkflow);

            // 防抖持久化（500ms 内只保存一次）
            if (thinkingUpdateTimeoutRef.current) {
              clearTimeout(thinkingUpdateTimeoutRef.current);
            }
            thinkingUpdateTimeoutRef.current = setTimeout(() => {
              chatStorageService.updateMessage(msgId, { workflow: updatedWorkflow });
              // 同步更新 chatHandler 中的原始消息
              chatHandler.updateRawMessageWorkflow?.(msgId, updatedWorkflow);
            }, 500);
          }
          return newMap;
        });
      },
      [chatHandler]
    );

    // 处理工作流重试
    const handleWorkflowRetry = useCallback(
      async (workflowMsgId: string, workflow: WorkflowMessageData, stepIndex: number) => {
        if (retryingWorkflowId) return; // 已经在重试中

        analytics.track('chat_workflow_retry', { stepIndex });

        try {
          setRetryingWorkflowId(workflowMsgId);
          // 设置当前工作流消息 ID，以便更新时能正确关联
          currentWorkflowMsgIdRef.current = workflowMsgId;
          // 调用注册的重试处理器
          await executeRetry(workflow, stepIndex);
        } finally {
          setRetryingWorkflowId(null);
        }
      },
      [executeRetry, retryingWorkflowId]
    );

    // Expose ref API for external control
    useImperativeHandle(ref, () => ({
      open: () => {
        setIsOpen(true);
        onOpenChange?.(true);
      },
      close: () => {
        setIsOpen(false);
        onOpenChange?.(false);
      },
      toggle: handleToggle,
      sendMessage: async (content: string) => {
        // Open drawer first
        setIsOpen(true);
        onOpenChange?.(true);

        // Create message object
        const msg: Message = {
          id: `msg_${Date.now()}`,
          role: 'user',
          parts: [{ type: 'text', text: content }],
        };

        // Send the message
        await handleSendWrapper(msg);
      },
      sendWorkflowMessage: handleSendWorkflowMessage,
      updateWorkflowMessage: handleUpdateWorkflowMessage,
      appendAgentLog: handleAppendAgentLog,
      updateThinkingContent: handleUpdateThinkingContent,
      isOpen: () => isOpen,
      retryWorkflowFromStep: async (workflow: WorkflowMessageData, stepIndex: number) => {
        // Find the message ID associated with this workflow
        let targetMsgId: string | null = null;
        for (const [msgId, wf] of workflowMessages.entries()) {
          if (wf.id === workflow.id) {
            targetMsgId = msgId;
            break;
          }
        }

        if (targetMsgId) {
          await handleWorkflowRetry(targetMsgId, workflow, stepIndex);
        } else {
          console.warn('[ChatDrawer] Could not find message ID for workflow retry', workflow.id);
        }
      },
    }), [isOpen, handleToggle, handleSendWrapper, handleSendWorkflowMessage, handleUpdateWorkflowMessage, handleAppendAgentLog, handleUpdateThinkingContent, onOpenChange, workflowMessages, handleWorkflowRetry]);

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

    // 标题编辑状态
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editingTitleValue, setEditingTitleValue] = useState('');
    const titleInputRef = useRef<HTMLInputElement>(null);

    // 开始编辑标题
    const handleStartEditTitle = useCallback(() => {
      setEditingTitleValue(title);
      setIsEditingTitle(true);
    }, [title]);

    // 保存标题
    const handleSaveTitle = useCallback(async () => {
      const trimmedValue = editingTitleValue.trim();
      if (trimmedValue && trimmedValue !== title && activeSessionId) {
        await handleRenameSession(activeSessionId, trimmedValue);
      }
      setIsEditingTitle(false);
    }, [editingTitleValue, title, activeSessionId, handleRenameSession]);

    // 取消编辑标题
    const handleCancelEditTitle = useCallback(() => {
      setEditingTitleValue(title);
      setIsEditingTitle(false);
    }, [title]);

    // 标题输入框按键处理
    const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveTitle();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelEditTitle();
      }
    }, [handleSaveTitle, handleCancelEditTitle]);

    // 自动聚焦标题输入框
    useEffect(() => {
      if (isEditingTitle && titleInputRef.current) {
        titleInputRef.current.focus();
        titleInputRef.current.select();
      }
    }, [isEditingTitle]);

    // 检查消息是否为工作流消息
    const isWorkflowMessage = useCallback((message: Message): string | null => {
      const textPart = message.parts.find((p) => p.type === 'text');
      if (textPart && 'text' in textPart) {
        const text = textPart.text as string;
        if (text.startsWith(WORKFLOW_MESSAGE_PREFIX)) {
          return text.replace(WORKFLOW_MESSAGE_PREFIX, '');
        }
      }
      return null;
    }, []);

    // 检查用户消息是否包含图片
    const hasImages = useCallback((message: Message): boolean => {
      return message.parts.some((p) => p.type === 'data-file');
    }, []);


      const domRef = useRef<HTMLDivElement>(null);
  // 使用自定义 hook 处理文本选择和复制，同时阻止事件冒泡
  useTextSelection(domRef, {
    enableCopy: true,
    stopPropagation: true,
  });
    return (
      <>
        <ChatDrawerTrigger isOpen={isOpen} onClick={handleToggle} drawerWidth={drawerWidth} />

        <div 
          className={`chat-drawer ${ATTACHED_ELEMENT_CLASS_NAME} ${isOpen ? 'chat-drawer--open' : ''} ${isDragging ? 'chat-drawer--dragging' : ''}`}
          style={{ width: drawerWidth }}
        >
          {/* 拖动调整宽度的手柄 */}
          <div
            ref={resizeHandleRef}
            className="chat-drawer__resize-handle"
            onMouseDown={handleResizeStart}
          />
          <div ref={domRef} className="chat-drawer__body">
            <div className="chat-drawer__header">
              <div className="chat-drawer__header-top">
                {isEditingTitle ? (
                  <input
                    ref={titleInputRef}
                    className="chat-drawer__title-input"
                    value={editingTitleValue}
                    onChange={(e) => setEditingTitleValue(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    onBlur={handleSaveTitle}
                    maxLength={50}
                  />
                ) : (
                  <h2 
                    className="chat-drawer__title chat-drawer__title--editable"
                    onClick={handleStartEditTitle}
                    title="点击编辑标题"
                  >
                    {title}
                  </h2>
                )}
                <Tooltip content="关闭" theme="light">
                  <button
                    className="chat-drawer__close-btn"
                    data-track="chat_click_drawer_close"
                    onClick={handleClose}
                    aria-label="关闭对话"
                  >
                    <CloseIcon size={16} />
                  </button>
                </Tooltip>
              </div>
              <div className="chat-drawer__header-bottom">
                <ModelSelector
                  value={sessionModel}
                  onChange={setSessionModel}
                />
                <div className="chat-drawer__session-actions">
                  <Tooltip content="会话列表" theme="light">
                    <button
                      ref={toggleButtonRef}
                      className={`chat-drawer__close-btn ${showSessions ? 'chat-drawer__close-btn--active' : ''}`}
                      data-track="chat_click_sessions_toggle"
                      onClick={handleToggleSessions}
                      aria-label="会话列表"
                    >
                      <ViewListIcon size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip content="新对话" theme="light">
                    <button
                      className="chat-drawer__close-btn"
                      data-track="chat_click_new_session"
                      onClick={handleNewSession}
                      aria-label="新对话"
                    >
                      <AddIcon size={16} />
                    </button>
                  </Tooltip>
                </div>
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
                  onRenameSession={handleRenameSession}
                />
              </div>
            )}

            <div className="chat-drawer__content">
              <ChatSection handler={wrappedHandler} className="chat-section">
                <ChatMessages className="chat-messages">
                  <ChatMessages.List className="chat-messages-list">
                    {chatHandler.messages.map((message, index) => {
                      // 检查是否为工作流消息
                      const workflowMsgId = isWorkflowMessage(message);
                      if (workflowMsgId) {
                        const workflowData = workflowMessages.get(workflowMsgId);
                        if (workflowData) {
                          return (
                            <WorkflowMessageBubble
                              key={message.id}
                              workflow={workflowData}
                              onRetry={(stepIndex) => handleWorkflowRetry(workflowMsgId, workflowData, stepIndex)}
                              isRetrying={retryingWorkflowId === workflowMsgId}
                            />
                          );
                        }
                      }

                      // Check if message is an error
                      const isError = message.parts.some(
                        (part) =>
                          part.type === 'text' &&
                          (part as any).text?.startsWith('❌ 错误')
                      );
                      const messageClass = `chat-message chat-message--${message.role} ${
                        isError ? 'chat-message--error' : ''
                      }`;

                      // 用户消息包含图片时使用自定义气泡
                      if (message.role === 'user' && hasImages(message)) {
                        return (
                          <UserMessageBubble
                            key={message.id}
                            message={message}
                          />
                        );
                      }

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
                </ChatMessages>

              </ChatSection>

              <EnhancedChatInput
                selectedContent={selectedContent}
                onSend={handleSendWrapper}
                placeholder="输入消息... (可用 # 指定模型)"
              />
            </div>

          </div>
        </div>
      </>
    );
  }
);

ChatDrawer.displayName = 'ChatDrawer';
