# Phase 3 架构设计 - 技术框架

> Feature: feat/08-multifunctional-toolbox
> Created: 2025-12-09
> Status: 设计阶段

---

## 📋 概述

本文档详细说明 Phase 3 的技术架构、设计模式、数据流和关键实现细节。

---

## 🏗️ 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Phase 3 增强架构                                  │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      UI 层                                       │    │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │    │
│  │  │ ToolErrorOverlay │  │ CustomToolDialog │  │ 样式优化组件  │  │    │
│  │  │  (错误提示)       │  │  (自定义工具)     │  │ (深色模式等) │  │    │
│  │  └──────────────────┘  └──────────────────┘  └──────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    ↕                                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    服务层                                        │    │
│  │  ┌────────────────────────────┐  ┌──────────────────────────┐  │    │
│  │  │ ToolCommunicationService   │  │ ToolboxService (增强)    │  │    │
│  │  │  - postMessage 管理         │  │  - 自定义工具管理         │  │    │
│  │  │  - 消息路由                 │  │  - 持久化存储             │  │    │
│  │  │  - 安全验证                 │  │  - 工具验证               │  │    │
│  │  └────────────────────────────┘  └──────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    ↕                                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   渲染层 (增强)                                   │    │
│  │  ┌────────────────────────────┐  ┌──────────────────────────┐  │    │
│  │  │ ToolGenerator (更新)        │  │ ToolComponent (更新)     │  │    │
│  │  │  - 加载状态跟踪             │  │  - 样式增强               │  │    │
│  │  │  - 错误检测                 │  │  - 通信集成               │  │    │
│  │  │  - 超时处理                 │  │  - 错误显示               │  │    │
│  │  └────────────────────────────┘  └──────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    ↕                                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                  存储层                                          │    │
│  │  ┌────────────────────────────┐  ┌──────────────────────────┐  │    │
│  │  │ IndexedDB (localforage)    │  │ 主题配置 (CSS Variables) │  │    │
│  │  │  - 自定义工具列表            │  │  - 亮色/暗色主题          │  │    │
│  │  └────────────────────────────┘  └──────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              工具 iframe (第三方)                                 │    │
│  │  ┌────────────────────────────────────────────────────────────┐ │    │
│  │  │ 实现 Opentu Tool Protocol (可选)                              │ │    │
│  │  │  window.parent.postMessage({                                │ │    │
│  │  │    type: 'tool:insert-text',                                │ │    │
│  │  │    payload: { text: '...' }                                 │ │    │
│  │  │  })                                                          │ │    │
│  │  └────────────────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🎨 模块 1: 错误处理架构

### 1.1 错误状态机

```
┌──────────┐
│ LOADING  │ ────┐
└──────────┘     │
      │          │ timeout (10s)
      │          ↓
      │    ┌──────────┐
      │    │  ERROR   │
      │    │ (timeout)│
      │    └──────────┘
      │
      │ load success
      ↓
┌──────────┐
│  LOADED  │
└──────────┘
      ↑
      │ retry
      │
┌──────────┐
│  ERROR   │ ← load failed / CORS blocked
│ (other)  │
└──────────┘
```

### 1.2 错误类型定义

```typescript
/**
 * 工具加载错误类型
 */
export enum ToolErrorType {
  /** 加载失败 - iframe onerror */
  LOAD_FAILED = 'load-failed',

  /** CORS 阻止 - X-Frame-Options */
  CORS_BLOCKED = 'cors-blocked',

  /** 权限被拒绝 - iframe sandbox */
  PERMISSION_DENIED = 'permission-denied',

  /** 加载超时 - 超过 10 秒 */
  TIMEOUT = 'timeout',
}

/**
 * 工具加载状态
 */
export interface ToolLoadState {
  status: 'loading' | 'loaded' | 'error';
  errorType?: ToolErrorType;
  errorMessage?: string;
  loadStartTime: number;
  retryCount: number;
}
```

### 1.3 错误检测逻辑

