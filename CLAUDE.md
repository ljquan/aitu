# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指导。

---

## 项目概述

**Aitu (爱图)** 是一个基于 Plait 框架构建的开源白板应用。支持思维导图、流程图、自由绘画、图片插入，以及 AI 驱动的内容生成（通过 Gemini 生成图像，通过 Veo3/Sora-2 生成视频）。项目采用插件架构，使用 React 组件，并使用 Nx 作为 monorepo 管理工具。

**项目信息：**
- **名称**: Aitu (爱图) - AI 图像与视频创作工具
- **版本**: 0.4.0
- **许可证**: MIT
- **标语**: 爱上图像，爱上创作
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
│   ├── ai-image-generation.tsx    # 图像生成
│   ├── ai-video-generation.tsx    # 视频生成
│   ├── batch-image-generation.tsx # 批量图像生成
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
├── with-image.tsx                 # 图像插件
├── with-video.ts                  # 视频支持
├── with-workzone.ts               # WorkZone 画布元素插件
├── with-mind-extend.tsx           # 思维导图扩展
├── with-text-link.tsx             # 文本链接
├── with-common.tsx                # 通用插件
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
├── useTaskExecutor.ts             # 任务执行器 (核心)
├── useChatHandler.ts              # 聊天处理
├── useAutoInsertToCanvas.ts       # 自动插入画布
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
├── image-splitter.ts              # 图像分割
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
├── image-aspect-ratios.ts         # 图像宽高比
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
- **Google Gemini API**: 图像生成
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

### AI 生成流程
```
用户输入
  ↓
AIInputBar (输入组件)
  ↓
TTDDialog (对话框)
  ↓
GenerationAPIService (API 调用)
  ↓
Gemini API / 视频 API
  ↓
TaskQueueService (任务管理)
  ↓
TaskExecutor Hook (执行逻辑)
  ↓
Canvas 插入 / 媒体库缓存
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
      ├── withVideo (视频支持)
      ├── withWorkZone (工作流进度)
      └── ...
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

**技术要点**：
- 使用 SVG `foreignObject` 在画布中嵌入 React 组件
- 使用 XHTML 命名空间确保 DOM 元素正确渲染
- 需要在 `pointerdown` 阶段阻止事件冒泡，避免 Plait 拦截点击事件
- WorkZone 元素被选中时不触发 popup-toolbar（在 `popup-toolbar.tsx` 中过滤）
- AIInputBar 发送工作流时不自动展开 ChatDrawer（通过 `autoOpen: false` 参数控制）
- WorkZone 位置策略：有选中元素放右侧，无选中放所有元素右下方，画布为空放视口中心

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
- `generate_image` - 图像生成 (Gemini Imagen)
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

## 相关文档

- `/docs/CODING_STANDARDS.md` - 完整编码规范
- `/docs/VERSION_CONTROL.md` - 版本控制
- `/docs/CFPAGE-DEPLOY.md` - Cloudflare 部署指南
- `/docs/PWA_ICONS.md` - PWA 配置
- `/docs/POSTHOG_MONITORING.md` - 监控配置
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
- service worker源码：'apps/web/src/sw/index.ts'

### 重要 Context
- `DrawnixContext` - 编辑器状态
- `AssetContext` - 资产管理
- `ChatDrawerContext` - 聊天抽屉
- `WorkflowContext` - 工作流


