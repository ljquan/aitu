
import React from 'react';
import { Dropdown, Button } from 'tdesign-react';
import { ArrowUp, ArrowDown, Check } from 'lucide-react';
import type { KBSortOptions, KBSortField, KBSortOrder } from '../../types/knowledge-base.types';
import './kb-filter-dropdown.scss';

const SORT_FIELD_OPTIONS: Array<{ label: string; value: KBSortField }> = [
  { label: '更新时间', value: 'updatedAt' },
  { label: '创建时间', value: 'createdAt' },
  { label: '标题', value: 'title' },
];

interface KBSortDropdownProps {
  value: KBSortOptions;
  onChange: (options: KBSortOptions) => void;
}

export const KBSortDropdown: React.FC<KBSortDropdownProps> = ({ value, onChange }) => {
  const currentFieldLabel = SORT_FIELD_OPTIONS.find((opt) => opt.value === value.field)?.label || '排序';

  const handleMenuClick = (data: any) => {
    const val = data.value;
    if (['asc', 'desc'].includes(val)) {
      onChange({ ...value, order: val as KBSortOrder });
    } else {
      // If clicking the same field, toggle order
      if (val === value.field) {
        onChange({ ...value, order: value.order === 'asc' ? 'desc' : 'asc' });
      } else {
        // Default to desc for time fields, asc for title
        const defaultOrder = val === 'title' ? 'asc' : 'desc';
        onChange({ ...value, field: val as KBSortField, order: defaultOrder });
      }
    }
  };

  const options = [
    {
      content: '排序字段',
      disabled: true,
      className: 'kb-sort-dropdown__header',
    },
    ...SORT_FIELD_OPTIONS.map((opt) => ({
      content: opt.label,
      value: opt.value,
      prefixIcon: value.field === opt.value ? <Check size={14} /> : <div style={{ width: 14 }} />,
    })),
    { divider: true },
    {
      content: '排序方式',
      disabled: true,
      className: 'kb-sort-dropdown__header',
    },
    {
      content: '升序',
      value: 'asc',
      prefixIcon: value.order === 'asc' ? <Check size={14} /> : <div style={{ width: 14 }} />,
      suffixIcon: <ArrowUp size={14} />,
    },
    {
      content: '降序',
      value: 'desc',
      prefixIcon: value.order === 'desc' ? <Check size={14} /> : <div style={{ width: 14 }} />,
      suffixIcon: <ArrowDown size={14} />,
    },
  ];

  return (
    <Dropdown
      options={options}
      onClick={handleMenuClick}
      trigger="click"
      minColumnWidth={120}
    >
      <Button variant="outline" size="small" className="kb-sort-trigger">
        {value.order === 'asc' ? <ArrowUp size={14} style={{ marginRight: 4 }} /> : <ArrowDown size={14} style={{ marginRight: 4 }} />}
        {currentFieldLabel}
      </Button>
    </Dropdown>
  );
};
