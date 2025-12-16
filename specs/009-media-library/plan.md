# Implementation Plan: 素材管理库 (Media Library)

**Branch**: `009-media-library` | **Date**: 2025-12-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-media-library/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

实现一个素材管理库功能，允许用户通过AI生成对话框访问、浏览、管理和选择媒体素材（图片和视频）。素材库使用IndexedDB进行本地持久化存储，支持按类型和来源筛选、搜索、排序，以及重命名、删除和下载操作。AI生成的内容将自动添加到素材库中，用户可以从素材库中选择已有素材作为参考图，无需每次都从本地文件系统选择。

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), React 18.x
**Primary Dependencies**:
- TDesign React (UI components, light theme)
- Plait Framework (existing whiteboard core)
- localforage (IndexedDB wrapper for storage)
- RxJS (reactive state management)
- Vite (build tool)

**Storage**: IndexedDB (via localforage) for:
- Asset metadata and Blob URLs
- Asset data persistence across browser sessions
- Storage quota monitoring

**Testing**:
- React Testing Library (component tests)
- Jest (unit tests)
- Playwright (E2E tests for key flows)

**Target Platform**: Modern web browsers (Chrome, Firefox, Safari, Edge latest versions) supporting IndexedDB and Blob URLs

**Project Type**: Monorepo web application (Nx workspace)

**Performance Goals**:
- Initial load time < 2 seconds (for 100 assets)
- Filter/search response < 500ms
- Support至少 100 assets without degrading UI responsiveness

**Constraints**:
- No backend - pure frontend solution
- Browser storage limits (50MB-500MB depending on browser)
- Single file size limit: 500 lines (per constitution)
- Access only through AI generation dialogs (no standalone entry point)

**Scale/Scope**:
- ~5-8 React components (modal, sidebar, grid, inspector, upload)
- 1 Context provider for asset state management
- 1 IndexedDB storage service
- Integration with 2 existing AI generation dialogs (image, video)
- Integration with existing task queue service for auto-save

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ PASS: Plugin Architecture
- **Requirement**: 每个功能都应该实现为遵循 `withXxx` 模式的可组合插件
- **Status**: ✅ PASS - 素材管理库不是编辑器插件，而是UI功能模块，使用React Context模式进行状态管理。不违反插件架构原则。

### ✅ PASS: File Size Constraint (500 lines)
- **Requirement**: 单个文件不得超过 500 行（硬性约束）
- **Status**: ✅ PASS - 计划将组件分解为多个小文件：
  - MediaLibraryModal.tsx (主容器 < 150 lines)
  - MediaLibraryGrid.tsx (网格视图 < 200 lines)
  - MediaLibrarySidebar.tsx (筛选侧边栏 < 150 lines)
  - MediaLibraryInspector.tsx (详情面板 < 200 lines)
  - AssetContext.tsx (状态管理 < 150 lines)
  - asset-storage-service.ts (存储服务 < 250 lines)
  - 各种小型组件和工具函数

### ✅ PASS: TypeScript Strict Mode
- **Requirement**: TypeScript 严格模式是强制性的
- **Status**: ✅ PASS - 所有新代码将使用 TypeScript 5.x strict mode，定义完整的接口和类型

### ✅ PASS: TDesign React & Light Theme
- **Requirement**: 所有 UI 组件必须使用 TDesign React 并采用 light 主题
- **Status**: ✅ PASS - 将使用TDesign组件（Dialog, Button, Input, Tooltip）并配置light主题

### ✅ PASS: Performance Optimization
- **Requirement**: 为用户体验进行优化（React.memo, useCallback, useMemo）
- **Status**: ✅ PASS - 将应用优化策略：
  - 网格项组件使用 React.memo
  - 事件处理器使用 useCallback
  - 筛选后的素材列表使用 useMemo
  - 考虑虚拟化（如果资产数量增长）

### ✅ PASS: Security & Validation
- **Requirement**: 验证和清理所有用户输入，文件上传验证
- **Status**: ✅ PASS - 将实现：
  - 文件类型验证（仅图片和视频）
  - MIME类型检查
  - 存储错误处理
  - 无硬编码敏感信息

### ✅ PASS: Monorepo Structure
- **Requirement**: 在 Nx monorepo 中保持清晰的分离
- **Status**: ✅ PASS - 新代码将放置在 `packages/drawnix/src/` 下：
  - `components/media-library/` - UI组件
  - `services/asset-storage-service.ts` - 存储服务
  - `types/asset.types.ts` - 类型定义
  - `hooks/useAssets.ts` - 自定义hook

