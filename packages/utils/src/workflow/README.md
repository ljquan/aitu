# Workflow Utilities

AI Agent 工作流核心工具库，提供响应解析、防护机制和状态管理能力。

## 目录

- [代码结构](#代码结构)
- [阅读顺序](#阅读顺序)
- [核心数据结构](#核心数据结构)
- [设计原理](#设计原理)
- [核心组件](#核心组件)
- [工作流程](#工作流程)
- [使用指南](#使用指南)
- [API 参考](#api-参考)
- [最佳实践](#最佳实践)

---

## 代码结构

```
workflow/
├── index.ts              # 模块入口，统一导出所有 API
├── types.ts              # 通用类型定义（步骤状态、配置等）
├── parser.ts             # LLM 响应解析（核心数据结构定义）
├── utils.ts              # 工作流状态管理工具函数
├── recursion-guard.ts    # 递归深度保护
├── loop-detector.ts      # 循环检测（最复杂的组件）
├── workflow-guard.ts     # 组合防护（整合 recursion + loop）
├── README.md             # 本文档
└── *.test.ts             # 单元测试文件
```

### 文件职责说明

| 文件 | 职责 | 核心导出 |
|------|------|---------|
| `parser.ts` | 解析 AI 响应，提取工具调用 | `WorkflowJsonResponse`, `ToolCall`, `parseWorkflowJson()` |
| `types.ts` | 通用类型和默认配置 | `StepStatus`, `WorkflowConfig`, `DEFAULT_*` |
| `utils.ts` | 不可变状态更新函数 | `updateStepStatus()`, `getWorkflowStatus()` |
| `recursion-guard.ts` | 限制执行深度 | `RecursionGuard` |
| `loop-detector.ts` | 检测重复模式 | `LoopDetector` |
| `workflow-guard.ts` | 组合防护机制 | `WorkflowGuard` |

### 依赖关系

```
                    index.ts（统一导出）
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
   parser.ts         types.ts         utils.ts
        │                │
        │    ┌───────────┴───────────┐
        │    │                       │
        ▼    ▼                       ▼
  workflow-guard.ts          (独立使用)
        │
   ┌────┴────┐
   │         │
   ▼         ▼
recursion-   loop-
guard.ts     detector.ts
```

---

## 阅读顺序

根据你的目标选择阅读路径：

### 路径 A：快速上手（推荐新手）

1. **`parser.ts`** → 理解 `WorkflowJsonResponse` 结构
2. **本文档的"使用指南"** → 了解基本用法
3. **`parser.test.ts`** → 通过测试用例理解边界情况

### 路径 B：理解防护机制

1. **`types.ts`** → 熟悉配置类型和默认值
2. **`recursion-guard.ts`** → 最简单的防护，理解基本模式
3. **`loop-detector.ts`** → 复杂的循环检测逻辑
4. **`workflow-guard.ts`** → 组合使用两种防护

### 路径 C：深入状态管理

1. **`types.ts`** → 理解 `StepStatus`、`SystemStatus`
2. **`utils.ts`** → 学习不可变更新模式
3. **`utils.test.ts`** → 通过测试理解各种状态转换

### 路径 D：完整架构理解

按以下顺序阅读全部代码：

```
1. types.ts          ← 基础类型
2. parser.ts         ← 核心数据结构
3. utils.ts          ← 状态管理
4. recursion-guard.ts
5. loop-detector.ts
6. workflow-guard.ts ← 组合防护
7. index.ts          ← 导出结构
```

### 关键概念速查

| 概念 | 文件位置 | 说明 |
|------|----------|------|
| `ToolCall` | parser.ts:L15-22 | 解析后的工具调用 |
| `WorkflowJsonResponse` | parser.ts:L38-48 | AI 响应的核心格式 |
| `ToolExecutionResult` | parser.ts:L73-90 | 工具执行返回，支持递归 |
| `WorkflowContext` | parser.ts:L98-115 | 执行上下文，累积传递 |
| `RecursionGuard` | recursion-guard.ts | 深度限制 |
| `LoopDetector` | loop-detector.ts | 循环模式检测 |
| `WorkflowGuard` | workflow-guard.ts | 组合防护 |

---

## 核心数据结构

### WorkflowJsonResponse

这是 AI 工作流的核心数据结构，定义了 AI 响应的标准格式：

```typescript
interface WorkflowJsonResponse {
  /** AI 分析文本内容 */
  content: string;
  /** 要执行的工具调用列表 */
  next: Array<{
    /** MCP 工具名称 */
    mcp: string;
    /** 工具参数 */
    args: Record<string, unknown>;
  }>;
}
```

**示例响应**：

```json
{
  "content": "我将为您生成一张猫的图片和一个视频。",
  "next": [
    {
      "mcp": "generate_image",
      "args": { "prompt": "一只可爱的橘猫", "size": "1024x1024" }
    },
    {
      "mcp": "generate_video",
      "args": { "prompt": "猫在玩毛线球", "duration": "5s" }
    }
  ]
}
```

### 为什么使用这种格式？

1. **结构化输出**：AI 的响应被结构化为明确的字段，便于解析和处理
2. **内容与动作分离**：`content` 包含给用户的说明，`next` 包含要执行的动作
3. **批量操作**：`next` 数组支持一次性返回多个工具调用
4. **可扩展性**：`args` 字段支持任意参数结构

### 工作流执行模型

工作流支持**递归执行**：每个工具调用的返回值如果是一个新的 `WorkflowJsonResponse`，则会继续执行该工作流。

```
用户输入
    │
    ▼
┌─────────────────┐
│    AI 分析      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  WorkflowJsonResponse           │
│  {                              │
│    "content": "分析结果...",    │
│    "next": [                    │
│      { "mcp": "tool1", ... },   │
│      { "mcp": "tool2", ... }    │
│    ]                            │
│  }                              │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────┐
│  解析响应       │
│  parseToolCalls │
└────────┬────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│  执行工具调用（带上下文）                │
│  for each call:                          │
│    result = executeTool(call, context)   │
│    context.results.push(result)          │
│                                          │
│    if (result.nextWorkflow) {            │
│      // 递归执行返回的工作流             │
│      executeWorkflow(result.nextWorkflow)│
│    }                                     │
└────────┬─────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  返回最终结果   │
└─────────────────┘
```

### 递归调用机制

工具执行返回 `ToolExecutionResult`，其中：
- `data`：工具执行的直接结果
- `context`：要传递给后续调用的上下文信息
- `nextWorkflow`：如果不为 null，则继续执行该工作流

```typescript
interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** 返回新的工作流，触发递归执行 */
  nextWorkflow?: WorkflowJsonResponse | null;
  /** 传递给后续调用的上下文 */
  context?: Record<string, unknown>;
}
```

**递归执行示例**：

```
第1层: AI 返回 { next: [{ mcp: "analyze" }] }
       │
       ▼
       执行 analyze 工具
       │
       └── 返回 { nextWorkflow: { next: [{ mcp: "generate_image" }] } }
           │
           ▼
           第2层: 执行 generate_image 工具
           │
           └── 返回 { data: { url: "..." }, nextWorkflow: null }
               │
               ▼
               结束（nextWorkflow 为 null）
```

### 上下文传递

`WorkflowContext` 在整个执行链中累积和传递：

```typescript
interface WorkflowContext {
  executionId: string;           // 执行 ID
  depth: number;                 // 当前递归深度
  maxDepth: number;              // 最大允许深度
  results: Array<{               // 历史执行结果
    toolName: string;
    result: unknown;
    timestamp: number;
  }>;
  sharedData: Record<string, unknown>;  // 共享数据
  parent?: WorkflowContext;      // 父级上下文（嵌套时）
}
```

**上下文流动示例**：

```
Tool A 执行
│
├── 读取 context.sharedData
├── 执行业务逻辑
└── 返回 { context: { resultA: "..." } }
    │
    ▼
    context.sharedData.resultA = "..."
    context.results.push({ toolName: "A", ... })
    │
    ▼
Tool B 执行
│
├── 读取 context.sharedData.resultA  ← 可以访问 Tool A 的结果
├── 执行业务逻辑
└── 返回 { context: { resultB: "..." } }
```

---

## 设计原理

### 问题背景

在 AI Agent 工作流中，大语言模型可能会：
1. **无限递归**：反复调用相同的工具，无法终止
2. **循环调用**：在多个工具之间来回切换（A→B→A→B）
3. **相似重复**：用略微不同的参数反复尝试同一操作

这些问题会导致资源浪费、用户体验差、甚至系统崩溃。

### 解决方案

本库提供三层防护机制：

```
┌─────────────────────────────────────────────────────┐
│                  WorkflowGuard                       │
│  ┌─────────────────┐    ┌─────────────────────────┐ │
│  │ RecursionGuard  │    │     LoopDetector        │ │
│  │                 │    │                         │ │
│  │ • 迭代计数      │    │ • 精确重复检测          │ │
│  │ • 分级警告      │    │ • 相似重复检测          │ │
│  │ • 强制终止      │    │ • 振荡模式检测          │ │
│  │                 │    │ • 周期模式检测          │ │
│  └─────────────────┘    └─────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 核心理念

1. **分级预警**：不是直接终止，而是先警告，让 AI 有机会自我修正
2. **多维检测**：同时检测递归深度和调用模式，避免漏检
3. **提示词注入**：将警告信息注入到 AI 的提示词中，引导其正确决策
4. **框架无关**：纯 TypeScript 实现，可用于任何工作流系统

---

## 核心组件

### 1. Parser（响应解析器）

解析 AI 响应，提取工具调用和文本内容。

**支持的响应格式**：

| 格式 | 示例 | 优先级 |
|------|------|--------|
| Workflow JSON | `{"content": "...", "next": [...]}` | 最高 |
| Tool Call Block | ` ```tool_call\n{...}\n``` ` | 中 |
| JSON Block | ` ```json\n{...}\n``` ` | 中 |
| XML Tag | `<tool_call>{...}</tool_call>` | 低 |

**解析流程**：
```
原始响应
    │
    ▼
cleanLLMResponse()  ←── 移除 <think> 标签、代码块标记
    │
    ▼
parseWorkflowJson() ←── 尝试解析标准工作流格式
    │
    ├── 成功 ──→ 返回 WorkflowJsonResponse
    │
    └── 失败 ──→ parseToolCalls() ←── 尝试解析遗留格式
                      │
                      └── 返回 ToolCall[]
```

### 2. RecursionGuard（递归守卫）

监控工作流迭代次数，提供分级警告和强制终止机制。

**阈值设计**：
```
迭代次数: 0 ──────────────────────────────────────> 20
           │         │              │              │
           │  正常   │   警告区     │   软限制    │ 硬限制
           │         │              │              │
           0        10             15             20
```

- **警告阈值 (10)**：提醒 AI 注意迭代次数
- **软限制 (15)**：强烈建议终止，要求 AI 评估是否应该继续
- **硬限制 (20)**：强制终止，无论 AI 意图如何

### 2. LoopDetector（循环检测器）

基于滑动窗口检测重复调用模式，支持 4 种检测类型：

| 类型 | 模式示例 | 说明 |
|------|----------|------|
| EXACT | A→A→A | 完全相同的调用（工具名+参数） |
| SIMILAR | A(1)→A(2)→A(3) | 同一工具，参数高度相似 |
| OSCILLATING | A→B→A→B | 两个工具来回切换 |
| PERIODIC | A→B→C→A→B→C | 固定周期的调用序列 |

**检测算法**：
```
滑动窗口（默认 10 次调用）
    │
    ├─→ 计算调用签名（工具名 + 参数哈希）
    │
    ├─→ 精确重复检测：连续 N 次相同签名
    │
    ├─→ 相似度计算：比较相邻调用的参数相似度
    │
    └─→ 模式匹配：检测 A-B-A-B 或 A-B-C-A-B-C 模式
```

### 3. WorkflowGuard（综合防护）

组合递归守卫和循环检测器，提供统一接口：

- 自动管理执行上下文
- 生成综合检查结果
- 提供提示词注入内容
- 生成执行摘要报告

---

## 工作流程

### 典型使用流程

```
┌─────────────────┐
│   开始工作流     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ guard.startIteration()
│ 检查是否允许继续 │
└────────┬────────┘
         │
    ┌────┴────┐
    │ 允许?   │
    └────┬────┘
    Yes  │  No
    │    │
    │    └──────────────────────┐
    ▼                           ▼
┌─────────────────┐    ┌─────────────────┐
│   执行 AI 调用   │    │   终止工作流     │
└────────┬────────┘    │   返回当前结果   │
         │              └─────────────────┘
         ▼
┌─────────────────┐
│   解析工具调用   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ guard.recordToolCall()
│   记录调用历史   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   执行工具      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 检查工具结果    │
│ 是否应该终止?   │
└────────┬────────┘
         │
    ┌────┴────┐
    │继续?    │
    └────┬────┘
    Yes  │  No
    │    │
    │    └──────────────────────┐
    ▼                           ▼
┌─────────────────┐    ┌─────────────────┐
│  下一次迭代     │    │   完成工作流     │
│  (回到开始)     │    └─────────────────┘
└─────────────────┘
```

### 提示词注入流程

当检测到警告或循环时，`generatePromptInjection()` 会生成警告信息：

```
┌─────────────────────────────────────────────────────┐
│ ## 🔄 Workflow Status                               │
│ Iteration Progress: [████████████░░░░░░░░] 12/20   │
│                                                     │
│ ⚠️ [Iteration Warning] Current iteration: 12,      │
│ remaining: 8. Please check if the task can be      │
│ completed, avoid unnecessary repeated calls.       │
│                                                     │
│ ## 🔁 Loop Detection Warning                        │
│ Oscillating pattern detected: tools switching      │
│ between "generate_image" and "check_result"        │
│                                                     │
│ ⚠️ Please check immediately and take action...     │
└─────────────────────────────────────────────────────┘
```

将此内容追加到 AI 的系统提示词中，引导其做出正确决策。

---

## 使用指南

### 安装

```typescript
import {
  // 响应解析
  parseWorkflowJson,
  parseToolCalls,
  extractTextContent,
  hasToolCalls,
  createWorkflowResponse,
  cleanLLMResponse,
  // 防护机制
  WorkflowGuard,
  RecursionGuard,
  LoopDetector,
  // 状态管理
  updateStepStatus,
  getWorkflowStatus,
  addStepsToWorkflow,
  // 类型
  type WorkflowJsonResponse,
  type ToolCall,
  LoopType,
  StepStatus,
} from '@aitu/utils';
```

### 解析 AI 响应（核心用法）

```typescript
// AI 返回的原始响应
const aiResponse = `
<think>用户想要生成一张图片...</think>
\`\`\`json
{
  "content": "我将为您生成一张可爱的猫咪图片。",
  "next": [
    {"mcp": "generate_image", "args": {"prompt": "cute cat", "size": "1024x1024"}}
  ]
}
\`\`\`
`;

// 方式1：解析完整工作流响应
const workflow = parseWorkflowJson(aiResponse);
if (workflow) {
  console.log('AI 说:', workflow.content);
  console.log('要执行的工具:', workflow.next);
}

// 方式2：直接获取工具调用
const toolCalls = parseToolCalls(aiResponse);
for (const call of toolCalls) {
  console.log(`执行 ${call.name}:`, call.arguments);
  await executeTool(call.name, call.arguments);
}

// 方式3：只提取文本内容
const text = extractTextContent(aiResponse);
console.log('给用户显示:', text);

// 方式4：检查是否有工具调用
if (hasToolCalls(aiResponse)) {
  // 进入工具执行流程
} else {
  // 只显示文本响应
}
```

### 创建工作流响应

```typescript
// 在 AI 系统提示词中定义输出格式
const workflow = createWorkflowResponse(
  '我将为您生成图片和视频。',
  [
    { mcp: 'generate_image', args: { prompt: 'cat' } },
    { mcp: 'generate_video', args: { prompt: 'dog' } },
  ]
);

// 序列化为 JSON 字符串（用于发送给 AI 作为示例）
const jsonStr = serializeWorkflowResponse(workflow);
// {"content":"我将为您生成图片和视频。","next":[...]}
```

### 递归执行工作流

```typescript
import {
  parseWorkflowJson,
  type WorkflowJsonResponse,
  type WorkflowContext,
  type ToolExecutionResult,
} from '@aitu/utils';

// 创建执行上下文
function createContext(parentContext?: WorkflowContext): WorkflowContext {
  return {
    executionId: `exec_${Date.now()}`,
    depth: parentContext ? parentContext.depth + 1 : 0,
    maxDepth: 10,
    results: [],
    sharedData: parentContext?.sharedData ?? {},
    parent: parentContext,
  };
}

// 递归执行工作流
async function executeWorkflow(
  workflow: WorkflowJsonResponse,
  context: WorkflowContext
): Promise<unknown[]> {
  // 检查递归深度
  if (context.depth >= context.maxDepth) {
    throw new Error(`Maximum recursion depth ${context.maxDepth} exceeded`);
  }

  const results: unknown[] = [];

  for (const call of workflow.next) {
    // 执行工具，传入上下文
    const result: ToolExecutionResult = await executeTool(
      call.mcp,
      call.args,
      context
    );

    // 记录结果到上下文
    context.results.push({
      toolName: call.mcp,
      result: result.data,
      timestamp: Date.now(),
    });

    // 合并返回的上下文
    if (result.context) {
      Object.assign(context.sharedData, result.context);
    }

    results.push(result.data);

    // 如果返回了新的工作流，递归执行
    if (result.nextWorkflow) {
      const childContext = createContext(context);
      const childResults = await executeWorkflow(
        result.nextWorkflow,
        childContext
      );
      results.push(...childResults);
    }
  }

  return results;
}

// 工具执行示例
async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  context: WorkflowContext
): Promise<ToolExecutionResult> {
  // 可以从上下文读取之前的结果
  const previousResults = context.results;
  const sharedData = context.sharedData;

  // 执行工具逻辑...
  const data = await performToolAction(toolName, args);

  // 返回结果，可以包含新的工作流
  return {
    success: true,
    data,
    // 传递上下文给后续调用
    context: { [`${toolName}_result`]: data },
    // 如果需要继续执行，返回新的工作流
    nextWorkflow: needsContinuation(data) 
      ? { content: '继续处理', next: [...] }
      : null,
  };
}

// 使用示例
const aiResponse = '{"content": "开始分析", "next": [{"mcp": "analyze", "args": {}}]}';
const workflow = parseWorkflowJson(aiResponse);

if (workflow) {
  const context = createContext();
  const results = await executeWorkflow(workflow, context);
  console.log('执行完成，结果:', results);
  console.log('上下文数据:', context.sharedData);
}
```

### 基础用法

```typescript
// 1. 创建防护实例
const guard = new WorkflowGuard({
  recursion: {
    maxIterations: 20,
    warningThreshold: 10,
    softLimit: 15,
    hardLimit: 20,
  },
  loopDetection: {
    windowSize: 10,
    repeatThreshold: 3,
    similarityThreshold: 0.9,
    enablePatternDetection: true,
  },
});

// 2. 工作流主循环
async function runWorkflow() {
  while (true) {
    // 开始新迭代
    const check = guard.startIteration();
    
    // 检查是否应该终止
    if (!check.allowContinue) {
      console.log('工作流终止:', check.forceTerminateReason);
      break;
    }
    
    // 获取提示词注入（如果有警告）
    const injection = guard.generatePromptInjection();
    const systemPrompt = injection 
      ? baseSystemPrompt + injection 
      : baseSystemPrompt;
    
    // 调用 AI
    const response = await callAI(systemPrompt, userMessage);
    
    // 解析并执行工具调用
    const toolCalls = parseToolCalls(response);
    for (const call of toolCalls) {
      // 记录工具调用
      guard.recordToolCall(call.name, call.args);
      
      // 执行工具
      const result = await executeTool(call.name, call.args);
      
      // 检查是否应该终止
      if (result.shouldTerminate) {
        guard.terminate(result.reason);
        return result;
      }
    }
    
    // 检查循环
    const loopCheck = guard.check();
    if (loopCheck.loopCheck.loopDetected) {
      console.log('检测到循环:', loopCheck.loopCheck.description);
      break;
    }
  }
  
  // 生成执行摘要
  console.log(guard.generateSummary());
}
```

### 单独使用 RecursionGuard

```typescript
const recursionGuard = new RecursionGuard({
  warningThreshold: 5,
  softLimit: 8,
  hardLimit: 10,
});

for (let i = 0; i < 15; i++) {
  const result = recursionGuard.increment();
  
  if (result.isHardLimit) {
    console.log('达到硬限制，强制终止');
    break;
  }
  
  if (result.isSoftLimit) {
    console.log('接近限制，建议终止');
  }
  
  if (result.isWarning) {
    console.log('警告:', result.warningMessage);
  }
}
```

### 单独使用 LoopDetector

```typescript
const loopDetector = new LoopDetector({
  repeatThreshold: 3,
  enablePatternDetection: true,
});

// 记录调用
loopDetector.recordCall('generate_image', { prompt: 'a cat' });
loopDetector.recordCall('generate_image', { prompt: 'a cat' });
loopDetector.recordCall('generate_image', { prompt: 'a cat' });

// 检测循环
const result = loopDetector.detect();
if (result.loopDetected) {
  console.log('循环类型:', result.loopType);      // 'exact'
  console.log('涉及工具:', result.involvedTools); // ['generate_image']
  console.log('建议:', result.suggestion);
}
```

### 工作流状态管理

```typescript
import {
  updateStepStatus,
  addStepsToWorkflow,
  getWorkflowStatus,
  isWorkflowComplete,
  getWorkflowProgress,
} from '@aitu/utils';

// 定义工作流
const workflow = {
  id: 'wf-123',
  steps: [
    { id: 'step-1', status: 'pending' },
    { id: 'step-2', status: 'pending' },
    { id: 'step-3', status: 'pending' },
  ],
};

// 更新步骤状态
let updated = updateStepStatus(workflow, 'step-1', 'running');
updated = updateStepStatus(updated, 'step-1', 'completed', { result: 'done' });

// 添加新步骤（自动去重）
updated = addStepsToWorkflow(updated, [
  { id: 'step-4', status: 'pending' },
]);

// 获取状态摘要
const status = getWorkflowStatus(updated);
console.log(status.status);        // 'running'
console.log(status.completedSteps); // 1
console.log(status.totalSteps);     // 4

// 检查进度
console.log(getWorkflowProgress(updated)); // 25
console.log(isWorkflowComplete(updated));  // false
```

---

## API 参考

### Parser（响应解析）

| 函数 | 说明 |
|------|------|
| `parseWorkflowJson(response)` | 解析标准工作流 JSON 格式，返回 `WorkflowJsonResponse \| null` |
| `parseToolCalls(response)` | 解析所有格式的工具调用，返回 `ToolCall[]` |
| `extractTextContent(response)` | 提取文本内容（优先使用 content 字段） |
| `hasToolCalls(response)` | 检查响应中是否包含工具调用 |
| `parseWorkflowResponse(response)` | 完整解析，返回 `WorkflowParseResult` |
| `cleanLLMResponse(response)` | 清理响应（移除 think 标签、代码块标记） |
| `createWorkflowResponse(content, toolCalls)` | 创建工作流响应对象 |
| `serializeWorkflowResponse(workflow)` | 序列化为 JSON 字符串 |

**类型定义**：

```typescript
interface ToolCall {
  id: string;                      // 唯一 ID
  name: string;                    // 工具名称
  arguments: Record<string, unknown>; // 工具参数
}

interface WorkflowJsonResponse {
  content: string;                 // AI 分析内容
  next: Array<{                    // 工具调用列表
    mcp: string;
    args: Record<string, unknown>;
  }>;
}

interface WorkflowParseResult {
  success: boolean;                // 是否解析成功
  workflow: WorkflowJsonResponse | null;
  toolCalls: ToolCall[];
  textContent: string;
  cleanedResponse: string;
}

interface ToolExecutionResult {
  success: boolean;                // 执行是否成功
  data?: unknown;                  // 执行结果数据
  error?: string;                  // 错误信息
  nextWorkflow?: WorkflowJsonResponse | null;  // 递归执行的下一个工作流
  context?: Record<string, unknown>;           // 传递给后续调用的上下文
}

interface WorkflowContext {
  executionId: string;             // 执行 ID
  depth: number;                   // 当前递归深度
  maxDepth: number;                // 最大允许深度
  results: Array<{                 // 历史执行结果
    toolName: string;
    result: unknown;
    timestamp: number;
  }>;
  sharedData: Record<string, unknown>;  // 共享数据
  parent?: WorkflowContext;        // 父级上下文
}
```

### WorkflowGuard

| 方法 | 说明 |
|------|------|
| `startIteration()` | 开始新迭代，返回检查结果 |
| `recordToolCall(name, args)` | 记录工具调用 |
| `check()` | 检查当前状态（不增加迭代计数） |
| `terminate(reason)` | 标记工作流终止 |
| `reset()` | 重置所有状态 |
| `getContext()` | 获取执行上下文 |
| `getCallHistory()` | 获取调用历史 |
| `generatePromptInjection()` | 生成提示词注入内容 |
| `generateSummary()` | 生成执行摘要 |

### RecursionGuard

| 方法 | 说明 |
|------|------|
| `increment()` | 增加迭代计数并返回检查结果 |
| `check()` | 检查当前状态 |
| `reset()` | 重置计数器 |
| `getCurrentIteration()` | 获取当前迭代次数 |
| `getRemainingIterations()` | 获取剩余迭代次数 |
| `generatePromptInjection()` | 生成提示词注入内容 |

### LoopDetector

| 方法 | 说明 |
|------|------|
| `recordCall(name, args)` | 记录工具调用 |
| `detect()` | 检测是否存在循环 |
| `reset()` | 重置历史记录 |
| `getCallHistory()` | 获取调用历史 |
| `generateHistorySummary()` | 生成历史摘要 |

### 工具函数

| 函数 | 说明 |
|------|------|
| `updateStepStatus(workflow, stepId, status, result?, error?, duration?)` | 更新步骤状态 |
| `addStepsToWorkflow(workflow, newSteps)` | 添加步骤（自动去重） |
| `removeStepsFromWorkflow(workflow, stepIds)` | 移除步骤 |
| `getWorkflowStatus(workflow)` | 获取工作流状态摘要 |
| `findStepById(workflow, stepId)` | 按 ID 查找步骤 |
| `getStepsByStatus(workflow, status)` | 按状态获取步骤 |
| `isWorkflowComplete(workflow)` | 检查工作流是否完成 |
| `hasWorkflowFailed(workflow)` | 检查工作流是否失败 |
| `getWorkflowProgress(workflow)` | 获取进度百分比 |
| `getNextPendingStep(workflow)` | 获取下一个待执行步骤 |
| `generateWorkflowId(prefix?)` | 生成唯一工作流 ID |
| `generateStepId(workflowId, index)` | 生成步骤 ID |

---

## 最佳实践

### 1. 合理配置阈值

```typescript
// 简单任务：较低的阈值
const simpleGuard = new WorkflowGuard({
  recursion: { maxIterations: 10, warningThreshold: 5, softLimit: 7, hardLimit: 10 },
  loopDetection: { repeatThreshold: 2 },
});

// 复杂任务：较高的阈值
const complexGuard = new WorkflowGuard({
  recursion: { maxIterations: 30, warningThreshold: 15, softLimit: 25, hardLimit: 30 },
  loopDetection: { repeatThreshold: 4 },
});
```

### 2. 始终注入警告到提示词

```typescript
const injection = guard.generatePromptInjection();
if (injection) {
  systemPrompt += injection;
}
```

### 3. 在工具结果中标记终止意图

```typescript
interface ToolResult {
  success: boolean;
  data: unknown;
  shouldTerminate: boolean;  // 重要！
  terminationReason?: string;
}
```

### 4. 记录执行摘要用于调试

```typescript
try {
  await runWorkflow();
} finally {
  console.log(guard.generateSummary());
}
```

### 5. 使用不可变更新

所有工具函数都返回新对象，不修改原对象：

```typescript
// ✅ 正确
const updated = updateStepStatus(workflow, 'step-1', 'completed');

// ❌ 错误（原对象不会被修改）
updateStepStatus(workflow, 'step-1', 'completed');
```

---

## 类型定义

完整类型定义请参考 [types.ts](./types.ts)。

主要类型：
- `WorkflowGuardConfig` - 综合防护配置
- `RecursionGuardConfig` - 递归守卫配置
- `LoopDetectorConfig` - 循环检测配置
- `GuardCheckResult` - 综合检查结果
- `LoopDetectionResult` - 循环检测结果
- `BaseWorkflow` - 通用工作流接口
- `BaseWorkflowStep` - 通用步骤接口
- `StepStatus` - 步骤状态枚举
- `LoopType` - 循环类型枚举
