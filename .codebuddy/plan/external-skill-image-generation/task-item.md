# 实施计划

- [ ] 1. 预构建脚本增强：内联 references 目录内容到 bundle
   - 修改 `packages/drawnix/scripts/prebuild-external-skills.js`
   - 在扫描每个 Skill 目录时，递归读取 `references/` 下所有 `.md` 文件
   - 优先读取 `references/base-prompt.md`（如果存在），将其排在内联内容的最前面
   - 将每个 reference 文件以 `---\n## Reference: {relative-path}\n\n{content}` 格式追加到 Skill 的 content 末尾
   - 如果单个 Skill 的 reference 文件总内容超过 50KB，只内联前 30 个文件并追加截断说明
   - 重新运行脚本，验证 `external-skills-bundle.json` 中的 content 包含完整的 reference 内容
   - _需求：1.1、1.2、1.3、1.4、6.1、6.2、6.3、6.4_

- [ ] 2. 扩展 ExternalSkill 接口：新增 `outputType` 分类字段
   - 修改 `packages/drawnix/src/constants/skills.ts` 中的 `ExternalSkill` 接口，新增 `outputType?: 'image' | 'text'` 字段
   - 在预构建脚本中实现 `outputType` 自动推断逻辑：基于 description 关键词匹配（image/infographic/illustration/cover/slide/comic/图 → `'image'`，其余 → `'text'`）
   - 将推断结果写入 bundle JSON 的每个 skill 对象中
   - _需求：5.1_

- [ ] 3. 实现外部 Skill content 预处理函数
   - 在 `packages/drawnix/src/services/external-skill-parser.ts` 中新增 `preprocessExternalSkillContent(content: string, outputType: 'image' | 'text'): string` 函数
   - 对于 `outputType === 'image'` 的 Skill，执行以下转换：
     - 将 `baoyu-image-gen` 相关的脚本调用指令（如 `npx bun scripts/main.ts`、bash 代码块中的脚本调用）替换为 "请调用 generate_image 工具生成图片"
     - 将 `AskUserQuestion` 相关的交互步骤替换为 "自动选择最合适的参数组合"
     - 移除本地文件系统操作指令（如 "Save to file"、"Write to" + 文件路径、保存 analysis.md 等 bash 命令块）
     - 保留所有 prompt 构建相关内容（布局规则、样式定义、核心原则、Reference 内联内容）
   - 在 content 末尾追加"执行指引"段落，明确指示 Agent 最终目标是构建高质量 prompt 并调用 `generate_image` 工具
   - 对于 `outputType === 'text'` 的 Skill，不做特殊处理，直接返回原始 content
   - 如果预处理后 content 为空，使用 Skill 的 description 作为 fallback
   - _需求：2.1、2.2、2.3、2.4、4.1、4.2、4.3_

- [ ] 4. 修改 `convertSkillFlowToWorkflow` 路径选择逻辑：图片类外部 Skill 强制走路径 B
   - 修改 `packages/drawnix/src/components/ai-input-bar/workflow-converter.ts` 中 `convertSkillFlowToWorkflow` 函数
   - 在路径 B/C 判断前（`validToolNames.length > 0` 检查之前），对 `type === 'external'` 的 Skill 增加特殊处理：
     - 先调用 `preprocessExternalSkillContent()` 对 skillContent 进行预处理
     - 如果 Skill 的 `outputType === 'image'`（或通过关键词匹配判定为图片类），则将 `generate_image` 强制加入 `validToolNames` 列表（即使 `extractToolNamesFromContent` 未提取到）
     - 这确保图片类外部 Skill 必定走路径 B（Agent 精准注入），Agent 的上下文中包含 `generate_image` 工具描述 + 预处理后的 Skill 内容
   - _需求：2.1、2.5、3.1、3.2、3.3_

- [ ] 5. 增强路径 B 的 system prompt 构建：针对外部 Skill 优化 Agent 指令
   - 修改 `packages/drawnix/src/components/ai-input-bar/workflow-converter.ts` 路径 B 的 systemPrompt 构建逻辑
   - 当 Skill 类型为 `external` 且 `outputType === 'image'` 时，在 systemPrompt 中追加明确的执行指引：
     ```
     ## 执行要求
     你必须严格按照以上 Skill 工作流指令执行。最终目标是：
     1. 基于用户输入内容，按照 Skill 中的步骤分析并构建高质量的图片描述 prompt
     2. 调用 generate_image 工具生成图片，将构建好的 prompt 作为参数传入
     3. 不要仅输出文字描述，必须实际调用工具生成图片
     ```
   - _需求：3.3、4.2_

- [ ] 6. 增强路径 C 降级处理：确保降级时也能触发图片生成
   - 修改 `packages/drawnix/src/components/ai-input-bar/workflow-converter.ts` 路径 C 的 roleSystemPrompt 构建逻辑
   - 当外部 Skill 的 `outputType === 'image'` 时，路径 C 降级后的 systemPrompt 中 SHALL 追加：
     ```
     重要：请基于以上 Skill 指令构建详细的图片描述 prompt，并使用以下 JSON 格式回复以调用图片生成工具：
     {"content": "你的分析", "next": [{"mcp": "generate_image", "args": {"prompt": "你构建的完整 prompt"}}]}
     ```
   - 同时将路径 C 的 `mcp` 从 `ai_analyze` 保持不变（让 Agent 解析 JSON 并执行工具调用）
   - _需求：2.5、3.4_

- [ ] 7. 修改 AIInputBar 中外部 Skill 的传参：传递 `outputType` 信息
   - 修改 `packages/drawnix/src/components/ai-input-bar/AIInputBar.tsx` 中外部 Skill 的 `convertSkillFlowToWorkflow` 调用
   - 将 `externalSkill.outputType` 信息传递到 workflow-converter（可通过扩展 skill 参数对象，增加 `outputType` 字段）
   - 同步修改 `convertSkillFlowToWorkflow` 的参数类型签名以接收 `outputType`
   - _需求：3.1、3.2、5.3_

- [ ] 8. SkillDropdown 图片类 Skill 标记
   - 修改 `packages/drawnix/src/components/ai-input-bar/SkillDropdown.tsx`
   - 当外部 Skill 的 `outputType === 'image'` 时，在名称旁显示图片图标（如 🖼️ 或 `<Image size={12} />` 图标）
   - 在 `SkillOption` 接口中新增 `outputType?: 'image' | 'text'` 字段
   - 在 `loadExternalSkills` 中从 `externalSkillService.getAllExternalSkillsMeta()` 获取 `outputType` 并传入选项
   - _需求：5.2_

- [ ] 9. 重新生成 bundle 并端到端验证
   - 运行 `node packages/drawnix/scripts/prebuild-external-skills.js` 重新生成 bundle
   - 验证 bundle 中图片类 Skill（如 `baoyu-infographic`）的 content 包含完整的 reference 内容
   - 验证 bundle 中每个 Skill 的 `outputType` 字段正确推断
   - 验证 TypeScript 编译无报错（`npx tsc --noEmit`）
   - 在 SkillDropdown 中确认图片类 Skill 显示图片图标
   - 选择 `baoyu-infographic` Skill 后输入内容，确认走路径 B 且最终调用 `generate_image` 工具
   - _需求：1.4、2.1、3.2、3.3、5.1、5.2、5.3_
