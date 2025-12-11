# Phase 3 实施计划 - 优化与完善

> Feature: feat/08-multifunctional-toolbox
> Created: 2025-12-09
> Status: 计划阶段

---

## 📋 概述

Phase 3 旨在提升多功能工具箱的用户体验和功能完整性，在已有的基础架构（Phase 1）和用户交互（Phase 2）基础上，增强样式、通信、自定义和错误处理能力。

### 核心目标

- 🎨 **更好的视觉体验** - 响应式设计、深色模式、优化的选中态
- 🔌 **工具双向通信** - postMessage 协议，实现画布与工具的数据交互
- ⚙️ **自定义工具** - 用户可添加自己的工具，配置持久化
- 🛡️ **完善的错误处理** - 友好的错误提示和降级方案

---

## 🎯 Phase 3 任务拆解

### 任务优先级

根据用户价值和实现复杂度，建议按以下优先级实施：

| 优先级 | 任务模块 | 用户价值 | 实现难度 | 预计时间 |
|--------|---------|---------|---------|---------|
| **P0** | 错误处理增强 | ⭐⭐⭐⭐⭐ | ⭐⭐ | 1 小时 |
| **P0** | 样式优化 | ⭐⭐⭐⭐ | ⭐⭐⭐ | 1.5 小时 |
| **P1** | postMessage 通信 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 2 小时 |
| **P2** | 自定义工具 | ⭐⭐⭐ | ⭐⭐⭐ | 1.5 小时 |

**总预计时间**: 约 6 小时

---

## 📐 任务详细设计

### P0-1: 错误处理增强（1 小时）

#### 目标
完善 iframe 加载失败、跨域限制、权限错误等场景的用户提示。

#### 实现内容

**1.1 增强错误提示组件（30 分钟）**

文件：`packages/drawnix/src/components/tool-element/ToolErrorOverlay.tsx`

```typescript
/**
 * 工具加载错误覆盖层
 */
export interface ToolErrorOverlayProps {
  errorType: 'load-failed' | 'cors-blocked' | 'permission-denied' | 'timeout';
  toolName: string;
  url: string;
  onRetry: () => void;
  onRemove: () => void;
}

export const ToolErrorOverlay: React.FC<ToolErrorOverlayProps>;
```

**特性**：
- 不同错误类型显示不同图标和提示文案
- 提供"重试"和"移除"按钮
- 显示错误的工具名称和 URL（截断显示）
- 半透明背景，保持可读性

**1.2 工具加载状态管理（30 分钟）**

文件：`packages/drawnix/src/components/tool-element/tool.generator.ts`（更新）

增强加载状态跟踪：

```typescript
interface ToolLoadState {
  status: 'loading' | 'loaded' | 'error';
  errorType?: 'load-failed' | 'cors-blocked' | 'timeout';
  loadStartTime: number;
}

class ToolGenerator {
  private loadStates = new Map<string, ToolLoadState>();

  // 超时检测（10 秒）
  private setupLoadTimeout(elementId: string, iframe: HTMLIFrameElement): void;

  // 检测 CORS 错误
  private detectCorsError(iframe: HTMLIFrameElement): boolean;
}
```

**验收标准**：
- [x] iframe 加载超过 10 秒显示超时错误
- [x] 检测到 X-Frame-Options 阻止时显示 CORS 错误
- [x] 加载失败时显示友好的错误提示
- [x] 错误状态下可以重试或移除工具

---

### P0-2: 样式优化（1.5 小时）

#### 目标
优化工具元素的视觉呈现，包括选中态、Hover 态、深色模式适配。

#### 实现内容

**2.1 优化工具元素选中态样式（30 分钟）**

文件：`packages/drawnix/src/components/tool-element/tool.component.scss`（更新）

当前问题：工具元素选中时视觉反馈不够明显

优化方案：

```scss
.plait-tool-element {
  // 默认状态
  &__container {
    border: 2px solid transparent;
    transition: all 0.2s ease;
  }

  // 选中态
  &--selected {
    .plait-tool-element__container {
      border-color: var(--brand-color-primary, #f39c12);
      box-shadow: 0 0 0 2px rgba(243, 156, 18, 0.2),
                  0 4px 16px rgba(0, 0, 0, 0.15);
    }
  }

  // Hover 态（仅在非编辑模式）
  &:hover:not(&--editing) {
    .plait-tool-element__container {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }
  }

  // 编辑模式（双击后）
  &--editing {
    .plait-tool-element__container {
      border-color: var(--brand-color-primary, #f39c12);
      box-shadow: 0 0 0 3px rgba(243, 156, 18, 0.3);
    }
  }
}
```

**2.2 响应式适配（30 分钟）**

文件：`packages/drawnix/src/components/toolbox-drawer/toolbox-drawer.scss`（更新）

