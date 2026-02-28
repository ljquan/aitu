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
  /** 来源 URL */
  sourceUrl?: string;
  /** 来源域名 */
  domain?: string;
  /** 来源网站图标 URL */
  faviconUrl?: string;
  /** 发布时间 */
  publishedAt?: string;
  /** @deprecated 已废弃，工具绑定由 outputType 自动推断。保留字段以兼容旧数据 */
  mcpTools?: string[];
  /** Skill 输出类型：image 表示图片生成类，text 表示文本处理类（用于 Skill 笔记配置） */
outputType?: 'image' | 'text' | 'video' | 'ppt';
  [key: string]: unknown;
}

/**
 * 完整笔记（含正文）
 */
export interface KBNote extends KBNoteMeta {
  content: string;
}

/**
 * 笔记正文（独立存储，与元数据分离）
 */
export interface KBNoteContent {
  /** 与笔记相同的 ID */
  id: string;
  /** 关联的笔记 ID */
  noteId: string;
  /** 正文内容 */
  content: string;
}

/**
 * 笔记图片（独立存储，基于 hash 去重）
 */
export interface KBNoteImage {
  /** 图片唯一 ID */
  id: string;
  /** 关联的笔记 ID */
  noteId: string;
  /** 图片内容 hash（用于去重） */
  hash: string;
  /** 图片 base64 数据 */
  data: string;
  /** 图片 MIME 类型 */
  mimeType: string;
  /** 图片大小（字节） */
  size: number;
  /** 创建时间 */
  createdAt: number;
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
export type KBSortField = 'updatedAt' | 'createdAt' | 'title' | 'domain';

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
  /** 按域名过滤 */
  domain?: string;
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
  { name: '笔记', isDefault: true, order: 0 },
  { name: 'Skill', isDefault: true, order: 1 },
];

// ==================== 保存状态类型 ====================

/**
 * 保存状态
 */
export type KBSaveState = 'unsaved' | 'saving' | 'saved' | 'duplicate' | 'error';

/**
 * 保存状态信息
 */
export interface KBSaveStateInfo {
  /** 保存状态 */
  state: KBSaveState;
  /** 内容指纹 */
  fingerprint: string;
  /** 关联的笔记 ID */
  noteId?: string;
  /** 关联的笔记名称 */
  noteName?: string;
  /** 目录 ID */
  directoryId?: string;
  /** 保存时间 */
  savedAt?: number;
  /** 错误信息 */
  errorMessage?: string;
  /** 最后检查时间 */
  lastCheckedAt: number;
}

// ==================== 知识提取类型 ====================

/**
 * 知识点类型
 */
export type KBKnowledgeType = 'concept' | 'definition' | 'step' | 'summary';

/**
 * 知识点类型标签映射
 */
export const KB_KNOWLEDGE_TYPE_LABELS: Record<KBKnowledgeType, string> = {
  concept: '核心概念',
  definition: '重要定义',
  step: '关键步骤',
  summary: '要点总结',
};

/**
 * 知识点类型颜色映射
 */
export const KB_KNOWLEDGE_TYPE_COLORS: Record<KBKnowledgeType, string> = {
  concept: '#3b82f6',    // blue
  definition: '#10b981', // green
  step: '#f59e0b',       // amber
  summary: '#8b5cf6',    // violet
};

/**
 * 提取的知识点
 */
export interface KBExtractedKnowledge {
  /** 唯一标识 */
  id: string;
  /** 知识点标题 */
  title: string;
  /** 内容描述 */
  content: string;
  /** 来源上下文（原文摘录） */
  sourceContext: string;
  /** 相关标签 */
  tags: string[];
  /** 知识点类型 */
  type: KBKnowledgeType;
  /** 是否选中（用于批量操作） */
  selected?: boolean;
}

/**
 * 知识提取结果
 */
export interface KBKnowledgeExtractionResult {
  /** 提取的知识点列表 */
  knowledgePoints: KBExtractedKnowledge[];
  /** AI 原始响应 */
  rawResponse: string;
  /** 来源 URL */
  sourceUrl?: string;
  /** 来源标题 */
  sourceTitle?: string;
  /** 提取时间 */
  extractedAt: number;
}

/**
 * 知识提取状态
 */
export type KBExtractionStatus = 'idle' | 'extracting' | 'success' | 'error';

/**
 * 知识点保存选项
 */
export interface KBKnowledgeSaveOptions {
  /** 目标目录 ID */
  directoryId: string;
  /** 合并为单个笔记还是分别保存 */
  mergeAsOne: boolean;
  /** 自定义标题（合并模式下使用） */
  customTitle?: string;
}

/**
 * 导出格式
 */
export type KBExportFormat = 'markdown' | 'json';

/**
 * 导出选项
 */
export interface KBExportOptions {
  /** 导出格式 */
  format: KBExportFormat;
  /** 是否包含来源信息 */
  includeSource: boolean;
  /** 是否包含标签 */
  includeTags: boolean;
}
