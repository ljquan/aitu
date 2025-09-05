# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Drawnix is an open-source whiteboard application built on the Plait framework. It supports mind maps, flowcharts, freehand drawing, image insertion, and AI-powered content generation. The project uses a plugin architecture with React components and is built with Nx as the monorepo management tool.

## Development Commands

Start development server: `npm start` (serves web app at localhost:4200)
Build all packages: `npm run build` 
Build specific project: `nx build <project-name>`
Run tests: `npm test` or `nx test <project-name>`
Lint code: `nx lint <project-name>` 
Type check: `nx typecheck <project-name>`

## Architecture

### Monorepo Structure
- `apps/web/` - Main web application (drawnix.com)
- `packages/drawnix/` - Core whiteboard library with UI components and plugins
- `packages/react-board/` - React wrapper for Plait board functionality  
- `packages/react-text/` - Text rendering and editing components
- `docs/` - 开发文档

### Core Components
- **Drawnix Component** (`packages/drawnix/src/drawnix.tsx`) - Main application wrapper with state management and plugin composition
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
Uses React context (`DrawnixContext`) for application state including:
- Pointer modes (hand, drawing tools)
- Mobile detection and responsive behavior
- Dialog and modal states
- Pencil mode toggling

### Rules
- UI使用用TDesign