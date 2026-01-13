# 埋点完整性报告 (Tracking Coverage Report)

生成时间: 2026-01-06

## 概述 (Overview)

本次检查对所有包含 `onClick` 事件处理器的组件进行了系统性审查,确保所有用户交互都包含了声明式埋点追踪 (`data-track` 属性)。

**总计新增埋点事件: 79 个**

---

## 一、聊天相关组件 (Chat Components) - 8 events

### 1. ChatDrawerTrigger.tsx
- `chat_click_drawer_open` - 打开对话抽屉
- `chat_click_drawer_close` - 收起对话抽屉

### 2. SessionList.tsx
- `chat_click_session_new` - 新建会话按钮

### 3. SessionItem.tsx
- `chat_click_session_select` - 选择会话
- `chat_click_session_delete` - 删除会话

### 4. ChatDrawer.tsx
- `chat_click_sessions_toggle` - 切换会话列表
- `chat_click_new_session` - 新对话按钮
- `chat_click_drawer_close` - 关闭按钮

### 5. ModelSelector.tsx
- `chat_click_model_selector` - 打开模型选择器
- `chat_click_model_select` - 选择模型

**聊天组件小计: 10 个事件**
(注: 原始统计为 8 个,实际为 10 个)

---

## 二、任务队列组件 (Task Queue Components) - 14 events

### 1. TaskItem.tsx
- `task_click_preview` - 预览图片/视频
- `task_click_delete` - 删除任务
- `task_click_retry` - 重试失败任务
- `task_click_insert` - 插入到画板
- `task_click_download` - 下载结果
- `task_click_cache` - 缓存/删除缓存
- `task_click_edit` - 编辑任务

### 2. TaskQueuePanel.tsx
- `task_click_panel_close` - 关闭面板
- `task_click_clear_failed` - 清除失败任务
- `task_click_backdrop_close` - 点击背景关闭
- `task_click_preview_previous` - 上一个预览
- `task_click_preview_next` - 下一个预览

### 3. TaskToolbar.tsx
- `task_click_fab_toggle` - 切换任务面板 (悬浮按钮)

### 4. TaskSummary.tsx
- `task_click_summary` - 点击任务摘要

**任务队列组件小计: 14 个事件**

---

## 三、对话框组件 (Dialog Components) - 21 events

### 1. ttd-dialog-panel.tsx
- `ttd_click_panel_action` - TTD 对话框面板操作按钮

### 2. ai-image-generation.tsx
- `ai_click_image_clear` - 清除生成的图片
- `ai_click_image_insert` - 插入图片到画板
- `ai_click_image_download` - 下载图片

### 3. ai-video-generation.tsx
- `ai_click_video_clear` - 清除生成的视频
- `ai_click_video_insert` - 插入视频到画板
- `ai_click_video_download` - 下载视频

### 4. settings-dialog.tsx
- `settings_click_cancel` - 取消设置
- `settings_click_save` - 保存设置

### 5. dialog.tsx (通用对话框组件)
- `dialog_click_close` - 关闭对话框

### 6. shared/ActionButtons.tsx
- `ai_click_quantity_input` - 点击数量输入框
- `ai_click_quantity_toggle` - 切换数量下拉菜单
- `ai_click_quantity_select` - 选择数量预设值
- `ai_click_generate` - 生成内容
- `ai_click_reset` - 重置表单

### 7. shared/AspectRatioSelector.tsx
- `ai_click_ratio_toggle` - 打开比例选择器 (compact 模式)
- `ai_click_ratio_select` - 选择图片比例 (两种模式共用)

### 8. shared/PromptInput.tsx
- `ai_click_prompt_preset` - 选择预设提示词

### 9. shared/ImageUpload.tsx
- `ai_click_image_remove` - 移除上传的图片

### 10. shared/MultiImageUpload.tsx
- `ai_click_image_remove` - 移除多图上传的图片

**对话框组件小计: 21 个事件**

---

## 四、其他交互组件 (Other Interactive Components) - 4 events

### 1. size-slider.tsx
- `toolbar_click_size_slider` - 点击尺寸滑块

### 2. video.component.tsx
- `video_click_open` - 点击视频打开 (错误状态)
- `video_click_open` - 点击视频打开 (正常状态)

### 3. color-picker.tsx
- `toolbar_click_color_select` - 选择颜色

**其他组件小计: 4 个事件**

---

## 五、新增功能组件 (New Feature Components) - 32 events

### 1. Popup Toolbar (popup-toolbar.tsx)
- `toolbar_click_ai_image` - AI 图片生成
- `toolbar_click_delete` - 删除
- `toolbar_click_layer_up` - 上移一层
- `toolbar_click_layer_down` - 下移一层
- `toolbar_click_layer_top` - 置顶
- `toolbar_click_layer_bottom` - 置底
- `toolbar_click_duplicate` - 复制
- `toolbar_click_align_top` - 顶对齐
- `toolbar_click_align_bottom` - 底对齐
- `toolbar_click_align_left` - 左对齐
- `toolbar_click_align_right` - 右对齐
- `toolbar_click_align_center_h` - 水平居中
- `toolbar_click_align_center_v` - 垂直居中
- `toolbar_click_distribute_h` - 水平分布
- `toolbar_click_distribute_v` - 垂直分布
- `toolbar_click_group` - 组合
- `toolbar_click_ungroup` - 解组

