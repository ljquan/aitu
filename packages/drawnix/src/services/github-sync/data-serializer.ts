/**
 * 数据序列化服务
 * 负责收集本地数据并序列化为 Gist 文件格式
 */

import { workspaceStorageService } from '../workspace-storage-service';
import { workspaceService } from '../workspace-service';
import {
  getPromptHistory,
  getVideoPromptHistory,
  getImagePromptHistory,
  initPromptStorageCache,
  mergePromptHistory,
  mergeVideoPromptHistory,
  mergeImagePromptHistory,
} from '../prompt-storage-service';
import { swTaskQueueService } from '../sw-task-queue-service';
import { TaskStatus, TaskType, Task } from '../../types/task.types';
import { DRAWNIX_DEVICE_ID_KEY } from '../../constants/storage';
import { VERSIONS } from '../../constants';
import {
  SyncManifest,
  WorkspaceData,
  BoardData,
  PromptsData,
  TasksData,
  SYNC_VERSION,
  SYNC_FILES,
  BoardSyncInfo,
} from './types';
import type { Board, BoardMetadata, Folder } from '../../types/workspace.types';

/**
 * 计算字符串的简单校验和
 */
function calculateChecksum(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * 获取设备 ID
 */
function getDeviceId(): string {
  let deviceId = localStorage.getItem(DRAWNIX_DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(DRAWNIX_DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * 获取设备名称
 */
function getDeviceName(): string {
  const platform = navigator.platform || 'Unknown';
  const userAgent = navigator.userAgent;
  
  // 尝试识别设备类型
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    return 'iOS Device';
  }
  if (/Android/.test(userAgent)) {
    return 'Android Device';
  }
  if (/Mac/.test(platform)) {
    return 'Mac';
  }
  if (/Win/.test(platform)) {
    return 'Windows PC';
  }
  if (/Linux/.test(platform)) {
    return 'Linux';
  }
  
  return platform;
}

/**
 * 数据序列化服务
 */
class DataSerializer {
  /**
   * 收集所有需要同步的数据
   */
  async collectSyncData(): Promise<{
    manifest: SyncManifest;
    workspace: WorkspaceData;
    boards: Map<string, BoardData>;
    prompts: PromptsData;
    tasks: TasksData;
  }> {
    // 并行加载所有数据
    const [folders, boards, state] = await Promise.all([
      workspaceStorageService.loadAllFolders(),
      workspaceStorageService.loadAllBoards(),
      workspaceStorageService.loadState(),
    ]);

    // 初始化提示词缓存
    await initPromptStorageCache();

    // 收集提示词数据
    const promptHistory = getPromptHistory();
    const videoPromptHistory = getVideoPromptHistory();
    const imagePromptHistory = getImagePromptHistory();

    // 收集已完成的任务
    const allTasks = swTaskQueueService.getAllTasks();
    const completedTasks = allTasks.filter(
      task => task.status === TaskStatus.COMPLETED &&
        (task.type === TaskType.IMAGE || task.type === TaskType.VIDEO)
    );

    // 构建画板索引
    const boardsIndex: Record<string, BoardSyncInfo> = {};
    const boardsMap = new Map<string, BoardData>();

    for (const board of boards) {
      const boardJson = JSON.stringify(board.elements);
      boardsIndex[board.id] = {
        name: board.name,
        updatedAt: board.updatedAt,
        checksum: calculateChecksum(boardJson),
      };
      boardsMap.set(board.id, board);
    }

    // 构建工作区数据
    const workspace: WorkspaceData = {
      folders,
      boardMetadata: boards.map(b => this.extractBoardMetadata(b)),
      currentBoardId: state?.currentBoardId || null,
      expandedFolders: state?.expandedFolderIds || [],
    };

    // 构建 manifest
    const deviceId = getDeviceId();
    const now = Date.now();
    
    const manifest: SyncManifest = {
      version: SYNC_VERSION,
      appVersion: VERSIONS.app,
      createdAt: now,
      updatedAt: now,
      deviceId,
      devices: {
        [deviceId]: {
          name: getDeviceName(),
          lastSyncTime: now,
        },
      },
      boards: boardsIndex,
      syncedMedia: {},
    };

    return {
      manifest,
      workspace,
      boards: boardsMap,
      prompts: {
        promptHistory,
        videoPromptHistory,
        imagePromptHistory,
      },
      tasks: {
        completedTasks,
      },
    };
  }

  /**
   * 从 Board 提取元数据
   */
  private extractBoardMetadata(board: Board): BoardMetadata {
    return {
      id: board.id,
      name: board.name,
      folderId: board.folderId,
      order: board.order,
      viewport: board.viewport,
      theme: board.theme,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
    };
  }

  /**
   * 序列化为 Gist 文件格式
   */
  serializeToGistFiles(data: {
    manifest: SyncManifest;
    workspace: WorkspaceData;
    boards: Map<string, BoardData>;
    prompts: PromptsData;
    tasks: TasksData;
  }): Record<string, string> {
    const files: Record<string, string> = {};

    // 序列化 manifest
    files[SYNC_FILES.MANIFEST] = JSON.stringify(data.manifest, null, 2);

    // 序列化 workspace
    files[SYNC_FILES.WORKSPACE] = JSON.stringify(data.workspace, null, 2);

    // 序列化每个画板
    for (const [boardId, board] of data.boards) {
      files[SYNC_FILES.boardFile(boardId)] = JSON.stringify(board, null, 2);
    }

    // 序列化提示词
    files[SYNC_FILES.PROMPTS] = JSON.stringify(data.prompts, null, 2);

    // 序列化任务
    files[SYNC_FILES.TASKS] = JSON.stringify(data.tasks, null, 2);

    return files;
  }

  /**
   * 从 Gist 文件反序列化
   */
  deserializeFromGistFiles(files: Record<string, string>): {
    manifest: SyncManifest | null;
    workspace: WorkspaceData | null;
    boards: Map<string, BoardData>;
    prompts: PromptsData | null;
    tasks: TasksData | null;
  } {
    const result = {
      manifest: null as SyncManifest | null,
      workspace: null as WorkspaceData | null,
      boards: new Map<string, BoardData>(),
      prompts: null as PromptsData | null,
      tasks: null as TasksData | null,
    };

    // 解析 manifest
    if (files[SYNC_FILES.MANIFEST]) {
      try {
        result.manifest = JSON.parse(files[SYNC_FILES.MANIFEST]);
      } catch (e) {
        console.warn('[DataSerializer] Failed to parse manifest:', e);
      }
    }

    // 解析 workspace
    if (files[SYNC_FILES.WORKSPACE]) {
      try {
        result.workspace = JSON.parse(files[SYNC_FILES.WORKSPACE]);
      } catch (e) {
        console.warn('[DataSerializer] Failed to parse workspace:', e);
      }
    }

    // 解析画板
    for (const [filename, content] of Object.entries(files)) {
      if (filename.startsWith('board_') && filename.endsWith('.json')) {
        try {
          const board: BoardData = JSON.parse(content);
          console.log(`[DataSerializer] Parsed board ${filename}:`, {
            id: board.id,
            name: board.name,
            elements: board.elements?.length || 0,
            hasElements: !!board.elements,
            viewport: board.viewport,
          });
          result.boards.set(board.id, board);
        } catch (e) {
          console.warn(`[DataSerializer] Failed to parse board ${filename}:`, e);
        }
      }
    }

    // 解析提示词
    if (files[SYNC_FILES.PROMPTS]) {
      try {
        result.prompts = JSON.parse(files[SYNC_FILES.PROMPTS]);
      } catch (e) {
        console.warn('[DataSerializer] Failed to parse prompts:', e);
      }
    }

    // 解析任务
    if (files[SYNC_FILES.TASKS]) {
      try {
        result.tasks = JSON.parse(files[SYNC_FILES.TASKS]);
      } catch (e) {
        console.warn('[DataSerializer] Failed to parse tasks:', e);
      }
    }

    return result;
  }

  /**
   * 应用同步数据到本地
   */
  async applySyncData(data: {
    workspace: WorkspaceData | null;
    boards: Map<string, BoardData>;
    prompts: PromptsData | null;
    tasks: TasksData | null;
  }): Promise<{
    boardsApplied: number;
    promptsApplied: number;
    tasksApplied: number;
    remoteCurrentBoardId?: string | null;
  }> {
    console.log('[DataSerializer] applySyncData called with:', {
      hasWorkspace: !!data.workspace,
      boardsCount: data.boards.size,
      boardIds: Array.from(data.boards.keys()),
      hasPrompts: !!data.prompts,
      hasTasks: !!data.tasks,
    });

    let boardsApplied = 0;
    let promptsApplied = 0;
    let tasksApplied = 0;

    // 应用文件夹
    if (data.workspace) {
      console.log('[DataSerializer] Applying folders:', data.workspace.folders.length);
      for (const folder of data.workspace.folders) {
        await workspaceStorageService.saveFolder(folder);
      }
    }

    // 应用画板
    console.log('[DataSerializer] Applying boards...');
    for (const [boardId, board] of data.boards) {
      console.log(`[DataSerializer] Saving board: ${boardId} - ${board.name}, elements: ${board.elements?.length || 0}`, {
        folderId: board.folderId,
        viewport: board.viewport,
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
      });
      await workspaceStorageService.saveBoard(board);
      
      // 验证保存成功
      const savedBoard = await workspaceStorageService.loadBoard(boardId);
      console.log(`[DataSerializer] Verified saved board: ${boardId}`, {
        found: !!savedBoard,
        elements: savedBoard?.elements?.length || 0,
      });
      
      boardsApplied++;
    }
    console.log('[DataSerializer] Boards applied:', boardsApplied);

    // 刷新工作区
    if (boardsApplied > 0) {
      console.log('[DataSerializer] Reloading workspace...');
      await workspaceService.reload();
      
      // 验证工作区加载状态
      const allBoards = workspaceService.getAllBoardMetadata();
      console.log('[DataSerializer] Workspace reloaded, boards in memory:', {
        count: allBoards.length,
        ids: allBoards.map(b => b.id),
        names: allBoards.map(b => b.name),
      });
      
      // 如果有远程 currentBoardId，更新工作区状态
      if (data.workspace?.currentBoardId) {
        console.log('[DataSerializer] Setting currentBoardId from remote:', data.workspace.currentBoardId);
        // 保存工作区状态（包括 currentBoardId）
        const currentState = workspaceService.getState();
        await workspaceStorageService.saveState({
          ...currentState,
          currentBoardId: data.workspace.currentBoardId,
        });
        console.log('[DataSerializer] Saved workspace state with currentBoardId');
      }
    }

    // 应用提示词
    if (data.prompts) {
      // 合并通用提示词历史
      if (data.prompts.promptHistory && data.prompts.promptHistory.length > 0) {
        promptsApplied += mergePromptHistory(data.prompts.promptHistory);
      }
      // 合并视频提示词历史
      if (data.prompts.videoPromptHistory && data.prompts.videoPromptHistory.length > 0) {
        promptsApplied += mergeVideoPromptHistory(data.prompts.videoPromptHistory);
      }
      // 合并图片提示词历史
      if (data.prompts.imagePromptHistory && data.prompts.imagePromptHistory.length > 0) {
        promptsApplied += mergeImagePromptHistory(data.prompts.imagePromptHistory);
      }
    }

    // 应用任务（恢复已完成的任务记录到本地）
    console.log('[DataSerializer] Applying tasks...', {
      hasTasks: !!data.tasks,
      completedTasksCount: data.tasks?.completedTasks?.length || 0,
    });
    
    if (data.tasks && data.tasks.completedTasks && data.tasks.completedTasks.length > 0) {
      // 获取本地任务 ID 集合
      const localTasks = swTaskQueueService.getAllTasks();
      const localTaskIds = new Set(localTasks.map(t => t.id));
      
      console.log('[DataSerializer] Local tasks:', {
        count: localTasks.length,
        ids: Array.from(localTaskIds).slice(0, 5), // 只显示前5个
      });
      
      // 筛选出本地不存在的任务
      const tasksToRestore = data.tasks.completedTasks.filter(
        task => !localTaskIds.has(task.id)
      );
      
      console.log('[DataSerializer] Tasks to restore:', {
        count: tasksToRestore.length,
        ids: tasksToRestore.slice(0, 5).map(t => t.id),
      });
      
      if (tasksToRestore.length > 0) {
        // 为有同步媒体的任务生成本地缓存 URL
        const processedTasks = tasksToRestore.map(task => {
          // 如果任务有结果且 URL 不是本地缓存路径，检查是否有同步的媒体
          if (task.result?.url && !task.result.url.startsWith('/__aitu_cache__/')) {
            const taskType = task.type === 'video' ? 'video' : 'image';
            const extension = taskType === 'video' ? 'mp4' : 'png';
            const cacheUrl = `/__aitu_cache__/${taskType}/synced-${task.id}.${extension}`;
            return {
              ...task,
              result: {
                ...task.result,
                url: cacheUrl,
                originalUrl: task.result.url, // 保留原始 URL
              },
            };
          }
          return task;
        });
        
        console.log('[DataSerializer] Calling restoreTasks with', processedTasks.length, 'tasks');
        await swTaskQueueService.restoreTasks(processedTasks);
        tasksApplied = processedTasks.length;
        console.log('[DataSerializer] Tasks restored:', tasksApplied);
      }
    } else {
      console.log('[DataSerializer] No tasks to apply');
    }

    const remoteCurrentBoardId = data.workspace?.currentBoardId || null;
    console.log('[DataSerializer] applySyncData completed:', {
      boardsApplied,
      promptsApplied,
      tasksApplied,
      remoteCurrentBoardId,
    });
    
    // 最终验证：检查存储中的状态
    const savedState = await workspaceStorageService.loadState();
    console.log('[DataSerializer] Final workspace state in storage:', {
      currentBoardId: savedState.currentBoardId,
    });
    
    return {
      boardsApplied,
      promptsApplied,
      tasksApplied,
      remoteCurrentBoardId,
    };
  }

  /**
   * 计算画板的校验和
   */
  calculateBoardChecksum(board: Board): string {
    const content = JSON.stringify(board.elements);
    return calculateChecksum(content);
  }

  /**
   * 合并两个画板的元素（元素级别合并）
   * 返回合并后的画板和冲突信息
   */
  mergeBoardElements(
    localBoard: Board,
    remoteBoard: Board,
    lastSyncTime: number | null
  ): {
    mergedBoard: Board;
    hasConflicts: boolean;
    conflictingElements: Array<{
      elementId: string;
      localElement: unknown;
      remoteElement: unknown;
    }>;
    addedFromLocal: number;
    addedFromRemote: number;
    updated: number;
  } {
    const localElements = localBoard.elements || [];
    const remoteElements = remoteBoard.elements || [];
    
    // 创建元素 ID 映射
    const localElementMap = new Map<string, typeof localElements[0]>();
    const remoteElementMap = new Map<string, typeof remoteElements[0]>();
    
    for (const el of localElements) {
      if (el.id) {
        localElementMap.set(el.id, el);
      }
    }
    
    for (const el of remoteElements) {
      if (el.id) {
        remoteElementMap.set(el.id, el);
      }
    }
    
    const mergedElements: typeof localElements = [];
    const conflictingElements: Array<{
      elementId: string;
      localElement: unknown;
      remoteElement: unknown;
    }> = [];
    
    let addedFromLocal = 0;
    let addedFromRemote = 0;
    let updated = 0;
    
    const processedIds = new Set<string>();
    
    // 处理本地元素
    for (const localEl of localElements) {
      if (!localEl.id) {
        mergedElements.push(localEl);
        continue;
      }
      
      processedIds.add(localEl.id);
      const remoteEl = remoteElementMap.get(localEl.id);
      
      if (!remoteEl) {
        // 本地独有的元素，保留
        mergedElements.push(localEl);
        addedFromLocal++;
      } else {
        // 两边都有，比较内容
        const localJson = JSON.stringify(localEl);
        const remoteJson = JSON.stringify(remoteEl);
        
        if (localJson === remoteJson) {
          // 内容相同，使用任一版本
          mergedElements.push(localEl);
        } else {
          // 内容不同，检查是否是真正的冲突
          // 默认使用本地版本（因为用户可能正在编辑）
          // 但记录为潜在冲突
          mergedElements.push(localEl);
          conflictingElements.push({
            elementId: localEl.id,
            localElement: localEl,
            remoteElement: remoteEl,
          });
          updated++;
        }
      }
    }
    
    // 添加远程独有的元素
    for (const remoteEl of remoteElements) {
      if (!remoteEl.id || processedIds.has(remoteEl.id)) {
        continue;
      }
      
      // 远程独有的元素，添加到合并结果
      mergedElements.push(remoteEl);
      addedFromRemote++;
    }
    
    // 创建合并后的画板
    const mergedBoard: Board = {
      ...localBoard,
      elements: mergedElements,
      updatedAt: Math.max(localBoard.updatedAt, remoteBoard.updatedAt),
    };
    
    return {
      mergedBoard,
      hasConflicts: conflictingElements.length > 0,
      conflictingElements,
      addedFromLocal,
      addedFromRemote,
      updated,
    };
  }

  /**
   * 比较本地和远程的画板变更
   */
  compareBoardChanges(
    localBoards: Map<string, BoardData>,
    remoteManifest: SyncManifest,
    lastSyncTime: number | null
  ): {
    toUpload: string[];
    toDownload: string[];
    conflicts: string[];
  } {
    const toUpload: string[] = [];
    const toDownload: string[] = [];
    const conflicts: string[] = [];

    const localBoardIds = new Set(localBoards.keys());
    const remoteBoardIds = new Set(Object.keys(remoteManifest.boards));

    // 检查本地画板
    for (const [boardId, board] of localBoards) {
      const remoteInfo = remoteManifest.boards[boardId];
      const localChecksum = this.calculateBoardChecksum(board);

      if (!remoteInfo) {
        // 远程没有，需要上传
        toUpload.push(boardId);
      } else if (localChecksum !== remoteInfo.checksum) {
        // 内容不同
        if (!lastSyncTime) {
          // 首次同步
          // 检查本地画板是否为空（只有元数据没有元素，或者元素列表为空）
          const isLocalEmpty = !board.elements || board.elements.length === 0;

          if (isLocalEmpty) {
            // 如果本地为空，总是使用远程版本
            // 这是一个保护机制：防止新设备初始化的空白画板（虽然 updatedAt 可能更新）
            // 覆盖了远程已有的内容画板（当 ID 意外冲突时）
            console.log(`[Sync] Initial sync: Local board ${boardId} is empty, preferring remote version.`);
            toDownload.push(boardId);
          } else if (board.updatedAt > remoteInfo.updatedAt) {
            toUpload.push(boardId);
          } else {
            toDownload.push(boardId);
          }
        } else if (board.updatedAt > lastSyncTime && remoteInfo.updatedAt > lastSyncTime) {
          // 两边都有修改，冲突
          conflicts.push(boardId);
        } else if (board.updatedAt > lastSyncTime) {
          // 只有本地修改
          toUpload.push(boardId);
        } else {
          // 只有远程修改
          toDownload.push(boardId);
        }
      }
    }

    // 检查远程独有的画板
    for (const boardId of remoteBoardIds) {
      if (!localBoardIds.has(boardId)) {
        toDownload.push(boardId);
      }
    }

    return { toUpload, toDownload, conflicts };
  }
}

/** 数据序列化服务单例 */
export const dataSerializer = new DataSerializer();
