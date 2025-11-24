# 实施计划：内容生成批量任务队列

**分支**: `001-batch-task-queue` | **日期**: 2025-11-22 | **规格**: [spec.md](./spec.md)  
**输入**: 功能规格来自 `/specs/001-batch-task-queue/spec.md`

## 摘要

实现异步内容生成任务队列系统，允许用户提交图片和视频生成请求而无需等待完成。系统将在浏览器本地存储任务数据，通过页面底部固定工具栏提供任务监控和管理界面。核心技术方案采用 React + TypeScript + localforage，集成到现有的 Aitu 白板应用架构中。

## 技术上下文

**语言/版本**: TypeScript 5.4+ / React 18.3+  
**主要依赖**: 
- localforage 1.10+ (浏览器本地存储)
- TDesign React 1.14+ (UI 组件库)
- RxJS 7.8+ (异步事件流管理)
- Plait 框架 (现有白板核心)

**存储**: IndexedDB (通过 localforage 抽象层)  
**测试**: Jest + React Testing Library (单元测试), Playwright (E2E 测试)  
**目标平台**: Web 浏览器 (Chrome 90+, Firefox 88+, Safari 14+)  
**项目类型**: Web 应用 (Nx monorepo 中的 packages/drawnix 扩展)  
**性能目标**: 
- 任务队列 UI 响应 < 200ms
- 本地存储读写 < 100ms
- 支持 100+ 并发任务无性能下降
- 60 FPS 动画流畅度

**约束**:
- 单文件不超过 500 行代码
- 浏览器本地存储限制 (IndexedDB ~50MB)
- 无服务器端持久化
- 兼容现有 Plait 插件架构

**规模/范围**:
- 新增 8-12 个 React 组件
- 新增 4-6 个自定义 Hooks
- 新增 3-5 个工具模块
- 预计 2000-3000 行新代码

## 项目结构

### 文档 (本功能)

```text
specs/001-batch-task-queue/
├── plan.md              # 本文件 (/speckit.plan 命令输出)
├── spec.md              # 功能规格说明
├── checklists/          # 质量检查清单
│   └── requirements.md  # 需求完整性检查
└── tasks.md             # 阶段 2 输出 (/speckit.tasks 命令 - 尚未创建)
```

### 源代码 (仓库根目录)

```text
packages/drawnix/src/
├── components/
│   ├── task-queue/                    # 新增：任务队列组件
│   │   ├── TaskToolbar.tsx            # 底部固定工具栏
│   │   ├── TaskQueuePanel.tsx         # 可展开的任务队列面板
│   │   ├── TaskItem.tsx               # 单个任务项组件
│   │   ├── TaskSummary.tsx            # 任务摘要显示
│   │   └── task-queue.scss            # 样式文件
│   └── toolbar/
│       └── creation-toolbar.tsx        # 修改：集成任务创建
│
├── hooks/
│   ├── useTaskQueue.ts                # 新增：任务队列管理 Hook
│   ├── useTaskStorage.ts              # 新增：本地存储操作 Hook
│   ├── useTaskExecutor.ts             # 新增：任务执行器 Hook
│   └── useRetryStrategy.ts            # 新增：重试策略 Hook
│
├── services/
│   ├── task-queue-service.ts          # 新增：任务队列核心服务
│   ├── generation-api-service.ts      # 新增：AI 生成 API 调用服务
│   └── storage-service.ts             # 新增：IndexedDB 存储服务
│
├── utils/
│   ├── task-utils.ts                  # 新增：任务工具函数
│   ├── retry-utils.ts                 # 新增：重试策略工具
│   └── validation-utils.ts            # 新增：参数验证工具
│
├── types/
│   ├── task.types.ts                  # 新增：任务相关类型定义
│   └── generation.types.ts            # 新增：生成相关类型定义
│
├── constants/
│   └── TASK_CONSTANTS.ts              # 新增：任务相关常量
│
└── drawnix.tsx                         # 修改：集成任务队列上下文

tests/
├── unit/
│   ├── task-queue-service.spec.ts
│   ├── useTaskQueue.spec.ts
│   ├── retry-utils.spec.ts
│   └── TaskToolbar.spec.tsx
│
└── integration/
    └── task-queue-flow.spec.ts
```

