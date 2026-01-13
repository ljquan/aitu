---
name: fix-ai-input-bar-selection
overview: 修复 AI 输入框的选择显示问题：1) 文字元素应显示为文字预览卡片；2) 视频元素应区分显示（带视频图标）；3) 所有选中内容都在输入框上方正确展示。
todos:
  - id: explore-codebase
    content: 使用 [subagent:code-explorer] 探索 AIInputBar 组件和 SelectedContent 相关代码结构
    status: completed
  - id: extend-interface
    content: 扩展 SelectedContent 接口，添加 video 和 text 类型支持
    status: completed
    dependencies:
      - explore-codebase
  - id: add-video-detection
    content: 实现视频 URL 识别逻辑，区分视频和图片元素
    status: completed
    dependencies:
      - extend-interface
  - id: handle-text-content
    content: 修改内容处理函数，将 remainingText 转换为 text 类型的 SelectedContent
    status: completed
    dependencies:
      - extend-interface
  - id: render-preview
    content: 更新 AIInputBar 预览区渲染逻辑，支持三种类型的差异化显示
    status: completed
    dependencies:
      - add-video-detection
      - handle-text-content
  - id: test-verify
    content: 测试验证文字、图片、视频三种类型的选择和显示效果
    status: completed
    dependencies:
      - render-preview
---

## 产品概述

修复 AI 输入框的选择内容显示问题，确保不同类型的选中内容（文字、图片、视频）能够正确区分并在输入框上方展示。

## 核心功能

- 文字元素显示为文字预览卡片，展示文字内容摘要
- 视频元素与图片区分显示，带有视频图标标识
- 图片元素保持当前的缩略图预览方式
- 所有选中内容统一在输入框上方的预览区正确展示

## 技术方案

### 问题分析

根据用户反馈，当前存在以下问题：

1. 文字元素被提取到 `remainingText` 但未在预览区显示
2. 视频元素（URL 包含 #video 或视频扩展名）被当作普通图片处理
3. `SelectedContent` 接口缺少 `text` 和 `video` 类型定义

### 数据流分析

```mermaid
flowchart TD
    A[用户选择内容] --> B[processSelectedContentForAI]
    B --> C{内容类型判断}
    C -->|图片URL| D[image类型]
    C -->|视频URL| E[video类型-需新增]
    C -->|文字内容| F[text类型-需新增]
    D --> G[SelectedContent数组]
    E --> G
    F --> G
    G --> H[AIInputBar预览区渲染]
```

### 修改方案

#### 1. 扩展 SelectedContent 接口

```typescript
interface SelectedContent {
  type: 'image' | 'video' | 'text';
  url?: string;      // 图片/视频URL
  text?: string;     // 文字内容
  thumbnail?: string; // 视频缩略图（可选）
}
```

#### 2. 视频识别逻辑

```typescript
function isVideoUrl(url: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
  const hasVideoHash = url.includes('#video');
  const hasVideoExtension = videoExtensions.some(ext => 
    url.toLowerCase().includes(ext)
  );
  return hasVideoHash || hasVideoExtension;
}
```

#### 3. 预览区渲染逻辑

- `image` 类型：显示图片缩略图
- `video` 类型：显示缩略图 + 视频图标覆盖层
- `text` 类型：显示文字预览卡片（带文字图标，显示内容摘要）

### 核心目录结构

```
src/
├── components/
│   └── AIInputBar/
│       ├── index.tsx           # 修改：预览区渲染逻辑
│       └── SelectedPreview.tsx # 新增：选中内容预览组件
├── types/
│   └── ai.ts                   # 修改：SelectedContent接口
└── utils/
    └── contentProcessor.ts     # 修改：processSelectedContentForAI函数
```

## Agent Extensions

### SubAgent

- **code-explorer**
- 用途：探索项目中 AIInputBar 组件、SelectedContent 接口定义、processSelectedContentForAI 函数的具体实现位置和代码结构
- 预期结果：定位所有需要修改的文件路径和相关代码逻辑