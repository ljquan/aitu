/**
 * KBRelatedNotes - 相关笔记推荐组件（右侧面板用）
 *
 * 分为两个分组：
 * 1. 相关笔记 - 相同来源 URL 的笔记
 * 2. 相似笔记 - 基于 TF-IDF + 余弦相似度推荐，显示相似度百分比
 */

import React, { useMemo, useEffect, useState } from 'react';
import { FileText, Link2, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import type { KBNoteMeta, KBTag } from '../../types/knowledge-base.types';
import { getKBSearchEngine, type KBSearchResult } from '../../services/kb-search-engine';

interface KBRelatedNotesProps {
  currentNoteId: string;
  allNotes: KBNoteMeta[];
  noteTagsMap: Record<string, KBTag[]>;
  onSelectNote: (id: string) => void;
}

const MAX_RELATED = 10;

export const KBRelatedNotes: React.FC<KBRelatedNotesProps> = ({
  currentNoteId,
  allNotes,
  noteTagsMap,
  onSelectNote,
}) => {
  const [engineResults, setEngineResults] = useState<KBSearchResult[]>([]);
  const [relatedCollapsed, setRelatedCollapsed] = useState(false);
  const [similarCollapsed, setSimilarCollapsed] = useState(false);

  // 通过搜索引擎获取关联笔记
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const engine = getKBSearchEngine();
        const results = await engine.getRelatedNotes(currentNoteId, MAX_RELATED);
        if (!cancelled) setEngineResults(results);
      } catch {
        if (!cancelled) setEngineResults([]);
      }
    })();
    return () => { cancelled = true; };
  }, [currentNoteId]);

  // 相关笔记（相同 sourceUrl）
  const currentNote = useMemo(() => allNotes.find(n => n.id === currentNoteId), [allNotes, currentNoteId]);
  const relatedNotes = useMemo(() => {
    const sourceUrl = (currentNote as any)?.metadata?.sourceUrl;
    if (!sourceUrl) return [];
    return allNotes.filter(
      n => n.id !== currentNoteId && (n as any)?.metadata?.sourceUrl === sourceUrl
    );
  }, [allNotes, currentNoteId, currentNote]);

  // 相似笔记 - 来自搜索引擎结果，排除已在相关笔记中的
  const relatedIds = useMemo(() => new Set(relatedNotes.map(n => n.id)), [relatedNotes]);
  const similarNotes = useMemo(() => {
    if (engineResults.length > 0) {
      // 去重：过滤掉已在 relatedNotes 中的笔记，并排除重复 id
      const seen = new Set<string>();
      return engineResults.filter(r => {
        if (relatedIds.has(r.id) || seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
    }
    // 回退：基于标签相似度
    const currentTags = noteTagsMap[currentNoteId] || [];
    const currentTagIds = new Set(currentTags.map(t => t.id));
    if (!currentNote) return [];

    const scored: { id: string; title: string; score: number }[] = [];
    for (const note of allNotes) {
      if (note.id === currentNoteId || relatedIds.has(note.id)) continue;
      const noteTags = noteTagsMap[note.id] || [];
      const noteTagIds = noteTags.map(t => t.id);
      const commonTags = noteTagIds.filter(id => currentTagIds.has(id)).length;
      const totalTags = new Set([...currentTagIds, ...noteTagIds]).size;
      const tagScore = totalTags > 0 ? commonTags / totalTags : 0;
      const titleScore = textSimilarity(currentNote.title, note.title);
      const score = tagScore * 0.7 + titleScore * 0.3;
      if (score > 0.05) scored.push({ id: note.id, title: note.title || '无标题', score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, MAX_RELATED);
  }, [engineResults, relatedIds, allNotes, currentNoteId, noteTagsMap, currentNote]);

  if (relatedNotes.length === 0 && similarNotes.length === 0) return null;

  return (
    <div className="kb-related-notes">
      {/* 相关笔记（相同来源） */}
      {relatedNotes.length > 0 && (
        <div className="kb-related-notes__section">
          <button
            className="kb-related-notes__section-header"
            onClick={() => setRelatedCollapsed(!relatedCollapsed)}
          >
            {relatedCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            <Link2 size={12} />
            <span>相关笔记</span>
            <span className="kb-related-notes__count">{relatedNotes.length}</span>
          </button>
          {!relatedCollapsed && (
            <div className="kb-related-notes__list">
              {relatedNotes.map((note) => (
                <div
                  key={`related-${note.id}`}
                  className="kb-related-notes__item"
                  onClick={() => onSelectNote(note.id)}
                >
                  <FileText size={12} className="kb-related-notes__icon" />
                  <span className="kb-related-notes__name">{note.title || '无标题'}</span>
                  <button
                    className="kb-related-notes__goto-btn"
                    onClick={(e) => { e.stopPropagation(); onSelectNote(note.id); }}
                    title="跳转"
                  >
                    <ExternalLink size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 相似笔记 */}
      {similarNotes.length > 0 && (
        <div className="kb-related-notes__section">
          <button
            className="kb-related-notes__section-header"
            onClick={() => setSimilarCollapsed(!similarCollapsed)}
          >
            {similarCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            <FileText size={12} />
            <span>相似笔记</span>
            <span className="kb-related-notes__count">{similarNotes.length}</span>
          </button>
          {!similarCollapsed && (
            <div className="kb-related-notes__list">
              {similarNotes.map((note) => {
                const similarity = 'score' in note ? (note as any).score : undefined;
                return (
                  <div
                    key={`similar-${note.id}`}
                    className="kb-related-notes__item"
                    onClick={() => onSelectNote(note.id)}
                  >
                    <FileText size={12} className="kb-related-notes__icon" />
                    <span className="kb-related-notes__name">{note.title}</span>
                    {similarity !== undefined && (
                      <span className="kb-related-notes__similarity">
                        {Math.round(similarity * 100)}%
                      </span>
                    )}
                    <button
                      className="kb-related-notes__goto-btn"
                      onClick={(e) => { e.stopPropagation(); onSelectNote(note.id); }}
                      title="跳转"
                    >
                      <ExternalLink size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** 简单文本相似度（bigram Dice 系数）作为回退 */
function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  const bigramsA = new Set<string>();
  for (let i = 0; i < la.length - 1; i++) bigramsA.add(la.substring(i, i + 2));
  const bigramsB = new Set<string>();
  for (let i = 0; i < lb.length - 1; i++) bigramsB.add(lb.substring(i, i + 2));
  let intersection = 0;
  for (const bg of bigramsA) { if (bigramsB.has(bg)) intersection++; }
  const union = bigramsA.size + bigramsB.size;
  return union === 0 ? 0 : (2 * intersection) / union;
}
