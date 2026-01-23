# Update CLAUDE.md

分析代码审查反馈或开发过程中发现的问题，提取通用规则并更新文档。

## 核心原则

**CLAUDE.md 必须保持精简！** 这是 Claude Code 最佳实践的核心要求。

- **CLAUDE.md 行数上限**：300 行（当前约 224 行）
- **核心规则上限**：20 条摘要规则
- **详细规则放在**：`docs/CODING_RULES.md`

## 文档分层策略

| 文档 | 内容 | 行数限制 |
|------|------|---------|
| `CLAUDE.md` | 核心摘要规则（1-2 句话） | ≤ 300 行 |
| `docs/CODING_RULES.md` | 详细规则 + 错误/正确示例 | 无限制 |
| `docs/FEATURE_FLOWS.md` | 功能流程说明 | 无限制 |

## 参数

- `$ARGUMENTS`: 描述发现的问题或规则（可选）

## 工作流程

### 1. 收集信息

如果提供了 `$ARGUMENTS`:
- 解析用户描述的问题或规则

如果没有提供参数:
- 询问用户发现了什么问题
- 或检查最近的 git diff 和 commit 信息

### 2. 判断规则重要性

**高优先级（放入 CLAUDE.md 摘要）**:
- ✅ 高频出现的错误模式
- ✅ 会导致严重 bug 的问题
- ✅ 项目核心约定

**普通优先级（只放 CODING_RULES.md）**:
- 📝 偶尔出现的问题
- 📝 特定场景的细节规则
- 📝 详细的代码示例

**不记录**:
- ❌ 一次性的拼写错误
- ❌ 过于具体的业务逻辑
- ❌ 已有类似规则覆盖

### 3. 检查文档状态

```bash
# 检查 CLAUDE.md 当前行数
wc -l CLAUDE.md

# 如果超过 250 行，先进行清理
# 提示用户是否有可以移除或合并的规则
```

### 4. 更新 docs/CODING_RULES.md（主要更新位置）

使用详细格式添加到对应章节：

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

**章节分类**：
- TypeScript 相关 → `### TypeScript 规范`
- React 相关 → `### React 组件规范`
- Service Worker → `### Service Worker 规范`
- 缓存相关 → `### 缓存与存储规范`
- API 相关 → `### API 与任务处理规范`
- UI 相关 → `### UI 交互规范`

### 5. 更新 CLAUDE.md（仅高优先级规则）

**只添加 1-2 句话的摘要**，格式：

```markdown
N. **规则名称**：简短描述（1-2 句话）
```

例如：
```markdown
8. **定时器清理**：`setInterval` 必须保存 ID，提供 `destroy()` 方法
```

**添加位置**：`## 核心编码规则` 章节的对应子节

### 6. 检查重复

- 检查 CLAUDE.md 和 CODING_RULES.md 是否已有类似规则
- 如果已存在，考虑补充而非新增
- 避免规则重复造成文档膨胀

### 7. 确认更新

显示更新摘要：

```markdown
## 文档更新完成

### docs/CODING_RULES.md
- **位置**: `### React 组件规范`
- **新增**: 避免在 useEffect 中直接调用异步函数
- **包含**: 错误示例 + 正确示例 + 原因说明

### CLAUDE.md（可选）
- **位置**: `### React 规则`
- **新增摘要**: Context 回调中必须使用函数式更新

### 文档状态
- CLAUDE.md: 224 行 (限制 300 行) ✅
- CODING_RULES.md: 3780 行
```

### 8. 提交更新

```bash
# 添加更新的文件
git add CLAUDE.md docs/CODING_RULES.md

# 提交
git commit -m "docs: 添加编码规则 - [规则名称]"

# 推送
git push
```

## 定期清理检查

当 CLAUDE.md 接近 300 行时，执行清理：

1. **合并相似规则**：将多条相关规则合并为一条
2. **移除过时规则**：删除不再适用的规则
3. **降级详细规则**：将过于详细的规则移到 CODING_RULES.md
4. **更新引用**：确保 CLAUDE.md 正确引用详细文档

## 示例用法

```bash
# 添加新规则
/update-claude-md 发现 Claude 经常忘记给 TDesign 的 Tooltip 添加 theme='light'

# 交互式
/update-claude-md
```

## 快速判断流程图

```
发现问题
    ↓
是否高频/严重？ ──否──→ 只更新 CODING_RULES.md
    ↓ 是
CLAUDE.md < 280 行？ ──否──→ 先清理，再添加摘要
    ↓ 是
添加到 CLAUDE.md 摘要 + CODING_RULES.md 详情
```

## 注意事项

- **CLAUDE.md 必须保持精简**：这是最重要的原则
- 详细示例只放在 CODING_RULES.md
- 摘要规则控制在 1-2 句话
- 定期审查并清理过时规则
- 优先合并相似规则而非新增
