# 需求文档：外部 Skill 引入支持

## 引言

当前 aitu 项目的 Skill 系统支持两种来源：**系统内置 Skill**（硬编码在 `packages/drawnix/src/constants/skills.ts`）和**用户自定义 Skill**（通过知识库 Skill 目录下的笔记手动创建）。这两种方式都无法方便地引入和管理来自外部的 Skill 包（如 [baoyu-skills](https://github.com/JimLiu/baoyu-skills.git)）。

本功能的核心目标是：设计并实现一套**外部 Skill 导入机制**，让用户能够便捷地从外部 Skill 仓库（Git 仓库或本地目录）导入 Skill，并与现有的系统内置 Skill、用户自定义 Skill 无缝共存和统一执行。

### 当前架构概要

- **系统内置 Skill**：`SYSTEM_SKILLS` 数组，硬编码 7 个 Skill，通过 `SystemSkill` 接口定义（id, name, mcpTool, description, type）
- **用户自定义 Skill**：知识库中 "Skill" 目录下的笔记，笔记标题为名称，笔记内容为 Skill 描述
- **Skill 执行**：统一走 `convertSkillFlowToWorkflow` 函数，支持三条路径（DSL 正则解析 / Agent 精准注入 / 角色扮演）
- **SkillDropdown UI**：展示自动、系统内置 Skill、用户自定义 Skill 三类选项

### baoyu-skills 外部 Skill 包规范

- 每个 Skill 为独立目录，包含 `SKILL.md`（YAML front matter + 文档内容）
- 可选包含 `scripts/`（TypeScript 脚本，通过 Bun 运行）、`references/`（参考文件）、`prompts/`（AI 提示词模板）
- `marketplace.json` 定义 Skill 分类和元数据
- SKILL.md 的 YAML front matter 包含 `name`（唯一标识，kebab-case）和 `description`（功能描述 + 触发关键词）

---

## 需求

### 需求 1：外部 Skill 包注册与管理

**用户故事：** 作为一名 aitu 用户，我希望能够注册外部 Skill 包源（如 GitHub 仓库 URL 或本地目录路径），以便系统能够发现并加载其中的 Skill。

#### 验收标准

1. WHEN 用户在设置中添加一个外部 Skill 包源（Git URL 或本地路径） THEN 系统 SHALL 将该包源信息持久化存储（IndexedDB 或 localStorage）
2. WHEN 用户添加的包源路径指向一个合法的 Skill 包（包含 `skills/` 目录或 `marketplace.json`） THEN 系统 SHALL 扫描并解析该包中所有 Skill 的 `SKILL.md` 文件
3. WHEN 用户添加的包源路径无效或不包含有效 Skill THEN 系统 SHALL 显示明确的错误提示，不影响现有功能
4. IF 已注册的外部 Skill 包源被用户删除 THEN 系统 SHALL 移除该包源下所有已导入的 Skill，且不影响其他 Skill
5. WHEN 系统启动时 THEN 系统 SHALL 自动加载所有已注册包源中的 Skill

### 需求 2：SKILL.md 解析与转换

**用户故事：** 作为一名 aitu 开发者，我希望系统能自动解析 baoyu-skills 规范的 `SKILL.md` 文件，以便将外部 Skill 转换为 aitu 内部 Skill 格式。

#### 验收标准

1. WHEN 系统加载一个外部 Skill 目录 THEN 系统 SHALL 解析 `SKILL.md` 的 YAML front matter，提取 `name` 和 `description` 字段
2. WHEN `SKILL.md` 包含 YAML front matter 和 Markdown 文档体 THEN 系统 SHALL 将 front matter 映射为 Skill 的 id/name/description，将文档体作为 Skill 的 content（等同于用户自定义 Skill 的笔记内容）
3. WHEN `SKILL.md` 中引用了 `references/` 或 `prompts/` 下的文件路径 THEN 系统 SHALL 解析这些相对路径引用并将其内联或保持为可访问路径
4. IF `SKILL.md` 格式不符合规范（缺少 front matter 或必填字段） THEN 系统 SHALL 跳过该 Skill 并在控制台输出警告日志

### 需求 3：外部 Skill 在 SkillDropdown 中展示

**用户故事：** 作为一名 aitu 用户，我希望导入的外部 Skill 能在 AI 输入框的 Skill 下拉列表中显示，以便我能快速选择和使用它们。

#### 验收标准

1. WHEN 外部 Skill 包已注册且包含有效 Skill THEN SkillDropdown 组件 SHALL 在"系统内置"和"用户自定义"之间增加"外部 Skill"分组显示
2. WHEN 外部 Skill 数量较多时 THEN SkillDropdown SHALL 支持按包源分组和/或搜索过滤能力
3. WHEN 外部 Skill 与系统内置 Skill 的 id 冲突 THEN 系统 SHALL 优先使用系统内置 Skill，外部 Skill 以后缀方式去重

### 需求 4：外部 Skill 执行支持

**用户故事：** 作为一名 aitu 用户，我希望选择外部 Skill 后能像使用系统内置 Skill 一样正常执行，以便获得一致的使用体验。

#### 验收标准

1. WHEN 用户选择一个外部 Skill 并提交输入 THEN 系统 SHALL 将 SKILL.md 的文档体内容（解析后的 Markdown）作为 Skill content，走现有的 `convertSkillFlowToWorkflow` 三条路径执行
2. WHEN 外部 Skill 的 SKILL.md 中包含 DSL 风格的工作流定义（如 `调用 xxx`） THEN 系统 SHALL 通过路径 A（正则解析）成功解析并执行
3. WHEN 外部 Skill 的内容包含 MCP 工具名引用但不符合 DSL 格式 THEN 系统 SHALL 通过路径 B（Agent 精准注入）执行
4. WHEN 外部 Skill 的内容为纯文本描述（角色扮演类） THEN 系统 SHALL 通过路径 C（角色扮演）执行
5. IF 外部 Skill 引用的脚本或工具在当前 aitu 环境中不可用 THEN 系统 SHALL 降级处理，将 Skill 内容作为角色扮演使用，不产生未处理异常

### 需求 5：Skill 类型体系扩展

**用户故事：** 作为一名 aitu 开发者，我希望 Skill 类型体系能够扩展以支持外部来源，以便在代码层面清晰区分不同来源的 Skill。

#### 验收标准

1. WHEN 新增外部 Skill 类型 THEN 系统 SHALL 在现有 `system` / `user` 类型基础上新增 `external` 类型标记
2. WHEN `external` 类型 Skill 加载后 THEN 系统 SHALL 记录其来源信息（包源 URL/路径、Skill 目录名等），用于调试和管理
3. WHEN 知识库 KBUnifiedTree 组件渲染 Skill 目录 THEN 系统 SHALL 在"系统"标记之外显示"外部"标记区分外部 Skill

### 需求 6：设置 UI 入口

**用户故事：** 作为一名 aitu 用户，我希望在设置面板中能方便地管理外部 Skill 包源，以便添加、删除和刷新外部 Skill。

#### 验收标准

1. WHEN 用户打开设置面板 THEN 系统 SHALL 提供"外部 Skill 包"管理区域，展示已注册的包源列表
2. WHEN 用户点击"添加"按钮 THEN 系统 SHALL 提供输入框让用户填写 Skill 包路径（本地目录路径），并验证其有效性
3. WHEN 用户点击某个已注册包源的"刷新"按钮 THEN 系统 SHALL 重新扫描该包源目录并更新 Skill 列表
4. WHEN 用户点击某个已注册包源的"删除"按钮 THEN 系统 SHALL 移除该包源及其下所有 Skill
5. WHEN 设置面板展示包源列表 THEN 每个包源 SHALL 显示名称、路径、包含的 Skill 数量信息

### 需求 7：Skill 内容缓存与性能

**用户故事：** 作为一名 aitu 用户，我希望外部 Skill 的加载是高效的，不会明显增加应用启动时间或影响使用体验。

#### 验收标准

1. WHEN 外部 Skill 包首次加载后 THEN 系统 SHALL 将解析后的 Skill 元数据缓存到本地存储（IndexedDB）
2. WHEN 缓存存在且包源目录未发生变化 THEN 系统 SHALL 直接使用缓存数据，跳过文件系统扫描
3. WHEN 外部 Skill 包数量较大（>50 个 Skill） THEN 系统 SHALL 采用懒加载策略，仅在用户选择 Skill 时加载其完整内容
4. IF 缓存数据损坏或与实际文件不一致 THEN 系统 SHALL 自动重新扫描并更新缓存

---

## 技术约束与边界条件

### 浏览器环境限制

- aitu 是一个浏览器端应用，**无法直接访问本地文件系统**。外部 Skill 包的加载方式需要适配浏览器环境：
  - **方案 A（推荐）**：将外部 Skill 包内容在构建时或通过后台服务预处理，以 JSON 格式提供给前端
  - **方案 B**：通过 File System Access API 让用户手动授权访问本地目录
  - **方案 C**：通过粘贴 SKILL.md 内容或上传压缩包的方式手动导入
  - **方案 D**：利用已有的知识库存储机制（IndexedDB），将外部 Skill 解析后导入为知识库笔记

### Skill 来源优先级

1. 系统内置 Skill（最高优先级）
2. 外部 Skill 包中的 Skill
3. 用户手动创建的自定义 Skill

### 兼容性

- 外部 Skill 的 `scripts/` 中的 TypeScript 脚本需要 Bun 运行时环境，这在浏览器端不可用。此类 Skill 应降级为纯描述模式（路径 B 或 C 执行）
- 外部 Skill 的 `references/` 引用文件在导入时需要内联处理

### 命名约束

- 外部 Skill 的 id 使用 `SKILL.md` front matter 中的 `name` 字段
- 为避免冲突，外部 Skill 的 id 在系统内部自动加上包名前缀（如 `baoyu-skills:baoyu-infographic`）
