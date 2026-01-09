/**
 * Asset Storage Service
 * 素材存储服务
 *
 * 使用 localforage (IndexedDB wrapper) 进行素材元数据持久化存储
 * 媒体数据由统一缓存服务 (unified-cache-service) 管理
 * Based on contracts/asset-storage-service.md
 */

import localforage from 'localforage';
import { ASSET_CONSTANTS } from '../constants/ASSET_CONSTANTS';
import {
  validateAssetName,
  validateMimeType,
} from '../utils/asset-utils';
import { canAddAssetBySize } from '../utils/storage-quota';
import { unifiedCacheService } from './unified-cache-service';
import type {
  Asset,
  StoredAsset,
  LegacyStoredAsset,
  AddAssetData,
  StorageStats,
  StorageQuota,
} from '../types/asset.types';
import {
  AssetType,
  AssetSource,
  assetToStoredAsset,
  storedAssetToAsset,
} from '../types/asset.types';

/** 素材库 URL 前缀（用于本地上传的素材） */
const ASSET_URL_PREFIX = '/asset-library/';

/**
 * Custom Error Classes
 * 自定义错误类
 */

export class AssetStorageError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
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

/**
 * Asset Storage Service Class
 * 素材存储服务类
 */
class AssetStorageService {
  private store: LocalForage | null = null;
  private migrationDone: boolean = false;