```typescript
class ToolGenerator {
  private loadStates = new Map<string, ToolLoadState>();

  /**
   * 创建 iframe 并设置错误检测
   */
  private createIframe(element: PlaitTool): HTMLIFrameElement {
    const iframe = document.createElement('iframe');
    const loadState: ToolLoadState = {
      status: 'loading',
      loadStartTime: Date.now(),
      retryCount: 0,
    };

    this.loadStates.set(element.id, loadState);

    // 成功加载
    iframe.onload = () => {
      // 检测 CORS 错误
      if (this.detectCorsError(iframe)) {
        this.handleLoadError(element.id, ToolErrorType.CORS_BLOCKED);
      } else {
        this.handleLoadSuccess(element.id);
      }
    };

    // 加载失败
    iframe.onerror = () => {
      this.handleLoadError(element.id, ToolErrorType.LOAD_FAILED);
    };

    // 超时检测
    this.setupLoadTimeout(element.id, iframe);

    iframe.src = element.url;
    return iframe;
  }

  /**
   * 设置加载超时检测（10 秒）
   */
  private setupLoadTimeout(elementId: string, iframe: HTMLIFrameElement): void {
    setTimeout(() => {
      const state = this.loadStates.get(elementId);
      if (state && state.status === 'loading') {
        this.handleLoadError(elementId, ToolErrorType.TIMEOUT);
      }
    }, 10000); // 10 秒超时
  }

  /**
   * 检测 CORS 错误
   * 尝试访问 iframe.contentWindow.location，如果抛出异常则可能是 CORS
   */
  private detectCorsError(iframe: HTMLIFrameElement): boolean {
    try {
      // 如果可以访问 location，说明没有 CORS 限制
      const _ = iframe.contentWindow?.location.href;
      return false;
    } catch (e) {
      // 访问被拒绝，可能是 X-Frame-Options 或 CSP
      return true;
    }
  }

  /**
   * 处理加载成功
   */
  private handleLoadSuccess(elementId: string): void {
    const state = this.loadStates.get(elementId);
    if (state) {
      state.status = 'loaded';
      this.loadStates.set(elementId, state);
    }
  }

  /**
   * 处理加载错误
   */
  private handleLoadError(elementId: string, errorType: ToolErrorType): void {
    const state = this.loadStates.get(elementId);
    if (state) {
      state.status = 'error';
      state.errorType = errorType;
      state.errorMessage = this.getErrorMessage(errorType);
      this.loadStates.set(elementId, state);

      // 触发错误事件，让组件显示错误提示
      this.emitErrorEvent(elementId, errorType);
    }
  }

  /**
   * 获取错误提示文案
   */
  private getErrorMessage(errorType: ToolErrorType): string {
    const messages = {
      [ToolErrorType.LOAD_FAILED]: '工具加载失败，请检查网络连接',
      [ToolErrorType.CORS_BLOCKED]: '该网站禁止嵌入，无法显示',
      [ToolErrorType.PERMISSION_DENIED]: '权限不足，无法加载工具',
      [ToolErrorType.TIMEOUT]: '加载超时，请重试',
    };
    return messages[errorType] || '未知错误';
  }

  /**
   * 触发错误事件
   */
  private emitErrorEvent(elementId: string, errorType: ToolErrorType): void {
    const event = new CustomEvent('tool-load-error', {
      detail: { elementId, errorType },
    });
    window.dispatchEvent(event);
  }
}
```

### 1.4 错误提示组件

```typescript
/**
 * 工具错误提示覆盖层
 */
export const ToolErrorOverlay: React.FC<ToolErrorOverlayProps> = ({
  errorType,
  toolName,
  url,
  onRetry,
  onRemove,
}) => {
  const errorConfig = {
    [ToolErrorType.LOAD_FAILED]: {
      icon: '⚠️',
      title: '加载失败',
      description: '工具无法加载,请检查网络连接',
    },
    [ToolErrorType.CORS_BLOCKED]: {
      icon: '🚫',
      title: '无法显示',
      description: '该网站禁止嵌入到其他页面',
    },
    [ToolErrorType.TIMEOUT]: {
      icon: '⏱️',
      title: '加载超时',
      description: '工具加载时间过长,请重试',
    },
    [ToolErrorType.PERMISSION_DENIED]: {
      icon: '🔒',
      title: '权限不足',
      description: '缺少必要的权限,无法加载',
    },
  };

  const config = errorConfig[errorType];

  return (
    <div className="tool-error-overlay">
      <div className="tool-error-overlay__icon">{config.icon}</div>
      <h4 className="tool-error-overlay__title">{config.title}</h4>
      <p className="tool-error-overlay__description">{config.description}</p>
      <div className="tool-error-overlay__details">
        <span className="tool-error-overlay__tool-name">{toolName}</span>
        <span className="tool-error-overlay__url" title={url}>
          {truncateUrl(url)}
        </span>
      </div>
      <div className="tool-error-overlay__actions">
        <Button size="small" onClick={onRetry}>
          重试
        </Button>
        <Button size="small" variant="outline" onClick={onRemove}>
          移除
        </Button>
      </div>
    </div>
  );
};
```

