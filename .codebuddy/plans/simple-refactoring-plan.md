# 简化重构方案：真正降低复杂度

## 执行摘要

**目标**: 解决类型重复、服务分散等实际问题，同时减少代码量
**预期结果**: 删除 3-5 个文件，减少 ~500 行代码
**时间估计**: 1-2 天
**风险**: 低 - 每步独立可测试，可随时回滚

## 当前问题分析

### 问题 1: 类型定义重复（高优先级）

**现状**:
- `packages/drawnix/src/domain/task/` - 新 DDD 层类型（7 个文件）
- `packages/drawnix/src/types/task.types.ts` - 旧类型（已改为 re-export）
- `apps/web/src/sw/task-queue/types.ts` - SW 端重复定义
- `packages/drawnix/src/services/sw-channel/types/task.ts` - 通信层类型

**问题**:
- 4 处定义，依赖注释 "Keep in sync" 维护一致性
- DDD 重构后变成 3 种表示：interface、class、snapshot
- 转换代码散落各处

### 问题 2: Workflow 服务职责分散（中优先级）

**现状**:
- `workflowSubmissionService` - 提交工作流
- `workflowPollingService` - 轮询状态
- `workflowCompletionService` - 完成后处理
- 3 个服务管理同一个工作流生命周期

**问题**:
- 状态分散在 3 个服务中
- 服务间通过方法调用耦合
- 难以追踪完整生命周期

### 问题 3: 事件类型不统一（低优先级）

**现状**:
- 各服务使用独立 RxJS Subject
- 事件结构不一致
- 缺少类型约束

**问题**:
- 订阅者需要知道具体 Subject 位置
- 事件数据结构不统一
- 难以调试事件流

### 问题 4: DDD 重构增加的复杂度（需回滚）

**现状**:
- 新增 30 个文件（domain/application/infrastructure）
- Task 有 3 种表示（interface/class/snapshot）
- Repository 包装现有 storage
- Strategy 包装现有条件判断

**问题**:
- 代码量增加 3000+ 行
- 旧代码保留"向后兼容"，实际是双重维护
- 抽象层没有解决实际问题

## 解决方案

### 方案 1: 统一类型定义（解决问题 1）

#### 目标
- 所有类型定义在一个位置
- SW 和主线程都从同一源导入
- 删除重复定义

#### 实施步骤

**Step 1.1: 创建共享类型文件**

创建 `packages/drawnix/src/types/shared/core.types.ts`:

```typescript
/**
 * 核心类型定义 - 主线程和 SW 共享
 *
 * 这是任务和工作流类型的唯一真相来源。
 * 主线程和 SW 都从这里导入，确保类型一致性。
 */

// ============================================================================
// Task 核心类型
// ============================================================================

export enum TaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum TaskType {
  IMAGE = 'image',
  VIDEO = 'video',
  CHARACTER = 'character',
  INSPIRATION_BOARD = 'inspiration_board',
  CHAT = 'chat',
}

export enum TaskExecutionPhase {
  SUBMITTING = 'submitting',
  POLLING = 'polling',
  DOWNLOADING = 'downloading',
}

export interface GenerationParams {
  prompt: string;
  width?: number;
  height?: number;
  size?: string;
  duration?: number;
  style?: string;
  model?: string;
  seed?: number;
  sourceVideoTaskId?: string;
  characterTimestamps?: string;
  sourceLocalTaskId?: string;
  gridImageRows?: number;
  gridImageCols?: number;
  gridImageLayoutStyle?: 'scattered' | 'grid' | 'circular';
  inspirationBoardLayoutStyle?: 'inspiration-board';
  isInspirationBoard?: boolean;
  inspirationBoardImageCount?: number;
  autoInsertToCanvas?: boolean;
  aspectRatio?: string;
  [key: string]: unknown;
}

export interface TaskResult {
  url: string;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskError {
  code: string;
  message: string;
  details?: unknown;
}

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  params: GenerationParams;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: TaskResult;
  error?: TaskError;
  userId?: string;
  progress?: number;
  remoteId?: string;
  executionPhase?: TaskExecutionPhase;
  savedToLibrary?: boolean;
  insertedToCanvas?: boolean;
}

// ============================================================================
// 工具函数
// ============================================================================

export const TERMINAL_STATUSES: TaskStatus[] = [
  TaskStatus.COMPLETED,
  TaskStatus.FAILED,
  TaskStatus.CANCELLED,
];

export const RETRYABLE_STATUSES: TaskStatus[] = [
  TaskStatus.FAILED,
  TaskStatus.CANCELLED,
];

export function isTerminalStatus(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isRetryableStatus(status: TaskStatus): boolean {
  return RETRYABLE_STATUSES.includes(status);
}
```

