/**
 * 最近使用颜色共享上下文
 * 所有取色场景共享最近使用的颜色列表
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { kvStorageService } from '../../services/kv-storage-service';
import type { RecentColorsContextValue } from './types';

/** 最近使用颜色的存储键 */
const RECENT_COLORS_KEY = 'aitu-recent-colors-unified';

/** 最大存储颜色数量 */
const MAX_RECENT_COLORS = 10;

/** 默认上下文值 */
const defaultContextValue: RecentColorsContextValue = {
  recentColors: [],
  addRecentColor: () => {},
  clearRecentColors: () => {},
};

/** 最近使用颜色上下文 */
const RecentColorsContext = createContext<RecentColorsContextValue>(defaultContextValue);

/** RecentColorsProvider Props */
export interface RecentColorsProviderProps {
  children: React.ReactNode;
}

/**
 * 最近使用颜色 Provider
 * 提供跨组件共享的最近使用颜色状态
 */
export const RecentColorsProvider: React.FC<RecentColorsProviderProps> = ({ children }) => {
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const isInitialized = useRef(false);

  // 从 IndexedDB 加载最近使用颜色
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    kvStorageService.get<string[]>(RECENT_COLORS_KEY)
      .then((colors) => {
        if (colors && Array.isArray(colors)) {
          setRecentColors(colors);
        }
      })
      .catch((error) => {
        console.warn('[RecentColorsProvider] Failed to load recent colors:', error);
      });
  }, []);

  // 添加颜色到最近使用列表
  const addRecentColor = useCallback((color: string) => {
    if (!color) return;

    // 标准化颜色格式（移除空格，转大写）
    const normalizedColor = color.toUpperCase().replace(/\s/g, '');

    setRecentColors((prev) => {
      // 去重：移除已存在的相同颜色
      const filtered = prev.filter(
        (c) => c.toUpperCase().replace(/\s/g, '') !== normalizedColor
      );
      // 添加到开头，限制最大数量
      const updated = [normalizedColor, ...filtered].slice(0, MAX_RECENT_COLORS);

      // 异步保存到 IndexedDB
      kvStorageService.set(RECENT_COLORS_KEY, updated).catch((error) => {
        console.warn('[RecentColorsProvider] Failed to save recent colors:', error);
      });

      return updated;
    });
  }, []);

  // 清空最近使用颜色
  const clearRecentColors = useCallback(() => {
    setRecentColors([]);
    kvStorageService.remove(RECENT_COLORS_KEY).catch((error) => {
      console.warn('[RecentColorsProvider] Failed to clear recent colors:', error);
    });
  }, []);

  const contextValue: RecentColorsContextValue = {
    recentColors,
    addRecentColor,
    clearRecentColors,
  };

  return (
    <RecentColorsContext.Provider value={contextValue}>
      {children}
    </RecentColorsContext.Provider>
  );
};

/**
 * 使用最近使用颜色的 Hook
 * @returns RecentColorsContextValue
 */
export const useRecentColors = (): RecentColorsContextValue => {
  const context = useContext(RecentColorsContext);
  return context;
};

export { RecentColorsContext };
