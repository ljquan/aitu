/**
 * Chat Drawer Constants
 */

export const CHAT_CONSTANTS = {
  /** 最大会话数量 */
  MAX_SESSIONS: 50,
  /** 会话标题最大长度 */
  MAX_TITLE_LENGTH: 30,
  /** 抽屉最小宽度 */
  DRAWER_MIN_WIDTH: 320,
  /** 抽屉最大宽度 */
  DRAWER_MAX_WIDTH: 500,
  /** 抽屉默认宽度比例 */
  DRAWER_DEFAULT_WIDTH_RATIO: 0.3,
} as const;

/** 存储键常量 */
export const CHAT_STORAGE_KEYS = {
  DRAWER_STATE: 'aitu:chat:drawer-state',
  ACTIVE_SESSION: 'aitu:chat:active-session',
  DATABASE_NAME: 'aitu-chat',
  SESSIONS_STORE: 'sessions',
  MESSAGES_STORE: 'messages',
} as const;
