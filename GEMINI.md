# GEMINI.md

This file provides a comprehensive overview of the Opentu project, its structure, and development conventions to serve as a guide for AI-assisted development.

## Project Overview

Opentu (开图) is a feature-rich, open-source whiteboard application that combines traditional diagramming tools with powerful AI-powered image and video generation. It is built as a modern web application using a monorepo architecture managed by Nx.

### Key Features:

*   **AI Creation**: Integrates with models like Gemini and Sora for image and video generation.
*   **Whiteboard**: Infinite canvas supporting mind maps, flowcharts, freehand drawing, and image insertion.
*   **Task Management**: An asynchronous task queue handles AI generation tasks in the background.
*   **Data Portability**: Supports importing from Markdown/Mermaid and exporting to PNG/JSON.

### Architecture:

*   **Monorepo**: The project uses **Nx** to manage a monorepo containing the main web application and several shared libraries.
*   **Frontend**: The application is built with **React 18** and **TypeScript**.
*   **UI**: The UI is constructed using the **TDesign React** component library.
*   **Drawing Engine**: The core whiteboard functionality is powered by the **Plait Framework**.
*   **Text Editing**: Rich text editing is handled by **Slate.js**.
*   **Build Tool**: **Vite** is used for fast development and optimized builds.

### Project Structure:

The monorepo is organized into `apps` and `packages`:

```
aitu/
├── apps/
│   └── web/            # The main web application
├── packages/
│   ├── drawnix/        # The core whiteboard library containing most of the business logic, components, and plugins
│   ├── react-board/    # An adapter layer for the Plait Framework
│   └── react-text/     # A component for text rendering
├── docs/               # Project documentation
├── scripts/            # Helper scripts for versioning and publishing
└── specs/              # Project specifications
```

## Building and Running

### Prerequisites:

*   Node.js >= 16.0.0
*   npm >= 8.0.0

### Installation:

```bash
npm install
```

### Key Commands:

All commands should be run from the root of the project.

*   **Start Development Server:**
    ```bash
    # Serves the web app on http://localhost:7200
    npm start
    ```

*   **Build Project:**
    ```bash
    # Builds all applications and libraries for production
    npm run build
    ```

*   **Run Tests:**
    ```bash
    # Executes unit tests for all packages
    npm test

    # Run tests for a specific project (e.g., drawnix)
    nx test drawnix
    ```

*   **Linting:**
    ```bash
    # Lints a specific project
    nx lint drawnix
    ```

## Development Conventions

*   **Code Style**: The project uses **ESLint** and **Prettier** to enforce a consistent code style. Configuration can be found in `.eslintrc.json` and `.prettierrc`.
*   **Commit Messages**: Commits should follow the [Conventional Commits](https://conventionalcommits.org/) specification. This is used to automate changelog generation.
*   **Branching**: Feature development should happen on branches named `feature/your-feature-name`. Bug fixes should be on `fix/issue-description`.
*   **Contribution**: Detailed contribution guidelines are available in `CONTRIBUTING.md`.
