/**
 * 同步引擎
 * 负责执行实际的同步操作
 */

import { maskId } from '@aitu/utils';
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
  SyncStatus,
  SyncResult,
  SyncConfig,
  DEFAULT_SYNC_CONFIG,
  SyncManifest,
  SYNC_FILES,
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
} from './types';

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
        console.error('[SyncEngine] Status listener error:', e);
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

    console.log('[SyncEngine] Safety check:', {
      localBoardsCount: localBoards.size,
      toDeleteCount: toDeleteLocally.length,
      currentBoardId,
      isFirstSync,
      hasRemoteManifest: !!remoteManifest,
    });

    // 1. 空 manifest 检测：远程数据异常时不执行删除
    if (!remoteManifest || Object.keys(remoteManifest.boards).length === 0) {
      console.log('[SyncEngine] Safety: Remote manifest empty or invalid, skipping all deletions');
      result.skippedItems = toDeleteLocally.map(id => ({
        id,
        name: localBoards.get(id)?.name || id,
        reason: 'new_device' as const
      }));
      return result;
    }

    // 2. 新设备保护：首次同步不执行任何删除操作
    if (isFirstSync && toDeleteLocally.length > 0) {
      console.log('[SyncEngine] Safety: First sync, skipping all deletions');
      result.skippedItems = toDeleteLocally.map(id => ({
        id,
        name: localBoards.get(id)?.name || id,
        reason: 'new_device' as const
      }));
      return result;
    }

    // 3. 当前画板保护：正在编辑的画板不能被删除
    if (currentBoardId && toDeleteLocally.includes(currentBoardId)) {
      console.log('[SyncEngine] Safety: Current board protected:', currentBoardId);
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
      console.log('[SyncEngine] Safety: Blocked - would delete all local boards');
      result.passed = false;
      result.blockedReason = '检测到异常操作：远程数据要求删除所有本地画板，已阻止执行。请检查远程数据是否正常。';
      return result;
    }

    // 5. 批量删除检测：删除超过 50% 画板时触发警告
    if (actualToDelete.length > 1) {
      const deleteRatio = actualToDelete.length / localBoards.size;
      if (deleteRatio > 0.5) {
        console.log('[SyncEngine] Safety: Bulk delete warning, ratio:', deleteRatio);
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

      // 收集本地数据
      console.log('[SyncEngine] Collecting local data...');
      const localData = await dataSerializer.collectSyncData();
      console.log('[SyncEngine] Local data collected:', {
        boards: localData.boards.size,
        folders: localData.workspace.folders.length,
        currentBoardId: localData.workspace.currentBoardId,
      });

      // 获取或创建 Gist
      const config = await this.getConfig();
      console.log('[SyncEngine] Config:', {
        gistId: config.gistId,
        lastSyncTime: config.lastSyncTime,
        enabled: config.enabled,
      });
      
      let remoteManifest: SyncManifest | null = null;
      let remoteFiles: Record<string, string> = {};

      // 标记是否需要用本地覆盖远程（解密失败时）
      let shouldOverwriteRemote = false;
      
      if (config.gistId) {
        console.log('[SyncEngine] Using existing gistId:', maskId(config.gistId));
        gitHubApiService.setGistId(config.gistId);
        try {
          // 获取远程数据
          const gist = await gitHubApiService.getGist();
          console.log('[SyncEngine] Got gist, files:', Object.keys(gist.files));
          
          // 读取所有文件内容
          for (const filename of Object.keys(gist.files)) {
            const content = await gitHubApiService.getGistFileContent(filename);
            if (content) {
              remoteFiles[filename] = content;
            }
          }
          console.log('[SyncEngine] Loaded remote files:', Object.keys(remoteFiles).length);

          // 获取本地密码并解密 manifest
          const customPassword = await syncPasswordService.getPassword();
          if (remoteFiles[SYNC_FILES.MANIFEST]) {
            try {
              const { cryptoService } = await import('./crypto-service');
              const manifestContent = await cryptoService.decryptOrPassthrough(remoteFiles[SYNC_FILES.MANIFEST], config.gistId, customPassword || undefined);
              remoteManifest = JSON.parse(manifestContent);
            } catch (e) {
              console.warn('[SyncEngine] Failed to decrypt/parse manifest:', e);
              // 解密失败时，检查本地是否有足够的数据
              const hasLocalData = localData.boards.size > 0 ||
                                   localData.prompts.promptHistory.length > 0 ||
                                   localData.tasks.completedTasks.length > 0;

              if (hasLocalData) {
                console.warn('[SyncEngine] Local has data, will overwrite remote');
                shouldOverwriteRemote = true;
              } else {
                console.error('[SyncEngine] Local is empty, refusing to overwrite remote. Please check your password or manually resolve the conflict.');
                throw new Error('解密失败且本地无数据，拒绝覆盖远程数据以防止数据丢失');
              }
            }
          }
          console.log('[SyncEngine] Remote manifest:', {
            version: remoteManifest?.version,
            boards: remoteManifest ? Object.keys(remoteManifest.boards).length : 0,
            shouldOverwriteRemote,
          });
        } catch (error) {
          console.error('[SyncEngine] Error fetching gist:', error);
          if (error instanceof GitHubApiError && error.statusCode === 404) {
            // Gist 不存在，需要重新创建
            console.log('[SyncEngine] Gist not found (404), will create new one');
            config.gistId = null;
          } else {
            throw error;
          }
        }
      }

      // 如果解密失败，用本地覆盖远程
      if (shouldOverwriteRemote && config.gistId) {
        console.log('[SyncEngine] Decryption failed, overwriting remote with local data...');
        const customPassword = await syncPasswordService.getPassword();
        
        // 加密并上传本地数据
        const encryptedFiles = await dataSerializer.serializeToGistFilesEncrypted(localData, config.gistId, customPassword || undefined);
        await gitHubApiService.updateGistFiles(encryptedFiles);
        
        await this.saveConfig({
          lastSyncTime: Date.now(),
        });

        result.uploaded.boards = localData.boards.size;
        result.uploaded.prompts = localData.prompts.promptHistory.length +
          localData.prompts.videoPromptHistory.length +
          localData.prompts.imagePromptHistory.length;
        result.uploaded.tasks = localData.tasks.completedTasks.length;
        result.success = true;
        console.log('[SyncEngine] Remote overwritten with local data');
      } else if (!config.gistId) {
        // 尝试查找已存在的同步 Gist
        console.log('[SyncEngine] No gistId in config, searching for existing sync gist...');
        const existingGist = await gitHubApiService.findSyncGist();
        
        if (existingGist) {
          // 找到已存在的 Gist，尝试下载远程数据
          console.log('[SyncEngine] Found existing gist:', maskId(existingGist.id), 'files:', Object.keys(existingGist.files).length);
          gitHubApiService.setGistId(existingGist.id);
          
          // 读取所有文件内容
          for (const filename of Object.keys(existingGist.files)) {
            const content = await gitHubApiService.getGistFileContent(filename);
            if (content) {
              remoteFiles[filename] = content;
              console.log(`[SyncEngine] Loaded file: ${filename}, length: ${content.length}`);
            }
          }

          // 获取本地保存的自定义密码（如果有）
          const customPassword = await syncPasswordService.getPassword();
          console.log('[SyncEngine] Custom password available:', !!customPassword);

          try {
            // 解析远程数据（支持加密和明文）
            console.log('[SyncEngine] Deserializing remote data...');
            const remoteData = await dataSerializer.deserializeFromGistFilesWithDecryption(remoteFiles, existingGist.id, customPassword || undefined);
            console.log('[SyncEngine] Remote data parsed:', {
              workspace: remoteData.workspace ? {
                folders: remoteData.workspace.folders.length,
                boardMetadata: remoteData.workspace.boardMetadata.length,
                currentBoardId: remoteData.workspace.currentBoardId,
              } : null,
              boards: remoteData.boards.size,
              prompts: remoteData.prompts ? {
                promptHistory: remoteData.prompts.promptHistory?.length || 0,
                videoPromptHistory: remoteData.prompts.videoPromptHistory?.length || 0,
                imagePromptHistory: remoteData.prompts.imagePromptHistory?.length || 0,
              } : null,
              tasks: remoteData.tasks?.completedTasks?.length || 0,
            });
            
            // 应用远程数据到本地
            console.log('[SyncEngine] Applying remote data to local...');
            const applied = await dataSerializer.applySyncData({
              workspace: remoteData.workspace,
              boards: remoteData.boards,
              prompts: remoteData.prompts,
              tasks: remoteData.tasks,
            });
            console.log('[SyncEngine] Applied result:', applied);

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
            console.warn('[SyncEngine] Decryption failed for existing gist, overwriting with local data:', decryptError);
            
            const encryptedFiles = await dataSerializer.serializeToGistFilesEncrypted(localData, existingGist.id, customPassword || undefined);
            await gitHubApiService.updateGistFiles(encryptedFiles);
            
            await this.saveConfig({
              gistId: existingGist.id,
              lastSyncTime: Date.now(),
              enabled: true,
            });

            result.uploaded.boards = localData.boards.size;
            result.uploaded.prompts = localData.prompts.promptHistory.length +
              localData.prompts.videoPromptHistory.length +
              localData.prompts.imagePromptHistory.length;
            result.uploaded.tasks = localData.tasks.completedTasks.length;
            result.success = true;
            console.log('[SyncEngine] Existing gist overwritten with local data');
          }
        } else {
          console.log('[SyncEngine] No existing gist found, will create new one with encryption');
          // 没有找到已存在的 Gist，创建新的（加密）
          // 1. 先创建空 Gist 获取 id
          const emptyGist = await gitHubApiService.createSyncGist({
            'manifest.json': JSON.stringify({ version: 1, initializing: true }, null, 2),
          });
          const gistId = emptyGist.id;
          
          // 2. 获取本地保存的自定义密码（如果有）
          const customPassword = await syncPasswordService.getPassword();
          console.log('[SyncEngine] Creating new gist with custom password:', !!customPassword);
          
          // 3. 使用 gist id 加密数据
          const encryptedFiles = await dataSerializer.serializeToGistFilesEncrypted(localData, gistId, customPassword || undefined);
          
          // 4. 更新 Gist 内容
          gitHubApiService.setGistId(gistId);
          await gitHubApiService.updateGistFiles(encryptedFiles);
          
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
          result.uploaded.tasks = localData.tasks.completedTasks.length;
          result.success = true;
        }
      } else if (config.gistId) {
        console.log('[SyncEngine] Has gistId, comparing changes...');
        
        if (!remoteManifest) {
          console.warn('[SyncEngine] No remote manifest found, will perform full upload');
          // 没有远程 manifest，执行完整上传
          const { cryptoService } = await import('./crypto-service');
          const filesToUpdate: Record<string, string> = {};
          
          // 获取本地保存的自定义密码（如果有）
          const customPassword = await syncPasswordService.getPassword();
          console.log('[SyncEngine] Full upload with custom password:', !!customPassword);
          
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
          
          const tasksJson = JSON.stringify(localData.tasks);
          filesToUpdate[SYNC_FILES.TASKS] = await cryptoService.encrypt(tasksJson, config.gistId, customPassword || undefined);
          
          await gitHubApiService.updateGistFiles(filesToUpdate);
          result.uploaded.boards = localData.boards.size;
          result.success = true;
          
          await this.saveConfig({
            lastSyncTime: Date.now(),
          });
        } else {
          console.log('[SyncEngine] Has remoteManifest, comparing changes...');
        // 比较变更
        const changes = dataSerializer.compareBoardChanges(
          localData.boards,
          remoteManifest,
          config.lastSyncTime
        );
        console.log('[SyncEngine] Changes detected:', {
          toUpload: changes.toUpload,
          toDownload: changes.toDownload,
          conflicts: changes.conflicts,
          toDeleteLocally: changes.toDeleteLocally,
        });

        // 检测本地删除的画板（用于更新远程 tombstone）
        console.log('[SyncEngine] Detecting local deletions...');
        console.log('[SyncEngine] Local boards:', Array.from(localData.boards.keys()));
        console.log('[SyncEngine] Remote manifest boards:', Object.keys(remoteManifest.boards));
        const localDeletions = dataSerializer.detectDeletions(
          localData,
          remoteManifest,
          localData.manifest.deviceId
        );
        console.log('[SyncEngine] Local deletions detected:', {
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

          console.log('[SyncEngine] Safety check result:', {
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
            console.log('[SyncEngine] Safety: Blocked all deletions:', safetyCheck.blockedReason);
          } else if (!safetyCheck.passed && safetyCheck.warnings.length > 0) {
            // 有警告但未阻止，需要用户确认
            // 这里暂时跳过删除，返回警告让 UI 处理
            console.log('[SyncEngine] Safety: Warnings present, skipping deletions pending user confirmation');
          } else {
            // 通过安全检查，执行删除（排除被保护的项目）
            const skippedIds = new Set(safetyCheck.skippedItems.map(item => item.id));
            safeToDeleteLocally = changes.toDeleteLocally.filter(id => !skippedIds.has(id));
          }
        }

        // 获取本地保存的自定义密码（如果有）
        const customPassword = await syncPasswordService.getPassword();
        console.log('[SyncEngine] Incremental sync with custom password:', !!customPassword);

        // 解析远程数据（支持加密和明文，需要在合并前获取）
        const remoteData = await dataSerializer.deserializeFromGistFilesWithDecryption(remoteFiles, config.gistId!, customPassword || undefined);
        console.log('[SyncEngine] Remote data for merge:', {
          boards: remoteData.boards.size,
          workspace: remoteData.workspace ? {
            currentBoardId: remoteData.workspace.currentBoardId,
            folders: remoteData.workspace.folders.length,
          } : null,
        });

        // 处理冲突 - 使用智能元素级别合并
        const mergedBoards: Array<{ boardId: string; board: typeof localData.boards extends Map<string, infer T> ? T : never }> = [];
        
        if (changes.conflicts.length > 0) {
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
              }
              
              console.log(`[SyncEngine] Merged board ${boardId}: +${mergeResult.addedFromLocal} local, +${mergeResult.addedFromRemote} remote, ${mergeResult.conflictingElements.length} conflicts`);
            }
          }
        }
        
        // 下载远程独有的画板
        if (changes.toDownload.length > 0) {
          console.log('[SyncEngine] Downloading remote boards:', changes.toDownload);
          // 筛选需要下载的画板（排除已合并的）
          const mergedBoardIds = new Set(mergedBoards.map(m => m.boardId));
          const boardsToDownload = new Map<string, typeof remoteData.boards extends Map<string, infer T> ? T : never>();
          
          for (const boardId of changes.toDownload) {
            if (!mergedBoardIds.has(boardId)) {
              const board = remoteData.boards.get(boardId);
              if (board) {
                boardsToDownload.set(boardId, board);
                console.log(`[SyncEngine] Will download board: ${boardId} - ${board.name}`);
              } else {
                console.log(`[SyncEngine] Board not found in remote data: ${boardId}`);
              }
            }
          }
          console.log('[SyncEngine] Boards to download after filtering:', boardsToDownload.size);

          // 应用远程数据到本地（包括提示词、任务和删除）
          const applied = await dataSerializer.applySyncData({
            workspace: remoteData.workspace,
            boards: boardsToDownload,
            prompts: remoteData.prompts,
            tasks: remoteData.tasks,
            deletedBoardIds: safeToDeleteLocally,
          });
          console.log('[SyncEngine] Applied remote data:', applied);

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
          console.log('[SyncEngine] No boards to download');
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
          console.log('[SyncEngine] Set remoteCurrentBoardId from workspace:', result.remoteCurrentBoardId);
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
            console.log('[SyncEngine] Marking deleted boards as tombstone:', localDeletions.deletedBoards);
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

          // 加密提示词和任务
          const promptsJson = JSON.stringify(localData.prompts);
          filesToUpdate[SYNC_FILES.PROMPTS] = await cryptoService.encrypt(promptsJson, config.gistId!, customPassword || undefined);
          
          const tasksJson = JSON.stringify(localData.tasks);
          filesToUpdate[SYNC_FILES.TASKS] = await cryptoService.encrypt(tasksJson, config.gistId!, customPassword || undefined);

          await gitHubApiService.updateGistFiles(filesToUpdate);
          result.uploaded.boards = changes.toUpload.length;
          
          // 记录上传的删除标记数量
          if (hasLocalDeletions && !result.deleted) {
            result.deleted = { boards: 0, prompts: 0, tasks: 0, media: 0 };
          }
          if (hasLocalDeletions && result.deleted) {
            // 注意：这里只是上传了 tombstone，不是删除本地数据
            // 上传的 tombstone 数量可以在日志中看到
            console.log('[SyncEngine] Uploaded tombstones for', localDeletions.deletedBoards.length, 'boards');
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
      console.error('[SyncEngine] Sync failed:', error);
      result.error = error instanceof Error ? error.message : '同步失败';
      this.setStatus('error', result.error);
    } finally {
      this.syncInProgress = false;
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  /**
   * 异步同步当前画布的媒体（不阻塞同步流程）
   */
  private async syncCurrentBoardMediaAsync(currentBoardId: string): Promise<void> {
    try {
      console.log('[SyncEngine] Starting async current board media sync:', currentBoardId);
      const mediaResult = await mediaSyncService.syncCurrentBoardMedia(currentBoardId, (current, total, url, status) => {
        console.log(`[SyncEngine] Media sync ${status} ${current}/${total}: ${url}`);
      });
      console.log(`[SyncEngine] Current board media sync completed: ${mediaResult.succeeded} succeeded, ${mediaResult.failed} failed, ${mediaResult.skipped} skipped`);
    } catch (error) {
      console.error('[SyncEngine] Current board media sync failed:', error);
    }
  }

  /**
   * 上传合并后的任务数据到远程
   * 在 pullFromRemote 合并完成后调用，确保本地有但远程没有的任务也能同步到远程
   */
  private async uploadMergedTasksToRemote(
    gistId: string, 
    customPassword?: string,
    remoteManifest?: SyncManifest
  ): Promise<void> {
    try {
      console.log('[SyncEngine] uploadMergedTasksToRemote: Starting...');
      
      // 收集本地所有已完成的任务
      const localData = await dataSerializer.collectSyncData();
      const localCompletedTasks = localData.tasks.completedTasks;
      
      if (localCompletedTasks.length === 0) {
        console.log('[SyncEngine] uploadMergedTasksToRemote: No tasks to upload');
        return;
      }
      
      console.log('[SyncEngine] uploadMergedTasksToRemote: Local tasks count:', localCompletedTasks.length);
      
      // 加密任务数据并上传
      const { cryptoService } = await import('./crypto-service');
      const tasksData: TasksData = { completedTasks: localCompletedTasks };
      const tasksJson = JSON.stringify(tasksData);
      const encryptedTasks = await cryptoService.encrypt(tasksJson, gistId, customPassword);
      
      // 更新远程任务文件
      await gitHubApiService.updateGistFiles({
        [SYNC_FILES.TASKS]: encryptedTasks,
      });
      
      console.log('[SyncEngine] uploadMergedTasksToRemote: Tasks uploaded successfully');
    } catch (error) {
      // 上传任务失败不应阻塞主流程，只记录日志
      console.error('[SyncEngine] uploadMergedTasksToRemote: Failed to upload tasks:', error);
    }
  }

  /**
   * 异步下载已同步的媒体文件（不阻塞同步流程）
   */
  private async downloadSyncedMediaAsync(): Promise<void> {
    try {
      console.log('[SyncEngine] Starting async media download...');
      
      // 下载远程媒体
      const result = await mediaSyncService.downloadAllRemoteMedia((current, total, url, status) => {
        console.log(`[SyncEngine] Downloading media ${current}/${total} (${status}): ${url}`);
      });
      console.log(`[SyncEngine] Media download completed: ${result.succeeded} succeeded, ${result.failed} failed, ${result.skipped} skipped`);
    } catch (error) {
      console.error('[SyncEngine] Media download failed:', error);
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
      console.log('[SyncEngine] pushToRemote: Collecting local data...');
      const localData = await dataSerializer.collectSyncData();

      const config = await this.getConfig();

      if (!config.gistId) {
        // 没有 Gist，先创建空 Gist 获取 id，然后加密数据（全量上传）
        console.log('[SyncEngine] pushToRemote: Creating new gist with encryption...');
        
        const emptyGist = await gitHubApiService.createSyncGist({
          'manifest.json': JSON.stringify({ version: 1, initializing: true }, null, 2),
        });
        const gistId = emptyGist.id;
        console.log('[SyncEngine] pushToRemote: Created empty gist:', maskId(gistId));
        
        const encryptedFiles = await dataSerializer.serializeToGistFilesEncrypted(localData, gistId, customPassword || undefined);
        
        gitHubApiService.setGistId(gistId);
        await gitHubApiService.updateGistFiles(encryptedFiles);
        
        await this.saveConfig({
          gistId,
          lastSyncTime: Date.now(),
          enabled: true,
        });
        
        result.uploaded.boards = localData.boards.size;
      } else {
        // 增量上传：只上传有变化的数据
        console.log('[SyncEngine] pushToRemote: Incremental upload to gist:', maskId(config.gistId));
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
          console.log('[SyncEngine] pushToRemote: No remote manifest or decryption failed, will upload all');
        }
        const filesToUpdate: Record<string, string> = {};
        let boardsUploaded = 0;
        
        if (remoteManifest) {
          // 增量比较：只上传有变化的画板
          for (const [boardId, board] of localData.boards) {
            const localChecksum = dataSerializer.calculateBoardChecksum(board);
            const remoteInfo = remoteManifest.boards[boardId];
            
            // 如果远程没有此画板，或 checksum 不同，则上传
            if (!remoteInfo || remoteInfo.checksum !== localChecksum) {
              const boardJson = JSON.stringify(board);
              filesToUpdate[SYNC_FILES.boardFile(boardId)] = await cryptoService.encrypt(boardJson, config.gistId, customPassword || undefined);
              boardsUploaded++;
              console.log(`[SyncEngine] pushToRemote: Board ${boardId} needs upload (checksum changed)`);
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
              console.log(`[SyncEngine] pushToRemote: Board ${remoteBoardId} soft-deleted (moved to recycle bin)`);
            }
          }
        } else {
          // 没有远程 manifest，上传所有画板
          for (const [boardId, board] of localData.boards) {
            const boardJson = JSON.stringify(board);
            filesToUpdate[SYNC_FILES.boardFile(boardId)] = await cryptoService.encrypt(boardJson, config.gistId, customPassword || undefined);
            boardsUploaded++;
          }
        }
        
        // 始终更新 manifest、workspace、prompts、tasks（这些文件较小，都加密）
        const manifestJson = JSON.stringify(localData.manifest);
        filesToUpdate[SYNC_FILES.MANIFEST] = await cryptoService.encrypt(manifestJson, config.gistId, customPassword || undefined);
        
        const workspaceJson = JSON.stringify(localData.workspace);
        filesToUpdate[SYNC_FILES.WORKSPACE] = await cryptoService.encrypt(workspaceJson, config.gistId, customPassword || undefined);
        
        const promptsJson = JSON.stringify(localData.prompts);
        filesToUpdate[SYNC_FILES.PROMPTS] = await cryptoService.encrypt(promptsJson, config.gistId, customPassword || undefined);
        
        const tasksJson = JSON.stringify(localData.tasks);
        filesToUpdate[SYNC_FILES.TASKS] = await cryptoService.encrypt(tasksJson, config.gistId, customPassword || undefined);
        
        // 只有有变化时才更新
        if (Object.keys(filesToUpdate).length > 0) {
          await gitHubApiService.updateGistFiles(filesToUpdate);
          console.log(`[SyncEngine] pushToRemote: Uploaded ${boardsUploaded} boards (incremental)`);
        }
        
        result.uploaded.boards = boardsUploaded;
        
        await this.saveConfig({
          lastSyncTime: Date.now(),
        });
      }

      result.uploaded.prompts = localData.prompts.promptHistory.length +
        localData.prompts.videoPromptHistory.length +
        localData.prompts.imagePromptHistory.length;
      result.uploaded.tasks = localData.tasks.completedTasks.length;
      result.success = true;

      console.log('[SyncEngine] pushToRemote: Success', result.uploaded);
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
      console.error('[SyncEngine] pushToRemote failed:', error);
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
    console.log('[SyncEngine] ========== pullFromRemote START ==========');
    
    if (this.syncInProgress) {
      console.log('[SyncEngine] pullFromRemote: Sync already in progress, aborting');
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
        console.log('[SyncEngine] pullFromRemote: No gistId, searching for sync gist...');
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
      console.log('[SyncEngine] pullFromRemote: Fetching remote manifest...');
      const manifestContent = await gitHubApiService.getGistFileContent(SYNC_FILES.MANIFEST);
      if (!manifestContent) {
        throw new Error('远程数据为空');
      }
      
      const manifestJson = await cryptoService.decryptOrPassthrough(manifestContent, gistId, customPassword || undefined);
      const remoteManifest: SyncManifest = JSON.parse(manifestJson);
      console.log('[SyncEngine] pullFromRemote: Remote has', Object.keys(remoteManifest.boards).length, 'boards');
      
      // 收集本地数据用于比较
      const localData = await dataSerializer.collectSyncData();
      
      // 获取上次同步时间，用于判断本地删除
      const lastSyncTime = config.lastSyncTime;
      console.log('[SyncEngine] pullFromRemote: lastSyncTime:', lastSyncTime);
      
      // 本地已删除、尚未同步的画板（ID -> 删除时间戳）
      const localDeletionsPending = await this.getLocalDeletionsPendingSync();
      console.log('[SyncEngine] pullFromRemote: Local deletions pending:', 
        localDeletionsPending.size > 0 
          ? Object.fromEntries(localDeletionsPending) 
          : 'none'
      );
      
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
          console.log(`[SyncEngine] pullFromRemote: Board ${remoteBoardId} is tombstoned remotely, skipping`);
          continue;
        }
        
        // "以远程为准"模式：忽略本地删除状态，强制恢复远程画板
        // 但仍记录日志以便调试
        const localDeletedAt = localDeletionsPending.get(remoteBoardId);
        if (localDeletedAt !== undefined) {
          console.log(`[SyncEngine] pullFromRemote: Board ${remoteBoardId} was locally deleted at ${localDeletedAt}, but "pull from remote" will restore it (remote updatedAt: ${remoteInfo.updatedAt})`);
          // 清除本地删除记录，因为用户选择了以远程为准
          await this.clearLocalDeletions([remoteBoardId]);
        }
        
        const localBoard = localData.boards.get(remoteBoardId);
        if (!localBoard) {
          // 本地没有此画板 → 下载
          console.log(`[SyncEngine] pullFromRemote: Board ${remoteBoardId} not found locally, will download`);
          boardsToDownload.push(remoteBoardId);
        } else {
          // 增量同步：使用 checksum 判断是否需要下载
          // 如果本地和远程的 checksum 相同，说明内容一致，跳过下载
          const localChecksum = dataSerializer.calculateBoardChecksum(localBoard);
          
          if (localChecksum === remoteInfo.checksum) {
            // checksum 相同，内容一致，跳过下载
            console.log(`[SyncEngine] pullFromRemote: Board ${remoteBoardId} - checksum match, skipping download`, {
              localChecksum,
              remoteChecksum: remoteInfo.checksum,
              localElements: localBoard.elements?.length || 0,
            });
            // 不添加到 boardsToDownload，自然跳过
          } else {
            // checksum 不同，需要比较修改时间决定是否下载
            const localUpdatedAt = localBoard.updatedAt || 0;
            const remoteUpdatedAt = remoteInfo.updatedAt || 0;
            
            // 关键逻辑：如果本地修改时间比远程新，说明本地有新修改，不应被覆盖
            if (localUpdatedAt > remoteUpdatedAt) {
              // 本地更新时间比远程新 → 跳过下载，保留本地修改
              console.log(`[SyncEngine] pullFromRemote: Board ${remoteBoardId} - LOCAL IS NEWER, skipping download to preserve local changes`, {
                localChecksum,
                remoteChecksum: remoteInfo.checksum,
                localUpdatedAt: new Date(localUpdatedAt).toISOString(),
                remoteUpdatedAt: new Date(remoteUpdatedAt).toISOString(),
                localElements: localBoard.elements?.length || 0,
              });
              boardsSkippedDueToLocalNewer.push({
                id: remoteBoardId,
                name: localBoard.name || remoteInfo.name || remoteBoardId,
                localUpdatedAt,
                remoteUpdatedAt,
              });
            } else {
              // 远程更新时间比本地新或相等 → 下载远程版本
              console.log(`[SyncEngine] pullFromRemote: Board ${remoteBoardId} - checksum mismatch, remote is newer or equal, will download`, {
                localChecksum,
                remoteChecksum: remoteInfo.checksum,
                localUpdatedAt: new Date(localUpdatedAt).toISOString(),
                remoteUpdatedAt: new Date(remoteUpdatedAt).toISOString(),
                localElements: localBoard.elements?.length || 0,
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
      
      console.log('[SyncEngine] pullFromRemote: Need to download', boardsToDownload.length, 'boards, delete', boardsToDelete.length, 'boards, skipped due to local deletion:', boardsSkippedDueToLocalDeletion.length, ', skipped due to local newer:', boardsSkippedDueToLocalNewer.length);
      if (boardsSkippedDueToLocalNewer.length > 0) {
        console.log('[SyncEngine] pullFromRemote: Boards skipped (local newer):', boardsSkippedDueToLocalNewer.map(b => ({
          id: b.id,
          name: b.name,
          localUpdatedAt: new Date(b.localUpdatedAt).toISOString(),
          remoteUpdatedAt: new Date(b.remoteUpdatedAt).toISOString(),
        })));
      }
      
      // 只下载需要的文件
      const remoteFiles: Record<string, string> = {};
      remoteFiles[SYNC_FILES.MANIFEST] = manifestContent;
      
      // 始终下载 workspace、prompts、tasks（这些文件较小）
      console.log('[SyncEngine] pullFromRemote: Downloading workspace file...');
      const workspaceContent = await gitHubApiService.getGistFileContent(SYNC_FILES.WORKSPACE);
      if (workspaceContent) {
        remoteFiles[SYNC_FILES.WORKSPACE] = workspaceContent;
        console.log('[SyncEngine] pullFromRemote: workspace.json downloaded, length:', workspaceContent.length);
      } else {
        console.warn('[SyncEngine] pullFromRemote: workspace.json NOT FOUND or empty!');
      }
      
      console.log('[SyncEngine] pullFromRemote: Downloading prompts file...');
      const promptsContent = await gitHubApiService.getGistFileContent(SYNC_FILES.PROMPTS);
      if (promptsContent) {
        remoteFiles[SYNC_FILES.PROMPTS] = promptsContent;
        console.log('[SyncEngine] pullFromRemote: prompts.json downloaded, length:', promptsContent.length);
      } else {
        console.warn('[SyncEngine] pullFromRemote: prompts.json NOT FOUND or empty!');
      }
      
      console.log('[SyncEngine] pullFromRemote: Downloading tasks file...');
      const tasksContent = await gitHubApiService.getGistFileContent(SYNC_FILES.TASKS);
      if (tasksContent) {
        remoteFiles[SYNC_FILES.TASKS] = tasksContent;
        console.log('[SyncEngine] pullFromRemote: tasks.json downloaded, length:', tasksContent.length);
      } else {
        console.warn('[SyncEngine] pullFromRemote: tasks.json NOT FOUND or empty!');
      }
      
      // 只下载需要更新的画板
      console.log('[SyncEngine] pullFromRemote: Downloading', boardsToDownload.length, 'board files...');
      for (const boardId of boardsToDownload) {
        const boardFileName = SYNC_FILES.boardFile(boardId);
        console.log('[SyncEngine] pullFromRemote: Downloading board file:', boardFileName);
        const boardContent = await gitHubApiService.getGistFileContent(boardFileName);
        if (boardContent) {
          remoteFiles[boardFileName] = boardContent;
          console.log('[SyncEngine] pullFromRemote: Board', boardId, 'downloaded, length:', boardContent.length);
        } else {
          console.warn('[SyncEngine] pullFromRemote: Board', boardId, 'NOT FOUND or empty!');
        }
      }
      
      console.log('[SyncEngine] pullFromRemote: Downloaded files summary:', {
        totalFiles: Object.keys(remoteFiles).length,
        fileNames: Object.keys(remoteFiles),
        fileSizes: Object.fromEntries(
          Object.entries(remoteFiles).map(([k, v]) => [k, v.length])
        ),
      });

      // 解析远程数据（支持加密和明文）
      console.log('[SyncEngine] pullFromRemote: ========== DESERIALIZE START ==========');
      const remoteData = await dataSerializer.deserializeFromGistFilesWithDecryption(remoteFiles, gistId, customPassword || undefined);
      console.log('[SyncEngine] pullFromRemote: DESERIALIZE result:', {
        workspace: remoteData.workspace ? {
          currentBoardId: remoteData.workspace.currentBoardId,
          folders: remoteData.workspace.folders?.length || 0,
          boardMetadata: remoteData.workspace.boardMetadata?.length || 0,
        } : 'NULL',
        boards: {
          count: remoteData.boards.size,
          ids: Array.from(remoteData.boards.keys()),
        },
        prompts: remoteData.prompts ? {
          promptHistory: remoteData.prompts.promptHistory?.length || 0,
          videoPromptHistory: remoteData.prompts.videoPromptHistory?.length || 0,
          imagePromptHistory: remoteData.prompts.imagePromptHistory?.length || 0,
        } : 'NULL',
        tasks: remoteData.tasks ? {
          completedTasks: remoteData.tasks.completedTasks?.length || 0,
        } : 'NULL',
      });
      console.log('[SyncEngine] pullFromRemote: ========== DESERIALIZE END ==========');
      
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
      
      console.log('[SyncEngine] pullFromRemote: Workspace filtered, appliedBoardIds:', appliedBoardIds.size, 
        'skippedBoardIds:', skippedBoardIds.size,
        'currentBoardId:', workspaceToApply?.currentBoardId || 'none');
      
      console.log('[SyncEngine] pullFromRemote: ========== APPLY SYNC DATA START ==========');
      console.log('[SyncEngine] pullFromRemote: Applying', boardsToApply.size, 'boards to local');
      console.log('[SyncEngine] pullFromRemote: boardsToApply IDs:', Array.from(boardsToApply.keys()));
      console.log('[SyncEngine] pullFromRemote: workspaceToApply:', workspaceToApply ? {
        currentBoardId: workspaceToApply.currentBoardId,
        folders: workspaceToApply.folders?.length || 0,
        boardMetadata: workspaceToApply.boardMetadata?.length || 0,
        boardMetadataIds: workspaceToApply.boardMetadata?.map(m => m.id) || [],
      } : 'NULL');
      
      const applied = await dataSerializer.applySyncData({
        workspace: workspaceToApply,
        boards: boardsToApply,
        prompts: remoteData.prompts,
        tasks: remoteData.tasks,
      });
      
      console.log('[SyncEngine] pullFromRemote: applySyncData result:', {
        boardsApplied: applied.boardsApplied,
        promptsApplied: applied.promptsApplied,
        tasksApplied: applied.tasksApplied,
        boardsDeleted: applied.boardsDeleted,
        promptsDeleted: applied.promptsDeleted,
        tasksDeleted: applied.tasksDeleted,
        remoteCurrentBoardId: applied.remoteCurrentBoardId,
      });
      console.log('[SyncEngine] pullFromRemote: ========== APPLY SYNC DATA END ==========');

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

      console.log('[SyncEngine] pullFromRemote: Final result:', {
        success: result.success,
        downloaded: result.downloaded,
        skippedItems: result.skippedItems?.length || 0,
        remoteCurrentBoardId: result.remoteCurrentBoardId,
      });
      console.log('[SyncEngine] pullFromRemote: Success', result.downloaded);
      console.log('[SyncEngine] ========== pullFromRemote END ==========');
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
        console.log('[SyncEngine] pullFromRemote: Cleaning up deletion records:', deletionsToClean);
        await this.clearLocalDeletions(deletionsToClean);
      }

      // 合并完成后，自动上传任务数据到远程（确保双向同步）
      await this.uploadMergedTasksToRemote(gistId, customPassword || undefined, remoteManifest);

      // 初始化分片系统（用于媒体同步）
      await this.initializeShardingSystem(gistId);

      // 异步下载媒体文件（总是尝试，因为任务可能已存在但媒体未缓存）
      this.downloadSyncedMediaAsync();
    } catch (error) {
      console.error('[SyncEngine] pullFromRemote failed:', error);
      
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
   * @deprecated 使用 pushToRemote 代替
   */
  async push(): Promise<SyncResult> {
    return this.pushToRemote();
  }

  /**
   * @deprecated 使用 pullFromRemote 代替
   */
  async pull(): Promise<SyncResult> {
    return this.pullFromRemote();
  }

  /**
   * 标记有本地变更
   */
  markDirty(): void {
    console.log('[SyncEngine] markDirty called, current status:', this.status, 'syncInProgress:', this.syncInProgress);
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
    console.log('[SyncEngine] getLocalDeletionsPendingSync: raw data from storage:', data);
    if (!data) return new Map();
    
    // 旧格式：string[] -> 转换为 Map，使用当前时间作为删除时间
    if (Array.isArray(data)) {
      console.log('[SyncEngine] getLocalDeletionsPendingSync: migrating from old format (string[])');
      const now = Date.now();
      const map = new Map<string, number>();
      data.forEach(id => map.set(id, now));
      // 迁移到新格式
      await kvStorageService.set(LOCAL_DELETIONS_PENDING_KEY, Object.fromEntries(map));
      return map;
    }
    
    // 新格式：Record<string, number>
    const map = new Map(Object.entries(data));
    console.log('[SyncEngine] getLocalDeletionsPendingSync: loaded', map.size, 'deletions');
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
    console.log('[SyncEngine] recordLocalDeletion:', boardId, 'at', deletedAt);
    await kvStorageService.set(LOCAL_DELETIONS_PENDING_KEY, Object.fromEntries(map));
  }

  /**
   * 立即将画板删除同步到远程回收站
   * 在远程 manifest 中标记 deletedAt，保留画板文件以便恢复
   */
  async syncBoardDeletion(boardId: string): Promise<{ success: boolean; error?: string }> {
    console.log('[SyncEngine] syncBoardDeletion:', boardId);
    
    // 检查是否已配置
    if (!tokenService.hasToken()) {
      console.log('[SyncEngine] syncBoardDeletion: No token, skipping');
      return { success: false, error: '未配置 GitHub Token' };
    }
    
    const config = await this.getConfig();
    if (!config.gistId) {
      console.log('[SyncEngine] syncBoardDeletion: No gistId, skipping');
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
        console.log('[SyncEngine] syncBoardDeletion: Board not found in remote manifest');
        // 画板不在远程，可能是新建后未同步就删除了，直接返回成功
        return { success: true };
      }
      
      if (boardInfo.deletedAt) {
        console.log('[SyncEngine] syncBoardDeletion: Board already deleted in remote');
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
      
      console.log('[SyncEngine] syncBoardDeletion: Manifest updated with encryption');
      
      console.log('[SyncEngine] syncBoardDeletion: Success, board moved to recycle bin');
      
      // 清除本地删除记录（已同步到远程）
      await this.clearLocalDeletions([boardId]);
      
      return { success: true };
    } catch (error) {
      console.error('[SyncEngine] syncBoardDeletion failed:', error);
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
    console.log('[SyncEngine] clearLocalDeletions:', boardIds);
    await kvStorageService.set(LOCAL_DELETIONS_PENDING_KEY, Object.fromEntries(map));
  }

  /**
   * 调度自动同步
   */
  private async scheduleAutoSync(): Promise<void> {
    // 检查是否有 token（已配置）
    if (!tokenService.hasToken()) {
      console.log('[SyncEngine] scheduleAutoSync: No token, skipping');
      return;
    }

    const config = await this.getConfig();
    console.log('[SyncEngine] scheduleAutoSync: config.autoSync =', config.autoSync, 'debounceMs =', config.autoSyncDebounceMs);
    if (!config.autoSync) {
      console.log('[SyncEngine] scheduleAutoSync: Auto sync disabled, skipping');
      return;
    }

    // 清除之前的计时器
    if (this.autoSyncTimer) {
      console.log('[SyncEngine] scheduleAutoSync: Clearing previous timer');
      clearTimeout(this.autoSyncTimer);
    }

    // 设置新的计时器
    // 注意：自动同步只上传本地变更到远程，不下载远程数据
    // 下载远程数据只在页面加载时执行（pullFromRemote）
    this.autoSyncTimer = setTimeout(async () => {
      console.log('[SyncEngine] Auto sync timer fired, pendingChanges:', this.pendingChanges, 'syncInProgress:', this.syncInProgress);
      if (this.pendingChanges && !this.syncInProgress) {
        console.log('[SyncEngine] Auto sync triggered after debounce, pushing local changes to remote...');
        await this.pushToRemote();
      } else {
        console.log('[SyncEngine] Auto sync skipped: pendingChanges =', this.pendingChanges, 'syncInProgress =', this.syncInProgress);
      }
    }, config.autoSyncDebounceMs);
    
    console.log(`[SyncEngine] Auto sync scheduled in ${config.autoSyncDebounceMs}ms (will push local changes to remote)`);
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
      console.error('[SyncEngine] Failed to detect changes:', error);
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
    console.log('[SyncEngine] Resolving conflict:', conflict.id, 'with', resolution);
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

      console.log('[SyncEngine] getDeletedItems:', {
        boards: result.boards.length,
        prompts: result.prompts.length,
        tasks: result.tasks.length,
      });

      return result;
    } catch (error) {
      console.error('[SyncEngine] Failed to get deleted items:', error);
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

        console.log('[SyncEngine] Restored board:', id);
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
      console.error('[SyncEngine] Failed to restore item:', error);
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

        console.log('[SyncEngine] Permanently deleted board:', id);
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
      console.error('[SyncEngine] Failed to permanently delete item:', error);
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

      console.log('[SyncEngine] Emptied recycle bin:', result);
      return result;
    } catch (error) {
      console.error('[SyncEngine] Failed to empty recycle bin:', error);
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
      console.log('[SyncEngine] Creating new gist directly (not searching for existing)...');
      const emptyGist = await gitHubApiService.createSyncGist({
        'manifest.json': JSON.stringify({ version: 1, initializing: true }, null, 2),
      });
      const gistId = emptyGist.id;
      console.log('[SyncEngine] Created new gist:', maskId(gistId));
      
      // 获取本地保存的自定义密码（如果有）
      const customPassword = await syncPasswordService.getPassword();
      console.log('[SyncEngine] Creating new gist with custom password:', !!customPassword);
      
      // 使用 gist id 加密数据
      const encryptedFiles = await dataSerializer.serializeToGistFilesEncrypted(localData, gistId, customPassword || undefined);
      
      // 更新 Gist 内容
      gitHubApiService.setGistId(gistId);
      await gitHubApiService.updateGistFiles(encryptedFiles);
      
      await this.saveConfig({
        gistId: gistId,
        lastSyncTime: Date.now(),
        enabled: true,
      });

      result.uploaded.boards = localData.boards.size;
      result.uploaded.prompts = localData.prompts.promptHistory.length +
        localData.prompts.videoPromptHistory.length +
        localData.prompts.imagePromptHistory.length;
      result.uploaded.tasks = localData.tasks.completedTasks.length;
      result.success = true;
      
      this.setStatus('synced');
      this.pendingChanges = false;
      console.log('[SyncEngine] New gist created successfully');
      
      // 异步同步当前画布的媒体
      const currentBoardId = localData.workspace.currentBoardId;
      if (currentBoardId && result.uploaded.boards > 0) {
        this.syncCurrentBoardMediaAsync(currentBoardId);
      }
    } catch (error) {
      console.error('[SyncEngine] Failed to create new gist:', error);
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
        console.log('[SyncEngine] Sharding system already enabled');
        return;
      }

      // 初始化分片系统
      console.log('[SyncEngine] Initializing sharding system for gistId:', maskId(gistId));
      const result = await shardedMediaSyncAdapter.setupShardSystem(gistId);
      
      if (result.success) {
        console.log('[SyncEngine] Sharding system initialized successfully');
      } else {
        console.warn('[SyncEngine] Failed to initialize sharding system:', result.error);
      }
    } catch (error) {
      // 分片系统初始化失败不应阻塞主流程
      console.error('[SyncEngine] Error initializing sharding system:', error);
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
