# Technical Research: 声明式埋点上报系统

**Feature**: 005-declarative-tracking
**Date**: 2025-12-05
**Status**: Complete

## Research Questions

本研究解决 Technical Context 中标记的关键技术决策和最佳实践。

---

## 1. Umami Analytics API 集成

### Question
如何集成和扩展 Umami 的事件上报 API,以支持自定义元数据(version, location.href)?

### Research Findings

**Umami 事件上报机制**:
- Umami 使用 `/api/send` 端点接收事件
- 支持自定义事件属性(event data)
- 标准请求格式:
  ```json
  {
    "type": "event",
    "payload": {
      "website": "website-id",
      "name": "event-name",
      "data": {
        // 自定义属性
        "version": "1.0.0",
        "url": "https://example.com/page"
      }
    }
  }
  ```

**现有集成分析**:
- 项目可能已有 Umami tracker 脚本或 SDK
- 需要检查 `apps/web/src/` 中的 Umami 初始化代码
- 常见集成方式:`umami.track('event-name', { custom: 'data' })`

**扩展方案**:
- 方案 A: 直接调用 Umami SDK 的 `track` 方法,传递自定义 data
- 方案 B: 直接调用 Umami API (`/api/send`),完全控制请求格式
- 方案 C: 包装现有 Umami 实例,自动注入 version 和 url

### Decision
**选择方案 A (包装 Umami SDK)**:
- 优点: 复用现有 Umami 配置(website ID, API endpoint)
- 优点: 自动处理会话、用户标识
- 优点: 利用 Umami 的内置重试和错误处理
- 实现: 创建 `UmamiTrackingAdapter` 类,封装 `umami.track()` 调用

**扩展元数据注入**:
```typescript
interface UmamiTrackingAdapter {
  track(eventName: string, params?: Record<string, any>): void {
    const enrichedData = {
      ...params,
      version: this.getVersion(),     // 从 package.json 读取
      url: window.location.href,       // 实时获取
      timestamp: Date.now()
    };
    umami.track(eventName, enrichedData);
  }
}
```

### Alternatives Considered
- **方案 B (直接 API)**: 需要重新实现会话管理、用户标识,维护成本高
- **方案 C (修改全局 Umami)**: 侵入性强,可能影响其他埋点代码

---

## 2. 事件委托 vs MutationObserver

### Question
对于动态添加的元素,应该使用事件委托还是 MutationObserver?

### Research Findings

**事件委托 (Event Delegation)**:
- 原理: 在父容器上监听事件,通过 `event.target` 判断目标元素
- 优点: 性能高,不需要为每个元素添加监听器
- 优点: 自动处理动态元素,无需额外逻辑
- 缺点: 只能监听冒泡事件(click、input 等),无法监听非冒泡事件(focus、blur 需 capture 模式)

**MutationObserver**:
- 原理: 监听 DOM 树变更,检测新增元素并为其添加监听器
- 优点: 可以精确控制每个元素的行为
- 优点: 支持非冒泡事件
- 缺点: 性能开销较大(每次 DOM 变更都会触发回调)
- 缺点: 需要手动管理监听器的添加和移除

**混合方案**:
- 冒泡事件(click): 使用事件委托
- 非冒泡事件(focus, hover): 使用 MutationObserver + 事件捕获

### Decision
**选择混合方案**:
- 核心功能(click 事件): **使用事件委托**
  - 在 `document.body` 或应用根节点添加一个 click 监听器
  - 通过 `event.target.closest('[track]')` 查找带埋点属性的元素
  - 性能最优,代码简洁
- 扩展功能(hover, focus): **使用 MutationObserver**
  - 仅在启用 `track-hover` 或 `track-focus` 时才激活 MutationObserver
  - 监听新增元素,为其添加对应的事件监听器
  - 使用 WeakMap 存储已添加监听器的元素,避免重复添加

**实现示例**:
```typescript
// 事件委托 (click)
document.body.addEventListener('click', (event) => {
  const target = event.target.closest('[track]');
  if (target && !isExcluded(target)) {
    const eventName = target.getAttribute('track');
    trackingService.track(eventName, getParams(target));
    event.stopPropagation(); // 阻止冒泡到父元素
  }
}, { capture: false });

// MutationObserver (hover/focus)
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        attachEventListeners(node as Element);
      }
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });
```

### Rationale
- 事件委托覆盖 90% 的使用场景(click 是最常见的交互)
- MutationObserver 仅在需要时启用,避免不必要的性能开销
- 符合渐进增强原则

---

## 3. 批量上报策略

