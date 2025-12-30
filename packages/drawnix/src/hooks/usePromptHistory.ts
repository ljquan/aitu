/**
 * usePromptHistory Hook
 * 
 * 管理历史提示词的 React Hook
 * 提供历史记录的增删查改能力
 */

import { useState, useCallback, useEffect } from 'react';
import {
  promptStorageService,
  type PromptHistoryItem,
} from '../services/prompt-storage-service';

export interface UsePromptHistoryReturn {
  /** 历史提示词列表 */
  history: PromptHistoryItem[];
  /** 添加历史记录 */
  addHistory: (content: string) => void;
  /** 删除指定历史记录 */
  removeHistory: (id: string) => void;
  /** 清空所有历史记录 */
  clearHistory: () => void;
  /** 刷新历史记录 */
  refreshHistory: () => void;
}

/**
 * 历史提示词管理 Hook
 */
export function usePromptHistory(): UsePromptHistoryReturn {
  const [history, setHistory] = useState<PromptHistoryItem[]>([]);

  // 刷新历史记录
  const refreshHistory = useCallback(() => {
    const data = promptStorageService.getHistory();
    setHistory(data);
  }, []);

  // 初始化加载
  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  // 添加历史记录
  const addHistory = useCallback((content: string) => {
    promptStorageService.addHistory(content);
    refreshHistory();
  }, [refreshHistory]);

  // 删除指定历史记录
  const removeHistory = useCallback((id: string) => {
    promptStorageService.removeHistory(id);
    refreshHistory();
  }, [refreshHistory]);

  // 清空所有历史记录
  const clearHistory = useCallback(() => {
    promptStorageService.clearHistory();
    refreshHistory();
  }, [refreshHistory]);

  return {
    history,
    addHistory,
    removeHistory,
    clearHistory,
    refreshHistory,
  };
}

export default usePromptHistory;
