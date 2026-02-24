/**
 * KBUnifiedTree - 统一知识库树组件
 *
 * 将目录和笔记合并为一棵树，展开目录后直接显示所属笔记
 */

import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen,
  Folder,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  FileText,
  Globe,
  Copy,
  Lock,
} from 'lucide-react';
import { Z_INDEX } from '../../constants/z-index';
import type { KBDirectory, KBNoteMeta, KBTag } from '../../types/knowledge-base.types';
import { SYSTEM_SKILLS } from '../../constants/skills';

/** 系统内置 Skill 虚拟笔记的 ID 前缀 */
export const SYSTEM_SKILL_NOTE_PREFIX = '__system_skill__';

interface KBUnifiedTreeProps {
  directories: KBDirectory[];
  notesByDir: Record<string, KBNoteMeta[]>;
  noteTagsMap: Record<string, KBTag[]>;
  noteCounts: Record<string, number>;

  selectedDirId: string | null;
  selectedNoteId: string | null;
  expandedDirIds: Set<string>;
  isCreatingDir: boolean;

  /** Skill 目录名称，用于在该目录下注入系统内置 Skill 虚拟笔记 */
  skillDirName?: string;

  onSelectDir: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onCreateDir: (name: string) => Promise<void>;
  onCancelCreateDir: () => void;
  onRenameDir: (id: string, name: string) => Promise<void>;
  onDeleteDir: (id: string) => Promise<void>;
  onDuplicateDir: (id: string) => Promise<void>;

