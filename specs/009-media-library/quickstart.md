# Quick Start: 素材管理库 (Media Library) 开发指南

**Feature**: 009-media-library
**Date**: 2025-12-11

## 概览

本指南帮助开发者快速开始实现素材管理库功能。按照优先级顺序进行开发，确保每个阶段都有可工作的增量交付。

## 前置条件

- Node.js 18+ 和 npm
- 熟悉 TypeScript, React 18, 和 React Hooks
- 了解 IndexedDB 和 localforage
- 熟悉 TDesign React 组件库
- 了解项目宪章（`constitution.md`）和编码标准

## 开发环境设置

### 1. 克隆并安装依赖

```bash
cd /Users/gongchengtu/code/github/aitu
git checkout 009-media-library

# 安装依赖（如果尚未安装）
npm install
```

### 2. 验证开发服务器

```bash
npm start  # 启动开发服务器在 localhost:4200
```

### 3. 运行测试

```bash
npm test  # 运行所有测试
```

## 实现顺序（按优先级）

### Phase 1: 核心数据层 (P1)

**目标**: 实现存储服务和数据模型

#### 1.1 创建类型定义

**文件**: `packages/drawnix/src/types/asset.types.ts`

```typescript
// 参考 data-model.md 中的完整定义
export enum AssetType { IMAGE = 'IMAGE', VIDEO = 'VIDEO' }
export enum AssetSource { LOCAL = 'LOCAL', AI_GENERATED = 'AI_GENERATED' }
export interface Asset { /* ... */ }
export interface StoredAsset { /* ... */ }
// ... 其他类型
```

**验收标准**:
- TypeScript strict mode 编译通过
- 所有枚举和接口导出
- 文件 < 200 行

#### 1.2 实现存储服务

**文件**: `packages/drawnix/src/services/asset-storage-service.ts`

```typescript
import localforage from 'localforage';
import type { Asset, StoredAsset, AddAssetData } from '../types/asset.types';

class AssetStorageService {
  private store: LocalForage;

  async initialize() {
    this.store = localforage.createInstance({
      name: 'aitu-assets',
      storeName: 'assets'
    });
  }

  async addAsset(data: AddAssetData): Promise<Asset> {
    // 实现逻辑...
  }

  // 其他方法...
}

export const assetStorageService = new AssetStorageService();
```

**验收标准**:
- 所有接口方法实现（参考 `contracts/asset-storage-service.md`）
- 错误处理完善
- 单元测试覆盖率 > 80%
- 文件 < 250 行

#### 1.3 编写存储服务测试

**文件**: `tests/media-library/unit/asset-storage-service.spec.ts`

```typescript
describe('AssetStorageService', () => {
  beforeEach(async () => {
    await assetStorageService.initialize();
    await assetStorageService.clearAll();
  });

  // 参考 contracts/asset-storage-service.md 中的测试用例
});
```

### Phase 2: 状态管理 (P1)

**目标**: 实现React Context和自定义Hook

#### 2.1 创建AssetContext

**文件**: `packages/drawnix/src/contexts/AssetContext.tsx`

```typescript
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { assetStorageService } from '../services/asset-storage-service';
import type { Asset, AssetContextValue } from '../types/asset.types';

const AssetContext = createContext<AssetContextValue | null>(null);

export function AssetProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await assetStorageService.getAllAssets();
      setAssets(loaded);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const addAsset = useCallback(async (/* ... */) => {
    // 实现...
  }, []);

  // 其他操作...

  const value = useMemo(() => ({
    assets,
    loading,
    error,
    loadAssets,
    addAsset,
    // ... 其他方法
  }), [assets, loading, error, loadAssets, addAsset]);

  return <AssetContext.Provider value={value}>{children}</AssetContext.Provider>;
}

export function useAssets() {
  const context = useContext(AssetContext);
  if (!context) throw new Error('useAssets must be used within AssetProvider');
  return context;
}
```

**验收标准**:
- Context正确提供所有state和actions
- 使用useMemo和useCallback优化性能
- 文件 < 150 行

#### 2.2 在应用中集成Provider

**文件**: `packages/drawnix/src/drawnix.tsx` (修改)

```typescript
import { AssetProvider } from './contexts/AssetContext';

export function Drawnix() {
  return (
    <AssetProvider>
      {/* 现有内容 */}
    </AssetProvider>
  );
}
```

