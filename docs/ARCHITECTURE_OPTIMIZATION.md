# 爱图 (Aitu) 架构优化方案

> 本文档是对现有架构的优化建议，与 `ARCHITECTURE_DESIGN.md` 中的新架构设计方案形成互补。

## 1. 优化目标与问题分析

### 1.1 现有架构问题总结

| 问题领域 | 具体问题 | 影响 |
|---------|---------|------|
| **状态管理** | Context + RxJS 混合使用，职责不清 | 代码复杂度高，性能隐患 |
| **插件系统** | 函数组合模式，直接修改 Board 实例 | 无法动态加载/卸载，耦合度高 |
| **窗口管理** | WinBox 独立管理，无统一注册机制 | 难以实现多窗口协同 |
| **数据请求** | 手动 fetch，无统一缓存策略 | 重复请求，状态管理分散 |
| **工作流** | AI 生成流程硬编码在组件中 | 难以定制和扩展 |
| **类型安全** | 部分 API 类型定义不完整 | 运行时错误风险 |

### 1.2 优化目标

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              优化目标                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. 性能优化     │ 减少不必要的重渲染，优化大型画布性能                        │
│  2. 开发体验     │ 简化状态管理，提升代码可维护性                              │
│  3. 可扩展性     │ 支持插件热插拔，工作流可配置化                              │
│  4. 用户体验     │ 统一窗口管理，优化交互响应                                  │
│  5. 代码质量     │ 完善类型定义，增强错误处理                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 状态管理优化

### 2.1 现状分析

当前项目使用 **React Context + Hooks + RxJS** 的混合方案：

```typescript
// 现有方案 - DrawnixContext
export const DrawnixContext = createContext<{
  appState: DrawnixState;
  setAppState: (appState: DrawnixState) => void;
  board: DrawnixBoard | null;
} | null>(null);

// 服务层使用 RxJS Subject
class TaskQueueService {
  private taskUpdates$: Subject<TaskEvent>;
  observeTaskUpdates(): Observable<TaskEvent> { ... }
}
```

**问题：**
1. Context 变化会导致所有消费组件重渲染
2. RxJS 与 React 生态整合需要额外的 Hook 封装
3. 两套状态管理方案增加了心智负担

### 2.2 推荐方案：Zustand

**为什么选择 Zustand：**

| 特性 | React Context | RxJS | Zustand |
|------|--------------|------|---------|
| 学习曲线 | 低 | 高 | 低 |
| 细粒度订阅 | ❌ | ✅ | ✅ |
| React 集成 | 原生 | 需要适配 | 原生 |
| DevTools | ❌ | ❌ | ✅ |
| 持久化 | 需要手动 | 需要手动 | 内置中间件 |
| Bundle 大小 | 0 | ~30KB | ~3KB |
| TypeScript | 一般 | 优秀 | 优秀 |

### 2.3 Zustand Store 设计

