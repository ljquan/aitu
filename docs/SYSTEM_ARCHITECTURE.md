# 爱图 (Aitu) 系统架构文档

## 1. 项目概述

爱图 (Aitu) 是一款基于 Plait 框架的开源白板应用，支持思维导图、流程图、自由绘画、图片插入以及 AI 驱动的内容生成（图像和视频）。项目采用 Monorepo 架构，使用 Nx 作为构建工具。

### 1.1 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | React 18.3+ with TypeScript |
| 构建工具 | Vite + Nx (Monorepo) |
| UI 组件库 | TDesign React |
| 绘图引擎 | Plait Framework |
| 富文本编辑 | Slate.js |
| 状态管理 | React Context + Hooks + RxJS |
| 样式方案 | Sass + CSS Module |
| 存储方案 | localforage (IndexedDB) |

### 1.2 仓库结构

```
aitu/
├── apps/
│   ├── web/                         # 主 Web 应用
│   │   ├── src/
│   │   │   ├── app/                 # 应用入口和初始化
│   │   │   └── main.tsx             # React 入口文件
│   │   ├── public/                  # 静态资源
│   │   └── index.html               # HTML 入口
│   └── web-e2e/                     # E2E 测试
├── packages/
│   ├── drawnix/                     # 核心白板库 ⭐
│   │   ├── src/
│   │   │   ├── components/          # React 组件
│   │   │   ├── plugins/             # 功能插件
│   │   │   ├── services/            # 业务服务
│   │   │   ├── hooks/               # React Hooks
│   │   │   ├── utils/               # 工具函数
│   │   │   ├── types/               # TypeScript 类型定义
│   │   │   ├── constants/           # 常量定义
│   │   │   └── styles/              # 样式文件
│   ├── react-board/                 # Plait React 适配层
│   │   └── src/
│   │       ├── board.tsx            # Board 组件
│   │       ├── wrapper.tsx          # Wrapper 组件
│   │       ├── hooks/               # Board 相关 Hooks
│   │       └── plugins/             # Board 插件
│   └── react-text/                  # 文本渲染组件
│       └── src/
│           ├── text.tsx             # Text 组件
│           └── plugins/             # 文本插件
├── docs/                            # 开发文档
├── specs/                           # 功能规格文档
└── scripts/                         # 构建脚本
```

## 2. 核心架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           apps/web (应用层)                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        main.tsx / app.tsx                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     packages/drawnix (核心白板库)                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                         Drawnix 组件                              │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │  │
│  │  │  Wrapper   │  │   Board    │  │  Toolbars  │  │  Dialogs   │  │  │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│  ┌─────────────────────────────────┼────────────────────────────────┐  │
│  │                          插件系统                                 │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │  │
│  │  │withMind  │ │withDraw  │ │withFreehand│ │withVideo │ │ ...   │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│  ┌─────────────────────────────────┼────────────────────────────────┐  │
│  │                          服务层                                   │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐  │  │
│  │  │ TaskQueueService│  │GenerationAPI   │  │ MediaCacheService │  │  │
│  │  └────────────────┘  └────────────────┘  └────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    packages/react-board (Plait 适配层)                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Board 组件  │  Wrapper 组件  │  Hooks  │  Plugins               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Plait Framework (底层框架)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │@plait/core│ │@plait/draw│ │@plait/mind│ │@plait/common│ │@plait/...│  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              用户交互                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           事件处理层                                     │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐    │
│  │  键盘事件       │  │  鼠标/触摸事件  │  │  工具栏/菜单事件        │    │
│  │  (with-hotkey)  │  │  (board events) │  │  (toolbar handlers)    │    │
│  └────────────────┘  └────────────────┘  └────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           状态管理层                                     │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    DrawnixContext (React Context)               │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │    │
│  │  │  appState    │  │  board       │  │  setAppState         │  │    │
│  │  │  - pointer   │  │  (PlaitBoard)│  │  (state updater)     │  │    │
│  │  │  - dialogs   │  │              │  │                      │  │    │
│  │  │  - pencilMode│  │              │  │                      │  │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    RxJS Subjects (服务层状态)                    │    │
│  │  ┌──────────────────┐  ┌──────────────────────────────────┐    │    │
│  │  │ TaskQueue State  │  │ Chat Sessions State              │    │    │
│  │  └──────────────────┘  └──────────────────────────────────┘    │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           持久化层                                       │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    localforage (IndexedDB)                      │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │    │
│  │  │  Board Data  │  │  Task Queue  │  │  Media Cache         │  │    │
│  │  │  (auto-save) │  │  (tasks)     │  │  (images/videos)     │  │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## 3. 核心模块详解

### 3.1 Drawnix 主组件

`packages/drawnix/src/drawnix.tsx` 是应用的核心组件，负责：

1. **初始化 Board 实例**：通过 Wrapper 组件创建和管理 PlaitBoard
2. **组合插件**：将各种功能插件组合到 Board 中
3. **提供 Context**：通过 DrawnixContext 向子组件提供状态和方法
4. **渲染 UI 组件**：工具栏、弹窗、浮层等

