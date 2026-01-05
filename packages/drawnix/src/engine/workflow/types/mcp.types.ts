/**
 * MCP (Model Context Protocol) 类型定义
 * 适配 drawnix 项目的简化版本
 */

/**
 * JSON Schema 类型（简化版）
 */
export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'null';
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  enum?: unknown[];
  default?: unknown;
}

/**
 * MCP Tool 定义
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

/**
 * MCP Tool 执行器
 */
export interface IMCPToolExecutor {
  /** 工具名称 */
  readonly name: string;
  
  /** 工具描述 */
  readonly description: string;
  
  /** 输入参数 Schema */
  readonly inputSchema: JSONSchema;
  
  /**
   * 执行工具
   * @param args 输入参数
   */
  execute(args: unknown): Promise<MCPToolResult>;
}

/**
 * MCP Tool 执行结果
 */
export interface MCPToolResult {
  content: MCPContent[];
  isError?: boolean;
}

/**
 * MCP 内容类型
 */
export interface MCPContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}
