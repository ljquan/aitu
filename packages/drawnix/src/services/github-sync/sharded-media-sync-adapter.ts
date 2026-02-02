/**
 * 分片媒体同步适配器
 * 桥接旧的 media-sync-service 和新的分片系统
 * 提供向后兼容的 API，同时使用分片存储
 */

import { maskId } from '@aitu/utils';
import { shardRouter } from './shard-router';
import { shardSyncService } from './shard-sync-service';
import { shardManager } from './shard-manager';
import { shardCache } from './shard-cache';
import { gitHubApiService } from './github-api-service';
import { kvStorageService } from '../kv-storage-service';
import {
  MasterIndex,
  ShardSyncResult,
  SHARD_FILES,
  SHARD_VERSION,
  createEmptyMasterIndex,
} from './shard-types';
import {
  MediaItem,
  MediaSyncProgressCallback,
  BatchMediaItemSyncResult,
  SyncManifest,
  SYNC_FILES,
} from './types';

/** 分片系统启用状态存储键 */
const SHARD_SYSTEM_ENABLED_KEY = 'github_sync_shard_enabled';

/** 应用版本（用于主索引） */
const APP_VERSION = '0.5.0';

/**
 * 分片媒体同步适配器
 */
class ShardedMediaSyncAdapter {
  private shardingEnabled = false;
  private initialized = false;

  /**
   * 初始化适配器
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 检查是否启用分片
    this.shardingEnabled = await kvStorageService.get<boolean>(SHARD_SYSTEM_ENABLED_KEY) || false;

    if (this.shardingEnabled) {
      await shardRouter.initialize();
    }

    this.initialized = true;
    console.log('[ShardedMediaSyncAdapter] Initialized, sharding enabled:', this.shardingEnabled);
  }

  /**
   * 检查分片系统是否启用
   */
  isShardingEnabled(): boolean {
    return this.shardingEnabled;
  }

  /**
   * 启用分片系统
   */
  async enableSharding(): Promise<void> {
    this.shardingEnabled = true;
    await kvStorageService.set(SHARD_SYSTEM_ENABLED_KEY, true);
    await shardRouter.initialize();
    console.log('[ShardedMediaSyncAdapter] Sharding enabled');
  }

  /**
   * 禁用分片系统
   */
  async disableSharding(): Promise<void> {
    this.shardingEnabled = false;
    await kvStorageService.set(SHARD_SYSTEM_ENABLED_KEY, false);
    console.log('[ShardedMediaSyncAdapter] Sharding disabled');
  }

  /**
   * 初始化分片系统（首次启用时调用）
   * 创建主索引，并迁移现有媒体
   */
  async setupShardSystem(masterGistId: string): Promise<{
    success: boolean;
    error?: string;
    migratedFiles?: number;
  }> {
    try {
      console.log('[ShardedMediaSyncAdapter] Setting up shard system...');

      // 设置主 Gist ID
      await shardRouter.setMasterGistId(masterGistId);
      await shardRouter.initialize();

      // 检查是否已有主索引
      let masterIndex = await shardRouter.loadMasterIndexFromRemote();

      if (!masterIndex) {
        // 创建新的主索引
        masterIndex = await shardRouter.initializeMasterIndex(APP_VERSION);

        // 保存到远程
        await gitHubApiService.updateGistFiles(
          {
            [SHARD_FILES.MASTER_INDEX]: JSON.stringify(masterIndex, null, 2),
          },
          masterGistId
        );

        console.log('[ShardedMediaSyncAdapter] Created new master index');
      }

      // 启用分片
      await this.enableSharding();

      return { success: true };
    } catch (error) {
      console.error('[ShardedMediaSyncAdapter] Setup failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '设置失败',
      };
    }
  }

  /**
   * 上传媒体（自动选择使用分片或传统方式）
   */
  async uploadMedia(
    items: MediaItem[],
    onProgress?: MediaSyncProgressCallback
  ): Promise<BatchMediaItemSyncResult> {
    await this.initialize();

    if (this.shardingEnabled && shardRouter.isConfigured()) {
      // 使用分片系统
      const result = await shardSyncService.uploadMedia(items, onProgress);
      return this.convertToLegacyResult(result);
    } else {
      // 使用传统方式（需要调用旧的 media-sync-service）
      // 这里返回空结果，实际调用应该走 mediaSyncService
      console.log('[ShardedMediaSyncAdapter] Sharding not enabled, use mediaSyncService instead');
      return this.createEmptyResult();
    }
  }

