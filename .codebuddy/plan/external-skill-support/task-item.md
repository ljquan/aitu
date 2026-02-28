# 实施计划：外部 Skill 引入支持

> 基于需求文档 `requirements.md`，以下是外部 Skill 引入功能的分步实施计划。
> 采用方案 D（基于 IndexedDB 知识库存储）+ 方案 C（手动导入）的组合策略，将外部 Skill 解析后存入现有知识库体系。

---

- [ ] 1. 扩展 Skill 类型体系和数据接口
   - 在 `packages/drawnix/src/constants/skills.ts` 中新增 `SKILL_TYPE_EXTERNAL = 'external'` 类型常量
   - 定义 `ExternalSkill` 接口，继承 `SystemSkill` 并扩展 `source`（包源名称）、`sourceUrl`（包源路径/URL）、`content`（SKILL.md 文档体）、`category`（来自 marketplace.json 的分组）等字段
   - 定义 `ExternalSkillPackage` 接口，包含 `name`、`url`、`skills: ExternalSkill[]`、`metadata`（版本、描述等）字段
   - 新增 `findExternalSkillById`、`isExternalSkillId` 工具函数
   - _需求：5.1、5.2_

- [ ] 2. 实现 SKILL.md 解析器
   - 在 `packages/drawnix/src/services/` 下创建 `external-skill-parser.ts`
   - 实现 `parseSkillMarkdown(content: string)` 函数：解析 YAML front matter（提取 `name`、`description`），分离文档体作为 Skill content
   - 实现 `parseMarketplaceJson(json: string)` 函数：解析 `marketplace.json`，提取 plugins 中的 skill 路径列表和分类信息
   - 实现 `resolveReferences(skillContent: string, references: Map<string, string>)` 函数：将 SKILL.md 中引用的 `references/` 和 `prompts/` 路径替换为内联内容
   - 对无效 SKILL.md（缺少 front matter 或 `name` 字段）输出 `console.warn` 并跳过
   - _需求：2.1、2.2、2.3、2.4_

- [ ] 3. 实现外部 Skill 包存储服务
   - 在 `packages/drawnix/src/services/` 下创建 `external-skill-service.ts`
   - 使用 IndexedDB（复用现有 `idb-keyval` 模式或新建 store）持久化存储：已注册包源列表 `ExternalSkillPackage[]` 和每个包下解析后的 Skill 数据
   - 实现 CRUD 方法：`addPackage`、`removePackage`、`getPackages`、`getSkillsByPackage`、`getAllExternalSkills`、`refreshPackage`
   - 实现 `importFromZip(file: File)` 方法：接受 ZIP 文件，解压后遍历 `skills/*/SKILL.md`，调用解析器转换并存储
   - 实现 `importFromPastedContent(name: string, skillMdContent: string)` 方法：接受用户粘贴的 SKILL.md 内容，解析并存储为单个外部 Skill
   - Skill ID 自动加包名前缀（如 `baoyu-skills:baoyu-infographic`）以避免冲突
   - _需求：1.1、1.2、1.3、1.4、1.5、7.1、7.2_

- [ ] 4. 实现构建时预处理脚本（离线导入）
   - 在 `packages/drawnix/scripts/` 下创建 `prebuild-external-skills.ts` Node.js 脚本
   - 该脚本扫描项目中的 `baoyu-skills/skills/` 目录，读取每个 skill 的 `SKILL.md` 和 `references/`、`prompts/` 文件
   - 将解析结果输出为 `packages/drawnix/src/generated/external-skills-bundle.json`，包含所有外部 Skill 的元数据和内容
   - 在 `package.json` 中添加 `prebuild` 脚本，确保构建前自动生成 JSON bundle
   - 应用启动时自动加载该 JSON bundle 作为预置的外部 Skill 包
   - _需求：1.5、7.1、7.2、7.3（技术约束方案 A）_

