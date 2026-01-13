# aitu 品牌规范速查

> 🎨 为开发团队和设计师提供的快速品牌规范参考

## 📛 品牌名称

**正式名称**: aitu  
**中文名称**: 爱图  
**英文全称**: AI Image & Video Creation Tool  
**标语**: 爱上图片，爱上创作

## 🎨 色彩系统

### CSS 变量定义
```css
:root {
  /* 主品牌色 - 橙金色系 */
  --brand-primary: #F39C12;
  --brand-primary-dark: #E67E22;
  --brand-primary-darker: #D35400;
  
  /* 辅助品牌色 - 蓝紫色系 */
  --brand-secondary: #5A4FCF;
  --brand-secondary-light: #7B68EE;
  --brand-secondary-lighter: #9966CC;
  
  /* 创作激活色 - 玫红色系 */
  --accent-create: #E91E63;
  --accent-create-light: #F06292;
  
  /* 渐变色 */
  --brand-gradient: linear-gradient(135deg, #F39C12 0%, #E67E22 30%, #5A4FCF 70%, #E91E63 100%);
  --brush-gradient: linear-gradient(135deg, #5A4FCF 0%, #7B68EE 50%, #E91E63 100%);
  --film-gradient: linear-gradient(135deg, #F39C12 0%, #E67E22 50%, #D35400 100%);
  
  /* 功能色 */
  --success: #00B894;
  --warning: #E67E22;
  --error: #E17055;
  --info: #5A4FCF;
  
  /* 中性色 */
  --neutral-900: #2D3436;
  --neutral-800: #636E72;
  --neutral-600: #B2BEC3;
  --neutral-400: #E0E0E0;
  --neutral-200: #F8F9FF;
  --neutral-100: #FFFFFF;
}
```

### 使用场景
- **主按钮**: `--brand-gradient` 或 `--brush-gradient`
- **链接/强调**: `--brand-primary` (橙金色)
- **背景/面板**: `--neutral-200`
- **创作相关**: `--accent-create` (玫红色)
- **媒体相关**: `--film-gradient` (胶卷色系)
- **AI功能**: `--brand-secondary` (蓝紫色)

## 🔤 字体规范

### 字体栈
```css
--font-family-primary: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
--font-family-heading: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
--font-family-mono: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
```

### 字体尺寸
```css
--text-xs: 0.75rem;      /* 12px */
--text-sm: 0.875rem;     /* 14px */
--text-base: 1rem;       /* 16px */
--text-lg: 1.125rem;     /* 18px */
--text-xl: 1.25rem;      /* 20px */
--text-2xl: 1.5rem;      /* 24px */
--text-3xl: 1.875rem;    /* 30px */
--text-4xl: 2.25rem;     /* 36px */
```

## 🎯 Logo 使用规范

### Logo 变体
1. **完整版**: 图标 + 文字 (主要使用)
2. **简化版**: 仅图标 (小尺寸应用)
3. **单色版**: 黑白版本 (特殊场景)

### 最小使用尺寸
- **完整版**: 最小宽度 120px
- **图标版**: 最小尺寸 24x24px
- **清晰空间**: Logo周围至少保留Logo高度的1/2作为清晰空间

### 禁止使用
- ❌ 不可改变Logo比例
- ❌ 不可改变Logo颜色（除单色版本）
- ❌ 不可添加特效或阴影
- ❌ 不可将Logo放置在复杂背景上

## 🧩 组件设计原则

### 按钮设计
```css
/* 主按钮 */
.btn-primary {
  background: var(--brand-gradient);
  color: white;
  border-radius: 8px;
  padding: 12px 24px;
  font-weight: 500;
  transition: all 0.2s ease-out;
}

/* 次按钮 */
.btn-secondary {
  background: transparent;
  color: var(--brand-primary);
  border: 2px solid var(--brand-primary);
  border-radius: 8px;
  padding: 10px 22px;
}
```

### 卡片设计
```css
.card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(108, 92, 231, 0.08);
  padding: 24px;
  border: 1px solid var(--neutral-400);
}
```

### 输入框设计
```css
.input {
  background: var(--neutral-200);
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: var(--text-base);
  transition: border-color 0.2s ease;
}

.input:focus {
  border-color: var(--brand-primary);
  outline: none;
}
```

## 🎬 动效规范

### 缓动函数
```css
--ease-out: cubic-bezier(0.25, 0.46, 0.45, 0.94);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

### 持续时间
- **快速交互**: 150ms - 200ms
- **页面切换**: 250ms - 300ms  
- **加载动画**: 500ms - 1000ms

### 常用动画
```css
/* 按钮悬停 */
.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(108, 92, 231, 0.2);
}

/* 卡片悬停 */
.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(108, 92, 231, 0.12);
}
```

## 📱 响应式断点

```css
/* 移动端优先 */
--breakpoint-sm: 640px;   /* 手机横屏 */
--breakpoint-md: 768px;   /* 平板 */  
--breakpoint-lg: 1024px;  /* 桌面 */
--breakpoint-xl: 1280px;  /* 大屏幕 */
```

## 🔧 开发实施清单

### UI 组件更新
- [ ] 更新主色调为新品牌色
- [ ] 应用新的按钮样式和渐变
- [ ] 更新 Logo 和图标
- [ ] 调整字体和排版
- [ ] 实现新的卡片和布局样式

### 页面更新
- [ ] 首页/着陆页重新设计
- [ ] 导航栏品牌元素更新
- [ ] 创作页面界面优化
- [ ] 设置页面样式统一
- [ ] 关于页面品牌信息更新

### 资源文件
- [ ] 制作各尺寸 Logo 文件
- [ ] 生成 Favicon 和应用图标
- [ ] 更新品牌相关图片素材
- [ ] 准备社交媒体分享图标

---

## 🎨 设计工具资源

### Figma 设计系统
```
主文件: AITU Design System
- 色彩样式库
- 字体样式库  
- 组件库
- 图标库
```

### 开发者资源
- **色彩工具**: [Coolors.co](https://coolors.co/6c5ce7-a29bfe-fd79a8)
- **字体下载**: [Inter Font](https://rsms.me/inter/)
- **图标库**: 使用 Tabler Icons 或自定义图标
- **渐变生成**: [CSS Gradient](https://cssgradient.io/)

---

*快速参考指南 - 随时更新*  
*最后更新: 2025-09-05*