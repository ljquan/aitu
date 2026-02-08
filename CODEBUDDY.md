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

Opentu (开图) is an open-source whiteboard application built on the Plait framework. It supports mind maps, flowcharts, freehand drawing, image insertion, and AI-powered content generation (images via Gemini, videos via Veo3/Sora-2). The project uses a plugin architecture with React components and is built with Nx as the monorepo management tool.

## Development Commands

**Essential Commands:**
- `npm start` - Start development server (serves web app at localhost:7200)
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
- `apps/web/` - Main web application (opentu.ai)
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

#### 对象字面量只能指定已知属性
**场景**: 向函数传递 metadata/options 对象时

❌ **错误示例**:
```typescript
// 错误：传递了类型定义中不存在的属性
await cacheService.cacheMediaFromBlob(url, blob, 'image', {
  source: 'imported',      // ❌ 类型中没有 source
  importedAt: Date.now(),  // ❌ 类型中没有 importedAt
});

// 类型定义：{ taskId?: string; prompt?: string; model?: string }
```

✅ **正确示例**:
```typescript
// 正确：只使用类型定义中存在的属性
await cacheService.cacheMediaFromBlob(url, blob, 'image', {
  taskId: `imported-${Date.now()}`,  // ✅ 利用现有字段传递信息
});
```

**原因**: TypeScript 的严格对象字面量检查会禁止传递未知属性。如果需要额外信息：1) 使用现有字段组合表达（如 `taskId: 'imported-xxx'`）；2) 或修改类型定义扩展接口。

#### 扩展外部库的枚举类型
**场景**: 需要在外部库的枚举（如 `@plait/common` 的 `StrokeStyle`）基础上添加新值时

❌ **错误示例**:
```typescript
// 错误：直接修改外部库的枚举（无法做到）或使用魔术字符串
import { StrokeStyle } from '@plait/common';

const strokeStyle = 'hollow';  // ❌ 类型不匹配
setStrokeStyle(board, strokeStyle);  // 错误：类型 'string' 不能赋给 StrokeStyle
```

✅ **正确示例**:
```typescript
// 正确：创建扩展类型，同时保持与原始枚举的兼容性
import { StrokeStyle } from '@plait/common';

// 1. 使用联合类型扩展
export type FreehandStrokeStyle = StrokeStyle | 'hollow';

// 2. 创建同名常量对象，合并原始枚举值
export const FreehandStrokeStyle = {
  ...StrokeStyle,
  hollow: 'hollow' as const,
};

// 使用时可以访问所有值
const style1 = FreehandStrokeStyle.solid;   // ✅ 原始值
const style2 = FreehandStrokeStyle.hollow;  // ✅ 扩展值
```

**原因**: TypeScript 的枚举是封闭的，无法在外部添加新成员。通过 "类型 + 同名常量对象" 模式，可以：1) 保持与原始枚举的完全兼容；2) 类型安全地添加新值；3) 在运行时和编译时都能正确使用。

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

#### Service Worker 初始化时序
**场景**: 提交工作流到 Service Worker 执行前

❌ **错误示例**:
```typescript
// 错误：直接提交工作流，SW 可能还未初始化
const submitToSW = async (workflow) => {
  await workflowSubmissionService.submit(swWorkflow);
  // 如果 SW 的 workflowHandler 未初始化，工作流会被暂存
  // 步骤状态永远停留在 pending（"待开始"）
};
```

✅ **正确示例**:
```typescript
// 正确：先确保 SW 已初始化
const submitToSW = async (workflow) => {
  // 确保 SW 任务队列已初始化（发送 TASK_QUEUE_INIT 消息）
  const { swTaskQueueService } = await import('../services/sw-task-queue-service');
  await swTaskQueueService.initialize();
  
  await workflowSubmissionService.submit(swWorkflow);
};
```

**原因**: Service Worker 的 `workflowHandler` 需要收到 `TASK_QUEUE_INIT` 消息后才会初始化。如果在 SW 初始化前提交工作流，消息会被暂存到 `pendingWorkflowMessages`，等待配置到达。若配置永远不到达，工作流就永远不会开始执行。

#### 重复提交检测应由 UI 层处理
**场景**: 实现防重复提交功能时

