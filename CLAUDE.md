# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指导。

---

## 项目概述

**Aitu (爱图)** 是一个基于 Plait 框架构建的开源白板应用。支持思维导图、流程图、自由绘画、图片插入，以及 AI 驱动的内容生成（通过 Gemini 生成图片，通过 Veo3/Sora-2 生成视频）。项目采用插件架构，使用 React 组件，并使用 Nx 作为 monorepo 管理工具。

**项目信息：**
- **名称**: Aitu (爱图) - AI 图片与视频创作工具
- **版本**: 0.5.0
- **许可证**: MIT
- **标语**: 爱上图片，爱上创作
- **官网**: https://aitu.tu-zi.com

---

## 开发命令

### 基础命令
```bash
pnpm start              # 启动开发服务器 (localhost:7200)
pnpm run build          # 构建所有包
pnpm run build:web      # 仅构建 Web 应用
pnpm test               # 运行所有测试
nx test <项目名>        # 运行特定项目的测试
nx lint <项目名>        # 检查特定项目的代码规范
nx typecheck <项目名>   # 类型检查特定项目
```

### 版本与发布
```bash
pnpm run version:patch  # 升级补丁版本 (0.0.x)
pnpm run version:minor  # 升级次版本 (0.x.0)
pnpm run version:major  # 升级主版本 (x.0.0)
pnpm run release        # 构建并打包补丁版本
pnpm run release:minor  # 构建并打包次版本
pnpm run release:major  # 构建并打包主版本
```

### Claude Code 命令
```bash
/update-claude-md       # 智能更新 CLAUDE.md 文档
/auto-commit            # 自动分析并提交代码变更
```

**update-claude-md 命令**：
- 用途：添加新功能、插件或组件后自动更新文档
- 更新内容：插件列表、组件列表、功能说明、相关文档链接
- 详细说明：`/docs/UPDATE_CLAUDE_MD_COMMAND.md`

---

## 项目架构

### 整体目录结构

```
aitu/
├── apps/                          # 应用程序
│   ├── web/                       # 主 Web 应用
│   └── web-e2e/                   # E2E 端到端测试
├── packages/                      # 共享包库
│   ├── drawnix/                   # 核心白板库 (362+ TypeScript 文件)
│   ├── react-board/               # Plait React 适配层
│   └── react-text/                # 文本编辑渲染组件
├── docs/                          # 项目文档
├── scripts/                       # 构建脚本
├── openspec/                      # OpenSpec 规范文档
├── specs/                         # 功能规格说明
└── 配置文件
```

---

## Apps 应用程序

### Web 应用 (`apps/web/`)

主入口应用，负责 UI 界面和用户交互。

```
apps/web/
├── src/
│   ├── main.tsx                   # 应用入口
│   ├── app/
│   │   ├── app.tsx                # 主应用组件
│   │   ├── initialize-data.ts     # 初始化数据
│   │   └── init.json              # 初始数据配置
│   ├── assets/                    # 静态资源
│   └── styles.scss                # 全局样式
├── public/                        # 公共资源
│   ├── product_showcase/          # 产品展示图片
│   └── version.json               # 版本信息
├── index.html                     # 入口 HTML
└── vite.config.ts                 # Vite 配置
```

**主要功能：**
- 启动 Drawnix 编辑器组件
- 管理工作空间 (Workspace) 和画板 (Board)
- 处理项目初始化和数据迁移
- Service Worker 注册用于 PWA 支持

### E2E 测试 (`apps/web-e2e/`)

端到端测试，使用 Playwright 框架验证应用功能。

---

## Packages 核心包

### Drawnix 包 (`packages/drawnix/`) - 核心库

Aitu 的核心白板应用库，包含所有编辑器功能和业务逻辑。

#### 目录结构

```
packages/drawnix/
├── src/
│   ├── drawnix.tsx                # 主编辑器组件
│   ├── components/                # UI 组件 (43个子目录)
│   ├── services/                  # 业务逻辑服务 (32个服务)
│   ├── plugins/                   # 功能插件 (15个插件)
│   ├── hooks/                     # React Hooks (27个)
│   ├── useWorkflowSubmission.ts  # 工作流提交（核心）
│   ├── useAutoInsertToCanvas.ts  # 自动插入画布
│   ├── utils/                     # 工具函数 (33个模块)
│   ├── types/                     # TypeScript 类型定义 (14个)
│   ├── constants/                 # 常量定义 (13个)
│   ├── contexts/                  # React Context (3个)
│   ├── styles/                    # SCSS 样式文件
│   ├── mcp/                       # MCP 工具系统
│   ├── engine/                    # 引擎文件
│   ├── transforms/                # 数据转换
│   ├── data/                      # 数据文件
│   └── i18n.tsx                   # 国际化配置
└── package.json
```

#### 核心组件 (`components/`)

```
components/
├── ai-input-bar/                  # AI 输入条
│   ├── AIInputBar.tsx             # 主组件
│   ├── ModelDropdown.tsx          # 模型下拉选择器
│   ├── SizeDropdown.tsx           # 尺寸下拉选择器
│   └── PromptHistoryPopover.tsx   # 历史提示词悬浮面板
├── inspiration-board/             # 灵感创意板块
│   ├── InspirationBoard.tsx       # 主组件（画板为空时显示）
│   ├── InspirationCard.tsx        # 模版卡片
│   └── constants.ts               # 模版数据
├── chat-drawer/                   # 聊天抽屉
│   ├── ChatDrawer.tsx             # 主组件
│   ├── SessionList.tsx            # 会话列表
│   ├── SessionItem.tsx            # 会话项
│   └── MermaidRenderer.tsx        # Mermaid 渲染器
├── workzone-element/              # WorkZone 画布元素
│   ├── WorkZoneContent.tsx        # 工作流进度显示组件
│   └── workzone-content.scss      # 样式文件
├── media-library/                 # 媒体库 (22个子组件)
├── toolbar/                       # 工具栏
│   ├── UnifiedToolbar/            # 主创建工具栏
│   ├── PopupToolbar/              # 上下文弹出工具
│   └── ClosePencilToolbar/        # 铅笔模式工具栏
├── ttd-dialog/                    # AI 生成对话框
│   ├── ai-image-generation.tsx    # 图片生成
│   ├── ai-video-generation.tsx    # 视频生成
│   ├── batch-image-generation.tsx # 批量图片生成
│   ├── mermaid-to-drawnix.tsx     # Mermaid 转换
│   └── shared/                    # 共享组件
│       └── ReferenceImageUpload.tsx # 统一参考图上传组件
├── settings-dialog/               # 设置对话框
├── project-drawer/                # 项目抽屉
├── task-queue/                    # 任务队列 UI
│   └── VirtualTaskList.tsx        # 虚拟任务列表（支持分页和虚拟滚动）
├── lazy-image/                    # 懒加载图片组件
│   └── LazyImage.tsx              # 基于 IntersectionObserver 的图片懒加载
├── video-frame-selector/          # 视频帧选择器
├── generation-history/            # 生成历史
├── minimap/                       # 小地图
├── icons.tsx                      # 图标库
└── ...其他组件
```

#### 业务服务 (`services/`)

```
services/
├── generation-api-service.ts      # AI 生成 API 服务 (Gemini)
├── video-api-service.ts           # 视频 API 服务 (Veo3/Sora-2)
├── task-queue-service.ts          # 任务队列管理
├── workflow-submission-service.ts # 工作流提交服务
├── workspace-service.ts           # 工作空间管理
├── storage-service.ts             # 存储服务
├── chat-service.ts                # 聊天服务
├── chat-storage-service.ts        # 聊天持久化
├── character-api-service.ts       # 角色 API
├── asset-storage-service.ts       # 资产存储
├── unified-cache-service.ts       # 统一缓存服务（协调 SW Cache + IndexedDB）
├── media-cache-service.ts         # 媒体缓存 (IndexedDB)
├── url-cache-service.ts           # URL 缓存
├── toolbar-config-service.ts      # 工具栏配置
├── prompt-storage-service.ts      # 历史提示词存储
├── font-manager-service.ts        # 字体管理服务（加载和缓存）
├── backup-restore-service.ts      # 备份恢复服务
├── sw-capabilities/               # SW 能力处理
│   └── handler.ts                 # 思维导图/流程图生成处理
├── tracking/                      # 追踪服务
└── ...其他服务
```

#### 功能插件 (`plugins/`)

采用 `withXxx` 模式的组合式插件系统：

```
plugins/
├── with-tool.ts                   # 工具基础插件
├── with-hotkey.ts                 # 快捷键处理
├── with-pencil.ts                 # 铅笔/橡皮模式
├── with-image.tsx                 # 图片插件
├── with-text-paste.ts             # 文本粘贴插件（自动换行）
├── with-video.ts                  # 视频支持
├── with-workzone.ts               # WorkZone 画布元素插件
├── with-mind-extend.tsx           # 思维导图扩展
├── with-text-link.tsx             # 文本链接
├── with-common.tsx                # 通用插件（注册 image + text-paste）
├── with-tool-focus.ts             # 工具焦点
├── with-tool-resize.ts            # 工具调整大小
├── freehand/                      # 自由绘画插件
│   └── with-freehand.ts
└── tracking/                      # 数据追踪插件
```

#### React Hooks (`hooks/`)

```
hooks/
├── useWorkspace.ts                # 工作空间管理
├── useWorkflowSubmission.ts       # 工作流提交（核心）
├── useTaskExecutor.ts             # 任务执行器 (核心)
├── useChatHandler.ts              # 聊天处理
├── useAutoInsertToCanvas.ts       # 自动插入画布（更新工作流步骤状态）
├── useTextSelection.ts            # 文本选择
├── useTaskQueue.ts                # 任务队列
├── useTaskStorage.ts              # 任务存储
├── useGenerationHistory.ts        # 生成历史
├── usePromptHistory.ts            # 历史提示词管理
├── useSmartInput.ts               # 智能输入
├── useChatSessions.ts             # 聊天会话
├── useCharacters.ts               # 角色管理
├── useMention.ts                  # @提及功能
├── useMediaCache.ts               # 媒体缓存
├── useViewportScale.ts            # 视口缩放
├── useInfinitePagination.ts       # 无限滚动分页
├── useVirtualList.ts              # 虚拟列表（封装 @tanstack/react-virtual）
├── useImageLazyLoad.ts            # 图片懒加载
└── ...其他 Hooks
```

#### 工具函数 (`utils/`)

```
utils/
├── gemini-api/                    # Google Gemini API 客户端
│   ├── client.ts                  # 核心客户端
│   ├── apiCalls.ts                # API 调用
│   ├── auth.ts                    # 认证
│   ├── config.ts                  # 配置
│   └── types.ts                   # 类型定义
├── settings-manager.ts            # 设置管理
├── image-splitter.ts              # 图片分割（支持透明边框严格裁剪）
├── image-border-utils.ts          # 图片边框检测和裁剪工具
├── photo-wall-splitter.ts         # 灵感图分割器
├── selection-utils.ts             # 选择工具（含元素转图片）
├── model-parser.ts                # 模型解析
├── download-utils.ts              # 下载工具
├── ai-input-parser.ts             # AI 输入解析
├── posthog-analytics.ts           # 分析追踪
├── color.ts                       # 颜色工具
├── logger.ts                      # 日志工具
└── ...其他工具
```

#### 类型定义 (`types/`)

```
types/
├── task.types.ts                  # 任务类型定义
├── chat.types.ts                  # 聊天类型
├── workzone.types.ts              # WorkZone 画布元素类型
├── photo-wall.types.ts            # 照墙类型
├── asset.types.ts                 # 资产类型
├── character.types.ts             # 角色类型
├── video.types.ts                 # 视频类型
├── toolbar-config.types.ts        # 工具栏配置
└── tracking.types.ts              # 追踪类型
```

#### 常量定义 (`constants/`)

```
constants/
├── TASK_CONSTANTS.ts              # 任务常量
├── CHAT_CONSTANTS.ts              # 聊天常量
├── CHAT_MODELS.ts                 # 聊天模型配置
├── model-config.ts                # 模型配置
├── video-model-config.ts          # 视频模型配置
├── image-aspect-ratios.ts         # 图片宽高比
├── built-in-tools.ts              # 内置工具
├── prompts.ts                     # 提示词
└── storage.ts                     # 存储常量
```

---

### React Board 包 (`packages/react-board/`)

Plait 框架的 React 视图适配层。

```
packages/react-board/
├── src/
│   ├── board.tsx                  # 主 Board 组件
│   ├── wrapper.tsx                # Wrapper 包装器
│   ├── hooks/                     # React Hooks
│   ├── plugins/                   # 插件
│   └── styles/                    # 样式文件
└── package.json
```

---

### React Text 包 (`packages/react-text/`)

文本编辑和渲染组件库，基于 Slate.js。

```
packages/react-text/
├── src/
│   ├── text.tsx                   # 主 Text 组件
│   ├── custom-types.ts            # 自定义类型
│   ├── plugins/                   # Slate 插件
│   └── styles/                    # 样式文件
└── package.json
```

---

## 技术栈

### 前端框架
- **React**: 18.3.1
- **TypeScript**: ~5.4.2
- **Vite**: ^6.2.2

### 构建工具
- **Nx**: 19.3.0 (Monorepo 管理)
- **SWC**: ~1.5.7 (快速编译)
- **pnpm**: 包管理器

### UI 框架
- **TDesign React**: ^1.14.5 (企业级 UI 组件库)
- **Lucide React**: 图标库
- **Floating UI**: ^0.26.24 (浮层定位)
- **Tailwind CSS**: ^4.1.17

### 绘图框架
- **Plait Framework**: ^0.84.0
  - @plait/core
  - @plait/draw
  - @plait/mind
  - @plait/text-plugins
  - @plait/layouts
- **Slate.js**: ^0.116.0 (富文本编辑)
- **RoughJS**: ^4.6.6 (手绘风格渲染)
- **Mermaid**: ^11.12.2 (图表渲染)

### AI 与 API
- **Google Gemini API**: 图片生成
- **视频生成**: Veo3, Sora-2
- **LlamaIndex**: ^0.6.1

### 媒体处理
- **FFmpeg.wasm**: ^0.12.15 (视频处理)
- **jszip**: ^3.10.1
- **XLSX**: ^0.18.5

### 状态管理
- **React Context + Hooks**
- **RxJS**: ~7.8.0 (响应式编程)
- **LocalForage**: ^1.10.0 (本地存储/IndexedDB)

### 工具库
- **Lodash**: ^4.17.21
- **Ahooks**: ^3.8.0 (React Hooks 库)
- **TanStack Virtual**: ^3.13.13 (虚拟滚动)

### 测试
- **Vitest**: ^3.0.8
- **Playwright**: ^1.36.0
- **@testing-library/react**: 15.0.6

---

## 状态管理

### React Context (`DrawnixContext`)
- 指针模式 (手型、选择、绘图工具)
- 移动端检测和响应式行为
- 对话框和模态框状态
- 铅笔模式切换

### RxJS Subjects
- 任务队列状态
- 聊天会话管理
- 服务级别的响应式状态

### LocalForage 持久化存储
- 画板数据自动保存
- 任务队列状态
- 媒体缓存
- 聊天会话和消息

