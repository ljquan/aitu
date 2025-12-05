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
- **Declarative Tracking**: Use `data-track` attribute for event tracking (see Analytics section below)

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

#### React Component Guidelines
- Use functional components with Hooks
- Destructure props with default values
- Use `React.memo` to optimize re-renders where beneficial
- Wrap event handlers with `useCallback`
- Use `useEffect` with complete dependency arrays
- Hook order in components: state hooks → effect hooks → event handlers → render logic

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

#### Git Commit Convention
- Format: `<type>(<scope>): <subject>`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`
- Must pass type checking and tests before committing

### Brand Guidelines

**Brand Identity:**
- Name: aitu (爱图) - AI Image & Video Creation Tool
- Tagline: 爱上图像，爱上创作 (Love Images, Love Creation)

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

### Analytics & Tracking

**Declarative Tracking System** (`packages/drawnix/src/services/tracking/`)

The project uses a dual-approach analytics system powered by Umami:

#### 1. Manual Tracking (Business Events)
For AI generation, API calls, and complex business logic:
```typescript
import { analytics } from '../utils/umami-analytics';

// Track AI generation events
analytics.trackAIGeneration(AIGenerationEvent.IMAGE_GENERATION_START, {
  taskId: task.id,
  model: 'gemini-pro',
  duration: 2500,
});
```

#### 2. Declarative Tracking (UI Interactions)
For buttons, links, and UI elements - add `data-track` attribute:
```tsx
// ✅ Correct - Use data-track attribute
<button data-track="button_click_save">Save</button>
<ToolButton data-track="toolbar_click_undo" />
<MenuItem data-track="menu_item_export" />

// ❌ Wrong - Don't use custom track attribute
<button track="button_click_save">Save</button>
```

**Key Features:**
- **Automatic Event Capture**: No manual `analytics.track()` calls needed
- **Batch Upload**: Queues up to 10 events OR 5 seconds before sending
- **Retry Mechanism**: Re-queues failed events for automatic retry
- **Debouncing**: Prevents duplicate events within 1 second
- **Rich Metadata**: Auto-injects version, url, sessionId, viewport, eventType

**Event Naming Convention:**
- Pattern: `{area}_{action}_{target}`
- Examples: `toolbar_click_save`, `menu_item_export`, `button_hover_feature`
- Use snake_case for consistency with Umami

**Architecture:**
```
UI Element (data-track="event_name")
  ↓
TrackingService (event delegation)
  ↓
Metadata Injection + Debouncing
  ↓
BatchService (queue)
  ↓
UmamiAdapter → analytics.track()
  ↓
window.umami.track()
  ↓
Umami Server
```

**Documentation:**
- Implementation: `specs/005-declarative-tracking/IMPLEMENTATION.md`
- Integration: `specs/005-declarative-tracking/INTEGRATION.md`
- Toolbar Events: `specs/005-declarative-tracking/TOOLBAR_TRACKING.md`

## Active Technologies
- TypeScript 5.x (strict mode) (005-declarative-tracking)
- RxJS - Reactive state management for tracking service (005-declarative-tracking)

## Recent Changes
- 005-declarative-tracking: Added TypeScript 5.x (strict mode)
