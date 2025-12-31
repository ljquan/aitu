/**
 * MCP (Model Context Protocol) 类型定义
 * 
 * 基于 JSON-RPC 2.0 协议，定义 MCP 工具的标准接口
 */

// 从公共配置导入模型相关定义
export type { ModelType, ModelConfig } from '../constants/model-config';
export {
  IMAGE_MODELS,
  VIDEO_MODELS,
  ALL_MODELS,
  getModelsByType,
  getModelConfig,
  getModelType,
  getModelIds,
  supportsTools,
} from '../constants/model-config';

/**
 * JSON Schema 类型定义
 */
export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  description?: string;
  items?: JSONSchemaProperty;
}

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: (string | number)[];
  default?: unknown;
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
}

/**
 * MCP 工具定义
 */
export interface MCPTool {
  /** 工具唯一名称 */
  name: string;
  /** 工具描述，用于 LLM 理解工具用途 */
  description: string;
  /** 输入参数 Schema */
  inputSchema: JSONSchema;
  /** 工具执行函数 */
  execute: (params: Record<string, unknown>) => Promise<MCPResult>;
}

/**
 * MCP 工具执行结果
 */
export interface MCPResult {
  /** 是否成功 */
  success: boolean;
  /** 结果数据 */
  data?: unknown;
  /** 错误信息 */
  error?: string;
  /** 结果类型标识 */
  type?: 'image' | 'video' | 'text' | 'canvas' | 'error';
}

/**
 * 工具调用请求（从 LLM 响应中解析）
 */
export interface ToolCall {
  /** 工具名称 */
  name: string;
  /** 调用参数 */
  arguments: Record<string, unknown>;
  /** 调用 ID（用于关联响应） */
  id?: string;
}

/**
 * JSON-RPC 2.0 请求
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id: string | number;
}

/**
 * JSON-RPC 2.0 响应
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: string | number;
}

/**
 * Agent 执行结果
 */
export interface AgentResult {
  /** 是否成功 */
  success: boolean;
  /** 最终响应文本 */
  response?: string;
  /** 工具调用结果列表 */
  toolResults?: MCPResult[];
  /** 错误信息 */
  error?: string;
  /** 使用的模型 */
  model?: string;
}

/**
 * Agent 执行选项
 */
export interface AgentExecuteOptions {
  /** 指定使用的模型 */
  model?: string;
  /** 流式输出回调 */
  onChunk?: (content: string) => void;
  /** 工具调用回调 */
  onToolCall?: (toolCall: ToolCall) => void;
  /** 工具结果回调 */
  onToolResult?: (result: MCPResult) => void;
  /** 取消信号 */
  signal?: AbortSignal;
  /** 最大工具调用轮数 */
  maxIterations?: number;
  /** 参考图片 */
  referenceImages?: string[];
}