### 素材库数据来源
素材库（AssetContext）合并两个数据来源展示：

1. **本地上传的素材**：存储在 IndexedDB 中（通过 `asset-storage-service.ts`）
2. **AI 生成的素材**：直接从任务队列读取已完成的任务（通过 `task-queue-service.ts`）

**数据流**：
```
素材库展示：
├── 本地上传素材 ← IndexedDB (asset-storage-service)
└── AI 生成素材 ← 任务队列 (task-queue-service) 已完成的任务

删除素材：
├── 本地素材 → assetStorageService.removeAsset()
└── AI 素材 → taskQueueService.deleteTask()
```

**设计原则**：
- AI 生成的素材不重复存储，直接使用任务结果中的原始 URL
- 只有本地上传的素材才使用 `/asset-library/` 前缀的 URL
- `loadAssets` 方法合并两个来源的数据，按创建时间倒序排列

---

## 核心功能流程

### AI 生成流程（Service Worker 模式）

项目使用 Service Worker 作为后台任务执行器，实现页面刷新不影响任务执行。

```
用户输入
  ↓
AIInputBar (输入组件)
  ↓
swTaskQueueService.createTask() (应用层)
  ↓ postMessage
Service Worker (后台)
  ├── SWTaskQueue.submitTask() (任务管理)
  ├── ImageHandler / VideoHandler (执行器)
  └── taskQueueStorage (IndexedDB 持久化)
  ↓ broadcastToClients
应用层接收状态更新
  ↓
Canvas 插入 / 媒体库缓存
```

**核心特性**：
- **页面刷新恢复**：任务状态持久化到 IndexedDB，刷新后自动恢复
- **多标签页同步**：通过 `broadcastToClients` 向所有标签页广播状态
- **视频任务恢复**：通过 `remoteId` 恢复轮询，继续等待视频生成完成

### Service Worker 任务队列架构

```
apps/web/src/sw/
├── index.ts                       # SW 主入口
└── task-queue/
    ├── queue.ts                   # 任务队列核心 (SWTaskQueue)
    ├── storage.ts                 # IndexedDB 存储 (TaskQueueStorage)
    ├── types.ts                   # 类型定义
    ├── handlers/                  # 任务处理器
    │   ├── image.ts               # 图片生成处理器
    │   ├── video.ts               # 视频生成处理器
    │   ├── character.ts           # 角色生成处理器
    │   └── chat.ts                # 聊天处理器
    ├── workflow-executor.ts       # 工作流执行器
    ├── workflow-types.ts          # 工作流类型
    ├── chat-workflow/             # 聊天工作流
    │   ├── executor.ts            # 聊天工作流执行器
    │   └── types.ts               # 聊天工作流类型
    ├── mcp/                       # MCP 工具系统
    │   ├── tools.ts               # 工具注册
    │   └── executor.ts            # 工具执行器
    └── utils/
        └── index.ts               # 工具函数导出
```

**应用层服务**：
```
packages/drawnix/src/services/
├── sw-client/
│   ├── client.ts                  # SW 通信客户端 (SWTaskQueueClient)
│   ├── types.ts                   # 消息类型定义
│   └── index.ts                   # 导出
├── sw-task-queue-service.ts       # SW 任务队列服务
├── sw-chat-service.ts             # SW 聊天服务
├── sw-chat-workflow-service.ts    # SW 聊天工作流服务
└── task-queue/
    └── index.ts                   # 任务队列入口（自动选择 SW/传统模式）
```

**通信协议**：
```typescript
// 应用层 → Service Worker
type MainToSWMessage =
  | { type: 'TASK_QUEUE_INIT'; geminiConfig; videoConfig }
  | { type: 'TASK_SUBMIT'; taskId; taskType; params }
  | { type: 'TASK_CANCEL'; taskId }
  | { type: 'TASK_RETRY'; taskId }
  | { type: 'TASK_GET_ALL' }
  | { type: 'CHAT_START'; chatId; params }
  | { type: 'WORKFLOW_SUBMIT'; workflow }
  // ...

// Service Worker → 应用层
type SWToMainMessage =
  | { type: 'TASK_CREATED'; task }
  | { type: 'TASK_STATUS'; taskId; status; progress }
  | { type: 'TASK_COMPLETED'; taskId; result }
  | { type: 'TASK_FAILED'; taskId; error; retryCount }
  | { type: 'WORKFLOW_STEP_STATUS'; workflowId; stepId; status }
  // ...
```

**IndexedDB 存储结构**：
- `tasks` - 任务数据（图片/视频/角色生成）
- `config` - API 配置（apiKey, baseUrl）
- `workflows` - 工作流数据
- `chat-workflows` - 聊天工作流数据
- `pending-tool-requests` - 待处理的主线程工具请求

**任务生命周期**：
```
PENDING → PROCESSING → COMPLETED
                    ↘ FAILED
                    ↘ CANCELLED
```

**使用示例**：
```typescript
import { taskQueueService } from '../services/task-queue';

// 创建任务
const task = taskQueueService.createTask(
  { prompt: '生成一张日落图片', size: '1:1' },
  TaskType.IMAGE
);

// 监听任务更新
taskQueueService.observeTaskUpdates().subscribe((event) => {
  if (event.type === 'taskUpdated' && event.task.status === TaskStatus.COMPLETED) {
    console.log('任务完成:', event.task.result?.url);
  }
});
```

### 编辑器插件系统
```
Drawnix (主编辑器)
  ├── Plait Board (绘图核心)
  └── Plugins
      ├── withTool (工具系统)
      ├── withFreehand (自由画)
      ├── withMind (思维导图)
      ├── withDraw (基础绘图)
      ├── withHotkey (快捷键)
      ├── withTextLink (文本链接)
      ├── withTextPaste (文本粘贴)
      ├── withImage (图片粘贴)
      ├── withVideo (视频支持)
      ├── withWorkZone (工作流进度)
      └── ...
```

### 工作流提交机制

项目使用统一的工作流提交机制，避免重复创建工作流导致的问题。

**核心文件**：
- `hooks/useWorkflowSubmission.ts` - 工作流提交 Hook
- `components/ai-input-bar/workflow-converter.ts` - 工作流转换器
- `services/workflow-submission-service.ts` - 工作流提交服务

**工作流程**：
```
AIInputBar 创建工作流
  ↓
convertToWorkflow() - 创建 LegacyWorkflowDefinition（唯一 ID）
  ↓
submitWorkflowToSW(parsedParams, referenceImages, retryContext, existingWorkflow)
  ↓
useWorkflowSubmission.submitWorkflow() - 复用已有工作流，避免重复创建
  ↓
workflowSubmissionService.submit() - 提交到 SW
  ↓
SW WorkflowExecutor 执行
```

**关键设计**：
- `submitWorkflow` 接受可选的 `existingWorkflow` 参数
- 如果传入 `existingWorkflow`，直接使用而不重新创建
- 避免因重复调用 `convertToWorkflow` 导致不同 ID 的工作流

**API 签名**：
```typescript
submitWorkflow: (
  parsedInput: ParsedGenerationParams,
  referenceImages: string[],
  retryContext?: WorkflowRetryContext,
  existingWorkflow?: LegacyWorkflowDefinition
) => Promise<{ workflowId: string; usedSW: boolean }>
```

### WorkZone 画布元素

WorkZone 是一个特殊的画布元素，用于在画布上直接显示 AI 生成任务的工作流进度。

**核心文件**：
- `plugins/with-workzone.ts` - Plait 插件，注册 WorkZone 元素类型
- `components/workzone-element/WorkZoneContent.tsx` - React 渲染组件
- `types/workzone.types.ts` - 类型定义

**工作流程**：
```
AIInputBar 提交生成任务
  ↓
创建 WorkZone 元素到画布 (WorkZoneTransforms.insertWorkZone)
  ↓
WorkflowContext 更新工作流状态
  ↓
WorkZoneContent 组件响应更新，显示进度
  ↓
任务完成/失败后可删除 WorkZone
```

**关键 API**：
- `WorkZoneTransforms.insertWorkZone(board, options)` - 创建 WorkZone
- `WorkZoneTransforms.updateWorkflow(board, id, workflow)` - 更新工作流状态
- `WorkZoneTransforms.removeWorkZone(board, id)` - 删除 WorkZone

**AI 生成完成事件**：
当所有工作流步骤完成后，会触发 `ai-generation-complete` 事件：
```typescript
window.dispatchEvent(new CustomEvent('ai-generation-complete', {
  detail: { type: 'image' | 'mind' | 'flowchart', success: boolean, workzoneId: string }
}));
```
- 思维导图/流程图：在 `sw-capabilities/handler.ts` 中触发
- 图片生成：在 `useAutoInsertToCanvas.ts` 的 `updateWorkflowStepForTask` 中触发
- `AIInputBar` 监听此事件来重置 `isSubmitting` 状态

**技术要点**：
- 使用 SVG `foreignObject` 在画布中嵌入 React 组件
- 使用 XHTML 命名空间确保 DOM 元素正确渲染
- 需要在 `pointerdown` 阶段阻止事件冒泡，避免 Plait 拦截点击事件
- WorkZone 元素被选中时不触发 popup-toolbar（在 `popup-toolbar.tsx` 中过滤）
- AIInputBar 发送工作流时不自动展开 ChatDrawer（通过 `autoOpen: false` 参数控制）

**位置策略**（按优先级）：
1. **有选中元素** → 放在选中元素下方（左对齐）
2. **无选中元素** → 放在最底部元素下方（左对齐）
3. **画布为空** → 放在视口中心

**选中框缩放**：
- 选中框大小根据 `zoom` 属性自动调整，与缩放后的内容匹配
- 使用 `activeGenerator` 的 `getRectangle` 计算缩放后的矩形

**自动滚动**：
- 使用 `scrollToPointIfNeeded` 函数智能滚动
- WorkZone 不在视口内时自动滚动到中心位置
- WorkZone 已在视口内时不滚动（避免干扰用户）


### 灵感创意板块 (InspirationBoard)

当画板为空时，在 AI 输入框上方显示灵感创意板块，帮助用户快速开始创作。

**核心文件**：
- `components/inspiration-board/InspirationBoard.tsx` - 主组件
- `components/inspiration-board/InspirationCard.tsx` - 模版卡片组件
- `components/inspiration-board/constants.ts` - 模版数据配置

**功能特点**：
- 画板为空时自动显示，有内容时隐藏
- 3x2 网格布局展示创意模版
- 支持分页浏览更多模版
- 点击模版自动填充提示词到输入框
- 提供"提示词"快捷按钮，可打开香蕉提示词工具

**数据加载状态管理 (`isDataReady`)**：

为了避免在画布数据加载完成前误判画布为空（导致灵感板闪烁），项目使用 `isDataReady` 状态来标识数据是否已准备好。

**数据流**：
```
app.tsx (isDataReady state)
  ↓ setValue 完成后 setIsDataReady(true)
  ↓ prop
drawnix.tsx (isDataReady prop)
  ↓ prop
DrawnixContent (isDataReady prop)
  ↓ prop
AIInputBar (isDataReady prop)
  ↓ prop
SelectionWatcher (isDataReady prop)
  ↓
只有 isDataReady=true 时才检查画布是否为空
```

**关键逻辑**：
- `app.tsx`：初始 `isDataReady = false`，在 `setValue` 完成后（`finally` 块中）设置为 `true`
- `SelectionWatcher`：只有当 `isDataReady` 为 `true` 时才开始检查画布是否为空
- 避免在数据加载前误判画布为空，防止灵感板闪烁

### 历史提示词功能

支持记录和管理用户的历史提示词，方便快速复用。

**核心文件**：
- `services/prompt-storage-service.ts` - 存储服务（localStorage）
- `hooks/usePromptHistory.ts` - React Hook
- `components/ai-input-bar/PromptHistoryPopover.tsx` - UI 组件

**功能特点**：
- 自动保存用户发送的提示词（无数量限制，使用 IndexedDB 存储）
- 支持置顶/取消置顶常用提示词
- 鼠标悬浮三点图标显示历史列表
- 点击历史提示词回填到输入框
- 支持删除单条历史记录

**API 示例**：
```typescript
const { history, addHistory, removeHistory, togglePinHistory } = usePromptHistory();

// 添加历史
addHistory('生成一张日落风景图', hasSelection);

// 置顶/取消置顶
togglePinHistory(itemId);
```

### 文本粘贴功能

支持智能文本粘贴到画布，自动控制文本宽度避免过长。

**核心文件**：
- `plugins/with-text-paste.ts` - 文本粘贴插件
- `plugins/with-common.tsx` - 插件注册（文本粘贴 + 图片粘贴）

**功能特点**：
- 自动换行：超过 50 字符自动换行
- 智能断行：优先在空格处断行，保持单词完整
- 保留格式：保留原文本的换行符
- 不影响现有功能：图片粘贴和 Plait 元素复制粘贴正常工作

**配置参数**：
```typescript
const TEXT_CONFIG = {
  MAX_CHARS_PER_LINE: 50,    // 最大字符数/行
  DEFAULT_WIDTH: 400,         // 默认文本框宽度
  MAX_WIDTH: 600,             // 最大文本框宽度
  CHAR_WIDTH: 8,              // 估算字符宽度
};
```

**使用方法**：
1. 从任何地方复制文本
2. 在画布上按 `Ctrl+V` / `Cmd+V`
3. 文本自动插入并换行

**插件链顺序**：
```typescript
// 在 with-common.tsx 中
return withTextPastePlugin(withImagePlugin(newBoard));
```

详细文档：`/docs/TEXT_PASTE_FEATURE.md`

### 字体管理与缓存

支持 Google Fonts 的自动加载和缓存，通过 Service Worker 实现应用层无感知的字体缓存。

**核心文件**：
- `services/font-manager-service.ts` - 字体管理服务
- `apps/web/src/sw/index.ts` - Service Worker 字体缓存逻辑
- `constants/text-effects.ts` - 字体配置（系统字体 + Google Fonts）

**功能特点**：
- 自动提取画布中使用的字体
- 画布初始化时预加载已使用的字体
- Service Worker 自动缓存字体文件（基于 URL）
- 支持系统字体和 Google Fonts
- 字体预览图管理

**工作流程**：
```
画布加载
  ↓
提取使用的字体（从 text.children 中）
  ↓
fontManagerService.preloadBoardFonts()
  ↓
加载 Google Fonts（link 标签）
  ↓
Service Worker 拦截请求
  ├─ 检查 drawnix-fonts 缓存
  ├─ 缓存命中 → 直接返回
  └─ 缓存未命中 → 下载并缓存
  ↓
字体加载完成 → board.redraw()
```

**缓存策略**：
- 使用 Service Worker Cache API
- Cache-First 策略（优先使用缓存）
- 缓存 CSS 文件和字体文件（woff2）
- 应用层无感知，完全由 Service Worker 管理

**支持的字体**：
- 系统字体：苹方、微软雅黑、黑体、宋体、楷体等
- Google Fonts：Noto Sans SC、ZCOOL 系列、Ma Shan Zheng 等

### 参考图上传组件 (ReferenceImageUpload)

统一的参考图上传组件，用于 AI 图片生成和视频生成弹窗。

