# 需求文档：Skill 支持功能

## 引言

本功能旨在为 AI 输入框的 Agent 模式增加 **Skill（技能）** 支持，让用户可以在 Agent 模式下快速选择特定的执行技能（如灵感图、宫格图等），从而跳过 AI 意图分析步骤，直接调用对应的 MCP 工具。

同时，Skill 体系与知识库深度集成：系统内置 Skill（灵感图、宫格图等）以只读笔记形式展示在知识库的 `Skill` 目录下，用户也可以通过"添加 Skill"入口在知识库中创建自定义 Skill 笔记。

---

## 需求

### 需求 1：Skill 下拉框 UI

**用户故事：** 作为一名用户，我希望在 AI 输入框的 Agent 下拉框旁边看到一个 Skill 下拉框，以便快速选择要执行的具体技能。

#### 验收标准

1. WHEN 用户打开 AI 输入框 THEN 系统 SHALL 在 `GenerationTypeDropdown`（Agent 下拉框）右侧显示一个 `SkillDropdown` 下拉框。
2. WHEN `SkillDropdown` 渲染时 THEN 系统 SHALL 默认选中 `auto` 选项，显示文本为"自动"。
3. WHEN 用户展开 `SkillDropdown` THEN 系统 SHALL 显示以下选项列表：
   - `auto`（自动）：排在最顶部
   - 系统内置 Skill（如：灵感图、宫格图）：排在 auto 之后
   - 用户自定义 Skill（来自知识库 Skill 目录的笔记）：排在系统 Skill 之后
   - 分隔线 + "添加 Skill" 按钮：排在最底部
4. WHEN 用户选择某个 Skill 选项 THEN 系统 SHALL 更新下拉框显示为该 Skill 名称，并记录当前选中的 Skill。
5. IF 当前 `generationType` 不是 `text`（Agent 模式）THEN 系统 SHALL 隐藏或禁用 `SkillDropdown`。

---

### 需求 2：Skill 选择影响工作流逻辑

**用户故事：** 作为一名用户，我希望选择具体 Skill 后，AI 能直接执行对应工具而不需要先分析意图，以便更快速地完成任务。

#### 验收标准

1. WHEN 用户选择 `auto` Skill 并提交 THEN 系统 SHALL 走原有的 Agent 工作流（`ai_analyze` 步骤 → AI 动态生成后续步骤）。
2. WHEN 用户选择系统内置 Skill（如"宫格图"）并提交 THEN 系统 SHALL 跳过 `ai_analyze` 步骤，直接构建对应 MCP 工具（如 `generate_grid_image`）的工作流步骤，并将用户输入作为 `theme` 参数传入。
3. WHEN 用户选择系统内置 Skill（如"灵感图"）并提交 THEN 系统 SHALL 跳过 `ai_analyze` 步骤，直接构建 `generate_inspiration_board` 工具的工作流步骤。
4. WHEN 用户选择自定义 Skill 并提交 THEN 系统 SHALL 读取该 Skill 笔记的内容作为系统提示词补充，走 Agent 工作流，但在系统提示词中注入 Skill 笔记内容以引导 AI 行为。
5. WHEN Skill 工作流步骤构建完成 THEN 系统 SHALL 将 `scenarioType` 标记为 `skill_flow`，以便区分普通 Agent 流程。

---

### 需求 3：系统内置 Skill 在知识库中展示

**用户故事：** 作为一名用户，我希望在知识库的 Skill 目录下看到系统内置 Skill 的说明笔记，以便了解每个 Skill 的功能和使用方式。

#### 验收标准

1. WHEN 用户打开知识库并进入 `Skill` 目录 THEN 系统 SHALL 在笔记列表顶部显示系统内置 Skill 笔记（如"灵感图"、"宫格图"）。
2. WHEN 系统内置 Skill 笔记渲染时 THEN 系统 SHALL 在笔记标题旁显示"系统"标签（badge），以区分用户自定义笔记。
3. WHEN 用户尝试编辑系统内置 Skill 笔记 THEN 系统 SHALL 禁止编辑，编辑器处于只读模式，并显示提示"系统内置 Skill，不可修改"。
4. WHEN 用户尝试删除系统内置 Skill 笔记 THEN 系统 SHALL 禁止删除操作，并显示提示"系统内置 Skill，不可删除"。
5. WHEN 系统初始化知识库时 THEN 系统 SHALL 确保系统内置 Skill 笔记存在于 `Skill` 目录中（不依赖 IndexedDB 持久化，每次从代码定义中读取）。

---

### 需求 4：添加自定义 Skill

**用户故事：** 作为一名用户，我希望通过 Skill 下拉框底部的"添加 Skill"入口，快速在知识库中创建新的 Skill 笔记，以便扩展 AI 的能力。

#### 验收标准

1. WHEN 用户点击 Skill 下拉框底部的"添加 Skill"按钮 THEN 系统 SHALL 关闭下拉框，并打开知识库抽屉（`KnowledgeBaseDrawer`）。
2. WHEN 知识库抽屉打开时（由"添加 Skill"触发）THEN 系统 SHALL 自动定位到 `Skill` 目录，并触发新建笔记操作。
3. WHEN 用户在知识库 Skill 目录下创建并保存新笔记后 THEN 系统 SHALL 在 Skill 下拉框的用户自定义 Skill 列表中显示该笔记。
4. WHEN 用户删除知识库 Skill 目录下的自定义笔记 THEN 系统 SHALL 从 Skill 下拉框的选项中移除该笔记。
5. WHEN Skill 下拉框展开时 THEN 系统 SHALL 实时读取知识库 Skill 目录下的用户笔记（排除系统内置 Skill），确保列表是最新的。

---

### 需求 5：知识库 Skill 目录初始化

**用户故事：** 作为一名用户，我希望知识库中始终存在 Skill 目录，以便管理我的自定义 Skill 笔记。

#### 验收标准

1. WHEN 系统初始化知识库时 THEN 系统 SHALL 确保 `Skill` 目录存在（已在 `KB_DEFAULT_DIRECTORIES` 中定义，order=1）。
2. WHEN 用户尝试删除 `Skill` 目录 THEN 系统 SHALL 禁止删除默认目录（已有保护逻辑，无需额外处理）。
3. WHEN 用户在 `Skill` 目录下创建笔记时 THEN 系统 SHALL 允许正常的笔记创建、编辑、删除操作（系统内置 Skill 笔记除外）。
