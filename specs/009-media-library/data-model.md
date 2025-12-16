# Data Model: 素材管理库 (Media Library)

**Feature**: 009-media-library
**Date**: 2025-12-11
**Status**: Design Complete

## Overview

本文档定义素材管理库的核心数据模型、类型定义、状态结构和验证规则。

## Core Entities

### 1. Asset (素材)

代表用户的媒体资源（图片或视频）。

#### TypeScript Definition

```typescript
export enum AssetType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO'
}

export enum AssetSource {
  LOCAL = 'LOCAL',              // 本地上传
  AI_GENERATED = 'AI_GENERATED'  // AI生成
}

export interface Asset {
  // 标识
  id: string;                    // UUID v4

  // 分类
  type: AssetType;               // 素材类型
  source: AssetSource;           // 素材来源

  // 内容
  url: string;                   // Blob URL for display
  name: string;                  // 用户可见名称
  mimeType: string;              // MIME类型 (image/jpeg, video/mp4, etc.)

  // 元数据
  createdAt: number;             // Unix timestamp (ms)
  size?: number;                 // 文件大小（字节），可选

  // 可选扩展
  thumbnail?: string;            // 缩略图URL（视频用）
  prompt?: string;               // AI生成的提示词（仅AI_GENERATED）
  modelName?: string;            // 生成模型名称（仅AI_GENERATED）
}
```

#### Validation Rules

```typescript
export interface AssetValidationRules {
  id: {
    required: true;
    format: 'uuid-v4';
  };
  type: {
    required: true;
    enum: [AssetType.IMAGE, AssetType.VIDEO];
  };
  source: {
    required: true;
    enum: [AssetSource.LOCAL, AssetSource.AI_GENERATED];
  };
  url: {
    required: true;
    format: 'blob-url'; // blob:http://...
  };
  name: {
    required: true;
    minLength: 1;
    maxLength: 255;
  };
  mimeType: {
    required: true;
    allowedValues: [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',  // Images
      'video/mp4', 'video/webm', 'video/ogg'                  // Videos
    ];
  };
  createdAt: {
    required: true;
    type: 'number';
    min: 0;
  };
}
```

#### Factory Functions

```typescript
export function createAsset(params: {
  type: AssetType;
  source: AssetSource;
  url: string;
  name: string;
  mimeType: string;
  size?: number;
  prompt?: string;
  modelName?: string;
}): Asset {
  return {
    id: crypto.randomUUID(),
    type: params.type,
    source: params.source,
    url: params.url,
    name: params.name,
    mimeType: params.mimeType,
    createdAt: Date.now(),
    ...(params.size && { size: params.size }),
    ...(params.prompt && { prompt: params.prompt }),
    ...(params.modelName && { modelName: params.modelName })
  };
}
```

### 2. StoredAsset (存储的素材)

存储在IndexedDB中的素材数据结构。

#### TypeScript Definition

```typescript
export interface StoredAsset {
  // 基础Asset字段（除了url）
  id: string;
  type: AssetType;
  source: AssetSource;
  name: string;
  mimeType: string;
  createdAt: number;
  size?: number;
  prompt?: string;
  modelName?: string;

  // 存储字段
  blobData: Blob;                // 实际文件数据
}

// 转换函数
export function storedAssetToAsset(stored: StoredAsset): Asset {
  const url = URL.createObjectURL(stored.blobData);
  const { blobData, ...assetData } = stored;
  return {
    ...assetData,
    url
  };
}

export function assetToStoredAsset(asset: Asset, blob: Blob): StoredAsset {
  const { url, ...assetData } = asset;
  return {
    ...assetData,
    blobData: blob
  };
}
```

### 3. FilterState (筛选状态)

控制素材库的显示筛选条件。

#### TypeScript Definition

