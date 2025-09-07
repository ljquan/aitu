<p align="center">
  <picture style="width: 320px">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/ljquan/aitu/blob/develop/apps/web/public/logo/logo_drawnix_h.svg?raw=true" />
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/ljquan/aitu/blob/develop/apps/web/public/logo/logo_drawnix_h_dark.svg?raw=true" />
    <img src="https://github.com/ljquan/aitu/blob/develop/apps/web/public/logo/logo_drawnix_h.svg?raw=true" width="360" alt="Drawnix logo and name" />
  </picture>
</p>
<div align="center">
  <h2>
    Aitu - Open-source whiteboard tool (SaaS), an all-in-one collaborative canvas that includes mind mapping, flowcharts, freehand and more.
  <br />
  </h2>
</div>

<div align="center">
  <figure>
    <a target="_blank" rel="noopener">
      <img src="https://github.com/ljquan/aitu/blob/develop/apps/web/public/product_showcase/case-2.png" alt="Product showcase" width="80%" />
    </a>
    <figcaption>
      <p align="center">
      Whiteboard with mind mapping, flowcharts, freehand drawing and more
      </p>
    </figcaption>
  </figure>
  <a href="https://hellogithub.com/repository/ljquan/aitu" target="_blank">
    <picture style="width: 250">
      <source media="(prefers-color-scheme: light)" srcset="https://abroad.hellogithub.com/v1/widgets/recommend.svg?rid=4dcea807fab7468a962c153b07ae4e4e&claim_uid=zmFSY5k8EuZri43&theme=neutral" />
      <source media="(prefers-color-scheme: dark)" srcset="https://abroad.hellogithub.com/v1/widgets/recommend.svg?rid=4dcea807fab7468a962c153b07ae4e4e&claim_uid=zmFSY5k8EuZri43&theme=dark" />
      <img src="https://abroad.hellogithub.com/v1/widgets/recommend.svg?rid=4dcea807fab7468a962c153b07ae4e4e&claim_uid=zmFSY5k8EuZri43&theme=neutral" alt="Featured｜HelloGitHub" style="width: 250px; height: 54px;" width="250" height="54"/>
    </picture>
  </a>

  <br />

  <a href="https://trendshift.io/repositories/13979" target="_blank"><img src="https://trendshift.io/api/badge/repositories/13979" alt="plait-board%2Fdrawnix | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>
</div>

