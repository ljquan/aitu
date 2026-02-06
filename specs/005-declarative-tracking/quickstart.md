# Quick Start: 声明式埋点上报系统

**Feature**: 005-declarative-tracking
**Audience**: 开发者
**Time**: 5-10 分钟

## Overview

本指南帮助您快速上手使用声明式埋点系统,从基础的手动埋点到高级的自动埋点功能。

---

## Prerequisites

- Node.js 18+
- 项目已集成 Umami Analytics
- 了解基本的 React 和 TypeScript

---

## Installation

### 1. 确认 Umami 已配置

检查 `apps/web/index.html` 或应用入口是否有 Umami 脚本:

```html
<!-- 应该已存在 -->
<script
  defer
  src="https://your-umami-domain/script.js"
  data-website-id="your-website-id"
></script>
```

### 2. 安装依赖

```bash
# 项目依赖已包含,无需额外安装
npm install
```

---

## Basic Usage (基础埋点)

### Step 1: 在 Drawnix 中启用埋点插件

修改 `packages/drawnix/src/drawnix.tsx`:

```typescript
import { withTracking } from './plugins/tracking';

// 在其他插件后添加 withTracking
const editor = withMind(
  withDraw(
    withFreehand(
      withTracking(
        // 其他插件...
      )
    )
  )
);
```

### Step 2: 添加手动埋点属性

在任意 React 组件中使用 `track` 属性:

```tsx
// 示例: UnifiedToolbar.tsx
export const UnifiedToolbar = () => {
  return (
    <div className="toolbar">
      {/* 基础埋点 */}
      <Button track="toolbar_click_pen">
        <PenIcon />
      </Button>

      {/* 带参数的埋点 */}
      <Button
        track="toolbar_click_shape"
        track-params='{"shape": "rectangle"}'
      >
        <RectIcon />
      </Button>

      {/* 不埋点 */}
      <Button>
        Normal Button
      </Button>
    </div>
  );
};
```

### Step 3: 验证埋点

1. 启动开发服务器: `npm start`
2. 打开浏览器控制台(F12)
3. 点击添加了 `track` 属性的按钮
4. 查看控制台日志(开发模式下会输出):
   ```
   [Tracking] Event tracked: toolbar_click_pen
   [Tracking] Batching event (1/10)
   ```
5. 等待 5 秒或点击 10 个事件后,检查网络请求:
   ```
   POST https://your-umami-domain/api/send
   Payload: { name: "toolbar_click_pen", data: { version: "1.2.3", url: "..." } }
   ```

---

## Advanced Usage (高级功能)

### 1. 自动埋点模式

启用自动埋点,无需手动添加 `track` 属性:

```typescript
// packages/drawnix/src/drawnix.tsx
const editor = withTracking(
  // ... other plugins
  {
    autoTrack: true  // 启用自动埋点
  }
);
```

**效果**:
- 所有 `<button>`, `<a>`, `<input type="button">` 等交互元素自动埋点
- 事件名自动生成,基于元素特征(如按钮文本、ID、aria-label)
- 排除导航栏、页脚、工具栏等区域

**示例**:
```tsx
// 无需 track 属性
<Button id="save-btn">保存</Button>

// 自动生成事件名: auto_click_save-btn 或 auto_click_保存
```

### 2. 排除特定元素

使用 `data-track-ignore` 属性排除埋点:

```tsx
<nav data-track-ignore>
  <Button>导航按钮</Button>  {/* 不会自动埋点 */}
</nav>

<Button data-track-ignore>
  临时不埋点的按钮
</Button>
```

### 3. 支持其他事件类型

除了 click,还支持 hover、focus 等事件:

```tsx
// Hover 埋点
<Card track-hover="card_hover_features">
  Feature Card
</Card>

// Focus 埋点
<Input track-focus="input_focus_search" />

// 同时支持多种事件
<Element
  track="element_click"
  track-hover="element_hover"
  track-focus="element_focus"
/>
```

---

## Configuration (配置)

### 全局配置

创建 `packages/drawnix/src/config/tracking.config.ts`:

```typescript
import type { TrackConfig } from '../types/tracking.types';

export const trackingConfig: Partial<TrackConfig> = {
  autoTrack: false,           // 默认关闭自动埋点
  debounceTime: 500,          // 防抖 500ms
  logLevel: 'error',          // 生产环境只记录错误
  batchConfig: {
    enabled: true,
    batchSize: 10,            // 10 个事件批量上报
    batchTimeout: 5000        // 或 5 秒超时
  },
  excludedSelectors: [
    'nav',
    'header',
    'footer',
    '[data-track-ignore]',
    '.no-track'               // 自定义排除类
  ]
};
```

应用配置:

```typescript
// drawnix.tsx
import { trackingConfig } from './config/tracking.config';

const editor = withTracking(
  // ... plugins
  trackingConfig
);
```

### 环境变量配置

在 `vite.config.ts` 中注入版本号:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import packageJson from './package.json';

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version)
  }
});
```

---

## Testing (测试)

### 开发环境测试

启用调试模式:

```typescript
const editor = withTracking(
  // ... plugins
  {
    devMode: true,          // 启用开发模式
    logLevel: 'debug'       // 输出详细日志
  }
);
```

控制台输出示例:
```
[Tracking] Service initialized
[Tracking] Event captured: button_click_save
[Tracking] Debounce check passed
[Tracking] Event queued (1/10)
[Tracking] Batch timeout started (5s)
[Tracking] Batch uploading (10 events)
[Tracking] Upload successful
```

### 单元测试

```typescript
// packages/drawnix/src/services/tracking/__tests__/tracking-service.test.ts
import { TrackingService } from '../tracking-service';