---

## 🔌 模块 2: postMessage 通信架构

### 2.1 通信协议设计

#### 消息流向

```
画布 (Opentu)                        工具 (iframe)
    │                                    │
    │ ──────── BOARD_TO_TOOL_INIT ────> │  初始化
    │                                    │
    │ <─────── TOOL_TO_BOARD_READY ───── │  就绪通知
    │                                    │
    │ ──────── BOARD_TO_TOOL_DATA ────> │  发送数据
    │                                    │
    │ <─── TOOL_TO_BOARD_INSERT_TEXT ─── │  插入文本请求
    │                                    │
    │ <─── TOOL_TO_BOARD_INSERT_IMAGE ── │  插入图片请求
    │                                    │
```

#### 消息格式规范

```typescript
/**
 * 通用消息格式
 */
interface ToolMessage<T = any> {
  // 协议版本
  version: '1.0';

  // 消息类型
  type: ToolMessageType;

  // 工具实例 ID
  toolId: string;

  // 消息 ID（用于追踪和去重）
  messageId: string;

  // 载荷数据
  payload: T;

  // 时间戳
  timestamp: number;

  // 可选：回复的消息 ID
  replyTo?: string;
}
```

### 2.2 通信服务实现

#### 核心服务类

```typescript
export class ToolCommunicationService {
  private board: PlaitBoard;
  private messageHandlers: Map<ToolMessageType, MessageHandler[]>;
  private pendingMessages: Map<string, PendingMessage>;
  private processedMessageIds: Set<string>;

  constructor(board: PlaitBoard) {
    this.board = board;
    this.messageHandlers = new Map();
    this.pendingMessages = new Map();
    this.processedMessageIds = new Set();

    this.setupMessageListener();
  }

  /**
   * 发送消息给工具（带超时和重试）
   */
  async sendToTool<T>(
    toolId: string,
    type: ToolMessageType,
    payload: T,
    options?: {
      timeout?: number;
      expectReply?: boolean;
    }
  ): Promise<ToolMessage | void> {
    const iframe = this.getToolIframe(toolId);
    if (!iframe?.contentWindow) {
      throw new Error(`Tool iframe not found: ${toolId}`);
    }

    const message: ToolMessage<T> = {
      version: '1.0',
      type,
      toolId,
      messageId: this.generateMessageId(),
      payload,
      timestamp: Date.now(),
    };

    // 如果期待回复，注册 pending 消息
    if (options?.expectReply) {
      return new Promise((resolve, reject) => {
        const timeoutMs = options.timeout || 5000;
        const timeoutId = setTimeout(() => {
          this.pendingMessages.delete(message.messageId);
          reject(new Error('Message timeout'));
        }, timeoutMs);

        this.pendingMessages.set(message.messageId, {
          message,
          resolve,
          reject,
          timeoutId,
        });

        iframe.contentWindow.postMessage(message, '*');
      });
    } else {
      // 不期待回复，直接发送
      iframe.contentWindow.postMessage(message, '*');
    }
  }

  /**
   * 注册消息处理器
   */
  on(type: ToolMessageType, handler: MessageHandler): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);
  }

  /**
   * 取消注册处理器
   */
  off(type: ToolMessageType, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage = (event: MessageEvent): void => {
    // 1. 验证消息格式
    if (!this.isValidToolMessage(event.data)) {
      return;
    }

    const message: ToolMessage = event.data;

    // 2. 防止重复处理
    if (this.processedMessageIds.has(message.messageId)) {
      console.warn('Duplicate message:', message.messageId);
      return;
    }
    this.processedMessageIds.add(message.messageId);

    // 3. 如果是回复消息，解析 pending promise
    if (message.replyTo) {
      this.resolvePendingMessage(message);
      return;
    }

    // 4. 调用注册的处理器
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => handler(message));
    }
  };

  /**
   * 解析等待中的消息
   */
  private resolvePendingMessage(message: ToolMessage): void {
    const pending = this.pendingMessages.get(message.replyTo!);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pending.resolve(message);
      this.pendingMessages.delete(message.replyTo!);
    }
  }

  /**
   * 验证消息格式和来源
   */
  private isValidToolMessage(data: any): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }

    // 检查必需字段
    const requiredFields = ['version', 'type', 'toolId', 'messageId', 'timestamp'];
    const hasAllFields = requiredFields.every(field => field in data);

    if (!hasAllFields) {
      return false;
    }

    // 检查版本
    if (data.version !== '1.0') {
      console.warn('Unsupported message version:', data.version);
      return false;
    }

    // 检查工具是否存在
    const iframe = this.getToolIframe(data.toolId);
    if (!iframe) {
      console.warn('Message from unknown tool:', data.toolId);
      return false;
    }

    return true;
  }

  /**
   * 生成唯一消息 ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取工具 iframe
   */
  private getToolIframe(toolId: string): HTMLIFrameElement | null {
    // 从 DOM 中查找对应的工具元素
    const toolElement = document.querySelector(
      `[data-tool-id="${toolId}"] iframe`
    ) as HTMLIFrameElement;
    return toolElement;
  }

  /**
   * 清理过期的消息 ID（防止内存泄漏）
   */
  private cleanupProcessedMessages(): void {
    // 保留最近 1000 条消息 ID
    if (this.processedMessageIds.size > 1000) {
      const idsArray = Array.from(this.processedMessageIds);
      this.processedMessageIds = new Set(idsArray.slice(-1000));
    }
  }

  /**
   * 设置全局监听器
   */
  private setupMessageListener(): void {
    window.addEventListener('message', this.handleMessage);

    // 定期清理
    setInterval(() => this.cleanupProcessedMessages(), 60000); // 每分钟
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    window.removeEventListener('message', this.handleMessage);
    this.pendingMessages.forEach(pending => clearTimeout(pending.timeoutId));
    this.pendingMessages.clear();
    this.messageHandlers.clear();
    this.processedMessageIds.clear();
  }
}
```

