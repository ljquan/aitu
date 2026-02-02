/**
 * 分片同步服务
 * 负责媒体文件到分片 Gist 的上传、下载和软删除
 */

import { maskId } from '@aitu/utils';
import { gitHubApiService, GitHubApiError } from './github-api-service';
import { shardRouter } from './shard-router';
import { unifiedCacheService } from '../unified-cache-service';
import { kvStorageService } from '../kv-storage-service';
import { DRAWNIX_DEVICE_ID_KEY } from '../../constants/storage';
import {
  MasterIndex,
  ShardInfo,
  ShardManifest,
  ShardSyncResult,
  ShardSyncDetail,
  MediaTombstone,
  SHARD_CONFIG,
  SHARD_FILES,
  createMediaTombstone,
  createShardManifest,
  isTombstoneExpired,
  updateMasterIndexStats,
} from './shard-types';
import {
  MediaItem,
  MediaSyncProgressCallback,
  MAX_MEDIA_SIZE,
  encodeUrlToFilename,
} from './types';

/**
 * 获取设备 ID
 */
function getDeviceId(): string {
  return localStorage.getItem(DRAWNIX_DEVICE_ID_KEY) || 'unknown';
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 将 Blob 转换为 Base64
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 将 Base64 转换为 Blob
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * 分片同步服务
 */
class ShardSyncService {
  private syncingUrls: Set<string> = new Set();

  /**
   * 上传媒体文件到分片
   */
  async uploadMedia(
    items: MediaItem[],
    onProgress?: MediaSyncProgressCallback
  ): Promise<ShardSyncResult> {
    const startTime = Date.now();
    const result: ShardSyncResult = {
      success: true,
      uploaded: 0,
      downloaded: 0,
      deleted: 0,
      skipped: 0,
      details: [],
    };

    // 确保路由器已初始化
    await shardRouter.initialize();

    if (!shardRouter.isConfigured()) {
      result.success = false;
      result.error = '分片系统未配置';
      return result;
    }

    // 过滤已同步的和正在同步的
    const itemsToUpload = items.filter(item => {
      if (this.syncingUrls.has(item.url)) {
        result.skipped++;
        result.details.push({
          url: item.url,
          action: 'skip',
          success: true,
          error: '正在同步中',
        });
        return false;
      }
      if (shardRouter.isFileSynced(item.url)) {
        result.skipped++;
        result.details.push({
          url: item.url,
          action: 'skip',
          success: true,
          error: '已同步',
        });
        return false;
      }
      return true;
    });

    if (itemsToUpload.length === 0) {
      return result;
    }

    // 批量分配分片
    const filesWithSize = await this.getFileSizes(itemsToUpload);
    const allocation = await shardRouter.allocateFiles(filesWithSize);

    // 按分片分组
    const groupedByShards = this.groupByShards(itemsToUpload, allocation.allocations);

    // 并发上传各分片（限制并发数）
    const shardIds = Object.keys(groupedByShards);
    for (let i = 0; i < shardIds.length; i += SHARD_CONFIG.CONCURRENCY) {
      const batch = shardIds.slice(i, i + SHARD_CONFIG.CONCURRENCY);
      await Promise.all(
        batch.map(shardId =>
          this.uploadToShard(
            shardId,
            groupedByShards[shardId],
            result,
            onProgress
          )
        )
      );
    }

    // 保存主索引
    await shardRouter.saveMasterIndexToRemote();

    result.success = result.uploaded > 0 || result.skipped > 0;
    console.log('[ShardSyncService] Upload completed:', {
      uploaded: result.uploaded,
      skipped: result.skipped,
      failed: result.details.filter(d => !d.success).length,
      duration: Date.now() - startTime,
    });

    return result;
  }

  /**
   * 获取文件大小列表
   */
  private async getFileSizes(
    items: MediaItem[]
  ): Promise<Array<{ url: string; size: number }>> {
    const results: Array<{ url: string; size: number }> = [];

    for (const item of items) {
      let size = item.size || 0;
      if (!size) {
        // 尝试从缓存获取大小
        const blob = await unifiedCacheService.getCachedBlob(item.url);
        size = blob?.size || 0;
      }
      results.push({ url: item.url, size });
    }

    return results;
  }

  /**
   * 按分片分组
   */
  private groupByShards(
    items: MediaItem[],
    allocations: Map<string, ShardInfo>
  ): Record<string, MediaItem[]> {
    const grouped: Record<string, MediaItem[]> = {};

    for (const item of items) {
      const shard = allocations.get(item.url);
      if (shard) {
        if (!grouped[shard.alias]) {
          grouped[shard.alias] = [];
        }
        grouped[shard.alias].push(item);
      }
    }

    return grouped;
  }

  /**
   * 上传文件到指定分片
   */
  private async uploadToShard(
    shardId: string,
    items: MediaItem[],
    result: ShardSyncResult,
    onProgress?: MediaSyncProgressCallback
  ): Promise<void> {
    const shard = shardRouter.getShard(shardId);
    if (!shard) {
      for (const item of items) {
        result.details.push({
          url: item.url,
          action: 'upload',
          success: false,
          error: `分片 ${shardId} 不存在`,
        });
      }
      return;
    }

    // 批量上传文件
    const filesToUpdate: Record<string, string> = {};
    const successfulItems: MediaItem[] = [];

    for (const item of items) {
      this.syncingUrls.add(item.url);

      try {
        const uploadResult = await this.prepareMediaForUpload(item);
        if (uploadResult.success && uploadResult.content) {
          const filename = `media_${encodeUrlToFilename(item.url)}.json`;
          filesToUpdate[filename] = uploadResult.content;
          successfulItems.push(item);

          // 注册到索引
          shardRouter.registerFile(
            item.url,
            shardId,
            filename,
            uploadResult.size,
            item.type
          );

          result.details.push({
            url: item.url,
            action: 'upload',
            success: true,
            shardId,
          });
          result.uploaded++;

          onProgress?.(
            result.uploaded + result.skipped,
            result.uploaded + result.skipped + items.length,
            item.url,
            'uploading'
          );
        } else {
          result.details.push({
            url: item.url,
            action: 'upload',
            success: false,
            error: uploadResult.error || '准备上传失败',
          });
        }
      } catch (error) {
        console.error(`[ShardSyncService] Failed to prepare ${item.url}:`, error);
        result.details.push({
          url: item.url,
          action: 'upload',
          success: false,
          error: error instanceof Error ? error.message : '上传失败',
        });
      } finally {
        this.syncingUrls.delete(item.url);
      }
    }

    // 批量更新 Gist
    if (Object.keys(filesToUpdate).length > 0) {
      try {
        // 同时更新分片清单
        const shardManifest = await this.getOrCreateShardManifest(shard);
        for (const item of successfulItems) {
          const filename = `media_${encodeUrlToFilename(item.url)}.json`;
          shardManifest.files[filename] = {
            url: item.url,
            type: item.type,
            size: item.size || 0,
            mimeType: item.mimeType || '',
            syncedAt: Date.now(),
            syncedFromDevice: getDeviceId(),
          };
        }
        shardManifest.updatedAt = Date.now();

        filesToUpdate[SHARD_FILES.SHARD_MANIFEST] = JSON.stringify(shardManifest, null, 2);

        // 计算总大小并记录
        const totalSize = Object.values(filesToUpdate).reduce((sum, content) => sum + content.length, 0);
        const fileCount = Object.keys(filesToUpdate).length;
        console.log(`[ShardSyncService] Uploading to shard ${shardId}: ${fileCount} files, total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

        // 如果总大小超过 8MB，分批上传（GitHub Gist 请求体限制）
        const MAX_BATCH_SIZE = 8 * 1024 * 1024; // 8MB
        if (totalSize > MAX_BATCH_SIZE) {
          console.log(`[ShardSyncService] Total size exceeds limit, splitting into batches`);
          await this.uploadInBatches(filesToUpdate, shard.gistId, MAX_BATCH_SIZE);
        } else {
          await gitHubApiService.updateGistFiles(filesToUpdate, shard.gistId);
        }
        console.log(`[ShardSyncService] Uploaded ${successfulItems.length} files to shard ${shardId}`);
      } catch (error) {
        console.error(`[ShardSyncService] Failed to update shard ${shardId}:`, error);
        // 回滚索引注册
        for (const item of successfulItems) {
          shardRouter.unregisterFile(item.url);
        }
        // 更新结果
        for (const item of successfulItems) {
          const detail = result.details.find(d => d.url === item.url);
          if (detail) {
            detail.success = false;
            detail.error = '批量上传失败';
          }
          result.uploaded--;
        }
      }
    }
  }

  /**
   * 分批上传文件到 Gist
   */
  private async uploadInBatches(
    files: Record<string, string>,
    gistId: string,
    maxBatchSize: number
  ): Promise<void> {
    const entries = Object.entries(files);
    let currentBatch: Record<string, string> = {};
    let currentBatchSize = 0;
    let batchIndex = 0;

    for (const [filename, content] of entries) {
      const fileSize = content.length;

      // 如果单个文件超过限制，单独上传
      if (fileSize > maxBatchSize) {
        // 先提交当前批次
        if (Object.keys(currentBatch).length > 0) {
          console.log(`[ShardSyncService] Uploading batch ${batchIndex + 1}: ${Object.keys(currentBatch).length} files`);
          await gitHubApiService.updateGistFiles(currentBatch, gistId);
          currentBatch = {};
          currentBatchSize = 0;
          batchIndex++;
        }
        // 单独上传大文件
        console.log(`[ShardSyncService] Uploading large file: ${filename} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
        await gitHubApiService.updateGistFiles({ [filename]: content }, gistId);
        batchIndex++;
        continue;
      }

      // 如果添加这个文件会超过限制，先提交当前批次
      if (currentBatchSize + fileSize > maxBatchSize && Object.keys(currentBatch).length > 0) {
        console.log(`[ShardSyncService] Uploading batch ${batchIndex + 1}: ${Object.keys(currentBatch).length} files`);
        await gitHubApiService.updateGistFiles(currentBatch, gistId);
        currentBatch = {};
        currentBatchSize = 0;
        batchIndex++;
      }

      currentBatch[filename] = content;
      currentBatchSize += fileSize;
    }

    // 上传最后一个批次
    if (Object.keys(currentBatch).length > 0) {
      console.log(`[ShardSyncService] Uploading final batch ${batchIndex + 1}: ${Object.keys(currentBatch).length} files`);
      await gitHubApiService.updateGistFiles(currentBatch, gistId);
    }
  }

  /**
   * 准备媒体数据用于上传
   */
  private async prepareMediaForUpload(
    item: MediaItem
  ): Promise<{ success: boolean; content?: string; size: number; error?: string }> {
    const { url, type, source, originalUrl, mimeType } = item;

    // 获取媒体 Blob
    let blob: Blob | null = null;

    if (source === 'local') {
      blob = await unifiedCacheService.getCachedBlob(url);
    } else if (source === 'external') {
      blob = await unifiedCacheService.getCachedBlob(url);
      if (!blob && originalUrl) {
        try {
          const response = await fetch(originalUrl, {
            mode: 'cors',
            credentials: 'omit',
          });
          if (response.ok) {
            blob = await response.blob();
            if (blob && blob.size > 0) {
              await unifiedCacheService.cacheToCacheStorageOnly(url, blob);
            }
          }
        } catch (error) {
          console.warn(`[ShardSyncService] Failed to fetch ${originalUrl}:`, error);
        }
      }
    }

    if (!blob || blob.size === 0) {
      return { success: false, size: 0, error: '无法获取媒体文件' };
    }

    // 检查文件大小
    if (blob.size > MAX_MEDIA_SIZE) {
      return {
        success: false,
        size: blob.size,
        error: `文件过大（${formatSize(blob.size)}）`,
      };
    }

    // 转换为 Base64
    const base64Data = await blobToBase64(blob);

    // 构建同步数据
    const syncedMediaFile = {
      url,
      type,
      source,
      mimeType: mimeType || blob.type,
      size: blob.size,
      base64Data,
      syncedAt: Date.now(),
      syncedFromDevice: getDeviceId(),
      originalUrl: source === 'external' ? originalUrl : undefined,
    };

    return {
      success: true,
      content: JSON.stringify(syncedMediaFile, null, 2),
      size: blob.size,
    };
  }

  /**
   * 获取或创建分片清单
   */
  private async getOrCreateShardManifest(shard: ShardInfo): Promise<ShardManifest> {
    try {
      const content = await gitHubApiService.getGistFileContent(
        SHARD_FILES.SHARD_MANIFEST,
        shard.gistId
      );
      if (content) {
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn(`[ShardSyncService] Failed to get shard manifest for ${shard.alias}:`, error);
    }

    const masterGistId = shardRouter.getMasterGistId();
    if (!masterGistId) {
      throw new Error('Master gist ID not configured');
    }

    return createShardManifest(shard.alias, masterGistId);
  }

  /**
   * 下载媒体文件从分片
   */
  async downloadMedia(
    urls: string[],
    onProgress?: MediaSyncProgressCallback
  ): Promise<ShardSyncResult> {
    const result: ShardSyncResult = {
      success: true,
      uploaded: 0,
      downloaded: 0,
      deleted: 0,
      skipped: 0,
      details: [],
    };

    await shardRouter.initialize();

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      onProgress?.(i + 1, urls.length, url, 'downloading');

      // 检查本地是否已缓存
      const cacheInfo = await unifiedCacheService.getCacheInfo(url);
      if (cacheInfo.isCached) {
        result.skipped++;
        result.details.push({
          url,
          action: 'skip',
          success: true,
          error: '已缓存',
        });
        continue;
      }

      // 获取文件索引
      const entry = shardRouter.getFileIndexEntry(url);
      if (!entry) {
        result.details.push({
          url,
          action: 'download',
          success: false,
          error: '文件未同步',
        });
        continue;
      }

      // 获取分片信息
      const shard = shardRouter.getShard(entry.shardId);
      if (!shard) {
        result.details.push({
          url,
          action: 'download',
          success: false,
          error: `分片 ${entry.shardId} 不存在`,
        });
        continue;
      }

      // 下载文件
      try {
        const content = await gitHubApiService.getGistFileContent(
          entry.filename,
          shard.gistId
        );

        if (!content) {
          result.details.push({
            url,
            action: 'download',
            success: false,
            error: '文件不存在',
          });
          continue;
        }

        const syncedMedia = JSON.parse(content);
        const blob = base64ToBlob(syncedMedia.base64Data, syncedMedia.mimeType);

        if (!blob || blob.size === 0) {
          result.details.push({
            url,
            action: 'download',
            success: false,
            error: '文件数据无效',
          });
          continue;
        }

        // 缓存到本地
        await unifiedCacheService.cacheToCacheStorageOnly(url, blob);

        result.downloaded++;
        result.details.push({
          url,
          action: 'download',
          success: true,
          shardId: entry.shardId,
        });

        console.log(`[ShardSyncService] Downloaded and cached: ${url}`);
      } catch (error) {
        console.error(`[ShardSyncService] Failed to download ${url}:`, error);
        result.details.push({
          url,
          action: 'download',
          success: false,
          error: error instanceof Error ? error.message : '下载失败',
        });
      }
    }

    result.success = result.downloaded > 0 || result.skipped > 0;
    return result;
  }

  /**
   * 软删除媒体文件
   */
  async softDeleteMedia(urls: string[]): Promise<ShardSyncResult> {
    const result: ShardSyncResult = {
      success: true,
      uploaded: 0,
      downloaded: 0,
      deleted: 0,
      skipped: 0,
      details: [],
    };

    await shardRouter.initialize();

    const masterIndex = shardRouter.getMasterIndex();
    if (!masterIndex) {
      result.success = false;
      result.error = '主索引未加载';
      return result;
    }

    const deviceId = getDeviceId();

    for (const url of urls) {
      const entry = shardRouter.getFileIndexEntry(url);
      if (!entry) {
        result.skipped++;
        result.details.push({
          url,
          action: 'skip',
          success: true,
          error: '文件未同步',
        });
        continue;
      }

      // 创建 tombstone
      const tombstone = createMediaTombstone(
        url,
        entry.shardId,
        entry.filename,
        entry.size,
        deviceId
      );

      // 添加到 tombstones 列表
      masterIndex.tombstones.push(tombstone);

      // 从索引中移除
      shardRouter.unregisterFile(url);

      result.deleted++;
      result.details.push({
        url,
        action: 'delete',
        success: true,
        shardId: entry.shardId,
      });

      console.log(`[ShardSyncService] Soft deleted: ${url}`);
    }

    // 保存主索引
    if (result.deleted > 0) {
      await shardRouter.saveMasterIndexToRemote();
    }

    return result;
  }

  /**
   * 恢复软删除的媒体
   */
  async restoreMedia(url: string): Promise<boolean> {
    await shardRouter.initialize();

    const masterIndex = shardRouter.getMasterIndex();
    if (!masterIndex) {
      return false;
    }

    // 查找 tombstone
    const tombstoneIndex = masterIndex.tombstones.findIndex(t => t.url === url);
    if (tombstoneIndex === -1) {
      console.warn(`[ShardSyncService] No tombstone found for ${url}`);
      return false;
    }

    const tombstone = masterIndex.tombstones[tombstoneIndex];

    // 检查分片是否存在
    const shard = shardRouter.getShard(tombstone.shardId);
    if (!shard) {
      console.warn(`[ShardSyncService] Shard ${tombstone.shardId} not found for restore`);
      return false;
    }

    // 检查文件是否仍在分片中
    try {
      const content = await gitHubApiService.getGistFileContent(
        tombstone.filename,
        shard.gistId
      );

      if (!content) {
        console.warn(`[ShardSyncService] File ${tombstone.filename} not found in shard`);
        return false;
      }

      const syncedMedia = JSON.parse(content);

      // 重新注册到索引
      shardRouter.registerFile(
        url,
        tombstone.shardId,
        tombstone.filename,
        tombstone.size,
        syncedMedia.type
      );

      // 移除 tombstone
      masterIndex.tombstones.splice(tombstoneIndex, 1);

      // 保存主索引
      await shardRouter.saveMasterIndexToRemote();

      console.log(`[ShardSyncService] Restored: ${url}`);
      return true;
    } catch (error) {
      console.error(`[ShardSyncService] Failed to restore ${url}:`, error);
      return false;
    }
  }

  /**
   * 清理过期的 tombstones
   */
  async cleanupExpiredTombstones(): Promise<number> {
    await shardRouter.initialize();

    const masterIndex = shardRouter.getMasterIndex();
    if (!masterIndex) {
      return 0;
    }

    const expiredTombstones = masterIndex.tombstones.filter(isTombstoneExpired);

    if (expiredTombstones.length === 0) {
      return 0;
    }

    console.log(`[ShardSyncService] Cleaning up ${expiredTombstones.length} expired tombstones`);

    // 按分片分组要删除的文件
    const filesToDeleteByShardId: Record<string, string[]> = {};
    for (const tombstone of expiredTombstones) {
      if (!filesToDeleteByShardId[tombstone.shardId]) {
        filesToDeleteByShardId[tombstone.shardId] = [];
      }
      filesToDeleteByShardId[tombstone.shardId].push(tombstone.filename);
    }

    // 删除各分片中的文件
    for (const [shardId, filenames] of Object.entries(filesToDeleteByShardId)) {
      const shard = shardRouter.getShard(shardId);
      if (!shard) {
        continue;
      }

      try {
        await gitHubApiService.deleteGistFiles(filenames, shard.gistId);
        console.log(`[ShardSyncService] Deleted ${filenames.length} files from shard ${shardId}`);
      } catch (error) {
        console.error(`[ShardSyncService] Failed to delete files from shard ${shardId}:`, error);
      }
    }

    // 从 tombstones 列表中移除
    masterIndex.tombstones = masterIndex.tombstones.filter(t => !isTombstoneExpired(t));

    // 保存主索引
    await shardRouter.saveMasterIndexToRemote();

    return expiredTombstones.length;
  }

  /**
   * 获取已同步的 URL 集合
   */
  async getSyncedUrls(): Promise<Set<string>> {
    await shardRouter.initialize();

    const masterIndex = shardRouter.getMasterIndex();
    if (!masterIndex) {
      return new Set();
    }

    return new Set(Object.keys(masterIndex.fileIndex));
  }

  /**
   * 获取 tombstones 列表
   */
  async getTombstones(): Promise<MediaTombstone[]> {
    await shardRouter.initialize();

    const masterIndex = shardRouter.getMasterIndex();
    if (!masterIndex) {
      return [];
    }

    return [...masterIndex.tombstones];
  }

  /**
   * 检查 URL 是否在 tombstones 中
   */
  async isInTombstones(url: string): Promise<boolean> {
    await shardRouter.initialize();

    const masterIndex = shardRouter.getMasterIndex();
    if (!masterIndex) {
      return false;
    }

    return masterIndex.tombstones.some(t => t.url === url);
  }
}

/** 分片同步服务单例 */
export const shardSyncService = new ShardSyncService();
