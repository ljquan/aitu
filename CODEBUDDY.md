<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aitu (爱图) is an open-source whiteboard application built on the Plait framework. It supports mind maps, flowcharts, freehand drawing, image insertion, and AI-powered content generation (images via Gemini, videos via Veo3/Sora-2). The project uses a plugin architecture with React components and is built with Nx as the monorepo management tool.

## Development Commands

**Essential Commands:**
- `npm start` - Start development server (serves web app at localhost:4200)
- `npm run build` - Build all packages
- `npm run build:web` - Build only the web application
- `npm test` - Run all tests
- `nx test <project-name>` - Run tests for specific project
- `nx lint <project-name>` - Lint specific project
- `nx typecheck <project-name>` - Type check specific project

**Version & Release:**
- `npm run version:patch` - Bump patch version (0.0.x)
- `npm run version:minor` - Bump minor version (0.x.0)
- `npm run version:major` - Bump major version (x.0.0)
- `npm run release` - Build and package patch release
- `npm run release:minor` - Build and package minor release
- `npm run release:major` - Build and package major release

## Architecture

### Monorepo Structure
- `apps/web/` - Main web application (aitu.chat)
- `packages/drawnix/` - Core whiteboard library with UI components and plugins
- `packages/react-board/` - React wrapper for Plait board functionality
- `packages/react-text/` - Text rendering and editing components
- `docs/` - Development documentation (开发文档)

### Core Components
- **Drawnix Component** (`packages/drawnix/src/drawnix.tsx`) - Main application wrapper with state management and plugin composition
- **Plugin System** - Extensible architecture with plugins using the `withXxx` pattern:
  - `withFreehand` - Freehand drawing capabilities
  - `withMind` / `withMindExtend` - Mind mapping functionality
  - `withDraw` - Basic drawing primitives (shapes, arrows)
  - `withHotkey` - Keyboard shortcut handling
  - `withPencil` - Pencil/eraser modes
  - `withTextLink` - Link functionality in text
  - `withVideo` - Video element support
  - `withGroup` - Element grouping
- **Toolbar System** - Modular toolbars:
  - `UnifiedToolbar` - Main creation toolbar with drawing tools
  - `PopupToolbar` - Context-sensitive popup tools for selected elements
  - `ClosePencilToolbar` - Toolbar for pencil mode
- **Dialogs & Drawers**:
  - `TTDDialog` - Text-to-diagram conversion (Markdown → mind map, Mermaid → flowchart)
  - `SettingsDialog` - Application settings (API keys, theme)
  - `ChatDrawer` - AI chat interface with session management
- **AI Services** (`packages/drawnix/src/services/`):
  - `generation-api-service.ts` - Image generation API (Gemini)
  - `video-api-service.ts` - Video generation API (Veo3, Sora-2)
  - `chat-service.ts` - Chat API integration
  - `task-queue-service.ts` - Async task queue management
  - `media-cache-service.ts` - Media caching in IndexedDB
  - `storage-service.ts` - Local storage management
  - `url-cache-service.ts` - URL response caching
  - `chat-storage-service.ts` - Chat session persistence
- **Data Persistence** - Uses localforage (IndexedDB wrapper) for:
  - Board data auto-save
  - Task queue state
  - Media cache
  - Chat sessions and messages

### Key Libraries
- **Plait** (`@plait/core`, `@plait/draw`, `@plait/mind`) - Core drawing framework
- **Slate.js** - Rich text editing framework
- **TDesign React** - UI component library (use light theme)
- **Floating UI** - Positioning for popover elements
- **Vite** - Build tool for all packages
- **localforage** - IndexedDB wrapper for storage
- **RxJS** - Reactive state management for services
- **ahooks** - React Hooks utility library

### State Management
- **React Context** (`DrawnixContext`) for application state:
  - Pointer modes (hand, selection, drawing tools)
  - Mobile detection and responsive behavior
  - Dialog and modal states
  - Pencil mode toggling
- **RxJS Subjects** for service-level state (task queue, chat sessions)
- **localforage** for persistent storage

### Development Rules
- **UI Framework**: Use TDesign React with light theme configuration
- **Tooltips**: Always use `theme='light'` for TDesign tooltips
- **File Size Limit**: Single files must not exceed 500 lines (including comments and blank lines)
- **Documentation**: SpecKit-generated markdown documents should be in Chinese (中文)

### Claude Code 工作流

**最佳实践文档**: 参考 `docs/CLAUDE_CODE_BEST_PRACTICES.md` 获取完整指南

