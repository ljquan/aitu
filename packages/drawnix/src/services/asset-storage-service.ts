/**
 * Asset Storage Service
 * 素材存储服务
 *
 * 使用 localforage (IndexedDB wrapper) 进行素材持久化存储
 * Based on contracts/asset-storage-service.md
 */

import localforage from 'localforage';
import { ASSET_CONSTANTS } from '../constants/ASSET_CONSTANTS';
import {
  validateAssetName,
  validateMimeType,
  getAssetType,
} from '../utils/asset-utils';
import { canAddAssetBySize } from '../utils/storage-quota';
import type {
  Asset,
  StoredAsset,
  AddAssetData,
  StorageStats,
  StorageQuota,
  AssetType,
  AssetSource,
} from '../types/asset.types';
import {
  createAsset,
  storedAssetToAsset,
  assetToStoredAsset,
} from '../types/asset.types';

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
  private blobUrlCache: Map<string, string> = new Map();

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
    this.ensureInitialized();

    // 验证名称
    const nameValidation = validateAssetName(data.name);
    if (!nameValidation.valid) {
      throw new ValidationError(nameValidation.error!);
    }

    // 验证MIME类型
    const mimeValidation = validateMimeType(data.mimeType);
    if (!mimeValidation.valid) {
      throw new ValidationError(mimeValidation.error!);
    }

    // 检查存储空间
    const canAdd = await canAddAssetBySize(data.blob.size);
    if (!canAdd) {
      throw new QuotaExceededError();
    }

    try {
      // 创建Asset对象
      const blobUrl = URL.createObjectURL(data.blob);
      const asset = createAsset({
        type: data.type,
        source: data.source,
        url: blobUrl,
        name: data.name,
        mimeType: data.mimeType,
        size: data.blob.size,
        prompt: data.prompt,
        modelName: data.modelName,
      });

      // 转换为StoredAsset并保存
      const storedAsset = assetToStoredAsset(asset, data.blob);
      await this.store!.setItem(asset.id, storedAsset);

      // 缓存Blob URL
      this.blobUrlCache.set(asset.id, blobUrl);

      return asset;
    } catch (error: any) {
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
   * 获取所有素材
   */
  async getAllAssets(): Promise<Asset[]> {
    this.ensureInitialized();

    try {
      const keys = await this.store!.keys();
      const assets: Asset[] = [];

      for (const key of keys) {
        const stored = (await this.store!.getItem(key)) as StoredAsset | null;
        if (stored) {
          // 检查是否已有缓存的Blob URL
          let url = this.blobUrlCache.get(stored.id);
          if (!url) {
            url = URL.createObjectURL(stored.blobData);
            this.blobUrlCache.set(stored.id, url);
          }

          const { blobData, ...assetData } = stored;
          assets.push({
            ...assetData,
            url,
          });
        }
      }

      return assets;
    } catch (error: any) {
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

      // 检查是否已有缓存的Blob URL
      let url = this.blobUrlCache.get(stored.id);
      if (!url) {
        url = URL.createObjectURL(stored.blobData);
        this.blobUrlCache.set(stored.id, url);
      }

      const { blobData, ...assetData } = stored;
      return {
        ...assetData,
        url,
      };
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

      // 释放Blob URL
      const cachedUrl = this.blobUrlCache.get(id);
      if (cachedUrl) {
        URL.revokeObjectURL(cachedUrl);
        this.blobUrlCache.delete(id);
      }

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
      // 释放所有Blob URLs
      for (const url of this.blobUrlCache.values()) {
        URL.revokeObjectURL(url);
      }
      this.blobUrlCache.clear();

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
   * 清理资源
   */
  cleanup(): void {
    // 释放所有Blob URLs
    for (const url of this.blobUrlCache.values()) {
      URL.revokeObjectURL(url);
    }
    this.blobUrlCache.clear();
  }
}

// 导出单例实例
export const assetStorageService = new AssetStorageService();