```typescript
// stores/drawnix-store.ts
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// ============================================================================
// 类型定义
// ============================================================================

interface UIState {
  pointer: DrawnixPointerType;
  isPencilMode: boolean;
  isMobile: boolean;
  activeDialog: DialogType | null;
  dialogInitialData?: DialogInitialData;
  linkState?: LinkState;
}

interface WindowState {
  windows: Map<string, WindowInstance>;
  focusedWindowId: string | null;
  zIndexCounter: number;
}

interface TaskState {
  tasks: Map<string, Task>;
  activeTaskIds: string[];
}

interface BoardState {
  board: PlaitBoard | null;
  lastSelectedElementIds: string[];
}

interface DrawnixStore extends UIState, WindowState, TaskState, BoardState {
  // UI Actions
  setPointer: (pointer: DrawnixPointerType) => void;
  togglePencilMode: () => void;
  openDialog: (type: DialogType, data?: DialogInitialData) => void;
  closeDialog: () => void;
  setLinkState: (state: LinkState | undefined) => void;
  
  // Window Actions
  openWindow: (options: WindowOptions) => string;
  closeWindow: (windowId: string) => void;
  focusWindow: (windowId: string) => void;
  minimizeWindow: (windowId: string) => void;
  maximizeWindow: (windowId: string) => void;
  updateWindowPosition: (windowId: string, position: { x: number; y: number }) => void;
  updateWindowSize: (windowId: string, size: { width: number; height: number }) => void;
  
  // Task Actions
  createTask: (params: CreateTaskParams) => string;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  cancelTask: (taskId: string) => void;
  retryTask: (taskId: string) => void;
  removeTask: (taskId: string) => void;
  
  // Board Actions
  setBoard: (board: PlaitBoard | null) => void;
  setLastSelectedElementIds: (ids: string[]) => void;
}

// ============================================================================
// Store 实现
// ============================================================================

export const useDrwanixStore = create<DrawnixStore>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, get) => ({
          // ==================== 初始状态 ====================
          // UI State
          pointer: 'selection' as DrawnixPointerType,
          isPencilMode: false,
          isMobile: false,
          activeDialog: null,
          dialogInitialData: undefined,
          linkState: undefined,
          
          // Window State
          windows: new Map(),
          focusedWindowId: null,
          zIndexCounter: 1000,
          
          // Task State
          tasks: new Map(),
          activeTaskIds: [],
          
          // Board State
          board: null,
          lastSelectedElementIds: [],
          
          // ==================== UI Actions ====================
          setPointer: (pointer) => set({ pointer }),
          
          togglePencilMode: () => set((state) => ({ 
            isPencilMode: !state.isPencilMode 
          })),
          
          openDialog: (type, data) => set({ 
            activeDialog: type, 
            dialogInitialData: data 
          }),
          
          closeDialog: () => set({ 
            activeDialog: null, 
            dialogInitialData: undefined 
          }),
          
          setLinkState: (linkState) => set({ linkState }),
          
          // ==================== Window Actions ====================
          openWindow: (options) => {
            const { windows, zIndexCounter } = get();
            
            // 单例检查
            if (options.singleton && windows.has(options.id)) {
              get().focusWindow(options.id);
              return options.id;
            }
            
            const windowId = options.singleton 
              ? options.id 
              : `${options.id}-${Date.now()}`;
            
            set((state) => {
              const newWindow: WindowInstance = {
                id: windowId,
                options,
                state: {
                  x: calculateWindowX(options),
                  y: calculateWindowY(options),
                  width: parseWindowSize(options.width, window.innerWidth, 800),
                  height: parseWindowSize(options.height, window.innerHeight, 600),
                  zIndex: state.zIndexCounter + 1,
                  minimized: false,
                  maximized: false,
                  focused: true,
                  visible: true,
                },
              };
              
              // 取消其他窗口的焦点
              state.windows.forEach((w) => {
                w.state.focused = false;
              });
              
              state.windows.set(windowId, newWindow);
              state.focusedWindowId = windowId;
              state.zIndexCounter += 1;
            });
            
            return windowId;
          },
          
          closeWindow: (windowId) => set((state) => {
            state.windows.delete(windowId);
            if (state.focusedWindowId === windowId) {
              // 聚焦到最上层的窗口
              const topWindow = findTopWindow(state.windows);
              state.focusedWindowId = topWindow?.id ?? null;
              if (topWindow) {
                topWindow.state.focused = true;
              }
            }
          }),
          
          focusWindow: (windowId) => set((state) => {
            const window = state.windows.get(windowId);
            if (!window) return;
            
            state.windows.forEach((w) => {
              w.state.focused = w.id === windowId;
            });
            
            window.state.zIndex = state.zIndexCounter + 1;
            window.state.minimized = false;
            state.focusedWindowId = windowId;
            state.zIndexCounter += 1;
          }),
          
          minimizeWindow: (windowId) => set((state) => {
            const window = state.windows.get(windowId);
            if (window) {
              window.state.minimized = true;
              window.state.focused = false;
            }
          }),
          
          maximizeWindow: (windowId) => set((state) => {
            const window = state.windows.get(windowId);
            if (window) {
              window.state.maximized = !window.state.maximized;
            }
          }),
          
          updateWindowPosition: (windowId, position) => set((state) => {
            const window = state.windows.get(windowId);
            if (window) {
              window.state.x = position.x;
              window.state.y = position.y;
            }
          }),
          
          updateWindowSize: (windowId, size) => set((state) => {
            const window = state.windows.get(windowId);
            if (window) {
              window.state.width = size.width;
              window.state.height = size.height;
            }
          }),
          
          // ==================== Task Actions ====================
          createTask: (params) => {
            const taskId = generateTaskId();
            const task: Task = {
              id: taskId,
              type: params.type,
              status: 'pending',
              params: params.params,
              createdAt: Date.now(),
              progress: 0,
            };
            
            set((state) => {
              state.tasks.set(taskId, task);
              state.activeTaskIds.push(taskId);
            });
            
            return taskId;
          },
          
          updateTask: (taskId, updates) => set((state) => {
            const task = state.tasks.get(taskId);
            if (task) {
              Object.assign(task, updates, { updatedAt: Date.now() });
            }
          }),
          
          cancelTask: (taskId) => set((state) => {
            const task = state.tasks.get(taskId);
            if (task && task.status === 'running') {
              task.status = 'cancelled';
              task.updatedAt = Date.now();
            }
          }),
          
          retryTask: (taskId) => set((state) => {
            const task = state.tasks.get(taskId);
            if (task && (task.status === 'failed' || task.status === 'cancelled')) {
              task.status = 'pending';
              task.error = undefined;
              task.progress = 0;
              task.updatedAt = Date.now();
            }
          }),
          
          removeTask: (taskId) => set((state) => {
            state.tasks.delete(taskId);
            state.activeTaskIds = state.activeTaskIds.filter(id => id !== taskId);
          }),
          
          // ==================== Board Actions ====================
          setBoard: (board) => set({ board }),
          
          setLastSelectedElementIds: (ids) => set({ lastSelectedElementIds: ids }),
        }))
      ),
      {
        name: 'drawnix-storage',
        // 只持久化部分状态
        partialize: (state) => ({
          // 不持久化 board、windows、tasks 等运行时状态
        }),
      }
    ),
    { name: 'DrawnixStore' }
  )
);

// ============================================================================
// 选择器 Hooks（细粒度订阅）
// ============================================================================

// UI 选择器
export const usePointer = () => useDrwanixStore((s) => s.pointer);
export const useIsPencilMode = () => useDrwanixStore((s) => s.isPencilMode);
export const useActiveDialog = () => useDrwanixStore((s) => s.activeDialog);
export const useDialogInitialData = () => useDrwanixStore((s) => s.dialogInitialData);

// Window 选择器
export const useWindows = () => useDrwanixStore((s) => s.windows);
export const useFocusedWindowId = () => useDrwanixStore((s) => s.focusedWindowId);
export const useWindow = (windowId: string) => 
  useDrwanixStore((s) => s.windows.get(windowId));

// Task 选择器
export const useTasks = () => useDrwanixStore((s) => s.tasks);
export const useTask = (taskId: string) => 
  useDrwanixStore((s) => s.tasks.get(taskId));
export const useActiveTaskIds = () => useDrwanixStore((s) => s.activeTaskIds);
export const useActiveTasks = () => useDrwanixStore((s) => {
  return s.activeTaskIds.map(id => s.tasks.get(id)).filter(Boolean) as Task[];
});

// Board 选择器
export const useBoard = () => useDrwanixStore((s) => s.board);
export const useLastSelectedElementIds = () => 
  useDrwanixStore((s) => s.lastSelectedElementIds);

// ============================================================================
// Actions Hooks（不触发重渲染）
// ============================================================================

export const useDrawnixActions = () => useDrwanixStore((s) => ({
  // UI
  setPointer: s.setPointer,
  togglePencilMode: s.togglePencilMode,
  openDialog: s.openDialog,
  closeDialog: s.closeDialog,
  setLinkState: s.setLinkState,
  
  // Window
  openWindow: s.openWindow,
  closeWindow: s.closeWindow,
  focusWindow: s.focusWindow,
  minimizeWindow: s.minimizeWindow,
  maximizeWindow: s.maximizeWindow,
  
  // Task
  createTask: s.createTask,
  updateTask: s.updateTask,
  cancelTask: s.cancelTask,
  retryTask: s.retryTask,
  removeTask: s.removeTask,
  
  // Board
  setBoard: s.setBoard,
  setLastSelectedElementIds: s.setLastSelectedElementIds,
}));

// ============================================================================
// 辅助函数
// ============================================================================

function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function calculateWindowX(options: WindowOptions): number {
  if (typeof options.x === 'number') return options.x;
  const width = parseWindowSize(options.width, window.innerWidth, 800);
  switch (options.x) {
    case 'center': return (window.innerWidth - width) / 2;
    case 'left': return 20;
    case 'right': return window.innerWidth - width - 20;
    default: return (window.innerWidth - width) / 2;
  }
}

function calculateWindowY(options: WindowOptions): number {
  if (typeof options.y === 'number') return options.y;
  const height = parseWindowSize(options.height, window.innerHeight, 600);
  switch (options.y) {
    case 'center': return (window.innerHeight - height) / 2;
    case 'top': return 60;
    case 'bottom': return window.innerHeight - height - 20;
    default: return (window.innerHeight - height) / 2;
  }
}

function parseWindowSize(
  size: number | string | undefined, 
  containerSize: number, 
  defaultSize: number
): number {
  if (size === undefined) return defaultSize;
  if (typeof size === 'number') return size;
  if (size.endsWith('%')) {
    return (parseFloat(size) / 100) * containerSize;
  }
  return parseInt(size, 10) || defaultSize;
}

function findTopWindow(windows: Map<string, WindowInstance>): WindowInstance | undefined {
  let topWindow: WindowInstance | undefined;
  let maxZIndex = -1;
  
  windows.forEach((w) => {
    if (!w.state.minimized && w.state.zIndex > maxZIndex) {
      maxZIndex = w.state.zIndex;
      topWindow = w;
    }
  });
  
  return topWindow;
}
```

