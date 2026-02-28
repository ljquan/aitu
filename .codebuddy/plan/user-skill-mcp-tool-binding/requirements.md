# 需求文档：用户自定义 Skill MCP 工具绑定

## 引言

当前 aitu 的 Skill 体系中，**外部 Skill**（如 baoyu-skills）通过预构建阶段的 `outputType` 推断和 `generate_image` 强制注入机制，实现了从"纯提示词"到"实际调用 MCP 工具生成图片"的能力闭环。但**用户自定义 Skill**（知识库 Skill 目录下的笔记）缺少指定 MCP 工具的能力——用户创建自定义 Skill 并粘贴外部 Skill 的内容后，由于笔记元数据中没有工具绑定信息，执行时仍然走路径 C（角色扮演），只输出纯文本而无法触发图片生成或其他 MCP 工具调用。

本需求旨在为用户自定义 Skill 提供一套 **MCP 工具绑定机制**，让用户能在 Skill 笔记的元数据中配置需要调用的 MCP 工具，使得自定义 Skill 也能走路径 B（Agent + 工具注入），获得与外部 Skill 相同的工具调用能力。

### 当前状态

- **外部 Skill**：通过 `outputType` 字段 + `preprocessExternalSkillContent` + 强制注入 `generate_image`，可以走路径 B 调用工具
- **系统内置 Skill**：每个 Skill 有 `mcpTool` 字段，走路径 A（DSL 正则解析）直接执行
- **用户自定义 Skill**：只有 `content`（Markdown 笔记内容），无工具绑定信息，走路径 C（角色扮演），仅输出文本

### 核心问题

用户自定义 Skill 的执行路径中缺少"要调用哪些 MCP 工具"的元数据，导致：
1. 即使笔记内容是完整的图片生成工作流指令，也无法触发 `generate_image`
2. 用户无法自由定义 Skill 的输出类型（文本/图片/图表等）
3. 复制外部 Skill 内容到自定义 Skill 后丧失了原有的工具调用能力

## 需求

### 需求 1：扩展笔记元数据支持 MCP 工具绑定

**用户故事：** 作为一名用户，我希望在 Skill 笔记的元数据中指定需要调用的 MCP 工具列表，以便我的自定义 Skill 能调用图片生成、图表绘制等工具。

#### 验收标准

1.1 WHEN 用户创建或编辑 Skill 目录下的笔记 THEN 系统 SHALL 允许在笔记元数据中存储 `mcpTools` 字段（字符串数组，存放 MCP 工具名称）

1.2 WHEN `mcpTools` 字段包含工具名称（如 `["generate_image"]`）THEN 系统 SHALL 在执行该 Skill 时，将这些工具视为"用户显式绑定的工具"，强制注入到路径 B 的工具列表中

1.3 IF `mcpTools` 字段为空数组或不存在 THEN 系统 SHALL 保持现有行为（依赖 `extractToolNamesFromContent` 从内容中自动提取工具名，或走路径 C）

1.4 WHEN 笔记元数据中的 `mcpTools` 包含在 MCP 注册表中不存在的工具名 THEN 系统 SHALL 忽略这些无效工具名，只注入实际存在的工具，并在控制台输出警告日志

### 需求 2：Skill 笔记编辑器中的 MCP 工具绑定 UI

**用户故事：** 作为一名用户，我希望在 Skill 笔记的标题下方能直接配置要绑定的 MCP 工具，以便我无论是新建 Skill、粘贴内容还是从头编写，都能方便地指定工具。

#### 验收标准

2.1 WHEN 用户打开 Skill 目录下的笔记（非只读模式）THEN 系统 SHALL 在标题下方、标签选择器旁边显示一个"MCP 工具"配置区域

2.2 WHEN 用户点击"MCP 工具"配置区域 THEN 系统 SHALL 展示所有已注册的 MCP 工具列表（从 `mcpRegistry.getAllTools()` 获取），每个工具显示名称和简要描述

2.3 WHEN 用户勾选/取消勾选某个 MCP 工具 THEN 系统 SHALL 立即更新笔记元数据中的 `mcpTools` 字段，并自动保存

