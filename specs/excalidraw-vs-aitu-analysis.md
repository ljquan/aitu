# Excalidraw vs Aitu（开图）深度对比分析报告

## 一、总体架构对比

### 1.1 包结构与模块划分

| 维度 | Excalidraw | Aitu（开图） |
|------|-----------|-------------|
| **Monorepo 工具** | Yarn Workspaces | Nx + pnpm Workspaces |
| **核心包数量** | 5 个分层包 | 3 个包 + 1 个应用 |
| **分层策略** | 按**职责分层**（math→element→excalidraw） | 按**功能聚合**（drawnix 大包 + 插件系统） |
| **npm 发布** | `@excalidraw/excalidraw` 对外发布 | 内部使用，不发布 |

**Excalidraw 包依赖链：**
```
@excalidraw/common (基础工具/常量/类型)
  ↑
@excalidraw/math (2D 数学库：点/向量/线段/曲线/多边形)
  ↑
@excalidraw/element (元素逻辑：创建/变换/碰撞/绑定/frame)
  ↑
@excalidraw/excalidraw (主 React 组件：App/actions/renderer/fonts)
  ↑
excalidraw-app (Web 应用层：协作/Firebase/分享)
```

**Aitu 包结构：**
```
packages/drawnix (核心白板库：components/plugins/services/hooks/engine)
packages/react-board (React Board 封装，基于 @plait/core)
packages/react-text (文本渲染组件)
apps/web (Web 应用 + Service Worker)
```

**可借鉴点：** Excalidraw 的 `@excalidraw/math` 和 `@excalidraw/element` 拆分非常干净，math 包不依赖 React，element 包不依赖 UI，便于测试和复用。Aitu 可考虑将数学运算和元素逻辑从 drawnix 中抽离，减轻核心包的体积。

### 1.2 渲染架构

| 维度 | Excalidraw | Aitu |
|------|-----------|------|
| **渲染技术** | 双 Canvas（Static + Interactive） | SVG（@plait/core） |
| **静态层** | Canvas2D 绘制所有元素 | SVG DOM 元素 |
| **交互层** | Canvas2D 绘制选区/变换手柄/吸附线 | SVG + React 组件 |
| **性能特点** | Canvas 逐帧重绘，适合大量元素 | DOM 增量更新，灵活但节点多时性能下降 |
| **文本渲染** | Canvas 文本测量 + WYSIWYG HTML textarea | Slate.js 富文本 |

**Excalidraw 双 Canvas 架构：**
- `Renderer.ts` 调度类使用 `requestAnimationFrame` + dirty flag 控制重绘频率
- `staticScene.ts`：绘制所有元素的最终视觉效果（填充、描边、文字）
- `interactiveScene.ts`：绘制选区框、变换手柄、吸附辅助线、协作者光标

**影响：** 涉及渲染层的功能（吸附参考线、套索动画、激光笔）需要适配 SVG 方案。SVG 的好处是可以直接使用 `<path>` + `<animate>` 实现动画效果。

### 1.3 状态管理

| 维度 | Excalidraw | Aitu |
|------|-----------|------|
| **UI 状态** | Jotai atom + `jotai-scope` 隔离 | React Context（6 个 Context） |
| **服务状态** | Jotai atom + 独立 store（非 React 可访问） | RxJS Subject/Observable |
| **多实例** | `createIsolation()` 支持 | 单实例设计 |
| **跨组件通信** | Jotai atom 订阅 | Context + RxJS |

**Excalidraw 的 Jotai 模式：**
```typescript
// editor-jotai.ts — 隔离的 Jotai 上下文
const { useAtom, useSetAtom, useAtomValue, useStore, Provider } = createIsolation();
export const editorJotaiStore = createStore(); // 非 React 代码也能访问
```

**可借鉴点：** Aitu 的 Context 模式在组件层级浅时工作良好，但跨组件深层传递时不够便捷。如果未来需要支持多画板实例，可参考 Jotai 隔离方案。

### 1.4 命令/动作系统

