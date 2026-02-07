---
name: excalidraw-vs-aitu-comparison
overview: 深度对比 Excalidraw 与 Aitu(Drawnix) 项目，梳理 Excalidraw 中可借鉴的功能、架构模式和实现方案，标识当前项目尚未实现的特性。
todos:
  - id: arch-comparison
    content: 使用 [subagent:code-explorer] 深度分析两个项目的架构差异（包结构、渲染、状态管理、命令系统），输出架构对比章节
    status: completed
  - id: feature-matrix
    content: 整理功能对比矩阵表格，标注每项功能在两个项目中的实现状态、复杂度和用户价值
    status: completed
    dependencies:
      - arch-comparison
  - id: high-priority-analysis
    content: 使用 [subagent:code-explorer] 详解高优先级功能方案：命令面板、画布搜索、智能吸附、套索选择，含数据结构和算法
    status: completed
    dependencies:
      - arch-comparison
  - id: mid-priority-analysis
    content: 使用 [subagent:code-explorer] 详解中优先级功能方案：Frame 容器、肘形箭头、流程图快速创建、激光笔、标签页同步
    status: completed
    dependencies:
      - arch-comparison
  - id: low-priority-analysis
    content: 详解低优先级功能方案：实时协作、图表粘贴、字体子集化、跟随模式，给出核心实现要点
    status: completed
    dependencies:
      - arch-comparison
  - id: final-report
    content: 汇总生成完整分析报告，包含融合建议和分阶段实施路线图
    status: completed
    dependencies:
      - feature-matrix
      - high-priority-analysis
      - mid-priority-analysis
      - low-priority-analysis
---

## 产品概述

对 Excalidraw 开源白板项目进行深度分析，与当前 Aitu（开图）项目进行全面对比，输出一份结构化的技术分析报告。报告需涵盖：可借鉴的架构与功能设计、当前项目未实现的功能清单、对方核心特性的实现方案详解，并给出各功能的引入优先级建议。

## 核心内容

### 一、对比分析维度

- **架构设计对比**：Excalidraw 的包结构（common/math/element/excalidraw/utils 五包分层）vs Aitu 的 Plait 插件架构（drawnix/react-board/react-text）
- **状态管理对比**：Excalidraw 的 Jotai + createIsolation 隔离上下文 vs Aitu 的 React Context + RxJS Subjects
- **命令系统对比**：Excalidraw 的 ActionManager 注册表模式（70+ Action）vs Aitu 的插件 withXxx 模式
- **数据持久化对比**：两者的 IndexedDB 使用策略、加密方案、同步机制
- **渲染架构对比**：Excalidraw 的双 Canvas（Static + Interactive）vs Plait 的 SVG 渲染

### 二、可借鉴的功能与方案

1. **命令面板（Command Palette）**：Ctrl+K 唤起，fuzzy 搜索，分类命令系统，集成 Action 注册表
2. **画布元素搜索（SearchMenu）**：文本元素和 Frame 名称搜索，debounce 350ms，结果导航与自动滚动
3. **智能吸附系统（Snapping）**：SNAP_DISTANCE=8px 随缩放调整，PointSnap 点对齐 + GapSnap 间距均等
4. **套索选择（Lasso）**：AnimatedTrail 基类 + 双重检测（封闭 + 相交），AABB 粗检测性能优化
5. **橡皮擦增强（Eraser）**：AnimatedTrail 衰减动画，分层检测（AABB→实心→轮廓→线段），组感知
6. **Frame 容器系统**：element.frameId 父子关系，线段相交检测，复制时维护绑定
7. **肘形箭头（Elbow Arrows）**：A* 寻路 + BinaryHeap，元素绑定、方向感知、障碍物避让
8. **流程图快速创建**：方向键创建节点和连接，查找前驱/后继关系
9. **激光笔（Laser Pointer）**：LaserTrails 管理本地和协作者轨迹，SVG 路径动画
10. **图表粘贴（Charts）**：TSV/CSV 解析为原生元素（条形图/线形图），智能数字解析
11. **端到端加密**：Web Crypto API AES-GCM，密钥存于 URL hash
12. **实时协作（Collab）**：Socket.IO + Firebase，Portal 封装，增量同步，reconcile 冲突解决
13. **跟随模式（Follow Mode）**：协作场景视口同步
14. **标签页同步（Tab Sync）**：localStorage storage 事件 + 时间戳版本追踪
15. **字体子集化（Font Subsetting）**：HarfBuzz + Woff2 WASM，Worker Pool 并行处理
16. **Action 系统**：命令模式注册表，统一的 ActionResult、keyTest、predicate、PanelComponent

