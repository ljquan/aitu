# Opentu (开图) PPT 能力规划与实现方案

> 基于 AiPPT (docmee.cn) 项目 Review 结合 aitu 现有架构梳理

## 现有基础

aitu 已具备以下 PPT 相关基础设施：

| 能力 | 现状 | 说明 |
|------|------|------|
| Frame 容器 | ✅ 已实现 | 预设 PPT 16:9 (1920×1080) / 4:3 (1024×768) |
| 幻灯片播放 | ✅ 已实现 | `FrameSlideshow` 全屏播放，键盘导航，画笔/激光笔/橡皮擦 |
| Frame 管理面板 | ✅ 已实现 | `FramePanel` 列表、搜索、拖拽排序、重命名、删除 |
| 基础元素 | ✅ 已实现 | 文本/图形/图片/连线/思维导图/流程图 |
| 填充系统 | ✅ 已实现 | 纯色/渐变(线性+径向)/图片填充 |
| 文本特效 | ✅ 已实现 | 字体/阴影/发光/渐变文字 |
| AI 内容生成 | ✅ 已实现 | Gemini 图片、Mermaid 图表、思维导图、SVG 生成 |
| MCP 工具体系 | ✅ 已实现 | 可扩展的 AI 工具接口 |

---

## 能力规划（按优先级排序）

### P0 — AI 一键生成 PPT

**价值**：最高，是产品差异化核心能力，AiPPT 的核心卖点  
**复杂度**：中高  
**AiPPT 参考**：`index.html` 三步流程 (主题 → 大纲 → PPT)

#### 实现方案

**流程**：用户输入主题 → AI 生成 Markdown 大纲 → 用户编辑大纲 → AI 按大纲逐页生成 Frame 内容

**具体步骤**：

1. **新增 MCP 工具 `generate_ppt`**
   - 输入：主题 / 大纲 Markdown
   - AI 返回结构化 JSON：每页的标题、正文、布局类型、图片提示词
   - 参考 AiPPT 的大纲格式（Markdown 层级标题）

2. **PPT 布局引擎** (`services/ppt-layout-engine.ts`)
   - 预定义 5-8 种版式：封面页、目录页、标题+正文、图文左右、图文上下、纯图、对比页、结尾页
   - 每种版式对应一组元素的坐标/尺寸/样式规则
   - 自动创建 Frame (1920×1080) 并在其中放置元素

3. **大纲编辑器 UI**
   - 复用 Chat Drawer 侧边栏，展示 Markdown 大纲
   - 支持增删改拖拽章节
   - 确认后触发逐页生成

4. **流式生成体验**
   - 借鉴 AiPPT 的 SSE 流式传输，逐页生成、逐页渲染
   - 利用现有 WorkZone 展示生成进度

**数据结构参考**：
```typescript
interface PPTOutline {
  title: string;
  pages: PPTPageSpec[];
}
interface PPTPageSpec {
  layout: 'cover' | 'toc' | 'title-body' | 'image-text' | 'comparison' | 'ending';
  title: string;
  subtitle?: string;
  bullets?: string[];
  imagePrompt?: string;  // AI 图片生成提示词
  notes?: string;         // 演讲者备注
}
```

#### ai-to-pptx 借鉴补充

