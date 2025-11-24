# Research: 批量生成数量选择

## 技术决策

### 1. 数量选择UI组件设计

**Decision**: 使用TDesign的RadioGroup + InputNumber组合

**Rationale**:
- RadioGroup提供预设选项的快速选择（1/2/4）
- InputNumber提供自定义数值输入，内置数值验证
- 符合TDesign设计规范，保持UI一致性

**Alternatives considered**:
- 纯按钮组：缺少自定义输入能力
- 纯输入框：预设选项不够直观

### 2. 批量任务创建策略

**Decision**: 循环调用现有createTask方法，使用batchId关联

**Rationale**:
- 最小化对现有服务的改动
- 每个任务独立执行、独立状态跟踪
- batchId用于在UI中分组展示

**Alternatives considered**:
- 新建批量任务类型：过于复杂，破坏现有架构
- 单个任务多个结果：与现有数据模型不兼容

### 3. 用户偏好存储

**Decision**: 使用localStorage存储用户最近选择的生成数量

**Rationale**:
- 轻量级存储需求
- 与现有缓存策略一致（如PREVIEW_CACHE_KEY）
- 无需持久化到localforage

**Alternatives considered**:
- localforage：过重，不需要IndexedDB
- SessionStorage：跨会话不保持

### 4. 状态联动实现

**Decision**: 自定义hook useGenerationCount 管理状态

**Rationale**:
- 封装预设/自定义状态切换逻辑
- 提供输入验证和范围限制
- 可在图片和视频生成组件间复用

**Alternatives considered**:
- 组件内部状态：重复代码，难以复用
- Context：过重，仅两个组件使用

### 5. 批量任务并行执行

**Decision**: 复用现有taskQueueService的并行执行能力

**Rationale**:
- 现有服务已支持多任务并行处理
- 无需修改任务执行器核心逻辑
- 批量任务自然分散到执行队列

**Alternatives considered**:
- 新建批量执行器：增加复杂度
- 串行执行：违背用户期望的并行体验

## 实现约束

1. 最大生成数量限制为8（基于API限制和用户体验平衡）
2. 预设选项固定为1/2/4（覆盖最常用场景）
3. 输入范围：1-8（整数）
4. 默认值：1（单个生成，向后兼容）

## 依赖关系

- TDesign React: RadioGroup, InputNumber, Tooltip
- 现有组件：ai-image-generation.tsx, ai-video-generation.tsx
- 现有服务：task-queue-service.ts
- 现有Hook：useTaskQueue.ts
