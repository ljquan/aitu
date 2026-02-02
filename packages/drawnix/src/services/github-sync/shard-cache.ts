/**
 * 分片缓存
 * 缓存分片元数据，减少网络请求，提升性能
 */

import { gitHubApiService } from './github-api-service';
import { kvStorageService } from '../kv-storage-service';
import {
  ShardManifest,
  MasterIndex,
  ShardInfo,
  SHARD_CONFIG,
  SHARD_FILES,
} from './shard-types';

/** 分片清单缓存条目 */
interface ShardManifestCacheEntry {
  manifest: ShardManifest;
  cachedAt: number;
  expiresAt: number;
}

/** 缓存存储键前缀 */
const SHARD_MANIFEST_CACHE_PREFIX = 'shard_manifest_cache_';

/** 主索引缓存键 */
const MASTER_INDEX_CACHE_KEY = 'shard_master_index_cache';

/** 主索引缓存条目 */
interface MasterIndexCacheEntry {
  index: MasterIndex;
  cachedAt: number;
  expiresAt: number;
}

/**
 * 分片缓存服务
 */
class ShardCache {
  /** 内存缓存 - 分片清单 */
  private manifestCache: Map<string, ShardManifestCacheEntry> = new Map();

  /** 内存缓存 - 主索引 */
  private masterIndexCache: MasterIndexCacheEntry | null = null;

  /** 是否启用持久化缓存 */
  private persistentCacheEnabled = true;

  /**
   * 获取分片清单（带缓存）
   */
  async getShardManifest(
    shardId: string,
    shard: ShardInfo,
    forceRefresh = false
  ): Promise<ShardManifest | null> {
    // 检查内存缓存
    if (!forceRefresh) {
      const cached = this.manifestCache.get(shardId);
      if (cached && cached.expiresAt > Date.now()) {
        console.log(`[ShardCache] Memory cache hit for shard ${shardId}`);
        return cached.manifest;
      }

      // 检查持久化缓存
      if (this.persistentCacheEnabled) {
        const persistedCache = await this.loadPersistedManifestCache(shardId);
        if (persistedCache && persistedCache.expiresAt > Date.now()) {
          // 恢复到内存缓存
          this.manifestCache.set(shardId, persistedCache);
          console.log(`[ShardCache] Persistent cache hit for shard ${shardId}`);
          return persistedCache.manifest;
        }
      }
    }

    // 从远程获取
    console.log(`[ShardCache] Fetching shard manifest from remote: ${shardId}`);
    try {
      const content = await gitHubApiService.getGistFileContent(
        SHARD_FILES.SHARD_MANIFEST,
        shard.gistId
      );

      if (!content) {
        return null;
      }

      const manifest = JSON.parse(content) as ShardManifest;

      // 缓存
      const entry: ShardManifestCacheEntry = {
        manifest,
        cachedAt: Date.now(),
        expiresAt: Date.now() + SHARD_CONFIG.CACHE_TTL_MS,
      };

      this.manifestCache.set(shardId, entry);

      // 持久化
      if (this.persistentCacheEnabled) {
        await this.persistManifestCache(shardId, entry);
      }

      return manifest;
    } catch (error) {
      console.error(`[ShardCache] Failed to fetch shard manifest for ${shardId}:`, error);
      return null;
    }
  }

  /**
   * 设置分片清单缓存
   */
  setShardManifest(shardId: string, manifest: ShardManifest): void {
    const entry: ShardManifestCacheEntry = {
      manifest,
      cachedAt: Date.now(),
      expiresAt: Date.now() + SHARD_CONFIG.CACHE_TTL_MS,
    };

    this.manifestCache.set(shardId, entry);

    // 异步持久化
    if (this.persistentCacheEnabled) {
      this.persistManifestCache(shardId, entry).catch(error => {
        console.warn(`[ShardCache] Failed to persist manifest cache for ${shardId}:`, error);
      });
    }
  }

  /**
   * 使分片清单缓存失效
   */
  async invalidateShardManifest(shardId: string): Promise<void> {
    this.manifestCache.delete(shardId);

    if (this.persistentCacheEnabled) {
      await kvStorageService.delete(`${SHARD_MANIFEST_CACHE_PREFIX}${shardId}`);
    }

    console.log(`[ShardCache] Invalidated cache for shard ${shardId}`);
  }

