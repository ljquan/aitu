/**
 * Workspace Export/Import Service
 *
 * Handles exporting workspace data to ZIP and importing from ZIP.
 * Exports boards as .drawnix files organized by folder structure.
 * Import infers structure from ZIP directory and .drawnix file metadata.
 */

import JSZip from 'jszip';
import { workspaceStorageService } from './workspace-storage-service';
import { assetStorageService } from './asset-storage-service';
import type { Folder, Board } from '../types/workspace.types';
import { WORKSPACE_DEFAULTS } from '../types/workspace.types';
import type { StoredAsset } from '../types/asset.types';
import { DrawnixExportedType } from '../data/types';
import { VERSIONS } from '../constants';
import localforage from 'localforage';
import { ASSET_CONSTANTS } from '../constants/ASSET_CONSTANTS';

/**
 * Extended drawnix file format with board metadata
 */
interface DrawnixFileData {
  type: string;
  version: number;
  source: string;
  elements: PlaitElement[];
  viewport: Viewport;
  theme?: string;
  /** Board metadata for workspace import */
  boardMeta?: {
    id: string;
    name: string;
    order: number;
    createdAt: number;
    updatedAt: number;
  };
}

/** Viewport type for board */
interface Viewport {
  zoom: number;
  offsetX?: number;
  offsetY?: number;
}

/** Plait element base type */
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
 * Workspace Export Service
 */
class WorkspaceExportService {
  /**
   * Export workspace to ZIP file with folder structure
   * Board metadata is embedded in .drawnix files.
   */
  async exportToZip(options?: { onProgress?: (progress: number, message: string) => void }): Promise<Blob> {
    const { onProgress } = options || {};
    const zip = new JSZip();

    onProgress?.(5, '正在加载数据...');

    const [folders, boards] = await Promise.all([
      workspaceStorageService.loadAllFolders(),
      workspaceStorageService.loadAllBoards(),
    ]);

    onProgress?.(15, '正在构建目录结构...');

    const folderPathMap = this.buildFolderPathMap(folders);
    const assetIds = this.collectAssetIds(boards);

    onProgress?.(20, '正在加载素材...');

    const assets = await this.loadAssets(assetIds);

    onProgress?.(30, '正在创建文件夹...');

    for (const folder of folders) {
      const path = folderPathMap.get(folder.id) || folder.name;
      zip.folder(path);
    }

    onProgress?.(40, '正在导出画板...');

    const totalBoards = boards.length;
    for (let i = 0; i < boards.length; i++) {
      const board = boards[i];
      const folderPath = board.folderId ? folderPathMap.get(board.folderId) : null;
      const safeName = this.sanitizeFileName(board.name);
      const boardPath = folderPath 
        ? `${folderPath}/${safeName}.drawnix`
        : `${safeName}.drawnix`;

      const drawnixData: DrawnixFileData = {
        type: DrawnixExportedType.drawnix,
        version: VERSIONS.drawnix,
        source: 'web',
        elements: board.elements || [],
        viewport: board.viewport || { zoom: 1 },
        theme: board.theme,
        boardMeta: {
          id: board.id,
          name: board.name,
          order: board.order,
          createdAt: board.createdAt,
          updatedAt: board.updatedAt,
        },
      };

      zip.file(boardPath, JSON.stringify(drawnixData, null, 2));

      if (totalBoards > 0) {
        const boardProgress = 40 + Math.round((i + 1) / totalBoards * 20);
        onProgress?.(boardProgress, `正在导出画板 (${i + 1}/${totalBoards})...`);
      }
    }

    onProgress?.(60, '正在导出素材...');

    if (assets.length > 0) {
      const assetsFolder = zip.folder('_assets');
      if (assetsFolder) {
        const totalAssets = assets.length;
        for (let i = 0; i < assets.length; i++) {
          const asset = assets[i];
          const { blobData, ...metadata } = asset;
          assetsFolder.file(`${asset.id}.meta.json`, JSON.stringify(metadata, null, 2));
          
          if (blobData) {
            assetsFolder.file(`${asset.id}.blob`, blobData);
          }

          const assetProgress = 60 + Math.round((i + 1) / totalAssets * 20);
          onProgress?.(assetProgress, `正在导出素材 (${i + 1}/${totalAssets})...`);
        }
      }
    }

    onProgress?.(85, '正在压缩文件...');

    const blob = await zip.generateAsync(
      {
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      },
      (metadata: { percent: number; currentFile: string | null }) => {
        const zipProgress = 85 + Math.round(metadata.percent * 0.14);
        const fileName = metadata.currentFile || '';
        const displayName = fileName.length > 30 
          ? '...' + fileName.slice(-27) 
          : fileName;
        onProgress?.(zipProgress, `正在压缩: ${displayName || '...'}`);
      }
    );

    onProgress?.(100, '导出完成');

    return blob;
  }

