/**
 * 知识库 MCP 工具集
 *
 * 为 AI 提供知识库的搜索、读取、创建和目录管理能力。
 * 工具按照 aitu MCPTool 接口规范实现。
 */

import type { MCPTool, MCPResult } from '../types';
import {
  getAllDirectories,
  createDirectory,
  getNoteById,
  createNote,
  getOrCreateTag,
  addTagToNote,
  searchNotes,
} from '../../services/knowledge-base-service';
import { getKBSearchEngine } from '../../services/kb-search-engine';

// ============================================
// search_notes 工具
// ============================================

export const kbSearchNotesTool: MCPTool = {
  name: 'search_notes',
  description: `在知识库中搜索笔记。使用语义搜索（TF-IDF + 余弦相似度）返回最相关的笔记摘要。

使用场景：
- 用户问到"我之前保存过…"、"关于XX的笔记"
- 需要查找知识库中的信息用于回答问题
- 查找与某个主题相关的所有笔记`,

  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词或语义查询',
      },
      limit: {
        type: 'number',
        description: '返回结果数量上限，默认 10',
      },
      directoryId: {
        type: 'string',
        description: '限制在指定目录中搜索（可选）',
      },
    },
    required: ['query'],
  },

  promptGuidance: {
    whenToUse: '当用户需要搜索知识库中的信息时使用，支持语义搜索',
    parameterGuidance: {
      query: '尽量使用核心关键词或简短的自然语言描述',
      limit: '一般用默认值即可，除非用户明确说了需要几条',
    },
    bestPractices: [
      '优先使用核心词搜索，避免过长的句子',
      '如果搜索不到结果，尝试换关键词',
      '结合 get_note 工具获取完整内容',
    ],
    examples: [
      { input: '搜索关于 React 的笔记', args: { query: 'React' }, explanation: '使用核心关键词搜索' },
      { input: '找一下上周保存的 AI 文章', args: { query: 'AI 文章' }, explanation: '自然语言搜索' },
    ],
  },

  execute: async (params: Record<string, unknown>): Promise<MCPResult> => {
    const query = params.query as string;
    const limit = (params.limit as number) || 10;
    const directoryId = params.directoryId as string | undefined;

    if (!query?.trim()) {
      return { success: false, error: '搜索关键词不能为空', type: 'error' };
    }

    try {
      // 优先使用语义搜索引擎
      const engine = getKBSearchEngine();
      const results = await engine.search(query, {
        limit,
        filter: directoryId ? { directoryId } : {},
        includeContent: false,
        snippetLength: 200,
      });

      if (results.length > 0) {
        const formatted = results.map((r) => ({
          id: r.id,
          title: r.title,
          excerpt: r.snippet,
          similarity: Math.round(r.similarity * 100) / 100,
          directoryName: r.directoryName,
          domain: r.domain,
          updatedAt: new Date(r.updatedAt).toISOString(),
        }));

        return {
          success: true,
          type: 'text',
          data: formatted,
        };
      }

      // 回退到基础搜索
      const basicResults = await searchNotes(query);
      const formatted = basicResults.slice(0, limit).map((n) => ({
        id: n.id,
        title: n.title,
        directoryId: n.directoryId,
        updatedAt: new Date(n.updatedAt).toISOString(),
      }));

      return {
        success: true,
        type: 'text',
        data: formatted,
      };
    } catch (error: any) {
      return { success: false, error: `搜索失败: ${error.message}`, type: 'error' };
    }
  },
};

// ============================================
// get_note 工具
// ============================================

export const kbGetNoteTool: MCPTool = {
  name: 'get_note',
  description: `获取知识库中某篇笔记的完整内容。

使用场景：
- 搜索到笔记后需要查看完整内容
- 用户指定了笔记 ID 要查看详情`,

  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: '笔记 ID',
      },
    },
    required: ['id'],
  },

  promptGuidance: {
    whenToUse: '在 search_notes 返回结果后，需要获取某篇笔记的完整内容时使用',
    parameterGuidance: {
      id: '使用 search_notes 返回结果中的 id 字段',
    },
    examples: [
      { input: '查看笔记详情', args: { id: 'note_12345' }, explanation: '传入 search_notes 返回的笔记 ID' },
    ],
  },

  execute: async (params: Record<string, unknown>): Promise<MCPResult> => {
    const id = params.id as string;
    if (!id) return { success: false, error: '笔记 ID 不能为空', type: 'error' };

    try {
      const note = await getNoteById(id);
      if (!note) return { success: false, error: '笔记不存在', type: 'error' };

      return {
        success: true,
        type: 'text',
        data: {
          id: note.id,
          title: note.title,
          content: note.content,
          directoryId: note.directoryId,
          createdAt: new Date(note.createdAt).toISOString(),
          updatedAt: new Date(note.updatedAt).toISOString(),
          metadata: note.metadata,
        },
      };
    } catch (error: any) {
      return { success: false, error: `获取笔记失败: ${error.message}`, type: 'error' };
    }
  },
};

