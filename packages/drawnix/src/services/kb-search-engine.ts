/**
 * Knowledge Base Search Engine
 *
 * 基于 TF-IDF 和余弦相似度的知识库搜索引擎
 * - 全量/增量索引
 * - 语义搜索（标题 2x 加权、元数据 1.5x 加权）
 * - 关联笔记推荐
 * - 智能摘要生成
 */

import { text2vec, tokenize } from './kb-nlp/tokenizer';
import { cosineSimilarity, type SparseVector } from './kb-nlp/similarity';
import { TfidfVectorizer } from './kb-nlp/tfidf';
import {
  getAllNoteMetas,
  getNoteById,
  getAllDirectories,
} from './knowledge-base-service';
import type { KBNoteMeta, KBDirectory, KBNoteMetadata } from '../types/knowledge-base.types';

// ============================================
// 类型
// ============================================

export interface KBSearchFilterOptions {
  tagIds?: string[];
  domain?: string;
  directoryId?: string;
}

export interface KBSearchResult {
  id: string;
  title: string;
  snippet: string;
  content: string;
  similarity: number;
  directoryId: string;
  directoryName?: string;
  sourceUrl?: string;
  domain?: string;
  updatedAt: number;
  createdAt: number;
  metadata?: KBNoteMetadata;
}

export interface KBSearchOptions {
  limit?: number;
  minSimilarity?: number;
  filter?: KBSearchFilterOptions;
  includeContent?: boolean;
  snippetLength?: number;
}

interface IndexedDocument {
  id: string;
  title: string;
  content: string;
  directoryId: string;
  updatedAt: number;
  createdAt: number;
  metadata?: KBNoteMetadata;
  titleVector: SparseVector;
  contentVector: SparseVector;
  metadataVector: SparseVector;
  combinedVector: SparseVector;
}

const DEFAULT_OPTIONS: Required<KBSearchOptions> = {
  limit: 20,
  minSimilarity: 0.1,
  filter: {},
  includeContent: false,
  snippetLength: 200,
};

// ============================================
// KBSearchEngine 类
// ============================================

export class KBSearchEngine {
  private documents: IndexedDocument[] = [];
  private tfidfVectorizer: TfidfVectorizer | null = null;
  private directoryMap = new Map<string, KBDirectory>();
  private indexedVersions = new Map<string, number>();
  private isIndexed = false;
  private lastIndexTime = 0;

  /**
   * 构建完整索引
   */
  async buildIndex(): Promise<void> {
    const [noteMetas, directories] = await Promise.all([
      getAllNoteMetas(),
      getAllDirectories(),
    ]);

    this.directoryMap.clear();
    for (const dir of directories) {
      this.directoryMap.set(dir.id, dir);
    }

    this.documents = [];
    this.indexedVersions.clear();
    const allVectors: SparseVector[] = [];

    for (const meta of noteMetas) {
      const note = await getNoteById(meta.id);
      const content = note?.content || '';

      const doc = this._buildIndexedDoc(meta, content);
      this.documents.push(doc);
      this.indexedVersions.set(meta.id, meta.updatedAt);
      allVectors.push(doc.combinedVector);
    }

    if (allVectors.length > 0) {
      this.tfidfVectorizer = new TfidfVectorizer();
      this.tfidfVectorizer.fit(allVectors);
    }

    this.isIndexed = true;
    this.lastIndexTime = Date.now();
  }