### 2.4 迁移示例

**迁移前（Context）：**

```typescript
// 组件中使用
function MyComponent() {
  const { appState, setAppState, board } = useDrawnix();
  
  const handleClick = () => {
    setAppState({ ...appState, pointer: 'hand' });
  };
  
  // 整个组件会在 appState 任何属性变化时重渲染
  return <div>...</div>;
}
```

**迁移后（Zustand）：**

```typescript
// 组件中使用
function MyComponent() {
  // 只订阅需要的状态，细粒度更新
  const pointer = usePointer();
  const { setPointer } = useDrawnixActions();
  
  const handleClick = () => {
    setPointer('hand');
  };
  
  // 只有 pointer 变化时才重渲染
  return <div>...</div>;
}
```

### 2.5 与 RxJS 的整合

对于需要复杂事件流处理的场景，可以保留 RxJS，但通过 Zustand 的 `subscribeWithSelector` 进行桥接：

```typescript
// 订阅 store 变化并转换为 RxJS Observable
import { Observable } from 'rxjs';

export function observeStoreChanges<T>(
  selector: (state: DrawnixStore) => T
): Observable<T> {
  return new Observable((subscriber) => {
    const unsubscribe = useDrwanixStore.subscribe(
      selector,
      (value) => subscriber.next(value)
    );
    return unsubscribe;
  });
}

// 使用示例
const tasks$ = observeStoreChanges((s) => s.tasks);
tasks$.pipe(
  filter((tasks) => tasks.size > 0),
  debounceTime(100)
).subscribe((tasks) => {
  // 处理任务变化
});
```

