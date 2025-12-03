# Research: 统一左侧工具栏容器

**Feature**: 001-unified-toolbar | **Date**: 2025-12-01

## Overview

本文档记录统一工具栏实现的技术研究成果,包括架构决策、最佳实践和备选方案评估。

## Research Items

### 1. 响应式工具栏高度检测

**Decision**: 使用 ResizeObserver API 监听工具栏容器高度变化

**Rationale**:
- ResizeObserver 是现代浏览器原生支持的 API,性能优于基于事件监听的方案
- 支持精确检测元素尺寸变化,避免布局抖动
- 可在 useEffect 中清理,符合 React 最佳实践
- 浏览器兼容性良好 (Chrome 64+, Firefox 69+, Safari 13.1+)

**Alternatives Considered**:
- ❌ window.addEventListener('resize') - 仅检测窗口变化,无法精确监听容器高度
- ❌ IntersectionObserver - 设计用于可见性检测,不适合尺寸监控
- ❌ 基于 CSS media queries - 无法动态检测容器高度,仅能检测视口尺寸

**Implementation Pattern**:
```typescript
useEffect(() => {
  const observer = new ResizeObserver((entries) => {
    const height = entries[0].contentRect.height;
    // 根据高度切换图标模式
  });
  observer.observe(containerRef.current);
  return () => observer.disconnect();
}, []);
```

---

### 2. 工具栏分区视觉分隔实现

**Decision**: 使用 CSS border-top 实现 1px 水平分割线

**Rationale**:
- 简单直接,无需额外 DOM 元素
- 使用设计系统变量 `var(--color-border)` 保持一致性
- 易于响应主题变化(浅色/深色模式)
- 性能优于使用单独的 divider 组件

**Alternatives Considered**:
- ❌ 单独的 `<div>` 分割线元素 - 增加 DOM 复杂度,影响可访问性
- ❌ 固定间距(margin/padding) - 无明显视觉分隔,不符合需求
- ❌ box-shadow 模拟分割线 - 渲染开销较大,不适合固定UI

**Implementation Pattern**:
```scss
.unified-toolbar__section {
  &:not(:first-child) {
    border-top: 1px solid var(--color-border);
    padding-top: 8px;
  }
}
```

---

### 3. 桌面端/移动端条件渲染策略

**Decision**: 使用现有 `appState.isMobile` 状态控制渲染逻辑

**Rationale**:
- 复用现有 MobileDetect 检测逻辑,避免重复实现
- 符合项目现有架构模式
- 检测在应用初始化时完成,运行时无性能开销
- 避免使用 CSS media queries 导致的 DOM 冗余

**Alternatives Considered**:
- ❌ CSS `display: none` + media queries - 渲染两套DOM浪费资源
- ❌ useMediaQuery hook - 增加运行时检测开销,不如初始化检测
- ❌ 用户代理字符串解析 - 已由 MobileDetect 库处理

**Implementation Pattern**:
```tsx
{!appState.isMobile ? (
  <UnifiedToolbar />
) : (
  <>
    <AppToolbar />
    <CreationToolbar />
    <ZoomToolbar />
    <ThemeToolbar />
  </>
)}
```

---

### 4. Icon-only 模式实现

**Decision**: 通过 className 切换 + CSS 隐藏文本标签

**Rationale**:
- 保持语义化 HTML,屏幕阅读器仍可访问标签
- CSS 控制显示/隐藏,性能优于条件渲染
- 支持平滑过渡动画
- 图标元素保持可点击,无需调整交互逻辑

**Alternatives Considered**:
- ❌ 条件渲染不同组件 - 导致状态重置,影响用户体验
- ❌ 动态调整 fontSize - 无法完全隐藏文本,布局计算复杂
- ❌ SVG icon 替换 - 需要维护两套图标资源

**Implementation Pattern**:
```scss
.tool-button__label {
  display: inline-block;
  margin-left: 8px;

  .unified-toolbar--icon-only & {
    display: none;
  }
}
```

---

### 5. 工具栏组件解耦策略

**Decision**: 保持现有工具栏组件独立,通过 props 控制是否应用定位样式

**Rationale**:
- 最小化代码修改,降低回归风险
- 支持独立测试工具栏组件
- 符合单一职责原则(容器负责布局,组件负责功能)
- 便于未来扩展和维护

**Alternatives Considered**:
- ❌ 合并所有工具栏到单一组件 - 违反单文件500行约束,难以维护
- ❌ 完全重写工具栏组件 - 重写风险高,测试成本大
- ❌ 使用 wrapper HOC - 增加抽象层次,不符合 React 现代模式

