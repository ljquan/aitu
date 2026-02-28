# 需求文档：外部 Skill 图片生成能力适配

## 引言

### 问题描述

baoyu-skills（如 `baoyu-infographic`、`baoyu-xhs-images`、`baoyu-cover-image` 等）是一套设计精良的内容生成 Skill，其核心产出是**图片**（信息图、小红书卡片、封面图、幻灯片等）。这些 Skill 原本运行在 Claude Code 环境中，依赖以下基础设施：

1. **本地文件系统**：保存分析文件（`analysis.md`）、结构化内容（`structured-content.md`）、prompt 文件（`prompts/*.md`），以及最终生成的图片文件
2. **Bun 运行时**：`baoyu-image-gen` 通过 `npx bun scripts/main.ts` 调用 OpenAI/Google/DashScope 等图片生成 API
3. **references 引用**：SKILL.md 中引用 `references/layouts/*.md` 和 `references/styles/*.md` 来组合最终的图片生成 prompt
4. **交互式确认**：通过 Claude Code 的 `AskUserQuestion` 机制，让用户选择布局、样式、宽高比等参数

当前 aitu 项目已经引入了外部 Skill 包机制，但 Skill 执行时存在以下问题：

- **SKILL.md 文档体被作为角色扮演 prompt**：AI 只是复述了工作流步骤描述，而不是执行它们
- **图片生成工具未映射**：baoyu-skills 依赖的 `baoyu-image-gen`（本地脚本）在浏览器中不可用，但 aitu 已有 `generate_image` MCP 工具（基于 Gemini API）
- **references 内容未内联**：布局和样式的详细定义文件没有被包含在 Skill 内容中，AI 无法获取完整的 prompt 构建信息
- **交互式选择不支持**：aitu 的 AI 输入框是单次提交模式，不支持中间步骤的用户交互确认

### 目标

让用户在 aitu 的 AI 输入框选择外部 Skill（如 `baoyu-infographic`）后，能够实际生成图片而非纯文本，实现与 Claude Code 中**相近的效果**。

### 已有资源

- **aitu 已有的 `generate_image` MCP 工具**：支持 prompt → 图片生成，底层使用 Gemini API，支持 size、quality、referenceImages 等参数
- **aitu 已有的 `ai_analyze` Agent 工作流**：支持注入工具描述和系统提示词，让 AI 自主决定何时调用工具
- **aitu 已有的三条 Skill 执行路径**：DSL 正则解析 / Agent 精准注入 / 角色扮演
- **预构建 bundle**：已包含 15 个 baoyu-skills 的 SKILL.md 文档体

---

## 需求

### 需求 1：将 references 内容内联到外部 Skill 的 content 中

**用户故事：** 作为一名 aitu 用户，我希望外部 Skill 的完整定义（包括布局、样式等 reference 文件）都包含在 Skill 内容中，以便 AI 能获得足够的上下文来生成高质量的图片 prompt。

#### 验收标准

1. WHEN 构建时预处理脚本扫描 Skill 目录 THEN 脚本 SHALL 自动读取 `references/` 目录下的所有 `.md` 文件，将其内容内联到 Skill 的 content 字段中
2. WHEN `SKILL.md` 中引用了 `references/layouts/<name>.md` 或 `references/styles/<name>.md` THEN 预处理脚本 SHALL 将引用路径替换为实际的文件内容（以 markdown 折叠块或直接追加的形式）
3. WHEN reference 文件不存在 THEN 脚本 SHALL 保留原始引用路径不做替换，并在控制台输出警告
4. WHEN 生成的 bundle JSON 包含完整的 reference 内容后 THEN Skill 的 content 字段 SHALL 包含 AI 生成图片 prompt 所需的全部信息（布局规则、样式定义、基础模板等）

### 需求 2：SKILL.md 工作流指令适配为 aitu 可执行工作流

**用户故事：** 作为一名 aitu 用户，我希望外部 Skill 的工作流指令能够被正确解析并在 aitu 环境中执行，而不是被 AI 当作文本描述输出。

#### 验收标准