2.4 WHEN 笔记已有 `mcpTools` 绑定 THEN 系统 SHALL 在配置区域中高亮已选中的工具，使用类似标签的 chip/badge 样式展示已绑定工具名

2.5 IF 笔记不在 Skill 目录下（即普通笔记）THEN 系统 SHALL NOT 显示 MCP 工具配置区域

2.6 IF 笔记为只读模式（系统内置 Skill 或外部 Skill）THEN 系统 SHALL 以只读方式展示已绑定的工具列表（不可编辑）

2.7 WHEN MCP 工具列表为空（尚未注册任何工具）THEN 系统 SHALL 显示提示文字"暂无可用工具"

### 需求 3：用户自定义 Skill 的执行路径适配

**用户故事：** 作为一名用户，我希望我的自定义 Skill 绑定了 MCP 工具后，执行时能实际调用这些工具，以便获得与外部 Skill 相同的效果（如生成图片）。

#### 验收标准

3.1 WHEN 用户选择一个绑定了 `mcpTools` 的自定义 Skill 并输入内容 THEN 系统 SHALL 从笔记元数据中读取 `mcpTools` 列表

3.2 WHEN `mcpTools` 列表非空 THEN 系统 SHALL 将这些工具名合并到 `validToolNames` 中（与 `extractToolNamesFromContent` 提取的工具名取并集），确保走路径 B（Agent + 工具注入）

3.3 WHEN 走路径 B 时 THEN 系统 SHALL 在 systemPrompt 中注入绑定工具的完整描述（名称、参数 Schema），让 AI 模型知道如何调用这些工具

3.4 WHEN 绑定的工具中包含 `generate_image` THEN 系统 SHALL 在 systemPrompt 中额外追加图片生成执行指引（与外部 Skill 的 `outputType === 'image'` 行为一致），明确要求 AI 调用工具而非仅输出文本

3.5 IF 绑定的工具均不在 MCP 注册表中（全部无效）THEN 系统 SHALL 回退到现有行为（路径 C 角色扮演）

### 需求 4：从 AIInputBar 传递 mcpTools 元数据

**用户故事：** 作为一名开发者，我希望 AIInputBar 在读取用户自定义 Skill 时能完整传递 mcpTools 元数据，以便 workflow-converter 能正确执行工具注入。

#### 验收标准

4.1 WHEN AIInputBar 读取用户自定义 Skill 笔记（`getNoteById`）THEN 系统 SHALL 同时读取笔记的 `metadata.mcpTools` 字段

4.2 WHEN 调用 `convertSkillFlowToWorkflow` 时 THEN 系统 SHALL 将 `mcpTools` 列表作为 skill 参数的一部分传入（扩展 skill 对象类型签名）

4.3 WHEN `convertSkillFlowToWorkflow` 接收到 `mcpTools` 参数 THEN 系统 SHALL 在路径 B/C 判断前，将 `mcpTools` 中的有效工具名合并到 `validToolNames`

### 需求 5：SkillDropdown 中的工具绑定标记

**用户故事：** 作为一名用户，我希望在 Skill 下拉列表中能看到哪些自定义 Skill 绑定了 MCP 工具，以便我快速识别哪些 Skill 能生成图片或调用其他工具。

#### 验收标准

5.1 WHEN SkillDropdown 加载用户自定义 Skill 列表 THEN 系统 SHALL 读取每个 Skill 笔记的 `metadata.mcpTools` 字段

5.2 IF 自定义 Skill 的 `mcpTools` 包含 `generate_image` THEN 系统 SHALL 在名称旁显示图片图标（与外部 Skill 的图片标记保持一致）

5.3 IF 自定义 Skill 的 `mcpTools` 包含其他工具（非 `generate_image`）THEN 系统 SHALL 在名称旁显示一个工具图标（如 🔧 或 `<Wrench size={12} />`），表示该 Skill 绑定了 MCP 工具

5.4 IF 自定义 Skill 没有绑定任何 MCP 工具 THEN 系统 SHALL NOT 显示额外图标（保持现有行为）