**核心原则**:
1. **Plan 模式优先**: 复杂任务使用 `Shift+Tab×2` 进入 Plan 模式，先想清楚再动手
2. **验证驱动**: 每次修改后运行验证命令确认质量
3. **知识沉淀**: 发现问题后更新本文件，形成飞轮效应

**验证命令** (修改代码后必须执行):
```bash
nx typecheck drawnix    # 类型检查
nx lint drawnix         # 代码规范
nx test drawnix         # 单元测试
npm run build:web       # 构建验证
```

**常用斜杠命令**:
| 命令 | 功能 |
|------|------|
| `/auto-commit` | 自动分析变更并提交 |
| `/speckit.auto` | 完整 SpecKit 自动流程 |
| `/speckit.specify` | 创建功能规范 |
| `/speckit.implement` | 执行实现 |

**SpecKit 工作流** (复杂功能开发):
```
/speckit.specify → /speckit.clarify → /speckit.plan → /speckit.tasks → /speckit.implement
```

### Coding Standards

Full coding standards are documented in `docs/CODING_STANDARDS.md`. Key highlights:

#### File Naming Conventions
- **Components**: `PascalCase.tsx` (e.g., `ImageCropPopup.tsx`)
- **Hooks**: `camelCase.ts` (e.g., `useImageCrop.ts`)
- **Utilities**: `kebab-case.ts` (e.g., `image-utils.ts`)
- **Types**: `kebab-case.types.ts` (e.g., `image-crop.types.ts`)
- **Constants**: `UPPER_SNAKE_CASE.ts` (e.g., `STORAGE_KEYS.ts`)

#### TypeScript Guidelines
- Use `interface` for object types, `type` for union types
- All component Props must have type definitions
- Avoid `any` - use specific types or generics
- Strict TypeScript configuration is enforced

#### Async Initialization Pattern
**场景**: 使用 `settingsManager` 或其他需要异步初始化的服务时

❌ **错误示例**:
```typescript
async initialize(): Promise<boolean> {
  const settings = geminiSettings.get(); // 可能返回加密的 JSON！
  await swTaskQueueClient.initialize({ apiKey: settings.apiKey });
}
```

✅ **正确示例**:
```typescript
async initialize(): Promise<boolean> {
  await settingsManager.waitForInitialization(); // 等待解密完成
  const settings = geminiSettings.get(); // 现在返回解密后的值
  await swTaskQueueClient.initialize({ apiKey: settings.apiKey });
}
```

**原因**: `settingsManager` 使用异步方法 `decryptSensitiveDataForLoading()` 解密敏感数据（如 API Key）。如果在解密完成前调用 `geminiSettings.get()`，会返回加密的 JSON 对象而不是解密后的字符串，导致 API 请求失败。

#### React Component Guidelines
- Use functional components with Hooks
- Destructure props with default values
- Use `React.memo` to optimize re-renders where beneficial
- Wrap event handlers with `useCallback`
- Use `useEffect` with complete dependency arrays
- Hook order in components: state hooks → effect hooks → event handlers → render logic

#### Force Refresh useMemo Pattern
**场景**: 当 `useMemo` 依赖的对象引用没变，但对象内部状态已改变时（如 `board.children` 被修改）

❌ **错误示例**:
```typescript
// 操作后 board.children 变了，但 board 引用没变，useMemo 不会重新计算
const layerInfo = useMemo(() => {
  return getLayerInfo(board, elementId);
}, [board]);

const handleMoveUp = () => {
  moveElementUp(board);  // 修改了 board.children
  // layerInfo 不会更新！按钮状态不会变化
};
```

✅ **正确示例**:
```typescript
const [refreshKey, setRefreshKey] = useState(0);

const layerInfo = useMemo(() => {
  return getLayerInfo(board, elementId);
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [board, refreshKey]);

const handleMoveUp = () => {
  moveElementUp(board);
  setRefreshKey((k) => k + 1);  // 强制刷新 useMemo
};
```

**原因**: React 的 `useMemo` 只比较依赖项的引用。当外部库（如 Plait）直接修改对象内部状态而不改变引用时，需要使用 `refreshKey` 模式强制触发重新计算。

#### CSS/SCSS Guidelines
- Use BEM naming convention
- Prefer design system CSS variables (see Brand Guidelines below)
- Property order: positioning → box model → appearance → typography → animations
- Use nested selectors for organization

#### Performance Guidelines
- Use `React.lazy` for code splitting large components
- Implement lazy loading and preloading for images
- Avoid creating new objects/functions in render
- Consider virtualization for long lists

