/**
 * KBRelatedNotes - 相关笔记推荐组件
 *
 * 基于标签重合度和标题相似度推荐相关笔记
 */

import React, { useMemo } from 'react';
import { FileText } from 'lucide-react';
import type { KBNoteMeta, KBTag } from '../../types/knowledge-base.types';

interface KBRelatedNotesProps {
  currentNoteId: string;
  allNotes: KBNoteMeta[];
  noteTagsMap: Record<string, KBTag[]>;
  onSelectNote: (id: string) => void;
}

interface ScoredNote {
  note: KBNoteMeta;
  score: number;
}

/** 计算两个字符串的简单相似度（基于共同字符 bigram） */
function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const la = a.toLowerCase();
  const lb = b.toLowerCase();

  const bigramsA = new Set<string>();
  for (let i = 0; i < la.length - 1; i++) {
    bigramsA.add(la.substring(i, i + 2));
  }

  const bigramsB = new Set<string>();
  for (let i = 0; i < lb.length - 1; i++) {
    bigramsB.add(lb.substring(i, i + 2));
  }

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  const union = bigramsA.size + bigramsB.size;
  return union === 0 ? 0 : (2 * intersection) / union;
}

const MAX_RELATED = 5;

export const KBRelatedNotes: React.FC<KBRelatedNotesProps> = ({
  currentNoteId,
  allNotes,
  noteTagsMap,
  onSelectNote,
}) => {
  const relatedNotes = useMemo(() => {
    const currentTags = noteTagsMap[currentNoteId] || [];
    const currentTagIds = new Set(currentTags.map((t) => t.id));
    const currentNote = allNotes.find((n) => n.id === currentNoteId);
    if (!currentNote) return [];

    const scored: ScoredNote[] = [];

    for (const note of allNotes) {
      if (note.id === currentNoteId) continue;

      // 标签重合度得分（0-1，权重 0.7）
      const noteTags = noteTagsMap[note.id] || [];
      const noteTagIds = noteTags.map((t) => t.id);
      const commonTags = noteTagIds.filter((id) => currentTagIds.has(id)).length;
      const totalTags = new Set([...currentTagIds, ...noteTagIds]).size;
      const tagScore = totalTags > 0 ? commonTags / totalTags : 0;

      // 标题相似度得分（0-1，权重 0.3）
      const titleScore = textSimilarity(currentNote.title, note.title);

      const score = tagScore * 0.7 + titleScore * 0.3;

      if (score > 0.05) {
        scored.push({ note, score });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RELATED)
      .map((s) => s.note);
  }, [currentNoteId, allNotes, noteTagsMap]);

  if (relatedNotes.length === 0) {
    return null;
  }

  return (
    <div className="kb-related-notes">
      <div className="kb-related-notes__title">相关笔记</div>
      <div className="kb-related-notes__list">
        {relatedNotes.map((note) => {
          const tags = noteTagsMap[note.id] || [];
          return (
            <div
              key={note.id}
              className="kb-related-notes__item"
              onClick={() => onSelectNote(note.id)}
            >
              <FileText size={12} className="kb-related-notes__icon" />
              <span className="kb-related-notes__name">{note.title || '无标题'}</span>
              {tags.length > 0 && (
                <div className="kb-related-notes__tags">
                  {tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag.id}
                      className="kb-related-notes__tag"
                      style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
