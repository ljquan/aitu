/**
 * ChatDrawer Context
 * 
 * 提供 ChatDrawer 的 ref 访问，使其他组件可以控制 ChatDrawer
 */

import React, { createContext, useContext, useRef, type MutableRefObject } from 'react';
import type { ChatDrawerRef } from '../types/chat.types';

interface ChatDrawerContextValue {
  chatDrawerRef: MutableRefObject<ChatDrawerRef | null>;
}

const ChatDrawerContext = createContext<ChatDrawerContextValue | null>(null);

export interface ChatDrawerProviderProps {
  children: React.ReactNode;
}

/**
 * ChatDrawer Provider
 * 提供 ChatDrawer ref 的访问
 */
export const ChatDrawerProvider: React.FC<ChatDrawerProviderProps> = ({ children }) => {
  const chatDrawerRef = useRef<ChatDrawerRef>(null);

  return (
    <ChatDrawerContext.Provider value={{ chatDrawerRef }}>
      {children}
    </ChatDrawerContext.Provider>
  );
};

/**
 * Hook to access ChatDrawer ref
 */
export function useChatDrawer(): ChatDrawerContextValue {
  const context = useContext(ChatDrawerContext);
  if (!context) {
    throw new Error('useChatDrawer must be used within a ChatDrawerProvider');
  }
  return context;
}

/**
 * Hook to get ChatDrawer control methods
 * 提供便捷的方法来控制 ChatDrawer
 */
export function useChatDrawerControl() {
  const { chatDrawerRef } = useChatDrawer();

  return {
    /** 打开 ChatDrawer */
    openChatDrawer: () => {
      chatDrawerRef.current?.open();
    },
    /** 关闭 ChatDrawer */
    closeChatDrawer: () => {
      chatDrawerRef.current?.close();
    },
    /** 切换 ChatDrawer 状态 */
    toggleChatDrawer: () => {
      chatDrawerRef.current?.toggle();
    },
    /** 打开 ChatDrawer 并发送消息 */
    sendMessageToChatDrawer: async (content: string) => {
      await chatDrawerRef.current?.sendMessage(content);
    },
    /** 获取 ChatDrawer 是否打开 */
    isChatDrawerOpen: () => {
      return chatDrawerRef.current?.isOpen() ?? false;
    },
  };
}

export default ChatDrawerContext;
