/**
 * 媒体同步服务
 * 负责同步画布中的图片/视频资源（基于 URL）
 */

import { gitHubApiService } from './github-api-service';
import { unifiedCacheService } from '../unified-cache-service';
import { kvStorageService } from '../kv-storage-service';
import { DRAWNIX_DEVICE_ID_KEY } from '../../constants/storage';
import { logInfo, logSuccess, logError, logWarning, logDebug } from './sync-log-service';
import {
  MediaSyncStatus,
  SyncedMediaFile,
  MediaItem,
  MediaItemSyncResult,
  BatchMediaItemSyncResult,
  MediaSyncProgressCallback,
  MAX_MEDIA_SIZE,
  SYNC_FILES,
  SyncManifest,
  encodeUrlToFilename,
} from './types';
import { mediaCollector } from './media-collector';

/** 媒体同步状态存储键 */
const MEDIA_SYNC_STATUS_KEY = 'github_media_sync_status';

/** 媒体同步状态缓存 */
interface MediaSyncStatusCache {
  [url: string]: {
    status: MediaSyncStatus;
    syncedAt?: number;
    error?: string;
  };
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
 * 获取设备 ID
 */
function getDeviceId(): string {
  return localStorage.getItem(DRAWNIX_DEVICE_ID_KEY) || 'unknown';
}

/**
 * 将 Blob 转换为 Base64
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // 移除 data URL 前缀
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

/** 媒体同步完成回调类型 */
type MediaSyncCompletedCallback = (result: BatchMediaItemSyncResult) => void;

/**
 * 媒体同步服务
 * 统一使用 URL 作为键，支持画布媒体和任务产物的同步
 */
class MediaSyncService {
  private statusCache: MediaSyncStatusCache = {};
  private syncingUrls: Set<string> = new Set();
  private syncCompletedListeners: Set<MediaSyncCompletedCallback> = new Set();

  constructor() {
    this.loadStatusCache();
  }

  /**
   * 添加同步完成监听器
   */
  addSyncCompletedListener(callback: MediaSyncCompletedCallback): void {
    this.syncCompletedListeners.add(callback);
  }

  /**
   * 移除同步完成监听器
   */
  removeSyncCompletedListener(callback: MediaSyncCompletedCallback): void {
    this.syncCompletedListeners.delete(callback);
  }

  /**
   * 通知同步完成
   */
  private notifySyncCompleted(result: BatchMediaItemSyncResult): void {
    if (result.succeeded > 0) {
      this.syncCompletedListeners.forEach(callback => {
        try {
          callback(result);
        } catch (error) {
          logError('Sync completed callback error', error instanceof Error ? error : new Error(String(error)));
        }
      });
    }
  }

  /**
   * 加载状态缓存
   */
  private async loadStatusCache(): Promise<void> {
    const cache = await kvStorageService.get<MediaSyncStatusCache>(MEDIA_SYNC_STATUS_KEY);
    if (cache) {
      this.statusCache = cache;
    }
  }

  /**
   * 保存状态缓存
   */
  private async saveStatusCache(): Promise<void> {
    await kvStorageService.set(MEDIA_SYNC_STATUS_KEY, this.statusCache);
  }

  /**
   * 获取 URL 的同步状态
   */
  getUrlSyncStatus(url: string): MediaSyncStatus {
    // 检查是否正在同步
    if (this.syncingUrls.has(url)) {
      return 'syncing';
    }

    // 检查缓存
    const cached = this.statusCache[url];
    if (cached) {
      return cached.status;
    }

    return 'not_synced';
  }

  // ====================================
  // 媒体同步方法（基于 URL）
  // ====================================

