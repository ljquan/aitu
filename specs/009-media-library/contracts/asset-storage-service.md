# API Contract: Asset Storage Service

**Service**: `asset-storage-service.ts`
**Feature**: 009-media-library
**Date**: 2025-12-11

## Overview

定义素材存储服务的接口契约，该服务负责与IndexedDB交互，管理素材的持久化存储。

## Service Interface

```typescript
export interface AssetStorageService {
  /**
   * 初始化存储服务
   * 创建IndexedDB实例和必要的stores
   */
  initialize(): Promise<void>;

  /**
   * 添加新素材到存储
   * @param data - 素材数据
   * @returns 保存的素材对象
   * @throws QuotaExceededError - 存储空间不足
   * @throws ValidationError - 数据验证失败
   */
  addAsset(data: AddAssetData): Promise<Asset>;

  /**
   * 获取所有素材
   * @returns 所有素材的数组
   */
  getAllAssets(): Promise<Asset[]>;

  /**
   * 根据ID获取单个素材
   * @param id - 素材ID
   * @returns 素材对象，不存在则返回null
   */
  getAssetById(id: string): Promise<Asset | null>;

  /**
   * 更新素材名称
   * @param id - 素材ID
   * @param newName - 新名称
   * @throws NotFoundError - 素材不存在
   * @throws ValidationError - 名称验证失败
   */
  renameAsset(id: string, newName: string): Promise<void>;

  /**
   * 删除素材
   * @param id - 素材ID
   * @throws NotFoundError - 素材不存在
   */
  removeAsset(id: string): Promise<void>;

  /**
   * 清空所有素材
   * 慎用，不可恢复
   */
  clearAll(): Promise<void>;

  /**
   * 获取存储统计信息
   * @returns 存储使用情况
   */
  getStorageStats(): Promise<StorageStats>;

  /**
   * 检查存储配额
   * @returns 配额信息
   */
  checkQuota(): Promise<StorageQuota>;

  /**
   * 估算添加新素材后的存储使用量
   * @param blobSize - Blob大小（字节）
   * @returns 是否有足够空间
   */
  canAddAsset(blobSize: number): Promise<boolean>;
}
```

## Data Types

### AddAssetData

```typescript
export interface AddAssetData {
  type: AssetType;
  source: AssetSource;
  name: string;
  blob: Blob;
  mimeType: string;
  prompt?: string;
  modelName?: string;
}
```

### StorageStats

```typescript
export interface StorageStats {
  totalAssets: number;
  imageCount: number;
  videoCount: number;
  localCount: number;
  aiGeneratedCount: number;
  totalSize: number;  // 估算的总大小（字节）
}
```

### Error Types

```typescript
export class AssetStorageError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'AssetStorageError';
  }
}

export class QuotaExceededError extends AssetStorageError {
  constructor() {
    super('存储空间不足', 'QUOTA_EXCEEDED');
  }
}

export class NotFoundError extends AssetStorageError {
  constructor(id: string) {
    super(`素材未找到: ${id}`, 'NOT_FOUND');
  }
}

export class ValidationError extends AssetStorageError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
  }
}
```

## Usage Examples

### Initialize Service

```typescript
import { assetStorageService } from './services/asset-storage-service';

// 在应用启动时初始化
await assetStorageService.initialize();
```

### Add Asset

```typescript
// 用户上传文件
const file: File = event.target.files[0];

try {
  const asset = await assetStorageService.addAsset({
    type: AssetType.IMAGE,
    source: AssetSource.LOCAL,
    name: file.name,
    blob: file,
    mimeType: file.type
  });

  console.log('Asset added:', asset.id);
} catch (error) {
  if (error instanceof QuotaExceededError) {
    // 显示存储空间不足错误
  } else if (error instanceof ValidationError) {
    // 显示验证错误
  }
}
```

### Load All Assets

```typescript
try {
  const assets = await assetStorageService.getAllAssets();
  console.log(`Loaded ${assets.length} assets`);
} catch (error) {
  console.error('Failed to load assets:', error);
}
```

### Rename Asset

```typescript
try {
  await assetStorageService.renameAsset(assetId, '新名称');
  console.log('Asset renamed successfully');
} catch (error) {
  if (error instanceof NotFoundError) {
    // 素材不存在
  } else if (error instanceof ValidationError) {
    // 名称验证失败
  }
}
```

### Delete Asset

```typescript
try {
  await assetStorageService.removeAsset(assetId);
  console.log('Asset deleted');
} catch (error) {
  if (error instanceof NotFoundError) {
    // 素材已被删除或不存在
  }
}
```

### Check Storage Quota

```typescript
const quota = await assetStorageService.checkQuota();

console.log(`Storage usage: ${quota.percentUsed.toFixed(2)}%`);

if (quota.percentUsed > 80) {
  // 显示警告
  console.warn('Storage is nearly full!');
}
```

