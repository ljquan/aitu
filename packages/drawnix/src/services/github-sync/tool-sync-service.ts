/**
 * 自定义工具同步服务
 * 负责同步用户自定义的工具配置
 */

import { toolboxService } from '../toolbox-service';
import { gitHubApiService } from './github-api-service';
import { cryptoService } from './crypto-service';
import { logDebug, logInfo, logWarning, logSuccess } from './sync-log-service';
import { SYNC_FILES } from './types';
import type { ToolDefinition } from '../../types/toolbox.types';

/** 同步数据格式 */
interface CustomToolsSyncData {
  version: string;
  tools: ToolDefinition[];
  updatedAt: number;
}

const SYNC_VERSION = '1.0';

/**
 * 自定义工具同步服务
 */
class ToolSyncService {
  /**
   * 同步自定义工具
   */
  async syncTools(
    gistId: string,
    customPassword?: string
  ): Promise<{
    uploaded: number;
    downloaded: number;
    skipped: number;
  }> {
    logDebug('ToolSyncService: Starting tool sync');

    try {
      // 获取本地工具
      const localTools = toolboxService.getCustomTools();
      const localUpdatedAt = await toolboxService.getUpdatedAt();

      // 获取远程工具
      const remoteData = await this.downloadRemoteTools(gistId, customPassword);

      let uploaded = 0;
      let downloaded = 0;
      let skipped = 0;

      if (!remoteData) {
        // 远程没有数据，上传本地数据
        if (localTools.length > 0) {
          await this.uploadTools(localTools, gistId, customPassword);
          uploaded = localTools.length;
          logInfo('ToolSyncService: Uploaded local tools', { count: uploaded });
        } else {
          logDebug('ToolSyncService: No tools to sync');
        }
      } else {
        // 双向合并
        const { toUpload, toDownload } = this.compareTools(
          localTools,
          remoteData.tools,
          localUpdatedAt,
          remoteData.updatedAt
        );

        // 下载远程新增的工具
        if (toDownload.length > 0) {
          const result = await toolboxService.importTools(toDownload);
          downloaded = result.imported;
          skipped += result.skipped;
          logInfo('ToolSyncService: Downloaded remote tools', {
            imported: result.imported,
            skipped: result.skipped,
          });
        }

        // 上传本地新增的工具
        if (toUpload.length > 0 || downloaded > 0) {
          // 合并后重新上传完整列表
          const allTools = toolboxService.getCustomTools();
          await this.uploadTools(allTools, gistId, customPassword);
          uploaded = toUpload.length;
          logInfo('ToolSyncService: Uploaded local tools', { count: uploaded });
        }
      }

      if (uploaded > 0 || downloaded > 0) {
        logSuccess('ToolSyncService: Tool sync completed', {
          uploaded,
          downloaded,
          skipped,
        });
      } else {
        logDebug('ToolSyncService: Tool sync completed (no changes)');
      }

      return { uploaded, downloaded, skipped };
    } catch (error) {
      logWarning('ToolSyncService: Tool sync failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { uploaded: 0, downloaded: 0, skipped: 0 };
    }
  }

  /**
   * 比较本地和远程工具，确定需要同步的内容
   */
  private compareTools(
    localTools: ToolDefinition[],
    remoteTools: ToolDefinition[],
    localUpdatedAt: number,
    remoteUpdatedAt: number
  ): {
    toUpload: ToolDefinition[];
    toDownload: ToolDefinition[];
  } {
    const localIds = new Set(localTools.map(t => t.id));
    const remoteIds = new Set(remoteTools.map(t => t.id));

    // 本地有但远程没有 -> 需要上传
    const toUpload = localTools.filter(t => !remoteIds.has(t.id));

    // 远程有但本地没有 -> 需要下载
    const toDownload = remoteTools.filter(t => !localIds.has(t.id));

    logDebug('ToolSyncService: Compared tools', {
      localCount: localTools.length,
      remoteCount: remoteTools.length,
      toUpload: toUpload.length,
      toDownload: toDownload.length,
    });

    return { toUpload, toDownload };
  }

  /**
   * 下载远程工具配置
   */
  private async downloadRemoteTools(
    gistId: string,
    customPassword?: string
  ): Promise<CustomToolsSyncData | null> {
    try {
      const content = await gitHubApiService.getGistFileContent(SYNC_FILES.CUSTOM_TOOLS);

      if (!content) {
        logDebug('ToolSyncService: No remote tools found');
        return null;
      }

      const decrypted = await cryptoService.decryptOrPassthrough(
        content,
        gistId,
        customPassword
      );

      const data = JSON.parse(decrypted) as CustomToolsSyncData;

      // 验证版本
      if (data.version !== SYNC_VERSION) {
        logWarning('ToolSyncService: Incompatible remote version', {
          remote: data.version,
          local: SYNC_VERSION,
        });
        return null;
      }

      return data;
    } catch (error) {
      logWarning('ToolSyncService: Failed to download remote tools', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * 上传工具配置
   */
  private async uploadTools(
    tools: ToolDefinition[],
    gistId: string,
    customPassword?: string
  ): Promise<void> {
    const data: CustomToolsSyncData = {
      version: SYNC_VERSION,
      tools,
      updatedAt: Date.now(),
    };

    const content = JSON.stringify(data, null, 2);
    const encrypted = await cryptoService.encrypt(content, gistId, customPassword);

    await gitHubApiService.updateGistFiles({
      [SYNC_FILES.CUSTOM_TOOLS]: encrypted,
    });
  }
}

/** 工具同步服务单例 */
export const toolSyncService = new ToolSyncService();
