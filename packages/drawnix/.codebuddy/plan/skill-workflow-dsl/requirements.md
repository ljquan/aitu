# 需求文档：Skill 工作流 DSL 解析方案

## 引言

本功能旨在为 Skill 体系引入一套**自然语言工作流 DSL（领域特定语言）**，使 Skill 笔记内容不仅是描述性文字，而是可被系统**解析并直接执行**的工作流定义。

### 设计参考

参考业界主流开源 Skill/工作流方案的设计思路：

| 参考项目 | 借鉴点 |
|---------|--------|
| **Dify（工作流节点）** | 节点式工具调用 + 变量引用（`{{input}}`）+ 顺序/条件分支 |
| **n8n（节点工作流）** | 节点参数的 `key: value` 描述风格，支持表达式 |
| **LangChain（Chain/Tool）** | 工具链式调用，前一步输出作为后一步输入 |
| **OpenAI Assistants（Tool Use）** | 工具名 + 参数 JSON 的标准化描述 |
| **Claude MCP** | 工具调用的自然语言描述与结构化参数结合 |

### 核心设计原则

1. **正则解析优先**：定义简洁的 DSL 语法，系统通过正则表达式将符合规范的 Skill 笔记解析为 `WorkflowStep[]`，无需 LLM 参与，执行快速确定。
2. **大模型兜底**：对于不符合 DSL 规范的自由文本 Skill，调用大模型将其解析为工作流步骤，保持灵活性。
3. **人类可读**：DSL 语法嵌入在普通笔记文本中，笔记作为说明文档阅读时依然清晰易懂（参考 Dify 的 Markdown 工作流描述风格）。
4. **渐进增强**：从简单的单步工具调用开始，逐步支持多步链式调用和变量传递。

### DSL 语法示例

```
灵感图

生成创意灵感拼贴图，将多张图片以不规则分割的方式拼合，营造富有创意感的视觉效果。

**使用方式：** 在 AI 输入框中描述你的主题或灵感关键词，选择「灵感图」Skill 后提交。

**工作流：**

调用 generate_inspiration_board
- theme: {{input}}
- imageCount: 9
- imageSize: 16x9
```

**关键语法说明：**
- `调用 <工具名>` / `CALL <tool_name>`：工具调用声明（参考 n8n 节点名）
- `- key: value`：参数键值对（参考 YAML 风格）
- `{{input}}`：变量占位符，运行时替换为用户输入（参考 Dify 变量语法）
- 多个 `调用` 块按顺序执行，形成工具链（参考 LangChain Chain）

---

## 需求

### 需求 1：定义 Skill 工作流 DSL 语法规范

**用户故事：** 作为一名开发者，我希望有一套清晰的 DSL 语法规范，以便系统能通过正则表达式将 Skill 笔记内容解析为可执行的工作流步骤。

#### 验收标准

1. WHEN 定义 DSL 规范时 THEN 系统 SHALL 支持以下**核心语法元素**：
   - **工具调用声明行**：`调用 <工具名>` 或 `CALL <tool_name>`（不区分大小写），标志一个工具调用节点的开始
   - **参数行**：`- <参数名>: <参数值>`，紧跟在工具调用声明行之后，表示该工具的参数
   - **变量占位符**：`{{input}}` 表示用户输入文本，`{{count}}` 表示数量，`{{size}}` 表示尺寸，`{{model}}` 表示模型名称
   - **顺序执行**：多个工具调用块按从上到下的顺序依次执行，形成工具链

2. WHEN 定义 DSL 规范时 THEN 系统 SHALL 支持以下**可选语法元素**：
   - **注释行**：以 `#` 或 `//` 开头的行，解析时忽略
   - **工作流块标记**：`**工作流：**` 或 `## 工作流` 等 Markdown 标题/加粗文本，用于在笔记中标识工作流定义区域（参考 Dify 的节点分区概念）
   - **描述文本**：普通文本段落（非工具调用行、非参数行），解析时跳过，不影响执行

3. WHEN 定义 DSL 规范时 THEN 系统 SHALL 确保变量占位符语法与 Dify 保持一致（使用 `{{变量名}}` 双花括号），以降低用户学习成本。