### Question
如何实现高效的批量上报机制(10 个事件或 5 秒)?

### Research Findings

**批量上报模式**:
1. **时间窗口模式**: 固定时间间隔(如 5 秒)上报一次
   - 简单但可能延迟较大
2. **数量触发模式**: 累积到固定数量(如 10 个)立即上报
   - 响应快但可能频繁上报
3. **混合模式**: 先到达的条件触发(数量 OR 时间)
   - 平衡延迟和网络开销

**实现方案**:
- 使用队列(数组)缓存待上报事件
- 使用 `setTimeout` 实现时间窗口
- 使用数组长度判断数量阈值

### Decision
**选择混合模式**:
```typescript
class TrackingBatchService {
  private queue: TrackEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 10;
  private readonly BATCH_TIMEOUT = 5000; // 5 秒

  enqueue(event: TrackEvent): void {
    this.queue.push(event);

    // 启动定时器(如果未启动)
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.BATCH_TIMEOUT);
    }

    // 达到数量阈值,立即上报
    if (this.queue.length >= this.BATCH_SIZE) {
      this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = [...this.queue];
    this.queue = [];

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    await this.sendBatch(batch);
  }

  // 页面卸载时立即上报
  onBeforeUnload(): void {
    if (this.queue.length > 0) {
      navigator.sendBeacon(API_ENDPOINT, JSON.stringify(this.queue));
    }
  }
}
```

**关键设计点**:
- 清空队列时使用 `[...this.queue]` 避免并发问题
- 页面卸载时使用 `navigator.sendBeacon`,确保数据不丢失
- 定时器在 flush 后清除,避免重复上报

---

## 4. 防抖实现

### Question
如何实现 500ms 防抖,避免同一元素的重复上报?

### Research Findings

**防抖策略**:
1. **全局防抖**: 任意事件触发后 500ms 内不上报任何事件
   - 简单但可能误杀正常事件
2. **元素级防抖**: 每个元素单独计时,500ms 内同一元素的同一事件只上报一次
   - 精确但需要存储状态
3. **事件级防抖**: 同一事件名防抖(不区分元素)
   - 折中方案

### Decision
**选择元素级防抖**:
```typescript
class TrackingDebouncer {
  private debounceMap = new WeakMap<Element, Map<string, number>>();
  private readonly DEBOUNCE_TIME = 500;

  shouldTrack(element: Element, eventName: string): boolean {
    if (!this.debounceMap.has(element)) {
      this.debounceMap.set(element, new Map());
    }

    const eventTimestamps = this.debounceMap.get(element)!;
    const lastTimestamp = eventTimestamps.get(eventName) || 0;
    const now = Date.now();

    if (now - lastTimestamp < this.DEBOUNCE_TIME) {
      return false; // 防抖中,不上报
    }

    eventTimestamps.set(eventName, now);
    return true; // 可以上报
  }
}
```

**优势**:
- WeakMap 自动清理已删除元素的引用,避免内存泄漏
- 支持不同事件名的独立防抖(click 和 hover 互不影响)
- 精确控制每个元素的上报频率

---

## 5. 自动埋点选择器

### Question
如何高效识别应该自动埋点的元素(原生交互元素 + onClick + role)?

### Research Findings

**选择器策略**:
1. **CSS 选择器**: `button, a, input, select, [onclick], [role="button"]`
   - 简单但不够精确(onclick 可能是字符串属性)
2. **DOM 属性检查**: 遍历元素,检查 `onclick` 是否为函数
   - 精确但性能较差
3. **混合方案**: CSS 选择器 + 属性验证

### Decision
**选择混合方案**:
```typescript
const AUTO_TRACK_SELECTOR = `
  button:not([data-track-ignore]),
  a:not([data-track-ignore]),
  input[type="button"]:not([data-track-ignore]),
  input[type="submit"]:not([data-track-ignore]),
  select:not([data-track-ignore]),
  [role="button"]:not([data-track-ignore]),
  [role="link"]:not([data-track-ignore])
`.trim();

function shouldAutoTrack(element: Element): boolean {
  // 1. 检查是否在排除区域
  if (element.closest('nav, header, footer, [data-track-ignore]')) {
    return false;
  }

  // 2. 检查是否匹配选择器
  if (element.matches(AUTO_TRACK_SELECTOR)) {
    return true;
  }

  // 3. 检查是否有 onClick 事件处理器(React/Vue 绑定)
  if (element.hasAttribute('onclick') || hasEventListener(element, 'click')) {
    return true;
  }

  return false;
}

// 辅助:检查元素是否有事件监听器(仅限 React Fiber)
function hasEventListener(element: Element, eventType: string): boolean {
  // React Fiber 内部属性
  const fiberKey = Object.keys(element).find(key =>
    key.startsWith('__reactFiber') || key.startsWith('__reactProps')
  );
  if (fiberKey) {
    const props = (element as any)[fiberKey]?.memoizedProps;
    return props && typeof props[`on${capitalize(eventType)}`] === 'function';
  }
  return false;
}
```

