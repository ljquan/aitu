/**
 * Knowledge Base Save State Tracker
 *
 * 保存状态追踪器
 * - 追踪内容的保存状态（unsaved/saving/saved/duplicate/error）
 * - 基于内容指纹快速判断
 * - 状态变更通知（监听器模式）
 * - 缓存自动过期（5分钟）
 * - 提供 React Hook useSaveState
 */

import { knowledgeSaveManager, type DirectoryType } from './kb-save-manager';
import type { KBSaveState, KBSaveStateInfo } from '../types/knowledge-base.types';

// ============================================
// 类型
// ============================================

export type SaveStateChangeCallback = (fingerprint: string, state: KBSaveStateInfo) => void;

// ============================================
// 常量
// ============================================

/** 状态缓存过期时间（毫秒） */
const STATE_CACHE_TTL = 5 * 60 * 1000; // 5分钟

/** 最大缓存条目数 */
const MAX_CACHE_ENTRIES = 500;

// ============================================
// SaveStateTracker 类
// ============================================

class SaveStateTracker {
  private stateCache = new Map<string, KBSaveStateInfo>();
  private listeners = new Set<SaveStateChangeCallback>();
  private savingSet = new Set<string>();

  /**
   * 获取内容的保存状态
   */
  async getState(content: string, forceCheck = false): Promise<KBSaveStateInfo> {
    const fingerprint = knowledgeSaveManager.computeFingerprint(content);

    // 正在保存中
    if (this.savingSet.has(fingerprint)) {
      return { state: 'saving', fingerprint, lastCheckedAt: Date.now() };
    }

    // 缓存有效
    const cached = this.stateCache.get(fingerprint);
    if (cached && !forceCheck && Date.now() - cached.lastCheckedAt < STATE_CACHE_TTL) {
      return cached;
    }

    // 查询实际状态
    const stateInfo = await this._checkState(content, fingerprint);
    this._updateCache(fingerprint, stateInfo);
    return stateInfo;
  }

  /**
   * 标记开始保存
   */
  markSaving(content: string): string {
    const fingerprint = knowledgeSaveManager.computeFingerprint(content);
    this.savingSet.add(fingerprint);

    const info: KBSaveStateInfo = { state: 'saving', fingerprint, lastCheckedAt: Date.now() };
    this._updateCache(fingerprint, info);
    this._notify(fingerprint, info);
    return fingerprint;
  }

  /**
   * 标记保存完成
   */
  markSaved(
    fingerprint: string,
    noteId: string,
    noteName: string,
    directoryId?: string,
    isDuplicate = false
  ): void {
    this.savingSet.delete(fingerprint);
    const info: KBSaveStateInfo = {
      state: isDuplicate ? 'duplicate' : 'saved',
      fingerprint,
      noteId,
      noteName,
      directoryId,
      savedAt: Date.now(),
      lastCheckedAt: Date.now(),
    };
    this._updateCache(fingerprint, info);
    this._notify(fingerprint, info);
  }

  /**
   * 标记保存失败
   */
  markError(fingerprint: string, errorMessage: string): void {
    this.savingSet.delete(fingerprint);
    const info: KBSaveStateInfo = {
      state: 'error',
      fingerprint,
      errorMessage,
      lastCheckedAt: Date.now(),
    };
    this._updateCache(fingerprint, info);
    this._notify(fingerprint, info);
  }

  /**
   * 快速检查是否已保存
   */
  isSaved(content: string): boolean {
    const fingerprint = knowledgeSaveManager.computeFingerprint(content);
    const cached = this.stateCache.get(fingerprint);
    return cached?.state === 'saved' || cached?.state === 'duplicate';
  }

  /**
   * 检查是否正在保存
   */
  isSaving(content: string): boolean {
    const fingerprint = knowledgeSaveManager.computeFingerprint(content);
    return this.savingSet.has(fingerprint);
  }

