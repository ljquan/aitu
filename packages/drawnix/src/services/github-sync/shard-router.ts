/**
 * 分片路由器
 * 负责管理文件到分片的映射，自动创建新分片
 */

import { maskId } from '@aitu/utils';
import { gitHubApiService, GitHubApiError } from './github-api-service';
import { kvStorageService } from '../kv-storage-service';
import { cryptoService } from './crypto-service';
import { syncPasswordService } from './sync-password-service';
import { logDebug, logInfo, logSuccess, logWarning, logError } from './sync-log-service';
import {
  MasterIndex,
  ShardInfo,
  ShardManifest,
  FileIndexEntry,
  ShardAllocation,
  BatchShardAllocation,
  SHARD_CONFIG,
  SHARD_FILES,
  SHARD_VERSION,
  GIST_DESCRIPTION_PREFIX,
  createEmptyMasterIndex,
  createShardInfo,
  createShardManifest,
  shardHasCapacity,
  updateMasterIndexStats,
  generateShardAlias,
} from './shard-types';

/** 主索引本地存储键 */
const MASTER_INDEX_KEY = 'github_sync_master_index';

/** 主 Gist ID 本地存储键 */
const MASTER_GIST_ID_KEY = 'github_sync_master_gist_id';

/**
 * 分片路由器
 */
class ShardRouter {
  private masterIndex: MasterIndex | null = null;
  private masterGistId: string | null = null;
  private initialized = false;

  /**
   * 初始化路由器
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 从本地存储加载主索引
    this.masterIndex = await kvStorageService.get<MasterIndex>(MASTER_INDEX_KEY);
    this.masterGistId = await kvStorageService.get<string>(MASTER_GIST_ID_KEY);
    this.initialized = true;

    logDebug('ShardRouter initialized', {
      hasMasterIndex: !!this.masterIndex,
      masterGistId: this.masterGistId ? maskId(this.masterGistId) : null,
      shardCount: this.masterIndex ? Object.keys(this.masterIndex.shards).length : 0,
    });
  }

  /**
   * 获取主索引
   */
  getMasterIndex(): MasterIndex | null {
    return this.masterIndex;
  }

  /**
   * 获取主 Gist ID
   */
  getMasterGistId(): string | null {
    return this.masterGistId;
  }

  /**
   * 设置主 Gist ID
   */
  async setMasterGistId(gistId: string): Promise<void> {
    this.masterGistId = gistId;
    await kvStorageService.set(MASTER_GIST_ID_KEY, gistId);
  }

  /**
   * 检查是否已配置分片
   */
  isConfigured(): boolean {
    return !!this.masterIndex && !!this.masterGistId;
  }

