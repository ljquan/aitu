# Research: 素材管理库 (Media Library) - Technical Decisions

**Feature**: 009-media-library
**Date**: 2025-12-11
**Status**: Completed

## Overview

本文档记录素材管理库功能的技术研究和决策，包括存储策略、状态管理、UI架构和最佳实践。

## 1. IndexedDB Storage Strategy

### Decision
使用 **localforage** 库作为 IndexedDB 的包装器进行素材数据持久化存储。

### Rationale
1. **简化API**: localforage 提供类似 localStorage 的简单 API，同时利用 IndexedDB 的强大功能
2. **跨浏览器兼容**: 自动降级到 WebSQL 或 localStorage（如果 IndexedDB 不可用）
3. **Promise-based**: 原生支持 async/await，易于与 React 集成
4. **项目已使用**: 现有代码库已经使用 localforage（media-cache-service.ts, storage-service.ts）
5. **Blob 支持**: 原生支持存储 Blob 对象，适合媒体文件

### Alternatives Considered
- **直接使用 IndexedDB API**: 过于底层，需要更多样板代码
- **Dexie.js**: 功能强大但增加bundle大小，对于我们的用例过度设计
- **idb**: 轻量但缺少 localforage 的自动降级特性

### Implementation Details
```typescript
// 存储配置
const assetStore = localforage.createInstance({
  name: 'aitu-assets',
  storeName: 'assets',
  description: 'Media library assets storage'
});

// 数据结构
interface StoredAsset {
  id: string;
  type: AssetType;
  source: AssetSource;
  name: string;
  mimeType: string;
  createdAt: number;
  blobData: Blob;  // 存储实际文件数据
}
```

### Best Practices
1. **分离元数据和 Blob**: 考虑使用两个store（metadata + blobs）以提高查询性能
2. **错误处理**: 包装所有 storage 操作在 try-catch 中，处理 QuotaExceededError
3. **清理策略**: 提供手动删除和下载功能，让用户管理空间
4. **批量操作**: 对于初始加载，批量读取元数据而不是逐个加载

## 2. Storage Quota Management

### Decision
实现主动的存储配额监控，在达到 80% 时警告用户。

### Rationale
1. **用户体验**: 主动警告优于突然的存储失败
2. **规范支持**: Storage API 的 `navigator.storage.estimate()` 广泛支持
3. **可操作性**: 用户可以在空间不足前采取行动（删除或下载旧素材）

### Implementation Details
```typescript
// 存储配额检查
async function checkStorageQuota(): Promise<{
  usage: number;
  quota: number;
  percentUsed: number;
}> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    return {
      usage,
      quota,
      percentUsed: (usage / quota) * 100
    };
  }
  return { usage: 0, quota: 0, percentUsed: 0 };
}

// 在添加素材前检查
async function canAddAsset(fileSize: number): Promise<boolean> {
  const { usage, quota } = await checkStorageQuota();
  return (usage + fileSize) < quota * 0.95; // 保留5%缓冲
}
```

### Best Practices
1. **定期检查**: 在组件挂载和每次添加素材后检查配额
2. **视觉反馈**: 使用进度条直观显示使用量
3. **警告阈值**: 80% 显示警告，95% 阻止新上传
4. **降级处理**: 如果 API 不可用，显示估计值或隐藏进度条

## 3. React State Management with Context

### Decision
使用 **React Context API** 进行素材库状态管理，而不是引入Redux或其他状态管理库。

### Rationale
1. **简单性**: 素材库状态相对独立，不需要全局状态管理的复杂性
2. **项目一致性**: 现有代码使用 DrawnixContext 模式
3. **性能**: 使用 useMemo 和 useCallback 优化，避免不必要的重渲染
4. **局部性**: 状态只在素材库弹窗中使用，不需要跨应用共享

### Alternatives Considered
- **Redux**: 过度设计，增加复杂性和bundle大小
- **Zustand**: 轻量但增加新依赖，Context足够
- **组件状态**: 无法在多个组件间共享，难以维护

### Implementation Pattern
```typescript
interface AssetContextValue {
  assets: Asset[];
  loading: boolean;
  error: string | null;
  addAsset: (file: File | Blob, type: AssetType, source: AssetSource) => Promise<void>;
  removeAsset: (id: string) => Promise<void>;
  renameAsset: (id: string, newName: string) => Promise<void>;
  loadAssets: () => Promise<void>;
}

export const AssetContext = createContext<AssetContextValue | null>(null);

export function AssetProvider({ children }: { children: ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 实现各种操作...

  const value = useMemo(() => ({
    assets,
    loading,
    error,
    addAsset,
    removeAsset,
    renameAsset,
    loadAssets
  }), [assets, loading, error]);

  return <AssetContext.Provider value={value}>{children}</AssetContext.Provider>;
}

export function useAssets() {
  const context = useContext(AssetContext);
  if (!context) throw new Error('useAssets must be used within AssetProvider');
  return context;
}
```

