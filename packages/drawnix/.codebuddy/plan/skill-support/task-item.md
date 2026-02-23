# 实施计划

- [ ] 1. 定义系统内置 Skill 常量与类型
   - 在 `src/constants/` 下新建 `skills.ts`，定义 `SystemSkill` 接口和 `SYSTEM_SKILLS` 数组（包含灵感图 `generate_inspiration_board`、宫格图 `generate_grid_image`）
   - 每个 SystemSkill 包含：`id`、`name`（中文名）、`mcpTool`（工具名）、`description`（说明文本）
   - _需求：2.2、2.3、3.1_

- [ ] 2. 扩展 `WorkflowDefinition` 的 `scenarioType` 并新增 Skill 工作流转换函数
   - 在 `workflow-converter.ts` 中将 `scenarioType` 扩展为 `'direct_generation' | 'agent_flow' | 'skill_flow'`
   - 新增 `convertSkillFlowToWorkflow(params, skill, userSkillContent?)` 函数：
     - 系统内置 Skill：直接构建对应 MCP 工具步骤（跳过 `ai_analyze`），`scenarioType` 为 `'skill_flow'`
     - 自定义 Skill：在 `ai_analyze` 的 `messages` 中注入 Skill 笔记内容作为系统提示词补充，`scenarioType` 为 `'skill_flow'`
   - 更新 `convertToWorkflow` 函数，增加 `skill` 参数分发逻辑
   - _需求：2.1、2.2、2.3、2.4、2.5_

- [ ] 3. 新建 `SkillDropdown` 组件
   - 在 `src/components/ai-input-bar/` 下新建 `SkillDropdown.tsx`，参考 `GenerationTypeDropdown.tsx` 的实现风格
   - 选项列表：`auto`（自动）→ 系统内置 Skill → 用户自定义 Skill（从知识库 Skill 目录实时读取）→ 分隔线 + "添加 Skill" 按钮
   - 组件 Props：`value: string`、`onSelect: (skillId: string) => void`、`onAddSkill: () => void`、`disabled?: boolean`
   - 使用 `knowledgeBaseService` 读取知识库 Skill 目录下的用户笔记，排除系统内置 Skill
   - _需求：1.1、1.2、1.3、1.4、1.5、4.5_

- [ ] 4. 在 `AIInputBar` 中集成 `SkillDropdown` 并接入工作流逻辑
   - 在 `AIInputBar.tsx` 中引入 `SkillDropdown`，放置在 `GenerationTypeDropdown` 右侧，仅在 `generationType === 'text'` 时显示
   - 新增 `selectedSkillId` 状态（默认 `'auto'`），当 `generationType` 切换离开 `text` 时重置为 `'auto'`
   - 提交时根据 `selectedSkillId` 决定调用 `convertSkillFlowToWorkflow` 还是原有 `convertAgentFlowToWorkflow`
   - 实现 `onAddSkill` 回调：打开知识库抽屉并定位到 Skill 目录（通过全局状态或事件）
   - _需求：1.1、1.5、2.1、2.2、2.3、2.4、4.1_

- [ ] 5. 扩展 `KnowledgeBaseDrawer` 支持初始定位到指定目录并触发新建笔记
   - 在 `KnowledgeBaseDrawer.tsx` 中新增 Props：`initialDirectoryName?: string`、`autoCreateNote?: boolean`
   - 在 `KnowledgeBaseContent.tsx` 中接收并处理这两个 Props：打开时自动选中对应目录，若 `autoCreateNote` 为 `true` 则触发新建笔记操作
   - 在 `drawnix.tsx` 中新增 `knowledgeBaseDrawerOpen` 状态及 `knowledgeBaseDrawerProps`（含 `initialDirectoryName`、`autoCreateNote`），并将其传递给 `KnowledgeBaseDrawer`
   - _需求：4.1、4.2_

- [ ] 6. 在知识库 Skill 目录中展示系统内置 Skill 只读笔记
   - 在 `KBUnifiedTree.tsx` 或 `KBNoteEditor.tsx` 中，当当前目录为 `Skill` 时，在笔记列表顶部注入系统内置 Skill 虚拟笔记（来自 `SYSTEM_SKILLS` 常量，不存入 IndexedDB）
   - 系统内置 Skill 笔记标题旁显示"系统"badge（使用 TDesign `Tag` 组件）
   - 当选中系统内置 Skill 笔记时，编辑器设为只读模式，并在顶部显示提示"系统内置 Skill，不可修改"
   - 隐藏系统内置 Skill 笔记的删除按钮，点击删除时弹出提示"系统内置 Skill，不可删除"
   - _需求：3.1、3.2、3.3、3.4、3.5_