| 维度 | Excalidraw | Aitu |
|------|-----------|------|
| **模式** | ActionManager 注册表（命令模式） | withXxx 插件模式 |
| **命令数** | 70+ Action | 27 个插件 |
| **执行入口** | 键盘/UI/右键菜单/命令面板/API | 键盘快捷键/工具栏按钮 |
| **统一返回** | `ActionResult { elements, appState, files }` | 直接操作 board 对象 |
| **可发现性** | 命令面板可搜索所有命令 | 无命令面板 |

**Excalidraw Action 示例：**
```typescript
const action: Action = {
  name: "alignTop",
  label: "Align top",
  icon: AlignTopIcon,
  keyTest: (event) => event.altKey && event.code === "KeyW",
  predicate: (elements, appState) => getSelectedElements(elements).length > 1,
  perform: (elements, appState) => ({ elements: alignTop(elements), appState }),
  PanelComponent: ({ updateData }) => <Button onClick={() => updateData(null)} />,
  trackEvent: { category: "element" },
};
```

**可借鉴点：** Action 系统将命令的定义（label/icon/shortcut/predicate）与执行（perform）统一封装，命令面板和工具栏都能复用。Aitu 的 `with-hotkey.ts` 将快捷键硬编码在一个文件中，扩展性较弱。

---

## 二、功能对比矩阵

### 2.1 Excalidraw 有而 Aitu 无的功能

| 功能 | 实现复杂度 | 用户价值 | 优先级 | 与 Aitu 兼容性 |
|------|-----------|---------|--------|---------------|
| **命令面板** | ★★☆ | ★★★ | 高 | 高（纯 UI 组件） |
| **画布元素搜索** | ★★☆ | ★★★ | 高 | 高（遍历 @plait 元素） |
| **智能吸附/对齐参考线** | ★★★ | ★★★ | 高 | 中（需适配 SVG 渲染线条） |
| **套索选择** | ★★★ | ★★☆ | 高 | 中（需适配 SVG 动画路径） |
| **Frame 容器** | ★★★ | ★★☆ | 中 | 低（需 @plait 框架支持） |
| **肘形箭头** | ★★★★ | ★★☆ | 中 | 低（需 A* 寻路 + @plait 扩展） |
| **流程图快速创建** | ★★☆ | ★★☆ | 中 | 中（依赖肘形箭头） |
| **激光笔** | ★★☆ | ★☆☆ | 中 | 高（SVG path 动画） |
| **标签页同步** | ★☆☆ | ★★☆ | 中 | 高（localStorage 事件） |
| **实时多人协作** | ★★★★★ | ★★★ | 低 | 低（需后端 + CRDT/OT） |
| **图表粘贴** | ★★☆ | ★☆☆ | 低 | 中（TSV 解析 + 元素创建） |
| **字体子集化** | ★★★ | ★☆☆ | 低 | 高（WASM Worker 独立） |
| **跟随模式** | ★★☆ | ★☆☆ | 低 | 低（依赖实时协作） |

### 2.2 Aitu 独有优势

| 功能 | 说明 |
|------|------|
| **AI 图片/视频生成** | 多模型支持、任务队列、工作流引擎 |
| **AI Agent + MCP 工具** | 系统提示词、工具解析、11 个内置 MCP 工具 |
| **矢量钢笔工具** | 贝塞尔曲线精确编辑 |
| **布尔运算** | 合并、减去、相交、排除 |
| **渐变填充/文本特效** | 渐变编辑器、渐变文字、阴影 |
| **精确橡皮擦** | 基于布尔运算的路径级精确擦除 |
| **GitHub Gist 云同步** | 加密分片同步（AES-256-GCM） |
| **工作区管理** | 文件夹/画板树形结构 |
| **备份恢复系统** | ZIP 格式完整备份 + 崩溃恢复 |
| **照片墙布局** | 网格/创意照片墙自动排版 |
| **视频合并** | WebCodecs 视频合并 |
| **小地图** | 智能显示/隐藏、画布导航 |

---

## 三、高优先级功能实现方案

### 3.1 命令面板（Command Palette）

**Excalidraw 实现要点：**