// ============================================
// create_note 工具
// ============================================

export const kbCreateNoteTool: MCPTool = {
  name: 'create_note',
  description: `在知识库中创建新笔记。支持 Markdown 格式内容、指定目录、标签和来源 URL。

使用场景：
- 用户要求保存内容到知识库
- AI 对话中用户说"帮我记住这个"
- 保存 AI 生成的内容供后续参考`,

  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: '笔记标题',
      },
      content: {
        type: 'string',
        description: '笔记内容（支持 Markdown 格式）',
      },
      directoryName: {
        type: 'string',
        description: '目录名称（不存在则自动创建），默认为"笔记"',
      },
      tags: {
        type: 'array',
        description: '标签列表（字符串数组，不存在则自动创建）',
      },
      sourceUrl: {
        type: 'string',
        description: '来源 URL（可选）',
      },
    },
    required: ['title', 'content'],
  },

  promptGuidance: {
    whenToUse: '当用户要求将信息保存到知识库时使用',
    parameterGuidance: {
      title: '简洁明了的标题，概括笔记核心内容',
      content: '完整的笔记内容，建议使用 Markdown 格式',
      directoryName: '根据内容类型推断合适的目录名称',
      tags: '提取内容中的核心主题作为标签',
    },
    bestPractices: [
      '自动为笔记生成 2-4 个有意义的标签',
      '标题控制在 50 字以内',
      '内容保持完整结构化',
    ],
    examples: [
      {
        input: '帮我保存这段关于 React Hooks 的笔记',
        args: {
          title: 'React Hooks 使用指南',
          content: '## React Hooks\n\n核心 Hook 包括...',
          directoryName: '技术笔记',
          tags: ['React', 'Hooks', '前端'],
        },
      },
    ],
  },

  execute: async (params: Record<string, unknown>): Promise<MCPResult> => {
    const title = params.title as string;
    const content = params.content as string;
    const directoryName = (params.directoryName as string) || '笔记';
    const tags = params.tags as string[] | undefined;
    const sourceUrl = params.sourceUrl as string | undefined;

    if (!title?.trim()) return { success: false, error: '标题不能为空', type: 'error' };
    if (!content?.trim()) return { success: false, error: '内容不能为空', type: 'error' };

    try {
      // 获取或创建目录
      const dirs = await getAllDirectories();
      let dir = dirs.find((d) => d.name === directoryName);
      if (!dir) {
        dir = await createDirectory(directoryName);
      }

      // 创建笔记
      const metadata = sourceUrl ? { sourceUrl } : undefined;
      const note = await createNote(title, dir.id, content, metadata);

      // 添加标签
      if (tags && tags.length > 0) {
        for (const tagName of tags) {
          const tag = await getOrCreateTag(tagName);
          await addTagToNote(note.id, tag.id);
        }
      }

      return {
        success: true,
        type: 'text',
        data: { id: note.id, title: note.title, message: '笔记创建成功' },
      };
    } catch (error: any) {
      return { success: false, error: `创建笔记失败: ${error.message}`, type: 'error' };
    }
  },
};

// ============================================
// list_directories 工具
// ============================================

export const kbListDirectoriesTool: MCPTool = {
  name: 'list_directories',
  description: `列出知识库中的所有目录。

使用场景：
- 需要了解知识库的目录结构
- 创建笔记前查看可用目录`,

  inputSchema: {
    type: 'object',
    properties: {},
  },

  execute: async (): Promise<MCPResult> => {
    try {
      const directories = await getAllDirectories();
      return {
        success: true,
        type: 'text',
        data: directories.map((d) => ({
          id: d.id,
          name: d.name,
          isDefault: d.isDefault,
          createdAt: new Date(d.createdAt).toISOString(),
        })),
      };
    } catch (error: any) {
      return { success: false, error: `获取目录失败: ${error.message}`, type: 'error' };
    }
  },
};

// ============================================
// 导出所有知识库工具
// ============================================

export const knowledgeBaseTools: MCPTool[] = [
  kbSearchNotesTool,
  kbGetNoteTool,
  kbCreateNoteTool,
  kbListDirectoriesTool,
];