**核心文件**：
- `components/ttd-dialog/shared/ReferenceImageUpload.tsx` - 主组件
- `components/ttd-dialog/shared/ReferenceImageUpload.scss` - 样式文件

**功能特点**：
- 本地文件上传：点击"本地"按钮选择文件
- 素材库选择：点击"素材库"按钮从媒体库选择图片
- 拖拽上传：支持将图片拖拽到上传区域
- 粘贴板获取：支持 Ctrl+V / Cmd+V 粘贴图片
- 多种模式：
  - 单图模式 (`multiple=false`)
  - 多图网格模式 (`multiple=true`)
  - 插槽模式 (`slotLabels` 用于视频生成的首帧/尾帧)

**使用示例**：
```tsx
// AI 图片生成中的使用
<ReferenceImageUpload
  images={uploadedImages}
  onImagesChange={setUploadedImages}
  language={language}
  disabled={isGenerating}
  multiple={true}
  label="参考图片 (可选)"
/>

// AI 视频生成中的使用（首帧/尾帧模式）
<ReferenceImageUpload
  images={uploadedImages}
  onImagesChange={handleImagesChange}
  language={language}
  disabled={isGenerating}
  multiple={true}
  maxCount={2}
  slotLabels={['首帧', '尾帧']}
  label="首尾帧图片 (可选)"
/>
```

**类型定义**：
```typescript
interface ReferenceImage {
  url: string;    // Base64 或 URL
  name: string;   // 文件名
  file?: File;    // 原始文件对象
}

interface ReferenceImageUploadProps {
  images: ReferenceImage[];
  onImagesChange: (images: ReferenceImage[]) => void;
  language?: 'zh' | 'en';
  disabled?: boolean;
  multiple?: boolean;
  maxCount?: number;
  label?: string;
  slotLabels?: string[];  // 插槽标签（如 ['首帧', '尾帧']）
  onError?: (error: string | null) => void;
}
```

**样式特点**：
- 虚线边框的上传区域
- 垂直排列的"本地"和"素材库"按钮
- 拖拽时的视觉反馈
- 统一的按钮样式（图标 16px，字体 13px，字重 400）

### 备份恢复功能 (Backup & Restore)

支持将用户数据（提示词、项目、素材）导出为 ZIP 文件，并从 ZIP 文件恢复数据。

**核心文件**：
- `services/backup-restore-service.ts` - 备份恢复服务
- `components/backup-restore/backup-restore-dialog.tsx` - UI 对话框

**功能特点**：
- 导出提示词历史（图片/视频提示词）
- 导出项目数据（文件夹和画板）
- 导出素材库（本地上传 + AI 生成的缓存媒体）
- 增量导入（自动去重，不覆盖已有数据）
- 支持进度显示

**ZIP 文件结构**：
```
aitu_backup_xxx.zip
├── manifest.json              # 备份元信息
├── prompts.json               # 提示词数据
├── projects/                  # 项目文件
│   ├── 文件夹名/
│   │   └── 画板名.drawnix     # 画板数据
│   └── 画板名.drawnix         # 根目录画板
└── assets/                    # 素材文件
    ├── xxx.meta.json          # 素材元数据
    └── xxx.jpg/.mp4           # 媒体文件
```

**数据来源**：
```
导出素材：
├── 本地素材库 ← localforage (asset-storage-service)
└── AI 生成缓存 ← unified-cache-service (drawnix-unified-cache)

导入素材：
├── 本地素材 → localforage + unified-cache
└── AI 生成素材 (source: 'AI_GENERATED') → 仅 unified-cache
```

**关键 API**：
```typescript
// 导出
const blob = await backupRestoreService.exportToZip({
  includePrompts: true,
  includeProjects: true,
  includeAssets: true,
}, onProgress);
backupRestoreService.downloadZip(blob);

// 导入
const result = await backupRestoreService.importFromZip(file, onProgress);
// result: { success, prompts, projects, assets, errors }
```

**缓存刷新机制**：
导入数据后需要刷新内存缓存才能生效：
- `resetPromptStorageCache()` - 刷新提示词缓存
- `workspaceService.reload()` - 刷新工作区缓存

**技术要点**：
- 使用 JSZip 处理 ZIP 文件
- 媒体文件通过 `unifiedCacheService.getCachedBlob()` 获取
- 虚拟 URL（`/asset-library/`）从 Cache API 获取
- 导入时区分本地素材和 AI 生成素材，存储位置不同

### 分页加载与虚拟滚动

支持任务队列和素材库的分页加载与虚拟滚动，优化大数据量场景下的性能。

**核心文件**：
- `hooks/useInfinitePagination.ts` - 无限滚动分页 Hook
- `hooks/useVirtualList.ts` - 虚拟列表 Hook（封装 @tanstack/react-virtual）
- `hooks/useImageLazyLoad.ts` - 图片懒加载 Hook
- `components/lazy-image/LazyImage.tsx` - 懒加载图片组件
- `components/task-queue/VirtualTaskList.tsx` - 虚拟任务列表组件
- `components/media-library/VirtualAssetGrid.tsx` - 虚拟素材网格组件
- `apps/web/src/sw/task-queue/storage.ts` - IndexedDB 游标分页查询

**功能特点**：
- IndexedDB 游标分页：支持大数据量的高效分页查询
- 无限滚动：滚动到底部自动加载更多数据
- 虚拟滚动：只渲染可见区域的元素，大幅减少 DOM 节点
- 图片懒加载：基于 IntersectionObserver，进入视口才加载图片
- 实时更新：支持 `prependItems`、`updateItem`、`removeItem` 操作

**使用示例**：
```typescript
// 无限滚动分页
const {
  items,
  isLoading,
  isLoadingMore,
  hasMore,
  loadMore,
  reset,
} = useInfinitePagination({
  fetcher: async ({ offset, limit }) => {
    const result = await swTaskQueueClient.requestPaginatedTasks({
      offset,
      limit,
      status: filterStatus,
    });
    return {
      items: result.tasks,
      total: result.total,
      hasMore: result.hasMore,
    };
  },
  pageSize: 50,
  getItemKey: (task) => task.id,
  deps: [filterStatus],
});

// 虚拟列表
const { parentRef, virtualItems, totalSize, getItem } = useVirtualList({
  items: tasks,
  estimateSize: 200,
  overscan: 3,
});
```

**IndexedDB 分页查询**：
```typescript
// Service Worker 中的游标分页实现
async getPaginatedTasks(params: PaginationParams): Promise<PaginatedResult> {
  const { offset = 0, limit = 50, status } = params;
  const db = await this.getDB();
  const tx = db.transaction('tasks', 'readonly');
  const store = tx.objectStore('tasks');
  const index = store.index('by-createdAt');

  let cursor = await index.openCursor(null, 'prev');
  let skipped = 0;
  const items: Task[] = [];

  while (cursor && items.length < limit) {
    if (status && cursor.value.status !== status) {
      cursor = await cursor.continue();
      continue;
    }
    if (skipped < offset) {
      skipped++;
      cursor = await cursor.continue();
      continue;
    }
    items.push(cursor.value);
    cursor = await cursor.continue();
  }

  return { items, total, hasMore: offset + items.length < total };
}
```

**性能优化**：
- 默认每页 50 条数据
- 虚拟列表 overscan 设置为 3-5 个元素
- 图片懒加载 rootMargin 设置为 200px（提前加载）
- 使用 `getItemKey` 进行去重，避免重复数据

---

## 开发规范

### 文件命名规范
- **组件**: `PascalCase.tsx` (如 `ImageCropPopup.tsx`)
- **Hooks**: `camelCase.ts` (如 `useImageCrop.ts`)
- **工具**: `kebab-case.ts` (如 `image-utils.ts`)
- **类型**: `kebab-case.types.ts` (如 `image-crop.types.ts`)
- **常量**: `UPPER_SNAKE_CASE.ts` (如 `STORAGE_KEYS.ts`)

### TypeScript 规范
- 对象类型使用 `interface`，联合类型使用 `type`
- 所有组件 Props 必须有类型定义
- 避免使用 `any`，使用具体类型或泛型

#### 元组类型 vs 数组类型

**场景**: 当函数参数期望固定长度的元组（如 `[Point, Point]`）时

❌ **错误示例**:
```typescript
// 错误：使用数组类型，TypeScript 无法确定长度
const points: [number, number][] = [
  [x1, y1],
  [x2, y2],
];
// 类型错误：类型"[number, number][]"不能赋给类型"[Point, Point]"
// 目标仅允许 2 个元素，但源中的元素可能不够
createShape(board, points, shapeType);
```

✅ **正确示例**:
```typescript
// 正确：显式声明为元组类型
const points: [[number, number], [number, number]] = [
  [x1, y1],
  [x2, y2],
];
createShape(board, points, shapeType);
```

**原因**: `[T, T][]` 表示"T 的二元组的数组（长度不定）"，而 `[[T, T], [T, T]]` 表示"恰好包含两个 T 二元组的元组"。当 API 期望固定数量的点（如矩形的左上角和右下角）时，必须使用精确的元组类型，否则 TypeScript 无法保证数组长度符合要求。

#### 扩展外部库的枚举类型

**场景**: 需要在外部库的枚举（如 `@plait/common` 的 `StrokeStyle`）基础上添加新值时

❌ **错误示例**:
```typescript
// 错误：直接修改外部库的枚举（无法做到）或使用魔术字符串
import { StrokeStyle } from '@plait/common';

// 无法向 StrokeStyle 添加 'hollow' 值
// 使用字符串字面量会导致类型不兼容
const strokeStyle = 'hollow';  // ❌ 类型不匹配
setStrokeStyle(board, strokeStyle);  // 错误：类型 'string' 不能赋给 StrokeStyle
```

✅ **正确示例**:
```typescript
// 正确：创建扩展类型，同时保持与原始枚举的兼容性
import { StrokeStyle } from '@plait/common';

// 1. 使用联合类型扩展
export type FreehandStrokeStyle = StrokeStyle | 'hollow';

// 2. 创建同名常量对象，合并原始枚举值
export const FreehandStrokeStyle = {
  ...StrokeStyle,
  hollow: 'hollow' as const,
};

// 使用时可以访问所有值
const style1 = FreehandStrokeStyle.solid;   // ✅ 原始值
const style2 = FreehandStrokeStyle.hollow;  // ✅ 扩展值

// 函数参数使用扩展类型
export const setFreehandStrokeStyle = (
  board: PlaitBoard, 
  strokeStyle: FreehandStrokeStyle  // ✅ 接受原始值和扩展值
) => { ... };
```

**原因**: TypeScript 的枚举是封闭的，无法在外部添加新成员。通过 "类型 + 同名常量对象" 模式，可以：1) 保持与原始枚举的完全兼容；2) 类型安全地添加新值；3) 在运行时和编译时都能正确使用。这是扩展第三方库类型的标准模式。

### React 组件规范
- 使用函数组件和 Hooks
- 使用 `React.memo` 优化重渲染
- 事件处理器使用 `useCallback` 包装
- Hook 顺序：状态 hooks → 副作用 hooks → 事件处理器 → 渲染逻辑

#### Hover 延迟操作需要正确的计时器清理

**场景**: 实现 hover 延迟展开/显示等交互效果时（如工具栏 Popover 延迟展开）

❌ **错误示例**:
```typescript
// 错误：没有清理计时器，可能导致内存泄漏和意外行为
const [open, setOpen] = useState(false);

<div
  onPointerEnter={() => {
    setTimeout(() => setOpen(true), 300);  // 计时器没有被追踪
  }}
>
```

✅ **正确示例**:
```typescript
// 正确：使用 ref 追踪计时器，在离开和卸载时清理
const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const clearHoverTimeout = useCallback(() => {
  if (hoverTimeoutRef.current) {
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = null;
  }
}, []);

// 组件卸载时清理
useEffect(() => {
  return () => clearHoverTimeout();
}, [clearHoverTimeout]);

<div
  onPointerEnter={() => {
    clearHoverTimeout();  // 先清除之前的计时器
    hoverTimeoutRef.current = setTimeout(() => setOpen(true), 300);
  }}
  onPointerLeave={() => {
    clearHoverTimeout();  // 离开时取消延迟操作
  }}
  onPointerDown={() => {
    clearHoverTimeout();  // 点击时立即响应，取消延迟
    setOpen(true);
  }}
>
```

**关键点**:
- 使用 `useRef` 存储计时器 ID（不用 state，避免不必要的重渲染）
- `onPointerLeave` 清除计时器（用户离开后取消待执行的操作）
- `onPointerDown` 清除计时器（点击时立即响应，不等待延迟）
- `useEffect` 清理函数确保组件卸载时清除计时器

#### 单击/双击区分场景的计时器清理

**场景**: 使用 `setTimeout` 延迟单击操作以区分单击和双击时

❌ **错误示例**:
```typescript
// 错误：没有在组件卸载时清理计时器
const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

// 单击延迟处理
onClick={() => {
  if (clickTimerRef.current) {
    clearTimeout(clickTimerRef.current);
  }
  clickTimerRef.current = setTimeout(() => {
    handleSingleClick(); // 组件卸载后仍可能执行，导致 state 更新到已卸载组件
  }, 200);
}}

// 双击取消单击
onDoubleClick={() => {
  if (clickTimerRef.current) {
    clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
  }
  handleDoubleClick();
}}
// ⚠️ 缺少 useEffect 清理！
#### 优先使用项目已有的工具函数

**场景**: 需要使用 debounce、throttle 等常见工具函数时

❌ **错误示例**:
```typescript
// 错误：在组件内部自己实现 debounce
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}
```

✅ **正确示例**:
```typescript
const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

// 组件卸载时清理计时器
useEffect(() => {
  return () => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  };
}, []);

// 单击延迟处理
onClick={() => {
  if (clickTimerRef.current) {
    clearTimeout(clickTimerRef.current);
  }
  clickTimerRef.current = setTimeout(() => {
    handleSingleClick();
  }, 200);
}}

// 双击取消单击
onDoubleClick={() => {
  if (clickTimerRef.current) {
    clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
  }
  handleDoubleClick();
}}
```

**原因**: 如果用户在计时器等待期间导航离开页面（组件卸载），计时器回调仍会执行，可能导致：
1. 内存泄漏（闭包引用已卸载组件的状态）
2. React 警告："Can't perform a React state update on an unmounted component"
3. stale callback 访问过期的 props/state
// 正确：用项目的 @aitu/utils 包
import { debounce } from '@aitu/utils';
```

**可用的工具函数来源**:
- `@aitu/utils`: `debounce`、`throttle` 等项目共享工具函数

**原因**: 重复实现常见工具函数会增加代码体积，且可能存在边界情况处理不完善的问题。项目已有的工具函数经过测试和优化，应优先使用。

#### 滑块等连续输入控件的更新策略

**场景**: 滑块拖动时触发昂贵操作（如 SVG pattern 重新生成、Canvas 重绘）

❌ **错误示例**:
```typescript
// 错误 1：每次滑块变化都立即触发外部回调，导致频繁重绘和抖动
const handleSliderChange = (value: number) => {
  setConfig({ ...config, scale: value });
  onChange?.({ ...config, scale: value }); // 每次都触发，造成性能问题
};

// 错误 2：使用 debounce（防抖），用户停止拖动后才更新，响应迟钝
const debouncedOnChange = useMemo(
  () => debounce((config) => onChange?.(config), 150),
  [onChange]
);
```