  /**
   * 下载媒体
   */
  async downloadMedia(
    urls: string[],
    onProgress?: MediaSyncProgressCallback
  ): Promise<BatchMediaItemSyncResult> {
    await this.initialize();

    if (this.shardingEnabled && shardRouter.isConfigured()) {
      const result = await shardSyncService.downloadMedia(urls, onProgress);
      return this.convertToLegacyResult(result);
    } else {
      console.log('[ShardedMediaSyncAdapter] Sharding not enabled, use mediaSyncService instead');
      return this.createEmptyResult();
    }
  }

  /**
   * 获取已同步的 URL 集合
   */
  async getSyncedUrls(): Promise<Set<string>> {
    await this.initialize();

    if (this.shardingEnabled && shardRouter.isConfigured()) {
      return await shardSyncService.getSyncedUrls();
    } else {
      return new Set();
    }
  }

  /**
   * 软删除媒体
   */
  async softDeleteMedia(urls: string[]): Promise<ShardSyncResult> {
    await this.initialize();

    if (!this.shardingEnabled || !shardRouter.isConfigured()) {
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        deleted: 0,
        skipped: 0,
        error: '分片系统未启用',
        details: [],
      };
    }

    return await shardSyncService.softDeleteMedia(urls);
  }

  /**
   * 恢复软删除的媒体
   */
  async restoreMedia(url: string): Promise<boolean> {
    await this.initialize();

    if (!this.shardingEnabled || !shardRouter.isConfigured()) {
      return false;
    }

    return await shardSyncService.restoreMedia(url);
  }

  /**
   * 获取分片统计
   */
  async getShardStats(): Promise<{
    enabled: boolean;
    stats?: {
      totalShards: number;
      activeShards: number;
      fullShards: number;
      totalFiles: number;
      totalSize: number;
    };
  }> {
    await this.initialize();

    if (!this.shardingEnabled || !shardRouter.isConfigured()) {
      return { enabled: false };
    }

    const stats = await shardManager.getShardStats();
    return {
      enabled: true,
      stats: {
        totalShards: stats.totalShards,
        activeShards: stats.activeShards,
        fullShards: stats.fullShards,
        totalFiles: stats.totalFiles,
        totalSize: stats.totalSize,
      },
    };
  }

  /**
   * 检查是否需要迁移到分片系统
   * 当文件数超过阈值时返回 true
   */
  async shouldMigrateToSharding(threshold = 200): Promise<boolean> {
    try {
      const manifestContent = await gitHubApiService.getGistFileContent(SYNC_FILES.MANIFEST);
      if (!manifestContent) {
        return false;
      }

      const manifest: SyncManifest = JSON.parse(manifestContent);
      const mediaCount = Object.keys(manifest.syncedMedia || {}).length;

      return mediaCount >= threshold;
    } catch (error) {
      console.warn('[ShardedMediaSyncAdapter] Failed to check migration status:', error);
      return false;
    }
  }

  /**
   * 清理过期的 tombstones
   */
  async cleanupExpiredTombstones(): Promise<number> {
    await this.initialize();

    if (!this.shardingEnabled || !shardRouter.isConfigured()) {
      return 0;
    }

    return await shardSyncService.cleanupExpiredTombstones();
  }

  /**
   * 转换分片结果为旧版结果格式
   */
  private convertToLegacyResult(result: ShardSyncResult): BatchMediaItemSyncResult {
    return {
      succeeded: result.uploaded + result.downloaded,
      failed: result.details.filter(d => !d.success && d.action !== 'skip').length,
      skipped: result.skipped,
      results: result.details.map(d => ({
        success: d.success,
        url: d.url,
        error: d.error,
      })),
      totalSize: 0, // 分片结果中没有总大小统计
      duration: 0,
    };
  }

  /**
   * 创建空结果
   */
  private createEmptyResult(): BatchMediaItemSyncResult {
    return {
      succeeded: 0,
      failed: 0,
      skipped: 0,
      results: [],
      totalSize: 0,
      duration: 0,
    };
  }

  /**
   * 销毁
   */
  destroy(): void {
    shardManager.destroy();
    this.initialized = false;
  }
}

/** 分片媒体同步适配器单例 */
export const shardedMediaSyncAdapter = new ShardedMediaSyncAdapter();
