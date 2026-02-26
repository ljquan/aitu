# 需求文档：知识库能力迁移（translate → aitu）

## 引言

本需求文档描述从 translate 项目（ColliMind 浏览器翻译扩展）向 aitu 项目（画板/白板应用）迁移知识库相关能力的完整需求。

### 已迁移的能力（aitu 中已有）

通过比对，以下知识库核心能力**已经迁移**到 aitu 项目：

| 模块 | translate 文件 | aitu 对应文件 | 状态 |
|------|---------------|-------------|------|
| 类型定义 | `core/knowledgeBase.ts` (类型部分) | `types/knowledge-base.types.ts` | ✅ 已迁移（简化版，使用 string ID） |
| 存储服务 | `core/knowledgeBase.ts` (CRUD部分) | `services/knowledge-base-service.ts` | ✅ 已迁移（使用 localforage 替代原生 IDB） |
| 目录CRUD | `core/knowledgeBase.ts` | `services/knowledge-base-service.ts` | ✅ 已有 |
| 笔记CRUD | `core/knowledgeBase.ts` | `services/knowledge-base-service.ts` | ✅ 已有 |
| 标签CRUD | `core/knowledgeBase.ts` | `services/knowledge-base-service.ts` | ✅ 已有 |
| 笔记-标签关联 | `core/knowledgeBase.ts` | `services/knowledge-base-service.ts` | ✅ 已有 |
| 搜索/排序/过滤 | `core/knowledgeBase.ts` | `services/knowledge-base-service.ts` | ✅ 已有 |
| 导入导出 | - | `services/kb-import-export-service.ts` | ✅ 已有（JSON全量 + Markdown单篇） |
| 排序偏好 | `core/knowledgeBase.ts` | `services/knowledge-base-service.ts` | ✅ 已有 |
| 主内容组件 | 对应组件 | `components/knowledge-base/KnowledgeBaseContent.tsx` | ✅ 已有 |
| 目录树组件 | 对应组件 | `components/knowledge-base/KBDirectoryTree.tsx` | ✅ 已有 |
| 笔记列表组件 | 对应组件 | `components/knowledge-base/KBNoteList.tsx` | ✅ 已有 |
| 笔记编辑器组件 | 对应组件 | `components/knowledge-base/KBNoteEditor.tsx` | ✅ 已有 |
| 标签选择器组件 | 对应组件 | `components/knowledge-base/KBTagSelector.tsx` | ✅ 已有 |
| 排序下拉组件 | 对应组件 | `components/knowledge-base/KBSortDropdown.tsx` | ✅ 已有 |
| 关联笔记组件 | 对应组件 | `components/knowledge-base/KBRelatedNotes.tsx` | ✅ 已有 |
| 语音朗读 | - | `components/knowledge-base/useTextToSpeech.ts` | ✅ 已有 |
| 抽屉容器 | 对应组件 | `components/knowledge-base/KnowledgeBaseDrawer.tsx` | ✅ 已有 |

### 未迁移的能力（需要迁移）

以下知识库能力在 translate 项目中存在但 aitu 项目中**尚未实现**：