---

## 3. 数据请求优化

### 3.1 现状分析

当前项目使用手动 fetch 进行 API 调用：

```typescript
// 现有方案
async function generateImage(params: GenerationParams) {
  const response = await fetch('/api/generate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return response.json();
}
```

**问题：**
1. 无统一的请求/响应拦截
2. 无自动缓存和去重
3. 错误处理分散
4. 无请求状态管理

### 3.2 推荐方案：TanStack Query

```typescript
// services/api-client.ts
import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';

// ============================================================================
// Query Client 配置
// ============================================================================

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 分钟
      gcTime: 30 * 60 * 1000,   // 30 分钟
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 1,
    },
  },
});

// ============================================================================
// API 基础配置
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

class ApiClient {
  private baseUrl: string;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }
  
  async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({
        code: 'UNKNOWN_ERROR',
        message: response.statusText,
      }));
      throw new ApiError(error.code, error.message, error.details);
    }
    
    return response.json();
  }
  
  get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }
  
  post<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

// ============================================================================
// AI 图像生成 API
// ============================================================================

interface GenerateImageParams {
  prompt: string;
  referenceImages?: string[];
  width?: number;
  height?: number;
  model?: string;
}

interface GenerateImageResult {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  imageUrl?: string;
  error?: string;
}

// 创建生成任务
export function useCreateImageTask() {
  return useMutation({
    mutationFn: (params: GenerateImageParams) => 
      apiClient.post<GenerateImageResult>('/api/ai/image/generate', params),
    onSuccess: (data) => {
      // 任务创建成功后，开始轮询状态
      queryClient.invalidateQueries({ queryKey: ['imageTask', data.taskId] });
    },
  });
}

// 查询任务状态
export function useImageTask(taskId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['imageTask', taskId],
    queryFn: () => apiClient.get<GenerateImageResult>(`/api/ai/image/task/${taskId}`),
    enabled: !!taskId && options?.enabled !== false,
    refetchInterval: (data) => {
      // 任务完成或失败后停止轮询
      if (data?.status === 'completed' || data?.status === 'failed') {
        return false;
      }
      return 2000; // 2 秒轮询一次
    },
  });
}

// 获取生成历史
export function useImageHistory(options?: { limit?: number }) {
  return useQuery({
    queryKey: ['imageHistory', options?.limit],
    queryFn: () => apiClient.get<GenerateImageResult[]>(
      `/api/ai/image/history?limit=${options?.limit || 20}`
    ),
    staleTime: 60 * 1000, // 1 分钟
  });
}

// ============================================================================
// AI 视频生成 API
// ============================================================================

interface GenerateVideoParams {
  prompt: string;
  referenceImage?: string;
  duration?: number;
  model?: string;
}

interface GenerateVideoResult {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  thumbnailUrl?: string;
  progress?: number;
  error?: string;
}

export function useCreateVideoTask() {
  return useMutation({
    mutationFn: (params: GenerateVideoParams) => 
      apiClient.post<GenerateVideoResult>('/api/ai/video/generate', params),
  });
}

export function useVideoTask(taskId: string | null) {
  return useQuery({
    queryKey: ['videoTask', taskId],
    queryFn: () => apiClient.get<GenerateVideoResult>(`/api/ai/video/task/${taskId}`),
    enabled: !!taskId,
    refetchInterval: (data) => {
      if (data?.status === 'completed' || data?.status === 'failed') {
        return false;
      }
      return 3000;
    },
  });
}

// ============================================================================
// 模型配置 API
// ============================================================================

interface ModelConfig {
  id: string;
  name: string;
  type: 'image' | 'video';
  provider: string;
  maxWidth?: number;
  maxHeight?: number;
  supportedFeatures?: string[];
}

export function useAvailableModels(type: 'image' | 'video') {
  return useQuery({
    queryKey: ['models', type],
    queryFn: () => apiClient.get<ModelConfig[]>(`/api/models?type=${type}`),
    staleTime: 10 * 60 * 1000, // 10 分钟
  });
}
```

