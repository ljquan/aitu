# Data Model: 声明式埋点上报系统

**Feature**: 005-declarative-tracking
**Date**: 2025-12-05
**Source**: Derived from spec.md Functional Requirements and research.md decisions

## Core Entities

### 1. TrackEvent (上报事件)

**Description**: 代表一个待上报或已上报的埋点事件,包含事件名、参数、元数据

```typescript
interface TrackEvent {
  /** 事件名称(手动指定或自动生成) */
  eventName: string;

  /** 事件参数(来自 track-params 属性,可选) */
  params?: Record<string, any>;

  /** 元数据(自动注入) */
  metadata: TrackEventMetadata;

  /** 事件 ID(用于去重和缓存管理) */
  id: string;

  /** 事件创建时间戳 */
  createdAt: number;
}

interface TrackEventMetadata {
  /** 事件触发时间戳 */
  timestamp: number;

  /** 当前页面完整 URL */
  url: string;

  /** 项目版本号 */
  version: string;

  /** 用户会话 ID */
  sessionId: string;

  /** 浏览器 User-Agent(可选) */
  userAgent?: string;

  /** 视口尺寸(可选) */
  viewport?: {
    width: number;
    height: number;
  };

  /** 事件类型(click, hover, focus 等) */
  eventType: TrackEventType;
}

type TrackEventType = 'click' | 'hover' | 'focus' | 'blur' | 'input' | 'submit';
```

**Validation Rules**:
- `eventName`: 非空字符串,建议使用 snake_case 格式(如 `button_click_save`)
- `params`: 如果存在,必须是可序列化的 JSON 对象(不能包含函数、循环引用)
- `id`: UUID v4 格式,确保全局唯一
- `metadata.url`: 有效的 URL 字符串
- `metadata.version`: 符合 SemVer 格式(如 `1.0.0`)

**Example**:
```json
{
  "eventName": "button_click_save",
  "params": {
    "buttonId": "save-btn",
    "context": "editor"
  },
  "metadata": {
    "timestamp": 1701849600000,
    "url": "https://opentu.ai/editor",
    "version": "1.2.3",
    "sessionId": "abc123-session",
    "eventType": "click"
  },
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "createdAt": 1701849600000
}
```

---

### 2. TrackConfig (埋点配置)

**Description**: 埋点系统的全局配置,控制行为和性能参数

```typescript
interface TrackConfig {
  /** 是否启用自动埋点 */
  autoTrack: boolean;

  /** Umami API 上报端点 */
  apiEndpoint: string;

  /** Umami website ID */
  websiteId: string;

  /** 防抖时间(毫秒) */
  debounceTime: number;

  /** 重试策略 */
  retryPolicy: RetryPolicy;

  /** 缓存配置 */
  cacheConfig: CacheConfig;

  /** 日志级别 */
  logLevel: 'error' | 'debug' | 'silent';

  /** 批量上报配置 */
  batchConfig: BatchConfig;

  /** 自动埋点排除区域(CSS 选择器) */
  excludedSelectors: string[];

  /** 项目版本号(自动注入或手动配置) */
  version?: string;

  /** 是否启用开发模式(输出详细日志) */
  devMode: boolean;
}

interface RetryPolicy {
  /** 最大重试次数 */
  maxRetries: number;

  /** 重试间隔(毫秒) */
  retryInterval: number;

  /** 是否启用指数退避(retry interval * 2^attempt) */
  exponentialBackoff: boolean;
}

interface CacheConfig {
  /** 缓存上限(事件数量) */
  maxCacheSize: number;

  /** 缓存保留时间(毫秒) */
  cacheTTL: number;

  /** 存储键名 */
  storageKey: string;
}

interface BatchConfig {
  /** 批量大小(事件数量) */
  batchSize: number;

  /** 批量超时时间(毫秒) */
  batchTimeout: number;

  /** 是否启用批量上报 */
  enabled: boolean;
}
```

**Default Values**:
```typescript
const DEFAULT_TRACK_CONFIG: TrackConfig = {
  autoTrack: false,
  apiEndpoint: '/api/send',  // Umami 默认端点
  websiteId: '',              // 需要配置
  debounceTime: 500,
  retryPolicy: {
    maxRetries: 3,
    retryInterval: 2000,
    exponentialBackoff: true
  },
  cacheConfig: {
    maxCacheSize: 100,
    cacheTTL: 60 * 60 * 1000,  // 1 小时
    storageKey: 'tracking_cache'
  },
  logLevel: 'error',
  batchConfig: {
    batchSize: 10,
    batchTimeout: 5000,        // 5 秒
    enabled: true
  },
  excludedSelectors: [
    'nav',
    'header',
    'footer',
    '[data-track-ignore]'
  ],
  devMode: false
};
```

---

### 3. TrackedElement (被监听元素)

**Description**: 代表一个已被监听的 DOM 元素及其埋点配置

