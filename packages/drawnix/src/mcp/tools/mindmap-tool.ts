/**
 * Mindmap MCP 工具
 *
 * 将 Markdown 语法转换为思维导图并插入画布
 *
 * 输入：Markdown 格式的思维导图定义
 * 输出：转换后的思维导图插入到画布中
 *
 * 支持的 Markdown 语法：
 * - # 标题（一级到多级）
 * - - 无序列表（支持缩进嵌套）
 * - Emoji 表情符号
 */

import type { MCPTool, MCPResult } from '../types';
import { MindElement } from '@plait/mind';
import { getBoard, extractCodeBlock, insertElementsToCanvas } from './shared';

/**
 * Mindmap 工具输入参数
 */
export interface MindmapToolParams {
  /** Markdown 格式的思维导图定义 */
  markdown: string;
}

/**
 * markdown-to-drawnix 库的动态加载器
 */
interface MarkdownToDrawnixLib {
  loaded: boolean;
  api: Promise<{
    parseMarkdownToDrawnix: (
      definition: string,
      mainTopic?: string
    ) => MindElement;
  }>;
}

const markdownToDrawnixLib: MarkdownToDrawnixLib = {
  loaded: false,
  api: new Promise((resolve, reject) => {
    import('@plait-board/markdown-to-drawnix')
      .then((module) => {
        markdownToDrawnixLib.loaded = true;
        resolve(module);
      })
      .catch(reject);
  }),
};

/**
 * 从输入中提取 Markdown 代码
 */
function extractMarkdownCode(input: string): string {
  // 尝试提取 ```markdown 代码块
  const extracted = extractCodeBlock(input, 'markdown');
  
  // 如果提取结果与输入相同，说明没有代码块，直接返回
  if (extracted === input.trim()) {
    return extracted;
  }
  
  return extracted;
}

/**
 * 执行 Mindmap 转换和插入
 */
async function executeMindmapTool(params: MindmapToolParams): Promise<MCPResult> {
  const board = getBoard();

  if (!board) {
    return {
      success: false,
      error: '画布未初始化，请先打开画布',
      type: 'error',
    };
  }

  const { markdown } = params;

  if (!markdown || typeof markdown !== 'string' || markdown.trim() === '') {
    return {
      success: false,
      error: '缺少必填参数 markdown，请提供有效的 Markdown 思维导图定义',
      type: 'error',
    };
  }

  try {
    // 1. 提取 Markdown 代码
    const markdownCode = extractMarkdownCode(markdown);
    console.log('[MindmapTool] Extracted markdown code:', markdownCode.substring(0, 100) + '...');

    // 2. 加载并调用 markdown-to-drawnix 库
    const api = await markdownToDrawnixLib.api;

    let mindElement: MindElement;
    try {
      mindElement = await api.parseMarkdownToDrawnix(markdownCode);
    } catch (parseError: any) {
      // 如果解析失败，尝试替换双引号为单引号后重试
      console.warn('[MindmapTool] First parse attempt failed, retrying with quote replacement:', parseError.message);
      mindElement = await api.parseMarkdownToDrawnix(markdownCode.replace(/"/g, "'"));
    }

    if (!mindElement) {
      return {
        success: false,
        error: 'Markdown 解析成功，但未生成思维导图元素',
        type: 'error',
      };
    }

    // 3. 设置初始位置
    mindElement.points = [[0, 0]];
    const elements = [mindElement];

    console.log('[MindmapTool] Parsed mindmap element');

    // 4. 插入到画布
    const insertResult = insertElementsToCanvas(board, elements);

    if (!insertResult.success) {
      return {
        success: false,
        error: insertResult.error || '插入思维导图失败',
        type: 'error',
      };
    }

    console.log('[MindmapTool] Successfully inserted mindmap to canvas');

    return {
      success: true,
      data: {
        type: 'mindmap',
        elementsCount: insertResult.elementsCount,
        markdownPreview: markdownCode.substring(0, 200) + (markdownCode.length > 200 ? '...' : ''),
      },
      type: 'canvas',
    };
  } catch (error: any) {
    console.error('[MindmapTool] Failed to process markdown:', error);
    return {
      success: false,
      error: `思维导图转换失败: ${error.message || '未知错误'}`,
      type: 'error',
    };
  }
}

/**
 * Mindmap MCP 工具定义
 */
export const mindmapTool: MCPTool = {
  name: 'insert_mindmap',
  description: `将 Markdown 思维导图插入到画布工具。将 Markdown 语法转换为可视化思维导图并插入到画布中。

使用场景：
- 用户需要在画布上创建思维导图
- 用户提供了 Markdown 格式的思维导图定义
- AI 生成了思维导图内容需要展示在画布上
- 用户输入"创作XXX思维导图"等指令时

支持的 Markdown 语法：
- # 一级标题（作为根节点）
- ## 二级标题（作为一级分支）
- ### 三级标题（作为二级分支）
- - 无序列表项（作为子节点）
- 缩进表示层级关系
- 支持 Emoji 表情符号

输入格式：
- 可以是纯 Markdown 文本
- 也可以是包含 \`\`\`markdown 代码块的内容

示例输入：
\`\`\`markdown
# 大模型未来趋势

## 技术演进
- 多模态融合
  - 视觉理解
  - 语音交互
  - 跨模态推理
- 推理能力提升
  - 思维链
  - 自我反思

## 应用场景
- 智能助手
- 代码生成
- 内容创作

## 挑战与机遇
- 算力成本
- 数据安全
- 伦理规范
\`\`\``,

  inputSchema: {
    type: 'object',
    properties: {
      markdown: {
        type: 'string',
        description: 'Markdown 格式的思维导图定义，支持标题和列表语法',
      },
    },
    required: ['markdown'],
  },

  execute: async (params: Record<string, unknown>): Promise<MCPResult> => {
    return executeMindmapTool(params as unknown as MindmapToolParams);
  },
};

/**
 * 便捷函数：快速插入思维导图
 */
export async function insertMindmap(markdownCode: string): Promise<MCPResult> {
  return executeMindmapTool({ markdown: markdownCode });
}
