/**
 * Knowledge Base Type Definitions
 *
 * 知识库系统的所有 TypeScript 类型和接口
 */

/**
 * 知识库目录
 */
export interface KBDirectory {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
  order: number;
}

/**
 * 笔记元数据（用于列表展示，不含正文）
 */
export interface KBNoteMeta {
  id: string;
  title: string;
  directoryId: string;
  createdAt: number;
  updatedAt: number;
  metadata?: KBNoteMetadata;
}

/**
 * 笔记附加元数据
 */
export interface KBNoteMetadata {
  description?: string;
  author?: string;
  tags?: string[];
  [key: string]: unknown;
}

/**
 * 完整笔记（含正文）
 */
export interface KBNote extends KBNoteMeta {
  content: string;
}

/**
 * 标签
 */
export interface KBTag {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

/**
 * 标签（含引用计数）
 */
export interface KBTagWithCount extends KBTag {
  count: number;
}

/**
 * 笔记-标签关联
 */
export interface KBNoteTag {
  id: string;
  noteId: string;
  tagId: string;
}

/**
 * 排序字段
 */
export type KBSortField = 'updatedAt' | 'createdAt' | 'title';

/**
 * 排序方向
 */
export type KBSortOrder = 'asc' | 'desc';

/**
 * 排序选项
 */
export interface KBSortOptions {
  field: KBSortField;
  order: KBSortOrder;
}

/**
 * 过滤选项
 */
export interface KBFilterOptions {
  tagIds?: string[];
  directoryId?: string;
  searchQuery?: string;
}

/**
 * 预设标签颜色
 */
export const KB_TAG_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
] as const;

/**
 * 默认排序配置
 */
export const KB_DEFAULT_SORT: KBSortOptions = {
  field: 'updatedAt',
  order: 'desc',
};

/**
 * 默认目录列表
 */
export const KB_DEFAULT_DIRECTORIES: Array<{ name: string; isDefault: boolean; order: number }> = [
  { name: '收集', isDefault: true, order: 0 },
  { name: '笔记', isDefault: true, order: 1 },
];
