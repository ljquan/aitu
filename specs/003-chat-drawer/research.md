# Research: 对话抽屉 (Chat Drawer)

**Date**: 2025-12-03
**Feature**: 001-chat-drawer

## 技术决策

### 1. 抽屉组件实现方案

**Decision**: 使用 CSS Transform + Transition 实现抽屉动画

**Rationale**:
- CSS Transform 利用 GPU 加速，性能最优
- 现有项目已有类似动画模式（unified-toolbar 的响应式切换）
- 简单直接，易于维护

**Alternatives Considered**:
- Framer Motion：功能强大但增加依赖体积
- React Spring：学习曲线较高
- TDesign Drawer：与画板布局集成复杂

### 2. 流式响应实现方案

**Decision**: 使用 Fetch API + ReadableStream 处理 SSE (Server-Sent Events)

**Rationale**:
- 原生支持，无需额外依赖
- 与现有 Gemini API 集成模式一致
- 可以逐字符/逐词渲染，提供最佳用户体验

**Alternatives Considered**:
- WebSocket：需要服务端支持，过于复杂
- 轮询：用户体验差，延迟高
- 第三方库（如 openai-streams）：增加依赖

### 3. 对话存储方案

**Decision**: IndexedDB via localforage，独立 store

**Rationale**:
- 项目已使用 localforage（task-queue 模块）
- IndexedDB 支持大容量存储（50MB+）
- 异步 API 不阻塞主线程
- 支持复杂查询和索引

**Alternatives Considered**:
- localStorage：5MB 限制，同步 API
- 纯 IndexedDB：API 复杂，localforage 封装更友好
- 云端存储：需要后端支持，超出当前范围

### 4. 会话状态管理方案

**Decision**: React Context + useReducer + RxJS Subject

**Rationale**:
- 与现有 DrawnixContext 模式一致
- RxJS 用于跨组件事件通信（参考 task-queue-service）
- useReducer 管理复杂状态转换

**Alternatives Considered**:
- Redux/Zustand：增加依赖，当前规模不需要
- 纯 Context：复杂状态难以管理
- Jotai/Recoil：团队不熟悉

### 5. 附件处理方案

**Decision**: FileReader + Base64 编码存储小文件，大文件使用 Blob URL

**Rationale**:
- 小文件（<5MB）Base64 存储便于 IndexedDB 持久化
- 大文件 Blob URL 避免内存问题
- 与现有 media-cache-service 模式一致

**Alternatives Considered**:
- 全部 Base64：大文件性能差
- 全部 Blob：刷新后丢失
- 云存储：需要后端

### 6. 响应式布局方案

**Decision**: CSS Media Query + ResizeObserver + isMobile 状态

**Rationale**:
- 与现有 unified-toolbar 响应式模式一致
- 结合 CSS 和 JS 实现精确控制
- 复用现有 isMobile 检测逻辑

**Alternatives Considered**:
- 纯 CSS：复杂状态难以处理
- 纯 JS：性能开销大

### 7. AI API 集成方案

**Decision**: 复用现有 gemini-api 工具，扩展支持聊天接口

**Rationale**:
- API Key 管理已在 settings-manager 中实现
- 减少重复代码
- 统一的错误处理和重试逻辑

**Alternatives Considered**:
- 新建独立 API 模块：重复工作
- 使用第三方 SDK：增加依赖

## 最佳实践

### React 组件结构

```typescript
// 组件拆分策略 - 确保每个文件 <500 行
// ChatDrawer.tsx: 主容器，状态管理 (~200行)
// MessageList.tsx: 消息列表渲染 (~150行)
// MessageItem.tsx: 单条消息 (~100行)
// MessageInput.tsx: 输入框 (~150行)
// SessionList.tsx: 会话列表 (~100行)
// SessionItem.tsx: 单个会话 (~80行)
// AttachmentPreview.tsx: 附件预览 (~100行)
// StreamingText.tsx: 流式文本 (~80行)
```

### 性能优化

```typescript
// 1. 消息列表虚拟化（长列表场景）
// 使用 react-window 或自定义实现

// 2. 消息组件记忆化
const MessageItem = React.memo(({ message }) => {...});

// 3. 存储操作防抖
const debouncedSave = useMemo(
  () => debounce(saveToStorage, 500),
  []
);

// 4. 流式渲染优化
// 使用 requestAnimationFrame 批量更新
```

### 错误处理

```typescript
// 统一错误边界
class ChatErrorBoundary extends React.Component {
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return <ChatErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

// API 错误处理
try {
  await sendMessage(content);
} catch (error) {
  if (error.name === 'AbortError') {
    // 用户取消
  } else if (error.status === 429) {
    // 限流
  } else {
    // 通用错误
  }
}
```

## 技术风险

| Risk | Impact | Mitigation |
|------|--------|------------|
| AI API 响应慢 | 用户体验差 | 流式显示 + 加载状态 + 超时处理 |
| IndexedDB 存储满 | 数据丢失 | 存储限额监控 + 自动清理旧数据 |
| 长对话性能 | 卡顿 | 虚拟滚动 + 消息分页 |
| 移动端键盘遮挡 | 输入困难 | 监听 visualViewport + 自动滚动 |
| 网络断开 | 消息发送失败 | 离线检测 + 队列重试 |

## 参考实现

- **现有 Dialog 系统**: `packages/drawnix/src/components/dialog/dialog.tsx`
- **Task Queue UI**: `packages/drawnix/src/components/task-queue/`
- **存储服务**: `packages/drawnix/src/services/storage-service.ts`
- **Settings Manager**: `packages/drawnix/src/utils/settings-manager.ts`
- **Gemini API**: `packages/drawnix/src/utils/gemini-api/`