  /**
   * 从远程加载主索引
   */
  async loadMasterIndexFromRemote(): Promise<MasterIndex | null> {
    if (!this.masterGistId) {
      logDebug('No master gist ID configured');
      return null;
    }

    try {
      const content = await gitHubApiService.getGistFileContent(
        SHARD_FILES.MASTER_INDEX,
        this.masterGistId
      );

      if (!content) {
        logDebug('No master index found in remote');
        return null;
      }

      const index = JSON.parse(content) as MasterIndex;
      this.masterIndex = index;
      await this.saveMasterIndexLocally();

      logDebug('Loaded master index from remote', {
        shards: Object.keys(index.shards).length,
        files: Object.keys(index.fileIndex).length,
      });

      return index;
    } catch (error) {
      logError('Failed to load master index', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * 保存主索引到本地
   */
  private async saveMasterIndexLocally(): Promise<void> {
    if (this.masterIndex) {
      await kvStorageService.set(MASTER_INDEX_KEY, this.masterIndex);
    }
  }

  /**
   * 保存主索引到远程
   */
  async saveMasterIndexToRemote(): Promise<void> {
    if (!this.masterIndex || !this.masterGistId) {
      throw new Error('Master index or gist ID not configured');
    }

    updateMasterIndexStats(this.masterIndex);

    await gitHubApiService.updateGistFiles(
      {
        [SHARD_FILES.MASTER_INDEX]: JSON.stringify(this.masterIndex, null, 2),
      },
      this.masterGistId
    );

    await this.saveMasterIndexLocally();

    logDebug('Saved master index to remote');
  }

  /**
   * 创建或初始化主索引
   */
  async initializeMasterIndex(appVersion: string): Promise<MasterIndex> {
    // 如果已有主索引，直接返回
    if (this.masterIndex) {
      return this.masterIndex;
    }

    // 创建新的主索引
    this.masterIndex = createEmptyMasterIndex(appVersion);

    // 如果没有主 Gist，需要在调用 saveMasterIndexToRemote 之前创建
    if (!this.masterGistId) {
      throw new Error('Master gist ID must be set before initializing index');
    }

    await this.saveMasterIndexLocally();

    logDebug('Initialized new master index');
    return this.masterIndex;
  }

  /**
   * 获取文件所在的分片
   */
  getShardForFile(url: string): ShardInfo | null {
    if (!this.masterIndex) {
      return null;
    }

    const entry = this.masterIndex.fileIndex[url];
    if (!entry) {
      return null;
    }

    return this.masterIndex.shards[entry.shardId] || null;
  }

  /**
   * 获取文件索引条目
   */
  getFileIndexEntry(url: string): FileIndexEntry | null {
    if (!this.masterIndex) {
      return null;
    }
    return this.masterIndex.fileIndex[url] || null;
  }

  /**
   * 检查文件是否已同步
   */
  isFileSynced(url: string): boolean {
    return this.getFileIndexEntry(url) !== null;
  }

  /**
   * 查找有空间的活跃分片
   */
  private findActiveShard(fileSize: number): ShardInfo | null {
    if (!this.masterIndex) {
      return null;
    }

    // 按已用容量排序，优先填满接近满的分片
    const activeShards = Object.values(this.masterIndex.shards)
      .filter(s => s.status === 'active')
      .sort((a, b) => b.fileCount - a.fileCount);

    for (const shard of activeShards) {
      if (shardHasCapacity(shard, fileSize)) {
        return shard;
      }
    }

    return null;
  }

  /**
   * 创建新分片
   */
  async createShard(alias?: string): Promise<ShardInfo> {
    if (!this.masterIndex || !this.masterGistId) {
      throw new Error('Master index not initialized');
    }

    const order = Object.keys(this.masterIndex.shards).length + 1;
    const shardAlias = alias || generateShardAlias(order);

    // 检查别名唯一性
    if (this.masterIndex.shards[shardAlias]) {
      throw new Error(`Shard alias "${shardAlias}" already exists`);
    }

    // 创建新的 Gist 作为分片
    const description = `${GIST_DESCRIPTION_PREFIX.SHARD} #${order} (${shardAlias})`;
    const shardManifest = createShardManifest(shardAlias, this.masterGistId);

    // 获取密码并加密 shard-manifest
    const password = await syncPasswordService.getPassword();
    const manifestJson = JSON.stringify(shardManifest, null, 2);
    const encryptedManifest = await cryptoService.encrypt(manifestJson, this.masterGistId, password || undefined);

    const gist = await gitHubApiService.createSyncGist({
      [SHARD_FILES.SHARD_MANIFEST]: encryptedManifest,
    });

    // 更新 Gist 描述（createSyncGist 使用默认描述，需要更新）
    // GitHub API 允许在 PATCH 中更新描述
    try {
      await gitHubApiService.updateGistFiles(
        {
          // 必须包含至少一个文件更新，否则只能单独调用描述更新 API
          [SHARD_FILES.SHARD_MANIFEST]: encryptedManifest,
        },
        gist.id
      );
    } catch (error) {
      logWarning('Failed to update shard description', { error: String(error) });
    }

    // 创建分片信息
    const shardInfo = createShardInfo(gist.id, shardAlias, order);
    shardInfo.description = description;

    // 添加到主索引
    this.masterIndex.shards[shardAlias] = shardInfo;
    updateMasterIndexStats(this.masterIndex);

    logDebug('Created new shard', {
      alias: shardAlias,
      gistId: maskId(gist.id),
      order,
    });

    return shardInfo;
  }

  /**
   * 分配单个文件到分片（自动创建新分片）
   */
  async allocateFile(fileSize: number): Promise<ShardAllocation> {
    if (!this.masterIndex) {
      throw new Error('Master index not initialized');
    }

    // 查找有空间的活跃分片
    const activeShard = this.findActiveShard(fileSize);
    if (activeShard) {
      return { shard: activeShard, isNewShard: false };
    }

    // 没有可用分片，创建新分片
    const newShard = await this.createShard();
    return { shard: newShard, isNewShard: true };
  }

  /**
   * 批量分配文件到分片（高性能）
   */
  async allocateFiles(
    files: Array<{ url: string; size: number }>
  ): Promise<BatchShardAllocation> {
    if (!this.masterIndex) {
      throw new Error('Master index not initialized');
    }

    const allocations = new Map<string, ShardInfo>();
    const newShards: ShardInfo[] = [];

    // 模拟分配，计算需要创建多少分片
    let currentShard: ShardInfo | null = null;
    let currentShardFileCount = 0;
    let currentShardSize = 0;

    // 先获取当前活跃分片的状态
    const activeShards = Object.values(this.masterIndex.shards)
      .filter(s => s.status === 'active')
      .sort((a, b) => b.fileCount - a.fileCount);

    if (activeShards.length > 0) {
      currentShard = activeShards[0];
      currentShardFileCount = currentShard.fileCount;
      currentShardSize = currentShard.totalSize;
    }

    for (const file of files) {
      // 检查是否已有分配
      const existing = this.masterIndex.fileIndex[file.url];
      if (existing) {
        const shard = this.masterIndex.shards[existing.shardId];
        if (shard) {
          allocations.set(file.url, shard);
          continue;
        }
      }

      // 检查当前分片是否有空间
      const needNewShard =
        !currentShard ||
        currentShardFileCount >= SHARD_CONFIG.FILE_LIMIT ||
        currentShardSize + file.size > SHARD_CONFIG.SIZE_LIMIT;

      if (needNewShard) {
        // 创建新分片
        const newShard = await this.createShard();
        newShards.push(newShard);
        currentShard = newShard;
        currentShardFileCount = 0;
        currentShardSize = 0;
      }

      allocations.set(file.url, currentShard!);
      currentShardFileCount++;
      currentShardSize += file.size;
    }

    logDebug('Batch allocation completed', {
      totalFiles: files.length,
      newShardsCreated: newShards.length,
    });

    return { allocations, newShards };
  }

  /**
   * 注册文件到索引
   */
  registerFile(
    url: string,
    shardId: string,
    filename: string,
    size: number,
    type: 'image' | 'video'
  ): void {
    if (!this.masterIndex) {
      throw new Error('Master index not initialized');
    }

    const entry: FileIndexEntry = {
      shardId,
      filename,
      size,
      type,
      syncedAt: Date.now(),
    };

    this.masterIndex.fileIndex[url] = entry;

    // 更新分片统计
    const shard = this.masterIndex.shards[shardId];
    if (shard) {
      shard.fileCount++;
      shard.totalSize += size;
      shard.updatedAt = Date.now();

      // 检查是否已满
      if (shard.fileCount >= SHARD_CONFIG.FILE_LIMIT) {
        shard.status = 'full';
        logDebug('Shard is now full', { shardId });
      }
    }
  }

  /**
   * 从索引中移除文件
   */
  unregisterFile(url: string): FileIndexEntry | null {
    if (!this.masterIndex) {
      return null;
    }

    const entry = this.masterIndex.fileIndex[url];
    if (!entry) {
      return null;
    }

    delete this.masterIndex.fileIndex[url];

    // 更新分片统计
    const shard = this.masterIndex.shards[entry.shardId];
    if (shard) {
      shard.fileCount = Math.max(0, shard.fileCount - 1);
      shard.totalSize = Math.max(0, shard.totalSize - entry.size);
      shard.updatedAt = Date.now();

      // 如果从满变为有空间，重新激活
      if (shard.status === 'full' && shard.fileCount < SHARD_CONFIG.FILE_LIMIT) {
        shard.status = 'active';
        logDebug('Shard reactivated', { shardId: entry.shardId });
      }
    }

    return entry;
  }

  /**
   * 获取分片信息
   */
  getShard(shardId: string): ShardInfo | null {
    if (!this.masterIndex) {
      return null;
    }
    return this.masterIndex.shards[shardId] || null;
  }

  /**
   * 获取所有分片
   */
  getAllShards(): ShardInfo[] {
    if (!this.masterIndex) {
      return [];
    }
    return Object.values(this.masterIndex.shards);
  }

  /**
   * 更新分片别名
   */
  async updateShardAlias(shardId: string, newAlias: string): Promise<void> {
    if (!this.masterIndex) {
      throw new Error('Master index not initialized');
    }

    const shard = this.masterIndex.shards[shardId];
    if (!shard) {
      throw new Error(`Shard "${shardId}" not found`);
    }

    // 检查新别名唯一性
    if (shardId !== newAlias && this.masterIndex.shards[newAlias]) {
      throw new Error(`Alias "${newAlias}" already exists`);
    }

    // 更新所有文件索引中的 shardId
    for (const url of Object.keys(this.masterIndex.fileIndex)) {
      const entry = this.masterIndex.fileIndex[url];
      if (entry.shardId === shardId) {
        entry.shardId = newAlias;
      }
    }

    // 更新 tombstones 中的 shardId
    for (const tombstone of this.masterIndex.tombstones) {
      if (tombstone.shardId === shardId) {
        tombstone.shardId = newAlias;
      }
    }

    // 更新分片注册表
    delete this.masterIndex.shards[shardId];
    shard.alias = newAlias;
    shard.description = `${GIST_DESCRIPTION_PREFIX.SHARD} #${shard.order} (${newAlias})`;
    shard.updatedAt = Date.now();
    this.masterIndex.shards[newAlias] = shard;

    logDebug('Updated shard alias', { old: shardId, new: newAlias });
  }

  /**
   * 归档分片（标记为只读）
   */
  archiveShard(shardId: string): void {
    if (!this.masterIndex) {
      throw new Error('Master index not initialized');
    }

    const shard = this.masterIndex.shards[shardId];
    if (!shard) {
      throw new Error(`Shard "${shardId}" not found`);
    }

    shard.status = 'archived';
    shard.updatedAt = Date.now();

    logDebug('Archived shard', { shardId });
  }

  /**
   * 重新激活分片
   */
  reactivateShard(shardId: string): void {
    if (!this.masterIndex) {
      throw new Error('Master index not initialized');
    }

    const shard = this.masterIndex.shards[shardId];
    if (!shard) {
      throw new Error(`Shard "${shardId}" not found`);
    }

    if (shard.fileCount >= SHARD_CONFIG.FILE_LIMIT) {
      shard.status = 'full';
    } else {
      shard.status = 'active';
    }
    shard.updatedAt = Date.now();

    logDebug('Reactivated shard', { shardId });
  }

  /**
   * 获取分片统计信息
   */
  getStats(): {
    totalShards: number;
    activeShards: number;
    fullShards: number;
    archivedShards: number;
    totalFiles: number;
    totalSize: number;
  } {
    if (!this.masterIndex) {
      return {
        totalShards: 0,
        activeShards: 0,
        fullShards: 0,
        archivedShards: 0,
        totalFiles: 0,
        totalSize: 0,
      };
    }

    const shards = Object.values(this.masterIndex.shards);
    return {
      totalShards: shards.length,
      activeShards: shards.filter(s => s.status === 'active').length,
      fullShards: shards.filter(s => s.status === 'full').length,
      archivedShards: shards.filter(s => s.status === 'archived').length,
      totalFiles: Object.keys(this.masterIndex.fileIndex).length,
      totalSize: shards.reduce((sum, s) => sum + s.totalSize, 0),
    };
  }

  /**
   * 清除本地缓存
   */
  async clearLocalCache(): Promise<void> {
    this.masterIndex = null;
    this.masterGistId = null;
    this.initialized = false;
    await kvStorageService.delete(MASTER_INDEX_KEY);
    await kvStorageService.delete(MASTER_GIST_ID_KEY);
    logDebug('Cleared local cache');
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.masterIndex = null;
    this.masterGistId = null;
    this.initialized = false;
  }
}

/** 分片路由器单例 */
export const shardRouter = new ShardRouter();
