# Opentu (开图) PPT 能力规划与实现方案

> 基于 AiPPT (docmee.cn) + [ai-to-pptx](https://github.com/SmartSchoolAI/ai-to-pptx) + [banana-slides](https://github.com/snakeying/banana-slides)（蕉幻）+ [LandPPT](https://github.com/sligter/LandPPT) + [NanoBanana-PPT-Skills](https://github.com/op7418/NanoBanana-PPT-Skills) 项目 Review 结合 aitu 现有架构梳理

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

#### banana-slides 借鉴补充

> 以下内容借鉴自 [banana-slides](https://github.com/snakeying/banana-slides)（蕉幻）项目分析

**1. 三种创建模式**

banana-slides 的 `Project` 模型 (`backend/models/project.py`) 定义了 `creation_type` 字段，支持三种输入模式：

| 创建模式 | `creation_type` 值 | 说明 | aitu 实现建议 |
|---------|-------------------|------|--------------|
| 灵感模式 | `'idea'` | 一句话输入，AI 自动生成完整大纲 | 已在 P0 流程中覆盖 |
| 大纲模式 | `'outline'` | 粘贴大纲文本，AI 解析为结构化格式（保留原文不修改） | 新增：支持直接导入大纲文本，调用 `parse_outline_text` 解析 |
| 描述模式 | `'descriptions'` | 提供完整页面描述，AI 解析出大纲并切分每页描述 | 新增：高级输入模式，用户可精确控制每页内容 |

每种模式对应不同的 prompt 路径：
- `idea` → `get_outline_generation_prompt()` → `get_page_description_prompt()`
- `outline` → `get_outline_parsing_prompt()`（保留原文） → `get_page_description_prompt()`
- `descriptions` → `get_description_to_outline_prompt()` + `get_description_split_prompt()`

aitu 建议在 `generate_ppt` MCP 工具中增加 `mode` 参数：
```typescript
interface PPTGenerateOptions {
  mode?: 'idea' | 'outline' | 'description';  // 创建模式
  // ...existing options
}
```

**2. AI 精炼交互（自然语言迭代修改）**

banana-slides 在大纲和描述编辑阶段提供 `AiRefineInput` 组件 (`frontend/src/components/shared/AiRefineInput.tsx`)，用户可用自然语言修改已生成的内容：

- 组件内置历史记录管理，每次提交自动记录修改请求
- 支持 Ctrl+Enter / Cmd+Enter 快捷键提交
- 后端精炼 prompt 保留完整修改历史作为上下文，支持多轮迭代：
  - `get_outline_refinement_prompt(current_outline, user_requirement, project_context, previous_requirements, language)`
  - `get_descriptions_refinement_prompt(current_descriptions, user_requirement, project_context, outline, previous_requirements, language)`
- 用例示例：「增加一页关于市场分析的内容」「将整体风格改为更商务化」「删除第三页，合并第四和第五页」

aitu 实现建议：
- 在大纲编辑器 UI 底部集成类似的 AI 辅助输入框
- 后端新增 `refine_outline` / `refine_content` MCP 工具
- 保留修改历史上下文，提升多轮迭代质量
- 详见 **P12 — AI 精炼交互**

**3. 参考文件智能解析**

banana-slides 的 `FileParserService` (`backend/services/file_parser_service.py`) 实现了强大的文件解析能力：

| 文件类型 | 解析方式 | 说明 |
|---------|---------|------|
| TXT / MD | 直接读取 | 支持 UTF-8 / GBK 编码自动检测 |
| XLSX / XLS / CSV | `MarkItDown` 库 | 表格转 Markdown 格式 |
| PDF / DOCX / PPTX 等 | **MinerU** 在线 API | 复杂文档版面分析，保留结构 |

MinerU 解析流程（4 步）：
1. 获取上传 URL → 2. 上传文件 → 3. 轮询解析结果（最长 600s） → 4. **AI 增强图片描述**

关键创新：解析后自动为文档中无 alt text 的图片并行生成 AI caption（支持 Gemini / OpenAI），提升 AI 理解上下文的能力。解析结果以 Markdown 格式作为 AI 生成 PPT 的参考上下文，文档中的图片可被直接引用到 PPT 中（`![图片描述](/files/mineru/xxx/image.png)`）。

aitu 实现建议：
- 复用现有文件上传能力 + 后端集成 MinerU 或类似的文档解析服务
- 参考文件内容作为 `ProjectContext.reference_files_content` 传入 AI prompt
- 图片 caption 生成可复用现有 Gemini API

**4. 分级 Prompt 设计体系**

banana-slides 的 `prompts.py`（930 行，36KB）展示了精心设计的 17 个 prompt 函数，覆盖 PPT 生成全链路：

| 阶段 | Prompt 函数 | 用途 |
|------|-----------|------|
| 大纲生成 | `get_outline_generation_prompt()` | idea → 结构化大纲（支持简单/章节两种格式） |
| 大纲解析 | `get_outline_parsing_prompt()` | 用户文本 → 结构化大纲（保留原文不修改） |
| 页面描述 | `get_page_description_prompt()` | 逐页生成详细视觉描述（含文字简洁要求、图片引用规则） |
| 图片生成 | `get_image_generation_prompt()` | 描述 → AI 图片 prompt（含设计指南、模板参考、素材提示） |
| 图片编辑 | `get_image_edit_prompt()` | 编辑指令 → 修改 prompt |
| 大纲精炼 | `get_outline_refinement_prompt()` | 自然语言修改大纲（保留修改历史上下文） |
| 描述精炼 | `get_descriptions_refinement_prompt()` | 自然语言修改描述 |
| 描述转大纲 | `get_description_to_outline_prompt()` | 完整描述文本 → 结构化大纲 |
| 描述切分 | `get_description_split_prompt()` | 完整描述 → 每页描述 |
| 背景生成 | `get_clean_background_prompt()` | 纯背景图（用于可编辑 PPTX 导出） |
| 文字属性提取 | `get_text_attribute_extraction_prompt()` | 单个文字元素的字体/颜色/大小提取 |
| 批量文字提取 | `get_batch_text_attribute_extraction_prompt()` | 全图文字元素批量属性提取 |
| 画质增强 | `get_quality_enhancement_prompt()` | Inpainting 后画质修复 |

语言配置支持 4 种：`zh`(中文) / `en`(English) / `ja`(日本語) / `auto`(自动检测)

aitu 建议：
- 建立类似的分级 prompt 管理模块，每个阶段独立 prompt 函数
- prompt 中内置语言控制和输出格式约束
- 为每种版式/布局类型定义专用的生成 prompt

**5. 项目级额外要求**

banana-slides 的 `Project` 模型包含 `extra_requirements` 字段，其内容会追加到每页 AI 生成的 prompt 中，影响全局生成风格。例如：
- 「所有页面使用蓝色系配色」
- 「图片风格偏向扁平插画」
- 「文字内容偏向技术受众」

aitu 建议在 PPTGenerateOptions 中增加 `extraRequirements` 字段。

**6. 多 AI Provider 工厂模式**

banana-slides 的 `AIService` (`backend/services/ai_service.py`) 实现了灵活的多 Provider 架构：

| Provider 格式 | TextProvider | ImageProvider |
|-------------|-------------|--------------|
| `gemini` (默认) | `GenAITextProvider` | `GenAIImageProvider` |
| `openai` | `OpenAITextProvider` | `OpenAIImageProvider` |
| `vertex` | `GenAITextProvider` (vertexai=True) | `GenAIImageProvider` (vertexai=True) |

核心设计：
- 文本和图像 provider **独立配置**，可混合使用（如文本用 Gemini、图片用 OpenAI）
- 推理模式（thinking budget）独立控制：`enable_text_reasoning` / `enable_image_reasoning`
- 运行时可通过设置页切换，无需重启应用
- 工厂函数：`get_text_provider(model)` / `get_image_provider(model)`

aitu 建议：
- 现有 Gemini API 可扩展为 Provider 工厂模式
- 文本理解和图片生成可选用不同模型，发挥各自优势
- 在系统设置中提供 Provider 切换入口

#### LandPPT 借鉴补充

> 以下内容借鉴自 [LandPPT](https://github.com/sligter/LandPPT) 项目分析（Python 3.11 + FastAPI + SQLAlchemy 全栈 AI PPT 平台）

**1. 深度研究驱动生成（DEEP 方法论）**

LandPPT 的 `DEEPResearchService` (`services/deep_research_service.py`) 实现了 **DEEP 研究方法论**（Define → Explore → Evaluate → Present），在 AI 生成 PPT 之前先对主题进行深度网络调研：

| 阶段 | 含义 | 实现 |
|------|------|------|
| **D**efine | 定义研究范围 | 解析主题，生成多轮搜索查询 |
| **E**xplore | 探索信息源 | Tavily API + SearXNG 双引擎搜索 |
| **E**valuate | 评估分析 | AI 分析搜索结果，提取关键发现 |
| **P**resent | 呈现报告 | 生成结构化研究报告作为 PPT 上下文 |

**研究报告数据结构**：
```python
@dataclass
class ResearchReport:
    topic: str
    language: str              # 'zh' / 'en'
    steps: List[ResearchStep]  # 多轮搜索步骤
    executive_summary: str     # 执行摘要
    key_findings: List[str]    # 关键发现
    recommendations: List[str] # 建议
    sources: List[str]         # 来源列表
    total_duration: float      # 总耗时
```

研究报告作为 `research_section` 参数传入大纲生成 prompt，显著提升内容的深度和准确性。

aitu 实现建议：
- 在 PPT 生成流程中增加可选的「深度研究」步骤
- 复用现有网络搜索能力（如有），或集成 Tavily API
- 研究报告作为 AI 生成 PPT 的上下文参考
- 详见 **P16 — 深度研究驱动 PPT**

**2. 角色级 AI Provider 配置**

LandPPT 的 `EnhancedPPTService` (`services/enhanced_ppt_service.py`, 7295 行) 实现了**角色级 AI 模型配置**——不同生成阶段可使用不同 AI 模型：

| 角色 (Role) | 用途 | 典型配置 |
|------------|------|---------|
| `outline` | 大纲生成 | 推理能力强的模型（如 GPT-4o / Claude） |
| `creative` | 创意内容 | 创造力强的模型 |
| `image_prompt` | 图片提示词 | 适合视觉描述的模型 |
| `slide` | 幻灯片内容 | 内容生成模型 |
| `editor` | 编辑器助手 | 轻量快速模型（如 GPT-4o-mini） |
| `template` | 模板生成 | 设计能力强的模型 |

核心方法：
- `_get_current_ai_config(role)` → 获取角色配置（`llm_model`, `llm_provider`, `temperature`, `max_tokens`）
- `_get_role_provider(role)` → 获取对应角色的 AI Provider 实例
- `_text_completion_for_role(role, prompt)` → 角色级文本补全

支持的 Provider 实现（`ai/providers.py`, 1094 行）：
- `OpenAIProvider(AIProvider)` — 兼容所有 OpenAI API 格式（DeepSeek/Kimi/MiniMax/302.AI）
- `AnthropicProvider(AIProvider)` — Claude 系列
- `GoogleProvider(AIProvider)` — Gemini 系列
- `OllamaProvider(AIProvider)` — 本地模型
- 所有 Provider 支持多模态消息（文本 + 图片 URL）和流式输出
- 内置 `<think>...</think>` 标签过滤（兼容推理模型输出）

aitu 建议：
- 扩展现有 Gemini API 为角色级配置
- 大纲用强推理模型、内容用创意模型、编辑用快速模型
- 降低整体成本的同时提升各阶段生成质量

**3. 7 种场景模板**

LandPPT 的 `AIService` (`services/ai_service.py`) 预定义了 7 种 PPT 场景模板，每种含 `style`、`tone`、`structure` 三个维度：

| 场景 ID | 名称 | 风格 | 语调 | 结构 |
|--------|------|------|------|------|
| `general` | 通用 | 清晰简洁 | 友好专业 | 平衡叙述 |
| `tourism` | 旅游 | 生动活泼 | 热情邀请 | 景点+体验+攻略 |
| `education` | 教育 | 系统条理 | 循循善诱 | 知识点+案例+练习 |
| `analysis` | 分析 | 数据驱动 | 客观理性 | 数据+趋势+建议 |
| `history` | 历史 | 庄重叙事 | 深沉厚重 | 时间线+事件+影响 |
| `technology` | 科技 | 前沿创新 | 专业前瞻 | 技术+应用+展望 |
| `business` | 商务 | 专业正式 | 自信稳重 | 背景+方案+收益 |

每种场景会自动匹配对应的 prompt 策略，用户选择场景后 AI 生成更具针对性的内容。

aitu 建议在 `PPTGenerateOptions` 中增加 `scenario` 参数：
```typescript
interface PPTGenerateOptions {
  scenario?: 'general' | 'tourism' | 'education' | 'analysis' | 'history' | 'technology' | 'business';
  // ...existing options
}
```

**4. 分级 Prompt 管理架构（6 类模块化 Prompt）**

LandPPT 的 prompt 管理采用了精心设计的**模块化架构**，通过 `PPTPromptsManager` 统一管理 6 类 prompt 子模块：

| Prompt 模块 | 类名 | 核心方法 | 用途 |
|------------|------|---------|------|
| **大纲** | `OutlinePrompts` | `get_outline_prompt_zh/en()`, `get_streaming_outline_prompt()` | 生成结构化大纲 JSON |
| **内容** | `ContentPrompts` | `get_slide_content_prompt_zh/en()`, `get_enhancement_prompt_zh/en()` | 幻灯片内容+增强 |
| **设计** | `DesignPrompts` | `get_style_gene_extraction_prompt()`, `get_creative_template_context_prompt()` | 设计基因提取+HTML生成 |
| **系统** | `SystemPrompts` | `get_default_ppt_system_prompt()`, `get_html_generation_system_prompt()` | 系统角色定义 |
| **修复** | `RepairPrompts` | `get_repair_prompt()`, `get_json_validation_prompt()`, `get_quality_check_prompt()` | 输出修复+质量检查 |
| **演讲稿** | `SpeechScriptPrompts` | `get_single_slide_script_prompt()`, `get_opening_remarks_prompt()` | 演讲稿生成 |

统一管理器 `PPTPromptsManager` 聚合所有子类，通过委托模式暴露 30+ 个 prompt 方法。

大纲输出的 JSON 结构包含丰富的元数据：
```json
{
  "title": "PPT标题",
  "total_pages": 10,
  "page_count_mode": "final",
  "slides": [{
    "page_number": 1,
    "title": "页面标题",
    "content_points": ["要点1", "要点2"],
    "slide_type": "title|content|agenda|thankyou",
    "description": "页面说明",
    "chart_config": { "type": "bar", "data": {...} }
  }],
  "metadata": { "scenario", "language", "total_slides", "enhanced_with_charts", "content_depth" }
}
```

**页面类型枚举**：`"title"` / `"content"` / `"agenda"` / `"thankyou"`
**页数模式枚举**：`"custom_range"` / `"fixed"` / `"ai_decide"`（三种灵活的页数控制）

aitu 建议：
- 建立类似的 6 类模块化 prompt 管理架构
- 统一管理器入口，各模块独立维护
- 大纲 JSON 中加入 `chart_config` 支持图表预配置
- 引入修复 prompt 模块，提升 AI 输出质量和容错能力

**5. summeryanyfile 文档处理模块**

LandPPT 包含独立的 `summeryanyfile` 子模块，专门处理文件上传 → 结构化摘要的完整流程：

| 能力 | 实现 | 说明 |
|------|------|------|
| **32 种文件格式** | `DocumentProcessor.SUPPORTED_EXTENSIONS` | PDF/PPTX/DOCX/XLSX/图片/音频/压缩包等 |
| **MarkItDown 转换** | `MarkItDownConverter` | 复杂文档 → Markdown |
| **MinerU API** | `MineruAPIClient` | 高质量 PDF 解析（OCR 109种语言 + 表格 + LaTeX公式） |
| **6 种分块策略** | `SemanticChunker` / `RecursiveChunker` / `ParagraphChunker` / `HybridChunker` / `FastChunker` | 适配不同文档类型的智能分块 |
| **LangGraph 工作流** | `graph/workflow.py` + `graph/nodes.py` | 基于 LangGraph 的文档分析工作流 |
| **7 天缓存** | `FileCacheManager` | 处理结果缓存避免重复解析 |

文档结构分析 prompt 输入变量：`project_topic`, `project_scenario`, `project_requirements`, `target_audience`, `ppt_style` 等 8 个维度。

aitu 建议：
- 参考 summeryanyfile 的智能分块策略，优化长文档处理
- MinerU API 集成可同时参考 banana-slides 和 LandPPT 的实现
- 文档处理结果（结构分析 JSON）直接作为 PPT 大纲生成的输入

**6. 进度追踪系统**

LandPPT 的 `ProgressTracker` (`services/progress_tracker.py`) 实现了线程安全的 PPT 生成进度追踪：

```python
@dataclass
class ProgressInfo:
    task_id: str
    project_id: str
    total_slides: int
    completed_slides: int
    failed_slides: int
    skipped_slides: int
    current_slide: int
    current_slide_title: str
    status: str  # "running" / "completed" / "failed"
    message: str
    start_time: float
    last_update: float
    error_details: Dict
    
    @property
    def progress_percentage(self) -> float: ...
    
    @property
    def elapsed_time(self) -> float: ...
```

支持单页粒度的状态追踪（completed/failed/skipped），全局实例 `progress_tracker = ProgressTracker()`，1 小时自动清理旧任务。

aitu 建议：
- 复用现有 Service Worker 后台任务 + 进度追踪模式
- 详见 **P18 — TODO 任务板实时追踪**

#### NanoBanana-PPT-Skills 借鉴补充

> 以下内容借鉴自 [NanoBanana-PPT-Skills](https://github.com/op7418/NanoBanana-PPT-Skills) 项目分析（Python + Gemini 3 Pro + 可灵 AI 全图片/视频 PPT 生成工具，by 歸藏 @op7418）

**1. AI 图片直出 PPT 方案**

NanoBanana-PPT-Skills 采用了与前述所有项目截然不同的 PPT 生成范式——**不生成可编辑元素，而是由 AI 直接生成每页 PPT 的完整图片**：

| 特性 | 传统方案（ai-to-pptx / banana-slides / LandPPT） | NanoBanana 方案 |
|------|----------------------------------------------|----------------|
| 输出格式 | 可编辑的 JSON/HTML/PPTX 元素 | 整页 PNG 图片（2K/4K） |
| AI 模型 | 文本 LLM（GPT/Gemini/Claude）| 图片生成模型（`gemini-3-pro-image-preview`）|
| 设计质量 | 受限于 HTML/CSS 排版能力 | **电影级渲染质量**，无 CSS 限制 |
| 可编辑性 | ✅ 高 | ❌ 低（图片不可编辑） |
| 生成速度 | 多轮 AI 调用（大纲→内容→模板→渲染）| **单次 AI 调用生成完整页面** |

**核心生成流程** (`generate_ppt.py`, 452 行)：
```
用户文档 → Claude Code 内容规划 → 逐页生成 Prompt → Gemini 3 Pro 图片生成 → HTML 播放器
```

**Prompt 构建逻辑** (`generate_prompt()`)：
1. 加载风格模板 Markdown（`styles/*.md`）
2. 根据页面类型（`cover` / `data` / `content`）选择对应模板段落
3. 拼合：`基础风格提示词 + 页面类型模板 + 实际内容 + 分辨率指令`
4. 关键参数：`gemini-3-pro-image-preview` 模型、16:9 宽高比、2K(2048×1152) 或 4K(4096×2304) 分辨率

aitu 实现建议：
- **双轨并行**：保留现有元素级 PPT 生成（可编辑）+ 新增「AI 图片直出」模式（高视觉质量）
- 利用现有 Gemini 图片生成能力，新增 `generate_ppt_as_images` MCP 工具
- 图片直出模式适合快速演示、社交分享等不需要二次编辑的场景
- 详见 **P21 — PPT 视频导出**

**2. Markdown 风格模板系统**

NanoBanana 使用 **Markdown 文件** 定义视觉风格（`styles/` 目录），每个风格文件包含：

| 字段 | 说明 | 示例 |
|------|------|------|
| `style_id` | 风格标识 | `gradient-glass` / `vector-illustration` |
| `适配模型` | 推荐的图片生成模型 | `Nano Banana Pro`, `Seedream`, `Lovart` |
| `基础提示词` | 全局视觉风格描述 | Apple Keynote 极简 + 玻璃拟态 + 虹彩渐变 |
| 封面页模板 | cover 页面提示词 | 3D 玻璃物体 + 极光波浪 + 大字标题 |
| 内容页模板 | content 页面提示词 | Bento 网格 + 磨砂玻璃卡片 + 霓虹高光 |
| 数据页模板 | data 页面提示词 | 分屏布局 + 发光 3D 图表 + 数据标注 |
| 技术参数 | 模型/比例/分辨率 | `gemini-3-pro-image-preview`, 16:9, 2K/4K |

**当前内置 2 种风格**：
- **渐变毛玻璃卡片** (`gradient-glass.md`)：科技感、Apple 风格、虹彩渐变 + 玻璃拟态
- **矢量插画** (`vector-illustration.md`)：温暖扁平化、统一黑色轮廓线、复古配色

aitu 建议：
- 为 AI 图片直出模式设计 Markdown 风格模板体系
- 风格模板可作为 P2 模板系统的补充维度（元素布局模板 + 视觉风格模板）
- 支持用户自定义风格描述或选择预设风格

**3. 6 阶段 Claude Code Skill 工作流**

NanoBanana 设计了完整的 **Claude Code Skill 工作流**（`SKILL.md`, 675 行），适配不同页数的内容规划策略：

| 页数范围 | 结构模板 |
|---------|---------|
| ~5 页 | 封面 + 3 内容 + 结尾 |
| 5-10 页 | 封面 + 目录 + 5-7 内容 + 数据 + 结尾 |
| 10-15 页 | 封面 + 目录 + 8-12 内容(含 2 数据) + 结尾 |
| 20-25 页 | 封面 + 目录 + 16-22 内容(含 4 数据) + 结尾 |

每个阶段：
1. **收集用户输入**：文档内容、风格选择、页数、分辨率、是否生成视频
2. **文档分析与内容规划**：分析文档 → 按页数模板规划每页内容和类型
3. **生成 PPT 图片**：调用 `generate_ppt.py` 逐页生成
4. **生成转场提示词**：调用 Claude API 分析相邻图片差异，生成转场描述
5. **生成转场视频**：调用可灵 AI API 生成页间转场动画
6. **返回结果**：输出图片+视频+HTML播放器

aitu 建议：
- 参考此页数自适应内容规划策略，在 P0 大纲生成中按页数范围调整结构模板
- 内容规划先于 AI 调用，提升生成效率和一致性

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

#### banana-slides 借鉴补充

> 以下内容借鉴自 [banana-slides](https://github.com/snakeying/banana-slides)（蕉幻）项目分析

**1. 三种导出格式**

banana-slides 的 `ExportService` (`backend/services/export_service.py`) 支持三种导出格式：

| 导出格式 | 方法 | 实现方式 | 特点 |
|---------|------|---------|------|
| PPTX（图片版） | `create_pptx_from_images()` | `python-pptx` 库，每页一张全屏图片 (16:9) | 同步，快速，但不可编辑 |
| PDF | `create_pdf_from_images()` | 优先 `img2pdf`（低内存），失败回退 `Pillow` | 同步，通用格式 |
| **可编辑 PPTX** | `create_editable_pptx_with_recursive_analysis()` | 递归版面分析 + 背景分离 + 文本/图片分层 | **异步，最具创新性** |

**2. 可编辑 PPTX 逆向导出（核心创新）**

banana-slides 最具创新性的功能是将 AI 生成的**图片**逆向转换为**可编辑 PPTX**：

**处理流程**（4 阶段）：
1. **版面分析** (5%-40%)：`ImageEditabilityService.make_image_editable()` 递归分析图片中的文字/图片/表格区域
2. **文本样式提取** (45%-70%)：混合策略 `_batch_extract_text_styles_hybrid()`
   - 全局 AI 识别：`is_bold` / `is_italic` / `is_underline` / `text_alignment`
   - 单元素裁剪识别：精确提取 `font_color`（含 `colored_segments` 多色段）
3. **构建 PPTX** (75%-95%)：`PPTXBuilder` 递归添加元素到幻灯片
4. **保存输出** (95%-100%)

**背景修复（Inpainting）**：识别出文字/图片元素后，需要消除这些元素并重建背景：

| Inpainting Provider | 实现 | 说明 |
|--------------------|----|------|
| `generative`（火山引擎/Gemini） | `InpaintingService` | AI 生成式修复，效果最好 |
| `baidu`（百度） | `InpaintingService` | 传统图像修复算法 |
| `hybrid` | 混合模式 | 结合两种方式，自动选择最优 |

**错误处理**：
- `ExportError` 异常含 `error_type` 枚举：`style_extraction` / `text_render` / `image_add` / `inpaint` / `config` / `service`
- `ExportWarnings` 警告收集器：允许部分失败继续导出（`export_allow_partial` 配置）

aitu 实现建议：
- 虽然 aitu 是元素级编辑（不需要逆向解析），但 **Inpainting 能力** 可用于「删除元素后自动补全背景」
- **版面分析能力** 可用于 PPT 导入场景（P6），辅助识别导入 PPT 中的元素层次
- 考虑在导出时提供「图片版 PPTX」和「可编辑 PPTX」两种选项

#### LandPPT 借鉴补充

> 以下内容借鉴自 [LandPPT](https://github.com/sligter/LandPPT) 项目分析

**1. 五种导出格式**

LandPPT 支持比 banana-slides 更丰富的导出格式：

| 导出格式 | 实现方式 | 说明 |
|---------|---------|------|
| **PPTX** | `python-pptx` / Playwright HTML→PPTX | 可编辑幻灯片格式 |
| **PDF** | Playwright 截图 → PDF 拼合；或 `pdfkit` (wkhtmltopdf) | 通用文档格式 |
| **HTML** | 直接导出 HTML 模板渲染结果 | 可在浏览器直接演示 |
| **DOCX** | `python-docx` 生成 Word 文档 | 适合内容再编辑 |
| **Markdown** | 结构化导出大纲+内容 | 适合二次处理 |

**2. Playwright + Apryse 双引擎导出**

LandPPT 的 `PyppeteerPdfConverter` (`services/pyppeteer_pdf_converter.py`, 99.9KB) 使用 **Playwright** 浏览器引擎实现高保真 HTML → PDF 转换：
- 每页 HTML 模板在无头浏览器中渲染
- 截取 1280×720 画布为高分辨率图片
- 拼合为 PDF 或插入 PPTX

同时集成 **Apryse SDK**（原 PDFTron，`pdf_to_pptx_converter.py`）实现专业级 PDF → PPTX 转换：
- 自动下载平台对应 SDK（Windows/Linux/macOS）
- 高质量保留原始排版和可编辑性
- 需要 `APRYSE_LICENSE_KEY` 授权

aitu 实现建议：
- PPTX 导出优先使用前端 `pptxgenjs`（已规划）
- PDF 导出可考虑 Playwright 无头浏览器方案作为高保真备选
- 新增 Markdown 导出选项（成本最低，适合二次处理）
- HTML 导出可直接复用 PPT 播放器的渲染结果

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

#### banana-slides 借鉴补充

> 以下内容借鉴自 [banana-slides](https://github.com/snakeying/banana-slides)（蕉幻）项目分析

**1. 预设风格系统（AI 风格描述替代传统 JSON 模板）**

banana-slides 采用了一种与传统 JSON 模板截然不同的风格系统：**用自然语言描述视觉风格**，直接作为 AI 图片生成 prompt 的一部分。

`frontend/src/config/presetStyles.ts` 定义了 8 种预设风格：

| # | 风格 ID | 中文名称 | 核心视觉特征 |
|---|--------|---------|-------------|
| 1 | `business-simple` | 简约商务 | 海军蓝+白色，麦肯锡风格，无衬线字体 |
| 2 | `tech-modern` | 现代科技 | 赛博朋克，午夜黑+电光蓝，全息渐变 |
| 3 | `academic-formal` | 严谨学术 | 米白纸张质感，衬线字体，学术排版 |
| 4 | `creative-fun` | 活泼创意 | 孟菲斯风格，手绘涂鸦，不规则形状 |
| 5 | `minimalist-clean` | 极简清爽 | 北欧设计，70%留白，细线条 |
| 6 | `luxury-premium` | 高端奢华 | 曜石黑+香槟金，Art Deco 几何 |
| 7 | `nature-fresh` | 自然清新 | 米色+森林绿，水彩植物元素 |
| 8 | `gradient-vibrant` | 渐变活力 | 全息渐变色，玻璃拟态，流体形状 |

每种风格包含极其详细的视觉描述（配色方案、材质、排版规则、字体选择、渲染要求），例如「简约商务」风格描述涵盖：
- 配色：海军蓝 (#1a365d) + 白色 + 浅灰辅助色
- 排版：大标题左对齐、正文区域限制在右 2/3、关键数字突出显示
- 材质：纯色背景、无渐变无纹理、细灰色分割线
- 渲染：4K 分辨率、干净锐利的矢量感

**接口定义**：
```typescript
interface PresetStyle {
  id: string;
  nameKey: string;           // i18n 翻译 key
  descriptionKey: string;    // i18n 翻译 key（完整视觉描述）
  previewImage?: string;     // 预览图路径（如 /preset-previews/business-simple.webp）
}
```

**2. 自定义模板图片**

除了预设风格外，用户还可以：
- 上传自定义模板图片（`Project.template_image_path`），AI 将参考该图片的风格生成 PPT
- 输入纯文字风格描述（`Project.template_style`），无模板图时使用文字描述

aitu 实现建议：
- **混合模板方案**：在传统 JSON 模板（定义布局和占位元素）的基础上，增加「AI 风格描述」层
  - JSON 模板控制布局结构（元素位置/尺寸）
  - 风格描述控制视觉风格（配色/材质/字体/渲染风格）
  - 两者可独立切换，组合使用
- 预设 5-8 种风格描述，类似 banana-slides 的 `presetStyles`
- 支持用户上传参考图片或输入自定义风格描述
- 风格描述通过 `extraRequirements` 或专用字段传入 AI prompt

#### LandPPT 借鉴补充

> 以下内容借鉴自 [LandPPT](https://github.com/sligter/LandPPT) 项目分析

**1. AI 自动生成母版模板**

LandPPT 的 `GlobalMasterTemplateService` (`services/global_master_template_service.py`, 47KB) 实现了一套完整的 **AI 驱动模板生成系统**：

核心流程：
1. **创建模板**：`create_template(template_data)` → 检查名称唯一 → AI 生成 HTML 模板 → 自动生成预览图 → 提取样式配置
2. **设计基因提取**：`DesignPrompts.get_style_gene_extraction_prompt(template_code)` 从 HTML 模板中提取 6 维设计基因（色彩、字体、布局、间距、装饰、动效）
3. **创意变化**：`get_creative_variation_prompt()` 和 `get_content_driven_design_prompt()` 生成同风格的变体页面

**数据库模型** (`database/models.py` → `GlobalMasterTemplate`)：
```python
class GlobalMasterTemplate:
    template_name: str       # 唯一模板名
    html_template: Text      # 完整 HTML 模板代码
    preview_image: Text      # Base64 预览图
    style_config: JSON       # 提取的样式配置
    tags: JSON               # 标签列表
    is_default: bool         # 是否默认
    is_active: bool          # 是否启用
    usage_count: int         # 使用次数
    created_by: str          # 创建者
```

**HTML 模板规范**：
- 固定画布 `1280×720px`（16:9）
- 使用 Tailwind CSS + Chart.js + Font Awesome
- 支持占位符：`{{ page_title }}`, `{{ main_heading }}`, `{{ page_content }}`, `{{ current_page_number }}`, `{{ total_page_count }}`
- 严格保留页眉/页脚结构
- 动态内容自适应布局

**2. 25 种预设模板 JSON 系统**

LandPPT 的 `template_examples/` 目录包含 **25 种风格各异的预设模板**：

| 风格类别 | 模板名称 |
|---------|---------|
| **中国风** | 中国风、中式书卷风、宣纸风、竹简风 |
| **商务** | 商务、简约答辩风、素白风 |
| **科技** | 科技风、赛博朋克风、终端风 |
| **艺术** | 莫奈风、星月夜风、吉卜力风、Toy风 |
| **自然** | 森林绿、清新风、清新笔记 |
| **现代** | 模糊玻璃、拟态风、渐变活力（星月蓝）|
| **特色** | 五彩斑斓的黑、大气红、速度黄、日落大道、饺子风 |

每个模板 JSON 包含完整 HTML 代码 + 样式配置 + 标签 + 导出信息，例如「商务」模板：
```json
{
  "template_name": "默认商务模板",
  "description": "现代简约的商务PPT模板...",
  "html_template": "...(含完整 CSS + HTML + 占位符)...",
  "tags": ["默认", "商务", "现代", "简约", "深色"],
  "is_default": false
}
```

aitu 实现建议：
- **混合模板体系**：JSON 布局模板 + AI 风格描述 + HTML 渲染模板三层叠加
- 内置 10-15 种精选预设模板（覆盖商务/科技/学术/创意/中国风等主流场景）
- 支持 AI 按用户描述自动生成新模板（参考 LandPPT 的母版模板生成流程）
- 模板支持导入/导出 JSON 格式，方便社区共享

**3. 设计基因提取与创意模板生成**

LandPPT 的 `DesignPrompts` (`services/prompts/design_prompts.py`, 581 行) 定义了精细的设计生成提示词体系：

| Prompt 方法 | 参数量 | 用途 |
|------------|--------|------|
| `get_style_gene_extraction_prompt(template_code)` | 1 | 从模板提取设计基因（色彩/字体/布局等 6 维） |
| `get_unified_design_guide_prompt(slide_data, page_number, total_pages)` | 3 | A-E 五维统一设计指导 |
| `get_creative_variation_prompt(slide_data, page_number, total_pages)` | 3 | 创意变化指导 |
| `get_content_driven_design_prompt(slide_data, page_number, total_pages)` | 3 | 内容驱动设计 |
| `get_creative_template_context_prompt(...)` | **13** | 核心 HTML 生成（含 slide_data/template_html/style_genes/project 上下文等） |

核心的 `get_creative_template_context_prompt` 方法整合 13 个参数，包括当前幻灯片数据、HTML 模板、设计基因、项目主题/类型/受众/风格等完整上下文，生成单页 HTML。

aitu 建议：
- 建立设计基因提取能力，用于模板风格分析和迁移
- 在切换模板时，提取源模板设计基因 → 应用到新模板
- 支持用户上传参考图片 → AI 提取设计基因 → 自动生成匹配风格的模板

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

#### LandPPT 借鉴补充

> 以下内容借鉴自 [LandPPT](https://github.com/sligter/LandPPT) 项目分析

**1. 16+ 种图表类型（含专业图表）**

LandPPT 的大纲生成 prompt (`services/prompts/outline_prompts.py`) 在大纲阶段即可为每页预配置 `chart_config`，支持的图表类型远超常规 PPT 工具：

| 类别 | 图表类型 | 适用场景 |
|------|---------|---------|
| **基础** | 柱状图 (bar)、折线图 (line)、饼图 (pie)、环形图 (doughnut) | 通用数据展示 |
| **对比** | 条形图 (horizontal bar)、面积图 (area)、瀑布图 (waterfall) | 趋势对比 |
| **关系** | 韦恩图 (venn)、和弦图 (chord)、关联图 (network) | 关系展示 |
| **统计** | 森林图 (forest)、生存曲线图 (survival)、漏斗图 (funnel) | 学术/医学统计 |
| **流程** | 甘特图 (gantt)、词云图 (wordcloud) | 项目管理/文本分析 |
| **复杂** | UpSet 图 (upset) | 集合交集可视化 |

**大纲中的图表预配置**（AI 在生成大纲时自动建议）：
```json
{
  "page_number": 3,
  "title": "市场分析",
  "chart_config": {
    "type": "bar",
    "data": { "labels": ["Q1", "Q2", "Q3"], "datasets": [...] },
    "options": { "title": "季度营收对比" }
  }
}
```

aitu 建议：
- 在大纲 JSON 中支持 `chart_config` 字段，AI 大纲阶段即建议图表
- 初期支持 6 种基础图表（bar/line/pie/doughnut/area/funnel）
- 中期扩展专业图表（甘特图/瀑布图/韦恩图）
- 图表数据格式统一为类 Excel 二维数组 + Chart.js 兼容配置

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

#### NanoBanana-PPT-Skills 借鉴补充

> 以下内容借鉴自 [NanoBanana-PPT-Skills](https://github.com/op7418/NanoBanana-PPT-Skills) 项目分析

**1. AI 视频转场（图生视频方案）**

NanoBanana 在传统 CSS 切换动画之上，开创了 **AI 视频转场**——使用可灵 AI（Kling）将相邻两页 PPT 图片生成转场视频：

| 特性 | 传统 CSS 切换动画 | NanoBanana AI 视频转场 |
|------|-----------------|---------------------|
| 效果 | 淡入淡出/推入/缩放等预设 | **电影级 3D 变形/物理解构** |
| 实现 | CSS animation/transition | AI 图生视频（首帧→尾帧） |
| 定制性 | 固定预设参数 | 每对页面**独立生成**匹配转场 |
| 成本 | 无 | API 调用费用 |

**可灵 AI API 封装** (`kling_api.py`, 431 行)：
```python
class KlingVideoGenerator:
    API_BASE = "https://api-beijing.klingai.com"
    
    def create_video_task(
        first_frame_image,        # 首帧图片（当前页截图）
        last_frame_image,         # 尾帧图片（下一页截图）
        prompt,                   # 转场描述提示词
        model_name="kling-v2-6",  # 可灵 v2.6 模型
        duration="5",             # 视频时长 5s/10s
        mode="std",               # 标准/专业模式
    ) -> task_id
    
    def wait_for_completion(task_id, timeout=300, interval=5) -> video_url
    def download_video(video_url, output_path)
```

**2. 智能转场提示词生成**

NanoBanana 提供两种转场提示词生成策略：

**策略 A：Claude AI 分析生成** (`transition_prompt_generator.py`, 314 行)
- 将两张相邻页面图片（Base64）发送给 Claude（`claude-sonnet-4-5-20250929`）
- Claude 分析两页视觉差异，生成匹配的转场描述
- 遵循转场模板框架（`prompts/transition_template.md`）

**转场模板框架**：
1. **分析差异**：A 类（关联性强→原地演变）vs B 类（差异巨大→运镜驱动转场）
2. **选择策略**：A 类保持主体位置，微调细节；B 类用推/拉/横移镜头切换场景
3. **构思变化**：主体变化 + 环境变化 + 风格/特效变化
4. **输出规则**：连贯段落、具体画面感、遵守摄像机策略

**策略 B：预设通用模板** (`simple_transition_prompt_generator.py`, 106 行)
- 无需 Claude API，使用内置的通用转场描述
- 适用于所有毛玻璃风格 PPT 的默认转场效果
- 包含极光波浪、3D 玻璃解构/重组、磨砂卡片滑入等通用动效

aitu 实现建议：
- 在现有 CSS 切换动画（P4）基础上，新增「AI 视频转场」高级选项
- 利用现有 Gemini API 或集成可灵 AI API，实现图生视频转场
- 预设 5-10 种通用转场描述模板，同时支持 AI 自动分析生成
- 详见 **P21 — PPT 视频导出**

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

#### LandPPT 借鉴补充

> 以下内容借鉴自 [LandPPT](https://github.com/sligter/LandPPT) 项目分析

**1. 完整的 AI 演讲稿生成系统**

LandPPT 的 `SpeechScriptService` (`services/speech_script_service.py`, 793 行) 实现了远超简单备注的**专业演讲稿生成系统**：

**三种生成类型**：`single`（单页）/ `multi`（多页批量）/ `full`（全套含开场白+结束语）

**7 种语气风格** (`SpeechTone` 枚举)：

| 语气 | 枚举值 | 适用场景 |
|------|--------|---------|
| 正式 | `FORMAL` | 学术报告、商务汇报 |
| 随意 | `CASUAL` | 团队分享、内部沟通 |
| 说服性 | `PERSUASIVE` | 方案推介、融资路演 |
| 教育性 | `EDUCATIONAL` | 培训课程、知识分享 |
| 对话式 | `CONVERSATIONAL` | 沙龙分享、圆桌讨论 |
| 权威性 | `AUTHORITATIVE` | 行业报告、专家演讲 |
| 叙事性 | `STORYTELLING` | 品牌故事、案例分享 |

**7 种目标受众** (`TargetAudience` 枚举)：
`EXECUTIVES` / `STUDENTS` / `GENERAL_PUBLIC` / `TECHNICAL_EXPERTS` / `COLLEAGUES` / `CLIENTS` / `INVESTORS`

**3 种语言复杂度** (`LanguageComplexity` 枚举)：
`SIMPLE`（通俗易懂）/ `MODERATE`（适中专业）/ `ADVANCED`（高度专业）

**自定义配置数据结构**：
```python
@dataclass
class SpeechScriptCustomization:
    tone: SpeechTone
    target_audience: TargetAudience
    language_complexity: LanguageComplexity
    custom_style_prompt: str        # 自定义风格提示（如"幽默轻松"）
    include_transitions: bool       # 是否包含过渡语句
    include_timing_notes: bool      # 是否包含时间标注
    speaking_pace: str              # 'slow' / 'normal' / 'fast'
```

**演讲稿生成结果**：
```python
@dataclass
class SlideScriptData:
    slide_index: int
    slide_title: str
    script_content: str        # 完整演讲稿文本
    estimated_duration: float  # 预估时长（秒）
    speaker_notes: str         # 简要提示语
```

**Prompt 设计** (`services/prompts/speech_script_prompts.py`)：
- `get_single_slide_script_prompt()` — 单页演讲稿（含上下文：前一页内容、整体结构位置）
- `get_opening_remarks_prompt()` — 开场白（含项目主题、受众分析）
- `get_closing_remarks_prompt()` — 结束语（含总结回顾、号召行动）
- 从 HTML 模板中自动提取文本内容作为演讲稿参考

**数据库持久化** (`database/models.py` → `SpeechScript`)：
- 支持按幻灯片索引存储/查询
- 记录生成参数（tone/audience/complexity）便于重新生成
- 支持多格式导出（独立的 `SpeechScriptExporter` 服务）

aitu 实现建议：
- 将当前 P5 从简单的「备注字段」升级为「AI 演讲稿生成」
- 新增 MCP 工具 `generate_speech_script`（支持单页/全套两种模式）
- UI 中提供语气/受众/复杂度的快捷选择
- 演讲稿与幻灯片独立管理，支持按页查看和编辑
- 演讲者视图中显示 AI 生成的演讲稿 + 预估时长

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

### P9 — 封面/缩略图自动生成

**价值**：中低，提升模板预览和分享体验  
**复杂度**：低  
**ai-to-pptx 参考**：`cover.js` drawCover() 函数

#### 实现方案

ai-to-pptx 的 `cover.js` 实现了自动生成 PPT 封面缩略图的功能：

**算法**：
- 画布尺寸：600×338 (16:9)
- 灰色底色 rgb(212, 212, 212)
- 首页大图居中，占画布 65% 宽高
- 周围以 3×3 宫格布局排列最多 8 个子页面缩略图（每个占画布 1/3.3 宽高）
- 首页叠加在子页面之上，形成层叠预览效果
- 支持灰度模式（用于禁用/只读状态），使用 luminance 算法灰度化

**用途**：
- 模板选择列表的缩略图
- PPT 分享/导出时的封面预览
- 项目列表中的 PPT 预览卡片

**aitu 实现建议**：

1. **新增服务** `services/ppt-cover-service.ts`
   ```typescript
   interface CoverOptions {
     width?: number;       // 封面宽度，默认 600
     height?: number;      // 封面高度，默认 338
     maxSubPages?: number; // 最大子页面数，默认 8
     grayScale?: boolean;  // 是否灰度
   }
   
   async function generateCover(
     frames: PlaitFrame[],
     options?: CoverOptions
   ): Promise<string>  // 返回 DataURL
   ```

2. **利用现有能力**
   - 复用 `html2canvas` (P7 依赖) 截取 Frame 内容
   - 或利用 Plait 的 SVG 导出能力截取 Frame
   - 缩略图缓存在 `unified-cache-service` 中

3. **UI 集成**
   - FramePanel 中显示 PPT 封面缩略图
   - 模板选择页显示模板封面
   - 项目列表卡片显示 PPT 封面预览

---

### P10 — PPT JSON 中间格式与传输优化

**价值**：中，统一数据格式，提升性能  
**复杂度**：中低  
**ai-to-pptx 参考**：`element.js` 元素工厂 + pako gzip 压缩传输

#### 实现方案

**1. PPT JSON 中间格式**

ai-to-pptx 使用 JSON 作为 PPT 数据的统一中间表示（由 [ppt2json](https://github.com/veasion/ppt2json) 工具转换），包含完整的页面、元素、样式定义。aitu 可建立类似的中间格式标准：

```typescript
interface PPTJsonDocument {
  version: string;
  width: number;          // PPT 宽度 (如 1920)
  height: number;         // PPT 高度 (如 1080)
  theme: PPTTheme;        // 主题信息
  pages: PPTJsonPage[];   // 页面列表
}

interface PPTJsonPage {
  id: string;
  name: string;
  transition?: FrameTransition;
  notes?: string;
  background?: FillConfig;
  elements: PPTJsonElement[];  // 页面内元素
}

interface PPTJsonElement {
  id: string;
  type: 'text' | 'image' | 'shape' | 'table' | 'chart' | 'group';
  anchor: [number, number, number, number];  // [x, y, width, height]
  fillStyle?: FillConfig;
  strokeStyle?: StrokeConfig;
  // 类型特有属性...
  [key: string]: any;
}
```

**用途**：
- AI 生成 PPT 的统一输出格式
- PPTX 导入/导出的中间转换层
- 模板定义的存储格式
- 前后端数据交互的标准协议
- 项目文件的持久化格式

**2. gzip 压缩传输**

当 PPT JSON 数据量较大时（20+ 页，含图片 base64），启用压缩传输：

```typescript
// 压缩
import pako from 'pako';
const compressed = pako.gzip(JSON.stringify(pptJson));
const base64 = btoa(String.fromCharCode(...compressed));

// 解压
const binary = atob(base64);
const bytes = new Uint8Array(binary.length);
for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
const decompressed = JSON.parse(pako.ungzip(bytes, { to: 'string' }));
```

建议：在数据超过 100KB 时自动启用 gzip 压缩。

---

### P11 — 国际化/多语言 PPT 生成

**价值**：中低，扩大用户群体  
**复杂度**：低  
**ai-to-pptx 参考**：`StepOneInputData.tsx` 语言选择 + `i18n.ts` 国际化配置

#### 实现方案

1. **AI 生成内容的语言控制**
   - 在 `generate_ppt` MCP 工具中增加 `language` 参数
   - AI Prompt 中指定生成内容的语言
   - 支持语言：中文(zh)、英文(en)、日文(ja)、韩文(ko) 等

2. **模板中的多语言文案**
   - 模板中的固定文案（"目录"、"感谢"等）根据语言切换
   - 建立模板文案的 i18n 映射表

3. **字体自动适配**
   - 根据目标语言自动选择合适字体
   - 中文：思源黑体/微软雅黑
   - 英文：Inter/Roboto
   - 日文：Noto Sans JP
   - 利用现有 `font-manager-service.ts` 能力

---

### P12 — AI 精炼交互（自然语言迭代修改）

**价值**：高，显著提升 AI 辅助编辑的交互体验和内容质量  
**复杂度**：中  
**banana-slides 参考**：`AiRefineInput` 组件 + `get_outline_refinement_prompt()` / `get_descriptions_refinement_prompt()`

#### 实现方案

**核心概念**：在 PPT 生成的各个阶段（大纲、内容、布局），用户可以用自然语言指令对 AI 生成结果进行迭代修改，且系统保留完整修改历史作为上下文，支持多轮对话式精炼。

**1. 精炼输入组件** (`components/ppt/ai-refine-input.tsx`)

参考 banana-slides 的 `AiRefineInput` 组件设计：

```typescript
interface AiRefineInputProps {
  title: string;                          // 标题（如"AI 优化大纲"）
  placeholder: string;                     // 占位文字
  onSubmit: (requirement: string, previousRequirements: string[]) => Promise<void>;
  disabled?: boolean;
  onStatusChange?: (isSubmitting: boolean) => void;
}
```

组件特性：
- 内置修改历史记录管理（展开/收起查看）
- 支持 Ctrl+Enter / Cmd+Enter 快捷键提交
- 提交中动画效果（加载态反馈）
- 紧凑模式（无标题时自动切换）

**2. 精炼 MCP 工具**

新增两个 MCP 工具：

```typescript
// 大纲精炼
interface RefineOutlineInput {
  currentOutline: PPTOutline;           // 当前大纲
  requirement: string;                  // 用户修改需求
  previousRequirements?: string[];      // 历史修改记录
}

// 内容精炼
interface RefineContentInput {
  pageId: string;                       // 目标页面 ID
  currentContent: PPTPageSpec;          // 当前页面内容
  requirement: string;                  // 用户修改需求
  previousRequirements?: string[];      // 历史修改记录
  outline: PPTOutline;                  // 完整大纲（上下文）
}
```

**3. 精炼 Prompt 设计**

参考 banana-slides 的精炼 prompt 设计要点：
- 将当前内容（大纲/描述）完整传入
- 附带所有历史修改请求作为上下文（避免 AI 遗忘之前的修改）
- 明确指示"只修改用户要求的部分，保留其他内容不变"
- 输出格式与原内容结构一致

**4. UI 集成**

- 大纲编辑器底部：嵌入精炼输入框
- Frame 内容编辑面板：嵌入精炼输入框
- 全局修改入口：Chat Drawer 中支持对整个 PPT 进行自然语言修改

**用例示例**：
- 「增加一页关于市场分析的内容」→ AI 在大纲中插入新章节
- 「将第三页的文字精简到 5 条要点」→ AI 重写该页内容
- 「整体风格改为更轻松活泼」→ AI 调整所有页面的措辞和描述
- 「删除第 5 页，将第 6-7 页合并」→ AI 重组大纲结构

---

### P13 — 内容版本管理与回退

**价值**：中高，提升用户编辑信心和容错能力  
**复杂度**：中低  
**banana-slides 参考**：`PageImageVersion` 模型 (`backend/models/page_image_version.py`)

#### 实现方案

**核心概念**：每次 AI 生成或用户修改 Frame 内容时，自动保存一个版本快照，用户可查看历史版本并随时回退。

**1. 版本数据结构**

```typescript
interface FrameContentVersion {
  id: string;                      // 版本 UUID
  frameId: string;                 // 所属 Frame ID
  versionNumber: number;           // 版本号，从 1 开始递增
  isCurrent: boolean;              // 是否为当前使用版本
  elements: PlaitElement[];        // 该版本的元素快照
  createdAt: string;               // 创建时间
  source: 'ai_generate' | 'ai_refine' | 'user_edit' | 'template_change';  // 版本来源
  description?: string;            // 版本描述（如"AI 精炼：增加市场分析"）
}
```

参考 banana-slides `PageImageVersion` 模型：
- `version_number`：递增整数
- `is_current`：布尔标记当前版本
- `page_id`：关联所属页面
- 切换版本时只需更新 `is_current` 标记

**2. 版本管理服务** (`services/frame-version-service.ts`)

```typescript
class FrameVersionService {
  // 保存新版本（AI 生成/精炼/用户编辑后自动调用）
  saveVersion(frameId: string, elements: PlaitElement[], source: string, description?: string): void;
  
  // 获取所有版本列表
  getVersions(frameId: string): FrameContentVersion[];
  
  // 切换到指定版本
  switchToVersion(frameId: string, versionId: string): void;
  
  // 获取当前版本号
  getCurrentVersion(frameId: string): number;
}
```

**3. 版本触发时机**

| 触发场景 | `source` | 说明 |
|---------|----------|------|
| AI 首次生成 | `ai_generate` | 初始版本 |
| AI 精炼修改 | `ai_refine` | 每次精炼创建新版本 |
| 用户手动编辑 | `user_edit` | 防抖合并（如 5 秒内连续编辑合为一个版本） |
| 更换模板/主题 | `template_change` | 模板切换前自动保存 |

**4. UI 集成**

- FramePanel 中每个 Frame 显示版本计数标记
- 展开 Frame 可查看版本时间线（列表/缩略图形式）
- 点击历史版本可预览，确认后切换
- 存储策略：每个 Frame 最多保留 20 个版本，超出时删除最旧的

---

### P14 — 素材系统

**价值**：中，提升 PPT 内容丰富度和个性化能力  
**复杂度**：中  
**banana-slides 参考**：`Material` 模型 + `MaterialCenterModal` + `MaterialSelector`

#### 实现方案

**核心概念**：建立素材中心，用户可上传、AI 可生成、从参考文件中提取素材图片，供 PPT 生成和编辑时引用。

**1. 素材数据结构**

```typescript
interface Material {
  id: string;                       // 素材 UUID
  projectId?: string;               // 所属项目 ID（null 为全局素材）
  filename: string;                 // 文件名
  url: string;                      // 访问 URL
  source: 'upload' | 'ai_generate' | 'file_extract';  // 素材来源
  tags?: string[];                  // 标签（便于检索）
  createdAt: string;
}
```

参考 banana-slides `Material` 模型：
- `project_id`：外键，可为 null（区分项目级和全局素材）
- `relative_path` + `url`：文件存储和访问路径
- 关联关系：`Project.materials` (cascade delete)

**2. 素材来源**

| 来源 | 说明 | 实现方式 |
|------|------|---------|
| 用户上传 | 拖拽/选择上传图片 | 复用现有文件上传能力 |
| AI 生成 | 通过提示词生成素材图片 | 异步任务，复用 Gemini 图片生成 |
| 参考文件提取 | 从上传的 PDF/PPTX 中提取图片 | FileParserService 解析时提取 |
| 网络搜索 | 从网络搜索相关图片（可选） | 后续扩展 |

**3. 素材中心 UI** (`components/ppt/material-center-modal.tsx`)

参考 banana-slides 的 `MaterialCenterModal` + `MaterialSelector`：
- 网格布局展示素材缩略图
- 支持按来源/标签筛选
- AI 生成入口：输入提示词，异步生成素材
- 拖拽素材到 Frame 中直接使用
- 生成 PPT 时可选择素材作为参考图片

**4. AI 生成集成**

- PPT 生成 prompt 中附带可用素材列表（图片 URL + 描述）
- AI 可在生成内容时引用素材库中的图片
- 参考 banana-slides：素材图片路径以 Markdown 图片语法传入 prompt

---

### P15 — AI 自然语言编辑

**价值**：高，实现真正的"对话式 PPT 编辑"  
**复杂度**：高  
**banana-slides 参考**：`get_image_edit_prompt()` + 图片编辑流程

#### 实现方案

**核心概念**：用户可以用自然语言指令修改已生成的 PPT 页面内容，AI 智能判断修改意图并执行编辑操作。

**1. 编辑指令解析**

参考 banana-slides 的 `get_image_edit_prompt(edit_instruction, original_description)`，AI 需要：
- 理解用户编辑意图（修改文字、调整布局、替换图片、改变样式等）
- 定位目标元素（"标题"、"第二个要点"、"右侧图片"等自然语言定位）
- 生成具体的编辑操作

**2. 编辑 MCP 工具**

```typescript
interface EditFrameByNaturalLanguage {
  frameId: string;                    // 目标 Frame ID
  instruction: string;                // 自然语言编辑指令
  referenceImages?: string[];         // 参考图片（可选）
  originalDescription?: string;       // 页面原始描述（上下文）
}
```

**3. AI 编辑能力分层**

| 编辑层级 | 示例指令 | 实现方式 |
|---------|---------|---------|
| 文字修改 | 「将标题改为"2025年度报告"」 | 定位文本元素 → 更新 text 属性 |
| 样式调整 | 「把标题颜色改成红色」「放大正文字号」 | 定位元素 → 更新 style 属性 |
| 布局变更 | 「将图文从左右布局改为上下布局」 | 重新计算元素 position/size |
| 内容增删 | 「增加一个数据图表」「删除底部备注」 | 添加/移除 Frame 内元素 |
| 图片替换 | 「将背景图换成科技感更强的」 | AI 重新生成图片 → 替换 image 元素 |
| 整体重做 | 「这页重新生成，风格要更简洁」 | 保留大纲信息，重新生成整页内容 |

**4. 参考图片支持**

参考 banana-slides 的图片编辑流程，支持附加参考图片：
- 用户可从素材库选择参考图片
- 用户可框选 Frame 中的区域作为编辑目标
- AI 判断用户意图：修改选中区域 vs 在选中位置添加素材

**5. 与版本管理联动**

每次 AI 编辑操作自动创建新版本（P13），用户不满意可随时回退。

---

### P16 — 深度研究驱动 PPT

**价值**：高，显著提升 AI 生成内容的深度和准确性  
**复杂度**：中  
**LandPPT 参考**：`DEEPResearchService` + `EnhancedResearchService` + Tavily/SearXNG 双引擎

#### 实现方案

**核心概念**：在 PPT 生成之前，先对用户主题进行自动化网络调研，生成结构化研究报告，作为 AI 生成 PPT 的知识基础。

**1. DEEP 研究方法论**

参考 LandPPT 的 `DEEPResearchService` 实现，采用 4 阶段研究流程：

```
用户输入主题 → [Define] 解析主题范围
             → [Explore] 多轮搜索（Tavily + SearXNG）
             → [Evaluate] AI 分析提取关键发现
             → [Present] 生成研究报告
             → 研究报告作为上下文传入大纲生成 prompt
```

**2. 增强研究服务**

LandPPT 的 `EnhancedResearchService` (`services/research/enhanced_research_service.py`, 25KB) 进一步增强了研究能力：
- 深度内容提取（`ContentExtractor`）：从搜索结果 URL 中抓取完整文章内容
- 增强报告生成（`EnhancedReportGenerator`）：多维度分析 + 引用来源
- SearXNG 自托管搜索（`SearXNGProvider`）：开源搜索聚合引擎，支持多搜索引擎并行

**3. MCP 工具设计**

```typescript
interface ResearchForPPT {
  topic: string;                    // 研究主题
  language?: 'zh' | 'en';          // 研究语言
  depth?: 'quick' | 'standard' | 'deep';  // 研究深度
  maxSources?: number;             // 最大来源数
}

interface ResearchReport {
  executiveSummary: string;        // 执行摘要
  keyFindings: string[];           // 关键发现
  recommendations: string[];       // 建议
  sources: string[];               // 来源列表
  totalDuration: number;           // 耗时（秒）
}
```

**4. 与 P0 生成流程的集成**

研究报告通过 `research_section` 参数传入大纲生成 prompt（参考 LandPPT `OutlinePrompts.get_outline_prompt_zh()` 的 `research_section` 参数），AI 基于真实数据生成更有深度的内容。

aitu 实现建议：
- 在生成 PPT 对话流程中增加可选的「先研究再生成」步骤
- 集成 Tavily API 或类似搜索 API（如 Perplexity、Exa）
- 研究报告可缓存复用，避免重复搜索
- UI 中展示研究进度和来源列表，增强用户信任感

---

### P17 — 智能配图系统

**价值**：高，配图质量直接影响 PPT 专业感  
**复杂度**：高  
**LandPPT 参考**：`PPTImageProcessor` + `ImageService`（11 个图像 Provider）+ 三合一配图策略

#### 实现方案

**核心概念**：为每页 PPT 智能匹配或生成配图，采用「本地图库 + 网络搜索 + AI 生成」三合一策略。

**1. 三合一配图策略**

参考 LandPPT 的 `PPTImageProcessor` (`services/ppt_image_processor.py`, 83KB) 和 `ImageService` (`services/image/image_service.py`, 42KB) 的分层架构：

| 图片来源 | Provider | 适用场景 | 成本 |
|---------|----------|---------|------|
| **本地图库** | `FileSystemStorageProvider` | 用户上传、历史素材 | 免费 |
| **网络搜索** | `PixabayProvider`, `UnsplashProvider`, `SearXNGImageProvider` | 通用场景图、风景、人物 | 免费/低 |
| **AI 生成** | `DalleProvider`, `GeminiProvider`, `OpenAIImageProvider`, `SiliconFlowProvider`, `StableDiffusionProvider`, `PollinationsProvider` | 定制化、创意图、抽象概念 | 中高 |

LandPPT 共实现了 **11 个图像 Provider**，通过 `provider_registry` 统一管理。

**2. 配图适配器**

LandPPT 的 `PPTPromptAdapter` (`services/image/adapters/ppt_prompt_adapter.py`, 14KB) 将 PPT 内容转换为图片搜索/生成的 prompt：
- 分析幻灯片标题和内容点
- 生成适合搜索的关键词
- 生成适合 AI 图片模型的描述性 prompt
- 考虑图片用途（背景/配图/图标/数据可视化）

**3. 图片匹配与缓存**

LandPPT 的 `ImageMatcher` (`services/image/matching/image_matcher.py`, 23KB) 实现智能匹配：
- 语义匹配：根据内容语义选择最相关的图片
- 搜索缓存：避免重复搜索相同关键词
- 图片处理：`ImageProcessor` 支持缩放、裁剪、格式转换
- 缓存管理：`ImageCacheManager` (22KB) 管理图片缓存生命周期

**4. 数据模型**

```typescript
// 参考 LandPPT SlideImageInfo 模型
interface SlideImageInfo {
  slideIndex: number;
  imageSource: 'local' | 'network' | 'ai_generated';
  imagePurpose: 'background' | 'illustration' | 'icon' | 'chart';
  originalUrl: string;
  processedUrl: string;
  searchQuery?: string;
  generationPrompt?: string;
}
```

**5. 每页图片限制与开关控制**

LandPPT 通过配置控制：
- `IMAGE_MAX_PER_SLIDE`：每页最大图片数
- 各来源独立开关（`ENABLE_PIXABAY` / `ENABLE_DALLE` / ...）
- 默认 Provider 选择：`DEFAULT_IMAGE_PROVIDER`

aitu 实现建议：
- 在 PPT 生成流程中增加配图阶段（大纲 → 内容 → **配图** → 渲染）
- 优先使用免费搜索 API（Pixabay / Unsplash），AI 生成作为高级选项
- 复用现有 Gemini 图片生成能力
- 图片适配器将幻灯片内容自动转换为搜索/生成 prompt
- 用户可手动替换或重新生成单页配图

---

### P18 — TODO 任务板实时追踪

**价值**：中高，提升长任务（多页 PPT 生成）的用户体验  
**复杂度**：中  
**LandPPT 参考**：`ProgressTracker` + `TodoBoard` + `TodoStage` 模型

#### 实现方案

**核心概念**：PPT 生成是多阶段长任务（研究 → 大纲 → 内容 → 配图 → 渲染），需要可视化的进度追踪面板。

**1. 进度追踪模型**

参考 LandPPT 的 `TodoBoard` + `TodoStage` 数据库模型：

```typescript
interface PPTGenerationBoard {
  projectId: string;
  currentStageIndex: number;
  overallProgress: number;           // 0-100
  stages: PPTGenerationStage[];
}

interface PPTGenerationStage {
  stageId: string;
  stageIndex: number;
  title: string;                     // 如"生成大纲"、"生成第3页内容"
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  progress: number;                  // 0-100
  result?: any;                      // 阶段结果数据
}
```

**2. 生成阶段定义**

| 阶段 | 标题 | 说明 |
|------|------|------|
| 1 | 深度研究 | （可选）网络调研主题 |
| 2 | 生成大纲 | AI 生成结构化大纲 |
| 3 | 选择模板 | 自动/手动选择模板 |
| 4-N | 生成第 X 页 | 逐页生成内容+布局 |
| N+1 | 智能配图 | （可选）为各页匹配图片 |
| N+2 | 质量检查 | AI 检查输出质量 |

**3. 实时进度推送**

参考 LandPPT 的 SSE 进度推送：
- 后端每完成一个阶段/子阶段，推送进度更新
- 前端实时更新进度面板
- 支持单页粒度的完成/失败/跳过状态

**4. UI 集成**

参考 LandPPT 的 `todo_board.html` (276KB)：
- 左侧阶段列表（带状态图标和进度条）
- 右侧当前阶段详情
- 底部总体进度条
- 失败阶段支持重试
- 集成在 Chat Drawer 侧边栏或独立面板中

aitu 实现建议：
- 复用现有 WorkZone 进度展示机制
- 在 Chat Drawer 中嵌入进度面板
- 生成完成后进度面板自动转为结果预览

---

### P19 — AI 聊天编辑（视觉参考）

**价值**：高，提供基于视觉的智能编辑体验  
**复杂度**：高  
**LandPPT 参考**：`project_slides_editor.html` (657KB) 在线编辑器 + 视觉参考聊天

#### 实现方案

**核心概念**：用户可以在查看 PPT 页面的同时，通过 AI 聊天界面描述修改需求，AI 理解当前页面视觉内容后执行精确编辑。

**1. 视觉参考编辑**

LandPPT 的 AI 聊天编辑支持**视觉参考**——AI 不仅理解文本内容，还能"看到"当前幻灯片的渲染效果：
- 将当前页面截图作为多模态消息附加给 AI
- AI 基于视觉+文本双重理解，精确定位和修改元素
- 支持 `AIMessage` 中的 `ImageContent` 多模态消息

**2. 场景化编辑**

LandPPT 的 `AIService` 根据 PPT 关键词自动判断用户意图并注入专业系统提示词：
```python
ppt_keywords = [
    "PPT", "幻灯片", "演示文稿", "slide", "presentation",
    "ppt", "修改", "调整", "优化", "美化", "设计", "布局"
]
```

当检测到 PPT 编辑意图时，自动切换为 PPT 编辑专家角色。

**3. 编辑能力层次**

| 编辑维度 | 示例 | LandPPT 实现 |
|---------|------|-------------|
| 文字内容 | "修改标题为..." | 直接编辑 HTML 文本内容 |
| 视觉样式 | "改为蓝色主题" | 修改 CSS 变量 / 模板配色 |
| 布局调整 | "改为两栏布局" | 重新生成 HTML 模板 |
| 图表更新 | "更新图表数据" | 修改 Chart.js 数据 |
| 整页重做 | "重新生成这一页" | 重新调用内容+模板生成 |

aitu 实现建议：
- 复用现有 Chat Drawer 作为编辑聊天入口
- 利用 Gemini 多模态能力，将当前 Frame 截图附加到聊天消息
- AI 返回结构化编辑指令（而非直接返回 HTML），由前端执行
- 与 P15 AI 自然语言编辑融合，统一编辑入口

---

### P20 — 项目管理与协作

**价值**：中，提升多 PPT 项目的管理效率  
**复杂度**：中  
**LandPPT 参考**：`Project` 模型 + `ProjectManager` + 项目分享功能

#### 实现方案

**核心概念**：建立 PPT 项目管理体系，支持项目列表、状态追踪、版本历史、分享协作。

**1. 项目数据模型**

参考 LandPPT 的 `Project` 模型 (`database/models.py`)：

```typescript
interface PPTProject {
  id: string;
  projectId: string;              // UUID
  title: string;
  scenario?: string;              // 场景类型
  topic: string;                  // 主题
  requirements?: string;          // 需求描述
  status: 'draft' | 'generating' | 'completed' | 'failed';
  outline?: PPTOutline;           // 大纲 JSON
  confirmedRequirements?: object; // 确认的需求配置
  metadata?: object;              // 项目元数据
  version: number;                // 版本号
  shareToken?: string;            // 分享令牌
  shareEnabled: boolean;          // 是否启用分享
  createdAt: string;
  updatedAt: string;
}
```

**2. 项目版本管理**

参考 LandPPT 的 `ProjectVersion` 模型：
- 每次重大操作（生成/重新生成/模板切换）自动保存项目版本
- 版本包含完整数据快照 + 版本描述
- 支持回退到任意历史版本

**3. 项目分享**

LandPPT 支持通过 `share_token` 分享项目：
- 生成唯一分享链接
- 访问者可查看 PPT（只读模式）
- 可选择是否启用分享

**4. 项目列表与仪表板**

参考 LandPPT 的 `projects_list.html` + `project_dashboard.html`：
- 项目卡片列表（含封面缩略图 + 状态 + 创建时间）
- 项目仪表板（统计信息 + 最近编辑 + 快捷操作）
- 支持搜索和筛选

aitu 实现建议：
- 将现有画布文档扩展为「PPT 项目」概念
- 每个 PPT 项目关联一组 Frame + 大纲 + 模板配置
- 支持项目导出/导入（JSON 格式）
- 分享功能可复用现有协作基础设施

---

### P21 — PPT 视频导出与 AI 图片直出

**价值**：中高，为 PPT 提供视频化传播和极致视觉质量的新通道  
**复杂度**：中高  
**NanoBanana 参考**：`generate_ppt.py` + `generate_ppt_video.py` + `video_composer.py` + `kling_api.py`

#### 实现方案

**核心概念**：在传统可编辑 PPT 之外，提供两种增值输出模式——AI 图片直出（每页为高品质图片）和 PPT 视频导出（含 AI 转场动画的完整演示视频）。

**1. AI 图片直出模式**

参考 NanoBanana 的 `generate_ppt.py` (452 行) 实现，利用 Gemini 图片生成模型直接生成每页 PPT 的完整图片：

```typescript
interface PPTImageGenerationOptions {
  topic: string;                           // 主题
  pages: PPTPagePlan[];                    // 每页内容规划
  style: 'gradient-glass' | 'vector-illustration' | string;  // 视觉风格
  resolution: '2K' | '4K';                // 输出分辨率
  model?: string;                          // 图片模型（默认 Gemini）
}

interface PPTPagePlan {
  pageNumber: number;
  pageType: 'cover' | 'content' | 'data';  // 页面类型
  title: string;
  contentPoints: string[];
}

interface PPTImageResult {
  pages: { pageNumber: number; imageUrl: string; prompt: string }[];
  viewerHtml: string;                      // HTML 播放器
}
```

**Prompt 构建流程**：
1. 加载风格模板（Markdown 文件定义的基础提示词 + 页面类型模板）
2. 拼合最终 prompt：`基础风格 + 页面类型模板 + 实际内容 + 分辨率指令`
3. 调用图片生成模型（16:9 宽高比）

**2. PPT 视频导出**

参考 NanoBanana 的视频生成流水线（`generate_ppt_video.py`, 462 行），实现 PPT → 视频的完整转换：

```
PPT 页面截图 → 页间转场视频生成 → FFmpeg 合成完整视频
```

**视频合成模块** (`video_composer.py`, 493 行)：

| 功能 | 实现 | 参数 |
|------|------|------|
| 静态页面视频 | 图片 → 指定时长的视频片段 | H.264, CRF 23, 24fps |
| 视频拼接（快速） | FFmpeg concat demuxer | 无重编码 |
| 视频拼接（标准化） | FFmpeg filter_complex | 统一分辨率/帧率/宽高比 |
| 完整合成 | 预览 + (静态页 + 转场) × N | 可选是否包含预览和转场 |

**视频素材管理** (`video_materials.py`, 459 行)：
- `generate_preview_video()`：首页循环预览视频（首尾帧相同）
- `generate_transition_videos()`：页间转场视频（并发生成，`max_concurrent=3`）
- 支持 `ThreadPoolExecutor` 并发执行多个视频生成任务

**3. 交互式 HTML 播放器**

NanoBanana 提供两种 HTML 播放器模板：

**图片播放器** (`templates/viewer.html`, 337 行)：
- 全屏黑色背景，`object-fit: contain`
- 键盘导航：方向键/Home/End/空格自动播放/ESC 全屏/H 隐藏控件
- 触摸滑动支持（移动设备）
- 鼠标移动自动显示/隐藏控件（3 秒超时）

**视频播放器** (`templates/video_viewer.html`, 438 行)：
- `VideoPPTPlayer` 类，视频+图片混合播放
- 状态管理：`isPreviewMode` → `isTransitioning` → 静态页面
- 播放逻辑：首页播放预览视频（循环）→ 右键播放转场视频 → 视频结束显示目标页
- 加载动画 + 错误处理

aitu 实现建议：
- **图片直出模式**：作为 P0 AI 生成 PPT 的「极致视觉」选项，复用现有 Gemini 图片生成能力
- **视频导出**：作为 P7（PDF 导出）的扩展，新增「导出为视频」选项
- AI 视频转场可作为高级付费功能（API 成本较高）
- 简单模式：无转场，直接拼合每页静态视频（FFmpeg 即可实现，无需视频 API）
- 高级模式：AI 视频转场（可灵 AI / Veo / Sora 等图生视频 API）
- HTML 播放器可嵌入分享链接，实现在线演示

---

## 实施路线图

```
Phase 1 (P0 + P1)              → AI 生成 PPT + PPTX 导出              = 完整的 PPT 创作闭环
Phase 2 (P2 + P3 + P10)        → 模板系统 + 图表/表格 + JSON 格式     = 提升生成质量
Phase 3 (P4 + P5 + P9)         → 切换/元素动画 + 演讲稿生成 + 封面    = 专业演示体验
Phase 4 (P6 + P7 + P8 + P11)   → 导入 + PDF + 形状库 + 多语言        = 完善生态
Phase 5 (P12 + P13)            → AI 精炼交互 + 版本管理               = 智能迭代体验
Phase 6 (P14 + P15)            → 素材系统 + AI 自然语言编辑           = 高级 AI 编辑
Phase 7 (P16 + P17 + P18)      → 深度研究 + 智能配图 + 任务追踪       = 智能生成增强
Phase 8 (P19 + P20)            → AI 聊天编辑 + 项目管理               = 完整产品体验
Phase 9 (P21)                  → PPT 视频导出 + AI 图片直出           = 视频化传播
```

> 注：
> - P12/P13 建议在 Phase 1 完成后尽早启动，因为精炼交互和版本管理能显著提升 P0 的用户体验。可与 Phase 2 并行开发。
> - P16（深度研究）和 P17（智能配图）可在 Phase 1 完成后作为 P0 的增强模块独立开发，与 Phase 2 并行。
> - P18（任务追踪）建议与 P0 同期开发，提升长任务的用户体验。
> - P21（PPT 视频导出）中的图片直出模式可与 Phase 1 并行开发（仅需 Gemini 图片生成能力），视频转场部分可延后。

## 技术依赖

| 新增依赖 | 用途 | 包大小 |
|---------|------|--------|
| `pptxgenjs` | PPTX 导出 (P1) | ~300KB |
| `pako` | gzip 压缩传输 (P10) | ~45KB |
| `jspdf` | PDF 导出 (P7) | ~300KB |
| `html2canvas` | Frame 截图 (P7/P9/P19) | ~40KB |

> 注：P0-P20 中大部分能力不需要额外第三方依赖。P5 演讲稿生成、P12 精炼交互、P13 版本管理、P14 素材系统、P15-P20 均依赖现有 AI API 能力实现。

**banana-slides 相关技术参考**：

| 技术/服务 | banana-slides 用途 | aitu 参考价值 |
|---------|-------------------|-------------|
| MinerU API | 文档解析（PDF/DOCX/PPTX → Markdown） | P0 参考文件解析、P6 导入辅助 |
| MarkItDown | Excel/CSV 转 Markdown | P0 表格文件输入 |
| Inpainting (火山引擎/Gemini/百度) | 删除元素后背景修复 | P1 可编辑导出、元素删除后背景补全 |
| ThreadPoolExecutor | 异步任务管理 | P0 批量生成、P14 素材生成 |

**LandPPT 相关技术参考**：

| 技术/服务 | LandPPT 用途 | aitu 参考价值 |
|---------|-------------|-------------|
| Tavily API | 深度研究搜索引擎 | P16 深度研究驱动 PPT |
| SearXNG | 自托管搜索聚合引擎 | P16 备选搜索引擎 |
| Playwright | 无头浏览器 HTML→PDF/PPTX 导出 | P1 高保真导出备选方案 |
| Apryse SDK | 专业级 PDF→PPTX 转换 | P6 PPT 导入辅助 |
| LangGraph / LangChain | 文档分析工作流编排 | P0 文档处理工作流 |
| Pixabay / Unsplash API | 免费图片搜索 | P17 智能配图（网络搜索） |
| DALL-E / Stable Diffusion / SiliconFlow | AI 图片生成 | P17 智能配图（AI 生成） |
| Chart.js | HTML 幻灯片中图表渲染 | P3 图表元素渲染 |
| Tailwind CSS | HTML 模板样式系统 | P2 模板渲染 |

**NanoBanana-PPT-Skills 相关技术参考**：

| 技术/服务 | NanoBanana 用途 | aitu 参考价值 |
|---------|---------------|-------------|
| Gemini 3 Pro (`gemini-3-pro-image-preview`) | AI 图片直出 PPT（每页完整图片） | P0 AI 图片直出模式、P21 图片直出 |
| 可灵 AI API (`kling-v2-6`) | 图生视频（首尾帧 → 转场视频） | P4 AI 视频转场、P21 视频导出 |
| Claude API (`claude-sonnet-4-5-20250929`) | 智能分析图片差异生成转场提示词 | P4 AI 视频转场提示词自动生成 |
| FFmpeg | 静态图 → 视频 + 多视频拼接合成 | P21 PPT 视频导出 |
| JWT (HS256) | 可灵 AI API 认证 | P21 视频 API 集成 |
| Markdown 风格模板 | 定义 AI 图片生成的视觉风格 | P2 风格模板体系补充 |
| HTML5 播放器 | 图片/视频交互式播放 | P21 在线演示播放器 |

---

## 附录：ai-to-pptx 项目能力对照表

> 以下汇总了从 [ai-to-pptx](https://github.com/SmartSchoolAI/ai-to-pptx) 项目中识别的所有可借鉴能力及其在本文档中的对应位置。

| ai-to-pptx 能力 | 源文件 | aitu 对应规划 | 状态 |
|-----------------|--------|-------------|------|
| 五步向导式生成流程 | `AiPPTX.tsx` | P0 — AI 一键生成 PPT | 已覆盖 |
| SSE 流式大纲生成 | `sse.ts` | P0 — 流式生成体验 | 已覆盖 |
| 三层大纲编辑 | `OutlineEdit.tsx` | P0 — 大纲编辑器 UI | 已覆盖 |
| 多种输入源（文本/文件/URL/大纲） | `StepOneInputData.tsx` | P0 — **借鉴补充** | 新增 |
| 生成选项（篇幅/语言/要求） | `StepOneInputData.tsx` | P0 — **借鉴补充** | 新增 |
| 异步生成 + 进度追踪 | `StepFiveGeneratePpt.tsx` | P0 — **借鉴补充** | 新增 |
| gzip 压缩传输 | pako + base64 | P10 — **新增** | 新增 |
| PPTX 下载导出 | `downloadPptx.php` | P1 — PPT 导出 | 已覆盖 |
| 模板选择系统 | `SelectTemplate.tsx` | P2 — 模板系统 | 已覆盖 |
| 主题色提取 | `calcSubjectColor()` | P2 — 主题色提取 | 已覆盖 |
| 模板制作规范（页面类型/元素数量） | `README_Make_Template.md` | P2 — **借鉴补充** | 新增 |
| 6 种内容页网格布局 | `README_Make_Template.md` | P2 — **借鉴补充** | 新增 |
| 更换模板保留内容 | `changePptxTemplate` | P2 — **借鉴补充** | 新增 |
| 图表渲染（柱/饼/线/环） | `chart.js` | P3 — 图表元素 | 已覆盖 |
| 表格元素 | `element.js createTable()` | P3 — **借鉴补充** | 新增 |
| 图表数据格式（类 Excel 二维数组） | `element.js createChart()` | P3 — **借鉴补充** | 新增 |
| 16 种页面切场动画 | `animation.js transitionList` | P4 — **借鉴补充** | 新增 |
| 元素级动画（入场/退场/强调/路径 226 个预设） | `animation.js animationList` | P4 — **借鉴补充** | 新增 |
| 100+ 标准几何形状 | `geometry.js` | P8 — 形状库扩充 | 已覆盖 |
| 封面缩略图自动生成 | `cover.js` | P9 — **新增** | 新增 |
| PPT JSON 中间格式 | `element.js` 元素工厂 | P10 — **新增** | 新增 |
| 国际化/多语言生成 | `i18n.ts` + 语言选择 | P11 — **新增** | 新增 |
| SVG + Canvas 双引擎渲染 | `ppt2svg.js` + `ppt2canvas.js` | — | aitu 已有 Plait 渲染引擎 |
| SVG 编辑模式（选中/拖拽/文字编辑） | `ppt2svg.js` edit mode | — | aitu 已有 Plait 编辑能力 |
| AI 模型配置（DeepSeek/OpenAI） | `Setting.tsx` | — | aitu 已有 Gemini API 配置 |

---

## 附录：banana-slides 项目能力对照表

> 以下汇总了从 [banana-slides](https://github.com/snakeying/banana-slides)（蕉幻）项目中识别的所有可借鉴能力及其在本文档中的对应位置。

| banana-slides 能力 | 源文件 | aitu 对应规划 | 状态 |
|-------------------|--------|-------------|------|
| 三种创建模式（idea/outline/description） | `models/project.py` `creation_type` | P0 — **借鉴补充** | 新增 |
| AI 精炼交互（自然语言修改大纲/描述） | `AiRefineInput.tsx` + `prompts.py` `get_*_refinement_prompt()` | P0 — **借鉴补充** + P12 — **新增** | 新增 |
| 参考文件智能解析（MinerU + MarkItDown） | `file_parser_service.py` | P0 — **借鉴补充** | 新增 |
| 17 种分级 Prompt 设计 | `prompts.py` (930 行) | P0 — **借鉴补充** | 新增 |
| 项目级额外要求（extra_requirements） | `models/project.py` | P0 — **借鉴补充** | 新增 |
| 多 AI Provider 工厂模式（Gemini/OpenAI/Vertex） | `ai_service.py` + `ai_providers/` | P0 — **借鉴补充** | 新增 |
| 三种导出格式（图片PPTX/PDF/可编辑PPTX） | `export_service.py` | P1 — **借鉴补充** | 新增 |
| 可编辑 PPTX 逆向导出（版面分析 + Inpainting） | `image_editability/service.py` + `inpainting_service.py` | P1 — **借鉴补充** | 新增 |
| 8 种预设 AI 风格描述 | `presetStyles.ts` + `Home.tsx` | P2 — **借鉴补充** | 新增 |
| 自定义模板图片 + 纯文字风格描述 | `models/project.py` `template_image_path` / `template_style` | P2 — **借鉴补充** | 新增 |
| AI 精炼交互系统（多轮对话 + 历史上下文） | `AiRefineInput.tsx` + `get_outline_refinement_prompt()` | P12 — **新增** | 新增 |
| 内容版本管理与回退 | `page_image_version.py` `PageImageVersion` | P13 — **新增** | 新增 |
| 素材系统（项目级/全局 + AI 生成） | `material.py` + `MaterialCenterModal.tsx` + `MaterialSelector.tsx` | P14 — **新增** | 新增 |
| AI 自然语言图片编辑 | `prompts.py` `get_image_edit_prompt()` + `ai_service.py` `edit_image()` | P15 — **新增** | 新增 |
| 异步任务管理（ThreadPoolExecutor + 进度追踪） | `task_manager.py` | P0 — 借鉴补充（异步生成） | 参考 |
| 文本属性提取（字体/颜色/大小） | `prompts.py` `get_text_attribute_extraction_prompt()` | P1 — 借鉴补充（可编辑导出） | 参考 |
| Inpainting 背景修复（火山引擎/Gemini/百度） | `inpainting_service.py` | P1 — 借鉴补充 | 参考 |
| 导出错误处理（ExportError + ExportWarnings） | `export_service.py` | P1 — 借鉴补充 | 参考 |
| 图片 caption 自动生成 | `file_parser_service.py` `_enhance_image_descriptions()` | P0 — 借鉴补充（参考文件解析） | 参考 |
| 语言配置（zh/en/ja/auto） | `prompts.py` `LANGUAGE_CONFIG` | P11 — 多语言 | 已覆盖（扩展） |
| 推理模式控制（thinking budget） | `ai_providers/__init__.py` | — | aitu 已有 Gemini API 配置 |
| React 18 + Zustand + Tailwind 前端架构 | `frontend/` | — | aitu 已有 Angular + Plait 架构 |
| Flask + SQLite 后端架构 | `backend/` | — | aitu 已有 Hono 后端架构 |

---

## 附录：LandPPT 项目能力对照表

> 以下汇总了从 [LandPPT](https://github.com/sligter/LandPPT) 项目中识别的所有可借鉴能力及其在本文档中的对应位置。

| LandPPT 能力 | 源文件 | aitu 对应规划 | 状态 |
|-------------|--------|-------------|------|
| DEEP 研究方法论（Define/Explore/Evaluate/Present） | `deep_research_service.py` + `enhanced_research_service.py` | P0 — **借鉴补充** + P16 — **新增** | 新增 |
| 角色级 AI Provider 配置（6 种角色独立模型） | `enhanced_ppt_service.py` `_get_role_provider(role)` | P0 — **借鉴补充** | 新增 |
| 7 种场景模板（tourism/education/analysis 等） | `ai_service.py` `scenario_templates` | P0 — **借鉴补充** | 新增 |
| 6 类模块化 Prompt 管理架构（PPTPromptsManager） | `services/prompts/` 6 个模块 | P0 — **借鉴补充** | 新增 |
| summeryanyfile 文档处理模块（32 种格式 + 6 种分块策略） | `summeryanyfile/` 独立模块 | P0 — **借鉴补充** | 新增 |
| 进度追踪系统（ProgressTracker 线程安全） | `progress_tracker.py` | P0 — **借鉴补充** + P18 — **新增** | 新增 |
| 5 种导出格式（PPTX/PDF/HTML/DOCX/Markdown） | `pyppeteer_pdf_converter.py` + `pdf_to_pptx_converter.py` | P1 — **借鉴补充** | 新增 |
| Playwright + Apryse 双引擎导出 | `pyppeteer_pdf_converter.py` (99.9KB) + `pdf_to_pptx_converter.py` | P1 — **借鉴补充** | 新增 |
| AI 自动生成母版模板（设计基因提取） | `global_master_template_service.py` (47KB) | P2 — **借鉴补充** | 新增 |
| 25 种预设模板 JSON 系统 | `template_examples/` 25 个 JSON | P2 — **借鉴补充** | 新增 |
| 设计基因提取与创意变化 Prompt 体系 | `design_prompts.py` (581 行) | P2 — **借鉴补充** | 新增 |
| 16+ 种图表类型（含甘特图/森林图/韦恩图等） | `outline_prompts.py` `chart_config` | P3 — **借鉴补充** | 新增 |
| 大纲阶段图表预配置 | `outline_prompts.py` slides[].chart_config | P3 — **借鉴补充** | 新增 |
| 完整演讲稿生成系统（7 语气 × 7 受众 × 3 复杂度） | `speech_script_service.py` (793 行) | P5 — **借鉴补充** | 新增 |
| 演讲稿 Prompt 设计（开场白/正文/结束语） | `speech_script_prompts.py` | P5 — **借鉴补充** | 新增 |
| 深度研究驱动 PPT（Tavily + SearXNG 双引擎） | `deep_research_service.py` + `research/` | P16 — **新增** | 新增 |
| 智能配图三合一（本地+网络+AI 生成） | `ppt_image_processor.py` (83KB) + `image/` (11 个 Provider) | P17 — **新增** | 新增 |
| TODO 任务板实时追踪 | `todo_board.html` (276KB) + `TodoBoard`/`TodoStage` 模型 | P18 — **新增** | 新增 |
| AI 聊天编辑（视觉参考） | `project_slides_editor.html` (657KB) + `ai_service.py` | P19 — **新增** | 新增 |
| 项目管理与版本历史 | `Project` + `ProjectVersion` 模型 + `project_manager.py` | P20 — **新增** | 新增 |
| 项目分享功能（share_token） | `share_service.py` + `Project.share_token` | P20 — **新增** | 新增 |
| 4 Provider AI 抽象层（OpenAI/Anthropic/Google/Ollama） | `ai/providers.py` (1094 行) | P0 — 借鉴补充（多 Provider） | 参考 |
| 多模态消息支持（文本+图片） | `ai/base.py` `AIMessage` + `ImageContent` | P19 — AI 聊天编辑 | 参考 |
| Think 标签过滤（推理模型兼容） | `providers.py` `_filter_think_content()` | — | 参考 |
| 修复/验证 Prompt 体系（6 种修复） | `repair_prompts.py` | P0 — 借鉴补充（质量保证） | 参考 |
| 文件处理（FileProcessor 7 种场景检测） | `file_processor.py` | P0 — 借鉴补充（文件输入） | 参考 |
| OpenAI 兼容 API（兼容 DeepSeek/Kimi/MiniMax/302.AI） | `api/openai_compat.py` | — | aitu 已有 Gemini API 配置 |
| 用户认证系统（JWT + SHA256） | `auth/` | — | aitu 已有认证体系 |
| FastAPI + SQLAlchemy + SQLite 后端架构 | `src/landppt/` | — | aitu 已有 Hono 后端架构 |
| Jinja2 + 原生 JS 前端架构 | `web/templates/` + `web/static/` | — | aitu 已有 Angular + Plait 架构 |

---

## 附录：NanoBanana-PPT-Skills 项目能力对照表

> 以下汇总了从 [NanoBanana-PPT-Skills](https://github.com/op7418/NanoBanana-PPT-Skills) 项目中识别的所有可借鉴能力及其在本文档中的对应位置。
> 
> 项目特点：与其他项目（ai-to-pptx / banana-slides / LandPPT）生成可编辑元素不同，NanoBanana 采用 **AI 图片直接生成整页 PPT** 的范式，并首创了 **AI 视频转场** 能力。

| NanoBanana 能力 | 源文件 | aitu 对应规划 | 状态 |
|----------------|--------|-------------|------|
| AI 图片直出 PPT（Gemini 3 Pro 全页图片生成） | `generate_ppt.py` (452 行) | P0 — **借鉴补充** + P21 — **新增** | 新增 |
| Markdown 风格模板系统（页面类型分模板） | `styles/gradient-glass.md` + `styles/vector-illustration.md` | P0 — **借鉴补充** | 新增 |
| 6 阶段 Claude Code Skill 工作流 | `SKILL.md` (675 行) | P0 — **借鉴补充** | 新增 |
| 页数自适应内容规划策略（5/10/15/25 页模板） | `SKILL.md` 内容规划策略 | P0 — **借鉴补充** | 新增 |
| AI 视频转场（可灵 AI 图生视频） | `kling_api.py` (431 行) + `video_materials.py` (459 行) | P4 — **借鉴补充** + P21 — **新增** | 新增 |
| 智能转场提示词生成（Claude 分析图片差异） | `transition_prompt_generator.py` (314 行) | P4 — **借鉴补充** | 新增 |
| 转场提示词模板框架（A/B 类策略） | `prompts/transition_template.md` (42 行) | P4 — **借鉴补充** | 新增 |
| 预设通用转场描述（无需 API） | `simple_transition_prompt_generator.py` (106 行) | P4 — **借鉴补充** | 新增 |
| FFmpeg 视频合成（静态页+转场拼接） | `video_composer.py` (493 行) | P21 — **新增** | 新增 |
| PPT 视频完整导出流水线 | `generate_ppt_video.py` (462 行) | P21 — **新增** | 新增 |
| 交互式图片播放器（HTML5 + 键盘/触摸） | `templates/viewer.html` (337 行) | P21 — **新增** | 新增 |
| 交互式视频播放器（视频+图片混合播放） | `templates/video_viewer.html` (438 行) | P21 — **新增** | 新增 |
| 视频素材并发管理（ThreadPoolExecutor） | `video_materials.py` `generate_all_materials()` | P21 — 新增（并发生成） | 参考 |
| 渐变毛玻璃卡片风格 | `styles/gradient-glass.md` (91 行) | P2 — 模板系统（风格参考） | 参考 |
| 矢量插画风格 | `styles/vector-illustration.md` (132 行) | P2 — 模板系统（风格参考） | 参考 |
| Prompt 文件读取器 | `prompt_file_reader.py` (118 行) | — | 参考 |
| 可灵 AI JWT 认证封装 | `kling_api.py` `KlingVideoGenerator` | — | 参考 |
| Claude Code Skill 安装脚本 | `install_as_skill.sh` (203 行) | — | aitu 已有 MCP 工具体系 |
| Python 3.8+ CLI 工具架构 | `generate_ppt.py` + `generate_ppt_video.py` | — | aitu 已有 Node.js 后端架构 |