#### 消息处理器注册

```typescript
// 在 withTool 插件中注册处理器
export const withTool: PlaitPlugin = (board: PlaitBoard) => {
  const communicationService = new ToolCommunicationService(board);

  // 注册处理器
  communicationService.on(
    ToolMessageType.TOOL_TO_BOARD_INSERT_TEXT,
    (message) => {
      const { text, position } = message.payload;
      // 调用 Plait API 插入文本
      // TODO: 实现文本插入
    }
  );

  communicationService.on(
    ToolMessageType.TOOL_TO_BOARD_INSERT_IMAGE,
    (message) => {
      const { url, position, width, height } = message.payload;
      // 调用 Plait API 插入图片
      // TODO: 实现图片插入
    }
  );

  // 保存到 board
  (board as any).__toolCommunicationService = communicationService;

  return board;
};
```

### 2.3 工具端示例代码

```typescript
/**
 * Opentu Tool SDK（供第三方工具使用）
 */
class AituToolSDK {
  private parentWindow: Window;
  private toolId: string;

  constructor() {
    this.parentWindow = window.parent;
    this.toolId = this.getToolIdFromUrl();

    this.setupMessageListener();
    this.notifyReady();
  }

  /**
   * 通知画布工具已准备就绪
   */
  private notifyReady(): void {
    this.sendMessage(ToolMessageType.TOOL_TO_BOARD_READY, {
      version: '1.0',
    });
  }

  /**
   * 插入文本到画布
   */
  insertText(text: string, position?: [number, number]): void {
    this.sendMessage(ToolMessageType.TOOL_TO_BOARD_INSERT_TEXT, {
      text,
      position,
    });
  }

  /**
   * 插入图片到画布
   */
  insertImage(
    url: string,
    options?: { position?: [number, number]; width?: number; height?: number }
  ): void {
    this.sendMessage(ToolMessageType.TOOL_TO_BOARD_INSERT_IMAGE, {
      url,
      ...options,
    });
  }

  /**
   * 发送消息给画布
   */
  private sendMessage(type: ToolMessageType, payload: any): void {
    const message: ToolMessage = {
      version: '1.0',
      type,
      toolId: this.toolId,
      messageId: `msg_${Date.now()}_${Math.random()}`,
      payload,
      timestamp: Date.now(),
    };

    this.parentWindow.postMessage(message, '*');
  }

  /**
   * 从 URL 参数获取 tool ID
   */
  private getToolIdFromUrl(): string {
    const params = new URLSearchParams(window.location.search);
    return params.get('aituToolId') || 'unknown';
  }

  /**
   * 监听来自画布的消息
   */
  private setupMessageListener(): void {
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === ToolMessageType.BOARD_TO_TOOL_INIT) {
        this.handleInit(message.payload);
      }
    });
  }

  /**
   * 处理初始化消息
   */
  private handleInit(payload: any): void {
    console.log('Tool initialized:', payload);
  }
}

// 使用示例
const sdk = new AituToolSDK();

// 插入文本
document.getElementById('copyBtn')?.addEventListener('click', () => {
  sdk.insertText('Hello from tool!');
});

// 插入图片
document.getElementById('insertImageBtn')?.addEventListener('click', () => {
  sdk.insertImage('https://example.com/image.png', {
    width: 400,
    height: 300,
  });
});
```