✅ **正确示例**:
```typescript
// 正确：使用 throttle（节流），定时触发更新，平衡响应性和性能
import { throttle } from '@aitu/utils';

// 节流版本的外部回调
const throttledOnChange = useMemo(
  () => throttle((newConfig: Config) => {
    onChange?.(newConfig);
  }, 100), // 100ms 节流
  [onChange]
);

// 滑块专用的更新函数：立即更新 UI，节流触发外部回调
const updateConfigThrottled = useCallback(
  (updates: Partial<Config>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);        // 立即更新 UI
    throttledOnChange(newConfig); // 节流触发外部回调
  },
  [config, throttledOnChange]
);

<input
  type="range"
  onChange={(e) => updateConfigThrottled({ scale: Number(e.target.value) })}
/>
```

**关键点**:
- 内部状态 (`setConfig`) 立即更新，保证滑块 UI 的即时响应
- 外部回调 (`onChange`) 使用 `throttle`（节流），减少昂贵操作的执行频率
- **防抖 vs 节流**: 防抖等用户停止操作后才触发（适合搜索框）；节流定时触发（适合滑块）
- 节流时间根据操作开销选择：轻量操作 50-100ms，重量操作（SVG/Canvas）100-200ms
- 使用 `useMemo` 包装 throttle 函数，避免每次渲染创建新实例

### CSS/SCSS 规范
- 使用 BEM 命名规范
- 优先使用设计系统 CSS 变量
- 属性顺序：定位 → 盒模型 → 外观 → 排版 → 动画

#### 绝对定位子元素需要正确的父容器设置

**场景**: 在容器内添加绝对定位的浮层/预览框等元素时

❌ **错误示例**:
```scss
.container {
  // 缺少 position: relative，子元素的绝对定位相对于更上层的定位元素
  overflow: hidden; // 会裁切溢出的绝对定位子元素
  
  .floating-preview {
    position: absolute;
    right: 100%; // 想要显示在容器左侧
    // 结果：1) 定位参照物可能不对 2) 被 overflow: hidden 裁切掉
  }
}
```

✅ **正确示例**:
```scss
.container {
  position: relative; // 作为绝对定位子元素的参照物
  overflow: visible;  // 允许子元素溢出显示
  
  .floating-preview {
    position: absolute;
    right: 100%; // 正确显示在容器左侧
  }
}
```

**检查清单**:
- 父容器需要 `position: relative`（或其他非 static 的定位）
- 如果子元素需要溢出显示，父容器需要 `overflow: visible`
- 多层嵌套时，确认绝对定位的参照元素是正确的

**原因**: `position: absolute` 的元素相对于最近的非 static 定位祖先元素定位。如果父容器没有设置定位，子元素会相对于更上层的元素定位，导致位置错误。同时 `overflow: hidden` 会裁切超出容器边界的内容，包括绝对定位的子元素。

#### 移动端固定定位元素需要考虑工具栏遮挡

**场景**: 移动端页面底部或顶部的固定定位元素（输入框、提示条等）需要避开左侧工具栏

❌ **错误示例**:
```scss
// 直接居中，没有考虑左侧工具栏
.ai-input-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
}

@media (max-width: 640px) {
  .ai-input-bar {
    // 移动端仍然直接居中，会被工具栏遮挡
    bottom: 16px;
  }
}
```

✅ **正确示例**:
```scss
.ai-input-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
}

@media (max-width: 640px) {
  .ai-input-bar {
    bottom: 16px;
    // 考虑左侧工具栏宽度 (48px)，偏移居中点
    left: calc(50% + 24px); // 工具栏宽度的一半
    max-width: calc(100% - 60px); // 左侧工具栏 + 右侧边距
  }
}
```

**检查清单**:
- 移动端 (`@media max-width: 640px/768px`) 的固定定位元素
- 是否会与左侧 unified-toolbar (48px) 重叠
- 是否会与右上角缩放控件重叠
- 使用 `$toolbar-width` 变量而非硬编码数值

**相关变量**: `$toolbar-width: 48px` (定义在 `styles/_common-variables.scss`)

#### 移动端触控需要 touch 事件实现 hover 效果

**场景**: 桌面端的 hover 预览/提示在移动端没有效果，需要添加 touch 事件支持

❌ **错误示例**:
```tsx
// 只有鼠标事件，移动端触控没有预览效果
<canvas
  onMouseEnter={() => setPreviewVisible(true)}
  onMouseLeave={() => setPreviewVisible(false)}
  onMouseMove={(e) => updatePreviewPosition(e)}
/>
```

✅ **正确示例**:
```tsx
// 添加触控状态追踪
const isTouchingRef = useRef(false);

const handleTouchStart = (e: React.TouchEvent) => {
  isTouchingRef.current = true;
  const touch = e.touches[0];
  updatePreviewPosition(touch.clientX, touch.clientY);
  setPreviewVisible(true);
};

const handleTouchMove = (e: React.TouchEvent) => {
  const touch = e.touches[0];
  updatePreviewPosition(touch.clientX, touch.clientY);
  // 触控移动时始终显示预览
  setPreviewVisible(true);
};

const handleTouchEnd = () => {
  isTouchingRef.current = false;
  // 延迟隐藏，让用户看到最终位置
  setTimeout(() => {
    if (!isTouchingRef.current) {
      setPreviewVisible(false);
    }
  }, 500);
};

<canvas
  onMouseEnter={handleMouseEnter}
  onMouseLeave={handleMouseLeave}
  onMouseMove={handleMouseMove}
  onTouchStart={handleTouchStart}
  onTouchMove={handleTouchMove}
  onTouchEnd={handleTouchEnd}
/>
```

**注意事项**:
- 触控时会同时触发 `pointerdown`，可能导致拖拽状态与预览状态冲突
- 使用 `isTouchingRef` 区分移动端触控和桌面端鼠标拖拽
- 触控结束后延迟隐藏预览，给用户时间查看结果
- Canvas 元素需要设置 `touch-action: none` 防止默认滚动行为

### Git 提交规范
- 格式: `<type>(<scope>): <subject>`
- 类型: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

### 重要规则
- **UI 框架**: 使用 TDesign React，配置浅色主题
- **Tooltips**: 始终使用 `theme='light'`
- **文件大小限制**: 单个文件不超过 500 行
- **文档语言**: 规格文档使用中文

### navigator.storage.estimate() 返回浏览器配额而非磁盘空间

**场景**: 需要获取用户设备存储空间信息时

❌ **错误示例**:
```typescript
// 错误：误以为 quota 是实际磁盘剩余空间
const estimate = await navigator.storage.estimate();
const diskFreeSpace = estimate.quota; // ❌ 这不是磁盘剩余空间！
console.log(`磁盘剩余: ${diskFreeSpace / 1024 / 1024 / 1024} GB`); 
// 可能显示 500+ GB，但实际磁盘只剩 10GB
```

✅ **正确示例**:
```typescript
// 正确理解：quota 是浏览器分配给该站点的配额上限
const estimate = await navigator.storage.estimate();
const usage = estimate.usage || 0;   // 该站点已使用的存储
const quota = estimate.quota || 0;   // 浏览器分配的配额（通常是磁盘空间的某个比例）
const usagePercent = quota > 0 ? (usage / quota) * 100 : 0;

// 只用于判断站点存储使用率，不用于显示磁盘空间
if (usagePercent > 80) {
  console.warn('站点存储使用率较高');
}
```

**原因**: `navigator.storage.estimate()` 返回的 `quota` 是浏览器为该源（origin）分配的存储配额，通常是磁盘可用空间的某个比例（如 50%），而非实际磁盘剩余空间。向用户展示这个值会造成误解。Web API 无法直接获取真实的磁盘剩余空间。

### 异步初始化模式

**场景**: 使用 `settingsManager` 或其他需要异步初始化的服务时

❌ **错误示例**:
```typescript
async initialize(): Promise<boolean> {
  const settings = geminiSettings.get(); // 可能返回加密的 JSON！
  await swTaskQueueClient.initialize({ apiKey: settings.apiKey });
}
```

✅ **正确示例**:
```typescript
async initialize(): Promise<boolean> {
  await settingsManager.waitForInitialization(); // 等待解密完成
  const settings = geminiSettings.get(); // 现在返回解密后的值
  await swTaskQueueClient.initialize({ apiKey: settings.apiKey });
}
```

**原因**: `settingsManager` 使用异步方法 `decryptSensitiveDataForLoading()` 解密敏感数据（如 API Key）。如果在解密完成前调用 `geminiSettings.get()`，会返回加密的 JSON 对象而不是解密后的字符串，导致 API 请求失败。

### Service Worker 初始化时序

**场景**: 提交工作流到 Service Worker 执行前

❌ **错误示例**:
```typescript
// 错误：直接提交工作流，SW 可能还未初始化
const submitToSW = async (workflow) => {
  await workflowSubmissionService.submit(swWorkflow);
  // 如果 SW 的 workflowHandler 未初始化，工作流会被暂存
  // 步骤状态永远停留在 pending（"待开始"）
};
```

✅ **正确示例**:
```typescript
// 正确：先确保 SW 已初始化
const submitToSW = async (workflow) => {
  // 确保 SW 任务队列已初始化（发送 TASK_QUEUE_INIT 消息）
  const { swTaskQueueService } = await import('../services/sw-task-queue-service');
  await swTaskQueueService.initialize();
  
  await workflowSubmissionService.submit(swWorkflow);
};
```

**原因**: Service Worker 的 `workflowHandler` 需要收到 `TASK_QUEUE_INIT` 消息后才会初始化。如果在 SW 初始化前提交工作流，消息会被暂存到 `pendingWorkflowMessages`，等待配置到达。若配置永远不到达（如 `swTaskQueueService.initialize()` 未被调用），工作流就永远不会开始执行，步骤状态保持 `pending`。

### Service Worker 更新提示在开发模式下被跳过

**场景**: 在 localhost 本地测试 Service Worker 更新提示功能

**现象**: 修改代码并构建后，在 localhost 环境下看不到版本更新提示

**原因**: 项目在开发模式下（`localhost` 或 `127.0.0.1`）会自动跳过更新提示，直接激活新的 Service Worker。

```typescript
// apps/web/src/main.tsx 中的逻辑
const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
  if (isDevelopment) {
    // 开发模式：直接跳过 waiting，不显示提示
    newWorker.postMessage({ type: 'SKIP_WAITING' });
  } else {
    // 生产模式：显示更新提示
    window.dispatchEvent(new CustomEvent('sw-update-available', { ... }));
  }
}
```

**测试方法**:

1. **在控制台手动触发更新提示（仅测试 UI）**:
```javascript
window.__debugTriggerUpdate('0.5.10')
```

2. **部署到生产环境测试**: 只有在非 localhost 环境下才会显示更新提示

3. **正确的版本升级流程**:
```bash
pnpm run version:patch   # 升级版本号
pnpm run build:web       # 重新构建
# 部署到生产环境后会触发更新提示
```

**注意**: 
- Service Worker 更新检测是基于 `sw.js` 文件内容的字节级比较
- 只修改 `version.json` 不会触发 SW 更新，必须修改 `sw.js` 内容
- 版本号通过 `__APP_VERSION__` 变量注入到 `sw.js` 中

### PostMessage 日志由调试模式完全控制

**场景**: Service Worker 与主线程之间的通讯日志记录

**关键原则**: PostMessage 日志记录必须完全由调试模式控制，避免影响未开启调试模式的应用性能。

✅ **正确实现**:
```typescript
// 1. postmessage-logger.ts 中的日志记录检查
function shouldLogMessage(messageType: string): boolean {
  // 调试模式未启用时，立即返回 false，不进行任何记录操作
  if (!isDebugModeActive()) {
    return false;
  }
  return !EXCLUDED_MESSAGE_TYPES.includes(messageType);
}

// 2. message-bus.ts 中的日志记录
export function sendToClient(client: Client, message: unknown): void {
  // Only attempt to log if debug mode is enabled
  let logId = '';
  if (isPostMessageLoggerDebugMode()) {
    const messageType = (message as { type?: string })?.type || 'unknown';
    logId = logSentMessage(messageType, message, client.id);
  }
  
  client.postMessage(message);
  // ... 仅在调试模式启用时广播日志
}

// 3. Service Worker 中的日志记录
sw.addEventListener('message', (event: ExtendableMessageEvent) => {
  // Log received message only if debug mode is enabled
  let logId = '';
  if (isPostMessageLoggerDebugMode()) {
    logId = logReceivedMessage(messageType, event.data, clientId);
  }
  
  // ... 处理消息
});

// 4. 调试模式切换时的内存清理
export function setPostMessageLoggerDebugMode(enabled: boolean): void {
  const wasEnabled = debugModeEnabled;
  debugModeEnabled = enabled;
  
  if (!enabled && wasEnabled) {
    // 从启用变为禁用时，立即清空日志，释放内存
    logs.length = 0;
    pendingRequests.clear();
  }
}
```

**性能影响**:
- **调试关闭**: 零日志记录开销，零内存占用，应用运行不受影响
- **调试启用**: 完整的日志记录，实时显示在调试面板，可接受的性能开销仅在调试时产生

**相关文件**:
- `docs/SW_DEBUG_POSTMESSAGE_LOGGING.md` - 完整的实现文档
- `apps/web/src/sw/task-queue/postmessage-logger.ts` - 日志记录模块
- `apps/web/src/sw/task-queue/utils/message-bus.ts` - 消息总线模块
- `apps/web/public/sw-debug.html` - 调试面板界面

### 重复提交检测应由 UI 层处理

**场景**: 实现防重复提交功能时

❌ **错误示例**:
```typescript
// 错误：在服务层基于参数哈希进行去重
class TaskQueueService {
  private recentSubmissions: Map<string, number>;

  createTask(params: GenerationParams, type: TaskType): Task {
    const paramsHash = generateParamsHash(params, type);
    
    // 服务层拦截"相同参数"的任务
    if (this.isDuplicateSubmission(paramsHash)) {
      throw new Error('Duplicate submission detected');
    }
    
    this.recentSubmissions.set(paramsHash, Date.now());
    // ... 创建任务
  }

  private isDuplicateSubmission(hash: string): boolean {
    const lastSubmission = this.recentSubmissions.get(hash);
    return lastSubmission && Date.now() - lastSubmission < 5000;
  }
}
```

✅ **正确示例**:
```typescript
// 正确：服务层只检查 taskId 重复（防止同一任务被提交两次）
class TaskQueueService {
  createTask(params: GenerationParams, type: TaskType): Task {
    const taskId = generateTaskId(); // UUID v4，每次不同
    
    if (this.tasks.has(taskId)) {
      console.warn(`Task ${taskId} already exists`);
      return;
    }
    
    // ... 创建任务，不做参数去重
  }
}

// UI 层通过按钮防抖和状态管理处理重复提交
const AIInputBar = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleSubmit = async () => {
    if (isSubmitting) return; // 防止重复点击
    
    setIsSubmitting(true);
    try {
      await taskQueueService.createTask(params, type);
    } finally {
      // 使用冷却时间防止快速连续提交
      setTimeout(() => setIsSubmitting(false), 1000);
    }
  };
};
```

