# PostHog 413/CORS 修复与统计上报旁路化优化

## 目标

1. 消除线上 413 Content Too Large 及由此引发的 CORS 报错。
2. **统计上报作为旁路逻辑，不占用主流程 CPU/网络，不影响首屏与交互性能。**

---

## 一、问题根因简述

- **413**：PostHog `/s/` 单次请求体有大小限制（约 1MB），首屏或某次 flush 事件过多/单条过大即触发。
- **CORS**：413 等错误响应常不带 `Access-Control-Allow-Origin`，浏览器先报 CORS，本质是 413。
- **主流程影响**：当前统计在 1s 后同步初始化（Web Vitals、Page Report），且 `analytics.track()` 同步执行 `sanitizeObject` + `posthog.capture()`，可能和首屏/用户操作抢主线程与网络。

---

## 二、旁路逻辑优化（优先：不影响主流程性能）

### 2.1 统计初始化延后到空闲

- **位置**：[apps/web/src/main.tsx](apps/web/src/main.tsx)
- **现状**：`setTimeout(initMonitoring, 1000)` 轮询 PostHog 后同步执行 `initWebVitals()`、`initPageReport()`。
- **调整**：
  - 用 `requestIdleCallback`（带 `timeout: 3000` 兜底）调度「检查 PostHog + 执行 initWebVitals/initPageReport」；无 `requestIdleCallback` 时用 `setTimeout(..., 3000)`。
  - 或：先 `setTimeout(initMonitoring, 2000)` 再在 initMonitoring 内用 requestIdleCallback 调用 initWebVitals/initPageReport，确保不占用首屏 2s 内主线程。

### 2.2 上报执行放到空闲（track 旁路化）

- **位置**：[packages/drawnix/src/utils/posthog-analytics.ts](packages/drawnix/src/utils/posthog-analytics.ts)
- **思路**：调用方调用 `track()` 时只做轻量入队或调度，真正执行 `sanitizeObject` + `window.posthog.capture` 放到空闲时执行，调用方同步返回。
- **实现**：
  - 在 `track(eventName, eventData)` 内：若存在 `requestIdleCallback`，则 `requestIdleCallback(() => { 脱敏 + capture })`（timeout 约 2s）；否则 `setTimeout(..., 0)`。不改变对外 API，调用方无需改动。
  - 注意：脱敏和 capture 均在 idle/timeout 回调内执行，避免在主路径上做任何重逻辑或网络。

### 2.3 Web Vitals 上报不阻塞 CWV 回调

- **位置**：[packages/drawnix/src/services/web-vitals-service.ts](packages/drawnix/src/services/web-vitals-service.ts)
- **现状**：`reportWebVitals(metric)` 内直接调用 `analytics.track('$web_vitals', ...)`，在 web-vitals 库的回调栈里同步执行。
- **调整**：在 `reportWebVitals` 内不直接 track，而是用 `requestIdleCallback`（或 `setTimeout(..., 0)`）再调用 `analytics.track(...)`，使上报与 CWV 回调解耦；若 2.2 已做 track 内 requestIdleCallback，这里可只做一层 `setTimeout(0)` 延后，减少在性能回调栈里的工作。

### 2.4 Page Report 初始化与单次上报旁路

- **位置**：[packages/drawnix/src/services/page-report-service.ts](packages/drawnix/src/services/page-report-service.ts)
- **初始化**：`trackPageView()`、`trackPagePerformance()` 的首次调用由 main.tsx 的 init 触发；若 2.1 已把 init 放到 requestIdleCallback，则首屏已不占主流程。
- **单次上报**：`trackPageView`、`trackPagePerformance`、visibilitychange/popstate/pushState 里的 track 可保持现状，依赖 2.2 的 track 旁路化即可；若希望更保守，可在这些函数内部用 `requestIdleCallback` 或 `setTimeout(0)` 再调 `analytics.track`。

### 2.5 错误隔离

- 所有统计相关逻辑（init、track、flush）包在 try/catch 内，失败只 `console.debug`/`console.warn`，不向上 throw。
- PostHog 未加载或 init 失败时静默跳过，不轮询到影响主流程；可选：最多重试 2～3 次后放弃 init。

### 2.6 PostHog 脚本加载（可选）

- 若希望进一步减少对首屏的影响，可将 [apps/web/index.html](apps/web/index.html) 中的 PostHog 内联脚本改为在 `window.load` 或第一次 `requestIdleCallback` 中动态插入，避免阻塞 HTML 解析；需评估对「首屏事件是否漏报」的影响（通常可接受）。

---

## 三、413 / 请求体积控制（与旁路并行）

### 3.1 PostHog init 配置（index.html）

- `rate_limiting`: 降低 `events_burst_limit`（如 30），避免单次 flush 过大。
- `request_queue`: 若 SDK 支持，设 `flush_interval_ms`（如 2000），使每批更小。
- 视需求 `autocapture: false` 或严格 `url_allowlist`，减少事件数量。
- 可选 `before_send`：裁剪/采样事件、限制字符串长度，控制单条与整批大小。

### 3.2 单条 payload 精简

- **Page Report**：`user_agent` 截断或只传简短 device 类型；`page_performance` 中 `total_resources`/`total_size` 等可采样或缩短。
- **Web Vitals**：去掉重复的 `page_url` 或只传 pathname。
- **Tracking 批量**：控制 metadata（version、url、sessionId）长度，避免每条重复大段相同数据。

### 3.3 413 与错误处理（可选）

- `on_request_error` 中识别 413，不做无限重试，仅有限次或打日志。

---

## 四、实施顺序建议

| 步骤 | 内容 | 说明 |
|------|------|------|
| 1 | main.tsx：统计 init 改为 requestIdleCallback（+ timeout 兜底） | 统计初始化不占首屏主流程 |
| 2 | posthog-analytics.ts：track 内用 requestIdleCallback/setTimeout 执行脱敏+capture | 所有上报旁路化，不阻塞调用方 |
| 3 | web-vitals-service：reportWebVitals 内延后再调用 analytics.track | CWV 回调栈中不做 I/O |
| 4 | index.html：rate_limiting、request_queue、可选 autocapture/before_send | 避免 413，与旁路无冲突 |
| 5 | page-report / web-vitals payload 精简 | 进一步减小单次请求体积 |
| 6 | 错误隔离与可选 on_request_error | 统计失败不影响主流程、可观测 |

---

## 五、验收要点

- 首屏 LCP/FCP/可交互时间不受「是否开启统计」影响（可对比 report=0 与 report=1）。
- 控制台不再出现 PostHog 413 及由此引发的 CORS 报错。
- 统计事件仍能正常上报（PostHog 后台可见），仅延迟到空闲执行。
