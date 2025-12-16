# 触摸缩放修复方案

## 问题描述
在移动设备上使用双指缩放时，会触发浏览器的页面缩放，导致 toolbar 移出可视区域，无法操作。

## 解决方案

### 多层防护策略

#### 1. Meta Viewport（HTML 层）
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
```

#### 2. CSS touch-action（样式层）
```css
html, body, #root {
  touch-action: none;
}
```

#### 3. JavaScript 超强拦截（核心）
在 `packages/drawnix/src/services/prevent-pinch-zoom-service.ts` 中实现：

```typescript
// 在 document 和 window 上同时监听
// 使用 capture: true 确保最先拦截
// 使用 stopImmediatePropagation 确保最高优先级

const preventMultiTouch = (event: TouchEvent) => {
  if (event.touches.length > 1) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }
};

document.addEventListener('touchstart', preventMultiTouch, { passive: false, capture: true });
document.addEventListener('touchmove', preventMultiTouch, { passive: false, capture: true });
// ... 同时在 window 上也添加监听器
```

## 技术要点

### 1. 事件监听优先级
- **capture: true** - 在捕获阶段拦截，比冒泡阶段更早
- **passive: false** - 允许调用 `preventDefault()`
- **stopImmediatePropagation** - 阻止同层级其他监听器

### 2. 双重保险
- document 级别监听
- window 级别监听
- 确保覆盖所有触摸事件

### 3. 完整的事件类型
- touchstart / touchmove / touchend / touchcancel
- gesturestart / gesturechange / gestureend（iOS Safari）
- wheel（Ctrl/Cmd + 滚轮）

## 实现文件

- `apps/web/index.html` - Meta viewport
- `apps/web/src/styles.scss` - CSS touch-action
- `packages/drawnix/src/services/prevent-pinch-zoom-service.ts` - JavaScript 拦截
- `apps/web/src/main.tsx` - 服务初始化

## 测试方法

### 移动设备测试
1. 在画布上双指缩放 → ✅ 应该缩放画布
2. 在 toolbar 上双指缩放 → ❌ 不应该缩放页面
3. 在 iframe 上双指缩放 → ❌ 不应该缩放页面
4. 单指点击/滚动 → ✅ 应该正常工作

### 控制台日志
当双指缩放时，应该看到：
```
[PreventPinchZoom] 🛑 BLOCKED multi-touch: touchstart touches: 2
[PreventPinchZoom] 🛑 BLOCKED multi-touch: touchmove touches: 2
```

## 浏览器兼容性

| 特性 | iOS Safari | Android Chrome | Firefox Mobile |
|------|-----------|----------------|----------------|
| Meta Viewport | ✅ | ✅ | ✅ |
| touch-action | ✅ 13+ | ✅ 36+ | ✅ 52+ |
| Touch Events | ✅ | ✅ | ✅ |
| Gesture Events | ✅ | ❌ | ❌ |

## 已知限制

### 1. iframe 内部缩放
- iframe 有独立的文档上下文
- 父页面监听器无法直接拦截 iframe 内部事件
- 通过全局监听 + meta viewport + CSS 组合防护

### 2. 无障碍性
- 禁用页面缩放可能影响视力障碍用户
- 建议提供其他无障碍功能（如文本大小调整）

## 总结

通过**三层防护**（HTML + CSS + JavaScript）确保页面缩放被完全阻止：
1. Meta viewport 作为基础防护
2. CSS touch-action 提供样式层控制
3. JavaScript 超强拦截作为核心保障

这种多层防护策略确保在各种浏览器和设备上都能有效防止页面缩放。