### Phase 3: UI 组件 - 基础结构 (P1)

**目标**: 实现核心UI组件

#### 3.1 MediaLibraryModal（容器）

**文件**: `packages/drawnix/src/components/media-library/MediaLibraryModal.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { Dialog } from 'tdesign-react';
import { useAssets } from '../../contexts/AssetContext';
import MediaLibrarySidebar from './MediaLibrarySidebar';
import MediaLibraryGrid from './MediaLibraryGrid';
import MediaLibraryInspector from './MediaLibraryInspector';
import './MediaLibraryModal.scss';

interface MediaLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (asset: Asset) => void;
  filterType?: AssetType;
}

export function MediaLibraryModal({
  isOpen,
  onClose,
  onSelect,
  filterType
}: MediaLibraryModalProps) {
  const { assets, loadAssets } = useAssets();
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadAssets();
    }
  }, [isOpen, loadAssets]);

  if (!isOpen) return null;

  return (
    <Dialog
      visible={isOpen}
      onClose={onClose}
      width="90vw"
      height="90vh"
      className="media-library-modal"
    >
      <div className="media-library-layout">
        <MediaLibrarySidebar />
        <MediaLibraryGrid
          filterType={filterType}
          selectedAssetId={selectedAssetId}
          onSelectAsset={setSelectedAssetId}
        />
        <MediaLibraryInspector
          assetId={selectedAssetId}
          onSelect={onSelect}
        />
      </div>
    </Dialog>
  );
}
```

**文件**: `packages/drawnix/src/components/media-library/MediaLibraryModal.scss`

```scss
.media-library-modal {
  .media-library-layout {
    display: flex;
    height: 90vh;
    background: var(--color-bg);

    // 使用BEM命名
    &__sidebar {
      width: 260px;
      border-right: 1px solid var(--color-border);
    }

    &__main {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    &__inspector {
      width: 320px;
      border-left: 1px solid var(--color-border);
    }

    // 响应式
    @media (max-width: 768px) {
      flex-direction: column;

      &__sidebar,
      &__inspector {
        width: 100%;
        border: none;
      }
    }
  }
}
```

**验收标准**:
- 使用TDesign Dialog组件
- 响应式布局（桌面/移动）
- 文件 < 150 行（tsx）, < 100 行（scss）

#### 3.2 MediaLibraryGrid（网格视图）

**文件**: `packages/drawnix/src/components/media-library/MediaLibraryGrid.tsx`

```typescript
import React, { useMemo } from 'react';
import { useAssets } from '../../contexts/AssetContext';
import { filterAssets } from '../../utils/asset-utils';
import AssetGridItem from './AssetGridItem';
import MediaLibraryEmpty from './MediaLibraryEmpty';

interface MediaLibraryGridProps {
  filterType?: AssetType;
  selectedAssetId: string | null;
  onSelectAsset: (id: string) => void;
}

export function MediaLibraryGrid({
  filterType,
  selectedAssetId,
  onSelectAsset
}: MediaLibraryGridProps) {
  const { assets, filters } = useAssets();

  // 应用筛选和排序
  const filteredResult = useMemo(() => {
    const merged = filterType
      ? { ...filters, activeType: filterType }
      : filters;
    return filterAssets(assets, merged);
  }, [assets, filters, filterType]);

  if (filteredResult.isEmpty) {
    return <MediaLibraryEmpty />;
  }

  return (
    <div className="media-library-grid">
      <div className="media-library-grid__container">
        {filteredResult.assets.map(asset => (
          <AssetGridItem
            key={asset.id}
            asset={asset}
            isSelected={selectedAssetId === asset.id}
            onSelect={onSelectAsset}
          />
        ))}
      </div>
    </div>
  );
}
```

**验收标准**:
- 使用useMemo优化筛选
- 正确显示空状态
- 网格布局响应式
- 文件 < 150 行

#### 3.3 AssetGridItem（网格项）

**文件**: `packages/drawnix/src/components/media-library/AssetGridItem.tsx`

