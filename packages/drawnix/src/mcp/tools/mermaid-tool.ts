/**
 * Mermaid MCP 工具
 *
 * 将Mermaid markdown语法转换为Drawnix元素并插入画布
 *
 * 输入：Mermaid markdown字符串
 * 输出：转换后的图表插入到画布中
 *
 * 支持的图表类型：
 * - flowchart: 流程图
 * - sequence: 时序图
 * - classDiagram: 类图
 * - stateDiagram: 状态图
 * - erDiagram: ER图
 * - gantt: 甘特图
 * - pie: 饼图
 * - mindmap: 思维导图
 */

import type { MCPTool, MCPResult } from '../types';
import { getBoard, setBoard, extractCodeBlock, insertElementsToCanvas } from './shared';

// 为了向后兼容，重新导出 Board 管理函数
export const setMermaidBoard = setBoard;
export const getMermaidBoard = getBoard;

/**
 * Mermaid工具输入参数
 */
export interface MermaidToolParams {
  /** Mermaid markdown字符串 */
  mermaid: string;
}

/**
 * mermaid-to-drawnix 库的动态加载器
 */
interface MermaidToDrawnixLib {
  loaded: boolean;
  api: Promise<{
    parseMermaidToDrawnix: (
      definition: string,
      config?: any
    ) => Promise<{ elements: any[] }>;
  }>;
}

const mermaidToDrawnixLib: MermaidToDrawnixLib = {
  loaded: false,
  api: new Promise((resolve, reject) => {
    import('@plait-board/mermaid-to-drawnix')
      .then((module) => {
        mermaidToDrawnixLib.loaded = true;
        resolve(module);
      })
      .catch(reject);
  }),
};

/**
 * 从代码块中提取Mermaid代码
 */
function extractMermaidCode(input: string): string {
  return extractCodeBlock(input, 'mermaid');
}

/**
 * 检测Mermaid代码的图表类型
 */
function detectDiagramType(code: string): string {
  const trimmed = code.trim().toLowerCase();

  if (trimmed.startsWith('flowchart') || trimmed.startsWith('graph')) {
    return 'flowchart';
  }
  if (trimmed.startsWith('sequencediagram')) {
    return 'sequence';
  }
  if (trimmed.startsWith('classdiagram')) {
    return 'classDiagram';
  }
  if (trimmed.startsWith('statediagram')) {
    return 'stateDiagram';
  }
  if (trimmed.startsWith('erdiagram')) {
    return 'erDiagram';
  }
  if (trimmed.startsWith('gantt')) {
    return 'gantt';
  }
  if (trimmed.startsWith('pie')) {
    return 'pie';
  }
  if (trimmed.startsWith('mindmap')) {
    return 'mindmap';
  }

  return 'unknown';
}

/**
 * 执行Mermaid转换和插入
 */
async function executeMermaidTool(params: MermaidToolParams): Promise<MCPResult> {
  const board = getBoard();

  if (!board) {
    return {
      success: false,
      error: '画布未初始化，请先打开画布',
      type: 'error',
    };
  }

  const { mermaid } = params;

  if (!mermaid || typeof mermaid !== 'string' || mermaid.trim() === '') {
    return {
      success: false,
      error: '缺少必填参数 mermaid，请提供有效的Mermaid markdown字符串',
      type: 'error',
    };
  }

  try {
    // 1. 提取Mermaid代码
    const mermaidCode = extractMermaidCode(mermaid);
    console.log('[MermaidTool] Extracted mermaid code:', mermaidCode.substring(0, 100) + '...');

    // 2. 检测图表类型
    const diagramType = detectDiagramType(mermaidCode);
    console.log('[MermaidTool] Detected diagram type:', diagramType);

    // 3. 加载并调用mermaid-to-drawnix库
    const api = await mermaidToDrawnixLib.api;

    let result;
    try {
      result = await api.parseMermaidToDrawnix(mermaidCode);
    } catch (parseError: any) {
      // 如果解析失败，尝试替换双引号为单引号后重试
      console.warn('[MermaidTool] First parse attempt failed, retrying with quote replacement:', parseError.message);
      result = await api.parseMermaidToDrawnix(mermaidCode.replace(/"/g, "'"));
    }

    const { elements } = result;

    if (!elements || elements.length === 0) {
      return {
        success: false,
        error: 'Mermaid代码解析成功，但未生成任何图表元素',
        type: 'error',
      };
    }

    console.log('[MermaidTool] Parsed elements count:', elements.length);

    // 4. 插入到画布（使用共享工具函数）
    const insertResult = insertElementsToCanvas(board, elements);

    if (!insertResult.success) {
      return {
        success: false,
        error: insertResult.error || '插入图表失败',
        type: 'error',
      };
    }

    console.log('[MermaidTool] Successfully inserted', elements.length, 'elements to canvas');

    return {
      success: true,
      data: {
        diagramType,
        elementsCount: insertResult.elementsCount,
        mermaidCode: mermaidCode.substring(0, 200) + (mermaidCode.length > 200 ? '...' : ''),
      },
      type: 'canvas',
    };
  } catch (error: any) {
    console.error('[MermaidTool] Failed to process mermaid:', error);
    return {
      success: false,
      error: `Mermaid转换失败: ${error.message || '未知错误'}`,
      type: 'error',
    };
  }
}

/**
 * Mermaid MCP 工具定义
 */
export const mermaidTool: MCPTool = {
  name: 'insert_mermaid',
  description: `将Mermaid图表插入到画布工具。将Mermaid markdown语法转换为可视化图表并插入到画布中。

使用场景：
- 用户需要在画布上创建流程图、时序图、类图等图表
- 用户提供了Mermaid格式的图表代码
- AI生成了Mermaid代码需要展示在画布上

支持的图表类型：
- flowchart/graph: 流程图
- sequenceDiagram: 时序图（如OAuth2.0认证流程、API调用时序）
- classDiagram: 类图（如系统架构、对象关系）
- stateDiagram: 状态图（如订单状态流转）
- erDiagram: ER图（如数据库设计）
- gantt: 甘特图（如项目进度）
- pie: 饼图（如数据占比）
- mindmap: 思维导图

输入格式：
- 可以是纯Mermaid代码
- 也可以是包含\`\`\`mermaid代码块的markdown

示例输入：
\`\`\`mermaid
sequenceDiagram
    participant Client
    participant AuthServer
    participant ResourceServer
    Client->>AuthServer: 请求授权
    AuthServer->>Client: 返回授权码
    Client->>AuthServer: 用授权码换取Token
    AuthServer->>Client: 返回Access Token
    Client->>ResourceServer: 携带Token请求资源
    ResourceServer->>Client: 返回资源
\`\`\``,

  inputSchema: {
    type: 'object',
    properties: {
      mermaid: {
        type: 'string',
        description: 'Mermaid markdown字符串，可以是纯Mermaid代码或包含```mermaid代码块的markdown',
      },
    },
    required: ['mermaid'],
  },

  execute: async (params: Record<string, unknown>): Promise<MCPResult> => {
    return executeMermaidTool(params as unknown as MermaidToolParams);
  },
};

/**
 * 便捷函数：快速插入Mermaid图表
 */
export async function insertMermaid(mermaidCode: string): Promise<MCPResult> {
  return executeMermaidTool({ mermaid: mermaidCode });
}
