# Quickstart: 统一左侧工具栏容器

**Feature**: 001-unified-toolbar | **Date**: 2025-12-01

## 开发前准备

### 1. 环境要求

```bash
# Node.js 18+ (项目要求)
node --version  # 应该显示 v18.x 或更高

# 检查依赖
npm install

# 验证TypeScript编译
nx typecheck drawnix
```

### 2. 理解现有架构

**阅读以下文件** (约15分钟):

```bash
# 现有工具栏实现
packages/drawnix/src/components/toolbar/app-toolbar/app-toolbar.tsx
packages/drawnix/src/components/toolbar/creation-toolbar.tsx
packages/drawnix/src/components/toolbar/zoom-toolbar.tsx
packages/drawnix/src/components/toolbar/theme-toolbar.tsx

# 主应用入口
packages/drawnix/src/drawnix.tsx

# 现有样式
packages/drawnix/src/styles/index.scss  # 查找 .app-toolbar, .draw-toolbar等
```

**关键点**:
- 四个工具栏当前使用绝对定位(`position: absolute`)
- 移动端通过 `@include isMobile` mixin应用不同样式
- 所有工具栏使用 `Island` 组件包裹
- 工具栏组件通过 `DrawnixContext` 访问 board 和 appState

---

## 开发流程

### Phase 1: 创建UnifiedToolbar组件骨架 (30分钟)

#### 1.1 创建组件文件

```bash
# 在正确的目录创建文件
touch packages/drawnix/src/components/toolbar/unified-toolbar.tsx
```

**unified-toolbar.tsx** 初始结构:

```typescript
import React, { useState, useCallback, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { ATTACHED_ELEMENT_CLASS_NAME } from '@plait/core';
import { Island } from '../island';
import { AppToolbar } from './app-toolbar/app-toolbar';
import { CreationToolbar } from './creation-toolbar';
import { ZoomToolbar } from './zoom-toolbar';
import { ThemeToolbar } from './theme-toolbar';

interface UnifiedToolbarProps {
  className?: string;
}

export const UnifiedToolbar: React.FC<UnifiedToolbarProps> = ({
  className
}) => {
  const [isIconMode, setIsIconMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // TODO: 添加ResizeObserver监听高度变化

  return (
    <div
      ref={containerRef}
      className={classNames(
        'unified-toolbar',
        ATTACHED_ELEMENT_CLASS_NAME,
        {
          'unified-toolbar--icon-only': isIconMode,
        },
        className
      )}
    >
      {/* TODO: 添加工具栏分区 */}
    </div>
  );
};
```

#### 1.2 添加基础样式

在 `packages/drawnix/src/styles/index.scss` 添加:

```scss
.unified-toolbar {
  position: absolute;
  left: 36px;
  top: 36px;
  display: flex;
  flex-direction: column;
  gap: 0; // 分割线通过border实现,不需要gap

  // 仅桌面端显示
  @include isMobile {
    display: none;
  }

  &__section {
    &:not(:first-child) {
      border-top: 1px solid var(--color-border);
      padding-top: 8px;
    }
  }

  &--icon-only {
    // 图标模式修饰符,后续添加子元素样式
  }
}
```

---

### Phase 2: 修改现有工具栏组件 (45分钟)

#### 2.1 添加embedded prop支持

以 `AppToolbar` 为例:

```typescript
// app-toolbar.tsx
interface AppToolbarProps {
  embedded?: boolean;  // [NEW] 是否嵌入统一容器
  iconMode?: boolean;  // [NEW] 是否图标模式
}

export const AppToolbar: React.FC<AppToolbarProps> = ({
  embedded = false,
  iconMode = false
}) => {
  // ...现有逻辑

  return (
    <Island
      padding={1}
      className={classNames('app-toolbar', ATTACHED_ELEMENT_CLASS_NAME, {
        'app-toolbar--embedded': embedded,
        'app-toolbar--icon-only': iconMode,
      })}
    >
      {/* 现有工具栏内容保持不变 */}
    </Island>
  );
};
```

**重复以上修改** 对所有4个工具栏组件:
- `creation-toolbar.tsx`
- `zoom-toolbar.tsx`
- `theme-toolbar.tsx`

#### 2.2 更新样式禁用独立定位

```scss
// index.scss
.app-toolbar {
  position: absolute;
  top: 36px;
  left: 36px;

  // [NEW] 嵌入模式禁用定位
  &--embedded {
    position: static;
    top: auto;
    left: auto;
  }

  @include isMobile {
    // 移动端样式保持不变
  }
}

// 对 .draw-toolbar, .zoom-toolbar, .theme-toolbar 重复相同模式
```

---

### Phase 3: 集成到主应用 (20分钟)

#### 3.1 修改drawnix.tsx

```typescript
// drawnix.tsx
import { UnifiedToolbar } from './components/toolbar/unified-toolbar';

// 在渲染部分替换工具栏
<Wrapper ...>
  <Board ...></Board>

  {/* [MODIFIED] 桌面端使用统一工具栏,移动端保持不变 */}
  {!appState.isMobile ? (
    <UnifiedToolbar />
  ) : (
    <>
      <AppToolbar />
      <CreationToolbar />
      <ZoomToolbar />
      <ThemeToolbar />
    </>
  )}

  {/* 其他组件保持不变 */}
  <PopupToolbar />
  <LinkPopup />
  {/* ... */}
</Wrapper>
```

---

### Phase 4: 实现响应式图标模式 (40分钟)

#### 4.1 添加ResizeObserver

在 `unified-toolbar.tsx`:

```typescript
// 计算阈值
const TOOLBAR_MIN_HEIGHT = 460; // 基于四个分区最小高度

useEffect(() => {
  const container = containerRef.current;
  if (!container) return;

  const observer = new ResizeObserver((entries) => {
    const height = entries[0].contentRect.height;
    setIsIconMode(height < TOOLBAR_MIN_HEIGHT);
  });

  observer.observe(container);
  return () => observer.disconnect();
}, []);
```

#### 4.2 传递iconMode prop

```typescript
return (
  <div ref={containerRef} className={...}>
    <AppToolbar embedded iconMode={isIconMode} />
    <CreationToolbar embedded iconMode={isIconMode} />
    <ZoomToolbar embedded iconMode={isIconMode} />
    <ThemeToolbar embedded iconMode={isIconMode} />
  </div>
);
```

#### 4.3 添加图标模式样式

```scss
.tool-button__label {
  display: inline-block;
  margin-left: 8px;
  transition: opacity 0.2s ease-out;

  // 图标模式隐藏文本
  .app-toolbar--icon-only &,
  .draw-toolbar--icon-only &,
  .zoom-toolbar--icon-only &,
  .theme-toolbar--icon-only & {
    display: none;
  }
}
```

---

### Phase 5: 测试 (30分钟)

#### 5.1 手动测试清单

```bash
# 启动开发服务器
npm start
```

**桌面端测试** (打开 http://localhost:4200):

- [ ] 工具栏是否在左侧垂直排列?
- [ ] 四个分区之间是否有1px分割线?
- [ ] 缩小浏览器高度,工具栏是否切换到图标模式?
- [ ] 恢复高度,是否恢复正常模式?
- [ ] 所有工具按钮是否仍然可点击?
- [ ] 撤销/重做快捷键(Cmd+Z/Cmd+Shift+Z)是否有效?

**移动端测试** (Chrome DevTools切换到移动设备):

- [ ] 工具栏是否保持原有位置(应用工具在底部,创作工具在顶部)?
- [ ] 布局是否与改动前完全一致?

#### 5.2 编写组件测试

```typescript
// packages/drawnix/tests/components/toolbar/unified-toolbar.test.tsx
import { render } from '@testing-library/react';
import { UnifiedToolbar } from '../../../src/components/toolbar/unified-toolbar';

describe('UnifiedToolbar', () => {
  it('should render all four toolbar sections', () => {
    const { container } = render(<UnifiedToolbar />);

    expect(container.querySelector('.app-toolbar')).toBeInTheDocument();
    expect(container.querySelector('.draw-toolbar')).toBeInTheDocument();
    expect(container.querySelector('.zoom-toolbar')).toBeInTheDocument();
    expect(container.querySelector('.theme-toolbar')).toBeInTheDocument();
  });

  it('should have vertical layout', () => {
    const { container } = render(<UnifiedToolbar />);
    const toolbar = container.querySelector('.unified-toolbar');

    expect(toolbar).toHaveStyle({ flexDirection: 'column' });
  });

  // TODO: 添加响应式测试
});
```

运行测试:

```bash
nx test drawnix
```

---

## 常见问题排查

### 问题1: 工具栏不显示

**检查**:
- [ ] 是否在桌面端?(移动端不显示UnifiedToolbar)
- [ ] CSS文件是否正确导入?
- [ ] 是否存在样式冲突?

**Debug**:
```javascript
// 在drawnix.tsx添加日志
console.log('isMobile:', appState.isMobile);
```

### 问题2: 工具栏位置不对

**检查**:
- [ ] `.unified-toolbar` 是否有 `position: absolute`?
- [ ] `left: 36px; top: 36px;` 是否正确应用?
- [ ] 是否有其他样式覆盖了定位?

### 问题3: 图标模式不工作

**检查**:
- [ ] ResizeObserver是否成功创建?
- [ ] isIconMode状态是否正确更新?
- [ ] iconMode prop是否传递给子组件?

**Debug**:
```javascript
// 在unified-toolbar.tsx添加日志
console.log('Container height:', height, 'Icon mode:', isIconMode);
```

### 问题4: 移动端布局被破坏

**检查**:
- [ ] 条件渲染逻辑是否正确?(`!appState.isMobile`)
- [ ] 移动端样式是否仍然应用?(`@include isMobile`)
- [ ] 是否意外修改了移动端特有的样式?

---

## 性能优化检查

运行完成后验证:

```bash
# TypeScript类型检查
nx typecheck drawnix

# Lint检查
nx lint drawnix

# 构建检查
nx build drawnix
```

**性能基准** (Chrome DevTools Performance tab):
- [ ] 工具栏首次渲染 < 16ms
- [ ] 响应式切换延迟 < 100ms
- [ ] 无Layout Shift警告

---

## 提交前清单

- [ ] 所有文件 < 500行
- [ ] TypeScript严格模式通过
- [ ] ESLint无错误
- [ ] 所有测试通过
- [ ] 手动测试通过(桌面 + 移动)
- [ ] 无console.log残留
- [ ] Git commit message符合规范:
  ```
  feat(toolbar): 实现统一左侧工具栏容器

  - 创建UnifiedToolbar组件整合四个工具栏
  - 添加1px水平分割线分隔分区
  - 实现响应式图标模式
  - 保持移动端布局不变
  - 所有功能和快捷键正常工作

  Closes #[issue-number]
  ```

---

## 下一步

实现完成后:

1. 运行完整测试套件: `nx test drawnix && nx e2e web`
2. 创建Pull Request
3. 请求代码审查
4. 部署到预发布环境验证

---

## 参考文档

- [宪章](/.specify/memory/constitution.md) - 编码标准和约束
- [CLAUDE.md](/CLAUDE.md) - 项目架构概览
- [技术规范](./spec.md) - 功能需求
- [研究文档](./research.md) - 技术决策
- [数据模型](./data-model.md) - 类型定义

预计总开发时间: **3-4小时** (包括测试)
