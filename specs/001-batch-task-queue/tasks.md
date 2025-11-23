# 任务清单：内容生成批量任务队列

**功能分支**: `001-batch-task-queue`  
**创建日期**: 2025-11-22  
**规格文档**: [spec.md](./spec.md)  
**实施计划**: [plan.md](./plan.md)

---

## 任务摘要

| 阶段 | 任务数 | 预估工时 | 优先级 | 状态 |
|------|--------|---------|--------|------|
| 阶段 0: 基础设施 | 8 | 16-20h | P1 | 待开始 |
| 阶段 1: 任务创建与持久化 | 10 | 18-22h | P1 | 待开始 |
| 阶段 2: 任务执行与监控 | 12 | 24-28h | P2 | 待开始 |
| 阶段 3: 内容访问与管理 | 9 | 16-20h | P2-P3 | 待开始 |
| 阶段 4: 优化与边界情况 | 8 | 14-18h | P3 | 待开始 |
| **总计** | **47** | **88-108h** | - | - |

---

## 阶段 0: 基础设施 (P1 依赖)

### 目标
建立核心数据结构、存储服务和任务队列基础逻辑，为后续开发提供稳定的基础设施。

### 任务列表

#### Task 0.1: 创建类型定义文件
**文件**: `packages/drawnix/src/types/task.types.ts`  
**预估工时**: 2-3h  
**优先级**: P1  
**依赖**: 无

**描述**:
定义任务队列系统的所有 TypeScript 类型和接口。

**验收标准**:
- [x] 定义 `TaskStatus` 枚举（6 种状态）
- [x] 定义 `TaskType` 枚举（image, video）
- [x] 定义 `Task` 接口（包含所有必需字段）
- [x] 定义 `TaskResult` 接口
- [x] 定义 `TaskError` 接口
- [x] 定义 `TaskQueueState` 接口
- [x] 定义 `GenerationParams` 接口
- [x] 所有类型添加 JSDoc 注释
- [x] TypeScript 编译无错误

**关键代码位置**:
```typescript
// task.types.ts
export enum TaskStatus { ... }
export enum TaskType { ... }
export interface Task { ... }
export interface TaskResult { ... }
export interface TaskError { ... }
```

---

#### Task 0.2: 创建生成相关类型定义
**文件**: `packages/drawnix/src/types/generation.types.ts`  
**预估工时**: 1-2h  
**优先级**: P1  
**依赖**: 无

**描述**:
定义 AI 生成服务相关的类型接口。

**验收标准**:
- [x] 定义 `GenerationRequest` 接口
- [x] 定义 `GenerationResponse` 接口
- [x] 定义 `GenerationError` 接口
- [x] 添加 JSDoc 注释
- [x] TypeScript 编译无错误

---

#### Task 0.3: 实现常量定义
**文件**: `packages/drawnix/src/constants/TASK_CONSTANTS.ts`  
**预估工时**: 1h  
**优先级**: P1  
**依赖**: Task 0.1

**描述**:
定义任务队列系统使用的所有常量值。

**验收标准**:
- [x] 定义超时时长常量（图片 10min, 视频 30min）
- [x] 定义重试间隔常量（1min, 5min, 15min）
- [x] 定义最大重试次数（3 次）
- [x] 定义防重复提交窗口（5 秒）
- [x] 定义存储键名常量
- [x] 定义 IndexedDB 配置常量
- [x] 使用 `UPPER_SNAKE_CASE` 命名
- [x] 添加注释说明每个常量的用途

**示例代码**:
```typescript
export const TASK_TIMEOUT = {
  IMAGE: 10 * 60 * 1000, // 10 minutes
  VIDEO: 30 * 60 * 1000, // 30 minutes
} as const;

export const RETRY_DELAYS = [
  1 * 60 * 1000,  // 1 minute
  5 * 60 * 1000,  // 5 minutes
  15 * 60 * 1000, // 15 minutes
] as const;
```

---

#### Task 0.4: 实现 StorageService
**文件**: `packages/drawnix/src/services/storage-service.ts`  
**预估工时**: 3-4h  
**优先级**: P1  
**依赖**: Task 0.1, Task 0.3

**描述**:
封装 localforage，提供任务队列的持久化存储功能。

**验收标准**:
- [x] 初始化 IndexedDB 数据库（数据库名: `aitu-task-queue`）
- [x] 实现 `saveTasks(tasks: Task[]): Promise<void>` 方法
- [x] 实现 `loadTasks(): Promise<Task[]>` 方法
- [x] 实现 `clearCompletedTasks(): Promise<void>` 方法
- [x] 实现 `getStorageSize(): Promise<number>` 方法
- [x] 错误处理和日志记录
- [x] 支持数据迁移（版本管理）
- [x] 单文件 < 500 行
- [x] 单元测试覆盖率 > 80%

**关键 API**:
```typescript
class StorageService {
  async saveTasks(tasks: Task[]): Promise<void>
  async loadTasks(): Promise<Task[]>
  async clearCompletedTasks(): Promise<void>
  async getStorageSize(): Promise<number>
}
```

---

#### Task 0.5: 实现重试策略工具函数
**文件**: `packages/drawnix/src/utils/retry-utils.ts`  
**预估工时**: 2-3h  
**优先级**: P1  
**依赖**: Task 0.3

**描述**:
实现指数退避重试策略的计算逻辑。