```typescript
export type AssetTypeFilter = 'ALL' | AssetType;
export type AssetSourceFilter = 'ALL' | 'LOCAL' | 'AI';
export type SortOption = 'DATE_DESC' | 'DATE_ASC' | 'NAME_ASC';

export interface FilterState {
  activeType: AssetTypeFilter;       // 类型筛选
  activeSource: AssetSourceFilter;   // 来源筛选
  searchQuery: string;               // 搜索关键词
  sortBy: SortOption;                // 排序方式
}

export const DEFAULT_FILTER_STATE: FilterState = {
  activeType: 'ALL',
  activeSource: 'ALL',
  searchQuery: '',
  sortBy: 'DATE_DESC'
};
```

### 4. SelectionMode (选择模式)

素材库的使用场景。

#### TypeScript Definition

```typescript
export enum SelectionMode {
  BROWSE = 'BROWSE',    // 浏览模式：查看和管理
  SELECT = 'SELECT'     // 选择模式：从AI生成界面选择
}

export interface MediaLibraryConfig {
  mode: SelectionMode;
  filterType?: AssetType;         // 限制显示的类型（SELECT模式）
  onSelect?: (asset: Asset) => void;  // 选择回调（SELECT模式）
}
```

### 5. StorageQuota (存储配额)

浏览器存储空间信息。

#### TypeScript Definition

```typescript
export interface StorageQuota {
  usage: number;          // 已使用空间（字节）
  quota: number;          // 总配额（字节）
  percentUsed: number;    // 使用百分比 (0-100)
  available: number;      // 可用空间（字节）
}

export interface StorageStatus {
  quota: StorageQuota;
  isNearLimit: boolean;    // 是否接近限制 (>80%)
  isCritical: boolean;     // 是否严重 (>95%)
}
```

## State Management

### AssetContext State

```typescript
export interface AssetContextState {
  // 核心数据
  assets: Asset[];

  // UI状态
  loading: boolean;
  error: string | null;

  // 筛选和排序
  filters: FilterState;

  // 选择
  selectedAssetId: string | null;

  // 存储状态
  storageStatus: StorageStatus | null;
}

export interface AssetContextActions {
  // 素材操作
  loadAssets: () => Promise<void>;
  addAsset: (file: File | Blob, type: AssetType, source: AssetSource, name?: string) => Promise<Asset>;
  removeAsset: (id: string) => Promise<void>;
  renameAsset: (id: string, newName: string) => Promise<void>;

  // 筛选和选择
  setFilters: (filters: Partial<FilterState>) => void;
  setSelectedAssetId: (id: string | null) => void;

  // 存储管理
  checkStorageQuota: () => Promise<void>;
}

export type AssetContextValue = AssetContextState & AssetContextActions;
```

## Derived Data

### Filtered Assets

```typescript
export interface FilteredAssetsResult {
  assets: Asset[];
  count: number;
  isEmpty: boolean;
}

export function filterAssets(
  assets: Asset[],
  filters: FilterState
): FilteredAssetsResult {
  const filtered = assets
    .filter(asset => {
      // Type filter
      const matchesType = filters.activeType === 'ALL' || asset.type === filters.activeType;

      // Source filter
      const matchesSource =
        filters.activeSource === 'ALL' ||
        (filters.activeSource === 'AI' && asset.source === AssetSource.AI_GENERATED) ||
        (filters.activeSource === 'LOCAL' && asset.source === AssetSource.LOCAL);

      // Search filter
      const matchesSearch =
        filters.searchQuery === '' ||
        asset.name.toLowerCase().includes(filters.searchQuery.toLowerCase());

      return matchesType && matchesSource && matchesSearch;
    })
    .sort((a, b) => {
      switch (filters.sortBy) {
        case 'DATE_DESC':
          return b.createdAt - a.createdAt;
        case 'DATE_ASC':
          return a.createdAt - b.createdAt;
        case 'NAME_ASC':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

  return {
    assets: filtered,
    count: filtered.length,
    isEmpty: filtered.length === 0
  };
}
```

## Component Props Types

### MediaLibraryModal Props

```typescript
export interface MediaLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: SelectionMode;
  filterType?: AssetType;
  onSelect?: (asset: Asset) => void;
}
```

### AssetGridItem Props

