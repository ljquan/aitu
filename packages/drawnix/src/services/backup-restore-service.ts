/**
 * Backup & Restore Service
 *
 * 提供数据备份和恢复功能
 * 支持导出提示词、项目、素材库到 ZIP 文件
 * 支持从 ZIP 文件增量导入数据（去重）
 *
 * ZIP 结构（与项目导入导出保持一致）：
 * ├── manifest.json              # 备份元信息
 * ├── prompts.json               # 提示词数据
 * ├── projects/                  # 项目文件（与导出结构一致）
 * │   ├── 文件夹名/
 * │   │   └── 画板名.drawnix     # 画板数据
 * │   └── 画板名.drawnix         # 根目录画板
 * └── assets/                    # 素材文件
 *     ├── xxx.meta.json          # 素材元数据
 *     ├── xxx.jpg                # 素材文件（带扩展名）
 *     └── ...
 */

import JSZip from 'jszip';
import { workspaceStorageService } from './workspace-storage-service';
import { workspaceService } from './workspace-service';
import { kvStorageService } from './kv-storage-service';
import {
  PromptHistoryItem,
  VideoPromptHistoryItem,
  ImagePromptHistoryItem,
  initPromptStorageCache,
  resetPromptStorageCache,
  getPromptHistory,
  getVideoPromptHistory,
  getImagePromptHistory,
} from './prompt-storage-service';
import { swTaskQueueService } from './sw-task-queue-service';
import { TaskType, TaskStatus, Task } from '../types/task.types';
import type { Folder, Board } from '../types/workspace.types';
import type { StoredAsset } from '../types/asset.types';
import type { PlaitTheme, PlaitElement as CorePlaitElement } from '@plait/core';
import { LS_KEYS_TO_MIGRATE } from '../constants/storage-keys';
import { DrawnixExportedType } from '../data/types';
import { VERSIONS } from '../constants';
import localforage from 'localforage';
import { ASSET_CONSTANTS } from '../constants/ASSET_CONSTANTS';
import { unifiedCacheService } from './unified-cache-service';

// 备份文件版本
const BACKUP_VERSION = 2;

// 备份文件标识
const BACKUP_SIGNATURE = 'aitu-backup';

/**
 * 预设提示词设置
 */
interface PresetPromptSettings {
  pinnedPrompts: string[];
  deletedPrompts: string[];
}

interface PresetStorageData {
  image: PresetPromptSettings;
  video: PresetPromptSettings;
}

/**
 * 备份选项
 */
export interface BackupOptions {
  includePrompts: boolean;
  includeProjects: boolean;
  includeAssets: boolean;
}

/**
 * 备份时的工作区状态
 */
export interface BackupWorkspaceState {
  /** 当前画板ID */
  currentBoardId: string | null;
  /** 当前画板名称（用于显示） */
  currentBoardName?: string;
  /** 当前视图状态（使用 origination 格式，与 @plait/core 保持一致） */
  viewport?: {
    zoom: number;
    origination?: [number, number];
  };
}

/**
 * 备份清单（manifest.json）
 */
interface BackupManifest {
  signature: string;
  version: number;
  createdAt: number;
  includes: {
    prompts: boolean;
    projects: boolean;
    assets: boolean;
  };
  stats: {
    promptCount: number;
    videoPromptCount: number;
    imagePromptCount: number;
    folderCount: number;
    boardCount: number;
    assetCount: number;
    taskCount: number;
  };
  /** 备份时的工作区状态 */
  workspaceState?: BackupWorkspaceState;
}

/**
 * 提示词数据（prompts.json）
 */
interface PromptsData {
  promptHistory: PromptHistoryItem[];
  videoPromptHistory: VideoPromptHistoryItem[];
  imagePromptHistory: ImagePromptHistoryItem[];
  presetSettings: PresetStorageData;
}

/**
 * Drawnix 文件格式（与项目导出一致）
 */
interface DrawnixFileData {
  type: string;
  version: number;
  source: string;
  elements: PlaitElement[];
  viewport: Viewport;
  theme?: string;
  boardMeta?: {
    id: string;
    name: string;
    folderId: string | null;
    order: number;
    createdAt: number;
    updatedAt: number;
  };
}

interface Viewport {
  zoom: number;
  origination?: [number, number];
}

interface PlaitElement {
  id?: string;
  type?: string;
  assetId?: string;
  imageAssetId?: string;
  videoAssetId?: string;
  children?: PlaitElement[];
  [key: string]: unknown;
}

/**
 * 导入结果
 */