**原因**: 
1. **用户意图不同**: 用户连续提交相同参数可能是故意的（想生成多张相同提示词的图片）
2. **去重规则复杂**: "相同参数"的定义不清晰（图片 base64 是否算相同？时间戳呢？）
3. **职责分离**: 防重复点击是 UI 交互问题，应由 UI 层解决
4. **调试困难**: 服务层拦截导致的错误不易排查，用户不知道为什么提交失败

### API 请求禁止重试

**场景**: 实现 API 调用（图片生成、视频生成、聊天等）时

❌ **错误示例**:
```typescript
// 错误：添加重试逻辑
const maxRetries = 3;
for (let attempt = 0; attempt < maxRetries; attempt++) {
  try {
    const response = await fetch(apiUrl, options);
    if (response.ok) return response.json();
  } catch (error) {
    if (attempt < maxRetries - 1) {
      await sleep(retryDelay);
      continue;
    }
    throw error;
  }
}
```

✅ **正确示例**:
```typescript
// 正确：直接请求，失败则抛出错误
const response = await fetch(apiUrl, options);
if (!response.ok) {
  const error = new Error(`HTTP ${response.status}`);
  throw error;
}
return response.json();
```

**禁止重试的请求类型**:
- AI 生成 API（图片、视频、角色）
- 聊天 API
- 任务队列中的任务执行
- Service Worker 中的 fetch 请求

**原因**: 
1. AI 生成请求成本高（时间和费用），重试会导致重复消耗
2. 失败通常是由于内容策略、配额限制或 API 问题，重试无法解决
3. 用户可以手动重试失败的任务
4. 重试会延长错误反馈时间，影响用户体验

### Plait 选中状态渲染触发

**场景**: 在异步回调（如 `setTimeout`）中使用 `addSelectedElement` 选中元素时

❌ **错误示例**:
```typescript
// 错误：addSelectedElement 只更新 WeakMap 缓存，不触发渲染
setTimeout(() => {
  const element = board.children.find(el => el.id === elementId);
  clearSelectedElement(board);
  addSelectedElement(board, element);  // 选中状态已更新，但 UI 不会刷新
  BoardTransforms.updatePointerType(board, PlaitPointerType.selection);
}, 50);
```

✅ **正确示例**:
```typescript
// 正确：使用 Transforms.setNode 触发 board.apply() 从而触发渲染
setTimeout(() => {
  const elementIndex = board.children.findIndex(el => el.id === elementId);
  const element = elementIndex >= 0 ? board.children[elementIndex] : null;
  if (element) {
    clearSelectedElement(board);
    addSelectedElement(board, element);
    BoardTransforms.updatePointerType(board, PlaitPointerType.selection);
    // 设置临时属性触发渲染，然后立即删除
    Transforms.setNode(board, { _forceRender: Date.now() } as any, [elementIndex]);
    Transforms.setNode(board, { _forceRender: undefined } as any, [elementIndex]);
  }
}, 50);
```

**原因**: Plait 的 `addSelectedElement` 只是将元素存入 `BOARD_TO_SELECTED_ELEMENT` WeakMap 缓存，不会触发任何渲染。在同步流程中（如 `insertElement` 内部），`Transforms.insertNode` 已经触发了 `board.apply()` 和渲染链，所以选中状态能正常显示。但在异步回调中单独调用时，需要手动触发一次 `board.apply()` 来刷新渲染。`Transforms.setNode` 会调用 `board.apply()`，从而触发完整的渲染链。

### 异步任务幂等性检查应检查存在性而非完成状态

**场景**: 实现防止任务重复执行的检查逻辑时（如页面刷新后恢复任务）

❌ **错误示例**:
```typescript
// 错误：只检查 completed 状态，会导致 in_progress 的任务被重复执行
async checkProcessedRequest(requestId: string): Promise<boolean> {
  const result = await db.get('requests', requestId);
  // 用户刷新页面时，in_progress 的任务会被再次执行！
  if (result && result.status === 'completed' && result.response) {
    return true;
  }
  return false;
}
### Plait API 函数签名注意事项

**场景**: 调用 Plait 的工具函数（如 `getRectangleByElements`）时

❌ **错误示例**:
```typescript
// 错误：漏掉 board 参数，导致 elements.forEach is not a function 错误
const elementRect = getRectangleByElements([element], false);
// getRectangleByElements 的第一个参数是 board，不是 elements！
```

✅ **正确示例**:
```typescript
// 正确：检查任务是否存在，无论状态如何
async checkProcessedRequest(requestId: string): Promise<boolean> {
  const result = await db.get('requests', requestId);
  // 存在即返回 true，防止重复执行
  if (result) {
    return true;
  }
  return false;
}
```

**原因**: 
- 当任务状态为 `in_progress` 时，说明任务已经开始执行
- 如果只检查 `completed` 状态，用户刷新页面后会导致同一任务被重复执行
- 正确的做法是检查任务记录是否存在，存在即视为"已处理"
- 这符合幂等性原则：同一请求多次执行应该得到相同结果

**适用场景**:
- Service Worker 恢复任务
- 页面刷新后的任务续接
- 分布式系统中的请求去重
// 正确：board 作为第一个参数
const elementRect = getRectangleByElements(board, [element], false);
```

**常见的需要 board 参数的 Plait 函数**:
- `getRectangleByElements(board, elements, includePadding)`
- `getSelectedElements(board)`
- `PlaitElement.getElementG(element)` - 注意这个不需要 board

**原因**: Plait 的大多数工具函数需要 board 作为上下文，用于访问视口、缩放比例等信息。漏掉 board 参数会导致运行时错误，且错误信息可能难以理解（如将 elements 数组误认为 board 对象导致的方法调用错误）。

### 禁止自动删除用户数据

**场景**: 添加定时清理、自动裁剪、过期删除等"优化"逻辑时

❌ **错误示例**:
```typescript
// 错误：自动删除超过 24 小时的已完成任务
async restoreFromStorage() {
  // ... 恢复任务
  taskQueueStorage.cleanupOldTasks(); // 会删除素材库依赖的任务数据！
}

// 错误：创建新会话时自动删除旧会话
const createSession = async () => {
  if (sessions.length >= MAX_SESSIONS) {
    await pruneOldSessions(MAX_SESSIONS); // 会删除用户的聊天历史！
  }
};

// 错误：定期清理"过期"的工作流数据
setInterval(() => cleanupOldWorkflows(), 24 * 60 * 60 * 1000);
```

✅ **正确示例**:
```typescript
// 正确：不自动删除任务数据
async restoreFromStorage() {
  // ... 恢复任务
  // NOTE: 不调用 cleanupOldTasks()，任务数据是素材库的数据来源
}

// 正确：不限制会话数量，让用户手动管理
const createSession = async () => {
  const newSession = await chatStorageService.createSession();
  // 不自动删除旧会话，用户可以手动删除
};

// 正确：只清理临时数据，不清理用户数据
setInterval(() => {
  cleanupRecentSubmissions(); // ✅ 清理内存中的去重缓存（临时数据）
  cleanupStaleRequests();     // ✅ 清理过期的请求状态（临时数据）
}, 60000);
```

**可以自动清理的数据**:
- 内存中的临时状态（去重缓存、请求状态、锁）
- 追踪事件缓存（临时数据）
- 存储空间不足时的 LRU 缓存淘汰（用户会收到提示）

**禁止自动清理的数据**:
- 任务数据（素材库依赖）
- 聊天会话和消息
- 工作流数据
- 用户上传的素材
- 项目和画板数据

**原因**: 本项目的素材库通过 `taskQueueService.getTasksByStatus(COMPLETED)` 获取 AI 生成的素材。如果自动删除已完成的任务，素材库就无法展示这些 AI 生成的图片/视频。类似地，聊天历史、工作流数据都是用户的重要数据，不应被自动删除。

### 类服务的 setInterval 必须保存 ID 并提供 destroy 方法

**场景**: 在类（Service、Manager、Client）中使用 `setInterval` 进行定期任务（如清理、监控、心跳）

❌ **错误示例**:
```typescript
class RequestManager {
  constructor() {
    // 错误：没有保存 interval ID，无法清理
    setInterval(() => {
      this.cleanupExpiredRequests();
    }, 60000);
  }
  // 没有 destroy 方法！
}

class DuplexClient {
  private startPerformanceMonitoring(): void {
    // 错误：interval 一旦创建就永远运行
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, 5000);
  }
}
```

✅ **正确示例**:
```typescript
class RequestManager {
  private cleanupTimerId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startCleanupTimer();
  }

  private startCleanupTimer(): void {
    if (this.cleanupTimerId) {
      clearInterval(this.cleanupTimerId);
    }
    this.cleanupTimerId = setInterval(() => {
      this.cleanupExpiredRequests();
    }, 60000);
  }

  destroy(): void {
    if (this.cleanupTimerId) {
      clearInterval(this.cleanupTimerId);
      this.cleanupTimerId = null;
    }
    // 清理其他资源...
  }
}
```

**检查清单**:
- 每个 `setInterval` 调用都保存返回的 ID 到类成员变量
- 类必须提供 `destroy()` 方法用于清理定时器
- 重复调用启动方法时先清理旧定时器
- 单例模式的类在重新获取实例前也需要清理

**原因**: 类服务通常是单例或长期存在的，但在某些场景下（如热更新、测试、页面切换）需要销毁重建。未清理的 `setInterval` 会导致：
1. 内存泄漏（闭包持有整个类实例）
2. 定时器累积（每次创建新实例都增加一个定时器）
3. 回调执行在已销毁的实例上

### Map/Set 需要清理机制防止无限增长

**场景**: 使用 Map 或 Set 缓存数据（如工作流、请求、会话）

❌ **错误示例**:
```typescript
class WorkflowService {
  private workflows: Map<string, Workflow> = new Map();

  submit(workflow: Workflow): void {
    this.workflows.set(workflow.id, workflow);
    // 只有 set，没有 delete！
  }

  handleCompleted(workflowId: string): void {
    const workflow = this.workflows.get(workflowId);
    workflow.status = 'completed';
    // 完成后没有从 Map 中移除，导致无限增长
  }
}
```

✅ **正确示例**:
```typescript
// 清理延迟：完成后保留 5 分钟供查询
const CLEANUP_DELAY = 5 * 60 * 1000;

class WorkflowService {
  private workflows: Map<string, Workflow> = new Map();
  private cleanupTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  handleCompleted(workflowId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.status = 'completed';
    }
    // 调度延迟清理
    this.scheduleCleanup(workflowId);
  }

  handleFailed(workflowId: string, error: string): void {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.status = 'failed';
      workflow.error = error;
    }
    this.scheduleCleanup(workflowId);
  }

  private scheduleCleanup(workflowId: string): void {
    // 清除已有的清理定时器
    const existingTimer = this.cleanupTimers.get(workflowId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.workflows.delete(workflowId);
      this.cleanupTimers.delete(workflowId);
    }, CLEANUP_DELAY);

    this.cleanupTimers.set(workflowId, timer);
  }
}
```

**常见需要清理的 Map/Set**:
- `workflows` - 工作流完成/失败后
- `pendingRequests` - 请求超时或完成后
- `sessions` - 会话过期后
- `subscriptions` - 取消订阅后
- `batches` - 批处理完成后

**原因**: 没有清理机制的 Map/Set 会随着使用不断增长，最终导致内存溢出。即使单个条目很小，长期积累也会消耗大量内存。应该在数据不再需要时（完成、失败、超时、取消）及时清理。

### 调试日志清理规范

**场景**: 开发功能时添加 `console.log` 调试日志

❌ **错误示例**:
```typescript
// 开发时添加了大量调试日志，提交时忘记删除
function handleClick(event: PointerEvent) {
  console.log('[MyComponent] handleClick:', event);
  console.log('[MyComponent] current state:', state);
  // 业务逻辑...
  console.log('[MyComponent] result:', result);
}
```

✅ **正确示例**:
```typescript
// 提交前删除所有调试日志
function handleClick(event: PointerEvent) {
  // 业务逻辑...
}

// 如果确实需要保留日志，使用注释形式
function complexFunction() {
  // console.log('[Debug] intermediate value:', value);
  // 业务逻辑...
}
```

**提交前检查命令**:
```bash
# 检查 staged 更改中是否有新增的 console.log
git diff --cached | grep -E "^\+.*console\.(log|debug|info)" | head -20
```

**原因**: 调试日志会污染控制台输出，影响生产环境的日志分析，也会增加代码体积。开发时可以自由添加日志，但提交前必须清理。如果某些日志对生产调试有价值，应使用注释形式保留或使用专门的日志服务。

### Z-Index 管理规范

**规范文档**: 参考 `docs/Z_INDEX_GUIDE.md` 获取完整规范

**核心原则**:
- 使用预定义的层级常量，禁止硬编码魔术数字
- TypeScript: 从 `constants/z-index.ts` 导入 `Z_INDEX`
- SCSS: 从 `styles/z-index.scss` 导入并使用 `$z-*` 变量或 `z()` 函数

**层级结构** (每层预留100单位):
```
Layer 0 (0-999):     Base & Canvas Internal
Layer 1 (1000-1999): Canvas Elements & Decorations
Layer 2 (2000-2999): Toolbars (unified-toolbar: 2000, popovers: 3000)
Layer 3 (3000-3999): Popovers & Tooltips
Layer 4 (4000-4999): Drawers & Panels (task-queue, chat-drawer)
Layer 5 (5000-5999): Modals & Dialogs (AI dialogs: 5100+)
Layer 6 (6000-6999): Notifications (active-task-warning: 6000)
Layer 7 (7000-7999): Auth Dialogs
Layer 8 (8000-8999): Image Viewer
Layer 9 (9000+):     Critical Overlays (loading, system-error)
```

**使用示例**:
```typescript
// TypeScript/TSX
import { Z_INDEX } from '@/constants/z-index';
<Rnd style={{ zIndex: Z_INDEX.DIALOG_AI_IMAGE }}>
```

```scss
// SCSS
@import 'styles/z-index';
.my-toolbar {
  z-index: $z-unified-toolbar;  // 或 z-index: z('unified-toolbar');
}
```

**禁止事项**:
- ❌ 禁止使用随意的数字 (如 9999, 10000, 10001)
- ❌ 禁止在同一层级随意 +1/-1
- ❌ 临时修复必须在完成后转换为规范用法

### 媒体 URL 处理规范（避免 CSP 和生命周期问题）

**场景**: 需要在画布中引用动态生成的图片/视频（如合并图片、AI 生成结果）

❌ **错误示例 1: 使用 data: URL**
```typescript
// 错误：data: URL 会被 CSP 的 connect-src 阻止 fetch
const dataUrl = canvas.toDataURL('image/png');
DrawTransforms.insertImage(board, { url: dataUrl, ... });
// @plait/core 的 convertImageToBase64 会对所有 URL 发起 fetch
// 生产环境 CSP connect-src 不包含 data: 会报错！
```

❌ **错误示例 2: 使用 blob: URL**
```typescript
// 错误：blob: URL 在页面刷新后失效
const blob = await fetch(imageUrl).then(r => r.blob());
const blobUrl = URL.createObjectURL(blob);
DrawTransforms.insertImage(board, { url: blobUrl, ... });
// 页面刷新后，blob: URL 失效，图片无法显示！
```