#### Security Guidelines
- Validate and sanitize all user input
- Never hardcode sensitive information (API keys, etc.)
- Use proper error handling for API calls
- Filter sensitive information in logs

#### Z-Index Management
**规范文档**: 参考 `docs/Z_INDEX_GUIDE.md` 获取完整规范

**核心原则**:
- 使用预定义的层级常量,禁止硬编码魔术数字
- TypeScript: 从 `constants/z-index.ts` 导入 `Z_INDEX`
- SCSS: 从 `styles/z-index.scss` 导入并使用 `$z-*` 变量或 `z()` 函数

**层级结构** (每层预留100单位):
```
Layer 0 (0-999):     Base & Canvas Internal
Layer 1 (1000-1999): Canvas Elements & Decorations
Layer 2 (2000-2999): Toolbars (unified-toolbar: 2000, popovers: 3000)
Layer 3 (3000-3999): Popovers & Tooltips
Layer 4 (4000-4999): Drawers & Panels (task-queue, chat-drawer)
Layer 5 (5000-5999): Modals & Dialogs (AI dialogs: 5100+)
Layer 6 (6000-6999): Notifications (active-task-warning: 6000)
Layer 7 (7000-7999): Auth Dialogs
Layer 8 (8000-8999): Image Viewer
Layer 9 (9000+):     Critical Overlays (loading, system-error)
```

**使用示例**:
```typescript
// TypeScript/TSX
import { Z_INDEX } from '@/constants/z-index';
<Rnd style={{ zIndex: Z_INDEX.DIALOG_AI_IMAGE }}>
```

```scss
// SCSS
@import 'styles/z-index';
.my-toolbar {
  z-index: $z-unified-toolbar;  // 或 z-index: z('unified-toolbar');
}
```

**禁止事项**:
- ❌ 禁止使用随意的数字 (如 9999, 10000, 10001)
- ❌ 禁止在同一层级随意 +1/-1
- ❌ 临时修复必须在完成后转换为规范用法

#### Git Commit Convention
- Format: `<type>(<scope>): <subject>`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`
- Must pass type checking and tests before committing

### Brand Guidelines

**Brand Identity:**
- Name: aitu (爱图) - AI Image & Video Creation Tool
- Tagline: 爱上图片，爱上创作 (Love Images, Love Creation)

**Color System:**
- Primary Colors:
  - Orange-Gold: `#F39C12`, `#E67E22`, `#D35400`
  - Blue-Purple: `#5A4FCF`, `#7B68EE`, `#9966CC`
  - Creation Accent: `#E91E63`, `#F06292`
- Gradients:
  - Brand: `linear-gradient(135deg, #F39C12 0%, #E67E22 30%, #5A4FCF 70%, #E91E63 100%)`
  - Brush: `linear-gradient(135deg, #5A4FCF 0%, #7B68EE 50%, #E91E63 100%)`
  - Film: `linear-gradient(135deg, #F39C12 0%, #E67E22 50%, #D35400 100%)`
- Usage Guidelines:
  - Primary buttons → brand gradients
  - Links/emphasis → orange-gold (#F39C12)
  - Creation features → magenta (#E91E63)
  - AI features → blue-purple (#5A4FCF)

**Typography:**
- Font Stack: `'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif`
- Sizes: xs(12px), sm(14px), base(16px), lg(18px), xl(20px), 2xl(24px), 3xl(30px), 4xl(36px)

**Component Design:**
- Buttons: 8px border-radius, brand gradients for primary, 12px/24px padding
- Cards: 12px border-radius, white background, subtle shadows, 24px padding
- Inputs: 8px border-radius, light background, 2px focus border in brand primary
- Animations: 150-300ms transitions with ease-out curves

## Important Implementation Notes

### Chat Drawer (Branch: 003-chat-drawer)
- Uses IndexedDB via localforage for chat persistence
- Stores: `chat-sessions`, `chat-messages`
- Service architecture: `chat-service.ts` → API, `chat-storage-service.ts` → storage
- Component structure: `ChatDrawer.tsx` (main), `SessionList.tsx`, `SessionItem.tsx`, `MermaidRenderer.tsx`
- Mermaid diagrams preprocessed before rendering (see `MERMAID_PREPROCESSING.md`)

### AI Generation Services
- Image generation: Gemini API (`generation-api-service.ts`)
- Video generation: Veo3/Sora-2 API (`video-api-service.ts`)
- Task management: Async queue with retry logic (`task-queue-service.ts`)
- Media caching: IndexedDB-based cache (`media-cache-service.ts`)
- All services use RxJS for reactive state management
