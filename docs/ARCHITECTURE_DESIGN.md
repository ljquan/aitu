# 爱图 (Aitu) 新架构设计方案

## 1. 设计目标

基于需求分析，新架构需要支持以下核心能力：

1. **插件化扩展**：像桌面应用一样，可以用窗口承载各种小工具的展示
2. **工作流系统**：支持用 JSON 的方式定制不同的工作流，工作流中各节点也可以像插件一样扩展

## 2. 架构概览

### 2.1 新架构分层图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              应用层 (Application Layer)                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                           Drawnix 主应用                               │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
┌───────────────────┐   ┌─────────────────────────┐   ┌─────────────────────┐
│   窗口管理系统     │   │     工作流引擎          │   │    插件系统          │
│  Window Manager   │   │   Workflow Engine       │   │  Plugin System      │
└───────────────────┘   └─────────────────────────┘   └─────────────────────┘
        │                             │                             │
        └─────────────────────────────┼─────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              核心服务层 (Core Services)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ EventBus     │  │ StateManager │  │ StorageService│  │ APIGateway  │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              基础设施层 (Infrastructure)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Plait Board  │  │ IndexedDB    │  │ WebWorker    │  │ Network      │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 3. 插件系统设计

### 3.1 插件架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Plugin System                                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Plugin Registry                              │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │    │
│  │  │ AI Image    │  │ AI Video    │  │ Color Picker│  │ Custom...   │ │    │
│  │  │ Generator   │  │ Generator   │  │ Tool        │  │             │ │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Plugin Manager                               │    │
│  │  • register(plugin)    • unregister(pluginId)                       │    │
│  │  • enable(pluginId)    • disable(pluginId)                          │    │
│  │  • getPlugin(pluginId) • getAllPlugins()                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Plugin Lifecycle                             │    │
│  │  install → activate → deactivate → uninstall                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 插件接口定义

```typescript
/**
 * 插件元数据
 */
interface PluginManifest {
  /** 插件唯一标识(英文) */
  id: string;
  /** 插件名称（中文） */
  name: string;
  /** 插件版本 */
  version?: string;
  /** 插件描述 */
  description?: string;
  /** 插件图标 */
  icon?: string | React.ComponentType;
  /** 插件分类 */
  category?: PluginCategory;
  /** 依赖的其他插件 */
  dependencies?: string[];
  /** 支持的工作流节点类型 */
  workflowNodes?: WorkflowNodeDefinition[];
}

/**
 * 插件分类
 */
enum PluginCategory {
  AI_GENERATION = 'ai-generation',    // AI 生成类
  DRAWING_TOOL = 'drawing-tool',      // 绘图工具类
  DATA_TRANSFORM = 'data-transform',  // 数据转换类
  UTILITY = 'utility',                // 实用工具类
}

/**
 * 插件上下文 - 提供给插件的 API
 */
interface PluginContext {
  /** 获取画布实例 */
  getBoard(): PlaitBoard | null;
  /** 获取应用状态 */
  getAppState(): DrawnixState;
  /** 更新应用状态 */
  updateAppState(state: Partial<DrawnixState>): void;
  /** 打开窗口 */
  openWindow(options: WindowOptions): WindowInstance;
  /** 关闭窗口 */
  closeWindow(windowId: string): void;
  /** 注册工具栏项 */
  registerToolbarItem(item: ToolbarItem): void;
  /** 注册快捷键 */
  registerHotkey(hotkey: HotkeyDefinition): void;
  /** 订阅事件 */
  on<T extends EventType>(event: T, handler: EventHandler<T>): () => void;
  /** 发送事件 */
  emit<T extends EventType>(event: T, payload: EventPayload<T>): void;
  /** 存储 API */
  storage: PluginStorage;
  /** 日志 API */
  logger: PluginLogger;
}

/**
 * 插件接口
 */
interface Plugin {
  /** 插件元数据 */
  manifest: PluginManifest;
  
  /** 插件安装时调用 */
  install?(context: PluginContext): Promise<void> | void;
  
  /** 插件激活时调用 */
  activate?(context: PluginContext): Promise<void> | void;
  
  /** 插件停用时调用 */
  deactivate?(context: PluginContext): Promise<void> | void;
  
  /** 插件卸载时调用 */
  uninstall?(context: PluginContext): Promise<void> | void;
  
  /** 获取插件提供的 UI 组件 */
  getComponent?(): React.ComponentType<PluginComponentProps>;
  
  /** 获取插件提供的工作流节点执行器 */
  getWorkflowNodeExecutors?(): Record<string, WorkflowNodeExecutor>;
}
```

