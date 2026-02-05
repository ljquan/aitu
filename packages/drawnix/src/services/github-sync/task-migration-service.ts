/**
 * 任务数据迁移服务
 * 将旧的 tasks.json 格式迁移到新的分页格式
 */

import { gitHubApiService } from './github-api-service';
import { cryptoService } from './crypto-service';
import { logDebug, logInfo, logWarning, logSuccess } from './sync-log-service';
import {
  TasksData,
  TaskIndex,
  TaskPage,
  SYNC_FILES,
  SYNC_FILES_PAGED,
  TaskSyncFormat,
  detectTaskSyncFormat,
} from './types';
import { convertTasksToPagedFormat, migrateFromLegacyFormat } from './task-sync-service';
import type { Task } from '../../types/task.types';

/**
 * 迁移结果
 */
export interface MigrationResult {
  /** 是否成功 */
  success: boolean;
  /** 迁移的任务数量 */
  tasksMigrated: number;
  /** 创建的分页数量 */
  pagesCreated: number;
  /** 错误信息 */
  error?: string;
  /** 是否需要迁移（如果已经是新格式则不需要） */
  migrationNeeded: boolean;
}

/**
 * 任务迁移服务
 */
class TaskMigrationService {
  /**
   * 检查是否需要迁移
   */
  async checkMigrationNeeded(
    gistId: string,
    customPassword?: string
  ): Promise<{ needed: boolean; format: TaskSyncFormat }> {
    try {
      gitHubApiService.setGistId(gistId);
      const gist = await gitHubApiService.getGist();
      const files = gist.files;

      // 构建文件名 map
      const fileNames: Record<string, string> = {};
      for (const filename of Object.keys(files)) {
        const content = await gitHubApiService.getGistFileContent(filename);
        if (content) {
          fileNames[filename] = content;
        }
      }

      const format = detectTaskSyncFormat(fileNames);
      
      logDebug('TaskMigrationService: Format detected', { format });

      // 如果是旧格式且有数据，需要迁移
      if (format === 'legacy' && fileNames[SYNC_FILES.TASKS]) {
        return { needed: true, format };
      }

      return { needed: false, format };
    } catch (error) {
      logWarning('TaskMigrationService: Error checking migration status', { error: String(error) });
      return { needed: false, format: 'legacy' };
    }
  }