**Implementation Pattern**:
```tsx
interface ToolbarProps {
  embedded?: boolean; // 是否嵌入统一容器
}

export const AppToolbar: React.FC<ToolbarProps> = ({ embedded = false }) => {
  return (
    <Island className={classNames('app-toolbar', {
      'app-toolbar--embedded': embedded
    })}>
      {/* 工具栏内容 */}
    </Island>
  );
};
```

---

### 6. 性能优化策略

**Decision**: 使用 React.memo + useCallback 优化重渲染

**Rationale**:
- 工具栏是固定UI,无需频繁更新
- memo 可避免父组件重渲染导致的不必要渲染
- useCallback 稳定回调引用,配合 memo 使用效果最佳
- 符合项目性能优化原则(宪章V)

**Alternatives Considered**:
- ❌ useMemo 缓存 JSX - 对于简单组件收益有限,代码复杂度增加
- ❌ 不做优化 - 工具栏在每次画布更新时重渲染,浪费资源
- ❌ PureComponent - 使用函数式组件,memo 是更现代的选择

**Implementation Pattern**:
```typescript
export const UnifiedToolbar = React.memo(() => {
  const handleResize = useCallback(() => {
    // 响应式逻辑
  }, []);

  // 组件实现
});
```

---

### 7. 样式组织与BEM命名

**Decision**: 创建 `.unified-toolbar` BEM 块,子元素使用 `__` 连接符

**Rationale**:
- 符合项目 BEM 命名约定 (宪章 CSS/SCSS 标准)
- 清晰的命名层次,易于理解和维护
- 避免样式冲突,提升可读性
- 与现有样式系统一致

**Alternatives Considered**:
- ❌ CSS Modules - 项目未采用,引入新模式成本高
- ❌ styled-components - 项目使用SCSS,保持技术栈一致性
- ❌ Tailwind CSS - 违反项目设计系统原则

**Implementation Pattern**:
```scss
.unified-toolbar {
  // 容器样式
  position: absolute;
  left: 36px;
  top: 36px;

  &__section {
    // 分区样式
  }

  &__divider {
    // 分割线样式
  }

  &--icon-only {
    // 图标模式修饰符
  }
}
```

---

### 8. 可访问性(a11y)最佳实践

**Decision**: 保持现有 aria-label 和 title 属性,图标模式不移除

**Rationale**:
- 屏幕阅读器依赖 aria-label 理解按钮功能
- title 属性提供悬停提示,图标模式下更重要
- 符合 WCAG 2.1 AA 标准
- 无需额外开发,复用现有实现

**Alternatives Considered**:
- ❌ 图标模式移除文本标签后添加新 aria-label - 重复且不必要
- ❌ 使用 aria-hidden 隐藏文本 - 破坏可访问性
- ❌ 仅依赖视觉图标 - 违反可访问性标准

**Implementation Pattern**:
```tsx
<ToolButton
  icon={HandIcon}
  title={t('toolbar.hand')}        // 保留
  aria-label={t('toolbar.hand')}    // 保留
  // ...其他props
/>
```

---

## Technology Stack Summary

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Language | TypeScript | 5.x | 类型安全,严格模式 |
| Framework | React | 18+ | UI组件框架 |
| UI Library | TDesign React | latest | 设计系统组件 |
| Board Framework | @plait/core | current | 白板核心框架 |
| Testing | Jest + RTL | current | 组件单元测试 |
| E2E Testing | Playwright | current | 端到端测试 |
| Styling | SCSS + BEM | N/A | 样式组织方法论 |
| Build Tool | Nx + Vite | current | Monorepo构建工具 |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| 移动端布局意外受影响 | Low | High | 条件渲染隔离,E2E测试验证 |
| 响应式切换导致布局抖动 | Medium | Medium | 使用ResizeObserver精确检测,CSS transition平滑过渡 |
| 现有快捷键失效 | Low | High | 无修改快捷键逻辑,仅调整UI布局 |
| 性能回归(工具栏渲染慢) | Low | Medium | React.memo优化,性能基准测试 |
| 文件超过500行限制 | Low | Medium | 组件保持独立,拆分为多个文件 |

---

## Dependencies & Compatibility

**Browser Compatibility**:
- Chrome/Edge 90+ ✅
- Firefox 88+ ✅
- Safari 14+ ✅
- Mobile Safari/Chrome ✅

**Critical Dependencies**:
- ResizeObserver API (native browser API)
- CSS Flexbox (widely supported)
- React 18 concurrent features (已在项目中使用)

**No New External Dependencies Required** ✅

---

## Next Steps

Phase 0 研究完成,所有技术决策已明确。继续进行:

1. ✅ Phase 1: 生成 data-model.md (本feature为UI重构,数据模型简化)
2. ✅ Phase 1: 生成 quickstart.md (开发者快速开始指南)
3. ✅ Phase 1: 更新 agent context (技术栈信息)
4. → Phase 2: 执行 `/speckit.tasks` 生成任务分解