❌ **错误示例**:
```typescript
// 错误：在服务层基于参数哈希进行去重
class TaskQueueService {
  private recentSubmissions: Map<string, number>;

  createTask(params: GenerationParams, type: TaskType): Task {
    const paramsHash = generateParamsHash(params, type);
    if (this.isDuplicateSubmission(paramsHash)) {
      throw new Error('Duplicate submission detected');
    }
    this.recentSubmissions.set(paramsHash, Date.now());
  }
}
```

✅ **正确示例**:
```typescript
// 正确：服务层只检查 taskId 重复，UI 层通过按钮防抖处理重复提交
class TaskQueueService {
  createTask(params: GenerationParams, type: TaskType): Task {
    const taskId = generateTaskId(); // UUID v4，每次不同
    // 不做参数去重
  }
}

// UI 层
const [isSubmitting, setIsSubmitting] = useState(false);
const handleSubmit = async () => {
  if (isSubmitting) return;
  setIsSubmitting(true);
  try { await taskQueueService.createTask(params, type); }
  finally { setTimeout(() => setIsSubmitting(false), 1000); }
};
```

**原因**: 用户可能故意连续提交相同参数（想生成多张图）。防重复点击是 UI 交互问题，应由 UI 层解决，服务层不应基于参数内容去重。

#### React Component Guidelines
- Use functional components with Hooks
- Destructure props with default values
- Use `React.memo` to optimize re-renders where beneficial
- Wrap event handlers with `useCallback`
- Use `useEffect` with complete dependency arrays
- Hook order in components: state hooks → effect hooks → event handlers → render logic

#### 多组件共享异步数据时使用 Context
**场景**: 多个组件需要展示同一份异步获取的数据（如模型健康状态），各自调用同一个 hook 导致状态不同步

❌ **错误示例**:
```typescript
// 错误：每个组件独立调用 hook，各自维护独立状态
// ModelSelector.tsx - Trigger 中的徽章
const ModelTrigger = () => {
  const { getHealthStatus } = useModelHealth(); // 独立的 healthMap 状态
  return <ModelHealthBadge modelId={modelId} />;
};

// ModelSelector.tsx - 下拉列表中的徽章
const ModelOption = () => {
  const { getHealthStatus } = useModelHealth(); // 另一个独立的 healthMap 状态
  return <ModelHealthBadge modelId={modelId} />;
};

// useModelHealth.ts
export const useModelHealth = () => {
  const [healthMap, setHealthMap] = useState({}); // 每个调用者都有独立副本！
  useEffect(() => { fetchData(); }, []);
  return { getHealthStatus: (id) => healthMap[id] };
};
// 问题：两个组件的 healthMap 可能在不同时间更新，显示不一致
```

✅ **正确示例**:
```typescript
// 正确：使用 Context 共享数据，所有组件使用同一份状态
// ModelHealthContext.tsx
const ModelHealthContext = createContext<ModelHealthContextType | null>(null);

export const ModelHealthProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [healthMap, setHealthMap] = useState({});
  useEffect(() => { fetchData(); }, []);
  
  const value = useMemo(() => ({
    getHealthStatus: (id) => healthMap[id],
  }), [healthMap]);
  
  return <ModelHealthContext.Provider value={value}>{children}</ModelHealthContext.Provider>;
};

export const useModelHealthContext = () => {
  const context = useContext(ModelHealthContext);
  if (!context) throw new Error('useModelHealthContext must be used within ModelHealthProvider');
  return context;
};

// 组件中使用
const ModelHealthBadge = ({ modelId }) => {
  const { getHealthStatus } = useModelHealthContext(); // 所有实例共享同一份数据
  return <Badge status={getHealthStatus(modelId)} />;
};
```

**原因**: 每个 `useState` 调用都会创建独立的状态副本。当多个组件各自调用同一个 hook 时，它们维护的是独立的状态，异步更新时机不同会导致 UI 显示不一致（如下拉框触发器和列表项显示不同的健康状态）。使用 Context 可以确保所有组件共享同一份数据。

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

#### Props 默认值避免创建新对象
**场景**: 在函数组件参数中为对象类型的 props 设置默认值时

