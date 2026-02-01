# Service Worker 通信与任务执行架构

本文档介绍 AI 输入框、Service Worker、工作流、IndexedDB、sw-debug.html 调试面板之间的时序关系、数据流向、通信方式和数据同步策略。

## 目录

1. [架构概览](#架构概览)
2. [核心组件](#核心组件)
3. [通信机制](#通信机制)
4. [数据流向](#数据流向)
5. [数据存储](#数据存储)
6. [时序图](#时序图)
7. [数据同步策略](#数据同步策略)
8. [优化方案](#优化方案)

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              主线程 (Main Thread)                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │  AIInputBar  │    │  ChatDrawer  │    │   WorkZone   │               │
│  │  (用户输入)   │    │  (对话展示)   │    │  (步骤展示)   │               │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘               │
│         │                   │                   │                        │
│         └───────────────────┼───────────────────┘                        │
│                             ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    WorkflowContext (状态管理)                     │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│  ┌──────────────────────────────┼──────────────────────────────────┐    │
│  │         useWorkflowSubmission / swChannelClient                  │    │
│  │              (工作流提交 / SW 通信客户端)                          │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
│                                 │                                        │
│  ┌──────────────────────────────┴──────────────────────────────────┐    │
│  │              sw-debug.html (调试面板 - 独立页面)                   │    │
│  │    ┌───────────────────────────────────────────────────────┐    │    │
│  │    │  duplex-client.js → LLM API 日志 / PostMessage 日志    │    │    │
│  │    └───────────────────────────────────────────────────────┘    │    │
│  └──────────────────────────────┬──────────────────────────────────┘    │
└─────────────────────────────────┼───────────────────────────────────────┘
                                  │
                    postmessage-duplex (双工通信)
                                  │
┌─────────────────────────────────┼───────────────────────────────────────┐
│                       Service Worker                                     │
├─────────────────────────────────┼───────────────────────────────────────┤
│                                 ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                 SWChannelManager (通道管理器)                      │    │
│  │    - 管理多客户端连接                                              │    │
│  │    - RPC 方法路由                                                  │    │
│  │    - 事件广播                                                      │    │
│  └────────────────────────────┬────────────────────────────────────┘    │
│                               │                                          │
│         ┌─────────────────────┼─────────────────────┐                   │
│         ▼                     ▼                     ▼                    │
│  ┌─────────────┐     ┌──────────────┐     ┌──────────────────┐         │
│  │ SWTaskQueue │     │WorkflowExecutor│    │  LLM API Logger │         │
│  │  (任务队列)  │     │  (工作流执行)  │    │   (API 日志)    │         │
│  └──────┬──────┘     └──────┬───────┘     └────────┬─────────┘         │
│         │                   │                      │                     │
│         └───────────────────┼──────────────────────┘                     │
│                             ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    taskQueueStorage (IndexedDB)                   │    │
│  │    - tasks: 任务数据                                               │    │
│  │    - workflows: 工作流数据                                         │    │
│  │    - config: API 配置                                              │    │
│  │    - llm-api-logs: LLM API 日志                                    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 核心组件

### 1. 主线程组件

| 组件 | 路径 | 职责 |
|------|------|------|
| **AIInputBar** | `packages/drawnix/src/components/ai-input-bar/AIInputBar.tsx` | 用户输入、参数配置、触发生成 |
| **ChatDrawer** | `packages/drawnix/src/components/chat-drawer/ChatDrawer.tsx` | 对话展示、步骤状态 |
| **WorkZone** | `packages/drawnix/src/plugins/with-workzone.ts` | 画布上的工作流步骤展示 |
| **WorkflowContext** | `packages/drawnix/src/contexts/WorkflowContext.tsx` | 工作流状态管理 |
| **swChannelClient** | `packages/drawnix/src/services/sw-channel/client.ts` | SW 通信客户端 |
| **sw-debug** | `apps/web/public/sw-debug/` | 调试面板（独立页面） |

### 2. Service Worker 组件

| 组件 | 路径 | 职责 |
|------|------|------|
| **SWChannelManager** | `apps/web/src/sw/task-queue/channel-manager.ts` | 多客户端通信管理 |
| **SWTaskQueue** | `apps/web/src/sw/task-queue/queue.ts` | 任务生命周期管理 |
| **WorkflowExecutor** | `apps/web/src/sw/task-queue/workflow-executor.ts` | 工作流执行引擎 |
| **taskQueueStorage** | `apps/web/src/sw/task-queue/storage.ts` | IndexedDB 存储层 |
| **LLM API Logger** | `apps/web/src/sw/task-queue/llm-api-logger.ts` | API 调用日志 |

---

## 通信机制

### 基于 postmessage-duplex 的双工通信

```typescript
// 主线程 → SW (RPC 调用)
const response = await channel.call('workflow:submit', { workflow });

// SW → 主线程 (广播)
channelManager.broadcastToAll('task:completed', { taskId, result });

// SW → 特定客户端 (点对点)
channelManager.sendToTaskClient(taskId, 'task:progress', { progress: 50 });
```

### 通信模式对比

| 模式 | 方向 | 方法 | 用途 |
|------|------|------|------|
| **RPC** | 主线程 → SW | `channel.call()` | 提交任务/工作流、查询状态 |
| **广播** | SW → 所有客户端 | `channel.broadcast()` | 任务创建、配置变更 |
| **点对点** | SW → 特定客户端 | `sendToMappedClient()` | 任务进度、完成、失败 |
| **请求-响应** | SW ↔ 主线程 | `channel.publish()` + handler | 主线程工具请求 |

### 关键 RPC 方法

```typescript
// 任务相关
'task:create'         // 创建任务
'task:cancel'         // 取消任务
'task:listPaginated'  // 分页查询任务

// 工作流相关
'workflow:submit'     // 提交工作流
'workflow:cancel'     // 取消工作流
'workflow:getStatus'  // 查询工作流状态

// 调试相关
'debug:getLLMApiLogs' // 获取 LLM API 日志
'debug:getCacheEntries' // 获取缓存条目
```

### 关键事件

```typescript
// 任务事件
'task:created'    // 任务创建（广播）
'task:progress'   // 任务进度（点对点）
'task:completed'  // 任务完成（点对点）
'task:failed'     // 任务失败（点对点）

// 工作流事件
'workflow:status'      // 工作流状态变更
'workflow:stepStatus'  // 步骤状态变更
'workflow:completed'   // 工作流完成
'workflow:stepsAdded'  // 动态添加步骤

// 调试事件
'debug:llmLog'         // LLM API 日志实时推送
'postmessage:log'      // PostMessage 日志
```

---

## 数据流向

### 1. 图片/视频生成流程

```
用户输入 → AIInputBar
    │
    ▼
workflow-converter.ts (转换为工作流定义)
    │
    ▼
useWorkflowSubmission.submitToSW()
    │ RPC: workflow:submit
    ▼
SW: WorkflowExecutor.submitWorkflow()
    │
    ├─→ IndexedDB: 保存工作流
    │
    ▼
executeStep() 循环
    │
    ├─ generate_image/generate_video → SW 直接执行
    │       │
    │       ▼
    │   llmFetch() → Gemini/Veo3 API
    │       │
    │       ├─→ LLM API Logger (记录日志)
    │       │
    │       ▼
    │   ImageHandler/VideoHandler (处理结果)
    │       │
    │       ├─→ Cache Storage (缓存媒体)
    │       │
    │       ▼
    │   broadcast: task:completed
    │
    └─ ai_analyze/canvas_insert → 委托主线程
            │
            ▼
        sendToolRequest() → 主线程处理
            │
            ▼
        返回结果 → 继续执行
```

### 2. Agent 流程（动态步骤）

```
用户输入 "画一只猫" + 选择 Agent 模式
    │
    ▼
convertAgentFlowToWorkflow() → 仅包含 ai_analyze 步骤
    │
    ▼
SW: 执行 ai_analyze
    │
    ▼
主线程: AI 分析 → 返回 addSteps
    │
    ▼
SW: 添加新步骤 → broadcast: workflow:stepsAdded
    │
    ▼
主线程: WorkflowContext 更新 → ChatDrawer/WorkZone 渲染
    │
    ▼
SW: 继续执行新步骤 (generate_image 等)
```

### 3. 调试面板数据流

```
sw-debug.html 页面加载
    │
    ▼
duplex-client.js 初始化
    │
    ├─→ RPC: debug:getLLMApiLogs (获取历史日志)
    │
    └─→ onBroadcast: debug:llmLog (订阅实时日志)
            │
            ▼
        llmapi-logs.js 渲染日志列表
            │
            ▼
        点击展开 → RPC: debug:getLLMApiLogById (懒加载详情)
```

---

## 数据存储

### IndexedDB 数据库结构

```
sw-task-queue (主数据库)
├── tasks                    # 任务数据
│   ├── id (主键)
│   ├── type, status, createdAt (索引)
│   └── params, result, error, remoteId, ...
│
├── workflows               # 工作流数据
│   ├── id (主键)
│   ├── status, createdAt (索引)
│   └── steps, context, ...
│
├── config                  # 配置数据
│   ├── gemini_config
│   ├── video_config
│   └── mcp_system_prompt
│
├── chat-workflows          # 聊天工作流
│
├── pending-tool-requests   # 待处理工具请求
│
└── pending-dom-operations  # 待处理 DOM 操作

llm-api-logs (日志数据库)
└── logs
    ├── id (主键)
    ├── timestamp, taskType, status, taskId (索引)
    └── endpoint, model, prompt, requestBody, responseBody, ...
```

### 存储策略

| 数据类型 | 存储位置 | 容量限制 | 清理策略 |
|----------|----------|----------|----------|
| 任务数据 | IndexedDB tasks | 无限制 | 用户手动删除 |
| 工作流数据 | IndexedDB workflows | 无限制 | 用户手动删除 |
| LLM API 日志 | IndexedDB llm-api-logs | 1000 条 | FIFO 自动清理 |
| 媒体文件 | Cache Storage | 受浏览器配额限制 | LRU 清理 |
| 内存缓存 | SW 内存 | 50 条日志 | FIFO |

### 批量写入优化

```typescript
// storage.ts: 50ms 窗口期批量写入
private batchSaveTimer: ReturnType<typeof setTimeout> | null = null;
private pendingSaves: Map<string, SWTask> = new Map();

saveTask(task: SWTask): void {
  this.pendingSaves.set(task.id, task);
  if (!this.batchSaveTimer) {
    this.batchSaveTimer = setTimeout(() => this.flushPendingSaves(), 50);
  }
}
```

---

## 时序图

### 完整生成流程

```
主线程                           Service Worker                     外部 API
  │                                    │                               │
  │  1. 用户点击生成                     │                               │
  │─────────────────────────────────────│                               │
  │                                    │                               │
  │  2. RPC: workflow:submit           │                               │
  │───────────────────────────────────>│                               │
  │                                    │  3. 保存到 IndexedDB           │
  │                                    │─────────────────────>          │
  │                                    │                               │
  │  4. broadcast: workflow:status     │                               │
  │<───────────────────────────────────│                               │
  │                                    │                               │
  │                                    │  5. 执行步骤                   │
  │                                    │                               │
  │                                    │  6. 调用 LLM API              │
  │                                    │──────────────────────────────>│
  │                                    │                               │
  │                                    │  7. 记录 API 日志              │
  │                                    │─────────────────────>          │
  │                                    │                               │
  │  8. broadcast: debug:llmLog        │                               │
  │<───────────────────────────────────│                               │
  │                                    │                               │
  │                                    │  9. 收到 API 响应             │
  │                                    │<──────────────────────────────│
  │                                    │                               │
  │                                    │ 10. 缓存媒体到 Cache Storage  │
  │                                    │─────────────────────>          │
  │                                    │                               │
  │ 11. broadcast: task:completed      │                               │
  │<───────────────────────────────────│                               │
  │                                    │                               │
  │ 12. 更新 UI                        │                               │
  │─────────────────────>              │                               │
```

### 页面刷新恢复流程

```
页面刷新后
  │
  │  1. swChannelClient.initialize()
  │───────────────────────────────────>│
  │                                    │
  │                                    │  2. 从 IndexedDB 加载任务/工作流
  │                                    │─────────────────────>
  │                                    │
  │                                    │  3. 恢复中断的任务
  │                                    │     - 有 remoteId: 恢复轮询
  │                                    │     - 无 remoteId: 查 LLM 日志恢复
  │                                    │
  │  4. broadcast: workflow:recovered  │
  │<───────────────────────────────────│
  │                                    │
  │  5. 恢复 WorkflowContext 状态     │
  │─────────────────────>              │
```

---

## 数据同步策略

### 1. 任务状态同步

```typescript
// 主线程: useTaskQueue.ts
useEffect(() => {
  // 订阅任务更新事件
  const subscription = taskQueueService.observeTaskUpdates().subscribe(() => {
    setTasks(taskQueueService.getAllTasks());
  });
  
  // 从 SW 同步任务数据
  const syncFromSW = async () => {
    await swTaskQueueService.syncTasksFromSW();
    const swTasks = swTaskQueueService.getAllTasks();
    taskQueueService.restoreTasks(swTasks);
    setTasks(taskQueueService.getAllTasks()); // 强制刷新
  };
  
  syncFromSW();
}, []);
```

### 2. 工作流状态同步

```typescript
// 主线程: useWorkflowSubmission.ts
workflowSubmissionService.subscribeToWorkflow(workflowId, (event) => {
  switch (event.type) {
    case 'step':
      workflowControl.updateStep(event.stepId, event.status, ...);
      break;
    case 'completed':
      workflowControl.complete();
      break;
    case 'steps_added':
      workflowControl.addSteps(event.steps);
      break;
  }
});
```

### 3. 多客户端同步

```typescript
// SW: channel-manager.ts
// 任务创建 → 广播给所有客户端
sendTaskCreated(taskId, task) {
  this.broadcastToAll(SW_EVENTS.TASK_CREATED, { taskId, task });
}

// 任务进度 → 仅发送给创建者
sendTaskProgress(taskId, progress) {
  this.sendToMappedClient(this.taskChannels, taskId, 'task:progress', { taskId, progress }, true);
}
```

### 4. 数据一致性保障

| 场景 | 策略 |
|------|------|
| SW 重启 | 从 IndexedDB 恢复所有状态 |
| 页面刷新 | 重新订阅事件 + 同步当前状态 |
| 多页面同时打开 | 通过广播保持同步 |
| 网络断开 | 任务保持 PROCESSING 状态，重连后恢复 |

---

## 优化方案

### 当前问题分析

1. **数据同步延迟**
   - 问题：任务队列首次打开时数据为空
   - 原因：SW 数据同步是异步的，UI 先渲染空状态
   - 已修复：添加 `isLoading` 状态 + 强制刷新

2. **init RPC 超时导致状态丢失**
   - 问题：`[SWChannelClient] init failed: timeout`，任务完成后提示"任务未找到"
   - 原因链：
     1. SW 端 `handleInit` 等待 `storageRestorePromise`（IndexedDB 恢复）
     2. IndexedDB 操作慢导致 init RPC 超时
     3. `swTaskQueueService.initialized = false`
     4. `syncTasksFromSW()` 检查失败后直接返回
     5. 任务完成广播丢失（`taskChannels` 映射已失效）
   - 已修复：
     - `syncTasksFromSW` 不再依赖 `init` 成功，尝试重新初始化 channel
     - `init` 方法超时延长至 60 秒，且超时返回失败结果而非抛异常
     - 添加 5 秒轮询机制检查运行中任务状态

3. **taskChannels 映射丢失**
   - 问题：页面刷新后，任务完成的点对点通知无法送达
   - 原因：`taskChannels` 映射只在任务创建时建立，刷新后丢失
   - 已修复：`fallbackBroadcast: true` 确保广播给所有客户端
   - 兜底方案：客户端轮询运行中任务状态

4. **通信层复杂度**
   - 问题：`message-bus.ts` 与 `channel-manager.ts` 功能重叠
   - 影响：代码维护成本高

5. **大文件问题**
   - `channel-manager.ts`: 2081 行
   - `client.ts`: 1071 行
   - 维护难度高

6. **LLM 日志数据量大**
   - 单条日志可能包含大型 requestBody/responseBody
   - 分页查询时传输数据过大

### 优化方案

#### 方案 1: 通信层统一（已部分完成）

```typescript
// 统一使用 channel-manager.ts，移除 message-bus.ts
// 优点：减少代码重复
// 风险：需要更新多处引用
```

#### 方案 2: 预加载 + 骨架屏

```typescript
// 在 App 初始化时预加载任务数据
useEffect(() => {
  // 应用启动时预热 SW 连接 + 加载任务
  swTaskQueueService.initialize().then(() => {
    swTaskQueueService.syncTasksFromSW();
  });
}, []);

// 任务面板使用骨架屏而非空状态
{isLoading ? <TaskSkeleton count={5} /> : <TaskList tasks={tasks} />}
```

#### 方案 3: 增量同步

```typescript
// 当前：每次同步全量任务
await swTaskQueueService.syncTasksFromSW();

// 优化：仅同步变更的任务
interface TaskSyncResult {
  updatedTasks: Task[];
  deletedTaskIds: string[];
  lastSyncTime: number;
}

// SW 端记录变更
const changes = await storage.getTaskChangesSince(lastSyncTime);
```

#### 方案 4: 日志数据分层

```typescript
// 当前：精简数据 vs 完整数据
// 优化：三层数据结构

interface LLMApiLogSummary {  // 列表展示
  id: string;
  timestamp: number;
  status: string;
  duration: number;
}

interface LLMApiLogDetail {   // 展开详情
  ...LLMApiLogSummary;
  endpoint: string;
  model: string;
  prompt: string;  // 截断到 500 字符
}

interface LLMApiLogFull {     // 完整导出
  ...LLMApiLogDetail;
  requestBody: string;
  responseBody: string;
}
```

#### 方案 5: 工作流执行优化

```typescript
// 当前：串行执行步骤
// 优化：支持并行执行无依赖步骤

interface WorkflowStep {
  id: string;
  dependsOn?: string[];  // 依赖的步骤 ID
}

// 执行引擎：同时执行所有依赖已满足的步骤
const executableSteps = steps.filter(s => 
  s.status === 'pending' && 
  (s.dependsOn || []).every(depId => 
    steps.find(d => d.id === depId)?.status === 'completed'
  )
);

await Promise.all(executableSteps.map(step => executeStep(step)));
```

#### 方案 6: 通道管理器模块化

```
channel-manager/
├── index.ts              # 核心类 (~400 行)
├── constants.ts          # 常量定义 (~130 行) ✅ 已完成
├── task-handlers.ts      # 任务 RPC 处理器 (~200 行)
├── workflow-handlers.ts  # 工作流 RPC 处理器 (~200 行)
├── debug-handlers.ts     # 调试 RPC 处理器 (~400 行)
├── event-senders.ts      # 事件发送方法 (~300 行)
└── types.ts              # 类型定义
```

### 优先级建议

| 优化 | 优先级 | 收益 | 风险 |
|------|--------|------|------|
| 预加载 + 骨架屏 | 高 | 用户体验 | 低 |
| 增量同步 | 中 | 性能 | 中 |
| 通道管理器模块化 | 中 | 可维护性 | 中 |
| 日志数据分层 | 低 | 调试体验 | 低 |
| 并行执行步骤 | 低 | 生成速度 | 高 |

---

## 故障排查

### 常见问题

#### 1. `[SWChannelClient] init failed: timeout`

**症状**：任务完成后提示"任务未找到"，sw-debug.html 能看到数据

**原因**：
- SW 端 `handleInit` 等待 IndexedDB 恢复超时
- 客户端 `init` RPC 超时后，`swTaskQueueService.initialized` 保持 false
- `syncTasksFromSW()` 因此跳过同步

**排查步骤**：
1. 检查 IndexedDB 大小（DevTools → Application → IndexedDB）
2. 查看 SW Console 日志：`[SWTaskQueue] restoreFromStorage...`
3. 检查 `swChannelClient.isInitialized()` 返回值

**解决方案**：
- 已修复：`init` 超时延长至 60 秒
- 已修复：`syncTasksFromSW` 尝试重新初始化 channel
- 兜底：5 秒轮询运行中任务状态

#### 2. 任务完成广播丢失

**症状**：SW 日志显示任务完成，但应用页面无反应

**原因**：
- `taskChannels` 映射丢失（页面刷新后）
- 客户端 channel 未建立或已断开

**排查步骤**：
1. 检查 SW Console：`[SWChannelManager] sendTaskCompleted`
2. 检查客户端 Console：是否有 `task:completed` 事件
3. 使用 sw-debug.html 的 PostMessage 日志面板

**解决方案**：
- `fallbackBroadcast: true` 确保广播给所有客户端
- 客户端轮询运行中任务状态

#### 3. 多页面数据不同步

**症状**：两个应用页面，一个有任务数据，另一个没有

**原因**：
- 初始化时序问题
- 点对点通信发送到错误的客户端

**排查步骤**：
1. 检查两个页面的 `swChannelClient.isInitialized()`
2. 查看 SW Console 的 clients 数量

**解决方案**：
- 使用 `broadcastToAll` 广播重要事件
- 页面可见时触发同步（`visibilitychange` 事件）

### 调试工具

1. **sw-debug.html**：查看 LLM API 日志、PostMessage 日志
2. **DevTools → Application → Service Workers**：查看 SW 状态
3. **DevTools → Application → IndexedDB**：查看存储数据
4. **Console 过滤**：`[SWChannelManager]`、`[SWTaskQueue]`、`[SWChannelClient]`

---

## 附录

### 相关文档

- [CODING_RULES.md](./CODING_RULES.md) - postmessage-duplex 使用规范
- [UNIFIED_CACHE_DESIGN.md](./UNIFIED_CACHE_DESIGN.md) - 缓存设计
- [SW_DEBUG_POSTMESSAGE_LOGGING.md](./SW_DEBUG_POSTMESSAGE_LOGGING.md) - 调试日志

### 关键代码路径

```
# 主线程
packages/drawnix/src/components/ai-input-bar/AIInputBar.tsx
packages/drawnix/src/hooks/useWorkflowSubmission.ts
packages/drawnix/src/services/sw-channel/client.ts
packages/drawnix/src/hooks/useTaskQueue.ts

# Service Worker
apps/web/src/sw/task-queue/channel-manager.ts
apps/web/src/sw/task-queue/queue.ts
apps/web/src/sw/task-queue/storage.ts
apps/web/src/sw/task-queue/workflow-executor.ts
apps/web/src/sw/task-queue/llm-api-logger.ts

# 调试面板
apps/web/public/sw-debug/duplex-client.js
apps/web/public/sw-debug/llmapi-logs.js
apps/web/public/sw-debug/sw-communication.js
```