  /**
   * 获取主索引（带缓存）
   */
  async getMasterIndex(
    masterGistId: string,
    forceRefresh = false
  ): Promise<MasterIndex | null> {
    // 检查内存缓存
    if (!forceRefresh && this.masterIndexCache && this.masterIndexCache.expiresAt > Date.now()) {
      console.log('[ShardCache] Memory cache hit for master index');
      return this.masterIndexCache.index;
    }

    // 检查持久化缓存
    if (!forceRefresh && this.persistentCacheEnabled) {
      const persistedCache = await this.loadPersistedMasterIndexCache();
      if (persistedCache && persistedCache.expiresAt > Date.now()) {
        this.masterIndexCache = persistedCache;
        console.log('[ShardCache] Persistent cache hit for master index');
        return persistedCache.index;
      }
    }

    // 从远程获取
    console.log('[ShardCache] Fetching master index from remote');
    try {
      const content = await gitHubApiService.getGistFileContent(
        SHARD_FILES.MASTER_INDEX,
        masterGistId
      );

      if (!content) {
        return null;
      }

      const index = JSON.parse(content) as MasterIndex;

      // 缓存
      const entry: MasterIndexCacheEntry = {
        index,
        cachedAt: Date.now(),
        expiresAt: Date.now() + SHARD_CONFIG.CACHE_TTL_MS,
      };

      this.masterIndexCache = entry;

      // 持久化
      if (this.persistentCacheEnabled) {
        await this.persistMasterIndexCache(entry);
      }

      return index;
    } catch (error) {
      console.error('[ShardCache] Failed to fetch master index:', error);
      return null;
    }
  }

  /**
   * 设置主索引缓存
   */
  setMasterIndex(index: MasterIndex): void {
    const entry: MasterIndexCacheEntry = {
      index,
      cachedAt: Date.now(),
      expiresAt: Date.now() + SHARD_CONFIG.CACHE_TTL_MS,
    };

    this.masterIndexCache = entry;

    // 异步持久化
    if (this.persistentCacheEnabled) {
      this.persistMasterIndexCache(entry).catch(error => {
        console.warn('[ShardCache] Failed to persist master index cache:', error);
      });
    }
  }

  /**
   * 使主索引缓存失效
   */
  async invalidateMasterIndex(): Promise<void> {
    this.masterIndexCache = null;

    if (this.persistentCacheEnabled) {
      await kvStorageService.remove(MASTER_INDEX_CACHE_KEY);
    }

    console.log('[ShardCache] Invalidated master index cache');
  }

  /**
   * 预加载所有分片清单
   */
  async preloadAllShardManifests(shards: ShardInfo[]): Promise<void> {
    console.log(`[ShardCache] Preloading ${shards.length} shard manifests`);

    // 并发加载，限制并发数
    const batchSize = SHARD_CONFIG.CONCURRENCY;
    for (let i = 0; i < shards.length; i += batchSize) {
      const batch = shards.slice(i, i + batchSize);
      await Promise.all(
        batch.map(shard => this.getShardManifest(shard.alias, shard))
      );
    }

    console.log('[ShardCache] Preloading completed');
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): {
    manifestCacheSize: number;
    hasMasterIndexCache: boolean;
    oldestCacheAge: number | null;
  } {
    let oldestCacheAge: number | null = null;

    // 检查分片清单缓存
    for (const entry of this.manifestCache.values()) {
      const age = Date.now() - entry.cachedAt;
      if (oldestCacheAge === null || age > oldestCacheAge) {
        oldestCacheAge = age;
      }
    }

    // 检查主索引缓存
    if (this.masterIndexCache) {
      const age = Date.now() - this.masterIndexCache.cachedAt;
      if (oldestCacheAge === null || age > oldestCacheAge) {
        oldestCacheAge = age;
      }
    }

    return {
      manifestCacheSize: this.manifestCache.size,
      hasMasterIndexCache: !!this.masterIndexCache,
      oldestCacheAge,
    };
  }

