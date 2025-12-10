# Feature Specification: 对话抽屉 (Chat Drawer)

**Feature Branch**: `001-chat-drawer`
**Created**: 2025-12-03
**Status**: Draft
**Input**: User description: "希望把UI改成上图所示,增加一个可展开收起的对话抽屉,支持使用对话模型实现连续对话。并能记录对话记录"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 基本对话交互 (Priority: P1)

用户希望在画板右侧看到一个可展开/收起的对话抽屉,能够与AI进行连续对话,获取创作帮助和建议。

**Why this priority**: 这是核心功能,提供了最基本的对话能力,是实现所有其他功能的基础。用户可以立即开始使用AI对话功能。

**Independent Test**: 可以通过点击抽屉开关按钮,输入消息并接收AI回复来完全测试。能独立提供AI对话辅助的价值,无需依赖其他功能。

**Acceptance Scenarios**:

1. **Given** 用户在画板界面,**When** 用户点击右侧的抽屉展开按钮,**Then** 对话抽屉从右侧滑出显示
2. **Given** 对话抽屉已展开,**When** 用户点击收起按钮,**Then** 抽屉滑回收起状态
3. **Given** 对话抽屉已展开,**When** 用户在输入框输入消息并发送,**Then** 消息显示在对话区域,AI开始处理并返回回复
4. **Given** AI正在处理消息,**When** 用户等待,**Then** 显示"正在理解需求并梳理您提供的材料"的加载状态
5. **Given** 对话进行中,**When** 用户继续发送新消息,**Then** 保持上下文连续性,AI基于历史对话回复

---

### User Story 2 - 对话历史持久化 (Priority: P2)

用户希望对话记录能够保存,刷新页面或关闭应用后重新打开仍能看到之前的对话历史。

**Why this priority**: 提升用户体验,避免重复沟通,让用户可以回顾之前的对话内容和AI建议。这是P1功能的重要增强。

**Independent Test**: 可以通过创建对话、刷新页面、验证对话历史是否保留来独立测试。提供数据持久化价值。

**Acceptance Scenarios**:

1. **Given** 用户已进行多轮对话,**When** 用户刷新页面,**Then** 打开抽屉后能看到完整的历史对话记录
2. **Given** 用户关闭浏览器,**When** 用户重新打开应用,**Then** 对话历史仍然保留
3. **Given** 对话历史很长,**When** 用户滚动查看,**Then** 能流畅浏览所有历史消息

---

### User Story 3 - 多会话管理 (Priority: P3)

用户希望能够创建多个独立的对话会话,在不同话题或项目之间切换,每个会话独立保存对话历史。

**Why this priority**: 让用户能够组织不同的对话主题,避免不同话题的对话混杂在一起。这是高级功能,P1和P2已经能提供基本价值。

**Independent Test**: 可以通过创建新会话、切换会话、验证各会话独立性来测试。提供对话组织管理价值。

**Acceptance Scenarios**:

1. **Given** 用户在当前会话中,**When** 用户点击"新建会话",**Then** 创建一个空白会话,之前的会话保留
2. **Given** 存在多个会话,**When** 用户切换到不同会话,**Then** 显示对应会话的历史记录
3. **Given** 用户在会话列表,**When** 用户查看会话,**Then** 能看到会话的标题/预览和创建时间
4. **Given** 用户选中某个会话,**When** 用户删除会话,**Then** 该会话及其历史记录被移除

---

### User Story 4 - 消息操作功能 (Priority: P4)

用户希望能够对AI的回复进行操作,如复制内容、重新生成回复等。

**Why this priority**: 提升使用便利性,让用户能够更好地利用AI生成的内容。这是锦上添花的功能。

**Independent Test**: 可以通过对消息执行复制、重新生成等操作来测试。提供内容操作便利性价值。

**Acceptance Scenarios**:

1. **Given** AI已回复消息,**When** 用户点击复制按钮,**Then** 消息内容复制到剪贴板
2. **Given** AI已回复消息,**When** 用户点击重新生成,**Then** AI基于同样的用户输入生成新的回复
3. **Given** 用户对某条回复不满意,**When** 用户点击"停止生成",**Then** AI停止当前回复的生成

