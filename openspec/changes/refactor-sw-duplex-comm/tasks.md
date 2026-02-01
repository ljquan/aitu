# Tasks: postmessage-duplex 通信层重构

## 1. 基础设施

- [ ] 1.1 安装 postmessage-duplex 依赖到 packages/drawnix
- [ ] 1.2 配置 SW 打包支持（内联 postmessage-duplex 到 SW bundle）
- [ ] 1.3 创建类型定义文件 `sw-channel-types.ts`

## 2. 应用层改造

- [ ] 2.1 创建 `SWDuplexClient` 新服务（基于 ServiceWorkerChannel）
- [ ] 2.2 实现任务创建 RPC 方法 `task:create`
- [ ] 2.3 实现任务查询 RPC 方法 `task:list`, `task:get`
- [ ] 2.4 实现任务操作 RPC 方法 `task:cancel`, `task:retry`, `task:delete`
- [ ] 2.5 实现事件订阅 `task:status`, `task:completed`, `task:failed`
- [ ] 2.6 实现 Chat 订阅 `chat:chunk`, `chat:done`, `chat:error`

## 3. Service Worker 改造

- [ ] 3.1 创建 `SWChannelManager` 管理多客户端通道
- [ ] 3.2 注册 RPC 处理器（task:create, task:list 等）
- [ ] 3.3 实现事件广播（排除发起者）
- [ ] 3.4 改造任务创建逻辑（原子性检查 + 响应）

## 4. 集成测试

- [ ] 4.1 单页面任务创建测试
- [ ] 4.2 多页面同时创建相同任务测试
- [ ] 4.3 页面刷新后任务恢复测试
- [ ] 4.4 Chat 流式通信测试

## 5. 迁移与清理

- [ ] 5.1 迁移 `swTaskQueueService` 使用新客户端
- [ ] 5.2 移除旧的 RxJS 订阅逻辑
- [ ] 5.3 更新相关文档
