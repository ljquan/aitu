/**
 * MCP 模块统一导出
 */

// 导出类型
export * from './types';

// 导出注册中心
export { mcpRegistry, MCPRegistry } from './registry';

// 导出工具
export { imageGenerationTool } from './tools/image-generation';
export { videoGenerationTool } from './tools/video-generation';
export {
  canvasInsertionTool,
  setCanvasBoard,
  getCanvasBoard,
  quickInsert,
  insertImageGroup,
  insertAIFlow,
} from './tools/canvas-insertion';
export type { ContentType, InsertionItem, CanvasInsertionParams } from './tools/canvas-insertion';
export { mermaidTool, insertMermaid, setMermaidBoard, getMermaidBoard } from './tools/mermaid-tool';
export type { MermaidToolParams } from './tools/mermaid-tool';

// 初始化函数：注册所有内置工具
import { mcpRegistry } from './registry';
import { imageGenerationTool } from './tools/image-generation';
import { videoGenerationTool } from './tools/video-generation';
import { canvasInsertionTool } from './tools/canvas-insertion';
import { aiAnalyzeTool } from './tools/ai-analyze';
import { mermaidTool } from './tools/mermaid-tool';

/**
 * 初始化 MCP 模块，注册所有内置工具
 */
export function initializeMCP(): void {
  mcpRegistry.registerAll([
    imageGenerationTool,
    videoGenerationTool,
    canvasInsertionTool,
    aiAnalyzeTool,
    mermaidTool,
  ]);
  console.log('[MCP] Initialized with built-in tools');
}
