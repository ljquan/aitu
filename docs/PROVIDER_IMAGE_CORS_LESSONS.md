# 多供应商生图 CORS 预检失败排障经验

更新日期：2026-09-08

## 典型现象

浏览器图片请求只显示 `Failed to fetch`，而 curl 可以访问接口。这通常说明正式 POST 之前的 CORS 预检失败，不能直接归因于模型、提示词或 HTTP 500。

加入 `X-Request-Id` 后，浏览器会在 `OPTIONS` 中声明：

```text
Access-Control-Request-Headers: authorization,content-type,x-request-id
```

目标节点必须在 `Access-Control-Allow-Headers` 中明确放行该头。

## 当前可信节点边界

可信 Tuzi 节点与 Request-ID-CORS 兼容节点必须分开维护。

已验证允许 `X-Request-Id`：

- `bus.tu-zi.com`
- `bus2.tu-zi.com`
- `bus3.tu-zi.com`
- `business.tu-zi.com`

六个普通可信节点通过 OpenTu 固定同源代理携带该头，并保持原 Token、计费和权限域。
Request-ID-CORS 节点不得混入普通请求的全局备用列表，避免改变其他接口路由。

## 修复原则

- 自定义头必须由共享 provider transport 统一判断，不能散落在各 adapter。
- 官方生产页面的同步图片 POST 通过固定同源代理保持原配置节点；部署不支持代理时保持直连并省略不兼容的 Request ID，不改写到其他节点。
- 传输层不会因网络结果不明或 HTTP 错误自动重提正式 POST；明确 `model_not_found` 后的既有模型别名纠正单独处理。
- 只读恢复 GET 不携带 Request ID，故障后只在下一轮查询原配置节点。
- 绝对第三方 URL、非可信供应商不得收到任务 ID 或 Tuzi 凭据。
- 本地和局域网开发沿用既有代理；`opentu.ai`、`pr.opentu.ai`、Vercel 和 Netlify 只为同步图片提交与恢复查询选择固定代理，其他媒体保持原路由。
- `web.opentu.ai`、`share.opentu.ai` 等独立服务不自动启用代理，避免代理配置缺失时落入 SPA 页面。
- 自定义公网部署只有在自行提供固定路由并设置 `VITE_TUZI_SAME_ORIGIN_PROXY=1` 时才可使用同源代理。

## 排障顺序

1. 用无自定义头请求验证 Base URL、Token、模型和请求体。
2. 单独检查带 `x-request-id` 的 OPTIONS。
3. 在浏览器 Network 中确认最终 Request URL 和 Request Headers；官方普通节点应命中 `/__opentu_tuzi_proxy__/`，兼容节点应保持直连。
4. 区分请求头 `X-Request-Id` 与响应头 `X-Oneapi-Request-Id`。
5. 确认网络结果不明后没有向原节点或其他节点发送第二个图片 POST。
6. 刷新恢复场景另行确认结果 GET 不携带 Request ID。

## 安全与性能

- 不记录或持久化 API Key 副本。
- 同源代理只允许六个固定 Tuzi 上游，禁止任意目标转发，并关闭请求与响应缓冲以避免大文件占用内存。
- 不把 Request ID 发送到不可信地址。
- 不用健康请求并行轮询来掩盖 CORS 问题。
- 轮询必须有并发上限、超时、退避、响应体限制和资源清理。
