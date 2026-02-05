# Service Worker PostMessage 日志记录优化

## 问题描述

之前的实现中，PostMessage 日志记录虽然有 `debugModeEnabled` 开关，但在以下场景中仍然会对应用性能产生影响：

1. **主线程消息发送时的日志记录**：即使调试模式未启用，仍然会调用 `logSentMessage()` 函数进行日志记录
2. **消息日志存储和处理**：日志数组会不断增长（最多 500 条），占用内存
3. **调试面板关闭后的残留**：从启用调试到禁用调试的过程中，日志没有被及时清空

## 解决方案

### 1. 完全由调试模式控制日志记录

在 `postmessage-logger.ts` 中实现以下改进：

```typescript
// 内部检查函数
function isDebugModeActive(): boolean {
  return debugModeEnabled;
}

// 改进的调试模式设置
export function setPostMessageLoggerDebugMode(enabled: boolean): void {
  const wasEnabled = debugModeEnabled;
  debugModeEnabled = enabled;
  
  if (!enabled && wasEnabled) {
    // 从启用变为禁用时，立即清空日志，释放内存
    logs.length = 0;
    pendingRequests.clear();
    logIdCounter = 0;
  }
}

// 改进的消息过滤
function shouldLogMessage(messageType: string): boolean {
  // 调试模式未启用时，立即返回 false，不进行任何记录操作
  if (!isDebugModeActive()) {
    return false;
  }
  return !EXCLUDED_MESSAGE_TYPES.includes(messageType);
}
```

### 2. 在 Message Bus 中添加调试模式检查

在 `message-bus.ts` 中，在调用 `logSentMessage()` 前检查调试模式：

```typescript
import { isPostMessageLoggerDebugMode } from '../postmessage-logger';

export function sendToClient(client: Client, message: unknown): void {
  // ...
  
  // Only attempt to log if debug mode is enabled
  let logId = '';
  if (isPostMessageLoggerDebugMode()) {
    const messageType = (message as { type?: string })?.type || 'unknown';
    logId = logSentMessage(messageType, message, client.id);
  }
  
  // ...
}
```

### 3. 在 Service Worker 中同步日志控制

在 `sw/index.ts` 中，确保接收消息时也受到调试模式的控制：

```typescript
// Handle messages from main thread
sw.addEventListener('message', (event: ExtendableMessageEvent) => {
  const messageType = event.data?.type || 'unknown';
  const clientId = (event.source as Client)?.id || '';
  
  // Log received message only if debug mode is enabled
  let logId = '';
  if (isPostMessageLoggerDebugMode()) {
    logId = logReceivedMessage(messageType, event.data, clientId);
    if (logId && debugModeEnabled) {
      const logs = getAllPostMessageLogs();
      const entry = logs.find(l => l.id === logId);
      if (entry) {
        broadcastPostMessageLog(entry);
      }
    }
  }
  
  // ... rest of the handler
});
```

## 性能影响

### 调试模式关闭时

- **零日志记录开销**：不调用任何日志记录函数
- **零内存占用**：日志数组为空
- **零性能影响**：应用运行不受影响

### 调试模式启用时

- **完整的日志记录**：所有 PostMessage 都被记录
- **实时日志广播**：日志实时显示在调试面板
- **可接受的性能开销**：仅在调试时产生

## 调试面板使用

### 启用调试模式

1. 打开 `http://localhost:7200/sw-debug.html`
2. 点击 "启用调试" 按钮
3. 切换到 "PostMessage 日志" 标签
4. 查看所有主线程与 Service Worker 之间的消息通信

### 自动清理

当调试模式禁用时，日志会自动清空以释放内存。

## 实现细节

### 关键导出函数

| 函数 | 模块 | 作用 |
|------|------|------|
| `setPostMessageLoggerDebugMode(enabled)` | `postmessage-logger.ts` | 设置调试模式 |
| `isPostMessageLoggerDebugMode()` | `postmessage-logger.ts` | 检查调试模式是否启用 |
| `logReceivedMessage()` | `postmessage-logger.ts` | 记录接收的消息（需先检查调试模式） |
| `logSentMessage()` | `postmessage-logger.ts` | 记录发送的消息（需先检查调试模式） |
| `setDebugMode(enabled)` | `message-bus.ts` | 配置整个消息总线的调试模式 |

### 日志流程

```
启用调试模式
    ↓
setMessageSenderDebugMode(true)
    ↓
setDebugMode(true) in message-bus.ts
    ↓
setPostMessageLoggerDebugMode(true)
    ↓
所有 postMessage 都被记录到调试面板
    ↓
禁用调试模式
    ↓
setPostMessageLoggerDebugMode(false)
    ↓
日志数组立即清空，内存释放
```

## 修改的文件

1. **apps/web/src/sw/task-queue/postmessage-logger.ts**
   - 添加 `isDebugModeActive()` 内部函数
   - 改进 `setPostMessageLoggerDebugMode()` 逻辑
   - 改进 `shouldLogMessage()` 函数

2. **apps/web/src/sw/task-queue/utils/message-bus.ts**
   - 导入 `isPostMessageLoggerDebugMode`
   - 在 `sendToClient()` 中添加调试模式检查
   - 在 `broadcastToAllClients()` 中添加调试模式检查

3. **apps/web/src/sw/index.ts**
   - 导入 `isPostMessageLoggerDebugMode`
   - 在消息处理器中添加调试模式检查

4. **apps/web/public/sw-debug.html**
   - 更新 PostMessage 日志标签的提示信息
   - 更新控制台日志标签的提示信息

## 测试步骤

1. **应用不开启调试时**
   - 正常使用应用
   - 性能不受影响

2. **启用调试模式**
   - 打开调试面板
   - 启用调试
   - 切换到 PostMessage 日志标签
   - 执行应用操作
   - 观察日志实时显示

3. **禁用调试模式**
   - 点击"禁用调试"
   - 检查日志是否清空
   - 确认内存释放

## 向后兼容性

所有改动都是向后兼容的：
- 现有的调试面板功能完全保留
- 调试模式的启用/禁用逻辑不变
- 只是改进了性能特性

## 相关文件

- `/apps/web/public/sw-debug.html` - 调试面板界面
- `/apps/web/public/sw-debug/app.js` - 调试面板应用逻辑
- `/apps/web/src/sw/index.ts` - Service Worker 入口