---

### Edge Cases

- 当网络断开时,用户发送消息会发生什么？（应显示错误提示,消息保留在输入框）
- 当对话历史非常长（如100+条消息）时,性能如何？（应实现虚拟滚动或分页加载）
- 当用户快速连续发送多条消息时,如何处理？（应排队处理,显示加载状态）
- 当抽屉展开时占用大量屏幕空间,画板区域过小怎么办？→ 抽屉宽度自适应（视口30%,最小320px,最大500px）
- 当localStorage存储空间不足时,历史记录如何处理？（应限制历史记录数量,或提供清理选项）
- 移动设备上抽屉如何显示？→ 全屏覆盖模式,抽屉打开时覆盖整个屏幕

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统必须在界面右侧提供一个可展开/收起的抽屉组件
- **FR-002**: 系统必须在抽屉中显示对话消息列表,区分用户消息和AI消息
- **FR-003**: 系统必须提供消息输入框,支持文本输入和发送
- **FR-004**: 系统必须支持连续对话,保持对话上下文
- **FR-005**: 系统必须支持流式响应,AI回复以逐字符/逐词方式实时显示,并在开始前显示加载状态（如"正在理解需求并梳理您提供的材料"）
- **FR-006**: 系统必须将对话历史持久化存储在浏览器本地
- **FR-007**: 系统必须在应用重新加载后恢复对话历史
- **FR-008**: 系统必须支持创建多个独立的对话会话
- **FR-009**: 系统必须提供会话列表,显示会话标题（从首条用户消息自动截取生成）和时间
- **FR-010**: 系统必须支持切换和删除会话
- **FR-011**: 系统必须集成对话模型API（使用现有的AI服务配置）
- **FR-012**: 抽屉展开/收起动画必须流畅自然
- **FR-013**: 消息列表必须自动滚动到最新消息
- **FR-014**: 系统必须在消息发送失败时显示错误提示
- **FR-015**: 系统必须提供附件上传功能（回形针图标）,支持上传图片、文档和文件,附件将发送给AI进行分析
- **FR-016**: 系统必须提供暂停生成按钮（如图中的暂停图标）
- **FR-017**: 系统必须在移动设备上以全屏覆盖模式显示对话抽屉
- **FR-018**: 桌面端抽屉宽度必须自适应（视口宽度的30%,最小320px,最大500px）

### Key Entities

- **ChatSession（对话会话）**: 代表一个独立的对话,包含会话ID、标题（从首条用户消息自动生成,截取前30字符）、创建时间、最后更新时间
- **ChatMessage（对话消息）**: 代表单条消息,包含消息ID、所属会话ID、角色（用户/AI）、内容、时间戳、状态（发送中/成功/失败）、附件列表（可选,包含文件名、类型、大小、数据）
- **DrawerState（抽屉状态）**: 代表抽屉的UI状态,包含是否展开、宽度（默认为视口宽度的30%,最小320px,最大500px）、当前活跃会话ID

## Clarifications

### Session 2025-12-03

- Q: Should AI responses stream incrementally or appear all at once? → A: Stream responses token-by-token as AI generates them (progressive display)
- Q: How should session titles be generated? → A: Auto-generate title from first user message content (truncate if long)
- Q: What is the scope of attachment functionality? → A: Full attachment support - images, documents, and files sent to AI for analysis
- Q: How should the drawer behave on mobile devices? → A: Full-screen overlay - drawer covers entire screen when opened on mobile
- Q: What should be the default drawer width on desktop? → A: Adaptive - 30% of viewport width (min 320px, max 500px)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 用户能够在1秒内展开/收起对话抽屉
- **SC-002**: 用户发送消息后,AI回复的首字节响应时间不超过3秒
- **SC-003**: 对话历史能够存储至少50个会话,每个会话至少100条消息
- **SC-004**: 抽屉展开/收起动画流畅,帧率保持在60fps
- **SC-005**: 90%的用户能够在首次使用时成功完成一次对话交互
- **SC-006**: 页面刷新后,对话历史恢复时间不超过500毫秒
- **SC-007**: 支持移动端和桌面端响应式布局,在不同屏幕尺寸下正常使用