> 以下内容借鉴自 [ai-to-pptx](https://github.com/SmartSchoolAI/ai-to-pptx) 项目分析

**1. 多种输入源支持**

ai-to-pptx 的 `StepOneInputData.tsx` 支持 5 种输入模式，aitu 可借鉴：

| 输入模式 | 说明 | aitu 实现建议 |
|---------|------|--------------|
| 文本主题 | 直接输入主题关键词 | 已在规划中 |
| 多行文本导入 | 粘贴长文本，AI 提炼大纲 | 新增：Chat Drawer 支持文本粘贴输入 |
| 文件上传 | 上传 Word/PDF/TXT，提取内容 | 新增：复用现有文件上传能力 |
| 网页 URL 抓取 | 输入网页地址，AI 爬取内容 | 新增：后端增加 URL 内容抓取接口 |
| 导入大纲 | 直接导入 Markdown 大纲 | 新增：跳过 AI 生成大纲步骤 |

**2. 生成选项控制**

ai-to-pptx 提供高级生成选项，可提升用户体验：

- **篇幅控制**：较短 (10-15 页) / 常规 (20-30 页) / 更长 (25-35 页)
- **语言选择**：中文 / 英文 / 法语 / 阿拉伯语
- **额外要求**：自由文本输入，用于补充 AI 生成约束（如"偏商务风格"、"多用数据图表"）

建议在 `generate_ppt` MCP 工具中增加 `options` 参数：
```typescript
interface PPTGenerateOptions {
  pageCount?: 'short' | 'normal' | 'long';  // 篇幅控制
  language?: string;                          // 生成语言
  extraRequirements?: string;                 // 额外要求
}
```

**3. 异步生成 + 进度追踪**

ai-to-pptx 的 `StepFiveGeneratePpt.tsx` 采用异步生成模式：
- 后端异步生成 PPTX，前端轮询 `asyncPptInfo` 接口获取增量数据
- 返回 `{ current, total, pages[] }` 实时显示生成进度
- 适合大量页面（20-35 页）场景，避免请求超时

aitu 建议：
- 利用现有 Service Worker 后台任务机制，实现 PPT 逐页生成
- 每生成一页即渲染到画布，用户可实时看到进度
- 参考 `task-queue-service.ts` 的任务队列模式

**4. gzip 压缩传输**

ai-to-pptx 使用 `pako` (gzip) + base64 编码传输大体量 PPT JSON 数据，显著减少网络传输：
- 一个 30 页 PPT 的 JSON 数据可达数 MB
- gzip 压缩率约 70-80%，base64 编码后仍比原始 JSON 小 50%+
- aitu 可在 AI 生成结果较大时启用压缩传输

---

### P1 — PPT 导出 (.pptx)

**价值**：高，用户核心需求，完成 PPT 创作闭环  
**复杂度**：中  
**AiPPT 参考**：`json2ppt` API 将 JSON 转回 .pptx

#### 实现方案

**技术选型**：使用 `pptxgenjs` (纯前端 JS 库，无需后端)

**实现路径**：

1. **Frame 到 PPTX 转换器** (`services/pptx-export-service.ts`)
   - 遍历画布中所有 Frame，按顺序作为幻灯片页
   - 将 Frame 内的 Plait 元素转换为 pptxgenjs 元素：
     - `geometry` (文本框/形状) → `addText()` / `addShape()`
     - `image` → `addImage()` (base64 / URL)
     - `line` / `arrow` → `addShape()` with connector
     - `mindmap` → 展开为文本+连线
     - `freehand` → SVG path → `addShape()`
   - 保留填充、字体、颜色等样式

2. **元素映射表**：

| Plait 元素 | pptxgenjs API | 说明 |
|-----------|---------------|------|
| geometry (rect/ellipse/...) | `addShape(type, opts)` | 形状类型映射 |
| geometry + text | `addText(text, opts)` | 带文本的形状 |
| image | `addImage({ data/path })` | 图片导出 |
| arrow/line | `addShape('line', opts)` | 连接线 |
| freehand | `addShape('custGeom', path)` | 自由画笔转路径 |
| 背景 | `slide.background` | Frame 背景 |

3. **UI 入口**
   - FramePanel 操作栏增加"导出 PPT"按钮
   - 支持选择导出范围（全部 Frame / 选中 Frame）

---

### P2 — PPT 模板/主题系统

**价值**：高，降低用户使用门槛  
**复杂度**：中  
**AiPPT 参考**：`slideMaster` → `slideLayout` → `page` 三级继承

#### 实现方案

1. **PPT 模板数据结构** (`types/ppt-template.types.ts`)
   ```typescript
   interface PPTTemplate {
     id: string;
     name: string;
     thumbnail: string;
     theme: PPTTheme;
     layouts: PPTLayout[];     // 版式集合
   }
   interface PPTTheme {
     primaryColor: string;
     secondaryColor: string;
     backgroundColor: string;
     fontFamily: string;
     headingFontFamily: string;
   }
   interface PPTLayout {
     type: 'cover' | 'toc' | 'content' | 'image-text' | 'ending';
     elements: PlaitElement[];  // 版式中的占位元素模板
   }
   ```

2. **内置模板库**
   - 5-10 套预设模板（商务/科技/教育/简约/创意等）
   - 每套包含 5-8 种版式
   - 存储为 JSON，打包在应用中

3. **主题色提取**（借鉴 AiPPT `calcSubjectColor()`）
   - 分析上传图片的像素分布，提取主色调
   - 自动生成配色方案应用到模板

4. **模板选择 UI**
   - AI 生成 PPT 流程第二步：选择模板
   - 模板缩略图网格展示

#### ai-to-pptx 借鉴补充

**1. 模板制作规范**

ai-to-pptx 的 `README_Make_Template.md` 定义了严格的模板规范，aitu 可参考建立自己的模板标准：

| 页面类型 | 元素数量 | 布局要求 |
|---------|---------|---------|
| 首页 (cover) | 2 个文本 | 标题 + 副标题/作者 |
| 目录页 (toc) | 13 个文本 | 目录标题 + 6 组(序号+内容) |
| 章节标题页 (section) | 2 个文本 | 章节序号 + 章节标题 |
| 内容页 (content) | 按布局变化 | 标题 + N×M 网格结构 |

**2. 内容页 6 种网格布局**

ai-to-pptx 定义了 6 种内容页网格布局，每种建议 2-8 种不同风格变体：

| 布局 | 结构 | 适用场景 | 建议变体数 |
|------|------|---------|-----------|
| 2×2 | 标题 + 4 格 | 四象限对比 | 2-3 种 |
| 2×3 | 标题 + 6 格 | 三列两行内容 | 2-3 种 |
| 3×2 | 标题 + 6 格（3行2列） | 并排对比 | **5-8 种（推荐）** |
| 3×3 | 标题 + 9 格 | 九宫格展示 | **5-8 种（推荐）** |
| 4×2 | 标题 + 8 格 | 详细列表 | 2-3 种 |
| 4×3 | 标题 + 12 格 | 密集信息 | 2-3 种 |

aitu 实现建议：
- 在 `PPTLayout.type` 中扩展支持网格布局类型
- 每种版式定义元素的坐标/尺寸比例规则，而非绝对像素值
- 使用 Frame 预设尺寸 (1920×1080) 下的百分比定位

**3. 更换模板（保留内容）**

ai-to-pptx 的 `StepFiveGeneratePpt.tsx` 支持生成后更换模板：
- 调用 `changePptxTemplate` 传入新模板 ID，保留已生成的文字内容
- 后端自动将内容重新映射到新模板的布局中
- 用户无需重新生成即可切换风格

aitu 建议：
- 将 PPT 内容层（文字、数据）与样式层（模板、主题）分离
- 更换模板时只需重新应用版式规则和主题色
- 利用现有 Frame 容器机制，遍历 Frame 内元素重新布局

---

### P3 — 图表元素

**价值**：中高，PPT 中数据可视化是刚需  
**复杂度**：中  
**AiPPT 参考**：`chart.js` 柱状图/饼图/折线图/环形图 Canvas 原生绘制

#### 实现方案

**技术选型**：Mermaid 已有基础图表能力，但 PPT 场景需更专业的图表。两种路线：

**路线 A — 移植 AiPPT chart.js（推荐）**
- 优势：轻量、无依赖、与 PPT 导出兼容性好
- 实现：
  1. 新增 Plait 元素类型 `chart`
  2. 将 AiPPT 的 `chart.js` 改造为 TypeScript 模块
  3. 创建 `withChart` 插件，在 Canvas 上渲染图表
  4. 图表数据编辑面板（类似 Excel 的表格输入）
  5. MCP 工具 `insert_chart`：AI 可通过对话插入图表

**路线 B — 集成 ECharts/Chart.js 库**
- 优势：功能更强大、图表类型更多
- 劣势：包体积大、PPT 导出需要额外处理

**支持的图表类型（初期）**：
- 柱状图 (bar)
- 折线图 (line)
- 饼图 (pie)
- 环形图 (doughnut)

#### ai-to-pptx 借鉴补充

**1. 表格元素**

ai-to-pptx 的 `element.js` 中 `createTable()` 提供了完整的表格工厂，aitu 当前规划中缺少表格支持：

```typescript
// 参考 ai-to-pptx createTable 签名
function createTable(
  rowColumnDataList: string[][],   // 二维表格数据
  rowFillStyles?: FillStyle[],     // 交替行填充色（循环应用）
  borderColor?: number,            // 边框颜色
  fontColor?: FontColor            // 字体颜色
): TableElement
```

表格样式能力：
- 交替行背景色（斑马纹效果）
- 自定义边框颜色和线宽
- 单元格文本对齐（水平/垂直）
- 单元格内边距 (textInsets)
- 字体大小和颜色配置
- 四边独立边框配置（上/右/下/左）

aitu 实现建议：
- 新增 Plait 元素类型 `table`，或用 `geometry` 组合实现
- 支持 AI 通过 MCP 工具 `insert_table` 自动插入数据表格
- 导出时映射为 `pptxgenjs` 的 `addTable()` API
- 优先级可归入 P3，与图表一并实现

**2. 图表数据格式参考**

ai-to-pptx `createChart()` 的数据格式值得借鉴：

```typescript
// 柱状图/折线图数据格式
const barLineData = [
  [' ', '系列1', '系列2', '系列3'],  // 表头
  ['类别1', '4.3', '2.4', '2'],
  ['类别2', '2.5', '4.4', '2'],
  ['类别3', '3.5', '1.8', '3'],
];

// 饼图/环形图数据格式
const pieData = [
  [' ', '销售额'],
  ['第一季度', '8.2'],
  ['第二季度', '3.2'],
  ['第三季度', '1.4'],
];
```

这种类 Excel 二维数组格式对 AI 生成非常友好，建议作为 `insert_chart` MCP 工具的输入格式。

---

### P4 — 幻灯片切换动画

**价值**：中，提升演示体验  
**复杂度**：中低  
**AiPPT 参考**：`animation.js` 进入/退出/强调动画

#### 实现方案

1. **Frame 扩展 transition 属性**
   ```typescript
   interface PlaitFrame extends PlaitElement {
     type: 'frame';
     name: string;
     points: [Point, Point];
     transition?: FrameTransition;  // 新增
   }
   interface FrameTransition {
     type: 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'zoom' | 'dissolve';
     duration: number; // ms
   }
   ```

2. **FrameSlideshow 增加过渡效果**
   - 切换 Frame 时，根据 `transition.type` 应用 CSS 动画
   - 方案：在遮罩层和 viewport 切换之间插入过渡动画帧
   - 利用 CSS `transition` / `@keyframes` 实现

3. **UI**
   - FramePanel 中每个 Frame 可设置切换效果
   - 下拉选择动画类型 + 时长滑块

#### ai-to-pptx 借鉴补充

**1. 更丰富的页面切场动画**

ai-to-pptx `animation.js` 定义了 16 种页面切场动画（`transitionList`），比当前规划的 6 种更丰富：

| # | 动画名称 | key | 参数 |
|---|---------|-----|------|
| 1 | 分割 | split | dir: in |
| 2 | 切出 | cut | - |
| 3 | 形状 | wedge | - |
| 4 | 抽出 | pull | dir: l/r/u/d |
| 5 | 推出 | push | dir: u/d/l/r |
| 6 | 插入 | cover | dir: d/u/l/r |
| 7 | 擦除 | wipe | dir: l/r/u/d |
| 8 | 新闻快报 | newsflash | - |
| 9 | 梳理 | comb | dir: horz/vert |
| 10 | 棋盘 | checker | dir: horz/vert |
| 11 | 淡出 | fade | - |
| 12 | 溶解 | dissolve | - |
| 13 | 百叶窗 | blinds | dir: horz/vert |
| 14 | 线条 | randomBar | dir: vert/horz |
| 15 | 轮幅 | wheel | spokes: 8 |
| 16 | 随机 | random | - |

每种动画支持速度参数：`slow` / `med` / `fast`

建议 aitu 扩展 `FrameTransition.type` 枚举，至少支持前 12 种常用切场效果。

**2. 元素级动画（重要扩展）**

ai-to-pptx 除了页面切场，还定义了完整的**元素级动画**体系（`animationList`，共 226 个动画预设），分为三大类：

**退场动画 (exit)** — 20 种效果：
消失、飞出(8方向)、百叶窗、盒状、棋盘、圆形扩展、缓慢移除、菱形、向外溶解、渐变、闪烁一次、切出(4方向)、十字形扩展、随机线条、阶梯状、轮子、擦除、缩放、收缩并旋转、螺旋飞出、劈裂

**入场动画 (entrance)** — 与退场动画对称的 20+ 种效果：
出现、飞入(8方向)、百叶窗、盒状、棋盘、圆形扩展、缓慢进入、菱形、溶解、渐变、闪烁一次、切入(4方向)、十字形扩展、随机线条、阶梯状、轮子、擦除、缩放、旋转飞入、螺旋飞入、劈裂、弹跳

**强调动画 (emphasis)** — 24 种效果：
更改填充颜色、更改字体、更改字体颜色、更改字号、更改字形(7个子类型)、放大缩小、更改线条颜色、陀螺旋、透明、加粗闪烁、爆炸、加粗展示、着色、添加下划线、混色、彩色波纹、补色、补色2、对比色、加深、不饱和、忽明忽暗、闪动、颜色延伸、变淡、样式强调、跷跷板、垂直突出显示、波浪线、闪烁、闪现

**动画路径 (path)** — 8 种运动轨迹：
向右、向左、向上、向下、自定义路径等

aitu 实现建议：
1. **Phase 1**（与 P4 同期）：先实现 6 种基础切场 + 入场/退场各 5 种基础效果
2. **Phase 2**：扩展完整切场列表 + 强调动画
3. **数据结构扩展**：
```typescript
interface ElementAnimation {
  presetClass: 'entr' | 'exit' | 'emph' | 'path';  // 动画类别
  presetId: number;        // 动画类型 ID
  presetSubtype: number;   // 方向/变体
  duration?: number;       // 时长 (ms)
  startType: number;       // 触发方式 (1=单击, 2=与前一动画同时, 3=前一动画之后)
  text?: boolean;          // 是否应用于文本
  attr?: Record<string, any>; // 额外参数（颜色、字体等）
}

interface PlaitFrame extends PlaitElement {
  type: 'frame';
  name: string;
  points: [Point, Point];
  transition?: FrameTransition;
  elementAnimations?: Record<string, ElementAnimation[]>; // elementId → 动画序列
}
```

---

### P5 — 演讲者备注

**价值**：中，专业演示场景需要  
**复杂度**：低  

#### 实现方案

1. **Frame 扩展 notes 属性**
   ```typescript
   interface PlaitFrame extends PlaitElement {
     notes?: string;  // Markdown 格式备注
   }
   ```

2. **备注编辑入口**
   - FramePanel 中 Frame 项展开后显示备注编辑区
   - 或双击 Frame 标题栏下方区域编辑

3. **演讲者视图**
   - 幻灯片播放时，支持"演讲者视图"模式（需要双屏或分窗口）
   - 主窗口显示幻灯片，副窗口显示备注 + 下一页预览 + 计时器

---

### P6 — PPT 导入 (.pptx)

**价值**：中，用户可编辑已有 PPT  
**复杂度**：高  
**AiPPT 参考**：`pptxObj` JSON 数据结构（完整的 PPT 元素 Schema）

#### 实现方案

**技术选型**：无成熟的纯前端 .pptx 解析库，需组合使用

1. **解析 .pptx 文件**（本质是 ZIP + XML）
   - 使用 `JSZip`（已有依赖）解压 .pptx
   - 解析 XML：`presentation.xml` → 幻灯片列表, `slide{n}.xml` → 页面内容
   - 参考 AiPPT 的 `pptxObj` JSON 结构作为中间格式

2. **PPTX → Plait 元素映射**

| PPTX 元素 | XML 标签 | Plait 元素 |
|-----------|----------|-----------|
| 文本框 | `<p:txBody>` | geometry + text |
| 形状 | `<p:sp>` + `<a:prstGeom>` | geometry (对应 shape type) |
| 图片 | `<p:pic>` | image |
| 表格 | `<a:tbl>` | 多个 geometry 组合 |
| 图表 | `<c:chartSpace>` | chart 元素 (P3 完成后) |
| 连线 | `<p:cxnSp>` | arrow/line |
| 组合 | `<p:grpSp>` | group |

3. **PPT 形状库扩充**
   - 借鉴 AiPPT `geometry.js` 中 100+ 种标准 PPT 形状的 SVG path 生成代码
   - 建立 PPT `prstGeom` 名称到 Plait 几何形状的映射

4. **实现优先级**
   - Phase 1：文本框 + 形状 + 图片（覆盖 80% 场景）
   - Phase 2：表格 + 连线 + 组合
   - Phase 3：图表 + 动画

---

### P7 — PDF 导出

**价值**：中低，补充导出格式  
**复杂度**：低  

#### 实现方案

1. 利用浏览器 `window.print()` + CSS `@media print` 方案
2. 遍历 Frame，逐页 viewport 对准 → `html2canvas` 截图 → 拼合 PDF
3. 使用 `jspdf` 库生成 PDF 文件
4. 或直接在幻灯片播放模式下调用浏览器打印功能

---

### P8 — 形状库扩充

**价值**：低，丰富编辑能力  
**复杂度**：低  
**AiPPT 参考**：`geometry.js` 100+ 种 PPT 标准形状

#### 实现方案

1. 从 AiPPT `geometry.js` 提取形状 SVG path 定义
2. 转换为 Plait 的 `BasicShapes` / `FlowchartSymbols` 格式
3. 扩充 `shape-picker.tsx` 中的形状选择面板
4. 重点补充 PPT 常用形状：
   - 箭头变体（左/右/上/下/双向/弯曲）
   - 标注框（圆角/云朵/爆炸）
   - 星形/旗帜/括号/数学符号
   - 流程图补充形状

---

## 实施路线图

```
Phase 1 (P0 + P1)  → AI 生成 PPT + PPTX 导出  = 完整的 PPT 创作闭环
Phase 2 (P2 + P3)  → 模板系统 + 图表元素      = 提升生成质量
Phase 3 (P4 + P5)  → 切换动画 + 演讲者备注    = 专业演示体验
Phase 4 (P6 + P7 + P8) → 导入 + PDF + 形状库  = 完善生态
```

## 技术依赖

| 新增依赖 | 用途 | 包大小 |
|---------|------|--------|
| `pptxgenjs` | PPTX 导出 | ~300KB |
| `jspdf` | PDF 导出 (P7) | ~300KB |
| `html2canvas` | Frame 截图 (P7) | ~40KB |

> 注：P0 AI 生成、P2 模板、P3 图表、P4 动画、P5 备注、P8 形状库均不需要额外第三方依赖。