**验收标准**:
- [x] 实现 `calculateRetryDelay(retryCount: number): number` 函数
- [x] 实现 `shouldRetry(task: Task): boolean` 函数
- [x] 实现 `getNextRetryTime(task: Task): number` 函数
- [x] 正确计算重试延迟（1min, 5min, 15min）
- [x] 最大重试次数限制为 3 次
- [x] 边界情况处理（retryCount < 0, > 3）
- [x] 添加 JSDoc 注释
- [x] 单元测试覆盖率 > 90%

**示例代码**:
```typescript
export function calculateRetryDelay(retryCount: number): number {
  if (retryCount < 0 || retryCount >= RETRY_DELAYS.length) {
    return 0;
  }
  return RETRY_DELAYS[retryCount];
}
```

---

#### Task 0.6: 实现任务工具函数
**文件**: `packages/drawnix/src/utils/task-utils.ts`  
**预估工时**: 2-3h  
**优先级**: P1  
**依赖**: Task 0.1, Task 0.3

**描述**:
实现任务相关的工具函数（ID 生成、状态判断、超时检测等）。

**验收标准**:
- [x] 实现 `generateTaskId(): string` (UUID v4)
- [x] 实现 `isTaskActive(task: Task): boolean`
- [x] 实现 `isTaskTimeout(task: Task): boolean`
- [x] 实现 `getTaskTimeout(taskType: TaskType): number`
- [x] 实现 `canRetry(task: Task): boolean`
- [x] 实现 `formatTaskDuration(ms: number): string`
- [x] 添加 JSDoc 注释
- [x] 单元测试覆盖率 > 85%

---

#### Task 0.7: 实现参数验证工具
**文件**: `packages/drawnix/src/utils/validation-utils.ts`  
**预估工时**: 2h  
**优先级**: P1  
**依赖**: Task 0.1, Task 0.2

**描述**:
实现生成参数的验证逻辑。

**验收标准**:
- [x] 实现 `validateGenerationParams(params: GenerationParams): boolean`
- [x] 验证必填字段（prompt）
- [x] 验证参数范围（width, height, duration）
- [x] 返回清晰的错误消息
- [x] 添加 JSDoc 注释
- [x] 单元测试覆盖率 > 85%

---

#### Task 0.8: 实现 TaskQueueService 核心服务
**文件**: `packages/drawnix/src/services/task-queue-service.ts`  
**预估工时**: 4-5h  
**优先级**: P1  
**依赖**: Task 0.1-0.7

**描述**:
实现任务队列的核心业务逻辑，使用单例模式和 RxJS 管理状态。

**验收标准**:
- [x] 单例模式实现
- [x] 使用 RxJS Subject 管理事件流
- [x] 实现 `createTask(params: GenerationParams, type: TaskType): Task`
- [x] 实现 `updateTaskStatus(taskId: string, status: TaskStatus): void`
- [x] 实现 `getTask(taskId: string): Task | undefined`
- [x] 实现 `getAllTasks(): Task[]`
- [x] 实现 `cancelTask(taskId: string): void`
- [x] 实现 `retryTask(taskId: string): void`
- [x] 实现 `clearCompletedTasks(): void`
- [x] 防重复提交检测（5 秒窗口）
- [x] 发出事件：`taskCreated`, `taskUpdated`, `taskDeleted`
- [x] 错误处理和日志记录
- [x] 单文件 < 500 行
- [x] 单元测试覆盖率 > 80%

**关键 API**:
```typescript
class TaskQueueService {
  private static instance: TaskQueueService;
  private tasks: Map<string, Task>;
  private taskUpdates$: Subject<TaskEvent>;
  
  static getInstance(): TaskQueueService;
  createTask(params, type): Task;
  updateTaskStatus(taskId, status): void;
  getTask(taskId): Task | undefined;
  getAllTasks(): Task[];
  observeTaskUpdates(): Observable<TaskEvent>;
}
```

---

## 阶段 1: 任务创建与持久化 (P1)

### 目标
实现用户创建任务、表单重置、任务持久化和底部工具栏的基本显示功能。

### 任务列表

#### Task 1.1: 实现 useTaskStorage Hook
**文件**: `packages/drawnix/src/hooks/useTaskStorage.ts`  
**预估工时**: 2-3h  
**优先级**: P1  
**依赖**: Task 0.4, Task 0.8

**描述**:
封装任务队列与本地存储的同步逻辑。

**验收标准**:
- [x] 监听 TaskQueueService 的状态变化
- [x] 自动将变化写入 IndexedDB
- [x] 应用启动时从存储恢复任务
- [x] 防抖处理（避免频繁写入）
- [x] 错误处理和重试
- [x] 单文件 < 300 行
- [x] 单元测试覆盖率 > 75%

**关键 API**:
```typescript
export function useTaskStorage() {
  // 自动同步任务到本地存储
  // 应用启动时恢复任务
}
```

---

#### Task 1.2: 实现 useTaskQueue Hook
**文件**: `packages/drawnix/src/hooks/useTaskQueue.ts`  
**预估工时**: 3-4h  
**优先级**: P1  
**依赖**: Task 0.8, Task 1.1

**描述**:
提供 React 组件友好的任务队列状态管理接口。

**验收标准**:
- [x] 订阅 TaskQueueService 的事件流
- [x] 提供 React 状态：`tasks`, `activeTasks`, `completedTasks`, `failedTasks`
- [x] 提供操作方法：`createTask`, `cancelTask`, `retryTask`, `clearCompleted`
- [x] 自动清理订阅（useEffect cleanup）
- [x] 性能优化（useMemo, useCallback）
- [x] 单文件 < 400 行
- [x] 单元测试覆盖率 > 75%

