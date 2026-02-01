# Change: 使用 postmessage-duplex 重构 Service Worker 通信层

## Why

当前 SW 与应用层通信采用原生 postMessage + 广播模式，存在以下问题：
1. **多标签页任务重复**：同时打开多个页面时，任务可能被重复添加
2. **无请求-响应模式**：需要手动用 RxJS filter + timeout 实现
3. **广播无差异化**：所有客户端都收到相同消息，无法区分请求来源
4. **无连接就绪保障**：SW 未就绪时发送的消息可能丢失

## What Changes

- **BREAKING** 重构 `SWTaskQueueClient` 使用 `postmessage-duplex` 库
- **BREAKING** 重构 SW 端通信逻辑使用 `ServiceWorkerChannel`
- 任务创建改用 `call` 方法（请求-响应模式），SW 返回创建结果
- 任务状态更新使用 `subscribe` 订阅模式
- 移除手动实现的 RxJS 超时/过滤逻辑

## Impact

- Affected specs: 无（新增通信层规范）
- Affected code:
  - `packages/drawnix/src/services/sw-client/client.ts`
  - `apps/web/src/sw/task-queue/queue.ts`
  - `apps/web/src/sw/task-queue/types.ts`
  - `apps/web/src/sw/index.ts`
  
## Benefits

1. **请求-响应模式**：任务创建等操作可等待 SW 确认结果
2. **消息队列**：连接就绪前消息自动缓存
3. **内置超时**：无需手动实现
4. **多页面隔离**：每个页面有独立通道，避免重复处理
5. **类型安全**：完整的 TypeScript 类型定义