---

## ⚙️ 模块 3: 自定义工具架构

### 3.1 数据模型

```typescript
/**
 * 自定义工具存储格式
 */
interface CustomToolsStorage {
  version: string;
  tools: ToolDefinition[];
  updatedAt: number;
}
```

### 3.2 存储服务

```typescript
class ToolboxService {
  private static readonly STORAGE_KEY = 'aitu:custom-tools';
  private static readonly MAX_CUSTOM_TOOLS = 50;

  /**
   * 初始化时加载自定义工具
   */
  async initialize(): Promise<void> {
    const storage = await localforage.getItem<CustomToolsStorage>(
      ToolboxService.STORAGE_KEY
    );

    if (storage) {
      // 验证版本兼容性
      if (this.isCompatibleVersion(storage.version)) {
        this.customTools = storage.tools;
      } else {
        console.warn('Incompatible custom tools version, resetting');
        await this.resetCustomTools();
      }
    }
  }

  /**
   * 添加自定义工具（带验证）
   */
  async addCustomTool(tool: Partial<ToolDefinition>): Promise<void> {
    // 1. 验证工具数量限制
    if (this.customTools.length >= ToolboxService.MAX_CUSTOM_TOOLS) {
      throw new Error(`Maximum ${ToolboxService.MAX_CUSTOM_TOOLS} custom tools allowed`);
    }

    // 2. 验证必填字段
    this.validateToolDefinition(tool);

    // 3. 生成唯一 ID
    const toolWithId: ToolDefinition = {
      ...tool,
      id: tool.id || `custom-${Date.now()}`,
      category: tool.category || ToolCategory.CUSTOM,
      defaultWidth: tool.defaultWidth || 800,
      defaultHeight: tool.defaultHeight || 600,
      permissions: tool.permissions || ['allow-scripts', 'allow-same-origin'],
    } as ToolDefinition;

    // 4. 检查 ID 唯一性
    if (this.getToolById(toolWithId.id)) {
      throw new Error('Tool ID already exists');
    }

    // 5. 添加到列表
    this.customTools.push(toolWithId);

    // 6. 持久化
    await this.saveCustomTools();
  }

  /**
   * 验证工具定义
   */
  private validateToolDefinition(tool: Partial<ToolDefinition>): void {
    // 必填字段
    if (!tool.name || !tool.url) {
      throw new Error('Tool name and URL are required');
    }

    // URL 格式验证
    try {
      const url = new URL(tool.url);
      // 只允许 https 和 http
      if (!['https:', 'http:'].includes(url.protocol)) {
        throw new Error('Only HTTP/HTTPS URLs are allowed');
      }
    } catch (e) {
      throw new Error('Invalid URL format');
    }

    // 名称长度限制
    if (tool.name.length > 50) {
      throw new Error('Tool name too long (max 50 characters)');
    }

    // 描述长度限制
    if (tool.description && tool.description.length > 200) {
      throw new Error('Tool description too long (max 200 characters)');
    }
  }

  /**
   * 保存自定义工具
   */
  private async saveCustomTools(): Promise<void> {
    const storage: CustomToolsStorage = {
      version: '1.0',
      tools: this.customTools,
      updatedAt: Date.now(),
    };

    await localforage.setItem(ToolboxService.STORAGE_KEY, storage);
  }

  /**
   * 版本兼容性检查
   */
  private isCompatibleVersion(version: string): boolean {
    return version === '1.0'; // 目前只有 1.0 版本
  }

  /**
   * 重置自定义工具
   */
  private async resetCustomTools(): Promise<void> {
    this.customTools = [];
    await this.saveCustomTools();
  }
}
```

