# Implementation Plan: 声明式埋点上报系统

**Branch**: `005-declarative-tracking` | **Date**: 2025-12-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-declarative-tracking/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

实现一个声明式埋点上报系统,允许开发者通过 HTML 属性(如 `track="event_name"`)为元素添加埋点,系统自动捕获用户交互并上报到 Umami 分析服务。支持事件批量上报、失败重试、自动埋点模式,以及扩展的元数据(项目版本号、页面地址)。技术方案基于插件架构(withTracking),使用事件委托和 MutationObserver 监听动态元素,集成现有 Umami SDK 并扩展参数上报能力。

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**:
- React 18+
- Umami Analytics SDK (现有集成)
- RxJS (状态管理,参考现有 services 模式)
- localforage (事件缓存)
**Storage**: IndexedDB (via localforage) - 用于缓存失败的上报事件(最多 100 个,保留 1 小时)
**Testing**: Jest + React Testing Library (单元/组件测试), Playwright (E2E 测试)
**Target Platform**: Modern browsers (支持 MutationObserver, navigator.sendBeacon, IndexedDB)
**Project Type**: Monorepo (Nx) - 代码放置在 packages/drawnix/src/plugins/ 和 packages/drawnix/src/services/
**Performance Goals**:
- 事件上报延迟 <100ms (批量上报前)
- 防抖 500ms
- 批量上报减少网络请求 60%+
- 性能开销 <2% 页面加载时间
**Constraints**:
- 单文件 <500 行(宪章硬性约束)
- 缓存上限 100 个事件, 1 小时 TTL
- 批量上报:10 个事件或 5 秒
- 排除导航/工具栏/页脚区域的自动埋点
**Scale/Scope**:
- 支持 1000+ 可点击元素的页面
- 自动埋点覆盖率 95%+
- 适配现有 Drawnix 组件生态

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ I. 插件优先架构
- **合规**: 实现为 `withTracking` 插件,遵循现有 `withFreehand`, `withMind` 等模式
- **自包含**: 埋点逻辑独立,不侵入其他插件
- **可组合**: 与其他插件无冲突,通过配置启用/禁用
- **框架无关**: 核心逻辑(事件监听、批量上报、缓存)可独立于 React 使用

### ✅ II. 文件大小约束
- **合规策略**:
  - 插件入口: `withTracking.ts` (<200 行,仅组合逻辑)
  - 服务层: `tracking-service.ts` (<500 行,核心上报逻辑)
  - 工具类: `tracking-utils.ts` (<300 行,事件名生成、选择器匹配)
  - 配置: `tracking-config.types.ts` (<150 行,类型定义)
  - 存储: `tracking-storage-service.ts` (<250 行,缓存管理,复用 localforage 模式)
  - 批处理: `tracking-batch-service.ts` (<300 行,批量上报逻辑)
- **验证**: 每个文件独立功能,可独立测试,总共 6 个文件,均 <500 行

### ✅ III. 类型安全优先
- **合规**:
  - 所有配置使用 `interface TrackConfig`
  - 事件对象使用 `interface TrackEvent`
  - 严格类型化的事件参数(JSON 解析后验证)
  - 避免 `any`,使用泛型和联合类型

### ✅ IV. 设计系统一致性
- **N/A**: 本功能无 UI 组件,纯逻辑层服务
- **日志输出**: 开发环境使用 console.warn,生产环境使用错误日志服务

### ✅ V. 性能与优化
- **合规**:
  - 使用防抖(500ms)避免重复上报
  - 事件委托减少监听器数量
  - MutationObserver 仅监听必要的 DOM 变更
  - 批量上报减少网络开销
  - 使用 WeakMap 存储元素引用,避免内存泄漏

### ✅ VI. 安全与验证
- **合规**:
  - 验证 `track-params` JSON 格式,捕获解析错误
  - 过滤敏感信息(密码输入框的值不上报)
  - API 密钥从配置读取,不硬编码
  - navigator.sendBeacon 确保页面卸载时的安全上报

### ✅ VII. Monorepo 结构
- **合规**:
  - 插件代码: `packages/drawnix/src/plugins/tracking/`
  - 服务代码: `packages/drawnix/src/services/tracking/`
  - 类型定义: `packages/drawnix/src/types/tracking.types.ts`
  - 测试: `packages/drawnix/src/plugins/tracking/__tests__/`

### ⚠️ VIII. 测试要求
- **计划**:
  - 单元测试: 事件捕获、批量逻辑、缓存管理
  - 组件测试: 插件集成测试(模拟 DOM 交互)
  - 集成测试: 与 Umami SDK 的集成
  - E2E 测试: 完整用户交互流程(点击 → 批量上报 → 验证上报数据)
- **目标覆盖率**: >80%

## Project Structure

### Documentation (this feature)

```text
specs/005-declarative-tracking/
├── spec.md              # 功能规范
├── plan.md              # 本文件(实现计划)
├── research.md          # Phase 0: 技术调研(Umami API、事件监听模式)
├── data-model.md        # Phase 1: 数据模型(TrackEvent、TrackConfig、缓存结构)
├── quickstart.md        # Phase 1: 快速开始指南
├── contracts/           # Phase 1: Umami API 集成契约
│   └── umami-api.md     # Umami 事件上报接口定义
├── checklists/          # 质量检查清单
│   └── requirements.md  # 需求完整性检查
└── tasks.md             # Phase 2: 任务分解(待生成)
```

### Source Code (repository root)

```text
packages/drawnix/src/
├── plugins/
│   └── tracking/
│       ├── index.ts                    # 插件导出
│       ├── withTracking.ts             # 主插件入口(<200 行)
│       ├── hooks/
│       │   └── useTracking.ts          # React Hook 封装(<150 行)
│       └── __tests__/
│           ├── withTracking.test.ts
│           └── useTracking.test.ts
│
├── services/
│   └── tracking/
│       ├── tracking-service.ts         # 核心上报服务(<500 行)
│       ├── tracking-batch-service.ts   # 批量上报逻辑(<300 行)
│       ├── tracking-storage-service.ts # 缓存管理(<250 行)
│       ├── tracking-utils.ts           # 工具函数(<300 行)
│       └── __tests__/
│           ├── tracking-service.test.ts
│           ├── tracking-batch-service.test.ts
│           ├── tracking-storage-service.test.ts
│           └── tracking-utils.test.ts
│
├── types/
│   └── tracking.types.ts               # 类型定义(<150 行)
│
└── drawnix.tsx                         # 集成 withTracking 插件

apps/web/src/
└── (可选)配置文件,用于初始化埋点系统配置

tests/e2e/
└── tracking/
    ├── declarative-tracking.spec.ts    # 声明式埋点 E2E 测试
    └── auto-tracking.spec.ts           # 自动埋点 E2E 测试
```

**Structure Decision**: 采用 Monorepo (Option 3 变体),遵循现有 Drawnix 架构。核心逻辑在 `packages/drawnix/src/services/tracking/`,插件接口在 `packages/drawnix/src/plugins/tracking/`,类型定义在 `packages/drawnix/src/types/`。这种结构与现有的 `generation-api-service.ts`、`video-api-service.ts`、`chat-service.ts` 等服务保持一致,易于维护和测试。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*本功能无宪章违规,所有设计符合项目约束。*
