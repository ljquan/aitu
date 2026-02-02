/**
 * 分片迁移工具
 * @deprecated 不再需要迁移，分片系统已是唯一的媒体存储方式
 */

import { gitHubApiService } from './github-api-service';
import { shardRouter } from './shard-router';
import { shardedMediaSyncAdapter } from './sharded-media-sync-adapter';
import {
  MasterIndex,
  MigrationResult,
  MigrationProgressCallback,
  SHARD_FILES,
} from './shard-types';

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
 * @deprecated 不再需要迁移，分片系统已是唯一的媒体存储方式
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
   * @deprecated 不再需要迁移，分片系统已是唯一的媒体存储方式
   */
  async analyzeMigration(_masterGistId: string): Promise<{
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
    // 不再需要迁移，分片系统已是唯一的媒体存储方式
    return {
      needsMigration: false,
      currentMediaCount: 0,
      estimatedShards: 0,
      totalSize: 0,
      mediaFiles: [],
    };
  }

  /**
   * 执行迁移
   * @deprecated 不再需要迁移，分片系统已是唯一的媒体存储方式
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
      // 不再需要迁移，直接初始化空的分片系统
      onProgress?.(0, 100, 'analyzing');
      await shardedMediaSyncAdapter.setupShardSystem(masterGistId);
      
      this.state.phase = 'completed';
      onProgress?.(100, 100, 'verifying');
      
      result.success = true;
      console.log('[ShardMigration] Shard system initialized (no migration needed)');
      
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
        } catch {
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
