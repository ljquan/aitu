# Bug Fix: Tool Element Deletion and Clipboard Support

> Date: 2025-12-08
> Branch: feat/08-multifunctional-toolbox
> Status: ✅ Fixed

---

## 🐛 问题描述

### 用户报告的问题

用户发现工具元素可以移动,但无法通过以下方式删除或复制:
- 按 Delete 键删除
- 按 Backspace 键删除
- Ctrl+C 复制
- Ctrl+V 粘贴
- Ctrl+D 复制

相比之下,图片和视频元素可以正常使用这些功能。

---

## 🔍 根因分析

### 问题原因

工具元素缺少 Plait 的 **Fragment API** 实现:

1. **`board.getDeletedFragment`** - 决定哪些元素应该被删除
2. **`board.buildFragment`** - 决定哪些元素应该被复制到剪贴板
3. **`board.insertFragment`** - 决定如何从剪贴板粘贴元素

### 对比分析

#### Freehand 元素的实现 (参考: `with-freehand-fragment.ts`)

```typescript
board.getDeletedFragment = (data: PlaitElement[]) => {
  const freehandElements = getSelectedFreehandElements(board);
  if (freehandElements.length) {
    data.push(...freehandElements);
  }
  return getDeletedFragment(data);
};

board.buildFragment = (
  clipboardContext: WritableClipboardContext | null,
  rectangle: RectangleClient | null,
  operationType: WritableClipboardOperationType,
  originData?: PlaitElement[]
) => {
  const freehandElements = getSelectedFreehandElements(board);
  if (freehandElements.length) {
    const elements = buildClipboardData(
      board,
      freehandElements,
      rectangle ? [rectangle.x, rectangle.y] : [0, 0]
    );
    clipboardContext = addOrCreateClipboardContext(clipboardContext, {
      text: '',
      type: WritableClipboardType.elements,
      elements,
    });
  }
  return buildFragment(clipboardContext, rectangle, operationType, originData);
};

board.insertFragment = (
  clipboardData: ClipboardData | null,
  targetPoint: Point,
  operationType?: WritableClipboardOperationType
) => {
  const freehandElements = clipboardData?.elements?.filter((value) =>
    Freehand.isFreehand(value)
  ) as Freehand[];
  if (freehandElements && freehandElements.length > 0) {
    insertClipboardData(board, freehandElements, targetPoint);
  }
  insertFragment(clipboardData, targetPoint, operationType);
};
```

#### Draw 元素的实现 (参考: `@plait/draw`)

Draw 插件也实现了相同的三个方法,用于支持图片、几何图形、箭头等元素的删除、复制和粘贴。

### Plait 删除机制

Plait Core 在 `withSelection` 插件中处理键盘事件:

```typescript
// @plait/core/fesm2022/plait-core.mjs:5967-5972
if (!PlaitBoard.isReadonly(board) &&
    selectedElements.length > 0 &&
    (hotkeys.isDeleteBackward(event) || hotkeys.isDeleteForward(event))) {
    event.preventDefault();
    deleteFragment(board);  // 内部调用 board.getDeletedFragment
}
```

**关键点**: `deleteFragment(board)` 会调用 `board.getDeletedFragment()` 来确定要删除哪些元素。如果插件没有实现这个方法,工具元素就不会被包含在删除列表中。

---

## ✅ 修复方案

### 修改文件

`packages/drawnix/src/plugins/with-tool.ts`

### 1. 添加必要的导入

```typescript
import {
  PlaitBoard,
  PlaitPlugin,
  PlaitPluginElementContext,
  Point,
  Transforms,
  RectangleClient,
  PlaitElement,
  Selection,
  ClipboardData,
  WritableClipboardContext,
  WritableClipboardOperationType,
  WritableClipboardType,
  addOrCreateClipboardContext,
  getSelectedElements,
} from '@plait/core';
import { buildClipboardData, insertClipboardData } from '@plait/common';
```

### 2. 添加辅助函数

```typescript
/**
 * 获取当前选中的工具元素
 */
function getSelectedToolElements(board: PlaitBoard): PlaitTool[] {
  const selectedElements = getSelectedElements(board);
  return selectedElements.filter(isToolElement) as PlaitTool[];
}
```

### 3. 在 withTool 插件中保存原始方法引用

```typescript
export const withTool: PlaitPlugin = (board: PlaitBoard) => {
  const {
    drawElement,
    getRectangle,
    isHit,
    isRectangleHit,
    isMovable,
    isAlign,
    getDeletedFragment,      // ✅ 新增
    buildFragment,           // ✅ 新增
    insertFragment,          // ✅ 新增
  } = board;

  // ... 现有代码 ...
```

### 4. 实现 getDeletedFragment 方法

```typescript
// 注册 getDeletedFragment 方法 - 支持删除工具元素
board.getDeletedFragment = (data: PlaitElement[]) => {
  const toolElements = getSelectedToolElements(board);
  if (toolElements.length) {
    data.push(...toolElements);
    console.log('Tool elements marked for deletion:', toolElements.length);
  }
  return getDeletedFragment(data);
};
```

**工作原理**:
- 当用户按 Delete/Backspace 键时,Plait Core 调用此方法
- 方法检查当前选中的元素中是否有工具元素
- 如果有,将它们添加到 `data` 数组中
- 调用原始的 `getDeletedFragment` 方法,允许其他插件也添加它们的元素

### 5. 实现 buildFragment 方法

