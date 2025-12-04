# Implementation Plan: 对话抽屉 (Chat Drawer)

**Branch**: `001-chat-drawer` | **Date**: 2025-12-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-chat-drawer/spec.md`

## Summary

实现一个可展开/收起的对话抽屉组件，位于画板右侧，支持：
- 与AI进行流式连续对话
- 对话历史持久化存储（IndexedDB via localforage）
- 多会话管理（创建、切换、删除）
- 附件上传（图片、文档、文件）
- 响应式布局（桌面端自适应宽度，移动端全屏覆盖）

技术方案基于现有的 Drawnix 架构，复用 Dialog、Task Queue、Settings 等组件模式。

## Technical Context

**Language/Version**: TypeScript 5.x, React 18.x
**Primary Dependencies**: TDesign React (UI), Floating UI (定位), localforage (存储), RxJS (状态管理)
**Storage**: IndexedDB via localforage (chat-sessions, chat-messages stores)
**Testing**: Vitest + React Testing Library
**Target Platform**: Web (Chrome, Firefox, Safari, Edge), 响应式支持移动端
**Project Type**: Web Monorepo (Nx)
**Performance Goals**: 抽屉动画60fps, 首字节响应<3秒, 历史恢复<500ms
**Constraints**: 单文件<500行, TDesign light主题, BEM命名
**Scale/Scope**: 50+会话, 每会话100+消息, 附件支持

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. 插件优先架构 | ✅ Pass | Chat功能作为独立组件实现，不需要扩展Plait核心 |
| II. 文件大小约束 (<500行) | ✅ Pass | 将拆分为多个小组件：ChatDrawer, MessageList, MessageInput, SessionList等 |
| III. 类型安全优先 | ✅ Pass | 定义完整的TypeScript接口 |
| IV. 设计系统一致性 | ✅ Pass | 使用TDesign组件，light主题，BEM命名 |
| V. 性能与优化 | ✅ Pass | 使用React.memo, useCallback, 虚拟滚动 |
| VI. 安全与验证 | ✅ Pass | 验证用户输入，不存储敏感信息明文 |
| VII. Monorepo 结构 | ✅ Pass | 组件放置在 packages/drawnix/src/components/chat-drawer/ |

## Project Structure

### Documentation (this feature)

```text
specs/001-chat-drawer/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── chat-api.ts      # TypeScript interfaces
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
packages/drawnix/src/
├── components/
│   └── chat-drawer/                    # 新增：对话抽屉组件
│       ├── ChatDrawer.tsx              # 主抽屉组件
│       ├── ChatDrawerTrigger.tsx       # 触发按钮
│       ├── MessageList.tsx             # 消息列表
│       ├── MessageItem.tsx             # 单条消息
│       ├── MessageInput.tsx            # 输入框组件
│       ├── SessionList.tsx             # 会话列表
│       ├── SessionItem.tsx             # 单个会话
│       ├── AttachmentPreview.tsx       # 附件预览
│       ├── StreamingText.tsx           # 流式文本显示
│       └── chat-drawer.scss            # 样式文件
├── hooks/
│   ├── useChatSessions.ts              # 会话管理hook
│   ├── useChatMessages.ts              # 消息管理hook
│   ├── useChatStream.ts                # 流式响应hook
│   └── useChatStorage.ts               # 存储hook
├── services/
│   └── chat-service.ts                 # 聊天服务(API调用)
├── types/
│   └── chat.types.ts                   # 聊天类型定义
└── constants/
    └── CHAT_CONSTANTS.ts               # 聊天相关常量
```

**Structure Decision**: 遵循现有的组件组织模式，参考 task-queue/ 和 ttd-dialog/ 的结构。新增 chat-drawer/ 目录存放所有聊天相关组件。

## Complexity Tracking

> 无违规需要记录

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| - | - | - |