### Best Practices
1. **拆分Context**: 如果状态变大，考虑拆分为多个Context（AssetsContext, FiltersContext）
2. **Memoization**: 对过滤/搜索结果使用 useMemo
3. **错误边界**: 包装Provider在ErrorBoundary中
4. **加载状态**: 提供细粒度的加载状态（loading, error, data）

## 4. Component Architecture

### Decision
采用**容器/展示组件模式**，将素材库分解为职责明确的小组件。

### Rationale
1. **500行限制**: 符合项目宪章的文件大小约束
2. **可维护性**: 每个组件职责单一，易于理解和测试
3. **可复用性**: 小组件可以在其他上下文中复用
4. **性能**: 细粒度的组件边界便于React.memo优化

### Component Hierarchy
```
MediaLibraryModal (容器)
├── MediaLibrarySidebar (展示)
│   ├── FilterSection (展示)
│   └── StorageBar (展示)
├── MediaLibraryGrid (容器)
│   ├── MediaLibraryEmpty (展示)
│   └── AssetGridItem (展示) × N
└── MediaLibraryInspector (容器)
    ├── AssetPreview (展示)
    ├── AssetMetadata (展示)
    └── AssetActions (展示)
```

### Best Practices
1. **容器组件**: 处理状态和逻辑，使用hooks
2. **展示组件**: 只接收props，使用React.memo包装
3. **Props drilling**: 最多3层，超过则考虑Context或组合模式
4. **事件处理**: 在容器组件中定义，用useCallback包装后传递

## 5. Integration with AI Generation Dialogs

### Decision
在AI生成对话框中添加**下拉菜单或按钮组**，让用户选择素材来源（素材库 vs 本地文件）。

### Rationale
1. **用户控制**: 明确的选择点，用户知道他们在做什么
2. **渐进式增强**: 保留现有本地文件选择功能
3. **清晰的UX**: 两个选项并排，易于发现
4. **最小侵入**: 不需要重构现有对话框结构

### Implementation Approach
```typescript
// 在 ai-image-generation.tsx 中
function ImageUploadSection() {
  const [uploadSource, setUploadSource] = useState<'local' | 'library'>('local');
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);

  return (
    <>
      <div className="upload-source-selector">
        <Button
          variant={uploadSource === 'local' ? 'base' : 'outline'}
          onClick={() => setUploadSource('local')}
        >
          从本地选择
        </Button>
        <Button
          variant={uploadSource === 'library' ? 'base' : 'outline'}
          onClick={() => {
            setUploadSource('library');
            setShowMediaLibrary(true);
          }}
        >
          从素材库选择
        </Button>
      </div>

      {showMediaLibrary && (
        <MediaLibraryModal
          isOpen={showMediaLibrary}
          onClose={() => setShowMediaLibrary(false)}
          onSelect={(asset) => {
            setReferenceImage(asset);
            setShowMediaLibrary(false);
          }}
          filterType="IMAGE"  // 只显示图片
        />
      )}
    </>
  );
}
```

### Best Practices
1. **类型筛选**: 传递 filterType prop 限制显示的素材类型
2. **回调清晰**: onSelect 回调接收Asset对象，包含所有必要信息
3. **状态同步**: 选择后自动关闭弹窗，更新引用图片预览
4. **错误处理**: 处理素材已被删除的情况

## 6. Auto-save AI Generated Content

### Decision
在任务队列服务中监听AI生成任务完成事件，自动将成功的结果添加到素材库。

### Rationale
1. **自动化**: 用户不需要手动保存，减少操作步骤
2. **集成点清晰**: 任务队列是唯一的生成任务管理点
3. **错误处理**: 只保存成功的生成结果，失败任务不添加
4. **可追溯**: 保留提示词信息作为素材名称