**Step 1.2: 更新 SW 端导入**

修改 `apps/web/src/sw/task-queue/types.ts`:

```typescript
/**
 * Service Worker Task Queue Type Definitions
 *
 * 从共享类型导入，确保与主线程一致。
 */

// 从共享类型导入核心定义
export {
  TaskStatus,
  TaskType,
  TaskExecutionPhase,
  GenerationParams,
  TaskResult,
  TaskError,
  Task,
  TERMINAL_STATUSES,
  RETRYABLE_STATUSES,
  isTerminalStatus,
  isRetryableStatus,
} from '../../../../packages/drawnix/src/types/shared/core.types';

// SW 特有的类型定义保留在这里
export interface SWTaskQueueConfig {
  // ...
}
```

**Step 1.3: 删除 domain 层**

删除整个 `packages/drawnix/src/domain/` 目录（18 个文件）:
- `domain/task/` (7 文件)
- `domain/workflow/` (5 文件)
- `domain/events/` (5 文件)
- `domain/index.ts` (1 文件)

**Step 1.4: 删除 application 层**

删除 `packages/drawnix/src/application/` 目录（3 个文件）:
- `application/task-application-service.ts`
- `application/workflow-application-service.ts`
- `application/index.ts`

**Step 1.5: 删除 infrastructure 层**

删除 `packages/drawnix/src/infrastructure/` 目录（9 个文件）:
- `infrastructure/execution/` (5 文件)
- `infrastructure/persistence/` (3 文件)
- `infrastructure/index.ts` (1 文件)

**Step 1.6: 恢复原有服务**

将 `packages/drawnix/src/types/task.types.ts` 改回直接定义或 re-export 共享类型。

#### 验证

```bash
# 类型检查
cd packages/drawnix && npx tsc --noEmit

# 确保 SW 构建成功
pnpm run build

# 运行测试
pnpm nx test drawnix
```

#### 预期结果

- **删除**: 30 个文件（domain/application/infrastructure）
- **添加**: 1 个文件（shared/core.types.ts）
- **净变化**: -29 文件
- **代码行数**: 减少 ~2500 行

---

---

### 方案 2: 评估 Workflow 服务结构（解决问题 2）

#### 当前服务分析

经过代码审查，发现 3 个 Workflow 服务实际上有不同的职责：

1. **workflow-submission-service.ts** (主服务)
   - 提交工作流到 SW
   - 监听 SW 事件（通过 swChannelClient）
   - 处理主线程工具请求
   - 处理画布操作请求
   - 管理降级模式（MainThreadWorkflowEngine）

2. **workflow-polling-service.ts** (辅助服务)
   - 轮询 IndexedDB 中的工作流
   - 执行标记为 `pending_main_thread` 的步骤
   - 依赖 workflow-submission-service

3. **workflow-completion-service.ts** (追踪服务)
   - 追踪后处理状态（拆分、插入画布）
   - 发布完成事件
   - 独立的 RxJS Subject

#### 问题重新评估

**原计划**: 合并 3 个服务为 1 个
**重新评估**: 这 3 个服务职责不同，不应强制合并

**真正的问题**:
- polling-service 依赖 submission-service，耦合度高
- completion-service 独立追踪状态，但与其他服务缺少协调
- 事件流分散（submission 的 RxJS Subject + completion 的 Subject）

#### 优化方案

**不合并服务**，而是优化协调机制：

1. **明确服务边界**
   - submission-service: 工作流生命周期管理（提交、监听、恢复）
   - polling-service: 主线程步骤执行器（可选，仅在需要时启用）
   - completion-service: 后处理追踪器（可选，仅追踪需要后处理的工作流）

2. **统一事件流**（见方案 3）
   - 所有服务发布到统一的事件总线
   - 避免直接服务间调用

3. **解除循环依赖**
   - polling-service 不应导入 submission-service
   - 通过事件或共享存储通信

#### 实施步骤

**Step 2.1: 解除 polling-service 对 submission-service 的依赖**