```typescript
export interface AssetGridItemProps {
  asset: Asset;
  isSelected: boolean;
  onSelect: (assetId: string) => void;
  onDoubleClick: (asset: Asset) => void;
}
```

### MediaLibrarySidebar Props

```typescript
export interface MediaLibrarySidebarProps {
  filters: FilterState;
  assetCount: number;
  storageStatus: StorageStatus | null;
  onFilterChange: (filters: Partial<FilterState>) => void;
}
```

### MediaLibraryInspector Props

```typescript
export interface MediaLibraryInspectorProps {
  asset: Asset | null;
  onRename: (assetId: string, newName: string) => void;
  onDelete: (assetId: string) => void;
  onDownload: (asset: Asset) => void;
  onSelect?: (asset: Asset) => void;
  showSelectButton: boolean;
}
```

## Validation Functions

### Asset Validation

```typescript
export function validateAssetName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: '素材名称不能为空' };
  }
  if (name.length > 255) {
    return { valid: false, error: '素材名称不能超过255个字符' };
  }
  return { valid: true };
}

export function validateMimeType(mimeType: string): { valid: boolean; error?: string } {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/ogg'
  ];

  if (!allowedTypes.includes(mimeType)) {
    return {
      valid: false,
      error: `不支持的文件类型: ${mimeType}`
    };
  }
  return { valid: true };
}

export function getAssetType(mimeType: string): AssetType | null {
  if (mimeType.startsWith('image/')) return AssetType.IMAGE;
  if (mimeType.startsWith('video/')) return AssetType.VIDEO;
  return null;
}
```

## Constants

```typescript
export const ASSET_CONSTANTS = {
  // 存储
  STORAGE_NAME: 'aitu-assets',
  STORE_NAME: 'assets',

  // 限制
  MAX_NAME_LENGTH: 255,
  STORAGE_WARNING_THRESHOLD: 0.80,  // 80%
  STORAGE_CRITICAL_THRESHOLD: 0.95, // 95%

  // 文件类型
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/webm', 'video/ogg'],

  // UI
  GRID_COLUMNS_DESKTOP: 5,
  GRID_COLUMNS_TABLET: 3,
  GRID_COLUMNS_MOBILE: 2,

  // 默认名称格式
  DEFAULT_IMAGE_NAME_FORMAT: 'AI图片-{timestamp}',
  DEFAULT_VIDEO_NAME_FORMAT: 'AI视频-{timestamp}',
  PROMPT_NAME_MAX_LENGTH: 20
} as const;
```

## Data Flow

### Adding an Asset

```
User uploads file / AI generates content
    ↓
Validate file (type, size, magic number)
    ↓
Create Asset object with Blob URL
    ↓
Convert to StoredAsset (with Blob data)
    ↓
Save to IndexedDB via localforage
    ↓
Update AssetContext state
    ↓
Check storage quota
    ↓
UI re-renders with new asset
```

### Selecting an Asset

```
User clicks asset in SELECT mode
    ↓
Set selectedAssetId in context
    ↓
User confirms selection (double-click / button)
    ↓
Call onSelect callback with Asset
    ↓
Parent component (AI dialog) receives asset
    ↓
Close modal, update reference image
```

### Loading Assets

```
Component mounts / Manual refresh
    ↓
Set loading = true
    ↓
Load all StoredAssets from IndexedDB
    ↓
Convert to Asset objects (create Blob URLs)
    ↓
Update context state with assets
    ↓
Set loading = false
    ↓
Apply current filters
    ↓
Render filtered assets
```

## Summary

此数据模型定义了：
- **4个核心实体**: Asset, StoredAsset, FilterState, SelectionMode
- **完整的类型系统**: TypeScript接口和枚举
- **验证规则**: 确保数据完整性
- **状态管理结构**: Context state和actions
- **派生数据**: 筛选和排序逻辑
- **组件Props**: 所有主要组件的类型
- **常量**: 配置和限制值

所有类型都符合TypeScript strict mode要求，并为实现阶段提供清晰的契约。

---

**设计完成日期**: 2025-12-11
**下一步**: 生成API契约文档
