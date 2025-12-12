# Minimap 小地图功能

## 功能概述

Minimap（小地图）是一个画布导航组件，用于解决无限画布中的方向迷失问题。

### 核心功能

✅ **实时缩略图**：显示整个画布的内容概览
✅ **视口指示器**：高亮显示当前可视区域
✅ **点击跳转**：点击小地图任意位置，快速跳转到对应区域
✅ **拖拽移动**：拖拽视口框，平滑移动画布视图
✅ **智能显示**：基于用户交互和内容复杂度自动显示/隐藏
✅ **自动缩放**：根据内容自动计算最佳缩放比例
✅ **实时同步**：自动跟踪元素变化和视口移动

## 架构设计

### 文件结构

```
packages/drawnix/src/
├── types/
│   └── minimap.types.ts           # TypeScript 类型定义
├── components/
│   └── minimap/
│       ├── Minimap.tsx             # 主组件
│       ├── minimap.scss            # 样式文件
│       └── index.ts                # 导出模块
├── constants/
│   └── z-index.ts                  # z-index 常量（新增 MINIMAP: 4030）
└── drawnix.tsx                     # 主应用（已集成 Minimap）
```

### 技术栈

- **渲染引擎**: Canvas 2D API
- **状态管理**: React Hooks (useState, useRef, useCallback, useEffect)
- **交互**: Pointer Events API
- **坐标转换**: 自定义 canvas ↔ minimap 坐标系转换
- **样式**: SCSS + CSS Variables

## 使用方法

### 1. 基本使用（已集成）

Minimap 已经集成到 Drawnix 主组件中，无需额外配置：

```tsx
// packages/drawnix/src/drawnix.tsx
{board && <Minimap board={board} />}
```

### 2. 智能显示模式

```tsx
import { Minimap } from './components/minimap';

// 默认智能显示模式（推荐）
<Minimap board={board} displayMode="auto" />

// 始终显示模式
<Minimap board={board} displayMode="always" />

// 完全手动控制模式
<Minimap board={board} displayMode="manual" />

// 自定义触发条件
<Minimap
  board={board}
  displayMode="auto"
  autoTriggerConfig={{
    enableInteractionTrigger: true,    // 启用交互触发
    interactionShowDuration: 5000,     // 交互后显示 5 秒
    enableContentComplexityTrigger: true, // 启用内容复杂度触发
    minElementCount: 10,               // 至少 10 个元素
    contentSpreadThreshold: 2.5,       // 内容分散度阈值
    autoHideDelay: 3000,               // 3 秒后自动隐藏
  }}
/>
```

### 3. 显示模式说明

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| `auto`（默认） | 智能显示/隐藏 | 推荐用于大多数场景，用户体验最佳 |
| `always` | 始终显示 | 需要持续导航的复杂画布 |
| `manual` | 完全手动控制 | 用户自行决定何时显示 |

### 4. 智能显示触发条件

**交互触发**：
- 用户拖拽画布（空格 + 拖拽）
- 用户缩放画布（滚轮、缩放按钮）
- 显示持续 5 秒后自动隐藏

**内容复杂度触发**：
- 画布元素数量 ≥ 10 个
- 内容分散度 ≥ 2.5 倍视口大小
- 用户可手动关闭后禁用自动显示

### 5. 自定义配置

```tsx
import { Minimap } from './components/minimap';

<Minimap
  board={board}
  displayMode="auto"
  config={{
    width: 250,              // 宽度（默认200px）
    height: 180,             // 高度（默认150px）
    position: 'bottom-left', // 位置（默认bottom-right）
    margin: 20,              // 边距（默认16px）
    collapsible: true,       // 可折叠（默认true）
    defaultExpanded: false,  // 默认折叠，由智能显示控制
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    viewportColor: 'rgba(90, 79, 207, 0.3)',
    elementColor: 'rgba(0, 0, 0, 0.2)',
  }}
/>
```

### 6. 配置选项

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `width` | number | 200 | Minimap 宽度（像素） |
| `height` | number | 150 | Minimap 高度（像素） |
| `position` | string | 'bottom-right' | 位置：'bottom-right', 'bottom-left', 'top-right', 'top-left' |
| `margin` | number | 16 | 与边缘的间距（像素） |
| `collapsible` | boolean | true | 是否可折叠 |
| `defaultExpanded` | boolean | false | 默认折叠，由智能显示控制 |
| `displayMode` | string | 'auto' | 显示模式：'auto', 'always', 'manual' |
| `backgroundColor` | string | 'rgba(255, 255, 255, 0.95)' | 背景颜色 |
| `borderColor` | string | 'rgba(0, 0, 0, 0.1)' | 边框颜色 |
| `viewportColor` | string | 'rgba(90, 79, 207, 0.3)' | 视口框颜色 |
| `elementColor` | string | 'rgba(0, 0, 0, 0.2)' | 元素颜色 |

