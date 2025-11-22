# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## Project Overview

Aitu (爱图) is an open-source whiteboard application supporting mind maps, flowcharts, freehand drawing, and AI-powered content generation. Built on the Plait framework with React, managed as an Nx monorepo.

## Development Commands

```bash
# Development
npm start                    # Start dev server (http://localhost:4200)
npm test                     # Run all tests
npm run build                # Build all packages
npm run build:web            # Build web app only

# Nx commands for specific projects
nx build <project>           # Build specific project (web, drawnix, react-board, react-text)
nx test <project>            # Test specific project
nx lint <project>            # Lint specific project
nx typecheck <project>       # Type check specific project

# Version management
npm run version:patch        # Bump patch version (+0.0.1)
npm run version:minor        # Bump minor version (+0.1.0)
npm run version:major        # Bump major version (+1.0.0)

# Release
npm run release              # Patch release (version, build, package)
npm run release:minor        # Minor release
npm run release:major        # Major release
```

## Monorepo Structure

```
aitu/
├── apps/
│   ├── web/                 # Main web application
│   └── web-e2e/             # E2E tests
├── packages/
│   ├── drawnix/             # Core whiteboard library
│   ├── react-board/         # React wrapper for Plait board
│   └── react-text/          # Text rendering components
├── docs/                    # Development documentation
├── scripts/                 # Build and release scripts
└── dist/                    # Build output
```

## Architecture

### Core Packages

**drawnix** (`packages/drawnix/src/`):
- `components/` - UI components (toolbar, dialogs, popups)
  - `toolbar/creation-toolbar.tsx` - Main creation toolbar
  - `toolbar/popup-toolbar.tsx` - Context-sensitive tools
- `plugins/` - Extensible functionality via `withXxx` pattern
- `hooks/` - Custom React hooks
- `utils/` - Utility functions
- `transforms/` - Data conversion (Markdown/Mermaid)
- `styles/` - Global styles and SCSS
- `drawnix.tsx` - Main application wrapper with state management

**react-board**: Plait framework React integration layer

**react-text**: Text rendering and editing components

### Technology Stack

- **React 18.3+** with TypeScript
- **Nx** - Monorepo management
- **Vite** - Build tool (all packages)
- **Plait** - Core drawing framework (`@plait/core`, `@plait/draw`, `@plait/mind`)
- **Slate.js** - Rich text editing
- **TDesign React** - UI component library (use light theme)
- **Floating UI** - Popover positioning
- **localforage** - Browser storage with auto-save

### Plugin Architecture

Plugins extend functionality through composition:
- `withFreehand` - Freehand drawing
- `withMind` - Mind mapping
- `withDraw` - Basic drawing primitives
- `withHotkey` - Keyboard shortcuts
- `withPencil` - Pencil/eraser modes
- `withTextLink` - Text link functionality

### State Management

React Context (`AituContext`) manages:
- Pointer modes (hand, drawing tools)
- Mobile detection and responsive behavior
- Dialog and modal states
- Pencil mode toggling

## Coding Standards

### File Size & Naming

**Critical Rule**: Single files must not exceed 500 lines (including comments)

File naming conventions:
- Components: `PascalCase.tsx` (e.g., `ImageCropPopup.tsx`)
- Hooks: `camelCase.ts` (e.g., `useImageCrop.ts`)
- Utils: `kebab-case.ts` (e.g., `image-utils.ts`)
- Types: `kebab-case.types.ts` (e.g., `image-crop.types.ts`)
- Constants: `UPPER_SNAKE_CASE.ts` (e.g., `STORAGE_KEYS.ts`)

### TypeScript

- Use `interface` for object types, `type` for unions
- All component Props must have type definitions
- Avoid `any` - use specific types or generics
- Strict TypeScript configuration enabled

### React Components

- Use functional components and Hooks
- Props destructuring with default values
- Use `React.memo` to optimize re-renders
- Wrap event handlers with `useCallback`
- Complete dependency arrays in `useEffect`

### CSS/SCSS

- Use BEM naming convention
- Prefer design system CSS variables
- Property order: position → box model → appearance → typography → animation
- Use nested selectors for organization

### Git Commits

Format: `<type>(<scope>): <subject>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

Example: `feat(crop): add circular and elliptical image cropping`

## UI/Brand Guidelines

### Design System

**TDesign Configuration**:
- Use light theme (`theme='light'`)
- Tooltips with `theme='light'`

**Brand Colors**:
- Primary: #F39C12, #E67E22, #D35400 (orange-gold)
- Secondary: #5A4FCF, #7B68EE, #9966CC (blue-purple)
- Accent: #E91E63, #F06292 (creation magenta)

**Gradients**:
```css
/* Brand gradient */
linear-gradient(135deg, #F39C12 0%, #E67E22 30%, #5A4FCF 70%, #E91E63 100%)

/* Brush gradient */
linear-gradient(135deg, #5A4FCF 0%, #7B68EE 50%, #E91E63 100%)

/* Film gradient */
linear-gradient(135deg, #F39C12 0%, #E67E22 50%, #D35400 100%)
```

**Component Patterns**:
- Buttons: 8px border-radius, brand gradients for primary
- Cards: 12px border-radius, 24px padding, subtle shadows
- Inputs: 8px border-radius, 2px focus border in brand primary
- Animations: 150-300ms transitions with ease-out

**Typography**:
- Font stack: 'Inter', 'SF Pro Display', -apple-system, sans-serif
- Sizes: xs(12px), sm(14px), base(16px), lg(18px), xl(20px), 2xl(24px), 3xl(30px), 4xl(36px)

## Testing

```bash
# Run all tests
npm test

# Test specific package
nx test drawnix
nx test react-board
nx test web

# E2E tests
nx e2e web-e2e
```

Test framework: Jest + React Testing Library for unit tests, Playwright for E2E

## Key Features

- Mind maps and flowcharts
- Freehand drawing with pencil tool
- Image insertion and manipulation
- Markdown → mind map conversion
- Mermaid → flowchart conversion
- Export to PNG, JSON (.drawnix)
- Auto-save to browser storage
- Infinite canvas with zoom/pan
- Theme modes
- Mobile responsive

## Important Files

- `packages/drawnix/src/drawnix.tsx` - Main application component
- `packages/drawnix/src/components/toolbar/creation-toolbar.tsx` - Creation toolbar
- `packages/drawnix/src/plugins/` - Plugin implementations
- `apps/web/index.html` - Web app entry point
- `docs/CODING_STANDARDS.md` - Detailed coding standards
- `docs/VERSION_CONTROL.md` - Version management workflow
- `docs/CFPAGE-DEPLOY.md` - Deployment guide

## Common Tasks

**Run single test file**:
```bash
nx test drawnix --testFile=<filename>
```

**Type check before commit**:
```bash
nx typecheck drawnix
nx typecheck web
```

**Lint and fix**:
```bash
nx lint <project> --fix
```

**Build for production**:
```bash
npm run build  # Updates version, builds all packages
```

## Performance Considerations

- Large components: use `React.lazy` for code splitting
- Images: use lazy loading and preload strategies
- Avoid creating new objects/functions in render
- Consider virtualization for long lists
- Use `React.memo`, `useMemo`, `useCallback` appropriately

## Security

- Validate and sanitize all user input
- No hardcoded sensitive information
- Use secure error handling in API calls
- Filter sensitive info from logs
