/**
 * KBNoteList - 知识库笔记列表组件
 *
 * 展示当前目录下的笔记列表，支持新建、选中、删除
 */

import React, { useMemo } from 'react';
import { Plus, FileText, Trash2 } from 'lucide-react';
import type { KBNoteMeta, KBTag } from '../../types/knowledge-base.types';

interface KBNoteListProps {
  notes: KBNoteMeta[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: string) => void;
  noteTagsMap: Record<string, KBTag[]>;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (isToday) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  const isThisYear = d.getFullYear() === now.getFullYear();
  if (isThisYear) {
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }

  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export const KBNoteList: React.FC<KBNoteListProps> = ({
  notes,
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  noteTagsMap,
}) => {
  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => b.updatedAt - a.updatedAt),
    [notes]
  );

  return (
    <div className="kb-note-list">
      <div className="kb-note-list__header">
        <span className="kb-note-list__title">
          笔记 ({notes.length})
        </span>
        <button
          className="kb-note-list__add-btn"
          onClick={onCreateNote}
          title="新建笔记"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="kb-note-list__items">
        {sortedNotes.length === 0 && (
          <div className="kb-note-list__empty">暂无笔记</div>
        )}
        {sortedNotes.map((note) => {
          const isSelected = selectedNoteId === note.id;
          const tags = noteTagsMap[note.id] || [];

          return (
            <div
              key={note.id}
              className={`kb-note-list__item ${isSelected ? 'kb-note-list__item--selected' : ''}`}
              onClick={() => onSelectNote(note.id)}
            >
              <div className="kb-note-list__item-icon">
                <FileText size={14} />
              </div>
              <div className="kb-note-list__item-content">
                <div className="kb-note-list__item-title">
                  {note.title || '无标题'}
                </div>
                <div className="kb-note-list__item-meta">
                  <span className="kb-note-list__item-time">
                    {formatTime(note.updatedAt)}
                  </span>
                  {tags.length > 0 && (
                    <div className="kb-note-list__item-tags">
                      {tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag.id}
                          className="kb-note-list__tag-badge"
                          style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                        >
                          {tag.name}
                        </span>
                      ))}
                      {tags.length > 3 && (
                        <span className="kb-note-list__tag-more">+{tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button
                className="kb-note-list__delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteNote(note.id);
                }}
                title="删除笔记"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