**排除逻辑**:
- 使用 `closest()` 检查父级,避免导航/工具栏/页脚中的元素
- `data-track-ignore` 属性优先级最高,强制排除

---

## 6. 缓存管理

### Question
如何实现失败事件的缓存(100 个事件, 1 小时 TTL)?

### Research Findings

**存储方案**:
1. **localStorage**: 同步 API,5MB 限制,可能阻塞主线程
2. **IndexedDB**: 异步 API,更大容量,但 API 复杂
3. **localforage**: IndexedDB 的简化封装,降级到 localStorage

### Decision
**选择 localforage**:
- 项目已使用 localforage(参考 `media-cache-service.ts`)
- 自动选择最佳存储方案(IndexedDB > WebSQL > localStorage)
- API 简洁,Promise 友好

**缓存结构**:
```typescript
interface CachedEvent {
  event: TrackEvent;
  cachedAt: number;
  retryCount: number;
}

class TrackingStorageService {
  private readonly STORAGE_KEY = 'tracking_cache';
  private readonly MAX_CACHE_SIZE = 100;
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 小时

  async add(event: TrackEvent): Promise<void> {
    const cached = await this.getAll();

    // 清理过期事件
    const now = Date.now();
    const valid = cached.filter(c =>
      now - c.cachedAt < this.CACHE_TTL
    );

    // 限制数量(FIFO)
    if (valid.length >= this.MAX_CACHE_SIZE) {
      valid.shift(); // 移除最旧的
    }

    valid.push({
      event,
      cachedAt: now,
      retryCount: 0
    });

    await localforage.setItem(this.STORAGE_KEY, valid);
  }

  async getAll(): Promise<CachedEvent[]> {
    return await localforage.getItem(this.STORAGE_KEY) || [];
  }

  async clear(): Promise<void> {
    await localforage.removeItem(this.STORAGE_KEY);
  }
}
```

**重试逻辑**:
- 定期从缓存读取失败事件(每 30 秒)
- 重试成功后从缓存移除
- 重试次数超过 3 次后丢弃

---

## 7. 项目版本号获取

### Question
如何从 package.json 或应用配置读取项目版本号?

### Research Findings

**方案对比**:
1. **直接 import package.json**: 在构建时将 version 注入代码
   ```typescript
   import { version } from '../../../package.json';
   ```
   - Vite/Webpack 支持 JSON import
   - 缺点: 运行时无法动态更新

2. **环境变量**: 构建时注入 `VITE_APP_VERSION`
   ```typescript
   const version = import.meta.env.VITE_APP_VERSION;
   ```
   - 灵活,支持不同环境的不同版本号
   - 需要在 vite.config.ts 中配置

3. **全局配置对象**: 应用启动时从 API 或配置文件读取
   ```typescript
   const version = window.APP_CONFIG?.version || '0.0.0';
   ```
   - 动态,但需要额外的配置加载逻辑

### Decision
**选择方案 2 (环境变量)**:
```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import packageJson from './package.json';

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version)
  }
});

// tracking-service.ts
export class TrackingService {
  private getVersion(): string {
    return import.meta.env.VITE_APP_VERSION || 'unknown';
  }
}
```

**优势**:
- 构建时自动读取 package.json 的 version
- 支持不同环境(dev, staging, prod)的版本标识
- 无需手动维护版本号

---

## Summary of Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Umami 集成 | 包装 Umami SDK | 复用现有配置,自动处理会话 |
| 动态元素监听 | 事件委托 + MutationObserver 混合 | click 用委托(性能),hover/focus 用 Observer |
| 批量上报 | 混合模式(10 事件 OR 5 秒) | 平衡延迟和网络开销 |
| 防抖 | 元素级防抖(WeakMap) | 精确控制,避免内存泄漏 |
| 自动埋点选择 | CSS 选择器 + React Fiber 检查 | 全面覆盖,支持框架绑定 |
| 缓存存储 | localforage (IndexedDB) | 项目标准,自动降级 |
| 版本号获取 | Vite 环境变量 | 构建时注入,无需手动维护 |

---

**Next Steps**: 进入 Phase 1,生成 data-model.md, contracts/, quickstart.md