  onSelectNote: (id: string) => void;
  onCreateNote: (directoryId: string) => void;
  onDeleteNote: (id: string) => void;
  onDuplicateNote: (id: string) => void;
  /** 插入笔记到画布的回调（可选） */
  onInsertNoteToCanvas?: (note: KBNoteMeta) => void;
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
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export const KBUnifiedTree: React.FC<KBUnifiedTreeProps> = ({
  directories,
  notesByDir,
  noteTagsMap,
  noteCounts,
  selectedDirId,
  selectedNoteId,
  expandedDirIds,
  isCreatingDir,
  skillDirName = 'Skill',
  onSelectDir,
  onToggleExpand,
  onCreateDir,
  onCancelCreateDir,
  onRenameDir,
  onDeleteDir,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onDuplicateDir,
  onDuplicateNote,
  onInsertNoteToCanvas,
}) => {
  const [newDirName, setNewDirName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: 'directory' | 'note';
    id: string;
    isDefault?: boolean;
  } | null>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    const handleScroll = () => setContextMenu(null);
    
    document.addEventListener('click', handleClick);
    // 使用 capture: true 来捕获所有滚动事件（包括 div 内部滚动）
    document.addEventListener('scroll', handleScroll, true);
    
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, type: 'directory' | 'note', id: string, isDefault = false) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        type,
        id,
        isDefault,
      });
    },
    []
  );

  const handleCreate = useCallback(async () => {
    const name = newDirName.trim();
    if (!name) return;
    try {
      await onCreateDir(name);
      setNewDirName('');
      onCancelCreateDir();
    } catch {
      // duplicate name
    }
  }, [newDirName, onCreateDir, onCancelCreateDir]);

  const handleRename = useCallback(
    async (id: string) => {
      const name = renameValue.trim();
      if (!name) return;
      try {
        await onRenameDir(id, name);
        setRenamingId(null);
      } catch {
        // duplicate name
      }
    },
    [renameValue, onRenameDir]
  );
  return (
    <div className="kb-tree">
      {isCreatingDir && (
        <div className="kb-tree__create-row">
          <input
            className="kb-tree__input"
            value={newDirName}
            onChange={(e) => setNewDirName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') onCancelCreateDir();
            }}
            placeholder="目录名称"
            autoFocus
          />
          <button className="kb-tree__icon-btn" onClick={handleCreate}>
            <Check size={14} />
          </button>
          <button className="kb-tree__icon-btn" onClick={onCancelCreateDir}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="kb-tree__list">
        {directories.map((dir) => (
          <DirectoryNode
            key={dir.id}
            dir={dir}
            isSelected={selectedDirId === dir.id}
            isExpanded={expandedDirIds.has(dir.id)}
            notes={notesByDir[dir.id] || []}
            noteCount={noteCounts[dir.id] || 0}
            noteTagsMap={noteTagsMap}
            selectedNoteId={selectedNoteId}
            isRenaming={renamingId === dir.id}
            renameValue={renameValue}
            onSelectDir={() => {
              onSelectDir(dir.id);
              if (!expandedDirIds.has(dir.id)) onToggleExpand(dir.id);
            }}
            onToggleExpand={() => {
              onToggleExpand(dir.id);
              setContextMenu(null);
            }}
            onStartRename={() => {
              setRenamingId(dir.id);
              setRenameValue(dir.name);
              setContextMenu(null);
            }}
            onRenameChange={setRenameValue}
            onRenameConfirm={() => handleRename(dir.id)}
            onRenameCancel={() => setRenamingId(null)}
            onDeleteDir={() => {
              onDeleteDir(dir.id);
              setContextMenu(null);
            }}
            onCreateNote={() => {
              onCreateNote(dir.id);
              setContextMenu(null);
            }}
          onSelectNote={onSelectNote}
            onDeleteNote={(id) => {
              onDeleteNote(id);
              setContextMenu(null);
            }}
            onContextMenu={(e) => handleContextMenu(e, 'directory', dir.id, dir.isDefault)}
            onNoteContextMenu={(e, noteId) => handleContextMenu(e, 'note', noteId)}
            isSkillDir={dir.name === skillDirName}
          />
        ))}
      </div>

      {contextMenu &&
        createPortal(
          <div
            className="kb-context-menu"
            style={{ 
              top: contextMenu.y, 
              left: contextMenu.x,
              zIndex: Z_INDEX.DROPDOWN_PORTAL
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.type === 'directory' ? (
              <>
                <div
                  className="kb-context-menu__item"
                  onClick={() => {
                    onDuplicateDir(contextMenu.id);
                    setContextMenu(null);
                  }}
                >
                  <Copy size={14} />
                  <span>复制目录</span>
                </div>
                <div
                  className="kb-context-menu__item"
                  onClick={() => {
                    setRenamingId(contextMenu.id);
                    setRenameValue(
                      directories.find((d) => d.id === contextMenu.id)?.name || ''
                    );
                    setContextMenu(null);
                  }}
                >
                  <Pencil size={14} />
                  <span>重命名</span>
                </div>
                <div
                  className="kb-context-menu__item kb-context-menu__item--danger"
                  onClick={() => {
                    onDeleteDir(contextMenu.id);
                    setContextMenu(null);
                  }}
                >
                  <Trash2 size={14} />
                  <span>删除</span>
                </div>
              </>
            ) : (
              <>
                <div
                  className="kb-context-menu__item"
                  onClick={() => {
                    onDuplicateNote(contextMenu.id);
                    setContextMenu(null);
                  }}
                >
                  <Copy size={14} />
                  <span>创建副本</span>
                </div>
                {onInsertNoteToCanvas && (
                  <div
                    className="kb-context-menu__item"
                    onClick={() => {
                      // 找到对应的笔记元数据
                      const allNotes = Object.values(notesByDir).flat();
                      const note = allNotes.find((n) => n.id === contextMenu.id);
                      if (note) onInsertNoteToCanvas(note);
                      setContextMenu(null);
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    <span>插入到画布</span>
                  </div>
                )}
                <div
                  className="kb-context-menu__item kb-context-menu__item--danger"
                  onClick={() => {
                    onDeleteNote(contextMenu.id);
                    setContextMenu(null);
                  }}
                >
                  <Trash2 size={14} />
                  <span>删除</span>
                </div>
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

// ============================================================================
// DirectoryNode sub-component
// ============================================================================

interface DirectoryNodeProps {
  dir: KBDirectory;
  isSelected: boolean;
  isExpanded: boolean;
  notes: KBNoteMeta[];
  noteCount: number;
  noteTagsMap: Record<string, KBTag[]>;
  selectedNoteId: string | null;
  isRenaming: boolean;
  renameValue: string;
  /** 是否为 Skill 目录，若是则在笔记列表顶部注入系统内置 Skill 虚拟笔记 */
  isSkillDir?: boolean;
  onSelectDir: () => void;
  onToggleExpand: () => void;
  onStartRename: () => void;
  onRenameChange: (v: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  onDeleteDir: () => void;
  onCreateNote: () => void;
  onSelectNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onNoteContextMenu: (e: React.MouseEvent, noteId: string) => void;
}
const DirectoryNode: React.FC<DirectoryNodeProps> = ({
  dir,
  isSelected,
  isExpanded,
  notes,
  noteCount,
  noteTagsMap,
  selectedNoteId,
  isRenaming,
  renameValue,
  isSkillDir = false,
  onSelectDir,
  onToggleExpand,
  onStartRename,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel,
  onDeleteDir,
  onCreateNote,
  onSelectNote,
  onDeleteNote,
  onContextMenu,
  onNoteContextMenu,
}) => {
  return (
    <div className={`kb-tree__dir ${isSelected ? 'kb-tree__dir--selected' : ''}`}>
      {/* 目录行 */}
      <div className="kb-tree__dir-row" onClick={onSelectDir} onContextMenu={onContextMenu}>
        <button
          className="kb-tree__expand-btn"
          onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}

        {isRenaming ? (
          <input
            className="kb-tree__input kb-tree__input--inline"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameConfirm();
              if (e.key === 'Escape') onRenameCancel();
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <span className="kb-tree__dir-name">{dir.name}</span>
        )}
        <span className="kb-tree__dir-count">{noteCount}</span>

        <div className="kb-tree__dir-actions">
          <button
            className="kb-tree__icon-btn"
            onClick={(e) => { e.stopPropagation(); onCreateNote(); }}
            title="新建笔记"
          >
            <Plus size={12} />
          </button>
          <>
            <button
              className="kb-tree__icon-btn"
              onClick={(e) => { e.stopPropagation(); onStartRename(); }}
              title="重命名"
            >
              <Pencil size={12} />
            </button>
            <button
              className="kb-tree__icon-btn kb-tree__icon-btn--danger"
              onClick={(e) => { e.stopPropagation(); onDeleteDir(); }}
              title="删除"
            >
              <Trash2 size={12} />
            </button>
          </>
        </div>
      </div>

      {/* 展开后显示笔记 */}
      {isExpanded && (
        <div className="kb-tree__notes">
          {/* Skill 目录：在顶部注入系统内置 Skill 虚拟笔记 */}
          {isSkillDir && SYSTEM_SKILLS.map((skill) => {
            const virtualId = `${SYSTEM_SKILL_NOTE_PREFIX}${skill.id}`;
            const isNoteSelected = selectedNoteId === virtualId;
            return (
              <div
                key={virtualId}
                className={`kb-tree__note-row kb-tree__note-row--system ${isNoteSelected ? 'kb-tree__note-row--selected' : ''}`}
                onClick={() => onSelectNote(virtualId)}
              >
                <div className="kb-tree__note-icon">
                  <Lock size={14} />
                </div>
                <div className="kb-tree__note-content">
                  <div className="kb-tree__note-title">
                    {skill.name}
                    <span className="kb-tree__system-badge">系统</span>
                  </div>
                </div>
              </div>
            );
          })}
          {notes.length === 0 && !isSkillDir && (
            <div className="kb-tree__notes-empty">暂无笔记</div>
          )}
          {notes.length === 0 && isSkillDir && SYSTEM_SKILLS.length === 0 && (
            <div className="kb-tree__notes-empty">暂无笔记</div>
          )}
          {Array.from(new Map(notes.map(n => [n.id, n])).values()).map((note) => {
            const isNoteSelected = selectedNoteId === note.id;
            const tags = noteTagsMap[note.id] || [];
            const metadata = (note as any).metadata;

            return (
              <NoteRow
                key={note.id}
                note={note}
                isSelected={isNoteSelected}
                tags={tags}
                metadata={metadata}
                onSelect={() => onSelectNote(note.id)}
                onDelete={() => onDeleteNote(note.id)}
                onContextMenu={(e) => onNoteContextMenu(e, note.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// NoteRow sub-component
// ============================================================================

interface NoteRowProps {
  note: KBNoteMeta;
  isSelected: boolean;
  tags: KBTag[];
  metadata: any;
  onSelect: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const NoteRow: React.FC<NoteRowProps> = ({
  note,
  isSelected,
  tags,
  metadata,
  onSelect,
  onDelete,
  onContextMenu,
}) => (
  <div
    className={`kb-tree__note-row ${isSelected ? 'kb-tree__note-row--selected' : ''}`}
    onClick={onSelect}
    onContextMenu={onContextMenu}
  >
    <div className="kb-tree__note-icon">
      <FileText size={14} />
    </div>
    <div className="kb-tree__note-content">
      <div className="kb-tree__note-title">{note.title || '无标题'}</div>
      {metadata?.domain && (
        <div className="kb-tree__note-domain">
          {metadata.faviconUrl ? (
            <img
              src={metadata.faviconUrl}
              alt=""
              className="kb-tree__favicon"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <Globe size={10} />
          )}
          <span>{metadata.domain}</span>
        </div>
      )}
      <div className="kb-tree__note-meta">
        {tags.length > 0 && (
          <div className="kb-tree__note-tags">
            {tags.slice(0, 2).map((tag) => (
              <span
                key={tag.id}
                className="kb-tree__tag-badge"
                style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
            {tags.length > 2 && (
              <span className="kb-tree__tag-more">+{tags.length - 2}</span>
            )}
          </div>
        )}
        {tags.length === 0 && !metadata?.domain && (
          <span className="kb-tree__note-time">{formatTime(note.updatedAt)}</span>
        )}
      </div>
    </div>
    <button
      className="kb-tree__note-delete"
      onClick={(e) => { e.stopPropagation(); onDelete(); }}
      title="删除笔记"
    >
      <Trash2 size={12} />
    </button>
  </div>
);