当前代码：
```typescript
// workflow-polling-service.ts
import { workflowSubmissionService, type WorkflowDefinition } from './workflow-submission-service';
```

修改为通过事件通信：
```typescript
// workflow-polling-service.ts
import { workflowEvents$ } from './workflow-events'; // 统一事件流

// 监听工作流提交事件，而不是直接调用 submission-service
workflowEvents$.pipe(
  filter(e => e.type === 'WORKFLOW_SUBMITTED')
).subscribe(event => {
  // 开始轮询该工作流
});
```

**Step 2.2: 标准化服务接口**

为每个服务定义清晰的公共接口：

```typescript
// workflow-submission-service.ts
export interface WorkflowSubmissionService {
  // 提交工作流
  submitWorkflow(definition: WorkflowDefinition): Promise<string>;

  // 恢复工作流
  recoverWorkflows(boardId: string): Promise<void>;

  // 取消工作流
  cancelWorkflow(workflowId: string): Promise<void>;

  // 事件流（只读）
  readonly events$: Observable<WorkflowEvent>;
}
```

#### 预期结果

- **不删除文件** - 3 个服务保持独立
- **解除耦合** - 通过事件通信，不直接导入
- **明确边界** - 每个服务职责清晰
- **代码行数**: 减少 ~100 行（删除重复的类型定义和耦合代码）

---

### 方案 3: 统一事件类型（解决问题 3）

#### 目标

- 定义标准的事件类型
- 使用单一事件流（而非多个 Subject）
- 类型安全的事件订阅

#### 实施步骤

**Step 3.1: 创建事件类型定义**

创建 `packages/drawnix/src/types/shared/events.types.ts`:

```typescript
/**
 * 统一事件类型定义
 *
 * 所有服务发布的事件都应符合这些类型。
 */

import type { Task, TaskStatus } from './core.types';

// ============================================================================
// 事件基类
// ============================================================================

export interface BaseEvent {
  type: string;
  timestamp: number;
  source: string; // 事件来源（如 'task-queue', 'workflow-submission'）
}

// ============================================================================
// Task 事件
// ============================================================================

export interface TaskCreatedEvent extends BaseEvent {
  type: 'TASK_CREATED';
  task: Task;
}

export interface TaskStatusChangedEvent extends BaseEvent {
  type: 'TASK_STATUS_CHANGED';
  taskId: string;
  oldStatus: TaskStatus;
  newStatus: TaskStatus;
  task: Task;
}

export interface TaskCompletedEvent extends BaseEvent {
  type: 'TASK_COMPLETED';
  task: Task;
}

export interface TaskFailedEvent extends BaseEvent {
  type: 'TASK_FAILED';
  task: Task;
  error: string;
}

export type TaskEvent =
  | TaskCreatedEvent
  | TaskStatusChangedEvent
  | TaskCompletedEvent
  | TaskFailedEvent;

// ============================================================================
// Workflow 事件
// ============================================================================

export interface WorkflowSubmittedEvent extends BaseEvent {
  type: 'WORKFLOW_SUBMITTED';
  workflowId: string;
  boardId?: string;
}

export interface WorkflowStepCompletedEvent extends BaseEvent {
  type: 'WORKFLOW_STEP_COMPLETED';
  workflowId: string;
  stepId: string;
}

export interface WorkflowCompletedEvent extends BaseEvent {
  type: 'WORKFLOW_COMPLETED';
  workflowId: string;
}

export interface WorkflowFailedEvent extends BaseEvent {
  type: 'WORKFLOW_FAILED';
  workflowId: string;
  error: string;
}

export type WorkflowEvent =
  | WorkflowSubmittedEvent
  | WorkflowStepCompletedEvent
  | WorkflowCompletedEvent
  | WorkflowFailedEvent;

// ============================================================================
// 所有事件联合类型
// ============================================================================

export type AppEvent = TaskEvent | WorkflowEvent;
```

**Step 3.2: 创建统一事件流**

创建 `packages/drawnix/src/services/app-events.ts`:

```typescript
/**
 * 统一应用事件流
 *
 * 所有服务通过这个事件流发布和订阅事件。
 */

import { Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import type { AppEvent, TaskEvent, WorkflowEvent } from '../types/shared/events.types';

/**
 * 全局事件流
 */
const appEvents$ = new Subject<AppEvent>();

/**
 * 发布事件
 */
export function publishEvent(event: Omit<AppEvent, 'timestamp'>): void {
  appEvents$.next({
    ...event,
    timestamp: Date.now(),
  } as AppEvent);
}

/**
 * 订阅所有事件
 */
export function subscribeToEvents(handler: (event: AppEvent) => void) {
  return appEvents$.subscribe(handler);
}

/**
 * 订阅特定类型的事件
 */
export function subscribeToEventType<T extends AppEvent['type']>(
  type: T,
  handler: (event: Extract<AppEvent, { type: T }>) => void
) {
  return appEvents$.pipe(
    filter((e): e is Extract<AppEvent, { type: T }> => e.type === type)
  ).subscribe(handler);
}

/**
 * 订阅 Task 事件
 */
export function subscribeToTaskEvents(handler: (event: TaskEvent) => void) {
  return appEvents$.pipe(
    filter((e): e is TaskEvent =>
      e.type.startsWith('TASK_')
    )
  ).subscribe(handler);
}

/**
 * 订阅 Workflow 事件
 */
export function subscribeToWorkflowEvents(handler: (event: WorkflowEvent) => void) {
  return appEvents$.pipe(
    filter((e): e is WorkflowEvent =>
      e.type.startsWith('WORKFLOW_')
    )
  ).subscribe(handler);
}

/**
 * 导出只读的事件流（用于高级用法）
 */
export const events$ = appEvents$.asObservable();
```

**Step 3.3: 更新服务使用统一事件流**

示例 - 更新 task queue service:

```typescript
// sw-task-queue-service.ts
import { publishEvent } from './app-events';

class SWTaskQueueService {
  async createTask(type: TaskType, params: GenerationParams): Promise<Task> {
    const task = { /* ... */ };

    // 发布事件
    publishEvent({
      type: 'TASK_CREATED',
      source: 'sw-task-queue',
      task,
    });

    return task;
  }
}
```

#### 预期结果

- **添加**: 2 个文件（events.types.ts, app-events.ts）
- **修改**: 各服务改用统一事件流
- **删除**: 各服务内部的独立 Subject
- **代码行数**: 净增加 ~200 行（事件定义），但提高了类型安全性

---

## 实施路线图

### 阶段 1: 回滚 DDD 重构（1-2 小时）

**优先级**: 最高 - 立即执行

1. 删除 `domain/` 目录（18 文件）
2. 删除 `application/` 目录（3 文件）
3. 删除 `infrastructure/` 目录（9 文件）
4. 恢复 `types/task.types.ts` 为直接定义
5. 验证构建和测试通过

**验证**:
```bash
pnpm run build
pnpm nx test drawnix
```

### 阶段 2: 统一类型定义（2-3 小时）

**优先级**: 高

1. 创建 `types/shared/core.types.ts`
2. 更新 SW 端导入
3. 更新主线程导入
4. 删除重复定义
5. 验证类型检查通过

**验证**:
```bash
cd packages/drawnix && npx tsc --noEmit
```

### 阶段 3: 标准化事件（2-3 小时）

**优先级**: 中

1. 创建 `types/shared/events.types.ts`
2. 创建 `services/app-events.ts`
3. 更新各服务使用统一事件流
4. 验证事件流工作正常

**验证**:
- 手动测试任务创建和完成
- 检查事件是否正确发布

### 阶段 4: 优化服务协调（可选，3-4 小时）

**优先级**: 低

1. 解除 polling-service 对 submission-service 的依赖
2. 标准化服务接口
3. 添加服务文档

---

## 总结对比

| 指标 | DDD 方案 | 简化方案 |
|------|---------|---------|
| 新增文件 | +30 | +3 |
| 删除文件 | 0 | -30 |
| 净变化 | +30 | -27 |
| 代码行数 | +3000 | -2300 |
| 实施时间 | 2-3 周 | 1-2 天 |
| 风险 | 高（大规模重构） | 低（渐进式优化） |
| 复杂度 | 增加（多层抽象） | 降低（删除冗余） |

## 下一步行动

1. **立即执行**: 回滚 DDD 重构（阶段 1）
2. **本周完成**: 统一类型定义（阶段 2）
3. **下周完成**: 标准化事件（阶段 3）
4. **可选**: 优化服务协调（阶段 4）

每个阶段独立可测试，可随时停止或调整。
