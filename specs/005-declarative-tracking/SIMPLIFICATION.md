# 代码简化：使用 data-track 替代 track

**Date**: 2025-12-05
**改进**: 使用标准 HTML data 属性简化声明式埋点实现

## 问题

原始实现使用自定义的 `track` 属性，导致：

1. **TypeScript 类型错误**：HTML 元素不支持自定义属性
2. **复杂的类型转换**：需要使用 `{...({ track: 'event_name' } as any)}`
3. **代码冗余**：每个地方都要写复杂的 spread 语法

### Before (复杂写法)

```typescript
// ToolButton 组件
type ToolButtonBaseProps = {
  track?: string;
  // ...
};

<button
  {...(props.track ? { track: props.track } : {})}
  // ... other props
>

// HTML 元素
<div {...({ track: 'toolbar_click_menu' } as any)} />

// MenuItem 组件
<MenuItem {...({ track: 'toolbar_click_menu_save' } as any)} />
```

## 解决方案

使用标准的 `data-track` 属性：

### After (简洁写法)

```typescript
// ToolButton 组件
type ToolButtonBaseProps = {
  'data-track'?: string;  // ✅ TypeScript 原生支持
  // ...
};

<button
  data-track={props['data-track']}  // ✅ 直接赋值
  // ... other props
>

// HTML 元素
<div data-track="toolbar_click_menu" />  // ✅ 简洁清晰

// MenuItem 组件
<MenuItem data-track="toolbar_click_menu_save" />  // ✅ 不需要 as any
```

## 优势

### 1. 标准化
- `data-*` 是 HTML5 标准属性
- 所有现代浏览器原生支持
- TypeScript 完全支持，无需额外类型定义

### 2. 代码简化
- **Before**: `{...({ track: 'event_name' } as any)}` (45 字符)
- **After**: `data-track="event_name"` (26 字符)
- 减少 42% 的代码量

### 3. 类型安全
- 不需要 `as any` 类型断言
- TypeScript 编译器无警告
- IDE 自动补全支持更好

### 4. 可读性
```tsx
// Before - 难以阅读
<MenuItem
  icon={SaveFileIcon}
  {...({ track: 'toolbar_click_menu_save' } as any)}
  onSelect={() => saveAsJSON(board)}
/>

// After - 清晰易读
<MenuItem
  icon={SaveFileIcon}
  data-track="toolbar_click_menu_save"
  onSelect={() => saveAsJSON(board)}
/>
```

## 修改的文件

### 核心服务
1. **tracking-service.ts** - 从 `[track]` 改为 `[data-track]`
   - Line 116: `target.closest('[data-track]')`
   - Line 118: `getAttribute('data-track')`

### 组件类型定义
2. **tool-button.tsx** - 添加 `'data-track'?: string`
   - Line 22: 添加 data-track 到类型
   - Line 130: button 元素使用 data-track
   - Line 191: label 元素使用 data-track

### Toolbar 组件
3. **app-toolbar.tsx** - 所有 ToolButton
   - Menu: `data-track="toolbar_click_menu"`
   - Undo: `data-track="toolbar_click_undo"`
   - Redo: `data-track="toolbar_click_redo"`

4. **app-menu-items.tsx** - 所有 MenuItem
   - Open: `data-track="toolbar_click_menu_open"`
   - Save: `data-track="toolbar_click_menu_save"`
   - Export: `data-track="toolbar_click_menu_export"`
   - Export PNG: `data-track="toolbar_click_menu_export_png"`
   - Export JPG: `data-track="toolbar_click_menu_export_jpg"`
   - Clean: `data-track="toolbar_click_menu_clean"`
   - Settings: `data-track="toolbar_click_menu_settings"`
   - GitHub: `data-track="toolbar_click_menu_github"`

5. **creation-toolbar.tsx** - 所有创建工具按钮
   - Popover buttons: `data-track={\`toolbar_click_${popupKey}\`}`
   - Normal buttons: `data-track={\`toolbar_click_${button.pointer || button.key}\`}`

6. **zoom-toolbar.tsx** - 所有缩放按钮
   - Zoom out: `data-track="toolbar_click_zoom_out"`
   - Zoom menu: `data-track="toolbar_click_zoom_menu"`
   - Zoom fit: `data-track="toolbar_click_zoom_fit"`
   - Zoom 100%: `data-track="toolbar_click_zoom_100"`
   - Zoom in: `data-track="toolbar_click_zoom_in"`

7. **theme-toolbar.tsx** - 主题选择器
   - Theme select: `data-track="toolbar_click_theme"`

8. **feedback-button.tsx** - 反馈按钮
   - Feedback: `data-track="toolbar_click_feedback"`

9. **TaskToolbarButton.tsx** - 任务按钮
   - Tasks: `data-track="toolbar_click_tasks"`

### 文档
10. **TOOLBAR_TRACKING.md** - 更新实现说明

## 验证

### TypeScript 类型检查
```bash
npx nx typecheck drawnix
```

**结果**: ✅ 所有 `track` 相关的类型错误已消失

### 功能测试
1. 点击工具栏按钮
2. 查看浏览器控制台: `[Tracking] Event tracked: toolbar_click_menu`
3. 检查 Umami 面板: 事件正常上报

## 性能影响

### 运行时
- **无影响**: `data-*` 属性和自定义属性在运行时行为完全相同
- **DOM 查询**: `querySelector('[data-track]')` 性能等同于 `querySelector('[track]')`

### 编译时
- **改善**: 减少 TypeScript 类型转换，编译更快
- **减少警告**: 无 `as any` 断言，代码质量更高

## 最佳实践

### ✅ 推荐写法
```tsx
// 直接使用 data-track
<button data-track="button_click">Click me</button>

// ToolButton 组件
<ToolButton data-track="toolbar_click_save" />

// MenuItem 组件
<MenuItem data-track="menu_item_export" />
```

### ❌ 避免的写法
```tsx
// 不要再使用复杂的 spread 语法
<button {...({ track: 'button_click' } as any)}>Click me</button>

// 不要使用自定义属性
<button track="button_click">Click me</button>
```

## 总结

通过使用标准的 `data-track` 属性：

1. ✅ **代码更简洁** - 减少 42% 的代码量
2. ✅ **类型更安全** - 无需 `as any` 断言
3. ✅ **标准化** - 遵循 HTML5 规范
4. ✅ **易维护** - 更清晰、更易读
5. ✅ **零性能损失** - 运行时行为完全相同

这是一次成功的代码简化，提高了代码质量和可维护性。