### 3.3 组件中使用

```typescript
// components/ai-image-generation.tsx
import { useCreateImageTask, useImageTask } from '@/services/api-client';

function AIImageGeneration() {
  const [taskId, setTaskId] = useState<string | null>(null);
  
  const createTask = useCreateImageTask();
  const taskQuery = useImageTask(taskId);
  
  const handleGenerate = async (params: GenerateImageParams) => {
    try {
      const result = await createTask.mutateAsync(params);
      setTaskId(result.taskId);
    } catch (error) {
      // 错误处理
    }
  };
  
  return (
    <div>
      <GenerationForm 
        onSubmit={handleGenerate} 
        loading={createTask.isPending} 
      />
      
      {taskQuery.data && (
        <TaskProgress 
          status={taskQuery.data.status}
          imageUrl={taskQuery.data.imageUrl}
          error={taskQuery.data.error}
        />
      )}
    </div>
  );
}
```

---

## 4. 样式方案优化

### 4.1 现状分析

当前使用 **Sass + CSS Module**：

```scss
// component.module.scss
.container {
  display: flex;
  padding: 16px;
  background-color: var(--bg-color);
  
  &__header {
    font-size: 18px;
    font-weight: 600;
  }
  
  &--active {
    background-color: var(--active-bg);
  }
}
```

