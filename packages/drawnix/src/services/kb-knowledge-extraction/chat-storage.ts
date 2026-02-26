
import localforage from 'localforage';
import type { KBChatSession, ChatMessage } from './types';

const DB_NAME = 'kb-chat-storage';
const STORE_NAME = 'sessions';

const chatStore = localforage.createInstance({
  name: DB_NAME,
  storeName: STORE_NAME,
});

/**
 * 获取笔记的聊天记录
 * @param noteId 笔记ID
 */
export async function getChatSession(noteId: string): Promise<KBChatSession | null> {
  return chatStore.getItem<KBChatSession>(noteId);
}

/**
 * 保存笔记的聊天记录
 * @param noteId 笔记ID
 * @param messages 消息列表
 */
export async function saveChatSession(noteId: string, messages: ChatMessage[]): Promise<void> {
  const session: KBChatSession = {
    noteId,
    messages,
    updatedAt: Date.now(),
  };
  await chatStore.setItem(noteId, session);
}

/**
 * 删除笔记的聊天记录
 * @param noteId 笔记ID
 */
export async function deleteChatSession(noteId: string): Promise<void> {
  await chatStore.removeItem(noteId);
}

/**
 * 清空所有聊天记录
 */
export async function clearAllChatSessions(): Promise<void> {
  await chatStore.clear();
}
