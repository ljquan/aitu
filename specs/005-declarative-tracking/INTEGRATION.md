# 集成说明：声明式埋点与现有 Umami 工具

**Feature**: 005-declarative-tracking
**Date**: 2025-12-05

## 概述

声明式埋点系统通过复用现有的 `UmamiAnalytics` 工具来避免代码重复，保持架构一致性。

## 架构设计

### 现有工具

**位置**: `packages/drawnix/src/utils/umami-analytics.ts`

现有的 `UmamiAnalytics` 类提供：
- 基础事件追踪 `analytics.track(eventName, eventData)`
- AI 生成事件专用方法（图像、视频、聊天生成）
- 用户交互事件追踪
- 特性使用追踪
- 统一的日志输出 `[Analytics]`

```typescript
// 现有用法示例
import { analytics, AIGenerationEvent } from '../../utils/umami-analytics';

analytics.trackAIGeneration(AIGenerationEvent.IMAGE_GENERATION_START, {
  taskId: 'task-123',
  model: 'gemini-pro',
  promptLength: 150,
});
```

### 声明式埋点适配器

**位置**: `packages/drawnix/src/services/tracking/umami-adapter.ts`

`UmamiTrackingAdapter` 作为适配器层：
- 调用 `analytics.track()` 而不是直接使用 `window.umami`
- 注入声明式埋点专属元数据（version, url, sessionId, viewport, eventType）
- 提供批量上报支持
- 统一的日志输出 `[Tracking]`

```typescript
// 适配器实现（简化）
import { analytics } from '../../utils/umami-analytics';

export class UmamiTrackingAdapter {
  async track(event: TrackEvent): Promise<void> {
    const enrichedData = {
      ...event.params,
      version: event.metadata.version,
      url: event.metadata.url,
      timestamp: event.metadata.timestamp,
      sessionId: event.metadata.sessionId,
      eventType: event.metadata.eventType,
    };

    // 复用现有工具
    analytics.track(event.eventName, enrichedData);
  }
}
```

## 两种埋点方式的对比

### 1. 手动埋点（现有方式）

**适用场景**: AI 生成、API 调用、特定业务逻辑

```typescript
// 在代码中显式调用
analytics.trackAIGeneration(AIGenerationEvent.IMAGE_GENERATION_START, {
  taskId: task.id,
  model: 'gemini-pro',
  duration: 2500,
});
```

**优点**:
- 精确控制埋点时机
- 丰富的业务上下文
- 类型安全的事件枚举

### 2. 声明式埋点（新方式）

**适用场景**: UI 交互、按钮点击、页面浏览

```html
<!-- 在 JSX 中声明 -->
<button track="button_click_save">保存</button>
<button track="button_click_export" track-params='{"format": "png"}'>导出</button>
<div track-hover="card_hover_features">特性卡片</div>
```

**优点**:
- 无需修改业务代码
- 自动批量上报减少网络请求
- 失败自动重试
- 防抖避免重复上报

## 数据流对比

### 手动埋点数据流

```
业务代码
  ↓
analytics.trackXXX()
  ↓
window.umami.track()
  ↓
Umami 服务器
```

### 声明式埋点数据流

```
用户交互 (点击/悬停)
  ↓
TrackingService (事件捕获)
  ↓
防抖检查
  ↓
元数据注入 (version, url, sessionId)
  ↓
批量队列 (10 events OR 5s)
  ↓
UmamiAdapter
  ↓
analytics.track() (复用现有工具)
  ↓
window.umami.track()
  ↓
Umami 服务器
```

## 元数据对比

### 手动埋点元数据

```json
{
  "category": "ai_generation",
  "taskId": "task-123",
  "model": "gemini-pro",
  "duration": 2500,
  "timestamp": 1701849600000
}
```

### 声明式埋点元数据