| 模块 | translate 文件 | 描述 |
|------|---------------|------|
| 笔记元数据/正文分离存储 | `core/knowledgeBaseBackground.ts` | 将笔记拆分为 NoteMeta + NoteContent 两张表，列表加载更快 |
| 图片存储表 | `core/knowledgeBaseBackground.ts` | NoteImage 独立存储，支持图片去重、清理 |
| 图片URL/Base64转换 | `core/knowledgeBaseApi.ts` | 保存时 base64→URL，显示时 URL→base64，双向缓存 |
| 笔记内容中图片处理 | `core/knowledgeBaseApi.ts` | `extractBase64ImagesFromContent`、`replaceUrlsWithBase64` 等 |
| 来源URL元数据 | `core/knowledgeBaseBackground.ts` | sourceUrl、domain、faviconUrl、publishedAt 等网页来源信息 |
| 基于sourceUrl的upsert | `core/knowledgeBaseBackground.ts` | `upsertNoteBySourceUrl` - 同URL笔记自动更新 |
| 批量创建笔记 | `core/knowledgeBaseBackground.ts` | `batchCreateNotes` |
| 域名统计 | `core/knowledgeBaseBackground.ts` | `getUniqueDomains` - 获取所有笔记来源域名及计数 |
| 域名排序 | `core/knowledgeBase.ts` | 支持按 `domain` 字段排序 |
| 存储配额管理 | `core/knowledgeBase.ts` / `knowledgeBaseBackground.ts` | `getStorageUsage`、`isStorageNearQuota`、`getStorageQuota` |
| 知识保存管理器 | `core/knowledge/knowledgeSaveManager.ts` | 智能路径分配、内容去重（指纹）、保存历史记录、合并到现有笔记 |
| 保存状态追踪器 | `core/knowledge/saveStateTracker.ts` | 追踪内容保存状态、指纹缓存、状态变更通知 |
| AI知识提取服务 | `core/knowledge-extraction/extractionService.ts` | 调用AI从正文中提取关键知识点 |
| 知识提取Prompt模板 | `core/knowledge-extraction/promptTemplate.ts` | 系统提示词和用户提示词模板 |
| 知识提取类型定义 | `core/knowledge-extraction/types.ts` | KnowledgeType、ExtractedKnowledge 等类型 |
| 知识点存储服务 | `core/knowledge-extraction/storageService.ts` | 将提取的知识点保存到知识库、支持合并或分别保存 |
| 知识点导出服务 | `core/knowledge-extraction/exportService.ts` | 导出为 Markdown/JSON 格式、下载文件 |
| NLP分词器 | `core/nlp/tokenizer.ts` | 中英文混合分词、n-gram、停用词过滤 |
| NLP相似度 | `core/nlp/similarity.ts` | 余弦相似度计算 |
| NLP TF-IDF | `core/nlp/tfidf.ts` | TF-IDF 向量化器 |
| 知识库搜索引擎 | `core/search/knowledgeBaseSearch.ts` | 基于 TF-IDF + 余弦相似度的语义搜索、增量索引、关联笔记推荐 |
| 知识库MCP工具 | `core/mcp/server/tools/knowledge-base.tool.ts` | search_notes、get_note、create_note、list_directories |
| 消息处理器 | `core/handlers/knowledge-base.handler.ts` | 浏览器扩展消息路由（aitu不需要，Web环境可直接调用） |

> **注意**：消息处理器 (`knowledge-base.handler.ts`) 和 `knowledgeBaseApi.ts` 中的 chrome.runtime.sendMessage 模式是浏览器扩展特有的通信机制（content script ↔ background service worker），aitu 作为 Web 应用不需要这层中间层，可以直接调用存储服务。

## 需求

### 需求 1：笔记元数据/正文分离存储

**用户故事：** 作为一名用户，我希望知识库在加载笔记列表时更快，以便在拥有大量笔记时仍保持流畅的使用体验

#### 验收标准

1. WHEN 知识库初始化加载笔记列表 THEN 系统 SHALL 仅加载笔记元数据（NoteMeta），不加载正文内容
2. WHEN 用户选中某篇笔记 THEN 系统 SHALL 按需加载该笔记的正文内容（NoteContent）
3. IF 当前使用 localforage 存储 THEN 系统 SHALL 将笔记拆分为 meta 和 content 两个独立的 store，或在现有 store 中实现惰性加载正文
4. WHEN 笔记列表展示 THEN 系统 SHALL 只使用 KBNoteMeta 类型数据（不含 content 字段），保证列表接口性能

### 需求 2：图片独立存储与处理

**用户故事：** 作为一名用户，我希望在笔记中粘贴或插入的图片能被正确保存和显示，以便笔记中的图文内容不会丢失

