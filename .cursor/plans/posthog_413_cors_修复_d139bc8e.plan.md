---
name: PostHog 413 CORS 修复
overview: 线上 pr.opentu.ai 出现的 PostHog 请求被 CORS 拦截与 413 Content Too Large 源于单次上报体过大；通过限制 SDK 单批大小与事件体积、并可选关闭/降频部分上报，避免超过服务端限制并消除由此引发的 CORS 报错与性能问题。
todos: []
isProject: false
---

# PostHog 413 与 CORS 线上问题修复计划

## 问题分析

- **413 Content Too Large**：PostHog 的批量上报接口（`https://us.i.posthog.com/s/?...`）对单次请求体有大小限制（通常约 1MB）。首屏或某次 flush 时，若队列中事件过多或单条 payload 过大，就会返回 413。
- **CORS 报错**：当服务端返回 4xx（如 413）时，部分响应不会带上 `Access-Control-Allow-Origin`，浏览器会先报 CORS，根本原因是请求体过大导致 413。
- **性能影响**：大量事件排队、重试与失败会占用主线程与网络，拖慢首屏与交互。

当前事件来源较多且未做“瘦身”与限流：

- **PostHog 内联脚本**（[apps/web/index.html](apps/web/index.html)）：未关闭 autocapture、未配置 `rate_limiting`，默认会发 pageview、autocapture 等。
- **Web Vitals**（[packages/drawnix/src/services/web-vitals-service.ts](packages/drawnix/src/services/web-vitals-service.ts)）：LCP、FCP、CLS、TTFB、INP 共 5 类事件，每条带完整 event 对象和 page_url 等。
- **Page Report**（[packages/drawnix/src/services/page-report-service.ts](packages/drawnix/src/services/page-report-service.ts)）：page_view（含 user_agent、viewport 等）、page_performance（含 total_resources、total_size 等）、page_hidden/visible、page_unload。
- **业务埋点**：AI 生成、Chat、Asset、Backup、Tracking 等大量调用 [packages/drawnix/src/utils/posthog-analytics.ts](packages/drawnix/src/utils/posthog-analytics.ts) 的 `track()`。
- **Declarative tracking**（[packages/drawnix/src/services/tracking/tracking-batch-service.ts](packages/drawnix/src/services/tracking/tracking-batch-service.ts)）：每 10 条或 5 秒 flush 一批，每条带 version、url、timestamp、sessionId、viewport 等 metadata。

---

## 修复方案

### 1. 在 PostHog init 中限制单批大小与速率（推荐优先做）

在 [apps/web/index.html](apps/web/index.html) 的 `posthog.init()` 中增加：

- **rate_limiting**：降低 `events_burst_limit`（例如从默认 100 改为 30），避免首屏或短时间大量事件一次性发出导致单次请求过大。
- **request_queue**（若当前加载的 PostHog 版本支持）：设置 `flush_interval_ms` 为较小值（如 2000），让 flush 更频繁、每批更小，降低单次请求体体积。

同时可考虑：

- **autocapture: false** 或严格 `url_allowlist`：白板类 SPA 点击多，autocapture 事件量很大；若不需要点击级分析，关闭可显著减少事件数。
- **before_send**（可选）：在发送前裁剪或采样事件（如限制字符串长度、去掉不必要的大字段），进一步控制单条与整批大小。

以上配置可有效避免单次请求超过服务端限制，从而消除 413 及随之而来的 CORS 报错。

### 2. 精简单条事件 payload（从源头减体积）

- **Page Report**（[packages/drawnix/src/services/page-report-service.ts](packages/drawnix/src/services/page-report-service.ts)）：
  - `page_view`：对 `user_agent` 做截断或只传简短 device 类型，避免长 UA 撑大 payload。
  - `page_performance`：`total_resources` / `total_size` 等若仅用于内部分析，可改为采样上报或缩短字段名/数值精度。
- **Web Vitals**（[packages/drawnix/src/services/web-vitals-service.ts](packages/drawnix/src/services/web-vitals-service.ts)）：
  - 保留指标与 rating 等必要字段，去掉重复的 `page_url` 或统一缩短（例如只传 pathname）。
- **Tracking 批量的 metadata**（[packages/drawnix/src/services/tracking/posthog-adapter.ts](packages/drawnix/src/services/tracking/posthog-adapter.ts)）：
  - 控制 `version`、`url`、`sessionId` 等长度或仅在部分事件中附带，避免每条重复大段相同数据。

在不影响分析的前提下，优先缩小 page_report 和 web_vitals 的单条体积，对防止 413 最直接。

### 3. 错峰与降频（可选）

- 将 **page_performance** 的上报延后（例如在 `load` 后 setTimeout 1–2s 再发），避免与 pageview、web_vitals 在同一秒内扎堆。
- 对 **Web Vitals** 只上报关键 2–3 个（如 LCP、CLS、INP），或对同一指标去重（仅首次/最差一次），减少条数。

这样可进一步降低首屏 flush 时的总大小，减轻 413 与性能压力。

### 4. 413 与错误处理（可选）

- 在 `posthog.init` 中若提供 **on_request_error**，可对 statusCode === 413 做识别：不重试同一批、或只做有限次重试并打日志，避免无限重试加剧性能问题。
- 当前已有 `on_xhr_error: function() {}` 静默网络错误，CORS 报错多为 413 的连带现象；修复 413 后 CORS 会随之消失，无需单独“修 CORS”。

### 5. 文档与后续

- 在 [docs/POSTHOG_MONITORING.md](docs/POSTHOG_MONITORING.md) 中简短说明：线上若出现 PostHog 相关 CORS 报错，优先检查是否为 413，并说明已通过 rate_limiting、request_queue、before_send 与 payload 精简来规避。

---

## 实施顺序建议


| 步骤  | 内容                                                                                                    | 影响                  |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------- |
| 1   | index.html：`rate_limiting` + `request_queue.flush_interval_ms`，并视需求设 `autocapture: false` 或 allowlist | 直接降低单次请求体大小与事件数，优先做 |
| 2   | page-report-service：截断/精简 user_agent、page_performance 字段                                              | 减小单条体积              |
| 3   | web-vitals-service：精简 $web_vitals 属性（如去掉重复 page_url）                                                  | 减小单条体积              |
| 4   | 可选：before_send 裁剪、on_request_error 处理 413、page_performance 延后、Web Vitals 降频                           | 进一步稳与可观测            |


按上述顺序实施后，413 与由此引起的 CORS 及性能问题应能消除或明显缓解；若仍偶发 413，可再加强 before_send 与降频。