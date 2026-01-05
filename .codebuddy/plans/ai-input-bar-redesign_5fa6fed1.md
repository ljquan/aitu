---
name: ai-input-bar-redesign
overview: 重新设计 AI 输入框组件，使其更接近原设计图：单行布局、橙色主题、工具按钮和输入框在同一行。
design:
  architecture:
    framework: react
  styleKeywords:
    - 扁平化
    - 橙色主题
    - 圆角设计
    - 简洁现代
  fontSystem:
    fontFamily: PingFang SC
    heading:
      size: 16px
      weight: 500
    subheading:
      size: 14px
      weight: 400
    body:
      size: 14px
      weight: 400
  colorSystem:
    primary:
      - "#F59E0B"
      - "#D97706"
    background:
      - "#FFFFFF"
      - "#F3F4F6"
    text:
      - "#1F2937"
      - "#9CA3AF"
    functional:
      - "#6B7280"
      - "#FFFFFF"
todos:
  - id: explore-existing
    content: 使用 [subagent:code-explorer] 探索现有 AIInputBar 组件的代码结构
    status: completed
  - id: refactor-layout
    content: 重构 AIInputBar 主组件为单行水平 Flexbox 布局
    status: completed
    dependencies:
      - explore-existing
  - id: implement-tool-buttons
    content: 实现左侧工具按钮组，支持图片/视频切换和橙色激活状态
    status: completed
    dependencies:
      - refactor-layout
  - id: implement-model-selector
    content: 实现模型选择器下拉菜单组件
    status: completed
    dependencies:
      - refactor-layout
  - id: style-input-send
    content: 调整输入框和发送按钮样式，应用橙色边框主题
    status: completed
    dependencies:
      - refactor-layout
  - id: integration-test
    content: 整合测试，确保组件交互和视觉效果符合设计图
    status: completed
    dependencies:
      - implement-tool-buttons
      - implement-model-selector
      - style-input-send
---

## 产品概述

重新设计 AI 输入框组件，使其完全符合原设计图的视觉效果和交互体验。核心改动是将当前的多行布局改为单行水平布局，并应用橙色主题风格。

## 核心功能

- **单行水平布局**：所有元素（图片按钮、视频按钮、模型选择器、上传按钮、输入框、发送按钮）排列在同一行
- **橙色主题边框**：整个输入框容器使用橙色边框，圆角设计
- **工具按钮组**：左侧放置图片和视频切换按钮，视频按钮激活时显示橙色背景
- **模型选择器**：带下拉箭头的模型选择按钮，点击展开显示模型选项列表（如 Sora 2）
- **上传按钮**：位于模型选择器右侧的上传图标按钮
- **输入框**：占据中间剩余空间，显示 placeholder "想要创建什么"
- **发送按钮**：灰色圆形按钮，位于最右侧，内含发送图标

## 技术栈

- 前端框架：React + TypeScript
- 样式方案：Tailwind CSS
- 基于现有项目结构进行组件重构

## 技术架构

### 模块划分

- **AIInputBar 主组件**：负责整体布局和状态管理
- **ToolButtonGroup 子组件**：图片/视频切换按钮组
- **ModelSelector 子组件**：模型选择下拉菜单
- **UploadButton 子组件**：文件上传按钮
- **InputField 子组件**：文本输入区域
- **SendButton 子组件**：发送按钮

### 数据流

用户点击工具按钮 -> 更新激活状态 -> 重新渲染按钮样式
用户选择模型 -> 更新当前模型 -> 关闭下拉菜单
用户输入文本 -> 更新输入值 -> 控制发送按钮状态

## 实现细节

### 核心目录结构

```
src/
├── components/
│   └── AIInputBar/
│       ├── index.tsx           # 主组件重构
│       ├── ToolButtonGroup.tsx # 新增：工具按钮组
│       ├── ModelSelector.tsx   # 新增：模型选择器
│       └── styles.css          # 样式调整（如需要）
```

### 关键代码结构

**组件布局结构**：采用 Flexbox 实现单行水平布局

```
// AIInputBar 布局结构
<div className="flex items-center border-2 border-orange-400 rounded-full px-2 py-1">
  <ToolButtonGroup activeType={type} onTypeChange={setType} />
  <ModelSelector model={model} onModelChange={setModel} />
  <UploadButton onUpload={handleUpload} />
  <input className="flex-1" placeholder="想要创建什么" />
  <SendButton onClick={handleSend} />
</div>
```

**工具按钮状态接口**：

```typescript
interface ToolButtonGroupProps {
  activeType: 'image' | 'video';
  onTypeChange: (type: 'image' | 'video') => void;
}
```

## 设计风格

采用简洁现代的扁平化设计风格，以橙色为主题色，营造温暖、活力的视觉感受。

## 页面设计

### AI 输入框组件

整体为单行水平布局，外层容器使用橙色边框和大圆角（pill 形状）。

**左侧工具区**：

- 图片按钮：灰色图标，未激活状态
- 视频按钮：激活时显示橙色背景填充，白色图标，圆角方形

**模型选择区**：

- 显示当前模型名称（如 "Veo 3"）
- 右侧带向上箭头图标
- 点击展开白色下拉菜单，显示模型列表

**上传按钮**：

- 上传图标按钮，灰色描边风格

**输入区域**：

- 无边框输入框，占据剩余空间
- placeholder 文字为浅灰色 "想要创建什么"

**发送按钮**：

- 圆形灰色背景
- 白色发送箭头图标
- 位于最右侧

## Agent Extensions

### SubAgent

- **code-explorer**
- 用途：探索现有项目中 AIInputBar 组件的实现代码，了解当前结构和样式
- 预期结果：获取现有组件的完整代码结构，为重构提供基础