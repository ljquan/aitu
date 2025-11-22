# Aitu Project Constitution

## Core Principles

### I. Plugin-First Architecture
Every feature should be implemented as a composable plugin following the `withXxx` pattern. Plugins must be:
- **Self-contained**: Each plugin has clear boundaries and responsibilities
- **Independently testable**: Can be tested in isolation
- **Composable**: Can be combined with other plugins without conflicts
- **Framework-agnostic**: Core logic should work across UI frameworks (React, Angular, etc.)

**Example**: `withFreehand`, `withMind`, `withDraw`, `withHotkey` - each extending editor capabilities without coupling

### II. File Size Constraint (NON-NEGOTIABLE)
**Single file MUST NOT exceed 500 lines** (including blank lines and comments)

This is a hard constraint to ensure:
- Code readability and maintainability
- Proper separation of concerns
- Easy code review and understanding
- Prevention of monolithic components

**Enforcement**:
- PR reviews must reject files > 500 lines
- Exceptions require architectural review and documented justification
- Refactor into multiple files or abstract into reusable modules

### III. Type Safety First
TypeScript strict mode is mandatory. All code must:
- Use `interface` for object types, `type` for unions/intersections
- Define explicit types for all component Props
- Avoid `any` - use concrete types or generics
- Pass strict TypeScript checks before commit

**Example**:
```typescript
// ✅ Good
interface UserProfileProps {
  userId: string;
  onUpdate: (user: User) => void;
}

// ❌ Bad
const UserProfile = (props: any) => {}
```

### IV. Design System Consistency
All UI components must use **TDesign React** with light theme. Consistency rules:
- Use TDesign components for all UI elements
- Follow brand color system (Orange-Gold, Blue-Purple, Creation Accent)
- Use CSS variables from design system
- Tooltip theme must be 'light'
- Follow BEM naming convention for custom styles

### V. Performance & Optimization
Optimize for user experience:
- Use `React.memo` for expensive components
- Use `useCallback` for event handlers passed to children
- Use `useMemo` for expensive calculations
- Implement code splitting with `React.lazy` for large components
- Lazy load images and implement preloading strategies
- Consider virtualization for long lists

### VI. Security & Validation
Security is non-negotiable:
- Validate and sanitize ALL user inputs
- Never hardcode sensitive information (API keys, passwords)
- Use secure error handling for API calls
- Filter sensitive data from logs
- Validate file uploads (type, size, content)

### VII. Monorepo Structure
Maintain clear separation in the Nx monorepo:
- `apps/web/` - Main web application
- `packages/drawnix/` - Core whiteboard library
- `packages/react-board/` - React wrapper for Plait
- `packages/react-text/` - Text rendering components

Each package should have clear dependencies and minimal coupling.

## Development Standards

### Naming Conventions
**File naming** (STRICTLY ENFORCED):
- Component files: `PascalCase.tsx` (e.g., `ImageCropPopup.tsx`)
- Hook files: `camelCase.ts` (e.g., `useImageCrop.ts`)
- Utility files: `kebab-case.ts` (e.g., `image-utils.ts`)
- Type files: `kebab-case.types.ts` (e.g., `image-crop.types.ts`)
- Constant files: `UPPER_SNAKE_CASE.ts` (e.g., `STORAGE_KEYS.ts`)

**Code naming**:
- Variables: camelCase
- Constants: UPPER_SNAKE_CASE
- Components: PascalCase
- Interfaces/Types: PascalCase

### Component Structure
All React components must follow this order:
1. Imports (third-party → local)
2. Type definitions
3. Constants
4. Main component function
5. Hooks (useState, useEffect, custom hooks)
6. Event handlers (useCallback wrapped)
7. Render logic

**Example**:
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

### Testing Requirements
Every feature must include:
- **Unit tests** for logic and utilities
- **Component tests** for React components using React Testing Library
- **Integration tests** for plugin interactions
- **E2E tests** for critical user flows (using Playwright)

Tests must:
- Pass before commit
- Cover edge cases and error states
- Follow Arrange-Act-Assert pattern
- Use descriptive test names in Chinese or English

### CSS/SCSS Standards
Follow BEM methodology:
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

## Git & Version Control

### Commit Message Format
Follow Conventional Commits:
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**: feat, fix, docs, style, refactor, test, chore, perf, ci

**Example**:
```
feat(crop): 添加图片圆形和椭圆形裁剪功能

- 实现三种裁剪形状：方形、圆形、椭圆形
- 添加裁剪预览功能
- 更新相关TypeScript类型定义

Closes #123
```