**问题：**
1. 需要频繁切换文件
2. 类名命名需要手动管理
3. 响应式样式编写繁琐
4. 主题切换实现复杂

### 4.2 推荐方案：Tailwind CSS + CSS Module

保留 CSS Module 用于复杂组件，引入 Tailwind 用于快速开发：

```typescript
// tailwind.config.js 扩展
module.exports = {
  content: [
    './apps/**/*.{ts,tsx}',
    './packages/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 与 TDesign 主题色对齐
        primary: {
          DEFAULT: 'var(--td-brand-color)',
          hover: 'var(--td-brand-color-hover)',
          active: 'var(--td-brand-color-active)',
        },
        surface: {
          DEFAULT: 'var(--td-bg-color-container)',
          secondary: 'var(--td-bg-color-secondarycontainer)',
        },
      },
      spacing: {
        // 与 TDesign 间距对齐
        'td-xs': 'var(--td-comp-paddingLR-xs)',
        'td-s': 'var(--td-comp-paddingLR-s)',
        'td-m': 'var(--td-comp-paddingLR-m)',
        'td-l': 'var(--td-comp-paddingLR-l)',
      },
      borderRadius: {
        'td-small': 'var(--td-radius-small)',
        'td-default': 'var(--td-radius-default)',
        'td-large': 'var(--td-radius-large)',
      },
    },
  },
  plugins: [],
};
```

### 4.3 使用示例

```tsx
// 简单组件使用 Tailwind
function Button({ children, variant = 'primary' }) {
  return (
    <button 
      className={cn(
        'px-4 py-2 rounded-td-default font-medium transition-colors',
        variant === 'primary' && 'bg-primary text-white hover:bg-primary-hover',
        variant === 'secondary' && 'bg-surface border border-gray-200 hover:bg-surface-secondary'
      )}
    >
      {children}
    </button>
  );
}

// 复杂组件保留 CSS Module
import styles from './complex-component.module.scss';

function ComplexComponent() {
  return (
    <div className={cn(styles.container, 'p-4')}>
      <header className={cn(styles.header, 'mb-4')}>
        {/* ... */}
      </header>
    </div>
  );
}
```

