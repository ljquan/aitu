# 文本粘贴功能

## 功能概述

Aitu 现在支持智能文本粘贴功能，当你从外部复制文本并粘贴到画布时，系统会自动控制文本宽度，避免文本过长。

## 功能特点

### 1. 自动换行
- 当文本行超过 50 个字符时，自动换行
- 优先在空格处断行，保持单词完整性
- 如果空格位置不合适，则在最大字符数处强制断行

### 2. 智能断行
- 在空格处断行时，会检查空格位置是否在合理范围内（70% 以上）
- 避免在行首或行尾留下过短的单词片段
- 自动去除断行后的多余空格

### 3. 保留原有格式
- 保留原文本中的换行符
- 每个原始行独立处理，不会合并多行

## 技术实现

### 核心文件
- `packages/drawnix/src/plugins/with-text-paste.ts` - 文本粘贴插件
- `packages/drawnix/src/plugins/with-common.tsx` - 插件注册

### 配置参数

```typescript
const TEXT_CONFIG = {
  /** 最大字符数（超过则换行） */
  MAX_CHARS_PER_LINE: 50,
  /** 默认文本框宽度（像素） */
  DEFAULT_WIDTH: 400,
  /** 最大文本框宽度（像素） */
  MAX_WIDTH: 600,
  /** 估算字符宽度（像素） */
  CHAR_WIDTH: 8,
};
```

### 插件链顺序

```typescript
// 在 with-common.tsx 中
return withTextPastePlugin(withImagePlugin(newBoard));
```

插件按以下顺序处理粘贴事件：
1. `withTextPastePlugin` - 检查是否为纯文本，如果是则处理并返回
2. `withImagePlugin` - 检查是否为图片，如果是则处理并返回
3. 默认处理 - 处理其他类型的粘贴（如 Plait 元素）

## 使用方法

### 基本使用
1. 从任何地方复制文本（浏览器、编辑器、文档等）
2. 在 Aitu 画布上按 `Ctrl+V` (Windows/Linux) 或 `Cmd+V` (Mac)
3. 文本会自动插入到鼠标位置，并自动换行

### 示例

**输入文本：**
```
This is a very long line of text that exceeds the maximum character limit and should be automatically wrapped to multiple lines.
```

**输出效果：**
```
This is a very long line of text that exceeds
the maximum character limit and should be
automatically wrapped to multiple lines.
```

## 注意事项

1. **不影响现有功能**
   - 图片粘贴功能正常工作
   - Plait 元素复制粘贴正常工作
   - 只处理纯文本粘贴

2. **文本宽度限制**
   - 默认最大 50 字符/行
   - 可以通过修改 `TEXT_CONFIG.MAX_CHARS_PER_LINE` 调整

3. **中英文混排**
   - 当前按字符数计算，中文字符和英文字符同等对待
   - 中文文本可能需要调整 `MAX_CHARS_PER_LINE` 参数

## 未来改进方向

1. **智能宽度检测**
   - 根据实际字符宽度（中文 vs 英文）动态调整
   - 支持等宽字体和比例字体的不同处理

2. **用户配置**
   - 在设置中允许用户自定义最大字符数
   - 支持开启/关闭自动换行功能

3. **富文本支持**
   - 保留粘贴文本的格式（粗体、斜体等）
   - 支持 Markdown 格式自动转换

## 相关文件

- `packages/drawnix/src/plugins/with-text-paste.ts` - 文本粘贴插件实现
- `packages/drawnix/src/plugins/with-common.tsx` - 插件注册
- `packages/drawnix/src/plugins/with-image.tsx` - 图片粘贴插件（参考实现）
- `packages/drawnix/src/mcp/tools/canvas-insertion.ts` - 画布插入工具（文本插入参考）
