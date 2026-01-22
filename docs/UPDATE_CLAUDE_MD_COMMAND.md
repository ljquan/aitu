# Update CLAUDE.md 命令使用说明

## 概述

`update-claude-md` 是一个 Claude Code 命令，用于智能更新项目文档。遵循 **文档分层策略**，确保 CLAUDE.md 保持精简，详细内容放在专门的文档中。

## 核心原则

**CLAUDE.md 必须保持精简！** 这是 Claude Code 最佳实践的核心要求。

| 文档 | 内容 | 行数限制 |
|------|------|---------|
| `CLAUDE.md` | 核心摘要规则（1-2 句话） | ≤ 300 行 |
| `docs/CODING_RULES.md` | 详细规则 + 错误/正确示例 | 无限制 |
| `docs/FEATURE_FLOWS.md` | 功能流程说明 | 无限制 |

## 使用方法

### 基本用法

```bash
# 添加新规则
/update-claude-md 发现 Claude 经常忘记给 TDesign 的 Tooltip 添加 theme='light'

# 交互式
/update-claude-md
```

### 适用场景

1. **发现编码错误模式** → 更新 `docs/CODING_RULES.md`
2. **添加新功能流程** → 更新 `docs/FEATURE_FLOWS.md`
3. **高频/严重问题** → 同时更新 CLAUDE.md 摘要

## 命令执行流程

### 1. 判断规则重要性

```
发现问题
    ↓
是否高频/严重？ ──否──→ 只更新 CODING_RULES.md
    ↓ 是
CLAUDE.md < 280 行？ ──否──→ 先清理，再添加摘要
    ↓ 是
添加到 CLAUDE.md 摘要 + CODING_RULES.md 详情
```

### 2. 更新详细文档（主要操作）

在 `docs/CODING_RULES.md` 添加完整规则：

```markdown
### [问题标题]

**场景**: [何时会出现这个问题]

❌ **错误示例**:
```typescript
// 错误的代码
```

✅ **正确示例**:
```typescript
// 正确的代码
```

**原因**: [为什么这样做是错误的/正确的]
```

### 3. 更新 CLAUDE.md（仅高优先级）

只添加 1-2 句话的摘要：

```markdown
N. **规则名称**：简短描述（1-2 句话）
```

## 规则分类

| 类型 | 详细文档章节 | CLAUDE.md 章节 |
|------|-------------|---------------|
| TypeScript | `### TypeScript 规范` | `### 必须遵守` |
| React | `### React 组件规范` | `### React 规则` |
| Service Worker | `### Service Worker 规范` | `### Service Worker 规则` |
| 缓存 | `### 缓存与存储规范` | `### 缓存规则` |
| UI | `### UI 交互规范` | - |
| API | `### API 与任务处理规范` | - |

## 示例

### 示例 1：添加普通规则

**输入：**
```
/update-claude-md 发现滑块拖动时应该用 throttle 而不是 debounce
```

**结果：**
- ✅ `docs/CODING_RULES.md` 添加详细规则 + 示例
- ❌ CLAUDE.md 不更新（非高频问题）

### 示例 2：添加高优先级规则

**输入：**
```
/update-claude-md 发现 Context 回调中必须使用函数式更新，否则会导致状态错误
```

**结果：**
- ✅ `docs/CODING_RULES.md` 添加详细规则 + 示例
- ✅ CLAUDE.md 添加摘要：`Context 回调中必须使用函数式更新`

## 定期清理

当 CLAUDE.md 接近 300 行时：

1. **合并相似规则**：将多条相关规则合并为一条
2. **移除过时规则**：删除不再适用的规则
3. **降级详细规则**：将过于详细的规则移到 CODING_RULES.md

## 注意事项

1. **CLAUDE.md 必须精简**
   - 行数限制 300 行
   - 每条规则 1-2 句话
   - 详细示例放在 CODING_RULES.md

2. **优先更新详细文档**
   - 大多数规则只需更新 CODING_RULES.md
   - 只有高频/严重问题才更新 CLAUDE.md

3. **检查重复**
   - 避免添加已有类似规则
   - 考虑补充现有规则而非新增

4. **及时清理**
   - 定期审查并清理过时规则
   - 合并相似规则

## 相关文件

- `.claude/commands/update-claude-md.md` - 命令定义文件
- `CLAUDE.md` - 项目核心文档（精简版）
- `docs/CODING_RULES.md` - 详细编码规则
- `docs/FEATURE_FLOWS.md` - 功能流程说明
- `docs/CONCEPTS.md` - 核心术语定义

## 常见问题

**Q: 什么规则应该放在 CLAUDE.md？**
A: 只有高频出现或会导致严重 bug 的规则才放入 CLAUDE.md，且只保留 1-2 句摘要。

**Q: CLAUDE.md 超过 300 行怎么办？**
A: 先执行清理：合并相似规则、移除过时规则、将详细规则降级到 CODING_RULES.md。

**Q: 详细的错误/正确示例放在哪？**
A: 放在 `docs/CODING_RULES.md`，CLAUDE.md 中只放简短摘要。

**Q: 如何判断规则是否"高频"？**
A: 如果同类问题在过去一周内出现 3 次以上，或者会导致生产 bug，就是高频。