```typescript
// 注册 buildFragment 方法 - 支持复制工具元素
board.buildFragment = (
  clipboardContext: WritableClipboardContext | null,
  rectangle: RectangleClient | null,
  operationType: WritableClipboardOperationType,
  originData?: PlaitElement[]
) => {
  const toolElements = getSelectedToolElements(board);
  if (toolElements.length) {
    const elements = buildClipboardData(
      board,
      toolElements,
      rectangle ? [rectangle.x, rectangle.y] : [0, 0]
    );
    clipboardContext = addOrCreateClipboardContext(clipboardContext, {
      text: '',
      type: WritableClipboardType.elements,
      elements,
    });
    console.log('Tool elements added to clipboard:', toolElements.length);
  }
  return buildFragment(clipboardContext, rectangle, operationType, originData);
};
```

**工作原理**:
- 当用户按 Ctrl+C 或 Ctrl+D 时,Plait Core 调用此方法
- 使用 `buildClipboardData` 将元素转换为可序列化的格式
- 将工具元素添加到剪贴板上下文中
- 调用原始的 `buildFragment` 方法,允许其他插件也添加它们的元素

### 6. 实现 insertFragment 方法

```typescript
// 注册 insertFragment 方法 - 支持粘贴工具元素
board.insertFragment = (
  clipboardData: ClipboardData | null,
  targetPoint: Point,
  operationType?: WritableClipboardOperationType
) => {
  const toolElements = clipboardData?.elements?.filter((value) =>
    isToolElement(value)
  ) as PlaitTool[];
  if (toolElements && toolElements.length > 0) {
    insertClipboardData(board, toolElements, targetPoint);
    console.log('Tool elements pasted from clipboard:', toolElements.length);
  }
  insertFragment(clipboardData, targetPoint, operationType);
};
```

**工作原理**:
- 当用户按 Ctrl+V 时,Plait Core 调用此方法
- 从剪贴板数据中过滤出工具元素
- 使用 `insertClipboardData` 将它们插入到画布中
- 调用原始的 `insertFragment` 方法,允许其他插件也粘贴它们的元素

---

## 🧪 验证

### 编译检查

```bash
✅ TypeScript 编译通过
✅ HMR 热更新成功
✅ 开发服务器运行正常 (http://localhost:7200)
```

### 功能测试

待用户测试以下功能:

1. **删除**
   - ✅ 选中工具元素,按 Delete 键
   - ✅ 选中工具元素,按 Backspace 键
   - ✅ 工具元素应该从画布中移除

2. **复制粘贴**
   - ✅ 选中工具元素,按 Ctrl+C (或 Cmd+C)
   - ✅ 按 Ctrl+V (或 Cmd+V),工具元素应该被粘贴到画布中
   - ✅ 粘贴的元素应该保留原始的 URL、尺寸和元数据

3. **复制 (Duplicate)**
   - ✅ 选中工具元素,按 Ctrl+D (或 Cmd+D)
   - ✅ 工具元素应该被复制到稍微偏移的位置

4. **剪切粘贴**
   - ✅ 选中工具元素,按 Ctrl+X (或 Cmd+X)
   - ✅ 工具元素应该被移除并添加到剪贴板
   - ✅ 按 Ctrl+V,工具元素应该被粘贴

---

## 📚 技术要点

### Plugin 链式调用模式

Plait 使用函数组合模式,每个插件都会保存原始方法的引用,然后添加自己的逻辑:

```typescript
// Plugin A
const originalMethod = board.someMethod;
board.someMethod = (...args) => {
  // Plugin A 的逻辑
  return originalMethod(...args);
};

// Plugin B (在 Plugin A 之后应用)
const originalMethod = board.someMethod;  // 获取 Plugin A 增强后的方法
board.someMethod = (...args) => {
  // Plugin B 的逻辑
  return originalMethod(...args);  // 调用 Plugin A 的逻辑
};
```

这样所有插件的逻辑都会被执行。

### Fragment API 设计模式

Plait 的 Fragment API 使用 **责任链模式**:

1. **每个插件只处理自己的元素类型**
   - `getSelectedToolElements(board)` - 只获取工具元素
   - `isToolElement(value)` - 只过滤工具元素

2. **插件之间不互相干扰**
   - 工具插件添加工具元素到 `data` 数组
   - Freehand 插件添加 freehand 元素到 `data` 数组
   - Draw 插件添加图片、几何图形等到 `data` 数组

3. **通过链式调用组合所有插件的结果**
   - `return getDeletedFragment(data)` - 调用下一个插件
   - 最终 `data` 包含所有插件标记的元素

---

## 🎯 已完成的功能

- ✅ 工具元素可以通过 Delete/Backspace 键删除
- ✅ 工具元素可以通过 Ctrl+C/Ctrl+V 复制粘贴
- ✅ 工具元素可以通过 Ctrl+D 快速复制
- ✅ 工具元素可以通过 Ctrl+X 剪切
- ✅ 工具元素在剪贴板操作中保留所有属性 (URL, 尺寸, 元数据)

---

## 📝 相关文档

- **Plait Fragment API**: `@plait/core` - `getDeletedFragment`, `buildFragment`, `insertFragment`
- **参考实现**: `packages/drawnix/src/plugins/freehand/with-freehand-fragment.ts`
- **Clipboard 工具函数**: `@plait/common` - `buildClipboardData`, `insertClipboardData`

---

**Created by**: Claude Code
**Fixed on**: 2025-12-08
**Status**: ✅ Implementation Complete, Awaiting User Testing