- [ ] 5. 修改 SkillDropdown 组件支持外部 Skill 展示
   - 修改 `packages/drawnix/src/components/ai-input-bar/SkillDropdown.tsx`
   - 在 `SkillOption` 接口中新增 `isExternal?: boolean` 和 `source?: string` 属性
   - 在 `loadUserSkills` 旁新增 `loadExternalSkills` 方法，从 `external-skill-service` 获取所有外部 Skill
   - 在下拉列表中，按"自动 → 系统内置 → 外部 Skill → 用户自定义"顺序分组展示，外部 Skill 项显示"外部"徽章
   - 外部 Skill 与系统内置 Skill ID 冲突时隐藏外部 Skill 项
   - 当 Skill 总数较多时（>15），在下拉列表顶部增加搜索过滤输入框
   - _需求：3.1、3.2、3.3_

- [ ] 6. 修改 AIInputBar 和 workflow-converter 支持外部 Skill 执行
   - 修改 `packages/drawnix/src/components/ai-input-bar/AIInputBar.tsx` 的 Skill 模式分支逻辑
   - 在系统内置 Skill 和用户自定义 Skill 之间插入外部 Skill 判断：通过 `external-skill-service.getSkillById()` 获取 Skill 数据
   - 修改 `convertSkillFlowToWorkflow` 函数的 `skill` 参数类型，支持 `{ type: 'external', content: string, ... }` 形式
   - 外部 Skill 的 `content` 字段（SKILL.md 文档体）走现有三条路径：路径 A（DSL 正则）、路径 B（Agent 注入）、路径 C（角色扮演）
   - 引用脚本/工具不可用时降级为路径 C（角色扮演），使用 `console.warn` 提示
   - _需求：4.1、4.2、4.3、4.4、4.5_

- [ ] 7. 修改 KBUnifiedTree 展示外部 Skill
   - 修改 `packages/drawnix/src/components/knowledge-base/KBUnifiedTree.tsx`
   - 在 Skill 目录的系统内置 Skill 列表之后、用户自定义笔记之前，插入外部 Skill 虚拟笔记行
   - 外部 Skill 行使用 `Lock` 图标 + "外部"徽章（与"系统"徽章同风格但不同颜色，如蓝色）
   - 点击外部 Skill 虚拟笔记时，在 `KBNoteEditor` 中以只读模式展示 SKILL.md 的完整内容
   - 新增 `EXTERNAL_SKILL_NOTE_PREFIX` 常量（如 `__external_skill__:`）用于区分虚拟笔记 ID
   - _需求：5.3_

- [ ] 8. 在设置面板增加外部 Skill 包管理入口
   - 修改 `packages/drawnix/src/components/settings-dialog/settings-dialog.tsx`，新增"外部 Skill 包"管理区域
   - 展示已注册包源列表：每项显示包名、路径/URL、Skill 数量
   - 提供"导入 Skill 包"按钮：支持两种导入方式
     - 上传 ZIP 文件（包含 `skills/` 目录结构）
     - 粘贴单个 SKILL.md 内容
   - 每个已注册包源提供"刷新"（重新解析）和"删除"（移除包源及其 Skill）按钮
   - 相应的 SCSS 样式在 `settings-dialog.scss` 中补充
   - _需求：6.1、6.2、6.3、6.4、6.5_

- [ ] 9. 实现外部 Skill 缓存和懒加载机制
   - 在 `external-skill-service.ts` 中实现两级数据结构：元数据层（id, name, description, source）始终加载；内容层（完整 SKILL.md 文档体）按需加载
   - `getAllExternalSkills` 仅返回元数据列表（用于 SkillDropdown 和 KBUnifiedTree 展示）
   - `getSkillContentById` 按需从 IndexedDB 读取完整内容（用于执行时）
   - 应用启动时仅加载元数据，减少初始化开销
   - 包源数据变更时（添加/刷新/删除）自动更新缓存
   - _需求：7.1、7.2、7.3、7.4_

- [ ] 10. 端到端集成验证与边界处理
   - 在 `packages/drawnix/src/services/` 下为 `external-skill-parser.ts` 编写单元测试：验证 YAML front matter 解析、文档体提取、无效格式跳过
   - 验证完整流程：导入 baoyu-skills ZIP → 解析 15 个 Skill → SkillDropdown 展示 → 选择执行 → 三条路径均正常
   - 验证冲突处理：外部 Skill ID 与系统内置 ID 重名时正确隐藏/去重
   - 验证删除流程：移除包源后 Skill 列表和 KBUnifiedTree 同步更新
   - 验证性能：50+ Skill 场景下 SkillDropdown 打开速度正常
   - _需求：1.3、3.3、4.5、7.3_
