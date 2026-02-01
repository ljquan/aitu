/**
 * 媒体同步服务
 * 负责选择性同步任务产物（图片/视频）
 */

import { gitHubApiService, GitHubApiError } from './github-api-service';
import { unifiedCacheService } from '../unified-cache-service';
import { swTaskQueueService } from '../sw-task-queue-service';
import { kvStorageService } from '../kv-storage-service';
import { DRAWNIX_DEVICE_ID_KEY } from '../../constants/storage';
import { Task, TaskType, TaskStatus } from '../../types/task.types';
import {
  MediaSyncStatus,
  MediaSyncResult,
  BatchMediaSyncResult,
  SyncedMedia,
  MAX_MEDIA_SIZE,
  SYNC_FILES,
  SyncManifest,
} from './types';

/** 媒体同步状态存储键 */
const MEDIA_SYNC_STATUS_KEY = 'github_media_sync_status';

/** 媒体同步状态缓存 */
interface MediaSyncStatusCache {
  [taskId: string]: {
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

/**
 * 媒体同步服务
 */
class MediaSyncService {
  private statusCache: MediaSyncStatusCache = {};
  private syncingTasks: Set<string> = new Set();

  constructor() {
    this.loadStatusCache();
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
   * 检查任务是否可以同步
   */
  canSync(task: Task): { canSync: boolean; reason?: string } {
    // 检查任务状态
    if (task.status !== TaskStatus.COMPLETED) {
      return { canSync: false, reason: '任务未完成' };
    }

    // 检查任务类型
    if (task.type !== TaskType.IMAGE && task.type !== TaskType.VIDEO) {
      return { canSync: false, reason: '不支持的任务类型' };
    }

    // 检查是否有结果
    if (!task.result?.url) {
      return { canSync: false, reason: '任务没有生成结果' };
    }

    // 检查文件大小
    const size = task.result.size || 0;
    if (size > MAX_MEDIA_SIZE) {
      return {
        canSync: false,
        reason: `文件过大（${formatSize(size)}），最大支持 ${formatSize(MAX_MEDIA_SIZE)}`,
      };
    }

    return { canSync: true };
  }

  /**
   * 获取任务的同步状态
   */
  getTaskSyncStatus(taskId: string): MediaSyncStatus {
    // 检查是否正在同步
    if (this.syncingTasks.has(taskId)) {
      return 'syncing';
    }

    // 检查缓存
    const cached = this.statusCache[taskId];
    if (cached) {
      return cached.status;
    }

    // 检查任务是否可以同步
    const task = swTaskQueueService.getTask(taskId);
    if (!task) {
      return 'not_synced';
    }

    const checkResult = this.canSync(task);
    if (!checkResult.canSync && checkResult.reason?.includes('文件过大')) {
      return 'too_large';
    }

    return 'not_synced';
  }

  /**
   * 同步单个任务的媒体
   */
  async syncTaskMedia(taskId: string): Promise<MediaSyncResult> {
    // 检查是否已在同步
    if (this.syncingTasks.has(taskId)) {
      return { success: false, taskId, error: '正在同步中' };
    }

    // 获取任务
    const task = swTaskQueueService.getTask(taskId);
    if (!task) {
      return { success: false, taskId, error: '任务不存在' };
    }

    // 检查是否可以同步
    const checkResult = this.canSync(task);
    if (!checkResult.canSync) {
      return { success: false, taskId, error: checkResult.reason };
    }

    this.syncingTasks.add(taskId);

    try {
      // 从缓存获取媒体数据
      const mediaUrl = task.result!.url;
      const blob = await unifiedCacheService.getCachedBlob(mediaUrl);
      
      if (!blob) {
        throw new Error('无法获取媒体文件');
      }

      // 转换为 Base64
      const base64Data = await blobToBase64(blob);

      // 构建同步数据
      const syncedMedia: SyncedMedia = {
        taskId,
        type: task.type === TaskType.VIDEO ? 'video' : 'image',
        prompt: task.params?.prompt || '',
        model: task.params?.model || '',
        params: task.params || {},
        mimeType: task.result!.format || blob.type,
        originalSize: task.result!.size || blob.size,
        base64Data,
        createdAt: task.createdAt,
        syncedAt: Date.now(),
        syncedFromDevice: getDeviceId(),
      };

      // 上传到 Gist
      const filename = SYNC_FILES.mediaFile(taskId);
      const content = JSON.stringify(syncedMedia, null, 2);

      await gitHubApiService.updateGistFiles({
        [filename]: content,
      });

      // 更新 manifest 中的媒体索引
      await this.updateManifestMediaIndex(taskId, syncedMedia);

      // 更新缓存状态
      this.statusCache[taskId] = {
        status: 'synced',
        syncedAt: Date.now(),
      };
      await this.saveStatusCache();

      return { success: true, taskId };
    } catch (error) {
      console.error('[MediaSyncService] Sync failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : '同步失败';
      
      // 更新缓存状态
      this.statusCache[taskId] = {
        status: 'error',
        error: errorMessage,
      };
      await this.saveStatusCache();

      return { success: false, taskId, error: errorMessage };
    } finally {
      this.syncingTasks.delete(taskId);
    }
  }

  /**
   * 更新 manifest 中的媒体索引
   */
  private async updateManifestMediaIndex(
    taskId: string,
    media: SyncedMedia
  ): Promise<void> {
    try {
      const manifestContent = await gitHubApiService.getGistFileContent(SYNC_FILES.MANIFEST);
      if (!manifestContent) {
        return;
      }

      const manifest: SyncManifest = JSON.parse(manifestContent);
      manifest.syncedMedia[taskId] = {
        taskId,
        type: media.type,
        size: media.originalSize,
        syncedAt: media.syncedAt,
      };
      manifest.updatedAt = Date.now();

      await gitHubApiService.updateGistFiles({
        [SYNC_FILES.MANIFEST]: JSON.stringify(manifest, null, 2),
      });
    } catch (error) {
      console.warn('[MediaSyncService] Failed to update manifest:', error);
    }
  }

  /**
   * 从云端下载媒体
   */
  async downloadTaskMedia(taskId: string): Promise<Blob | null> {
    try {
      const filename = SYNC_FILES.mediaFile(taskId);
      const content = await gitHubApiService.getGistFileContent(filename);
      
      if (!content) {
        return null;
      }

      const syncedMedia: SyncedMedia = JSON.parse(content);
      return base64ToBlob(syncedMedia.base64Data, syncedMedia.mimeType);
    } catch (error) {
      console.error('[MediaSyncService] Download failed:', error);
      return null;
    }
  }

  /**
   * 从云端下载媒体并缓存到本地（使用自动生成的 URL）
   * @deprecated 使用 downloadAndCacheMediaToUrl 代替
   */
  async downloadAndCacheMedia(taskId: string): Promise<string | null> {
    try {
      const filename = SYNC_FILES.mediaFile(taskId);
      const content = await gitHubApiService.getGistFileContent(filename);
      
      if (!content) {
        return null;
      }

      const syncedMedia: SyncedMedia = JSON.parse(content);
      const blob = base64ToBlob(syncedMedia.base64Data, syncedMedia.mimeType);
      
      if (!blob || blob.size === 0) {
        return null;
      }

      // 生成本地缓存路径
      const extension = syncedMedia.type === 'video' ? 'mp4' : 'png';
      const cacheUrl = `/__aitu_cache__/${syncedMedia.type}/synced-${taskId}.${extension}`;
      
      // 缓存到本地（仅 Cache Storage，不需要 IndexedDB 元数据）
      await unifiedCacheService.cacheToCacheStorageOnly(cacheUrl, blob);
      
      console.log(`[MediaSyncService] Cached media for task ${taskId} at ${cacheUrl}`);
      return cacheUrl;
    } catch (error) {
      console.error('[MediaSyncService] Download and cache failed:', error);
      return null;
    }
  }

  /**
   * 从云端下载媒体并缓存到指定 URL
   * @param taskId 任务 ID
   * @param targetUrl 目标缓存 URL（保持任务原始 URL 不变）
   */
  async downloadAndCacheMediaToUrl(taskId: string, targetUrl: string): Promise<string | null> {
    try {
      const filename = SYNC_FILES.mediaFile(taskId);
      const content = await gitHubApiService.getGistFileContent(filename);
      
      if (!content) {
        return null;
      }

      const syncedMedia: SyncedMedia = JSON.parse(content);
      const blob = base64ToBlob(syncedMedia.base64Data, syncedMedia.mimeType);
      
      if (!blob || blob.size === 0) {
        return null;
      }

      // 缓存到指定的 URL 位置（仅 Cache Storage）
      await unifiedCacheService.cacheToCacheStorageOnly(targetUrl, blob);
      
      console.log(`[MediaSyncService] Cached media for task ${taskId} at ${targetUrl}`);
      return targetUrl;
    } catch (error) {
      console.error('[MediaSyncService] Download and cache to URL failed:', error);
      return null;
    }
  }

  /**
   * 下载所有已同步的媒体并缓存到本地
   * 优先从 Gist 媒体文件下载，否则从原始 URL 下载
   */
  async downloadAllSyncedMedia(
    onProgress?: (current: number, total: number, taskId: string) => void
  ): Promise<{ succeeded: number; failed: number; results: Array<{ taskId: string; success: boolean; url?: string; error?: string }> }> {
    const result = {
      succeeded: 0,
      failed: 0,
      results: [] as Array<{ taskId: string; success: boolean; url?: string; error?: string }>,
    };

    try {
      // 获取所有需要下载媒体的任务
      const allTasks = swTaskQueueService.getAllTasks();
      const tasksNeedingMedia = allTasks.filter(task => {
        // 只处理已完成的图片/视频任务
        if (task.status !== TaskStatus.COMPLETED) return false;
        if (task.type !== TaskType.IMAGE && task.type !== TaskType.VIDEO) return false;
        // 检查是否有本地缓存 URL 且标记为需要下载
        if (!task.result?.url?.startsWith('/__aitu_cache__/')) return false;
        // 有 needsMediaDownload 标记的需要下载
        if ((task.result as any)?.needsMediaDownload) return true;
        return false;
      });

      console.log(`[MediaSyncService] Found ${tasksNeedingMedia.length} tasks needing media download`);
      
      for (let i = 0; i < tasksNeedingMedia.length; i++) {
        const task = tasksNeedingMedia[i];
        onProgress?.(i + 1, tasksNeedingMedia.length, task.id);

        const url = await this.downloadAndCacheMediaForTask(task);
        if (url) {
          result.succeeded++;
          result.results.push({ taskId: task.id, success: true, url });
          // 下载成功后，清除 needsMediaDownload 标记
          await this.clearNeedsMediaDownloadFlag(task.id);
        } else {
          result.failed++;
          result.results.push({ taskId: task.id, success: false, error: '下载失败' });
        }
      }
    } catch (error) {
      console.error('[MediaSyncService] Download all failed:', error);
    }

    return result;
  }

  /**
   * 清除任务的 needsMediaDownload 标记
   * 注意：由于 swTaskQueueService 没有公开的 updateTask 方法，
   * 这个标记会在任务数据中保留，但不影响功能（数据已缓存）
   */
  private clearNeedsMediaDownloadFlag(taskId: string): void {
    // 标记清除只用于日志记录，实际数据已在 Cache Storage 中
    console.log(`[MediaSyncService] Media downloaded for task ${taskId}, needsMediaDownload flag no longer relevant`);
  }

  /**
   * 为任务下载并缓存媒体
   * 1. 优先从 Gist 的 media_{taskId}.json 下载（如果存在）
   * 2. 媒体数据缓存到任务的原始 URL 位置
   */
  private async downloadAndCacheMediaForTask(task: Task): Promise<string | null> {
    const taskId = task.id;
    // 使用任务的原始 URL 作为缓存路径（保持 URL 不变）
    const cacheUrl = task.result?.url;
    
    if (!cacheUrl) {
      console.warn(`[MediaSyncService] Task ${taskId} has no result URL`);
      return null;
    }

    try {
      // 1. 尝试从 Gist 媒体文件下载，并缓存到原始 URL 位置
      const gistUrl = await this.downloadAndCacheMediaToUrl(taskId, cacheUrl);
      if (gistUrl) {
        console.log(`[MediaSyncService] Downloaded media from Gist for task ${taskId} to ${cacheUrl}`);
        return gistUrl;
      }

      // 2. 尝试从远程 URL 下载（如果有原始外部 URL）
      const externalUrl = (task.result as any)?.externalUrl;
      if (externalUrl) {
        console.log(`[MediaSyncService] Trying to download from externalUrl for task ${taskId}:`, externalUrl);
        const blob = await this.fetchMediaFromUrl(externalUrl);
        if (blob && blob.size > 0) {
          await unifiedCacheService.cacheToCacheStorageOnly(cacheUrl, blob);
          console.log(`[MediaSyncService] Cached media from externalUrl for task ${taskId}`);
          return cacheUrl;
        }
      }

      console.warn(`[MediaSyncService] No media source available for task ${taskId}`);
      return null;
    } catch (error) {
      console.error(`[MediaSyncService] Failed to download media for task ${taskId}:`, error);
      return null;
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
        console.warn(`[MediaSyncService] Failed to fetch media: ${response.status}`);
        return null;
      }
      
      return await response.blob();
    } catch (error) {
      console.error('[MediaSyncService] Fetch media failed:', error);
      return null;
    }
  }

  /**
   * 批量同步多个任务
   */
  async syncMultipleTasks(
    taskIds: string[],
    onProgress?: (current: number, total: number, taskId: string) => void
  ): Promise<BatchMediaSyncResult> {
    const result: BatchMediaSyncResult = {
      succeeded: 0,
      failed: 0,
      skipped: 0,
      results: [],
    };

    for (let i = 0; i < taskIds.length; i++) {
      const taskId = taskIds[i];
      onProgress?.(i + 1, taskIds.length, taskId);

      // 检查是否可以同步
      const task = swTaskQueueService.getTask(taskId);
      if (!task) {
        result.skipped++;
        result.results.push({ success: false, taskId, error: '任务不存在' });
        continue;
      }

      const checkResult = this.canSync(task);
      if (!checkResult.canSync) {
        if (checkResult.reason?.includes('文件过大')) {
          result.skipped++;
        } else {
          result.failed++;
        }
        result.results.push({ success: false, taskId, error: checkResult.reason });
        continue;
      }

      // 执行同步
      const syncResult = await this.syncTaskMedia(taskId);
      result.results.push(syncResult);

      if (syncResult.success) {
        result.succeeded++;
      } else {
        result.failed++;
      }
    }

    return result;
  }

  /**
   * 同步本地上传的素材
   * 与 syncTaskMedia 类似，但处理没有 task 的本地素材
   */
  async syncAssetMedia(asset: {
    id: string;
    url: string;
    type: 'image' | 'video';
    name: string;
    mimeType: string;
    size?: number;
  }): Promise<MediaSyncResult> {
    const assetId = asset.id;
    
    // 检查是否已在同步
    if (this.syncingTasks.has(assetId)) {
      return { success: false, taskId: assetId, error: '正在同步中' };
    }

    // 检查文件大小
    const size = asset.size || 0;
    if (size > MAX_MEDIA_SIZE) {
      return {
        success: false,
        taskId: assetId,
        error: `文件过大（${formatSize(size)}），最大支持 ${formatSize(MAX_MEDIA_SIZE)}`,
      };
    }

    this.syncingTasks.add(assetId);

    try {
      // 从缓存获取媒体数据
      const blob = await unifiedCacheService.getCachedBlob(asset.url);
      
      if (!blob) {
        throw new Error('无法获取媒体文件');
      }

      // 转换为 Base64
      const base64Data = await blobToBase64(blob);

      // 构建同步数据（使用 asset 格式，与 task 格式兼容）
      const syncedMedia: SyncedMedia = {
        taskId: assetId, // 使用 asset id 作为 taskId
        type: asset.type,
        prompt: '', // 本地上传没有提示词
        model: 'local_upload', // 标记为本地上传
        params: { name: asset.name }, // 保存文件名
        mimeType: asset.mimeType || blob.type,
        originalSize: asset.size || blob.size,
        base64Data,
        createdAt: Date.now(),
        syncedAt: Date.now(),
        syncedFromDevice: getDeviceId(),
      };

      // 上传到 Gist
      const filename = SYNC_FILES.mediaFile(assetId);
      const content = JSON.stringify(syncedMedia, null, 2);

      await gitHubApiService.updateGistFiles({
        [filename]: content,
      });

      // 更新 manifest 中的媒体索引
      await this.updateManifestMediaIndex(assetId, syncedMedia);

      // 更新缓存状态
      this.statusCache[assetId] = {
        status: 'synced',
        syncedAt: Date.now(),
      };
      await this.saveStatusCache();

      return { success: true, taskId: assetId };
    } catch (error) {
      console.error('[MediaSyncService] Sync asset failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : '同步失败';
      
      // 更新缓存状态
      this.statusCache[assetId] = {
        status: 'error',
        error: errorMessage,
      };
      await this.saveStatusCache();

      return { success: false, taskId: assetId, error: errorMessage };
    } finally {
      this.syncingTasks.delete(assetId);
    }
  }

  /**
   * 批量同步本地上传的素材
   */
  async syncMultipleAssets(
    assets: Array<{
      id: string;
      url: string;
      type: 'image' | 'video';
      name: string;
      mimeType: string;
      size?: number;
    }>,
    onProgress?: (current: number, total: number, assetId: string) => void
  ): Promise<BatchMediaSyncResult> {
    const result: BatchMediaSyncResult = {
      succeeded: 0,
      failed: 0,
      skipped: 0,
      results: [],
    };

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      onProgress?.(i + 1, assets.length, asset.id);

      // 检查文件大小
      const size = asset.size || 0;
      if (size > MAX_MEDIA_SIZE) {
        result.skipped++;
        result.results.push({
          success: false,
          taskId: asset.id,
          error: `文件过大（${formatSize(size)}）`,
        });
        continue;
      }

      // 执行同步
      const syncResult = await this.syncAssetMedia(asset);
      result.results.push(syncResult);

      if (syncResult.success) {
        result.succeeded++;
      } else {
        result.failed++;
      }
    }

    return result;
  }

  /**
   * 获取所有已同步的媒体列表
   */
  async getSyncedMediaList(): Promise<Array<{
    taskId: string;
    type: 'image' | 'video';
    size: number;
    syncedAt: number;
  }>> {
    try {
      const manifestContent = await gitHubApiService.getGistFileContent(SYNC_FILES.MANIFEST);
      if (!manifestContent) {
        return [];
      }

      const manifest: SyncManifest = JSON.parse(manifestContent);
      return Object.values(manifest.syncedMedia);
    } catch (error) {
      console.error('[MediaSyncService] Failed to get synced media list:', error);
      return [];
    }
  }

  /**
   * 删除已同步的媒体
   */
  async deleteSyncedMedia(taskId: string): Promise<boolean> {
    try {
      const filename = SYNC_FILES.mediaFile(taskId);
      await gitHubApiService.deleteGistFiles([filename]);

      // 更新 manifest
      const manifestContent = await gitHubApiService.getGistFileContent(SYNC_FILES.MANIFEST);
      if (manifestContent) {
        const manifest: SyncManifest = JSON.parse(manifestContent);
        delete manifest.syncedMedia[taskId];
        manifest.updatedAt = Date.now();

        await gitHubApiService.updateGistFiles({
          [SYNC_FILES.MANIFEST]: JSON.stringify(manifest, null, 2),
        });
      }

      // 更新本地缓存
      delete this.statusCache[taskId];
      await this.saveStatusCache();

      return true;
    } catch (error) {
      console.error('[MediaSyncService] Delete failed:', error);
      return false;
    }
  }

  /**
   * 刷新同步状态（从远程获取最新状态）
   */
  async refreshSyncStatus(): Promise<void> {
    try {
      const syncedList = await this.getSyncedMediaList();
      
      // 重置缓存
      this.statusCache = {};
      
      for (const item of syncedList) {
        this.statusCache[item.taskId] = {
          status: 'synced',
          syncedAt: item.syncedAt,
        };
      }

      await this.saveStatusCache();
    } catch (error) {
      console.error('[MediaSyncService] Refresh failed:', error);
    }
  }

  /**
   * 获取可同步的任务列表
   */
  getSyncableTasks(): Array<{
    task: Task;
    status: MediaSyncStatus;
    canSync: boolean;
    reason?: string;
  }> {
    const allTasks = swTaskQueueService.getAllTasks();
    const result: Array<{
      task: Task;
      status: MediaSyncStatus;
      canSync: boolean;
      reason?: string;
    }> = [];

    for (const task of allTasks) {
      // 只处理图片和视频任务
      if (task.type !== TaskType.IMAGE && task.type !== TaskType.VIDEO) {
        continue;
      }

      // 只处理已完成的任务
      if (task.status !== TaskStatus.COMPLETED) {
        continue;
      }

      const checkResult = this.canSync(task);
      const status = this.getTaskSyncStatus(task.id);

      result.push({
        task,
        status,
        canSync: checkResult.canSync,
        reason: checkResult.reason,
      });
    }

    // 按创建时间倒序排列
    result.sort((a, b) => b.task.createdAt - a.task.createdAt);

    return result;
  }
}

/** 媒体同步服务单例 */
export const mediaSyncService = new MediaSyncService();