---

## 5. 表单处理优化

### 5.1 推荐方案：React Hook Form + Zod

```typescript
// schemas/generation-schema.ts
import { z } from 'zod';

export const imageGenerationSchema = z.object({
  prompt: z
    .string()
    .min(1, '请输入图像描述')
    .max(2000, '描述不能超过 2000 字符'),
  referenceImages: z
    .array(z.string().url())
    .max(4, '最多上传 4 张参考图')
    .optional(),
  width: z
    .number()
    .min(256, '宽度最小 256')
    .max(4096, '宽度最大 4096')
    .default(1024),
  height: z
    .number()
    .min(256, '高度最小 256')
    .max(4096, '高度最大 4096')
    .default(1024),
  model: z.string().default('gemini-2.5-flash-image'),
});

export type ImageGenerationFormData = z.infer<typeof imageGenerationSchema>;

// components/image-generation-form.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

function ImageGenerationForm({ onSubmit, loading }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<ImageGenerationFormData>({
    resolver: zodResolver(imageGenerationSchema),
    defaultValues: {
      prompt: '',
      width: 1024,
      height: 1024,
      model: 'gemini-2.5-flash-image',
    },
  });
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">图像描述</label>
        <textarea
          {...register('prompt')}
          className="w-full p-3 border rounded-td-default"
          rows={4}
          placeholder="描述你想要生成的图像..."
        />
        {errors.prompt && (
          <p className="text-red-500 text-sm mt-1">{errors.prompt.message}</p>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">宽度</label>
          <input
            type="number"
            {...register('width', { valueAsNumber: true })}
            className="w-full p-2 border rounded-td-default"
          />
          {errors.width && (
            <p className="text-red-500 text-sm mt-1">{errors.width.message}</p>
          )}
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">高度</label>
          <input
            type="number"
            {...register('height', { valueAsNumber: true })}
            className="w-full p-2 border rounded-td-default"
          />
          {errors.height && (
            <p className="text-red-500 text-sm mt-1">{errors.height.message}</p>
          )}
        </div>
      </div>
      
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 bg-primary text-white rounded-td-default disabled:opacity-50"
      >
        {loading ? '生成中...' : '生成图像'}
      </button>
    </form>
  );
}
```

---

## 6. 动画优化

### 6.1 推荐方案：Framer Motion

```typescript
// components/window-container.tsx
import { motion, AnimatePresence } from 'framer-motion';

function WindowContainer() {
  const windows = useWindows();
  
  return (
    <div className="window-container">
      <AnimatePresence>
        {Array.from(windows.values())
          .filter((w) => w.state.visible && !w.state.minimized)
          .map((window) => (
            <motion.div
              key={window.id}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ 
                opacity: 1, 
                scale: 1, 
                y: 0,
                x: window.state.x,
                width: window.state.maximized ? '100%' : window.state.width,
                height: window.state.maximized ? '100%' : window.state.height,
              }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ 
                type: 'spring', 
                stiffness: 300, 
                damping: 30 
              }}
              style={{ zIndex: window.state.zIndex }}
              className="absolute bg-white rounded-lg shadow-xl overflow-hidden"
            >
              <ManagedWindow window={window} />
            </motion.div>
          ))}
      </AnimatePresence>
      
      <WindowTaskbar windows={windows} />
    </div>
  );
}

// 任务进度动画
function TaskProgress({ progress }: { progress: number }) {
  return (
    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
      <motion.div
        className="h-full bg-primary"
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </div>
  );
}
```

---

## 7. 技术栈对比总结

