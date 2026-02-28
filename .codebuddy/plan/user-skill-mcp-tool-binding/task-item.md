# 实施计划：用户自定义 Skill MCP 工具绑定

- [ ] 1. 扩展 KBNoteMetadata 类型，显式声明 mcpTools 字段
   - 在 `packages/drawnix/src/types/knowledge-base.types.ts` 的 `KBNoteMetadata` 接口中添加 `mcpTools?: string[]` 可选字段
   - 虽然已有 `[key: string]: unknown` 索引签名可兼容，但显式声明能提供类型安全和代码提示
   - _需求：1.1_

- [ ] 2. 创建 McpToolSelector 组件（MCP 工具绑定 UI）
   - 在 `packages/drawnix/src/components/knowledge-base/` 下新建 `McpToolSelector.tsx`
   - 组件 props：`selectedTools: string[]`、`onChange: (tools: string[]) => void`、`readOnly?: boolean`
   - 从 `mcpRegistry.getAllTools()` 获取已注册工具列表，展示为可勾选的 chip/badge 列表
   - 已选中的工具用高亮 badge 展示（类似标签样式），可点击移除
   - 点击「+ 工具」按钮展开下拉列表，显示所有可用工具（名称 + 简要描述），勾选/取消勾选
   - 无可用工具时显示"暂无可用工具"提示
   - readOnly 模式下已绑定工具仅展示不可编辑
   - _需求：2.1, 2.2, 2.3, 2.4, 2.6, 2.7_

- [ ] 3. 在 KBNoteEditor 中集成 McpToolSelector 组件
   - 在 `packages/drawnix/src/components/knowledge-base/KBNoteEditor.tsx` 中导入 `McpToolSelector`
   - 在标签选择器（`KBTagSelector`）旁边渲染 `McpToolSelector`，仅在 `isSkillDirectory === true` 时显示
   - 从 `note.metadata.mcpTools` 读取初始值，变更时调用 `knowledgeBaseService.updateNoteMetadata` 保存到 IndexedDB
   - readOnly 模式下传递 `readOnly={true}`
   - 为 McpToolSelector 添加对应样式到 `knowledge-base-editor.scss`
   - _需求：2.1, 2.5, 2.6_

- [ ] 4. 扩展 KBNoteEditor 的 props，支持保存 mcpTools 元数据
   - 在 `KBNoteEditorProps` 中添加 `onUpdateMetadata` 回调（或复用已有的 `onUpdateNote`）
   - 实现 `handleMcpToolsChange` 方法：更新 `note.metadata.mcpTools` 并触发自动保存
   - 确保 `knowledgeBaseService` 有更新笔记元数据的能力（检查 `updateNote` 方法是否支持 metadata 更新）
   - _需求：2.3_

- [ ] 5. 修改 SkillDropdown 中用户自定义 Skill 的加载逻辑，传递 mcpTools
   - 在 `SkillDropdown.tsx` 的 `loadUserSkills` 中，从 `getNoteMetasByDirectory` 返回的 `KBNoteMeta` 中读取 `metadata.mcpTools`
   - 将 `mcpTools` 存入 `SkillOption`，需要在 `SkillOption` 接口中添加 `mcpTools?: string[]` 字段
   - 渲染时：若 `mcpTools` 包含 `generate_image` 则显示图片图标（`<Image size={12} />`）；若包含其他工具则显示工具图标（`<Wrench size={12} />`）
   - 导入 `Wrench` 图标（来自 lucide-react）
   - _需求：5.1, 5.2, 5.3, 5.4_

- [ ] 6. 修改 AIInputBar 中用户自定义 Skill 的传参，传递 mcpTools
   - 在 `AIInputBar.tsx` 的用户自定义 Skill 分支中，从 `userNote.metadata?.mcpTools` 读取工具列表
   - 将 `mcpTools` 作为参数传入 `convertSkillFlowToWorkflow`，扩展 skill 对象：`{ id, name, type: 'user', content, mcpTools }`
   - _需求：4.1, 4.2_

- [ ] 7. 修改 convertSkillFlowToWorkflow 函数签名和路径判断逻辑
   - 在 `workflow-converter.ts` 中扩展 skill 参数类型，添加 `mcpTools?: string[]` 字段
   - 在路径 B/C 判断前，将 `mcpTools` 中在 `mcpRegistry` 中实际存在的工具名合并到 `validToolNames`（取并集）
   - 对于不存在的工具名输出 `console.warn` 日志
   - 当合并后 `validToolNames.length > 0` 时走路径 B（Agent + 工具注入），否则走路径 C
   - _需求：1.2, 1.3, 1.4, 3.2, 3.5, 4.3_

- [ ] 8. 增强路径 B 的 systemPrompt：当 mcpTools 包含 generate_image 时追加图片生成指引
   - 在 `workflow-converter.ts` 路径 B 代码块中，检测 `mcpTools` 是否包含 `generate_image`（对用户 Skill 也适用，不只是外部 Skill）
   - 将现有的"图片类外部 Skill"的执行指引逻辑泛化为：对任何包含 `generate_image` 的 Skill（无论 type 是 `user` 还是 `external`）都追加执行要求
   - 同样在路径 C 降级时，若 `mcpTools` 包含 `generate_image`，追加图片生成指引
   - _需求：3.3, 3.4_

- [ ] 9. TypeScript 编译验证和端到端测试
   - 运行 `npx tsc --noEmit` 确保无类型错误
   - 手动验证流程：创建新 Skill 笔记 → 在编辑器中绑定 `generate_image` 工具 → 选择该 Skill 发送消息 → 验证走路径 B 且调用 `generate_image`
   - 验证 SkillDropdown 中用户自定义 Skill 的图标显示正确
   - 验证只读模式下 McpToolSelector 不可编辑
   - _需求：全部_
