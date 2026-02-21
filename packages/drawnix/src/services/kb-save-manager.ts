/**
 * Knowledge Base Save Manager
 *
 * 知识保存管理器 —— 智能保存入口
 * - 内容指纹计算（DJB2 hash）实现去重
 * - 智能目录推断
 * - 合并到现有笔记（mergeIfExists）
 * - 保存历史记录
 */

import {
  getAllDirectories,
  createDirectory,
  getNoteMetasByDirectory,
  getNoteById,
  createNote,
  updateNote,
  getNotesBySourceUrl,
} from './knowledge-base-service';
import type { KBNoteMeta, KBNoteMetadata } from '../types/knowledge-base.types';

// ============================================
// 常量
// ============================================

/** 目录类型 */
export type DirectoryType = 'collection' | 'note' | 'ai_chat' | 'knowledge_extraction';

/** 目录名称映射 */
export const DIRECTORY_NAMES: Record<DirectoryType, string> = {
  collection: '收集',
  note: '笔记',
  ai_chat: 'AI收藏',
  knowledge_extraction: '知识提炼',
};

/** 保存历史最大记录数 */
const MAX_HISTORY_RECORDS = 100;

/** 内容指纹缓存过期时间（毫秒） */
const FINGERPRINT_CACHE_TTL = 30 * 60 * 1000; // 30分钟

/** localStorage key */
const SAVE_HISTORY_KEY = 'aitu:kb:save-history';

// ============================================
// 类型定义
// ============================================

export interface SaveContentItem {
  /** 主要内容（必需） */
  content: string;
  /** 内容类型 */
  contentType?: 'text' | 'markdown' | 'ai_response';
  /** 标题 */
  title?: string;
  /** 来源 URL */
  sourceUrl?: string;
  /** 来源域名 */
  domain?: string;
  /** 标签 */
  tags?: string[];
  /** 附加元数据 */
  metadata?: KBNoteMetadata;
}

export interface SaveOptions {
  /** 目标目录类型（默认自动推断） */
  directoryType?: DirectoryType;
  /** 强制保存（跳过去重检查） */
  force?: boolean;
  /** 合并到现有笔记（如果存在同 URL 的笔记） */
  mergeIfExists?: boolean;
  /** 自定义笔记名称 */
  customNoteName?: string;
  /** 目标目录 ID（优先于 directoryType） */
  directoryId?: string;
}

export interface SaveResult {
  success: boolean;
  noteId: string;
  noteName: string;
  isNewNote: boolean;
  isDuplicate: boolean;
  directoryType: DirectoryType;
  message: string;
  fingerprint: string;
  savedAt: number;
}

export interface SaveHistoryRecord {
  id: string;
  fingerprint: string;
  contentSummary: string;
  noteId: string;
  noteName: string;
  directoryType: DirectoryType;
  sourceUrl?: string;
  savedAt: number;
  isUpdate: boolean;
}

interface CachedFingerprint {
  hash: string;
  noteId: string;
  directoryType: DirectoryType;
  createdAt: number;
}

// ============================================
// KnowledgeSaveManager 类
// ============================================

class KnowledgeSaveManager {
  private directoryIdCache = new Map<DirectoryType, string>();
  private fingerprintCache = new Map<string, CachedFingerprint>();
  private saveHistory: SaveHistoryRecord[] = [];
  private historyLoaded = false;

  /**
   * 保存内容到知识库
   */
  async saveToKnowledgeBase(
    item: SaveContentItem,
    options: SaveOptions = {}
  ): Promise<SaveResult> {
    const { content, sourceUrl } = item;
    const { force = false, mergeIfExists = true } = options;

    // 1. 验证输入
    if (!content || content.trim().length < 2) {
      return this._failResult('内容长度不能少于 2 个字符');
    }

    // 2. 计算指纹
    const fingerprint = this.computeFingerprint(content);

    // 3. 确定目标目录
    const directoryType = options.directoryType || this._inferDirectoryType(item);
    const directoryId = options.directoryId || (await this._ensureDirectory(directoryType));

    // 4. 去重检查
    if (!force) {
      const dupCheck = await this._checkDuplicate(fingerprint, sourceUrl, directoryId);
      if (dupCheck.isDuplicate) {
        return {
          success: true,
          noteId: dupCheck.noteId!,
          noteName: dupCheck.noteName!,
          isNewNote: false,
          isDuplicate: true,
          directoryType,
          message: '内容已存在，无需重复保存',
          fingerprint,
          savedAt: Date.now(),
        };
      }
    }

    // 5. 合并到现有笔记
    if (mergeIfExists && sourceUrl) {
      const existing = await getNotesBySourceUrl(sourceUrl, directoryId);
      if (existing.length > 0) {
        return await this._mergeToExistingNote(existing[0], item, directoryType, fingerprint);
      }
    }

    // 6. 创建新笔记
    return await this._createNewNote(directoryId, item, directoryType, fingerprint, options.customNoteName);
  }

