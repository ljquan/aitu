# Feature Specification: 统一左侧工具栏容器

**Feature Branch**: `001-unified-toolbar`
**Created**: 2025-12-01
**Status**: Draft
**Input**: User description: "优化按钮布局,把app-toolbar/draw-toolbar/zoom-toolbar/theme-toolbar/通过分区放在一个UI容器里,这个容器固定在页面左侧"

## Clarifications

### Session 2025-12-01

- Q: How should toolbar sections be visually separated? → A: Horizontal divider lines between sections (1px border)
- Q: How should the toolbar behave when window height is insufficient? → A: Toolbar collapses to icon-only mode
- Q: Should keyboard shortcuts be affected by the toolbar layout change? → A: All keyboard shortcuts remain unchanged

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 快速访问所有工具 (Priority: P1)

用户在使用 Aitu 白板时,需要能够在固定的左侧位置快速找到并访问所有核心工具,包括应用菜单、创作工具、缩放控制和主题切换。

**Why this priority**: 这是核心的用户体验改进,直接影响用户的工作效率和工具可发现性。统一的工具栏位置让用户形成肌肉记忆,减少寻找工具的时间。

**Independent Test**: 可以通过打开应用并验证所有工具按钮是否在左侧容器中垂直排列来独立测试,用户无需执行任何绘图操作即可验证工具栏布局。

**Acceptance Scenarios**:

1. **Given** 用户打开 Aitu 白板应用, **When** 页面加载完成, **Then** 用户应该在页面左侧看到一个统一的垂直工具栏容器,包含所有工具分区
2. **Given** 用户在使用白板时, **When** 用户在画布上滚动或缩放, **Then** 左侧工具栏容器保持固定位置不移动
3. **Given** 用户在桌面浏览器中使用应用, **When** 用户查看工具栏, **Then** 工具栏应该包含四个清晰分隔的区域:应用工具、创作工具、缩放工具和主题选择

---

### User Story 2 - 清晰的工具分组 (Priority: P2)

用户需要能够通过视觉分隔清楚地区分不同功能类别的工具,以便快速定位所需功能。

**Why this priority**: 良好的视觉组织能提升用户体验,但不影响功能可用性。用户可以通过逐步熟悉工具位置来适应新布局。

**Independent Test**: 可以通过检查工具栏中是否存在视觉分隔符(如分割线或间距)来独立测试,不需要与其他功能交互。

**Acceptance Scenarios**:

1. **Given** 用户查看左侧工具栏, **When** 用户观察不同工具组之间, **Then** 应该看到 1px 水平分割线,区分应用工具、创作工具、缩放工具和主题工具
2. **Given** 用户第一次使用新布局, **When** 用户需要查找特定功能, **Then** 用户应该能够根据分区快速定位到正确的工具组(例如,主题在底部,缩放在主题上方)

---

### User Story 3 - 移动端适配保持 (Priority: P3)

移动设备用户的工具栏布局应保持现有行为,不受桌面端统一工具栏的影响。

**Why this priority**: 移动端已有优化的布局,改动风险较大且影响范围有限。保持现状可以确保移动用户体验不受影响,同时专注于桌面端优化。

**Independent Test**: 可以通过在移动设备或移动模拟器中打开应用并验证工具栏位置与现有布局一致来独立测试。

**Acceptance Scenarios**:

1. **Given** 用户在移动设备上打开 Aitu 白板, **When** 页面加载完成, **Then** 工具栏布局应保持现有移动端样式(应用工具在底部,创作工具在顶部)
2. **Given** 用户在桌面端和移动端之间切换, **When** 用户观察工具栏布局, **Then** 两个平台应分别显示各自优化的布局,互不影响

---

### Edge Cases

- 当浏览器窗口高度小于工具栏总高度时,工具栏自动切换到图标模式(隐藏文本标签),保持所有工具可访问
- 当用户使用非常小的笔记本屏幕(如 1366x768)时,左侧固定工具栏是否会遮挡过多画布内容?
- 工具栏切换到左侧后,所有现有键盘快捷键(撤销、重做、缩放等)保持完全相同,不受布局变化影响

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统必须创建一个新的统一工具栏容器组件,将 app-toolbar、draw-toolbar(creation-toolbar)、zoom-toolbar 和 theme-toolbar 集成到一个垂直布局中
- **FR-002**: 统一工具栏容器必须固定在页面左侧,距离左边缘 36px,距离顶部 36px
- **FR-003**: 工具栏内部必须按照自上而下的顺序排列四个分区:应用工具(app-toolbar)、创作工具(draw-toolbar)、缩放工具(zoom-toolbar)、主题选择(theme-toolbar)
- **FR-004**: 每个工具分区之间必须使用 1px 水平分割线进行视觉分隔
- **FR-005**: 在桌面端(非移动设备),原有的独立工具栏位置样式必须被禁用,所有工具必须从统一容器中渲染
- **FR-006**: 在移动端,必须保持现有的工具栏布局和行为不变,不应用统一左侧工具栏
- **FR-007**: 统一工具栏容器必须使用与现有工具栏相同的 Island 样式组件,保持视觉一致性
- **FR-008**: 工具栏内的所有现有功能(菜单、撤销/重做、工具选择、缩放、主题切换)必须保持完全相同的交互行为
- **FR-009**: 工具栏必须使用 ATTACHED_ELEMENT_CLASS_NAME 类名,确保不会干扰画布交互
- **FR-010**: 当浏览器窗口高度不足以完整显示工具栏时,工具栏必须自动切换到图标模式(仅显示图标,隐藏文本标签),确保所有工具仍然可访问
- **FR-011**: 所有现有键盘快捷键(包括撤销、重做、工具选择、缩放等)必须保持不变,不受工具栏布局重组影响

### Key Entities

- **UnifiedToolbar**: 新的统一工具栏容器组件,包含四个工具分区的垂直布局
- **ToolbarSection**: 工具栏分区,每个分区包含一组相关的工具按钮(应用工具、创作工具、缩放工具、主题工具)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 用户在桌面端能够在固定的左侧位置(距左边缘 36px)找到所有工具,不需要在页面不同位置寻找
- **SC-002**: 工具栏布局从分散的四个位置(左上、中上、右上、右下)减少到单一固定位置(左侧垂直栏)
- **SC-003**: 移动端用户体验保持不变,所有现有移动端工具栏功能和位置与改动前完全一致
- **SC-004**: 所有工具栏功能(撤销、重做、工具选择、缩放、主题切换)的响应时间和行为与改动前完全一致