#### 验收标准

1. WHEN 用户在笔记编辑器中粘贴或插入 base64 图片 THEN 系统 SHALL 将 base64 图片提取并独立存储到 NoteImage store，正文中替换为引用 URL
2. WHEN 用户打开包含图片的笔记 THEN 系统 SHALL 将正文中的图片 URL 转换为 base64 进行显示
3. WHEN 笔记被删除 THEN 系统 SHALL 检查图片是否还被其他笔记引用，仅删除未被引用的图片
4. IF 多篇笔记引用同一张图片 THEN 系统 SHALL 仅存储一份图片数据（基于 hash 去重）
5. WHEN 用户手动触发清理 THEN 系统 SHALL 提供 `cleanupUnusedImages` 功能清理所有未被引用的图片

### 需求 3：来源URL元数据与Upsert

**用户故事：** 作为一名用户，我希望从外部导入或通过API创建的笔记能携带来源信息（如 sourceUrl、domain），并且同一来源的内容自动更新而非重复创建，以便保持知识库内容的整洁

#### 验收标准

1. WHEN 创建笔记时传入 metadata（含 sourceUrl、domain 等） THEN 系统 SHALL 将元数据持久化存储
2. WHEN 调用 upsertNoteBySourceUrl 且同目录下已存在相同 sourceUrl 的笔记 THEN 系统 SHALL 更新现有笔记（标题、正文、元数据），而非创建新笔记
3. WHEN 调用 upsertNoteBySourceUrl 且同目录下不存在相同 sourceUrl 的笔记 THEN 系统 SHALL 创建新笔记
4. IF 笔记元数据中包含 tags 字段 THEN 系统 SHALL 自动创建或关联标签
5. WHEN 批量创建笔记（batchCreateNotes） THEN 系统 SHALL 依次创建所有笔记并返回 ID 列表

### 需求 4：存储配额管理

**用户故事：** 作为一名用户，我希望了解知识库的存储空间使用情况，以便在空间不足时及时清理

#### 验收标准

1. WHEN 用户查看知识库存储信息 THEN 系统 SHALL 显示已使用空间、总配额和使用百分比
2. IF 存储使用率超过 80% THEN 系统 SHALL 显示警告提示
3. WHEN 用户需要释放空间 THEN 系统 SHALL 提供清理未使用图片的功能

### 需求 5：知识保存管理器（KnowledgeSaveManager）

**用户故事：** 作为一名用户，我希望保存内容到知识库时能自动去重和智能归档，以便避免重复内容并保持知识库条理清晰

#### 验收标准

1. WHEN 用户保存内容 THEN 系统 SHALL 基于内容指纹（DJB2 hash）检测重复，已存在的内容不重复保存
2. WHEN 保存内容且指定了 sourceUrl THEN 系统 SHALL 查找同 URL 笔记并追加内容（mergeIfExists 模式）
3. WHEN 保存新内容 THEN 系统 SHALL 根据内容类型自动推断目标目录（收集/翻译/AI收藏等）
4. WHEN 任何保存操作完成 THEN 系统 SHALL 记录到保存历史中，并缓存内容指纹用于快速去重
5. IF 用户设置 force=true THEN 系统 SHALL 跳过去重检查，强制保存

### 需求 6：保存状态追踪器（SaveStateTracker）

**用户故事：** 作为一名用户，我希望在操作界面上能实时看到内容的保存状态（未保存/保存中/已保存），以便知晓内容是否已被收录到知识库

#### 验收标准

1. WHEN 查询内容保存状态 THEN 系统 SHALL 返回状态（unsaved/saving/saved/duplicate/error）及关联信息
2. WHEN 内容正在保存 THEN 系统 SHALL 标记为 saving 状态，保存完成后更新为 saved
3. IF 状态缓存超过 5 分钟 THEN 系统 SHALL 重新检查实际保存状态
4. WHEN 保存状态变更 THEN 系统 SHALL 通知所有注册的监听器