  /**
   * Build folder path map (folderId -> full path)
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

      const safeName = this.sanitizeFileName(folder.name);
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
   * Sanitize file/folder name for filesystem
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'unnamed';
  }

  /**
   * Import workspace from ZIP file
   * Infers structure from ZIP directory and .drawnix file metadata.
   */
  async importFromZip(
    file: File,
    options: {
      merge?: boolean;
      onProgress?: (progress: number, message: string) => void;
    } = {}
  ): Promise<{
    success: boolean;
    folders: number;
    boards: number;
    assets: number;
    errors: string[];
  }> {
    const { merge = false, onProgress } = options;
    const errors: string[] = [];
    let importedFolders = 0;
    let importedBoards = 0;
    let importedAssets = 0;

    try {
      onProgress?.(5, '正在读取文件...');
      const zip = await JSZip.loadAsync(file);

      onProgress?.(10, '正在验证文件格式...');

      const drawnixFiles = Object.keys(zip.files).filter(
        (name) => name.endsWith('.drawnix') && !name.startsWith('_')
      );
      
      if (drawnixFiles.length === 0) {
        throw new Error('无效的导出文件：未找到画板文件');
      }

      if (!merge) {
        onProgress?.(15, '正在清理现有数据...');
        await workspaceStorageService.clearAll();
        await assetStorageService.clearAll();
        
        // Mark migration as completed to prevent creating "迁移的画板" after import
        await workspaceStorageService.saveState({
          currentBoardId: null,
          expandedFolderIds: [],
          sidebarWidth: WORKSPACE_DEFAULTS.SIDEBAR_WIDTH,
          sidebarCollapsed: false,
          migrationCompleted: true,
        });
      }

      // Import assets first
      onProgress?.(20, '正在导入素材...');
      const assetFiles = Object.keys(zip.files).filter(
        (name) => name.startsWith('_assets/') && name.endsWith('.meta.json')
      );

      for (let i = 0; i < assetFiles.length; i++) {
        const metaPath = assetFiles[i];
        const assetId = metaPath.replace('_assets/', '').replace('.meta.json', '');
        const blobPath = metaPath.replace('.meta.json', '.blob');

        try {
          const metaFile = zip.file(metaPath);
          const blobFile = zip.file(blobPath);

          if (metaFile && blobFile) {
            const metaContent = await metaFile.async('string');
            const metadata = JSON.parse(metaContent);
            const blobData = await blobFile.async('blob');

            const storedAsset: StoredAsset = {
              ...metadata,
              blobData,
            };

            await this.saveStoredAsset(storedAsset);
            importedAssets++;
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`素材 ${assetId} 导入失败: ${errorMessage}`);
        }

        if (assetFiles.length > 0) {
          const progress = 20 + ((i + 1) / assetFiles.length) * 30;
          onProgress?.(progress, `正在导入素材 (${i + 1}/${assetFiles.length})...`);
        }
      }

      // Build folder structure from directory paths
      onProgress?.(55, '正在分析目录结构...');
      
      const folderPaths = new Set<string>();
      const folderIdMap = new Map<string, string>();
      
      for (const filePath of drawnixFiles) {
        const parts = filePath.split('/');
        if (parts.length > 1) {
          let currentPath = '';
          for (let i = 0; i < parts.length - 1; i++) {
            currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
            folderPaths.add(currentPath);
          }
        }
      }

      const sortedPaths = Array.from(folderPaths).sort((a, b) => {
        const depthA = a.split('/').length;
        const depthB = b.split('/').length;
        return depthA - depthB || a.localeCompare(b);
      });

      onProgress?.(60, '正在导入文件夹...');
      for (let i = 0; i < sortedPaths.length; i++) {
        const folderPath = sortedPaths[i];
        const parts = folderPath.split('/');
        const folderName = parts[parts.length - 1];
        const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : null;
        const parentId = parentPath ? folderIdMap.get(parentPath) || null : null;

        try {
          const folderId = this.generateId();
          folderIdMap.set(folderPath, folderId);

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
          importedFolders++;
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`文件夹 "${folderName}" 导入失败: ${errorMessage}`);
        }
      }

      // Import boards from .drawnix files
      onProgress?.(70, '正在导入画板...');
      for (let i = 0; i < drawnixFiles.length; i++) {
        const filePath = drawnixFiles[i];
        try {
          const drawnixFile = zip.file(filePath);
          if (drawnixFile) {
            const drawnixContent = await drawnixFile.async('string');
            const drawnixData: DrawnixFileData = JSON.parse(drawnixContent);

            const fileName = filePath.split('/').pop() || 'unnamed.drawnix';
            const boardName = drawnixData.boardMeta?.name || fileName.replace('.drawnix', '');
            
            const parts = filePath.split('/');
            const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : null;
            const folderId = folderPath ? folderIdMap.get(folderPath) || null : null;

            const boardMeta = drawnixData.boardMeta;
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
            importedBoards++;
          }
        } catch (error: unknown) {
          const fileName = filePath.split('/').pop() || filePath;
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`画板 "${fileName}" 导入失败: ${errorMessage}`);
        }

        const progress = 70 + ((i + 1) / drawnixFiles.length) * 25;
        onProgress?.(progress, `正在导入画板 (${i + 1}/${drawnixFiles.length})...`);
      }

