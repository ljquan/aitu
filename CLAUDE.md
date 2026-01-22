# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指导。

---

## 项目概述

**Aitu (爱图)** 是一个基于 Plait 框架构建的开源白板应用。支持思维导图、流程图、自由绘画、图片插入，以及 AI 驱动的内容生成（通过 Gemini 生成图片，通过 Veo3/Sora-2 生成视频）。

| 属性 | 值 |
|------|-----|
| 名称 | Aitu (爱图) - AI 图片与视频创作工具 |
| 版本 | 0.5.0 |
| 许可证 | MIT |
| 官网 | https://opentu.ai |

---

## 开发命令

```bash
# 开发
pnpm start              # 启动开发服务器 (localhost:7200)
pnpm run build          # 构建所有包
pnpm run build:web      # 仅构建 Web 应用

# 测试与检查
pnpm test               # 运行所有测试
pnpm nx test <项目名>    # 运行特定项目的测试
pnpm nx lint <项目名>    # 检查代码规范
cd packages/drawnix && npx tsc --noEmit  # 类型检查

# 版本发布
pnpm run version:patch  # 升级补丁版本 (0.0.x)
pnpm run version:minor  # 升级次版本 (0.x.0)
pnpm run release        # 构建并打包发布
```

---

## 项目架构

```
aitu/
├── apps/
│   ├── web/                    # 主 Web 应用 (Vite + React)
│   └── web-e2e/                # E2E 测试 (Playwright)
├── packages/
│   ├── drawnix/                # 核心白板库 (362+ TS 文件)
│   │   ├── components/         # UI 组件 (43 个)
│   │   ├── services/           # 业务服务 (32 个)
│   │   ├── plugins/            # Plait 插件 (15 个)
│   │   ├── hooks/              # React Hooks (27 个)
│   │   └── utils/              # 工具函数 (33 个)
│   ├── react-board/            # Plait React 适配层
│   └── react-text/             # 文本编辑组件 (Slate.js)
├── docs/                       # 项目文档
├── openspec/                   # OpenSpec 规范
└── specs/                      # 功能规格说明
```

### 关键入口文件

| 文件 | 说明 |
|------|------|
| `apps/web/src/main.tsx` | 应用入口 |
| `packages/drawnix/src/drawnix.tsx` | 主编辑器组件 |
| `apps/web/src/sw/index.ts` | Service Worker |
| `packages/drawnix/src/services/generation-api-service.ts` | AI 生成服务 |
| `packages/drawnix/src/services/task-queue-service.ts` | 任务队列服务 |

### 重要 Context

- `DrawnixContext` - 编辑器状态（指针模式、对话框）
- `AssetContext` - 素材库管理
- `WorkflowContext` - AI 工作流状态
- `ChatDrawerContext` - 聊天抽屉状态

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | React 18.3, TypeScript 5.4, Vite 6.2 |
| 构建工具 | Nx 19.3, pnpm, SWC |
| UI 框架 | TDesign React, Tailwind CSS, Lucide React |
| 绘图框架 | Plait ^0.84, Slate.js, RoughJS, Mermaid |
| AI/API | Gemini API, Veo3, Sora-2 |
| 状态管理 | React Context, RxJS, LocalForage |
| 测试 | Vitest, Playwright |

---

## 核心架构概念

### AI 生成流程

```
AIInputBar → swTaskQueueService.createTask()
    ↓ postMessage
Service Worker (后台执行)
    ├── ImageHandler / VideoHandler
    └── IndexedDB 持久化
    ↓ broadcastToClients
应用层 → Canvas 插入 / 媒体库缓存
```

**核心特性**：页面刷新不影响任务执行，通过 `remoteId` 恢复视频轮询。

### 素材库数据来源

1. **本地上传素材** → IndexedDB 元数据 + Cache Storage 数据
2. **AI 生成素材** → 任务队列已完成任务
3. **Cache Storage 媒体** → `/__aitu_cache__/` 前缀

**设计原则**：Cache Storage 是唯一数据真相，IndexedDB 只存元数据。

### 插件系统