- **数据结构**：`CommandPaletteItem { label, keywords, haystack, icon, category, predicate, shortcut, perform }`
- **命令来源**：ActionManager 批量转换 + 手动额外命令 + 外部自定义命令 + 库项目动态命令
- **搜索算法**：`fuzzy` 库模糊匹配，`deburr` 去变音符号，`haystack = deburr(label) + keywords`
- **分类排序**：`DEFAULT_CATEGORIES = { app:1, export:2, editor:3, tools:4, elements:5, links:6 }`
- **键盘导航**：Arrow Up/Down 循环，Enter 执行，字母键自动聚焦搜索框
- **lastUsed 记忆**：Jotai atom 持久化最近使用的命令

**Aitu 融合建议：**

```typescript
// 1. 定义命令接口
interface CommandItem {
  id: string;
  label: string;           // 中英文都需要
  keywords?: string[];     // 额外搜索词
  icon?: React.ReactNode;
  category: 'tool' | 'edit' | 'view' | 'ai' | 'export' | 'settings';
  shortcut?: string;
  predicate?: (board: PlaitBoard) => boolean;
  perform: (board: PlaitBoard) => void;
}

// 2. 命令注册表（替代分散的 with-hotkey）
class CommandRegistry {
  private commands = new Map<string, CommandItem>();
  register(command: CommandItem): void;
  getAll(): CommandItem[];
  search(query: string): CommandItem[];  // fuzzy 搜索
  execute(id: string, board: PlaitBoard): void;
}

// 3. UI 组件使用 TDesign Dialog + 自定义搜索列表
// 触发方式：Ctrl+K / Cmd+K
```

**实现复杂度**：~500 行代码，1-2 天
**关键依赖**：`fuzzy` 或 `fuse.js` 模糊搜索库

---

### 3.2 画布元素搜索（Search Menu）

**Excalidraw 实现要点：**

- **搜索目标**：文本元素的 `originalText` + Frame 元素的 `name`
- **搜索算法**：正则匹配（`new RegExp(escaped, "gi")`），大小写不敏感
- **防抖**：350ms debounce
- **精确定位**：`measureText()` 计算匹配文字在元素内的像素偏移，生成 `matchedLines` 含 `{ offsetX, offsetY, width, height }`
- **自动滚动**：`scrollToContent(matchElement, { animate: true, duration: 300 })`
- **小字放大**：当 `fontSize * zoom < 14px` 时自动放大到可读级别
- **nonce 机制**：防止过期搜索结果覆盖新结果

**Aitu 融合建议：**

```typescript
// 1. 搜索 @plait 元素中的文本内容
const searchElements = (query: string, board: PlaitBoard) => {
  const regex = new RegExp(escapeRegex(query), 'gi');
  const results: SearchMatch[] = [];

  // 遍历 board.children，递归检查文本属性
  for (const element of board.children) {
    const text = getElementText(element); // 提取思维导图节点/形状/文本的文字
    if (text) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        results.push({ element, index: match.index, text });
      }
    }
  }
  return results;
};

// 2. 导航到匹配元素
const scrollToMatch = (match: SearchMatch, board: PlaitBoard) => {
  const rect = getElementRect(match.element); // @plait 获取元素边界
  board.scrollToPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
};

// 3. UI：Ctrl+F 打开搜索栏（可复用 TDesign Input）
```

**实现复杂度**：~400 行代码，1-2 天
**难点**：文本精确定位需要了解 @plait 的文本渲染坐标系

---

### 3.3 智能吸附系统（Snapping）

**Excalidraw 实现要点：**

**核心数据结构：**
```typescript
type PointSnap = {
  type: "point";
  points: [GlobalPoint, GlobalPoint]; // [被吸附点, 参考点]
  offset: number;                      // 需要移动的距离
};

type Gap = {
  startBounds: Bounds;    // 起始元素边界
  endBounds: Bounds;      // 终止元素边界
  overlap: InclusiveRange; // 垂直方向重叠范围
  length: number;          // 间隙长度
};

type GapSnap = {
  type: "gap";
  direction: "center_horizontal" | "side_left" | "side_right" | ...;
  gap: Gap;
  offset: number;
};
```

**算法流程（双遍计算）：**
1. **第一遍**：计算 snapOffset（允许 SNAP_DISTANCE=8px/zoom 的容差）
2. **第二遍**：用修正后的位置重新精确匹配，生成辅助线

**GapSnap 三种模式：**
- 居中对齐：被拖元素放在间隙正中
- 右侧等距：被拖元素距右侧元素 = 间隙长度
- 左侧等距：被拖元素距左侧元素 = 间隙长度