**结构决策**: 采用单一 Web 应用结构，在现有 `packages/drawnix` 包中扩展功能。选择此结构是因为：
1. 任务队列是白板应用的核心功能扩展，不是独立应用
2. 需要与现有组件（creation-toolbar）深度集成
3. 共享现有的 UI 组件库和样式系统
4. 保持 Nx monorepo 的一致性

## 系统架构

### 架构层次

```text
┌─────────────────────────────────────────────────────────────┐
│  UI Layer (React Components)                                 │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │  TaskToolbar     │  │  Creation        │                 │
│  │  (Bottom Bar)    │  │  Toolbar         │                 │
│  └────────┬─────────┘  └────────┬─────────┘                 │
│           │                     │                            │
│  ┌────────▼──────────────────────▼─────────┐                │
│  │     TaskQueuePanel (Expandable)        │                │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐  │                │
│  │  │TaskItem │ │TaskItem │ │TaskItem │  │                │
│  │  └─────────┘ └─────────┘ └─────────┘  │                │
│  └──────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                         │
┌─────────────────────────▼─────────────────────────────────────┐
│  Business Logic Layer (Hooks & Services)                      │
│  ┌──────────────────┐  ┌──────────────────┐                  │
│  │  useTaskQueue    │  │ useTaskExecutor  │                  │
│  │  (State Mgmt)    │  │ (Execution)      │                  │
│  └────────┬─────────┘  └────────┬─────────┘                  │
│           │                     │                             │
│  ┌────────▼──────────────────────▼─────────┐                 │
│  │   TaskQueueService (Core Logic)        │                 │
│  │   - Task CRUD                            │                 │
│  │   - Status Management                    │                 │
│  │   - Event Emission (RxJS)               │                 │
│  └──────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
                         │
┌─────────────────────────▼─────────────────────────────────────┐
│  Integration Layer (External Services)                        │
│  ┌──────────────────┐  ┌──────────────────┐                  │
│  │  StorageService  │  │ GenerationAPI    │                  │
│  │  (IndexedDB)     │  │ Service          │                  │
│  │  - localforage   │  │ (AI 生成)        │                  │
│  └──────────────────┘  └──────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### 核心组件职责

**TaskToolbar (底部工具栏)**
- 显示任务摘要（生成中/完成/失败计数）
- 响应点击展开/收起队列面板
- 显示新任务完成通知
- 固定在页面底部，不遮挡主工作区

**TaskQueuePanel (任务队列面板)**
- 展开/收起动画（60 FPS）
- 显示所有任务的列表视图
- 支持按状态筛选（全部/待处理/处理中/已完成/失败）
- 虚拟滚动支持（处理 100+ 任务）

**TaskItem (任务项)**
- 显示任务详细信息（类型、参数、状态、进度）
- 显示重试计数和下次重试时间
- 提供操作按钮（取消/重试/删除/下载）
- 实时状态更新

**TaskQueueService (核心服务)**
- 单例模式，全局任务队列管理
- RxJS Subject 发布任务状态变化事件
- 支持 CRUD 操作（创建、读取、更新、删除任务）
- 超时检测和自动标记失败
- 防重复提交检测（5秒窗口）

**useTaskQueue (状态管理 Hook)**
- 订阅 TaskQueueService 的事件流
- 提供 React 组件友好的状态和方法
- 自动同步到本地存储
- 处理组件挂载/卸载时的订阅清理

**useTaskExecutor (执行器 Hook)**
- 管理单个任务的执行生命周期
- 实施指数退避重试策略（1min, 5min, 15min）
- 处理超时检测（图片 10min, 视频 30min）
- 调用 GenerationAPIService 执行实际生成

**StorageService (存储服务)**
- 封装 localforage API
- 提供任务队列的持久化和恢复
- 处理 IndexedDB 容量限制
- 支持数据迁移和版本管理

**GenerationAPIService (生成 API 服务)**
- 调用后台 AI 生成服务（图片/视频）
- 处理请求超时和网络错误
- 返回标准化的响应格式
- 支持请求取消（AbortController）

### 数据流

**任务创建流程**:
```text
1. 用户在 CreationToolbar 填写表单，点击"生成"
2. 表单验证 → 失败则提示错误
3. 创建任务对象 (TaskQueueService.createTask)
4. 防重复检查 → 如重复则拒绝
5. 添加到队列 → 发出 'taskCreated' 事件
6. 保存到 IndexedDB (StorageService)
7. 重置表单为初始状态
8. 更新 TaskToolbar 摘要显示
9. useTaskExecutor 监听到新任务 → 开始执行
```

**任务执行流程**:
```text
1. useTaskExecutor 检测到 'pending' 状态任务
2. 更新状态为 'processing' → 发出事件 → 保存
3. 调用 GenerationAPIService.generate(params)
4. 设置超时定时器 (图片 10min / 视频 30min)
5a. 成功响应 → 更新状态为 'completed' → 保存结果
5b. 失败响应 → 检查重试次数
    - 未达上限 → 进入 'retrying' 状态 → 设置重试定时器
    - 已达上限 → 更新状态为 'failed' → 保存错误信息
