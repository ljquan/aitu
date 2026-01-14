# Update CLAUDE.md

分析代码审查反馈或开发过程中发现的问题，提取通用规则并更新 CLAUDE.md。

## 说明

这个命令实现了 Boris Cherny 第 5 条技巧：Code Review 自动更新规则到 CLAUDE.md，让 AI 越来越懂你的项目。形成知识沉淀的飞轮效应。

## 参数

- `$ARGUMENTS`: 描述发现的问题或规则（可选）

## 工作流程

### 1. 收集信息

如果提供了 `$ARGUMENTS`:
- 解析用户描述的问题或规则

如果没有提供参数:
- 询问用户发现了什么问题
- 或检查最近的 git diff 和 commit 信息
- 或查看是否有 PR review 评论

### 2. 分析问题

判断问题是否值得记录:
- ✅ 会重复出现的模式
- ✅ 项目特定的约定
- ✅ 常见的错误类型
- ❌ 一次性的拼写错误
- ❌ 过于具体的业务逻辑

### 3. 格式化规则

使用统一的格式:

```markdown
### 错误 N: [问题标题]

**场景**: [何时会出现这个问题]

❌ **错误示例**:
\`\`\`typescript
// 错误的代码
\`\`\`

✅ **正确示例**:
\`\`\`typescript
// 正确的代码
\`\`\`

**原因**: [为什么这样做是错误的/正确的]
```

### 4. 定位更新位置

读取 CLAUDE.md，确定规则应该添加到哪个章节:

- 开发规范相关 → `### Development Rules`
- 编码标准相关 → `### Coding Standards`
- TypeScript 相关 → `#### TypeScript Guidelines`
- React 相关 → `#### React Component Guidelines`
- 样式相关 → `#### CSS/SCSS Guidelines`
- 性能相关 → `#### Performance Guidelines`
- 安全相关 → `#### Security Guidelines`
- Z-Index 相关 → `#### Z-Index Management`

如果没有合适的章节，考虑创建新章节或添加到通用的 `### Common Mistakes` 章节。

### 5. 检查重复

确认类似规则是否已存在:
- 如果已存在，询问是否需要补充
- 如果不存在，添加新规则

### 6. 更新文件

使用 Edit 工具更新 CLAUDE.md:
- 保持现有格式
- 在适当位置插入新规则
- 如果需要，创建新章节

### 7. 确认更新

显示更新内容摘要:
```markdown
## 已更新 CLAUDE.md

### 新增规则

**位置**: `### Coding Standards > #### TypeScript Guidelines`

**规则**: 避免在 useEffect 中直接调用异步函数

**示例**:
❌ useEffect(async () => { await fetch(...) }, [])
✅ useEffect(() => { fetchData().catch(console.error) }, [])
```

### 8. 提交并推送到远程仓库

将 CLAUDE.md 的更新提交并推送到远程仓库:

```bash
# 添加 CLAUDE.md 到暂存区
git add CLAUDE.md

# 提交更改
git commit -m "docs(claude): 添加新规则 - [规则名称]"

# 推送到远程仓库
git push
```

**提交信息格式**:
- `docs(claude): 添加新规则 - [规则名称]`
- `docs(claude): 更新规则 - [规则名称]`
- `docs(claude): 删除过时规则 - [规则名称]`

## 示例用法

```bash
# 描述发现的问题
/update-claude-md 发现 Claude 经常忘记给 TDesign 的 Tooltip 添加 theme='light'

# 不带参数，交互式收集
/update-claude-md
```

## 规则分类建议

| 类型 | 示例 | 章节 |
|------|------|------|
| UI 组件 | Tooltip theme | Development Rules |
| 类型定义 | 避免 any | TypeScript Guidelines |
| Hooks 使用 | useEffect 依赖 | React Component Guidelines |
| 样式规范 | BEM 命名 | CSS/SCSS Guidelines |
| 性能优化 | React.memo | Performance Guidelines |
| 安全问题 | XSS 防护 | Security Guidelines |
| 层级管理 | z-index | Z-Index Management |

## 注意事项

- 规则应该简洁明了
- 必须包含错误和正确示例
- 解释原因帮助理解
- 避免过于冗长的描述
- 定期审查并清理过时规则
- 提交前确认规则内容正确无误