### 3.3 插件示例：AI 图像生成插件

```typescript
// plugins/ai-image-generation/index.ts
const manifest: PluginManifest = {
  id: 'ai-image-generation',
  name: 'AI 图像生成',
  version: '1.0.0',
  description: '使用 AI 模型生成图像',
  icon: 'ImageIcon',
  category: 'ai-generation',
  workflowNodes: [
    {
      id: 'prompt-template',
      name: '提示词模板',
      inputs: [],
      outputs: [{ id: 'prompt',  default: '绘制图片${prompt}'}],
    },
    {
      id: 'ai-image-generate',
      name: 'AI 图像生成',
      inputs: [{ id: 'prompt', required: true }],
      outputs: [{ id: 'image'}],
    },
  ],
};

export const aiImageGenerationPlugin: Plugin = {
  manifest,
  
  activate(context: PluginContext) {
    // 注册工具栏按钮
    context.registerToolbarItem({
      id: 'ai-image-btn',
      icon: 'ImageIcon',
      label: 'AI 图像生成',
      onClick: () => {
        context.openWindow({
          id: 'ai-image-window',
          title: 'AI 图像生成',
          component: AIImageGenerationComponent,
          width: '60%',
          height: '60%',
        });
      },
    });
    
    // 注册快捷键
    context.registerHotkey({
      key: 'mod+shift+i',
      handler: () => context.emit('plugin:open-window', { pluginId: 'ai-image-generation' }),
    });
  },
  
  getWorkflowNodeExecutors() {
    return {
      'ai-image-generate': imageGenerationNode,
    };
  },
};
```

### 3.4 插件管理器实现

```typescript
// core/plugin-manager.ts
class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private activePlugins: Set<string> = new Set();
  private context: PluginContext;
  
  constructor(context: PluginContext) {
    this.context = context;
  }
  
  /** 注册插件 */
  async register(plugin: Plugin): Promise<void> {
    const { id } = plugin.manifest;
    if (this.plugins.has(id)) {
      throw new Error(`Plugin ${id} is already registered`);
    }
    
    await this.checkDependencies(plugin.manifest);
    await plugin.install?.(this.context);
    this.plugins.set(id, plugin);
  }
  
  /** 激活插件 */
  async activate(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
    if (this.activePlugins.has(pluginId)) return;
    
    // 激活依赖
    for (const depId of plugin.manifest.dependencies || []) {
      await this.activate(depId);
    }
    
    await plugin.activate?.(this.context);
    this.activePlugins.add(pluginId);
  }
  
  /** 停用插件 */
  async deactivate(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !this.activePlugins.has(pluginId)) return;
    
    await plugin.deactivate?.(this.context);
    this.activePlugins.delete(pluginId);
  }
  
  /** 卸载插件 */
  async unregister(pluginId: string): Promise<void> {
    await this.deactivate(pluginId);
    const plugin = this.plugins.get(pluginId);
    await plugin?.uninstall?.(this.context);
    this.plugins.delete(pluginId);
  }
  
  private async checkDependencies(manifest: PluginManifest): Promise<void> {
    for (const depId of manifest.dependencies || []) {
      if (!this.plugins.has(depId)) {
        throw new Error(`Missing dependency: ${depId}`);
      }
    }
  }
}
```

## 4. 窗口管理系统设计