4. WHEN 定义 DSL 规范时 THEN 系统 SHALL 提供内置变量列表：
   - `{{input}}`：用户在 AI 输入框中输入的文本（必须支持）
   - `{{count}}`：生成数量（来自 metadata.count，默认 1）
   - `{{size}}`：尺寸参数（来自 metadata.size，如 `16x9`）
   - `{{model}}`：当前选中的模型名称

---

### 需求 2：实现正则解析器（SkillDSLParser）

**用户故事：** 作为一名开发者，我希望系统能通过正则表达式将符合 DSL 规范的 Skill 笔记内容解析为 `WorkflowStep[]`，以便直接执行，无需调用大模型。

#### 验收标准

1. WHEN 输入符合 DSL 规范的 Skill 笔记内容时 THEN `SkillDSLParser.parse(content, variables)` SHALL 返回包含一个或多个 `WorkflowStep` 的数组，每个步骤对应一个工具调用块。

2. WHEN 解析工具调用声明行时 THEN 系统 SHALL 使用正则 `/^(调用|CALL)\s+(\S+)/im` 提取工具名称，并创建对应的 `WorkflowStep`（`mcp` 字段为工具名，`status` 为 `'pending'`）。

3. WHEN 解析参数行时 THEN 系统 SHALL 使用正则 `/^-\s*([\w]+)\s*:\s*(.+)/` 提取参数名和参数值，并将其填入当前工具步骤的 `args` 对象。

4. WHEN 参数值包含变量占位符（如 `{{input}}`）时 THEN 系统 SHALL 在解析阶段将占位符替换为 `variables` 对象中对应的实际值（参考 Dify 变量解析机制）。

5. WHEN 参数值为纯数字字符串时 THEN 系统 SHALL 自动将其转换为 `number` 类型（如 `"9"` → `9`），以匹配 MCP 工具的参数类型要求。

6. WHEN 输入内容不包含任何工具调用声明行时 THEN `SkillDSLParser.parse()` SHALL 返回 `null`，表示该内容不符合 DSL 规范，需要走大模型解析路径。

7. WHEN 解析过程中遇到格式错误的参数行时 THEN 系统 SHALL 跳过该行并继续解析，不抛出异常（容错设计，参考 n8n 的节点容错机制）。

8. WHEN 解析完成时 THEN `SkillDSLParser.parse()` SHALL 同时返回 `parseMethod: 'regex'` 标记，用于调试和监控。

---

### 需求 3：实现大模型兜底解析器（SkillLLMParser）

**用户故事：** 作为一名用户，我希望即使我的自定义 Skill 笔记是自由文本描述（不符合 DSL 规范），系统也能通过大模型将其解析为可执行的工作流，以便灵活地描述复杂逻辑。

#### 验收标准

1. WHEN `SkillDSLParser.parse()` 返回 `null` 时 THEN 系统 SHALL 调用 `SkillLLMParser.parse(content, variables)`，将 Skill 笔记内容和用户输入一起发送给大模型，请求其返回结构化的工作流步骤列表（JSON 格式）。

2. WHEN 调用大模型解析时 THEN 系统 SHALL 在 System Prompt 中提供：
   - 可用 MCP 工具列表（工具名、描述、参数 Schema）
   - 期望的输出格式（`WorkflowStep[]` JSON Schema）
   - DSL 语法示例（引导大模型理解工具调用格式）
   - 用户输入的实际值（`{{input}}` 的替换值）

3. WHEN 大模型返回工作流步骤 JSON 时 THEN 系统 SHALL 验证 JSON 格式合法性，并将其转换为 `WorkflowStep[]`，同时标记 `parseMethod: 'llm'`。

4. WHEN 大模型解析失败（超时、格式错误、JSON 解析失败等）时 THEN 系统 SHALL 降级为原有的 Agent 工作流（`ai_analyze` 步骤），并将 Skill 笔记内容注入到 `ai_analyze` 的系统提示词中，标记 `parseMethod: 'agent_fallback'`。

5. IF 自定义 Skill 笔记内容为空 THEN 系统 SHALL 直接走原有 Agent 工作流，不调用大模型解析。

---

### 需求 4：集成解析器到 Skill 工作流转换逻辑

**用户故事：** 作为一名用户，我希望选择自定义 Skill 后，系统能自动选择正则解析或大模型解析，并生成对应的工作流，以便无缝执行。