  /**
   * 同步当前画布的媒体资源（自动同步）
   * 在 SyncEngine.sync() 中调用
   * @param currentBoardId 当前画布 ID
   * @param onProgress 进度回调
   */
  async syncCurrentBoardMedia(
    currentBoardId: string,
    onProgress?: MediaSyncProgressCallback
  ): Promise<BatchMediaItemSyncResult> {
    const startTime = Date.now();
    logDebug('syncCurrentBoardMedia', { currentBoardId });
    logInfo('开始同步当前画板媒体', { boardId: currentBoardId });

    try {
      // 收集当前画布的媒体资源
      const collected = await mediaCollector.collectCurrentBoardMedia(currentBoardId);
      logDebug('Collected media', collected.stats);

      if (collected.currentBoardItems.length === 0) {
        logInfo('当前画板无媒体需要同步');
        return this.createEmptyBatchResult(startTime);
      }

      // 获取远程已同步的 URL 集合
      const remoteSyncedUrls = await this.getRemoteSyncedUrls();

      // 增量计算：只同步新增的
      const itemsToSync = collected.currentBoardItems.filter(
        item => !remoteSyncedUrls.has(item.url)
      );

      logDebug('Items to sync', { toSync: itemsToSync.length, total: collected.currentBoardItems.length, alreadySynced: remoteSyncedUrls.size });
      logInfo('媒体增量计算完成', {
        total: collected.currentBoardItems.length,
        alreadySynced: remoteSyncedUrls.size,
        toSync: itemsToSync.length,
      });

      if (itemsToSync.length === 0) {
        return this.createEmptyBatchResult(startTime);
      }

      // 执行同步
      const result = await this.syncMediaItems(itemsToSync, onProgress);
      
      // Log sync result
      logSuccess('媒体同步完成', {
        succeeded: result.succeeded,
        failed: result.failed,
        skipped: result.skipped,
        totalSize: result.totalSize,
        duration: result.duration,
      });
      
      return result;
    } catch (error) {
      logError('syncCurrentBoardMedia failed', error instanceof Error ? error : new Error(String(error)));
      logError('媒体同步失败', error instanceof Error ? error : new Error(String(error)));
      return {
        succeeded: 0,
        failed: 0,
        skipped: 0,
        results: [],
        totalSize: 0,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 同步选中的媒体资源（手动同步）
   * 在素材库或任务队列中由用户触发
   * @param urls 要同步的 URL 列表
   * @param onProgress 进度回调
   */
  async syncSelectedMedia(
    urls: string[],
    onProgress?: MediaSyncProgressCallback
  ): Promise<BatchMediaItemSyncResult> {
    const startTime = Date.now();
    logDebug('syncSelectedMedia', { urlCount: urls.length });

    try {
      // 收集指定的媒体资源
      const items = await mediaCollector.collectMediaByUrls(urls);

      if (items.length === 0) {
        return this.createEmptyBatchResult(startTime);
      }

      // 获取远程已同步的 URL 集合
      const remoteSyncedUrls = await this.getRemoteSyncedUrls();

      // 增量计算：只同步新增的
      const itemsToSync = items.filter(item => !remoteSyncedUrls.has(item.url));

      logDebug('Items to sync', { toSync: itemsToSync.length, requested: items.length, alreadySynced: items.length - itemsToSync.length });

      if (itemsToSync.length === 0) {
        return {
          succeeded: 0,
          failed: 0,
          skipped: items.length,
          results: items.map(item => ({
            success: true,
            url: item.url,
            error: '已同步',
          })),
          totalSize: 0,
          duration: Date.now() - startTime,
        };
      }

      // 执行同步
      return await this.syncMediaItems(itemsToSync, onProgress);
    } catch (error) {
      logError('syncSelectedMedia failed', error instanceof Error ? error : new Error(String(error)));
      return {
        succeeded: 0,
        failed: 0,
        skipped: 0,
        results: [],
        totalSize: 0,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 获取远程已同步的 URL 集合
   * 使用分片系统的 master-index.json 中的 fileIndex
   */
  async getRemoteSyncedUrls(): Promise<Set<string>> {
    try {
      // 先检查是否已配置 gistId
      if (!gitHubApiService.hasGistId()) {
        return new Set();
      }

      // 使用分片系统的 shardSyncService 获取已同步的 URL
      const { shardSyncService } = await import('./shard-sync-service');
      return await shardSyncService.getSyncedUrls();
    } catch (error) {
      logWarning('Failed to get remote synced URLs', { error: String(error) });
      return new Set();
    }
  }

  /**
   * 同步媒体项列表
   * 优先使用分片系统，降级到传统方式
   */
  private async syncMediaItems(
    items: MediaItem[],
    onProgress?: MediaSyncProgressCallback
  ): Promise<BatchMediaItemSyncResult> {
    const startTime = Date.now();

    // 尝试使用分片系统
    try {
      const { shardedMediaSyncAdapter } = await import('./sharded-media-sync-adapter');
      await shardedMediaSyncAdapter.initialize();
      
      if (shardedMediaSyncAdapter.isShardingEnabled()) {
        logDebug('Using sharded media sync adapter');
        const result = await shardedMediaSyncAdapter.uploadMedia(items, onProgress);
        result.duration = Date.now() - startTime;
        logDebug('Sharded sync completed', {
          succeeded: result.succeeded,
          failed: result.failed,
          skipped: result.skipped,
          duration: result.duration,
        });
        // 通知同步完成
        this.notifySyncCompleted(result);
        return result;
      }
    } catch (error) {
      logWarning('Failed to use sharded adapter, falling back', { error: String(error) });
    }

    // 降级到传统方式
    const result: BatchMediaItemSyncResult = {
      succeeded: 0,
      failed: 0,
      skipped: 0,
      results: [],
      totalSize: 0,
      duration: 0,
    };

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      onProgress?.(i + 1, items.length, item.url, 'uploading');

      const syncResult = await this.syncSingleMediaItem(item);
      result.results.push(syncResult);

      if (syncResult.success) {
        result.succeeded++;
        result.totalSize += syncResult.size || 0;
      } else if (syncResult.error?.includes('过大') || syncResult.error?.includes('CORS')) {
        result.skipped++;
      } else {
        result.failed++;
      }
    }

    result.duration = Date.now() - startTime;
    logDebug('Legacy sync completed', {
      succeeded: result.succeeded,
      failed: result.failed,
      skipped: result.skipped,
      totalSize: formatSize(result.totalSize),
      duration: result.duration,
    });

    // 通知同步完成
    this.notifySyncCompleted(result);

    return result;
  }

  /**
   * 同步单个媒体项
   */
  private async syncSingleMediaItem(item: MediaItem): Promise<MediaItemSyncResult> {
    const { url, type, source, originalUrl, mimeType } = item;

    // 标记正在同步
    this.syncingUrls.add(url);

    try {
      // 获取媒体 Blob
      let blob: Blob | null = null;

      if (source === 'local') {
        // 本地资源：从 Cache Storage 获取
        blob = await unifiedCacheService.getCachedBlob(url);
      } else if (source === 'external') {
        // 外部资源：先尝试从缓存获取，否则下载
        blob = await unifiedCacheService.getCachedBlob(url);
        if (!blob && originalUrl) {
          blob = await this.fetchMediaFromUrl(originalUrl);
          // 如果成功下载，缓存到本地
          if (blob && blob.size > 0) {
            await unifiedCacheService.cacheToCacheStorageOnly(url, blob);
          }
        }
      }

      if (!blob || blob.size === 0) {
        return { success: false, url, error: '无法获取媒体文件' };
      }

      // 检查文件大小
      if (blob.size > MAX_MEDIA_SIZE) {
        return {
          success: false,
          url,
          error: `文件过大（${formatSize(blob.size)}），最大支持 ${formatSize(MAX_MEDIA_SIZE)}`,
          size: blob.size,
        };
      }

      // 转换为 Base64
      const base64Data = await blobToBase64(blob);

      // 构建同步数据
      const syncedMediaFile: SyncedMediaFile = {
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

      // 生成文件名（使用 URL 的 Base64 编码）
      const filename = `media_${encodeUrlToFilename(url)}.json`;
      const content = JSON.stringify(syncedMediaFile, null, 2);

      // 上传到 Gist
      await gitHubApiService.updateGistFiles({
        [filename]: content,
      });

      // 注意：不再更新 manifest.syncedMedia，因为现在使用分片系统的 fileIndex
      // 媒体同步现在应该通过 shardedMediaSyncAdapter 进行

      // 更新本地缓存状态
      this.statusCache[url] = {
        status: 'synced',
        syncedAt: Date.now(),
      };
      await this.saveStatusCache();

      return { success: true, url, size: blob.size };
    } catch (error) {
      logError(`Failed to sync media: ${url}`, error instanceof Error ? error : new Error(String(error)));
      const errorMessage = error instanceof Error ? error.message : '同步失败';

      // 更新本地缓存状态
      this.statusCache[url] = {
        status: 'error',
        error: errorMessage,
      };
      await this.saveStatusCache();

      return { success: false, url, error: errorMessage };
    } finally {
      this.syncingUrls.delete(url);
    }
  }

  /**
   * 从 URL 获取媒体 Blob
   */
  private async fetchMediaFromUrl(url: string): Promise<Blob | null> {
    try {
      const response = await fetch(url, {
        mode: 'cors',
        credentials: 'omit',
      });
      
      if (!response.ok) {
        logWarning('Failed to fetch media', { status: response.status });
        return null;
      }
      
      return await response.blob();
    } catch (error) {
      logError('Fetch media failed', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * 创建空的批量结果
   */
  private createEmptyBatchResult(startTime: number): BatchMediaItemSyncResult {
    return {
      succeeded: 0,
      failed: 0,
      skipped: 0,
      results: [],
      totalSize: 0,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 从远程下载媒体并缓存到本地（基于 URL）
   * @param url 媒体 URL
   */
  async downloadAndCacheMediaByUrl(url: string): Promise<string | null> {
    try {
      // 生成文件名
      const filename = `media_${encodeUrlToFilename(url)}.json`;
      const content = await gitHubApiService.getGistFileContent(filename);

      if (!content) {
        return null;
      }

      const syncedMediaFile: SyncedMediaFile = JSON.parse(content);
      const blob = base64ToBlob(syncedMediaFile.base64Data, syncedMediaFile.mimeType);

      if (!blob || blob.size === 0) {
        return null;
      }

      // 缓存到本地
      await unifiedCacheService.cacheToCacheStorageOnly(url, blob);

      logDebug('Downloaded and cached media', { url });
      return url;
    } catch (error) {
      logError(`Failed to download media: ${url}`, error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * 下载所有远程媒体并缓存到本地
   * @param onProgress 进度回调
   */
  async downloadAllRemoteMedia(
    onProgress?: MediaSyncProgressCallback
  ): Promise<BatchMediaItemSyncResult> {
    const startTime = Date.now();
    const result: BatchMediaItemSyncResult = {
      succeeded: 0,
      failed: 0,
      skipped: 0,
      results: [],
      totalSize: 0,
      duration: 0,
    };

    try {
      // 获取远程已同步的 URL 列表
      const remoteSyncedUrls = await this.getRemoteSyncedUrls();
      const urlsArray = Array.from(remoteSyncedUrls);

      logDebug('Found remote media to download', { count: urlsArray.length });

      for (let i = 0; i < urlsArray.length; i++) {
        const url = urlsArray[i];
        onProgress?.(i + 1, urlsArray.length, url, 'downloading');

        // 检查本地是否已缓存
        const cacheInfo = await unifiedCacheService.getCacheInfo(url);
        if (cacheInfo.isCached) {
          result.skipped++;
          result.results.push({ success: true, url, error: '已缓存' });
          continue;
        }

        // 下载并缓存
        const cachedUrl = await this.downloadAndCacheMediaByUrl(url);
        if (cachedUrl) {
          result.succeeded++;
          result.results.push({ success: true, url });
        } else {
          result.failed++;
          result.results.push({ success: false, url, error: '下载失败' });
        }
      }
    } catch (error) {
      logError('downloadAllRemoteMedia failed', error instanceof Error ? error : new Error(String(error)));
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * 刷新同步状态（从远程获取最新状态）
   */
  async refreshSyncStatus(): Promise<void> {
    try {
      const syncedUrls = await this.getRemoteSyncedUrls();
      
      // 重置缓存
      this.statusCache = {};
      
      for (const url of syncedUrls) {
        this.statusCache[url] = {
          status: 'synced',
          syncedAt: Date.now(),
        };
      }

      await this.saveStatusCache();
    } catch (error) {
      logError('Refresh failed', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 删除已同步的媒体（基于 URL）
   */
  async deleteSyncedMedia(url: string): Promise<boolean> {
    try {
      const filename = `media_${encodeUrlToFilename(url)}.json`;
      await gitHubApiService.deleteGistFiles([filename]);

      // 注意：不再更新 manifest.syncedMedia，因为现在使用分片系统的 fileIndex
      // 媒体删除现在应该通过 shardSyncService.softDeleteMedia 进行

      // 更新本地缓存
      delete this.statusCache[url];
      await this.saveStatusCache();

      return true;
    } catch (error) {
      logError('Delete failed', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }
}

/** 媒体同步服务单例 */
export const mediaSyncService = new MediaSyncService();