## 交互说明

### 用户操作

- **点击**：点击小地图任意位置，画布视口跳转到对应区域（居中）
- **拖拽**：按住鼠标/手指拖动视口框，实时移动画布
- **折叠/展开**：点击右上角按钮切换展开状态

### 光标变化

- **默认**: `pointer`（鼠标悬停时）
- **拖拽中**: `grabbing`

## 核心实现

### 1. 坐标转换算法

```typescript
// 画布坐标 → Minimap 坐标
canvasToMinimapCoords(canvasX, canvasY) {
  const offsetX = 10; // Minimap 内边距
  const offsetY = 10;

  const x = (canvasX - contentBounds.x) * scale + offsetX;
  const y = (canvasY - contentBounds.y) * scale + offsetY;

  return [x, y];
}

// Minimap 坐标 → 画布坐标
minimapToCanvasCoords(minimapX, minimapY) {
  const offsetX = 10;
  const offsetY = 10;

  const x = (minimapX - offsetX) / scale + contentBounds.x;
  const y = (minimapY - offsetY) / scale + contentBounds.y;

  return [x, y];
}
```

### 2. 自动缩放计算

```typescript
calculateScale(contentBounds) {
  const scaleX = (config.width - 20) / contentBounds.width;
  const scaleY = (config.height - 20) / contentBounds.height;
  return Math.min(scaleX, scaleY, 1); // 不超过 1:1
}
```

### 3. 元素边界提取

支持多种元素类型：
- **基于 points**: tool, image, draw 元素
- **基于 x, y, width, height**: mind map 元素

```typescript
getAllElementBounds() {
  board.children.forEach((element) => {
    if (element.points) {
      bounds = RectangleClient.getRectangleByPoints(element.points);
    } else if (element.x !== undefined) {
      bounds = { x: element.x, y: element.y, width, height };
    }
  });
}
```

### 4. 实时同步

使用 `setInterval` 每 100ms 更新一次：

```typescript
useEffect(() => {
  const intervalId = setInterval(() => {
    render();
  }, 100);
  return () => clearInterval(intervalId);
}, [board, state.expanded, render]);
```

## 性能优化

### 1. Canvas 渲染
- 使用 Canvas 2D 而非 SVG，渲染性能更优
- 元素简化为矩形块，减少绘制复杂度

### 2. 防抖与节流
- 拖拽时使用 `requestAnimationFrame` 平滑更新
- 100ms 轮询间隔，平衡实时性与性能

### 3. 条件渲染
- 折叠时停止渲染循环，节省资源
- 空画布时显示提示，避免无效计算

## 样式定制

### CSS Variables

```scss
.minimap {
  --minimap-bg: rgba(255, 255, 255, 0.95);
  --minimap-border: rgba(0, 0, 0, 0.1);
  --minimap-toggle-bg: rgba(255, 255, 255, 0.9);
  --minimap-toggle-hover-bg: rgba(90, 79, 207, 0.1);
  --minimap-toggle-icon: #666;
}
```

### 暗色主题支持

```scss
@media (prefers-color-scheme: dark) {
  .minimap {
    &__content {
      background: rgba(30, 30, 30, 0.95);
      border-color: rgba(255, 255, 255, 0.1);
    }
  }
}
```

## 事件追踪

内置 Umami 追踪点：

- `minimap_container` - Minimap 容器
- `minimap_click_toggle` - 折叠/展开按钮点击

## 未来扩展

### 可能的增强功能

1. **缩略图缓存**：缓存渲染结果，减少重绘
2. **按需渲染**：仅在元素/视口变化时更新
3. **元素过滤**：支持隐藏特定类型的元素
4. **缩放手势**：移动端双指缩放支持
5. **书签功能**：记住常用位置，快速跳转
6. **热区高亮**：显示元素密度热力图

### 待优化项

- [ ] 移动端触摸优化
- [ ] 大量元素时的性能优化（虚拟化）
- [ ] 自定义元素颜色映射
- [ ] 键盘快捷键支持

## 故障排查

### Q1: Minimap 不显示
- 检查 `board` 是否已初始化
- 确认 `state.expanded` 为 `true`

### Q2: 视口框位置偏移
- 检查 viewport 坐标计算是否正确
- 确认 `getViewportOrigination` 返回值有效

### Q3: 点击跳转不准确
- 检查 `minimapToCanvasCoords` 坐标转换逻辑
- 确认 `scale` 计算正确

### Q4: 样式异常
- 确认已导入 `minimap.scss`
- 检查 z-index 冲突

## 参考资料

- [Figma Minimap](https://www.figma.com/)
- [Excalidraw Navigation](https://excalidraw.com/)
- [Miro Minimap](https://miro.com/)
- [Canvas 2D API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
