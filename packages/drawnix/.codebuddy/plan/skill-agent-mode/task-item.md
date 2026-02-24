# 实施计划

- [ ] 1. 新增工具名提取工具函数 `extractToolNamesFromContent`
   - 在 `skill-dsl-parser.ts` 中新增静态方法 `extractToolNamesFromContent(content: string): string[]`
   - 正则匹配 `调用 xxx`、`CALL xxx` 等模式，提取所有工具名（去重、去转义）
   - 供后续路径 B 判断和精准工具注入使用
   - _需求：3.1_

- [ ] 2. 统一 `convertSkillFlowToWorkflow` 入口，移除系统 Skill 的特殊分支
   - 在 `workflow-converter.ts` 中，将系统 Skill 的 `description` 作为 `content` 统一传入解析流程
   - 移除 `if (skill.type === 'system')` 的独立分支（包括 `agentMode` 分支和 `mcpTool` 直接执行分支）
   - 系统 Skill 和自定义 Skill 统一走：正则解析 → Agent 降级 → 角色扮演 三条路径
   - _需求：1.1、1.2、1.3、2.3_

- [ ] 3. 实现路径 B：Agent 模式精准注入相关工具描述
   - 在 `workflow-converter.ts` 的 Agent 降级分支中，调用 `extractToolNamesFromContent` 提取工具名
   - 新增 `generateFilteredSystemPrompt(toolNames: string[]): string` 函数，只注入相关工具描述
   - 将 Skill 笔记内容拼接到 systemPrompt 前置位置（优先上下文）
   - IF 提取到工具名 THEN 使用精准工具描述；IF 未提取到 THEN 降级为路径 C
   - _需求：3.1、3.2、3.3、3.4_

- [ ] 4. 实现路径 C：角色扮演模式，Skill 笔记直接作为 systemPrompt
   - 在 `workflow-converter.ts` 中，当正则解析失败且无工具名引用时，构建角色扮演 WorkflowStep
   - messages 只包含 `{ role: 'system', content: skillContent }` + `{ role: 'user', content: userInput }`，不注入任何 MCP 工具描述
   - 复用现有 `ai_analyze` 步骤结构，通过 `messages` 参数传递角色扮演上下文
   - _需求：4.1、4.2、4.3_

- [ ] 5. 清理 `skills.ts`：移除 `agentMode` 字段及相关注释
   - 从 `SystemSkill` 接口中删除 `agentMode?: boolean` 字段及其 JSDoc 注释
   - 从 `mcpTool` 字段的 JSDoc 注释中删除 `agentMode` 相关说明
   - 从 `role_chat_pm` Skill 定义中删除 `agentMode: true`（保留 `description` 内容不变）
   - _需求：1.3、4.4_

- [ ] 6. 验证端到端流程（宫格图 + 产品经理）
   - 验证宫格图系统 Skill：`description` 中的 `调用 generate_grid_image` 被正则解析，走路径 A，用户输入注入 `theme`
   - 验证用户复制宫格图创建自定义 Skill：与系统 Skill 产生完全相同的执行结果
   - 验证产品经理 Skill：正则解析失败 + 无工具名 → 走路径 C，messages 只含 Skill description + 用户输入，无 MCP 工具描述
   - _需求：2.1、2.2、2.3、4.1、4.2_