**关键 API**:
```typescript
export function useTaskQueue() {
  return {
    tasks: Task[],
    activeTasks: Task[],
    completedTasks: Task[],
    failedTasks: Task[],
    createTask: (params, type) => void,
    cancelTask: (taskId) => void,
    retryTask: (taskId) => void,
    clearCompleted: () => void,
  };
}
```

---

#### Task 1.3: 实现 TaskSummary 组件
**文件**: `packages/drawnix/src/components/task-queue/TaskSummary.tsx`  
**预估工时**: 2h  
**优先级**: P1  
**依赖**: Task 1.2

**描述**:
显示任务摘要信息（生成中/完成/失败计数）。

**验收标准**:
- [x] 显示生成中任务数量
- [x] 显示已完成任务数量
- [x] 显示失败任务数量
- [x] 实时更新（订阅任务状态变化）
- [x] 使用 TDesign 组件（Badge, Text）
- [x] 响应式设计（移动端适配）
- [x] 单文件 < 200 行
- [x] 组件测试覆盖关键场景

**UI 设计**:
```text
[生成中: 3] [已完成: 12] [失败: 1]
```

---

#### Task 1.4: 实现 TaskToolbar 组件
**文件**: `packages/drawnix/src/components/task-queue/TaskToolbar.tsx`  
**预估工时**: 3-4h  
**优先级**: P1  
**依赖**: Task 1.3

**描述**:
实现页面底部固定的任务工具栏，显示摘要并支持展开/收起队列面板。

**验收标准**:
- [x] 固定在页面底部（CSS: `position: fixed; bottom: 0;`）
- [x] 集成 TaskSummary 组件
- [x] 点击展开/收起任务队列面板
- [x] 显示新任务完成通知
- [x] 平滑动画（展开/收起）
- [x] 使用 TDesign light 主题
- [x] 响应式设计
- [x] 单文件 < 300 行
- [x] 组件测试覆盖点击交互

**样式要求**:
- 高度: 56px
- 背景: 白色，阴影
- 圆角: 顶部 8px
- z-index: 999

---

#### Task 1.5: 创建任务队列样式文件
**文件**: `packages/drawnix/src/components/task-queue/task-queue.scss`  
**预估工时**: 2-3h  
**优先级**: P1  
**依赖**: 无

**描述**:
定义任务队列相关组件的 SCSS 样式。

**验收标准**:
- [x] 使用 BEM 命名约定
- [x] 使用 TDesign 设计系统变量
- [x] 定义 TaskToolbar 样式
- [x] 定义 TaskSummary 样式
- [x] 定义展开/收起动画
- [x] 响应式断点（移动端 < 768px）
- [x] 支持深色模式（预留变量）
- [x] 单文件 < 400 行

**关键样式**:
```scss
.task-toolbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 56px;
  background: var(--td-bg-color-container);
  box-shadow: var(--td-shadow-3);
  z-index: 999;
  
  &__summary {
    // ...
  }
  
  &--expanded {
    // ...
  }
}
```

---

#### Task 1.6: 修改 CreationToolbar 集成任务创建
**文件**: `packages/drawnix/src/components/toolbar/creation-toolbar.tsx`  
**预估工时**: 3-4h  
**优先级**: P1  
**依赖**: Task 1.2

**描述**:
在现有的创建工具栏中集成任务队列功能，支持异步提交任务。

**验收标准**:
- [x] 引入 useTaskQueue Hook
- [x] "生成"按钮点击时创建任务（不等待完成）
- [x] 表单在 500ms 内重置为初始状态
- [x] 参数验证（使用 validation-utils）
- [x] 防重复提交（5 秒窗口）
- [x] 显示提交成功提示
- [x] 错误处理和提示
- [x] 保持原有功能不受影响
- [x] 单文件 < 500 行（如超限则拆分）
- [x] 组件测试覆盖表单重置

**关键变更**:
```typescript
const handleGenerate = useCallback(async () => {
  // 验证参数
  if (!validateGenerationParams(params)) {
    showError('参数无效');
    return;
  }
  
  // 创建任务
  const task = createTask(params, type);
  
  // 重置表单
  resetForm();
  
  // 显示提示
  showSuccess('任务已添加到队列');
}, [params, type, createTask, resetForm]);
```

---

#### Task 1.7: 集成任务队列到主应用
**文件**: `packages/drawnix/src/drawnix.tsx`  
**预估工时**: 2-3h  
**优先级**: P1  
**依赖**: Task 1.1, Task 1.4

**描述**:
在主应用组件中集成任务队列上下文和 UI。

**验收标准**:
- [x] 添加 TaskToolbar 组件到应用底部
- [x] 初始化 useTaskStorage（恢复任务）
- [x] 处理应用卸载时的清理
- [x] 不影响现有功能
- [x] 单文件 < 500 行（如超限则拆分）

**关键变更**:
```typescript
function Drawnix() {
  useTaskStorage(); // 初始化存储同步
  
  return (
    <div className="drawnix">
      {/* 现有内容 */}
      <TaskToolbar />
    </div>
  );
}
```

---

#### Task 1.8: 编写阶段 1 单元测试
**文件**: 
- `tests/unit/useTaskQueue.spec.ts`
- `tests/unit/useTaskStorage.spec.ts`
- `tests/unit/TaskToolbar.spec.tsx`
- `tests/unit/TaskSummary.spec.tsx`

**预估工时**: 3-4h  
**优先级**: P1  
**依赖**: Task 1.1-1.7

**描述**:
编写阶段 1 的单元测试。

