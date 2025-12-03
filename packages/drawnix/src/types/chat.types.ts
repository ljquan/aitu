/**
 * Chat Drawer Type Definitions
 *
 * TypeScript interfaces for the Chat Drawer feature.
 */

// ============================================================================
// Enums
// ============================================================================

/** 消息状态枚举 */
export enum MessageStatus {
  SENDING = 'sending',
  STREAMING = 'streaming',
  SUCCESS = 'success',
  FAILED = 'failed',
}

/** 消息角色枚举 */
export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

// ============================================================================
// Entities
// ============================================================================

/** 附件接口 */
export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string;
  isBlob: boolean;
}

/** 对话消息接口 */
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  status: MessageStatus;
  attachments?: Attachment[];
  error?: string;
}

/** 对话会话接口 */
export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

/** 抽屉状态接口 */
export interface DrawerState {
  isOpen: boolean;
  width: number;
  activeSessionId: string | null;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/** 发送消息请求 */
export interface SendMessageRequest {
  sessionId: string;
  content: string;
  attachments?: File[];
}

/** 流式响应事件 */
export interface StreamEvent {
  type: 'content' | 'done' | 'error';
  content?: string;
  error?: string;
}

// ============================================================================
// Component Props Interfaces
// ============================================================================

/** ChatDrawer 组件 Props */
export interface ChatDrawerProps {
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}


/** SessionList 组件 Props */
export interface SessionListProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
}

/** SessionItem 组件 Props */
export interface SessionItemProps {
  session: ChatSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

// ============================================================================
// Hook Return Types
// ============================================================================

/** useChatSessions Hook 返回类型 */
export interface UseChatSessionsReturn {
  sessions: ChatSession[];
  activeSession: ChatSession | null;
  isLoading: boolean;
  createSession: () => Promise<ChatSession>;
  selectSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => Promise<void>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
}
