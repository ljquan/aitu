/**
 * MCP 模块统一导出
 */

// 导出类型
export * from './types';

// 导出注册中心
export { mcpRegistry, MCPRegistry } from './registry';

// 导出工具（将在后续文件中实现）
export { imageGenerationTool } from './tools/image-generation';
export { videoGenerationTool } from './tools/video-generation';

// 初始化函数：注册所有内置工具
import { mcpRegistry } from './registry';
import { imageGenerationTool } from './tools/image-generation';
import { videoGenerationTool } from './tools/video-generation';

/**
 * 初始化 MCP 模块，注册所有内置工具
 */
export function initializeMCP(): void {
  mcpRegistry.registerAll([
    imageGenerationTool,
    videoGenerationTool,
  ]);
  console.log('[MCP] Initialized with built-in tools');
}
