---
name: simplify-video-preview
overview: 简化视频预览处理：移除异步缩略图生成，直接使用图标占位符显示视频，消除"处理中"延迟。
todos:
  - id: explore-code
    content: 使用 [subagent:code-explorer] 探索项目中视频预览和缩略图生成相关的所有代码
    status: completed
  - id: remove-thumbnail-logic
    content: 移除视频缩略图异步生成逻辑和相关工具函数
    status: completed
    dependencies:
      - explore-code
  - id: simplify-preview-component
    content: 简化视频预览组件，使用图标占位符替代缩略图
    status: completed
    dependencies:
      - remove-thumbnail-logic
  - id: cleanup-states
    content: 清理相关的处理中状态和 loading 逻辑
    status: completed
    dependencies:
      - simplify-preview-component
  - id: verify-changes
    content: 验证修改效果，确保视频预览即时显示无延迟
    status: completed
    dependencies:
      - cleanup-states
---

## 产品概述

简化视频预览处理流程，移除异步缩略图生成机制，采用图标占位符直接显示视频文件，消除用户等待"处理中"的延迟体验。

## 核心功能

- 移除视频缩略图异步生成逻辑
- 使用统一的视频图标占位符替代缩略图显示
- 消除视频预览的"处理中"状态提示
- 保持视频文件的基本信息展示（文件名、时长等）

## 技术方案

### 修改范围分析

本次为现有项目的简化重构，需要：

1. 定位并移除视频缩略图生成相关代码
2. 替换视频预览组件的渲染逻辑
3. 清理相关的异步处理状态管理

### 实现策略

#### 代码移除

- 移除视频帧提取/缩略图生成的异步函数
- 移除相关的 loading/processing 状态管理
- 移除缩略图缓存逻辑（如有）

#### 代码替换

- 视频预览区域直接渲染视频图标组件
- 保留视频文件元信息的展示（文件名、大小等）

### 核心修改结构

```
src/
├── components/
│   └── VideoPreview/      # 修改：简化预览组件
├── utils/
│   └── videoProcessor.ts  # 移除或简化：缩略图生成逻辑
└── hooks/
    └── useVideoPreview.ts # 修改：移除异步处理状态
```

### 技术实现要点

1. **图标占位符方案**：使用 SVG 视频图标或图标库中的视频图标
2. **状态简化**：移除 isProcessing、thumbnailUrl 等状态
3. **同步渲染**：视频项直接渲染，无需等待异步操作

## Agent Extensions

### SubAgent

- **code-explorer**
- 用途：探索项目代码库，定位视频预览相关的所有文件和组件
- 预期结果：找到所有需要修改的视频缩略图生成、预览组件、状态管理相关代码位置