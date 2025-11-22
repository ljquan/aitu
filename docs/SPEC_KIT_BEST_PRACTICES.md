# Spec-Kit 最佳实践指南

本文档介绍如何在 Aitu 项目中使用 GitHub Spec-Kit 进行规范驱动开发(Spec-Driven Development, SDD)。

## 目录

- [什么是 Spec-Kit](#什么是-spec-kit)
- [核心理念](#核心理念)
- [安装与设置](#安装与设置)
- [工作流程](#工作流程)
- [Monorepo 项目配置](#monorepo-项目配置)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)

## 什么是 Spec-Kit

Spec-Kit 是 GitHub 开源的规范驱动开发工具包,它将传统的"先编码后写文档"流程倒置为"先写规范后生成代码"。规范成为项目的真实来源(source of truth),AI 工具根据规范生成、测试和验证代码。

### 核心组件

1. **Specify CLI** - 用于初始化项目和下载模板的命令行工具
2. **模板和脚本** - 预设的规范模板和辅助脚本
3. **AI 集成** - 支持 Claude Code、GitHub Copilot、Gemini CLI 等 AI 编码助手

### 支持的 AI 工具

- Claude Code (推荐用于 Aitu 项目)
- GitHub Copilot
- Gemini CLI
- Cursor
- 其他兼容的 AI 编码助手

## 核心理念

### 规范驱动开发的优势

1. **意图优先** - 从"做什么"和"为什么"开始,而不是"怎么做"
2. **清晰性** - 在编码前就明确需求和架构决策
3. **活文档** - 规范与代码同步演进,始终保持最新
4. **人机协作** - 人类负责战略决策,AI 负责执行实现
5. **早期验证** - 在多个检查点捕获需求偏差,避免后期返工

### 何时使用 Spec-Kit

**✅ 推荐使用:**
- 为现有系统添加新功能
- 复杂的功能开发需要架构决策
- 团队协作需要明确的需求文档
- 需要保持代码与文档同步

**❌ 不建议使用:**
- 简单的 bug 修复
- 样式微调
- 配置文件更新
- 一次性实验性代码

## 安装与设置

### 前置要求

```bash
# 检查 Python 版本 (需要 3.11+)
python --version

# 检查 Git
git --version

# 安装 uv 包管理器
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 初始化 Spec-Kit

```bash
# 在项目根目录执行
npx @github/specify init

# 或使用 Python 包
pip install github-specify
specify init
```

这将创建 `.specify/` 目录结构:

```
.specify/
├── memory/
│   └── constitution.md      # 项目宪章(非常重要!)
├── specifications/          # 功能规范文档
├── plans/                   # 实现计划
└── tasks/                   # 任务列表
```

## 快速开始 - Specify 命令步骤流程

### 完整开发周期命令序列

```bash
# 0. 前置准备 - 初始化项目
npx @github/specify init

# 在 Claude Code 中按顺序执行以下 slash 命令:

# 1. 建立宪章 (一次性,项目级)
/speckit.constitution

# 2. 编写功能规范 (每个新功能)
/speckit.specify

# 3. (可选)澄清不明确的需求
/speckit.clarify

# 4. 制定实现计划
/speckit.plan

# 5. 生成任务清单
/speckit.tasks

# 6. (可选)分析一致性
/speckit.analyze

# 7. (可选)生成验收检查清单
/speckit.checklist

# 8. 执行实现
/speckit.implement

# 9. (可选)将任务转换为 GitHub Issues
/speckit.taskstoissues
```

### 命令详解

| 命令 | 用途 | 执行时机 | 输出文件 |
|------|------|---------|---------|
| `/speckit.constitution` | 定义项目宪章和开发原则 | 项目初期(一次性) | `.specify/memory/constitution.md` |
| `/speckit.specify` | 编写功能规范(what & why) | 每个新功能开始前 | `.specify/specifications/{feature}.md` |
| `/speckit.clarify` | 识别并澄清规范中的不明确之处 | 规范编写后(可选) | 更新 `.specify/specifications/{feature}.md` |
| `/speckit.plan` | 制定技术实现方案(how) | 规范确认后 | `.specify/plans/{feature}-plan.md` |
| `/speckit.tasks` | 分解为可执行任务 | 计划制定后 | `.specify/tasks/{feature}-tasks.md` |
| `/speckit.analyze` | 检查规范/计划/任务的一致性 | 任务生成后(可选) | 分析报告 |
| `/speckit.checklist` | 生成验收检查清单 | 实现前(可选) | 自定义检查清单 |
| `/speckit.implement` | AI 执行任务实现 | 任务清单确认后 | 实际代码文件 |
| `/speckit.taskstoissues` | 将任务转换为 GitHub Issues | 团队协作场景(可选) | GitHub Issues |

### 典型工作流示例

#### 场景 1: 首次使用(新项目)

```bash
# Step 1: 初始化
cd /path/to/aitu
npx @github/specify init

# Step 2: 在 Claude Code 中
/speckit.constitution
# AI 会引导你定义项目宪章,你可以基于现有的 CODING_STANDARDS.md

# Step 3: 开发第一个功能
/speckit.specify
# 描述: "添加图片圆形裁剪功能"

/speckit.plan
# AI 制定技术方案

/speckit.tasks
# AI 生成任务列表

/speckit.implement
# AI 开始实现
```

#### 场景 2: 日常功能开发

```bash
# 直接跳过 constitution(已存在)

# Step 1: 写规范
/speckit.specify
# 输入: "用户可以导出白板为 PDF 格式"

# Step 2: (可选)澄清
/speckit.clarify
# AI 提问: "PDF 导出是否包含注释?", "是否支持分页?"等
# 你回答后,AI 更新规范

# Step 3: 制定计划
/speckit.plan

# Step 4: 生成任务
/speckit.tasks

# Step 5: (可选)分析一致性
/speckit.analyze
# AI 检查规范、计划、任务是否一致

# Step 6: 实现
/speckit.implement
```

#### 场景 3: 团队协作

```bash
# 产品经理/技术负责人
/speckit.specify
/speckit.plan
/speckit.tasks

# 转换为 GitHub Issues
/speckit.taskstoissues
# 团队成员可以在 GitHub 上认领任务

# 开发团队成员
# 直接使用 GitHub Issues 进行开发
# 或者再次运行 /speckit.implement 自动实现
```

### 工作流检查点

```
┌─────────────────┐
│  Constitution   │  ← 项目宪章(一次性)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Specify      │  ← 功能规范(每个功能)
└────────┬────────┘
         │
         ├──→ [Clarify] (可选澄清)
         │
         ▼
┌─────────────────┐
│      Plan       │  ← 技术方案
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Tasks       │  ← 任务分解
└────────┬────────┘
         │
         ├──→ [Analyze] (可选分析)
         ├──→ [Checklist] (可选检查清单)
         ├──→ [TasksToIssues] (可选团队协作)
         │
         ▼
┌─────────────────┐
│   Implement     │  ← AI 执行实现
└─────────────────┘
         │
         ▼
    [Code Review]
         │
         ▼
    [Merge & Deploy]
```

## 工作流程

Spec-Kit 遵循五阶段工作流,每个阶段都有明确的检查点:

### 1. 建立宪章 (Constitution)

**命令:** `/speckit.constitution`

宪章是项目的"根本大法",定义不可妥协的原则和标准。

**Aitu 项目宪章示例:**

```markdown
# Aitu 项目宪章

## 代码质量原则

### 文件大小限制
- 单个文件不超过 500 行代码(包括空行和注释)
- 超过限制必须进行合理拆分

### TypeScript 规范
- 必须使用严格的 TypeScript 配置
- 禁止使用 `any` 类型,使用具体类型或泛型
- 所有组件 Props 必须有类型定义

### 架构约定
- 使用插件化架构(`withXxx` 模式)
- React 组件必须使用函数式组件和 Hooks
- 状态管理优先使用 React Context

### UI/UX 规范
- UI 组件必须使用 TDesign React (light 主题)
- Tooltip 统一使用 `theme='light'`
- 遵循品牌色彩系统(橙金色 #F39C12、蓝紫色 #5A4FCF)

### 测试要求
- 所有新功能必须包含单元测试
- 测试覆盖率不低于 80%
- 提交前必须通过类型检查和测试

### Git 提交规范
- 遵循 Conventional Commits: `<type>(<scope>): <subject>`
- 类型: feat, fix, docs, style, refactor, test, chore, perf, ci

### 性能要求
- 大组件必须使用 React.lazy 进行代码分割
- 图片必须使用懒加载
- 长列表必须考虑虚拟化

### 安全原则
- 所有用户输入必须验证和清理
- 不得硬编码敏感信息
- API 调用必须有安全的错误处理
```

**最佳实践:**
- 基于现有的 `CODING_STANDARDS.md` 提炼核心原则
- 宪章应该简洁(1-2 页),只包含非妥协性原则
- 定期审查和更新宪章

### 2. 编写规范 (Specification)

**命令:** `/speckit.specify`

规范聚焦于"做什么"和"为什么",避免过早陷入技术细节。

**好的规范示例:**

```markdown
# 规范: 图片圆形裁剪功能

## 背景
用户在插入图片后,只能使用方形裁剪,无法创建圆形或椭圆形的图片效果,
限制了设计创意。

## 目标
为用户提供三种图片裁剪形状选项:方形、圆形、椭圆形。

## 用户故事
作为白板用户,我希望能够:
1. 选中画布上的图片
2. 点击工具栏的"裁剪"按钮
3. 在弹出菜单中选择裁剪形状(方形/圆形/椭圆形)
4. 看到图片以选定形状显示

## 功能需求
- FR1: 在图片选中时显示裁剪按钮
- FR2: 提供三种裁剪形状选项
- FR3: 裁剪后保持图片质量
- FR4: 支持撤销/重做操作

## 非功能需求
- NFR1: 裁剪操作响应时间 < 200ms
- NFR2: 裁剪不影响原始图片文件
- NFR3: 支持移动端触摸操作

## 成功标准
- 用户可以成功应用三种裁剪形状
- E2E 测试通过
- 符合品牌设计规范
```

**❌ 避免在规范阶段:**
- 指定具体的技术实现(如"使用 canvas API")
- 详细的代码结构
- 具体的库或框架选择

### 3. 制定计划 (Plan)

**命令:** `/speckit.plan`

计划阶段做出技术决策,选择实现方案。

**计划示例:**

```markdown
# 实现计划: 图片圆形裁剪功能

## 技术栈选择
- 图片处理: Canvas API (浏览器原生支持)
- 组件库: TDesign React Popup 组件
- 状态管理: React useState + useCallback

## 架构方案

### 组件结构
```
components/
├── image-crop/
│   ├── ImageCropPopup.tsx      # 裁剪菜单弹窗
│   ├── ImageCropPopup.scss     # 样式文件
│   ├── image-crop.types.ts     # 类型定义
│   └── use-image-crop.ts       # 裁剪逻辑 Hook
```

### 数据流
1. 用户选中图片 -> 触发 popup 显示
2. 用户选择裁剪形状 -> 调用 `applyCrop(shape)`
3. Canvas API 处理图片 -> 生成新的图片 URL
4. 更新 Plait 节点数据

## 依赖项
- 无需新增外部依赖
- 复用现有的 Plait 插件系统

## 风险与缓解
- 风险: 大图片裁剪可能卡顿
- 缓解: 添加 loading 状态,使用 Web Worker

## 测试策略
- 单元测试: 测试 `useImageCrop` Hook
- 集成测试: 测试 ImageCropPopup 组件交互
- E2E 测试: 测试完整的用户流程
```

**最佳实践:**
- 评估多个技术方案,说明选择理由
- 识别技术风险和缓解策略
- 考虑与现有系统的集成点

### 4. 分解任务 (Tasks)

**命令:** `/speckit.tasks`

将计划分解为可执行的小任务。

**任务列表示例:**

```markdown
# 任务清单: 图片圆形裁剪功能

## Phase 1: 类型和工具函数
- [ ] 定义 `CropShape` 类型('rectangle' | 'circle' | 'ellipse')
- [ ] 定义 `ImageCropPopupProps` 接口
- [ ] 实现 `cropImageToShape()` 工具函数

## Phase 2: 核心组件
- [ ] 创建 `ImageCropPopup.tsx` 组件
- [ ] 实现 `useImageCrop` Hook
- [ ] 添加 BEM 样式 `image-crop-popup.scss`

## Phase 3: 集成
- [ ] 在 popup-toolbar 中添加裁剪按钮
- [ ] 连接到 Plait 图片节点更新逻辑
- [ ] 添加撤销/重做支持

## Phase 4: 测试
- [ ] 编写 `useImageCrop.test.ts` 单元测试
- [ ] 编写 `ImageCropPopup.test.tsx` 组件测试
- [ ] 编写 E2E 测试场景

## Phase 5: 文档和优化
- [ ] 更新组件文档
- [ ] 性能测试和优化
- [ ] Code review 和修复问题
```

**最佳实践:**
- 每个任务应该可以在 2-4 小时内完成
- 按逻辑依赖关系排序
- 包含测试和文档任务

### 5. 执行实现 (Implement)

**命令:** `/speckit.implement`

AI 根据规范、计划和任务开始生成代码。

**工作方式:**
1. AI 按顺序执行任务列表
2. 生成代码并运行测试
3. 遇到问题时暂停,寻求人类指导
4. 完成后更新任务状态

**人类在循环中的角色:**
- 审查生成的代码
- 在检查点提供反馈
- 解决 AI 无法处理的设计决策
- 批准关键的架构变更

## Monorepo 项目配置

Aitu 使用 Nx monorepo 结构,需要特殊配置来支持 Spec-Kit。

### 当前限制

⚠️ Spec-Kit 假设 `.specify` 在项目根目录,但 monorepo 中不同包可能需要独立的宪章。

### 推荐配置

#### 方案 1: 单一宪章(适合小型 monorepo)

```
aitu/
├── .specify/
│   └── memory/
│       └── constitution.md    # 全局宪章
├── apps/
│   └── web/
└── packages/
    ├── drawnix/
    └── react-board/
```

**适用场景:** 所有包遵循相同的编码标准

#### 方案 2: 分层宪章(适合大型 monorepo)

```
aitu/
├── .specify/
│   └── memory/
│       └── constitution.md         # 根宪章(通用原则)
├── packages/
│   ├── drawnix/
│   │   └── .specify/
│   │       └── memory/
│   │           └── constitution.md # drawnix 特定原则
│   └── react-board/
│       └── .specify/
│           └── memory/
│               └── constitution.md # react-board 特定原则
```

**适用场景:** 不同包有不同的技术栈或规范

**⚠️ 注意:** 截至 2025 年初,Spec-Kit 对子目录 `.specify` 的支持仍在开发中。建议先使用方案 1。

### Monorepo 工作流建议

```bash
# 1. 在项目根目录初始化 Spec-Kit
cd /path/to/aitu
npx @github/specify init

# 2. 创建全局宪章
# 在 Claude Code 中运行: /speckit.constitution

# 3. 为特定包开发功能时,在规范中明确范围
# 示例规范开头:
# Specification: Add Image Crop Feature to Drawnix Package
# Scope: packages/drawnix/
# ...

# 4. 在计划阶段明确文件路径
# 示例计划:
# Files to modify:
# - packages/drawnix/src/components/image-crop/ImageCropPopup.tsx
# - packages/drawnix/src/hooks/useImageCrop.ts
```

## 最佳实践

### 1. 编写高质量规范

**✅ DO:**
- 使用用户故事格式("作为[角色],我希望[功能],以便[价值]")
- 定义明确的成功标准
- 包含非功能需求(性能、安全、可访问性)
- 使用具体的场景和示例

**❌ DON'T:**
- 过早指定技术实现细节
- 假设读者了解隐含的业务逻辑
- 使用模糊的术语("用户体验良好")

### 2. 渐进式规范

对于复杂功能,采用分阶段规范:

```markdown
# Phase 1 Specification: 基础图片裁剪
- 支持方形裁剪
- 基本的 UI 交互

# Phase 2 Specification: 高级裁剪形状
- 添加圆形和椭圆形
- 裁剪预览

# Phase 3 Specification: 性能优化
- Web Worker 处理大图
- 缓存裁剪结果
```

### 3. 版本控制规范

```bash
# 提交规范文档
git add .specify/specifications/image-crop.md
git commit -m "docs(spec): add image crop feature specification"

# 提交计划
git add .specify/plans/image-crop-plan.md
git commit -m "docs(plan): add implementation plan for image crop"

# 实现完成后更新规范
git add .specify/specifications/image-crop.md
git commit -m "docs(spec): update image crop spec with final implementation"
```

### 4. 团队协作

**规范审查会议:**
1. 产品经理提出需求
2. 使用 `/speckit.specify` 起草规范
3. 团队审查规范,提出问题和建议
4. 迭代规范直到达成共识
5. 技术负责人制定计划
6. 开发团队执行实现

**异步协作:**
- 在 GitHub PR 中审查规范文档
- 使用 GitHub Discussions 讨论计划方案
- 在 Issues 中跟踪规范变更请求

### 5. 测试驱动规范

在规范中明确测试场景:

```markdown
## 测试场景

### 场景 1: 成功裁剪为圆形
Given: 用户已上传一张图片
When: 用户选择"圆形裁剪"
Then: 图片以圆形显示,保持原始宽高比

### 场景 2: 大图片性能
Given: 用户上传 10MB 的高分辨率图片
When: 用户应用裁剪
Then: 操作在 500ms 内完成,UI 不卡顿

### 场景 3: 移动端触摸
Given: 用户在移动设备上
When: 用户触摸选择裁剪形状
Then: 触摸区域足够大(最小 44x44px),操作流畅
```

### 6. 活文档原则

规范是"活"的,随代码演进:

```markdown
# Specification: Image Crop Feature

## Version History
- v1.0 (2025-01-15): Initial specification
- v1.1 (2025-01-20): Added ellipse shape after user feedback
- v1.2 (2025-01-25): Updated performance requirements

## Implementation Status
✅ Completed: Rectangle and circle crop
🚧 In Progress: Ellipse crop
📋 Planned: Custom polygon crop
```

### 7. 利用 Aitu 现有规范

将项目现有文档整合到 Spec-Kit 工作流:

```markdown
# Constitution 引用现有规范
参见项目根目录的详细规范:
- 编码标准: docs/CODING_STANDARDS.md
- 品牌指南: docs/BRAND_GUIDELINES.md
- 设计系统: docs/TDESIGN_THEME_INTEGRATION.md

本宪章提炼这些文档中的核心原则,作为 AI 开发的指导方针。
```

### 8. 性能与质量检查

在实现阶段嵌入自动检查:

```markdown
# Implementation Checklist (自动化)

## 代码质量
- [ ] TypeScript 类型检查通过 (`nx typecheck drawnix`)
- [ ] ESLint 检查通过 (`nx lint drawnix`)
- [ ] 单元测试通过 (`nx test drawnix`)
- [ ] 文件行数 < 500 行

## 性能基准
- [ ] 裁剪操作 < 200ms (Lighthouse)
- [ ] 组件首次渲染 < 100ms
- [ ] Bundle 大小增加 < 10KB

## 安全检查
- [ ] 输入验证完整
- [ ] 无硬编码密钥
- [ ] 依赖漏洞扫描通过
```

## 常见问题

### Q: Spec-Kit 会让开发变慢吗?

**A:** 初期可能稍慢,但长期加速开发:
- ✅ 减少返工(早期发现需求偏差)
- ✅ 降低沟通成本(规范即文档)
- ✅ 提升代码质量(AI 遵循宪章)
- ✅ 新成员上手快(规范清晰)

### Q: 简单功能也要写规范吗?

**A:** 根据复杂度判断:
- 简单 bug 修复 → 直接编码
- 添加新 UI 组件 → 简化的规范(1-2 段)
- 复杂功能 → 完整的规范-计划-任务流程

### Q: 规范与代码不同步怎么办?

**A:** 建立同步机制:
1. PR 模板要求更新相关规范
2. CI 检查规范文件的修改时间
3. 定期规范审计(每月/每季度)

### Q: 如何处理规范变更?

**A:** 版本化规范文档:
```markdown
# Specification: Feature X (v2.0)

## Changes from v1.0
- Added: Support for dark mode
- Removed: Legacy browser support
- Modified: Performance requirement from 500ms to 200ms

## Migration Guide
...
```

### Q: AI 生成的代码不符合预期怎么办?

**A:** 调整规范和宪章:
1. 检查宪章是否明确约束
2. 在规范中添加反例("不应该...")
3. 在计划中明确技术选择理由
4. 人工审查并修正,然后更新规范

### Q: Spec-Kit 与 CLAUDE.md 的关系?

**A:** 互补使用:
- **CLAUDE.md** - 项目级指导,所有会话生效
- **.specify/constitution.md** - 功能级宪章,特定开发任务生效
- 建议: CLAUDE.md 保持简洁,详细规范放入 `.specify/`

## 参考资源

### 官方文档
- [Spec-Kit GitHub](https://github.com/github/spec-kit)
- [Spec-Driven Development 博客](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)

### Aitu 项目文档
- [编码规范](./CODING_STANDARDS.md)
- [品牌指南](./BRAND_GUIDELINES.md)
- [项目指导](../CLAUDE.md)

### 社区讨论
- [Monorepo 支持讨论](https://github.com/github/spec-kit/discussions/769)
- [工作区支持 Issue](https://github.com/github/spec-kit/issues/1026)

---

**文档版本:** v1.0
**最后更新:** 2025-01-22
**维护者:** Aitu 团队

*本文档遵循 Spec-Kit 的活文档原则,会随着工具和项目实践持续演进。*
