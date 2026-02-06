# PostMessage 日志记录性能优化

## 完成时间
2025-01-17

## 问题描述

用户提出需求：**/sw-debug.html 中的 PostMessage 日志也应该由调试模式控制，避免影响未开启调试模式的应用性能**

之前的实现存在以下问题：
1. PostMessage 日志记录虽然有 `debugModeEnabled` 开关，但在调试模式未启用时仍然会调用日志记录函数
2. 日志数组会不断增长（最多 500 条），占用内存
3. 调试模式关闭时，日志没有被及时清空

## 解决方案

### 1. 核心改进

#### 文件：`apps/web/src/sw/task-queue/postmessage-logger.ts`
- 添加 `isDebugModeActive()` 内部函数，统一调试模式状态检查
- 改进 `setPostMessageLoggerDebugMode()` 函数，在禁用调试时立即清空所有日志
- 改进 `shouldLogMessage()` 函数，确保调试模式未启用时完全不进行任何记录操作

**关键代码**：
```typescript
// 调试模式未启用时，立即返回 false，不进行任何记录操作
function shouldLogMessage(messageType: string): boolean {
  if (!isDebugModeActive()) {
    return false;
  }
  return !EXCLUDED_MESSAGE_TYPES.includes(messageType);
}

// 禁用时立即释放内存
export function setPostMessageLoggerDebugMode(enabled: boolean): void {
  const wasEnabled = debugModeEnabled;
  debugModeEnabled = enabled;
  
  if (!enabled && wasEnabled) {
    logs.length = 0;
    pendingRequests.clear();
    logIdCounter = 0;
  }
}
```

#### 文件：`apps/web/src/sw/task-queue/utils/message-bus.ts`
- 导入 `isPostMessageLoggerDebugMode` 函数
- 在 `sendToClient()` 和 `broadcastToAllClients()` 中添加调试模式检查
- 只在调试模式启用时才调用 `logSentMessage()` 函数

**关键改进**：
```typescript
// 只在调试模式启用时才记录
let logId = '';
if (isPostMessageLoggerDebugMode()) {
  const messageType = (message as { type?: string })?.type || 'unknown';
  logId = logSentMessage(messageType, message, client.id);
}
```

#### 文件：`apps/web/src/sw/index.ts`
- 导入 `isPostMessageLoggerDebugMode` 函数
- 在消息处理器中添加调试模式检查
- 只在调试模式启用时才记录接收的消息

### 2. 文档和界面更新

#### 文件：`apps/web/public/sw-debug.html`
- 更新 PostMessage 日志标签的提示文本：*"记录主线程与 Service Worker 之间的消息通信（仅在调试模式启用时记录）"*
- 更新控制台日志标签的提示文本，保持一致性

#### 文件：`docs/SW_DEBUG_POSTMESSAGE_LOGGING.md`（新建）
- 完整的实现文档
- 性能影响分析
- 调试面板使用指南
- 实现细节说明
- 修改的文件清单
- 测试步骤

#### 文件：`CLAUDE.md`
- 添加新章节："PostMessage 日志由调试模式完全控制"
- 包含正确实现示例、性能影响分析和相关文件说明

## 性能影响

### 调试模式关闭时 ✅
- **零日志记录开销**：不调用任何日志记录函数
- **零内存占用**：日志数组为空
- **零性能影响**：应用运行完全不受影响

### 调试模式启用时
- **完整的日志记录**：所有 PostMessage 都被记录
- **实时日志广播**：日志实时显示在调试面板
- **可接受的性能开销**：仅在调试时产生

## 修改的文件清单

1. **apps/web/src/sw/task-queue/postmessage-logger.ts**
   - 添加 `isDebugModeActive()` 函数
   - 改进 `setPostMessageLoggerDebugMode()` 逻辑
   - 改进 `shouldLogMessage()` 函数

2. **apps/web/src/sw/task-queue/utils/message-bus.ts**
   - 导入 `isPostMessageLoggerDebugMode`
   - 改进 `sendToClient()` 函数
   - 改进 `broadcastToAllClients()` 函数

3. **apps/web/src/sw/index.ts**
   - 导入 `isPostMessageLoggerDebugMode`
   - 改进消息事件处理器

4. **apps/web/src/sw/task-queue/mcp/ai-analyze.ts**
   - 修复导入路径（`../../debug-fetch` → `../debug-fetch`）

5. **apps/web/public/sw-debug.html**
   - 更新提示文本说明

6. **docs/SW_DEBUG_POSTMESSAGE_LOGGING.md**（新建）
   - 完整的实现文档

7. **CLAUDE.md**
   - 添加新章节和实现指南

## 构建验证 ✅

```bash
npm run build:web
# Successfully ran target build for project web
```

所有修改都通过了构建验证，无任何错误或警告。

## 测试建议

### 步骤 1：验证调试模式关闭时的性能
```
1. 正常使用应用（不打开调试面板）
2. 性能应不受影响
3. 内存占用应正常
```

### 步骤 2：验证调试模式启用时的功能
```
1. 打开 http://localhost:7200/sw-debug.html
2. 点击"启用调试"
3. 切换到"PostMessage 日志"标签
4. 执行应用操作
5. 确认日志实时显示
```

### 步骤 3：验证调试模式禁用时的清理
```
1. 调试面板启用后，观察日志数量
2. 点击"禁用调试"
3. 检查日志是否立即清空
4. 确认内存正确释放
```

## 关键特性

✅ **零性能影响**（调试关闭时）
✅ **完全由调试模式控制**
✅ **自动内存清理**
✅ **向后兼容**
✅ **完整的文档**
✅ **构建验证通过**

## 相关命令

查看完整文档：
```bash
cat docs/SW_DEBUG_POSTMESSAGE_LOGGING.md
```

启动开发服务器：
```bash
npm start
```

构建项目：
```bash
npm run build:web
```

打开调试面板：
```
http://localhost:7200/sw-debug.html
```