  /**
   * 合并内容到已有笔记
   */
  async mergeToExistingNote(noteId: string, content: string): Promise<void> {
    const note = await getNoteById(noteId);
    if (!note) throw new Error('笔记不存在');

    const newContent = note.content + '\n\n---\n\n' + content.trim();
    await updateNote(noteId, { content: newContent });
  }

  /**
   * 计算内容指纹（DJB2 hash）
   */
  computeFingerprint(content: string): string {
    const normalized = content.trim().toLowerCase().replace(/\s+/g, ' ');
    return this._djb2Hash(normalized);
  }

  /**
   * 检查内容是否已保存
   */
  async checkSaved(content: string): Promise<{
    isDuplicate: boolean;
    existingNoteId?: string;
    existingNoteName?: string;
    existingDirectoryType?: DirectoryType;
  }> {
    const fingerprint = this.computeFingerprint(content);

    // 检查缓存
    const cached = this.fingerprintCache.get(fingerprint);
    if (cached && Date.now() - cached.createdAt < FINGERPRINT_CACHE_TTL) {
      return {
        isDuplicate: true,
        existingNoteId: cached.noteId,
        existingDirectoryType: cached.directoryType,
      };
    }

    // 检查历史
    await this._loadHistory();
    const historyMatch = this.saveHistory.find((r) => r.fingerprint === fingerprint);
    if (historyMatch) {
      return {
        isDuplicate: true,
        existingNoteId: historyMatch.noteId,
        existingNoteName: historyMatch.noteName,
        existingDirectoryType: historyMatch.directoryType,
      };
    }

    return { isDuplicate: false };
  }

  /**
   * 根据指纹查找保存记录
   */
  async findByFingerprint(fingerprint: string): Promise<SaveHistoryRecord | null> {
    await this._loadHistory();
    return this.saveHistory.find((r) => r.fingerprint === fingerprint) || null;
  }

  /**
   * 获取保存历史
   */
  async getSaveHistory(limit = 50): Promise<SaveHistoryRecord[]> {
    await this._loadHistory();
    return this.saveHistory.slice(0, limit);
  }

  // ============================================
  // 私有方法
  // ============================================

  private _inferDirectoryType(item: SaveContentItem): DirectoryType {
    if (item.contentType === 'ai_response') return 'ai_chat';
    return 'collection';
  }

  private async _ensureDirectory(type: DirectoryType): Promise<string> {
    const cached = this.directoryIdCache.get(type);
    if (cached) return cached;

    const name = DIRECTORY_NAMES[type];
    const dirs = await getAllDirectories();
    const existing = dirs.find((d) => d.name === name);

    if (existing) {
      this.directoryIdCache.set(type, existing.id);
      return existing.id;
    }

    const newDir = await createDirectory(name);
    this.directoryIdCache.set(type, newDir.id);
    return newDir.id;
  }

  private async _checkDuplicate(
    fingerprint: string,
    sourceUrl?: string,
    directoryId?: string
  ): Promise<{ isDuplicate: boolean; noteId?: string; noteName?: string }> {
    // 检查指纹缓存
    const cached = this.fingerprintCache.get(fingerprint);
    if (cached && Date.now() - cached.createdAt < FINGERPRINT_CACHE_TTL) {
      return { isDuplicate: true, noteId: cached.noteId };
    }

    // 检查历史
    await this._loadHistory();
    const historyMatch = this.saveHistory.find((r) => r.fingerprint === fingerprint);
    if (historyMatch) {
      return { isDuplicate: true, noteId: historyMatch.noteId, noteName: historyMatch.noteName };
    }

    return { isDuplicate: false };
  }