[*中文*](https://github.com/ljquan/aitu/blob/develop/README.md)

## Features

- 💯 Free and Open Source
- ⚒️ Mind Maps and Flowcharts
- 🖌 Freehand
- 😀 Image Support
- 🚀 Plugin-based Architecture - Extensible
- 🖼️ 📃 Export to PNG, JPG, JSON(.drawnix)
- 💾 Auto-save (Browser Storage)
- ⚡ Edit Features: Undo, Redo, Copy, Paste, etc.
- 🌌 Infinite Canvas: Zoom, Pan
- 🎨 Theme Support
- 📱 Mobile-friendly
- 📈 Support mermaid syntax conversion to flowchart
- ✨ Support markdown text conversion to mind map（New 🔥🔥🔥）


## About the Name

***Aitu*** is born from the love of creation and the pursuit of visual expression.

*Ai* represents passion and dedication to creation, while *tu* symbolizes the infinite possibilities of visual expression. Here, each creation is a pursuit of beauty, every stroke an extension of imagination.

Creativity stems from inner love, and ***Aitu*** is committed to being a powerful assistant for every creator.

*Love Creation, Visualize the Future.*

## About Plait Drawing Framework

*Aitu* is positioned as an out-of-the-box, *open-source*, and free tool product. It is built on top of the *Plait* framework, which is an *open-source* drawing framework representing significant technical accumulation in knowledge visualization products.


*Aitu* uses a *plugin architecture*, which is technically more complex than traditional *open-source* tools. However, this *plugin architecture* has its advantages: it supports multiple *UI frameworks* (*Angular*, *React*), integrates with different *rich text frameworks* (currently only supporting *Slate* framework), enables better business layer separation in development, allows development of various fine-grained reusable plugins, and can expand to more whiteboard application scenarios.

## Repository Structure

```
aitu/
├── apps/
│   ├── web                   # Aitu web application
│   │    └── index.html       # HTML
├── dist/                     # Build artifacts
├── packages/
│   └── drawnix/              # Whiteboard application core
│   └── react-board/          # Whiteboard react view layer
│   └── react-text/           # Text rendering module
├── package.json
├── ...
└── README.md
└── README_en.md

```

## Try It Out

*https://aitu.chat* is the online application of *Aitu*.

We will be iterating frequently on application features to continuously optimize user experience.


## 🚀 Quick Start

### Online Experience
Visit [aitu.chat](https://aitu.chat) directly to start using it immediately, no installation required.

### Local Development

#### Requirements
- Node.js >= 16.0.0
- npm >= 8.0.0

#### Installation Steps

```bash
# Clone the repository
git clone https://github.com/ljquan/aitu.git
cd aitu

# Install dependencies
npm install

# Start development server
npm start
```

After successful startup, visit `http://localhost:4200` to see the application.

#### Available Commands

```bash
# Development
npm start                    # Start development server
npm test                     # Run tests
npm run build                # Build all packages
npm run build:web            # Build web app only

# Version Management
npm run version:patch        # Version +0.0.1
npm run version:minor        # Version +0.1.0  
npm run version:major        # Version +1.0.0

# Release
npm run release             # Release patch version
npm run release:minor       # Release minor version
npm run release:major       # Release major version
```

### 📚 Documentation

Detailed development documentation is located in the [`docs/`](./docs/) directory:

- **[Version Control](./docs/VERSION_CONTROL.md)** - Version management and release process
- **[Deployment Guide](./docs/CFPAGE-DEPLOY.md)** - Cloudflare Pages deployment
- **[PWA Configuration](./docs/PWA_ICONS.md)** - PWA icon generation guide

### 🧪 Testing

```bash
# Run all tests
npm test

# Run specific project tests
nx test drawnix
nx test react-board
```

## 📖 Usage Guide

### Basic Features

#### Creating Content
- **Mind Maps**: Click the mind map icon in the toolbar to start creating branch nodes
- **Flowcharts**: Select flowchart tools to drag and create shapes and connectors
- **Freehand Drawing**: Use brush tools for hand-drawn creations
- **Text Editing**: Double-click anywhere to add text

#### Import/Export
- **Export Formats**: Supports PNG, JPG, JSON(.drawnix) formats
- **Text Conversion**: 
  - Support Markdown text to mind map conversion
  - Support Mermaid syntax to flowchart conversion

#### Shortcuts
- `Ctrl/Cmd + Z`: Undo
- `Ctrl/Cmd + Y`: Redo  
- `Ctrl/Cmd + C`: Copy
- `Ctrl/Cmd + V`: Paste
- Mouse wheel: Zoom canvas
- Drag: Move canvas

### 🔧 Plugin Development

Aitu is built on a plugin architecture and supports custom extensions:

```typescript
import { withFreehand, withMind, withDraw } from '@aitu/core';

// Create editor instance with specific plugins
const editor = withFreehand(
  withMind(
    withDraw(createEditor())
  )
);
```

### 🐳 Docker Deployment

```bash
# Pull image
docker pull ljquan/aitu:latest

# Run container
docker run -d -p 8080:80 ljquan/aitu:latest
```

Visit `http://localhost:8080` to use.

## 🏗️ Technical Architecture

### Tech Stack
- **Frontend Framework**: React 18.3+ with TypeScript
- **Build Tools**: Vite + Nx (Monorepo)
- **UI Component Library**: TDesign React
- **Drawing Engine**: Plait Framework
- **Rich Text Editor**: Slate.js
- **State Management**: React Context + Hooks
- **Styling**: Sass + CSS Module

### Core Modules

```
packages/
├── drawnix/           # Core whiteboard application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── plugins/       # Feature plugins  
│   │   ├── transforms/    # Data transformations
│   │   └── utils/         # Utility functions
├── react-board/       # Plait React adapter layer
├── react-text/        # Text rendering components
```

### Plugin System

Uses a composable plugin architecture where each plugin handles specific functionality:

- **withFreehand**: Freehand drawing capabilities
- **withMind**: Mind mapping functionality  
- **withDraw**: Basic shape drawing
- **withHotkey**: Keyboard shortcut support
- **withTextLink**: Text link functionality

## 📦 Dependencies

### Core Dependencies
- [plait](https://github.com/worktile/plait) - Open source drawing framework providing underlying drawing capabilities
- [slate](https://github.com/ianstormtaylor/slate) - Rich text editor framework handling text editing logic
- [floating-ui](https://github.com/floating-ui/floating-ui) - Floating layer positioning library for toolbars and popups
- [tdesign-react](https://tdesign.tencent.com/react) - Enterprise-class UI component library
- [localforage](https://github.com/localForage/localForage) - Browser storage solution supporting auto-save

### Development Dependencies
- **Nx**: Monorepo management tool
- **Vite**: Modern build tool providing fast development experience
- **TypeScript**: Type-safe JavaScript superset
- **ESLint + Prettier**: Code quality and formatting tools


## 🤝 Contributing Guide

We welcome and appreciate any form of contribution!

### Ways to Contribute

#### 🐛 Report Issues
- Use [GitHub Issues](https://github.com/ljquan/aitu/issues) to report bugs
- Please provide detailed reproduction steps and environment information
- Screenshots or screen recordings would be very helpful

#### 💡 Feature Requests
- Mark as `enhancement` in Issues
- Describe use cases and expected behavior
- Discuss technical implementation approaches

#### 🔧 Code Contributions

1. **Fork the Project**
   ```bash
   git clone https://github.com/your-username/aitu.git
   ```

2. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Local Development**
   ```bash
   npm install
   npm start
   ```

4. **Code Standards**
   - Follow existing code style
   - Run `nx lint` to check code quality
   - Run `nx test` to ensure tests pass
   - Add necessary test cases

5. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

6. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

#### 📝 Documentation Contributions
- Improve README documentation
- Enhance code comments
- Write usage tutorials

### Development Conventions

- **Commit Message Format**: Follow [Conventional Commits](https://conventionalcommits.org/)
- **Branch Naming**: `feature/feature-name`, `fix/issue-description`, `docs/documentation-update`
- **Code Style**: Use ESLint + Prettier for consistency

## 🚨 Troubleshooting

### Common Issues

#### Installation Problems
```bash
# Clear cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

#### Development Server Startup Failure
```bash
# Check port occupation
lsof -i :4200

# Specify another port
npm start -- --port 3000
```

#### Build Failures
```bash
# Check TypeScript type errors
nx typecheck drawnix

# Check code style
nx lint drawnix
```

#### Performance Issues
- Large whiteboard files may cause slow rendering
- Recommend splitting into multiple smaller files
- Disable unnecessary plugin features

### Getting Help
- 📖 Check [Documentation](./docs/)
- 💬 Submit [Issue](https://github.com/ljquan/aitu/issues)
- 🗣️ Join [Discussions](https://github.com/ljquan/aitu/discussions)

## 🗺️ Roadmap

### Completed ✅
- ✅ Basic whiteboard functionality
- ✅ Mind maps and flowcharts
- ✅ Freehand drawing and image insertion
- ✅ Markdown/Mermaid conversion
- ✅ Mobile adaptation

### In Development 🚧
- 🚧 Collaboration features (real-time multi-user editing)
- 🚧 More export formats (PDF, SVG)
- 🚧 Template system
- 🚧 Plugin marketplace

### Planned 📅
- 📅 Cloud sync storage
- 📅 Version history management
- 📅 Open API platform
- 📅 Desktop client

Follow [Releases](https://github.com/ljquan/aitu/releases) for release plans.

## Thank you for supporting

Special thanks to the company for its strong support for open source projects, and also to the friends who contributed code and provided suggestions to this project.

<p align="left">
  <a href="https://pingcode.com?utm_source=drawnix" target="_blank">
      <img src="https://cdn-aliyun.pingcode.com/static/site/img/pingcode-logo.4267e7b.svg" width="120" alt="PingCode" />
  </a>
</p>

## License

[MIT License](https://github.com/ljquan/aitu/blob/master/LICENSE)