# Implementation Plan: 批量生成数量选择

**Branch**: `002-batch-generation` | **Date**: 2025-11-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-batch-generation/spec.md`

## Summary

为AI图片/视频生成弹窗添加批量生成数量选择功能，支持预设按钮（1/2/4）和自定义数值输入。修改任务队列系统以支持同时创建多个并行生成任务，并统一展示批量生成结果。

## Technical Context

**Language/Version**: TypeScript 5.x with React 18
**Primary Dependencies**: TDesign React, @plait/core, localforage
**Storage**: localforage for browser storage, localStorage for user preferences
**Testing**: Jest with React Testing Library
**Target Platform**: Web (modern browsers)
**Project Type**: web - monorepo with Nx
**Performance Goals**: 用户可在3秒内完成数量选择，批量任务并行执行
**Constraints**: 单文件<500行，最大生成数量8
**Scale/Scope**: 修改现有AI生成弹窗组件，扩展任务队列服务

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Plugin-First Architecture | ✅ Pass | 功能扩展现有组件，不引入新的插件架构 |
| File Size Constraint (<500 lines) | ✅ Pass | 新增组件将拆分为小型模块，每个<500行 |
| Type Safety First | ✅ Pass | 所有新类型将在types文件中定义 |
| Design System Consistency | ✅ Pass | 使用TDesign组件，light主题 |
| Performance & Optimization | ✅ Pass | 使用useCallback、useMemo优化 |
| Security & Validation | ✅ Pass | 验证输入数量范围1-8 |

## Project Structure

### Documentation (this feature)

```text
specs/002-batch-generation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
packages/drawnix/src/
├── components/
│   ├── ttd-dialog/
│   │   ├── ai-image-generation.tsx      # 修改：添加数量选择
│   │   ├── ai-video-generation.tsx      # 修改：添加数量选择
│   │   └── generation-count-selector/   # 新增：数量选择组件
│   │       ├── GenerationCountSelector.tsx
│   │       └── generation-count-selector.scss
│   └── task-queue/
│       └── DialogTaskList.tsx           # 修改：支持批量任务展示
├── hooks/
│   ├── useTaskQueue.ts                  # 修改：支持批量创建
│   └── useGenerationCount.ts            # 新增：数量选择状态管理
├── services/
│   └── task-queue-service.ts            # 修改：支持批量任务创建
├── types/
│   └── task.types.ts                    # 修改：添加批量生成类型
└── constants/
    └── generation.ts                    # 新增：生成相关常量
```

**Structure Decision**: 使用现有Web应用monorepo结构，在packages/drawnix中扩展

## Complexity Tracking

> 无宪法违规需要记录

## Implementation Phases

### Phase 1: 数量选择UI组件
- 创建GenerationCountSelector组件
- 实现预设按钮（1/2/4）和数值输入
- 添加状态联动和验证逻辑

### Phase 2: 任务队列扩展
- 修改task.types.ts添加批量生成支持
- 扩展taskQueueService支持批量创建任务
- 更新useTaskQueue hook

### Phase 3: 弹窗集成
- 集成数量选择到AIImageGeneration
- 集成数量选择到AIVideoGeneration
- 修改任务创建逻辑支持多任务

### Phase 4: 结果展示
- 修改DialogTaskList支持批量任务分组
- 添加批量任务整体状态显示