```typescript
import React, { useCallback } from 'react';
import { ImageIcon, VideoIcon } from 'lucide-react';
import type { Asset } from '../../types/asset.types';

interface AssetGridItemProps {
  asset: Asset;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export const AssetGridItem = React.memo<AssetGridItemProps>(({
  asset,
  isSelected,
  onSelect
}) => {
  const handleClick = useCallback(() => {
    onSelect(asset.id);
  }, [asset.id, onSelect]);

  return (
    <div
      className={`asset-grid-item ${isSelected ? 'asset-grid-item--selected' : ''}`}
      onClick={handleClick}
    >
      {/* 缩略图 */}
      <div className="asset-grid-item__thumbnail">
        {asset.type === 'IMAGE' ? (
          <img src={asset.url} alt={asset.name} />
        ) : (
          <video src={asset.url} muted />
        )}
      </div>

      {/* 类型标识 */}
      <div className="asset-grid-item__badge">
        {asset.type === 'IMAGE' ? <ImageIcon /> : <VideoIcon />}
      </div>

      {/* AI标识 */}
      {asset.source === 'AI_GENERATED' && (
        <div className="asset-grid-item__ai-badge">AI</div>
      )}

      {/* 名称 */}
      <div className="asset-grid-item__name">{asset.name}</div>
    </div>
  );
}, (prev, next) => (
  prev.asset.id === next.asset.id && prev.isSelected === next.isSelected
));
```

**验收标准**:
- 使用React.memo优化
- 自定义比较函数
- BEM命名的样式
- 文件 < 120 行

### Phase 4: UI 组件 - 侧边栏和详情面板 (P1)

#### 4.1 MediaLibrarySidebar（筛选侧边栏）

**文件**: `packages/drawnix/src/components/media-library/MediaLibrarySidebar.tsx`

```typescript
import React from 'react';
import { Button } from 'tdesign-react';
import { Grid, ImageIcon, VideoIcon, Cpu, HardDrive } from 'lucide-react';
import { useAssets } from '../../contexts/AssetContext';
import MediaLibraryStorageBar from './MediaLibraryStorageBar';

export function MediaLibrarySidebar() {
  const { filters, setFilters, assets, storageStatus } = useAssets();

  return (
    <div className="media-library-sidebar">
      {/* 类型筛选 */}
      <section className="media-library-sidebar__section">
        <h3 className="media-library-sidebar__title">类型</h3>
        <Button
          variant={filters.activeType === 'ALL' ? 'base' : 'outline'}
          onClick={() => setFilters({ activeType: 'ALL' })}
          block
        >
          <Grid /> 全部素材
        </Button>
        <Button
          variant={filters.activeType === 'IMAGE' ? 'base' : 'outline'}
          onClick={() => setFilters({ activeType: 'IMAGE' })}
          block
        >
          <ImageIcon /> 图片
        </Button>
        <Button
          variant={filters.activeType === 'VIDEO' ? 'base' : 'outline'}
          onClick={() => setFilters({ activeType: 'VIDEO' })}
          block
        >
          <VideoIcon /> 视频
        </Button>
      </section>

      {/* 来源筛选 */}
      <section className="media-library-sidebar__section">
        <h3 className="media-library-sidebar__title">来源</h3>
        <Button
          variant={filters.activeSource === 'ALL' ? 'base' : 'outline'}
          onClick={() => setFilters({ activeSource: 'ALL' })}
          block
        >
          全部来源
        </Button>
        <Button
          variant={filters.activeSource === 'LOCAL' ? 'base' : 'outline'}
          onClick={() => setFilters({ activeSource: 'LOCAL' })}
          block
        >
          <HardDrive /> 本地上传
        </Button>
        <Button
          variant={filters.activeSource === 'AI' ? 'base' : 'outline'}
          onClick={() => setFilters({ activeSource: 'AI' })}
          block
        >
          <Cpu /> AI生成
        </Button>
      </section>

      {/* 存储状态 */}
      <MediaLibraryStorageBar
        assetCount={assets.length}
        storageStatus={storageStatus}
      />
    </div>
  );
}
```

**验收标准**:
- 使用TDesign Button组件（light主题）
- 图标来自lucide-react
- 文件 < 150 行

#### 4.2 MediaLibraryInspector（详情面板）

**文件**: `packages/drawnix/src/components/media-library/MediaLibraryInspector.tsx`