**性能优化：**
- `SnapCache` 静态单例缓存参考点和间隙
- 参考点仅计算可见且非选中的元素
- 排除绑定到容器的文本元素和单独箭头

**Aitu 融合建议：**

```typescript
// 需要在 @plait 的拖拽流程中注入吸附计算
// 1. 在 board.pointerMove 中拦截拖拽偏移
// 2. 计算所有可见元素的角点+中心点
// 3. 找到最近的对齐点，修正偏移量
// 4. 通过 SVG <line> 或 <path> 渲染吸附参考线

// 渲染层适配：使用 SVG overlay 而非 Canvas
const SnapOverlay: React.FC = () => {
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
  return (
    <svg className="snap-overlay" style={{ pointerEvents: 'none' }}>
      {snapLines.map((line, i) => (
        <line key={i} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
              stroke="#e91e63" strokeDasharray="4 4" />
      ))}
    </svg>
  );
};
```

**实现复杂度**：~800 行代码，3-5 天
**难点**：需要深入理解 @plait 的拖拽事件流和坐标系统，GapSnap 的间隙检测算法较复杂

---

### 3.4 套索选择（Lasso Selection）

**Excalidraw 实现要点：**

**架构分层：**
```
AnimatedTrail (基类)
  ├── SVGPathElement 单元素渲染
  ├── LaserPointer 底层笔画生成
  └── requestAnimationFrame 动画循环

LassoTrail extends AnimatedTrail
  ├── 蚂蚁线效果（stroke-dasharray + <animate>）
  ├── 双重选择检测
  └── 元素线段缓存
```

**选择算法（双重检测）：**
1. **AABB 粗筛**：`doBoundsIntersect(lassoBounds, elementBounds)` — O(1) 排除不相交元素
2. **包围测试**：`polygonIncludesPointNonZero()` — Non-Zero Winding Rule，元素任意端点在套索多边形内即算包围
3. **相交测试**：`intersectElementWithLineSegment()` — 套索路径线段与元素轮廓线段相交

**性能优化：**
- 路径简化：`simplify(path, 5/zoom)` Douglas-Peucker 变体
- 仅检测可见元素
- 元素线段缓存（画布变换改变时重建）
- 增量 Set 管理（避免重复检测）

**后处理：**
- 文本元素 → 替换为其容器
- Frame 子元素 → 从选中集中移除
- 组选择处理
- Shift 键追加选择

**Aitu 融合建议：**

```typescript
// 1. 在 @plait 中添加套索工具模式
// 2. SVG 路径绘制（比 Canvas 更自然）
class PlaitLassoTool {
  private pathElement: SVGPathElement;
  private points: Point[] = [];

  onPointerDown(event: PointerEvent) {
    this.points = [{ x: event.x, y: event.y }];
    this.createSVGPath();
  }

  onPointerMove(event: PointerEvent) {
    this.points.push({ x: event.x, y: event.y });
    this.updateSVGPath();
    this.updateSelection();
  }

  onPointerUp() {
    this.finalizeSelection();
    this.removeSVGPath();
  }

  private updateSelection() {
    const selected = board.children.filter(element => {
      const bounds = getElementBounds(element);
      if (!boundsIntersect(this.lassoBounds, bounds)) return false;
      return this.enclosureTest(element) || this.intersectionTest(element);
    });
    // 更新 board 选中状态
  }
}
```

**实现复杂度**：~600 行代码，3-4 天
**难点**：多边形包围判定算法（Non-Zero Winding Rule）、与 @plait 选择系统集成

---

## 四、中优先级功能实现方案

### 4.1 Frame 容器系统

**核心机制：**
- 通过 `element.frameId` 建立扁平的父子关系（非嵌套树）
- `getFrameChildren()` 按需遍历全量元素获取子元素
- 三层碰撞检测：线段相交 / AABB 包含 / 元素包含 Frame
- 拖拽时实时判定绑定/解绑（`updateFrameMembershipOfSelectedElements`）
- Frame 裁剪：通过 `clip-path` 限制子元素的可见区域
- Group 感知：不允许 Frame 和普通元素混在同一个 Group 中