✅ **正确示例: 使用虚拟路径 + Service Worker 拦截**
```typescript
// 1. 生成 Blob 并缓存到 Cache API
const blob = await new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Failed')), 'image/png');
});

// 2. 使用虚拟路径 URL（由 Service Worker 拦截返回缓存内容）
const taskId = `merged-image-${Date.now()}`;
const stableUrl = `/__aitu_cache__/image/${taskId}.png`;
const cacheKey = `${location.origin}${stableUrl}`;

// 3. 缓存到 Cache API
await unifiedCacheService.cacheMediaFromBlob(cacheKey, blob, 'image', { taskId });

// 4. 使用虚拟路径插入图片
DrawTransforms.insertImage(board, { url: stableUrl, ... });
```

**虚拟路径规范**:
- 统一前缀: `/__aitu_cache__/`
- 图片路径: `/__aitu_cache__/image/{taskId}.{ext}`
- 视频路径: `/__aitu_cache__/video/{taskId}.{ext}`
- Service Worker 通过路径或扩展名区分类型

**原因**:
1. `data: URL` 被 CSP 的 `connect-src` 阻止（生产环境）
2. `blob: URL` 生命周期与页面绑定，刷新后失效
3. 虚拟路径 + Cache API 持久化，刷新后仍可访问

### 虚拟路径 URL 匹配规范

**场景**: 需要根据素材 URL 查找或删除画布中的元素时（如删除素材时同步删除画布元素）

❌ **错误示例: 使用精确匹配或 startsWith**
```typescript
// 错误：素材 URL 可能是完整 URL，画布元素可能是相对路径
function isCacheUrl(url: string): boolean {
  return url.startsWith('/__aitu_cache__/');  // 无法匹配 http://localhost/__aitu_cache__/...
}

function findElement(assetUrl: string) {
  return board.children.find(el => el.url === assetUrl);  // 精确匹配会失败
}
// 素材 URL: http://localhost:7200/__aitu_cache__/image/xxx.png
// 元素 URL: /__aitu_cache__/image/xxx.png
// 结果：无法匹配！
```

✅ **正确示例: 提取路径部分进行匹配**
```typescript
const CACHE_URL_PREFIX = '/__aitu_cache__/';

// 检查是否为缓存 URL（支持完整 URL 和相对路径）
function isCacheUrl(url: string): boolean {
  return url.includes(CACHE_URL_PREFIX);  // ✅ 使用 includes
}

// 提取缓存路径部分用于匹配
function extractCachePath(url: string): string | null {
  const cacheIndex = url.indexOf(CACHE_URL_PREFIX);
  if (cacheIndex === -1) return null;
  return url.slice(cacheIndex);  // 返回 /__aitu_cache__/... 部分
}

// 匹配时使用路径部分比较
function findElements(assetUrl: string) {
  const targetPath = extractCachePath(assetUrl);
  return board.children.filter(el => {
    const elPath = extractCachePath(el.url);
    return el.url === assetUrl || (targetPath && elPath && targetPath === elPath);
  });
}
```

**原因**:
- 素材存储时可能使用完整 URL（含 origin）
- 画布元素可能使用相对路径（由 Service Worker 拦截）
- 同一资源的两种 URL 形式必须能相互匹配

### Cache API 缓存 key 一致性规范

**场景**: 主线程缓存媒体到 Cache API，Service Worker 需要读取该缓存

❌ **错误示例: 使用 location.origin 拼接完整 URL**
```typescript
// 主线程缓存时
const stableUrl = `/__aitu_cache__/image/${taskId}.png`;
const cacheKey = `${location.origin}${stableUrl}`;  // http://localhost:7200/...
await cache.put(cacheKey, response);

// SW 读取时（代理场景下 origin 不同）
const cacheKey = request.url;  // https://ai-tu.netlify.app/...
const cached = await cache.match(cacheKey);  // ❌ 找不到！
```

✅ **正确示例: 使用相对路径作为缓存 key + 多 key 回退查找**
```typescript
// 主线程缓存时 - 使用相对路径
const stableUrl = `/__aitu_cache__/image/${taskId}.png`;
const cacheKey = stableUrl;  // /__aitu_cache__/image/xxx.png
await cache.put(cacheKey, response);

// SW 读取时 - 优先完整 URL，回退到相对路径
let cachedResponse = await cache.match(request.url);  // 完整 URL
if (!cachedResponse) {
  cachedResponse = await cache.match(url.pathname);   // 相对路径回退
}
```

**原因**:
- 使用 `location.origin` 会在代理场景下导致 key 不一致（本地 vs 线上域名）
- 推荐使用相对路径作为缓存 key，确保一致性
- SW 端采用多 key 回退策略，兼容历史数据和不同场景

### 相对路径 URL 解析规范

**场景**: 需要从 URL 中提取文件扩展名、路径等信息时（如下载文件时确定文件名）

❌ **错误示例: 直接使用 new URL() 解析**
```typescript
// 错误：相对路径无法被 new URL() 解析，会抛异常
function getFileExtension(url: string): string {
  try {
    const urlPath = new URL(url).pathname;  // ❌ 相对路径会抛 TypeError
    const ext = urlPath.substring(urlPath.lastIndexOf('.') + 1);
    return ext;
  } catch {
    return 'bin';  // 回退到错误的扩展名
  }
}

// 下载合并图片时：
// url = '/__aitu_cache__/image/merged-image-xxx.png'
// 结果：下载文件扩展名变成 .bin
```

✅ **正确示例: 先判断是否为相对路径**
```typescript
function getFileExtension(url: string): string {
  try {
    let urlPath: string;
    
    // 相对路径直接使用，不需要 URL 解析
    if (url.startsWith('/') || !url.includes('://')) {
      urlPath = url;
    } else {
      urlPath = new URL(url).pathname;
    }
    
    const lastDotIndex = urlPath.lastIndexOf('.');
    if (lastDotIndex > 0 && lastDotIndex < urlPath.length - 1) {
      return urlPath.substring(lastDotIndex + 1).toLowerCase();
    }
  } catch {
    // URL 解析失败
  }
  return 'bin';
}
```

**原因**:
- `new URL(path)` 要求完整 URL 或提供 base URL，相对路径会抛 `TypeError: Invalid URL`
- 虚拟路径如 `/__aitu_cache__/xxx` 是相对路径，需要特殊处理
- 判断 `startsWith('/')` 或不包含 `://` 可以识别相对路径

### Service Worker 架构设计：避免复杂的往返通信

**场景**: 设计需要 Service Worker 执行的工具或任务时

❌ **错误示例: 复杂的往返通信架构**
```typescript
// 错误：ai_analyze 被设计为需要主线程执行，但内部又通过 SW 发起 chat 请求
// 形成了复杂的往返通信链，页面刷新时容易断链

// 流程：
// 1. 主线程发起工作流 → SW
// 2. SW 发现 ai_analyze 需要主线程执行
// 3. SW → 主线程 (MAIN_THREAD_TOOL_REQUEST)
// 4. 主线程执行 ai_analyze，调用 agentExecutor
// 5. agentExecutor 调用 callApiStreamViaSW
// 6. 主线程 → SW (CHAT_START)  ← 又回到 SW！
// 7. SW 执行 chat，通过 MessageChannel 返回结果
// 8. 主线程收到结果，发送 MAIN_THREAD_TOOL_RESPONSE
// 9. SW 继续工作流

// 问题：刷新页面时，步骤 6-8 的通信链会断裂，导致工作流卡住

export function requiresMainThread(toolName: string): boolean {
  const delegatedTools = [
    'ai_analyze',  // ❌ 内部又调用 SW，不应该委托给主线程
    // ...
  ];
  return delegatedTools.includes(toolName);
}
```

✅ **正确示例: 简化架构，避免往返通信**
```typescript
// 正确：如果操作最终在 SW 中执行，就应该直接在 SW 中实现

// 简化后的流程：
// 1. 主线程发起工作流 → SW
// 2. SW 直接执行 ai_analyze（不委托给主线程）
// 3. SW 内部调用 chat API
// 4. SW 解析结果，添加后续步骤
// 5. SW 继续执行后续步骤

// 在 SW 中注册工具，直接执行
export const swMCPTools: Map<string, SWMCPTool> = new Map([
  ['generate_image', generateImageTool],
  ['generate_video', generateVideoTool],
  ['ai_analyze', aiAnalyzeTool],  // ✅ 直接在 SW 执行
]);

// 从委托列表中移除
export function requiresMainThread(toolName: string): boolean {
  const delegatedTools = [
    'canvas_insert',  // 需要 DOM 操作，必须在主线程
    'insert_mermaid', // 需要渲染，必须在主线程
    // 'ai_analyze' - 不再委托，直接在 SW 执行
  ];
  return delegatedTools.includes(toolName);
}
```

**原因**:
1. 复杂的往返通信增加了故障点，页面刷新时容易断链
2. Service Worker 是独立于页面的后台进程，刷新不影响 SW 执行
3. 如果工具最终依赖 SW 执行（如 chat API），就应该直接在 SW 中实现
4. 只有真正需要 DOM/Canvas 操作的工具才应该委托给主线程

**判断标准**: 工具是否真正需要主线程
- ✅ 需要委托：DOM 操作、Canvas 渲染、获取用户输入
- ❌ 不需要委托：纯 API 调用、数据处理、文件操作

**Service Worker 更新注意**: 修改 SW 代码后需要重新加载才能生效：
1. Chrome DevTools → Application → Service Workers → 点击 "Update"
2. 或关闭所有使用该 SW 的标签页，重新打开

### Service Worker 更新后禁止自动刷新页面

**场景**: Service Worker 更新检测和页面刷新逻辑

❌ **错误示例**:
```typescript
// 错误：收到 SW 更新消息后自动刷新页面
navigator.serviceWorker.addEventListener('message', (event) => {
  if (event.data?.type === 'SW_UPDATED') {
    window.location.reload();  // 自动刷新会打断用户操作！
  }
});

navigator.serviceWorker.addEventListener('controllerchange', () => {
  window.location.reload();  // 自动刷新会打断用户操作！
});
```

✅ **正确示例**:
```typescript
// 正确：使用标志位，只有用户确认后才刷新
let userConfirmedUpgrade = false;

// 监听 SW_UPDATED 消息
navigator.serviceWorker.addEventListener('message', (event) => {
  if (event.data?.type === 'SW_UPDATED') {
    // 只有用户主动确认升级后才刷新页面
    if (!userConfirmedUpgrade) {
      return;  // 跳过自动刷新
    }
    setTimeout(() => window.location.reload(), 1000);
  }
});

// 监听 controller 变化
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (!userConfirmedUpgrade) {
    return;  // 跳过自动刷新
  }
  setTimeout(() => window.location.reload(), 1000);
});

// 监听用户确认升级事件
window.addEventListener('user-confirmed-upgrade', () => {
  userConfirmedUpgrade = true;
  // 触发 SW 跳过等待
  pendingWorker?.postMessage({ type: 'SKIP_WAITING' });
});
```

**原因**: 
- 自动刷新会打断用户正在进行的操作（编辑、生成任务等）
- 用户可能有未保存的工作，强制刷新会导致数据丢失
- 应该显示更新提示，让用户选择合适的时机刷新

**相关文件**:
- `apps/web/src/main.tsx` - Service Worker 注册和更新逻辑
- `components/version-update/version-update-prompt.tsx` - 版本更新提示组件

### 设置保存后需要主动更新 Service Worker 配置

**场景**: 用户在设置面板修改配置（如 API Key、流式请求开关）并保存后

❌ **错误示例**:
```typescript
// 错误：只保存到本地存储，不更新运行中的 SW 配置
const handleSave = async () => {
  geminiSettings.set({
    apiKey,
    baseUrl,
    imageStreamEnabled,  // 新增的配置
  });
  // SW 使用的仍是初始化时的旧配置！
};
```

✅ **正确示例**:
```typescript
// 正确：保存后同时更新 SW 配置
const handleSave = async () => {
  // 1. 保存到本地存储
  geminiSettings.set({
    apiKey,
    baseUrl,
    imageStreamEnabled,
  });

  // 2. 主动推送配置到运行中的 SW
  swTaskQueueClient.updateConfig({
    geminiConfig: {
      apiKey,
      baseUrl,
      imageStreamEnabled,
    },
  });
};
```

**原因**: 
- Service Worker 在初始化时接收配置（通过 `TASK_QUEUE_INIT` 消息）
- 之后 SW 使用内存中的配置，不会重新读取本地存储
- 如果用户修改设置后不调用 `updateConfig()`，SW 继续使用旧配置
- 这会导致用户开启的功能（如流式请求）看似保存成功但实际未生效

**通信协议**:
```typescript
// 主线程 → Service Worker
swTaskQueueClient.updateConfig({
  geminiConfig: { ... },  // 可选
  videoConfig: { ... },   // 可选
});

// SW 内部处理
case 'TASK_QUEUE_UPDATE_CONFIG':
  Object.assign(this.geminiConfig, data.geminiConfig);
  Object.assign(this.videoConfig, data.videoConfig);
  break;
```

### Service Worker 内部处理虚拟路径 URL

**场景**: 在 Service Worker 内部需要获取 `/__aitu_cache__/` 或 `/asset-library/` 等虚拟路径的资源时

❌ **错误示例: 使用 fetch 获取虚拟路径**
```typescript
// 错误：SW 内部的 fetch 不会触发 SW 的 fetch 事件拦截
async function processReferenceImage(url: string) {
  if (url.startsWith('/__aitu_cache__/')) {
    const response = await fetch(url);  // ❌ 这个请求不会被 SW 拦截！
    const blob = await response.blob();  // 会失败或返回 404
    return blobToBase64(blob);
  }
}
```

✅ **正确示例: 直接从 Cache API 获取**
```typescript
// 正确：直接从 Cache API 获取，绕过 fetch
async function processReferenceImage(url: string) {
  if (url.startsWith('/__aitu_cache__/')) {
    const cache = await caches.open(IMAGE_CACHE_NAME);
    // 缓存 key 是完整 URL（包含 origin）
    const cacheKey = `${self.location.origin}${url}`;
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const blob = await cachedResponse.blob();
      return blobToBase64(blob);
    }
  }
}
```

**原因**:
- Service Worker 的 fetch 事件只拦截来自页面（客户端）的请求
- SW 内部发起的 fetch 请求不会触发自身的 fetch 事件（避免无限循环）
- 因此必须直接从 Cache API 获取，而不是通过 fetch
- 注意缓存 key 是完整 URL，需要用 `self.location.origin` 构造

### 图像处理工具复用规范

**场景**: 需要对图片进行边框检测、去白边、裁剪等处理时

**核心工具文件**: `utils/image-border-utils.ts`

**可用的公共方法**:

| 方法 | 用途 | 返回值 |
|------|------|--------|
| `trimCanvasWhiteAndTransparentBorder` | 去除 Canvas 白边和透明边 | `HTMLCanvasElement` |
| `trimCanvasWhiteAndTransparentBorderWithInfo` | 去除边框并返回偏移信息 | `{ canvas, left, top, trimmedWidth, trimmedHeight, wasTrimmed }` |
| `trimImageWhiteAndTransparentBorder` | 去除图片 URL 的白边 | `Promise<string>` (data URL) |
| `trimCanvasBorders` | 去除 Canvas 边框（灰色+白色） | `HTMLCanvasElement \| null` |
| `removeWhiteBorder` | 去除图片白边（激进模式） | `Promise<string>` |

