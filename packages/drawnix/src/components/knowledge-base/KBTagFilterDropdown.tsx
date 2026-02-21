
import React, { useState, useMemo } from 'react';
import { Popup, Input, Button } from 'tdesign-react';
import { Search, X, Check, Filter } from 'lucide-react';
import type { KBTagWithCount } from '../../types/knowledge-base.types';
import './kb-filter-dropdown.scss';

interface KBTagFilterDropdownProps {
  allTags: KBTagWithCount[];
  selectedTagIds: string[];
  onSelectedChange: (ids: string[]) => void;
}

export const KBTagFilterDropdown: React.FC<KBTagFilterDropdownProps> = ({
  allTags,
  selectedTagIds,
  onSelectedChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [visible, setVisible] = useState(false);

  const filteredTags = useMemo(() => {
    if (!searchQuery) return allTags;
    const lower = searchQuery.toLowerCase();
    return allTags.filter((tag) => tag.name.toLowerCase().includes(lower));
  }, [allTags, searchQuery]);

  const handleSelect = (tagId: string) => {
    const newSelected = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    onSelectedChange(newSelected);
  };

  const handleClear = () => {
    onSelectedChange([]);
    setVisible(false);
  };

  const content = (
    <div className="kb-filter-dropdown__content">
      <div className="kb-filter-dropdown__search">
        <Input
          value={searchQuery}
          onChange={(v) => setSearchQuery(v as string)}
          placeholder="搜索标签..."
          prefixIcon={<Search size={14} />}
          size="small"
          clearable
        />
      </div>
      <div className="kb-filter-dropdown__list">
        {filteredTags.length > 0 ? (
          filteredTags.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.id);
            return (
              <div
                key={tag.id}
                className={`kb-filter-dropdown__item ${isSelected ? 'is-selected' : ''}`}
                onClick={() => handleSelect(tag.id)}
              >
                <span
                  className="kb-filter-dropdown__item-dot"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="kb-filter-dropdown__item-name">{tag.name}</span>
                <span className="kb-filter-dropdown__item-count">({tag.count || 0})</span>
                {isSelected && <Check size={14} className="kb-filter-dropdown__item-check" />}
              </div>
            );
          })
        ) : (
          <div className="kb-filter-dropdown__empty">无匹配标签</div>
        )}
      </div>
      {selectedTagIds.length > 0 && (
        <div className="kb-filter-dropdown__footer">
          <Button
            theme="default"
            variant="text"
            size="small"
            onClick={handleClear}
            className="kb-filter-dropdown__clear-btn"
          >
            <X size={14} style={{ marginRight: 4 }} />
            清除标签过滤
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Popup
      content={content}
      visible={visible}
      onVisibleChange={(v) => setVisible(v)}
      trigger="click"
      placement="bottom-left"
      overlayClassName="kb-filter-dropdown__popup"
    >
      <Button
        variant={selectedTagIds.length > 0 ? 'base' : 'outline'}
        theme={selectedTagIds.length > 0 ? 'primary' : 'default'}
        size="small"
        className={`kb-filter-trigger ${selectedTagIds.length > 0 ? 'is-active' : ''}`}
      >
        <Filter size={14} style={{ marginRight: 4 }} />
        标签
        {selectedTagIds.length > 0 && ` (${selectedTagIds.length})`}
      </Button>
    </Popup>
  );
};