**验收标准**:
- [x] useTaskQueue: 测试所有方法和状态
- [x] useTaskStorage: 测试存储同步逻辑
- [x] TaskToolbar: 测试展开/收起交互
- [x] TaskSummary: 测试摘要计算和显示
- [x] 测试覆盖率 > 75%
- [x] 所有测试通过

---

#### Task 1.9: 编写阶段 1 集成测试
**文件**: `tests/integration/task-creation-flow.spec.ts`  
**预估工时**: 2-3h  
**优先级**: P1  
**依赖**: Task 1.8

**描述**:
测试任务创建的完整流程。

**验收标准**:
- [x] 测试从表单提交到任务创建的完整流程
- [x] 测试表单重置逻辑
- [x] 测试任务持久化和恢复
- [x] 测试防重复提交
- [x] 所有测试通过

---

#### Task 1.10: 阶段 1 验收与优化
**预估工时**: 2h  
**优先级**: P1  
**依赖**: Task 1.1-1.9

**描述**:
验收阶段 1 的成果，进行必要的优化和修复。

**验收标准**:
- [x] 用户可以提交生成任务
- [x] 表单在 500ms 内重置
- [x] TaskToolbar 正确显示任务摘要
- [x] 刷新页面后任务恢复
- [x] 所有测试通过
- [x] 性能目标达成（任务创建 < 200ms）
- [x] 代码审查通过
- [x] 文档更新

---

## 阶段 2: 任务执行与监控 (P2)

### 目标
实现任务的自动执行、状态监控、重试机制和队列面板的展开显示功能。

### 任务列表

#### Task 2.1: 实现 GenerationAPIService
**文件**: `packages/drawnix/src/services/generation-api-service.ts`  
**预估工时**: 3-4h  
**优先级**: P2  
**依赖**: Task 0.2

**描述**:
封装 AI 生成服务的 API 调用逻辑（初期使用模拟数据）。

**验收标准**:
- [x] 实现 `generate(params: GenerationParams, type: TaskType): Promise<TaskResult>`
- [x] 支持取消请求（AbortController）
- [x] 处理超时（fetch timeout）
- [x] 处理网络错误
- [x] 返回标准化响应格式
- [x] 模拟延迟（图片 2-5s, 视频 5-10s）
- [x] 模拟失败场景（10% 概率）
- [x] 错误日志记录
- [x] 单文件 < 400 行
- [x] 单元测试覆盖率 > 75%

**关键 API**:
```typescript
class GenerationAPIService {
  async generate(
    params: GenerationParams,
    type: TaskType,
    signal?: AbortSignal
  ): Promise<TaskResult>
  
  cancelRequest(taskId: string): void
}
```

---

#### Task 2.2: 实现 useRetryStrategy Hook
**文件**: `packages/drawnix/src/hooks/useRetryStrategy.ts`  
**预估工时**: 2-3h  
**优先级**: P2  
**依赖**: Task 0.5

**描述**:
封装重试策略逻辑，管理重试定时器。

**验收标准**:
- [x] 计算下次重试时间
- [x] 管理重试定时器
- [x] 支持取消重试
- [x] 指数退避策略（1min, 5min, 15min）
- [x] 最大重试 3 次
- [x] 自动清理定时器
- [x] 单文件 < 300 行
- [x] 单元测试覆盖率 > 80%

**关键 API**:
```typescript
export function useRetryStrategy(task: Task, onRetry: () => void) {
  return {
    scheduleRetry: () => void,
    cancelRetry: () => void,
    nextRetryAt: number | null,
  };
}
```

---

#### Task 2.3: 实现 useTaskExecutor Hook
**文件**: `packages/drawnix/src/hooks/useTaskExecutor.ts`  
**预估工时**: 4-5h  
**优先级**: P2  
**依赖**: Task 2.1, Task 2.2

**描述**:
管理单个任务的执行生命周期，包括执行、超时检测、重试等。

**验收标准**:
- [x] 监听 pending 状态任务，自动开始执行
- [x] 调用 GenerationAPIService 执行生成
- [x] 超时检测（图片 10min, 视频 30min）
- [x] 失败后触发重试策略
- [x] 更新任务状态（processing, completed, failed, retrying）
- [x] 保存执行结果或错误信息
- [x] 支持取消执行
- [x] 清理定时器和请求
- [x] 单文件 < 400 行
- [x] 单元测试覆盖率 > 75%

**关键 API**:
```typescript
export function useTaskExecutor() {
  // 自动监听并执行 pending 任务
  // 处理超时、重试、状态更新
}
```

---

#### Task 2.4: 实现 TaskItem 组件
**文件**: `packages/drawnix/src/components/task-queue/TaskItem.tsx`  
**预估工时**: 3-4h  
**优先级**: P2  
**依赖**: Task 1.2

**描述**:
显示单个任务的详细信息和操作按钮。

**验收标准**:
- [x] 显示任务类型图标（图片/视频）
- [x] 显示任务参数摘要（prompt 前 50 字符）
- [x] 显示任务状态标签（不同颜色）
- [x] 显示创建时间和执行时长
- [x] 显示重试计数和下次重试时间（retrying 状态）
- [x] 显示错误消息（failed 状态）
- [x] 操作按钮：取消（processing）、重试（failed）、删除（completed/failed）、下载（completed）
- [x] 实时状态更新
- [x] 使用 TDesign 组件（Card, Tag, Button, Tooltip）
- [x] 单文件 < 400 行
- [x] 组件测试覆盖所有状态和操作