移动端优化：

```scss
.toolbox-drawer {
  // 桌面端默认宽度 320px
  width: 320px;

  // 平板端
  @media (max-width: 768px) {
    width: 280px;
  }

  // 移动端 - 全屏抽屉
  @media (max-width: 480px) {
    width: 100vw;
    left: 0;

    &__search {
      padding: 12px 16px;
    }

    &__categories {
      flex-wrap: wrap;
      gap: 8px;
    }
  }
}
```

**2.3 深色模式支持（30 分钟）**

文件：`packages/drawnix/src/styles/toolbox-theme.scss`（新建）

使用 CSS 变量适配深色模式：

```scss
:root {
  // 工具箱主题色
  --toolbox-bg: #ffffff;
  --toolbox-border: #e5e5e5;
  --toolbox-text: #262626;
  --toolbox-text-secondary: #8c8c8c;
  --toolbox-hover-bg: #f5f5f5;

  // 工具卡片
  --tool-card-bg: #ffffff;
  --tool-card-border: #d9d9d9;
  --tool-card-hover-border: #f39c12;
}

[data-theme='dark'] {
  --toolbox-bg: #1f1f1f;
  --toolbox-border: #3a3a3a;
  --toolbox-text: #e5e5e5;
  --toolbox-text-secondary: #a6a6a6;
  --toolbox-hover-bg: #2a2a2a;

  --tool-card-bg: #2a2a2a;
  --tool-card-border: #3a3a3a;
  --tool-card-hover-border: #f39c12;
}
```

**验收标准**：
- [x] 选中工具元素时有明显的边框和阴影
- [x] 移动端工具箱抽屉全屏显示
- [x] 深色模式下所有组件颜色正确
- [x] Hover 效果流畅自然

---

### P1: postMessage 通信协议（2 小时）

#### 目标
实现画布与工具 iframe 之间的双向通信，支持数据交互。

#### 实现内容

**3.1 通信协议设计（30 分钟）**

文件：`packages/drawnix/src/types/tool-communication.types.ts`（新建）

```typescript
/**
 * 工具通信消息类型
 */
export enum ToolMessageType {
  // 画布 → 工具
  BOARD_TO_TOOL_INIT = 'board:init',           // 初始化工具
  BOARD_TO_TOOL_DATA = 'board:data',           // 发送数据给工具
  BOARD_TO_TOOL_CONFIG = 'board:config',       // 发送配置

  // 工具 → 画布
  TOOL_TO_BOARD_READY = 'tool:ready',          // 工具准备就绪
  TOOL_TO_BOARD_INSERT_TEXT = 'tool:insert-text', // 插入文本到画布
  TOOL_TO_BOARD_INSERT_IMAGE = 'tool:insert-image', // 插入图片到画布
  TOOL_TO_BOARD_REQUEST_DATA = 'tool:request-data', // 请求画布数据
}

/**
 * 通信消息基础接口
 */
export interface ToolMessage<T = any> {
  type: ToolMessageType;
  toolId: string;  // 工具实例 ID
  payload: T;
  timestamp: number;
}

/**
 * 插入文本消息
 */
export interface InsertTextPayload {
  text: string;
  position?: [number, number]; // 可选的插入位置
}

/**
 * 插入图片消息
 */
export interface InsertImagePayload {
  url: string;
  position?: [number, number];
  width?: number;
  height?: number;
}
```

**3.2 通信服务实现（1 小时）**

文件：`packages/drawnix/src/services/tool-communication-service.ts`（新建）