  /**
   * 清理过期缓存
   */
  async cleanupExpiredCache(): Promise<number> {
    let cleaned = 0;
    const now = Date.now();

    // 清理过期的分片清单缓存
    for (const [shardId, entry] of this.manifestCache) {
      if (entry.expiresAt <= now) {
        this.manifestCache.delete(shardId);
        if (this.persistentCacheEnabled) {
          await kvStorageService.delete(`${SHARD_MANIFEST_CACHE_PREFIX}${shardId}`);
        }
        cleaned++;
      }
    }

    // 清理过期的主索引缓存
    if (this.masterIndexCache && this.masterIndexCache.expiresAt <= now) {
      this.masterIndexCache = null;
      if (this.persistentCacheEnabled) {
        await kvStorageService.delete(MASTER_INDEX_CACHE_KEY);
      }
      cleaned++;
    }

    if (cleaned > 0) {
      console.log(`[ShardCache] Cleaned up ${cleaned} expired cache entries`);
    }

    return cleaned;
  }

  /**
   * 清除所有缓存
   */
  async clearAll(): Promise<void> {
    // 清除内存缓存
    const shardIds = Array.from(this.manifestCache.keys());
    this.manifestCache.clear();
    this.masterIndexCache = null;

    // 清除持久化缓存
    if (this.persistentCacheEnabled) {
      for (const shardId of shardIds) {
        await kvStorageService.delete(`${SHARD_MANIFEST_CACHE_PREFIX}${shardId}`);
      }
      await kvStorageService.delete(MASTER_INDEX_CACHE_KEY);
    }

    console.log('[ShardCache] Cleared all cache');
  }

  /**
   * 启用/禁用持久化缓存
   */
  setPersistentCacheEnabled(enabled: boolean): void {
    this.persistentCacheEnabled = enabled;
    console.log(`[ShardCache] Persistent cache ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * 持久化分片清单缓存
   */
  private async persistManifestCache(
    shardId: string,
    entry: ShardManifestCacheEntry
  ): Promise<void> {
    await kvStorageService.set(`${SHARD_MANIFEST_CACHE_PREFIX}${shardId}`, entry);
  }

  /**
   * 加载持久化的分片清单缓存
   */
  private async loadPersistedManifestCache(
    shardId: string
  ): Promise<ShardManifestCacheEntry | null> {
    return await kvStorageService.get<ShardManifestCacheEntry>(
      `${SHARD_MANIFEST_CACHE_PREFIX}${shardId}`
    );
  }

  /**
   * 持久化主索引缓存
   */
  private async persistMasterIndexCache(entry: MasterIndexCacheEntry): Promise<void> {
    await kvStorageService.set(MASTER_INDEX_CACHE_KEY, entry);
  }

  /**
   * 加载持久化的主索引缓存
   */
  private async loadPersistedMasterIndexCache(): Promise<MasterIndexCacheEntry | null> {
    return await kvStorageService.get<MasterIndexCacheEntry>(MASTER_INDEX_CACHE_KEY);
  }

  /**
   * 延长缓存有效期
   */
  extendCacheTTL(shardId?: string): void {
    const newExpiry = Date.now() + SHARD_CONFIG.CACHE_TTL_MS;

    if (shardId) {
      const entry = this.manifestCache.get(shardId);
      if (entry) {
        entry.expiresAt = newExpiry;
      }
    } else {
      // 延长所有缓存
      for (const entry of this.manifestCache.values()) {
        entry.expiresAt = newExpiry;
      }
      if (this.masterIndexCache) {
        this.masterIndexCache.expiresAt = newExpiry;
      }
    }
  }

  /**
   * 检查缓存是否命中
   */
  isCached(shardId: string): boolean {
    const entry = this.manifestCache.get(shardId);
    return !!entry && entry.expiresAt > Date.now();
  }

  /**
   * 检查主索引是否缓存
   */
  isMasterIndexCached(): boolean {
    return !!this.masterIndexCache && this.masterIndexCache.expiresAt > Date.now();
  }
}

/** 分片缓存单例 */
export const shardCache = new ShardCache();