❌ **错误示例**:
```typescript
// 每次渲染都创建新的 Set/Array/Object，导致子组件重渲染或无限循环
const MyComponent: React.FC<Props> = ({
  selectedIds = new Set(),      // ❌ 每次渲染创建新 Set
  items = [],                   // ❌ 每次渲染创建新数组
  config = { enabled: true },   // ❌ 每次渲染创建新对象
}) => { ... };
```

✅ **正确示例**:
```typescript
// 在模块顶层定义单例常量
const EMPTY_SET = new Set<string>();
const EMPTY_ARRAY: Item[] = [];
const DEFAULT_CONFIG = { enabled: true };

const MyComponent: React.FC<Props> = ({
  selectedIds,
  items,
  config,
}) => {
  // 在组件内部使用 nullish coalescing
  const stableSelectedIds = selectedIds ?? EMPTY_SET;
  const stableItems = items ?? EMPTY_ARRAY;
  const stableConfig = config ?? DEFAULT_CONFIG;
  ...
};
```

**原因**: 在函数参数中使用 `= new Set()` 或 `= []` 作为默认值，每次组件渲染时都会创建新的对象引用。这会导致：1) 依赖该 prop 的 `useMemo`/`useEffect` 每次都重新执行；2) 使用 `@tanstack/react-virtual` 等库时可能触发无限渲染循环；3) 子组件的 `React.memo` 优化失效。

#### Props 变化时重置组件内部状态
**场景**: 组件内部有状态（如进度、计数器），当某个关键 prop 变化时需要重置这些状态（如重试功能）

❌ **错误示例**:
```typescript
// 错误：startedAt 变化时，simulatedProgress 不会自动重置
const ProgressOverlay: React.FC<Props> = ({ startedAt }) => {
  const [simulatedProgress, setSimulatedProgress] = useState(0);
  
  useEffect(() => {
    // startedAt 变化时 effect 会重新执行，但 simulatedProgress 保留旧值
    const interval = setInterval(() => {
      setSimulatedProgress(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);
  
  return <div>{simulatedProgress}%</div>; // 重试时从旧进度继续，而非从 0 开始
};

// 父组件
<ProgressOverlay startedAt={task.startedAt} />
```

✅ **正确示例**:
```typescript
// 方法 1（推荐）：使用 key 强制重新挂载组件
<ProgressOverlay 
  key={task.startedAt}  // startedAt 变化时组件重新挂载，状态自动重置
  startedAt={task.startedAt} 
/>

// 方法 2：在 useEffect 中显式重置状态
useEffect(() => {
  setSimulatedProgress(0);  // 先重置
  // ... 然后开始计算
}, [startedAt]);
```

**原因**: React 组件的内部状态（useState）在 props 变化时不会自动重置，只有组件卸载并重新挂载时才会重置。对于需要在某个 prop 变化时"重新开始"的场景（如重试、切换数据源），使用 `key` prop 是最简洁可靠的方式。

#### 事件处理中避免过早返回阻塞清理逻辑
**场景**: 在 useEffect 订阅事件时，事件处理函数中有多个操作，部分操作依赖前置条件，部分操作（如清理 UI）不依赖

❌ **错误示例**:
```typescript
// 错误：过早返回导致清理 WorkZone 的逻辑永远不会执行
useEffect(() => {
  const subscription = completionService.observe().subscribe((event) => {
    const workflow = workflowControl.getWorkflow();
    if (!workflow) return;  // ❌ 过早返回

    const step = workflow.steps.find(s => s.taskId === event.taskId);
    if (!step) return;  // ❌ 过早返回

    // 更新 UI 状态...
    updateWorkflowMessage(workflow);

    // 清理 WorkZone（通过 ref，不依赖 workflow/step）
    if (event.type === 'completed') {
      const workZoneId = currentWorkZoneIdRef.current;
      if (workZoneId) {
        removeWorkZone(workZoneId);  // ❌ 永远不会执行！
      }
    }
  });
  return () => subscription.unsubscribe();
}, []);
```

