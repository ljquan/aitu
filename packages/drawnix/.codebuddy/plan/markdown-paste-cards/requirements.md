# 需求文档：Markdown 粘贴为标签贴（Card 元素）

## 引言

当用户将 Markdown 格式的文本粘贴到画布，或 Agent 输出纯文本结果时，系统应将内容解析为结构化的**标签贴（Card）**形式插入画布。

标签贴是一种**独立的画布元素类型**（`type: 'card'`），带有标题、正文和可自定义填充颜色，能直观呈现 Markdown 的层级结构。每个 Markdown 的一级/二级标题块对应一张标签贴，多张标签贴按网格布局排列在画布上。

**涉及的两个入口：**
1. **粘贴入口**：用户在画布上按 `Ctrl/Cmd+V` 粘贴 Markdown 文本
2. **Agent 输出入口**：`insert_text` MCP 工具改为插入 Card 元素

---

## 需求

### 需求 1：新建独立的 Card 元素类型

**用户故事：** 作为一名开发者，我希望 Card 是一个独立的画布元素类型，以便它能像其他元素一样参与画布的完整交互体系。

#### 验收标准

1. WHEN 定义 Card 元素 THEN 系统 SHALL 创建 `type: 'card'` 的独立元素类型，包含 `title`（可选）、`body`（正文）、`fillColor`（填充色）、`points`（位置/尺寸）字段
2. WHEN Card 元素被注册到画布 THEN 系统 SHALL 支持标准的画布操作：拖拽移动、缩放、选中、删除
3. WHEN Card 元素被双击 THEN 系统 SHALL 进入文本编辑模式，允许修改标题和正文内容
4. WHEN Card 元素被选中 THEN 系统 SHALL 在 popup-toolbar 中显示**填充颜色**选项，用户可修改卡片背景色

---

### 需求 2：Card 元素的视觉渲染

**用户故事：** 作为一名用户，我希望标签贴有清晰的视觉层次，以便在画布上快速识别不同内容块。

#### 验收标准

1. WHEN 渲染 Card 元素 THEN 系统 SHALL 显示为带圆角的卡片，包含**标题区**（`fillColor` 深色调）和**正文区**（`fillColor` 浅色调）两个区域
2. WHEN Card 的 `title` 字段为空 THEN 系统 SHALL 只渲染正文区，不显示标题区
3. WHEN 正文内容超过卡片最大高度 THEN 系统 SHALL 截断显示并在底部显示省略号
4. WHEN 用户在 popup-toolbar 修改填充颜色 THEN 系统 SHALL 同步更新标题区和正文区的配色（深/浅色调跟随主色变化）

---

### 需求 3：Markdown 文本解析为 Card 块

**用户故事：** 作为一名用户，我希望粘贴 Markdown 文本时系统自动识别结构并拆分为多张标签贴，以便内容在画布上更清晰易读。

#### 验收标准

1. WHEN 粘贴的文本包含 Markdown 标题（`#`、`##`）THEN 系统 SHALL 以每个一级/二级标题为分割点，将文本拆分为多个 Card 块
2. WHEN 一个 Card 块包含标题行 THEN 系统 SHALL 将标题文本作为 `title`，标题下方的内容作为 `body`
3. WHEN 粘贴的文本不包含任何 Markdown 标题 THEN 系统 SHALL 将整段文本作为单张 Card 的 `body` 插入（`title` 为空）
4. WHEN `body` 内容包含 Markdown 列表（`-`、`*`、`1.`）THEN 系统 SHALL 去除列表符号，每行一条保留在正文中
5. IF 粘贴内容不含任何 Markdown 语法特征 THEN 系统 SHALL 降级为当前的普通文本插入行为（向后兼容）

---

### 需求 4：多张 Card 的画布布局

**用户故事：** 作为一名用户，我希望多张标签贴以整齐的网格排列插入画布，以便内容不重叠且易于浏览。

#### 验收标准

1. WHEN 同一次插入产生多张 Card THEN 系统 SHALL 按**从左到右、从上到下**的网格布局排列，每行最多 3 张
2. WHEN 只有 1 张 Card THEN 系统 SHALL 插入到当前画布视口中心或选中元素下方
3. WHEN 多张 Card 插入完成 THEN 系统 SHALL 自动滚动画布使插入内容可见，并选中所有新插入的 Card 元素
4. WHEN 同一次插入产生多张 Card THEN 系统 SHALL 为每张 Card 从预设调色板中循环分配不同的 `fillColor`

---

### 需求 5：`insert_text` MCP 工具改为插入 Card 元素

**用户故事：** 作为一名用户，我希望 Agent 输出的文本以标签贴形式插入画布，以便 AI 生成的结构化内容更易阅读。

#### 验收标准

1. WHEN `insert_text` MCP 工具被调用 THEN 系统 SHALL 将传入的文本经过 Markdown 解析后，以 Card 元素形式插入画布（而非原有的纯文本元素）
2. WHEN `insert_text` 传入的文本包含 Markdown 结构 THEN 系统 SHALL 拆分为多张 Card 按网格布局插入
3. WHEN `insert_text` 传入的文本不含 Markdown 结构 THEN 系统 SHALL 将整段文本作为单张 Card 的 `body` 插入
4. WHEN `insert_text` 工具执行完成 THEN 系统 SHALL 返回成功结果，包含插入的 Card 元素数量