**UI 设计**:
```text
┌─────────────────────────────────────────────────┐
│ [图片] 生成一只可爱的猫咪...           [处理中] │
│ 创建时间: 2分钟前 | 执行时长: 1分23秒           │
│ [取消]                                          │
└─────────────────────────────────────────────────┘
```

---

#### Task 2.5: 实现 TaskQueuePanel 组件
**文件**: `packages/drawnix/src/components/task-queue/TaskQueuePanel.tsx`  
**预估工时**: 4-5h  
**优先级**: P2  
**依赖**: Task 2.4

**描述**:
实现可展开/收起的任务队列面板，显示所有任务列表。

**验收标准**:
- [x] 展开/收起动画（60 FPS）
- [x] 显示所有任务（使用 TaskItem 组件）
- [x] 支持按状态筛选（全部/待处理/处理中/已完成/失败）
- [x] 虚拟滚动支持（100+ 任务）
- [x] 空状态提示（无任务时）
- [x] 批量操作按钮（清除已完成、清除失败）
- [x] 使用 TDesign 组件（Tabs, Button, VirtualList）
- [x] 响应式设计
- [x] 单文件 < 450 行
- [x] 组件测试覆盖展开/收起和筛选

**UI 设计**:
```text
┌─────────────────────────────────────────────────┐
│ [全部 | 待处理 | 处理中 | 已完成 | 失败]  [清除] │
├─────────────────────────────────────────────────┤
│ <TaskItem />                                    │
│ <TaskItem />                                    │
│ <TaskItem />                                    │
│ ...                                             │
└─────────────────────────────────────────────────┘
```

---

#### Task 2.6: 集成 TaskExecutor 到主应用
**文件**: `packages/drawnix/src/drawnix.tsx`  
**预估工时**: 2h  
**优先级**: P2  
**依赖**: Task 2.3

**描述**:
在主应用中初始化任务执行器。

**验收标准**:
- [x] 添加 useTaskExecutor Hook
- [x] 应用启动时自动执行待处理任务
- [x] 不影响现有功能
- [x] 单文件 < 500 行

---

#### Task 2.7: 更新 TaskToolbar 集成队列面板
**文件**: `packages/drawnix/src/components/task-queue/TaskToolbar.tsx`  
**预估工时**: 2-3h  
**优先级**: P2  
**依赖**: Task 2.5

**描述**:
在 TaskToolbar 中集成 TaskQueuePanel，实现展开/收起功能。

**验收标准**:
- [x] 点击工具栏展开/收起面板
- [x] 展开状态管理
- [x] 平滑动画过渡
- [x] 点击外部区域收起面板
- [x] 单文件 < 400 行
- [x] 组件测试覆盖展开/收起交互

---

#### Task 2.8: 实现超时检测逻辑
**文件**: `packages/drawnix/src/hooks/useTaskExecutor.ts`（修改）  
**预估工时**: 2h  
**优先级**: P2  
**依赖**: Task 2.3

**描述**:
在任务执行器中添加超时检测和处理。

**验收标准**:
- [x] 图片任务超时时间: 10 分钟
- [x] 视频任务超时时间: 30 分钟
- [x] 超时后标记任务为 failed
- [x] 错误消息明确标注"超时"
- [x] 清理定时器
- [x] 单元测试覆盖超时场景

---

#### Task 2.9: 更新样式文件（阶段 2）
**文件**: `packages/drawnix/src/components/task-queue/task-queue.scss`（修改）  
**预估工时**: 2-3h  
**优先级**: P2  
**依赖**: Task 2.4, Task 2.5

**描述**:
添加 TaskItem 和 TaskQueuePanel 的样式。

**验收标准**:
- [x] TaskItem 样式（不同状态的颜色）
- [x] TaskQueuePanel 样式（展开/收起动画）
- [x] 筛选标签样式
- [x] 虚拟滚动样式优化
- [x] 响应式设计
- [x] 单文件 < 500 行

---

#### Task 2.10: 编写阶段 2 单元测试
**文件**:
- `tests/unit/GenerationAPIService.spec.ts`
- `tests/unit/useRetryStrategy.spec.ts`
- `tests/unit/useTaskExecutor.spec.ts`
- `tests/unit/TaskItem.spec.tsx`
- `tests/unit/TaskQueuePanel.spec.tsx`

**预估工时**: 4-5h  
**优先级**: P2  
**依赖**: Task 2.1-2.9

**描述**:
编写阶段 2 的单元测试。

**验收标准**:
- [x] 测试覆盖率 > 75%
- [x] 测试所有重试场景
- [x] 测试超时场景
- [x] 测试状态更新
- [x] 所有测试通过

---

#### Task 2.11: 编写阶段 2 集成测试
**文件**: `tests/integration/task-execution-flow.spec.ts`  
**预估工时**: 3-4h  
**优先级**: P2  
**依赖**: Task 2.10

**描述**:
测试任务执行的完整流程。

**验收标准**:
- [x] 测试任务自动执行
- [x] 测试状态实时更新
- [x] 测试失败重试流程
- [x] 测试超时处理
- [x] 测试取消任务
- [x] 所有测试通过

---

#### Task 2.12: 阶段 2 验收与优化
**预估工时**: 2-3h  
**优先级**: P2  
**依赖**: Task 2.1-2.11

**描述**:
验收阶段 2 的成果，进行必要的优化。

**验收标准**:
- [x] 任务自动执行
- [x] 状态实时更新（< 5s）
- [x] 失败任务自动重试（指数退避）
- [x] 超时任务正确处理
- [x] 展开/收起动画流畅（60 FPS）
- [x] 所有测试通过
- [x] 性能目标达成
- [x] 代码审查通过

