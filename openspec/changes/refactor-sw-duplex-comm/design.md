# Design: postmessage-duplex 通信层重构

## Context

当前系统使用原生 `postMessage` API 实现 SW 与应用层通信：
- 应用层 → SW：直接 `controller.postMessage()`
- SW → 应用层：`broadcastToClients()` 广播所有窗口

这种模式在多标签页场景下存在问题：
1. 多个页面同时提交相同任务，SW 的去重检查存在时间窗口
2. 广播消息所有页面都会收到，无法区分请求来源
3. 请求-响应模式需要手动用 RxJS 实现

## Goals / Non-Goals

### Goals
- 使用 postmessage-duplex 实现双工通信
- 解决多标签页任务重复问题
- 简化请求-响应模式的实现
- 保持向后兼容（渐进式迁移）

### Non-Goals
- 不改变现有业务逻辑
- 不改变 IndexedDB 存储结构
- 不改变任务执行流程

## Decisions

### 1. 通信架构

```
┌─────────────────┐        ┌──────────────────────┐        ┌─────────────────┐
│   Tab 1 (Page)  │        │    Service Worker    │        │   Tab 2 (Page)  │
├─────────────────┤        ├──────────────────────┤        ├─────────────────┤
│ ServiceWorker   │◄──────►│ Per-client channels  │◄──────►│ ServiceWorker   │
│ Channel         │  RPC   │ Map<clientId,Channel>│  RPC   │ Channel         │
└─────────────────┘        └──────────────────────┘        └─────────────────┘
```

- 每个页面创建独立的 `ServiceWorkerChannel`
- SW 端维护 `Map<clientId, channel>` 管理所有连接
- 请求-响应使用 `call` 方法，事件通知使用 `subscribe`

### 2. 消息类型划分

| 操作 | 当前方式 | 改造后方式 |
|------|---------|-----------|
| 任务创建 | postMessage + 监听 | `call('task:create', params)` → `{taskId, status}` |
| 任务取消 | postMessage | `call('task:cancel', {taskId})` → `{success}` |
| 任务重试 | postMessage | `call('task:retry', {taskId})` → `{success}` |
| 获取任务列表 | postMessage + timeout | `call('task:list')` → `{tasks}` |
| 任务状态变更 | broadcast | `subscribe('task:status')` |
| 任务完成 | broadcast | `subscribe('task:completed')` |
| Chat 流式 | broadcast | `subscribe('chat:chunk')` |

### 3. 任务创建流程改造

**当前流程**：
```
1. 应用层生成 taskId
2. 本地创建任务（乐观更新）
3. postMessage 到 SW
4. SW 检查重复，可能拒绝
5. 广播 TASK_CREATED
```

**改造后流程**：
```
1. 应用层调用 channel.call('task:create', params)
2. SW 检查重复
   - 已存在：返回 {success: false, existingTaskId}
   - 新建：创建任务，返回 {success: true, task}
3. 应用层根据响应更新本地状态
4. SW 广播 task:created 给其他客户端（排除发起者）
```

### 4. 多页面同步

- SW 维护所有通道引用
- 当任务状态变更时，广播给所有订阅该事件的通道
- 每个通道独立订阅，避免重复处理

### 5. Service Worker 端集成

由于 SW 不支持直接 import npm 模块，有两种方案：

**方案 A（推荐）**：打包时内联
- 使用 Vite 的 `?inline` 或自定义打包将库代码内联到 SW

**方案 B**：复制核心代码
- 将 postmessage-duplex 的 SW 相关代码复制到项目中

选择 **方案 A**，在 SW 构建配置中处理。

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| SW 端集成复杂 | 使用打包工具处理，文档中有示例 |
| 迁移风险 | 渐进式迁移，保留旧消息类型兼容 |
| 库稳定性 | 库较新（v1.0.0），需关注 issues |

## Migration Plan

### Phase 1：基础设施
1. 安装 postmessage-duplex 依赖
2. 配置 SW 打包支持
3. 创建新的通信服务（与现有并存）

### Phase 2：核心功能迁移
1. 迁移任务创建为 call 模式
2. 迁移任务状态为 subscribe 模式
3. 迁移 Chat 流式为 subscribe 模式

### Phase 3：清理
1. 移除旧的 RxJS 订阅逻辑
2. 移除兼容代码
3. 更新文档

## Open Questions

1. SW 打包方式的具体实现细节？
   - 需要测试 Vite 对 SW 入口的打包行为
   
2. 是否需要支持消息压缩？
   - 当前任务数据量不大，暂不需要
