# Aitu 项目宪章

## 核心原则

### I. 插件优先架构
每个功能都应该实现为遵循 `withXxx` 模式的可组合插件。插件必须满足：
- **自包含**: 每个插件都有清晰的边界和职责
- **可独立测试**: 可以独立进行测试
- **可组合**: 可以与其他插件组合而不产生冲突
- **框架无关**: 核心逻辑应该能在不同的UI框架中工作（React、Angular等）

**示例**: `withFreehand`、`withMind`、`withDraw`、`withHotkey` - 每个都在不耦合的情况下扩展编辑器能力

### II. 文件大小约束（不可协商）
**单个文件不得超过 500 行**（包括空行和注释）

这是一个硬性约束，以确保：
- 代码可读性和可维护性
- 合理的关注点分离
- 易于代码审查和理解
- 防止出现单体组件

**执行规则**：
- PR 审查必须拒绝超过 500 行的文件
- 例外情况需要架构审查和文档化的理由
- 重构为多个文件或抽象为可重用模块

### III. 类型安全优先
TypeScript 严格模式是强制性的。所有代码必须：
- 使用 `interface` 定义对象类型，`type` 定义联合类型/交叉类型
- 为所有组件 Props 定义显式类型
- 避免使用 `any` - 使用具体类型或泛型
- 提交前通过严格的 TypeScript 检查

**示例**：
```typescript
// ✅ 好的做法
interface UserProfileProps {
  userId: string;
  onUpdate: (user: User) => void;
}

// ❌ 不好的做法
const UserProfile = (props: any) => {}
```

### IV. 设计系统一致性
所有 UI 组件必须使用 **TDesign React** 并采用 light 主题。一致性规则：
- 所有 UI 元素使用 TDesign 组件
- 遵循品牌色彩系统（橙金色、蓝紫色、创作强调色）
- 使用设计系统的 CSS 变量
- Tooltip 主题必须使用 'light'
- 自定义样式遵循 BEM 命名约定

### V. 性能与优化
为用户体验进行优化：
- 对昂贵的组件使用 `React.memo`
- 对传递给子组件的事件处理器使用 `useCallback`
- 对昂贵的计算使用 `useMemo`
- 对大型组件使用 `React.lazy` 实现代码分割
- 图片懒加载并实现预加载策略
- 对长列表考虑使用虚拟化

### VI. 安全与验证
安全性是不可协商的：
- 验证和清理所有用户输入
- 永远不要硬编码敏感信息（API 密钥、密码）
- API 调用使用安全的错误处理
- 从日志中过滤敏感数据
- 验证文件上传（类型、大小、内容）

### VII. Monorepo 结构
在 Nx monorepo 中保持清晰的分离：
- `apps/web/` - 主 Web 应用程序
- `packages/drawnix/` - 核心白板库
- `packages/react-board/` - Plait 的 React 包装器
- `packages/react-text/` - 文本渲染组件

每个包应该有清晰的依赖关系和最小的耦合。

## 开发标准

### 命名约定
**文件命名**（严格执行）：
- 组件文件：`PascalCase.tsx`（例如 `ImageCropPopup.tsx`）
- Hook 文件：`camelCase.ts`（例如 `useImageCrop.ts`）
- 工具文件：`kebab-case.ts`（例如 `image-utils.ts`）
- 类型文件：`kebab-case.types.ts`（例如 `image-crop.types.ts`）
- 常量文件：`UPPER_SNAKE_CASE.ts`（例如 `STORAGE_KEYS.ts`）

**代码命名**：
- 变量：camelCase
- 常量：UPPER_SNAKE_CASE
- 组件：PascalCase
- 接口/类型：PascalCase

### 组件结构
所有 React 组件必须遵循以下顺序：
1. 导入（第三方 → 本地）
2. 类型定义
3. 常量
4. 主组件函数
5. Hooks（useState、useEffect、自定义 hooks）
6. 事件处理器（使用 useCallback 包装）
7. 渲染逻辑

**示例**：
```typescript
import React, { useState, useCallback } from 'react';
import { Button } from 'tdesign-react';
import './Component.scss';

interface ComponentProps {
  title: string;
  onAction: (data: string) => void;
}

const DEFAULT_CONFIG = { timeout: 5000 };

export const Component: React.FC<ComponentProps> = ({ title, onAction }) => {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(() => {
    onAction(title);
  }, [title, onAction]);

  return <Button onClick={handleClick}>{title}</Button>;
};
```

### 测试要求
每个功能必须包括：
- **单元测试** - 用于逻辑和工具函数
- **组件测试** - 使用 React Testing Library 测试 React 组件
- **集成测试** - 用于插件交互
- **E2E 测试** - 使用 Playwright 测试关键用户流程

测试必须：
- 提交前通过
- 覆盖边界情况和错误状态
- 遵循 Arrange-Act-Assert 模式
- 使用中文或英文的描述性测试名称

### CSS/SCSS 标准
遵循 BEM 方法论：
```scss
.component-name {
  // 1. Position
  position: relative;

  // 2. Box model
  width: 100%;
  padding: 16px;

  // 3. Appearance
  background: var(--color-bg);
  border-radius: 8px;

  // 4. Typography
  font-size: 14px;

  // 5. Animation
  transition: all 0.2s ease-out;

  // 6. Nested elements
  &__header { }
  &__content { }

  // 7. Modifiers
  &--active { }

  // 8. Responsive
  @media (max-width: 768px) { }
}
```