1. WHEN 外部 Skill 的 SKILL.md 包含多步工作流（如 Step 1: 分析 → Step 5: 生成 prompt → Step 6: 生成图片） THEN 系统 SHALL 将最终的图片生成步骤映射为调用 aitu 的 `generate_image` MCP 工具
2. WHEN 外部 Skill 内容中引用了 `baoyu-image-gen` 或类似的图片生成脚本调用 THEN 系统 SHALL 将其识别并替换为 aitu 的 `generate_image` 工具调用指令
3. WHEN 外部 Skill 的工作流需要用户中间确认（如选择 layout/style） THEN 系统 SHALL 将其简化为"AI 自动选择最佳组合"的默认行为，或在 prompt 中让用户一次性指定选项
4. WHEN 外部 Skill 的工作流引用了本地文件系统操作（如保存 analysis.md） THEN 系统 SHALL 跳过这些文件系统步骤，仅保留内容分析和 prompt 生成的逻辑
5. IF 外部 Skill 的工作流无法被有效适配 THEN 系统 SHALL 降级为将完整的 SKILL.md 内容作为 system prompt，并附带明确指令让 AI 最终调用 `generate_image` 工具

### 需求 3：外部 Skill 执行路径优化——优先走 Agent 精准注入（路径 B）

**用户故事：** 作为一名 aitu 用户，我希望选择外部图片类 Skill 后，AI 能自动识别需要生成图片，并实际调用图片生成工具产出图片。

#### 验收标准

1. WHEN 外部 Skill 的 content 中包含图片生成相关关键词（如 "generate image"、"image generation"、"生成图片"、"infographic"、"illustration" 等） THEN 系统 SHALL 将 `generate_image` 工具自动注入到该 Skill 的可用工具集中
2. WHEN 外部 Skill 被判定为图片类 Skill（基于 description 或 content 关键词匹配） THEN 系统 SHALL 优先走路径 B（Agent 精准注入），将 `generate_image` 工具描述 + Skill 内容作为 Agent 上下文
3. WHEN 走路径 B 执行时 THEN Agent SHALL 基于 Skill 内容中的指令（布局规则 + 样式定义）构建完整的 prompt，然后调用 `generate_image` 工具生成图片
4. WHEN 路径 B 执行失败 THEN 系统 SHALL 降级到路径 C（角色扮演），但 system prompt 中 SHALL 附加明确指令："请基于以上 Skill 指令生成详细的图片描述 prompt，并调用 generate_image 工具"
5. WHEN 外部 Skill 不是图片类（如 `baoyu-url-to-markdown`、`baoyu-format-markdown`） THEN 系统 SHALL 按现有逻辑执行（路径 C 角色扮演），不自动注入图片工具

### 需求 4：Skill content 预处理——将完整工作流转化为 Agent 可理解的指令

**用户故事：** 作为一名 aitu 开发者，我希望外部 Skill 的 SKILL.md 工作流内容在传入 Agent 前经过预处理和适配，以确保 Agent 能正确理解和执行。

#### 验收标准

1. WHEN 外部 Skill 的 content 传入 Agent 前 THEN 系统 SHALL 进行以下预处理：
   - 移除本地文件系统相关的指令（如 "Save to file"、"Read file"、bash 命令块）
   - 将 `baoyu-image-gen` 脚本调用替换为 "调用 generate_image 工具" 的说明
   - 将 `AskUserQuestion` 交互步骤替换为 "自动选择最佳参数" 的说明
   - 保留所有与 prompt 构建相关的指令（布局规则、样式定义、核心原则等）
2. WHEN 预处理完成后 THEN 系统 SHALL 在 content 末尾追加"执行指引"段落，明确告知 Agent 最终目标是调用 `generate_image` 工具
3. IF 外部 Skill 的 content 为空或预处理后无有效内容 THEN 系统 SHALL 使用 Skill 的 description 作为 fallback

### 需求 5：Skill 分类标记——区分图片类和文本类 Skill

**用户故事：** 作为一名 aitu 用户，我希望系统能自动识别外部 Skill 的类型（图片生成 / 文本处理），以便选择正确的执行策略。

#### 验收标准

