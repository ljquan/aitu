---
name: fix-prompt-selection-blur-issue
overview: 修复点击提示词时输入框失焦导致提示词无法填入的问题。使用 onMouseDown + preventDefault 阻止 blur 事件触发。
todos:
  - id: locate-prompt-component
    content: 使用 [subagent:code-explorer] 定位提示词面板和选项组件的代码位置
    status: completed
  - id: add-mousedown-handler
    content: 在提示词选项元素上添加 onMouseDown 事件处理器并调用 preventDefault
    status: completed
    dependencies:
      - locate-prompt-component
  - id: verify-fix
    content: 验证修复效果，确保点击提示词能正确填入输入框
    status: completed
    dependencies:
      - add-mousedown-handler
---

## 产品概述

修复提示词选择功能的交互缺陷，确保用户点击提示词时能够正确填入输入框。

## 核心功能

- 修复点击提示词时输入框失焦导致提示词无法填入的问题
- 使用 onMouseDown + preventDefault 阻止 blur 事件触发
- 保持提示词面板在点击过程中的可见性，确保 onClick 事件正常执行

## 问题分析

当前问题的根本原因：

1. 提示词面板的 visible 状态依赖于输入框的 isFocused 状态
2. 当用户点击提示词时，事件触发顺序为：mousedown → blur → click
3. blur 事件触发后，isFocused 变为 false，面板立即隐藏
4. 面板隐藏后，onClick 事件无法正常执行，导致提示词无法填入

## 解决方案

在提示词选项上添加 onMouseDown 事件处理器，调用 preventDefault() 阻止默认行为，从而阻止 blur 事件的触发。

### 技术实现

```typescript
// 在提示词选项组件上添加
onMouseDown={(e) => {
  e.preventDefault(); // 阻止 blur 事件触发
}}
onClick={() => {
  // 正常执行填入提示词的逻辑
  handleSelectPrompt(prompt);
}}
```

### 事件流程对比

**修复前：**
mousedown → blur（面板隐藏）→ click（无法执行）

**修复后：**
mousedown（preventDefault）→ click（正常执行）→ 手动处理焦点