export interface ImportResult {
  success: boolean;
  prompts: {
    imported: number;
    skipped: number;
  };
  projects: {
    folders: number;
    boards: number;
    /** 合并的画板数量（相同ID的画板） */
    merged: number;
    skipped: number;
  };
  assets: {
    imported: number;
    skipped: number;
  };
  tasks: {
    imported: number;
    skipped: number;
  };
  errors: string[];
  /** 备份时的工作区状态（用于恢复画布位置） */
  workspaceState?: BackupWorkspaceState;
}

/**
 * 进度回调
 */
export type ProgressCallback = (progress: number, message: string) => void;

/**
 * 获取文件扩展名
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
  };
  return mimeToExt[mimeType] || '';
}

/**
 * 清理文件/文件夹名称
 */
function sanitizeFileName(name: string): string {
  return (
    name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'unnamed'
  );
}

/**
 * Backup Restore Service
 */
class BackupRestoreService {
  /**
   * 导出数据到 ZIP 文件
   */
  async exportToZip(
    options: BackupOptions,
    onProgress?: ProgressCallback
  ): Promise<Blob> {
    const zip = new JSZip();

    onProgress?.(5, '正在准备数据...');

    // 获取当前工作区状态
    const currentBoard = workspaceService.getCurrentBoard();
    const workspaceState: BackupWorkspaceState = {
      currentBoardId: currentBoard?.id || null,
      currentBoardName: currentBoard?.name,
      viewport: currentBoard?.viewport,
    };

    const manifest: BackupManifest = {
      signature: BACKUP_SIGNATURE,
      version: BACKUP_VERSION,
      createdAt: Date.now(),
      includes: {
        prompts: options.includePrompts,
        projects: options.includeProjects,
        assets: options.includeAssets,
      },
      stats: {
        promptCount: 0,
        videoPromptCount: 0,
        imagePromptCount: 0,
        folderCount: 0,
        boardCount: 0,
        assetCount: 0,
        taskCount: 0,
      },
      workspaceState,
    };

    // 导出提示词
    if (options.includePrompts) {
      onProgress?.(10, '正在导出提示词...');
      const promptsData = await this.collectPromptData();
      zip.file('prompts.json', JSON.stringify(promptsData, null, 2));
      manifest.stats.promptCount = promptsData.promptHistory.length;
      manifest.stats.videoPromptCount = promptsData.videoPromptHistory.length;
      manifest.stats.imagePromptCount = promptsData.imagePromptHistory.length;
    }

    // 导出项目
    if (options.includeProjects) {
      onProgress?.(25, '正在导出项目...');
      await this.exportProjects(zip, manifest, onProgress);
    }

    // 导出素材
    if (options.includeAssets) {
      onProgress?.(50, '正在导出素材...');
      await this.exportAssets(zip, manifest, onProgress);
    }

    onProgress?.(80, '正在写入清单...');

    // 写入清单文件
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    onProgress?.(85, '正在压缩文件...');

    // 生成 ZIP
    const blob = await zip.generateAsync(
      {
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      },
      (metadata: { percent: number; currentFile: string | null }) => {
        const zipProgress = 85 + Math.round(metadata.percent * 0.14);
        onProgress?.(zipProgress, '正在压缩...');
      }
    );

    onProgress?.(100, '导出完成');

    return blob;
  }

  /**
   * 导出项目数据
   */
  private async exportProjects(
    zip: JSZip,
    manifest: BackupManifest,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const projectsFolder = zip.folder('projects');
    if (!projectsFolder) return;

    const [folders, boards] = await Promise.all([
      workspaceStorageService.loadAllFolders(),
      workspaceStorageService.loadAllBoards(),
    ]);

    // 构建文件夹路径映射
    const folderPathMap = this.buildFolderPathMap(folders);

    // 创建文件夹结构
    for (const folder of folders) {
      const path = folderPathMap.get(folder.id) || folder.name;
      projectsFolder.folder(path);
    }
    manifest.stats.folderCount = folders.length;

    // 每个画板导出为 .drawnix 文件
    for (let i = 0; i < boards.length; i++) {
      const board = boards[i];
      const folderPath = board.folderId
        ? folderPathMap.get(board.folderId)
        : null;
      const safeName = sanitizeFileName(board.name);
      const boardPath = folderPath
        ? `${folderPath}/${safeName}.drawnix`
        : `${safeName}.drawnix`;

      const drawnixData: DrawnixFileData = {
        type: DrawnixExportedType.drawnix,
        version: VERSIONS.drawnix,
        source: 'backup',
        elements: board.elements || [],
        viewport: board.viewport || { zoom: 1 },
        theme: board.theme,
        boardMeta: {
          id: board.id,
          name: board.name,
          folderId: board.folderId,
          order: board.order,
          createdAt: board.createdAt,
          updatedAt: board.updatedAt,
        },
      };

      projectsFolder.file(boardPath, JSON.stringify(drawnixData, null, 2));

      if (onProgress && boards.length > 0) {
        const progress = 25 + Math.round(((i + 1) / boards.length) * 20);
        onProgress(progress, `正在导出画板 (${i + 1}/${boards.length})...`);
      }
    }
    manifest.stats.boardCount = boards.length;
  }

