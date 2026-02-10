/**
 * KBTagSelector - 知识库标签选择器
 *
 * 支持选择/取消选择标签、创建新标签
 */

import React, { useState, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
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
  const [newTagName, setNewTagName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const toggleTag = useCallback(
    (tagId: string) => {
      const next = selectedTagIds.includes(tagId)
        ? selectedTagIds.filter((id) => id !== tagId)
        : [...selectedTagIds, tagId];
      onSelectedChange(next);
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

  return (
    <div className="kb-tag-selector">
      <div className="kb-tag-selector__tags">
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
              <span
                className="kb-tag-selector__dot"
                style={{ backgroundColor: tag.color }}
              />
              <span>{tag.name}</span>
              {showCount && <span className="kb-tag-selector__count">({tag.count})</span>}
              {isSelected && <X size={12} />}
            </button>
          );
        })}
      </div>

      {isCreating ? (
        <div className="kb-tag-selector__create">
          <input
            className="kb-tag-selector__input"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') setIsCreating(false);
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
          className="kb-tag-selector__add-btn"
          onClick={() => setIsCreating(true)}
        >
          <Plus size={14} />
          <span>新标签</span>
        </button>
      )}
    </div>
  );
};
