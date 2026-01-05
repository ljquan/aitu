# 将选中元素预览移入输入框内部

## 需求
参考用户提供的设计图，将选中元素的缩略图从输入框上方移到输入框内部左侧显示，类似聊天应用的附件展示方式。

## 实现方案

### 1. DOM 结构调整 (AIInputBar.tsx)
将 `__content-preview` 从外层容器移到 `__container` 内部，位于 textarea 之前：

**修改前：**
```tsx
<div className="ai-input-bar">
  <div className="__content-preview">...</div>  // 外层，独立区域
  <div className="__container">
    <textarea />
    <button />
  </div>
</div>
```

**修改后：**
```tsx
<div className="ai-input-bar">
  <div className="__container">
    <div className="__content-preview">...</div>  // 内层，左侧
    <textarea />
    <button />
  </div>
</div>
```

### 2. 样式调整 (ai-input-bar.scss)

#### `__content-preview` 样式重置
```scss
&__content-preview {
  display: flex;
  flex-wrap: nowrap;      // 不换行，横向排列
  gap: 6px;
  padding: 0;             // 移除内边距
  background: transparent; // 透明背景
  border-radius: 0;       // 无圆角
  box-shadow: none;       // 无阴影
  flex-shrink: 0;         // 不收缩
}
```

#### `__content-item` 尺寸调整
```scss
&__content-item {
  width: 48px;   // 从 36px 增大到 48px
  height: 48px;
  border-radius: 8px;  // 从 6px 增大到 8px，更圆润
  
  &--text {
    height: 48px;  // 固定高度，与其他类型一致
    min-width: 48px;
    padding: 6px 8px;
  }
}
```

#### `__container` 间距调整
```scss
&__container {
  gap: 12px;  // 从 8px 增大到 12px
  padding: 10px 12px 10px 16px;  // 调整内边距
}
```

#### 移动端响应式
```scss
@media (max-width: 640px) {
  &__content-item {
    width: 40px;   // 移动端稍小
    height: 40px;
    
    &--text {
      height: 40px;
      min-width: 40px;
    }
  }
}
```

## 视觉效果对比

### 修改前
```
┌─────────────────┐
│ [图][图][文]    │ ← 独立预览区域
└─────────────────┘
       ↓ 8px
┌─────────────────┐
│ [输入框] [发送] │
└─────────────────┘
```

### 修改后
```
┌────────────────────────────────┐
│ [图][图][文] [输入框...] [发送] │ ← 一体化设计
└────────────────────────────────┘
```

## 优势
1. **更紧凑**：减少垂直空间占用
2. **更直观**：附件与输入框视觉上是一个整体
3. **更现代**：符合主流聊天应用的交互模式
4. **更高效**：用户可以同时看到附件和输入内容

## 测试要点
- ✅ 无 linter 错误
- ✅ 构建成功
- 需要测试：
  - 多个元素时的横向排列效果
  - 不同类型（图片、视频、文字、图形）的展示
  - hover 预览功能是否正常
  - 移动端响应式表现
  - 提示词面板与缩略图的位置关系

## 兼容性
- 保留了所有原有功能（hover 预览、类型标签等）
- 不影响提示词面板的显示
- 响应式设计适配移动端
