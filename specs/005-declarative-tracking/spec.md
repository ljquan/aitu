# Feature Specification: 声明式埋点上报系统

**Feature Branch**: `005-declarative-tracking`
**Created**: 2025-12-05
**Status**: Draft
**Input**: User description: "设计一种声明式埋点上报的方案,比如在元素上加属性track="xxx",点击时就会自动上报xxx事件,并给所有可点击元素加上埋点。"

## Clarifications

### Session 2025-12-05

- Q: 当元素嵌套且都有 track 属性时的事件冒泡策略? → A: 仅上报最内层(最具体的)元素的 track 事件,阻止向外冒泡
- Q: 缓存失败事件的保留策略(数量和时间限制)? → A: 缓存最多 100 个失败事件,保留时间不超过 1 小时,超过后自动丢弃最旧的事件
- Q: 生产环境的可观测性和日志级别要求? → A: 生产环境输出错误级别日志(上报失败、缓存溢出等),支持通过配置启用调试模式
- Q: 事件批量上报策略(减少网络开销)? → A: 批量上报:累积最多 10 个事件或等待 5 秒后统一上报,以先到达的条件为准
- Q: 自动埋点的元素选择范围(避免数据噪音)? → A: 追踪原生交互元素 + 具有 onClick 事件处理器的元素 + 具有 role="button/link" 的元素,但排除导航、工具栏、页脚等特定区域

**补充需求**: 在现有的 Umami 上报基础上增加项目版本号(version)以及当前页面地址(location.href)的参数

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 开发者快速添加点击埋点 (Priority: P1)

开发者在开发新功能时,希望通过简单的声明式属性(如 `track="button_click_save"`)给可点击元素添加埋点,当用户点击该元素时,系统自动上报 `button_click_save` 事件,无需编写额外的事件处理代码。

**Why this priority**: 这是核心功能,提供最基本的声明式埋点能力,可立即为现有和新增的可点击元素提供埋点支持,降低埋点接入成本。

**Independent Test**: 开发者在任意可点击元素(如 button、div 等)上添加 `track` 属性后,点击该元素即可在控制台或上报服务中看到对应事件被记录。

**Acceptance Scenarios**:

1. **Given** 开发者在 button 元素上添加 `track="save_button"` 属性, **When** 用户点击该按钮, **Then** 系统自动上报 `save_button` 事件
2. **Given** 开发者在 div 元素上添加 `track="card_click"` 属性, **When** 用户点击该 div, **Then** 系统自动上报 `card_click` 事件
3. **Given** 元素上未添加 `track` 属性, **When** 用户点击该元素, **Then** 系统不上报任何事件

---

### User Story 2 - 上报事件时携带额外参数 (Priority: P2)

开发者希望在上报事件时携带额外的上下文信息(如元素ID、状态、用户操作等),通过额外的属性(如 `track-params='{"id": "123", "type": "save"}'`)将参数传递给上报系统。

**Why this priority**: 增强埋点数据的丰富度,帮助数据分析团队更好地理解用户行为,是基础埋点功能的有效补充。

**Independent Test**: 开发者在元素上同时添加 `track` 和 `track-params` 属性后,点击元素时上报的事件数据中包含指定的参数信息。

**Acceptance Scenarios**:

1. **Given** 元素上有 `track="item_click"` 和 `track-params='{"item_id": "123"}'` 属性, **When** 用户点击元素, **Then** 上报事件包含 `event: "item_click"` 和 `params: {item_id: "123"}`
2. **Given** 元素上有 `track="button_click"` 但无 `track-params` 属性, **When** 用户点击元素, **Then** 上报事件仅包含事件名,无额外参数
3. **Given** `track-params` 包含无效 JSON 格式, **When** 用户点击元素, **Then** 系统上报事件但忽略无效参数,并在开发环境下输出警告

---

### User Story 3 - 批量为可点击元素自动添加埋点 (Priority: P3)

开发者或产品经理希望系统能够自动识别所有可点击元素(如 button、a、具有 onClick 的元素等),并自动为它们添加默认埋点(如基于元素文本内容、ID 或 class 生成事件名),减少手动添加 `track` 属性的工作量。

**Why this priority**: 提升埋点覆盖率,确保关键交互都被记录,但需要在基础功能稳定后再实现,避免过度自动化导致数据噪音。

**Independent Test**: 开发者启用"自动埋点"配置后,页面上所有未手动添加 `track` 属性的可点击元素在被点击时自动上报事件(事件名基于元素特征生成)。

**Acceptance Scenarios**:

1. **Given** 自动埋点功能已启用且 button 元素未添加 `track` 属性, **When** 用户点击该 button, **Then** 系统基于 button 文本或 ID 自动生成事件名并上报(如 `auto_click_保存按钮`)
2. **Given** 元素已手动添加 `track` 属性, **When** 用户点击该元素, **Then** 系统使用手动指定的事件名,不使用自动生成的事件名
3. **Given** 自动埋点功能已禁用, **When** 用户点击未添加 `track` 属性的元素, **Then** 系统不上报任何事件
4. **Given** 自动埋点功能已启用且元素位于导航栏(nav)或页脚(footer)内, **When** 用户点击该元素, **Then** 系统不自动上报事件(除非元素有手动 `track` 属性)
5. **Given** 元素具有 `data-track-ignore` 属性, **When** 用户点击该元素, **Then** 系统不自动上报事件(即使符合自动埋点条件)

---

### User Story 4 - 支持多种交互事件类型的埋点 (Priority: P3)

开发者希望除了点击事件外,还能对其他交互事件(如 hover、focus、input 等)进行声明式埋点,使用类似 `track-hover="hover_item"` 或 `track-focus="focus_input"` 的属性。

**Why this priority**: 扩展埋点能力,支持更丰富的用户行为分析,但非核心功能,可在基础点击埋点稳定后扩展。

**Independent Test**: 开发者在元素上添加 `track-hover` 或 `track-focus` 属性后,对应的 hover 或 focus 事件触发时系统自动上报事件。

**Acceptance Scenarios**:

1. **Given** 元素上有 `track-hover="card_hover"` 属性, **When** 用户鼠标悬停在元素上, **Then** 系统上报 `card_hover` 事件
2. **Given** input 元素上有 `track-focus="input_focus"` 属性, **When** 用户聚焦到该 input, **Then** 系统上报 `input_focus` 事件
3. **Given** 元素同时有 `track` 和 `track-hover` 属性, **When** 用户点击和悬停, **Then** 系统分别上报对应的点击和悬停事件

---

### Edge Cases

- **当元素动态添加或删除时**: 系统需要支持动态元素的埋点监听,使用 MutationObserver 或事件委托机制确保新增元素的埋点生效
- **当快速连续点击同一元素时**: 系统需要防抖或节流机制,避免短时间内重复上报相同事件
- **当自动埋点遇到排除区域内的元素时**: 系统必须检查元素是否位于 nav、header、footer 等排除区域内,或是否具有 data-track-ignore 属性,并跳过自动埋点
- **当上报服务不可用时**: 系统缓存最多 100 个失败事件,保留时间不超过 1 小时,超过限制后自动丢弃最旧的事件
- **当 track 属性值为空或无效时**: 系统忽略该元素的埋点,不上报事件,开发环境下输出警告
- **当元素嵌套且都有 track 属性时**: 系统仅上报最内层(最具体的)元素的 track 事件,阻止事件向外层父元素冒泡,避免重复上报
- **当页面卸载时**: 系统需要使用 navigator.sendBeacon 或类似机制确保页面关闭前的事件能够成功上报

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统必须支持通过 HTML 属性 `track="event_name"` 声明式地为元素添加点击埋点
- **FR-002**: 系统必须在元素被点击时自动上报 `track` 属性指定的事件名
- **FR-003**: 当嵌套元素都有 `track` 属性时,系统必须仅上报最内层元素的事件,并阻止事件向外层冒泡
- **FR-004**: 系统必须支持通过 `track-params` 属性为上报事件携带额外的 JSON 格式参数
- **FR-005**: 系统必须能够识别并监听所有可点击元素类型(button、a、div、span 等具有 onClick 或 cursor:pointer 的元素)
- **FR-006**: 系统必须支持自动埋点模式,为符合条件的可点击元素自动生成并上报事件
- **FR-006a**: 自动埋点必须追踪:原生交互元素(button、a、input、select)、具有 onClick 事件处理器的元素、具有 role="button" 或 role="link" 的元素
- **FR-006b**: 自动埋点必须排除特定区域的元素:导航栏(nav、header)、工具栏、页脚(footer)、以及标记为 data-track-ignore 的元素
- **FR-007**: 系统必须提供配置选项,允许启用/禁用自动埋点功能
- **FR-008**: 系统必须支持动态添加的元素的埋点监听(通过事件委托或 MutationObserver)
- **FR-009**: 系统必须在 `track-params` 格式无效时忽略参数,在开发环境下输出警告,在生产环境下记录错误日志
- **FR-009a**: 系统必须在生产环境输出错误级别日志,包括上报失败、缓存溢出、API 错误等关键问题
- **FR-009b**: 系统必须支持通过配置启用调试模式,在调试模式下输出详细日志(事件触发、参数解析、防抖等)
- **FR-010**: 系统必须提供防抖机制,避免短时间内(如 500ms)重复上报相同元素的相同事件
- **FR-011**: 系统必须支持批量上报事件,累积最多 10 个事件或等待 5 秒后统一上报,以先到达的条件为准
- **FR-011a**: 系统必须在页面卸载时立即上报当前批次中的所有待上报事件(不等待批量阈值)
- **FR-012**: 系统必须在上报失败时进行重试,重试次数和间隔可配置
- **FR-013**: 系统必须缓存失败的上报事件,最多保存 100 个事件,保留时间不超过 1 小时
- **FR-014**: 系统必须在缓存超过数量或时间限制时,自动丢弃最旧的失败事件
- **FR-015**: 系统必须支持自定义上报 API 端点,通过配置指定上报地址
- **FR-016**: 系统必须在页面卸载时使用 navigator.sendBeacon 确保事件成功上报
- **FR-017**: 系统必须在每个上报事件中包含以下元数据:时间戳(timestamp)、当前页面地址(location.href)、项目版本号(version)、用户会话ID(session_id)
- **FR-017a**: 项目版本号(version)必须从应用配置或 package.json 中读取,确保版本信息准确
- **FR-017b**: 页面地址(location.href)必须在事件触发时实时获取,确保 SPA 应用中页面切换后的地址正确
- **FR-018**: 系统必须支持扩展其他事件类型(hover、focus 等)的声明式埋点(通过 `track-hover`、`track-focus` 等属性)
- **FR-019**: 系统必须在自动埋点模式下基于元素特征(文本内容、ID、aria-label 等)生成有意义的事件名