### Check Before Adding

```typescript
const fileSize = file.size;
const canAdd = await assetStorageService.canAddAsset(fileSize);

if (!canAdd) {
  alert('存储空间不足，请删除一些旧素材');
  return;
}

// 继续添加
await assetStorageService.addAsset({...});
```

## Implementation Notes

### 1. localforage Configuration

```typescript
import localforage from 'localforage';

const assetStore = localforage.createInstance({
  name: 'aitu-assets',
  storeName: 'assets',
  description: 'Media library assets storage'
});
```

### 2. Blob URL Management

- 创建时使用 `URL.createObjectURL(blob)`
- 组件卸载时调用 `URL.revokeObjectURL(url)` 释放内存
- 不直接存储 Blob URL 到 IndexedDB（存储 Blob 对象本身）

### 3. Error Handling Strategy

```typescript
async function wrapStorageOperation<T>(
  operation: () => Promise<T>,
  errorContext: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      throw new QuotaExceededError();
    }
    if (error.name === 'NotFoundError') {
      throw new NotFoundError(errorContext);
    }
    throw new AssetStorageError(
      `Storage operation failed: ${error.message}`,
      'UNKNOWN_ERROR'
    );
  }
}
```

### 4. Performance Considerations

- **批量加载**: 使用 `getAllAssets()` 一次加载所有元数据
- **懒加载Blob**: 网格项只在可见时加载图片
- **索引**: 考虑为 `type`, `source`, `createdAt` 添加索引（如使用原生IndexedDB）
- **缓存**: 在内存中缓存最近加载的assets，减少IndexedDB查询

## Testing Contract

### Unit Tests

```typescript
describe('AssetStorageService', () => {
  beforeEach(async () => {
    await assetStorageService.initialize();
    await assetStorageService.clearAll();
  });

  it('should add asset successfully', async () => {
    const blob = new Blob(['test'], { type: 'image/png' });
    const asset = await assetStorageService.addAsset({
      type: AssetType.IMAGE,
      source: AssetSource.LOCAL,
      name: 'test.png',
      blob,
      mimeType: 'image/png'
    });

    expect(asset.id).toBeDefined();
    expect(asset.type).toBe(AssetType.IMAGE);
  });

  it('should throw ValidationError for invalid name', async () => {
    const blob = new Blob(['test'], { type: 'image/png' });

    await expect(
      assetStorageService.addAsset({
        type: AssetType.IMAGE,
        source: AssetSource.LOCAL,
        name: '',  // Invalid
        blob,
        mimeType: 'image/png'
      })
    ).rejects.toThrow(ValidationError);
  });

  it('should get all assets', async () => {
    // Add multiple assets
    const blob = new Blob(['test'], { type: 'image/png' });
    await assetStorageService.addAsset({ /* ... */ });
    await assetStorageService.addAsset({ /* ... */ });

    const assets = await assetStorageService.getAllAssets();
    expect(assets).toHaveLength(2);
  });

  it('should rename asset', async () => {
    const blob = new Blob(['test'], { type: 'image/png' });
    const asset = await assetStorageService.addAsset({ /* ... */ });

    await assetStorageService.renameAsset(asset.id, 'new-name.png');

    const updated = await assetStorageService.getAssetById(asset.id);
    expect(updated?.name).toBe('new-name.png');
  });

  it('should delete asset', async () => {
    const blob = new Blob(['test'], { type: 'image/png' });
    const asset = await assetStorageService.addAsset({ /* ... */ });

    await assetStorageService.removeAsset(asset.id);

    const deleted = await assetStorageService.getAssetById(asset.id);
    expect(deleted).toBeNull();
  });

  it('should throw NotFoundError when deleting non-existent asset', async () => {
    await expect(
      assetStorageService.removeAsset('non-existent-id')
    ).rejects.toThrow(NotFoundError);
  });
});
```

## Security Considerations

1. **Input Validation**: 所有用户输入（name, mimeType）必须验证
2. **MIME Type Verification**: 验证文件实际内容与声明的MIME类型匹配
3. **Size Limits**: 虽然没有硬性限制，但应警告大文件
4. **Error Messages**: 不暴露内部实现细节给用户

## Migration Strategy

如果将来需要更改存储格式：

```typescript
export interface StorageVersion {
  version: number;
  migrateFrom(oldVersion: number): Promise<void>;
}

// 例如：从v1迁移到v2
async function migrateV1ToV2(): Promise<void> {
  const allAssets = await assetStore.keys();
  for (const key of allAssets) {
    const old = await assetStore.getItem(key);
    const migrated = transformV1ToV2(old);
    await assetStore.setItem(key, migrated);
  }
}
```

---

**契约完成日期**: 2025-12-11
**实现文件**: `packages/drawnix/src/services/asset-storage-service.ts`
**下一步**: 生成 quickstart.md 开发指南
