/**
 * 知识提取类型定义
 */

/** 知识点类型 */
export type KnowledgeType = 'concept' | 'definition' | 'step' | 'summary';

/** 知识点类型标签 */
export const KNOWLEDGE_TYPE_LABELS: Record<KnowledgeType, string> = {
  concept: '核心概念',
  definition: '重要定义',
  step: '关键步骤',
  summary: '要点总结',
};

/** 提取的知识点 */
export interface ExtractedKnowledge {
  id: string;
  title: string;
  content: string;
  sourceContext: string;
  tags: string[];
  type: KnowledgeType;
  selected: boolean;
}

/** 知识提取结果 */
export interface KnowledgeExtractionResult {
  knowledgePoints: ExtractedKnowledge[];
  rawResponse: string;
  sourceUrl?: string;
  sourceTitle?: string;
  extractedAt: number;
}

/** 保存选项 */
export interface KnowledgeSaveOptions {
  directoryId: string;
  mergeAsOne: boolean;
  customTitle?: string;
}

/** 导出选项 */
export interface ExportOptions {
  format: 'markdown' | 'json';
  includeSource: boolean;
  includeTags: boolean;
}

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  type: 'text' | 'extraction-result';
  data?: KnowledgeExtractionResult;
  timestamp: number;
}

/** 知识库聊天会话 */
export interface KBChatSession {
  noteId: string;
  messages: ChatMessage[];
  updatedAt: number;
}
