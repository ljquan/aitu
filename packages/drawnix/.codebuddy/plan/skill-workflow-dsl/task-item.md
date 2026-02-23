# 实施计划

- [ ] 1. 定义 DSL 类型与变量接口
   - 在 `src/workflow/` 下新建 `skill-dsl.types.ts`，定义 `SkillDSLVariables`（含 `input`、`count`、`size`、`model` 字段）和 `SkillParseResult`（含 `steps: WorkflowStep[]`、`parseMethod: 'regex' | 'llm' | 'agent_fallback'`）接口
   - 在 `WorkflowDefinition` 的 `metadata` 类型中补充 `parseMethod` 可选字段
   - _需求：1.4、2.8、4.2_

- [ ] 2. 实现正则解析器 `SkillDSLParser`
   - 在 `src/workflow/` 下新建 `skill-dsl-parser.ts`，实现 `SkillDSLParser.parse(content, variables)` 静态方法
   - 使用 `/^(调用|CALL)\s+(\S+)/im` 提取工具调用声明行，使用 `/^-\s*([\w]+)\s*:\s*(.+)/` 提取参数行
   - 实现 `{{变量名}}` 占位符替换逻辑（遍历 `variables` 对象，用正则 `/\{\{(\w+)\}\}/g` 全局替换）
   - 实现数字类型自动转换（`/^\d+(\.\d+)?$/` 判断后转 `Number`）
   - 无工具调用声明行时返回 `null`；遇到格式错误的参数行时跳过，不抛异常
   - _需求：2.1、2.2、2.3、2.4、2.5、2.6、2.7、2.8_

- [ ] 3. 实现大模型兜底解析器 `SkillLLMParser`
   - 在 `src/workflow/` 下新建 `skill-llm-parser.ts`，实现 `SkillLLMParser.parse(content, variables, mcpTools)` 静态方法
   - 构造 System Prompt：包含可用 MCP 工具列表（工具名 + 描述 + 参数 Schema）、期望输出的 `WorkflowStep[]` JSON Schema、DSL 语法示例
   - 调用大模型接口，解析返回的 JSON，验证格式合法性后返回 `SkillParseResult`（`parseMethod: 'llm'`）
   - 解析失败（超时/格式错误/JSON 非法）时返回 `null`，由调用方降级处理
   - _需求：3.1、3.2、3.3、3.4_

- [ ] 4. 集成解析器到工作流转换逻辑
   - 在 `workflow-converter.ts` 的 `convertSkillFlowToWorkflow()` 中，针对自定义 Skill 按优先级调用：`SkillDSLParser` → `SkillLLMParser` → Agent 降级
   - Agent 降级时将 Skill 笔记内容注入 `ai_analyze` 步骤的系统提示词，并在 `metadata` 中记录 `parseMethod: 'agent_fallback'`
   - 内置 Skill（灵感图、宫格图）保持原有直接构建 MCP 步骤的高性能路径，不经过任何解析器
   - LLM 解析路径触发时，通过回调通知 UI 显示"AI 正在解析工作流..."加载状态
   - _需求：4.1、4.2、4.3、4.4、3.5_

- [ ] 5. 更新内置 Skill 笔记内容（灵感图、宫格图）
   - 将灵感图 Skill 笔记内容更新为包含 `**工作流：**` 块的 DSL 规范格式：`调用 generate_inspiration_board` + 参数行（`theme: {{input}}`、`imageCount: 9`、`imageSize: 16x9`）
   - 将宫格图 Skill 笔记内容更新为包含 `**工作流：**` 块的 DSL 规范格式：`调用 generate_grid_image` + 参数行（`theme: {{input}}`、`rows: 3`、`cols: 3`、`layoutStyle: scattered`）
   - 验证 `SkillDSLParser.parse()` 能成功解析两份笔记内容，返回正确的 `WorkflowStep[]`
   - _需求：5.1、5.2、5.3、5.4_

- [ ] 6. 在知识库编辑器中添加 DSL 解析状态提示
   - 在 `KBNoteEditor.tsx` 中，当当前笔记所在目录为 Skill 目录时，在编辑器底部渲染解析状态提示条
   - 监听编辑器内容变化，debounce 500ms 后调用 `SkillDSLParser.parse()` 检测是否符合 DSL 规范
   - 符合规范时显示 `✓ 已识别为工作流 DSL（正则解析），将直接执行`；不符合时显示 `⚡ 将由 AI 解析为工作流（大模型解析）`；内容为空时不显示
   - _需求：6.1、6.2、6.3_
