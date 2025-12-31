---
name: fix-highlight-tag-coverage
overview: 修复参数标签背景色无法完全覆盖文字的问题，调整高亮标签的样式使背景色完全包裹文本。
todos:
  - id: find-highlight-styles
    content: 使用 [subagent:code-explorer] 搜索高亮标签的样式定义和组件实现
    status: completed
  - id: analyze-issue
    content: 分析当前样式问题，确定背景色无法覆盖文字的具体原因
    status: completed
    dependencies:
      - find-highlight-styles
  - id: fix-padding-styles
    content: 修复高亮标签的 padding 和 display 属性，确保背景色完全包裹文本
    status: completed
    dependencies:
      - analyze-issue
  - id: verify-fix
    content: 验证修复效果，确保各类参数标签显示正常
    status: completed
    dependencies:
      - fix-padding-styles
---

## 产品概述

修复参数标签高亮显示的样式问题，确保背景色能够完全覆盖标签内的所有文字。

## 核心功能

- 修复参数标签（如 `-size:1024x1024`）背景色无法完全覆盖文字的问题
- 调整高亮标签的内边距（padding）确保背景色完全包裹文本
- 保持标签的视觉一致性和可读性

## 技术方案

### 问题分析

根据用户反馈，参数标签的背景色右侧有部分文字没有被覆盖，这通常是由以下原因导致：

1. 标签元素的 `padding-right` 不足或缺失
2. 使用了 `inline` 显示模式导致换行时背景不连续
3. 文字溢出了容器边界

### 解决方案

1. **检查并调整 padding**：确保标签元素有足够的左右内边距
2. **使用合适的 display 属性**：建议使用 `inline-block` 或 `inline-flex` 确保背景完整覆盖
3. **添加 box-decoration-break**：对于可能换行的长标签，使用 `box-decoration-break: clone` 确保每行都有完整背景

### 关键样式修改

```css
.highlight-tag {
  display: inline-block;
  padding: 2px 6px; /* 确保左右有足够内边距 */
  background-color: /* 背景色 */;
  border-radius: 4px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
```

### 实现步骤

1. 定位高亮标签的样式定义文件
2. 检查当前的 padding 和 display 属性设置
3. 调整样式确保背景色完全包裹文本
4. 测试不同长度的参数标签显示效果

## Agent Extensions

### SubAgent

- **code-explorer**
- 用途：搜索项目中高亮标签相关的样式定义和组件实现
- 预期结果：找到参数标签的样式文件和相关组件代码