### 3.3 自定义工具对话框

```typescript
export const CustomToolDialog: React.FC<CustomToolDialogProps> = ({
  visible,
  onClose,
  onAdd,
}) => {
  const [formData, setFormData] = useState<Partial<ToolDefinition>>({
    name: '',
    url: '',
    description: '',
    icon: '🔧',
    category: ToolCategory.CUSTOM,
    defaultWidth: 800,
    defaultHeight: 600,
    permissions: ['allow-scripts', 'allow-same-origin'],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  /**
   * 表单验证
   */
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name) {
      newErrors.name = '请输入工具名称';
    }

    if (!formData.url) {
      newErrors.url = '请输入工具 URL';
    } else {
      try {
        new URL(formData.url);
      } catch {
        newErrors.url = 'URL 格式不正确';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * 提交表单
   */
  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      await onAdd(formData as ToolDefinition);
      onClose();
    } catch (error) {
      setErrors({ submit: error.message });
    }
  };

  return (
    <Dialog visible={visible} onClose={onClose} header="添加自定义工具">
      <Form>
        <FormItem label="工具名称" required>
          <Input
            value={formData.name}
            onChange={(value) => setFormData({ ...formData, name: value })}
            placeholder="例如：香蕉提示词"
            error={errors.name}
          />
        </FormItem>

        <FormItem label="工具 URL" required>
          <Input
            value={formData.url}
            onChange={(value) => setFormData({ ...formData, url: value })}
            placeholder="https://example.com"
            error={errors.url}
          />
        </FormItem>

        <FormItem label="工具描述">
          <Textarea
            value={formData.description}
            onChange={(value) => setFormData({ ...formData, description: value })}
            placeholder="简要描述工具功能"
            maxlength={200}
          />
        </FormItem>

        <FormItem label="工具图标">
          <EmojiPicker
            value={formData.icon}
            onChange={(emoji) => setFormData({ ...formData, icon: emoji })}
          />
        </FormItem>

        <FormItem label="分类">
          <Select
            value={formData.category}
            onChange={(value) => setFormData({ ...formData, category: value })}
          >
            <Option value={ToolCategory.AI_TOOLS}>AI 工具</Option>
            <Option value={ToolCategory.CONTENT_TOOLS}>内容工具</Option>
            <Option value={ToolCategory.UTILITIES}>实用工具</Option>
            <Option value={ToolCategory.CUSTOM}>自定义</Option>
          </Select>
        </FormItem>

        <FormItem label="iframe 权限">
          <Checkbox.Group
            value={formData.permissions}
            onChange={(value) => setFormData({ ...formData, permissions: value })}
          >
            <Checkbox value="allow-scripts">允许脚本</Checkbox>
            <Checkbox value="allow-same-origin">允许同源访问</Checkbox>
            <Checkbox value="allow-forms">允许表单</Checkbox>
            <Checkbox value="allow-popups">允许弹窗</Checkbox>
          </Checkbox.Group>
        </FormItem>

        {errors.submit && (
          <div className="custom-tool-dialog__error">{errors.submit}</div>
        )}
      </Form>

      <div slot="footer">
        <Button onClick={onClose}>取消</Button>
        <Button theme="primary" onClick={handleSubmit}>
          添加
        </Button>
      </div>
    </Dialog>
  );
};
```

---

## 🎨 模块 4: 样式优化架构

### 4.1 CSS 变量系统