### Implementation Approach
```typescript
// 在 asset-integration-service.ts 中
import { taskQueueService } from './task-queue-service';

function initializeAutoSave() {
  // 订阅任务完成事件
  taskQueueService.tasks$.subscribe((tasks) => {
    tasks.forEach(async (task) => {
      if (task.status === 'completed' && task.resultUrl && !task.savedToLibrary) {
        // 根据任务类型确定素材类型
        const assetType = task.type === 'image-generation'
          ? AssetType.IMAGE
          : AssetType.VIDEO;

        // 获取结果 Blob
        const response = await fetch(task.resultUrl);
        const blob = await response.blob();

        // 生成名称（使用提示词前20字符）
        const name = task.prompt
          ? `${task.prompt.substring(0, 20)}...`
          : `AI${assetType}-${new Date().toISOString()}`;

        // 添加到素材库
        await assetStorageService.addAsset({
          type: assetType,
          source: AssetSource.AI_GENERATED,
          name,
          blob,
          mimeType: blob.type
        });

        // 标记已保存
        taskQueueService.markAsSaved(task.id);
      }
    });
  });
}
```

### Best Practices
1. **幂等性**: 使用 savedToLibrary 标志避免重复添加
2. **错误容忍**: 保存失败不应影响任务队列正常运行
3. **命名策略**: 提供有意义的默认名称，用户可以后续修改
4. **元数据**: 考虑保存提示词、模型名称等额外元数据

## 7. File Validation and Security

### Decision
实现多层文件验证：MIME类型检查、文件扩展名检查和Magic Number验证。

### Rationale
1. **安全性**: 防止恶意文件伪装成图片/视频
2. **用户体验**: 早期验证，提供清晰的错误消息
3. **存储效率**: 避免存储无效文件
4. **类型安全**: 确保所有素材都是有效的媒体文件

### Implementation Details
```typescript
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg'];

async function validateFile(file: File): Promise<{
  valid: boolean;
  error?: string;
}> {
  // 1. MIME类型检查
  const allowedTypes = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `不支持的文件类型: ${file.type}。只支持图片（JPG, PNG, GIF, WebP）和视频（MP4, WebM, OGG）。`
    };
  }

  // 2. 文件大小检查（警告但不阻止）
  const maxSize = 100 * 1024 * 1024; // 100MB
  if (file.size > maxSize) {
    console.warn(`文件较大 (${(file.size / 1024 / 1024).toFixed(2)}MB)，可能影响性能`);
  }

  // 3. Magic Number验证（可选但推荐）
  const isValidMagicNumber = await validateMagicNumber(file);
  if (!isValidMagicNumber) {
    return {
      valid: false,
      error: '文件内容与声明的类型不匹配。'
    };
  }

  return { valid: true };
}

async function validateMagicNumber(file: File): Promise<boolean> {
  // 读取文件前几个字节检查magic number
  const buffer = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // 检查常见格式的magic number
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return true;
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return true;
  // MP4: 根据 ftyp box
  // ... 更多格式检查

  return false;
}
```

### Best Practices
1. **用户友好错误**: 提供具体的错误消息和支持的格式列表
2. **渐进增强**: Magic number验证可选，基础MIME检查必须
3. **性能**: 只读取必要的字节数进行验证
4. **日志记录**: 记录验证失败，但不要暴露给用户敏感信息

## 8. Performance Optimization Strategies

### Decision
实施多层性能优化：组件memo化、虚拟滚动（如需要）、图片懒加载和渐进式加载。

### Rationale
1. **初始加载**: 100个素材需要快速渲染
2. **交互响应**: 筛选和搜索必须流畅
3. **内存效率**: 避免同时加载所有Blob数据
4. **用户体验**: 平滑的滚动和即时的反馈

### Optimization Techniques

#### 1. Component Memoization
```typescript
export const AssetGridItem = React.memo<AssetGridItemProps>(({
  asset,
  isSelected,
  onSelect,
  onDoubleClick
}) => {
  // 组件实现
}, (prevProps, nextProps) => {
  // 自定义比较函数
  return prevProps.asset.id === nextProps.asset.id &&
         prevProps.isSelected === nextProps.isSelected;
});
```

#### 2. Lazy Loading Images
```typescript
function AssetThumbnail({ url }: { url: string }) {
  const [src, setSrc] = useState<string>('');
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setSrc(url);
        observer.disconnect();
      }
    });

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [url]);

  return <img ref={imgRef} src={src} alt="" />;
}
```

#### 3. Filtered List Memoization
```typescript
const filteredAssets = useMemo(() => {
  return assets
    .filter(asset => {
      const matchesType = activeType === 'ALL' || asset.type === activeType;
      const matchesSource = activeSource === 'ALL' || asset.source === activeSource;
      const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSource && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'DATE_DESC') return b.createdAt - a.createdAt;
      if (sortBy === 'DATE_ASC') return a.createdAt - b.createdAt;
      if (sortBy === 'NAME_ASC') return a.name.localeCompare(b.name);
      return 0;
    });
}, [assets, activeType, activeSource, searchQuery, sortBy]);
```