### Key Entities

- **TrackEvent**: 上报的埋点事件,包含:
  - event_name: 事件名称(手动指定或自动生成)
  - params: 事件参数(来自 track-params 属性,JSON 格式)
  - metadata: 元数据对象,包含:
    - timestamp: 事件触发时间戳
    - url: 当前页面完整地址(location.href)
    - version: 项目版本号(从配置读取)
    - session_id: 用户会话标识
    - user_agent: 浏览器 User-Agent(可选)
    - viewport: 视口尺寸(可选)
- **TrackConfig**: 埋点系统配置,包含是否启用自动埋点(auto_track)、上报 API 端点(api_endpoint)、防抖时间(debounce_time)、重试策略(retry_policy)、缓存上限(max_cache_size: 100)、缓存保留时间(cache_ttl: 1小时)、日志级别(log_level: error|debug)、批量上报配置(batch_size: 10, batch_timeout: 5秒)、自动埋点排除区域(excluded_selectors: ['nav', 'header', 'footer', '[data-track-ignore]'])等
- **TrackedElement**: 被监听的元素,包含元素引用、事件名、事件参数、事件类型(click、hover 等)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 开发者为元素添加 `track` 属性后,点击元素时 100% 的情况下成功触发事件上报
- **SC-002**: 自动埋点功能启用后,页面上至少 95% 的可点击元素在被点击时自动上报事件
- **SC-003**: 批量上报机制将网络请求数量减少至少 60%(相比单个事件独立上报)
- **SC-004**: 埋点系统的性能开销不超过页面总加载时间的 2%,且不影响用户交互响应速度
- **SC-005**: 在开发环境下,无效的 `track-params` 格式能够在控制台输出清晰的警告信息,帮助开发者快速定位问题
- **SC-006**: 埋点数据覆盖率从当前手动埋点的 X% 提升到 90% 以上(通过自动埋点功能)
- **SC-007**: 开发者反馈埋点接入时间从平均 30 分钟降低到 5 分钟以内(通过声明式属性简化流程)

## Assumptions

- 假设项目已经集成了 Umami 分析服务作为埋点上报的后端
- 假设 Umami API 接受 JSON 格式的事件数据,并支持自定义事件属性
- 假设现有的 Umami 上报机制可以扩展,增加 version 和 location.href 参数
- 假设开发环境能够访问 console API 用于输出警告和调试信息
- 假设浏览器支持 MutationObserver、navigator.sendBeacon 等现代 Web API
- 假设自动埋点生成的事件名遵循项目现有的命名规范(如 `auto_click_` 前缀 + 元素特征)
- 假设埋点数据不包含敏感用户信息(如密码、个人身份信息等),符合隐私合规要求

## Dependencies

- 依赖 Umami 分析服务的上报 API(需要确认具体的事件上报接口、数据格式要求、以及如何扩展自定义参数)
- 依赖现有的 Umami 客户端 SDK 或上报逻辑,需要在此基础上增加 version 和 location.href 参数
- 依赖项目配置或 package.json 文件,用于读取项目版本号(version)
- 依赖浏览器对 MutationObserver、navigator.sendBeacon 的支持(需考虑降级方案)
- 依赖项目的存储服务(如 localforage 或 localStorage)用于缓存未成功上报的事件