```typescript
/**
 * 工具通信服务
 * 管理画布与工具 iframe 之间的消息传递
 */
export class ToolCommunicationService {
  private board: PlaitBoard;
  private messageHandlers = new Map<string, (message: ToolMessage) => void>();

  constructor(board: PlaitBoard) {
    this.board = board;
    this.setupMessageListener();
  }

  /**
   * 设置全局消息监听器
   */
  private setupMessageListener(): void {
    window.addEventListener('message', this.handleMessage.bind(this));
  }

  /**
   * 处理来自工具的消息
   */
  private handleMessage(event: MessageEvent): void {
    // 验证消息来源
    if (!this.isValidToolMessage(event)) {
      return;
    }

    const message: ToolMessage = event.data;

    // 路由到对应处理器
    switch (message.type) {
      case ToolMessageType.TOOL_TO_BOARD_READY:
        this.handleToolReady(message);
        break;
      case ToolMessageType.TOOL_TO_BOARD_INSERT_TEXT:
        this.handleInsertText(message);
        break;
      case ToolMessageType.TOOL_TO_BOARD_INSERT_IMAGE:
        this.handleInsertImage(message);
        break;
      // ... 其他处理器
    }
  }

  /**
   * 发送消息给工具
   */
  sendToTool(toolId: string, type: ToolMessageType, payload: any): void {
    const iframe = this.getToolIframe(toolId);
    if (!iframe || !iframe.contentWindow) {
      console.warn(`Tool iframe not found: ${toolId}`);
      return;
    }

    const message: ToolMessage = {
      type,
      toolId,
      payload,
      timestamp: Date.now(),
    };

    iframe.contentWindow.postMessage(message, '*');
  }

  /**
   * 处理工具就绪消息
   */
  private handleToolReady(message: ToolMessage): void {
    console.log(`Tool ready: ${message.toolId}`);

    // 发送初始化配置
    this.sendToTool(message.toolId, ToolMessageType.BOARD_TO_TOOL_INIT, {
      boardId: this.board.id,
      theme: 'light',
    });
  }

  /**
   * 处理插入文本请求
   */
  private handleInsertText(message: ToolMessage<InsertTextPayload>): void {
    const { text, position } = message.payload;

    // 调用 Plait 的文本插入 API
    // TODO: 实现文本插入逻辑
    console.log('Insert text:', text, position);
  }

  /**
   * 处理插入图片请求
   */
  private handleInsertImage(message: ToolMessage<InsertImagePayload>): void {
    const { url, position, width, height } = message.payload;

    // 调用 Plait 的图片插入 API
    // TODO: 实现图片插入逻辑
    console.log('Insert image:', url, position);
  }

  /**
   * 验证消息来源
   */
  private isValidToolMessage(event: MessageEvent): boolean {
    // 检查消息格式
    if (!event.data || typeof event.data !== 'object') {
      return false;
    }

    // 检查是否是工具消息
    const message = event.data;
    return message.type && message.toolId && message.timestamp;
  }

  /**
   * 获取工具的 iframe
   */
  private getToolIframe(toolId: string): HTMLIFrameElement | null {
    // 从 ToolGenerator 缓存中获取
    // TODO: 需要访问 ToolGenerator 的 iframe 缓存
    return null;
  }

  /**
   * 清理资源
   */
  destroy(): void {
    window.removeEventListener('message', this.handleMessage.bind(this));
    this.messageHandlers.clear();
  }
}
```

**3.3 集成到工具组件（30 分钟）**

文件：`packages/drawnix/src/plugins/with-tool.ts`（更新）

在 withTool 插件中初始化通信服务：

```typescript
export const withTool: PlaitPlugin = (board: PlaitBoard) => {
  const { drawElement } = board;

  // 初始化通信服务
  const communicationService = new ToolCommunicationService(board);

  // 保存到 board 上以便访问
  (board as any).__toolCommunicationService = communicationService;

  // ... 其他插件逻辑

  return board;
};
```

**验收标准**：
- [x] 画布可以接收工具发送的消息
- [x] 画布可以向工具发送消息
- [x] 工具可以请求插入文本到画布
- [x] 工具可以请求插入图片到画布
- [x] 消息验证防止恶意消息

---

### P2: 自定义工具（1.5 小时）

#### 目标
允许用户添加自己的工具，并持久化保存配置。

#### 实现内容

**4.1 自定义工具管理界面（1 小时）**

文件：`packages/drawnix/src/components/custom-tool-dialog/CustomToolDialog.tsx`（新建）

```typescript
/**
 * 自定义工具添加对话框
 */
export interface CustomToolDialogProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (tool: ToolDefinition) => void;
}

export const CustomToolDialog: React.FC<CustomToolDialogProps>;
```

**表单字段**：
- 工具名称（必填）
- 工具 URL（必填）
- 工具描述（可选）
- 工具图标（emoji 选择器）
- 分类（下拉选择）
- 默认宽度/高度（数字输入）
- iframe 权限（多选）

**4.2 自定义工具持久化（30 分钟）**

文件：`packages/drawnix/src/services/toolbox-service.ts`（更新）

使用 localforage 持久化自定义工具：

```typescript
export class ToolboxService {
  private static readonly STORAGE_KEY = 'aitu:custom-tools';

  /**
   * 加载自定义工具
   */
  async loadCustomTools(): Promise<ToolDefinition[]> {
    const tools = await localforage.getItem<ToolDefinition[]>(
      ToolboxService.STORAGE_KEY
    );
    return tools || [];
  }

  /**
   * 保存自定义工具
   */
  async saveCustomTools(): Promise<void> {
    await localforage.setItem(
      ToolboxService.STORAGE_KEY,
      this.customTools
    );
  }

  /**
   * 添加自定义工具
   */
  async addCustomTool(tool: ToolDefinition): Promise<void> {
    // 验证工具配置
    this.validateToolDefinition(tool);

    // 添加到列表
    this.customTools.push(tool);

    // 持久化
    await this.saveCustomTools();
  }

  /**
   * 删除自定义工具
   */
  async removeCustomTool(id: string): Promise<void> {
    this.customTools = this.customTools.filter(tool => tool.id !== id);
    await this.saveCustomTools();
  }

  /**
   * 验证工具配置
   */
  private validateToolDefinition(tool: ToolDefinition): void {
    if (!tool.id || !tool.name || !tool.url) {
      throw new Error('Invalid tool definition');
    }

    // 验证 URL 格式
    try {
      new URL(tool.url);
    } catch {
      throw new Error('Invalid URL format');
    }
  }
}
```

