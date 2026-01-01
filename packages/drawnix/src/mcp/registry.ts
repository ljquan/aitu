/**
 * MCP 工具注册中心
 * 
 * 管理所有 MCP 工具的注册、查询和执行
 */

import type { MCPTool, MCPResult, ToolCall, MCPExecuteOptions } from './types';

/**
 * MCP 工具注册中心
 */
class MCPRegistry {
  private tools: Map<string, MCPTool> = new Map();
  private static instance: MCPRegistry;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): MCPRegistry {
    if (!MCPRegistry.instance) {
      MCPRegistry.instance = new MCPRegistry();
    }
    return MCPRegistry.instance;
  }

  /**
   * 注册工具
   */
  register(tool: MCPTool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[MCPRegistry] Tool "${tool.name}" already registered, overwriting...`);
    }
    this.tools.set(tool.name, tool);
    console.log(`[MCPRegistry] Tool "${tool.name}" registered`);
  }

  /**
   * 批量注册工具
   */
  registerAll(tools: MCPTool[]): void {
    tools.forEach(tool => this.register(tool));
  }

  /**
   * 注销工具
   */
  unregister(name: string): boolean {
    const result = this.tools.delete(name);
    if (result) {
      console.log(`[MCPRegistry] Tool "${name}" unregistered`);
    }
    return result;
  }

  /**
   * 获取工具
   */
  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有工具
   */
  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取工具名称列表
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 检查工具是否存在
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 执行工具调用
   * @param toolCall - 工具调用信息
   * @param options - 执行选项（可选，用于指定执行模式等）
   */
  async executeTool(toolCall: ToolCall, options?: MCPExecuteOptions): Promise<MCPResult> {
    const tool = this.tools.get(toolCall.name);

    if (!tool) {
      return {
        success: false,
        error: `Tool "${toolCall.name}" not found`,
        type: 'error',
      };
    }

    try {
      console.log(`[MCPRegistry] Executing tool "${toolCall.name}" with args:`, toolCall.arguments, 'options:', options);
      const result = await tool.execute(toolCall.arguments, options);
      console.log(`[MCPRegistry] Tool "${toolCall.name}" execution completed:`, result.success);
      return result;
    } catch (error: any) {
      console.error(`[MCPRegistry] Tool "${toolCall.name}" execution failed:`, error);
      return {
        success: false,
        error: error.message || 'Tool execution failed',
        type: 'error',
      };
    }
  }

  /**
   * 批量执行工具调用
   */
  async executeTools(toolCalls: ToolCall[]): Promise<MCPResult[]> {
    return Promise.all(toolCalls.map(tc => this.executeTool(tc)));
  }

  /**
   * 生成工具描述（用于系统提示词）
   */
  generateToolsDescription(): string {
    const tools = this.getAllTools();
    
    if (tools.length === 0) {
      return '当前没有可用的工具。';
    }

    const descriptions = tools.map(tool => {
      const params = tool.inputSchema.properties || {};
      const required = tool.inputSchema.required || [];
      
      const paramDescriptions = Object.entries(params)
        .map(([name, schema]) => {
          const isRequired = required.includes(name);
          const reqStr = isRequired ? '(必填)' : '(可选)';
          return `    - ${name} ${reqStr}: ${schema.description || '无描述'}`;
        })
        .join('\n');

      return `### ${tool.name}
${tool.description}

**参数:**
${paramDescriptions || '    无参数'}`;
    });

    return descriptions.join('\n\n');
  }

  /**
   * 生成工具 Schema（用于 Function Calling）
   */
  generateToolSchemas(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: MCPTool['inputSchema'];
    };
  }> {
    return this.getAllTools().map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
    console.log('[MCPRegistry] All tools cleared');
  }
}

// 导出单例实例
export const mcpRegistry = MCPRegistry.getInstance();

// 导出类型
export { MCPRegistry };