  /**
   * 计算 Blob 内容的哈希值
   * 使用 SHA-256 算法生成唯一标识
   */
  private async computeContentHash(blob: Blob): Promise<string> {
    const arrayBuffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * 检查是否存在相同内容的素材
   * 返回已存在的素材，如果不存在则返回 null
   * 对于没有 contentHash 的旧素材，通过文件大小筛选后重新计算哈希
   */
  private async findAssetByContentHash(
    contentHash: string,
    blob: Blob
  ): Promise<Asset | null> {
    if (!this.store) return null;

    try {
      const keys = await this.store.keys();
      for (const key of keys) {
        const stored = await this.store.getItem(key) as StoredAsset | null;
        if (!stored) continue;

        // 如果已有 contentHash，直接比较
        if (stored.contentHash) {
          if (stored.contentHash === contentHash) {
            console.log('[AssetStorageService] Found duplicate asset by hash:', stored.id);
            return storedAssetToAsset(stored);
          }
          continue;
        }

        // 对于没有 contentHash 的旧素材，先用文件大小筛选
        if (stored.size !== blob.size) {
          continue;
        }

        // 文件大小相同，从缓存中获取内容计算哈希
        console.log('[AssetStorageService] Size match, computing hash for old asset:', stored.id);
        try {
          const cachedBlob = await unifiedCacheService.getCachedBlob(stored.url);
          if (cachedBlob) {
            const oldHash = await this.computeContentHash(cachedBlob);
            
            // 更新旧素材的 contentHash
            stored.contentHash = oldHash;
            await this.store.setItem(key, stored);
            console.log('[AssetStorageService] Updated contentHash for old asset:', stored.id);

            if (oldHash === contentHash) {
              console.log('[AssetStorageService] Found duplicate asset by computed hash:', stored.id);
              return storedAssetToAsset(stored);
            }
          }
        } catch (err) {
          console.warn('[AssetStorageService] Failed to compute hash for old asset:', stored.id, err);
        }
      }
    } catch (error) {
      console.warn('[AssetStorageService] Error checking for duplicates:', error);
    }
    return null;
  }

  /**
   * 生成素材的缓存 URL（用于本地上传的素材）
   * 使用稳定的 URL 格式，便于统一缓存服务管理
   */
  private generateAssetUrl(assetId: string, mimeType: string): string {
    const extension = mimeType.split('/')[1] || 'bin';
    return `${ASSET_URL_PREFIX}${assetId}.${extension}`;
  }

  /**
   * 检查是否是旧版存储格式（包含 blobData）
   */
  private isLegacyFormat(item: any): item is LegacyStoredAsset {
    return item && 'blobData' in item && item.blobData instanceof Blob;
  }

  /**
   * Initialize Storage Service
   * 初始化存储服务
   */
  async initialize(): Promise<void> {
    this.store = localforage.createInstance({
      name: ASSET_CONSTANTS.STORAGE_NAME,
      storeName: ASSET_CONSTANTS.STORE_NAME,
      description: 'Media library assets storage',
    });

    // 执行数据迁移
    await this.migrateOldData();
  }

  /**
   * 迁移旧版数据
   * 1. 删除 AI 生成的素材（现在从任务队列读取）
   * 2. 将本地上传的旧版 Blob 数据迁移到统一缓存
   */
  private async migrateOldData(): Promise<void> {
    if (this.migrationDone || !this.store) return;

    const migrationKey = 'drawnix_asset_migration_v3'; // 更新版本号
    const migrated = localStorage.getItem(migrationKey);
    if (migrated === 'done') {
      this.migrationDone = true;
      return;
    }

    console.log('[AssetStorageService] Starting data migration v3...');

    try {
      const keys = await this.store.keys();
      let migratedCount = 0;
      let deletedAiCount = 0;

      for (const key of keys) {
        try {
          const item = await this.store.getItem(key) as any;
          if (!item) continue;

          // 删除 AI 生成的素材（现在从任务队列读取）
          if (item.source === 'AI_GENERATED') {
            await this.store.removeItem(key);
            deletedAiCount++;
            console.log(`[AssetStorageService] Deleted AI asset ${item.id}`);
            continue;
          }

          // 迁移本地上传的旧版数据
          if (this.isLegacyFormat(item)) {
            // 生成新的 URL
            const assetUrl = this.generateAssetUrl(item.id, item.mimeType);

            // 将 Blob 数据迁移到统一缓存
            const cacheType = item.type === 'IMAGE' ? 'image' : 'video';
            await unifiedCacheService.cacheMediaFromBlob(assetUrl, item.blobData, cacheType, {
              taskId: item.id,
            });

            // 更新为新格式（不含 blobData）
            const newStoredAsset: StoredAsset = {
              id: item.id,
              type: item.type,
              source: item.source,
              url: assetUrl,
              name: item.name,
              mimeType: item.mimeType,
              createdAt: item.createdAt,
              size: item.size,
            };

            await this.store.setItem(key, newStoredAsset);
            migratedCount++;
            console.log(`[AssetStorageService] Migrated local asset ${item.id}`);
          }
        } catch (error) {
          console.error(`[AssetStorageService] Failed to process asset ${key}:`, error);
        }
      }

      localStorage.setItem(migrationKey, 'done');
      this.migrationDone = true;
      console.log(`[AssetStorageService] Migration v3 completed: migrated ${migratedCount} local assets, deleted ${deletedAiCount} AI assets`);
    } catch (error) {
      console.error('[AssetStorageService] Migration failed:', error);
    }
  }

  /**
   * Ensure Store is Initialized
   * 确保存储已初始化
   */
  private ensureInitialized(): void {
    if (!this.store) {
      throw new AssetStorageError(
        'Storage service not initialized. Call initialize() first.',
        'NOT_INITIALIZED',
      );
    }
  }

  /**
   * Add Asset
   * 添加新素材到存储
   */
  async addAsset(data: AddAssetData): Promise<Asset> {
    console.log('[AssetStorageService] addAsset called with:', {
      type: data.type,
      source: data.source,
      name: data.name,
      mimeType: data.mimeType,
      blobSize: data.blob.size,
    });

    this.ensureInitialized();

    // 计算内容哈希用于去重
    console.log('[AssetStorageService] Computing content hash...');
    const contentHash = await this.computeContentHash(data.blob);
    console.log('[AssetStorageService] Content hash:', contentHash.substring(0, 16) + '...');

    // 检查是否已存在相同内容的素材
    const existingAsset = await this.findAssetByContentHash(contentHash, data.blob);
    if (existingAsset) {
      console.log('[AssetStorageService] Duplicate asset found, skipping:', existingAsset.id);
      return existingAsset;
    }

    // 验证名称
    const nameValidation = validateAssetName(data.name);
    if (!nameValidation.valid) {
      console.error('[AssetStorageService] Name validation failed:', nameValidation.error);
      throw new ValidationError(nameValidation.error!);
    }

    // 验证MIME类型
    const mimeValidation = validateMimeType(data.mimeType);
    if (!mimeValidation.valid) {
      console.error('[AssetStorageService] MIME type validation failed:', mimeValidation.error);
      throw new ValidationError(mimeValidation.error!);
    }

    // 检查存储空间
    console.log('[AssetStorageService] Checking storage quota...');
    const canAdd = await canAddAssetBySize(data.blob.size);
    if (!canAdd) {
      console.error('[AssetStorageService] Quota exceeded');
      throw new QuotaExceededError();
    }
    console.log('[AssetStorageService] Storage quota check passed');

    try {
      // 生成稳定的素材 URL
      const assetId = crypto.randomUUID();
      const assetUrl = this.generateAssetUrl(assetId, data.mimeType);
      console.log('[AssetStorageService] Generated asset URL:', assetUrl);

      // 使用统一缓存服务缓存媒体
      const cacheType = data.type === 'IMAGE' ? 'image' : 'video';
      await unifiedCacheService.cacheMediaFromBlob(assetUrl, data.blob, cacheType, {
        taskId: assetId,
        prompt: data.prompt,
        model: data.modelName,
      });
      console.log('[AssetStorageService] Media cached via unified cache service');

      const asset: Asset = {
        id: assetId,
        type: data.type,
        source: data.source,
        url: assetUrl,
        name: data.name,
        mimeType: data.mimeType,
        createdAt: Date.now(),
        size: data.blob.size,
        prompt: data.prompt,
        modelName: data.modelName,
      };
      console.log('[AssetStorageService] Asset object created:', asset);

      // 转换为StoredAsset并保存（只存元数据，不存 Blob）
      console.log('[AssetStorageService] Saving asset metadata to IndexedDB...');
      const storedAsset = assetToStoredAsset(asset);
      // 添加内容哈希到存储对象
      storedAsset.contentHash = contentHash;
      await this.store!.setItem(asset.id, storedAsset);
      console.log('[AssetStorageService] Asset saved to IndexedDB');

      console.log('[AssetStorageService] addAsset completed successfully');
      return asset;
    } catch (error: any) {
      console.error('[AssetStorageService] Error during addAsset:', error);
      if (error.name === 'QuotaExceededError') {
        throw new QuotaExceededError();
      }
      throw new AssetStorageError(
        `Failed to add asset: ${error.message}`,
        'ADD_FAILED',
      );
    }
  }

  /**
   * Get All Assets
   * 获取所有素材 - 使用并行加载优化性能
   */
  async getAllAssets(): Promise<Asset[]> {
    console.log('[AssetStorageService] getAllAssets called');
    this.ensureInitialized();

    try {
      const keys = await this.store!.keys();
      console.log(`[AssetStorageService] Found ${keys.length} keys in IndexedDB`);

      if (keys.length === 0) {
        return [];
      }

      // 并行加载所有素材
      const loadPromises = keys.map(async (key) => {
        try {
          const stored = (await this.store!.getItem(key)) as StoredAsset | null;
          if (!stored) return null;

          // 直接使用存储的 URL
          return storedAssetToAsset(stored);
        } catch (err) {
          console.error(`[AssetStorageService] Failed to load asset ${key}:`, err);
          return null;
        }
      });

      const results = await Promise.all(loadPromises);
      const assets = results.filter((asset): asset is Asset => asset !== null);

      console.log(`[AssetStorageService] Loaded ${assets.length} assets`);
      return assets;
    } catch (error: any) {
      console.error('[AssetStorageService] Error loading assets:', error);
      throw new AssetStorageError(
        `Failed to load assets: ${error.message}`,
        'LOAD_FAILED',
      );
    }
  }

  /**
   * Get Asset By ID
   * 根据ID获取单个素材
   */
  async getAssetById(id: string): Promise<Asset | null> {
    this.ensureInitialized();

    try {
      const stored = (await this.store!.getItem(id)) as StoredAsset | null;
      if (!stored) {
        return null;
      }

      // 直接使用存储的 URL
      return storedAssetToAsset(stored);
    } catch (error: any) {
      throw new AssetStorageError(
        `Failed to get asset: ${error.message}`,
        'GET_FAILED',
      );
    }
  }

  /**
   * Rename Asset
   * 重命名素材
   */
  async renameAsset(id: string, newName: string): Promise<void> {
    this.ensureInitialized();

    // 验证新名称
    const nameValidation = validateAssetName(newName);
    if (!nameValidation.valid) {
      throw new ValidationError(nameValidation.error!);
    }

    try {
      const stored = (await this.store!.getItem(id)) as StoredAsset | null;
      if (!stored) {
        throw new NotFoundError(id);
      }

      stored.name = newName;
      await this.store!.setItem(id, stored);
    } catch (error: any) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new AssetStorageError(
        `Failed to rename asset: ${error.message}`,
        'RENAME_FAILED',
      );
    }
  }