  private async _mergeToExistingNote(
    noteMeta: KBNoteMeta,
    item: SaveContentItem,
    directoryType: DirectoryType,
    fingerprint: string
  ): Promise<SaveResult> {
    const note = await getNoteById(noteMeta.id);
    if (!note) return this._failResult('笔记加载失败');

    // 检查是否已存在相同内容
    const normalized = item.content.trim().toLowerCase().replace(/\s+/g, ' ');
    if (note.content.toLowerCase().replace(/\s+/g, ' ').includes(normalized)) {
      this._cacheFingerprint(fingerprint, noteMeta.id, directoryType);
      return {
        success: true,
        noteId: noteMeta.id,
        noteName: noteMeta.title,
        isNewNote: false,
        isDuplicate: true,
        directoryType,
        message: '内容已存在于该笔记中',
        fingerprint,
        savedAt: Date.now(),
      };
    }

    // 追加内容
    const newContent = note.content + '\n\n---\n\n' + item.content.trim();
    await updateNote(noteMeta.id, { content: newContent });

    this._cacheFingerprint(fingerprint, noteMeta.id, directoryType);
    await this._addHistoryRecord({
      fingerprint,
      contentSummary: item.content.substring(0, 100),
      noteId: noteMeta.id,
      noteName: noteMeta.title,
      directoryType,
      sourceUrl: item.sourceUrl,
      isUpdate: true,
    });

    return {
      success: true,
      noteId: noteMeta.id,
      noteName: noteMeta.title,
      isNewNote: false,
      isDuplicate: false,
      directoryType,
      message: `已追加到笔记「${noteMeta.title}」`,
      fingerprint,
      savedAt: Date.now(),
    };
  }

  private async _createNewNote(
    directoryId: string,
    item: SaveContentItem,
    directoryType: DirectoryType,
    fingerprint: string,
    customName?: string
  ): Promise<SaveResult> {
    const noteName = customName || this._generateNoteName(item);
    const metadata: KBNoteMetadata = {
      ...item.metadata,
      sourceUrl: item.sourceUrl,
      domain: item.domain,
      tags: item.tags,
    };

    const note = await createNote(noteName, directoryId, item.content, metadata);

    this._cacheFingerprint(fingerprint, note.id, directoryType);
    await this._addHistoryRecord({
      fingerprint,
      contentSummary: item.content.substring(0, 100),
      noteId: note.id,
      noteName,
      directoryType,
      sourceUrl: item.sourceUrl,
      isUpdate: false,
    });

    return {
      success: true,
      noteId: note.id,
      noteName,
      isNewNote: true,
      isDuplicate: false,
      directoryType,
      message: `已创建新笔记「${noteName}」`,
      fingerprint,
      savedAt: Date.now(),
    };
  }

  private _generateNoteName(item: SaveContentItem): string {
    if (item.title && item.title.trim().length >= 2) {
      return item.title.trim().substring(0, 50);
    }
    const firstLine = item.content.trim().split('\n')[0];
    if (firstLine && firstLine.length >= 2 && firstLine.length <= 50) {
      return firstLine;
    }
    return `知识笔记-${new Date().toLocaleDateString('zh-CN')}`;
  }

  private _cacheFingerprint(hash: string, noteId: string, directoryType: DirectoryType): void {
    this.fingerprintCache.set(hash, { hash, noteId, directoryType, createdAt: Date.now() });
  }

  private _djb2Hash(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
      hash = hash >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  private async _loadHistory(): Promise<void> {
    if (this.historyLoaded) return;
    try {
      const stored = localStorage.getItem(SAVE_HISTORY_KEY);
      if (stored) this.saveHistory = JSON.parse(stored);
    } catch {
      this.saveHistory = [];
    }
    this.historyLoaded = true;
  }

  private async _persistHistory(): Promise<void> {
    try {
      if (this.saveHistory.length > MAX_HISTORY_RECORDS) {
        this.saveHistory = this.saveHistory.slice(0, MAX_HISTORY_RECORDS);
      }
      localStorage.setItem(SAVE_HISTORY_KEY, JSON.stringify(this.saveHistory));
    } catch { /* ignore */ }
  }

  private async _addHistoryRecord(record: Omit<SaveHistoryRecord, 'id' | 'savedAt'>): Promise<void> {
    await this._loadHistory();
    this.saveHistory.unshift({
      ...record,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      savedAt: Date.now(),
    });
    await this._persistHistory();
  }

  private _failResult(message: string): SaveResult {
    return {
      success: false,
      noteId: '',
      noteName: '',
      isNewNote: false,
      isDuplicate: false,
      directoryType: 'collection',
      message,
      fingerprint: '',
      savedAt: Date.now(),
    };
  }
}

// 导出单例
export const knowledgeSaveManager = new KnowledgeSaveManager();

// 导出类（用于测试）
export { KnowledgeSaveManager };