```typescript
// 插件组合示例
const plugins: PlaitPlugin[] = [
  withDraw,           // 基础绘图
  withGroup,          // 元素分组
  withMind,           // 思维导图
  withMindExtend,     // 思维导图扩展
  withCommonPlugin,   // 通用功能
  buildDrawnixHotkeyPlugin(updateAppState),  // 快捷键
  withFreehand,       // 自由绘画
  buildPencilPlugin(updateAppState),         // 画笔模式
  buildTextLinkPlugin(updateAppState),       // 文本链接
  withVideo,          // 视频支持
  withTracking,       // 埋点追踪
];
```

### 3.2 插件系统

当前的插件系统采用 **函数组合模式**（Composition Pattern），每个插件是一个高阶函数，接收 Board 实例并返回增强后的 Board。

#### 3.2.1 插件类型

| 插件 | 文件 | 功能 |
|------|------|------|
| withDraw | @plait/draw | 基础图形绘制 |
| withMind | @plait/mind | 思维导图 |
| withFreehand | with-freehand.ts | 自由绘画 |
| withVideo | with-video.ts | 视频元素支持 |
| withHotkey | with-hotkey.ts | 快捷键处理 |
| withPencil | with-pencil.ts | 画笔/橡皮擦模式 |
| withTextLink | with-text-link.tsx | 文本链接功能 |
| withTracking | tracking/ | 埋点追踪 |

#### 3.2.2 插件实现模式

```typescript
// 典型的插件实现模式
export const buildDrawnixHotkeyPlugin = (
  updateAppState: (appState: Partial<DrawnixState>) => void
) => {
  const withDrawnixHotkey = (board: PlaitBoard) => {
    // 保存原有方法
    const { globalKeyDown, keyDown } = board;
    
    // 扩展方法
    board.globalKeyDown = (event: KeyboardEvent) => {
      // 自定义处理逻辑
      if (isHotkey(['mod+s'])(event)) {
        saveAsJSON(board);
        event.preventDefault();
        return;
      }
      // 调用原有方法
      globalKeyDown(event);
    };
    
    return board;
  };
  return withDrawnixHotkey;
};
```

### 3.3 服务层

服务层采用 **单例模式** + **RxJS 响应式架构**，主要服务包括：

#### 3.3.1 TaskQueueService

任务队列服务，管理 AI 生成任务的生命周期：

```typescript
class TaskQueueService {
  private static instance: TaskQueueService;
  private tasks: Map<string, Task>;
  private taskUpdates$: Subject<TaskEvent>;
  
  // 单例模式
  static getInstance(): TaskQueueService { ... }
  
  // 任务管理
  createTask(params: GenerationParams, type: TaskType): Task { ... }
  updateTaskStatus(taskId: string, status: TaskStatus): void { ... }
  cancelTask(taskId: string): void { ... }
  retryTask(taskId: string): void { ... }
  
  // 响应式订阅
  observeTaskUpdates(): Observable<TaskEvent> { ... }
}
```

#### 3.3.2 其他服务

| 服务 | 职责 |
|------|------|
| GenerationAPIService | AI 图像生成 API 调用 |
| VideoAPIService | AI 视频生成 API 调用 |
| MediaCacheService | 媒体文件缓存（IndexedDB） |
| ChatService | AI 对话服务 |
| ChatStorageService | 对话历史持久化 |
| StorageService | 通用存储服务 |
| URLCacheService | URL 响应缓存 |

### 3.4 组件层

#### 3.4.1 工具栏组件

```
toolbar/
├── unified-toolbar.tsx      # 统一工具栏容器
├── app-toolbar/             # 应用工具（菜单、撤销、重做）
├── creation-toolbar.tsx     # 创作工具（形状、画笔、AI）
├── zoom-toolbar.tsx         # 缩放工具
├── theme-toolbar.tsx        # 主题切换
├── popup-toolbar/           # 弹出式工具栏（选中元素时）
├── freehand-panel/          # 自由绘画面板
└── extra-tools/             # 额外工具
```

#### 3.4.2 对话框组件

```
ttd-dialog/                  # Text-to-Diagram 对话框
├── ttd-dialog.tsx           # 主对话框容器
├── ai-image-generation.tsx  # AI 图像生成
├── ai-video-generation.tsx  # AI 视频生成
├── markdown-to-drawnix.tsx  # Markdown 转思维导图
├── mermaid-to-drawnix.tsx   # Mermaid 转流程图
└── shared/                  # 共享组件
```

#### 3.4.3 WinBox 窗口系统

项目使用 WinBox 库实现类桌面应用的窗口体验：

```typescript
// WinBoxWindow 组件封装
<WinBoxWindow
  visible={isOpen}
  title="AI 图像生成"
  onClose={handleClose}
  width="60%"
  height="60%"
  modal={false}
  minimizable={false}
  headerContent={<ModelSelector />}
>
  <AIImageGeneration />
</WinBoxWindow>
```

