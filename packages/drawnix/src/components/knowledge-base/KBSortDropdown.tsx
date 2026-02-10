/**
 * KBSortDropdown - 知识库排序下拉组件
 */

import React from 'react';
import { Select } from 'tdesign-react';
import type { KBSortOptions, KBSortField, KBSortOrder } from '../../types/knowledge-base.types';

const SORT_FIELD_OPTIONS: Array<{ label: string; value: KBSortField }> = [
  { label: '更新时间', value: 'updatedAt' },
  { label: '创建时间', value: 'createdAt' },
  { label: '标题', value: 'title' },
];

const SORT_ORDER_OPTIONS: Array<{ label: string; value: KBSortOrder }> = [
  { label: '降序', value: 'desc' },
  { label: '升序', value: 'asc' },
];

interface KBSortDropdownProps {
  value: KBSortOptions;
  onChange: (options: KBSortOptions) => void;
}

export const KBSortDropdown: React.FC<KBSortDropdownProps> = ({ value, onChange }) => {
  return (
    <div className="kb-sort-dropdown">
      <Select
        size="small"
        value={value.field}
        options={SORT_FIELD_OPTIONS}
        onChange={(v) => onChange({ ...value, field: v as KBSortField })}
        style={{ width: 100 }}
        borderless
      />
      <Select
        size="small"
        value={value.order}
        options={SORT_ORDER_OPTIONS}
        onChange={(v) => onChange({ ...value, order: v as KBSortOrder })}
        style={{ width: 70 }}
        borderless
      />
    </div>
  );
};
