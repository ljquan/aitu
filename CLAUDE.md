# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aitu (爱图) is an open-source whiteboard application built on the Plait framework. It supports mind maps, flowcharts, freehand drawing, image insertion, and AI-powered content generation. The project uses a plugin architecture with React components and is built with Nx as the monorepo management tool.

## Development Commands

Start development server: `npm start` (serves web app at localhost:4200)
Build all packages: `npm run build` 
Build specific project: `nx build <project-name>`
Run tests: `npm test` or `nx test <project-name>`
Lint code: `nx lint <project-name>` 
Type check: `nx typecheck <project-name>`

## Architecture

### Monorepo Structure
- `apps/web/` - Main web application (aitu.chat)
- `packages/drawnix/` - Core whiteboard library with UI components and plugins
- `packages/react-board/` - React wrapper for Plait board functionality  
- `packages/react-text/` - Text rendering and editing components
- `docs/` - 开发文档
- `packages/drawnix/src/components/toolbar/creation-toolbar.tsx` - creation-toolbar 创作工具
- popup-toolbar

### Core Components
- **Aitu Component** (`packages/drawnix/src/drawnix.tsx`) - Main application wrapper with state management and plugin composition
- **Plugin System** - Extensible architecture with plugins for freehand drawing, mind maps, hotkeys, text editing, and image handling
- **Toolbar System** - Modular toolbars for creation, zoom, themes, and context-sensitive popup tools
- **TTD Dialog** - Text-to-diagram conversion supporting Markdown and Mermaid syntax
- **Data Persistence** - Uses localforage for browser storage with automatic migration

### Key Libraries
- **Plait** - Core drawing framework (`@plait/core`, `@plait/draw`, `@plait/mind`)
- **Slate** - Rich text editing framework
- **TDesign React** - UI component library
- **Floating UI** - Positioning for popover elements
- **Vite** - Build tool for all packages

### Plugin Architecture
Plugins extend functionality through the `withXxx` pattern:
- `withFreehand` - Freehand drawing capabilities
- `withMind` - Mind mapping functionality  
- `withDraw` - Basic drawing primitives
- `withHotkey` - Keyboard shortcut handling
- `withPencil` - Pencil/eraser modes
- `withTextLink` - Link functionality in text

### State Management
Uses React context (`AituContext`) for application state including:
- Pointer modes (hand, drawing tools)
- Mobile detection and responsive behavior
- Dialog and modal states
- Pencil mode toggling

### Rules
- UI使用用TDesign，用light主题配色
- Tooltip 用 theme='light'
- 单个文件不能超过500行

### Coding Standards (详见 docs/CODING_STANDARDS.md)

#### 文件与命名规范
- **组件文件**: `PascalCase.tsx` (如 `ImageCropPopup.tsx`)
- **Hook文件**: `camelCase.ts` (如 `useImageCrop.ts`)  
- **工具文件**: `kebab-case.ts` (如 `image-utils.ts`)
- **类型文件**: `kebab-case.types.ts` (如 `image-crop.types.ts`)
- **常量文件**: `UPPER_SNAKE_CASE.ts` (如 `STORAGE_KEYS.ts`)

#### TypeScript 规范
- 优先使用 `interface` 定义对象类型，`type` 定义联合类型
- 所有组件 Props 必须有类型定义
- 使用严格的 TypeScript 配置
- 避免使用 `any`，使用具体类型或泛型

#### React 组件规范
- 使用函数式组件和 Hooks
- Props 解构时设置默认值
- 使用 `React.memo` 优化不必要的重新渲染
- 事件处理函数使用 `useCallback` 包装
- 副作用使用 `useEffect`，依赖数组必须完整

#### CSS/SCSS 规范
- 使用 BEM 命名约定
- 优先使用设计系统定义的CSS变量
- 样式属性按固定顺序：位置→盒模型→外观→字体→动画
- 使用嵌套选择器组织相关样式

#### 性能规范
- 大组件使用 `React.lazy` 进行代码分割
- 图片使用懒加载和预加载策略
- 避免在渲染函数中创建新对象/函数
- 长列表考虑虚拟化

#### 安全规范
- 所有用户输入必须验证和清理
- 不在代码中硬编码敏感信息
- API调用使用安全的错误处理
- 日志记录时过滤敏感信息

#### Git 提交规范
- 提交消息格式：`<type>(<scope>): <subject>`
- 类型：feat, fix, docs, style, refactor, test, chore, perf, ci
- 提交前必须通过类型检查和单元测试

### Brand Guidelines
- **Brand Name**: aitu (爱图) - AI Image & Video Creation Tool
- **Tagline**: 爱上图像，爱上创作 (Love Images, Love Creation)

#### Color System
- **Primary Brand Colors**: 
  - Orange-Gold: #F39C12, #E67E22, #D35400
  - Blue-Purple: #5A4FCF, #7B68EE, #9966CC  
  - Creation Accent: #E91E63, #F06292
- **Gradients**:
  - Brand: `linear-gradient(135deg, #F39C12 0%, #E67E22 30%, #5A4FCF 70%, #E91E63 100%)`
  - Brush: `linear-gradient(135deg, #5A4FCF 0%, #7B68EE 50%, #E91E63 100%)`
  - Film: `linear-gradient(135deg, #F39C12 0%, #E67E22 50%, #D35400 100%)`
- **Usage**: 
  - Main buttons: use brand gradients
  - Links/emphasis: orange-gold (#F39C12)
  - Creation features: magenta (#E91E63)
  - AI features: blue-purple (#5A4FCF)

#### Typography
- **Font Stack**: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif
- **Sizes**: xs(12px), sm(14px), base(16px), lg(18px), xl(20px), 2xl(24px), 3xl(30px), 4xl(36px)

#### Components Design Principles
- **Buttons**: 8px border-radius, brand gradients for primary, 12px/24px padding
- **Cards**: 12px border-radius, white background, subtle shadows, 24px padding  
- **Inputs**: 8px border-radius, light background, 2px focus border in brand primary
- **Animations**: smooth 150-300ms transitions with ease-out curves
- speckit生成的相关markdown文档产物以中文输出

## Active Technologies
- TypeScript 5.x, React 18.x + TDesign React (UI), Floating UI (定位), localforage (存储), RxJS (状态管理) (001-chat-drawer)
- IndexedDB via localforage (chat-sessions, chat-messages stores) (001-chat-drawer)

## Recent Changes
- 001-chat-drawer: Added TypeScript 5.x, React 18.x + TDesign React (UI), Floating UI (定位), localforage (存储), RxJS (状态管理)