  /**
   * 增量同步索引
   */
  async syncIndex(): Promise<{ added: number; updated: number; removed: number }> {
    const [noteMetas, directories] = await Promise.all([
      getAllNoteMetas(),
      getAllDirectories(),
    ]);

    this.directoryMap.clear();
    for (const dir of directories) {
      this.directoryMap.set(dir.id, dir);
    }

    const currentIds = new Set<string>();
    let added = 0;
    let updated = 0;

    for (const meta of noteMetas) {
      currentIds.add(meta.id);
      const indexedVersion = this.indexedVersions.get(meta.id);

      if (indexedVersion === undefined || indexedVersion < meta.updatedAt) {
        const note = await getNoteById(meta.id);
        const content = note?.content || '';
        const doc = this._buildIndexedDoc(meta, content);

        if (indexedVersion === undefined) {
          this.documents.push(doc);
          added++;
        } else {
          const idx = this.documents.findIndex((d) => d.id === meta.id);
          if (idx !== -1) this.documents[idx] = doc;
          else this.documents.push(doc);
          updated++;
        }
        this.indexedVersions.set(meta.id, meta.updatedAt);
      }
    }

    // 移除已删除的笔记
    const removedIds: string[] = [];
    for (const id of this.indexedVersions.keys()) {
      if (!currentIds.has(id)) removedIds.push(id);
    }
    for (const id of removedIds) {
      this.documents = this.documents.filter((d) => d.id !== id);
      this.indexedVersions.delete(id);
    }

    this.lastIndexTime = Date.now();
    return { added, updated, removed: removedIds.length };
  }

  /**
   * 确保索引可用
   */
  async ensureIndex(): Promise<void> {
    if (!this.isIndexed) {
      await this.buildIndex();
    } else {
      await this.syncIndex();
    }
  }

  /**
   * 搜索
   */
  async search(query: string, options?: KBSearchOptions): Promise<KBSearchResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    if (!query.trim()) return [];

    await this.ensureIndex();
    if (this.documents.length === 0) return [];

    const queryVector = text2vec(query);

    const results: { doc: IndexedDocument; similarity: number }[] = [];

    for (const doc of this.documents) {
      if (opts.filter.directoryId && doc.directoryId !== opts.filter.directoryId) continue;
      if (opts.filter.domain && doc.metadata?.domain !== opts.filter.domain) continue;

      const titleSim = cosineSimilarity(queryVector, doc.titleVector);
      const contentSim = cosineSimilarity(queryVector, doc.contentVector);
      const metaSim = cosineSimilarity(queryVector, doc.metadataVector);
      const combinedSim = cosineSimilarity(queryVector, doc.combinedVector);

      const similarity = Math.max(combinedSim, titleSim * 1.5, contentSim, metaSim * 1.3);

      if (similarity >= opts.minSimilarity) {
        results.push({ doc, similarity });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, opts.limit).map(({ doc, similarity }) => {
      const directory = this.directoryMap.get(doc.directoryId);
      return {
        id: doc.id,
        title: doc.title,
        snippet: this._generateSnippet(doc.content, query, opts.snippetLength),
        content: opts.includeContent ? doc.content : '',
        similarity,
        directoryId: doc.directoryId,
        directoryName: directory?.name,
        sourceUrl: doc.metadata?.sourceUrl,
        domain: doc.metadata?.domain,
        updatedAt: doc.updatedAt,
        createdAt: doc.createdAt,
        metadata: doc.metadata,
      };
    });
  }