```typescript
import React, { useState } from 'react';
import { Button, Input, MessagePlugin } from 'tdesign-react';
import { Download, Trash2, Edit2, CheckCircle } from 'lucide-react';
import { useAssets } from '../../contexts/AssetContext';

interface MediaLibraryInspectorProps {
  assetId: string | null;
  onSelect?: (asset: Asset) => void;
}

export function MediaLibraryInspector({ assetId, onSelect }: MediaLibraryInspectorProps) {
  const { assets, renameAsset, removeAsset } = useAssets();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  const asset = assets.find(a => a.id === assetId);

  if (!asset) {
    return <div className="media-library-inspector--empty">选择素材查看详情</div>;
  }

  const handleRename = async () => {
    try {
      await renameAsset(asset.id, newName);
      setIsRenaming(false);
      MessagePlugin.success('重命名成功');
    } catch (error) {
      MessagePlugin.error('重命名失败');
    }
  };

  const handleDelete = async () => {
    // 显示确认对话框
    const confirmed = await showDeleteConfirmation();
    if (confirmed) {
      await removeAsset(asset.id);
      MessagePlugin.success('删除成功');
    }
  };

  return (
    <div className="media-library-inspector">
      {/* 预览 */}
      <div className="media-library-inspector__preview">
        {asset.type === 'IMAGE' ? (
          <img src={asset.url} alt={asset.name} />
        ) : (
          <video src={asset.url} controls />
        )}
      </div>

      {/* 名称编辑 */}
      <div className="media-library-inspector__name">
        {isRenaming ? (
          <Input
            value={newName}
            onChange={setNewName}
            onBlur={handleRename}
            autoFocus
          />
        ) : (
          <div>
            <span>{asset.name}</span>
            <Button
              size="small"
              variant="text"
              icon={<Edit2 />}
              onClick={() => {
                setNewName(asset.name);
                setIsRenaming(true);
              }}
            />
          </div>
        )}
      </div>

      {/* 元数据 */}
      <div className="media-library-inspector__metadata">
        <div>类型: {asset.type}</div>
        <div>来源: {asset.source}</div>
        <div>创建时间: {new Date(asset.createdAt).toLocaleString()}</div>
      </div>

      {/* 操作按钮 */}
      <div className="media-library-inspector__actions">
        {onSelect && (
          <Button
            theme="primary"
            block
            icon={<CheckCircle />}
            onClick={() => onSelect(asset)}
          >
            使用到画板
          </Button>
        )}
        <Button
          variant="outline"
          block
          icon={<Download />}
          onClick={() => downloadAsset(asset)}
        >
          下载
        </Button>
        <Button
          theme="danger"
          variant="outline"
          block
          icon={<Trash2 />}
          onClick={handleDelete}
        >
          删除
        </Button>
      </div>
    </div>
  );
}
```

**验收标准**:
- 使用TDesign组件
- 删除前显示确认对话框
- 文件 < 200 行

### Phase 5: 集成AI生成对话框 (P1)

**目标**: 在AI生成对话框中添加素材库选择功能

#### 5.1 修改AI生图对话框

**文件**: `packages/drawnix/src/components/ttd-dialog/ai-image-generation.tsx` (修改)

```typescript
import { MediaLibraryModal } from '../media-library/MediaLibraryModal';

function AIImageGeneration() {
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [referenceImage, setReferenceImage] = useState<Asset | null>(null);

  return (
    <div>
      {/* 现有代码 */}

      {/* 新增：参考图选择器 */}
      <div className="reference-image-selector">
        <Button onClick={() => setShowMediaLibrary(true)}>
          从素材库选择
        </Button>
        <Button onClick={() => /* 现有的本地选择逻辑 */}>
          从本地选择
        </Button>
      </div>

      {/* 素材库弹窗 */}
      <MediaLibraryModal
        isOpen={showMediaLibrary}
        onClose={() => setShowMediaLibrary(false)}
        onSelect={(asset) => {
          setReferenceImage(asset);
          setShowMediaLibrary(false);
        }}
        filterType="IMAGE"  // 只显示图片
      />
    </div>
  );
}
```

**验收标准**:
- 不破坏现有功能
- 素材库只显示图片
- 选择后正确应用参考图

#### 5.2 类似修改AI生视频对话框

**文件**: `packages/drawnix/src/components/ttd-dialog/ai-video-generation.tsx` (修改)

### Phase 6: 自动保存AI生成内容 (P1)

**目标**: AI生成完成后自动添加到素材库

#### 6.1 创建集成服务