describe('TrackingService', () => {
  let service: TrackingService;

  beforeEach(() => {
    service = new TrackingService(mockConfig);
  });

  it('should track event', async () => {
    await service.track('test_event', { param: 'value' });

    expect(service.getStats().totalEvents).toBe(1);
  });

  it('should debounce duplicate events', async () => {
    const element = document.createElement('button');

    await service.track('test_event', {}, element);
    await service.track('test_event', {}, element);  // 应被防抖

    expect(service.getStats().totalEvents).toBe(1);
  });
});
```

### E2E 测试

```typescript
// tests/e2e/tracking/declarative-tracking.spec.ts
import { test, expect } from '@playwright/test';

test('should track button click', async ({ page }) => {
  // 监听网络请求
  const requests: any[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/send')) {
      requests.push(request.postDataJSON());
    }
  });

  // 访问页面
  await page.goto('http://localhost:7200');

  // 点击埋点按钮
  await page.click('[track="button_click_save"]');

  // 等待批量上报(最多 5 秒)
  await page.waitForTimeout(5500);

  // 验证请求
  expect(requests.length).toBeGreaterThan(0);
  expect(requests[0].name).toBe('button_click_save');
  expect(requests[0].data.version).toBeDefined();
  expect(requests[0].data.url).toContain('localhost:7200');
});
```

---

## Troubleshooting (问题排查)

### 1. 埋点不生效

**症状**: 点击元素后没有上报事件

**排查步骤**:
1. 检查 Umami SDK 是否加载:
   ```javascript
   console.log(window.umami); // 应该是一个对象
   ```
2. 检查插件是否启用:
   ```typescript
   // drawnix.tsx 中是否调用了 withTracking
   ```
3. 检查元素是否被排除:
   ```typescript
   // 元素是否在 nav/header/footer 内?
   // 元素是否有 data-track-ignore 属性?
   ```
4. 检查防抖:
   ```typescript
   // 是否在 500ms 内重复点击?
   ```

### 2. 批量上报不触发

**症状**: 事件队列一直累积,不上报

**排查步骤**:
1. 检查批量配置:
   ```typescript
   batchConfig: {
     enabled: true  // 是否启用?
   }
   ```
2. 检查网络连接:
   ```bash
   curl https://your-umami-domain/api/send
   ```
3. 查看控制台错误:
   ```javascript
   // 是否有 CORS 错误?
   // 是否有 401/403 认证错误?
   ```

### 3. 缓存不工作

**症状**: 离线时事件丢失,未缓存

**排查步骤**:
1. 检查 IndexedDB 是否可用:
   ```javascript
   console.log(window.indexedDB); // 应该存在
   ```
2. 检查 localforage 初始化:
   ```typescript
   import localforage from 'localforage';
   const cache = await localforage.getItem('tracking_cache');
   console.log(cache);
   ```

### 4. 版本号不显示

**症状**: Umami 面板中 `version` 字段为空

**排查步骤**:
1. 检查环境变量:
   ```javascript
   console.log(import.meta.env.VITE_APP_VERSION);
   ```
2. 检查 vite.config.ts 配置
3. 重新构建项目:
   ```bash
   npm run build
   ```

---

## Best Practices (最佳实践)

### 1. 事件命名规范

**推荐**:
```typescript
// 使用 snake_case,包含动作和对象
track="button_click_save"
track="card_hover_feature"
track="input_focus_search"
```

**不推荐**:
```typescript
// 太简短,不明确
track="click"
track="save"

// 太长,冗余
track="user_clicked_the_save_button_in_the_toolbar"
```

### 2. 参数设计

**推荐**:
```tsx
<!-- 有意义的结构化参数 -->
<Button
  track="toolbar_click_shape"
  track-params='{"shape": "rectangle", "color": "red"}'
/>
```

**不推荐**:
```tsx
<!-- 参数过多或无用 -->
<Button
  track="click"
  track-params='{"a": 1, "b": 2, "c": 3, "d": 4, "e": 5, ...}'
/>
```

### 3. 性能优化

- ✅ 使用批量上报(减少网络请求)
- ✅ 启用防抖(避免重复上报)
- ✅ 合理配置排除区域(减少无用埋点)
- ❌ 不要在高频事件上埋点(如 mousemove)

### 4. 隐私保护

- ✅ 不在 `track-params` 中包含敏感信息(密码、信用卡号)
- ✅ 过滤用户输入的文本内容
- ✅ 遵守 GDPR/CCPA 合规要求

---

## Next Steps

- 📖 阅读 [data-model.md](./data-model.md) 了解数据结构
- 📖 阅读 [contracts/umami-api.md](./contracts/umami-api.md) 了解 API 集成
- 🛠️ 查看 [tasks.md](./tasks.md) 了解实现细节(待生成)
- 🧪 运行测试: `npm test packages/drawnix/src/services/tracking`

---

## FAQ

**Q: 自动埋点会影响性能吗?**
A: 性能开销 <2%,使用事件委托和防抖机制优化。

**Q: 可以在生产环境禁用埋点吗?**
A: 可以,设置 `logLevel: 'silent'` 并在配置中禁用所有埋点。

**Q: 支持移动端吗?**
A: 支持,touch 事件会映射到 click 事件。

**Q: 如何自定义事件名生成规则?**
A: 修改 `tracking-utils.ts` 中的 `generateAutoEventName()` 函数。

---

**Happy Tracking! 🎉**
