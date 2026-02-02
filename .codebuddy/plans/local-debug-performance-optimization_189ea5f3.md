---
name: local-debug-performance-optimization
overview: 优化本地调试页面加载性能，并修复素材库显示不完全的问题。主要包括：1) 修复 `.media-library-grid__container` 缺失样式导致虚拟滚动高度计算失败；2) 优化 IndexedDB 初始化时序，延迟非关键服务加载。
todos:
  - id: optimize-workzone-restore
    content: 优化 drawnix.tsx 中 WorkZone 恢复逻辑，使用 requestIdleCallback 延迟执行，增加首屏渲染后的延迟
    status: completed
  - id: fix-virtual-grid-resize
    content: 修复 VirtualAssetGrid.tsx 虚拟滚动问题，添加 ResizeObserver 监听容器尺寸变化并触发重新测量
    status: completed
---

## 用户需求

用户反馈两个问题需要修复：

1. **页面加载慢卡** - 本地调试打开页面很慢很卡
2. **素材库显示不完全** - 素材库有时没法显示完全

## 核心功能

### 问题 1: 页面性能优化

- 减少首次渲染的阻塞操作
- 优化 WorkZone 恢复逻辑的执行时机
- 使用 `requestIdleCallback` 延迟非关键初始化

### 问题 2: 素材库显示修复

- 确保虚拟滚动容器正确获取高度
- 添加容器尺寸变化监听，触发虚拟滚动重新计算
- 修复 flex 布局高度传递问题

## 技术栈

- React + TypeScript
- @tanstack/react-virtual（虚拟滚动）
- SCSS 样式

## 实现方案

### 问题 1: 页面性能优化

**根因分析**：

1. `drawnix.tsx` 中 WorkZone 恢复逻辑（第 276-461 行）在组件首次渲染时执行大量异步操作
2. 多个 `useEffect` 同时执行动态 import 和 Service Worker 初始化
3. 字体预加载在渲染早期执行，阻塞其他操作

**优化策略**：

1. **延迟非关键初始化** - 使用 `requestIdleCallback` 将 WorkZone 恢复、视频恢复服务等延迟到浏览器空闲时执行
2. **增加初始化延迟** - 在 WorkZone 恢复前增加短暂延迟，让首屏渲染完成
3. **条件执行** - 只有在确实有 WorkZone 需要恢复时才执行完整逻辑

### 问题 2: 素材库显示修复

**根因分析**：
经过代码检查，`MediaLibraryGrid.scss` 中 `&__container` 样式已正确定义（第 421-442 行），包含：

- `flex: 1`
- `min-height: 0`
- `overflow: auto`

问题可能出在：

1. **VirtualAssetGrid 容器高度计算** - 当父容器高度变化时，虚拟滚动器没有重新计算
2. **useVirtualizer 的 estimateSize 回调** - 可能在某些情况下返回错误的高度

**修复策略**：

1. **添加 ResizeObserver** - 监听容器尺寸变化，触发虚拟滚动重新测量
2. **添加 key 强制刷新** - 当 viewMode 或 gridSize 变化时重新初始化虚拟滚动器

## 实现注意事项

1. **使用 requestIdleCallback 的兜底** - Safari 不支持 requestIdleCallback，需要 setTimeout 兜底
2. **避免循环依赖** - WorkZone 恢复逻辑使用动态 import，保持现有模式
3. **保持向后兼容** - 不改变现有 API 和数据结构

## 目录结构

```
packages/drawnix/src/
├── drawnix.tsx                                    # [MODIFY] 优化 WorkZone 恢复逻辑的执行时机
└── components/media-library/
    └── VirtualAssetGrid.tsx                       # [MODIFY] 添加 ResizeObserver 监听容器尺寸变化
```