### 3.5 状态管理

#### 3.5.1 DrawnixContext

```typescript
export type DrawnixState = {
  pointer: DrawnixPointerType;       // 当前指针类型
  isMobile: boolean;                 // 是否移动端
  isPencilMode: boolean;             // 画笔模式
  openDialogType: DialogType | null; // 打开的对话框类型
  dialogInitialData?: DialogInitialData;  // 对话框初始数据
  openCleanConfirm: boolean;         // 清空确认弹窗
  openSettings: boolean;             // 设置弹窗
  linkState?: LinkState;             // 链接编辑状态
  lastSelectedElementIds?: string[]; // 最近选中的元素
};

export const DrawnixContext = createContext<{
  appState: DrawnixState;
  setAppState: (appState: DrawnixState) => void;
  board: DrawnixBoard | null;
} | null>(null);
```

#### 3.5.2 Hooks

| Hook | 功能 |
|------|------|
| useDrawnix | 获取 Drawnix 上下文 |
| useBoard | 获取 Board 实例 |
| useTaskQueue | 任务队列状态 |
| useTaskExecutor | 任务执行器 |
| useTaskStorage | 任务持久化 |
| useMediaCache | 媒体缓存 |
| useChatSessions | 对话会话管理 |
| useGenerationHistory | 生成历史 |

## 4. 关键流程

### 4.1 AI 图像生成流程

```
用户点击 AI 图像生成
        │
        ▼
┌───────────────────┐
│  打开 TTDDialog   │
│  (WinBox 窗口)    │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  处理选中内容      │
│  - 提取图片       │
│  - 提取文本       │
│  - 处理图形元素   │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  用户输入参数      │
│  - 提示词         │
│  - 参考图片       │
│  - 尺寸/模型      │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  创建任务         │
│  TaskQueueService │
│  .createTask()    │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  任务执行器处理    │
│  useTaskExecutor  │
│  - 调用 API      │
│  - 更新进度      │
│  - 处理结果      │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  结果处理         │
│  - 缓存媒体      │
│  - 显示预览      │
│  - 插入画布      │
└───────────────────┘
```

### 4.2 插件加载流程

```
Drawnix 组件初始化
        │
        ▼
┌───────────────────┐
│  定义插件列表      │
│  plugins = [...]  │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Wrapper 组件     │
│  initializeBoard  │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  基础 Board 创建   │
│  withBoard(       │
│    withOptions(   │
│      createBoard  │
│    )              │
│  )                │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  依次应用插件      │
│  plugins.forEach( │
│    plugin =>      │
│    board=plugin(  │
│      board)       │
│  )                │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Board 初始化完成  │
│  afterInit(board) │
└───────────────────┘
```

## 5. 现有架构的特点与局限

### 5.1 优点

1. **插件化设计**：功能通过插件扩展，便于维护和测试
2. **响应式架构**：使用 RxJS 实现事件驱动的状态管理
3. **类型安全**：TypeScript 提供完整的类型支持
4. **分层清晰**：UI 层、服务层、数据层职责分明
5. **持久化支持**：IndexedDB 提供可靠的本地存储

### 5.2 局限性

1. **插件系统耦合度高**：
   - 插件直接修改 Board 实例，难以实现运行时动态加载/卸载
   - 插件之间可能存在隐式依赖

2. **缺乏统一的窗口管理**：
   - WinBox 窗口独立管理，没有统一的窗口注册和生命周期管理
   - 难以实现多窗口协同

3. **工作流能力缺失**：
   - AI 生成流程硬编码在组件中
   - 无法通过配置定制不同的生成流程

4. **扩展性受限**：
   - 新增功能需要修改核心代码
   - 第三方难以开发独立插件

## 6. 附录

### 6.1 关键文件索引

| 文件 | 说明 |
|------|------|
| `packages/drawnix/src/drawnix.tsx` | 主组件 |
| `packages/drawnix/src/hooks/use-drawnix.tsx` | 核心 Context 和 Hooks |
| `packages/react-board/src/wrapper.tsx` | Board 初始化和插件加载 |
| `packages/react-board/src/board.tsx` | Board 渲染组件 |
| `packages/drawnix/src/services/task-queue-service.ts` | 任务队列服务 |
| `packages/drawnix/src/components/ttd-dialog/ttd-dialog.tsx` | AI 对话框 |
| `packages/drawnix/src/components/winbox/WinBoxWindow.tsx` | 窗口组件 |

### 6.2 依赖关系图

```
@plait/core ──────────────────────────────────────────┐
     │                                                │
     ▼                                                │
@plait/draw ─────┐                                    │
@plait/mind ─────┼──► packages/react-board ──────────┤
@plait/common ───┘           │                        │
                             │                        │
                             ▼                        │
                    packages/drawnix ◄────────────────┘
                             │
                             ▼
                        apps/web
```