  /**
   * 执行迁移
   */
  async migrate(
    gistId: string,
    customPassword?: string
  ): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      tasksMigrated: 0,
      pagesCreated: 0,
      migrationNeeded: false,
    };

    try {
      logInfo('TaskMigrationService: Starting migration check');

      // 检查是否需要迁移
      const { needed, format } = await this.checkMigrationNeeded(gistId, customPassword);
      result.migrationNeeded = needed;

      if (!needed) {
        logInfo('TaskMigrationService: No migration needed', { format });
        result.success = true;
        return result;
      }

      logInfo('TaskMigrationService: Migration needed, starting...');

      // 读取旧格式数据
      const oldTasksContent = await gitHubApiService.getGistFileContent(SYNC_FILES.TASKS);
      if (!oldTasksContent) {
        logWarning('TaskMigrationService: No tasks.json found');
        result.success = true;
        return result;
      }

      // 解密（如果需要）
      const decryptedContent = await cryptoService.decryptOrPassthrough(
        oldTasksContent,
        gistId,
        customPassword
      );

      const oldData: TasksData = JSON.parse(decryptedContent);
      const tasks = oldData.completedTasks || [];

      if (tasks.length === 0) {
        logInfo('TaskMigrationService: No tasks to migrate');
        result.success = true;
        return result;
      }

      logInfo('TaskMigrationService: Found tasks to migrate', { count: tasks.length });

      // 转换为分页格式
      const { index, pages } = migrateFromLegacyFormat(oldData);

      // 准备上传的文件
      const files: Record<string, string> = {};

      // 加密并添加索引
      const indexJson = JSON.stringify(index, null, 2);
      files[SYNC_FILES_PAGED.TASK_INDEX] = await cryptoService.encrypt(indexJson, gistId, customPassword);

      // 加密并添加分页
      for (const page of pages) {
        const pageJson = JSON.stringify(page, null, 2);
        const filename = SYNC_FILES_PAGED.taskPageFile(page.pageId);
        files[filename] = await cryptoService.encrypt(pageJson, gistId, customPassword);
      }

      logDebug('TaskMigrationService: Uploading migrated data', {
        indexItems: index.items.length,
        pages: pages.length,
      });

      // 上传新格式
      await gitHubApiService.updateGistFiles(files);

      // 删除旧的 tasks.json
      try {
        await gitHubApiService.deleteGistFiles([SYNC_FILES.TASKS]);
      } catch {
        // 删除失败不影响迁移成功
        logWarning('TaskMigrationService: Failed to delete old tasks.json');
      }

      result.success = true;
      result.tasksMigrated = tasks.length;
      result.pagesCreated = pages.length;

      logSuccess('TaskMigrationService: Migration completed', {
        tasksMigrated: result.tasksMigrated,
        pagesCreated: result.pagesCreated,
      });

    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      logWarning('TaskMigrationService: Migration failed', { error: String(error) });
    }

    return result;
  }

  /**
   * 从本地数据迁移到分页格式
   * 用于首次启用分页同步时
   */
  async migrateLocalTasks(
    tasks: Task[],
    gistId: string,
    customPassword?: string
  ): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      tasksMigrated: 0,
      pagesCreated: 0,
      migrationNeeded: true,
    };

    try {
      if (tasks.length === 0) {
        logInfo('TaskMigrationService: No local tasks to migrate');
        result.success = true;
        result.migrationNeeded = false;
        return result;
      }

      logInfo('TaskMigrationService: Migrating local tasks', { count: tasks.length });

      // 转换为分页格式
      const { index, pages } = convertTasksToPagedFormat(tasks);

      // 准备上传的文件
      const files: Record<string, string> = {};

      // 加密并添加索引
      const indexJson = JSON.stringify(index, null, 2);
      files[SYNC_FILES_PAGED.TASK_INDEX] = await cryptoService.encrypt(indexJson, gistId, customPassword);

      // 加密并添加分页
      for (const page of pages) {
        const pageJson = JSON.stringify(page, null, 2);
        const filename = SYNC_FILES_PAGED.taskPageFile(page.pageId);
        files[filename] = await cryptoService.encrypt(pageJson, gistId, customPassword);
      }

      logDebug('TaskMigrationService: Uploading local tasks as paged format', {
        indexItems: index.items.length,
        pages: pages.length,
      });

      // 上传
      await gitHubApiService.updateGistFiles(files);

      result.success = true;
      result.tasksMigrated = tasks.length;
      result.pagesCreated = pages.length;

      logSuccess('TaskMigrationService: Local migration completed', {
        tasksMigrated: result.tasksMigrated,
        pagesCreated: result.pagesCreated,
      });

    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      logWarning('TaskMigrationService: Local migration failed', { error: String(error) });
    }

    return result;
  }

  /**
   * 回滚迁移（如果需要）
   * 将分页格式转换回旧的 tasks.json 格式
   */
  async rollback(
    gistId: string,
    customPassword?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      logInfo('TaskMigrationService: Starting rollback');

      gitHubApiService.setGistId(gistId);

      // 读取分页索引
      const indexContent = await gitHubApiService.getGistFileContent(SYNC_FILES_PAGED.TASK_INDEX);
      if (!indexContent) {
        logInfo('TaskMigrationService: No paged data to rollback');
        return { success: true };
      }

      const decryptedIndex = await cryptoService.decryptOrPassthrough(
        indexContent,
        gistId,
        customPassword
      );
      const index: TaskIndex = JSON.parse(decryptedIndex);

      // 收集所有任务
      const allTasks: Task[] = [];
      const pageIds = new Set(index.items.map(item => item.pageId));

      for (const pageId of pageIds) {
        const pageContent = await gitHubApiService.getGistFileContent(
          SYNC_FILES_PAGED.taskPageFile(pageId)
        );
        if (pageContent) {
          const decryptedPage = await cryptoService.decryptOrPassthrough(
            pageContent,
            gistId,
            customPassword
          );
          const page: TaskPage = JSON.parse(decryptedPage);
          
          // 将 CompactTask 转换回 Task（简化版，因为丢失了部分数据）
          for (const compact of page.tasks) {
            allTasks.push({
              id: compact.id,
              type: compact.type as any,
              status: compact.status as any,
              params: {
                ...compact.params,
              },
              createdAt: compact.createdAt,
              updatedAt: compact.updatedAt,
              startedAt: compact.startedAt,
              completedAt: compact.completedAt,
              result: compact.result ? {
                ...compact.result,
                url: compact.result.url || '',
                format: compact.result.format || '',
                size: compact.result.size || 0,
              } : undefined,
              error: compact.error,
              progress: compact.progress,
              remoteId: compact.remoteId,
              executionPhase: compact.executionPhase as any,
              savedToLibrary: compact.savedToLibrary,
              insertedToCanvas: compact.insertedToCanvas,
            });
          }
        }
      }

      // 创建旧格式数据
      const legacyData: TasksData = {
        completedTasks: allTasks,
      };

      // 准备文件更新
      const files: Record<string, string> = {};

      // 添加旧格式文件
      const legacyJson = JSON.stringify(legacyData, null, 2);
      files[SYNC_FILES.TASKS] = await cryptoService.encrypt(legacyJson, gistId, customPassword);

      // 上传旧格式文件
      await gitHubApiService.updateGistFiles(files);

      // 删除分页文件
      const filesToDelete: string[] = [SYNC_FILES_PAGED.TASK_INDEX];
      for (const pageId of pageIds) {
        filesToDelete.push(SYNC_FILES_PAGED.taskPageFile(pageId));
      }
      try {
        await gitHubApiService.deleteGistFiles(filesToDelete);
      } catch {
        // 删除失败不影响回滚成功
        logWarning('TaskMigrationService: Failed to delete paged files');
      }

      logSuccess('TaskMigrationService: Rollback completed', { tasks: allTasks.length });
      return { success: true };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logWarning('TaskMigrationService: Rollback failed', { error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }
}

/** 任务迁移服务单例 */
export const taskMigrationService = new TaskMigrationService();