✅ **正确示例**:
```typescript
// 正确：将不依赖前置条件的操作移到条件检查之外
useEffect(() => {
  const subscription = completionService.observe().subscribe((event) => {
    const workflow = workflowControl.getWorkflow();
    const step = workflow?.steps.find(s => s.taskId === event.taskId);

    // 依赖 workflow/step 的操作放在条件内
    if (workflow && step) {
      updateWorkflowMessage(workflow);
    }

    // 不依赖 workflow/step 的清理操作放在条件外
    if (event.type === 'completed') {
      const workZoneId = currentWorkZoneIdRef.current;
      if (workZoneId) {
        removeWorkZone(workZoneId);  // ✅ 总是能执行
        currentWorkZoneIdRef.current = null;
      }
    }
  });
  return () => subscription.unsubscribe();
}, []);
```

**原因**: 事件处理中的清理操作（如删除 UI 元素）通常通过 ref 引用，不依赖于事件携带的数据。如果在检查事件数据有效性时过早 `return`，会导致清理逻辑被跳过，造成 UI 残留（如 WorkZone 面板未关闭）。应该将独立的操作分离，确保关键清理逻辑总能执行。

#### 多分支函数中提前 return 导致共享逻辑未执行
**场景**: 异步函数有多个执行路径（如 SW 执行和主线程 fallback），每个分支都需要执行某些共享逻辑（如重置状态、启动定时器）

❌ **错误示例**:
```typescript
const handleGenerate = async () => {
  setIsSubmitting(true);
  
  try {
    const { usedSW } = await submitWorkflowToSW(params);
    if (usedSW) {
      // SW 执行成功
      setPrompt('');
      return;  // ❌ 提前返回，跳过了冷却定时器
    }
  } catch (error) {
    // fallback to main thread
  }
  
  // 主线程执行...
  await executeInMainThread();
  
  // 启动冷却定时器（只有主线程路径能执行到这里）
  submitCooldownRef.current = setTimeout(() => {
    setIsSubmitting(false);  // ❌ SW 路径永远不会重置！
  }, 1000);
};
```

✅ **正确示例**:
```typescript
const handleGenerate = async () => {
  setIsSubmitting(true);
  
  try {
    const { usedSW } = await submitWorkflowToSW(params);
    if (usedSW) {
      // SW 执行成功
      setPrompt('');
      
      // ✅ 在 return 前执行共享逻辑
      submitCooldownRef.current = setTimeout(() => {
        setIsSubmitting(false);
      }, 1000);
      return;
    }
  } catch (error) {
    // fallback to main thread
  }
  
  // 主线程执行...
  await executeInMainThread();
  
  // 主线程路径也执行相同的冷却逻辑
  submitCooldownRef.current = setTimeout(() => {
    setIsSubmitting(false);
  }, 1000);
};
```

**原因**: 当函数有多个执行路径时，每个路径都可能需要执行某些共享逻辑（如重置状态）。如果在某个分支中提前 `return` 而忘记执行共享逻辑，会导致状态不一致（如 `isSubmitting` 永远为 `true`，输入框被禁用）。解决方案：1) 在每个 `return` 前确保执行共享逻辑；2) 或将共享逻辑提取到 `finally` 块中。

#### CSS/SCSS Guidelines
- Use BEM naming convention
- Prefer design system CSS variables (see Brand Guidelines below)
- Property order: positioning → box model → appearance → typography → animations
- Use nested selectors for organization

#### Flex 布局中兄弟元素隐藏导致宽度变化
**场景**: 使用 `flex: 1` 的容器，当某个兄弟元素（如侧边栏）被隐藏时，内部组件宽度会随之变化

❌ **错误示例**:
```scss
// 错误：内部组件没有宽度限制，隐藏侧边栏后会撑满
.form-section {
  flex: 1;
  
  .upload-area {
    // 没有 max-width，会随父容器变宽
  }
}

.sidebar {
  width: 400px;
  // 隐藏后，form-section 会占据全部宽度
}
```

✅ **正确示例**:
```scss
// 正确：给内部组件设置 max-width 保持稳定
.form-section {
  flex: 1;
  
  .upload-area {
    max-width: 400px; // 限制最大宽度，保持稳定
  }
}
```

**原因**: 当 `flex: 1` 的容器的兄弟元素被隐藏时，Flexbox 会重新分配空间，导致该容器变宽。如果内部组件没有宽度限制，会跟随变宽，可能导致视觉变形（如按钮区域变得过大）。给需要保持稳定的内部组件设置 `max-width` 可以防止这种问题。