### 2. AI Input Bar (AIInputBar.tsx)
- `ai_input_focus_textarea` - 输入框聚焦 (Manual)
- `ai_input_blur_textarea` - 输入框失焦 (Manual)
- `ai_input_submit_keyboard` - 键盘回车提交 (Manual)
- `ai_input_click_send` - 点击发送按钮
- `ai_input_select_model_at_suggestion` - 点击 @ 建议选择模型
- `ai_input_select_model_at_keyboard` - 键盘选择 @ 建议模型 (Manual)
- `ai_input_change_model_dropdown` - 切换模型下拉菜单 (Manual)

### 3. Chat Drawer Updates (ChatDrawer.tsx)
- `chat_session_create` - 创建新会话 (Manual)
- `chat_session_select` - 选择会话 (Manual)
- `chat_session_delete` - 删除会话 (Manual)
- `chat_session_rename` - 重命名会话 (Manual)
- `chat_message_send` - 发送消息 (Manual)
- `chat_workflow_retry` - 重试工作流 (Manual)
- `chat_tool_execution_start` - 工具执行开始 (Manual)
- `chat_tool_execution_complete` - 工具执行完成 (Manual)

**新增功能组件小计: 32 个事件**

---

## 埋点命名规范 (Naming Convention)

所有埋点事件遵循统一命名规范:

```
{area}_{action}_{target}
```

### 区域前缀 (Area Prefixes)
- `chat_` - 聊天相关功能
- `task_` - 任务队列相关功能
- `ai_` - AI 生成相关功能
- `settings_` - 设置相关功能
- `dialog_` - 通用对话框
- `ttd_` - Text-to-Diagram 功能
- `toolbar_` - 工具栏相关功能
- `video_` - 视频组件

### 操作类型 (Actions)
- `click_` - 点击操作 (所有事件都使用此操作)

### 目标描述 (Targets)
- 使用下划线分隔的描述性名称 (snake_case)
- 例如: `drawer_open`, `model_select`, `quantity_input`

---

## 统计总结 (Statistics Summary)

| 组件类别 | 文件数量 | 事件数量 |
|---------|---------|---------|
| 聊天组件 | 5 | 10 |
| 任务队列组件 | 4 | 14 |
| 对话框组件 | 10 | 21 |
| 其他交互组件 | 3 | 4 |
| **总计** | **22** | **49** |

---

## 覆盖率分析 (Coverage Analysis)

### ✅ 已完成检查的组件类别

1. **Chat Drawer** - 所有聊天抽屉相关组件
2. **Task Queue** - 所有任务队列相关组件
3. **TTD Dialog** - Text-to-Diagram 对话框及其共享组件
4. **Settings Dialog** - 设置对话框
5. **Generic Dialog** - 通用对话框基础组件
6. **Toolbar Components** - 工具栏交互组件 (滑块、颜色选择器)
7. **Video Component** - 视频组件交互

### 已排除的组件

以下组件在检查中未发现 `onClick` 事件处理器:
- `font-size-button.tsx`
- `menu-item.tsx`
- `menu-item-link.tsx`
- `generation-history.tsx`
- `video-frame-selector.tsx`
- `clean-confirm.tsx`

---

## 技术实现细节 (Technical Implementation)

### 声明式埋点系统

所有埋点使用标准 HTML `data-track` 属性:

```tsx
// ✅ 正确用法
<button data-track="chat_click_drawer_open" onClick={handleClick}>
  打开对话
</button>

// ✅ 动态埋点
<button
  data-track={isOpen ? 'chat_click_drawer_close' : 'chat_click_drawer_open'}
  onClick={handleToggle}
>
  {isOpen ? '收起' : '展开'}
</button>
```

### 事件捕获机制

埋点系统通过 `tracking-service.ts` 自动捕获所有带有 `data-track` 属性的点击事件:

```typescript
// packages/drawnix/src/services/tracking/tracking-service.ts
const trackElement = target.closest('[data-track]');
const eventName = trackElement.getAttribute('data-track');
```

### 批量上传

- 每 10 个事件或每 5 秒自动上传
- 使用防抖机制,1 秒内重复点击只记录一次
- WeakMap 实现防抖,避免内存泄漏

---

## 后续建议 (Recommendations)

### 1. 工具栏组件完整性验证

虽然工具栏组件在之前已经添加了 30 个埋点 (参考 `TOOLBAR_TRACKING.md`),建议再次验证:

```bash
# 验证工具栏埋点
grep -r "data-track=" packages/drawnix/src/components/toolbar/ | wc -l
```

### 2. 单元测试覆盖

为关键埋点添加单元测试,确保:
- `data-track` 属性正确渲染
- 事件名称符合命名规范
- 动态埋点逻辑正确

### 3. E2E 测试

添加端到端测试验证埋点数据正确发送:
- 模拟用户交互
- 验证 Umami 接收到正确的事件名称和元数据

### 4. 文档更新

将埋点规范添加到 `CLAUDE.md` 的 Analytics & Tracking 章节 (已完成)

---

## 检查清单 (Checklist)

- [x] 检查聊天相关组件的 onClick 埋点
- [x] 检查任务队列组件的 onClick 埋点
- [x] 检查对话框组件的 onClick 埋点
- [x] 检查其他交互组件的 onClick 埋点
- [x] 生成埋点完整性报告

---

## 相关文档 (Related Documentation)

- `specs/005-declarative-tracking/TOOLBAR_TRACKING.md` - 工具栏埋点文档 (30 events)
- `specs/005-declarative-tracking/SIMPLIFICATION.md` - 从 `track` 到 `data-track` 的简化过程
- `specs/005-declarative-tracking/INTEGRATION.md` - 声明式埋点集成指南
- `CLAUDE.md` - Analytics & Tracking 开发规范

---

**报告生成者: Trae AI**
**最后更新: 2026-01-06**
