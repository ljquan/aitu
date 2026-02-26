/**
 * KBTagSelector - 知识库标签选择器
 *
 * 已选标签行内展示（可点 X 删除）+ 点击「+ 标签」展开下拉面板选择/创建标签
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, X, Tag } from 'lucide-react';
import type { KBTag, KBTagWithCount } from '../../types/knowledge-base.types';

interface KBTagSelectorProps {
  /** 所有可用标签 */
  allTags: KBTagWithCount[];
  /** 当前选中的标签 ID 列表 */
  selectedTagIds: string[];
  /** 选中标签变化回调 */
  onSelectedChange: (tagIds: string[]) => void;
  /** 创建新标签回调 */
  onCreateTag: (name: string) => Promise<KBTag>;
  /** 是否用于过滤（显示计数） */
  showCount?: boolean;
}

export const KBTagSelector: React.FC<KBTagSelectorProps> = ({
  allTags,
  selectedTagIds,
  onSelectedChange,
  onCreateTag,
  showCount = false,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setIsCreating(false);
        setNewTagName('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const toggleTag = useCallback(
    (tagId: string) => {
      const next = selectedTagIds.includes(tagId)
        ? selectedTagIds.filter((id) => id !== tagId)
        : [...selectedTagIds, tagId];
      onSelectedChange(next);
    },
    [selectedTagIds, onSelectedChange]
  );

  const removeTag = useCallback(
    (tagId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onSelectedChange(selectedTagIds.filter((id) => id !== tagId));
    },
    [selectedTagIds, onSelectedChange]
  );

  const handleCreate = useCallback(async () => {
    const name = newTagName.trim();
    if (!name) return;
    try {
      const tag = await onCreateTag(name);
      onSelectedChange([...selectedTagIds, tag.id]);
      setNewTagName('');
      setIsCreating(false);
    } catch {
      // Tag may already exist
    }
  }, [newTagName, onCreateTag, selectedTagIds, onSelectedChange]);

  // 已选中的标签对象
  const selectedTags = allTags.filter((t) => selectedTagIds.includes(t.id));

  return (
    <div className="kb-tag-selector" ref={containerRef}>
      {/* 已选标签行 */}
      <div className="kb-tag-selector__selected">
        {selectedTags.map((tag) => (
          <span
            key={tag.id}
            className="kb-tag-selector__tag kb-tag-selector__tag--selected"
            style={{
              '--tag-color': tag.color,
              borderColor: tag.color,
              backgroundColor: `${tag.color}15`,
            } as React.CSSProperties}
          >
            <span className="kb-tag-selector__dot" style={{ backgroundColor: tag.color }} />
            <span>{tag.name}</span>
            <button
              className="kb-tag-selector__remove"
              onClick={(e) => removeTag(tag.id, e)}
              title="移除标签"
            >
              <X size={11} />
            </button>
          </span>
        ))}

        {/* + 标签 按钮 */}
        <button
          className="kb-tag-selector__add-btn"
          onClick={() => setDropdownOpen((v) => !v)}
        >
          <Plus size={13} />
          <span>标签</span>
        </button>
      </div>

      {/* 下拉面板 */}
      {dropdownOpen && (
        <div className="kb-tag-selector__dropdown">
          {/* 所有可用标签 */}
          <div className="kb-tag-selector__tags">
            {allTags.length === 0 && (
              <span className="kb-tag-selector__empty">暂无标签</span>
            )}
            {allTags.map((tag) => {
              const isSelected = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  className={`kb-tag-selector__tag ${isSelected ? 'kb-tag-selector__tag--selected' : ''}`}
                  style={{
                    '--tag-color': tag.color,
                    borderColor: isSelected ? tag.color : undefined,
                    backgroundColor: isSelected ? `${tag.color}15` : undefined,
                  } as React.CSSProperties}
                  onClick={() => toggleTag(tag.id)}
                >
                  <span className="kb-tag-selector__dot" style={{ backgroundColor: tag.color }} />
                  <span>{tag.name}</span>
                  {showCount && <span className="kb-tag-selector__count">({tag.count})</span>}
                  {isSelected && <X size={12} />}
                </button>
              );
            })}
          </div>

          {/* 创建新标签 */}
          {isCreating ? (
            <div className="kb-tag-selector__create">
              <input
                className="kb-tag-selector__input"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') { setIsCreating(false); setNewTagName(''); }
                }}
                placeholder="标签名称"
                autoFocus
              />
              <button className="kb-tag-selector__create-btn" onClick={handleCreate}>
                确定
              </button>
            </div>
          ) : (
            <button
              className="kb-tag-selector__new-btn"
              onClick={() => setIsCreating(true)}
            >
              <Plus size={13} />
              <span>新建标签</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