### 三、当前 Aitu 项目缺失功能清单

按实现价值和难度分为高/中/低优先级：

- **高优先级**：命令面板、画布搜索、智能吸附/对齐参考线、套索选择
- **中优先级**：Frame 容器、肘形箭头、流程图快速创建、激光笔、标签页同步
- **低优先级**：实时多人协作、图表粘贴、字体子集化、跟随模式、版本历史/时间旅行、演示模式

### 四、实现方案详解

对每个可借鉴功能输出：核心数据结构、算法原理、关键源文件路径、与 Aitu 现有架构的融合建议

## 技术栈

本任务为技术分析报告，不涉及实际代码实现，但需要深入理解两个项目的技术栈差异：

| 维度 | Excalidraw | Aitu（开图） |
| --- | --- | --- |
| 框架 | React (Class + Hooks) | React (Hooks) + @plait |
| 状态管理 | Jotai + jotai-scope | React Context + RxJS |
| 渲染 | 双 Canvas (Static/Interactive) | SVG (Plait renderer) |
| 数学库 | @excalidraw/math (自研) | @plait/core 内置 |
| 构建 | Vite + Yarn Workspaces | Vite + Nx + pnpm |
| 持久化 | localStorage + IndexedDB | localforage (IndexedDB) |
| 协作 | Socket.IO + Firebase | GitHub Gist 异步同步 |
| 加密 | Web Crypto AES-GCM | AES-256-GCM (settings) |
| UI 组件 | 自研组件 | TDesign React |
| 测试 | Vitest | Nx test |


## 分析方案

### 1. 架构层面分析方法

**Excalidraw 包结构分析**：

- `@excalidraw/common` — 基础工具、常量、类型（不依赖 React）
- `@excalidraw/math` — 纯 2D 数学库（点、向量、线段、多边形运算）
- `@excalidraw/element` — 元素逻辑层（创建、变换、碰撞检测、frame、binding、elbowArrow）
- `@excalidraw/excalidraw` — 主 React 组件库（App.tsx 超大组件、actions、components、渲染器）
- `@excalidraw/utils` — 对外工具函数

**Aitu 包结构分析**：

- `packages/drawnix` — 核心白板库（components/plugins/services/hooks/engine）
- `packages/react-board` — React Board 封装
- `packages/react-text` — 文本组件
- `apps/web` — Web 应用层（含 Service Worker）

### 2. 功能对比矩阵

从以下维度逐项对比：

- 功能是否存在
- 实现复杂度（代码量/算法复杂度）
- 与现有架构的兼容性
- 引入后的用户价值

### 3. 实现方案提取

对每个核心功能，提取：

- **核心数据结构**（如 elbowArrow 的 Node/GridAddress、snapping 的 Gap/PointSnap）
- **算法原理**（如 A* 寻路、reconcile 冲突解决、polygonIncludesPointNonZero）
- **关键源文件**（精确到文件路径和行号范围）
- **性能优化手段**（如 AABB 粗检测、simplify 路径简化、throttle/debounce）
- **融合建议**（如何在 Plait 插件架构中实现）

## 实现路径

分析报告将按以下结构组织：

