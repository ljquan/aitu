# 调整为两行布局：选中元素在第一行，输入框在第二行

## 需求
参考用户提供的设计图，调整布局为：
- **第一行**：选中元素缩略图（尺寸更小：64×64px）
- **第二行**：输入框 + 发送按钮

当没有选中内容时，保持单行横向布局（药丸形状）。

## 实现方案

### 1. DOM 结构调整 (AIInputBar.tsx)

#### 添加 `__input-row` 容器
将 textarea 和发送按钮包裹在新容器中：

```tsx
<div className={classNames('ai-input-bar__container', {
  'ai-input-bar__container--has-content': selectedContent.length > 0
})}>
  {/* PromptSuggestionPanel */}
  
  {/* 第一行：选中内容预览 */}
  {selectedContent.length > 0 && (
    <div className="ai-input-bar__content-preview">...</div>
  )}
  
  {/* 第二行：输入框和发送按钮 */}
  <div className="ai-input-bar__input-row">
    <textarea />
    <button />
  </div>
</div>
```

### 2. 样式调整 (ai-input-bar.scss)

#### `__container` 动态布局
```scss
&__container {
  display: flex;
  flex-direction: row;    // 默认横向（无内容时）
  align-items: center;
  gap: 12px;
  border-radius: 48px;    // 药丸形状
  padding: 8px 12px 8px 16px;

  // 有选中内容时，切换为垂直布局
  &--has-content {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    border-radius: 24px;   // 更方形的圆角
    padding: 12px 16px;
  }
}
```

#### `__content-preview` 第一行
```scss
&__content-preview {
  display: flex;
  flex-wrap: wrap;        // 允许换行
  gap: 8px;
  width: 100%;           // 占满第一行
  background: transparent;
}
```

#### `__content-item` 尺寸调整
```scss
&__content-item {
  width: 64px;           // 参考截图尺寸
  height: 64px;
  border-radius: 12px;   // 更圆润

  &--graphics {
    border: 2px solid $orange-primary;
  }

  &--text {
    width: auto;
    min-width: 64px;
    max-width: 180px;
    height: 64px;
    padding: 8px 12px;
  }
}
```

#### `__input-row` 第二行
```scss
&__input-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
```

#### 移动端适配
```scss
@media (max-width: 640px) {
  &__content-item {
    width: 56px;
    height: 56px;
    
    &--text {
      height: 56px;
      min-width: 56px;
      max-width: 140px;
    }
  }
}
```

## 视觉效果对比

### 无选中内容（单行）
```
┌──────────────────────────────────┐
│ [输入框..................] [发送] │ ← 药丸形状
└──────────────────────────────────┘
```

### 有选中内容（两行）
```
┌─────────────────────────────────────┐
│ [图形][图片][图片][文字: 场景...]   │ ← 第一行：缩略图
│                                     │
│ [输入框..................] [发送]  │ ← 第二行：输入区
└─────────────────────────────────────┘
```

## 技术要点

1. **条件类名**：使用 `classNames` 根据 `selectedContent.length` 动态添加 `--has-content` 修饰符
2. **Flexbox 切换**：通过 `flex-direction` 在 `row`/`column` 之间切换
3. **边框圆角适配**：无内容时 48px（药丸），有内容时 24px（矩形）
4. **兼容性**：避免使用 `:has()` 伪类，改用 BEM 修饰符

## 优势
- ✅ 更清晰的视觉层次
- ✅ 缩略图有更多展示空间
- ✅ 输入框宽度不受缩略图挤压
- ✅ 符合用户提供的参考设计
- ✅ 平滑的状态切换

## 测试要点
- ✅ 无 linter 错误
- 需要测试：
  - 无选中内容时的单行布局
  - 有选中内容时的两行布局
  - 多个缩略图的换行效果
  - 不同类型（图片、视频、文字、图形）的展示
  - 提示词面板的位置
  - 移动端响应式
