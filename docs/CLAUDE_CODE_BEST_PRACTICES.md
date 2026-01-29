# Claude Code 最佳实践指南

本文档基于 Claude Code 之父 Boris Cherny 的 13 条实战技巧，结合 Opentu 项目实际情况进行整理，帮助团队最大化 Claude Code 的开发效率。

## 目录

- [并行工作流](#并行工作流)
- [模型选择策略](#模型选择策略)
- [知识沉淀机制](#知识沉淀机制)
- [Plan 模式优先](#plan-模式优先)
- [斜杠命令自动化](#斜杠命令自动化)
- [Subagents 工作流](#subagents-工作流)
- [代码格式化 Hook](#代码格式化-hook)
- [权限预批准](#权限预批准)
- [MCP 工具链集成](#mcp-工具链集成)
- [长任务自动化](#长任务自动化)
- [验证机制](#验证机制)

---

## 并行工作流

**技巧 1: 多实例并行运行**

在终端中并行运行多个 Claude Code 实例，开启系统通知，哪个需要输入就跳过去处理。

```bash
# 终端 1: 处理功能开发
claude

# 终端 2: 处理测试编写
claude

# 终端 3: 处理文档更新
claude
```

**配置系统通知:**

```bash
# macOS 系统通知已默认开启
# 确保终端应用有通知权限: 系统设置 → 通知 → Terminal/iTerm2
```

**技巧 2: CLI + GUI 双线作战**

使用 `&` 后台运行和 `--teleport` 在 CLI/GUI 之间无缝切换会话。

```bash
# 在 CLI 启动后台会话
claude &

# 使用 --teleport 将会话传送到 GUI
claude --teleport

# 从 GUI 返回 CLI 继续工作
# 在 GUI 中使用 /teleport 命令
```

**Opentu 项目应用场景:**

| 实例 | 任务类型 | 示例 |
|------|---------|------|
| 实例 1 | 核心功能开发 | 开发 AI 图像生成功能 |
| 实例 2 | 测试编写 | 为新功能编写单元测试 |
| 实例 3 | 文档/规范 | 更新 API 文档或规范 |

---

## 模型选择策略

**技巧 3: 全程使用 Opus 4.5 Thinking 模式**

虽然单次响应慢一点，但需要纠正的次数少得多，工具调用也更准确，最终算下来反而更快。

**模型对比:**

| 特性 | Sonnet (快速) | Opus 4.5 Thinking (推荐) |
|------|--------------|-------------------------|
| 响应速度 | 快 | 较慢 |
| 准确率 | 中等 | 高 |
| 纠正次数 | 多 | 少 |
| 工具调用准确性 | 一般 | 高 |
| **总体效率** | 一般 | **更高** |

**配置方法:**

```bash
# 在 claude 启动时指定模型
claude --model opus

# 或在 settings.json 中配置默认模型
```

**何时使用 Sonnet:**
- 简单的问答查询
- 快速代码片段生成
- 文档格式调整

**何时使用 Opus Thinking:**
- 复杂功能实现
- 架构设计决策
- 多文件重构
- Debug 复杂问题

---

## 知识沉淀机制

**技巧 4: 团队共享 CODEBUDDY.md**

每当 Claude 做错什么就加进去，下次它就知道了，形成飞轮效应。

**Opentu 项目 CODEBUDDY.md 结构:**

```markdown
# CODEBUDDY.md

## 项目规范
- 文件大小限制: 单文件不超过 500 行
- UI 框架: TDesign React (light 主题)
- Tooltip: 必须使用 theme='light'

## 常见错误记录
### 错误 1: Z-Index 硬编码
❌ 错误: style={{ zIndex: 9999 }}
✅ 正确: 使用 Z_INDEX 常量

### 错误 2: 忘记处理移动端
❌ 错误: 只考虑桌面端交互
✅ 正确: 同时处理触摸和鼠标事件
```

**技巧 5: Code Review 自动更新规则**

使用 `/update-claude-md` 命令让 AI 自动将 Code Review 中发现的问题更新到 CODEBUDDY.md。

**创建自动更新命令:**

参考 `.codebuddy/commands/update-claude-md.md`:

```markdown
# Update CLAUDE.md

分析最近的 Code Review 反馈，提取通用规则并更新 CODEBUDDY.md。

## 步骤

1. 读取最近的 PR review 评论或用户反馈
2. 识别可通用化的模式或规则
3. 检查 CODEBUDDY.md 中是否已有相关规则
4. 如果是新规则，添加到适当的章节
5. 使用统一的格式:
   - ❌ 错误示例
   - ✅ 正确示例
   - 原因说明
```

---

## Plan 模式优先

**技巧 6: 大多数会话从 Plan 模式开始**

先想清楚再动手，好的计划很重要。

**进入 Plan 模式:**

```
Shift + Tab (按两次)
```

**Plan 模式工作流:**

```
1. 描述任务需求
   ↓
2. Claude 生成实现计划
   ↓
3. 审查计划，提出修改意见
   ↓
4. 确认计划后退出 Plan 模式
   ↓
5. 执行实现
```

**Opentu 项目 Plan 模式示例:**

```
用户: 我想添加一个图片圆形裁剪功能

Claude (Plan 模式):
## 实现计划

### 1. 类型定义
- 创建 CropShape 类型
- 定义 ImageCropPopupProps 接口

### 2. 核心组件
- ImageCropPopup.tsx 裁剪弹窗
- useImageCrop.ts 裁剪逻辑 Hook

### 3. 集成
- 在 PopupToolbar 添加裁剪按钮
- 连接 Plait 节点更新

### 4. 测试
- 单元测试
- E2E 测试

是否确认这个计划？
```

**与 SpecKit 结合使用:**

对于复杂功能，结合 SpecKit 工作流:

```bash
# Plan 模式下先理清思路
Shift + Tab + Tab

# 然后使用 SpecKit 正式规范化
/speckit.specify
/speckit.plan
/speckit.tasks
/speckit.implement
```

---

## 斜杠命令自动化

**技巧 7: 高频重复操作做成斜杠命令**

Claude 自己也能调用这些命令，实现自动化工作流。

**Opentu 项目已有命令:**

| 命令 | 功能 |
|------|------|
| `/auto-commit` | 自动分析变更并提交 |
| `/speckit.auto` | 自动执行完整 SpecKit 流程 |
| `/speckit.specify` | 创建功能规范 |
| `/speckit.plan` | 生成实现计划 |
| `/speckit.tasks` | 生成任务清单 |
| `/speckit.implement` | 执行实现 |

**创建自定义命令:**

在 `.codebuddy/commands/` 目录下创建 markdown 文件:

**示例: `/commit-push-pr` 一键完成提交推送创建 PR**

```markdown
# .codebuddy/commands/commit-push-pr.md

# Commit, Push, and Create PR

自动完成代码提交、推送和创建 Pull Request。

## 参数

- $ARGUMENTS: PR 标题和描述 (可选)

## 步骤

1. 运行 git status 检查变更
2. 运行 git diff 分析变更内容
3. 生成符合规范的 commit message
4. 执行 git add 和 git commit
5. 推送到远程分支
6. 使用 gh pr create 创建 PR
7. 返回 PR URL
```

**示例: `/typecheck-fix` 类型检查并自动修复**

```markdown
# .codebuddy/commands/typecheck-fix.md

# TypeCheck and Fix

运行类型检查并自动修复发现的类型错误。

## 步骤

1. 运行 nx typecheck drawnix
2. 解析错误输出
3. 逐个修复类型错误
4. 重新运行类型检查验证
5. 报告修复结果
```

**示例: `/build-test-commit` 构建测试提交一条龙**

```markdown
# .codebuddy/commands/build-test-commit.md

# Build, Test, and Commit

确保代码质量后自动提交。

## 步骤

1. 运行 npm run build 构建项目
2. 运行 npm test 执行测试
3. 如果都通过，执行 /auto-commit
4. 如果失败，报告错误并提供修复建议
```

---

## Subagents 工作流

**技巧 8: 使用 Subagents 自动化常见工作流**

把反复做的事情固化下来，让 Claude 自己调用。

**Opentu 项目 Subagent 示例:**

参考 `.codebuddy/skills/speckit-auto.md`:

```markdown
# SpecKit Auto Skill

自动执行完整的 SpecKit 工作流。

## 触发条件

当用户描述一个新功能需求时。

## 执行流程

1. 调用 /speckit.specify 生成规范
2. 调用 /speckit.clarify 澄清疑问
3. 调用 /speckit.plan 制定计划
4. 调用 /speckit.tasks 生成任务
5. 调用 /speckit.implement 执行实现
```

**创建自定义 Skill:**

```markdown
# .codebuddy/skills/code-review.md

# Code Review Skill

自动进行代码审查。

## 检查项

1. TypeScript 类型安全
2. React Hooks 规范
3. 文件大小限制 (< 500 行)
4. Z-Index 规范使用
5. 性能优化建议

## 输出格式

- 问题严重程度: 🔴 Critical / 🟡 Warning / 🟢 Info
- 问题位置: 文件:行号
- 问题描述
- 修复建议
```

---

## 代码格式化 Hook

**技巧 9: 使用 PostToolUse Hook 格式化代码**

Claude 通常能自动生成格式良好的代码，Hook 处理最后 10%，避免 CI 格式错误。

**配置 PostToolUse Hook:**

在项目配置中添加:

```json
// .codebuddy/settings.json (如果存在) 或项目配置
{
  "hooks": {
    "postToolUse": {
      "write": "npm run format:file -- $FILE",
      "edit": "npm run format:file -- $FILE"
    }
  }
}
```

**Opentu 项目格式化脚本:**

```json
// package.json
{
  "scripts": {
    "format": "prettier --write .",
    "format:file": "prettier --write",
    "format:check": "prettier --check ."
  }
}
```

**Hook 工作原理:**

```
Claude 写入文件
      ↓
PostToolUse Hook 触发
      ↓
运行 prettier 格式化
      ↓
文件格式统一
      ↓
避免 CI 格式检查失败
```

---

## 权限预批准

**技巧 10: 使用 /permissions 预批准常用安全命令**

避免每次都弹确认框，而不是使用 `dangerously-skip-permissions`。

**推荐预批准的命令:**

```bash
# 查看权限设置
/permissions

# 预批准常用的安全命令
# 示例配置:
```

**Opentu 项目推荐批准列表:**

| 命令类型 | 示例 | 风险级别 |
|---------|------|---------|
| 读取操作 | `cat`, `ls`, `git status` | 低 |
| 构建命令 | `npm run build`, `nx build` | 低 |
| 测试命令 | `npm test`, `nx test` | 低 |
| Lint 命令 | `nx lint`, `eslint` | 低 |
| Git 查看 | `git log`, `git diff` | 低 |

**不建议预批准的命令:**

| 命令类型 | 示例 | 原因 |
|---------|------|------|
| 删除操作 | `rm -rf`, `git reset --hard` | 破坏性 |
| 推送操作 | `git push --force` | 影响远程 |
| 安装操作 | `npm install <package>` | 引入依赖 |

---

## MCP 工具链集成

**技巧 11: 配置 MCP 让 Claude 使用所有需要的工具**

Claude Code 不只是编程工具，而是能调用整个工具链。

**MCP (Model Context Protocol) 集成示例:**

```json
// mcp.json 配置示例
{
  "servers": {
    "slack": {
      "command": "npx",
      "args": ["@anthropic/mcp-server-slack"],
      "env": {
        "SLACK_TOKEN": "${SLACK_TOKEN}"
      }
    },
    "sentry": {
      "command": "npx", 
      "args": ["@anthropic/mcp-server-sentry"],
      "env": {
        "SENTRY_AUTH_TOKEN": "${SENTRY_AUTH_TOKEN}"
      }
    },
    "github": {
      "command": "npx",
      "args": ["@anthropic/mcp-server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

**Opentu 项目推荐 MCP 集成:**

| 工具 | 用途 | MCP Server |
|------|------|-----------|
| GitHub | Issue/PR 管理 | @anthropic/mcp-server-github |
| Sentry | 错误日志追踪 | @anthropic/mcp-server-sentry |
| Slack | 团队通知 | @anthropic/mcp-server-slack |
| Figma | 设计稿获取 | @anthropic/mcp-server-figma |

**使用场景:**

```
用户: 查看最近的 Sentry 错误

Claude: [通过 MCP 调用 Sentry API]
发现 3 个未解决错误:
1. TypeError in ImageCropPopup.tsx:45
2. NetworkError in video-api-service.ts:123
3. ...

需要我帮你修复哪个？
```

---

## 长任务自动化

**技巧 12: 长任务使用 --permission-mode=dontAsk**

对于要跑很久的任务，让 Claude 自动循环改进工作直到完成。

**使用方法:**

```bash
# 启动长任务模式
claude --permission-mode=dontAsk

# 或在会话中配置
/settings permission-mode dontAsk
```

**适用场景:**

- 大规模代码重构
- 批量文件处理
- 持续集成修复
- 测试覆盖率提升

**安全建议:**

1. 确保在版本控制下工作
2. 先创建新分支
3. 设置合理的超时时间
4. 定期检查进度

**Opentu 项目长任务示例:**

```bash
# 示例: 将所有组件迁移到新的 Z-Index 规范
claude --permission-mode=dontAsk

提示词:
"将项目中所有硬编码的 z-index 值替换为 Z_INDEX 常量，
遵循 docs/Z_INDEX_GUIDE.md 规范，完成后运行类型检查确认无误"
```

---

## 验证机制

**技巧 13: 给 Claude 验证工作的方式 (最重要！)**

如果 Claude 能验证自己的工作，最终产出质量能提升 2~3 倍。投入精力把验证机制做扎实，这是回报率最高的投资。

### 验证机制类型

#### 1. 类型检查验证

```markdown
# CODEBUDDY.md 中添加

## 验证命令

每次修改 TypeScript 文件后，运行:
\`\`\`bash
nx typecheck drawnix
\`\`\`
确保无类型错误后再继续。
```

#### 2. 测试验证

```markdown
## 测试验证

修改代码后运行相关测试:
\`\`\`bash
# 单元测试
nx test drawnix

# 特定文件测试
nx test drawnix --testFile=useImageCrop.test.ts
\`\`\`
```

#### 3. Lint 验证

```markdown
## Lint 验证

代码提交前运行:
\`\`\`bash
nx lint drawnix
npm run format:check
\`\`\`
```

#### 4. 构建验证

```markdown
## 构建验证

确保代码可以成功构建:
\`\`\`bash
npm run build
\`\`\`
```

#### 5. 自定义验证脚本

```markdown
## 自定义验证

### 文件大小检查
\`\`\`bash
# 检查文件行数是否超过 500 行
wc -l <file> | awk '{if($1>500) exit 1}'
\`\`\`

### Z-Index 规范检查
\`\`\`bash
# 检查是否有硬编码的 z-index
grep -r "z-index:\s*[0-9]" --include="*.scss" --include="*.css"
grep -r "zIndex:\s*[0-9]" --include="*.tsx" --include="*.ts"
\`\`\`
```

### Opentu 项目完整验证清单

```markdown
# 任务完成验证清单

## 代码质量
- [ ] `nx typecheck drawnix` 通过
- [ ] `nx lint drawnix` 通过
- [ ] `npm run format:check` 通过

## 测试覆盖
- [ ] 相关单元测试通过
- [ ] 新功能有对应测试

## 规范遵守
- [ ] 文件行数 < 500 行
- [ ] 使用 Z_INDEX 常量
- [ ] TDesign 组件使用 light 主题
- [ ] 无硬编码敏感信息

## 构建验证
- [ ] `npm run build` 成功
- [ ] 无控制台警告/错误

## 功能验证
- [ ] 本地运行 `npm start` 测试功能
- [ ] 移动端适配正常
```

### 在 CODEBUDDY.md 中配置验证

```markdown
# CODEBUDDY.md 添加

## 自动验证规则

完成任何代码修改后，必须执行以下验证步骤:

1. **类型检查**: `nx typecheck drawnix`
2. **代码规范**: `nx lint drawnix`  
3. **测试运行**: `nx test drawnix --passWithNoTests`
4. **构建验证**: `npm run build:web`

如果任何步骤失败，必须先修复问题再继续。

## 验证失败处理

### 类型错误
- 检查类型定义是否完整
- 确认 import 路径正确
- 查看相关 interface/type 定义

### Lint 错误
- 运行 `nx lint drawnix --fix` 自动修复
- 手动修复无法自动修复的问题

### 测试失败
- 分析失败原因
- 更新测试或修复代码
- 确保测试覆盖新功能
```

---

## 快速参考卡片

### 日常开发流程

```
1. 开启 Plan 模式 (Shift+Tab×2)
2. 描述任务，确认计划
3. 退出 Plan 模式开始实现
4. 完成后运行验证命令
5. 使用 /auto-commit 提交
```

### 复杂功能开发流程

```
1. /speckit.specify - 写规范
2. /speckit.clarify - 澄清疑问
3. /speckit.plan - 制定计划
4. /speckit.tasks - 生成任务
5. /speckit.implement - 执行实现
6. 验证 + /auto-commit
```

### 常用命令速查

| 操作 | 命令/快捷键 |
|------|------------|
| Plan 模式 | `Shift + Tab` × 2 |
| 自动提交 | `/auto-commit` |
| 权限设置 | `/permissions` |
| SpecKit 自动流程 | `/speckit.auto` |
| 查看帮助 | `/help` |

---

## 附录: 配置模板

### .codebuddy/settings.json 模板

```json
{
  "model": "opus",
  "hooks": {
    "postToolUse": {
      "write": "prettier --write $FILE",
      "edit": "prettier --write $FILE"
    }
  },
  "permissions": {
    "allow": [
      "npm run build",
      "npm test",
      "nx *",
      "git status",
      "git diff",
      "git log"
    ]
  }
}
```

### 验证脚本模板

```bash
#!/bin/bash
# scripts/validate.sh

echo "🔍 Running validation..."

echo "1. Type checking..."
nx typecheck drawnix || exit 1

echo "2. Linting..."
nx lint drawnix || exit 1

echo "3. Testing..."
nx test drawnix --passWithNoTests || exit 1

echo "4. Building..."
npm run build:web || exit 1

echo "✅ All validations passed!"
```

---

**文档版本:** v1.0  
**最后更新:** 2025-01-09  
**参考来源:** Boris Cherny - Claude Code 实战技巧  
**维护者:** Opentu 团队