  /**
   * 构建文件夹路径映射
   */
  private buildFolderPathMap(folders: Folder[]): Map<string, string> {
    const pathMap = new Map<string, string>();
    const folderMap = new Map<string, Folder>();

    for (const folder of folders) {
      folderMap.set(folder.id, folder);
    }

    const getPath = (folderId: string): string => {
      if (pathMap.has(folderId)) {
        return pathMap.get(folderId)!;
      }

      const folder = folderMap.get(folderId);
      if (!folder) {
        return '';
      }

      const safeName = sanitizeFileName(folder.name);
      if (folder.parentId) {
        const parentPath = getPath(folder.parentId);
        const fullPath = parentPath ? `${parentPath}/${safeName}` : safeName;
        pathMap.set(folderId, fullPath);
        return fullPath;
      }

      pathMap.set(folderId, safeName);
      return safeName;
    };

    for (const folder of folders) {
      getPath(folder.id);
    }

    return pathMap;
  }

  /**
   * 导出素材数据
   * 包括：
   * 1. 本地素材库中的素材（从 localforage asset store）
   * 2. URL 缓存的媒体（从 unified-cache-service）
   */
  private async exportAssets(
    zip: JSZip,
    manifest: BackupManifest,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const assetsFolder = zip.folder('assets');
    if (!assetsFolder) return;

    // 用于跟踪已导出的 URL，避免重复
    const exportedUrls = new Set<string>();
    let exportedCount = 0;

    // 1. 导出本地素材库中的素材
    const store = localforage.createInstance({
      name: ASSET_CONSTANTS.STORAGE_NAME,
      storeName: ASSET_CONSTANTS.STORE_NAME,
    });

    const assetKeys = await store.keys();
    const totalItems = assetKeys.length;

    for (let i = 0; i < assetKeys.length; i++) {
      try {
        const stored = await store.getItem<StoredAsset>(assetKeys[i]);
        if (stored) {
          // 写入元数据文件
          assetsFolder.file(
            `${stored.id}.meta.json`,
            JSON.stringify(stored, null, 2)
          );

          // 从统一缓存服务获取媒体 Blob 数据
          const blobData = await unifiedCacheService.getCachedBlob(stored.url);
          if (blobData) {
            const ext = getExtensionFromMimeType(stored.mimeType);
            assetsFolder.file(`${stored.id}${ext}`, blobData);
            exportedUrls.add(stored.url);
            exportedCount++;
          }
        }
      } catch (error) {
        console.warn(
          `[BackupRestore] Failed to load asset ${assetKeys[i]}:`,
          error
        );
      }

      if (onProgress && totalItems > 0) {
        const progress = 50 + Math.round(((i + 1) / totalItems) * 15);
        onProgress(progress, `正在导出本地素材 (${i + 1}/${totalItems})...`);
      }
    }

    // 2. 导出 unified-cache 中的缓存媒体（AI 生成的图片/视频）
    const cachedMedia = await unifiedCacheService.getAllCacheMetadata();
    const cacheItems = cachedMedia.filter(item => !exportedUrls.has(item.url));
    const cacheTotal = cacheItems.length;

    for (let i = 0; i < cacheItems.length; i++) {
      const item = cacheItems[i];
      try {
        // 生成唯一 ID（使用 taskId 或 URL hash）
        const itemId = item.metadata?.taskId || this.generateIdFromUrl(item.url);

        // 写入元数据文件（转换为 StoredAsset 兼容格式）
        const metaData = {
          id: itemId,
          url: item.url,
          type: item.type === 'video' ? 'VIDEO' : 'IMAGE',
          mimeType: item.mimeType,
          size: item.size,
          source: 'AI_GENERATED',
          createdAt: item.cachedAt,
          updatedAt: item.lastUsed,
          metadata: item.metadata,
        };
        assetsFolder.file(`${itemId}.meta.json`, JSON.stringify(metaData, null, 2));

        // 获取媒体 Blob 数据
        const blobData = await unifiedCacheService.getCachedBlob(item.url);
        if (blobData) {
          const ext = getExtensionFromMimeType(item.mimeType);
          assetsFolder.file(`${itemId}${ext}`, blobData);
          exportedUrls.add(item.url);
          exportedCount++;
        }
      } catch (error) {
        console.warn(
          `[BackupRestore] Failed to export cached media ${item.url}:`,
          error
        );
      }

      if (onProgress && cacheTotal > 0) {
        const progress = 65 + Math.round(((i + 1) / cacheTotal) * 10);
        onProgress(progress, `正在导出缓存媒体 (${i + 1}/${cacheTotal})...`);
      }
    }

    manifest.stats.assetCount = exportedCount;

    // 3. 导出任务数据（用于素材库展示）
    onProgress?.(75, '正在导出任务数据...');
    const allTasks = swTaskQueueService.getAllTasks();
    // 只导出已完成的图片/视频任务（素材库需要的）
    const completedMediaTasks = allTasks.filter(
      task =>
        task.status === TaskStatus.COMPLETED &&
        (task.type === TaskType.IMAGE || task.type === TaskType.VIDEO) &&
        task.result?.url
    );
    
    if (completedMediaTasks.length > 0) {
      zip.file('tasks.json', JSON.stringify(completedMediaTasks, null, 2));
      manifest.stats.taskCount = completedMediaTasks.length;
    }
  }