---

## 阶段 3: 内容访问与管理 (P2-P3)

### 目标
实现生成内容的预览、下载、插入功能，以及任务的手动管理操作。

### 任务列表

#### Task 3.1: 实现内容预览功能
**文件**: `packages/drawnix/src/components/task-queue/TaskItem.tsx`（修改）  
**预估工时**: 2-3h  
**优先级**: P2  
**依赖**: Task 2.4

**描述**:
在 TaskItem 中添加预览功能，支持图片和视频的快速预览。

**验收标准**:
- [x] 已完成任务显示预览缩略图
- [x] 点击缩略图打开全屏预览
- [x] 图片预览使用 TDesign ImageViewer
- [x] 视频预览使用 HTML5 video 元素
- [x] 关闭预览快捷键（ESC）
- [x] 单文件 < 450 行
- [x] 组件测试覆盖预览交互

---

#### Task 3.2: 实现下载功能
**文件**: `packages/drawnix/src/utils/download-utils.ts`（新增）  
**预估工时**: 2h  
**优先级**: P2  
**依赖**: 无

**描述**:
实现生成内容的下载功能。

**验收标准**:
- [x] 实现 `downloadFile(url: string, filename: string): void`
- [x] 支持图片格式（PNG, JPG, WebP）
- [x] 支持视频格式（MP4, WebM）
- [x] 使用 blob 下载
- [x] 自动生成文件名（包含时间戳）
- [x] 错误处理
- [x] 单元测试覆盖率 > 80%

---

#### Task 3.3: 实现插入白板功能
**文件**: `packages/drawnix/src/utils/board-utils.ts`（新增）  
**预估工时**: 3-4h  
**优先级**: P2  
**依赖**: 无

**描述**:
实现将生成内容插入到白板的功能。

**验收标准**:
- [x] 实现 `insertImageToBoard(imageUrl: string): void`
- [x] 实现 `insertVideoToBoard(videoUrl: string): void`（如支持）
- [x] 与 Plait 框架集成
- [x] 插入到当前视口中心
- [x] 自动选中插入的元素
- [x] 错误处理
- [x] 单元测试覆盖率 > 75%

---

#### Task 3.4: 在 TaskItem 中集成下载和插入
**文件**: `packages/drawnix/src/components/task-queue/TaskItem.tsx`（修改）  
**预估工时**: 2h  
**优先级**: P2  
**依赖**: Task 3.2, Task 3.3

**描述**:
在 TaskItem 中添加下载和插入按钮。

**验收标准**:
- [x] 已完成任务显示"下载"和"插入"按钮
- [x] 点击"下载"触发文件下载
- [x] 点击"插入"将内容插入白板
- [x] 操作成功后显示提示
- [x] 错误处理和提示
- [x] 单文件 < 500 行
- [x] 组件测试覆盖下载和插入操作

---

#### Task 3.5: 实现任务取消功能
**文件**: `packages/drawnix/src/services/task-queue-service.ts`（修改）  
**预估工时**: 2h  
**优先级**: P2  
**依赖**: Task 0.8, Task 2.1

**描述**:
实现取消待处理或处理中任务的功能。

**验收标准**:
- [x] 更新 `cancelTask(taskId)` 方法
- [x] 取消 API 请求（GenerationAPIService）
- [x] 更新任务状态为 cancelled
- [x] 清理定时器
- [x] 发出 taskUpdated 事件
- [x] 单元测试覆盖取消场景

---

#### Task 3.6: 实现任务重试功能
**文件**: `packages/drawnix/src/hooks/useTaskQueue.ts`（修改）  
**预估工时**: 2h  
**优先级**: P2  
**依赖**: Task 1.2

**描述**:
实现手动重试失败任务的功能。

**验收标准**:
- [x] 实现 `retryTask(taskId)` 方法
- [x] 重置重试计数
- [x] 更新状态为 pending
- [x] 触发自动执行
- [x] 单元测试覆盖重试场景

---

#### Task 3.7: 实现清除任务功能
**文件**: `packages/drawnix/src/hooks/useTaskQueue.ts`（修改）  
**预估工时**: 2h  
**优先级**: P3  
**依赖**: Task 1.2

**描述**:
实现批量清除已完成或失败任务的功能。

**验收标准**:
- [x] 实现 `clearCompleted()` 方法
- [x] 实现 `clearFailed()` 方法
- [x] 从队列和存储中删除任务
- [x] 显示确认对话框
- [x] 操作成功后显示提示
- [x] 单元测试覆盖清除场景

---

#### Task 3.8: 实现任务完成通知
**文件**: `packages/drawnix/src/components/task-queue/TaskToolbar.tsx`（修改）  
**预估工时**: 2-3h  
**优先级**: P3  
**依赖**: Task 1.4

**描述**:
在底部工具栏显示新任务完成的通知。

**验收标准**:
- [x] 监听任务状态变化
- [x] 任务完成时显示通知徽章
- [x] 显示"1 个新任务完成"文本
- [x] 点击通知展开队列并滚动到该任务
- [x] 使用 TDesign Notification 组件
- [x] 自动消失（5 秒后）
- [x] 组件测试覆盖通知显示

---

#### Task 3.9: 阶段 3 验收与优化
**预估工时**: 2h  
**优先级**: P2-P3  
**依赖**: Task 3.1-3.8

**描述**:
验收阶段 3 的成果，进行必要的优化。

