/**
 * Tool Test Helper
 *
 * 测试工具函数 - 用于在浏览器控制台测试工具功能
 *
 * 使用方法：
 * 1. 在浏览器中打开应用
 * 2. 打开控制台 (F12)
 * 3. 运行: window.testToolbox.insertBananaPrompt()
 */

import { PlaitBoard } from '@plait/core';
import { ToolTransforms } from '../plugins/with-tool';
import { toolboxService } from '../services/toolbox-service';
import { DEFAULT_TOOL_CONFIG } from '../constants/built-in-tools';

/**
 * 工具箱测试助手类
 */
export class ToolTestHelper {
  private board: PlaitBoard | null = null;

  /**
   * 设置 board 实例
   */
  setBoard(board: PlaitBoard): void {
    this.board = board;
    // console.log('✅ Board instance set for testing');
  }

  /**
   * 获取当前 board
   */
  getBoard(): PlaitBoard | null {
    if (!this.board) {
      console.error('❌ Board instance not set. Call testToolbox.setBoard(board) first');
    }
    return this.board;
  }

  /**
   * 插入香蕉提示词工具
   */
  insertBananaPrompt(): void {
    const board = this.getBoard();
    if (!board) return;

    const tool = toolboxService.getToolById('banana-prompt');
    if (!tool) {
      console.error('❌ Tool "banana-prompt" not found');
      return;
    }

    const element = ToolTransforms.insertTool(
      board,
      tool.id,
      tool.url,
      [100, 100],
      {
        width: tool.defaultWidth || DEFAULT_TOOL_CONFIG.defaultWidth,
        height: tool.defaultHeight || DEFAULT_TOOL_CONFIG.defaultHeight,
      },
      {
        name: tool.name,
        category: tool.category,
        permissions: tool.permissions,
      }
    );

    // console.log('✅ Banana Prompt tool inserted:', element);
  }

  /**
   * 插入小红薯工具
   */
  insertXiaohongshuTool(): void {
    const board = this.getBoard();
    if (!board) return;

    const tool = toolboxService.getToolById('xiaohongshu-tool');
    if (!tool) {
      console.error('❌ Tool "xiaohongshu-tool" not found');
      return;
    }

    const element = ToolTransforms.insertTool(
      board,
      tool.id,
      tool.url,
      [300, 300],
      {
        width: tool.defaultWidth || DEFAULT_TOOL_CONFIG.defaultWidth,
        height: tool.defaultHeight || DEFAULT_TOOL_CONFIG.defaultHeight,
      },
      {
        name: tool.name,
        category: tool.category,
        permissions: tool.permissions,
      }
    );

    // console.log('✅ Xiaohongshu tool inserted:', element);
  }

  /**
   * 插入指定ID的工具
   */
  insertToolById(toolId: string, x: number = 200, y: number = 200): void {
    const board = this.getBoard();
    if (!board) return;

    const tool = toolboxService.getToolById(toolId);
    if (!tool) {
      console.error(`❌ Tool "${toolId}" not found`);
      return;
    }

    const element = ToolTransforms.insertTool(
      board,
      tool.id,
      tool.url,
      [x, y],
      {
        width: tool.defaultWidth || DEFAULT_TOOL_CONFIG.defaultWidth,
        height: tool.defaultHeight || DEFAULT_TOOL_CONFIG.defaultHeight,
      },
      {
        name: tool.name,
        category: tool.category,
        permissions: tool.permissions,
      }
    );

    // console.log(`✅ Tool "${toolId}" inserted:`, element);
  }

  /**
   * 列出所有可用工具
   */
  listAllTools(): void {
    const tools = toolboxService.getAvailableTools();
    // console.log(`📋 Available Tools (${tools.length}):`);
    tools.forEach((tool, index) => {
      // console.log(`${index + 1}. ${tool.icon} ${tool.name} (${tool.id})`);
      // console.log(`   ${tool.description}`);
      // console.log(`   URL: ${tool.url}`);
    });
  }

  /**
   * 获取所有工具元素
   */
  getAllToolElements(): void {
    const board = this.getBoard();
    if (!board) return;

    const tools = ToolTransforms.getAllTools(board);
    // console.log(`🔧 Tool Elements on Board (${tools.length}):`);
    tools.forEach((tool, index) => {
      // console.log(`${index + 1}. ID: ${tool.id}, ToolID: ${tool.toolId}`);
      // console.log(`   URL: ${tool.url}`);
      // console.log(`   Position: ${tool.points[0]} → ${tool.points[1]}`);
    });
  }

  /**
   * 删除所有工具元素
   */
  removeAllTools(): void {
    const board = this.getBoard();
    if (!board) return;

    const tools = ToolTransforms.getAllTools(board);
    // console.log(`🗑️  Removing ${tools.length} tool elements...`);

    tools.forEach(tool => {
      ToolTransforms.removeTool(board, tool.id);
    });

    // console.log('✅ All tool elements removed');
  }

  /**
   * 显示帮助信息
   */
  help(): void {
    // console.log(`
🔧 Tool Test Helper - Available Commands:

📌 Setup:
  testToolbox.setBoard(board)           - Set board instance

📝 Insert Tools:
  testToolbox.insertBananaPrompt()      - Insert 香蕉提示词 tool
  testToolbox.insertXiaohongshuTool()   - Insert 小红薯工具 tool
  testToolbox.insertToolById(id, x, y)  - Insert tool by ID

📋 Inspect:
  testToolbox.listAllTools()            - List all available tools
  testToolbox.getAllToolElements()      - Get all tool elements on board

🗑️  Cleanup:
  testToolbox.removeAllTools()          - Remove all tool elements

❓ Help:
  testToolbox.help()                    - Show this help message
    `);
  }
}

// 创建全局实例
export const toolTestHelper = new ToolTestHelper();

// 挂载到 window 对象用于控制台访问
if (typeof window !== 'undefined') {
  (window as any).testToolbox = toolTestHelper;
  // console.log('🔧 Tool Test Helper loaded. Type "testToolbox.help()" for commands.');
}
