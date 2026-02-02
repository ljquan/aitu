/**
 * 分片迁移工具
 * 从 v1（单 Gist）迁移到 v2（分片 Gist）
 */

import { maskId } from '@aitu/utils';
import { gitHubApiService } from './github-api-service';
import { shardRouter } from './shard-router';
import { shardSyncService } from './shard-sync-service';
import { shardedMediaSyncAdapter } from './sharded-media-sync-adapter';
import {
  MasterIndex,
  ShardInfo,
  MigrationResult,
  MigrationProgressCallback,
  SHARD_CONFIG,
  SHARD_FILES,
  SHARD_VERSION,
  createEmptyMasterIndex,
  createShardInfo,
  generateShardAlias,
} from './shard-types';
import {
  SyncManifest,
  MediaSyncInfo,
  SYNC_FILES,
  encodeUrlToFilename,
  decodeFilenameToUrl,
} from './types';

/** 应用版本 */
const APP_VERSION = '0.5.0';

/**
 * 迁移状态
 */
interface MigrationState {
  phase: 'idle' | 'analyzing' | 'creating_index' | 'migrating' | 'verifying' | 'completed' | 'failed';
  progress: number;
  total: number;
  currentItem?: string;
  error?: string;
}

/**
 * 分片迁移服务
 */
class ShardMigrationService {
  private state: MigrationState = {
    phase: 'idle',
    progress: 0,
    total: 0,
  };

  /**
   * 获取当前迁移状态
   */
  getState(): MigrationState {
    return { ...this.state };
  }

  /**
   * 分析现有数据，评估迁移需求
   */
  async analyzeMigration(masterGistId: string): Promise<{
    needsMigration: boolean;
    currentMediaCount: number;
    estimatedShards: number;
    totalSize: number;
    mediaFiles: Array<{
      url: string;
      filename: string;
      size: number;
      type: 'image' | 'video';
    }>;
  }> {
    this.state = { phase: 'analyzing', progress: 0, total: 0 };

    try {
      // 获取当前 manifest
      const manifestContent = await gitHubApiService.getGistFileContent(
        SYNC_FILES.MANIFEST,
        masterGistId
      );

      if (!manifestContent) {
        return {
          needsMigration: false,
          currentMediaCount: 0,
          estimatedShards: 0,
          totalSize: 0,
          mediaFiles: [],
        };
      }

      const manifest: SyncManifest = JSON.parse(manifestContent);
      const syncedMedia = manifest.syncedMedia || {};
      const mediaFiles: Array<{
        url: string;
        filename: string;
        size: number;
        type: 'image' | 'video';
      }> = [];

      let totalSize = 0;

      for (const [key, info] of Object.entries(syncedMedia)) {
        // 跳过已删除的
        if (info.deletedAt) {
          continue;
        }

        // 确定 URL 和文件名
        let url: string;
        let filename: string;

        if (info.url) {
          // 使用 URL 作为键
          url = info.url;
          filename = SYNC_FILES.mediaFile(url);
        } else {
          continue;
        }

        mediaFiles.push({
          url,
          filename,
          size: info.size || 0,
          type: info.type,
        });

        totalSize += info.size || 0;
      }

      const currentMediaCount = mediaFiles.length;
      const estimatedShards = Math.ceil(currentMediaCount / SHARD_CONFIG.FILE_LIMIT);
      const needsMigration = currentMediaCount >= 200; // 阈值

      console.log('[ShardMigration] Analysis result:', {
        currentMediaCount,
        estimatedShards,
        totalSize,
        needsMigration,
      });

      return {
        needsMigration,
        currentMediaCount,
        estimatedShards,
        totalSize,
        mediaFiles,
      };
    } catch (error) {
      console.error('[ShardMigration] Analysis failed:', error);
      this.state.phase = 'failed';
      this.state.error = error instanceof Error ? error.message : '分析失败';
      throw error;
    }
  }