### 4.1 窗口接口定义

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Window Manager                                     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Window Registry                               │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │    │
│  │  │ Window 1 │  │ Window 2 │  │ Window 3 │  │ Window N │            │    │
│  │  │ (AI Gen) │  │ (Video)  │  │ (Chat)   │  │ (...)    │            │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Window State                                  │    │
│  │  • position (x, y)     • size (width, height)                       │    │
│  │  • z-index             • minimized/maximized                        │    │
│  │  • focused             • docked                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Window Layout                                 │    │
│  │  • Floating (自由浮动)  • Tiled (平铺)  • Docked (停靠)             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 窗口接口定义

```typescript
/**
 * 窗口配置
 */
interface WindowOptions {
  /** 窗口唯一标识 */
  id: string;
  /** 窗口标题 */
  title: string;
  /** 窗口图标 */
  icon?: string | React.ComponentType;
  /** 窗口内容组件 */
  component: React.ComponentType<WindowComponentProps>;
  /** 传递给组件的 props */
  componentProps?: Record<string, any>;
  /** 窗口宽度 */
  width?: number | string;
  /** 窗口高度 */
  height?: number | string;
  /** 初始位置 */
  x?: number | 'center';
  y?: number | 'center';
  /** 是否可调整大小 */
  resizable?: boolean;
  /** 是否单例 */
  singleton?: boolean;
  /** 所属插件 ID */
  pluginId?: string;
}

/**
 * 窗口实例
 */
interface WindowInstance {
  id: string;
  options: WindowOptions;
  state: WindowState;
  close(): void;
  minimize(): void;
  maximize(): void;
  focus(): void;
}

/**
 * 窗口状态
 */
interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
  focused: boolean;
}

/**
 * 窗口管理器
 */
interface WindowManager {
  open(options: WindowOptions): WindowInstance;
  close(windowId: string): void;
  closeAll(): void;
  get(windowId: string): WindowInstance | undefined;
  getAll(): WindowInstance[];
  focus(windowId: string): void;
}
```

### 4.2 窗口管理器实现

```typescript
// core/window-manager.ts
class WindowManagerImpl implements WindowManager {
  private windows: Map<string, WindowInstance> = new Map();
  private zIndexCounter = 1000;
  
  open(options: WindowOptions): WindowInstance {
    // 单例检查
    if (options.singleton && this.windows.has(options.id)) {
      const existing = this.windows.get(options.id)!;
      existing.focus();
      return existing;
    }
    
    const state: WindowState = {
      x: this.calculateX(options),
      y: this.calculateY(options),
      width: this.parseSize(options.width, 800),
      height: this.parseSize(options.height, 600),
      zIndex: ++this.zIndexCounter,
      minimized: false,
      maximized: false,
      focused: true,
    };
    
    const instance: WindowInstance = {
      id: options.id,
      options,
      state,
      close: () => this.close(options.id),
      minimize: () => this.minimize(options.id),
      maximize: () => this.maximize(options.id),
      focus: () => this.focus(options.id),
    };
    
    this.windows.set(options.id, instance);
    return instance;
  }
  
  close(windowId: string): void {
    this.windows.delete(windowId);
  }
  
  focus(windowId: string): void {
    const window = this.windows.get(windowId);
    if (window) {
      this.windows.forEach((w) => w.state.focused = false);
      window.state.focused = true;
      window.state.zIndex = ++this.zIndexCounter;
    }
  }
  
  // ... 其他方法
}

export const windowManager = new WindowManagerImpl();
```

## 5. 工作流系统设计（精简版）

### 5.1 设计原则

> 先用精简版，后续如果需要可视化编辑器或动态表单再扩展。

### 5.2 工作流类型定义