  /**
   * Remove Asset
   * 删除素材
   */
  async removeAsset(id: string): Promise<void> {
    this.ensureInitialized();

    try {
      const stored = (await this.store!.getItem(id)) as StoredAsset | null;
      if (!stored) {
        throw new NotFoundError(id);
      }

      // 从统一缓存中删除（使用存储的 URL）
      await unifiedCacheService.deleteCache(stored.url);

      await this.store!.removeItem(id);
    } catch (error: any) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new AssetStorageError(
        `Failed to remove asset: ${error.message}`,
        'REMOVE_FAILED',
      );
    }
  }

  /**
   * Clear All Assets
   * 清空所有素材
   */
  async clearAll(): Promise<void> {
    this.ensureInitialized();

    try {
      // 获取所有素材的 URL 并从统一缓存中删除
      const keys = await this.store!.keys();
      const deletePromises = keys.map(async (key) => {
        const stored = (await this.store!.getItem(key)) as StoredAsset | null;
        if (stored) {
          await unifiedCacheService.deleteCache(stored.url);
        }
      });
      await Promise.all(deletePromises);

      await this.store!.clear();
    } catch (error: any) {
      throw new AssetStorageError(
        `Failed to clear assets: ${error.message}`,
        'CLEAR_FAILED',
      );
    }
  }

  /**
   * Check Quota
   * 检查存储配额
   */
  async checkQuota(): Promise<StorageQuota> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;

      return {
        usage,
        quota,
        percentUsed: quota > 0 ? (usage / quota) * 100 : 0,
        available: quota - usage,
      };
    }

    return {
      usage: 0,
      quota: 0,
      percentUsed: 0,
      available: 0,
    };
  }

  /**
   * Can Add Asset
   * 估算添加新素材后的存储使用量
   */
  async canAddAsset(blobSize: number): Promise<boolean> {
    return await canAddAssetBySize(blobSize);
  }

  /**
   * Get Storage Stats
   * 获取存储统计信息
   */
  async getStorageStats(): Promise<StorageStats> {
    this.ensureInitialized();

    try {
      const keys = await this.store!.keys();
      let imageCount = 0;
      let videoCount = 0;
      let localCount = 0;
      let aiGeneratedCount = 0;
      let totalSize = 0;

      for (const key of keys) {
        const stored = (await this.store!.getItem(key)) as StoredAsset | null;
        if (stored) {
          // 统计类型
          if (stored.type === 'IMAGE') imageCount++;
          if (stored.type === 'VIDEO') videoCount++;

          // 统计来源
          if (stored.source === 'LOCAL') localCount++;
          if (stored.source === 'AI_GENERATED') aiGeneratedCount++;

          // 统计大小
          if (stored.size) totalSize += stored.size;
        }
      }

      return {
        totalAssets: keys.length,
        imageCount,
        videoCount,
        localCount,
        aiGeneratedCount,
        totalSize,
      };
    } catch (error: any) {
      throw new AssetStorageError(
        `Failed to get storage stats: ${error.message}`,
        'STATS_FAILED',
      );
    }
  }

  /**
   * Cleanup
   * 清理资源（不再需要释放 blob URL，由统一缓存服务管理）
   */
  cleanup(): void {
    // 统一缓存服务管理所有媒体 URL，无需手动清理
  }

  /**
   * 将 Base64 DataURL 存入素材库并返回虚拟 URL
   * 便捷方法，用于将 base64 图片转换为素材库虚拟 URL
   *
   * @param base64DataUrl - Base64 DataURL（如 data:image/png;base64,xxx）
   * @param filename - 可选的文件名
   * @returns 虚拟 URL（如 /asset-library/uuid.png）和素材 ID
   */
  async storeBase64AsAsset(
    base64DataUrl: string,
    filename?: string
  ): Promise<{ virtualUrl: string; assetId: string }> {
    // 解析 base64 DataURL
    const match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new ValidationError('Invalid base64 DataURL format');
    }

    const mimeType = match[1];
    const base64Data = match[2];

    // 将 base64 转换为 Blob
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });

    // 确定素材类型
    const assetType = mimeType.startsWith('video/') ? AssetType.VIDEO : AssetType.IMAGE;

    // 生成默认文件名
    const extension = mimeType.split('/')[1] || 'bin';
    const defaultFilename = filename || `asset_${Date.now()}.${extension}`;

    // 调用 addAsset 方法存储
    const asset = await this.addAsset({
      type: assetType,
      source: AssetSource.LOCAL,
      name: defaultFilename,
      blob,
      mimeType,
    });

    return {
      virtualUrl: asset.url,
      assetId: asset.id,
    };
  }
}

// 导出单例实例
export const assetStorageService = new AssetStorageService();