5c. 超时 → 更新状态为 'failed' (超时错误)
6. 清除定时器，发出状态变化事件
7. 更新 UI 显示
```

**状态同步流程**:
```text
1. TaskQueueService 发出事件 (RxJS Subject)
2. useTaskQueue 订阅并更新 React 状态
3. React 组件重新渲染
4. StorageService 异步写入 IndexedDB
5. 页面刷新时，从 IndexedDB 恢复状态
```

## 数据模型

### 核心类型定义

```typescript
// task.types.ts

export enum TaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  RETRYING = 'retrying',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum TaskType {
  IMAGE = 'image',
  VIDEO = 'video'
}

export interface GenerationParams {
  prompt: string;
  width?: number;
  height?: number;
  duration?: number; // 仅视频
  style?: string;
  seed?: number;
  [key: string]: any; // 扩展参数
}

export interface Task {
  id: string;                    // UUID
  type: TaskType;
  status: TaskStatus;
  params: GenerationParams;
  createdAt: number;             // Unix timestamp (ms)
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: TaskResult;
  error?: TaskError;
  retryCount: number;
  nextRetryAt?: number;
  userId?: string;               // 预留多用户支持
}

export interface TaskResult {
  url: string;                   // 生成内容的 URL
  format: string;                // 文件格式 (png, jpg, mp4)
  size: number;                  // 文件大小 (bytes)
  width?: number;
  height?: number;
  duration?: number;             // 仅视频
}

export interface TaskError {
  code: string;                  // 错误代码 (TIMEOUT, NETWORK, API_ERROR, etc.)
  message: string;
  details?: any;
}

export interface TaskQueueState {
  tasks: Map<string, Task>;      // taskId -> Task
  taskOrder: string[];           // 按创建时间排序的 taskId 数组
}
```

### 本地存储模式

**IndexedDB 数据库结构**:
```text
数据库名: aitu-task-queue
版本: 1

Object Store: tasks
  - keyPath: id
  - 索引:
    - status (非唯一)
    - createdAt (非唯一)
    - type (非唯一)
