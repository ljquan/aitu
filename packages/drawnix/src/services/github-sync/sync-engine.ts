/**
 * 同步引擎
 * 负责执行实际的同步操作
 */

import { maskId, yieldToMain } from '@aitu/utils';
import { gitHubApiService, GitHubApiError } from './github-api-service';
import { tokenService } from './token-service';
import { dataSerializer } from './data-serializer';
import { mediaSyncService } from './media-sync-service';
import { syncPasswordService } from './sync-password-service';
import { DecryptionError } from './crypto-service';
import { kvStorageService } from '../kv-storage-service';
import { workspaceStorageService } from '../workspace-storage-service';
import { workspaceService } from '../workspace-service';
import { recoverBoardsFromRemote } from './board-recovery-service';
import {
  startSyncSession,
  endSyncSession,
  logInfo,
  logSuccess,
  logWarning,
  logError,
  logDebug,
  cleanupOldLogs,
} from './sync-log-service';
import {
  SyncStatus,
  SyncResult,
  SyncConfig,
  DEFAULT_SYNC_CONFIG,
  SyncManifest,
  SYNC_FILES,
  SYNC_FILES_PAGED,
  ConflictItem,
  ConflictResolution,
  ChangeSet,
  SyncSafetyCheck,
  SyncWarning,
  SkippedItem,
  DeletedItems,
  BoardSyncInfo,
  PromptTombstone,
  TaskTombstone,
  BoardData,
  TasksData,
  PagedSyncResult,
  detectTaskSyncFormat,
} from './types';
import { taskSyncService } from './task-sync-service';
import { workflowSyncService } from './workflow-sync-service';
import { toolSyncService } from './tool-sync-service';

/** 同步配置存储键 */
const SYNC_CONFIG_KEY = 'github_sync_config';

/** 本地已删除、尚未同步到远程的画板（ID -> 删除时间戳），下载远程时按时间戳判断是否恢复 */
const LOCAL_DELETIONS_PENDING_KEY = 'github_sync_local_deletions_pending';

/** 同步状态变更监听器 */
type SyncStatusListener = (status: SyncStatus, message?: string) => void;

/**
 * 同步引擎
 */
class SyncEngine {
  private status: SyncStatus = 'not_configured';
  private statusListeners: Set<SyncStatusListener> = new Set();
  private syncInProgress = false;
  private autoSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges = false;

  constructor() {
    this.initialize();
  }

  /**
   * 初始化
   */
  private async initialize(): Promise<void> {
    const hasToken = tokenService.hasToken();
    if (hasToken) {
      const config = await this.getConfig();
      if (config.gistId) {
        gitHubApiService.setGistId(config.gistId);
        this.status = 'synced';
      } else {
        this.status = 'local_changes';
      }
    } else {
      this.status = 'not_configured';
    }
  }

  /**
   * 获取同步配置
   */
  async getConfig(): Promise<SyncConfig> {
    const config = await kvStorageService.get<SyncConfig>(SYNC_CONFIG_KEY);
    return config || { ...DEFAULT_SYNC_CONFIG };
  }

  /**
   * 保存同步配置
   */
  async saveConfig(config: Partial<SyncConfig>): Promise<void> {
    const currentConfig = await this.getConfig();
    const newConfig = { ...currentConfig, ...config };
    await kvStorageService.set(SYNC_CONFIG_KEY, newConfig);
  }

  /**
   * 获取当前同步状态
   */
  getSyncStatus(): SyncStatus {
    return this.status;
  }

  /**
   * 设置同步状态
   */
  private setStatus(status: SyncStatus, message?: string): void {
    this.status = status;
    this.notifyStatusListeners(status, message);
  }

  /**
   * 添加状态监听器
   */
  addStatusListener(listener: SyncStatusListener): void {
    this.statusListeners.add(listener);
  }

  /**
   * 移除状态监听器
   */
  removeStatusListener(listener: SyncStatusListener): void {
    this.statusListeners.delete(listener);
  }

