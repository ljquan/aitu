# Data Model: 统一左侧工具栏容器

**Feature**: 001-unified-toolbar | **Date**: 2025-12-01

## Overview

本feature为纯UI布局重构,不涉及复杂数据模型或持久化存储。本文档描述组件状态和类型定义。

## Component State Model

### UnifiedToolbar Component State

```typescript
interface UnifiedToolbarState {
  /**
   * 是否处于图标模式(仅显示图标,隐藏文本)
   * 当工具栏容器高度不足时自动切换为true
   */
  isIconMode: boolean;

  /**
   * 工具栏容器高度(像素)
   * 用于响应式检测和模式切换
   */
  containerHeight: number;
}
```

**State Transitions**:

```
初始状态 (isIconMode: false)
    │
    ├─> 窗口高度减小 → 检测到 containerHeight < threshold
    │                  → isIconMode: true (图标模式)
    │
    └─> 窗口高度增大 → 检测到 containerHeight >= threshold
                       → isIconMode: false (正常模式)
```

**Threshold Calculation**:
```typescript
// 四个分区的最小高度 + 分割线 + padding
const MIN_HEIGHT =
  APP_TOOLBAR_MIN_HEIGHT +      // ~80px
  CREATION_TOOLBAR_MIN_HEIGHT + // ~200px
  ZOOM_TOOLBAR_MIN_HEIGHT +     // ~60px
  THEME_TOOLBAR_MIN_HEIGHT +    // ~60px
  (3 * DIVIDER_HEIGHT) +        // 3 * 1px
  (4 * SECTION_PADDING);        // 4 * 16px

// 预计阈值约 ~460px
```

---

## Type Definitions

### UnifiedToolbar Props

```typescript
/**
 * 统一工具栏容器组件属性
 */
interface UnifiedToolbarProps {
  /**
   * (可选) 自定义CSS类名
   */
  className?: string;
}
```

### Toolbar Section Props

```typescript
/**
 * 工具栏分区通用属性
 * 应用于 AppToolbar, CreationToolbar, ZoomToolbar, ThemeToolbar
 */
interface ToolbarSectionProps {
  /**
   * 是否嵌入到统一容器中
   * - true: 不应用独立定位样式,作为子组件渲染
   * - false: 应用原有绝对定位样式(移动端使用)
   * @default false
   */
  embedded?: boolean;

  /**
   * 是否处于图标模式
   * - true: 隐藏文本标签,仅显示图标
   * - false: 正常显示图标和文本
   * @default false
   */
  iconMode?: boolean;
}
```

---

## Context Usage

### Existing DrawnixContext

工具栏组件复用现有 DrawnixContext,无需新增状态:

```typescript
// 现有context (无需修改)
interface DrawnixContext {
  appState: DrawnixState;   // 包含 isMobile 检测
  setAppState: (state: DrawnixState) => void;
  board: DrawnixBoard | null;
}

// 相关字段
interface DrawnixState {
  isMobile: boolean;        // 用于桌面/移动端条件渲染
  pointer: DrawnixPointerType;
  isPencilMode: boolean;
  // ...其他字段
}
```

---

## Component Hierarchy

```
<Drawnix>
  └─> {isMobile ? (
        // 移动端:保持现有布局
        <>
          <AppToolbar embedded={false} />
          <CreationToolbar embedded={false} />
          <ZoomToolbar embedded={false} />
          <ThemeToolbar embedded={false} />
        </>
      ) : (
        // 桌面端:统一工具栏
        <UnifiedToolbar>
          <AppToolbar embedded={true} iconMode={isIconMode} />
          <CreationToolbar embedded={true} iconMode={isIconMode} />
          <ZoomToolbar embedded={true} iconMode={isIconMode} />
          <ThemeToolbar embedded={true} iconMode={isIconMode} />
        </UnifiedToolbar>
      )}
```

---

## Validation Rules

### Component Props Validation

```typescript
// UnifiedToolbar
- className: string | undefined (无验证约束)

// ToolbarSectionProps
- embedded: boolean | undefined (默认false)
- iconMode: boolean | undefined (默认false)
```

**Runtime Validation**: 无需运行时验证,TypeScript编译时类型检查足够

---

## Entity Relationships

```
┌─────────────────────────────────────┐
│      UnifiedToolbar (Container)      │
│  - isIconMode: boolean               │
│  - containerHeight: number           │
└───────────┬─────────────────────────┘
            │ contains (1:4)
            ├───> AppToolbar (embedded)
            ├───> CreationToolbar (embedded)
            ├───> ZoomToolbar (embedded)
            └───> ThemeToolbar (embedded)

┌─────────────────────────────────────┐
│      DrawnixContext (Existing)       │
│  - appState.isMobile: boolean        │
└───────────┬─────────────────────────┘
            │ controls
            ▼
      Conditional Render Logic
      (Desktop: UnifiedToolbar vs Mobile: Separate Toolbars)
```

---

## No Persistence Required

**Storage**: N/A - 工具栏状态为临时UI状态,无需持久化

**Reasons**:
- `isIconMode` 由窗口尺寸动态决定,每次加载时重新计算
- `isMobile` 由 user agent 检测,不需要存储
- 工具栏选中状态已由现有 `appState.pointer` 管理

---

## Type Safety Checklist

- [x] 所有组件Props使用TypeScript interface定义
- [x] 状态字段有明确类型注解
- [x] 无使用 `any` 类型
- [x] Props默认值在组件声明中明确
- [x] 导出类型供测试和其他模块使用

---

## Accessibility Attributes

虽然不是数据模型,但与组件状态相关的可访问性属性:

```typescript
interface ToolButtonA11yProps {
  'aria-label': string;        // 按钮功能描述
  'title': string;             // 悬停提示文本
  'role'?: 'button' | 'radio'; // 语义角色
  'aria-pressed'?: boolean;    // 按钮按下状态(可选)
}
```

这些属性保持现有实现,在图标模式下不移除,确保屏幕阅读器可访问性。

---

## Summary

本feature数据模型简洁,主要包含:

1. **UnifiedToolbar内部状态** - isIconMode, containerHeight
2. **Props接口** - embedded, iconMode flags
3. **复用现有Context** - DrawnixContext.appState.isMobile
4. **无持久化需求** - 所有状态为临时UI状态

类型定义符合TypeScript严格模式,遵循项目命名约定,无复杂状态管理需求。