```

**存储策略**:
- 每次任务状态变化时异步写入
- 应用启动时一次性读取所有任务
- 定期清理已完成/失败任务（保留最近 100 个）
- 超过 50MB 时警告用户

## 关键决策

### 1. 存储技术选择：IndexedDB vs LocalStorage

**决策**: 使用 IndexedDB (通过 localforage 封装)

**理由**:
- LocalStorage 容量限制 ~5MB，无法支持 100+ 任务队列
- IndexedDB 支持异步操作，不阻塞 UI
- localforage 提供简洁的 Promise API，降低复杂度
- IndexedDB 支持索引，便于按状态筛选任务

### 2. 状态管理：Context vs 全局 Service

**决策**: 混合模式 - 全局 Service + React Context

**理由**:
- TaskQueueService 作为单例，提供框架无关的核心逻辑
- useTaskQueue Hook 桥接 Service 和 React 生态
- 便于单元测试（Service 可独立测试）
- 未来可支持其他 UI 框架（Angular/Vue）

### 3. 重试策略：立即重试 vs 指数退避

**决策**: 指数退避（1min, 5min, 15min）

**理由**:
- 防止服务故障时的雷击效应
- 给后端服务恢复时间
- 规格明确要求指数退避
- 最多 3 次重试，总等待时间 ~21 分钟

### 4. UI 位置：侧边栏 vs 底部工具栏

**决策**: 底部固定工具栏 + 可展开面板

**理由**:
- 规格明确要求底部工具栏
- 不遮挡主白板工作区
- 摘要常驻可见，快速了解任务状态
- 展开面板支持详细管理

### 5. 任务执行：前端轮询 vs 后端推送

**决策**: 前端主动执行 + 轮询状态

**理由**:
- 无服务器端持久化（规格约束）
- 简化架构，减少后端依赖
- 浏览器关闭时任务暂停，重新打开时恢复
- 适合单用户场景

## 实施阶段

### 阶段 0: 基础设施（P1 依赖）

**任务**:
1. 创建类型定义文件 (task.types.ts, generation.types.ts)
2. 实现 StorageService (IndexedDB 封装)
3. 实现 TaskQueueService 核心逻辑（无 UI）
4. 实现 retry-utils（指数退避策略）
5. 编写单元测试（StorageService, TaskQueueService, retry-utils）

**验收标准**:
- StorageService 可读写任务数据
- TaskQueueService 可创建/更新/删除任务
- 重试策略正确计算延迟时间
- 测试覆盖率 > 80%

### 阶段 1: 任务创建与持久化（P1）

**任务**:
1. 实现 useTaskQueue Hook
2. 实现 useTaskStorage Hook（本地存储同步）
3. 修改 CreationToolbar，集成任务创建
4. 实现 TaskToolbar 组件（摘要显示）
5. 实现表单重置逻辑
6. 编写组件测试

**验收标准**:
- 用户点击"生成"后，任务添加到队列
- 表单在 500ms 内重置
- TaskToolbar 显示正确的任务计数
- 刷新页面后，任务队列恢复

### 阶段 2: 任务执行与监控（P2）

**任务**:
1. 实现 GenerationAPIService（模拟 AI 生成 API）
2. 实现 useTaskExecutor Hook
3. 实现 TaskQueuePanel 组件（展开/收起）
4. 实现 TaskItem 组件（任务详情）
5. 实现超时检测逻辑
6. 实现重试逻辑（指数退避）
7. 编写集成测试

**验收标准**:
- 任务自动开始执行
- 状态实时更新（5秒内）
- 超时任务正确标记为失败
- 失败任务自动重试（最多 3 次）
- 展开/收起动画流畅（60 FPS）

### 阶段 3: 内容访问与管理（P2-P3）

**任务**:
1. 实现任务结果预览功能
2. 实现下载/插入操作
3. 实现任务取消功能
4. 实现任务重试功能
5. 实现清除已完成任务功能
6. 添加任务完成通知
7. 编写 E2E 测试

**验收标准**:
- 用户可预览生成的图片/视频
- 用户可下载或插入内容到白板
- 用户可取消待处理/处理中任务
- 用户可手动重试失败任务
- 完成通知正确显示

### 阶段 4: 优化与边界情况（P3）

**任务**:
1. 实现虚拟滚动（支持 100+ 任务）
2. 实现防重复提交检测（5秒窗口）
3. 添加任务按状态筛选
4. 优化 IndexedDB 性能
5. 添加错误边界处理
6. 性能测试和优化
7. 完善文档

**验收标准**:
- 100+ 任务时 UI 响应 < 2秒
- 重复提交被正确拦截
- 筛选功能正常工作
- 所有边界情况正常处理
- 性能目标全部达成

## 技术约束与风险

### 约束

1. **单文件 500 行限制**
   - 风险：大型组件可能超限
   - 缓解：严格组件拆分，提取子组件和 Hooks

2. **浏览器存储限制**
   - 风险：IndexedDB ~50MB，可能不足
   - 缓解：定期清理旧任务，保留最近 100 个

3. **无服务器端持久化**
   - 风险：跨设备/浏览器无法同步
   - 缓解：在 UI 中明确提示用户

4. **浏览器关闭时任务暂停**
   - 风险：长视频生成可能中断
   - 缓解：提示用户保持页面打开

### 风险

1. **后台 AI 服务不稳定**
   - 影响：任务大量失败
   - 缓解：指数退避重试，清晰的错误提示

2. **浏览器兼容性**
   - 影响：IndexedDB 在旧浏览器可能不可用
   - 缓解：降级到 LocalStorage，限制任务数量

3. **性能问题（100+ 任务）**
   - 影响：UI 卡顿
   - 缓解：虚拟滚动，分页加载

4. **内存泄漏**
   - 影响：长时间运行后浏览器崩溃
   - 缓解：正确清理 RxJS 订阅，定期清理已完成任务

## 测试策略

### 单元测试

**目标覆盖率**: 80%+

**重点测试模块**:
- StorageService: CRUD 操作，错误处理
- TaskQueueService: 状态管理，事件发布
- retry-utils: 延迟计算，边界情况
- validation-utils: 参数验证

### 组件测试

**重点组件**:
- TaskToolbar: 摘要显示，点击展开
- TaskQueuePanel: 展开/收起，任务列表渲染
- TaskItem: 状态显示，操作按钮

**测试场景**:
- 不同任务状态下的 UI 渲染
- 用户交互（点击、输入）
- 状态变化时的重新渲染
- 边界情况（空队列、大量任务）

### 集成测试

**关键流程**:
1. 完整任务生命周期（创建 → 执行 → 完成）
2. 任务失败与重试
3. 任务超时处理
4. 本地存储持久化与恢复

### E2E 测试

**关键用户场景**:
1. 用户提交图片生成任务 → 查看进度 → 下载结果
2. 用户提交多个任务 → 管理队列 → 取消任务
3. 用户刷新页面 → 任务队列恢复
4. 任务失败 → 自动重试 → 最终失败

## 性能目标

| 指标 | 目标 | 测量方法 |
|------|------|---------|
| 任务创建响应时间 | < 200ms | Performance API |
| 表单重置时间 | < 500ms | Performance API |
| 状态更新延迟 | < 5s | 时间戳对比 |
| 工具栏展开/收起 | < 200ms, 60 FPS | Chrome DevTools Performance |
| 本地存储读取 | < 1s (100 任务) | Performance API |
| 本地存储写入 | < 100ms | Performance API |
| 100+ 任务 UI 响应 | < 2s | Performance API |

## 可观测性

### 日志记录

**日志级别**:
- ERROR: 任务失败、存储错误、API 错误
- WARN: 重试触发、超时警告、容量警告
- INFO: 任务创建、状态变化、用户操作
- DEBUG: 内部状态变化、存储操作

**日志格式**:
```typescript
{
  timestamp: number,
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG',
  category: 'TASK' | 'STORAGE' | 'API' | 'UI',
  message: string,
  taskId?: string,
  error?: Error,
  metadata?: object
}
```

### 监控指标

**业务指标**:
- 任务创建速率（每分钟）
- 任务完成率
- 任务失败率
- 平均任务执行时间
- 重试次数分布

**技术指标**:
- 本地存储容量使用
- IndexedDB 读写耗时
- 组件渲染耗时
- 内存使用趋势

## 部署与回滚

### 部署策略

**渐进式发布**:
1. 内部测试环境（develop 分支）
2. Beta 用户测试（staging 环境）
3. 生产环境灰度发布（10% → 50% → 100%）

**功能开关**:
- 在 Aitu Context 中添加 `enableTaskQueue` 标志
- 允许动态启用/禁用功能
- 便于快速回滚

### 回滚计划

**触发条件**:
- 任务失败率 > 30%
- 页面崩溃率 > 5%
- 用户投诉 > 阈值

**回滚步骤**:
1. 设置 `enableTaskQueue = false`
2. 推送配置更新
3. 监控系统恢复
4. 分析失败原因
5. 修复后重新发布

## 文档交付

1. **用户文档**:
   - 功能使用指南
   - 常见问题 FAQ
   - 故障排查指南

2. **开发者文档**:
   - API 参考文档
   - 架构设计文档
   - 代码注释（JSDoc）

3. **运维文档**:
   - 监控指标说明
   - 告警阈值配置
   - 应急响应流程

## 后续优化方向

### 短期 (1-3 个月)
- 添加任务优先级支持
- 优化大批量任务性能
- 增强错误提示的友好性
- 添加任务执行历史统计

### 中期 (3-6 个月)
- 支持任务分组和标签
- 添加任务执行进度条
- 实现任务导出/导入功能
- 添加任务模板功能

### 长期 (6-12 个月)
- 服务器端持久化（可选）
- 多设备同步
- 协作队列（多用户共享）
- 任务调度优化（优先级队列）