  /**
   * 通知状态监听器
   */
  private notifyStatusListeners(status: SyncStatus, message?: string): void {
    this.statusListeners.forEach(listener => {
      try {
        listener(status, message);
      } catch (e) {
        logError('状态监听器错误', e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  /**
   * 执行同步前安全检查
   * 防止误删用户数据
   */
  performSafetyCheck(params: {
    localBoards: Map<string, BoardData>;
    toDeleteLocally: string[];
    currentBoardId: string | null;
    isFirstSync: boolean;
    remoteManifest: SyncManifest | null;
  }): SyncSafetyCheck {
    const { localBoards, toDeleteLocally, currentBoardId, isFirstSync, remoteManifest } = params;
    const result: SyncSafetyCheck = { 
      passed: true, 
      warnings: [], 
      skippedItems: [] 
    };

    // 如果没有要删除的项目，直接通过
    if (toDeleteLocally.length === 0) {
      return result;
    }

    logDebug('Safety check', {
      localBoardsCount: localBoards.size,
      toDeleteCount: toDeleteLocally.length,
      currentBoardId,
      isFirstSync,
      hasRemoteManifest: !!remoteManifest,
    });

    // 1. 空 manifest 检测：远程数据异常时不执行删除
    if (!remoteManifest || Object.keys(remoteManifest.boards).length === 0) {
      logDebug('Safety: Remote manifest empty or invalid, skipping all deletions');
      result.skippedItems = toDeleteLocally.map(id => ({
        id,
        name: localBoards.get(id)?.name || id,
        reason: 'new_device' as const
      }));
      return result;
    }

    // 2. 新设备保护：首次同步不执行任何删除操作
    if (isFirstSync && toDeleteLocally.length > 0) {
      logDebug('Safety: First sync, skipping all deletions');
      result.skippedItems = toDeleteLocally.map(id => ({
        id,
        name: localBoards.get(id)?.name || id,
        reason: 'new_device' as const
      }));
      return result;
    }

    // 3. 当前画板保护：正在编辑的画板不能被删除
    if (currentBoardId && toDeleteLocally.includes(currentBoardId)) {
      logDebug('Safety: Current board protected', { currentBoardId });
      result.skippedItems.push({
        id: currentBoardId,
        name: localBoards.get(currentBoardId)?.name || currentBoardId,
        reason: 'current_board'
      });
    }

    // 过滤掉被跳过的项目后，重新计算实际要删除的数量
    const skippedIds = new Set(result.skippedItems.map(item => item.id));
    const actualToDelete = toDeleteLocally.filter(id => !skippedIds.has(id));

    // 4. 全部删除检测：如果同步会导致删除所有本地画板，阻止执行
    if (actualToDelete.length === localBoards.size && localBoards.size > 0) {
      logDebug('Safety: Blocked - would delete all local boards');
      result.passed = false;
      result.blockedReason = '检测到异常操作：远程数据要求删除所有本地画板，已阻止执行。请检查远程数据是否正常。';
      return result;
    }

    // 5. 批量删除检测：删除超过 50% 画板时触发警告
    if (actualToDelete.length > 1) {
      const deleteRatio = actualToDelete.length / localBoards.size;
      if (deleteRatio > 0.5) {
        logDebug('Safety: Bulk delete warning', { deleteRatio });
        result.passed = false;
        result.warnings.push({
          type: 'bulk_delete',
          message: `即将删除 ${actualToDelete.length}/${localBoards.size} 个画板 (${Math.round(deleteRatio * 100)}%)`,
          affectedItems: actualToDelete.map(id => ({
            id,
            name: localBoards.get(id)?.name || id
          }))
        });
      }
    }

    return result;
  }

  /**
   * 执行完整同步
   */
  async sync(): Promise<SyncResult> {
    if (this.syncInProgress) {
      return {
        success: false,
        uploaded: { boards: 0, prompts: 0, tasks: 0, media: 0 },
        downloaded: { boards: 0, prompts: 0, tasks: 0, media: 0 },
        conflicts: [],
        error: '同步正在进行中',
        duration: 0,
      };
    }

    const startTime = Date.now();
    this.syncInProgress = true;
    this.setStatus('syncing', '正在同步...');

    // Start sync session for logging
    const sessionId = startSyncSession();
    logInfo('开始同步', { sessionId });

    const result: SyncResult = {
      success: false,
      uploaded: { boards: 0, prompts: 0, tasks: 0, media: 0 },
      downloaded: { boards: 0, prompts: 0, tasks: 0, media: 0 },
      conflicts: [],
      duration: 0,
    };

    try {
      // 验证 Token
      const token = await tokenService.getToken();
      if (!token) {
        throw new Error('未配置 GitHub Token');
      }
      logInfo('Token 验证通过');

      // 收集本地数据
      logDebug('Collecting local data...');
      const localData = await dataSerializer.collectSyncData();
      logInfo('本地数据收集完成', {
        boards: localData.boards.size,
        folders: localData.workspace.folders.length,
      });
      logDebug('Local data collected', {
        boards: localData.boards.size,
        folders: localData.workspace.folders.length,
        currentBoardId: localData.workspace.currentBoardId,
      });

      // 获取或创建 Gist
      const config = await this.getConfig();
      logDebug('Config', {
        gistId: config.gistId,
        lastSyncTime: config.lastSyncTime,
        enabled: config.enabled,
      });
      
      let remoteManifest: SyncManifest | null = null;
      let remoteFiles: Record<string, string> = {};

      // 标记是否需要用本地覆盖远程（解密失败时）
      let shouldOverwriteRemote = false;
      
      if (config.gistId) {
        logDebug('Using existing gistId', { gistId: maskId(config.gistId) });
        gitHubApiService.setGistId(config.gistId);
        try {
          // 获取远程数据
          const gist = await gitHubApiService.getGist();
          logDebug('Got gist', { files: Object.keys(gist.files) });
          
          // 读取所有文件内容
          for (const filename of Object.keys(gist.files)) {
            const content = await gitHubApiService.getGistFileContent(filename);
            if (content) {
              remoteFiles[filename] = content;
            }
          }
          logDebug('Loaded remote files', { count: Object.keys(remoteFiles).length });

          // 获取本地密码并解密 manifest
          const customPassword = await syncPasswordService.getPassword();
          if (remoteFiles[SYNC_FILES.MANIFEST]) {
            try {
              const { cryptoService } = await import('./crypto-service');
              const manifestContent = await cryptoService.decryptOrPassthrough(remoteFiles[SYNC_FILES.MANIFEST], config.gistId, customPassword || undefined);
              remoteManifest = JSON.parse(manifestContent);
            } catch (e) {
              logWarning('Failed to decrypt/parse manifest', { error: String(e) });
              // 解密失败时，检查本地是否有足够的数据
              const hasLocalData = localData.boards.size > 0 ||
                                   localData.prompts.promptHistory.length > 0 ||
                                   localData.tasks.completedTasks.length > 0;

              if (hasLocalData) {
                logWarning('Local has data, will overwrite remote');
                shouldOverwriteRemote = true;
              } else {
                logError('Local is empty, refusing to overwrite remote');
                throw new Error('解密失败且本地无数据，拒绝覆盖远程数据以防止数据丢失');
              }
            }
          }
          logDebug('Remote manifest', {
            version: remoteManifest?.version,
            boards: remoteManifest ? Object.keys(remoteManifest.boards).length : 0,
            shouldOverwriteRemote,
          });
        } catch (error) {
          logError('Error fetching gist', error instanceof Error ? error : new Error(String(error)));
          if (error instanceof GitHubApiError && error.statusCode === 404) {
            // Gist 不存在，需要重新创建
            logDebug('Gist not found (404), will create new one');
            config.gistId = null;
          } else {
            throw error;
          }
        }
      }

      // 如果解密失败，用本地覆盖远程
      if (shouldOverwriteRemote && config.gistId) {
        logInfo('Decryption failed, overwriting remote with local data...');
        const customPassword = await syncPasswordService.getPassword();
        
        // 加密并上传本地数据（不包含 tasks.json，使用分页格式）
        const encryptedFiles = await dataSerializer.serializeToGistFilesEncrypted(localData, config.gistId, customPassword || undefined);
        await gitHubApiService.updateGistFiles(encryptedFiles);
        
        // 使用分页格式同步任务
        try {
          const taskResult = await taskSyncService.syncTasks(config.gistId, customPassword || undefined);
          result.uploaded.tasks = taskResult.uploaded;
        } catch (taskError) {
          logWarning('Tasks paged sync failed during overwrite', taskError);
        }
        
        await this.saveConfig({
          lastSyncTime: Date.now(),
        });

        result.uploaded.boards = localData.boards.size;
        result.uploaded.prompts = localData.prompts.promptHistory.length +
          localData.prompts.videoPromptHistory.length +
          localData.prompts.imagePromptHistory.length;
        result.success = true;
        logSuccess('Remote overwritten with local data');
      } else if (!config.gistId) {
        // 尝试查找已存在的同步 Gist
        logDebug('No gistId in config, searching for existing sync gist...');
        const existingGist = await gitHubApiService.findSyncGist();
        
        if (existingGist) {
          // 找到已存在的 Gist，尝试下载远程数据
          logDebug('Found existing gist', { gistId: maskId(existingGist.id), files: Object.keys(existingGist.files).length });
          gitHubApiService.setGistId(existingGist.id);
          
          // 读取所有文件内容
          for (const filename of Object.keys(existingGist.files)) {
            const content = await gitHubApiService.getGistFileContent(filename);
            if (content) {
              remoteFiles[filename] = content;
              logDebug('Loaded file', { filename, length: content.length });
            }
          }

          // 获取本地保存的自定义密码（如果有）
          const customPassword = await syncPasswordService.getPassword();
          logDebug('Custom password available', { hasPassword: !!customPassword });

          try {
            // 解析远程数据（支持加密和明文）
            logDebug('Deserializing remote data...');
            const remoteData = await dataSerializer.deserializeFromGistFilesWithDecryption(remoteFiles, existingGist.id, customPassword || undefined);
            logDebug('Remote data parsed', {
              boards: remoteData.boards.size,
              folders: remoteData.workspace?.folders?.length || 0,
              tasks: remoteData.tasks?.completedTasks?.length || 0,
            });
            
            // 应用远程数据到本地
            logDebug('Applying remote data to local...');
            const applied = await dataSerializer.applySyncData({
              workspace: remoteData.workspace,
              boards: remoteData.boards,
              prompts: remoteData.prompts,
              tasks: remoteData.tasks,
            });
            logDebug('Applied result', applied);

            await this.saveConfig({
              gistId: existingGist.id,
              lastSyncTime: Date.now(),
              enabled: true,
            });

            result.downloaded.boards = applied.boardsApplied;
            result.downloaded.prompts = applied.promptsApplied;
            result.downloaded.tasks = applied.tasksApplied;
            result.remoteCurrentBoardId = applied.remoteCurrentBoardId;
            result.success = true;
          } catch (decryptError) {
            // 解密失败，用本地覆盖远程
            logWarning('Decryption failed for existing gist, overwriting with local data', { error: String(decryptError) });
            
            const encryptedFiles = await dataSerializer.serializeToGistFilesEncrypted(localData, existingGist.id, customPassword || undefined);
            await gitHubApiService.updateGistFiles(encryptedFiles);
            
            // 使用分页格式同步任务
            try {
              const taskResult = await taskSyncService.syncTasks(existingGist.id, customPassword || undefined);
              result.uploaded.tasks = taskResult.uploaded;
            } catch (taskError) {
              logWarning('Tasks paged sync failed during overwrite', taskError);
            }
            
            await this.saveConfig({
              gistId: existingGist.id,
              lastSyncTime: Date.now(),
              enabled: true,
            });

            result.uploaded.boards = localData.boards.size;
            result.uploaded.prompts = localData.prompts.promptHistory.length +
              localData.prompts.videoPromptHistory.length +
              localData.prompts.imagePromptHistory.length;
            result.success = true;
            logSuccess('Existing gist overwritten with local data');
          }
        } else {
          logDebug('No existing gist found, will create new one with encryption');
          // 没有找到已存在的 Gist，创建新的（加密）
          // 1. 先创建空 Gist 获取 id
          const emptyGist = await gitHubApiService.createSyncGist({
            'manifest.json': JSON.stringify({ version: 1, initializing: true }, null, 2),
          });
          const gistId = emptyGist.id;
          
          // 2. 获取本地保存的自定义密码（如果有）
          const customPassword = await syncPasswordService.getPassword();
          logDebug('Creating new gist', { hasCustomPassword: !!customPassword });
          
          // 3. 使用 gist id 加密数据（不包含 tasks.json，使用分页格式）
          const encryptedFiles = await dataSerializer.serializeToGistFilesEncrypted(localData, gistId, customPassword || undefined);
          
          // 4. 更新 Gist 内容
          gitHubApiService.setGistId(gistId);
          await gitHubApiService.updateGistFiles(encryptedFiles);
          
          // 5. 使用分页格式同步任务
          try {
            const taskResult = await taskSyncService.syncTasks(gistId, customPassword || undefined);
            result.uploaded.tasks = taskResult.uploaded;
          } catch (taskError) {
            logWarning('Tasks paged sync failed during new gist creation', taskError);
          }
          
          const gist = emptyGist;
          
          await this.saveConfig({
            gistId: gist.id,
            lastSyncTime: Date.now(),
            enabled: true,
          });

          result.uploaded.boards = localData.boards.size;
          result.uploaded.prompts = localData.prompts.promptHistory.length +
            localData.prompts.videoPromptHistory.length +
            localData.prompts.imagePromptHistory.length;
          result.success = true;
        }
      } else if (config.gistId) {
        logDebug('Has gistId, comparing changes...');
        
        if (!remoteManifest) {
          logWarning('No remote manifest found, will perform full upload');
          // 没有远程 manifest，执行完整上传
          const { cryptoService } = await import('./crypto-service');
          const filesToUpdate: Record<string, string> = {};
          
          // 获取本地保存的自定义密码（如果有）
          const customPassword = await syncPasswordService.getPassword();
          logDebug('Full upload', { hasCustomPassword: !!customPassword });
          
          // 上传所有画板
          for (const [boardId, board] of localData.boards) {
            const boardJson = JSON.stringify(board);
            filesToUpdate[SYNC_FILES.boardFile(boardId)] = await cryptoService.encrypt(boardJson, config.gistId, customPassword || undefined);
            localData.manifest.boards[boardId] = {
              name: board.name,
              updatedAt: board.updatedAt,
              checksum: dataSerializer.calculateBoardChecksum(board),
            };
          }
          
          // 更新 manifest（加密）
          localData.manifest.updatedAt = Date.now();
          const manifestJson = JSON.stringify(localData.manifest);
          filesToUpdate[SYNC_FILES.MANIFEST] = await cryptoService.encrypt(manifestJson, config.gistId, customPassword || undefined);
          
          // 加密 workspace、prompts、tasks
          const workspaceJson = JSON.stringify(localData.workspace);
          filesToUpdate[SYNC_FILES.WORKSPACE] = await cryptoService.encrypt(workspaceJson, config.gistId, customPassword || undefined);
          
          const promptsJson = JSON.stringify(localData.prompts);
          filesToUpdate[SYNC_FILES.PROMPTS] = await cryptoService.encrypt(promptsJson, config.gistId, customPassword || undefined);
          
          // 注意：不再上传 tasks.json，改用分页格式同步
          
          await gitHubApiService.updateGistFiles(filesToUpdate);
          result.uploaded.boards = localData.boards.size;
          
          // 使用分页格式同步任务
          try {
            const taskResult = await taskSyncService.syncTasks(config.gistId, customPassword || undefined);
            result.uploaded.tasks = taskResult.uploaded;
          } catch (taskError) {
            logWarning('Tasks paged sync failed during initial sync', taskError);
          }
          
          result.success = true;
          
          await this.saveConfig({
            lastSyncTime: Date.now(),
          });
        } else {
          logDebug('Has remoteManifest, comparing changes...');
        // 比较变更
        const changes = dataSerializer.compareBoardChanges(
          localData.boards,
          remoteManifest,
          config.lastSyncTime
        );
        logDebug('Changes detected', {
          toUpload: changes.toUpload,
          toDownload: changes.toDownload,
          conflicts: changes.conflicts,
          toDeleteLocally: changes.toDeleteLocally,
        });
        
        // Log change detection results
        logInfo('变更检测完成', {
          toUpload: changes.toUpload.length,
          toDownload: changes.toDownload.length,
          conflicts: changes.conflicts.length,
          toDeleteLocally: changes.toDeleteLocally.length,
        });

        // 检测本地删除的画板（用于更新远程 tombstone）
        logDebug('Detecting local deletions...');
        const localDeletions = dataSerializer.detectDeletions(
          localData,
          remoteManifest,
          localData.manifest.deviceId
        );
        logDebug('Local deletions detected', {
          boards: localDeletions.deletedBoards.length,
          deletedBoardIds: localDeletions.deletedBoards.map(b => b.id),
        });

        // 安全检查：处理远程要求删除本地画板的情况
        let safeToDeleteLocally: string[] = [];
        if (changes.toDeleteLocally.length > 0) {
          const currentState = await workspaceStorageService.loadState();
          const safetyCheck = this.performSafetyCheck({
            localBoards: localData.boards,
            toDeleteLocally: changes.toDeleteLocally,
            currentBoardId: currentState.currentBoardId || null,
            isFirstSync: !config.lastSyncTime,
            remoteManifest,
          });

          logDebug('Safety check result', {
            passed: safetyCheck.passed,
            warnings: safetyCheck.warnings.length,
            skipped: safetyCheck.skippedItems.length,
            blockedReason: safetyCheck.blockedReason,
          });

          // 记录安全检查结果到同步结果
          result.safetyWarnings = safetyCheck.warnings;
          result.skippedItems = safetyCheck.skippedItems;

          if (safetyCheck.blockedReason) {
            // 严重错误，不执行删除但继续其他同步操作
            logWarning('Safety: Blocked all deletions', { reason: safetyCheck.blockedReason });
          } else if (!safetyCheck.passed && safetyCheck.warnings.length > 0) {
            // 有警告但未阻止，需要用户确认
            // 这里暂时跳过删除，返回警告让 UI 处理
            logWarning('Safety: Warnings present, skipping deletions pending user confirmation');
          } else {
            // 通过安全检查，执行删除（排除被保护的项目）
            const skippedIds = new Set(safetyCheck.skippedItems.map(item => item.id));
            safeToDeleteLocally = changes.toDeleteLocally.filter(id => !skippedIds.has(id));
          }
        }

        // 获取本地保存的自定义密码（如果有）
        const customPassword = await syncPasswordService.getPassword();
        logDebug('Incremental sync', { hasCustomPassword: !!customPassword });

        // 解析远程数据（支持加密和明文，需要在合并前获取）
        const remoteData = await dataSerializer.deserializeFromGistFilesWithDecryption(remoteFiles, config.gistId!, customPassword || undefined);
        logDebug('Remote data for merge', {
          boards: remoteData.boards.size,
          workspaceFolders: remoteData.workspace?.folders?.length || 0,
        });

        // 处理冲突 - 使用智能元素级别合并
        const mergedBoards: Array<{ boardId: string; board: typeof localData.boards extends Map<string, infer T> ? T : never }> = [];
        
        if (changes.conflicts.length > 0) {
          logInfo(`发现 ${changes.conflicts.length} 个冲突画板，开始合并`);
          
          for (const boardId of changes.conflicts) {
            const localBoard = localData.boards.get(boardId);
            const remoteBoard = remoteData.boards.get(boardId);
            const remoteInfo = remoteManifest.boards[boardId];
            
            if (localBoard && remoteBoard && remoteInfo) {
              // 使用元素级别合并
              const mergeResult = dataSerializer.mergeBoardElements(
                localBoard,
                remoteBoard,
                config.lastSyncTime
              );
              
              // 记录合并结果
              mergedBoards.push({ boardId, board: mergeResult.mergedBoard });
              
              // Log merge result
              logInfo(`画板合并完成: ${localBoard.name}`, {
                boardId,
                addedFromLocal: mergeResult.addedFromLocal,
                addedFromRemote: mergeResult.addedFromRemote,
                conflictingElements: mergeResult.conflictingElements.length,
                hasConflicts: mergeResult.hasConflicts,
              });
              
              // 如果有元素级别的冲突，记录到结果中
              if (mergeResult.hasConflicts) {
                result.conflicts.push({
                  type: 'board',
                  id: boardId,
                  name: localBoard.name,
                  localUpdatedAt: localBoard.updatedAt,
                  remoteUpdatedAt: remoteInfo.updatedAt,
                  merged: true,
                  mergeInfo: {
                    addedFromLocal: mergeResult.addedFromLocal,
                    addedFromRemote: mergeResult.addedFromRemote,
                    conflictingElements: mergeResult.conflictingElements.length,
                  },
                });
                
                logWarning(`画板存在元素冲突: ${localBoard.name}`, {
                  boardId,
                  conflictingElements: mergeResult.conflictingElements.length,
                });
              }
              
              logDebug('Merged board', { boardId, addedFromLocal: mergeResult.addedFromLocal, addedFromRemote: mergeResult.addedFromRemote, conflicts: mergeResult.conflictingElements.length });
            }
          }
        }
        
        // 下载远程独有的画板
        if (changes.toDownload.length > 0) {
          logInfo(`下载 ${changes.toDownload.length} 个远程画板`);
          
          // 筛选需要下载的画板（排除已合并的）
          const mergedBoardIds = new Set(mergedBoards.map(m => m.boardId));
          const boardsToDownload = new Map<string, typeof remoteData.boards extends Map<string, infer T> ? T : never>();
          
          for (const boardId of changes.toDownload) {
            if (!mergedBoardIds.has(boardId)) {
              const board = remoteData.boards.get(boardId);
              if (board) {
                boardsToDownload.set(boardId, board);
                logDebug('Will download board', { boardId, name: board.name });
              } else {
                logDebug('Board not found in remote data', { boardId });
              }
            }
          }
          logDebug('Boards to download after filtering', { count: boardsToDownload.size });

          // 应用远程数据到本地（包括提示词、任务和删除）
          const applied = await dataSerializer.applySyncData({
            workspace: remoteData.workspace,
            boards: boardsToDownload,
            prompts: remoteData.prompts,
            tasks: remoteData.tasks,
            deletedBoardIds: safeToDeleteLocally,
          });
          logDebug('Applied remote data', applied);
          
          // Log download results
          logSuccess('远程数据下载完成', {
            boards: applied.boardsApplied,
            prompts: applied.promptsApplied,
            tasks: applied.tasksApplied,
            deleted: applied.boardsDeleted,
          });

          result.downloaded.boards = applied.boardsApplied;
          result.downloaded.prompts = applied.promptsApplied;
          result.downloaded.tasks = applied.tasksApplied;
          result.remoteCurrentBoardId = applied.remoteCurrentBoardId;
          
          // 记录删除统计
          if (applied.boardsDeleted > 0) {
            result.deleted = {
              boards: applied.boardsDeleted,
              prompts: applied.promptsDeleted,
              tasks: applied.tasksDeleted,
              media: 0,
            };
          }
        } else {
          logDebug('No boards to download');
          // 即使没有画板要下载，也要处理删除
          if (safeToDeleteLocally.length > 0) {
            const applied = await dataSerializer.applySyncData({
              workspace: null,
              boards: new Map(),
              prompts: null,
              tasks: null,
              deletedBoardIds: safeToDeleteLocally,
            });
            
            if (applied.boardsDeleted > 0) {
              result.deleted = {
                boards: applied.boardsDeleted,
                prompts: applied.promptsDeleted,
                tasks: applied.tasksDeleted,
                media: 0,
              };
            }
          }
          
          // 设置 remoteCurrentBoardId
          result.remoteCurrentBoardId = remoteData.workspace?.currentBoardId || null;
          logDebug('Set remoteCurrentBoardId from workspace', { remoteCurrentBoardId: result.remoteCurrentBoardId });
        }

        // 保存合并后的画板到本地和远程
        if (mergedBoards.length > 0) {
          for (const { boardId, board } of mergedBoards) {
            // 更新本地
            await workspaceStorageService.saveBoard(board);
            // 更新本地数据用于上传
            localData.boards.set(boardId, board);
          }
          // 合并的画板需要上传
          changes.toUpload.push(...mergedBoards.map(m => m.boardId));
          result.downloaded.boards += mergedBoards.length;
        }

        // 上传本地变更（加密）+ 处理本地删除的画板
        const hasLocalUploads = changes.toUpload.length > 0;
        const hasLocalDeletions = localDeletions.deletedBoards.length > 0;
        
        if (hasLocalUploads || hasLocalDeletions) {
          logInfo('开始上传本地变更', {
            boardsToUpload: changes.toUpload.length,
            deletedBoards: localDeletions.deletedBoards.length,
          });
          
          const filesToUpdate: Record<string, string> = {};
          const uploadedBoardIds = new Set<string>();
          const { cryptoService } = await import('./crypto-service');
          
          // 上传修改的画板
          for (const boardId of changes.toUpload) {
            if (uploadedBoardIds.has(boardId)) continue;
            uploadedBoardIds.add(boardId);
            
            const board = localData.boards.get(boardId);
            if (board) {
              // 加密画板数据
              const boardJson = JSON.stringify(board);
              filesToUpdate[SYNC_FILES.boardFile(boardId)] = await cryptoService.encrypt(boardJson, config.gistId!, customPassword || undefined);
              localData.manifest.boards[boardId] = {
                name: board.name,
                updatedAt: board.updatedAt,
                checksum: dataSerializer.calculateBoardChecksum(board),
              };
            }
          }

          // 处理本地删除的画板：更新 manifest 中的 tombstone（不删除远程文件）
          if (hasLocalDeletions) {
            logDebug('标记删除的画板为 tombstone', { boards: localDeletions.deletedBoards.map(b => b.id) });
            const updatedManifest = dataSerializer.markBoardsAsDeleted(
              localData.manifest,
              localDeletions.deletedBoards,
              localData.manifest.deviceId
            );
            localData.manifest = updatedManifest;
          }

          // 更新 manifest（加密）
          localData.manifest.updatedAt = Date.now();
          const manifestJson = JSON.stringify(localData.manifest);
          filesToUpdate[SYNC_FILES.MANIFEST] = await cryptoService.encrypt(manifestJson, config.gistId!, customPassword || undefined);

          // 加密 workspace
          const workspaceJson = JSON.stringify(localData.workspace);
          filesToUpdate[SYNC_FILES.WORKSPACE] = await cryptoService.encrypt(workspaceJson, config.gistId!, customPassword || undefined);

          // 加密提示词（注意：不再上传 tasks.json，改用分页格式）
          const promptsJson = JSON.stringify(localData.prompts);
          filesToUpdate[SYNC_FILES.PROMPTS] = await cryptoService.encrypt(promptsJson, config.gistId!, customPassword || undefined);

          await gitHubApiService.updateGistFiles(filesToUpdate);
          result.uploaded.boards = changes.toUpload.length;
          
          // 使用分页格式同步任务
          try {
            const taskResult = await taskSyncService.syncTasks(config.gistId!, customPassword || undefined);
            result.uploaded.tasks = taskResult.uploaded;
          } catch (taskError) {
            logWarning('Tasks paged sync failed during incremental sync', taskError);
          }
          
          // Log upload success
          logSuccess('本地变更上传完成', {
            boards: changes.toUpload.length,
            files: Object.keys(filesToUpdate).length,
          });
          
          // 记录上传的删除标记数量
          if (hasLocalDeletions && !result.deleted) {
            result.deleted = { boards: 0, prompts: 0, tasks: 0, media: 0 };
          }
          if (hasLocalDeletions && result.deleted) {
            // 注意：这里只是上传了 tombstone，不是删除本地数据
            logDebug('Tombstone 上传完成', { count: localDeletions.deletedBoards.length });
            logInfo('删除标记上传完成', { count: localDeletions.deletedBoards.length });
            await this.clearLocalDeletions(localDeletions.deletedBoards.map(b => b.id));
          }
        }

          // 更新配置
          await this.saveConfig({
            lastSyncTime: Date.now(),
          });

          result.success = true;
        }
      }

      this.setStatus('synced');
      this.pendingChanges = false;

      // Log sync success
      logSuccess('同步完成', {
        uploaded: result.uploaded,
        downloaded: result.downloaded,
        conflicts: result.conflicts.length,
      });

      // 异步同步当前画布的媒体（自动同步）
      const currentBoardId = localData.workspace.currentBoardId;
      if (currentBoardId && result.uploaded.boards > 0) {
        this.syncCurrentBoardMediaAsync(currentBoardId);
      }

      // 如果下载了数据，异步下载已同步的媒体文件
      if (result.downloaded.tasks > 0 || result.downloaded.boards > 0) {
        this.downloadSyncedMediaAsync();
      }
    } catch (error) {
      logError('同步失败', error instanceof Error ? error : new Error(String(error)));
      result.error = error instanceof Error ? error.message : '同步失败';
      this.setStatus('error', result.error);
      
      // Log sync error
      logError('同步失败', error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.syncInProgress = false;
      result.duration = Date.now() - startTime;
      
      // End sync session and log duration
      logInfo('同步会话结束', { duration: result.duration, success: result.success });
      endSyncSession();
      
      // Cleanup old logs periodically
      cleanupOldLogs().catch(() => {/* ignore */});
    }

    return result;
  }

  /**
   * 异步同步当前画布的媒体（不阻塞同步流程）
   */
  private async syncCurrentBoardMediaAsync(currentBoardId: string): Promise<void> {
    try {
      logDebug('Starting async current board media sync', { currentBoardId });
      const mediaResult = await mediaSyncService.syncCurrentBoardMedia(currentBoardId, (current, total, url, status) => {
        logDebug('Media sync progress', { status, current, total, url });
      });
      logSuccess('Current board media sync completed', { succeeded: mediaResult.succeeded, failed: mediaResult.failed, skipped: mediaResult.skipped });
    } catch (error) {
      logError('Current board media sync failed', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 上传合并后的任务数据到远程（使用分页格式）
   * 在 pullFromRemote 合并完成后调用，确保本地有但远程没有的任务也能同步到远程
   */
  private async uploadMergedTasksToRemote(
    gistId: string, 
    customPassword?: string,
    remoteManifest?: SyncManifest
  ): Promise<void> {
    try {
      logDebug('uploadMergedTasksToRemote: Starting with paged format...');
      
      // 使用分页同步服务进行增量同步，避免生成大文件
      const result = await taskSyncService.syncTasks(gistId, customPassword);
      
      logSuccess('uploadMergedTasksToRemote: Tasks synced', {
        uploaded: result.uploaded,
        downloaded: result.downloaded,
        skipped: result.skipped,
      });
    } catch (error) {
      // 上传任务失败不应阻塞主流程，只记录日志
      logError('uploadMergedTasksToRemote: Failed to sync tasks', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 异步下载已同步的媒体文件（不阻塞同步流程）
   */
  private async downloadSyncedMediaAsync(): Promise<void> {
    try {
      logDebug('Starting async media download...');
      
      // 下载远程媒体
      const result = await mediaSyncService.downloadAllRemoteMedia((current, total, url, status) => {
        logDebug('Downloading media', { current, total, url, status });
      });
      logSuccess('Media download completed', { succeeded: result.succeeded, failed: result.failed, skipped: result.skipped });
    } catch (error) {
      logError('Media download failed', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 以本地为准同步（增量上传本地数据）
   * 只上传本地比远程新的数据，减少网络请求
   * 数据使用 AES-GCM 加密存储
   */
  async pushToRemote(): Promise<SyncResult> {
    if (this.syncInProgress) {
      return {
        success: false,
        uploaded: { boards: 0, prompts: 0, tasks: 0, media: 0 },
        downloaded: { boards: 0, prompts: 0, tasks: 0, media: 0 },
        conflicts: [],
        error: '同步正在进行中',
        duration: 0,
      };
    }

    const startTime = Date.now();
    this.syncInProgress = true;
    this.setStatus('syncing', '正在上传本地数据...');

    const result: SyncResult = {
      success: false,
      uploaded: { boards: 0, prompts: 0, tasks: 0, media: 0 },
      downloaded: { boards: 0, prompts: 0, tasks: 0, media: 0 },
      conflicts: [],
      duration: 0,
    };

    try {
      const token = await tokenService.getToken();
      if (!token) {
        throw new Error('未配置 GitHub Token');
      }

      // 获取自定义加密密码（如果设置了）
      const customPassword = await syncPasswordService.getPassword();

      // 收集本地数据
      logDebug('pushToRemote: 收集本地数据');
      const localData = await dataSerializer.collectSyncData();

      const config = await this.getConfig();

      if (!config.gistId) {
        // 没有 Gist，先创建空 Gist 获取 id，然后加密数据（全量上传）
        logDebug('pushToRemote: 创建新 Gist');
        
        const emptyGist = await gitHubApiService.createSyncGist({
          'manifest.json': JSON.stringify({ version: 1, initializing: true }, null, 2),
        });
        const gistId = emptyGist.id;
        logDebug('pushToRemote: 创建空 Gist 完成', { gistId: maskId(gistId) });
        
        const encryptedFiles = await dataSerializer.serializeToGistFilesEncrypted(localData, gistId, customPassword || undefined);
        
        gitHubApiService.setGistId(gistId);
        await gitHubApiService.updateGistFiles(encryptedFiles);
        
        // 使用分页格式同步任务
        try {
          const taskResult = await taskSyncService.syncTasks(gistId, customPassword || undefined);
          result.uploaded.tasks = taskResult.uploaded;
        } catch (taskError) {
          logWarning('pushToRemote: Tasks paged sync failed during new gist creation', taskError);
        }
        
        await this.saveConfig({
          gistId,
          lastSyncTime: Date.now(),
          enabled: true,
        });
        
        result.uploaded.boards = localData.boards.size;
      } else {
        // 增量上传：只上传有变化的数据
        logDebug('pushToRemote: 增量上传', { gistId: maskId(config.gistId) });
        gitHubApiService.setGistId(config.gistId);
        
        const { cryptoService } = await import('./crypto-service');
        
        // 获取远程 manifest 来比较（需要解密）
        let remoteManifest: SyncManifest | null = null;
        try {
          const manifestContent = await gitHubApiService.getGistFileContent(SYNC_FILES.MANIFEST);
          if (manifestContent) {
            const manifestJson = await cryptoService.decryptOrPassthrough(manifestContent, config.gistId, customPassword || undefined);
            remoteManifest = JSON.parse(manifestJson);
          }
        } catch (e) {
          logDebug('pushToRemote: 无远程 manifest 或解密失败，将上传全部');
        }
        const filesToUpdate: Record<string, string> = {};
        let boardsUploaded = 0;
        
        if (remoteManifest) {
          // 增量比较：只上传有变化的画板
          let processedCount = 0;
          for (const [boardId, board] of localData.boards) {
            const localChecksum = dataSerializer.calculateBoardChecksum(board);
            const remoteInfo = remoteManifest.boards[boardId];
            
            // 如果远程没有此画板，或 checksum 不同，则上传
            if (!remoteInfo || remoteInfo.checksum !== localChecksum) {
              const boardJson = JSON.stringify(board);
              filesToUpdate[SYNC_FILES.boardFile(boardId)] = await cryptoService.encrypt(boardJson, config.gistId, customPassword || undefined);
              boardsUploaded++;
              logDebug('pushToRemote: 画板需要上传 (checksum 变化)', { boardId });
            }
            // 每处理 3 个画板让出主线程，避免 UI 阻塞
            processedCount++;
            if (processedCount % 3 === 0) {
              await yieldToMain();
            }
          }
          
          // 软删除远程有但本地没有的画板（标记 deletedAt，保留文件以便恢复）
          for (const remoteBoardId of Object.keys(remoteManifest.boards)) {
            const remoteInfo = remoteManifest.boards[remoteBoardId];
            // 跳过已经标记为删除的画板
            if (remoteInfo.deletedAt) continue;
            
            if (!localData.boards.has(remoteBoardId)) {
              // 软删除：在 manifest 中标记 deletedAt，但保留画板文件
              localData.manifest.boards[remoteBoardId] = {
                ...remoteInfo,
                deletedAt: Date.now(),
              };
              logDebug('pushToRemote: 画板软删除 (移入回收站)', { boardId: remoteBoardId });
            }
          }
        } else {
          // 没有远程 manifest，上传所有画板
          let processedCount = 0;
          for (const [boardId, board] of localData.boards) {
            const boardJson = JSON.stringify(board);
            filesToUpdate[SYNC_FILES.boardFile(boardId)] = await cryptoService.encrypt(boardJson, config.gistId, customPassword || undefined);
            boardsUploaded++;
            // 每处理 3 个画板让出主线程，避免 UI 阻塞
            processedCount++;
            if (processedCount % 3 === 0) {
              await yieldToMain();
            }
          }
        }
        
        // 始终更新 manifest、workspace、prompts、tasks（这些文件较小，都加密）
        const manifestJson = JSON.stringify(localData.manifest);
        filesToUpdate[SYNC_FILES.MANIFEST] = await cryptoService.encrypt(manifestJson, config.gistId, customPassword || undefined);
        
        const workspaceJson = JSON.stringify(localData.workspace);
        filesToUpdate[SYNC_FILES.WORKSPACE] = await cryptoService.encrypt(workspaceJson, config.gistId, customPassword || undefined);
        
        const promptsJson = JSON.stringify(localData.prompts);
        filesToUpdate[SYNC_FILES.PROMPTS] = await cryptoService.encrypt(promptsJson, config.gistId, customPassword || undefined);
        
        // 注意：不再上传 tasks.json，改用分页格式
        
        // 只有有变化时才更新
        if (Object.keys(filesToUpdate).length > 0) {
          await gitHubApiService.updateGistFiles(filesToUpdate);
          logDebug('pushToRemote: 增量上传完成', { boardsUploaded });
        }
        
        result.uploaded.boards = boardsUploaded;
        
        // 使用分页格式同步任务
        try {
          const taskResult = await taskSyncService.syncTasks(config.gistId, customPassword || undefined);
          result.uploaded.tasks = taskResult.uploaded;
        } catch (taskError) {
          logWarning('pushToRemote: Tasks paged sync failed', taskError);
        }
        
        await this.saveConfig({
          lastSyncTime: Date.now(),
        });
      }

      result.uploaded.prompts = localData.prompts.promptHistory.length +
        localData.prompts.videoPromptHistory.length +
        localData.prompts.imagePromptHistory.length;
      result.success = true;

      logSuccess('pushToRemote: 上传成功', result.uploaded);
      this.setStatus('synced');
      this.pendingChanges = false;
      // 已以本地为准覆盖远程，本地删除已生效，清除待同步删除记录
      const pending = await this.getLocalDeletionsPendingSync();
      if (pending.size > 0) {
        await this.clearLocalDeletions(Array.from(pending.keys()));
      }

      // 异步同步当前画布的媒体（不阻塞主流程）
      const currentBoardId = localData.workspace.currentBoardId;
      if (currentBoardId) {
        this.syncCurrentBoardMediaAsync(currentBoardId);
      }
    } catch (error) {
      logError('pushToRemote 失败', error instanceof Error ? error : new Error(String(error)));
      result.error = error instanceof Error ? error.message : '上传失败';
      this.setStatus('error', result.error);
    } finally {
      this.syncInProgress = false;
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * 以远程为准同步（增量下载远程数据）
   * 只下载远程比本地新的数据，减少网络请求
   */
  async pullFromRemote(): Promise<SyncResult> {
    logInfo('pullFromRemote START');
    
    if (this.syncInProgress) {
      logDebug('pullFromRemote: Sync already in progress, aborting');
      return {
        success: false,
        uploaded: { boards: 0, prompts: 0, tasks: 0, media: 0 },
        downloaded: { boards: 0, prompts: 0, tasks: 0, media: 0 },
        conflicts: [],
        error: '同步正在进行中',
        duration: 0,
      };
    }

    const startTime = Date.now();
    this.syncInProgress = true;
    this.setStatus('syncing', '正在下载远程数据...');

    const result: SyncResult = {
      success: false,
      uploaded: { boards: 0, prompts: 0, tasks: 0, media: 0 },
      downloaded: { boards: 0, prompts: 0, tasks: 0, media: 0 },
      conflicts: [],
      duration: 0,
    };

    try {
      const token = await tokenService.getToken();
      if (!token) {
        throw new Error('未配置 GitHub Token');
      }

      // 获取自定义解密密码（如果设置了）
      const customPassword = await syncPasswordService.getPassword();

      const config = await this.getConfig();
      let gistId = config.gistId;

      // 如果没有配置 Gist，尝试查找
      if (!gistId) {
        logDebug('pullFromRemote: No gistId, searching for sync gist...');
        const existingGist = await gitHubApiService.findSyncGist();
        if (existingGist) {
          gistId = existingGist.id;
        } else {
          throw new Error('未找到可同步的 Gist，请先上传数据或在其他设备创建同步');
        }
      }

      gitHubApiService.setGistId(gistId);
      const { cryptoService } = await import('./crypto-service');
      
      // 先获取远程 manifest 来决定需要下载哪些文件（解密）
      logDebug('pullFromRemote: 获取远程 manifest');
      const manifestContent = await gitHubApiService.getGistFileContent(SYNC_FILES.MANIFEST);
      if (!manifestContent) {
        throw new Error('远程数据为空');
      }
      
      const manifestJson = await cryptoService.decryptOrPassthrough(manifestContent, gistId, customPassword || undefined);
      const remoteManifest: SyncManifest = JSON.parse(manifestJson);
      logDebug('pullFromRemote: 远程画板数量', { count: Object.keys(remoteManifest.boards).length });
      
      // 收集本地数据用于比较
      const localData = await dataSerializer.collectSyncData();
      
      // 获取上次同步时间，用于判断本地删除
      const lastSyncTime = config.lastSyncTime;
      logDebug('pullFromRemote: lastSyncTime', { lastSyncTime });
      
      // 本地已删除、尚未同步的画板（ID -> 删除时间戳）
      const localDeletionsPending = await this.getLocalDeletionsPendingSync();
      logDebug('pullFromRemote: 待同步本地删除', { 
        count: localDeletionsPending.size,
        pending: localDeletionsPending.size > 0 
          ? Object.fromEntries(localDeletionsPending) 
          : 'none'
      });
      
      // 确定需要下载的画板（增量）
      const boardsToDownload: string[] = [];
      const boardsToDelete: string[] = [];
      // 本地有更新修改、跳过下载的画板
      const boardsSkippedDueToLocalNewer: Array<{
        id: string;
        name: string;
        localUpdatedAt: number;
        remoteUpdatedAt: number;
      }> = [];
      // 注意："以远程为准"模式不再跳过任何画板
      // boardsSkippedDueToLocalDeletion 保留用于日志兼容性，但始终为空
      const boardsSkippedDueToLocalDeletion: string[] = [];
      
      // 检查远程画板
      // 注意："以远程为准"（pullFromRemote）应该下载所有远程未删除的画板，
      // 忽略 lastSyncTime 的判断，因为用户明确选择了"以远程为准"
      for (const [remoteBoardId, remoteInfo] of Object.entries(remoteManifest.boards)) {
        // 远程已标记删除（tombstone），不下载
        if (remoteInfo.deletedAt) {
          logDebug('pullFromRemote: 画板已远程删除，跳过', { boardId: remoteBoardId });
          continue;
        }
        
        // "以远程为准"模式：忽略本地删除状态，强制恢复远程画板
        // 但仍记录日志以便调试
        const localDeletedAt = localDeletionsPending.get(remoteBoardId);
        if (localDeletedAt !== undefined) {
          logDebug('pullFromRemote: 画板本地已删除，但远程为准将恢复', { 
            boardId: remoteBoardId, 
            localDeletedAt, 
            remoteUpdatedAt: remoteInfo.updatedAt 
          });
          // 清除本地删除记录，因为用户选择了以远程为准
          await this.clearLocalDeletions([remoteBoardId]);
        }
        
        const localBoard = localData.boards.get(remoteBoardId);
        if (!localBoard) {
          // 本地没有此画板 → 下载
          logDebug('pullFromRemote: 画板本地不存在，将下载', { boardId: remoteBoardId });
          boardsToDownload.push(remoteBoardId);
        } else {
          // 增量同步：使用 checksum 判断是否需要下载
          // 如果本地和远程的 checksum 相同，说明内容一致，跳过下载
          const localChecksum = dataSerializer.calculateBoardChecksum(localBoard);
          
          if (localChecksum === remoteInfo.checksum) {
            // checksum 相同，内容一致，跳过下载
            logDebug('pullFromRemote: checksum 匹配，跳过下载', {
              boardId: remoteBoardId,
              checksum: localChecksum,
            });
            // 不添加到 boardsToDownload，自然跳过
          } else {
            // checksum 不同，需要比较修改时间决定是否下载
            const localUpdatedAt = localBoard.updatedAt || 0;
            const remoteUpdatedAt = remoteInfo.updatedAt || 0;
            
            // 关键逻辑：如果本地修改时间比远程新，说明本地有新修改，不应被覆盖
            if (localUpdatedAt > remoteUpdatedAt) {
              // 本地更新时间比远程新 → 跳过下载，保留本地修改
              logDebug('pullFromRemote: 本地更新，跳过下载', {
                boardId: remoteBoardId,
                localUpdatedAt: new Date(localUpdatedAt).toISOString(),
                remoteUpdatedAt: new Date(remoteUpdatedAt).toISOString(),
              });
              boardsSkippedDueToLocalNewer.push({
                id: remoteBoardId,
                name: localBoard.name || remoteInfo.name || remoteBoardId,
                localUpdatedAt,
                remoteUpdatedAt,
              });
            } else {
              // 远程更新时间比本地新或相等 → 下载远程版本
              logDebug('pullFromRemote: checksum 不匹配，将下载远程版本', {
                boardId: remoteBoardId,
                localUpdatedAt: new Date(localUpdatedAt).toISOString(),
                remoteUpdatedAt: new Date(remoteUpdatedAt).toISOString(),
              });
              boardsToDownload.push(remoteBoardId);
            }
          }
        }
      }
      
      // 检查本地有但远程没有的画板（需要删除）
      for (const localBoardId of localData.boards.keys()) {
        if (!remoteManifest.boards[localBoardId]) {
          boardsToDelete.push(localBoardId);
        }
      }
      
      logDebug('pullFromRemote: 同步计划', { 
        toDownload: boardsToDownload.length, 
        toDelete: boardsToDelete.length, 
        skippedLocalDeletion: boardsSkippedDueToLocalDeletion.length,
        skippedLocalNewer: boardsSkippedDueToLocalNewer.length 
      });
      if (boardsSkippedDueToLocalNewer.length > 0) {
        logDebug('pullFromRemote: 跳过的画板 (本地更新)', { 
          boards: boardsSkippedDueToLocalNewer.map(b => b.id)
        });
      }
      
      // 只下载需要的文件
      const remoteFiles: Record<string, string> = {};
      remoteFiles[SYNC_FILES.MANIFEST] = manifestContent;
      
      // 始终下载 workspace、prompts、tasks（这些文件较小）
      logDebug('pullFromRemote: 下载 workspace 文件');
      const workspaceContent = await gitHubApiService.getGistFileContent(SYNC_FILES.WORKSPACE);
      if (workspaceContent) {
        remoteFiles[SYNC_FILES.WORKSPACE] = workspaceContent;
        logDebug('pullFromRemote: workspace.json 已下载', { length: workspaceContent.length });
      } else {
        logWarning('pullFromRemote: workspace.json 未找到或为空');
      }
      
      logDebug('pullFromRemote: 下载 prompts 文件');
      const promptsContent = await gitHubApiService.getGistFileContent(SYNC_FILES.PROMPTS);
      if (promptsContent) {
        remoteFiles[SYNC_FILES.PROMPTS] = promptsContent;
        logDebug('pullFromRemote: prompts.json 已下载', { length: promptsContent.length });
      } else {
        logWarning('pullFromRemote: prompts.json 未找到或为空');
      }
      
      // 注意：tasks 使用分页格式同步，由 taskSyncService 单独处理
      
      // 只下载需要更新的画板
      logDebug('pullFromRemote: 下载画板文件', { count: boardsToDownload.length });
      for (const boardId of boardsToDownload) {
        const boardFileName = SYNC_FILES.boardFile(boardId);
        logDebug('pullFromRemote: 下载画板', { boardId });
        const boardContent = await gitHubApiService.getGistFileContent(boardFileName);
        if (boardContent) {
          remoteFiles[boardFileName] = boardContent;
          logDebug('pullFromRemote: 画板已下载', { boardId, length: boardContent.length });
        } else {
          logWarning('pullFromRemote: 画板未找到或为空', { boardId });
        }
      }
      
      logDebug('pullFromRemote: 文件下载摘要', {
        totalFiles: Object.keys(remoteFiles).length,
        fileNames: Object.keys(remoteFiles),
      });

      // 解析远程数据（支持加密和明文）
      logDebug('pullFromRemote: 开始反序列化');
      const remoteData = await dataSerializer.deserializeFromGistFilesWithDecryption(remoteFiles, gistId, customPassword || undefined);
      logDebug('pullFromRemote: 反序列化完成', {
        workspace: remoteData.workspace ? {
          currentBoardId: remoteData.workspace.currentBoardId,
          folders: remoteData.workspace.folders?.length || 0,
          boardMetadata: remoteData.workspace.boardMetadata?.length || 0,
        } : null,
        boardsCount: remoteData.boards.size,
        promptsCount: remoteData.prompts ? 
          (remoteData.prompts.promptHistory?.length || 0) + 
          (remoteData.prompts.videoPromptHistory?.length || 0) + 
          (remoteData.prompts.imagePromptHistory?.length || 0) : 0,
        tasksCount: remoteData.tasks?.completedTasks?.length || 0,
      });
      
      // 合并：保留本地不需要更新的画板
      const boardsToApply = new Map(remoteData.boards);
      
      // 添加本地不需要更新的画板（远程也有，但 checksum 相同）
      for (const [localBoardId, localBoard] of localData.boards) {
        if (!boardsToDownload.includes(localBoardId) && !boardsToDelete.includes(localBoardId)) {
          // 这个画板不需要更新，保留本地版本
          if (!boardsToApply.has(localBoardId)) {
            boardsToApply.set(localBoardId, localBoard);
          }
        }
      }
      
      // 过滤 workspace：只保留 boardsToApply 中画板的元数据，避免本地已删除画板被恢复后出现孤立元数据
      // 同时排除因本地删除而跳过的画板
      const appliedBoardIds = new Set(boardsToApply.keys());
      const skippedBoardIds = new Set(boardsSkippedDueToLocalDeletion);
      let workspaceToApply = remoteData.workspace;
      if (workspaceToApply?.boardMetadata) {
        workspaceToApply = {
          ...workspaceToApply,
          boardMetadata: workspaceToApply.boardMetadata.filter(m => 
            appliedBoardIds.has(m.id) && !skippedBoardIds.has(m.id)
          ),
          // 如果远程的 currentBoardId 是被本地删除的画板，不切换到它
          currentBoardId: workspaceToApply.currentBoardId && 
            appliedBoardIds.has(workspaceToApply.currentBoardId) && 
            !skippedBoardIds.has(workspaceToApply.currentBoardId)
              ? workspaceToApply.currentBoardId
              : null,
        };
      }
      
      logDebug('pullFromRemote: Workspace 已过滤', { 
        appliedBoardIds: appliedBoardIds.size, 
        skippedBoardIds: skippedBoardIds.size,
        currentBoardId: workspaceToApply?.currentBoardId || null 
      });
      
      logDebug('pullFromRemote: 开始应用同步数据', { 
        boardsCount: boardsToApply.size,
        boardIds: Array.from(boardsToApply.keys()),
        workspace: workspaceToApply ? {
          currentBoardId: workspaceToApply.currentBoardId,
          folders: workspaceToApply.folders?.length || 0,
          boardMetadata: workspaceToApply.boardMetadata?.length || 0,
        } : null
      });
      
      const applied = await dataSerializer.applySyncData({
        workspace: workspaceToApply,
        boards: boardsToApply,
        prompts: remoteData.prompts,
        tasks: remoteData.tasks,
      });
      
      logDebug('pullFromRemote: 应用同步数据完成', {
        boardsApplied: applied.boardsApplied,
        promptsApplied: applied.promptsApplied,
        tasksApplied: applied.tasksApplied,
        remoteCurrentBoardId: applied.remoteCurrentBoardId,
      });

      await this.saveConfig({
        gistId,
        lastSyncTime: Date.now(),
        enabled: true,
      });

      result.downloaded.boards = boardsToDownload.length;
      result.downloaded.prompts = applied.promptsApplied;
      result.downloaded.tasks = applied.tasksApplied;
      result.remoteCurrentBoardId = applied.remoteCurrentBoardId;
      result.success = true;
      
      // 记录因本地有更新修改而跳过下载的画板
      if (boardsSkippedDueToLocalNewer.length > 0) {
        result.skippedItems = boardsSkippedDueToLocalNewer.map(b => ({
          id: b.id,
          name: b.name,
          reason: 'local_newer' as const,
          localUpdatedAt: b.localUpdatedAt,
          remoteUpdatedAt: b.remoteUpdatedAt,
        }));
      }

      logSuccess('pullFromRemote: 下载成功', {
        downloaded: result.downloaded,
        skippedItems: result.skippedItems?.length || 0,
        remoteCurrentBoardId: result.remoteCurrentBoardId,
      });
      this.setStatus('synced');
      this.pendingChanges = false;
      
      // 清理不再需要的本地删除记录：
      // 1. 已经被下载/恢复的画板（远程更新更新）
      // 2. 远程已经不存在的画板（不需要再跟踪删除状态）
      const deletionsToClean: string[] = [];
      for (const [deletedBoardId] of localDeletionsPending) {
        const remoteBoard = remoteManifest.boards[deletedBoardId];
        if (!remoteBoard) {
          // 远程已经没有这个画板了，删除记录可以清除
          deletionsToClean.push(deletedBoardId);
        } else if (boardsToDownload.includes(deletedBoardId)) {
          // 已经被恢复了，删除记录可以清除
          deletionsToClean.push(deletedBoardId);
        }
        // boardsSkippedDueToLocalDeletion 中的画板保留删除记录，等待 push 到远程
      }
      if (deletionsToClean.length > 0) {
        logDebug('pullFromRemote: 清理删除记录', { count: deletionsToClean.length });
        await this.clearLocalDeletions(deletionsToClean);
      }

      // 合并完成后，自动上传任务数据到远程（确保双向同步）
      await this.uploadMergedTasksToRemote(gistId, customPassword || undefined, remoteManifest);

      // 初始化分片系统（用于媒体同步）
      await this.initializeShardingSystem(gistId);

      // 异步下载媒体文件（总是尝试，因为任务可能已存在但媒体未缓存）
      this.downloadSyncedMediaAsync();
    } catch (error) {
      logError('pullFromRemote 失败', error instanceof Error ? error : new Error(String(error)));
      
      // 检查是否是密码错误
      if (error instanceof DecryptionError) {
        result.error = error.message;
        result.needsPassword = error.needsPassword;
      } else {
        result.error = error instanceof Error ? error.message : '下载失败';
      }
      
      this.setStatus('error', result.error);
    } finally {
      this.syncInProgress = false;
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * 标记有本地变更
   */
  markDirty(): void {
    logDebug('markDirty called', { status: this.status, syncInProgress: this.syncInProgress });
    this.pendingChanges = true;
    if (this.status === 'synced') {
      this.setStatus('local_changes');
    }
    this.scheduleAutoSync();
  }

  /**
   * 检查是否有待同步的变更
   */
  hasPendingChanges(): boolean {
    return this.pendingChanges;
  }

  /**
   * 获取本地已删除、尚未同步到远程的画板（ID -> 删除时间戳）
   * 下载远程时按时间戳判断是否恢复
   */
  async getLocalDeletionsPendingSync(): Promise<Map<string, number>> {
    // 兼容旧格式（string[]）和新格式（Record<string, number>）
    const data = await kvStorageService.get<string[] | Record<string, number>>(LOCAL_DELETIONS_PENDING_KEY);
    logDebug('getLocalDeletionsPendingSync: 从存储加载数据', { hasData: !!data });
    if (!data) return new Map();
    
    // 旧格式：string[] -> 转换为 Map，使用当前时间作为删除时间
    if (Array.isArray(data)) {
      logDebug('getLocalDeletionsPendingSync: 从旧格式迁移');
      const now = Date.now();
      const map = new Map<string, number>();
      data.forEach(id => map.set(id, now));
      // 迁移到新格式
      await kvStorageService.set(LOCAL_DELETIONS_PENDING_KEY, Object.fromEntries(map));
      return map;
    }
    
    // 新格式：Record<string, number>
    const map = new Map(Object.entries(data));
    logDebug('getLocalDeletionsPendingSync: 已加载删除记录', { count: map.size });
    return map;
  }

  /**
   * 记录本地删除的画板（带时间戳）
   * 用于下载远程时按时间戳判断是否恢复
   */
  async recordLocalDeletion(boardId: string): Promise<void> {
    const map = await this.getLocalDeletionsPendingSync();
    const deletedAt = Date.now();
    map.set(boardId, deletedAt);
    logDebug('recordLocalDeletion: 记录本地删除', { boardId, deletedAt });
    await kvStorageService.set(LOCAL_DELETIONS_PENDING_KEY, Object.fromEntries(map));
  }

  /**
   * 立即将画板删除同步到远程回收站
   * 在远程 manifest 中标记 deletedAt，保留画板文件以便恢复
   */
  async syncBoardDeletion(boardId: string): Promise<{ success: boolean; error?: string }> {
    logDebug('syncBoardDeletion', { boardId });
    
    // 检查是否已配置
    if (!tokenService.hasToken()) {
      logDebug('syncBoardDeletion: 无 Token，跳过');
      return { success: false, error: '未配置 GitHub Token' };
    }

    const config = await this.getConfig();
    if (!config.gistId) {
      logDebug('syncBoardDeletion: 无 GistId，跳过');
      return { success: false, error: '未配置同步 Gist' };
    }
    
    try {
      gitHubApiService.setGistId(config.gistId);
      
      // 获取本地密码
      const customPassword = await syncPasswordService.getPassword();
      const { cryptoService } = await import('./crypto-service');
      
      // 获取远程 manifest（解密）
      const manifestContent = await gitHubApiService.getGistFileContent(SYNC_FILES.MANIFEST);
      if (!manifestContent) {
        return { success: false, error: '远程 manifest 不存在' };
      }
      
      const manifestJson = await cryptoService.decryptOrPassthrough(manifestContent, config.gistId, customPassword || undefined);
      const manifest: SyncManifest = JSON.parse(manifestJson);
      const boardInfo = manifest.boards[boardId];
      
      if (!boardInfo) {
        logDebug('syncBoardDeletion: 画板不在远程 manifest 中');
        // 画板不在远程，可能是新建后未同步就删除了，直接返回成功
        return { success: true };
      }
      
      if (boardInfo.deletedAt) {
        logDebug('syncBoardDeletion: 画板已在远程删除');
        return { success: true };
      }
      
      // 获取当前用户信息
      const userInfo = await tokenService.getUserInfo();
      const deletedBy = userInfo?.login || 'unknown';
      
      // 标记为已删除
      const deletedAt = Date.now();
      manifest.boards[boardId] = {
        ...boardInfo,
        deletedAt,
        deletedBy,
      };
      manifest.updatedAt = deletedAt;
      
      // 更新远程 manifest（加密）
      const updatedManifestJson = JSON.stringify(manifest);
      await gitHubApiService.updateGistFiles({
        [SYNC_FILES.MANIFEST]: await cryptoService.encrypt(updatedManifestJson, config.gistId, customPassword || undefined),
      });
      
      logDebug('syncBoardDeletion: Manifest 已加密更新');
      
      logSuccess('syncBoardDeletion: 画板已移入回收站', { boardId });
      
      // 清除本地删除记录（已同步到远程）
      await this.clearLocalDeletions([boardId]);
      
      return { success: true };
    } catch (error) {
      logError('syncBoardDeletion 失败', error instanceof Error ? error : new Error(String(error)));
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '同步删除失败' 
      };
    }
  }

  /**
   * 清除已同步到远程的本地删除记录
   */
  async clearLocalDeletions(boardIds: string[]): Promise<void> {
    if (boardIds.length === 0) return;
    const map = await this.getLocalDeletionsPendingSync();
    boardIds.forEach(id => map.delete(id));
    logDebug('clearLocalDeletions', { boardIds });
    await kvStorageService.set(LOCAL_DELETIONS_PENDING_KEY, Object.fromEntries(map));
  }

  /**
   * 调度自动同步
   */
  private async scheduleAutoSync(): Promise<void> {
    // 检查是否有 token（已配置）
    if (!tokenService.hasToken()) {
      logDebug('scheduleAutoSync: No token, skipping');
      return;
    }

    const config = await this.getConfig();
    logDebug('scheduleAutoSync config', { autoSync: config.autoSync, debounceMs: config.autoSyncDebounceMs });
    if (!config.autoSync) {
      logDebug('scheduleAutoSync: Auto sync disabled, skipping');
      return;
    }

    // 清除之前的计时器
    if (this.autoSyncTimer) {
      logDebug('scheduleAutoSync: Clearing previous timer');
      clearTimeout(this.autoSyncTimer);
    }

    // 设置新的计时器
    // 注意：自动同步只上传本地变更到远程，不下载远程数据
    // 下载远程数据只在页面加载时执行（pullFromRemote）
    this.autoSyncTimer = setTimeout(async () => {
      logDebug('Auto sync timer fired', { pendingChanges: this.pendingChanges, syncInProgress: this.syncInProgress });
      if (this.pendingChanges && !this.syncInProgress) {
        logDebug('Auto sync triggered after debounce, pushing local changes to remote...');
        await this.pushToRemote();
      } else {
        logDebug('Auto sync skipped', { pendingChanges: this.pendingChanges, syncInProgress: this.syncInProgress });
      }
    }, config.autoSyncDebounceMs);
    
    logDebug('Auto sync scheduled', { debounceMs: config.autoSyncDebounceMs });
  }

  /**
   * 检测本地变更
   */
  async detectLocalChanges(): Promise<ChangeSet> {
    const config = await this.getConfig();
    const localData = await dataSerializer.collectSyncData();

    if (!config.gistId || !config.lastSyncTime) {
      // 没有同步记录，所有数据都是变更
      return {
        addedBoards: Array.from(localData.boards.keys()),
        modifiedBoards: [],
        deletedBoards: [],
        promptsChanged: true,
        tasksChanged: true,
      };
    }

    // 获取远程 manifest（解密）
    try {
      const customPassword = await syncPasswordService.getPassword();
      const { cryptoService } = await import('./crypto-service');
      
      const manifestContent = await gitHubApiService.getGistFileContent(SYNC_FILES.MANIFEST);
      if (!manifestContent) {
        return {
          addedBoards: Array.from(localData.boards.keys()),
          modifiedBoards: [],
          deletedBoards: [],
          promptsChanged: true,
          tasksChanged: true,
        };
      }

      const manifestJson = await cryptoService.decryptOrPassthrough(manifestContent, config.gistId, customPassword || undefined);
      const remoteManifest: SyncManifest = JSON.parse(manifestJson);
      const changes = dataSerializer.compareBoardChanges(
        localData.boards,
        remoteManifest,
        config.lastSyncTime
      );

      return {
        addedBoards: changes.toUpload.filter(id => !remoteManifest.boards[id]),
        modifiedBoards: changes.toUpload.filter(id => remoteManifest.boards[id]),
        deletedBoards: [],
        promptsChanged: true, // TODO: 实现提示词变更检测
        tasksChanged: true,   // TODO: 实现任务变更检测
      };
    } catch (error) {
      logError('检测变更失败', error instanceof Error ? error : new Error(String(error)));
      return {
        addedBoards: [],
        modifiedBoards: [],
        deletedBoards: [],
        promptsChanged: false,
        tasksChanged: false,
      };
    }
  }

  /**
   * 解决冲突
   */
  async resolveConflict(
    conflict: ConflictItem,
    resolution: ConflictResolution
  ): Promise<void> {
    // TODO: 实现冲突解决逻辑
    logDebug('解决冲突', { conflictId: conflict.id, resolution });
  }

  // ====================================
  // 回收站功能
  // ====================================

  /**
   * 获取回收站中的已删除项目
   */
  async getDeletedItems(): Promise<DeletedItems> {
    const result: DeletedItems = {
      boards: [],
      prompts: [],
      tasks: [],
    };

    const config = await this.getConfig();
    if (!config.gistId) {
      return result;
    }

    try {
      gitHubApiService.setGistId(config.gistId);
      
      // 获取本地密码
      const customPassword = await syncPasswordService.getPassword();
      const { cryptoService } = await import('./crypto-service');
      
      const manifestContent = await gitHubApiService.getGistFileContent(SYNC_FILES.MANIFEST);
      if (!manifestContent) {
        return result;
      }

      const manifestJson = await cryptoService.decryptOrPassthrough(manifestContent, config.gistId, customPassword || undefined);
      const manifest: SyncManifest = JSON.parse(manifestJson);
      
      // 获取已删除的画板
      result.boards = dataSerializer.getDeletedBoards(manifest);
      
      // 获取已删除的提示词
      if (manifest.deletedPrompts) {
        result.prompts = manifest.deletedPrompts;
      }
      
      // 获取已删除的任务
      if (manifest.deletedTasks) {
        result.tasks = manifest.deletedTasks;
      }

      logDebug('getDeletedItems', {
        boards: result.boards.length,
        prompts: result.prompts.length,
        tasks: result.tasks.length,
      });

      return result;
    } catch (error) {
      logError('获取已删除项目失败', error instanceof Error ? error : new Error(String(error)));
      return result;
    }
  }

  /**
   * 恢复已删除的项目
   * - 移除 tombstone 标记
   * - 下载远程文件到本地
   */
  async restoreItem(
    type: 'board' | 'prompt' | 'task',
    id: string
  ): Promise<{ success: boolean; error?: string }> {
    const config = await this.getConfig();
    if (!config.gistId) {
      return { success: false, error: '未配置同步' };
    }

    try {
      gitHubApiService.setGistId(config.gistId);
      
      // 获取本地密码
      const customPassword = await syncPasswordService.getPassword();
      const { cryptoService } = await import('./crypto-service');
      
      // 获取远程 manifest 并解密
      const manifestContent = await gitHubApiService.getGistFileContent(SYNC_FILES.MANIFEST);
      if (!manifestContent) {
        return { success: false, error: '无法获取远程数据' };
      }

      const manifestJson = await cryptoService.decryptOrPassthrough(manifestContent, config.gistId, customPassword || undefined);
      let manifest: SyncManifest = JSON.parse(manifestJson);

      if (type === 'board') {
        // 检查画板是否存在且已删除
        const boardInfo = manifest.boards[id];
        if (!boardInfo || !boardInfo.deletedAt) {
          return { success: false, error: '画板不存在或未被删除' };
        }

        // 下载画板数据
        const boardContent = await gitHubApiService.getGistFileContent(SYNC_FILES.boardFile(id));
        if (!boardContent) {
          return { success: false, error: '画板数据不存在' };
        }

        // 解密画板数据
        const boardJson = await cryptoService.decryptOrPassthrough(boardContent, config.gistId, customPassword || undefined);
        const board: BoardData = JSON.parse(boardJson);
        
        // 保存到本地
        await workspaceStorageService.saveBoard(board);
        
        // 移除 tombstone 标记
        manifest = dataSerializer.unmarkBoardAsDeleted(manifest, id);
        
        // 更新远程 manifest（加密）
        const updatedManifestJson = JSON.stringify(manifest);
        await gitHubApiService.updateGistFiles({
          [SYNC_FILES.MANIFEST]: await cryptoService.encrypt(updatedManifestJson, config.gistId, customPassword || undefined),
        });

        // 刷新工作区
        await workspaceService.reload();

        logSuccess('恢复画板成功', { boardId: id });
        return { success: true };
      } else if (type === 'prompt') {
        // TODO: 实现提示词恢复
        return { success: false, error: '提示词恢复功能暂未实现' };
      } else if (type === 'task') {
        // TODO: 实现任务恢复
        return { success: false, error: '任务恢复功能暂未实现' };
      }

      return { success: false, error: '未知类型' };
    } catch (error) {
      logError('恢复项目失败', error instanceof Error ? error : new Error(String(error)));
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '恢复失败' 
      };
    }
  }

  /**
   * 永久删除项目（从回收站清除）
   * - 删除远程文件
   * - 移除 tombstone 标记
   */
  async permanentlyDelete(
    type: 'board' | 'prompt' | 'task',
    id: string
  ): Promise<{ success: boolean; error?: string }> {
    const config = await this.getConfig();
    if (!config.gistId) {
      return { success: false, error: '未配置同步' };
    }

    try {
      gitHubApiService.setGistId(config.gistId);
      
      // 获取本地密码
      const customPassword = await syncPasswordService.getPassword();
      const { cryptoService } = await import('./crypto-service');
      
      // 获取远程 manifest（解密）
      const manifestContent = await gitHubApiService.getGistFileContent(SYNC_FILES.MANIFEST);
      if (!manifestContent) {
        return { success: false, error: '无法获取远程数据' };
      }

      const manifestJson = await cryptoService.decryptOrPassthrough(manifestContent, config.gistId, customPassword || undefined);
      let manifest: SyncManifest = JSON.parse(manifestJson);

      if (type === 'board') {
        // 检查画板是否存在且已删除
        const boardInfo = manifest.boards[id];
        if (!boardInfo || !boardInfo.deletedAt) {
          return { success: false, error: '画板不存在或未被删除' };
        }

        // 从 manifest 中完全删除该画板记录
        delete manifest.boards[id];
        manifest.updatedAt = Date.now();
        
        // 更新远程：删除画板文件 + 更新 manifest（加密）
        const updatedManifestJson = JSON.stringify(manifest);
        const filesToUpdate: Record<string, string> = {
          [SYNC_FILES.MANIFEST]: await cryptoService.encrypt(updatedManifestJson, config.gistId, customPassword || undefined),
        };
        
        // 删除画板文件（通过设置 content 为 null）
        await gitHubApiService.deleteGistFiles([SYNC_FILES.boardFile(id)]);
        await gitHubApiService.updateGistFiles(filesToUpdate);

        logSuccess('永久删除画板成功', { boardId: id });
        return { success: true };
      } else if (type === 'prompt') {
        // TODO: 实现提示词永久删除
        return { success: false, error: '提示词永久删除功能暂未实现' };
      } else if (type === 'task') {
        // TODO: 实现任务永久删除
        return { success: false, error: '任务永久删除功能暂未实现' };
      }

      return { success: false, error: '未知类型' };
    } catch (error) {
      logError('永久删除项目失败', error instanceof Error ? error : new Error(String(error)));
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '删除失败' 
      };
    }
  }

  /**
   * 清空回收站（永久删除所有已删除项目）
   */
  async emptyRecycleBin(): Promise<{
    success: boolean;
    deletedBoards: number;
    deletedPrompts: number;
    deletedTasks: number;
    error?: string;
  }> {
    const result = {
      success: false,
      deletedBoards: 0,
      deletedPrompts: 0,
      deletedTasks: 0,
    };

    const config = await this.getConfig();
    if (!config.gistId) {
      return { ...result, error: '未配置同步' };
    }

    try {
      gitHubApiService.setGistId(config.gistId);
      
      // 获取本地密码
      const customPassword = await syncPasswordService.getPassword();
      const { cryptoService } = await import('./crypto-service');
      
      // 获取远程 manifest（解密）
      const manifestContent = await gitHubApiService.getGistFileContent(SYNC_FILES.MANIFEST);
      if (!manifestContent) {
        return { ...result, error: '无法获取远程数据' };
      }

      const manifestJson = await cryptoService.decryptOrPassthrough(manifestContent, config.gistId, customPassword || undefined);
      let manifest: SyncManifest = JSON.parse(manifestJson);

      // 收集所有需要删除的画板文件
      const filesToDelete: string[] = [];
      const boardsToRemove: string[] = [];
      
      for (const [boardId, boardInfo] of Object.entries(manifest.boards)) {
        if (boardInfo.deletedAt) {
          filesToDelete.push(SYNC_FILES.boardFile(boardId));
          boardsToRemove.push(boardId);
        }
      }

      // 从 manifest 中删除这些画板记录
      for (const boardId of boardsToRemove) {
        delete manifest.boards[boardId];
      }
      
      // 清空提示词和任务的删除记录
      const promptsCount = manifest.deletedPrompts?.length || 0;
      const tasksCount = manifest.deletedTasks?.length || 0;
      manifest.deletedPrompts = [];
      manifest.deletedTasks = [];
      manifest.updatedAt = Date.now();

      // 删除画板文件
      if (filesToDelete.length > 0) {
        await gitHubApiService.deleteGistFiles(filesToDelete);
      }
      
      // 更新 manifest（加密）
      const updatedManifestJson = JSON.stringify(manifest);
      await gitHubApiService.updateGistFiles({
        [SYNC_FILES.MANIFEST]: await cryptoService.encrypt(updatedManifestJson, config.gistId, customPassword || undefined),
      });

      result.success = true;
      result.deletedBoards = boardsToRemove.length;
      result.deletedPrompts = promptsCount;
      result.deletedTasks = tasksCount;

      logSuccess('回收站已清空', result);
      return result;
    } catch (error) {
      logError('清空回收站失败', error instanceof Error ? error : new Error(String(error)));
      return { 
        ...result, 
        error: error instanceof Error ? error.message : '清空失败' 
      };
    }
  }

  /**
   * 重置同步（清除 Gist 关联）
   */
  async reset(): Promise<void> {
    await this.saveConfig({
      gistId: null,
      lastSyncTime: null,
      enabled: false,
    });
    gitHubApiService.setGistId(null);
    this.setStatus('not_configured');
  }

  /**
   * 断开连接（清除 Token 和配置）
   */
  async disconnect(): Promise<void> {
    tokenService.clearToken();
    await this.reset();
  }

  /**
   * 获取最后同步时间
   */
  async getLastSyncTime(): Promise<number | null> {
    const config = await this.getConfig();
    return config.lastSyncTime;
  }

  /**
   * 获取 Gist URL
   */
  getGistUrl(): string | null {
    return gitHubApiService.getGistWebUrl();
  }

  /**
   * 获取所有同步 Gist 列表
   */
  async listSyncGists(): Promise<Array<{
    id: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
    filesCount: number;
    url: string;
    isCurrent: boolean;
    isMaster: boolean;
  }>> {
    const gists = await gitHubApiService.listSyncGists();
    const config = await this.getConfig();
    
    return gists.map(gist => ({
      id: gist.id,
      description: gist.description,
      createdAt: gist.created_at,
      updatedAt: gist.updated_at,
      filesCount: Object.keys(gist.files).length,
      url: `https://gist.github.com/${gist.id}`,
      isCurrent: gist.id === config.gistId,
      isMaster: gitHubApiService.isGistMaster(gist),
    }));
  }

  /**
   * 切换到指定的 Gist
   */
  async switchToGist(gistId: string): Promise<SyncResult> {
    // 更新配置
    await this.saveConfig({
      gistId,
      lastSyncTime: null, // 重置同步时间，强制完整同步
      enabled: true,
    });
    gitHubApiService.setGistId(gistId);
    
    // 执行同步以下载该 Gist 的数据
    return this.sync();
  }

  /**
   * 删除指定的 Gist
   */
  async deleteGist(gistId: string): Promise<void> {
    const config = await this.getConfig();
    
    // 如果删除的是当前使用的 Gist，先重置
    if (config.gistId === gistId) {
      await this.reset();
    }
    
    await gitHubApiService.deleteGist(gistId);
  }

  /**
   * 创建新的 Gist 并上传当前数据
   * 注意：不会复用已存在的 Gist，而是直接创建新的
   */
  async createNewGist(): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      uploaded: { boards: 0, prompts: 0, tasks: 0, media: 0 },
      downloaded: { boards: 0, prompts: 0, tasks: 0, media: 0 },
      conflicts: [],
      duration: 0,
    };

    try {
      this.setStatus('syncing', '正在创建新的 Gist...');
      
      // 清除当前 Gist 关联
      await this.saveConfig({
        gistId: null,
        lastSyncTime: null,
        enabled: true,
      });
      gitHubApiService.setGistId(null);
      
      // 收集本地数据
      const localData = await dataSerializer.collectSyncData();
      
      // 直接创建新的 Gist（不查找已存在的）
      logDebug('创建新 Gist');
      const emptyGist = await gitHubApiService.createSyncGist({
        'manifest.json': JSON.stringify({ version: 1, initializing: true }, null, 2),
      });
      const gistId = emptyGist.id;
      logDebug('空 Gist 已创建', { gistId: maskId(gistId) });
      
      // 获取本地保存的自定义密码（如果有）
      const customPassword = await syncPasswordService.getPassword();
      logDebug('使用自定义密码创建 Gist', { hasPassword: !!customPassword });
      
      // 使用 gist id 加密数据（不包含 tasks.json，使用分页格式）
      const encryptedFiles = await dataSerializer.serializeToGistFilesEncrypted(localData, gistId, customPassword || undefined);
      
      // 更新 Gist 内容
      gitHubApiService.setGistId(gistId);
      await gitHubApiService.updateGistFiles(encryptedFiles);
      
      // 使用分页格式同步任务
      try {
        const taskResult = await taskSyncService.syncTasks(gistId, customPassword || undefined);
        result.uploaded.tasks = taskResult.uploaded;
      } catch (taskError) {
        logWarning('创建新 Gist: Tasks paged sync failed', taskError);
      }
      
      await this.saveConfig({
        gistId: gistId,
        lastSyncTime: Date.now(),
        enabled: true,
      });

      result.uploaded.boards = localData.boards.size;
      result.uploaded.prompts = localData.prompts.promptHistory.length +
        localData.prompts.videoPromptHistory.length +
        localData.prompts.imagePromptHistory.length;
      result.success = true;
      
      this.setStatus('synced');
      this.pendingChanges = false;
      logSuccess('新 Gist 创建成功');
      
      // 异步同步当前画布的媒体
      const currentBoardId = localData.workspace.currentBoardId;
      if (currentBoardId && result.uploaded.boards > 0) {
        this.syncCurrentBoardMediaAsync(currentBoardId);
      }
    } catch (error) {
      logError('创建新 Gist 失败', error instanceof Error ? error : new Error(String(error)));
      result.error = error instanceof Error ? error.message : '创建失败';
      this.setStatus('error', result.error);
    } finally {
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * 初始化分片系统（媒体同步）
   * 在首次同步成功后自动初始化，用于支持大量媒体文件的分片存储
   */
  private async initializeShardingSystem(gistId: string): Promise<void> {
    try {
      const { shardedMediaSyncAdapter } = await import('./sharded-media-sync-adapter');
      
      // 检查分片系统是否已启用
      if (shardedMediaSyncAdapter.isShardingEnabled()) {
        logDebug('分片系统已启用');
        return;
      }

      // 初始化分片系统
      logDebug('初始化分片系统', { gistId: maskId(gistId) });
      const result = await shardedMediaSyncAdapter.setupShardSystem(gistId);
      
      if (result.success) {
        logSuccess('分片系统初始化成功');
      } else {
        logWarning('分片系统初始化失败', { error: result.error });
      }
    } catch (error) {
      // 分片系统初始化失败不应阻塞主流程
      logError('分片系统初始化错误', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 执行分页同步（任务和工作流）
   * 使用新的分页格式进行增量同步，避免超过 Gist 文件大小限制
   */
  async syncPaged(): Promise<PagedSyncResult> {
    const result: PagedSyncResult = {
      success: false,
      tasksUploaded: 0,
      tasksDownloaded: 0,
      workflowsUploaded: 0,
      workflowsDownloaded: 0,
      tasksSkipped: 0,
      workflowsSkipped: 0,
    };

    try {
      const config = await this.getConfig();
      if (!config.gistId) {
        result.error = '未配置 Gist ID';
        return result;
      }

      const customPassword = await syncPasswordService.getPassword();

      logInfo('开始分页同步', { gistId: maskId(config.gistId) });

      // 同步任务
      try {
        const taskResult = await taskSyncService.syncTasks(
          config.gistId,
          customPassword || undefined
        );
        result.tasksUploaded = taskResult.uploaded;
        result.tasksDownloaded = taskResult.downloaded;
        result.tasksSkipped = taskResult.skipped;
      } catch (error) {
        logWarning('任务同步失败', error);
      }

      // 同步工作流
      try {
        const workflowResult = await workflowSyncService.syncWorkflows(
          config.gistId,
          customPassword || undefined
        );
        result.workflowsUploaded = workflowResult.uploaded;
        result.workflowsDownloaded = workflowResult.downloaded;
        result.workflowsSkipped = workflowResult.skipped;
      } catch (error) {
        logWarning('工作流同步失败', error);
      }

      // 同步自定义工具
      try {
        const toolResult = await toolSyncService.syncTools(
          config.gistId,
          customPassword || undefined
        );
        logDebug('自定义工具同步结果', toolResult);
      } catch (error) {
        logWarning('自定义工具同步失败', error);
      }

      result.success = true;
      logSuccess('分页同步完成', {
        tasksUploaded: result.tasksUploaded,
        tasksDownloaded: result.tasksDownloaded,
        tasksSkipped: result.tasksSkipped,
        workflowsUploaded: result.workflowsUploaded,
        workflowsDownloaded: result.workflowsDownloaded,
        workflowsSkipped: result.workflowsSkipped,
      });

    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      logError('分页同步失败', error instanceof Error ? error : new Error(String(error)));
    }

    return result;
  }

  /**
   * 检测远程任务数据格式
   */
  async detectRemoteTaskFormat(): Promise<'legacy' | 'paged' | 'none'> {
    try {
      const config = await this.getConfig();
      if (!config.gistId) {
        return 'none';
      }

      gitHubApiService.setGistId(config.gistId);
      const gist = await gitHubApiService.getGist();
      const files = gist.files;

      // 检查是否有分页索引文件
      if (files[SYNC_FILES_PAGED.TASK_INDEX]) {
        return 'paged';
      }

      return 'none';
    } catch (error) {
      logWarning('检测远程格式失败', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 'none';
    }
  }

  /**
   * 销毁
   */
  destroy(): void {
    if (this.autoSyncTimer) {
      clearTimeout(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
    this.statusListeners.clear();
  }
}

/** 同步引擎单例 */
export const syncEngine = new SyncEngine();