```scss
// toolbox-theme.scss
:root {
  // === 工具箱主题色 ===
  --toolbox-bg: #ffffff;
  --toolbox-border: #e5e5e5;
  --toolbox-text: #262626;
  --toolbox-text-secondary: #8c8c8c;
  --toolbox-hover-bg: #f5f5f5;
  --toolbox-shadow: rgba(0, 0, 0, 0.08);

  // === 工具卡片 ===
  --tool-card-bg: #ffffff;
  --tool-card-border: #d9d9d9;
  --tool-card-hover-border: var(--brand-color-primary, #f39c12);
  --tool-card-shadow: rgba(0, 0, 0, 0.1);

  // === 工具元素（画布上） ===
  --tool-element-border: transparent;
  --tool-element-border-selected: var(--brand-color-primary, #f39c12);
  --tool-element-shadow: rgba(0, 0, 0, 0.15);
  --tool-element-shadow-selected: rgba(243, 156, 18, 0.2);
}

// 深色模式
[data-theme='dark'] {
  --toolbox-bg: #1f1f1f;
  --toolbox-border: #3a3a3a;
  --toolbox-text: #e5e5e5;
  --toolbox-text-secondary: #a6a6a6;
  --toolbox-hover-bg: #2a2a2a;
  --toolbox-shadow: rgba(0, 0, 0, 0.3);

  --tool-card-bg: #2a2a2a;
  --tool-card-border: #3a3a3a;
  --tool-card-hover-border: var(--brand-color-primary, #f39c12);
  --tool-card-shadow: rgba(0, 0, 0, 0.3);

  --tool-element-border: transparent;
  --tool-element-border-selected: var(--brand-color-primary, #f39c12);
  --tool-element-shadow: rgba(0, 0, 0, 0.5);
  --tool-element-shadow-selected: rgba(243, 156, 18, 0.3);
}
```

### 4.2 响应式断点

```scss
// 响应式断点
$breakpoint-mobile: 480px;
$breakpoint-tablet: 768px;
$breakpoint-desktop: 1024px;

// Mixins
@mixin mobile {
  @media (max-width: $breakpoint-mobile) {
    @content;
  }
}

@mixin tablet {
  @media (max-width: $breakpoint-tablet) {
    @content;
  }
}

@mixin desktop {
  @media (min-width: $breakpoint-desktop) {
    @content;
  }
}
```

---

## 📊 性能优化

### 1. postMessage 防抖

```typescript
class ToolCommunicationService {
  private messageQueue: ToolMessage[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;

  /**
   * 批量发送消息（防抖）
   */
  private flushMessages(): void {
    if (this.messageQueue.length === 0) return;

    const messages = [...this.messageQueue];
    this.messageQueue = [];

    messages.forEach((message) => {
      const iframe = this.getToolIframe(message.toolId);
      iframe?.contentWindow?.postMessage(message, '*');
    });
  }

  /**
   * 添加消息到队列
   */
  private queueMessage(message: ToolMessage): void {
    this.messageQueue.push(message);

    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }

    this.flushTimeout = setTimeout(() => {
      this.flushMessages();
    }, 16); // 一帧时间
  }
}
```

### 2. 错误状态缓存

```typescript
class ToolGenerator {
  // 缓存错误状态,避免重复检测
  private errorCache = new Map<string, { type: ToolErrorType; timestamp: number }>();

  private getCachedError(elementId: string): ToolErrorType | null {
    const cached = this.errorCache.get(elementId);
    if (!cached) return null;

    // 缓存 5 分钟
    if (Date.now() - cached.timestamp > 5 * 60 * 1000) {
      this.errorCache.delete(elementId);
      return null;
    }

    return cached.type;
  }
}
```

---

## 🔒 安全考虑

### 1. CSP 策略

```html
<!-- 添加 CSP meta 标签 -->
<meta
  http-equiv="Content-Security-Policy"
  content="frame-src 'self' https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
/>
```

### 2. URL 白名单

```typescript
class ToolboxService {
  // 可信域名白名单
  private trustedDomains = [
    'bananabanana.me',
    'unsplash.com',
    'batchgenerator.com',
  ];

  /**
   * 检查 URL 是否可信
   */
  isTrustedUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return this.trustedDomains.some(domain =>
        urlObj.hostname.endsWith(domain)
      );
    } catch {
      return false;
    }
  }
}
```

---

## 📝 总结

Phase 3 的架构设计遵循以下原则：

1. **模块化** - 每个功能独立实现,易于测试和维护
2. **类型安全** - 完整的 TypeScript 类型定义
3. **性能优先** - 防抖、缓存、批量处理
4. **安全第一** - 消息验证、URL 白名单、CSP
5. **用户体验** - 友好的错误提示、流畅的动画、响应式设计

---

**Created by**: Claude Code
**Date**: 2025-12-09
**Status**: ✅ 架构设计完成