#### Performance Guidelines
- Use `React.lazy` for code splitting large components
- Implement lazy loading and preloading for images
- Avoid creating new objects/functions in render
- Consider virtualization for long lists

#### 高频事件处理性能优化
**场景**: 处理 `pointerMove`、`mousemove`、`scroll` 等高频事件时

❌ **错误示例**:
```typescript
// 错误：每次 pointerMove 都读取配置、创建大量 DOM 元素
board.pointerMove = (event: PointerEvent) => {
  const settings = getSettings(board);  // 每次都读取
  
  // 为每个点创建单独的 SVG 元素
  for (let i = 0; i < points.length - 1; i++) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    g.appendChild(line);  // 大量 DOM 操作
  }
};
```

✅ **正确示例**:
```typescript
// 正确：缓存配置，减少 DOM 操作
let cachedSettings: Settings | null = null;

const getSettings = (forceRefresh = false) => {
  if (!cachedSettings || forceRefresh) {
    cachedSettings = readSettings(board);
  }
  return cachedSettings;
};

board.pointerDown = (event: PointerEvent) => {
  cachedSettings = getSettings(true);  // 仅在开始时刷新
};

board.pointerMove = (event: PointerEvent) => {
  const settings = getSettings();  // 使用缓存
  
  // 使用单个 path 元素而非多个 line
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', generatePathData(points));  // 一次性设置
};

board.pointerUp = () => {
  cachedSettings = null;  // 结束时清除缓存
};
```

**原因**: 高频事件（如绘图时的 pointerMove）每秒可触发 60+ 次。每次都读取配置或创建大量 DOM 元素会导致明显卡顿。应该：1) 在事件序列开始时缓存配置；2) 使用单个 SVG path 替代多个 line 元素；3) 使用 `performance.now()` 代替 `Date.now()` 获取更精确的时间戳。

#### PointerEvent 压力感应兼容性
**场景**: 实现画笔/手写功能需要根据压力调整笔迹粗细时

❌ **错误示例**:
```typescript
// 错误：直接使用 pressure，鼠标/触控板永远返回 0.5
const handlePointerMove = (event: PointerEvent) => {
  const pressure = event.pressure; // MacBook 触控板: 永远 0.5
  const strokeWidth = baseWidth * pressure;
};
```

✅ **正确示例**:
```typescript
// 正确：检测设备类型，使用速度模拟压力
const handlePointerMove = (event: PointerEvent) => {
  // 只有 pointerType === 'pen' 才有真实压力值
  const hasPenPressure = event.pointerType === 'pen' && 
                         event.pressure > 0 && 
                         event.pressure !== 0.5;
  
  if (hasPenPressure) {
    return event.pressure; // 使用真实压力
  }
  
  // 鼠标/触控板：用速度模拟（慢=粗，快=细）
  const velocity = distance / timeDiff;
  const pressure = 1 - Math.min(velocity / threshold, 1) * 0.8;
  return pressure;
};
```

**原因**: `PointerEvent.pressure` 只有压感笔（Apple Pencil、Wacom）才提供真实值（0-1）。鼠标点击固定返回 0.5，触控板也是 0.5。对于不支持压力的设备，应使用绘制速度模拟：慢速 → 高压力（粗），快速 → 低压力（细）。

#### Plait Board Viewport 缩放+平移
**场景**: 需要将画布视图移动到某个元素并调整缩放时

❌ **错误示例**:
```typescript
// 错误：分两步操作，updateZoom 先改变视口位置，moveToCenter 基于错误状态计算
BoardTransforms.updateZoom(board, zoom);
BoardTransforms.moveToCenter(board, [centerX, centerY]);
// 结果：视口位置错乱，元素不在视口中心
```

✅ **正确示例**:
```typescript
// 正确：使用 updateViewport 一次性设置 origination 和 zoom
const container = PlaitBoard.getBoardContainer(board);
const viewportWidth = container.clientWidth;
const viewportHeight = container.clientHeight;

// origination 是视口左上角在世界坐标中的位置
const origination: [number, number] = [
  centerX - viewportWidth / 2 / zoom,
  centerY - viewportHeight / 2 / zoom,
];
BoardTransforms.updateViewport(board, origination, zoom);
```

