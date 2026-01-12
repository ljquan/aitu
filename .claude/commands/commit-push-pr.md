# Commit, Push, and Create PR

一键完成代码提交、推送到远程仓库，并创建 Pull Request。

## 参数

- `$ARGUMENTS`: PR 标题或描述（可选，如果不提供则自动生成）

## 前置检查

1. 确认当前不在 main/master 分支
2. 确认有未提交的变更
3. 确认工作目录状态

## 步骤

### 1. 分析变更

并行执行:
- `git status` - 查看变更状态
- `git diff` - 查看未暂存变更
- `git diff --staged` - 查看已暂存变更
- `git log --oneline -5` - 查看最近提交风格
- `git branch --show-current` - 确认当前分支

### 2. 创建提交

- 分析所有变更内容
- 生成符合 Conventional Commits 规范的提交信息
- 格式: `<type>(<scope>): <subject>`
- 添加 Claude Code 署名
- 执行 `git add .` 和 `git commit`

### 3. 推送到远程

- 检查是否有远程跟踪分支
- 如果没有，使用 `git push -u origin <branch>` 创建
- 如果有，使用 `git push`

### 4. 创建 Pull Request

使用 `gh pr create` 创建 PR:

```bash
gh pr create --title "<标题>" --body "$(cat <<'EOF'
## Summary
<变更摘要，1-3 个要点>

## Changes
<主要变更列表>

## Test Plan
<测试方案>

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 5. 返回结果

- 显示 PR URL
- 显示提交信息摘要
- 提示下一步操作

## 安全规则

- 不允许推送到 main/master 分支
- 不使用 `--force` 推送
- 不跳过 pre-commit hooks
- 检测并警告敏感文件（.env, credentials 等）

## 示例

```bash
# 使用自动生成的标题
/commit-push-pr

# 指定 PR 标题
/commit-push-pr 添加图片圆形裁剪功能

# 指定详细描述
/commit-push-pr 重构 AI 输入组件以支持多模态输入
```

## 错误处理

- 如果提交失败（如 pre-commit hook），报告错误并询问是否修复
- 如果推送失败，检查远程状态并提供解决方案
- 如果 PR 创建失败，检查 gh 认证状态