      onProgress?.(100, '导入完成');

      return {
        success: errors.length === 0,
        folders: importedFolders,
        boards: importedBoards,
        assets: importedAssets,
        errors,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        folders: importedFolders,
        boards: importedBoards,
        assets: importedAssets,
        errors: [...errors, errorMessage],
      };
    }
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Collect all asset IDs referenced in board elements
   */
  private collectAssetIds(boards: Board[]): Set<string> {
    const assetIds = new Set<string>();

    for (const board of boards) {
      if (board.elements) {
        this.findAssetIdsInElements(board.elements, assetIds);
      }
    }

    return assetIds;
  }

  /**
   * Recursively find asset IDs in elements
   */
  private findAssetIdsInElements(elements: PlaitElement[], assetIds: Set<string>): void {
    for (const element of elements) {
      if (element.assetId) {
        assetIds.add(element.assetId);
      }
      if (element.imageAssetId) {
        assetIds.add(element.imageAssetId);
      }
      if (element.videoAssetId) {
        assetIds.add(element.videoAssetId);
      }

      if (element.children && Array.isArray(element.children)) {
        this.findAssetIdsInElements(element.children, assetIds);
      }
    }
  }

  /**
   * Load assets by IDs
   */
  private async loadAssets(assetIds: Set<string>): Promise<StoredAsset[]> {
    const assets: StoredAsset[] = [];
    
    const store = localforage.createInstance({
      name: ASSET_CONSTANTS.STORAGE_NAME,
      storeName: ASSET_CONSTANTS.STORE_NAME,
    });

    for (const id of assetIds) {
      try {
        const stored = await store.getItem<StoredAsset>(id);
        if (stored) {
          assets.push(stored);
        }
      } catch (error) {
        console.warn(`[WorkspaceExport] Failed to load asset ${id}:`, error);
      }
    }

    return assets;
  }

  /**
   * Save StoredAsset directly to storage
   */
  private async saveStoredAsset(asset: StoredAsset): Promise<void> {
    const store = localforage.createInstance({
      name: ASSET_CONSTANTS.STORAGE_NAME,
      storeName: ASSET_CONSTANTS.STORE_NAME,
    });

    await store.setItem(asset.id, asset);
  }

  /**
   * Download ZIP file
   */
  downloadZip(blob: Blob, filename?: string): void {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '');
    const defaultFilename = `aitu_workspace_${dateStr}_${timeStr}.zip`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || defaultFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const workspaceExportService = new WorkspaceExportService();