**文件**: `packages/drawnix/src/services/asset-integration-service.ts`

```typescript
import { taskQueueService } from './task-queue-service';
import { assetStorageService } from './asset-storage-service';

export function initializeAssetIntegration() {
  // 订阅任务队列
  taskQueueService.tasks$.subscribe(async (tasks) => {
    for (const task of tasks) {
      if (task.status === 'completed' && task.resultUrl && !task.savedToLibrary) {
        try {
          // 下载结果
          const response = await fetch(task.resultUrl);
          const blob = await response.blob();

          // 确定类型
          const assetType = task.type === 'image-generation'
            ? AssetType.IMAGE
            : AssetType.VIDEO;

          // 生成名称
          const name = generateAssetName(task.prompt, assetType);

          // 保存到素材库
          await assetStorageService.addAsset({
            type: assetType,
            source: AssetSource.AI_GENERATED,
            name,
            blob,
            mimeType: blob.type,
            prompt: task.prompt,
            modelName: task.modelName
          });

          // 标记已保存
          taskQueueService.markAsSaved(task.id);
        } catch (error) {
          console.error('Failed to save AI generated asset:', error);
          // 不阻塞任务队列
        }
      }
    }
  });
}

function generateAssetName(prompt: string | undefined, type: AssetType): string {
  if (prompt && prompt.length > 0) {
    const truncated = prompt.substring(0, 20);
    return truncated.length < prompt.length ? `${truncated}...` : truncated;
  }
  const timestamp = new Date().toISOString();
  return `AI${type}-${timestamp}`;
}
```

#### 6.2 在应用启动时初始化

**文件**: `packages/drawnix/src/drawnix.tsx` (修改)

```typescript
import { initializeAssetIntegration } from './services/asset-integration-service';

useEffect(() => {
  // 初始化素材集成
  initializeAssetIntegration();
}, []);
```

**验收标准**:
- 生成成功后自动添加
- 失败不影响任务队列
- 避免重复添加

## 测试策略

### Unit Tests

```bash
# 运行单元测试
npm test -- asset-storage-service.spec.ts
npm test -- asset-utils.spec.ts
```

### Component Tests

```bash
# 运行组件测试
npm test -- MediaLibraryModal.spec.tsx
npm test -- AssetGridItem.spec.tsx
```

### E2E Tests

```bash
# 运行E2E测试
npx playwright test media-library
```

## 调试技巧

### 1. 查看IndexedDB数据

```javascript
// 在浏览器控制台
const store = localforage.createInstance({ name: 'aitu-assets' });
const keys = await store.keys();
console.log('Stored assets:', keys);

const asset = await store.getItem(keys[0]);
console.log('First asset:', asset);
```

### 2. React DevTools

使用React DevTools查看：
- AssetContext的state
- 组件重渲染情况
- Props传递链

### 3. Network Tab

监控AI生成任务的网络请求，确保结果正确下载。

## 常见问题

### Q: 如何清除所有素材？

```typescript
await assetStorageService.clearAll();
```

### Q: 如何处理存储空间不足？

```typescript
try {
  await assetStorageService.addAsset({...});
} catch (error) {
  if (error instanceof QuotaExceededError) {
    // 提示用户删除旧素材
    MessagePlugin.error('存储空间不足，请删除一些旧素材');
  }
}
```

### Q: 如何优化大量素材的加载？

- 使用虚拟滚动（react-window）
- 懒加载图片（IntersectionObserver）
- 分页加载（如果素材 > 500）

## 部署检查清单

- [ ] 所有单元测试通过
- [ ] 所有组件测试通过
- [ ] E2E测试通过
- [ ] TypeScript类型检查通过
- [ ] 所有文件 < 500行
- [ ] 使用TDesign组件（light主题）
- [ ] BEM命名规范
- [ ] 性能指标达标（2s加载，500ms筛选）
- [ ] 存储配额监控工作正常
- [ ] AI生成内容自动保存
- [ ] 删除确认对话框显示
- [ ] 响应式布局在移动端正常

## 下一步

完成实现后：
1. 运行 `/speckit.tasks` 生成详细任务分解
2. 创建pull request
3. 代码审查
4. 部署到预发布环境
5. 用户验收测试

---

**快速开始指南完成日期**: 2025-12-11
**准备进入**: Phase 2 - Task Generation (运行 `/speckit.tasks`)