```typescript
/**
 * 工作流定义（精简版）
 */
interface WorkflowDefinition {
  /** 工作流唯一标识（英文） */
  id: string;
  /** 工作流名称（中文） */
  name: string;
  /** 工作流描述 */
  description?: string;
  /** 工作流图标 */
  icon?: string;
  /** 节点列表（按执行顺序排列） */
  nodes: WorkflowNode[];
}

/**
 * 工作流节点（精简版）
 * 
 * 设计说明：
 * - 移除 config：静态配置应在节点定义（WorkflowNodeDefinition）中
 * - 核心是输入输出：上一个节点的输出作为下一个节点的输入
 */
interface WorkflowNode {
  /** 节点 ID（在工作流内唯一） */
  id: string;
  /** 节点类型（对应节点执行器） */
  type: string;
  /** 节点名称 */
  name?: string;
}

/**
 * 节点定义（插件注册时声明）
 * 
 * 包含节点的静态配置和默认值
 */
interface WorkflowNodeDefinition {
  /** 节点唯一健（英文） */
  id: string;
  /** 节点名称（中文） */
  name?: string;
  /** 节点分类 */
  category?: string;
  /** 节点描述 */
  description?: string;
  /** 节点图标 */
  icon?: string;
  /** 输入端口定义, 当前节点的输入=Object.assign(当前节点输入默认值，前一个节点输出）。 */
  inputs: WorkflowPortDefinition[];
  /** 输出端口定义 */
  outputs: WorkflowPortDefinition[];
}

/**
 * 端口定义
 */
interface WorkflowPortDefinition {
  /** 端口 ID(唯一健，英文) */    
  id: string;
  /** 端口名（中文） */
  name?: string;
  /** 是否必需 */
  required?: boolean;
  /** 默认值，如果是字符串，则支持模板替换，如 ${xxx}，xxx对应当前节点input或前一个节点output的id*/
  default?: any;
  /** 端口描述 */
  description?: string;
}

/**
 * 节点执行器
 * 
 * 核心：input → execute → output
 */
interface WorkflowNodeExecutor {
  /** 执行节点 */
  execute(input: any, context: WorkflowContext): Promise<any>;
  
  /** 取消执行 */
  cancel?(): void;
}

/**
 * 工作流执行上下文
 */
interface WorkflowContext {
  /** 工作流 ID */
  workflowId: string;
  /** 执行 ID */
  executionId: string;
  /** 当前节点 ID */
  nodeId: string;
  /** 取消信号 */
  signal: AbortSignal;
  /** 更新进度 */
  updateProgress?: (progress: number) => void;
  /** 节点定义（包含 defaultConfig） */
  nodeDefinition: WorkflowNodeDefinition;
}
```

### 5.3 数据流转模型

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Input     │ ───► │   Node 1    │ ───► │   Node 2    │ ───► Output
│  (用户输入) │      │  execute()  │      │  execute()  │
└─────────────┘      └─────────────┘      └─────────────┘
                           │                    │
                           ▼                    ▼
                     output1 = input2     output2 = final
```

**核心原则**：
- 每个节点只关心**输入**和**输出**
- 上一个节点的输出自动成为下一个节点的输入
- 静态配置（如默认模型）通过 `context.nodeDefinition.defaultConfig` 获取

### 5.4 工作流示例

```json
// AI 图像生成（单节点）
{
  "id": "ai-image-generation",
  "name": "AI 图像生成",
  "description": "使用 AI 模型生成图像",
  "icon": "image",
  "nodes": [
    { "id": "generate", "type": "ai-image-generate" }
  ]
}

// AI 视频生成（单节点）
{
  "id": "ai-video-generation",
  "name": "AI 视频生成",
  "icon": "video",
  "nodes": [
    { "id": "generate", "type": "ai-video-generate" }
  ]
}

// 多节点示例：图像处理流水线
{
  "id": "image-pipeline",
  "name": "图像处理流水线",
  "icon": "pipeline",
  "nodes": [
    { "id": "resize", "type": "image-resize" },
    { "id": "enhance", "type": "ai-image-enhance" },
    { "id": "watermark", "type": "add-watermark" }
  ]
}
```

**输入输出示例**：

```typescript
// 图像处理流水线的数据流转
const input = { image: userUploadedImage, prompt: "增强图像" };

