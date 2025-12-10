/**
 * Chat Drawer API Contracts
 *
 * This file defines the TypeScript interfaces for the Chat Drawer feature.
 * These interfaces serve as contracts between components, services, and storage layers.
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * 消息状态枚举
 */
export enum MessageStatus {
  /** 发送中 */
  SENDING = 'sending',
  /** AI正在生成中 */
  STREAMING = 'streaming',
  /** 发送成功 */
  SUCCESS = 'success',
  /** 发送失败 */
  FAILED = 'failed',
}

/**
 * 消息角色枚举
 */
export enum MessageRole {
  /** 用户消息 */
  USER = 'user',
  /** AI助手消息 */
  ASSISTANT = 'assistant',
}

// ============================================================================
// Entities
// ============================================================================

/**
 * 附件接口
 */
export interface Attachment {
  /** 附件唯一标识 (UUID v4) */
  id: string;
  /** 文件名 */
  name: string;
  /** MIME类型 (e.g., 'image/png', 'application/pdf') */
  type: string;
  /** 文件大小 (bytes) */
  size: number;
  /** 文件数据 (Base64 或 Blob URL) */
  data: string;
  /** 是否为Blob URL (用于清理) */
  isBlob: boolean;
}

/**
 * 对话消息接口
 */
export interface ChatMessage {
  /** 消息唯一标识 (UUID v4) */
  id: string;
  /** 所属会话ID */
  sessionId: string;
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容 (Markdown格式) */
  content: string;
  /** 发送时间戳 (Unix milliseconds) */
  timestamp: number;
  /** 消息状态 */
  status: MessageStatus;
  /** 附件列表 (可选) */
  attachments?: Attachment[];
  /** 错误信息 (可选) */
  error?: string;
}

/**
 * 对话会话接口
 */
export interface ChatSession {
  /** 会话唯一标识 (UUID v4) */
  id: string;
  /** 会话标题 (从首条消息自动生成，max 30字符) */
  title: string;
  /** 创建时间戳 (Unix milliseconds) */
  createdAt: number;
  /** 最后更新时间戳 (Unix milliseconds) */
  updatedAt: number;
  /** 消息数量 */
  messageCount: number;
}

/**
 * 抽屉状态接口
 */
export interface DrawerState {
  /** 是否展开 */
  isOpen: boolean;
  /** 当前宽度 (px) */
  width: number;
  /** 当前活跃会话ID */
  activeSessionId: string | null;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * 发送消息请求
 */
export interface SendMessageRequest {
  /** 会话ID */
  sessionId: string;
  /** 消息内容 */
  content: string;
  /** 附件列表 (可选) */
  attachments?: File[];
}

/**
 * 发送消息响应
 */
export interface SendMessageResponse {
  /** 用户消息 */
  userMessage: ChatMessage;
  /** AI响应消息 (初始状态为 streaming) */
  assistantMessage: ChatMessage;
}

/**
 * 流式响应事件
 */
export interface StreamEvent {
  /** 事件类型 */
  type: 'content' | 'done' | 'error';
  /** 增量内容 (type='content' 时) */
  content?: string;
  /** 错误信息 (type='error' 时) */
  error?: string;
}

/**
 * 聊天服务接口
 */
export interface IChatService {
  /**
   * 发送消息并获取流式响应
   * @param request 发送消息请求
   * @param onStream 流式回调
   * @param signal 取消信号
   */
  sendMessage(
    request: SendMessageRequest,
    onStream: (event: StreamEvent) => void,
    signal?: AbortSignal
  ): Promise<ChatMessage>;

  /**
   * 停止当前生成
   */
  stopGeneration(): void;

  /**
   * 重新生成最后一条AI回复
   * @param sessionId 会话ID
   * @param onStream 流式回调
   */
  regenerateLastResponse(
    sessionId: string,
    onStream: (event: StreamEvent) => void
  ): Promise<ChatMessage>;
}

// ============================================================================
// Storage Interfaces
// ============================================================================

/**
 * 聊天存储服务接口
 */
export interface IChatStorageService {
  // Session operations
  createSession(): Promise<ChatSession>;
  getSession(id: string): Promise<ChatSession | null>;
  getAllSessions(): Promise<ChatSession[]>;
  updateSession(id: string, updates: Partial<ChatSession>): Promise<void>;
  deleteSession(id: string): Promise<void>;

  // Message operations
  addMessage(message: ChatMessage): Promise<void>;
  getMessages(sessionId: string): Promise<ChatMessage[]>;
  updateMessage(id: string, updates: Partial<ChatMessage>): Promise<void>;
  deleteMessage(id: string): Promise<void>;