  /**
   * 获取关联笔记
   */
  async getRelatedNotes(noteId: string, limit = 5): Promise<KBSearchResult[]> {
    await this.ensureIndex();

    const source = this.documents.find((d) => d.id === noteId);
    if (!source) return [];

    const results: { doc: IndexedDocument; similarity: number }[] = [];
    for (const doc of this.documents) {
      if (doc.id === noteId) continue;
      const sim = cosineSimilarity(source.combinedVector, doc.combinedVector);
      if (sim > 0.1) results.push({ doc, similarity: sim });
    }

    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, limit).map(({ doc, similarity }) => {
      const directory = this.directoryMap.get(doc.directoryId);
      return {
        id: doc.id,
        title: doc.title,
        snippet: doc.content.substring(0, 200) + (doc.content.length > 200 ? '...' : ''),
        content: '',
        similarity,
        directoryId: doc.directoryId,
        directoryName: directory?.name,
        sourceUrl: doc.metadata?.sourceUrl,
        domain: doc.metadata?.domain,
        updatedAt: doc.updatedAt,
        createdAt: doc.createdAt,
        metadata: doc.metadata,
      };
    });
  }

  /**
   * 增量添加/更新单个文档到索引
   */
  addNote(id: string, title: string, content: string, directoryId: string, updatedAt: number, createdAt: number, metadata?: KBNoteMetadata): void {
    this.documents = this.documents.filter((d) => d.id !== id);
    const meta: KBNoteMeta = { id, title, directoryId, updatedAt, createdAt, metadata };
    this.documents.push(this._buildIndexedDoc(meta, content));
    this.indexedVersions.set(id, updatedAt);
  }

  /**
   * 从索引中移除文档
   */
  removeNote(noteId: string): void {
    this.documents = this.documents.filter((d) => d.id !== noteId);
    this.indexedVersions.delete(noteId);
  }

  /**
   * 获取索引统计
   */
  getStats(): { documentCount: number; isIndexed: boolean; lastIndexTime: number } {
    return { documentCount: this.documents.length, isIndexed: this.isIndexed, lastIndexTime: this.lastIndexTime };
  }

  /**
   * 清除索引
   */
  clearIndex(): void {
    this.documents = [];
    this.indexedVersions.clear();
    this.tfidfVectorizer = null;
    this.isIndexed = false;
    this.lastIndexTime = 0;
  }

  // ============================================
  // 私有方法
  // ============================================

  private _buildIndexedDoc(meta: KBNoteMeta, content: string): IndexedDocument {
    const titleVector = text2vec(meta.title);
    const contentVector = text2vec(content);
    const metadataText = this._buildMetadataText(meta.metadata);
    const metadataVector = text2vec(metadataText);

    // 合并向量（加权）
    const combinedVector: SparseVector = {};

    // 标题 x2
    for (const [term, freq] of Object.entries(titleVector)) {
      combinedVector[term] = (combinedVector[term] || 0) + freq * 2;
    }
    // 内容 x1
    for (const [term, freq] of Object.entries(contentVector)) {
      combinedVector[term] = (combinedVector[term] || 0) + freq;
    }
    // 元数据 x1.5
    for (const [term, freq] of Object.entries(metadataVector)) {
      combinedVector[term] = (combinedVector[term] || 0) + freq * 1.5;
    }

    return {
      id: meta.id,
      title: meta.title,
      content,
      directoryId: meta.directoryId,
      updatedAt: meta.updatedAt,
      createdAt: meta.createdAt,
      metadata: meta.metadata,
      titleVector,
      contentVector,
      metadataVector,
      combinedVector,
    };
  }

  private _buildMetadataText(metadata?: KBNoteMetadata): string {
    if (!metadata) return '';
    const parts: string[] = [];
    if (metadata.domain) parts.push(metadata.domain);
    if (metadata.tags) parts.push(...metadata.tags);
    return parts.join(' ');
  }

  private _generateSnippet(content: string, query: string, maxLength: number): string {
    if (!content) return '';

    const queryTokens = tokenize(query);
    const lowerContent = content.toLowerCase();

    let bestPosition = 0;
    let bestScore = 0;

    for (const token of queryTokens) {
      const pos = lowerContent.indexOf(token.toLowerCase());
      if (pos !== -1) {
        const ctxStart = Math.max(0, pos - 50);
        const ctxEnd = Math.min(content.length, pos + 50);
        const context = lowerContent.substring(ctxStart, ctxEnd);

        let score = 0;
        for (const t of queryTokens) {
          if (context.includes(t.toLowerCase())) score++;
        }
        if (score > bestScore) {
          bestScore = score;
          bestPosition = pos;
        }
      }
    }

    const start = Math.max(0, bestPosition - Math.floor(maxLength / 2));
    const end = Math.min(content.length, start + maxLength);
    let snippet = content.substring(start, end);

    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    return snippet;
  }
}

// ============================================
// 单例
// ============================================

let _instance: KBSearchEngine | null = null;

export function getKBSearchEngine(): KBSearchEngine {
  if (!_instance) _instance = new KBSearchEngine();
  return _instance;
}

export function resetKBSearchEngine(): void {
  if (_instance) {
    _instance.clearIndex();
    _instance = null;
  }
}