// Node 1: image-resize
// input: { image, prompt } → output: { image: resizedImage, prompt }

// Node 2: ai-image-enhance  
// input: { image: resizedImage, prompt } → output: { image: enhancedImage }

// Node 3: add-watermark
// input: { image: enhancedImage } → output: { image: finalImage }
```

### 5.5 工作流引擎实现

```typescript
// core/workflow-engine.ts
import { BehaviorSubject } from 'rxjs';

interface WorkflowExecutionState {
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentNodeId?: string;
  progress: number;
  result?: any;
  error?: Error;
}

class WorkflowEngine {
  private nodeExecutors: Map<string, WorkflowNodeExecutor> = new Map();
  private nodeDefinitions: Map<string, WorkflowNodeDefinition> = new Map();
  
  /** 注册节点执行器和定义 */
  registerNode(definition: WorkflowNodeDefinition, executor: WorkflowNodeExecutor): void {
    this.nodeDefinitions.set(definition.type, definition);
    this.nodeExecutors.set(definition.type, executor);
  }
  
  /** 执行工作流 */
  async execute(definition: WorkflowDefinition, input: any): Promise<WorkflowExecution> {
    const execution = new WorkflowExecution(
      `exec-${Date.now()}`,
      definition,
      input,
      this.nodeExecutors,
      this.nodeDefinitions
    );
    execution.start();
    return execution;
  }
}

class WorkflowExecution {
  private state$ = new BehaviorSubject<WorkflowExecutionState>({
    status: 'idle',
    progress: 0,
  });
  private abortController = new AbortController();
  
  constructor(
    public readonly id: string,
    private definition: WorkflowDefinition,
    private input: any,
    private nodeExecutors: Map<string, WorkflowNodeExecutor>,
    private nodeDefinitions: Map<string, WorkflowNodeDefinition>
  ) {}
  
  get state() { return this.state$.getValue(); }
  observeState() { return this.state$.asObservable(); }
  
  async start(): Promise<any> {
    this.updateState({ status: 'running' });
    
    try {
      let currentInput = this.input;
      const nodes = this.definition.nodes;
      
      for (let i = 0; i < nodes.length; i++) {
        if (this.abortController.signal.aborted) {
          throw new Error('Workflow cancelled');
        }
        
        const node = nodes[i];
        this.updateState({
          currentNodeId: node.id,
          progress: (i / nodes.length) * 100,
        });
        
        const executor = this.nodeExecutors.get(node.type);
        const nodeDefinition = this.nodeDefinitions.get(node.type);
        if (!executor || !nodeDefinition) {
          throw new Error(`Node not found: ${node.type}`);
        }
        
        const context: WorkflowContext = {
          workflowId: this.definition.id,
          executionId: this.id,
          nodeId: node.id,
          signal: this.abortController.signal,
          nodeDefinition, // 包含 defaultConfig
        };
        
        // 核心：input → execute → output
        currentInput = await executor.execute(currentInput, context);
      }
      
      this.updateState({ status: 'completed', progress: 100, result: currentInput });
      return currentInput;
    } catch (error) {
      this.updateState({ status: 'failed', error: error as Error });
      throw error;
    }
  }
  
  cancel(): void {
    this.abortController.abort();
    this.updateState({ status: 'cancelled' });
  }
  
  private updateState(partial: Partial<WorkflowExecutionState>): void {
    this.state$.next({ ...this.state, ...partial });
  }
}

export const workflowEngine = new WorkflowEngine();
```

### 5.6 节点执行器示例

```typescript
// 节点定义
const aiImageGenerateDefinition: WorkflowNodeDefinition = {
  type: 'ai-image-generate',
  name: 'AI 图像生成',
  category: 'ai-generation',
  description: '使用 AI 模型生成图像',
  icon: 'image',
  inputs: [
    { name: 'prompt', type: 'text', required: true, description: '图像描述' },
    { name: 'referenceImages', type: 'image', required: false, description: '参考图片' },
  ],
  outputs: [
    { name: 'image', type: 'image', description: '生成的图像' },
  ],
  defaultConfig: {
    model: 'gemini-2.5-flash-image',
    maxWidth: 4096,
    maxHeight: 4096,
  },
};