采用 `withXxx` 组合式模式：`withTool`, `withFreehand`, `withImage`, `withVideo`, `withWorkzone` 等。

---

## 核心编码规则

> 详细规则和错误示例请参考 `docs/CODING_RULES.md`

### 必须遵守

1. **文件大小限制**：单个文件不超过 500 行
2. **类型定义**：对象用 `interface`，联合类型用 `type`，避免 `any`
3. **组件规范**：函数组件 + Hooks，事件处理器用 `useCallback`
4. **定时器清理**：`setInterval` 必须保存 ID，提供 `destroy()` 方法
5. **API 请求**：禁止重试，区分业务失败和网络错误
6. **调试日志**：提交前必须清理 `console.log`
7. **敏感信息**：永不硬编码 API Key，使用 `sanitizeObject` 过滤日志

### Service Worker 规则

1. SW 和主线程模块不共享，各自维护独立副本
2. 虚拟路径（`/__aitu_cache__/`）由 SW 拦截返回 Cache Storage 数据
3. SW 内部获取缓存数据应直接读取 Cache API，不使用 fetch
4. 更新后禁止自动刷新页面，需用户确认

### React 规则

1. Context 回调中必须使用函数式更新 `setState(prev => ...)`
2. Hover 延迟操作需要正确的计时器清理
3. 第三方窗口需用 `createPortal` 保持 React 事件流
4. 图标组件使用 `React.FC`，支持 `size` 属性

### 缓存规则

1. IndexedDB 元数据必须验证 Cache Storage 实际数据存在
2. 本地缓存图片只存 Cache Storage，不存 IndexedDB 元数据
3. Cache API 返回前必须验证响应有效性（`blob.size > 0`）

---

## 品牌设计

### 核心色彩

| 用途 | 颜色 |
|------|------|
| 主品牌色 | `#F39C12` (橙金) |
| 强调色 | `#5A4FCF` (蓝紫), `#E91E63` (玫红) |
| 品牌渐变 | `linear-gradient(135deg, #F39C12 0%, #E67E22 30%, #5A4FCF 70%, #E91E63 100%)` |

### UI 规范

- **Tooltips**：始终使用 `theme='light'`
- **按钮圆角**：8px
- **卡片圆角**：12px
- **动画时长**：150-300ms，ease-out 曲线
- **可点击容器**：用 `pointer-events: none` + 父容器 `onClick` 扩大交互区域
- **筛选与选中联动**：选中计数、操作都应基于筛选后的结果
- **全局配色统一**：在 `tdesign-theme.scss` 中集中覆盖第三方组件样式

---

## 相关文档

### 核心文档（按需阅读）

| 文档 | 说明 | 何时阅读 |
|------|------|---------|
| `docs/CODING_RULES.md` | 详细编码规则和错误示例 | 编写代码时遇到特定场景 |
| `docs/FEATURE_FLOWS.md` | 核心功能实现流程 | 理解功能架构时 |
| `docs/CONCEPTS.md` | 项目核心术语定义 | 理解业务概念时 |
| `docs/CODING_STANDARDS.md` | 基础编码规范 | 代码风格参考 |

### 专题文档

- `docs/Z_INDEX_GUIDE.md` - Z-Index 层级管理
- `docs/UNIFIED_CACHE_DESIGN.md` - 缓存架构设计
- `docs/SW_DEBUG_POSTMESSAGE_LOGGING.md` - SW 调试日志
- `docs/CLAUDE_CODE_BEST_PRACTICES.md` - Claude Code 使用技巧

### 规范文档

- `openspec/AGENTS.md` - OpenSpec 规范（涉及架构变更时必读）

---

## OpenSpec 说明

当请求涉及以下内容时，请先打开 `@/openspec/AGENTS.md`：
- 提及计划或提案 (proposal, spec, change, plan)
- 引入新功能、破坏性变更、架构调整
- 需要权威规范才能编码的模糊情况

---

## 验证命令

修改代码后执行：

```bash
cd packages/drawnix && npx tsc --noEmit  # 类型检查
pnpm nx lint drawnix                      # 代码规范
pnpm nx test drawnix                      # 单元测试
pnpm run build                            # 构建验证
```