**验收标准**:
- [x] 用户可以预览生成内容
- [x] 用户可以下载生成内容
- [x] 用户可以插入内容到白板
- [x] 用户可以取消任务
- [x] 用户可以手动重试任务
- [x] 用户可以清除已完成/失败任务
- [x] 任务完成通知正常显示
- [x] 所有测试通过
- [x] 代码审查通过

---

## 阶段 4: 优化与边界情况 (P3)

### 目标
性能优化、边界情况处理、完善文档和最终验收。

### 任务列表

#### Task 4.1: 实现虚拟滚动优化
**文件**: `packages/drawnix/src/components/task-queue/TaskQueuePanel.tsx`（修改）  
**预估工时**: 3-4h  
**优先级**: P3  
**依赖**: Task 2.5

**描述**:
使用虚拟滚动技术优化大量任务（100+）的渲染性能。

**验收标准**:
- [x] 使用 TDesign VirtualList 或 react-window
- [x] 仅渲染可见区域的任务项
- [x] 100+ 任务时 UI 响应 < 2s
- [x] 滚动流畅（60 FPS）
- [x] 支持动态高度（任务项高度不固定）
- [x] 性能测试验证

---

#### Task 4.2: 实现防重复提交检测
**文件**: `packages/drawnix/src/services/task-queue-service.ts`（修改）  
**预估工时**: 2h  
**优先级**: P3  
**依赖**: Task 0.8

**描述**:
增强防重复提交逻辑，防止用户在 5 秒窗口内提交相同参数的任务。

**验收标准**:
- [x] 计算参数哈希值
- [x] 检查 5 秒窗口内是否有相同哈希的任务
- [x] 重复提交时显示提示
- [x] 单元测试覆盖防重复场景

---

#### Task 4.3: 实现任务按状态筛选
**文件**: `packages/drawnix/src/components/task-queue/TaskQueuePanel.tsx`（修改）  
**预估工时**: 2h  
**优先级**: P3  
**依赖**: Task 2.5

**描述**:
在任务队列面板中添加按状态筛选功能。

**验收标准**:
- [x] 筛选选项：全部、待处理、处理中、已完成、失败
- [x] 使用 TDesign Tabs 组件
- [x] 实时更新任务计数
- [x] 筛选逻辑性能优化（useMemo）
- [x] 组件测试覆盖筛选功能

---

#### Task 4.4: 优化 IndexedDB 性能
**文件**: `packages/drawnix/src/services/storage-service.ts`（修改）  
**预估工时**: 2-3h  
**优先级**: P3  
**依赖**: Task 0.4

**描述**:
优化本地存储的性能，减少读写延迟。

**验收标准**:
- [x] 批量写入优化（防抖 500ms）
- [x] 增量更新（仅更新变化的任务）
- [x] 索引优化（status, createdAt）
- [x] 读取性能测试（100 任务 < 1s）
- [x] 写入性能测试（< 100ms）

---

#### Task 4.5: 实现容量管理
**文件**: `packages/drawnix/src/services/storage-service.ts`（修改）  
**预估工时**: 2h  
**优先级**: P3  
**依赖**: Task 0.4

**描述**:
监控本地存储容量，防止超限，自动清理旧任务。

**验收标准**:
- [x] 监控存储容量使用
- [x] 接近 50MB 时显示警告
- [x] 自动清理最旧的已完成/失败任务
- [x] 保留最近 100 个任务
- [x] 用户可手动触发清理

---

#### Task 4.6: 添加错误边界处理
**文件**: `packages/drawnix/src/components/task-queue/ErrorBoundary.tsx`（新增）  
**预估工时**: 2h  
**优先级**: P3  
**依赖**: 无

**描述**:
添加 React 错误边界，防止任务队列组件崩溃影响主应用。

**验收标准**:
- [x] 实现 ErrorBoundary 组件
- [x] 捕获任务队列组件的错误
- [x] 显示友好的错误提示
- [x] 提供重置按钮
- [x] 错误日志记录
- [x] 组件测试覆盖错误场景

---

#### Task 4.7: 性能测试与优化
**文件**: `tests/performance/task-queue-performance.spec.ts`（新增）  
**预估工时**: 3-4h  
**优先级**: P3  
**依赖**: Task 4.1-4.6

**描述**:
进行全面的性能测试，确保达成所有性能目标。

**验收标准**:
- [x] 任务创建响应 < 200ms
- [x] 表单重置 < 500ms
- [x] 状态更新延迟 < 5s
- [x] 工具栏展开/收起 < 200ms, 60 FPS
- [x] 本地存储读取 < 1s (100 任务)
- [x] 本地存储写入 < 100ms
- [x] 100+ 任务 UI 响应 < 2s
- [x] 所有性能目标达成

---

#### Task 4.8: 最终验收与文档完善
**预估工时**: 3-4h  
**优先级**: P3  
**依赖**: Task 4.1-4.7

**描述**:
最终验收，完善文档，准备发布。

**验收标准**:
- [x] 所有功能需求实现
- [x] 所有验收场景通过
- [x] 所有测试通过（单元、集成、E2E）
- [x] 所有性能目标达成
- [x] 代码审查通过
- [x] 更新用户文档
- [x] 更新开发者文档
- [x] 更新 CHANGELOG
- [x] 准备发布说明

---

## 任务依赖关系图