// 节点执行器
const aiImageGenerateExecutor: WorkflowNodeExecutor = {
  async execute(input, context) {
    const { prompt, referenceImages } = input;
    const { model, maxWidth, maxHeight } = context.nodeDefinition.defaultConfig || {};
    
    // 调用 AI API
    const result = await generateImage({
      prompt,
      referenceImages,
      model,
      maxWidth,
      maxHeight,
    });
    
    // 返回输出
    return { image: result.image };
  },
};

// 注册节点
workflowEngine.registerNode(aiImageGenerateDefinition, aiImageGenerateExecutor);
```

### 5.7 扩展说明

如果未来需要更复杂的场景，可以按需扩展：

| 场景 | 扩展字段 | 说明 |
|------|---------|------|
| 可视化流程编辑器 | `connections` | 显式定义节点间的连接关系 |
| 动态表单生成 | `ui` | 通过 JSON 配置自动生成表单 |
| 条件分支 | `conditions` | 支持 if/else 流程控制 |
| 并行执行 | `parallel` | 支持多节点并行执行 |

## 6. 事件总线设计

```typescript
// core/event-bus.ts
import { Subject, filter, map } from 'rxjs';

type EventMap = {
  'app:ready': void;
  'board:change': { elements: PlaitElement[] };
  'plugin:activated': { pluginId: string };
  'window:opened': { windowId: string };
  'window:closed': { windowId: string };
  'workflow:started': { workflowId: string; executionId: string };
  'workflow:completed': { executionId: string; result: any };
  'workflow:failed': { executionId: string; error: Error };
};

class EventBus {
  private events$ = new Subject<{ type: string; payload: any }>();
  
  emit<K extends keyof EventMap>(type: K, payload: EventMap[K]): void {
    this.events$.next({ type, payload });
  }
  
  on<K extends keyof EventMap>(type: K, handler: (payload: EventMap[K]) => void): () => void {
    const subscription = this.events$
      .pipe(filter(e => e.type === type), map(e => e.payload))
      .subscribe(handler);
    return () => subscription.unsubscribe();
  }
}

export const eventBus = new EventBus();
```

## 7. 迁移策略

### 7.1 迁移阶段

```
阶段 1: 基础设施建设 (2-3 周)
├── 实现 EventBus
├── 实现 PluginManager
├── 实现 WindowManager
└── 实现 WorkflowEngine

阶段 2: 核心功能迁移 (3-4 周)
├── 将 AI 图像生成迁移为插件
├── 将 AI 视频生成迁移为插件
├── 将对话框迁移到 WindowManager
└── 创建内置工作流定义

阶段 3: 完善与优化 (2 周)
├── 添加更多内置节点类型
├── 完善错误处理
└── 性能优化
```

## 8. 目录结构建议

```
packages/drawnix/src/
├── core/                    # 核心模块
│   ├── plugin-manager.ts
│   ├── window-manager.ts
│   ├── workflow-engine.ts
│   ├── event-bus.ts
│   └── index.ts
├── plugins/                 # 内置插件
│   ├── ai-image-generation/
│   ├── ai-video-generation/
│   └── index.ts
├── workflows/               # 内置工作流定义
│   ├── ai-image.json
│   ├── ai-video.json
│   └── index.ts
└── components/              # UI 组件
    ├── window-container/
    └── ...
```

## 9. 总结

新架构设计围绕三个核心系统展开：

1. **插件系统**：标准化的插件接口和生命周期管理
2. **窗口管理系统**：统一管理应用中的所有窗口
3. **工作流系统**：通过 JSON 定义工作流，支持节点扩展

核心优势：
- **高度可扩展**：第三方可以开发独立插件
- **配置化**：工作流通过 JSON 定义
- **松耦合**：各系统通过事件通信