| 类别 | 现有方案 | 推荐方案 | 优势 |
|------|---------|---------|------|
| **状态管理** | Context + RxJS | Zustand | 简洁、高性能、内置持久化 |
| **数据请求** | 手动 fetch | TanStack Query | 缓存、去重、状态管理一体化 |
| **样式方案** | Sass + CSS Module | Tailwind + CSS Module | 开发效率高、一致性好 |
| **表单处理** | 手动管理 | React Hook Form + Zod | 类型安全、验证强大 |
| **动画** | CSS/手动 | Framer Motion | 声明式、功能丰富 |
| **类型校验** | TypeScript | TypeScript + Zod | 运行时类型安全 |

---

## 8. 迁移计划

### 8.1 阶段规划

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Phase 1: 基础设施 (1-2 周)                                                  │
│  ├── 安装并配置 Zustand                                                      │
│  ├── 安装并配置 TanStack Query                                               │
│  ├── 配置 Tailwind CSS                                                       │
│  └── 安装 React Hook Form + Zod                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 2: 状态管理迁移 (2-3 周)                                               │
│  ├── 创建 Zustand Store                                                      │
│  ├── 迁移 DrawnixContext 到 Zustand                                          │
│  ├── 迁移 TaskQueueService 状态到 Zustand                                    │
│  └── 保留 RxJS 用于复杂事件流                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 3: API 层迁移 (1-2 周)                                                 │
│  ├── 创建 API Client                                                         │
│  ├── 迁移 AI 生成 API 到 TanStack Query                                      │
│  └── 添加请求缓存和错误处理                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 4: UI 优化 (2-3 周)                                                    │
│  ├── 迁移关键组件样式到 Tailwind                                              │
│  ├── 迁移表单到 React Hook Form                                               │
│  └── 添加 Framer Motion 动画                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Phase 5: 测试与优化 (1 周)                                                   │
│  ├── 性能测试和优化                                                           │
│  ├── 回归测试                                                                 │
│  └── 文档更新                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 迁移原则

1. **渐进式迁移**：新旧方案并行，逐步替换
2. **向后兼容**：保留现有 API，提供适配层
3. **测试优先**：每个迁移步骤都要有测试覆盖
4. **文档同步**：及时更新开发文档

### 8.3 风险控制

| 风险 | 应对措施 |
|------|---------|
| 迁移过程中出现 Bug | 保留回滚能力，分批次发布 |
| 新库学习成本 | 提供内部培训和示例代码 |
| 性能退化 | 建立性能基准，持续监控 |
| 第三方库更新 | 锁定版本，定期评估更新 |

---

## 9. 附录

### 9.1 依赖版本建议

```json
{
  "dependencies": {
    "zustand": "^4.5.0",
    "@tanstack/react-query": "^5.17.0",
    "react-hook-form": "^7.49.0",
    "@hookform/resolvers": "^3.3.0",
    "zod": "^3.22.0",
    "framer-motion": "^10.18.0"
  },
  "devDependencies": {
    "tailwindcss": "^3.4.0",
    "@tanstack/react-query-devtools": "^5.17.0"
  }
}
```

### 9.2 相关文档链接

- [Zustand 官方文档](https://docs.pmnd.rs/zustand)
- [TanStack Query 官方文档](https://tanstack.com/query/latest)
- [React Hook Form 官方文档](https://react-hook-form.com/)
- [Zod 官方文档](https://zod.dev/)
- [Tailwind CSS 官方文档](https://tailwindcss.com/)
- [Framer Motion 官方文档](https://www.framer.com/motion/)

### 9.3 与 ARCHITECTURE_DESIGN.md 的关系

本文档（ARCHITECTURE_OPTIMIZATION.md）专注于**技术栈优化**，提供具体的库选型和实现方案。

`ARCHITECTURE_DESIGN.md` 专注于**架构设计**，定义插件系统、窗口管理、工作流引擎的接口和实现。

两个文档互为补充：
- 本文档的 Zustand Store 可以作为 `ARCHITECTURE_DESIGN.md` 中各系统的状态管理基础
- 本文档的 TanStack Query 可以用于工作流节点的 API 调用
- 本文档的表单方案可以用于工作流 UI 生成器