**Aitu 融合难度**：**高**。需要 @plait 框架层面支持 `frameId` 概念和裁剪渲染。可能需要：
1. 扩展 `PlaitElement` 类型添加 `frameId` 字段
2. 在 @plait 渲染管线中注入 SVG `<clipPath>` 裁剪
3. 拖拽事件中添加 Frame 成员关系更新逻辑

### 4.2 肘形箭头（Elbow Arrows）

**核心算法：A* 寻路**
- 非均匀网格：节点位于所有元素 AABB 边界线的交叉点
- `BinaryHeap<Node>` 优先队列，`f = g + h`
- 方向变化惩罚：`g += bendMultiplier³`（鼓励少弯折）
- 障碍物避让：中点落在任何 AABB 内则跳过
- `FixedSegment`：用户可手动调整某些线段位置

**Aitu 融合难度**：**高**。需要：
1. 实现 A* 寻路算法（~400 行）
2. 构建非均匀网格系统
3. 与 @plait 的箭头元素系统集成
4. 添加元素绑定端点的吸附逻辑

### 4.3 流程图快速创建

**核心机制：**
- 方向键映射：`ArrowUp→up, ArrowDown→down, ArrowRight→right, ArrowLeft→left`
- 智能定位：优先直线放置，冲突时锯齿形分布
- 前驱/后继遍历：通过肘形箭头的绑定关系查找
- `FlowChartNavigator`：键盘在节点图中导航（同层循环 + 跨方向跳转）
- Frame 感知：新节点是否在 Frame 内

**依赖**：肘形箭头功能。先实现肘形箭头，再实现此功能。

### 4.4 激光笔（Laser Pointer）

**核心架构：**
```
LaserTrails（管理器）
  ├── localTrail: AnimatedTrail
  └── collabTrails: Map<SocketId, AnimatedTrail>

AnimatedTrail（单条轨迹）
  ├── 时间衰减：1s 内渐隐（performance.now() 时间戳）
  ├── 长度衰减：尾部 50 点渐细（easeOut 缓动）
  ├── SVG <path> 单元素渲染（所有轨迹合并）
  └── AnimationFrameHandler 统一调度
```

**Aitu 融合建议**：激光笔是纯前端功能，不依赖协作。可在 Plait SVG 层上叠加一个透明 SVG overlay，通过 `requestAnimationFrame` 驱动衰减动画。实现复杂度约 200 行。

### 4.5 标签页同步（Tab Sync）

**核心机制：**
- 50ms `setInterval` 轮询 localStorage 中的时间戳版本
- `isBrowserStorageStateNewer(type)`：比较 localStorage vs 内存版本
- 仅当标签页可见（`!document.hidden`）且非协作模式时同步
- 场景更新使用 `CaptureUpdateAction.NEVER` 避免干扰撤销历史
- `visibilitychange` / `blur` 时 flush 保存

**Aitu 融合建议**：

```typescript
// 极简实现
const TAB_SYNC_KEY = 'aitu-tab-sync-version';
let localVersion = -1;

// 保存时更新版本
export const markDataSaved = () => {
  const v = Date.now();
  localStorage.setItem(TAB_SYNC_KEY, String(v));
  localVersion = v;
};

// 轮询检测（50ms）
setInterval(() => {
  if (document.hidden) return;
  const remote = parseInt(localStorage.getItem(TAB_SYNC_KEY) || '-1');
  if (remote > localVersion) {
    localVersion = remote;
    reloadBoardFromStorage(); // 从 IndexedDB 重新加载
  }
}, 50);
```

**实现复杂度**：~50 行代码，半天

---

## 五、低优先级功能实现方案（核心要点）

### 5.1 实时多人协作

**Excalidraw 方案：**
- **传输层**：Socket.IO（WebSocket + polling 降级）
- **持久化**：Firebase Firestore + Storage
- **同步策略**：增量版本追踪 + 20s 全量兜底 + 5s 超时 Firebase 降级
- **冲突解决**：`versionNonce` 确定性解冲突（取较小 nonce 者胜出，无需中央仲裁）
- **元素排序**：Fractional Index（CRDT 思想，避免并发插入冲突）
- **加密**：AES-128-GCM，密钥存于 URL hash（端到端加密，服务器不可见）
- **光标同步**：33ms volatile 消息

