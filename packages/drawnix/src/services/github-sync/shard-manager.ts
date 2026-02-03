/**
 * 分片管理器
 * 提供分片的高层管理功能：列表、重命名、归档、合并等
 */

import { logDebug, logInfo, logSuccess, logWarning, logError } from './sync-log-service';
import { maskId } from '@aitu/utils';
import { gitHubApiService, GitHubApiError } from './github-api-service';
import { shardRouter } from './shard-router';
import { shardSyncService } from './shard-sync-service';
import {
  ShardInfo,
  ShardStats,
  ShardManifest,
  MasterIndex,
  SHARD_CONFIG,
  SHARD_FILES,
  GIST_DESCRIPTION_PREFIX,
  updateMasterIndexStats,
} from './shard-types';

/**
 * 分片管理器
 */
class ShardManager {
  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    await shardRouter.initialize();
  }

  /**
   * 检查是否已配置
   */
  isConfigured(): boolean {
    return shardRouter.isConfigured();
  }

  /**
   * 列出所有分片
   */
  async listShards(): Promise<ShardInfo[]> {
    await shardRouter.initialize();
    return shardRouter.getAllShards();
  }

  /**
   * 获取分片详情
   */
  async getShardDetails(shardId: string): Promise<{
    info: ShardInfo;
    manifest: ShardManifest | null;
    fileCount: number;
    totalSize: number;
  } | null> {
    await shardRouter.initialize();

    const shard = shardRouter.getShard(shardId);
    if (!shard) {
      return null;
    }

    // 获取分片清单
    let manifest: ShardManifest | null = null;
    try {
      const content = await gitHubApiService.getGistFileContent(
        SHARD_FILES.SHARD_MANIFEST,
        shard.gistId
      );
      if (content) {
        manifest = JSON.parse(content);
      }
    } catch (error) {
      logWarning(`ShardManager] Failed to get manifest for shard ${shardId}:`, error);
    }

    return {
      info: shard,
      manifest,
      fileCount: shard.fileCount,
      totalSize: shard.totalSize,
    };
  }

  /**
   * 重命名分片别名
   */
  async renameShardAlias(shardId: string, newAlias: string): Promise<void> {
    await shardRouter.initialize();

    const shard = shardRouter.getShard(shardId);
    if (!shard) {
      throw new Error(`分片 "${shardId}" 不存在`);
    }

    // 验证新别名格式
    if (!this.isValidAlias(newAlias)) {
      throw new Error('别名只能包含字母、数字、连字符和下划线');
    }

    // 更新路由器中的索引
    await shardRouter.updateShardAlias(shardId, newAlias);

    // 更新 Gist 描述
    const newDescription = `${GIST_DESCRIPTION_PREFIX.SHARD} #${shard.order} (${newAlias})`;
    
    // 更新分片清单中的 shardId
    try {
      const manifestContent = await gitHubApiService.getGistFileContent(
        SHARD_FILES.SHARD_MANIFEST,
        shard.gistId
      );
      
      if (manifestContent) {
        const manifest: ShardManifest = JSON.parse(manifestContent);
        manifest.shardId = newAlias;
        manifest.updatedAt = Date.now();

        await gitHubApiService.updateGistFiles(
          {
            [SHARD_FILES.SHARD_MANIFEST]: JSON.stringify(manifest, null, 2),
          },
          shard.gistId
        );
      }
    } catch (error) {
      logWarning(`ShardManager] Failed to update shard manifest:`, error);
    }

    // 保存主索引到远程
    await shardRouter.saveMasterIndexToRemote();

    logDebug(`ShardManager] Renamed shard "${shardId}" to "${newAlias}"`);
  }

  /**
   * 验证别名格式
   */
  private isValidAlias(alias: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(alias) && alias.length >= 1 && alias.length <= 50;
  }

  /**
   * 归档分片（标记为只读）
   */
  async archiveShard(shardId: string): Promise<void> {
    await shardRouter.initialize();

    const shard = shardRouter.getShard(shardId);
    if (!shard) {
      throw new Error(`分片 "${shardId}" 不存在`);
    }

    shardRouter.archiveShard(shardId);
    await shardRouter.saveMasterIndexToRemote();

    logDebug(`ShardManager] Archived shard "${shardId}"`);
  }

  /**
   * 重新激活分片
   */
  async reactivateShard(shardId: string): Promise<void> {
    await shardRouter.initialize();

    const shard = shardRouter.getShard(shardId);
    if (!shard) {
      throw new Error(`分片 "${shardId}" 不存在`);
    }

    shardRouter.reactivateShard(shardId);
    await shardRouter.saveMasterIndexToRemote();

    logDebug(`ShardManager] Reactivated shard "${shardId}"`);
  }

  /**
   * 删除分片（需要先清空）
   */
  async deleteShard(shardId: string, force = false): Promise<void> {
    await shardRouter.initialize();

    const shard = shardRouter.getShard(shardId);
    if (!shard) {
      throw new Error(`分片 "${shardId}" 不存在`);
    }

    // 检查是否有文件
    if (shard.fileCount > 0 && !force) {
      throw new Error(`分片 "${shardId}" 还有 ${shard.fileCount} 个文件，请先清空或使用强制删除`);
    }

    // 如果强制删除，先软删除所有文件
    if (shard.fileCount > 0 && force) {
      const masterIndex = shardRouter.getMasterIndex();
      if (masterIndex) {
        const urlsInShard = Object.entries(masterIndex.fileIndex)
          .filter(([_, entry]) => entry.shardId === shardId)
          .map(([url]) => url);

        if (urlsInShard.length > 0) {
          await shardSyncService.softDeleteMedia(urlsInShard);
        }
      }
    }

    // 删除 Gist
    try {
      await gitHubApiService.deleteGist(shard.gistId);
    } catch (error) {
      logError(`ShardManager] Failed to delete Gist ${shard.gistId}:`, error);
      // 即使删除 Gist 失败，也从索引中移除
    }

    // 从主索引中移除
    const masterIndex = shardRouter.getMasterIndex();
    if (masterIndex) {
      delete masterIndex.shards[shardId];
      updateMasterIndexStats(masterIndex);
      await shardRouter.saveMasterIndexToRemote();
    }

    logDebug(`ShardManager] Deleted shard "${shardId}"`);
  }

  /**
   * 获取分片统计信息
   */
  async getShardStats(): Promise<ShardStats> {
    await shardRouter.initialize();

    const shards = shardRouter.getAllShards();
    const stats = shardRouter.getStats();

    // 计算平均使用率
    let totalUsage = 0;
    for (const shard of shards) {
      const fileUsage = shard.fileCount / SHARD_CONFIG.FILE_LIMIT;
      const sizeUsage = shard.totalSize / SHARD_CONFIG.SIZE_LIMIT;
      totalUsage += Math.max(fileUsage, sizeUsage);
    }
    const averageUsage = shards.length > 0 ? totalUsage / shards.length : 0;

    return {
      totalShards: stats.totalShards,
      activeShards: stats.activeShards,
      fullShards: stats.fullShards,
      archivedShards: stats.archivedShards,
      totalFiles: stats.totalFiles,
      totalSize: stats.totalSize,
      averageUsage,
      shardDetails: shards,
    };
  }

  /**
   * 合并分片（将源分片的文件移动到目标分片）
   */
  async mergeShards(sourceShardIds: string[], targetShardId: string): Promise<{
    success: boolean;
    movedFiles: number;
    errors: string[];
  }> {
    await shardRouter.initialize();

    const result = {
      success: true,
      movedFiles: 0,
      errors: [] as string[],
    };

    // 验证目标分片
    const targetShard = shardRouter.getShard(targetShardId);
    if (!targetShard) {
      result.success = false;
      result.errors.push(`目标分片 "${targetShardId}" 不存在`);
      return result;
    }

    if (targetShard.status === 'archived') {
      result.success = false;
      result.errors.push(`目标分片 "${targetShardId}" 已归档`);
      return result;
    }

    const masterIndex = shardRouter.getMasterIndex();
    if (!masterIndex) {
      result.success = false;
      result.errors.push('主索引未加载');
      return result;
    }

    // 收集所有要移动的文件
    const filesToMove: Array<{
      url: string;
      sourceShardId: string;
      filename: string;
    }> = [];

    for (const sourceId of sourceShardIds) {
      if (sourceId === targetShardId) {
        continue;
      }

      const sourceShard = shardRouter.getShard(sourceId);
      if (!sourceShard) {
        result.errors.push(`源分片 "${sourceId}" 不存在`);
        continue;
      }

      // 收集该分片的所有文件
      for (const [url, entry] of Object.entries(masterIndex.fileIndex)) {
        if (entry.shardId === sourceId) {
          filesToMove.push({
            url,
            sourceShardId: sourceId,
            filename: entry.filename,
          });
        }
      }
    }

    // 检查目标分片是否有足够空间
    const totalFilesToMove = filesToMove.length;
    if (targetShard.fileCount + totalFilesToMove > SHARD_CONFIG.FILE_LIMIT) {
      result.success = false;
      result.errors.push(
        `目标分片空间不足，需要 ${totalFilesToMove} 个位置，只有 ${SHARD_CONFIG.FILE_LIMIT - targetShard.fileCount} 个`
      );
      return result;
    }

    // 移动文件（下载后重新上传）
    for (const file of filesToMove) {
      try {
        const sourceShard = shardRouter.getShard(file.sourceShardId)!;

        // 从源分片下载
        const content = await gitHubApiService.getGistFileContent(
          file.filename,
          sourceShard.gistId
        );

        if (!content) {
          result.errors.push(`无法读取文件 ${file.filename}`);
          continue;
        }

        const mediaData = JSON.parse(content);

        // 上传到目标分片
        await gitHubApiService.updateGistFiles(
          { [file.filename]: content },
          targetShard.gistId
        );

        // 更新索引
        const entry = masterIndex.fileIndex[file.url];
        if (entry) {
          // 更新分片统计
          const oldShard = shardRouter.getShard(file.sourceShardId);
          if (oldShard) {
            oldShard.fileCount--;
            oldShard.totalSize -= entry.size;
          }

          entry.shardId = targetShardId;
          targetShard.fileCount++;
          targetShard.totalSize += entry.size;
        }

        // 从源分片删除
        await gitHubApiService.deleteGistFiles([file.filename], sourceShard.gistId);

        result.movedFiles++;
      } catch (error) {
        logError(`ShardManager] Failed to move file ${file.url}:`, error);
        result.errors.push(`移动文件失败: ${file.url}`);
      }
    }

    // 保存主索引
    await shardRouter.saveMasterIndexToRemote();

    result.success = result.movedFiles > 0;
    logDebug(`ShardManager] Merged ${result.movedFiles} files to shard "${targetShardId}"`);

    return result;
  }

  /**
   * 验证分片完整性
   */
  async validateShards(): Promise<{
    valid: boolean;
    issues: Array<{
      shardId: string;
      type: 'missing_gist' | 'missing_file' | 'orphan_file' | 'count_mismatch';
      details: string;
    }>;
  }> {
    await shardRouter.initialize();

    const issues: Array<{
      shardId: string;
      type: 'missing_gist' | 'missing_file' | 'orphan_file' | 'count_mismatch';
      details: string;
    }> = [];

    const shards = shardRouter.getAllShards();
    const masterIndex = shardRouter.getMasterIndex();

    if (!masterIndex) {
      return { valid: false, issues: [{ shardId: '', type: 'missing_gist', details: '主索引未加载' }] };
    }

    for (const shard of shards) {
      // 检查 Gist 是否存在
      try {
        await gitHubApiService.getGist(shard.gistId);
      } catch (error) {
        if (error instanceof GitHubApiError && error.statusCode === 404) {
          issues.push({
            shardId: shard.alias,
            type: 'missing_gist',
            details: `Gist ${maskId(shard.gistId)} 不存在`,
          });
          continue;
        }
      }

      // 获取分片中的实际文件列表
      try {
        const gist = await gitHubApiService.getGist(shard.gistId);
        const actualFiles = Object.keys(gist.files).filter(
          f => f.startsWith('media_') && f.endsWith('.json')
        );

        // 获取索引中该分片的文件列表
        const indexedFiles = Object.entries(masterIndex.fileIndex)
          .filter(([_, entry]) => entry.shardId === shard.alias)
          .map(([_, entry]) => entry.filename);

        // 检查文件数量
        if (actualFiles.length !== indexedFiles.length) {
          issues.push({
            shardId: shard.alias,
            type: 'count_mismatch',
            details: `索引记录 ${indexedFiles.length} 个文件，实际 ${actualFiles.length} 个`,
          });
        }

        // 检查缺失的文件
        for (const filename of indexedFiles) {
          if (!actualFiles.includes(filename)) {
            issues.push({
              shardId: shard.alias,
              type: 'missing_file',
              details: `文件 ${filename} 在索引中但不在 Gist 中`,
            });
          }
        }

        // 检查孤立的文件
        for (const filename of actualFiles) {
          if (!indexedFiles.includes(filename)) {
            issues.push({
              shardId: shard.alias,
              type: 'orphan_file',
              details: `文件 ${filename} 在 Gist 中但不在索引中`,
            });
          }
        }
      } catch (error) {
        logError(`ShardManager] Failed to validate shard ${shard.alias}:`, error);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * 修复孤立文件（将 Gist 中存在但索引中不存在的文件添加到索引）
   */
  async repairOrphanFiles(): Promise<number> {
    await shardRouter.initialize();

    const validation = await this.validateShards();
    const orphanIssues = validation.issues.filter(i => i.type === 'orphan_file');

    if (orphanIssues.length === 0) {
      return 0;
    }

    let repaired = 0;
    const masterIndex = shardRouter.getMasterIndex();
    if (!masterIndex) {
      return 0;
    }

    for (const issue of orphanIssues) {
      const shard = shardRouter.getShard(issue.shardId);
      if (!shard) {
        continue;
      }

      // 提取文件名
      const match = issue.details.match(/文件 (.+) 在 Gist 中/);
      if (!match) {
        continue;
      }

      const filename = match[1];

      try {
        // 读取文件内容以获取 URL 和类型
        const content = await gitHubApiService.getGistFileContent(filename, shard.gistId);
        if (!content) {
          continue;
        }

        const mediaData = JSON.parse(content);
        const url = mediaData.url;
        const type = mediaData.type;
        const size = mediaData.size || 0;

        if (!url) {
          continue;
        }

        // 添加到索引
        shardRouter.registerFile(url, issue.shardId, filename, size, type);
        repaired++;

        logDebug(`ShardManager] Repaired orphan file: ${filename} -> ${url}`);
      } catch (error) {
        logError(`ShardManager] Failed to repair orphan file ${filename}:`, error);
      }
    }

    if (repaired > 0) {
      await shardRouter.saveMasterIndexToRemote();
    }

    return repaired;
  }

  /**
   * 清除本地缓存
   */
  async clearLocalCache(): Promise<void> {
    await shardRouter.clearLocalCache();
    logDebug('ShardManager] Cleared local cache');
  }

  /**
   * 销毁
   */
  destroy(): void {
    shardRouter.destroy();
  }
}

/** 分片管理器单例 */
export const shardManager = new ShardManager();