**原因**: `updateZoom` 会以视口中心为锚点重新计算 origination，改变视口位置。随后 `moveToCenter` 内部依赖 `getSelectedElements` 并基于已被 zoom 改变后的视口状态计算偏移，导致最终位置不正确。使用 `updateViewport` 可以原子性地同时设置缩放和位置。

#### 全屏展示画布局部内容用 viewport 对准 + 隐藏 UI + 蒙层挖洞
**场景**: 需要全屏/沉浸式展示画布中某个区域的内容时（如 Frame 幻灯片播放、元素预览）

❌ **错误示例 1**:
```typescript
// 错误：仅操纵画布 viewport，用户仍能看到画布 UI（抽屉、工具栏等）
const focusFrame = (frame: PlaitFrame) => {
  const rect = RectangleClient.getRectangleByPoints(frame.points);
  const zoom = Math.min(window.innerWidth / rect.width, window.innerHeight / rect.height);
  const origination: [number, number] = [
    rect.x + rect.width / 2 - window.innerWidth / 2 / zoom,
    rect.y + rect.height / 2 - window.innerHeight / 2 / zoom,
  ];
  BoardTransforms.updateViewport(board, origination, zoom);
};
// 问题：画布工具栏、侧边栏、底部栏仍然可见，用户无法专注于内容
```

❌ **错误示例 2**:
```typescript
// 错误：使用 toImage 截图，可能丢失内容（<defs> 引用、子元素绑定不完全）
const captureFrameAsImage = async (board: PlaitBoard, frame: PlaitFrame) => {
  const children = FrameTransforms.getFrameChildren(board, frame);
  return await toImage(board, { elements: [frame, ...children] });
};
// 问题：toImage 对渐变填充、图片引用、SVG <defs> 处理不完善，导致截图内容缺失
```

✅ **正确示例**:
```typescript
// 正确：三步走——① viewport 对准 ② CSS 隐藏 UI ③ 蒙层挖洞

// 步骤 1：进入时隐藏所有 UI 覆盖层
const SLIDESHOW_CLASS = 'slideshow-active';
document.documentElement.classList.add(SLIDESHOW_CLASS);

// 步骤 2：viewport 对准 Frame 并计算屏幕位置
const rect = RectangleClient.getRectangleByPoints(frame.points);
const container = PlaitBoard.getBoardContainer(board);
const vw = container.clientWidth;
const vh = container.clientHeight;
const zoom = Math.min((vw - PADDING * 2) / rect.width, (vh - PADDING * 2) / rect.height, 3);
const origination: [number, number] = [
  rect.x + rect.width / 2 - vw / 2 / zoom,
  rect.y + rect.height / 2 - vh / 2 / zoom,
];
BoardTransforms.updateViewport(board, origination, zoom);

// 步骤 3：直接计算 Frame 在屏幕上的位置（不依赖异步 DOM 查询）
const containerBounds = container.getBoundingClientRect();
const screenRect = {
  left: containerBounds.left + (rect.x - origination[0]) * zoom,
  top: containerBounds.top + (rect.y - origination[1]) * zoom,
  width: rect.width * zoom,
  height: rect.height * zoom,
};
// 用四块黑色 div 围住 Frame 区域，中间空出窗口

// 退出时恢复
document.documentElement.classList.remove(SLIDESHOW_CLASS);
BoardTransforms.updateViewport(board, savedOrigination, savedZoom);
```

```scss
// CSS：slideshow 模式隐藏所有 UI 覆盖层
.slideshow-active {
  .unified-toolbar, .popup-toolbar, .project-drawer,
  .chat-drawer, .toolbox-drawer, .ai-input-bar,
  .view-navigation, .performance-panel /* ... */ {
    display: none !important;
  }
}
```

**原因**: `toImage` 截图方案看似干净，但实际有严重缺陷——SVG 中的 `<defs>`（渐变、图案填充）引用会丢失，子元素如果不是通过 `frameId` 绑定而是空间重叠则无法获取，导致截图内容缺失。而仅操纵 viewport 不隐藏 UI 会导致抽屉、工具栏等透过蒙层露出。正确方案是三者结合：viewport 对准确保画布原生渲染（所见即所得）、CSS 隐藏 UI 确保干净背景、蒙层挖洞聚焦目标区域。

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
- Name: opentu (开图) - AI Image & Video Creation Tool
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

