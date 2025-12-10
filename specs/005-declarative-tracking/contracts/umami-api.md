# Umami Analytics API Contract

**Feature**: 005-declarative-tracking
**Date**: 2025-12-05
**API Version**: Umami v2.x
**Integration Type**: Client SDK Wrapper

## Overview

本文档定义声明式埋点系统与 Umami Analytics 的集成契约,包括事件上报接口、数据格式、错误处理。

## Integration Strategy

**Approach**: 复用现有 UmamiAnalytics 工具 (`utils/umami-analytics.ts`)
- 使用项目已有的 `analytics` 单例，避免代码重复
- UmamiAdapter 作为适配器层，调用 `analytics.track()`
- 自动注入声明式埋点专属元数据(version, url, sessionId, viewport, eventType)
- 与现有 AI 生成事件追踪保持一致的日志格式
- 保持与 Umami 更新的兼容性

**代码位置**:
- 现有工具: `packages/drawnix/src/utils/umami-analytics.ts`
- 适配器: `packages/drawnix/src/services/tracking/umami-adapter.ts`

---

## API Endpoint

### 1. Track Event (上报事件)

**Method**: Umami SDK 封装 (`umami.track()`)

**Request** (通过 SDK):
```typescript
umami.track(eventName: string, eventData?: Record<string, any>): Promise<void>
```

**Internal HTTP Request** (SDK 内部实现):
```http
POST https://{umami-domain}/api/send
Content-Type: application/json

{
  "type": "event",
  "payload": {
    "website": "{website-id}",
    "name": "event-name",
    "data": {
      // 自定义事件属性
      "version": "1.0.0",
      "url": "https://aitu.chat/editor",
      "param1": "value1"
    }
  }
}
```

**Response** (成功):
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "ok": true
}
```

**Response** (失败):
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "Invalid request"
}
```

---

## Data Contract

### Event Data Structure

**Outbound** (发送给 Umami):
```typescript
interface UmamiEventPayload {
  /** 事件名称 */
  name: string;

  /** 事件数据(自定义属性) */
  data: {
    /** 项目版本号(必需) */
    version: string;

    /** 当前页面 URL(必需) */
    url: string;

    /** 事件参数(来自 track-params,可选) */
    [key: string]: any;
  };
}
```

**Example**:
```json
{
  "name": "button_click_save",
  "data": {
    "version": "1.2.3",
    "url": "https://aitu.chat/editor?id=abc123",
    "buttonId": "save-btn",
    "context": "editor"
  }
}
```

**Validation Rules**:
- `name`: 必需,非空字符串,长度 1-100 字符
- `data`: 可选,对象类型,总大小 <10KB (Umami 限制)
- `data.version`: 必需,SemVer 格式
- `data.url`: 必需,有效 URL
- 其他 `data.*` 字段: 可选,支持字符串、数字、布尔值、对象、数组

**Constraints**:
- 事件名不能包含特殊字符(仅允许 a-z, 0-9, _, -)
- 自定义属性键名不能以 `_` 开头(Umami 保留)
- 单个事件数据大小 <10KB
- 批量上报时,单次请求最多 50 个事件

---

## Batch Upload Contract

### Batch Event Upload

虽然 Umami SDK 不直接支持批量上报,但可以通过连续调用 `umami.track()` 实现。

**Implementation**:
```typescript
async function sendBatch(events: TrackEvent[]): Promise<void> {
  for (const event of events) {
    try {
      await umami.track(event.eventName, {
        version: event.metadata.version,
        url: event.metadata.url,
        ...event.params
      });
    } catch (error) {
      // 单个事件失败不影响其他事件
      console.error(`Failed to track ${event.eventName}:`, error);
    }
  }
}
```

**Alternative** (如果 Umami 支持批量端点):
```http
POST https://{umami-domain}/api/batch
Content-Type: application/json

{
  "events": [
    {
      "type": "event",
      "payload": { "website": "...", "name": "...", "data": {...} }
    },
    {
      "type": "event",
      "payload": { "website": "...", "name": "...", "data": {...} }
    }
  ]
}
```

---

## Error Handling

### Error Codes

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 200 OK | 成功 | 继续 |
| 400 Bad Request | 请求格式错误(验证失败) | 记录错误,不重试 |
| 401 Unauthorized | Website ID 无效 | 记录错误,不重试 |
| 429 Too Many Requests | 速率限制 | 等待后重试(指数退避) |
| 500 Internal Server Error | 服务器错误 | 重试(最多 3 次) |
| 503 Service Unavailable | 服务不可用 | 缓存并稍后重试 |

### Retry Strategy