```
1. 总体架构对比
   1.1 包结构与模块划分
   1.2 渲染架构
   1.3 状态管理
   1.4 命令/动作系统

2. 功能对比矩阵（表格形式）

3. 可借鉴功能详解（按优先级排序）
   3.1 高优先级功能（命令面板、搜索、吸附、套索）
   3.2 中优先级功能（Frame、肘形箭头、流程图、激光笔）
   3.3 低优先级功能（协作、图表粘贴、字体子集化）

4. 融合建议与实施路线图
```

## 关键文件路径参考

### Excalidraw 核心文件

- Action 系统：`excalidraw/packages/excalidraw/actions/manager.tsx`, `types.ts`
- 命令面板：`excalidraw/packages/excalidraw/components/CommandPalette/CommandPalette.tsx`
- 搜索菜单：`excalidraw/packages/excalidraw/components/SearchMenu.tsx`
- 吸附系统：`excalidraw/packages/excalidraw/snapping.ts`
- 套索选择：`excalidraw/packages/excalidraw/lasso/index.ts`, `utils.ts`
- 橡皮擦：`excalidraw/packages/excalidraw/eraser/index.ts`
- 动画轨迹基类：`excalidraw/packages/excalidraw/animated-trail.ts`
- 激光笔：`excalidraw/packages/excalidraw/laser-trails.ts`
- Frame 系统：`excalidraw/packages/element/src/frame.ts`
- 肘形箭头：`excalidraw/packages/element/src/elbowArrow.ts`
- 流程图：`excalidraw/packages/element/src/flowchart.ts`
- 图表粘贴：`excalidraw/packages/excalidraw/charts.ts`
- 加密：`excalidraw/packages/excalidraw/data/encryption.ts`
- 协作：`excalidraw/excalidraw-app/collab/Collab.tsx`, `Portal.tsx`
- 数据协调：`excalidraw/packages/excalidraw/data/reconcile.ts`
- 标签页同步：`excalidraw/excalidraw-app/data/tabSync.ts`
- 跟随模式：`excalidraw/packages/excalidraw/components/FollowMode/FollowMode.tsx`
- 字体子集化：`excalidraw/packages/excalidraw/fonts/ExcalidrawFontFace.ts`

### Aitu 对应文件

- 插件系统：`packages/drawnix/src/plugins/`（20+ withXxx 插件）
- 服务层：`packages/drawnix/src/services/`（60+ 服务文件）
- 组件：`packages/drawnix/src/components/`（toolbar/media-library/chat-drawer 等）
- 主入口：`packages/drawnix/src/drawnix.tsx`
- 备份恢复：`packages/drawnix/src/services/backup-restore-service.ts`
- GitHub 同步：`packages/drawnix/src/services/github-sync/`

## 实现注意事项

1. **架构差异意识**：Excalidraw 的核心是一个巨大的 App.tsx 类组件（4000+ 行），所有交互逻辑集中管理；Aitu 采用 Plait 插件模式，逻辑分散在各 withXxx 插件中。借鉴功能时需要做架构适配。

2. **渲染差异**：Excalidraw 使用双 Canvas 渲染（性能更好），Aitu 使用 SVG 渲染（DOM 操作更灵活）。涉及渲染层的功能（如吸附参考线、套索动画）需要适配 SVG 方案。

3. **状态管理差异**：Excalidraw 的 Jotai 原子化状态 vs Aitu 的 Context + RxJS。命令面板等需要全局状态的功能，在 Aitu 中需要通过 Context 或 RxJS Subject 实现。

4. **Plait 框架约束**：部分功能（如 Frame 容器、肘形箭头）可能需要 @plait 框架层面的支持。需评估是否能通过插件扩展实现，还是需要修改框架源码。

## Agent Extensions

### SubAgent

- **code-explorer**
- 用途：深度探索 Excalidraw 项目和 Aitu 项目的大量源文件，进行跨文件、跨目录的批量代码分析
- 预期结果：精确提取每个功能模块的核心实现逻辑、数据结构、算法细节，生成准确的对比分析数据