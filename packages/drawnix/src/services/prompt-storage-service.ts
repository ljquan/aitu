/**
 * Prompt Storage Service
 * 
 * 管理用户历史提示词的本地存储
 * 使用 localStorage 进行持久化存储
 */

const STORAGE_KEY = 'aitu_prompt_history';
const MAX_HISTORY_COUNT = 20;

export interface PromptHistoryItem {
  id: string;
  content: string;
  timestamp: number;
  /** 是否在有选中元素时输入的 */
  hasSelection?: boolean;
  /** 是否置顶 */
  pinned?: boolean;
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `prompt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 获取所有历史提示词
 * 返回排序后的列表：置顶的在前面，非置顶的按时间倒序
 */
export function getPromptHistory(): PromptHistoryItem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const history = JSON.parse(data) as PromptHistoryItem[];
    // 排序：置顶的在前，非置顶的按时间倒序
    return history.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.timestamp - a.timestamp;
    });
  } catch (error) {
    console.error('Failed to get prompt history:', error);
    return [];
  }
}

/**
 * 添加历史提示词
 * 自动去重，新记录插入头部，限制最大数量
 * 注意：如果相同内容已被置顶，只更新时间戳，不会创建新记录
 * @param content 提示词内容
 * @param hasSelection 是否在有选中元素时输入的
 */
export function addPromptHistory(content: string, hasSelection?: boolean): void {
  if (!content || !content.trim()) return;

  const trimmedContent = content.trim();

  try {
    let history = getPromptHistory();

    // 检查是否已存在相同内容
    const existingIndex = history.findIndex(item => item.content === trimmedContent);

    if (existingIndex >= 0) {
      const existingItem = history[existingIndex];
      if (existingItem.pinned) {
        // 已置顶的提示词：只更新时间戳，保持置顶状态
        existingItem.timestamp = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        return;
      }
      // 未置顶的：移除旧记录，后面会添加新的
      history = history.filter(item => item.content !== trimmedContent);
    }

    // 新记录插入头部
    const newItem: PromptHistoryItem = {
      id: generateId(),
      content: trimmedContent,
      timestamp: Date.now(),
      hasSelection,
    };
    history.unshift(newItem);

    // 限制最大数量（优先保留置顶的）
    if (history.length > MAX_HISTORY_COUNT) {
      // 分离置顶和非置顶
      const pinned = history.filter(item => item.pinned);
      const unpinned = history.filter(item => !item.pinned);
      // 保留所有置顶 + 尽可能多的非置顶
      const maxUnpinned = MAX_HISTORY_COUNT - pinned.length;
      history = [...pinned, ...unpinned.slice(0, Math.max(0, maxUnpinned))];
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to add prompt history:', error);
  }
}

/**
 * 删除指定历史提示词
 */
export function removePromptHistory(id: string): void {
  try {
    let history = getPromptHistory();
    history = history.filter(item => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to remove prompt history:', error);
  }
}

/**
 * 清空所有历史提示词
 */
export function clearPromptHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear prompt history:', error);
  }
}

/**
 * 切换提示词置顶状态
 * @param id 提示词 ID
 * @returns 切换后的置顶状态
 */
export function togglePinPrompt(id: string): boolean {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return false;

    const history = JSON.parse(data) as PromptHistoryItem[];
    const item = history.find(item => item.id === id);

    if (!item) return false;

    // 切换置顶状态
    item.pinned = !item.pinned;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));

    return item.pinned;
  } catch (error) {
    console.error('Failed to toggle pin prompt:', error);
    return false;
  }
}

/**
 * 导出 prompt storage service 对象
 */
export const promptStorageService = {
  getHistory: getPromptHistory,
  addHistory: addPromptHistory,
  removeHistory: removePromptHistory,
  clearHistory: clearPromptHistory,
  togglePin: togglePinPrompt,
};
