# 需求文档：Skill 统一执行路径

## 引言

当前系统存在两个问题：

1. **系统 Skill 与用户自定义 Skill 执行路径不统一**：系统 Skill 通过 `mcpTool` 字段硬编码工具名直接执行，而用户从知识库复制系统 Skill 创建的自定义 Skill 走的是另一套解析路径，导致复制后的 Skill 行为与原始系统 Skill 不一致。

2. **角色扮演类 Skill 上下文错误**：选择「产品经理」等角色扮演 Skill 时，系统仍然注入了全量 MCP 工具描述（约 46KB）作为 systemPrompt，而非使用 Skill 笔记本身的角色提示词。

**目标**：统一系统 Skill 和用户自定义 Skill 的执行路径，通过对 Skill 笔记内容的自动分析来决定执行策略，无需任何额外字段标记（移除 `agentMode`）。

---

## 执行路径决策逻辑

```
Skill 笔记内容
    │
    ├─ 正则解析成功（能提取出工具名 + 参数）
    │       └─ 路径 A：直接执行 MCP 工具（DSL 模式）
    │
    └─ 正则解析失败
            │
            ├─ 笔记中包含工具名引用（如 "调用 xxx"、"generate_xxx"）
            │       └─ 路径 B：Agent 模式，只注入相关工具描述 + Skill 笔记作为前置上下文
            │
            └─ 笔记中无工具名引用
                    └─ 路径 C：角色扮演模式，Skill 笔记作为 systemPrompt，用户输入作为 userMessage，直接调用 LLM
```

---

## 需求

### 需求 1：统一 Skill 执行入口，移除 `agentMode` 字段

**用户故事：** 作为用户，我希望从知识库复制系统 Skill 后创建的自定义 Skill 能达到与系统 Skill 完全相同的效果，以便自定义 Skill 能正常工作。

#### 验收标准

1. WHEN 用户选择任意 Skill（系统或自定义）并提交 THEN 系统 SHALL 统一通过解析 Skill 笔记内容（`description`）来决定执行路径，而非依赖 `mcpTool` 或 `agentMode` 字段
2. WHEN 系统 Skill 的 `description` 中包含完整的工作流描述（如"调用 generate_grid_image"）THEN 系统 SHALL 能正确解析并执行，与用户自定义 Skill 行为一致
3. WHEN 移除 `agentMode` 字段后 THEN 系统 SHALL 通过"正则解析失败 + 无工具名"自动识别角色扮演类 Skill

---

### 需求 2：路径 A —— DSL 正则解析直接执行 MCP 工具

**用户故事：** 作为用户，我希望包含明确工具调用指令的 Skill（如宫格图、灵感图）能被直接解析执行，以便快速生成图片内容。

#### 验收标准

1. WHEN Skill 笔记内容能被正则解析器成功提取出工具名和参数 THEN 系统 SHALL 直接构建 WorkflowStep 执行该 MCP 工具（路径 A）
2. WHEN 路径 A 执行时 THEN 系统 SHALL 将用户输入自动注入到工具的主要文本参数（如 `theme`、`prompt`）
3. WHEN 系统 Skill 和用户自定义 Skill 的笔记内容相同时 THEN 系统 SHALL 产生完全相同的执行结果

---

### 需求 3：路径 B —— Agent 模式，精准注入相关工具描述

**用户故事：** 作为用户，我希望工具类 Skill 在走 Agent 降级路径时，系统提示词只包含 Skill 笔记中实际引用的 MCP 工具描述，以便减少无关上下文干扰。

#### 验收标准

1. WHEN 正则解析失败且 Skill 笔记中包含工具名引用 THEN 系统 SHALL 从笔记中提取工具名（匹配 `调用 xxx`、`generate_xxx`、`mcp: xxx` 等模式）
2. WHEN 提取到工具名列表 THEN 系统 SHALL 只将这些工具的描述注入到 systemPrompt，而非全量工具列表
3. WHEN 构建 systemPrompt 时 THEN 系统 SHALL 将 Skill 笔记内容放在工具描述之前作为优先上下文
4. IF Skill 笔记中未匹配到任何工具名 THEN 系统 SHALL 降级为路径 C（角色扮演模式）

---

### 需求 4：路径 C —— 角色扮演模式，Skill 笔记作为 systemPrompt

**用户故事：** 作为用户，我希望选择「产品经理」等角色扮演 Skill 后，AI 能以该角色身份直接回复，而不是走图片/视频生成的 Agent 流程。

#### 验收标准

1. WHEN 正则解析失败且 Skill 笔记中无工具名引用 THEN 系统 SHALL 使用 Skill 笔记内容（`description`）作为 systemPrompt，用户输入作为 userMessage，直接调用 LLM（不经过 Agent 工具循环）
2. WHEN 构建 messages 时 THEN 系统 SHALL 不包含任何 MCP 工具描述
3. WHEN LLM 返回文本响应 THEN 系统 SHALL 将文本内容插入画布（与现有文本插入逻辑一致）
4. WHEN 移除 `agentMode` 字段后 THEN 系统 SHALL 从 `skills.ts` 中删除 `agentMode` 相关代码，「产品经理」Skill 通过路径 C 自动识别执行