### Branch Strategy
- `main` - Production-ready code
- `develop` - Development integration branch
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates

### Pre-commit Checks
Before any commit, code must pass:
- ✅ TypeScript type checking (`nx typecheck`)
- ✅ ESLint checks (`nx lint`)
- ✅ Unit tests (`nx test`)
- ✅ File size validation (< 500 lines)
- ✅ No console.log or debug code
- ✅ No hardcoded secrets

## Brand Guidelines Integration

### Visual Identity
- **Brand Name**: Aitu (爱图) - AI Image & Video Creation Tool
- **Tagline**: 爱上图像,爱上创作 (Love Images, Love Creation)

### Color System
```scss
// Primary brand colors
--brand-primary: #F39C12;        // Orange-Gold
--brand-secondary: #5A4FCF;      // Blue-Purple
--brand-accent: #E91E63;         // Creation Accent

// Gradients
--gradient-brand: linear-gradient(135deg, #F39C12 0%, #E67E22 30%, #5A4FCF 70%, #E91E63 100%);
--gradient-brush: linear-gradient(135deg, #5A4FCF 0%, #7B68EE 50%, #E91E63 100%);
```

**Usage**:
- Main CTAs: Use brand gradients
- Links/emphasis: Orange-gold (#F39C12)
- AI features: Blue-purple (#5A4FCF)
- Creation tools: Magenta (#E91E63)

### Typography
- **Font Stack**: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif
- **Scale**: xs(12), sm(14), base(16), lg(18), xl(20), 2xl(24), 3xl(30), 4xl(36)

### Component Design
- **Buttons**: 8px border-radius, gradient backgrounds, 12px/24px padding
- **Cards**: 12px border-radius, white background, subtle shadows, 24px padding
- **Inputs**: 8px border-radius, 2px focus border in brand primary
- **Animations**: 150-300ms transitions with ease-out curves

## Quality Gates

### Code Review Checklist
Before approving any PR, verify:
- [ ] TypeScript strict mode compliance
- [ ] All files < 500 lines
- [ ] Tests added/updated and passing
- [ ] TDesign components used for UI
- [ ] BEM naming for custom styles
- [ ] No hardcoded values or secrets
- [ ] Performance optimizations applied
- [ ] Security validation implemented
- [ ] Accessibility standards met
- [ ] Documentation updated

### Definition of Done
A feature is complete when:
1. Code is implemented and reviewed
2. Unit tests written and passing (>80% coverage)
3. Integration tests passing
4. E2E tests for critical flows passing
5. Documentation updated (JSDoc, README)
6. Accessibility verified
7. Performance benchmarked
8. Security reviewed
9. Deployed to staging and verified

## Architecture Constraints

### Dependency Rules
- Core packages (`@plait/*`) must not depend on UI frameworks
- React packages can depend on core but not vice versa
- Plugins must not have circular dependencies
- Utils must be pure functions with no side effects

### Storage & Persistence
- Use `localforage` for browser storage
- Implement automatic save with debouncing
- Support migration for data format changes
- Export formats: PNG, JPG, JSON (.drawnix)

### Internationalization
- Use `useI18n` hook for all user-facing text
- Support Chinese (zh-CN) and English (en-US)
- No hardcoded strings in components
- Translation keys follow namespace pattern

## Governance

### Constitution Authority
This constitution supersedes all other coding practices and conventions. Any deviation requires:
1. Documented justification
2. Architectural review approval
3. Update to this constitution OR exception documentation
4. Migration plan if existing code needs updates

### Amendment Process
To amend this constitution:
1. Propose change via GitHub Issue with label `constitution-amendment`
2. Discuss with team and stakeholders
3. Obtain approval from project maintainers
4. Update this document with rationale
5. Update version and last amended date
6. Communicate changes to all contributors

### Enforcement
- All PRs must include constitution compliance verification
- CI/CD pipeline enforces automated checks
- Manual review checks non-automatable standards
- Violations block merge until resolved
- Repeated violations trigger architectural review

### Related Documents
For runtime development guidance, refer to:
- **[CLAUDE.md](../../CLAUDE.md)** - AI assistant guidance and project overview
- **[docs/CODING_STANDARDS.md](../../docs/CODING_STANDARDS.md)** - Detailed coding standards
- **[README.md](../../README.md)** - Project documentation and setup

---

**Version**: 1.0.0 | **Ratified**: 2025-01-22 | **Last Amended**: 2025-01-22
