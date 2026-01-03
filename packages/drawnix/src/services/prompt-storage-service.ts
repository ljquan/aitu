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
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `prompt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 获取所有历史提示词
 */
export function getPromptHistory(): PromptHistoryItem[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data) as PromptHistoryItem[];
  } catch (error) {
    console.error('Failed to get prompt history:', error);
    return [];
  }
}

/**
 * 添加历史提示词
 * 自动去重，新记录插入头部，限制最大数量
 * @param content 提示词内容
 * @param hasSelection 是否在有选中元素时输入的
 */
export function addPromptHistory(content: string, hasSelection?: boolean): void {
  if (!content || !content.trim()) return;

  const trimmedContent = content.trim();

  try {
    let history = getPromptHistory();

    // 去重：移除已存在的相同内容
    history = history.filter(item => item.content !== trimmedContent);

    // 新记录插入头部
    const newItem: PromptHistoryItem = {
      id: generateId(),
      content: trimmedContent,
      timestamp: Date.now(),
      hasSelection,
    };
    history.unshift(newItem);

    // 限制最大数量
    if (history.length > MAX_HISTORY_COUNT) {
      history = history.slice(0, MAX_HISTORY_COUNT);
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
 * 导出 prompt storage service 对象
 */
export const promptStorageService = {
  getHistory: getPromptHistory,
  addHistory: addPromptHistory,
  removeHistory: removePromptHistory,
  clearHistory: clearPromptHistory,
};