### 需求 7：AI知识提取

**用户故事：** 作为一名用户，我希望能从一段文本中自动提取关键知识点，以便快速将长文内容结构化保存到知识库

#### 验收标准

1. WHEN 用户对笔记内容执行"知识提取" THEN 系统 SHALL 调用 AI 接口，从正文中提取 3-10 个知识点
2. WHEN AI 返回结果 THEN 系统 SHALL 将结果解析为结构化的知识点列表（标题、内容、类型、标签）
3. WHEN 知识点提取完成 THEN 用户 SHALL 能够选中/取消选中各知识点，并可选择合并为一篇笔记或分别保存
4. WHEN 用户确认保存 THEN 系统 SHALL 将选中的知识点保存到知识库的"知识提炼"目录
5. WHEN 用户选择导出 THEN 系统 SHALL 支持将知识点导出为 Markdown 或 JSON 格式文件

### 需求 8：NLP 分词与语义搜索

**用户故事：** 作为一名用户，我希望知识库的搜索功能更智能，能基于语义相关性返回结果，而不仅仅是关键词精确匹配，以便更容易找到相关内容

#### 验收标准

1. WHEN 系统初始化知识库搜索引擎 THEN 系统 SHALL 为所有笔记构建 TF-IDF 索引（含标题加权、元数据加权）
2. WHEN 知识库内容变化（增/删/改） THEN 系统 SHALL 增量同步索引，而非完整重建
3. WHEN 用户执行搜索 THEN 系统 SHALL 使用余弦相似度计算查询与文档的语义相关性，并按相似度排序返回
4. WHEN 用户查看某篇笔记 THEN 系统 SHALL 基于向量相似度推荐关联笔记
5. IF 搜索结果相似度低于阈值（默认 0.1） THEN 系统 SHALL 过滤掉该结果
6. WHEN 搜索返回结果 THEN 系统 SHALL 生成包含查询关键词上下文的智能摘要（snippet）

### 需求 9：知识库 MCP 工具

**用户故事：** 作为一名用户，我希望 AI 对话（MCP）能够查询和操作我的知识库，以便在与 AI 交互时能引用已保存的知识

#### 验收标准

1. WHEN AI 需要搜索知识库 THEN 系统 SHALL 提供 `search_notes` MCP 工具，返回匹配笔记的标题、摘要和元数据
2. WHEN AI 需要获取笔记详情 THEN 系统 SHALL 提供 `get_note` MCP 工具，返回完整笔记内容
3. WHEN AI 需要创建笔记 THEN 系统 SHALL 提供 `create_note` MCP 工具，支持指定目录、标签和来源URL
4. WHEN AI 需要了解知识库结构 THEN 系统 SHALL 提供 `list_directories` MCP 工具，返回所有目录列表

## 技术限制与适配说明

1. **存储层适配**：translate 使用原生 IndexedDB（通过 `idb` 库），aitu 使用 `localforage`。迁移时需在 localforage 基础上扩展或改为 `idb` 实现分表存储。
2. **通信层去除**：translate 的 `knowledgeBaseApi.ts`（content script 端）和 `knowledge-base.handler.ts`（background 端）是浏览器扩展的消息通信层，aitu 作为 Web 应用不需要此层，可直接调用存储服务。
3. **AI 接口适配**：translate 的知识提取通过 `chrome.runtime.sendMessage` 调用 AI，aitu 需要使用自身的 AI 服务接口（如 Gemini API）替代。
4. **MCP 适配**：aitu 已有自己的 MCP 工具框架，知识库 MCP 工具需按 aitu 的工具注册模式实现。
5. **ID 类型差异**：translate 使用 number (auto-increment) 作为 ID，aitu 使用 string (UUID)，需保持 aitu 现有 ID 策略。
