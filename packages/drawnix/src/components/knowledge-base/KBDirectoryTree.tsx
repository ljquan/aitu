/**
 * KBDirectoryTree - 知识库目录树组件
 *
 * 展示目录列表，支持创建/重命名/删除目录
 */

import React, { useState, useCallback } from 'react';
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
} from 'lucide-react';
import type { KBDirectory } from '../../types/knowledge-base.types';

interface KBDirectoryTreeProps {
  directories: KBDirectory[];
  selectedDirId: string | null;
  expandedDirIds: Set<string>;
  onSelectDir: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onCreateDir: (name: string) => Promise<void>;
  onRenameDir: (id: string, name: string) => Promise<void>;
  onDeleteDir: (id: string) => Promise<void>;
  noteCounts: Record<string, number>;
}

export const KBDirectoryTree: React.FC<KBDirectoryTreeProps> = ({
  directories,
  selectedDirId,
  expandedDirIds,
  onSelectDir,
  onToggleExpand,
  onCreateDir,
  onRenameDir,
  onDeleteDir,
  noteCounts,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newDirName, setNewDirName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleCreate = useCallback(async () => {
    const name = newDirName.trim();
    if (!name) return;
    try {
      await onCreateDir(name);
      setNewDirName('');
      setIsCreating(false);
    } catch {
      // duplicate name
    }
  }, [newDirName, onCreateDir]);

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
    <div className="kb-dir-tree">
      <div className="kb-dir-tree__header">
        <span className="kb-dir-tree__title">目录</span>
        <button
          className="kb-dir-tree__add-btn"
          onClick={() => setIsCreating(true)}
          title="新建目录"
        >
          <Plus size={14} />
        </button>
      </div>

      {isCreating && (
        <div className="kb-dir-tree__create-row">
          <input
            className="kb-dir-tree__input"
            value={newDirName}
            onChange={(e) => setNewDirName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setIsCreating(false);
            }}
            placeholder="目录名称"
            autoFocus
          />
          <button className="kb-dir-tree__icon-btn" onClick={handleCreate}>
            <Check size={14} />
          </button>
          <button
            className="kb-dir-tree__icon-btn"
            onClick={() => setIsCreating(false)}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="kb-dir-tree__list">
        {directories.map((dir) => {
          const isSelected = selectedDirId === dir.id;
          const isExpanded = expandedDirIds.has(dir.id);
          const isRenaming = renamingId === dir.id;
          const count = noteCounts[dir.id] || 0;

          return (
            <div
              key={dir.id}
              className={`kb-dir-tree__item ${isSelected ? 'kb-dir-tree__item--selected' : ''}`}
            >
              <div
                className="kb-dir-tree__item-row"
                onClick={() => {
                  onSelectDir(dir.id);
                  if (!isExpanded) onToggleExpand(dir.id);
                }}
              >
                <button
                  className="kb-dir-tree__expand-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpand(dir.id);
                  }}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}

                {isRenaming ? (
                  <input
                    className="kb-dir-tree__input kb-dir-tree__input--inline"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(dir.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span className="kb-dir-tree__item-name">{dir.name}</span>
                )}

                <span className="kb-dir-tree__item-count">{count}</span>

                <div className="kb-dir-tree__item-actions">
                  {!dir.isDefault && (
                    <>
                      <button
                        className="kb-dir-tree__icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(dir.id);
                          setRenameValue(dir.name);
                        }}
                        title="重命名"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        className="kb-dir-tree__icon-btn kb-dir-tree__icon-btn--danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteDir(dir.id);
                        }}
                        title="删除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