#### 4. Virtual Scrolling (如需要)
```typescript
// 如果素材数量>200，考虑使用 react-window
import { FixedSizeGrid } from 'react-window';

function VirtualizedGrid({ assets }: { assets: Asset[] }) {
  const COLUMN_COUNT = 5;
  const ROW_HEIGHT = 200;
  const COLUMN_WIDTH = 180;

  return (
    <FixedSizeGrid
      columnCount={COLUMN_COUNT}
      columnWidth={COLUMN_WIDTH}
      height={600}
      rowCount={Math.ceil(assets.length / COLUMN_COUNT)}
      rowHeight={ROW_HEIGHT}
      width={900}
    >
      {({ columnIndex, rowIndex, style }) => {
        const index = rowIndex * COLUMN_COUNT + columnIndex;
        const asset = assets[index];
        return asset ? (
          <div style={style}>
            <AssetGridItem asset={asset} />
          </div>
        ) : null;
      }}
    </FixedSizeGrid>
  );
}
```

### Best Practices
1. **测量先行**: 使用 React DevTools Profiler 识别瓶颈
2. **渐进优化**: 先实现基本功能，再根据实际性能问题优化
3. **避免过早优化**: 虚拟滚动只在>200素材时考虑
4. **监控指标**: 跟踪初始加载时间、筛选响应时间

## 9. Error Handling and User Feedback

### Decision
实施分层错误处理：存储层错误、网络错误、验证错误和UI错误状态。

### Rationale
1. **用户体验**: 清晰的错误消息帮助用户理解问题
2. **可恢复性**: 区分可重试和永久性错误
3. **调试**: 详细的错误日志帮助定位问题
4. **安全性**: 不向用户暴露敏感信息

### Error Categories and Handling

#### 1. Storage Errors
```typescript
async function handleStorageError(error: Error): Promise<void> {
  if (error.name === 'QuotaExceededError') {
    MessagePlugin.error({
      content: '存储空间已满。请删除一些旧素材或下载后删除以释放空间。',
      duration: 5000
    });
  } else if (error.name === 'NotFoundError') {
    MessagePlugin.warning({
      content: '素材未找到，可能已被删除。',
      duration: 3000
    });
  } else {
    console.error('Storage error:', error);
    MessagePlugin.error({
      content: '存储操作失败，请刷新页面重试。',
      duration: 3000
    });
  }
}
```

#### 2. Validation Errors
```typescript
function showValidationError(message: string) {
  MessagePlugin.warning({
    content: message,
    duration: 3000,
    theme: 'warning'
  });
}
```

#### 3. Global Error Boundary
```typescript
class MediaLibraryErrorBoundary extends React.Component<
  { children: ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('MediaLibrary error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-state">
          <h3>素材库加载失败</h3>
          <p>请刷新页面重试</p>
          <Button onClick={() => window.location.reload()}>
            刷新页面
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### Best Practices
1. **用户语言**: 使用非技术术语的错误消息
2. **可操作**: 提供具体的解决步骤
3. **日志记录**: 详细记录错误到控制台供开发调试
4. **优雅降级**: 错误时显示有用的回退UI

## Summary of Decisions

| 领域 | 决策 | 理由 |
|------|------|------|
| 存储 | localforage + IndexedDB | 简单API，已在项目中使用，Blob支持好 |
| 配额管理 | 主动监控（80%警告） | 改善用户体验，避免突然失败 |
| 状态管理 | React Context | 简单、局部、符合项目模式 |
| 组件架构 | 容器/展示分离 | 符合500行限制，可维护性高 |
| AI集成 | 在对话框中添加选择器 | 最小侵入，保留现有功能 |
| 自动保存 | 订阅任务队列事件 | 自动化，集成点清晰 |
| 文件验证 | MIME + Magic Number | 安全性和用户体验平衡 |
| 性能优化 | Memo + 懒加载 + 虚拟滚动 | 多层优化，渐进式应用 |
| 错误处理 | 分层处理 + Error Boundary | 用户友好，便于调试 |

## Next Steps

1. ✅ Research完成
2. → 进入 Phase 1: 设计数据模型和API契约
3. → 生成 quickstart.md 开发指南
4. → 更新 agent context
5. → 进入 Phase 2: 生成任务分解 (tasks.md)

---

**研究完成日期**: 2025-12-11
**准备进入**: Phase 1 - Design & Contracts
