import { PlaitBoard } from '@plait/core';

export type CommandCategory =
  | 'tool'
  | 'edit'
  | 'view'
  | 'ai'
  | 'export'
  | 'settings';

export interface CommandItem {
  id: string;
  label: string;
  keywords?: string[];
  icon?: React.ReactNode;
  category: CommandCategory;
  shortcut?: string;
  predicate?: (board: PlaitBoard) => boolean;
  perform: (board: PlaitBoard) => void;
}

export const CATEGORY_ORDER: Record<CommandCategory, number> = {
  tool: 1,
  edit: 2,
  view: 3,
  ai: 4,
  export: 5,
  settings: 6,
};

export const CATEGORY_LABELS: Record<CommandCategory, { zh: string; en: string }> = {
  tool: { zh: '工具', en: 'Tools' },
  edit: { zh: '编辑', en: 'Edit' },
  view: { zh: '视图', en: 'View' },
  ai: { zh: 'AI', en: 'AI' },
  export: { zh: '导出', en: 'Export' },
  settings: { zh: '设置', en: 'Settings' },
};