  /**
   * 执行迁移
   */
  async migrate(
    masterGistId: string,
    onProgress?: MigrationProgressCallback
  ): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      migratedFiles: 0,
      createdShards: 0,
      warnings: [],
    };

    try {
      // 1. 分析现有数据
      onProgress?.(0, 100, 'analyzing');
      const analysis = await this.analyzeMigration(masterGistId);

      if (!analysis.needsMigration && analysis.currentMediaCount === 0) {
        // 没有数据需要迁移，直接初始化空的分片系统
        await shardedMediaSyncAdapter.setupShardSystem(masterGistId);
        result.success = true;
        return result;
      }

      // 2. 创建主索引
      this.state = { phase: 'creating_index', progress: 0, total: analysis.currentMediaCount };
      onProgress?.(10, 100, 'creating_index');

      await shardRouter.setMasterGistId(masterGistId);
      await shardRouter.initialize();

      // 检查是否已有主索引
      let masterIndex = await shardRouter.loadMasterIndexFromRemote();
      if (!masterIndex) {
        masterIndex = await shardRouter.initializeMasterIndex(APP_VERSION);
      }

      // 3. 创建第一个分片（使用主 Gist 作为第一个分片）
      // 注意：为了向后兼容，主 Gist 同时作为第一个分片
      const firstShardAlias = generateShardAlias(1);
      const firstShard = createShardInfo(masterGistId, firstShardAlias, 1);
      firstShard.description = `Opentu - Media Shard #1 (${firstShardAlias}) - Main`;

      masterIndex.shards[firstShardAlias] = firstShard;
      result.createdShards = 1;

      // 4. 迁移文件索引（不移动实际数据）
      this.state.phase = 'migrating';
      onProgress?.(20, 100, 'migrating');

      let migratedCount = 0;
      const totalFiles = analysis.mediaFiles.length;
      let currentShard = firstShard;
      let currentShardFiles = 0;

      for (const file of analysis.mediaFiles) {
        // 检查当前分片是否已满
        if (currentShardFiles >= SHARD_CONFIG.FILE_LIMIT) {
          // 标记当前分片为已满
          currentShard.status = 'full';

          // 创建新分片
          const newShardOrder = Object.keys(masterIndex.shards).length + 1;
          const newShardAlias = generateShardAlias(newShardOrder);

          // 创建新的 Gist 作为分片
          const newGist = await gitHubApiService.createSyncGist({
            [SHARD_FILES.SHARD_MANIFEST]: JSON.stringify({
              version: SHARD_VERSION.SHARD_MANIFEST,
              shardId: newShardAlias,
              masterGistId,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              files: {},
            }),
          });

          currentShard = createShardInfo(newGist.id, newShardAlias, newShardOrder);
          masterIndex.shards[newShardAlias] = currentShard;
          currentShardFiles = 0;
          result.createdShards++;

          console.log(`[ShardMigration] Created new shard: ${newShardAlias}`);
        }

        // 添加到文件索引
        masterIndex.fileIndex[file.url] = {
          shardId: currentShard.alias,
          filename: file.filename,
          size: file.size,
          type: file.type,
          syncedAt: Date.now(),
        };

        // 更新分片统计
        currentShard.fileCount++;
        currentShard.totalSize += file.size;
        currentShardFiles++;
        migratedCount++;

        // 更新进度
        this.state.progress = migratedCount;
        this.state.currentItem = file.url;
        const progress = 20 + Math.floor((migratedCount / totalFiles) * 60);
        onProgress?.(progress, 100, 'migrating');

        // 如果是新分片（非主 Gist），需要移动文件
        if (currentShard.gistId !== masterGistId) {
          try {
            // 从主 Gist 读取文件
            const content = await gitHubApiService.getGistFileContent(file.filename, masterGistId);
            if (content) {
              // 上传到新分片
              await gitHubApiService.updateGistFiles(
                { [file.filename]: content },
                currentShard.gistId
              );

              // 从主 Gist 删除
              await gitHubApiService.deleteGistFiles([file.filename], masterGistId);

              result.migratedFiles++;
            }
          } catch (error) {
            console.warn(`[ShardMigration] Failed to move file ${file.filename}:`, error);
            result.warnings.push(`无法移动文件: ${file.filename}`);
          }
        } else {
          // 文件已在主 Gist 中，只需更新索引
          result.migratedFiles++;
        }
      }

      // 5. 更新主索引统计
      masterIndex.stats = {
        totalFiles: migratedCount,
        totalSize: analysis.totalSize,
        activeShards: Object.values(masterIndex.shards).filter(s => s.status === 'active').length,
        fullShards: Object.values(masterIndex.shards).filter(s => s.status === 'full').length,
        archivedShards: 0,
      };
      masterIndex.updatedAt = Date.now();

      // 6. 保存主索引到远程
      this.state.phase = 'verifying';
      onProgress?.(90, 100, 'verifying');

      await gitHubApiService.updateGistFiles(
        {
          [SHARD_FILES.MASTER_INDEX]: JSON.stringify(masterIndex, null, 2),
        },
        masterGistId
      );

      // 7. 启用分片系统
      await shardedMediaSyncAdapter.enableSharding();

      this.state.phase = 'completed';
      onProgress?.(100, 100, 'verifying');

      result.success = true;
      console.log('[ShardMigration] Migration completed:', {
        migratedFiles: result.migratedFiles,
        createdShards: result.createdShards,
        warnings: result.warnings.length,
      });

      return result;
    } catch (error) {
      console.error('[ShardMigration] Migration failed:', error);
      this.state.phase = 'failed';
      this.state.error = error instanceof Error ? error.message : '迁移失败';
      result.error = this.state.error;
      return result;
    }
  }

  /**
   * 回滚迁移（删除新创建的分片，保留主 Gist）
   */
  async rollback(masterGistId: string): Promise<void> {
    console.log('[ShardMigration] Rolling back migration...');

    try {
      // 获取主索引
      const masterIndexContent = await gitHubApiService.getGistFileContent(
        SHARD_FILES.MASTER_INDEX,
        masterGistId
      );

      if (!masterIndexContent) {
        console.log('[ShardMigration] No master index found, nothing to rollback');
        return;
      }

      const masterIndex: MasterIndex = JSON.parse(masterIndexContent);

      // 删除非主 Gist 的分片
      for (const shard of Object.values(masterIndex.shards)) {
        if (shard.gistId !== masterGistId) {
          try {
            // 先将文件移回主 Gist
            const gist = await gitHubApiService.getGist(shard.gistId);
            const mediaFiles = Object.keys(gist.files).filter(
              f => f.startsWith('media_') && f.endsWith('.json')
            );

            for (const filename of mediaFiles) {
              const content = await gitHubApiService.getGistFileContent(filename, shard.gistId);
              if (content) {
                await gitHubApiService.updateGistFiles({ [filename]: content }, masterGistId);
              }
            }

            // 删除分片 Gist
            await gitHubApiService.deleteGist(shard.gistId);
            console.log(`[ShardMigration] Deleted shard: ${shard.alias}`);
          } catch (error) {
            console.error(`[ShardMigration] Failed to rollback shard ${shard.alias}:`, error);
          }
        }
      }

      // 删除主索引文件
      await gitHubApiService.deleteGistFiles([SHARD_FILES.MASTER_INDEX], masterGistId);

      // 禁用分片系统
      await shardedMediaSyncAdapter.disableSharding();

      // 清除本地缓存
      await shardRouter.clearLocalCache();

      console.log('[ShardMigration] Rollback completed');
    } catch (error) {
      console.error('[ShardMigration] Rollback failed:', error);
      throw error;
    }
  }

  /**
   * 验证迁移结果
   */
  async verifyMigration(masterGistId: string): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // 检查主索引
      const masterIndexContent = await gitHubApiService.getGistFileContent(
        SHARD_FILES.MASTER_INDEX,
        masterGistId
      );

      if (!masterIndexContent) {
        issues.push('主索引不存在');
        return { valid: false, issues };
      }

      const masterIndex: MasterIndex = JSON.parse(masterIndexContent);

      // 检查分片
      for (const [shardId, shard] of Object.entries(masterIndex.shards)) {
        try {
          await gitHubApiService.getGist(shard.gistId);
        } catch (error) {
          issues.push(`分片 ${shardId} 的 Gist 不存在`);
        }
      }

      // 检查文件索引
      const fileCount = Object.keys(masterIndex.fileIndex).length;
      const expectedFileCount = Object.values(masterIndex.shards).reduce(
        (sum, s) => sum + s.fileCount,
        0
      );

      if (fileCount !== expectedFileCount) {
        issues.push(`文件索引数量不匹配: 索引 ${fileCount}, 预期 ${expectedFileCount}`);
      }

      return {
        valid: issues.length === 0,
        issues,
      };
    } catch (error) {
      issues.push(`验证失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return { valid: false, issues };
    }
  }

  /**
   * 重置迁移状态
   */
  resetState(): void {
    this.state = {
      phase: 'idle',
      progress: 0,
      total: 0,
    };
  }
}

/** 分片迁移服务单例 */
export const shardMigrationService = new ShardMigrationService();
