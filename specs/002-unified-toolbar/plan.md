# Implementation Plan: 统一左侧工具栏容器

**Branch**: `001-unified-toolbar` | **Date**: 2025-12-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-unified-toolbar/spec.md`

## Summary

将当前分散在四个位置的工具栏(app-toolbar、creation-toolbar、zoom-toolbar、theme-toolbar)整合到一个固定在页面左侧的统一垂直容器中。工具栏分区之间使用 1px 水平分割线分隔,支持响应式图标模式,移动端保持现有布局不变。

**Technical Approach**: 创建新的 UnifiedToolbar 容器组件,使用现有 Island 组件样式,通过条件渲染处理桌面端和移动端的差异,实现响应式高度检测以切换图标模式。

## Technical Context

**Language/Version**: TypeScript 5.x (严格模式)
**Primary Dependencies**:
- React 18+
- @plait/core (PlaitBoard框架)
- @plait-board/react-board (React包装器)
- TDesign React (UI组件库,light主题)
- classnames (CSS类名管理)

**Storage**: N/A (纯UI重构,不涉及数据存储)
**Testing**:
- Jest + React Testing Library (组件测试)
- Playwright (E2E测试)
- 视觉回归测试(工具栏布局验证)

**Target Platform**: Web浏览器 (桌面端 + 移动端响应式)
**Project Type**: Web - Monorepo (Nx workspace)
**Performance Goals**:
- 工具栏渲染时间 < 16ms (60fps)
- 响应式切换延迟 < 100ms
- 无布局抖动(layout shift)

**Constraints**:
- 单文件不超过500行 (宪章硬约束)
- 移动端布局完全不受影响
- 所有现有功能和快捷键保持不变
- 使用Island样式组件保持视觉一致性

**Scale/Scope**:
- 影响文件数: ~6个文件 (1个新组件 + 5个修改)
- 4个工具栏组件重构为子组件
- 1个SCSS文件样式更新

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ Compliance Verification

| Principle | Status | Notes |
|-----------|--------|-------|
| I. 插件优先架构 | ✅ 符合 | 工具栏重构不影响插件架构,仅调整UI布局 |
| II. 文件大小约束 (<500行) | ✅ 符合 | 新UnifiedToolbar组件预计~200行,现有组件无需修改 |
| III. 类型安全优先 | ✅ 符合 | 所有新组件使用TypeScript严格模式,interface定义Props |
| IV. 设计系统一致性 | ✅ 符合 | 使用TDesign React组件,保持Island样式,light主题 |
| V. 性能与优化 | ✅ 符合 | 使用React.memo优化,useCallback包装事件处理器 |
| VI. 安全与验证 | N/A | 无用户输入,纯UI重构 |
| VII. Monorepo结构 | ✅ 符合 | 修改位于packages/drawnix/src/components/toolbar/ |

**命名约定验证**:
- ✅ 新组件: `UnifiedToolbar.tsx` (PascalCase)
- ✅ Hook(如需): `useResponsiveToolbar.ts` (camelCase)
- ✅ 样式文件: 更新现有`index.scss` (kebab-case)
- ✅ 类型定义: 在组件文件内或`toolbar.types.ts`

**测试要求**:
- ✅ 组件测试: 验证四个分区正确渲染
- ✅ 响应式测试: 验证图标模式切换
- ✅ 集成测试: 验证移动端布局不受影响
- ✅ E2E测试: 验证工具栏功能和快捷键

### 🚫 No Violations

无需填写复杂度跟踪表 - 本次实现完全符合宪章所有原则。

## Project Structure

### Documentation (this feature)

```text
specs/001-unified-toolbar/
├── spec.md              # 功能规范 (已完成)
├── plan.md              # 本文件 (/speckit.plan输出)
├── research.md          # Phase 0 研究文档
├── data-model.md        # Phase 1 数据模型 (本feature为N/A,纯UI)
├── quickstart.md        # Phase 1 快速开始指南
├── contracts/           # Phase 1 API契约 (本feature为N/A,无API)
└── tasks.md             # Phase 2 任务分解 (/speckit.tasks输出)
```

### Source Code (repository root)

```text
packages/drawnix/
├── src/
│   ├── components/
│   │   ├── toolbar/
│   │   │   ├── unified-toolbar.tsx        # [NEW] 统一工具栏容器
│   │   │   ├── app-toolbar/
│   │   │   │   └── app-toolbar.tsx        # [MODIFIED] 改为可嵌入子组件
│   │   │   ├── creation-toolbar.tsx       # [MODIFIED] 改为可嵌入子组件
│   │   │   ├── zoom-toolbar.tsx           # [MODIFIED] 改为可嵌入子组件
│   │   │   └── theme-toolbar.tsx          # [MODIFIED] 改为可嵌入子组件
│   │   ├── island.tsx                     # [REUSE] 现有Island组件
│   │   └── stack.tsx                      # [REUSE] 现有Stack组件
│   ├── drawnix.tsx                        # [MODIFIED] 更新工具栏渲染逻辑
│   ├── hooks/
│   │   └── use-drawnix.ts                 # [REUSE] 现有DrawnixContext
│   └── styles/
│       └── index.scss                     # [MODIFIED] 更新工具栏定位样式
└── tests/
    └── components/
        └── toolbar/
            └── unified-toolbar.test.tsx   # [NEW] 组件测试

apps/web/
└── e2e/
    └── toolbar-layout.spec.ts             # [NEW] E2E测试
```

**Structure Decision**:

采用现有 Monorepo 结构,所有修改位于 `packages/drawnix` 核心包中。新增 UnifiedToolbar 组件作为容器,现有四个工具栏组件改造为可嵌入子组件(移除独立定位样式,保留功能逻辑)。主应用 drawnix.tsx 更新渲染逻辑,根据设备类型条件渲染统一工具栏(桌面端)或保持现有布局(移动端)。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

N/A - 本实现无宪章违规

