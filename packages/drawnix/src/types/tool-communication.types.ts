/**
 * Tool Communication Type Definitions
 *
 * 工具通信协议类型定义
 * 定义画布与工具 iframe 之间的 postMessage 通信格式
 */

/**
 * 工具通信消息类型
 */
export enum ToolMessageType {
  // ========== 画布 → 工具 ==========
  /** 初始化工具 - 发送配置信息 */
  BOARD_TO_TOOL_INIT = 'board:init',

  /** 发送数据给工具 */
  BOARD_TO_TOOL_DATA = 'board:data',

  /** 发送配置更新 */
  BOARD_TO_TOOL_CONFIG = 'board:config',

  // ========== 工具 → 画布 ==========
  /** 工具准备就绪 */
  TOOL_TO_BOARD_READY = 'tool:ready',

  /** 插入文本到画布 */
  TOOL_TO_BOARD_INSERT_TEXT = 'tool:insert-text',

  /** 插入图片到画布 */
  TOOL_TO_BOARD_INSERT_IMAGE = 'tool:insert-image',

  /** 请求画布数据 */
  TOOL_TO_BOARD_REQUEST_DATA = 'tool:request-data',

  /** 通知画布关闭工具 */
  TOOL_TO_BOARD_CLOSE = 'tool:close',

  /** 请求生成图片 */
  TOOL_TO_BOARD_GENERATE_IMAGE = 'tool:generate-image',
}

/**
 * 通信消息基础接口
 */
export interface ToolMessage<T = any> {
  /** 协议版本 */
  version: '1.0';

  /** 消息类型 */
  type: ToolMessageType;

  /** 工具实例 ID */
  toolId: string;

  /** 消息 ID（用于追踪和去重） */
  messageId: string;

  /** 载荷数据 */
  payload: T;

  /** 时间戳 */
  timestamp: number;

  /** 可选：回复的消息 ID */
  replyTo?: string;
}

/**
 * 初始化载荷
 */
export interface InitPayload {
  /** 画板 ID */
  boardId: string;

  /** 主题模式 */
  theme: 'light' | 'dark';

  /** 工具配置 */
  config?: Record<string, any>;
}

/**
 * 插入文本载荷
 */
export interface InsertTextPayload {
  /** 文本内容 */
  text: string;

  /** 可选的插入位置（画布坐标） */
  position?: [number, number];

  /** 可选的文本样式 */
  style?: {
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    bold?: boolean;
    italic?: boolean;
  };
}

/**
 * 插入图片载荷
 */
export interface InsertImagePayload {
  /** 图片 URL 或 base64 */
  url: string;

  /** 可选的插入位置（画布坐标） */
  position?: [number, number];

  /** 可选的宽度 */
  width?: number;

  /** 可选的高度 */
  height?: number;
}

/**
 * 请求数据载荷
 */
export interface RequestDataPayload {
  /** 请求的数据类型 */
  dataType: 'board-state' | 'selected-elements' | 'viewport';
}

/**
 * 生成图片请求载荷
 */
export interface GenerateImagePayload {
  /** 提示词 */
  prompt: string;

  /** 宽度 */
  width?: number;

  /** 高度 */
  height?: number;

  /** 宽高比 */
  aspectRatio?: string;

  /** 尺寸比例（如 1x1, 16x9 等） */
  size?: string;

  /** 消息 ID（用于响应） */
  messageId?: string;
}

/**
 * 生成图片响应载荷
 */
export interface GenerateImageResponse {
  /** 是否成功 */
  success: boolean;

  /** 响应消息 ID */
  responseId: string;

  /** 结果数据 */
  result?: {
    /** 图片 URL */
    url: string;

    /** 格式 */
    format?: string;

    /** 尺寸 */
    width?: number;
    height?: number;
  };

  /** 错误信息 */
  error?: string;
}

/**
 * 数据响应载荷
 */
export interface DataResponsePayload {
  /** 请求的数据类型 */
  dataType: string;

  /** 数据内容 */
  data: any;
}

/**
 * 消息处理器函数类型
 */
export type MessageHandler = (message: ToolMessage) => void | Promise<void>;

/**
 * 等待中的消息
 */
export interface PendingMessage {
  /** 原始消息 */
  message: ToolMessage;

  /** Promise resolve 函数 */
  resolve: (value: ToolMessage) => void;

  /** Promise reject 函数 */
  reject: (reason: any) => void;

  /** 超时定时器 ID */
  timeoutId: NodeJS.Timeout;
}