```json
{
  "version": "0.2.1",
  "url": "https://aitu.chat/editor",
  "timestamp": 1701849600000,
  "sessionId": "session-abc123",
  "eventType": "click",
  "viewport": "1920x1080",
  "buttonId": "save-btn"
}
```

## 统一的日志输出

两种方式的日志输出可以通过前缀区分：

```
[Analytics] Event tracked: image_generation_start
[Tracking] Event tracked: button_click_save
[Tracking] Batching event (3/10)
[Tracking] Batch uploading (10 events)
```

## 避免重复代码的措施

### ✅ 已采取的措施

1. **复用 window.umami 接口定义** - 使用 `umami-analytics.ts` 中的全局声明
2. **复用 analytics 单例** - UmamiAdapter 调用 `analytics.track()`
3. **统一错误处理** - 两种方式使用相同的 try-catch 模式
4. **统一日志格式** - 都使用 `console.debug/error` 输出

### ❌ 避免的重复

1. ~~不再重复定义 `window.umami` 接口~~ ✓
2. ~~不再重复实现 `track()` 方法~~ ✓
3. ~~不再重复 SDK 可用性检查逻辑~~ ✓

## 使用建议

### 何时使用手动埋点

- AI 生成事件（图像、视频、聊天）
- API 调用追踪
- 后台任务状态变更
- 需要丰富业务上下文的场景

```typescript
analytics.trackModelSuccess({
  taskId: task.id,
  taskType: 'image',
  model: 'gemini-pro',
  duration: 2500,
});
```

### 何时使用声明式埋点

- UI 按钮点击
- 链接点击
- 卡片悬停
- 表单聚焦
- 需要批量上报的高频交互

```html
<button track="button_click_save">保存</button>
```

### 可以混合使用

在同一个组件中，可以同时使用两种方式：

```tsx
function MyComponent() {
  const handleComplexAction = async () => {
    // 手动埋点：追踪业务逻辑
    analytics.trackFeatureUsage(FeatureUsageEvent.IMAGE_UPLOAD, {
      feature: 'crop',
      value: cropSettings.aspectRatio,
    });

    // 执行业务逻辑
    await uploadImage();
  };

  return (
    <>
      {/* 声明式埋点：追踪简单点击 */}
      <button track="button_click_cancel">取消</button>

      {/* 手动埋点：追踪复杂业务逻辑 */}
      <button onClick={handleComplexAction}>上传</button>
    </>
  );
}
```

## 测试验证

### 验证现有埋点未受影响

```typescript
// 确认现有 AI 生成埋点正常工作
analytics.trackAIGeneration(AIGenerationEvent.IMAGE_GENERATION_START, {...});
// 应在 Umami 面板看到 image_generation_start 事件
```

### 验证声明式埋点正常工作

```html
<button track="test_button_click">测试按钮</button>
<!-- 点击后应在 Umami 面板看到 test_button_click 事件 -->
<!-- 事件数据包含 version, url, sessionId 等元数据 -->
```

### 验证批量上报

```typescript
// 连续点击 10 次或等待 5 秒
// 控制台应看到：[Tracking] Batch uploading (10 events)
// 网络面板应看到单个批量请求而不是 10 个独立请求
```

## 未来改进方向

1. **统一元数据注入** - 考虑在 `UmamiAnalytics` 中也注入 version, sessionId
2. **统一批量上报** - 考虑为手动埋点也提供批量上报能力
3. **IndexedDB 离线缓存** - 实现持久化缓存，将失败事件缓存到 IndexedDB（最多 100 个，保留 1 小时）
4. **统一配置管理** - 统一管理两种埋点的配置（日志级别、重试策略等）

## 总结

通过适配器模式复用现有的 `UmamiAnalytics` 工具：
- ✅ 避免了代码重复
- ✅ 保持了架构一致性
- ✅ 两种埋点方式可以共存
- ✅ 自动受益于现有工具的改进
- ✅ 为未来统一埋点系统铺平道路