  /**
   * 从 URL 生成唯一 ID
   */
  private generateIdFromUrl(url: string): string {
    // 使用简单的 hash 算法生成 ID
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `cache-${Math.abs(hash).toString(36)}`;
  }

  /**
   * 从 ZIP 文件导入数据（增量去重）
   */
  async importFromZip(
    file: File,
    onProgress?: ProgressCallback
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      prompts: { imported: 0, skipped: 0 },
      projects: { folders: 0, boards: 0, merged: 0, skipped: 0 },
      assets: { imported: 0, skipped: 0 },
      tasks: { imported: 0, skipped: 0 },
      errors: [],
    };

    try {
      onProgress?.(5, '正在读取文件...');
      const zip = await JSZip.loadAsync(file);

      onProgress?.(10, '正在验证文件格式...');

      // 读取清单
      const manifestFile = zip.file('manifest.json');
      if (!manifestFile) {
        throw new Error('无效的备份文件：未找到 manifest.json');
      }

      const manifestContent = await manifestFile.async('string');
      const manifest: BackupManifest = JSON.parse(manifestContent);

      if (manifest.signature !== BACKUP_SIGNATURE) {
        throw new Error('无效的备份文件：签名不匹配');
      }

      // 导入提示词
      if (manifest.includes.prompts) {
        onProgress?.(20, '正在导入提示词...');
        const promptsFile = zip.file('prompts.json');
        if (promptsFile) {
          const promptsContent = await promptsFile.async('string');
          const promptsData: PromptsData = JSON.parse(promptsContent);
          result.prompts = await this.importPromptData(promptsData);
        }
      }

      // 导入项目
      if (manifest.includes.projects) {
        onProgress?.(40, '正在导入项目...');
        result.projects = await this.importProjects(zip, onProgress);
      }

      // 导入素材
      if (manifest.includes.assets) {
        onProgress?.(60, '正在导入素材...');
        result.assets = await this.importAssets(zip, onProgress);

        // 导入任务数据（素材库展示需要）
        onProgress?.(85, '正在导入任务数据...');
        result.tasks = await this.importTasks(zip);
      }

      // 如果导入了项目，刷新工作区缓存
      if (result.projects.folders > 0 || result.projects.boards > 0) {
        await workspaceService.reload();
      }

      // 返回备份时的工作区状态（用于恢复画布位置）
      if (manifest.workspaceState) {
        result.workspaceState = manifest.workspaceState;
      }

      result.success = result.errors.length === 0;
      onProgress?.(100, '导入完成');
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      result.errors.push(errorMessage);
    }