  // Drawer state operations
  getDrawerState(): DrawerState;
  setDrawerState(state: Partial<DrawerState>): void;

  // Cleanup operations
  clearAllData(): Promise<void>;
  pruneOldSessions(keepCount: number): Promise<void>;
}

// ============================================================================
// Component Props Interfaces
// ============================================================================

/**
 * ChatDrawer 组件 Props
 */
export interface ChatDrawerProps {
  /** 初始是否展开 */
  defaultOpen?: boolean;
  /** 展开状态变化回调 */
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * MessageList 组件 Props
 */
export interface MessageListProps {
  /** 消息列表 */
  messages: ChatMessage[];
  /** 是否正在加载 */
  isLoading?: boolean;
  /** 复制消息回调 */
  onCopyMessage?: (message: ChatMessage) => void;
  /** 重新生成回调 */
  onRegenerate?: (message: ChatMessage) => void;
}

/**
 * MessageInput 组件 Props
 */
export interface MessageInputProps {
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否正在生成 */
  isGenerating?: boolean;
  /** 发送消息回调 */
  onSend: (content: string, attachments?: File[]) => void;
  /** 停止生成回调 */
  onStop?: () => void;
}

/**
 * SessionList 组件 Props
 */
export interface SessionListProps {
  /** 会话列表 */
  sessions: ChatSession[];
  /** 当前活跃会话ID */
  activeSessionId: string | null;
  /** 切换会话回调 */
  onSelectSession: (sessionId: string) => void;
  /** 新建会话回调 */
  onNewSession: () => void;
  /** 删除会话回调 */
  onDeleteSession: (sessionId: string) => void;
}

// ============================================================================
// Hook Return Types
// ============================================================================

/**
 * useChatSessions Hook 返回类型
 */
export interface UseChatSessionsReturn {
  sessions: ChatSession[];
  activeSession: ChatSession | null;
  isLoading: boolean;
  createSession: () => Promise<ChatSession>;
  selectSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => Promise<void>;
}

/**
 * useChatMessages Hook 返回类型
 */
export interface UseChatMessagesReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  isGenerating: boolean;
  sendMessage: (content: string, attachments?: File[]) => Promise<void>;
  stopGeneration: () => void;
  regenerate: (messageId: string) => Promise<void>;
  copyMessage: (messageId: string) => void;
}

/**
 * useChatStream Hook 返回类型
 */
export interface UseChatStreamReturn {
  streamContent: string;
  isStreaming: boolean;
  startStream: (
    request: SendMessageRequest,
    onComplete: (content: string) => void
  ) => void;
  stopStream: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * 聊天相关常量
 */
export const CHAT_CONSTANTS = {
  /** 最大会话数量 */
  MAX_SESSIONS: 50,
  /** 每会话最大消息数 */
  MAX_MESSAGES_PER_SESSION: 100,
  /** 会话标题最大长度 */
  MAX_TITLE_LENGTH: 30,
  /** 用户消息最大长度 */
  MAX_USER_MESSAGE_LENGTH: 10000,
  /** 单个附件最大大小 (10MB) */
  MAX_ATTACHMENT_SIZE: 10 * 1024 * 1024,
  /** 单条消息最大附件数 */
  MAX_ATTACHMENTS_PER_MESSAGE: 5,
  /** 单条消息最大附件总大小 (20MB) */
  MAX_TOTAL_ATTACHMENTS_SIZE: 20 * 1024 * 1024,
  /** 抽屉最小宽度 */
  DRAWER_MIN_WIDTH: 320,
  /** 抽屉最大宽度 */
  DRAWER_MAX_WIDTH: 500,
  /** 抽屉默认宽度比例 */
  DRAWER_DEFAULT_WIDTH_RATIO: 0.3,
  /** 存储防抖延迟 (ms) */
  STORAGE_DEBOUNCE_DELAY: 500,
  /** AI响应超时时间 (ms) */
  AI_RESPONSE_TIMEOUT: 60000,
} as const;

/**
 * 支持的附件MIME类型
 */
export const SUPPORTED_ATTACHMENT_TYPES = [
  // 图片
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  // 文档
  'application/pdf',
  'text/plain',
  'text/markdown',
  // 其他
  'application/json',
  'text/csv',
] as const;

export type SupportedAttachmentType = typeof SUPPORTED_ATTACHMENT_TYPES[number];