#### Sora-2 Character API Convention
**场景**: 创建或查询 Sora-2 角色时

❌ **错误示例**:
```typescript
// 错误：使用不存在的 /characters 接口
const response = await fetch(`${baseUrl}/characters`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ video_id: taskId, model: 'sora-2-character' }),
});

// 错误：查询时使用 /characters 路径
await fetch(`${baseUrl}/characters/${characterId}`);
```

✅ **正确示例**:
```typescript
// 正确：使用 /v1/videos 接口 + FormData + character_from_task 参数
const formData = new FormData();
formData.append('character_from_task', 'sora-2-pro:task_xxx');
formData.append('model', 'sora-2-character');
formData.append('character_timestamps', '0,3');

const response = await fetch(`${baseUrl}/videos`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}` },
  body: formData,
});

// 正确：查询时使用 /v1/videos 路径
await fetch(`${baseUrl}/videos/${characterId}`);
```

**原因**: Sora-2 角色 API 复用视频接口 `/v1/videos`，不存在独立的 `/characters` 端点。创建角色时必须使用 `character_from_task` 参数（非 `video_id`）和 FormData 格式。参考 `character-api-service.ts` 的实现。

#### Base64 编码膨胀问题
**场景**: 压缩图片后转换为 base64 传给 AI API 时

❌ **错误示例**:
```typescript
// 错误：目标 Blob 大小设为 1MB，但 base64 编码后会膨胀约 33%
const MAX_SIZE = 1 * 1024 * 1024; // 1MB
const compressedBlob = await compressImage(blob, MAX_SIZE);
const base64 = await blobToBase64(compressedBlob);
// base64 实际大小约 1.33MB，超过限制！
```

✅ **正确示例**:
```typescript
// 正确：考虑 base64 膨胀，目标 Blob 大小设为 750KB
const MAX_SIZE = 750 * 1024; // 750KB，base64 后约 1MB
const compressedBlob = await compressImage(blob, MAX_SIZE);
const base64 = await blobToBase64(compressedBlob);
// base64 实际大小约 1MB，符合限制
```

**原因**: Base64 编码将每 3 字节转换为 4 字符，导致数据大小增加约 33%（4/3 倍）。如果目标是 base64 < 1MB，Blob 应该压缩到 ~750KB。

#### Cache API 时间戳刷新问题
**场景**: 在 Service Worker 中判断缓存图片是否过期时

❌ **错误示例**:
```typescript
// 错误：sw-cache-date 会在每次访问时被刷新，永远不会"过期"
const cachedResponse = await cache.match(url);
const cacheDate = cachedResponse.headers.get('sw-cache-date');
const cacheTime = parseInt(cacheDate, 10);
const isExpired = Date.now() - cacheTime > 12 * 60 * 60 * 1000;
// isExpired 永远是 false，因为每次访问都会刷新 sw-cache-date
```

✅ **正确示例**:
```typescript
// 正确：从 IndexedDB 获取原始缓存时间（不会被刷新）
const originalCacheTime = await getOriginalCacheTimeFromIndexedDB(url);
const fallbackCacheTime = parseInt(cachedResponse.headers.get('sw-cache-date') || '0', 10);
const cacheTime = originalCacheTime ?? fallbackCacheTime;
const isExpired = Date.now() - cacheTime > 12 * 60 * 60 * 1000;
```

**原因**: 本项目的 Service Worker 在每次访问缓存图片时会更新 `sw-cache-date` 以延长缓存时间（见 `sw/index.ts` 第 1732 行）。如果需要判断"原始缓存时间"，应该从 IndexedDB (`drawnix-unified-cache`) 的 `cachedAt` 字段获取，该字段不会因访问而更新。

#### GitHub Gist API 批量上传大小限制
**场景**: 通过 GitHub Gist API 批量上传媒体文件时

❌ **错误示例**:
```typescript
// 错误：一次性上传所有文件，可能导致请求体过大返回 422 错误
const filesToUpdate: Record<string, string> = {};
for (const item of items) {
  const content = await prepareMediaForUpload(item);  // 每个文件可能几 MB
  filesToUpdate[`media_${item.id}.json`] = content;
}
// 如果 items 有 10 个，每个 2MB，总共 20MB，会导致 422 Unprocessable Content
await gitHubApiService.updateGistFiles(filesToUpdate, gistId);
```

✅ **正确示例**:
```typescript
// 正确：检查总大小，超过限制时分批上传
const MAX_BATCH_SIZE = 8 * 1024 * 1024; // 8MB
const totalSize = Object.values(filesToUpdate).reduce((sum, content) => sum + content.length, 0);