1. WHEN 预构建脚本扫描 SKILL.md THEN 脚本 SHALL 基于以下规则自动推断 Skill 的输出类型（`outputType`）：
   - description 包含 "image"、"infographic"、"illustration"、"cover"、"slide"、"comic"、"图" → `image`
   - description 包含 "markdown"、"format"、"compress"、"url"、"post" → `text`
   - 默认 → `text`
2. WHEN ExternalSkill 对象中包含 `outputType: 'image'` THEN SkillDropdown 组件 SHALL 在该 Skill 名称旁显示图片图标标记
3. WHEN ExternalSkill 对象中包含 `outputType: 'image'` THEN 系统 SHALL 在执行时自动走需求 3 中的图片类 Skill 执行路径

### 需求 6：预构建脚本增强——完整内联 references 目录

**用户故事：** 作为一名 aitu 开发者，我希望预构建脚本能将 baoyu-skills 的 references 目录内容完整内联到 bundle 中，确保 AI 在生成 prompt 时有足够的上下文。

#### 验收标准

1. WHEN 预构建脚本处理 Skill 目录时 THEN 脚本 SHALL 递归读取 `references/` 目录下的所有 `.md` 文件
2. WHEN 读取 reference 文件后 THEN 脚本 SHALL 将每个文件的内容以如下格式追加到 Skill 的 content 末尾：
   ```markdown
   
   ---
   
   ## Reference: {relative-path}
   
   {file-content}
   ```
3. WHEN reference 文件总内容超过 50KB THEN 脚本 SHALL 只内联前 30 个文件，并在 content 末尾注明 "部分 reference 文件因体积限制被省略"
4. WHEN `references/base-prompt.md` 存在 THEN 脚本 SHALL 优先内联此文件（它是 prompt 生成的核心模板）

---

## 技术约束与边界条件

### 执行环境差异

| 能力 | Claude Code (baoyu-skills 原生) | aitu (浏览器端) |
|------|------|------|
| 本地文件系统 | ✅ 完整读写 | ❌ 不可用 |
| Bun 运行时 | ✅ 可执行脚本 | ❌ 不可用 |
| 图片生成 API | ✅ 通过 baoyu-image-gen 脚本 | ✅ 通过 generate_image MCP 工具 (Gemini API) |
| 用户中间交互 | ✅ AskUserQuestion | ❌ 单次提交模式 |
| LLM 推理 | ✅ Claude | ✅ Gemini |
| 多步工作流 | ✅ Agent 自主执行 | ✅ 通过 Agent 精准注入 (路径 B) |

### 关键映射关系

- `baoyu-image-gen` 脚本 → aitu `generate_image` MCP 工具
- `AskUserQuestion` 交互 → 自动选择最佳参数 / 用户在输入中一次性指定
- 本地文件保存 → 跳过（在 Agent 上下文中完成分析和 prompt 构建）
- `references/*.md` 文件引用 → 预构建时内联到 content 中

### Prompt 质量保障

baoyu-skills 的图片 prompt 质量取决于：
1. **布局定义**（`references/layouts/*.md`）：定义信息的空间排列方式
2. **样式定义**（`references/styles/*.md`）：定义视觉美学风格
3. **基础模板**（`references/base-prompt.md`）：prompt 的通用结构和规则
4. **结构化内容**（由 AI 在 Step 2 生成）：将用户内容转化为适合视觉呈现的结构

这些都需要在 bundle 中完整保留，才能让 Agent 生成高质量的图片 prompt。

### Bundle 体积考量

- 每个 Skill 的 references 可能有 20-40 个文件，总计 50-100KB
- 15 个 Skill 全量内联后 bundle 估计在 500KB-1.5MB
- 需要平衡完整性和体积（懒加载 vs 全量内联）
- 建议：预构建时全量内联，运行时按需加载 content

### 图片生成模型差异

- baoyu-skills 原生支持 OpenAI、Google、DashScope 三个图片 API
- aitu 当前只有 Gemini 图片生成（通过 `generate_image` MCP 工具）
- Gemini 的图片生成能力与 DALL-E/Imagen 有差异，最终图片效果可能与 baoyu-skills 在 Claude Code 中的产出有所不同
- 这是预期内的差异，不影响功能可用性