**验收标准**：
- [x] 用户可以通过对话框添加自定义工具
- [x] 自定义工具保存到 IndexedDB
- [x] 刷新页面后自定义工具仍然存在
- [x] 自定义工具可以删除
- [x] 表单验证阻止无效配置

---

## 📂 新增文件清单

```
packages/drawnix/src/
├── components/
│   ├── tool-element/
│   │   └── ToolErrorOverlay.tsx          # 新建 - 错误提示组件
│   └── custom-tool-dialog/
│       ├── CustomToolDialog.tsx          # 新建 - 自定义工具对话框
│       ├── CustomToolForm.tsx            # 新建 - 工具表单
│       ├── EmojiPicker.tsx               # 新建 - Emoji 选择器
│       └── custom-tool-dialog.scss       # 新建 - 样式
│
├── services/
│   └── tool-communication-service.ts     # 新建 - 通信服务
│
├── types/
│   └── tool-communication.types.ts       # 新建 - 通信类型定义
│
└── styles/
    └── toolbox-theme.scss                # 新建 - 主题样式
```

---

## 🔄 更新文件清单

```
packages/drawnix/src/
├── components/
│   ├── tool-element/
│   │   ├── tool.generator.ts             # 更新 - 加载状态管理
│   │   └── tool.component.scss           # 更新 - 选中态样式
│   └── toolbox-drawer/
│       ├── ToolboxDrawer.tsx             # 更新 - 添加自定义工具按钮
│       └── toolbox-drawer.scss           # 更新 - 响应式适配
│
├── services/
│   └── toolbox-service.ts                # 更新 - 自定义工具管理
│
└── plugins/
    └── with-tool.ts                      # 更新 - 集成通信服务
```

---

## 🎯 实施建议

### 分步实施路线

**第一步：P0 任务（2.5 小时）**
1. 错误处理增强 → 提升稳定性
2. 样式优化 → 提升视觉体验

**第二步：P1 任务（2 小时）**
3. postMessage 通信 → 解锁工具交互能力

**第三步：P2 任务（1.5 小时）**
4. 自定义工具 → 提升可扩展性

### 测试要点

#### 功能测试
- [ ] 错误场景覆盖：加载失败、CORS、超时
- [ ] 样式在不同设备和主题下正确显示
- [ ] postMessage 消息正确发送和接收
- [ ] 自定义工具添加、删除、持久化正常

#### 性能测试
- [ ] 多个工具同时加载不卡顿
- [ ] postMessage 消息处理不阻塞 UI
- [ ] 自定义工具数量增加不影响性能

#### 安全测试
- [ ] postMessage 消息来源验证
- [ ] 自定义工具 URL 验证
- [ ] iframe sandbox 权限正确设置

---

## 📊 预期成果

完成 Phase 3 后，多功能工具箱将具备：

1. ✅ **完善的用户体验**
   - 友好的错误提示
   - 精美的视觉设计
   - 响应式适配
   - 深色模式支持

2. ✅ **强大的交互能力**
   - 工具与画布双向通信
   - 工具可以向画布插入内容
   - 画布可以向工具发送数据

3. ✅ **高度可扩展**
   - 用户可以添加任意工具
   - 工具配置持久化
   - 支持自定义权限和样式

4. ✅ **生产级质量**
   - 完善的错误处理
   - 安全的消息验证
   - 良好的性能表现

---

## 🔗 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 整体架构设计
- [PHASE1_COMPLETE.md](./PHASE1_COMPLETE.md) - Phase 1 完成总结
- [PHASE2_COMPLETE.md](./PHASE2_COMPLETE.md) - Phase 2 完成总结
- [postMessage API 文档](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
- [localforage 文档](https://localforage.github.io/localForage/)

---

## 📝 注意事项

### 技术债务
- postMessage 通信需要工具网页配合实现协议
- CORS 错误检测可能不准确（浏览器限制）
- 自定义工具的安全性依赖用户自觉

### 兼容性
- postMessage 兼容性良好（IE 8+）
- localforage 自动降级到 localStorage
- CSS 变量需要 IE 11+（可用 PostCSS 处理）

---

**Created by**: Claude Code
**Date**: 2025-12-09
**Status**: ✅ 计划完成，待审核