❌ **错误示例**:
```typescript
// 错误：在组件中重复实现去白边逻辑
const trimWhiteBorder = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // ... 50+ 行重复代码
};
```

✅ **正确示例**:
```typescript
// 正确：使用公共工具方法
import { 
  trimCanvasWhiteAndTransparentBorder,
  trimCanvasWhiteAndTransparentBorderWithInfo,
  trimImageWhiteAndTransparentBorder 
} from '../utils/image-border-utils';

// 只需要裁剪后的 Canvas
const trimmedCanvas = trimCanvasWhiteAndTransparentBorder(canvas);

// 需要知道裁剪偏移量（如计算插入位置）
const { canvas: trimmedCanvas, left, top } = trimCanvasWhiteAndTransparentBorderWithInfo(canvas);

// 处理图片 URL
const trimmedUrl = await trimImageWhiteAndTransparentBorder(imageDataUrl);
```

**使用场景**:
- 合并图片后去白边 → `trimCanvasWhiteAndTransparentBorderWithInfo`（需要偏移量）
- 生成预览图去白边 → `trimImageWhiteAndTransparentBorder`（异步处理 URL）
- 图片分割时去边框 → `trimCanvasBorders`（检测灰色+白色）

**原因**: 图像处理逻辑（像素遍历、边界检测）容易出错且代码量大。使用统一的公共方法可以：
1. 避免重复代码
2. 确保一致的处理行为
3. 便于统一优化和修复 bug

### 验证命令

修改代码后必须执行以下验证命令：

```bash
nx typecheck drawnix    # 类型检查
nx lint drawnix         # 代码规范
nx test drawnix         # 单元测试
pnpm run build          # 构建验证
```

### CSS !important 覆盖 JavaScript 动态样式

**场景**: 需要通过 JavaScript 动态设置元素样式（如光标、颜色、尺寸），但 CSS 中存在 `!important` 规则

❌ **错误示例**:
```scss
// SCSS 中使用 !important 固定光标样式
.plait-board-container {
  &.pointer-eraser {
    .board-host-svg {
      cursor: url('data:image/svg+xml;base64,...') 10 10, crosshair !important;
    }
  }
}
```
```typescript
// JavaScript 动态设置光标被 CSS !important 覆盖，无效
function applyCursorStyle(board: PlaitBoard, size: number) {
  const hostSvg = document.querySelector('.board-host-svg');
  hostSvg.style.cursor = generateCursorSvg(size); // 被 !important 覆盖！
}
```

✅ **正确示例**:
```scss
// SCSS 中不使用 !important，或完全移除静态规则
.plait-board-container {
  // 光标由 JavaScript 动态设置（usePencilCursor hook）
  // 不再使用固定大小的 CSS 光标
}
```
```typescript
// JavaScript 动态设置光标正常生效
function applyCursorStyle(board: PlaitBoard, size: number) {
  const hostSvg = document.querySelector('.board-host-svg');
  hostSvg.style.cursor = generateCursorSvg(size); // 正常生效
}
```

**原因**: CSS 的 `!important` 规则优先级高于 JavaScript 设置的内联样式。当需要动态控制样式时（如根据用户设置调整光标大小），必须移除 CSS 中的 `!important` 规则，否则 JavaScript 的样式设置会被完全覆盖。

**检查方法**: 如果 JavaScript 设置的样式不生效，在浏览器开发者工具中检查元素样式，查看是否有 `!important` 规则覆盖。

### Freehand 元素属性设置需要自定义 callback

**场景**: 修改 Freehand（手绘线条）元素的属性（如 strokeStyle、strokeColor）时

❌ **错误示例**:
```typescript
// 错误：直接使用 PropertyTransforms，Freehand 元素可能不被正确处理
const setStrokeStyle = (style: StrokeStyle) => {
  PropertyTransforms.setStrokeStyle(board, style, { getMemorizeKey });
};
```

✅ **正确示例**:
```typescript
// 正确：使用 callback 确保所有选中元素都被处理
export const setStrokeStyle = (board: PlaitBoard, strokeStyle: StrokeStyle) => {
  PropertyTransforms.setStrokeStyle(board, strokeStyle, {
    getMemorizeKey,
    callback: (element: PlaitElement, path: Path) => {
      Transforms.setNode(board, { strokeStyle }, path);
    },
  });
};
```

**原因**: `PropertyTransforms` 的默认行为可能不会处理所有类型的元素（如自定义的 Freehand 元素）。通过提供 `callback` 函数，可以确保对所有选中的元素执行属性设置操作。颜色设置（`setStrokeColor`、`setFillColor`）也使用了相同的模式。

### 性能指南
- 使用 `React.lazy` 对大型组件进行代码分割
- 对图片实现懒加载和预加载
- 避免在 render 中创建新对象/函数
- 对长列表考虑使用虚拟化

### 安全指南
- 验证和清理所有用户输入
- 永远不要硬编码敏感信息（API keys 等）
- 对 API 调用使用适当的错误处理
- 在日志中过滤敏感信息

---

## 品牌设计规范

### 色彩系统
- **主色调**:
  - 橙金色: `#F39C12`, `#E67E22`, `#D35400`
  - 蓝紫色: `#5A4FCF`, `#7B68EE`, `#9966CC`
  - 创作强调: `#E91E63`, `#F06292`
- **渐变**:
  - 品牌: `linear-gradient(135deg, #F39C12 0%, #E67E22 30%, #5A4FCF 70%, #E91E63 100%)`
  - 笔刷: `linear-gradient(135deg, #5A4FCF 0%, #7B68EE 50%, #E91E63 100%)`
  - 胶片: `linear-gradient(135deg, #F39C12 0%, #E67E22 50%, #D35400 100%)`

### 字体
- **字体栈**: `'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif`
- **尺寸**: xs(12px), sm(14px), base(16px), lg(18px), xl(20px), 2xl(24px), 3xl(30px), 4xl(36px)

### 组件设计
- **按钮**: 8px 圆角，主按钮使用品牌渐变，12px/24px 内边距
- **卡片**: 12px 圆角，白色背景，微妙阴影，24px 内边距
- **输入框**: 8px 圆角，浅色背景，2px 聚焦边框
- **动画**: 150-300ms 过渡，ease-out 曲线

### 独立页面配色一致性

**场景**: 创建独立的 HTML 页面（如调试面板、工具页面）时

独立页面应使用与主应用一致的品牌配色，而不是使用默认的蓝色系或其他配色。

**品牌色 CSS 变量模板**:
```css
:root {
  /* 主品牌色 - 橙金色系 */
  --primary-color: #F39C12;
  --primary-hover: #E67E22;
  --primary-active: #D35400;
  --primary-light: #FEF5E7;
  /* 成功色 */
  --success-color: #00B894;
  --success-light: rgba(0, 184, 148, 0.1);
  /* 警告色 */
  --warning-color: #E67E22;
  --warning-light: rgba(230, 126, 34, 0.1);
  /* 错误色 - 玫红色系 */
  --error-color: #E91E63;
  --error-light: rgba(233, 30, 99, 0.1);
  /* 信息色 - 蓝紫色系 */
  --info-color: #5A4FCF;
}

/* 深色模式 */
[data-theme="dark"] {
  --primary-color: #FBBF24;
  --primary-hover: #F39C12;
  --primary-active: #E67E22;
  --primary-light: rgba(251, 191, 36, 0.15);
  --success-color: #10B981;
  --error-color: #F06292;
  --info-color: #7B68EE;
}
```

**适用页面**:
- `apps/web/public/sw-debug.html` - Service Worker 调试面板
- 其他独立工具页面

---

## MCP 工具系统

项目使用 MCP (Model Context Protocol) 模式处理 AI 操作：

**位置**: `packages/drawnix/src/mcp/`

**核心工具**:
- `ai_analyze` - AI 分析 (Gemini 文本模型)
- `generate_image` - 图片生成 (Gemini Imagen)
- `generate_video` - 视频生成 (Veo3, Sora-2)
- `canvas_insert` - 插入内容到画布

**工作流**: `AIInputBar` → `workflow-converter` → MCP 工具 → 任务队列

---

## AI 输入语法

### 模型选择器
AI 输入框左下角显示 `@shortCode` 格式的模型选择器（如 `@nb2v`）：
- 点击可展开模型列表选择
- 在输入框中输入 `@` 可触发模型建议面板，支持过滤搜索
- 使用 ↑/↓ 键导航，Tab/Enter 选择，Escape 关闭

### 模型短代码 (shortCode)
| shortCode | 模型名称 | 说明 |
|-----------|----------|------|
| `nb2v` | nano-banana-2-vip | Gemini 3 Pro VIP |
| `nb22kv` | nano-banana-2-2k-vip | 2K 高清 VIP |
| `nb24kv` | nano-banana-2-4k-vip | 4K 超高清 VIP |
| `nbv` | nano-banana-vip | 快速生成 VIP |
| `gpt15` | gpt-image-1.5 | GPT 图片模型 |
| `nb2` | nano-banana-2 | Gemini 3 Pro |
| `nb` | nano-banana | 快速生成 |

### 参数语法
- `-param=value` - 设置参数 (如 `-size=1:1`, `-duration=8`)
- `+count` - 设置生成数量 (如 `+4` 生成 4 张图)

### 布局说明
输入框采用底部固定布局：
- 底部栏（模型选择器 + 发送按钮）固定不动
- 输入区域聚焦时向上扩展，最大高度 200px

### AI 输入栏与灵感板无缝连接

当画布为空时，`InspirationBoard` 和 `AIInputBar` 会无缝连接成一个整体卡片：

**实现方式**：
- 父容器 `.ai-input-bar` 添加 `--with-inspiration` 修饰符时：
  - 设置 `gap: 0` 移除组件间距
  - 使用 `::before` 伪元素创建统一的背景和阴影
- `InspirationBoard`：上圆角 (24px)，下直角，无阴影
- `AIInputBar__container`：上直角，下圆角 (24px)，无阴影

**相关文件**：
- `components/ai-input-bar/AIInputBar.tsx` - 通过 `showInspirationBoard` 状态控制 class
- `components/ai-input-bar/ai-input-bar.scss` - 父容器伪元素和子组件样式
- `components/inspiration-board/inspiration-board.scss` - 灵感板样式

**技术要点**：
- 使用 CSS 伪元素 `::before` 在父容器层统一处理背景和阴影
- 子组件设置 `box-shadow: none` 避免重叠阴影产生分割线
- 通过 React 状态动态添加 `ai-input-bar--with-inspiration` class

---

## 数据分析追踪

### 声明式追踪系统 (`packages/drawnix/src/services/tracking/`)

使用 Umami 支持的双重追踪方案：

1. **手动追踪** - 用于 AI 生成、API 调用和复杂业务逻辑
2. **声明式追踪** - UI 元素使用 `data-track` 属性:
```tsx
<button data-track="button_click_save">保存</button>
<ToolButton data-track="toolbar_click_undo" />
```

**事件命名**: `{area}_{action}_{target}` 使用 snake_case (如 `toolbar_click_save`)

---

## 配置文件说明

| 文件 | 说明 |
|------|------|
| `package.json` | 项目主配置，依赖和脚本 |
| `nx.json` | Nx monorepo 配置 |
| `tsconfig.base.json` | TypeScript 基础配置 |
| `tailwind.config.js` | Tailwind CSS 配置 |
| `vite.config.ts` | Vite 构建配置 |
| `.eslintrc.json` | ESLint 代码检查配置 |
| `.prettierrc` | Prettier 格式化配置 |
| `pnpm-lock.yaml` | pnpm 依赖锁定文件 |

---

## 图片合并系统

### 概述

支持将多个元素（图片、文字、图形、线条、手绘等）合并为单张图片，自动裁剪透明边框。

**核心文件**：
- `components/toolbar/popup-toolbar/popup-toolbar.tsx` - 合并按钮和处理逻辑

### 支持的元素类型

合并功能支持以下元素类型：
- 图片元素
- 包含文字的绘图元素
- 图形元素（矩形、圆形等）
- 箭头线和矢量线
- 表格
- 手绘元素
- 思维导图元素

**排除**：视频元素和工具元素（内嵌网页）

### 合并流程

```
用户选中多个元素 → 点击合并按钮
  ↓
toImage() - 将元素转换为图片（ratio=2，2倍清晰度）
  ↓
加载图片到 Canvas
  ↓
检测透明边框（严格模式：alpha=0）
  ├── 从上下左右四个方向扫描
  └── 找到第一个包含非透明像素的行/列
  ↓
裁剪透明边框
  ├── 创建新 canvas，只包含有内容的区域
  └── 转换为 PNG data URL
  ↓
计算插入位置（考虑裁剪偏移和缩放比例）
  ↓
删除原元素 → 插入合并后的图片
```

### 透明边框裁剪

**问题**：`toImage` 生成的图片周围可能有透明区域（白边）

**解决方案**：自动检测并裁剪完全透明的边缘

**关键代码**：
```typescript
// 严格模式：只裁剪完全透明的边缘
const alphaThreshold = 0;

// 检测一行是否完全透明
const isRowTransparent = (y: number): boolean => {
  for (let x = 0; x < width; x++) {
    const idx = (y * width + x) * 4;
    if (data[idx + 3] > alphaThreshold) return false;
  }
  return true;
};

// 从四个方向扫描找到边界
let top = 0;
while (top < height && isRowTransparent(top)) top++;
// ... 同样处理 bottom, left, right

// 计算插入位置（考虑裁剪偏移和缩放比例）
const scale = 2; // ratio 参数
const insertX = boundingRect.x + (left / scale);
const insertY = boundingRect.y + (top / scale);
```

### 技术要点

- **高清晰度**：使用 `ratio: 2` 生成 2倍清晰度图片
- **透明背景**：使用 `fillStyle: 'transparent'` 保持透明度
- **严格裁剪**：只裁剪完全透明（alpha=0）的边缘，保留半透明内容（如阴影、抗锯齿）
- **位置精确**：考虑裁剪偏移量和缩放因子，确保图片位置准确
- **保持层级**：按元素在画布中的顺序排序，保持正确的层级关系

### 使用场景

- ✅ 合并文字和图片创建海报
- ✅ 合并多个图形元素
- ✅ 合并手绘内容
- ✅ 导出选中区域为图片

---

## 图片分割系统

### 概述

项目支持智能图片分割功能，可以自动检测并拆分包含多个子图的图片。

**核心文件**：
- `utils/image-splitter.ts` - 主分割器（支持网格分割线和透明分割线）
- `utils/image-border-utils.ts` - 边框检测工具
- `utils/photo-wall-splitter.ts` - 灵感图分割器

### 支持的图片格式

1. **网格分割线格式**
   - 白色分割线（RGB >= 240）
   - 透明分割线（alpha = 0，100% 透明）
   - 支持标准宫格（2x2, 3x3, 4x4 等）和不规则布局

2. **灵感图格式**
   - 灰色背景 + 白边框图片
   - 自动检测白色边框区域

### 透明边框裁剪

