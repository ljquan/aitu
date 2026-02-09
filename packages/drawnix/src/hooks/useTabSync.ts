import { useEffect, useRef, useCallback } from 'react';

const TAB_SYNC_KEY = 'aitu-tab-sync-version';
const POLL_INTERVAL = 500; // 500ms 轮询间隔（比 Excalidraw 的 50ms 更保守）

// 生成当前标签页的唯一ID
const TAB_ID = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

interface UseTabSyncOptions {
  /** 当其他标签页修改数据后触发的回调 */
  onSyncNeeded: () => void;
  /** 是否启用 */
  enabled?: boolean;
}

interface TabSyncData {
  version: number;
  tabId: string;
}

/**
 * 标签页同步 Hook
 *
 * 通过 localStorage 版本号检测其他标签页的数据变更，
 * 当检测到其他标签页保存了数据时触发 onSyncNeeded 回调。
 *
 * 使用方式：
 * 1. 在数据保存后调用 markDataSaved() 更新版本号
 * 2. 其他标签页会在 POLL_INTERVAL 内检测到变更并触发 onSyncNeeded
 */
export function useTabSync({ onSyncNeeded, enabled = true }: UseTabSyncOptions) {
  const localVersionRef = useRef<number>(-1);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  // 初始化版本号
  useEffect(() => {
    if (!enabled) return;

    const stored = localStorage.getItem(TAB_SYNC_KEY);
    if (stored) {
      try {
        const data: TabSyncData = JSON.parse(stored);
        localVersionRef.current = data.version;
      } catch {
        // 兼容旧格式（纯数字）
        localVersionRef.current = parseInt(stored, 10) || Date.now();
      }
    } else {
      localVersionRef.current = Date.now();
    }
  }, [enabled]);

  // 轮询检测
  useEffect(() => {
    if (!enabled) return;

    intervalRef.current = setInterval(() => {
      // 标签页不可见时不检测
      if (document.hidden) return;

      const stored = localStorage.getItem(TAB_SYNC_KEY);
      if (!stored) return;

      try {
        const data: TabSyncData = JSON.parse(stored);
        // 只有当版本号更新且不是当前标签页触发的更新时，才触发同步
        if (data.version > localVersionRef.current && data.tabId !== TAB_ID) {
          localVersionRef.current = data.version;
          onSyncNeeded();
        } else if (data.version > localVersionRef.current && data.tabId === TAB_ID) {
          // 是自己触发的更新，只更新版本号，不触发同步
          localVersionRef.current = data.version;
        }
      } catch {
        // 兼容旧格式（纯数字）
        const remote = parseInt(stored, 10);
        if (remote > localVersionRef.current) {
          localVersionRef.current = remote;
          onSyncNeeded();
        }
      }
    }, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, onSyncNeeded]);

  // 保存后 flush 版本号
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 离开标签页时，确保版本号已写入
        const v = Date.now();
        try {
          const data: TabSyncData = { version: v, tabId: TAB_ID };
          localStorage.setItem(TAB_SYNC_KEY, JSON.stringify(data));
          localVersionRef.current = v;
        } catch {
          // 静默处理
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled]);
}

/**
 * 标记数据已保存，通知其他标签页同步
 * 在每次保存数据后调用此函数。
 */
export function markTabSyncVersion() {
  try {
    const v = Date.now();
    const data: TabSyncData = { version: v, tabId: TAB_ID };
    localStorage.setItem(TAB_SYNC_KEY, JSON.stringify(data));
  } catch {
    // 静默处理
  }
}
