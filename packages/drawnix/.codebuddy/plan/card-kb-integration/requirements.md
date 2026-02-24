# 需求文档：Card 元素与知识库集成

## 引言

当前画布中的 Card（标签贴）元素不支持直接在画布上编辑（因 SVG foreignObject + 缩放导致光标偏移问题难以修复）。本功能将 Card 元素的编辑能力迁移到知识库系统：

1. **移除画布内联编辑**：撤销之前的双击编辑实现，Card 在画布上仅作只读展示。
2. **通过 popup-toolbar 打开知识库编辑**：选中 Card 后，点击工具栏的编辑图标，在知识库中打开（或创建）对应笔记进行编辑。
3. **Card 与知识库笔记关联**：Card 元素持有一个 `noteId` 字段，与知识库中的笔记一一对应，内容变更自动同步回画布。
4. **知识库笔记右键插入画布**：在知识库笔记树中右键笔记，可将其作为 Card 元素插入到当前画布。

---

## 需求

### 需求 1：移除画布内联编辑，Card 仅只读展示

**用户故事：** 作为画布用户，我希望 Card 在画布上只作只读展示，不支持直接双击编辑，以便避免缩放时光标偏移的问题。

#### 验收标准

1. WHEN 用户双击画布上的 Card 元素 THEN 系统 SHALL 不进入编辑模式（双击无特殊响应，或仅选中元素）。
2. WHEN Card 元素渲染时 THEN 系统 SHALL 移除所有与内联编辑相关的插件（`with-card-edit.ts`）和编辑状态逻辑。
3. WHEN Card 元素渲染时 THEN 系统 SHALL 保持 `foreignObject` 的 `pointer-events: none`，不响应鼠标事件。

---

### 需求 2：Card 元素数据结构新增 noteId 关联字段

**用户故事：** 作为开发者，我希望 Card 元素能持有一个 `noteId` 字段，以便与知识库中的笔记建立关联。

#### 验收标准

1. WHEN 定义 `PlaitCard` 接口时 THEN 系统 SHALL 新增可选字段 `noteId?: string`，用于存储关联的知识库笔记 ID。
2. IF Card 元素的 `noteId` 为空 THEN 系统 SHALL 在用户点击编辑时自动在知识库中创建新笔记并写入 `noteId`。
3. IF Card 元素的 `noteId` 不为空 THEN 系统 SHALL 在用户点击编辑时直接打开知识库中对应的笔记。

---

### 需求 3：popup-toolbar 新增编辑图标，点击打开知识库

**用户故事：** 作为画布用户，我希望选中 Card 元素后，在 popup-toolbar 上看到一个编辑图标，点击后能在知识库中打开该卡片对应的笔记进行编辑，以便方便地修改卡片内容。

#### 验收标准

1. WHEN 用户选中一个或多个 Card 元素 THEN 系统 SHALL 在 popup-toolbar 中显示编辑（铅笔）图标按钮。
2. WHEN 用户点击编辑图标 THEN 系统 SHALL 打开知识库抽屉（`KnowledgeBaseDrawer`）并定位到该 Card 关联的笔记。
3. IF 被选中的 Card 没有关联笔记（`noteId` 为空）THEN 系统 SHALL 自动在知识库"笔记"目录下创建一篇新笔记（标题取自 Card 的 `title` 或默认"新卡片"，内容取自 Card 的 `body`），并将新笔记的 ID 写回 Card 的 `noteId` 字段。
4. WHEN 知识库中的笔记内容被修改并保存后 THEN 系统 SHALL 将笔记的最新内容同步更新到画布中对应 Card 的 `body` 字段（以及 `title`）。
5. IF 同时选中多个 Card THEN 系统 SHALL 仅对第一个 Card 执行打开操作（或隐藏编辑按钮）。

---

### 需求 4：知识库笔记右键菜单新增"插入到画布"选项

**用户故事：** 作为知识库用户，我希望在知识库笔记树中右键某篇笔记，能将其作为 Card 元素插入到当前画布，以便快速将知识内容可视化展示。

#### 验收标准

1. WHEN 用户在 `KBUnifiedTree` 中右键点击某篇笔记 THEN 系统 SHALL 在上下文菜单中显示"插入到画布"选项。
2. WHEN 用户点击"插入到画布" THEN 系统 SHALL 在当前画布的可视区域中央创建一个新的 Card 元素，Card 的 `title` 取自笔记标题，`body` 取自笔记内容，`noteId` 设置为该笔记的 ID。
3. IF 该笔记已经在画布上存在关联的 Card（即画布中已有 `noteId` 等于该笔记 ID 的 Card）THEN 系统 SHALL 提示用户"该笔记已在画布中存在"，并询问是否仍要插入新 Card。
4. WHEN Card 被插入画布后 THEN 系统 SHALL 使用默认尺寸（宽 240px，高 180px）和默认填充颜色。

---

### 需求 5：知识库笔记内容变更同步到画布 Card

**用户故事：** 作为用户，我希望在知识库中编辑笔记后，画布上关联的 Card 内容能自动更新，以便保持两者内容一致。

#### 验收标准

1. WHEN 知识库中某篇笔记的内容或标题被保存（`onUpdateNote` 触发）THEN 系统 SHALL 检查当前画布中是否存在 `noteId` 等于该笔记 ID 的 Card 元素。
2. IF 存在关联 Card THEN 系统 SHALL 通过 `Transforms` 更新该 Card 的 `body` 和 `title` 字段。
3. WHEN 同步更新时 THEN 系统 SHALL 不改变 Card 的位置、尺寸和填充颜色。
