/**
 * 同步引擎
 * 负责执行实际的同步操作
 */

import { maskId } from '@aitu/utils';
import { gitHubApiService, GitHubApiError } from './github-api-service';
import { tokenService } from './token-service';
import { dataSerializer } from './data-serializer';
import { mediaSyncService } from './media-sync-service';
import { kvStorageService } from '../kv-storage-service';
import { workspaceStorageService } from '../workspace-storage-service';
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
} from './types';

/** 同步配置存储键 */
const SYNC_CONFIG_KEY = 'github_sync_config';

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

          // 解析远程数据
          const remoteData = dataSerializer.deserializeFromGistFiles(remoteFiles);
          remoteManifest = remoteData.manifest;
          console.log('[SyncEngine] Remote manifest:', {
            version: remoteManifest?.version,
            boards: remoteManifest ? Object.keys(remoteManifest.boards).length : 0,
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

      if (!config.gistId) {
        // 尝试查找已存在的同步 Gist
        console.log('[SyncEngine] No gistId in config, searching for existing sync gist...');
        const existingGist = await gitHubApiService.findSyncGist();
        
        if (existingGist) {
          // 找到已存在的 Gist，下载远程数据
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

          // 解析远程数据
          console.log('[SyncEngine] Deserializing remote data...');
          const remoteData = dataSerializer.deserializeFromGistFiles(remoteFiles);
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
        } else {
          console.log('[SyncEngine] No existing gist found, will create new one');
          // 没有找到已存在的 Gist，创建新的
          const files = dataSerializer.serializeToGistFiles(localData);
          const gist = await gitHubApiService.createSyncGist(files);
          
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
      } else if (remoteManifest) {
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
        });

        // 解析远程数据（需要在合并前获取）
        const remoteData = dataSerializer.deserializeFromGistFiles(remoteFiles);
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

          // 应用远程数据到本地（包括提示词和任务）
          const applied = await dataSerializer.applySyncData({
            workspace: remoteData.workspace,
            boards: boardsToDownload,
            prompts: remoteData.prompts,
            tasks: remoteData.tasks,
          });
          console.log('[SyncEngine] Applied remote data:', applied);

          result.downloaded.boards = applied.boardsApplied;
          result.downloaded.prompts = applied.promptsApplied;
          result.downloaded.tasks = applied.tasksApplied;
          result.remoteCurrentBoardId = applied.remoteCurrentBoardId;
        } else {
          console.log('[SyncEngine] No boards to download');
          // 即使没有画板要下载，也要设置 remoteCurrentBoardId
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

        // 上传本地变更
        if (changes.toUpload.length > 0) {
          const filesToUpdate: Record<string, string> = {};
          const uploadedBoardIds = new Set<string>();
          
          for (const boardId of changes.toUpload) {
            if (uploadedBoardIds.has(boardId)) continue;
            uploadedBoardIds.add(boardId);
            
            const board = localData.boards.get(boardId);
            if (board) {
              filesToUpdate[SYNC_FILES.boardFile(boardId)] = JSON.stringify(board, null, 2);
              localData.manifest.boards[boardId] = {
                name: board.name,
                updatedAt: board.updatedAt,
                checksum: dataSerializer.calculateBoardChecksum(board),
              };
            }
          }

          // 更新 manifest
          localData.manifest.updatedAt = Date.now();
          filesToUpdate[SYNC_FILES.MANIFEST] = JSON.stringify(localData.manifest, null, 2);

          // 上传 workspace
          filesToUpdate[SYNC_FILES.WORKSPACE] = JSON.stringify(localData.workspace, null, 2);

          // 上传提示词和任务
          filesToUpdate[SYNC_FILES.PROMPTS] = JSON.stringify(localData.prompts, null, 2);
          filesToUpdate[SYNC_FILES.TASKS] = JSON.stringify(localData.tasks, null, 2);

          await gitHubApiService.updateGistFiles(filesToUpdate);
          result.uploaded.boards = changes.toUpload.length;
        }

        // 更新配置
        await this.saveConfig({
          lastSyncTime: Date.now(),
        });

        result.success = true;
      }

      this.setStatus('synced');
      this.pendingChanges = false;

      // 如果下载了数据，异步下载已同步的媒体文件
      if (result.downloaded.tasks > 0) {
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
   * 异步下载已同步的媒体文件（不阻塞同步流程）
   */
  private async downloadSyncedMediaAsync(): Promise<void> {
    try {
      console.log('[SyncEngine] Starting async media download...');
      const result = await mediaSyncService.downloadAllSyncedMedia((current, total, taskId) => {
        console.log(`[SyncEngine] Downloading media ${current}/${total}: ${taskId}`);
      });
      console.log(`[SyncEngine] Media download completed: ${result.succeeded} succeeded, ${result.failed} failed`);
    } catch (error) {
      console.error('[SyncEngine] Media download failed:', error);
    }
  }

  /**
   * 以本地为准同步（强制上传本地数据，覆盖远程）
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

      // 收集本地数据
      console.log('[SyncEngine] pushToRemote: Collecting local data...');
      const localData = await dataSerializer.collectSyncData();

      const config = await this.getConfig();

      if (!config.gistId) {
        // 没有 Gist，创建新的
        console.log('[SyncEngine] pushToRemote: Creating new gist...');
        const files = dataSerializer.serializeToGistFiles(localData);
        const gist = await gitHubApiService.createSyncGist(files);
        
        await this.saveConfig({
          gistId: gist.id,
          lastSyncTime: Date.now(),
          enabled: true,
        });
      } else {
        // 强制上传所有本地数据
        console.log('[SyncEngine] pushToRemote: Uploading all local data to gist:', maskId(config.gistId));
        gitHubApiService.setGistId(config.gistId);
        
        const files = dataSerializer.serializeToGistFiles(localData);
        await gitHubApiService.updateGistFiles(files);
        
        await this.saveConfig({
          lastSyncTime: Date.now(),
        });
      }

      result.uploaded.boards = localData.boards.size;
      result.uploaded.prompts = localData.prompts.promptHistory.length +
        localData.prompts.videoPromptHistory.length +
        localData.prompts.imagePromptHistory.length;
      result.uploaded.tasks = localData.tasks.completedTasks.length;
      result.success = true;

      console.log('[SyncEngine] pushToRemote: Success', result.uploaded);
      this.setStatus('synced');
      this.pendingChanges = false;
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
   * 以远程为准同步（强制下载远程数据，覆盖本地）
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

      // 获取远程数据
      console.log('[SyncEngine] pullFromRemote: Fetching remote data from gist:', maskId(gistId));
      gitHubApiService.setGistId(gistId);
      const gist = await gitHubApiService.getGist();
      
      // 读取所有文件内容
      const remoteFiles: Record<string, string> = {};
      for (const filename of Object.keys(gist.files)) {
        const content = await gitHubApiService.getGistFileContent(filename);
        if (content) {
          remoteFiles[filename] = content;
        }
      }
      console.log('[SyncEngine] pullFromRemote: Loaded', Object.keys(remoteFiles).length, 'files');

      // 解析远程数据
      const remoteData = dataSerializer.deserializeFromGistFiles(remoteFiles);
      console.log('[SyncEngine] pullFromRemote: Parsed remote data:', {
        boards: remoteData.boards.size,
        workspace: remoteData.workspace ? {
          currentBoardId: remoteData.workspace.currentBoardId,
          folders: remoteData.workspace.folders.length,
          boardMetadata: remoteData.workspace.boardMetadata.length,
        } : null,
      });

      // 强制应用所有远程数据（使用 workspace.boardMetadata 中的所有画板，而不是 manifest）
      const boardsToApply = remoteData.boards;
      
      // 如果 workspace 中有更多画板元数据，确保都下载
      if (remoteData.workspace?.boardMetadata) {
        for (const meta of remoteData.workspace.boardMetadata) {
          if (!boardsToApply.has(meta.id)) {
            // 尝试从 gist 文件中获取
            const boardFile = `board_${meta.id}.json`;
            if (remoteFiles[boardFile]) {
              try {
                const board = JSON.parse(remoteFiles[boardFile]);
                boardsToApply.set(meta.id, board);
                console.log('[SyncEngine] pullFromRemote: Added board from workspace metadata:', meta.id, meta.name);
              } catch (e) {
                console.warn('[SyncEngine] pullFromRemote: Failed to parse board file:', boardFile);
              }
            }
          }
        }
      }

      console.log('[SyncEngine] pullFromRemote: Applying', boardsToApply.size, 'boards to local');
      const applied = await dataSerializer.applySyncData({
        workspace: remoteData.workspace,
        boards: boardsToApply,
        prompts: remoteData.prompts,
        tasks: remoteData.tasks,
      });

      await this.saveConfig({
        gistId,
        lastSyncTime: Date.now(),
        enabled: true,
      });

      result.downloaded.boards = applied.boardsApplied;
      result.downloaded.prompts = applied.promptsApplied;
      result.downloaded.tasks = applied.tasksApplied;
      result.remoteCurrentBoardId = applied.remoteCurrentBoardId;
      result.success = true;

      console.log('[SyncEngine] pullFromRemote: Success', result.downloaded);
      this.setStatus('synced');
      this.pendingChanges = false;

      // 异步下载媒体文件（总是尝试，因为任务可能已存在但媒体未缓存）
      this.downloadSyncedMediaAsync();
    } catch (error) {
      console.error('[SyncEngine] pullFromRemote failed:', error);
      result.error = error instanceof Error ? error.message : '下载失败';
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
   * 调度自动同步
   */
  private async scheduleAutoSync(): Promise<void> {
    // 检查是否有 token（已配置）
    if (!tokenService.hasToken()) {
      return;
    }

    const config = await this.getConfig();
    if (!config.autoSync) {
      return;
    }

    // 清除之前的计时器
    if (this.autoSyncTimer) {
      clearTimeout(this.autoSyncTimer);
    }

    // 设置新的计时器
    this.autoSyncTimer = setTimeout(async () => {
      if (this.pendingChanges && !this.syncInProgress) {
        console.log('[SyncEngine] Auto sync triggered after debounce');
        await this.sync();
      }
    }, config.autoSyncDebounceMs);
    
    console.log(`[SyncEngine] Auto sync scheduled in ${config.autoSyncDebounceMs}ms`);
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

    // 获取远程 manifest
    try {
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

      const remoteManifest: SyncManifest = JSON.parse(manifestContent);
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
   */
  async createNewGist(): Promise<SyncResult> {
    // 清除当前 Gist 关联
    await this.saveConfig({
      gistId: null,
      lastSyncTime: null,
      enabled: true,
    });
    gitHubApiService.setGistId(null);
    
    // 执行同步将创建新的 Gist
    return this.sync();
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
