# PPT 项目提示词汇总

本文档整理了当前目录下所有项目中涉及 PPT 生成的提示词内容。

## 目录

- [一、LandPPT - 文档分析与大纲生成提示词](#一landppt---文档分析与大纲生成提示词)
- [二、LandPPT - 系统提示词](#二landppt---系统提示词)
- [三、LandPPT - 设计提示词](#三landppt---设计提示词)
- [四、LandPPT - 内容生成提示词](#四landppt---内容生成提示词)
- [五、LandPPT - 大纲生成提示词](#五landppt---大纲生成提示词)
- [六、LandPPT - 演讲稿生成提示词](#六landppt---演讲稿生成提示词)
- [七、LandPPT - 修复与验证提示词](#七landppt---修复与验证提示词)
- [八、Banana-Slides - PPT生成提示词](#八banana-slides---ppt生成提示词)
- [九、NanoBanana-PPT-Skills - 过渡动画提示词](#九nanobanana-ppt-skills---过渡动画提示词)
- [十、ppt-master - 图片生成提示词](#十ppt-master---图片生成提示词)
- [十一、ppt-master - 工作流提示词](#十一ppt-master---工作流提示词)

---

## 一、LandPPT - 文档分析与大纲生成提示词

> 源文件：`LandPPT/src/summeryanyfile/config/prompts.py`

### 1.1 文档结构分析提示 (`get_structure_analysis_prompt`)

```
## 任务目标
基于提供的文档内容，执行结构化信息提取，生成标准化的文档元数据。

## 输入参数
**项目基本信息：**
- 项目主题：{project_topic}
- 应用场景：{project_scenario}
- 具体要求：{project_requirements}

**目标受众信息：**
- 受众类型：{target_audience}
- 自定义受众：{custom_audience}

**风格要求：**
- PPT风格：{ppt_style}
- 自定义风格提示：{custom_style_prompt}

## 输入文档
{content}

## 核心约束条件
1. **源材料依赖原则**：所有提取信息必须基于上述文档内容，可以理解和转化表达，但不得添加文档外信息
2. **理解转化原则**：允许对源材料内容进行理解、归纳和专业化表达，但必须忠实于原意
3. **数据准确原则**：定量数据（数字、百分比、统计值等）必须保持绝对准确，不得修改或估算

## 提取字段规范
请按以下规范提取信息并输出JSON格式：

### 必需字段
- **title** (string|null): 文档标题，仅当原文明确包含标题时提取，否则设为null
- **type** (string): 文档类型，基于内容特征判断（学术论文/技术报告/商业文档/教程/其他）
- **sections** (array): 章节标题列表，仅提取原文中明确的章节标题，无章节时设为空数组
- **key_concepts** (array): 关键概念列表，仅提取原文中明确提及的专业术语和核心概念
- **language** (string): 文档原始语言标识
- **complexity** (string): 内容复杂度评级（简单/中等/复杂），基于实际内容难度
- **key_data** (array): 关键数据集合，仅提取原文中的具体数值、百分比、统计指标
- **main_conclusions** (array): 主要结论集合，仅提取原文中明确表述的结论性陈述

## 提取执行标准
- **数据完整性**：key_data必须为原文中实际出现的精确数值，保持绝对准确
- **结论理解性**：main_conclusions基于原文结论进行理解和专业化表达，保持核心观点一致
- **结构优化性**：sections可以对原文章节进行合理整理和专业化表述，保持逻辑结构
- **概念专业性**：key_concepts基于原文术语，可使用更专业和标准的表述方式

## 质量控制检查点
输出前请执行以下验证：
1. 每项提取信息是否基于原文内容并忠实于原意？
2. 定量数据是否保持绝对准确？
3. JSON格式是否符合规范要求？
4. 数据类型是否与字段规范一致？
```

### 1.2 初始PPT框架生成提示 (`get_initial_outline_prompt`)

```
## 任务目标
基于文档结构和内容，结合项目具体要求和目标受众，生成PPT演示文稿的初始框架大纲。

## 输入参数
**项目基本信息：**
- 项目主题：{project_topic}
- 应用场景：{project_scenario}
- 具体要求：{project_requirements}

**目标受众信息：**
- 受众类型：{target_audience}
- 自定义受众：{custom_audience}

**风格要求：**
- PPT风格：{ppt_style}
- 自定义风格提示：{custom_style_prompt}

**文档结构元数据：** {structure}
**源文档内容：** {content}
**页数约束：** {slides_range}
**目标语言：** {target_language}

## 核心约束条件
### 1. 源材料理解原则
- 大纲内容必须基于上述文档结构和内容，通过理解和转化形成专业表达
- 允许对源材料进行合理的理解、归纳、重组和专业化表述
- 每个内容要点应忠实反映源材料的核心观点和信息
- 可以进行逻辑整理和结构优化，但不得偏离原意

### 2. 内容转化标准
- 数值数据：必须使用源材料中的原始数据，保持绝对精确性
- 结论观点：基于源材料内容进行理解和专业化表达，保持核心观点一致
- 术语概念：可以使用更专业、标准的术语表述，提升内容的专业性
- 表达优化：鼓励使用更清晰、专业的语言重新组织和表达源材料内容
- **图片链接严格规则**：
  * 仅当源材料中实际包含图片链接时，才可在content_points中保留
  * 图片URL必须与源材料中的URL完全一致，不得修改或编造
  * 禁止添加源材料中不存在的图片链接
  * 图片链接格式必须保持Markdown格式：![图片描述](图片URL)

### 3. 语言表达规范
- **书面化要求**：使用正式、规范的书面语言，避免口语化表达
- **专业化标准**：采用学术或商务场合的专业术语和表达方式
- **目标语言**：所有输出内容必须严格使用目标语言：{target_language}

### 4. 结构组织原则
- **智能重组**：基于对源材料的理解，进行合理的层次化重组和逻辑优化
- **结构创新**：可以创造性地调整内容组织结构，使其更适合PPT展示和受众理解
- **逻辑提升**：通过重新组织提升内容的逻辑性和表达效果
- **内容完整**：确保重组后涵盖源材料的所有重要信息和观点

### 5. 数据可视化原则
- 图表配置：当源材料包含数值数据时，可以添加合适的chart_config提升展示效果
- 数据准确：图表数据必须完全来自源材料，保持绝对准确性
- 支持类型：包括但不限于柱状图(bar)、折线图(line)、饼图(pie)、环形图(doughnut)、雷达图(radar)等

## 页数控制标准（最高优先级）
- 【强制要求】严格遵守页数约束：{slides_range}
- 【强制要求】页数约束是不可违反的硬性要求，必须优先满足

## 结构组织框架
- **标题页**：结合项目主题和文档内容，使用适合目标受众的标题表述
- **目录页**：可对文档章节进行逻辑化重组，形成清晰的层次结构
- **内容页**：基于文档内容，采用适合目标受众的专业化语言表达和逻辑组织
- **结论页**：基于文档结论和项目要求，使用书面化的总结表述
```

### 1.3 内容细化提示 (`get_refine_outline_prompt`)

```
## 任务目标
基于现有PPT大纲和新增文档内容，结合项目要求和目标受众，执行大纲细化和扩展操作。

## 输入参数
**项目基本信息：**
- 项目主题：{project_topic}
- 应用场景：{project_scenario}
- 具体要求：{project_requirements}

**目标受众信息：**
- 受众类型：{target_audience}
- 自定义受众：{custom_audience}

**风格要求：**
- PPT风格：{ppt_style}
- 自定义风格提示：{custom_style_prompt}

**现有PPT结构：** {existing_outline}
**新增文档内容：** {new_content}
**累积上下文信息：** {context}
**页数约束：** {slides_range}
**目标语言：** {target_language}

## 核心约束条件
### 1. 源材料理解原则
- 所有细化和扩展内容必须基于新增内容和累积上下文的深度理解
- 允许对源材料进行合理的分析、归纳和专业化表述
- 每个新增或修改的content_points应忠实反映源材料的核心观点
- 鼓励通过理解和转化提升内容的专业性和表达效果

### 2. 内容转化标准
- **数据完整性**：所有新增数值、百分比必须保持源材料中的绝对准确性
- **观点提升性**：基于源材料内容进行理解和专业化表达，提升观点的清晰度
- **现有内容优化**：在保持准确性的基础上，优化现有内容的表达和组织
- **智能分析**：允许基于源材料进行合理的分析和洞察，提升内容深度

### 3. 语言表达规范
- **书面化要求**：所有新增和修改内容必须使用正式的书面语言
- **专业化标准**：采用专业领域的标准表述方式和术语
- **目标语言**：所有输出内容必须严格使用目标语言：{target_language}
- **风格一致性**：保持新旧内容在专业化语言风格上的一致性

## 细化任务执行标准
### 1. 内容理解分析
- 深入分析新增内容的核心观点、逻辑结构和关键信息
- 基于理解提取最有价值的信息点和洞察

### 2. 内容智能更新
- 基于对新增内容的理解，智能更新和优化现有幻灯片
- 通过专业化表述提升内容的清晰度和说服力

### 3. 幻灯片扩展优化
- 当新增内容具有独立价值时，创建新的幻灯片展示
- 确保扩展后的结构更加完整和有逻辑

### 4. 逻辑连贯性提升
- 基于对内容的理解，优化整体逻辑结构
- 加强新旧内容之间的逻辑关联和过渡
```

### 1.4 错误恢复提示 (`get_error_recovery_prompt`)

```
## 任务目标
执行错误恢复操作，基于文档内容摘要，结合项目要求和目标受众，生成基础PPT大纲。

## 输入参数
**项目基本信息：**
- 项目主题：{project_topic}
- 应用场景：{project_scenario}
- 具体要求：{project_requirements}

**目标受众信息：**
- 受众类型：{target_audience}
- 自定义受众：{custom_audience}

**风格要求：**
- PPT风格：{ppt_style}
- 自定义风格提示：{custom_style_prompt}

**文档内容摘要：** {content_summary}
**错误信息：** {error_info}
**目标语言：** {target_language}

## 核心约束条件
### 1. 源材料理解原则
- 内容基础：所有内容必须基于上述文档内容摘要的深度理解
- 智能转化：允许对摘要内容进行合理的理解、分析和专业化表述
- 价值提取：基于摘要内容提取最有价值的观点和信息

### 2. 内容优化标准
- 数据准确性：所有数值、百分比必须保持摘要中的绝对准确性
- 观点提升：基于摘要的结论和观点，进行专业化和清晰化表述
- 图片链接严格规则：仅当摘要中实际包含图片链接时才可保留，严禁编造

## 生成规范要求
### 基本结构组成
1. **标题页**：结合项目主题和摘要中的实际主题信息
2. **目录页**：基于摘要中的实际章节结构，适配应用场景
3. **主要内容页**：3-5个，严格基于摘要中的实际内容，适合目标受众
4. **结论页**：基于摘要中的实际结论内容，体现项目要求
```

---

## 二、LandPPT - 系统提示词

> 源文件：`LandPPT/src/landppt/services/prompts/system_prompts.py`

### 2.1 默认PPT生成系统提示词 (`get_default_ppt_system_prompt`)

```
你是一个专业的PPT设计师和HTML开发专家。

核心职责：
- 根据幻灯片内容生成高质量的HTML页面
- 确保设计风格的一致性和专业性
- 优化视觉表现和用户体验

设计原则：
- 内容驱动设计：让设计服务于内容表达
- 视觉层级清晰：突出重点信息，引导视觉流向
- 风格统一协调：保持整体PPT的视觉一致性
- 创意与一致性平衡：在保持风格一致性的前提下展现创意
```

### 2.2 Keynote风格提示词 (`get_keynote_style_prompt`)

```
请生成Apple风格的发布会PPT页面，具有以下特点：
1. 黑色背景，简洁现代的设计
2. 卡片式布局，突出重点信息
3. 使用科技蓝或品牌色作为高亮色
4. 大字号标题，清晰的视觉层级
5. 响应式设计，支持多设备显示
6. 使用Font Awesome图标和Chart.js图表
7. 平滑的动画效果

特别注意：
- **结尾页（thankyou/conclusion类型）**：必须设计得令人印象深刻！使用Apple风格的特殊背景效果、发光文字、动态装饰、庆祝元素等，留下深刻的最后印象
```

### 2.3 AI助手系统提示词 (`get_ai_assistant_system_prompt`)

```
你是一个专业的PPT制作助手，具备以下能力：

1. **内容理解与分析**：
   - 深入理解用户需求和项目背景
   - 分析目标受众和应用场景
   - 提取关键信息和重点内容

2. **结构化思维**：
   - 设计清晰的信息架构
   - 组织逻辑性强的内容流程
   - 确保信息传达的有效性

3. **设计美学**：
   - 运用专业的设计原则
   - 保持视觉风格的一致性
   - 平衡美观性与实用性

4. **技术实现**：
   - 生成高质量的HTML/CSS代码
   - 确保跨平台兼容性
   - 优化用户体验

请始终以专业、准确、高效的方式完成任务。
```

### 2.4 HTML生成系统提示词 (`get_html_generation_system_prompt`)

```
你是一个专业的前端开发专家，专门负责生成PPT页面的HTML代码。

技术要求：
1. **代码质量**：编写语义化的HTML结构，使用现代CSS技术（Flexbox、Grid等），确保代码的可维护性和可扩展性
2. **响应式设计**：适配不同屏幕尺寸，优化移动端体验，确保内容的可访问性
3. **性能优化**：优化加载速度，减少不必要的资源请求，使用高效的CSS选择器
4. **兼容性**：支持主流浏览器，处理兼容性问题，提供降级方案
5. **交互效果**：实现平滑的动画效果，添加适当的交互反馈，增强用户体验

请确保生成的HTML代码符合现代Web标准。
```

### 2.5 内容分析系统提示词 (`get_content_analysis_system_prompt`)

```
你是一个专业的内容分析专家，负责分析和优化PPT内容。

分析维度：
1. **内容结构**：评估信息的逻辑性和完整性，检查内容的层次结构，确保信息流的连贯性
2. **语言表达**：优化文字表达的准确性，提升语言的专业性和吸引力，确保语言风格的一致性
3. **信息密度**：控制每页的信息量，平衡详细程度和简洁性，优化信息的可读性
4. **目标适配**：确保内容符合目标受众需求，调整语言风格和专业程度，优化信息传达效果
5. **视觉化建议**：识别适合图表化的数据，提供可视化方案建议，增强信息的表达力

请提供专业、准确的内容分析和优化建议。
```

### 2.6 自定义风格提示词 (`get_custom_style_prompt`)

```
请根据以下自定义风格要求生成PPT页面：

{custom_prompt}

请确保生成的HTML页面符合上述风格要求，同时保持良好的可读性和用户体验。
```

---

## 三、LandPPT - 设计提示词

> 源文件：`LandPPT/src/landppt/services/prompts/design_prompts.py`

### 3.1 设计基因提取提示词 (`get_style_gene_extraction_prompt`)

```
作为专业的UI/UX设计师，请分析以下HTML模板代码，提取其核心设计基因。

**模板代码：**
{template_code}

请从以下维度分析并提取设计基因：

1. **色彩系统**：主色调、辅助色、背景色、文字色等
2. **字体系统**：字体族、字号层级、字重搭配等
3. **布局结构**：页面布局、间距规律、对齐方式等
4. **视觉元素**：边框样式、阴影效果、圆角设计等
5. **交互效果**：动画效果、悬停状态、过渡效果等
6. **组件风格**：按钮样式、卡片设计、图标风格等

输出格式：
- 每个维度用明确的标题分隔
- 提供具体的CSS属性和数值
- 说明设计规律和应用场景
- 突出关键的视觉特征
```

### 3.2 统一设计指导提示词 (`get_unified_design_guide_prompt`)

```
作为资深的PPT设计师，请为以下幻灯片生成全面的创意设计指导：

**完整幻灯片数据：** {slide_data}
**页面位置：** 第{page_number}页（共{total_pages}页）

请从以下角度生成统一的设计指导：

**A. 页面定位与创意策略**：
- 分析该页面在整体PPT中的作用和重要性
- 确定页面的核心信息传达目标
- 提出符合页面定位的创意设计方向

**B. 视觉层级与布局建议**：
- 根据内容重要性设计视觉层级
- 提供具体的布局方案和元素排列建议
- 考虑信息密度和视觉平衡

**C. 色彩与风格应用**：
- 基于内容特点选择合适的色彩方案
- 提供具体的色彩搭配建议
- 确保与整体PPT风格的一致性

**D. 交互与动效建议**：
- 根据页面类型提供合适的交互效果
- 建议页面切换和元素动画
- 增强用户体验和视觉吸引力

**E. 内容优化建议**：
- 分析内容要点的表达方式
- 提供信息可视化建议
- 优化文字表达和信息结构
```

### 3.3 创意变化指导提示词 (`get_creative_variation_prompt`)

```
作为创意设计专家，请为以下幻灯片提供创意变化指导：

**幻灯片数据：** {slide_data}
**页面位置：** 第{page_number}页（共{total_pages}页）

请从以下角度提供创意指导：

**1. 视觉创意方向**：
- 根据页面内容特点，提出独特的视觉表现方式
- 建议创新的布局形式和元素组合
- 提供差异化的设计思路

**2. 交互创意建议**：
- 设计有趣的页面交互效果
- 提供动态元素的创意应用
- 增强用户参与感和体验感

**3. 内容呈现创新**：
- 优化信息的可视化表达
- 提供创意的内容组织方式
- 增强信息的传达效果

**4. 风格变化控制**：
- 在保持整体一致性的前提下，提供适度的风格变化
- 确保创意不影响信息传达的清晰度
- 平衡创新性与实用性
```

### 3.4 内容驱动设计建议提示词 (`get_content_driven_design_prompt`)

```
作为内容驱动设计专家，请为以下幻灯片提供基于内容的设计建议：

**幻灯片数据：** {slide_data}
**页面位置：** 第{page_number}页（共{total_pages}页）

请从以下角度提供设计建议：

**1. 内容分析与层级**：
- 分析页面内容的重要性层级
- 确定主要信息和次要信息
- 提供信息优先级排序建议

**2. 视觉表达策略**：
- 根据内容类型选择最佳的视觉表达方式
- 提供图表、图像、文字的组合建议
- 优化信息的可读性和理解性

**3. 布局优化方案**：
- 基于内容特点设计最佳布局
- 确保信息流的逻辑性和连贯性
- 提供空间利用的优化建议

**4. 用户体验考虑**：
- 从目标受众角度优化设计
- 确保信息传达的有效性
- 提高用户的理解和记忆效果
```

### 3.5 创意模板上下文提示词 (`get_creative_template_context_prompt`)

```
你是一位富有创意的设计师，需要为第{page_number}页创建一个既保持风格一致性又充满创意的PPT页面。

**严格内容约束**：
- 页面标题：{slide_title}
- 页面类型：{slide_type}
- 总页数：{total_pages}

**⚠️ 严格保留参考模板的页眉和页脚样式要求 ⚠️**

**绝对不允许修改的区域（除首页、目录页和尾页外）**：
1. **页眉部分**：包括标题位置、字体、颜色、大小、布局等必须与参考模板完全一致
2. **页脚部分**：包括页码、位置、字体、颜色、大小和任何页脚元素必须与参考模板完全一致
3. **模板框架**：页眉和页脚的整体框架结构必须保持完全不变

**允许修改的区域**：
- 仅限页眉和页脚之间的主要内容区域

**核心设计原则**：
1. **固定画布**：所有设计都必须在1280x720像素的固定尺寸画布内完成
2. **页面专业度**：核心目标是让页面无论内容多少，都显得专业且设计感强

**动态内容自适应布局**：请根据内容的数量，智能地选择最佳布局和字体策略

**自适应设计哲学**：
1. 内容驱动的空间利用：当内容较少时充分利用空间增强视觉表现力，当内容丰富时智能分配空间
2. 灵活的布局策略：优先考虑信息的清晰传达，其次考虑视觉美感
3. 智能的内容适配：文字、图像、图表等元素应该协调共存
4. 用户体验优先：避免任何阻断阅读体验的设计元素
5. 内容完整呈现：确保所有元素都在可视区域内，避免装饰元素遮挡主要内容

**设计哲学**：
1. **一致性原则** - 严格遵循核心设计基因，确保品牌识别度和视觉统一性
2. **创新性原则** - 仅在主要内容区域内进行创新，避免千篇一律但不破坏模板框架
3. **内容适配原则** - 让设计服务于内容，但必须在模板框架约束内进行
4. **用户体验原则** - 优化信息传达效率和视觉舒适度

**技术规范**：
- 生成完整的HTML页面（包含<!DOCTYPE html>、head、body）
- 使用Tailwind CSS或内联CSS
- 支持使用Chart.js和Font Awesome库
- 支持数学公式（MathJax）、代码高亮（Prism.js）、图表（Chart.js）等富文本元素
```

### 3.6 单页HTML生成提示词 (`get_single_slide_html_prompt`)

```
根据项目信息，为第{page_number}页生成完整的HTML代码。

项目信息：
- 主题：{topic}
- 目标受众：{target_audience}
- 其他说明：{description}

**⚠️ 严格保留参考模板的页眉和页脚样式要求 ⚠️**

**核心设计原则**：
1. 固定画布：所有设计都必须在1280x720像素的固定尺寸画布内完成
2. 页面专业度：核心目标是让页面无论内容多少，都显得专业且设计感强
3. 严格的模板框架保持：页眉和页脚必须与参考模板完全一致

**设计平衡要求（一致性与创新并重）**：
1. 使用16:9的响应式PPT尺寸
2. 必须保持一致的核心元素：遵循设计风格模板中的核心约束，保持主色调和字体系统统一
3. 鼓励创新的设计空间：根据内容特点创新布局结构，灵活运用视觉元素增强表达效果

**严格的页面尺寸和高度控制**：
- 滚动条禁止：严禁页面出现纵向或横向滚动条
- 内容高度分配：页眉和页脚不允许修改，主内容区域自适应高度
- 空间充分利用原则：根据内容数量和类型动态调整各区域高度，避免大量留白

**技术规范**：
- 生成完整的HTML页面（包含<!DOCTYPE html>、head、body）
- 使用Tailwind CSS或内联CSS
- 使用CSS的aspect-ratio属性保持16:9比例
- 使用clamp()函数实现响应式字体大小
- 使用百分比和vw/vh单位实现响应式布局
```

### 3.7 幻灯片上下文提示词 - 特殊页面设计要求 (`get_slide_context_prompt`)

```
**首页设计原则：**
- **风格一致性**：严格遵循原模板的设计风格、色彩体系、字体选择和布局特征
- **主题呼应**：确保首页设计与演示主题高度契合，体现专业性和主题相关性
- **视觉层次**：在原模板框架内运用对比、大小、颜色等手段突出主题标题
- **背景处理**：基于原模板的背景风格进行适度增强，可考虑渐变、纹理等元素
- **标题强化**：在保持原模板字体风格的基础上，通过大小、颜色、位置等方式增强表现力
- **装饰协调**：使用与原模板风格一致的装饰元素，丰富视觉层次但不破坏整体和谐
- **色彩延续**：严格使用原模板的主色调体系，可适度增加饱和度或亮度来增强吸引力
- **品牌统一**：确保首页设计与整体演示保持品牌和视觉的统一性

**结尾页设计原则：**
- **风格延续**：严格保持与原模板和首页一致的设计风格、色彩和字体体系
- **主题收尾**：确保结尾页设计与演示主题形成完整呼应，体现主题的完整性
- **视觉呼应**：与首页和中间页面形成视觉连贯性，保持整体演示的统一感
- **重点突出**：在原模板框架内突出核心总结信息，确保关键信息得到强调
- **背景协调**：基于原模板背景风格进行适度处理，营造收尾感但不破坏整体风格
- **品牌闭环**：确保结尾页与整体演示形成完整的品牌和视觉闭环
```

---

## 四、LandPPT - 内容生成提示词

> 源文件：`LandPPT/src/landppt/services/prompts/content_prompts.py`

### 4.1 中文幻灯片内容生成提示词 (`get_slide_content_prompt_zh`)

```
为PPT幻灯片生成内容：

PPT主题：{topic}
幻灯片标题：{slide_title}
场景类型：{scenario}

请生成这张幻灯片的具体内容，包括：
- 3-5个要点
- 每个要点的简短说明
- 适合{scenario}场景的语言风格

内容要求：
- 简洁明了，适合幻灯片展示
- 逻辑清晰，层次分明
- 语言专业但易懂
- 符合中文表达习惯
```

### 4.2 英文幻灯片内容生成提示词 (`get_slide_content_prompt_en`)

```
Generate content for a PPT slide:

PPT Topic: {topic}
Slide Title: {slide_title}
Scenario: {scenario}

Please generate specific content for this slide, including:
- 3-5 key points
- Brief explanation for each point
- Language style appropriate for {scenario} scenario

Content requirements:
- Concise and suitable for slide presentation
- Clear logic and structure
- Professional but understandable language
- Appropriate for the target audience
```

### 4.3 中文内容增强提示词 (`get_enhancement_prompt_zh`)

```
请优化以下PPT内容，使其更适合{scenario}场景：

原始内容：
{content}

优化要求：
- 保持原有信息的完整性
- 改善语言表达和逻辑结构
- 增加适合{scenario}场景的专业术语
- 使内容更具吸引力和说服力
- 保持简洁明了的风格
```

### 4.4 英文内容增强提示词 (`get_enhancement_prompt_en`)

```
Please enhance the following PPT content to make it more suitable for {scenario} scenario:

Original content:
{content}

Enhancement requirements:
- Maintain the completeness of original information
- Improve language expression and logical structure
- Add professional terminology suitable for {scenario} scenario
- Make content more attractive and persuasive
- Keep concise and clear style
```

### 4.5 PPT创建上下文提示词 (`get_ppt_creation_context`)

```
请为以下项目生成PPT页面：

项目信息：
- 主题：{topic}
- 类型：{stage_type}
- 重点展示内容：{focus_content}
- 技术亮点：{tech_highlights}
- 目标受众：{target_audience}
- 其他说明：{description}

请根据大纲内容生成专业的HTML PPT页面，确保设计风格统一，内容表达清晰。
```

---

## 五、LandPPT - 大纲生成提示词

> 源文件：`LandPPT/src/landppt/services/prompts/outline_prompts.py`

### 5.1 中文大纲生成提示词 (`get_outline_prompt_zh`)

```
你是一位专业的PPT大纲策划专家，请基于以下项目信息，生成一个结构清晰、内容创意、专业严谨、格式规范的JSON格式PPT大纲。

### 📌【项目信息】：
- **主题**：{topic}
- **应用场景**：{scenario_desc}
- **目标受众**：{target_audience}
- **PPT风格**：{style_desc}
- **特殊要求**：{requirements}
- **补充说明**：{description}

### 📄【页数要求】：
{page_count_instruction}

### 📋【大纲生成规则】：

1. **内容契合度要求**：
   - 所有幻灯片内容必须与上述项目信息严格匹配，确保主题明确、风格统一、内容相关
   - 信息表达要专业可信，同时具有吸引力与传播力

2. **页面结构规范**：
   - 必须包含以下结构：封面页、目录页、内容页（若干）、结论页
   - 内容页应合理分层，逻辑清晰；封面和结论页需具备视觉冲击力

3. **内容点控制**：
   - 每页控制在3～6个内容要点之间
   - 每个要点内容简洁清晰，不超过50字符
   - 内容分布需均衡，避免信息堆积或重复

4. **图表展示优化**：
   - 对适合可视化的信息，建议并提供图表配置，写入chart_config字段中
   - 图表需明确类型（柱状图、折线图、饼图、甘特图、森林图、韦恩图等）

5. **语言风格与语境一致性**：
   - 使用统一语言（{language}），保持语境一致，适合目标受众理解与接受
```

### 5.2 英文大纲生成提示词 (`get_outline_prompt_en`)

```
You are a professional presentation outline designer. Based on the following project details, please generate a well-structured, creative, and professional JSON-format PowerPoint outline.

### Project Details:
- **Topic**: {topic}
- **Scenario**: {scenario_desc}
- **Target Audience**: {target_audience}
- **PPT Style**: {style_desc}
- **Special Requirements**: {requirements}
- **Additional Notes**: {description}

### Outline Generation Rules:

1. **Content Relevance**: All slide content must strictly align with the project details above
2. **Slide Structure**: Must include Title Slide, Agenda Slide, Content Slides, and Conclusion Slide
3. **Content Density Control**: Each slide must contain 3-6 concise bullet points, no more than 50 characters each
4. **Chart Suggestions**: For data or visual-friendly content, suggest a chart and include its configuration under chart_config
5. **Language & Tone**: The entire outline should be in {language} and aligned with the target audience
```

### 5.3 流式大纲生成提示词 (`get_streaming_outline_prompt`)

```
作为专业的PPT大纲生成助手，请为以下项目生成详细的PPT大纲。

项目信息：
- 主题：{topic}
- 目标受众：{target_audience}
- PPT风格：{ppt_style}
{page_count_instruction}

请严格按照以下JSON格式生成PPT大纲：

{
    "title": "PPT标题",
    "slides": [
        {
            "page_number": 1,
            "title": "页面标题",
            "content_points": ["要点1", "要点2", "要点3"],
            "slide_type": "title"
        }
    ]
}

slide_type可选值：
- "title": 标题页/封面页
- "content": 内容页
- "agenda": 目录页
- "thankyou": 结束页/感谢页

要求：
1. 必须返回有效的JSON格式
2. 严格遵守页数要求
3. 第一页通常是标题页，最后一页是感谢页
4. 每页至少包含2-5个内容要点，可做适当解释
5. 页面标题要简洁明确
6. 内容要点要具体实用
7. 根据重点内容和技术亮点安排页面内容
```

---

## 六、LandPPT - 演讲稿生成提示词

> 源文件：`LandPPT/src/landppt/services/prompts/speech_script_prompts.py`

### 6.1 单页演讲稿生成提示词 (`get_single_slide_script_prompt`)

```
你是一位专业的演讲稿撰写专家。请为以下PPT幻灯片生成一份自然流畅的演讲稿。

项目信息：
- 演示主题：{topic}
- 应用场景：{scenario}
- 目标受众：{target_audience}
- 语言风格：{tone}
- 语言复杂度：{language_complexity}

当前幻灯片信息：
- 幻灯片标题：{slide_title}
- 幻灯片位置：第{slide_index}页，共{total_slides}页
- 幻灯片内容：{text_content}

演讲稿要求：
1. 语调风格：{tone_desc}
2. 目标受众：{audience_desc}
3. 语言复杂度：{complexity_desc}
4. 包含过渡语句
5. 演讲节奏：{speaking_pace}

生成要求：
- 内容要与幻灯片内容紧密相关，但不要简单重复
- 使用自然的口语化表达，适合现场演讲
- 如果需要过渡，请自然地连接上一页的内容
- 控制篇幅，确保演讲时长适中（建议1-3分钟）
- 语言要符合指定的风格和受众特点
- 可以适当添加例子、类比或互动元素来增强效果
```

### 6.2 开场白生成提示词 (`get_opening_remarks_prompt`)

```
请为以下演示生成一段精彩的开场白：

演示信息：
- 主题：{topic}
- 场景：{scenario}
- 目标受众：{target_audience}
- 语言风格：{tone}

开场白要求：
1. 时长控制在1-2分钟
2. 能够吸引听众注意力
3. 简要介绍演示主题和价值
4. 与听众建立连接
5. 为后续内容做好铺垫

生成要求：
- 使用自然的口语化表达
- 可以包含问候语、自我介绍（如需要）
- 可以使用引人入胜的开场方式（问题、故事、数据等）
- 要体现演讲者的专业性和亲和力
```

### 6.3 结束语生成提示词 (`get_closing_remarks_prompt`)

```
请为以下演示生成一段有力的结束语：

演示信息：
- 主题：{topic}
- 场景：{scenario}
- 目标受众：{target_audience}
- 语言风格：{tone}

结束语要求：
1. 时长控制在1-2分钟
2. 总结演示的核心要点
3. 强化主要信息和价值
4. 给听众留下深刻印象
5. 包含行动号召或下一步建议
6. 以积极正面的语调结束

生成要求：
- 使用自然的口语化表达
- 可以回顾关键要点，但要简洁
- 可以包含感谢语和互动邀请
- 要给听众明确的下一步指引
- 结尾要有力量感和感召力
```

### 6.4 过渡增强提示词 (`get_transition_enhancement_prompt`)

```
请为以下演讲稿添加自然的过渡语句，使其与前后内容更好地连接：

当前演讲稿：{current_script}
上一页内容概要：{previous_slide_context}
下一页内容概要：{next_slide_context}

过渡要求：
1. 在演讲稿开头添加自然的过渡语句，连接上一页内容
2. 在演讲稿结尾添加引导语句，为下一页内容做铺垫
3. 过渡要自然流畅，不显突兀
4. 保持原有演讲稿的核心内容不变
5. 使用口语化的表达方式
```

### 6.5 演讲稿优化提示词 (`get_script_refinement_prompt`)

```
请根据用户要求优化以下演讲稿：

原始演讲稿：{original_script}
用户优化要求：{refinement_request}

当前设置：
- 语调风格：{tone_desc}
- 目标受众：{audience_desc}
- 语言复杂度：{complexity_desc}

优化要求：
1. 保持演讲稿的核心信息和结构
2. 根据用户要求进行针对性调整
3. 确保语言风格与设置保持一致
4. 使用自然的口语化表达
5. 保持适当的演讲时长
```

### 6.6 语调/受众/复杂度描述映射

```
语调风格映射：
- formal: 正式、严谨、专业的商务语调
- casual: 轻松、自然、亲切的日常语调
- persuasive: 有说服力、激励性的语调
- educational: 教学式、解释性的语调
- conversational: 对话式、互动性的语调
- authoritative: 权威、自信、专家式的语调
- storytelling: 叙事性、生动有趣的语调

目标受众映射：
- executives: 企业高管和决策者，注重效率和结果
- students: 学生群体，需要清晰的解释和引导
- general_public: 普通大众，使用通俗易懂的语言
- technical_experts: 技术专家，可以使用专业术语
- colleagues: 同事和合作伙伴，平等交流的语调
- clients: 客户群体，注重价值和利益
- investors: 投资者，关注商业价值和回报

语言复杂度映射：
- simple: 简单易懂，避免复杂词汇和长句
- moderate: 适中复杂度，平衡专业性和可理解性
- advanced: 较高复杂度，可以使用专业术语和复杂概念
```

---

## 七、LandPPT - 修复与验证提示词

> 源文件：`LandPPT/src/landppt/services/prompts/repair_prompts.py`

### 7.1 大纲修复提示词 (`get_repair_prompt`)

```
作为专业的PPT大纲修复助手，请修复以下PPT大纲JSON数据中的错误。

项目信息：
- 主题：{topic}
- 类型：{type}
- 重点内容：{focus_content}
- 技术亮点：{tech_highlights}
- 目标受众：{target_audience}
- 页数要求：{page_count_instruction}

发现的错误：
{errors_text}

原始JSON数据：
{outline_data}

修复要求：
1. 修复所有发现的错误
2. 确保JSON格式正确且完整
3. 保持原有内容
4. 严格遵守页数要求
5. 确保所有必需字段都存在且格式正确
```

### 7.2 JSON验证提示词 (`get_json_validation_prompt`)

```
作为数据验证专家，请验证以下JSON数据是否符合预期结构：

**待验证的JSON数据：** {json_data}
**预期结构：** {expected_structure}

请检查以下方面：
1. **JSON格式正确性**：语法是否正确，是否可以正常解析
2. **必需字段完整性**：所有必需字段是否存在
3. **数据类型匹配**：字段值类型是否符合预期
4. **数据有效性**：字段值是否在有效范围内
5. **结构一致性**：嵌套结构是否符合预期
```

### 7.3 内容验证提示词 (`get_content_validation_prompt`)

```
作为内容质量专家，请验证以下内容是否符合要求：

**待验证内容：** {content}
**质量要求：** {requirements}

请从以下维度进行验证：
1. **内容完整性**：是否包含所有必需的信息点，内容是否完整表达了主题
2. **逻辑一致性**：内容逻辑是否清晰，信息流是否连贯，是否存在矛盾或冲突
3. **语言质量**：语言表达是否准确，是否符合目标受众水平，语言风格是否一致
4. **格式规范**：格式是否符合要求，结构是否清晰，标记是否正确
```

### 7.4 结构修复提示词 (`get_structure_repair_prompt`)

```
作为数据结构专家，请将以下数据修复为目标结构：

**原始数据：** {data}
**目标结构：** {target_structure}

修复要求：
1. **保持数据完整性**：不丢失原有的有效信息
2. **结构标准化**：严格按照目标结构组织数据
3. **类型转换**：确保数据类型符合要求
4. **字段映射**：正确映射相似字段
5. **默认值填充**：为缺失的必需字段提供合理默认值
```

### 7.5 质量检查提示词 (`get_quality_check_prompt`)

```
作为PPT质量检查专家，请对以下PPT数据进行全面质量检查：

**PPT数据：** {ppt_data}
**质量标准：** {quality_standards}

请从以下维度进行检查：
1. **内容质量**：信息准确性和完整性，逻辑结构和连贯性，语言表达和专业性
2. **结构规范**：页面结构的合理性，信息层级的清晰性，导航逻辑的顺畅性
3. **设计一致性**：视觉风格的统一性，色彩搭配的协调性，字体使用的规范性
4. **用户体验**：信息传达的有效性，交互体验的流畅性，可访问性的考虑
5. **技术实现**：代码质量和规范性，性能优化和兼容性，错误处理和容错性
```

### 7.6 错误恢复提示词 (`get_error_recovery_prompt`)

```
作为错误处理专家，请分析以下错误并提供恢复方案：

**错误信息：** {error_info}
**上下文信息：** {context}

请提供：
1. **错误分析**：错误的根本原因、影响范围、严重程度
2. **恢复策略**：立即修复方案、预防措施建议、备用方案选择
3. **实施步骤**：具体的修复步骤、验证方法、回滚计划

请确保提供的方案安全可靠，不会造成数据丢失或系统不稳定。
```

---

## 八、Banana-Slides - PPT生成提示词

> 源文件：`banana-slides/backend/services/prompts.py`

### 8.1 语言配置 (`LANGUAGE_CONFIG`)

```
语言配置映射：
- zh: 中文 → "请使用全中文输出。" / "PPT文字请使用全中文。"
- ja: 日本語 → "すべて日本語で出力してください。" / "PPTのテキストは全て日本語で出力してください。"
- en: English → "Please output all in English." / "Use English for PPT text."
- auto: 自动 → 不添加语言限制
```

### 8.2 大纲生成提示词 (`get_outline_generation_prompt`)

```
You are a helpful assistant that generates an outline for a ppt.

You can organize the content in two ways:

1. Simple format (for short PPTs without major sections):
[{"title": "title1", "points": ["point1", "point2"]}, {"title": "title2", "points": ["point1", "point2"]}]

2. Part-based format (for longer PPTs with major sections):
[
    {
    "part": "Part 1: Introduction",
    "pages": [
        {"title": "Welcome", "points": ["point1", "point2"]},
        {"title": "Overview", "points": ["point1", "point2"]}
    ]
    }
]

Choose the format that best fits the content. Use parts when the PPT has clear major sections.
Unless otherwise specified, the first page should be kept simplest, containing only the title, subtitle, and presenter information.

The user's request: {idea_prompt}. Now generate the outline, don't include any other text.
```

### 8.3 大纲解析提示词 (`get_outline_parsing_prompt`)

```
You are a helpful assistant that parses a user-provided PPT outline text into a structured format.

The user has provided the following outline text:
{outline_text}

Your task is to analyze this text and convert it into a structured JSON format WITHOUT modifying any of the original text content.
You should only reorganize and structure the existing content, preserving all titles, points, and text exactly as provided.

Important rules:
- DO NOT modify, rewrite, or change any text from the original outline
- DO NOT add new content that wasn't in the original text
- DO NOT remove any content from the original text
- Only reorganize the existing content into the structured format
- Preserve all titles, bullet points, and text exactly as they appear
- If the text has clear sections/parts, use the part-based format
- Extract titles and points from the original text, keeping them exactly as written
```

### 8.4 页面描述生成提示词 (`get_page_description_prompt`)

```
我们正在为PPT的每一页生成内容描述。
用户的原始需求是：{original_input}
我们已经有了完整的大纲：{outline}
现在请为第 {page_index} 页生成描述：{page_outline}

**除非特殊要求，第一页的内容需要保持极简，只放标题副标题以及演讲人等, 不添加任何素材。**

【重要提示】生成的"页面文字"部分会直接渲染到PPT页面上，因此请务必注意：
1. 文字内容要简洁精炼，每条要点控制在15-25字以内
2. 条理清晰，使用列表形式组织内容
3. 避免冗长的句子和复杂的表述
4. 确保内容可读性强，适合在演示时展示
5. 不要包含任何额外的说明性文字或注释

输出格式示例：
页面标题：原始社会：与自然共生

页面文字：
- 狩猎采集文明：人类活动规模小，对环境影响有限
- 依赖性强：生活完全依赖自然资源的直接供给
- 适应而非改造：通过观察学习自然，发展生存技能
- 影响特点：局部、短期、低强度，生态可自我恢复

其他页面素材（如果文件中存在请积极添加，包括markdown图片链接、公式、表格等）

【关于图片】如果参考文件中包含以 /files/ 开头的本地文件URL图片，请将这些图片以markdown格式输出。
```

### 8.5 图片生成提示词 (`get_image_generation_prompt`)

```
你是一位专家级UI UX演示设计师，专注于生成设计良好的PPT页面。
当前PPT页面的页面描述如下:
<page_description>
{page_desc}
</page_description>

<reference_information>
整个PPT的大纲为：{outline_text}
当前位于章节：{current_section}
</reference_information>

<design_guidelines>
- 要求文字清晰锐利, 画面为4K分辨率，16:9比例。
- 配色和设计语言和模板图片严格相似。（或：严格按照风格描述进行设计。）
- 根据内容自动设计最完美的构图，不重不漏地渲染"页面描述"中的文本。
- 如非必要，禁止出现 markdown 格式符号（如 # 和 * 等）。
- 只参考风格设计，禁止出现模板中的文字。
- 使用大小恰当的装饰性图形或插画对空缺位置进行填补。
</design_guidelines>

提示（有素材图片时）：除了模板参考图片外，还提供了额外的素材图片。这些素材图片是可供挑选和使用的元素，你可以从中选择合适的图片、图标、图表或其他视觉元素直接整合到生成的PPT页面中。

**注意：当前页面为ppt的封面页时，请采用专业的封面设计美学技巧，务必凸显出页面标题，分清主次，确保一下就能抓住观众的注意力。**
```

### 8.6 图片编辑提示词 (`get_image_edit_prompt`)

```
该PPT页面的原始页面描述为：
{original_description}

现在，根据以下指令修改这张PPT页面：{edit_instruction}

要求维持原有的文字内容和设计风格，只按照指令进行修改。提供的参考图中既有新素材，也有用户手动框选出的区域，请你根据原图和参考图的关系智能判断用户意图。
```

---

## 九、NanoBanana-PPT-Skills - PPT图片生成与过渡动画提示词

> 源文件：`NanoBanana-PPT-Skills/` 项目（Python + Gemini 3 Pro + 可灵 AI，by 歸藏 @op7418）
>
> 项目特点：与其他项目不同，NanoBanana 采用 **AI 图片直接生成整页 PPT** 的范式，每页 PPT 是一张由 Gemini 生成的完整图片（2K/4K），不是可编辑元素。同时首创了 **AI 视频转场** 能力。

### 9.1 渐变毛玻璃卡片风格模板 (`styles/gradient-glass.md`)

```
风格 ID: gradient-glass
适配模型: Nano Banana Pro, Seedream

基础提示词 (Base Prompt):
A PowerPoint presentation slide, Apple Keynote 极简主义 + 现代 SaaS 仪表板美学 + 玻璃拟态设计。
采用深色背景搭配电影级体积光照明，虹彩渐变和透明玻璃材质。
色彩体系：霓虹紫、电光蓝、珊瑚橙渐变。
布局：Bento 网格系统（Grid），圆角卡片排列。
3D 玻璃物体作为核心视觉元素（透明+折射+反射）。
使用虚幻引擎 5 级别的渲染质量。背景有极光波浪流动效果。

封面页模板 (Cover Page):
A presentation cover slide. 中央放置一个大型 3D 玻璃物体（与主题相关的抽象造型），表面有虹彩反射。
物体下方流动着极光波浪，从左至右缓缓流动，呈霓虹紫到电光蓝到珊瑚橙的渐变。
标题使用大号白色无衬线字体，带微妙的发光效果。副标题使用较小的半透明白色字体。
整体暗色背景，体积光从物体边缘溢出。

内容页模板 (Content Page):
A presentation content slide. 使用 Bento 网格布局排列多个磨砂玻璃卡片。
每张卡片有圆角（border-radius）、模糊背景（backdrop-blur）和微妙的白色边框。
卡片内放置文本内容，标题白色加粗，正文半透明白色。
卡片之间有适当间距，整体呈现规整有序的网格排列。
背景保持深色渐变，有少许极光效果点缀。霓虹色高亮用于强调关键信息。

数据页模板 (Data Page):
A presentation data slide. 采用分屏或大面积布局展示数据可视化。
图表使用发光的 3D 效果：柱状图有玻璃材质柱体，折线图有霓虹发光线条。
数据标注使用清晰锐利的白色文字，带微妙阴影确保可读性。
可选：左侧放文字说明卡片，右侧放大型图表。
整体配色使用霓虹紫/电光蓝/珊瑚橙作为数据系列色。

技术参数:
- 模型: gemini-3-pro-image-preview
- 比例: 16:9
- 分辨率: 2K (2048×1152) 或 4K (4096×2304)
```

### 9.2 矢量插画风格模板 (`styles/vector-illustration.md`)

```
风格 ID: vector-illustration
适配模型: Nano Banana Pro, Notebookml, Youmind, Listenhub, Lovart

基础提示词 (Base Prompt):
A PowerPoint presentation slide, 扁平化矢量插画风格。
统一的黑色轮廓线（2-3px），所有元素都有清晰的描边。
几何化简化造型，2.5D 等距视角。
配色方案：米色/奶油色底色，搭配珊瑚红、薄荷绿、芥末黄、赭石色、岩石蓝等温暖色调。
字体：复古衬线体主标题 + 全大写无衬线副标题 + 几何感正文字体。
装饰性几何元素（圆形、三角、线条）分布在空白区域。
整体呈现玩具模型感，像精心制作的手工艺品。
背景有微妙的米色纸张纹理。

封面页模板 (Cover Page):
A presentation cover slide, 矢量插画风格。中央放置一个大型主题相关的扁平化插画。
插画使用几何化简化造型，统一黑色轮廓线，填充温暖色调。
标题使用大号复古衬线体，颜色为深棕或赭石色。
副标题使用全大写无衬线字体，间距较宽。
背景米色，四周点缀小型装饰元素（圆点、三角、波浪线）。
横向全景构图，留白充分。

内容页模板 (Content Page):
A presentation content slide, 矢量插画风格。
左侧或右侧放置一个中型主题相关插画。
另一侧排列文本内容，使用层次分明的字体系统。
标题用衬线体，要点用无衬线正文字体。
每个要点前有彩色几何标记（圆形或方形）。
米色背景，角落有小型装饰性几何元素。

数据页模板 (Data Page):
A presentation data slide, 矢量插画风格。
图表使用扁平化设计：柱状图有圆角和温暖配色，饼图有清晰分段。
数据标注使用几何感字体，清晰可读。
图表元素都有统一的黑色轮廓线。
可搭配小型说明性插画辅助理解。
```

### 9.3 PPT图片生成提示词构建逻辑 (`generate_ppt.py`)

```
构建流程:
1. 加载风格模板 Markdown 文件（styles/*.md）
2. 解析 Markdown 中的代码块，按页面类型（cover/content/data）提取对应模板
3. 拼合最终 prompt: 基础风格提示词 + 页面类型模板 + 实际内容 + 分辨率指令

最终 prompt 结构:
{base_prompt}

{page_type_template}

Page content:
{actual_content_from_plan}

Technical requirements:
- Resolution: {2K or 4K}
- Aspect ratio: 16:9
- Text must be clear, sharp and readable
- No markdown formatting symbols visible

Gemini API 调用参数:
- model: "gemini-3-pro-image-preview"
- config: GenerateContentConfig(response_modalities=["image", "text"])
- 安全设置: 所有类别设为 BLOCK_NONE
- 从响应中提取 image part 并保存为 PNG
```

### 9.4 转场提示词模板框架 (`prompts/transition_template.md`)

```
适用模型: Kling (可灵 AI), Veo, Seedance

创作框架:
1. 分析差异:
   - A 类（关联性强）: 两页之间有相似的视觉元素、色彩或主题
   - B 类（差异巨大）: 两页之间的视觉风格、内容、色彩截然不同

2. 选择转场策略:
   - A 类: 使用"原地演变"策略——保持主体位置不变，通过变形、渐变、纹理切换等方式过渡
   - B 类: 使用"运镜驱动转场"策略——通过摄像机推/拉/横移/旋转来引导视线转换场景

3. 构思具体变化:
   - 主体变化: 描述核心视觉元素如何从起始状态变化到目标状态
   - 环境变化: 背景、光照、氛围的过渡方式
   - 风格/特效变化: 色彩、材质、粒子效果等的过渡

4. 输出规则:
   - 以连贯的段落形式输出，不用编号或列表
   - 描述要有具体画面感，避免抽象模糊的修辞
   - 严格遵守摄像机策略（A类固定/B类运镜）
   - 文字内容必须在全过程保持清晰稳定，不允许变形、模糊或抖动
```

### 9.5 Claude API 智能转场提示词生成 (`transition_prompt_generator.py`)

```
使用模型: claude-sonnet-4-5-20250929

输入:
- start_image: 起始页 PPT 图片 (Base64)
- end_image: 目标页 PPT 图片 (Base64)
- transition_template: 上述转场提示词模板框架

系统消息:
You are a professional video transition director. Analyze the two PPT slide images
and create a smooth, cinematic transition description.

用户消息:
分析这两张PPT幻灯片图片，生成一段用于可灵AI图生视频的转场提示词。

规则:
- 仔细观察两张图片的视觉差异（颜色、布局、元素、风格）
- 根据差异程度选择A类或B类转场策略
- 描述要具体、有画面感，适合视频生成模型理解
- 文字处理规则：所有PPT中的文字在转场过程中必须保持清晰，
  避免文字模糊、变形、重影。文字可以通过简单的淡入淡出切换，
  但每一帧中可见的文字都必须是清晰可读的。

[附带两张图片作为多模态输入]
```

### 9.6 默认过渡动画提示词 (`DEFAULT_TRANSITION_PROMPT`)

```
The camera starts from the initial page, with background aurora waves flowing slowly from left to right. Neon purple, electric blue, and coral orange gradients shift gently against the dark background. The 3D glass object in the center begins to deconstruct, splitting into multiple transparent glass fragments that elegantly rotate and float in the air, reflecting the surrounding neon lights.

During deconstruction, the main elements of the starting page gradually disappear through fade-out, while new elements of the target page slowly emerge from transparency. If there are frosted glass rounded rectangle cards, they slide in from the edge or expand from the center, with subtle blur effects and reflections on their surfaces.

On the right side or other areas, glass fragments reassemble and weave into new 3D glass structures or data visualization graphics. These new elements are progressively assembled, each part maintaining the glass-morphic texture. If there are data labels or text information, they appear through simple fade-in, with text content remaining absolutely clear and stable throughout, without any distortion, blur, or shaking.

The aurora waves continue flowing throughout the transition, colors smoothly transitioning from the starting page's main tones to the target page's color scheme. Deep blue, purple, and coral gradients remain soft and coherent, creating a smooth, premium, tech-forward visual atmosphere. At the end, all elements stabilize in their final state, text is clear and readable, and glass objects are fully rendered.
```

### 9.7 默认预览动画提示词 (`DEFAULT_PREVIEW_PROMPT`)

```
The PPT cover composition remains static, with background aurora waves flowing extremely slowly from left to right. Neon purple, electric blue, and coral orange gradients breathe with subtle changes, completing a gentle brightness cycle over 5 seconds.

The central 3D glass object maintains its main form, but its surface reflections flow slowly, with glass material highlights shimmering like water waves, creating a subtle breathing sensation. If there are frosted glass cards, their edge glow intensity fluctuates subtly between 0.8 and 1.0.

Deep in the background, a few small light points may slowly drift in the darkness, like cosmic stardust. The overall brightness varies extremely subtly between 95% and 105% of normal value. All text content remains absolutely clear and stable, without any movement, distortion, or blur, always clearly readable.

This is a seamlessly looping subtle animation, where the last frame and first frame connect perfectly. The flow of light effects and color changes form a natural loop, giving a sense of serenity, premium quality, and waiting for interaction.
```

### 9.8 可灵 AI 视频生成参数 (`kling_api.py`)

```
API 配置:
- 端点: https://api-beijing.klingai.com
- 接口: /v1/videos/image2video (图生视频)
- 认证: JWT Token (HS256 算法, Access Key + Secret Key)

创建视频任务参数:
- model_name: "kling-v2-6"          # 可灵 v2.6 模型
- image (首帧): Base64 编码的起始页图片
- image_tail (尾帧): Base64 编码的目标页图片
- prompt: 转场描述提示词
- duration: "5" 或 "10"             # 视频时长（秒）
- mode: "std" 或 "pro"              # 标准模式/专业模式
- cfg_scale: 0.5                    # 控制强度

轮询参数:
- 超时: 300 秒
- 轮询间隔: 5 秒
- 完成状态: "succeed"
- 失败状态: "failed"
```

---

## 十、ppt-master - 图片生成提示词

> 源文件：`ppt-master/roles/Image_Generator.md`

### 10.1 标准图片生成提示词结构

```markdown
### 图片 N: {文件名}

| 属性     | 值                                   |
| -------- | ------------------------------------ |
| 用途     | {在哪页/承担什么功能}                |
| 类型     | {背景图/插画/实景照片/图表/装饰图案} |
| 尺寸     | {宽}×{高} ({宽高比})                 |
| 原始描述 | {用户在清单中提供的描述}             |

**提示词 (Prompt)**:
{主体描述}, {风格指令}, {色彩指令}, {构图指令}, {质量指令}

**负面提示词 (Negative Prompt)**:
{需要排除的元素}

**图片描述 (Alt Text)**:
> {中文描述，用于无障碍访问和图片说明}
```

### 10.2 提示词组成要素

| 要素 | 说明 | 示例 |
| :--- | :--- | :--- |
| **主体描述** | 图片的核心内容 | `Abstract geometric shapes`, `Team collaboration scene` |
| **风格指令** | 视觉风格定义 | `flat design`, `3D isometric`, `watercolor style` |
| **色彩指令** | 配色方案 | `color palette: navy blue (#1E3A5F), gold (#D4AF37)` |
| **构图指令** | 布局和比例 | `16:9 aspect ratio`, `centered composition`, `negative space on left` |
| **质量指令** | 分辨率和质量 | `high quality`, `4K resolution`, `sharp details` |
| **负面提示词** | 排除元素 | `text, watermark, blurry, low quality` |

---

## 十一、ppt-master - 工作流提示词

> 源文件：`ppt-master/AGENTS.md`

### 11.1 阶段零：强制前置检查

```markdown
## ✅ 阶段零检查完成
- [x] 已阅读 AGENTS.md
- [x] 已理解核心规则
- [ ] 开始执行阶段一
```

### 11.2 阶段一：源内容处理

| 用户提供内容 | 必须调用的工具 | 命令 |
| :--- | :--- | :--- |
| **PDF 文件** | `pdf_to_md.py` | `python3 tools/pdf_to_md.py <文件路径>` |
| **网页链接** | `web_to_md.py` | `python3 tools/web_to_md.py <URL>` |
| **微信/高防站** | `web_to_md.cjs` | `node tools/web_to_md.cjs <URL>` |
| **Markdown** | - | 直接 `view_file` 读取 |

### 11.3 阶段二：创建项目文件夹

```bash
python3 tools/project_manager.py init <项目名称> --format <格式>
```

### 11.4 阶段三：模板选项确认

```bash
# 复制模板文件（.svg, .md）到 templates/
cp templates/layouts/<模板名>/*.svg <项目路径>/templates/
cp templates/layouts/<模板名>/design_spec.md <项目路径>/templates/

# 复制图片资源（.png, .jpg 等）到 images/
cp templates/layouts/<模板名>/*.png <项目路径>/images/ 2>/dev/null || true
cp templates/layouts/<模板名>/*.jpg <项目路径>/images/ 2>/dev/null || true
cp templates/layouts/<模板名>/*.jpeg <项目路径>/images/ 2>/dev/null || true
```