if (totalSize > MAX_BATCH_SIZE) {
  // 分批上传
  await uploadInBatches(filesToUpdate, gistId, MAX_BATCH_SIZE);
} else {
  await gitHubApiService.updateGistFiles(filesToUpdate, gistId);
}

async function uploadInBatches(files: Record<string, string>, gistId: string, maxSize: number) {
  let currentBatch: Record<string, string> = {};
  let currentSize = 0;

  for (const [filename, content] of Object.entries(files)) {
    if (currentSize + content.length > maxSize && Object.keys(currentBatch).length > 0) {
      await gitHubApiService.updateGistFiles(currentBatch, gistId);
      currentBatch = {};
      currentSize = 0;
    }
    currentBatch[filename] = content;
    currentSize += content.length;
  }

  if (Object.keys(currentBatch).length > 0) {
    await gitHubApiService.updateGistFiles(currentBatch, gistId);
  }
}
```

**原因**: GitHub Gist API 对单次请求体大小有限制（约 10MB），超过限制会返回 422 Unprocessable Content 错误。当批量上传多个 Base64 编码的媒体文件时，很容易超过这个限制。应该监控总上传大小，必要时分批上传。参考 `shard-sync-service.ts` 的 `uploadInBatches` 实现。

#### 素材库数据来源与备份恢复
**场景**: 实现备份导出/导入功能时，需要考虑素材库的数据来源

素材库（`AssetContext`）展示的素材来自两个来源：
1. **本地上传的素材**：存储在 IndexedDB (`aitu-assets`) 中
2. **AI 生成的素材**：从任务队列 (`taskQueueService.getTasksByStatus(COMPLETED)`) 动态获取

❌ **错误示例**:
```typescript
// 错误：只导出媒体文件，没有导出任务数据
async exportAssets(zip: JSZip) {
  const cachedMedia = await unifiedCacheService.getAllCacheMetadata();
  for (const item of cachedMedia) {
    const blob = await unifiedCacheService.getCachedBlob(item.url);
    zip.file(`assets/${item.id}.jpg`, blob);
  }
  // 导入后素材库无法展示 AI 生成的素材！
}
```

✅ **正确示例**:
```typescript
// 正确：同时导出任务数据
async exportAssets(zip: JSZip) {
  // 1. 导出媒体文件
  const cachedMedia = await unifiedCacheService.getAllCacheMetadata();
  for (const item of cachedMedia) {
    const blob = await unifiedCacheService.getCachedBlob(item.url);
    zip.file(`assets/${item.id}.jpg`, blob);
  }
  
  // 2. 导出任务数据（素材库展示需要）
  const completedTasks = swTaskQueueService.getTasksByStatus(TaskStatus.COMPLETED)
    .filter(t => t.type === TaskType.IMAGE || t.type === TaskType.VIDEO);
  zip.file('tasks.json', JSON.stringify(completedTasks));
}

// 导入时恢复任务数据
async importAssets(zip: JSZip) {
  // ... 导入媒体文件 ...
  
  // 恢复任务数据
  const tasksFile = zip.file('tasks.json');
  if (tasksFile) {
    const tasks = JSON.parse(await tasksFile.async('string'));
    await swTaskQueueService.restoreTasks(tasks);
  }
}
```

**原因**: 素材库通过 `AssetContext.loadAssets()` 加载素材时，会调用 `taskQueueService.getTasksByStatus(TaskStatus.COMPLETED)` 获取 AI 生成的素材。如果只导出媒体文件而不导出任务数据，导入后任务队列为空，素材库就无法展示这些 AI 生成的素材。