对于透明背景图片（如合并图片还原），使用**严格模式**裁剪透明边框：

**核心函数**：`trimTransparentBorders(imageData, strict)`

**严格模式** (`strict = true`，默认)：
- 只裁剪完全透明的边缘（alpha = 0）
- 保留任何包含非透明像素的区域（alpha > 0）
- 避免误裁剪半透明内容（如抗锯齿边缘）

**非严格模式** (`strict = false`)：
- 裁剪半透明边缘（alpha < 50）
- 适用于需要去除模糊边缘的场景

**技术细节**：
```typescript
// 严格模式：只有 alpha = 0 才认为是透明
const alphaThreshold = strict ? 0 : 50;

// 检测整行是否完全透明
const isRowTransparent = (y: number): boolean => {
  for (let x = 0; x < width; x++) {
    const alpha = data[(y * width + x) * 4 + 3];
    if (alpha > alphaThreshold) {
      return false; // 发现非透明像素
    }
  }
  return true;
};
```

### 分割流程

```
用户点击拆图按钮
  ↓
hasSplitLines() - 快速检测是否包含分割线
  ↓
trimImageWhiteBorders() - 去除外围白边
  ↓
detectGridLines() - 检测网格分割线
  ├── 白色分割线检测（普通图片）
  └── 透明分割线检测（透明图片，要求 100% 透明）
  ↓
splitImageByLines() - 按分割线拆分
  ├── 标准宫格：精确等分，不去白边
  └── 非标准布局：按检测到的分割线拆分
  ↓
trimTransparentBorders(strict=true) - 严格裁剪透明边框
  ↓
插入到画板
```

### 关键 API

```typescript
// 检测是否包含分割线
await hasSplitLines(imageUrl: string): Promise<boolean>

// 检测网格分割线
await detectGridLines(imageUrl: string, forceTransparency?: boolean): Promise<GridDetectionResult>

// 拆分并插入到画板
await splitAndInsertImages(
  board: PlaitBoard,
  imageUrl: string,
  options?: {
    sourceRect?: SourceImageRect;
    startPoint?: Point;
    scrollToResult?: boolean;
  }
): Promise<{ success: boolean; count: number; error?: string }>

// 严格裁剪透明边框
trimTransparentBorders(imageData: ImageData, strict: boolean = true)
```

### 使用场景

**适用场景**：
- ✅ AI 生成的宫格图（4x4, 3x3 等）
- ✅ 合并图片还原（透明分割线）
- ✅ 灵感图拆分（灰色背景 + 白边框）
- ✅ 递归拆分（嵌套的宫格图）

**不适用场景**：
- ❌ 单张图片（无分割线）
- ❌ 分割线不明显的图片
- ❌ 需要手动指定分割位置的场景

### 性能优化

- 采样检测：透明度检测时每隔 10 个像素采样一次
- 提前终止：遇到非透明像素立即停止扫描
- 递归限制：最多递归 2 层，最多拆分 25 个子图
- 尺寸限制：子图小于 100x100 像素时不再拆分

---

## 开发规范

### API 轮询与任务恢复规则

**场景**: 视频生成等需要轮询的 API 调用，以及页面刷新后的任务恢复

#### 错误 1: 轮询时不区分业务失败和网络错误

❌ **错误示例**:
```typescript
// 所有错误都重试 - 错误！业务失败不应重试
while (attempts < maxAttempts) {
  try {
    const response = await fetch(`${baseUrl}/videos/${videoId}`);
    const data = await response.json();
    
    if (data.status === 'failed') {
      throw new Error(data.error.message);  // 这个错误会被 catch 重试
    }
  } catch (err) {
    // 所有错误都重试 - 业务失败也会重试！
    consecutiveErrors++;
    await sleep(backoffInterval);
  }
}
```

✅ **正确示例**:
```typescript
// 区分业务失败和网络错误
class VideoGenerationFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoGenerationFailedError';
  }
}

while (attempts < maxAttempts) {
  try {
    const response = await fetch(`${baseUrl}/videos/${videoId}`);
    const data = await response.json();
    
    if (data.status === 'failed') {
      // 使用特殊错误类型，不应重试
      throw new VideoGenerationFailedError(data.error.message);
    }
  } catch (err) {
    // 业务失败直接抛出，不重试
    if (err instanceof VideoGenerationFailedError) {
      throw err;
    }
    // 只有网络错误才重试
    consecutiveErrors++;
    await sleep(backoffInterval);
  }
}
```

**原因**: 业务失败（如 `generation_failed`、`INVALID_ARGUMENT`）是 API 明确返回的错误，重试也不会成功，只会浪费时间。网络错误是临时的，重试可能成功。

---

#### 错误 2: 页面刷新后自动恢复所有失败任务

❌ **错误示例**:
```typescript
// 恢复所有有 remoteId 的失败任务 - 错误！
const failedTasks = storedTasks.filter(task =>
  task.status === 'failed' && task.remoteId
);
failedTasks.forEach(task => {
  // 所有失败任务都恢复
  taskService.updateStatus(task.id, 'processing');
});
```

✅ **正确示例**:
```typescript
// 只恢复网络错误导致的失败任务
const isNetworkError = (task: Task): boolean => {
  const errorMsg = `${task.error?.message || ''} ${task.error?.details?.originalError || ''}`.toLowerCase();
  
  // 排除业务失败 - 这些不应该自动恢复
  const isBusinessFailure = (
    errorMsg.includes('generation_failed') ||
    errorMsg.includes('invalid_argument') ||
    errorMsg.includes('prohibited') ||
    errorMsg.includes('content policy')
  );
  if (isBusinessFailure) return false;
  
  // 只有网络错误才恢复
  return (
    errorMsg.includes('failed to fetch') ||
    errorMsg.includes('network') ||
    errorMsg.includes('timeout')
  );
};

// 只恢复视频/角色任务（图片任务不恢复，因为每次调用都扣费）
const failedVideoTasks = storedTasks.filter(task =>
  task.type === TaskType.VIDEO &&
  task.status === 'failed' &&
  task.remoteId &&
  isNetworkError(task)
);
```

**原因**:
1. **业务失败不恢复**：API 返回的明确失败（如内容违规）重试也不会成功
2. **图片任务不恢复**：图片生成是同步调用，每次重试都会扣费
3. **视频任务可恢复**：视频有 `remoteId`，重新查询状态不会产生额外费用

---

#### 任务恢复决策表

| 任务类型 | 错误类型 | 是否自动恢复 | 原因 |
|---------|---------|-------------|------|
| 视频/角色 | 网络错误 | ✅ 是 | 查询状态不扣费 |
| 视频/角色 | 业务失败 | ❌ 否 | 重试也不会成功 |
| 图片 | 任何错误 | ❌ 否 | 每次调用都扣费 |

---

### 生产代码禁止保留调试日志

**场景**: 开发调试时添加的 `console.log` 语句未在提交前清理

❌ **错误示例**:
```typescript
// 调试日志遗留在生产代码中
const handleZoomPercentClick = useCallback(() => {
  console.log('[ViewNavigation] Zoom percent clicked, current state:', zoomMenuOpen);
  setZoomMenuOpen((prev) => !prev);
}, [zoomMenuOpen]);

// Popover 中的调试日志
<Popover
  onOpenChange={(open) => {
    console.log('[Popover] onOpenChange:', open);
    setZoomMenuOpen(open);
  }}
>
```

✅ **正确示例**:
```typescript
// 清理调试日志，保持代码简洁
const handleZoomPercentClick = useCallback(() => {
  setZoomMenuOpen((prev) => !prev);
}, []);

// 直接传递 setter 函数
<Popover onOpenChange={setZoomMenuOpen}>
```

**原因**:
1. 调试日志会污染用户控制台，影响体验
2. 暴露内部实现细节，存在安全隐患
3. 增加打包体积和运行时开销
4. 代码 Review 时容易被忽略，形成技术债

**例外情况**:
- `console.error` / `console.warn` 用于记录真正的错误/警告是允许的
- 带有 `[DEBUG]` 前缀且通过环境变量控制的日志可以保留

---

### 组件空状态不应简单返回 null

**场景**: 组件在没有数据时需要决定是否渲染

❌ **错误示例**:
```tsx
// 错误：没有历史记录时直接隐藏整个组件，用户看不到预设提示词
const PromptHistoryPopover = () => {
  const { history } = usePromptHistory();
  
  // 没有历史记录就不显示按钮
  if (history.length === 0) {
    return null;
  }
  
  return (
    <button>提示词</button>
    // ...
  );
};
```

✅ **正确示例**:
```tsx
// 正确：即使没有历史记录也显示按钮，展示预设提示词
const PromptHistoryPopover = () => {
  const { history } = usePromptHistory();
  const presetPrompts = getPresetPrompts();
  
  // 合并历史记录和预设提示词
  const allPrompts = [...history, ...presetPrompts];
  
  // 按钮始终显示
  return (
    <button>提示词</button>
    // 面板中显示历史 + 预设
  );
};
```

**原因**: 
1. 组件的核心功能（如提示词选择）不应该依赖于是否有历史数据
2. 预设内容为新用户提供了引导，提升首次使用体验
3. 隐藏入口会让用户不知道功能存在

---

### 文案应考虑所有使用场景

**场景**: 为组件、按钮、标题等编写文案时

❌ **错误示例**:
```tsx
// 错误：标题"历史提示词"在没有历史记录时不贴切
<PromptListPanel
  title={language === 'zh' ? '历史提示词' : 'Prompt History'}
  items={promptItems}  // 可能包含历史记录 + 预设提示词
/>
```

✅ **正确示例**:
```tsx
// 正确：使用更通用的标题"提示词"
<PromptListPanel
  title={language === 'zh' ? '提示词' : 'Prompts'}
  items={promptItems}
/>
```

**原因**:
1. 文案过于具体会在某些场景下显得不准确
2. 通用的文案能适应更多使用场景（有/无历史记录）
3. 避免后续因场景变化而频繁修改文案

---

### UI 重构时必须保持信息完整性

**场景**: 重构 UI 样式（如简化布局、统一风格）时

❌ **错误示例**:
```typescript
// 重构前：显示完整的性能信息
entry.innerHTML = `
  <span class="log-perf">⚡ 任务时长: ${duration}ms | FPS: ${fps}</span>
  <span class="log-memory">📊 ${usedMB} MB / ${limitMB} MB (${percent}%)</span>
`;

// 重构后：为了"简化"只显示时长徽章，丢失了 FPS 和内存信息
let perfBadge = '';
if (log.performance?.longTaskDuration) {
  perfBadge = `<span class="log-duration">${duration}ms</span>`;
}
// ❌ FPS、内存信息没有了！
```

✅ **正确示例**:
```typescript
// 重构后：样式简化但信息完整
let perfText = '';
if (log.performance) {
  const parts = [];
  if (log.performance.longTaskDuration) {
    parts.push(`任务时长: ${log.performance.longTaskDuration.toFixed(0)}ms`);
  }
  if (log.performance.fps !== undefined) {
    parts.push(`FPS: ${log.performance.fps}`);
  }
  perfText = parts.join(' | ');
}
// ✅ 所有原有信息都保留
```

**检查清单**:
- 重构前列出所有显示的信息项
- 重构后逐一核对是否都有展示
- 用真实数据测试，确认信息完整

**原因**: 样式重构的目的是优化视觉呈现，而不是删减功能。用户依赖这些信息进行问题诊断，丢失信息会影响使用体验。

---

### 日志/数据保留应优先保留问题记录

**场景**: 实现日志、任务历史等有容量上限的列表时

❌ **错误示例**:
```typescript
// 简单 FIFO，新日志进来就删除最旧的
state.logs.unshift(newLog);
if (state.logs.length > MAX_LOGS) {
  state.logs.pop();  // ❌ 可能删掉重要的错误日志
}
```

✅ **正确示例**:
```typescript
// 优先保留问题记录
function isProblemLog(log) {
  if (log.status >= 400 || log.error) return true;  // 错误请求
  if (log.duration >= 1000) return true;  // 慢请求
  return false;
}

function trimLogsWithPriority(maxLogs) {
  // 分类
  const bookmarked = logs.filter(l => isBookmarked(l.id));
  const problems = logs.filter(l => !isBookmarked(l.id) && isProblemLog(l));
  const normal = logs.filter(l => !isBookmarked(l.id) && !isProblemLog(l));
  
  // 优先保留：收藏 > 问题 > 正常
  const mustKeep = bookmarked.length + problems.length;
  if (mustKeep >= maxLogs) {
    state.logs = [...bookmarked, ...problems.slice(0, maxLogs - bookmarked.length)];
  } else {
    state.logs = [...bookmarked, ...problems, ...normal.slice(0, maxLogs - mustKeep)];
  }
}
```

**保留优先级**:
1. 用户收藏/标记的记录
2. 错误记录（状态码 >= 400、有 error 字段）
3. 慢请求（耗时 >= 1s）
4. 正常记录

**原因**: 正常请求通常不需要回溯，而问题请求是排查问题的关键依据。如果问题请求被正常请求挤掉，会大大增加问题定位难度。

---

## 相关文档

- `/docs/CODING_STANDARDS.md` - 完整编码规范
- `/docs/VERSION_CONTROL.md` - 版本控制
- `/docs/Z_INDEX_GUIDE.md` - Z-Index 层级管理规范
- `/docs/CFPAGE-DEPLOY.md` - Cloudflare 部署指南
- `/docs/PWA_ICONS.md` - PWA 配置
- `/docs/POSTHOG_MONITORING.md` - 监控配置
- `/docs/TRANSPARENT_BORDER_TRIM.md` - 透明边框裁剪技术文档
- `/docs/MERGED_IMAGE_SPLITTING.md` - 合并图片拆分功能文档
- `/docs/TEXT_PASTE_FEATURE.md` - 文本粘贴功能文档
- `/docs/UPDATE_CLAUDE_MD_COMMAND.md` - update-claude-md 命令使用说明
- `/specs/005-declarative-tracking/` - 声明式追踪详细文档
- `/openspec/AGENTS.md` - OpenSpec 规范说明

---

## OpenSpec 说明

当请求涉及以下内容时，请先打开 `@/openspec/AGENTS.md`：
- 提及计划或提案 (如 proposal, spec, change, plan)
- 引入新功能、破坏性变更、架构调整或重大性能/安全工作
- 需要权威规范才能编码的模糊情况

---

## 快速参考

### 启动开发
```bash
pnpm install
pnpm start
# 访问 http://localhost:7200
```

### 关键入口文件
- 应用入口: `apps/web/src/main.tsx`
- 编辑器组件: `packages/drawnix/src/drawnix.tsx`
- AI 服务: `packages/drawnix/src/services/generation-api-service.ts`
- 任务队列: `packages/drawnix/src/services/task-queue-service.ts`
- 字体管理: `packages/drawnix/src/services/font-manager-service.ts`
- 备份恢复: `packages/drawnix/src/services/backup-restore-service.ts`
- 统一缓存: `packages/drawnix/src/services/unified-cache-service.ts`
- service worker源码：`apps/web/src/sw/index.ts`

### 重要 Context
- `DrawnixContext` - 编辑器状态
- `AssetContext` - 资产管理
- `ChatDrawerContext` - 聊天抽屉
- `WorkflowContext` - 工作流