  /**
   * 注册状态变更监听器
   * @returns 取消注册函数
   */
  onStateChange(callback: SaveStateChangeCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * 清除所有缓存
   */
  clearAll(): void {
    this.stateCache.clear();
    this.savingSet.clear();
  }

  /**
   * 清除指定内容的状态
   */
  clearState(content: string): void {
    const fingerprint = knowledgeSaveManager.computeFingerprint(content);
    this.stateCache.delete(fingerprint);
    this.savingSet.delete(fingerprint);
  }

  // ============================================
  // 私有方法
  // ============================================

  private async _checkState(content: string, fingerprint: string): Promise<KBSaveStateInfo> {
    try {
      // 检查历史记录
      const historyRecord = await knowledgeSaveManager.findByFingerprint(fingerprint);
      if (historyRecord) {
        return {
          state: 'saved',
          fingerprint,
          noteId: historyRecord.noteId,
          noteName: historyRecord.noteName,
          directoryId: undefined,
          savedAt: historyRecord.savedAt,
          lastCheckedAt: Date.now(),
        };
      }

      // 检查知识库
      const dupCheck = await knowledgeSaveManager.checkSaved(content);
      if (dupCheck.isDuplicate) {
        return {
          state: 'saved',
          fingerprint,
          noteId: dupCheck.existingNoteId,
          noteName: dupCheck.existingNoteName,
          lastCheckedAt: Date.now(),
        };
      }

      return { state: 'unsaved', fingerprint, lastCheckedAt: Date.now() };
    } catch {
      return { state: 'unsaved', fingerprint, lastCheckedAt: Date.now() };
    }
  }

  private _updateCache(fingerprint: string, info: KBSaveStateInfo): void {
    if (this.stateCache.size >= MAX_CACHE_ENTRIES) {
      this._cleanupCache();
    }
    this.stateCache.set(fingerprint, info);
  }

  private _cleanupCache(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [fp, info] of this.stateCache) {
      if (now - info.lastCheckedAt > STATE_CACHE_TTL) {
        toDelete.push(fp);
      }
    }
    for (const fp of toDelete) {
      this.stateCache.delete(fp);
    }

    // 若仍超限，删最旧的 20%
    if (this.stateCache.size >= MAX_CACHE_ENTRIES) {
      const entries = [...this.stateCache.entries()].sort(
        (a, b) => a[1].lastCheckedAt - b[1].lastCheckedAt
      );
      const count = Math.floor(MAX_CACHE_ENTRIES * 0.2);
      for (let i = 0; i < count; i++) {
        this.stateCache.delete(entries[i][0]);
      }
    }
  }

  private _notify(fingerprint: string, info: KBSaveStateInfo): void {
    for (const listener of this.listeners) {
      try {
        listener(fingerprint, info);
      } catch (e) {
        console.error('[SaveStateTracker] Listener error:', e);
      }
    }
  }
}

// 导出单例
export const saveStateTracker = new SaveStateTracker();

// 导出类
export { SaveStateTracker };

// ============================================
// React Hook
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * React Hook: 追踪内容的保存状态
 */
export function useSaveState(content: string | null) {
  const [stateInfo, setStateInfo] = useState<KBSaveStateInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const prevContentRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!content) {
      setStateInfo(null);
      return;
    }
    setLoading(true);
    try {
      const info = await saveStateTracker.getState(content);
      setStateInfo(info);
    } finally {
      setLoading(false);
    }
  }, [content]);

  useEffect(() => {
    if (content !== prevContentRef.current) {
      prevContentRef.current = content;
      refresh();
    }
  }, [content, refresh]);

  // 监听状态变更
  useEffect(() => {
    if (!content) return;
    const fingerprint = knowledgeSaveManager.computeFingerprint(content);
    const unsubscribe = saveStateTracker.onStateChange((fp, info) => {
      if (fp === fingerprint) {
        setStateInfo(info);
      }
    });
    return unsubscribe;
  }, [content]);

  return { stateInfo, loading, refresh };
}