### ✅ PASS: Naming Conventions
- **Requirement**: 严格的文件和代码命名约定
- **Status**: ✅ PASS - 将遵循：
  - 组件：PascalCase.tsx
  - Hooks：camelCase.ts (useAssets.ts)
  - 服务：kebab-case.ts (asset-storage-service.ts)
  - 类型：kebab-case.types.ts (asset.types.ts)

### ✅ PASS: Component Structure
- **Requirement**: React组件遵循标准结构顺序
- **Status**: ✅ PASS - 所有组件将遵循：导入 → 类型 → 常量 → Hooks → 事件处理器 → 渲染

### ✅ PASS: Testing Requirements
- **Requirement**: 单元测试、组件测试、集成测试、E2E测试
- **Status**: ✅ PASS - 测试计划：
  - 单元测试：asset-storage-service.ts
  - 组件测试：所有React组件
  - 集成测试：与AI生成对话框的集成
  - E2E测试：完整的选择和上传流程

### ✅ PASS: CSS/SCSS Standards
- **Requirement**: 遵循 BEM 方法论
- **Status**: ✅ PASS - 将使用BEM命名，CSS变量优先

### ✅ PASS: Git Commit Convention
- **Requirement**: 遵循 Conventional Commits
- **Status**: ✅ PASS - 提交格式：`feat(media-library): <description>`

**GATE RESULT: ✅ ALL GATES PASSED - Proceed to Phase 0**

## Project Structure

### Documentation (this feature)

```text
specs/009-media-library/
├── spec.md              # Feature specification
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (技术决策和最佳实践)
├── data-model.md        # Phase 1 output (数据模型定义)
├── quickstart.md        # Phase 1 output (快速开始指南)
├── contracts/           # Phase 1 output (接口契约)
│   └── asset-store-api.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT YET CREATED)
```

### Source Code (repository root)

```text
packages/drawnix/src/
├── components/
│   └── media-library/
│       ├── MediaLibraryModal.tsx          # 主弹窗容器组件
│       ├── MediaLibraryModal.scss         # 弹窗样式
│       ├── MediaLibraryGrid.tsx           # 网格视图组件
│       ├── MediaLibraryGrid.scss          # 网格样式
│       ├── MediaLibrarySidebar.tsx        # 左侧筛选侧边栏
│       ├── MediaLibrarySidebar.scss       # 侧边栏样式
│       ├── MediaLibraryInspector.tsx      # 右侧详情面板
│       ├── MediaLibraryInspector.scss     # 详情面板样式
│       ├── MediaLibraryEmpty.tsx          # 空状态组件
│       ├── MediaLibraryStorageBar.tsx     # 存储空间进度条
│       ├── AssetGridItem.tsx              # 单个素材网格项
│       ├── AssetGridItem.scss             # 网格项样式
│       └── index.ts                       # 导出
├── contexts/
│   └── AssetContext.tsx                   # 素材状态管理Context
├── services/
│   ├── asset-storage-service.ts           # IndexedDB存储服务
│   └── asset-integration-service.ts       # 与AI生成服务集成
├── hooks/
│   ├── useAssets.ts                       # 素材管理hook
│   └── useAssetSelection.ts               # 素材选择hook
├── types/
│   └── asset.types.ts                     # 素材相关类型定义
├── utils/
│   ├── asset-utils.ts                     # 素材工具函数
│   └── storage-quota.ts                   # 存储配额工具
└── constants/
    └── ASSET_CONSTANTS.ts                 # 素材相关常量

packages/drawnix/src/components/ttd-dialog/
├── ai-image-generation.tsx                # [MODIFY] 集成素材库选择
└── ai-video-generation.tsx                # [MODIFY] 集成素材库选择

tests/
└── media-library/
    ├── unit/
    │   ├── asset-storage-service.spec.ts
    │   ├── asset-utils.spec.ts
    │   └── storage-quota.spec.ts
    ├── component/
    │   ├── MediaLibraryModal.spec.tsx
    │   ├── MediaLibraryGrid.spec.tsx
    │   └── AssetGridItem.spec.tsx
    ├── integration/
    │   └── ai-generation-integration.spec.tsx
    └── e2e/
        ├── asset-upload.spec.ts
        └── asset-selection.spec.ts
```

**Structure Decision**: 使用 monorepo 中的 `packages/drawnix` 包，遵循现有项目结构，将素材管理库功能作为独立模块添加到 `components/media-library/` 目录下。使用Context模式进行状态管理，与现有的服务层（`services/`）保持一致。组件将被分解为多个小文件以符合500行限制，每个组件负责单一职责（网格、侧边栏、详情面板等）。

## Complexity Tracking

> **No constitution violations - This section is empty**

所有宪章检查项均已通过，无需额外的复杂性理由说明。
