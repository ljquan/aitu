# 调整提示词面板位置

## 问题描述
当 AI 输入框同时显示提示词面板和选中元素预览时，两者会重叠，导致布局混乱。用户期望：
- 提示词面板紧贴输入框主体
- 选中元素预览可以显示在提示词面板之上

## 根本原因
- `PromptSuggestionPanel` 使用 `position: absolute; bottom: calc(100% + 8px)` 相对于整个 `.ai-input-bar` 容器定位
- `__content-preview` 是普通流元素，在 flex 布局中位于输入框上方  
- 两者都从容器底部向上堆叠，导致重叠

## 解决方案

### 修改 AIInputBar.tsx
将 `PromptSuggestionPanel` 从外层容器移到 `__container` 内部，使其相对于输入框主体定位：

```tsx
<div className="ai-input-bar">
  {/* 选中元素预览 - 在最上方 */}
  {selectedContent.length > 0 && (
    <div className="ai-input-bar__content-preview">...</div>
  )}
  
  {/* 输入框容器 */}
  <div className="ai-input-bar__container">
    {/* 提示词面板 - 相对于 container 定位 */}
    <PromptSuggestionPanel ... />
    
    <textarea ... />
    <button ... />
  </div>
</div>
```

### 修改 ai-input-bar.scss
给 `__container` 添加 `position: relative`，作为提示词面板的定位基准：

```scss
.ai-input-bar__container {
  position: relative; // 作为提示词面板的定位基准
  pointer-events: auto;
  display: flex;
  align-items: center;
  // ...
}
```

## 视觉效果
修改后的布局（从下到上）：

```
┌─────────────────────────────────────┐
│  选中元素预览                        │ ← 最上层（普通流）
│  [图] [视频] [文字]                  │
└─────────────────────────────────────┘
          ↑ 8px 间距
┌─────────────────────────────────────┐
│  提示词面板                          │ ← 相对于 container 定位
│  - 推荐提示词                        │
└─────────────────────────────────────┘
          ↑ 8px 间距
┌─────────────────────────────────────┐
│  输入框主体 (container)              │ ← 定位基准
│  [输入框................] [发送]     │
└─────────────────────────────────────┘
```

## 测试验证
- ✅ 无 linter 错误
- ✅ 构建成功
- 需要运行 `npm start` 手动测试界面效果

## 影响范围
- AIInputBar 组件的 DOM 结构调整
- 不影响功能逻辑
- 纯视觉布局优化