```typescript
interface TrackedElement {
  /** 元素引用(WeakRef 避免内存泄漏) */
  elementRef: WeakRef<Element>;

  /** 事件名称 */
  eventName: string;

  /** 事件参数(可选) */
  params?: Record<string, any>;

  /** 监听的事件类型 */
  eventTypes: TrackEventType[];

  /** 是否为自动埋点 */
  isAutoTracked: boolean;

  /** 最后触发时间(用于防抖) */
  lastTriggeredAt: number;

  /** 元素选择器(用于调试) */
  selector: string;
}
```

**Usage**:
- `TrackedElement` 对象存储在 WeakMap 中,键为 Element 实例
- 当元素从 DOM 移除时,WeakMap 自动清理引用,避免内存泄漏

---

### 4. CachedEvent (缓存事件)

**Description**: 上报失败后缓存到 IndexedDB 的事件

```typescript
interface CachedEvent {
  /** 事件数据 */
  event: TrackEvent;

  /** 缓存时间戳 */
  cachedAt: number;

  /** 重试次数 */
  retryCount: number;

  /** 最后重试时间 */
  lastRetryAt?: number;

  /** 失败原因(用于调试) */
  failureReason?: string;
}
```

**Lifecycle**:
1. 上报失败 → 存入 IndexedDB
2. 定期重试(每 30 秒)
3. 重试成功 → 从缓存移除
4. 重试次数超过限制 OR TTL 过期 → 从缓存移除并丢弃

**Storage Structure**:
```typescript
// IndexedDB (via localforage)
{
  "tracking_cache": [
    {
      "event": { /* TrackEvent */ },
      "cachedAt": 1701849600000,
      "retryCount": 2,
      "lastRetryAt": 1701849602000,
      "failureReason": "Network error"
    },
    // ... more cached events
  ]
}
```

---

## State Management

### 5. TrackingState (埋点系统状态)

**Description**: 运行时状态,使用 RxJS Subject 管理

```typescript
interface TrackingState {
  /** 是否已初始化 */
  initialized: boolean;

  /** 当前配置 */
  config: TrackConfig;

  /** 待上报事件队列 */
  pendingEvents: TrackEvent[];

  /** 正在上报中(防止并发) */
  uploading: boolean;

  /** 缓存的事件数量 */
  cachedEventCount: number;

  /** 统计信息 */
  stats: TrackingStats;
}

interface TrackingStats {
  /** 总事件数(自启动以来) */
  totalEvents: number;

  /** 成功上报数 */
  successfulUploads: number;

  /** 失败上报数 */
  failedUploads: number;

  /** 批量上报次数 */
  batchUploadCount: number;

  /** 防抖拦截次数 */
  debouncedEvents: number;
}
```

**State Updates** (via RxJS):
```typescript
class TrackingService {
  private state$ = new BehaviorSubject<TrackingState>(initialState);

  getState(): Observable<TrackingState> {
    return this.state$.asObservable();
  }

  updateState(partial: Partial<TrackingState>): void {
    this.state$.next({ ...this.state$.value, ...partial });
  }
}
```

---

## Data Flow

```
User Interaction (click, hover, etc.)
    ↓
Event Capture (event delegation / event listener)
    ↓
Debounce Check (shouldTrack?)
    ↓ YES
Generate TrackEvent
    ↓
Enqueue to BatchService
    ↓
Batch Trigger (10 events OR 5 seconds)
    ↓
Send to Umami API
    ↓
Success? → Update Stats
    ↓ NO
Cache to IndexedDB (CachedEvent)
    ↓
Retry Later (30s interval, max 3 retries)
```

---

## Index Strategy

### IndexedDB Indexes
```typescript
// localforage 自动处理,无需手动创建索引
// 但需要考虑查询性能:
// - 按 cachedAt 排序查找过期事件
// - 按 retryCount 过滤可重试事件
```

---

## Migration Strategy

**Version 1.0.0 → 1.1.0** (示例):
- 添加新字段: `metadata.viewport`
- 迁移逻辑: 读取旧数据,注入默认值

```typescript
async function migrateCache(): Promise<void> {
  const cached = await localforage.getItem<CachedEvent[]>('tracking_cache');
  if (!cached) return;

  const migrated = cached.map(c => ({
    ...c,
    event: {
      ...c.event,
      metadata: {
        ...c.event.metadata,
        viewport: c.event.metadata.viewport || { width: 0, height: 0 }
      }
    }
  }));

  await localforage.setItem('tracking_cache', migrated);
}
```

---

## Summary

| Entity | Purpose | Storage | Lifecycle |
|--------|---------|---------|-----------|
| TrackEvent | 上报事件 | 内存(队列) + IndexedDB(失败时) | 触发 → 上报 → 销毁 |
| TrackConfig | 配置 | 内存(单例) | 应用启动 → 应用销毁 |
| TrackedElement | 元素监听 | WeakMap | DOM 挂载 → DOM 卸载 |
| CachedEvent | 失败缓存 | IndexedDB | 上报失败 → 重试成功/过期 |
| TrackingState | 运行时状态 | RxJS Subject | 应用启动 → 应用销毁 |

**Next Step**: 生成 API contracts (contracts/umami-api.md)