```typescript
interface RetryConfig {
  maxRetries: 3;
  initialDelay: 2000;      // 2 秒
  exponentialBackoff: true;
  maxDelay: 30000;         // 最大 30 秒
}

async function uploadWithRetry(event: TrackEvent): Promise<void> {
  let attempt = 0;
  let delay = 2000;

  while (attempt < 3) {
    try {
      await umami.track(event.eventName, event.data);
      return; // 成功
    } catch (error) {
      attempt++;

      if (attempt >= 3 || !isRetryable(error)) {
        // 缓存到 IndexedDB
        await cacheEvent(event);
        throw error;
      }

      // 指数退避
      await sleep(delay);
      delay = Math.min(delay * 2, 30000);
    }
  }
}

function isRetryable(error: any): boolean {
  const status = error.response?.status;
  return status >= 500 || status === 429;
}
```

---

## Security & Authentication

### Website ID

Umami 使用 `website ID` 识别站点:

```typescript
// 初始化 Umami (通常在 index.html 或应用入口)
<script defer src="https://umami-domain/script.js" data-website-id="{website-id}"></script>

// 或在代码中配置
window.umami = {
  websiteId: '{website-id}'
};
```

**Security**:
- Website ID 公开可见(前端代码),不需要保密
- Umami 通过 CORS 和域名限制保护数据

---

## Rate Limiting

**Umami 限制** (根据官方文档):
- 每秒最多 10 个事件(同一用户)
- 超过限制返回 `429 Too Many Requests`

**应对策略**:
- 客户端防抖(500ms)
- 批量上报减少请求频率
- 429 错误时使用指数退避

---

## Testing Contract

### Mock Response (开发/测试环境)

```typescript
// 模拟 Umami SDK
const mockUmami = {
  track: jest.fn(async (name, data) => {
    if (Math.random() < 0.1) {
      // 10% 概率失败
      throw new Error('Network error');
    }
    console.log('Mock track:', name, data);
  })
};

global.umami = mockUmami;
```

### Contract Validation

**Test Cases**:
1. ✅ 成功上报: `umami.track()` 返回成功
2. ✅ 格式验证: 事件名、数据格式符合要求
3. ✅ 自定义参数: version, url 正确注入
4. ✅ 错误处理: 500 错误触发重试
5. ✅ 速率限制: 429 错误触发退避
6. ✅ 缓存: 上报失败后事件存入 IndexedDB

---

## Integration Checklist

- [ ] 确认 Umami SDK 已加载(`window.umami` 存在)
- [ ] 配置正确的 `website ID`
- [ ] 测试事件上报(开发环境)
- [ ] 验证自定义参数(version, url)在 Umami 面板中显示
- [ ] 测试失败场景(离线、500 错误)
- [ ] 验证缓存和重试机制
- [ ] 测试速率限制(快速点击)
- [ ] 验证批量上报效果(网络请求数量减少 60%+)

---

## Example Integration Code

```typescript
// services/tracking/umami-adapter.ts
import { analytics } from '../../utils/umami-analytics';

export class UmamiTrackingAdapter {
  /**
   * Check if Umami SDK is available
   */
  isAvailable(): boolean {
    return analytics.isAnalyticsEnabled();
  }

  /**
   * Track event using existing analytics utility
   */
  async track(event: TrackEvent): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Umami SDK not loaded');
    }

    // Enrich event data with declarative tracking metadata
    const enrichedData = {
      ...event.params,
      version: event.metadata.version,
      url: event.metadata.url,
      timestamp: event.metadata.timestamp,
      sessionId: event.metadata.sessionId,
      eventType: event.metadata.eventType,
    };

    // Optional: Add viewport if available
    if (event.metadata.viewport) {
      enrichedData.viewport = `${event.metadata.viewport.width}x${event.metadata.viewport.height}`;
    }

    try {
      // Use existing analytics.track() method (复用现有工具)
      analytics.track(event.eventName, enrichedData);
    } catch (error) {
      console.error('[Tracking] Umami track failed:', error);
      throw error; // 由上层处理重试和缓存
    }
  }
}
```

**集成优势**:
- ✅ 复用现有 `UmamiAnalytics` 类，避免代码重复
- ✅ 保持与 AI 生成事件追踪的日志格式一致
- ✅ 统一的错误处理和调试输出 `[Analytics]` / `[Tracking]`
- ✅ 自动受益于现有工具的任何改进

---

## API Version Compatibility

| Umami Version | Supported | Notes |
|---------------|-----------|-------|
| v1.x | ⚠️ Partial | 需要手动实现 `umami.track()` 包装 |
| v2.0+ | ✅ Yes | 原生支持 `track()` 方法 |
| v3.0+ | ✅ Yes | 向后兼容 |

---

## References

- [Umami Documentation](https://umami.is/docs)
- [Umami Tracker API](https://umami.is/docs/tracker-functions)
- [Event Data Limits](https://umami.is/docs/event-data)

---

**Next Step**: 生成 quickstart.md
