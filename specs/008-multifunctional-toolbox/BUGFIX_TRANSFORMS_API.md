# Bug Fix: Transforms API Error

> Date: 2025-12-08
> Branch: feat/08-multifunctional-toolbox
> Status: ✅ Fixed

---

## 🐛 问题描述

### 错误信息

用户点击工具箱中的工具时,浏览器控制台抛出错误:

```
with-tool.ts:85 Uncaught TypeError: Transforms.insertNodes is not a function
```

### 错误位置

文件: `packages/drawnix/src/plugins/with-tool.ts`

受影响的方法:
- `ToolTransforms.insertTool` (第 85 行)
- `ToolTransforms.resizeTool` (第 110 行)
- `ToolTransforms.moveTool` (第 136 行)
- `ToolTransforms.rotateTool` (第 155 行)
- `ToolTransforms.removeTool` (第 169 行)
- `ToolTransforms.updateToolUrl` (第 184 行)
- `ToolTransforms.updateToolMetadata` (第 212 行)

---

## 🔍 根因分析

### 错误原因

使用了错误的 Plait Transforms API:

```typescript
// ❌ 错误 - 这些方法不存在
Transforms.insertNodes(board, [element], { at: [index] })
Transforms.setNodes(board, data, { at: [path] })
Transforms.removeNodes(board, { at: [path] })
```

### 正确 API

通过检查 Plait 源码和项目中的其他用法 (如 `with-freehand-create.ts`, `property.ts`, `video.ts`),发现正确的 API 是:

```typescript
// ✅ 正确 - 单数形式
Transforms.insertNode(board, element, [index])
Transforms.setNode(board, data, [path])
Transforms.removeNode(board, [path])
```

**关键区别**:
1. **单数 vs 复数**: Plait 使用 `insertNode` 而不是 `insertNodes`
2. **参数格式**: 直接传递元素和路径数组,而不是使用 `{ at: [...] }` 对象

---

## ✅ 修复方案

### 修复的代码变更

#### 1. insertTool (第 85 行)

```diff
-    Transforms.insertNodes(board, [toolElement], {
-      at: [board.children.length],
-    });
+    Transforms.insertNode(board, toolElement, [board.children.length]);
```

#### 2. resizeTool (第 110 行)

```diff
-      Transforms.setNodes(board, newElement, { at: [path] });
+      Transforms.setNode(board, newElement, [path]);
```

#### 3. moveTool (第 136 行)

```diff
-      Transforms.setNodes(board, newElement, { at: [path] });
+      Transforms.setNode(board, newElement, [path]);
```

#### 4. rotateTool (第 155 行)

```diff
-      Transforms.setNodes(board, newElement, { at: [path] });
+      Transforms.setNode(board, newElement, [path]);
```

#### 5. removeTool (第 169 行)

```diff
-      Transforms.removeNodes(board, { at: [path] });
+      Transforms.removeNode(board, [path]);
```

#### 6. updateToolUrl (第 184 行)

```diff
-      Transforms.setNodes(board, { url: newUrl } as Partial<PlaitTool>, {
-        at: [path],
-      });
+      Transforms.setNode(board, { url: newUrl } as Partial<PlaitTool>, [path]);
```

#### 7. updateToolMetadata (第 212 行)

```diff
-        Transforms.setNodes(
-          board,
-          { metadata: newMetadata } as Partial<PlaitTool>,
-          { at: [path] }
-        );
+        Transforms.setNode(
+          board,
+          { metadata: newMetadata } as Partial<PlaitTool>,
+          [path]
+        );
```

---

## 📚 参考代码

### 正确的 Plait API 用法示例

从项目中已有的正确实现:

**with-freehand-create.ts:44** (插入元素):
```typescript
Transforms.insertNode(board, temporaryElement, [board.children.length]);
```

**property.ts:41** (更新元素):
```typescript
Transforms.setNode(board, { fill: newFill }, path);
```

**video.ts:44** (删除元素):
```typescript
Transforms.removeNode(board, [path]);
```

---

## 🧪 验证

### 编译检查

修复后,TypeScript 编译器的 6 个错误已全部消失:

```
✅ 之前的错误:
  ✘ [Line 110:18] Property 'setNodes' does not exist... Did you mean 'setNode'?
  ✘ [Line 136:18] Property 'setNodes' does not exist... Did you mean 'setNode'?
  ✘ [Line 155:18] Property 'setNodes' does not exist... Did you mean 'setNode'?
  ✘ [Line 169:18] Property 'removeNodes' does not exist... Did you mean 'removeNode'?
  ✘ [Line 184:18] Property 'setNodes' does not exist... Did you mean 'setNode'?
  ✘ [Line 212:20] Property 'setNodes' does not exist... Did you mean 'setNode'?

✅ 修复后: 无编译错误
```

### 运行时测试

开发服务器成功启动,HMR 正常工作:

```bash
✅ npm start
✅ Vite dev server running at http://localhost:7200
✅ HMR updates applied successfully
```

---

## 📝 经验总结

### 教训

1. **API 使用前先查阅文档**: 在使用 Plait Transforms API 之前,应该查看:
   - Plait 官方文档
   - 项目中的已有实现 (如 `with-freehand-create.ts`)
   - TypeScript 类型定义

2. **不要假设 API 命名规则**: 虽然 Slate.js 使用 `Transforms.insertNodes` (复数),但 Plait 使用 `Transforms.insertNode` (单数)

3. **利用 TypeScript 提示**: TypeScript 编译器已经提示 `Did you mean 'setNode'?`,应该立即重视这些提示

### 最佳实践

1. **参考已有代码**: 在实现新功能时,优先参考项目中已有的类似实现
2. **增量开发测试**: 每完成一个 API 调用就应该测试,而不是等到全部完成
3. **关注 TypeScript 错误**: 编译时错误通常能提前发现运行时问题

---

## 🎯 后续工作

修复完成后,工具箱功能应该能够正常工作:

- ✅ 点击工具卡片插入到画布
- ✅ 工具元素在画布中心位置
- ✅ 支持拖拽、缩放、旋转操作
- ⚠️ 需要测试 iframe 内容是否正确加载 (某些 URL 可能有 X-Frame-Options 限制)

---

## 🐛 后续发现的问题 (已修复)

### 问题 2: `Cannot set properties of undefined (setting 'context')`

**错误信息**:
```
TypeError: Cannot set properties of undefined (setting 'context')
at ListRender.update
```

**根因**: ToolComponent 缺少 `activeGenerator`,导致:
1. 元素没有 `context` 属性
2. 无法计算元素的矩形边界 (`getRectangle`)
3. 选中状态没有高亮边框

### 问题 3: `can not get rectangle of element`

**错误信息**:
```
can not get rectangle of element: {id: 'tool_...', type: 'tool', ...}
```

**根因**: ToolComponent 没有实现 `getRectangle` 方法,Plait 无法获取元素的边界框。

### 修复方案

参考 `FreehandComponent` 的实现,为 ToolComponent 添加:

1. **添加 activeGenerator**: 使用 `createActiveGenerator` 创建选中状态生成器
2. **实现 getRectangle**: 通过 `RectangleClient.getRectangleByPoints(element.points)` 计算边界
3. **更新 onContextChanged**: 调用 `activeGenerator.processDrawing` 更新选中状态
4. **更新 destroy**: 清理 `activeGenerator` 资源

**修改的代码** (`tool.component.ts`):

```diff
import {
  PlaitBoard,
  PlaitPluginElementContext,
  OnContextChanged,
+  RectangleClient,
+  ACTIVE_STROKE_WIDTH,
} from '@plait/core';
-import { CommonElementFlavour } from '@plait/common';
+import {
+  CommonElementFlavour,
+  ActiveGenerator,
+  createActiveGenerator,
+  hasResizeHandle,
+} from '@plait/common';

export class ToolComponent ... {
  toolGenerator!: ToolGenerator;
+  activeGenerator!: ActiveGenerator<PlaitTool>;

  initializeGenerator(): void {
+    // 初始化选中状态生成器
+    this.activeGenerator = createActiveGenerator(this.board, {
+      getRectangle: (element: PlaitTool) => {
+        return RectangleClient.getRectangleByPoints(element.points);
+      },
+      getStrokeWidth: () => ACTIVE_STROKE_WIDTH,
+      getStrokeOpacity: () => 1,
+      hasResizeHandle: () => {
+        return hasResizeHandle(this.board, this.element);
+      },
+    });
    this.toolGenerator = new ToolGenerator(this.board);
  }

  initialize(): void {
+    super.initialize();
    this.initializeGenerator();
    ...
  }

  onContextChanged(...): void {
    if (value.element !== previous.element || value.hasThemeChanged) {
      // 更新工具渲染
      ...
+      // 更新选中状态高亮
+      this.activeGenerator.processDrawing(
+        this.element,
+        PlaitBoard.getActiveHost(this.board),
+        { selected: this.selected }
+      );
    } else {
+      // 只有选中状态改变时,只更新高亮
+      const needUpdate = value.selected !== previous.selected;
+      if (needUpdate || value.selected) {
+        this.activeGenerator.processDrawing(
+          this.element,
+          PlaitBoard.getActiveHost(this.board),
+          { selected: this.selected }
+        );
+      }
    }
  }

  destroy(): void {
    super.destroy();
+    if (this.activeGenerator) {
+      this.activeGenerator.destroy();
+    }
    ...
  }
}
```

### 验证结果

✅ 修复后:
- `context` 属性错误消失
- 元素矩形边界正确计算
- 选中状态高亮边框正常显示
- HMR 热更新成功

---

**Created by**: Claude Code
**Fixed on**: 2025-12-08
**Status**: ✅ All Issues Resolved