```text
阶段 0
  └─ 0.1, 0.2, 0.3 (并行)
  └─ 0.4 ← 0.1, 0.3
  └─ 0.5 ← 0.3
  └─ 0.6 ← 0.1, 0.3
  └─ 0.7 ← 0.1, 0.2
  └─ 0.8 ← 0.1-0.7

阶段 1
  └─ 1.1 ← 0.4, 0.8
  └─ 1.2 ← 0.8, 1.1
  └─ 1.3 ← 1.2
  └─ 1.4 ← 1.3
  └─ 1.5 (并行)
  └─ 1.6 ← 1.2
  └─ 1.7 ← 1.1, 1.4
  └─ 1.8 ← 1.1-1.7
  └─ 1.9 ← 1.8
  └─ 1.10 ← 1.1-1.9

阶段 2
  └─ 2.1 ← 0.2
  └─ 2.2 ← 0.5
  └─ 2.3 ← 2.1, 2.2
  └─ 2.4 ← 1.2
  └─ 2.5 ← 2.4
  └─ 2.6 ← 2.3
  └─ 2.7 ← 2.5
  └─ 2.8 ← 2.3
  └─ 2.9 ← 2.4, 2.5
  └─ 2.10 ← 2.1-2.9
  └─ 2.11 ← 2.10
  └─ 2.12 ← 2.1-2.11

阶段 3
  └─ 3.1 ← 2.4
  └─ 3.2 (并行)
  └─ 3.3 (并行)
  └─ 3.4 ← 3.2, 3.3
  └─ 3.5 ← 0.8, 2.1
  └─ 3.6 ← 1.2
  └─ 3.7 ← 1.2
  └─ 3.8 ← 1.4
  └─ 3.9 ← 3.1-3.8

阶段 4
  └─ 4.1 ← 2.5
  └─ 4.2 ← 0.8
  └─ 4.3 ← 2.5
  └─ 4.4 ← 0.4
  └─ 4.5 ← 0.4
  └─ 4.6 (并行)
  └─ 4.7 ← 4.1-4.6
  └─ 4.8 ← 4.1-4.7
```

---

## 风险管理

### 高风险任务

| 任务 | 风险 | 缓解措施 |
|------|------|---------|
| Task 0.8 | TaskQueueService 复杂度高，可能超过 500 行 | 早期设计审查，及时拆分子模块 |
| Task 2.3 | useTaskExecutor 逻辑复杂，测试困难 | 使用状态机模式，模拟 API 响应 |
| Task 4.1 | 虚拟滚动实现复杂 | 使用成熟库（react-window），留足测试时间 |
| Task 4.4 | IndexedDB 性能优化效果不确定 | 早期性能基准测试，预留优化缓冲 |

### 阻塞风险

如果以下任务延期，将阻塞后续阶段：
- **Task 0.8**: 阻塞整个阶段 1 和 2
- **Task 1.2**: 阻塞大部分 UI 组件开发
- **Task 2.3**: 阻塞任务执行功能

**应对措施**: 优先投入资源到关键路径任务，增加代码审查频率。

---

## 测试策略总结

### 测试覆盖率目标

| 测试类型 | 目标覆盖率 | 关键测试内容 |
|---------|-----------|-------------|
| 单元测试 | > 80% | Services, Hooks, Utils |
| 组件测试 | > 75% | 所有 UI 组件 |
| 集成测试 | 100% 关键流程 | 任务创建、执行、管理 |
| E2E 测试 | 100% 用户场景 | 5 个核心用户故事 |

### 关键测试场景

1. **任务创建流程**: 表单提交 → 任务创建 → 表单重置 → 持久化
2. **任务执行流程**: 自动执行 → 状态更新 → 完成/失败处理
3. **任务重试流程**: 失败 → 延迟重试 → 最终失败
4. **任务管理流程**: 取消 → 重试 → 清除
5. **存储恢复流程**: 刷新页面 → 从 IndexedDB 恢复 → 状态同步

---

## 发布计划

### 里程碑

| 里程碑 | 完成条件 | 预计时间 |
|--------|---------|---------|
| M1: 基础设施完成 | 阶段 0 所有任务完成 | Week 1 |
| M2: 任务创建完成 | 阶段 1 所有任务完成 | Week 2-3 |
| M3: 任务执行完成 | 阶段 2 所有任务完成 | Week 4-5 |
| M4: 功能完整 | 阶段 3 所有任务完成 | Week 6 |
| M5: 生产就绪 | 阶段 4 所有任务完成 | Week 7 |

### 发布策略

1. **内部测试** (Week 7): 开发团队内部测试
2. **Beta 测试** (Week 8): 邀请 10-20 名用户测试
3. **灰度发布** (Week 9):
   - 10% 用户（1-2 天）
   - 50% 用户（3-4 天）
   - 100% 用户（第 5 天）
4. **正式发布** (Week 10): 全量发布，发布公告

---

## 后续优化任务

以下功能不在当前 MVP 范围内，留待后续迭代：

### 短期优化 (1-3 个月)
- [ ] 任务优先级支持
- [ ] 任务执行进度条
- [ ] 任务分组和标签
- [ ] 批量下载功能
- [ ] 导出任务历史

### 中期优化 (3-6 个月)
- [ ] 任务模板功能
- [ ] 任务统计和分析
- [ ] 多语言支持
- [ ] 键盘快捷键
- [ ] 无障碍访问优化

### 长期优化 (6-12 个月)
- [ ] 服务器端持久化（可选）
- [ ] 多设备同步
- [ ] 协作队列（多用户共享）
- [ ] 任务调度优化（优先级队列）
- [ ] Webhook 集成

---

**文档版本**: 1.0  
**最后更新**: 2025-11-22  
**维护者**: 开发团队
