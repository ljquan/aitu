# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指导。

---

## 项目概述

**Aitu (爱图)** 是一个基于 Plait 框架构建的开源白板应用。支持思维导图、流程图、自由绘画、图片插入，以及 AI 驱动的内容生成（通过 Gemini 生成图片，通过 Veo3/Sora-2 生成视频）。项目采用插件架构，使用 React 组件，并使用 Nx 作为 monorepo 管理工具。

**项目信息：**
- **名称**: Aitu (爱图) - AI 图片与视频创作工具
- **版本**: 0.4.0
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
│   ├── hooks/                     # React Hooks (24个)
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
│   └── mermaid-to-drawnix.tsx     # Mermaid 转换
├── settings-dialog/               # 设置对话框
├── project-drawer/                # 项目抽屉
├── task-queue/                    # 任务队列 UI
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
├── media-cache-service.ts         # 媒体缓存 (IndexedDB)
├── url-cache-service.ts           # URL 缓存
├── toolbar-config-service.ts      # 工具栏配置
├── prompt-storage-service.ts      # 历史提示词存储
├── font-manager-service.ts        # 字体管理服务（加载和缓存）
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
├── image-border-utils.ts          # 图片边框检测工具
├── photo-wall-splitter.ts         # 灵感图分割器
├── selection-utils.ts             # 选择工具
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
        ├── fingerprint.ts         # 任务指纹（去重）
        └── lock.ts                # 任务锁（防并发）
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
                    ↘ FAILED → RETRYING → PENDING (重试)
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
- 自动保存用户发送的提示词（最多 20 条）
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

### React 组件规范
- 使用函数组件和 Hooks
- 使用 `React.memo` 优化重渲染
- 事件处理器使用 `useCallback` 包装
- Hook 顺序：状态 hooks → 副作用 hooks → 事件处理器 → 渲染逻辑

### CSS/SCSS 规范
- 使用 BEM 命名规范
- 优先使用设计系统 CSS 变量
- 属性顺序：定位 → 盒模型 → 外观 → 排版 → 动画

### Git 提交规范
- 格式: `<type>(<scope>): <subject>`
- 类型: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

### 重要规则
- **UI 框架**: 使用 TDesign React，配置浅色主题
- **Tooltips**: 始终使用 `theme='light'`
- **文件大小限制**: 单个文件不超过 500 行
- **文档语言**: 规格文档使用中文

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

## 相关文档

- `/docs/CODING_STANDARDS.md` - 完整编码规范
- `/docs/VERSION_CONTROL.md` - 版本控制
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
- service worker源码：'apps/web/src/sw/index.ts'

### 重要 Context
- `DrawnixContext` - 编辑器状态
- `AssetContext` - 资产管理
- `ChatDrawerContext` - 聊天抽屉
- `WorkflowContext` - 工作流