#### 验收标准

1. WHEN 用户选择自定义 Skill 并提交时 THEN `convertSkillFlowToWorkflow()` SHALL 按以下优先级选择解析路径：
   1. 正则解析（`SkillDSLParser`）→ 成功则直接使用
   2. 大模型解析（`SkillLLMParser`）→ 成功则使用
   3. Agent 工作流降级（注入 Skill 内容作为系统提示词）

2. WHEN 工作流构建完成时 THEN 系统 SHALL 在 `WorkflowDefinition` 的 `metadata` 中记录 `parseMethod: 'regex' | 'llm' | 'agent_fallback'`，用于调试和数据分析。

3. WHEN 系统内置 Skill（灵感图、宫格图）被选中时 THEN 系统 SHALL 直接使用预定义的工作流步骤（不经过任何解析器），保持原有的高性能路径。

4. WHEN 解析路径为 `'llm'` 时 THEN 系统 SHALL 在 UI 上显示"AI 正在解析工作流..."的加载状态，避免用户感知到延迟而困惑。

---

### 需求 5：重整系统内置 Skill 笔记内容（灵感图、宫格图）

**用户故事：** 作为一名用户，我希望在知识库中查看灵感图和宫格图的 Skill 笔记时，笔记内容既是清晰的使用说明，又符合 DSL 规范，以便作为自定义 Skill 的参考模板。

#### 验收标准

1. WHEN 查看**灵感图** Skill 笔记时 THEN 系统 SHALL 展示以下内容（符合 DSL 规范）：

   ```
   灵感图

   生成创意灵感拼贴图，将多张图片以不规则分割的方式拼合，以散落的横向布局插入画布，营造富有创意感的视觉效果。

   **使用方式：** 在 AI 输入框中描述你的主题或灵感关键词，选择「灵感图」Skill 后提交，AI 将直接生成灵感拼贴图并插入画布。

   **适用场景：** 创意头脑风暴、情绪板制作、视觉灵感收集。

   **工作流：**

   调用 generate_inspiration_board
   - theme: {{input}}
   - imageCount: 9
   - imageSize: 16x9
   ```

2. WHEN 查看**宫格图** Skill 笔记时 THEN 系统 SHALL 展示以下内容（符合 DSL 规范）：

   ```
   宫格图

   生成整齐排列的宫格图片墙，将多张主题相关图片按网格布局排列在画布上，适合产品展示、表情包制作等场景。

   **使用方式：** 在 AI 输入框中描述你的主题，选择「宫格图」Skill 后提交，AI 将直接生成宫格图并插入画布。

   **适用场景：** 产品展示墙、表情包制作、图片集合展示。

   **工作流：**

   调用 generate_grid_image
   - theme: {{input}}
   - rows: 3
   - cols: 3
   - layoutStyle: scattered
   ```

3. WHEN 系统解析灵感图或宫格图 Skill 笔记内容时 THEN `SkillDSLParser.parse()` SHALL 成功返回对应的 `WorkflowStep[]`（不依赖大模型）。

4. WHEN 用户参考内置 Skill 笔记创建自定义 Skill 时 THEN 内置 Skill 笔记 SHALL 作为 DSL 语法的示例模板，帮助用户理解如何编写符合规范的 Skill 笔记。

---

### 需求 6：DSL 语法校验与用户提示

**用户故事：** 作为一名用户，我希望在编辑自定义 Skill 笔记时，系统能提示我当前内容是否符合 DSL 规范，以便我了解将使用哪种解析方式。

#### 验收标准

1. WHEN 用户在知识库 Skill 目录下编辑笔记时 THEN 系统 SHALL 在编辑器底部显示解析状态提示：
   - 若内容符合 DSL 规范：显示 `✓ 已识别为工作流 DSL（正则解析），将直接执行`
   - 若内容不符合 DSL 规范：显示 `⚡ 将由 AI 解析为工作流（大模型解析）`

2. WHEN 解析状态提示显示时 THEN 系统 SHALL 实时更新（用户每次修改内容后 debounce 500ms 重新检测），无需手动触发。

3. IF 笔记内容为空 THEN 系统 SHALL 不显示解析状态提示。