**Aitu 现状**：GitHub Gist 异步同步，非实时。引入实时协作需要：
1. WebSocket 服务端
2. 状态同步协议（推荐 Yjs/CRDT 而非自研 reconcile）
3. 光标/选区广播
4. 冲突解决策略

**实现复杂度**：非常高（需要后端服务），建议作为独立里程碑规划。

### 5.2 图表粘贴

**Excalidraw 方案：**
- TSV 优先 → CSV 降级 → 转置回退
- 正则支持 5 种货币符号的智能数字解析
- 自动推断列角色（标签列 vs 数值列）
- 生成原生元素：矩形（柱形图）/ 线段+圆点（折线图）/ 文本标签 / 坐标轴

**Aitu 融合**：可监听粘贴事件，检测 TSV 格式数据，将其转为 @plait 元素。约 300 行代码。

### 5.3 字体子集化

**Excalidraw 方案：**
- HarfBuzz (子集化) + Woff2 (压缩) 两个 WASM 模块
- `WorkerPool` 模式：按需创建 Worker，1s TTL 自动回收
- 先复制 ArrayBuffer 再 transfer（保证降级安全）
- 全局 `shouldUseWorkers` 标志，一次失败永久降级

**用途**：导出 SVG/PDF 时嵌入字体子集，减小文件体积。Aitu 如果需要高质量导出可以引入。

### 5.4 跟随模式

**依赖**：实时协作。在协作基础上：
- 被跟随者通过独立 follow 房间广播视口边界（`getVisibleSceneBounds`）
- 跟随者通过 `zoomToFitBounds` 同步视口
- 交叉跟随检测（A 跟随 B 且 B 跟随 A 时忽略更新，打破死循环）

---

## 六、分阶段实施路线图

### Phase 1：快速提升（1-2 周）
| 功能 | 预估工时 | 备注 |
|------|---------|------|
| 命令面板 | 2 天 | 纯 UI，依赖 fuzzy 库 |
| 画布搜索 | 2 天 | 遍历 @plait 元素 |
| 标签页同步 | 0.5 天 | localStorage 事件 |
| 激光笔 | 1 天 | SVG overlay + rAF |

### Phase 2：核心增强（2-4 周）
| 功能 | 预估工时 | 备注 |
|------|---------|------|
| 智能吸附 | 5 天 | 需深入 @plait 拖拽流程 |
| 套索选择 | 4 天 | 多边形算法 + SVG 动画 |
| Frame 容器 | 5 天 | 需 @plait 框架层支持 |

### Phase 3：进阶功能（1-2 月）
| 功能 | 预估工时 | 备注 |
|------|---------|------|
| 肘形箭头 | 10 天 | A* 寻路算法 + 绑定系统 |
| 流程图快速创建 | 3 天 | 依赖肘形箭头 |
| 图表粘贴 | 2 天 | TSV 解析 + 元素创建 |
| 字体子集化 | 5 天 | WASM 集成 |

### Phase 4：协作能力（需独立规划）
| 功能 | 预估工时 | 备注 |
|------|---------|------|
| 实时协作基础 | 20+ 天 | 需后端服务 + Yjs/CRDT |
| 跟随模式 | 2 天 | 依赖实时协作 |

---

## 七、架构借鉴建议

### 7.1 引入 Action 注册表模式

将当前分散在 `with-hotkey.ts` 中的快捷键和工具栏中的操作统一为 Action 对象，便于命令面板搜索和快捷键管理。

### 7.2 建立数学工具库

参考 `@excalidraw/math`，将散落在各处的几何计算（点距、线段相交、多边形判定等）集中到独立模块，为吸附、套索、碰撞检测等功能提供基础。

### 7.3 SVG Overlay 层

创建一个专用的 SVG overlay 层（`pointer-events: none`），用于渲染：
- 吸附参考线
- 套索路径
- 激光笔轨迹
- 搜索高亮

这样可以不侵入 @plait 的核心渲染管线。

### 7.4 静态缓存模式

参考 `SnapCache` 和元素线段缓存（`elementsSegments`），对计算密集的数据（可见元素列表、元素边界、参考吸附点）建立缓存机制，在高频交互（拖拽、鼠标移动）中避免重复计算。