## Git 与版本控制

### 提交信息格式
遵循 Conventional Commits：
```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型**：feat, fix, docs, style, refactor, test, chore, perf, ci

**示例**：
```
feat(crop): 添加图片圆形和椭圆形裁剪功能

- 实现三种裁剪形状：方形、圆形、椭圆形
- 添加裁剪预览功能
- 更新相关TypeScript类型定义

Closes #123
```

### 分支策略
- `main` - 生产就绪代码
- `develop` - 开发集成分支
- `feature/*` - 新功能
- `fix/*` - Bug 修复
- `docs/*` - 文档更新

### 预提交检查
在任何提交之前，代码必须通过：
- ✅ TypeScript 类型检查（`nx typecheck`）
- ✅ ESLint 检查（`nx lint`）
- ✅ 单元测试（`nx test`）
- ✅ 文件大小验证（< 500 行）
- ✅ 无 console.log 或调试代码
- ✅ 无硬编码的密钥

## 品牌指南集成

### 视觉识别
- **品牌名称**：Aitu（爱图）- AI 图像与视频创作工具
- **标语**：爱上图像，爱上创作（Love Images, Love Creation）

### 色彩系统
```scss
// 主品牌色
--brand-primary: #F39C12;        // 橙金色
--brand-secondary: #5A4FCF;      // 蓝紫色
--brand-accent: #E91E63;         // 创作强调色

// 渐变
--gradient-brand: linear-gradient(135deg, #F39C12 0%, #E67E22 30%, #5A4FCF 70%, #E91E63 100%);
--gradient-brush: linear-gradient(135deg, #5A4FCF 0%, #7B68EE 50%, #E91E63 100%);
```

**使用方式**：
- 主要行动号召按钮：使用品牌渐变
- 链接/强调：橙金色（#F39C12）
- AI 功能：蓝紫色（#5A4FCF）
- 创作工具：洋红色（#E91E63）

### 排版
- **字体栈**：'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif
- **尺寸**：xs(12), sm(14), base(16), lg(18), xl(20), 2xl(24), 3xl(30), 4xl(36)

### 组件设计
- **按钮**：8px 圆角，渐变背景，12px/24px 内边距
- **卡片**：12px 圆角，白色背景，细微阴影，24px 内边距
- **输入框**：8px 圆角，2px 聚焦边框使用品牌主色
- **动画**：150-300ms 过渡时间，使用 ease-out 曲线

## 质量门槛

### 代码审查清单
在批准任何 PR 之前，验证：
- [ ] TypeScript 严格模式合规
- [ ] 所有文件 < 500 行
- [ ] 测试已添加/更新并通过
- [ ] UI 使用 TDesign 组件
- [ ] 自定义样式使用 BEM 命名
- [ ] 无硬编码的值或密钥
- [ ] 应用了性能优化
- [ ] 实现了安全验证
- [ ] 符合无障碍标准
- [ ] 文档已更新

### 完成定义
当满足以下条件时，功能才算完成：
1. 代码已实现并审查
2. 单元测试已编写并通过（>80% 覆盖率）
3. 集成测试通过
4. 关键流程的 E2E 测试通过
5. 文档已更新（JSDoc、README）
6. 无障碍性已验证
7. 性能已基准测试
8. 安全性已审查
9. 已部署到预发布环境并验证

## 架构约束

### 依赖规则
- 核心包（`@plait/*`）不得依赖 UI 框架
- React 包可以依赖核心，但反之不行
- 插件不得有循环依赖
- 工具函数必须是无副作用的纯函数

### 存储与持久化
- 使用 `localforage` 进行浏览器存储
- 实现带防抖的自动保存
- 支持数据格式变更的迁移
- 导出格式：PNG、JPG、JSON（.drawnix）

### 国际化
- 所有面向用户的文本使用 `useI18n` hook
- 支持中文（zh-CN）和英文（en-US）
- 组件中不得有硬编码字符串
- 翻译键遵循命名空间模式

## 治理

### 宪章权威
本宪章优先于所有其他编码实践和约定。任何偏离都需要：
1. 文档化的理由
2. 架构审查批准
3. 更新本宪章或异常文档
4. 如果现有代码需要更新，需要迁移计划

### 修订流程
修订本宪章的步骤：
1. 通过 GitHub Issue 提出变更，标签为 `constitution-amendment`
2. 与团队和利益相关者讨论
3. 获得项目维护者批准
4. 更新本文档并说明理由
5. 更新版本和最后修订日期
6. 向所有贡献者传达变更

### 执行
- 所有 PR 必须包含宪章合规性验证
- CI/CD 管道执行自动化检查
- 手动审查检查不可自动化的标准
- 违规将阻止合并直至解决
- 重复违规将触发架构审查

### 相关文档
有关运行时开发指导，请参考：
- **[CLAUDE.md](../../CLAUDE.md)** - AI 助手指导和项目概览
- **[docs/CODING_STANDARDS.md](../../docs/CODING_STANDARDS.md)** - 详细的编码标准
- **[README.md](../../README.md)** - 项目文档和设置

---

**版本**：1.0.0 | **批准日期**：2025-01-22 | **最后修订**：2025-01-22