    return result;
  }

  /**
   * 下载 ZIP 文件
   */
  downloadZip(blob: Blob, filename?: string): void {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '');
    const defaultFilename = `aitu_backup_${dateStr}_${timeStr}.zip`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || defaultFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ========== 私有方法：数据收集 ==========

  /**
   * 收集提示词数据
   * 合并两个来源：
   * 1. IndexedDB 中的提示词历史（aitu_image_prompt_history / aitu_video_prompt_history）
   * 2. 任务队列中已完成任务的提示词
   */
  private async collectPromptData(): Promise<PromptsData> {
    await initPromptStorageCache();

    const promptHistory = getPromptHistory();
    let videoPromptHistory = getVideoPromptHistory();
    let imagePromptHistory = getImagePromptHistory();

    // 从任务队列中提取已完成任务的提示词
    const completedTasks = swTaskQueueService.getTasksByStatus(TaskStatus.COMPLETED);
    
    // 提取图片任务的提示词
    const imageTaskPrompts = completedTasks
      .filter(task => task.type === TaskType.IMAGE && task.params?.prompt)
      .map(task => ({
        id: `task_${task.id}`,
        content: task.params.prompt.trim(),
        timestamp: task.completedAt || task.createdAt,
      }))
      .filter(item => item.content.length > 0);

    // 提取视频任务的提示词
    const videoTaskPrompts = completedTasks
      .filter(task => task.type === TaskType.VIDEO && task.params?.prompt)
      .map(task => ({
        id: `task_${task.id}`,
        content: task.params.prompt.trim(),
        timestamp: task.completedAt || task.createdAt,
      }))
      .filter(item => item.content.length > 0);

    // 合并图片提示词（去重）
    const existingImageContents = new Set(imagePromptHistory.map(p => p.content));
    const newImagePrompts = imageTaskPrompts.filter(p => !existingImageContents.has(p.content));
    imagePromptHistory = [...imagePromptHistory, ...newImagePrompts];

    // 合并视频提示词（去重）
    const existingVideoContents = new Set(videoPromptHistory.map(p => p.content));
    const newVideoPrompts = videoTaskPrompts.filter(p => !existingVideoContents.has(p.content));
    videoPromptHistory = [...videoPromptHistory, ...newVideoPrompts];

    const presetSettings = await kvStorageService.get<PresetStorageData>(
      LS_KEYS_TO_MIGRATE.PRESET_SETTINGS
    );

    return {
      promptHistory,
      videoPromptHistory,
      imagePromptHistory,
      presetSettings: presetSettings || {
        image: { pinnedPrompts: [], deletedPrompts: [] },
        video: { pinnedPrompts: [], deletedPrompts: [] },
      },
    };
  }

  // ========== 私有方法：导入 ==========

  /**
   * 导入提示词数据（增量去重）
   */
  private async importPromptData(
    data: PromptsData
  ): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;

    // 防御性检查：确保数据存在
    const inputPromptHistory = data.promptHistory || [];
    const inputVideoPromptHistory = data.videoPromptHistory || [];
    const inputImagePromptHistory = data.imagePromptHistory || [];

    // 获取现有数据
    await initPromptStorageCache();
    const existingPrompts = getPromptHistory();
    const existingVideoPrompts = getVideoPromptHistory();
    const existingImagePrompts = getImagePromptHistory();

    // 去重合并提示词历史（AI 输入框）
    const existingPromptIds = new Set(existingPrompts.map((p) => p.id));
    const existingPromptContents = new Set(
      existingPrompts.map((p) => p.content)
    );
    const newPrompts = inputPromptHistory.filter((p) => {
      if (
        existingPromptIds.has(p.id) ||
        existingPromptContents.has(p.content)
      ) {
        skipped++;
        return false;
      }
      imported++;
      return true;
    });

    // 去重合并视频提示词历史
    const existingVideoIds = new Set(existingVideoPrompts.map((p) => p.id));
    const existingVideoContents = new Set(
      existingVideoPrompts.map((p) => p.content)
    );
    const newVideoPrompts = inputVideoPromptHistory.filter((p) => {
      if (existingVideoIds.has(p.id) || existingVideoContents.has(p.content)) {
        skipped++;
        return false;
      }
      imported++;
      return true;
    });

    // 去重合并图片提示词历史
    const existingImageIds = new Set(existingImagePrompts.map((p) => p.id));
    const existingImageContents = new Set(
      existingImagePrompts.map((p) => p.content)
    );
    const newImagePrompts = inputImagePromptHistory.filter((p) => {
      if (existingImageIds.has(p.id) || existingImageContents.has(p.content)) {
        skipped++;
        return false;
      }
      imported++;
      return true;
    });

    // 合并并保存
    const mergedPrompts = [...existingPrompts, ...newPrompts];
    const mergedVideoPrompts = [...existingVideoPrompts, ...newVideoPrompts];
    const mergedImagePrompts = [...existingImagePrompts, ...newImagePrompts];

    await kvStorageService.set(
      LS_KEYS_TO_MIGRATE.PROMPT_HISTORY,
      mergedPrompts
    );
    await kvStorageService.set(
      LS_KEYS_TO_MIGRATE.VIDEO_PROMPT_HISTORY,
      mergedVideoPrompts
    );
    await kvStorageService.set(
      LS_KEYS_TO_MIGRATE.IMAGE_PROMPT_HISTORY,
      mergedImagePrompts
    );

    // 合并预设设置
    const existingPreset = await kvStorageService.get<PresetStorageData>(
      LS_KEYS_TO_MIGRATE.PRESET_SETTINGS
    );
    if (existingPreset && data.presetSettings) {
      const mergedPreset: PresetStorageData = {
        image: {
          pinnedPrompts: [
            ...new Set([
              ...existingPreset.image.pinnedPrompts,
              ...data.presetSettings.image.pinnedPrompts,
            ]),
          ],
          deletedPrompts: [
            ...new Set([
              ...existingPreset.image.deletedPrompts,
              ...data.presetSettings.image.deletedPrompts,
            ]),
          ],
        },
        video: {
          pinnedPrompts: [
            ...new Set([
              ...existingPreset.video.pinnedPrompts,
              ...data.presetSettings.video.pinnedPrompts,
            ]),
          ],
          deletedPrompts: [
            ...new Set([
              ...existingPreset.video.deletedPrompts,
              ...data.presetSettings.video.deletedPrompts,
            ]),
          ],
        },
      };
      await kvStorageService.set(
        LS_KEYS_TO_MIGRATE.PRESET_SETTINGS,
        mergedPreset
      );
    } else if (data.presetSettings) {
      await kvStorageService.set(
        LS_KEYS_TO_MIGRATE.PRESET_SETTINGS,
        data.presetSettings
      );
    }

    // 重置缓存，强制从 IndexedDB 重新加载数据
    await resetPromptStorageCache();

    return { imported, skipped };
  }

  /**
   * 导入项目数据
   */
  private async importProjects(
    zip: JSZip,
    onProgress?: ProgressCallback
  ): Promise<{ folders: number; boards: number; merged: number; skipped: number }> {
    let foldersImported = 0;
    let boardsImported = 0;
    let boardsMerged = 0;
    let skipped = 0;

    // 获取现有数据
    const existingFolders = await workspaceStorageService.loadAllFolders();
    const existingBoards = await workspaceStorageService.loadAllBoards();
    const existingBoardIds = new Set(existingBoards.map((b) => b.id));

    // 查找所有 .drawnix 文件
    const drawnixFiles = Object.keys(zip.files).filter(
      (name) =>
        name.startsWith('projects/') &&
        name.endsWith('.drawnix') &&
        !name.includes('/_')
    );

    if (drawnixFiles.length === 0) {
      return { folders: 0, boards: 0, merged: 0, skipped: 0 };
    }

    // 从目录结构推断文件夹
    const folderPaths = new Set<string>();
    const folderIdMap = new Map<string, string>();

    for (const filePath of drawnixFiles) {
      const relativePath = filePath.replace(/^projects\//, '');
      const parts = relativePath.split('/');
      if (parts.length > 1) {
        let currentPath = '';
        for (let i = 0; i < parts.length - 1; i++) {
          currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
          folderPaths.add(currentPath);
        }
      }
    }

    // 按深度排序文件夹路径
    const sortedPaths = Array.from(folderPaths).sort((a, b) => {
      const depthA = a.split('/').length;
      const depthB = b.split('/').length;
      return depthA - depthB || a.localeCompare(b);
    });

    // 导入文件夹
    for (let i = 0; i < sortedPaths.length; i++) {
      const folderPath = sortedPaths[i];
      const parts = folderPath.split('/');
      const folderName = parts[parts.length - 1];
      const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : null;
      const parentId = parentPath ? folderIdMap.get(parentPath) || null : null;

      // 生成新的文件夹 ID
      const folderId = this.generateId();
      folderIdMap.set(folderPath, folderId);

      // 检查是否已存在同名文件夹（简单去重）
      const existingFolder = existingFolders.find(
        (f) => f.name === folderName && f.parentId === parentId
      );
      if (existingFolder) {
        folderIdMap.set(folderPath, existingFolder.id);
        skipped++;
        continue;
      }

      const folder: Folder = {
        id: folderId,
        name: folderName,
        parentId,
        order: i,
        isExpanded: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await workspaceStorageService.saveFolder(folder);
      foldersImported++;
    }

    // 导入画板
    for (let i = 0; i < drawnixFiles.length; i++) {
      const filePath = drawnixFiles[i];
      try {
        const drawnixFile = zip.file(filePath);
        if (drawnixFile) {
          const drawnixContent = await drawnixFile.async('string');
          const drawnixData: DrawnixFileData = JSON.parse(drawnixContent);

          const boardMeta = drawnixData.boardMeta;

          // 推断文件夹 ID
          const relativePath = filePath.replace(/^projects\//, '');
          const parts = relativePath.split('/');
          const folderPath =
            parts.length > 1 ? parts.slice(0, -1).join('/') : null;
          const folderId = folderPath
            ? folderIdMap.get(folderPath) || boardMeta?.folderId || null
            : null;

          const fileName = parts[parts.length - 1] || 'unnamed.drawnix';
          const boardName = boardMeta?.name || fileName.replace('.drawnix', '');

          // 检查是否已存在相同 ID 的画板
          if (boardMeta?.id && existingBoardIds.has(boardMeta.id)) {
            // 找到现有画板进行合并
            const existingBoard = existingBoards.find(b => b.id === boardMeta.id);
            if (existingBoard) {
              // 合并元素：保留现有元素，添加备份中新增的元素（基于ID去重）
              const existingElementIds = new Set(
                (existingBoard.elements || [])
                  .map(el => el.id)
                  .filter((id): id is string => !!id)
              );
              
              const backupElements = drawnixData.elements || [];
              // 过滤出备份中的新元素：
              // - 有 ID 的元素：只保留现有画板中不存在的
              // - 无 ID 的元素：全部保留（不会与现有元素冲突）
              const newElements = backupElements.filter(el => 
                el.id ? !existingElementIds.has(el.id) : true
              );
              
              // 合并后的元素：现有元素 + 备份中新增的元素
              const mergedElements = [
                ...(existingBoard.elements || []),
                ...newElements,
              ];

              // 合并画板数据
              const mergedBoard: Board = {
                ...existingBoard,
                // 合并后的元素（图形可以多，但不能少）
                elements: mergedElements,
                // 使用备份的 viewport（恢复视图位置）
                viewport: drawnixData.viewport || existingBoard.viewport,
                // 使用备份的 theme
                theme: drawnixData.theme || existingBoard.theme,
                // 更新时间
                updatedAt: Date.now(),
              };
              
              await workspaceStorageService.saveBoard(mergedBoard);
              boardsMerged++;
              continue;
            }
          }

          const board: Board = {
            id: boardMeta?.id || this.generateId(),
            name: boardName,
            folderId,
            order: boardMeta?.order ?? i,
            elements: drawnixData.elements || [],
            viewport: drawnixData.viewport,
            theme: drawnixData.theme,
            createdAt: boardMeta?.createdAt || Date.now(),
            updatedAt: boardMeta?.updatedAt || Date.now(),
          };

          await workspaceStorageService.saveBoard(board);
          boardsImported++;
        }
      } catch (error) {
        console.warn(
          `[BackupRestore] Failed to import board ${filePath}:`,
          error
        );
      }

      if (onProgress && drawnixFiles.length > 0) {
        const progress = 40 + Math.round(((i + 1) / drawnixFiles.length) * 15);
        onProgress(
          progress,
          `正在导入画板 (${i + 1}/${drawnixFiles.length})...`
        );
      }
    }

    return { folders: foldersImported, boards: boardsImported, merged: boardsMerged, skipped };
  }

  /**
   * 导入素材数据
   * 包括：
   * 1. 本地素材库的素材（保存到 localforage + unified-cache）
   * 2. AI 生成的缓存媒体（只保存到 unified-cache）
   */
  private async importAssets(
    zip: JSZip,
    onProgress?: ProgressCallback
  ): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;

    // 查找所有素材元数据文件
    const metaFiles = Object.keys(zip.files).filter(
      (name) => name.startsWith('assets/') && name.endsWith('.meta.json')
    );

    if (metaFiles.length === 0) {
      return { imported: 0, skipped: 0 };
    }

    const store = localforage.createInstance({
      name: ASSET_CONSTANTS.STORAGE_NAME,
      storeName: ASSET_CONSTANTS.STORE_NAME,
    });

    // 获取现有素材 ID 和已缓存的 URL
    const existingKeys = await store.keys();
    const existingIds = new Set(existingKeys);
    const existingCacheUrls = new Set(await unifiedCacheService.getAllCachedUrls());

    for (let i = 0; i < metaFiles.length; i++) {
      const metaPath = metaFiles[i];
      const assetId = metaPath.replace('assets/', '').replace('.meta.json', '');

      try {
        const metaFile = zip.file(metaPath);
        if (!metaFile) {
          skipped++;
          continue;
        }

        const metaContent = await metaFile.async('string');
        const metadata = JSON.parse(metaContent);

        // 判断是否为 AI 生成的缓存媒体
        const isAIGenerated = metadata.source === 'AI_GENERATED';

        // 检查是否已存在
        if (isAIGenerated) {
          // AI 生成的媒体：检查 URL 是否已在缓存中
          if (existingCacheUrls.has(metadata.url)) {
            skipped++;
            continue;
          }
        } else {
          // 本地素材：检查 ID 是否已存在
          if (existingIds.has(assetId)) {
            skipped++;
            continue;
          }
        }

        // 查找对应的媒体文件（尝试多种扩展名）
        const possibleExtensions = [
          '.jpg',
          '.png',
          '.gif',
          '.webp',
          '.mp4',
          '.webm',
          '.mov',
          '.svg',
        ];
        let blobData: Blob | null = null;

        for (const ext of possibleExtensions) {
          const blobFile = zip.file(`assets/${assetId}${ext}`);
          if (blobFile) {
            blobData = await blobFile.async('blob');
            break;
          }
        }

        // 如果没找到带扩展名的，尝试根据 mimeType 查找
        if (!blobData && metadata.mimeType) {
          const ext = getExtensionFromMimeType(metadata.mimeType);
          if (ext) {
            const blobFile = zip.file(`assets/${assetId}${ext}`);
            if (blobFile) {
              blobData = await blobFile.async('blob');
            }
          }
        }

        if (blobData) {
          // 将媒体文件存入统一缓存服务
          const cacheType = metadata.type === 'VIDEO' ? 'video' : 'image';
          await unifiedCacheService.cacheMediaFromBlob(
            metadata.url,
            blobData,
            cacheType as 'image' | 'video',
            {
              taskId: metadata.metadata?.taskId || assetId,
              prompt: metadata.metadata?.prompt,
              model: metadata.metadata?.model,
            }
          );

          // 只有本地素材才保存到 localforage asset store
          if (!isAIGenerated) {
            await store.setItem(assetId, metadata);
          }

          imported++;
        } else {
          // 没有媒体文件，跳过（只有元数据没有意义）
          console.warn(
            `[BackupRestore] No media file found for asset ${assetId}, skipping`
          );
          skipped++;
        }
      } catch (error) {
        console.warn(
          `[BackupRestore] Failed to import asset ${assetId}:`,
          error
        );
        skipped++;
      }

      if (onProgress && metaFiles.length > 0) {
        const progress = 60 + Math.round(((i + 1) / metaFiles.length) * 35);
        onProgress(progress, `正在导入素材 (${i + 1}/${metaFiles.length})...`);
      }
    }

    return { imported, skipped };
  }

  /**
   * 导入任务数据
   * 用于恢复素材库中 AI 生成素材的展示
   */
  private async importTasks(
    zip: JSZip
  ): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;

    const tasksFile = zip.file('tasks.json');
    if (!tasksFile) {
      // 旧版备份文件可能没有 tasks.json，这是正常的
      return { imported: 0, skipped: 0 };
    }

    try {
      const tasksContent = await tasksFile.async('string');
      const tasks: Task[] = JSON.parse(tasksContent);

      if (!Array.isArray(tasks) || tasks.length === 0) {
        return { imported: 0, skipped: 0 };
      }

      // 获取现有任务 ID
      const existingTasks = swTaskQueueService.getAllTasks();
      const existingTaskIds = new Set(existingTasks.map(t => t.id));

      // 过滤出需要导入的任务（去重）
      const tasksToImport = tasks.filter(task => {
        if (existingTaskIds.has(task.id)) {
          skipped++;
          return false;
        }
        return true;
      });

      if (tasksToImport.length > 0) {
        // 使用 restoreTasks 方法恢复任务
        await swTaskQueueService.restoreTasks(tasksToImport);
        imported = tasksToImport.length;
      }
    } catch (error) {
      console.warn('[BackupRestore] Failed to import tasks:', error);
    }

    return { imported, skipped };
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
  }
}

export const backupRestoreService = new BackupRestoreService();
