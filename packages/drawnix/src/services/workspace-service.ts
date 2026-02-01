/**
 * Workspace Service
 *
 * Core service for managing workspace operations including
 * folders, boards, and tree structure.
 */

import { Subject, Observable } from 'rxjs';
import {
  Folder,
  Board,
  BoardMetadata,
  TreeNode,
  FolderTreeNode,
  BoardTreeNode,
  WorkspaceState,
  WorkspaceEvent,
  CreateFolderOptions,
  CreateBoardOptions,
  BoardChangeData,
  WORKSPACE_DEFAULTS,
  ValidationError,
} from '../types/workspace.types';
import { workspaceStorageService } from './workspace-storage-service';

/**
 * Generate UUID v4
 */
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Workspace service for managing the entire workspace
 */
class WorkspaceService {
  private static instance: WorkspaceService;
  private folders: Map<string, Folder> = new Map();
  /** 存储画板元数据（不含 elements），用于侧边栏显示 */
  private boardMetadata: Map<string, BoardMetadata> = new Map();
  /** 存储已加载完整数据的画板（含 elements），按需加载 */
  private loadedBoards: Map<string, Board> = new Map();
  /** @deprecated 保留用于向后兼容，实际使用 boardMetadata */
  private boards: Map<string, Board> = new Map();
  private state: WorkspaceState;
  private events$: Subject<WorkspaceEvent> = new Subject();
  private initialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    this.state = {
      currentBoardId: null,
      expandedFolderIds: [],
      sidebarWidth: WORKSPACE_DEFAULTS.SIDEBAR_WIDTH,
      sidebarCollapsed: false,
    };
  }

  static getInstance(): WorkspaceService {
    if (!WorkspaceService.instance) {
      WorkspaceService.instance = new WorkspaceService();
    }
    return WorkspaceService.instance;
  }

  /**
   * Initialize workspace service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 如果正在初始化，等待完成
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      await workspaceStorageService.initialize();

      // 只加载元数据，不加载画板元素，减少内存占用
      const [folders, boardMetadata, state] = await Promise.all([
        workspaceStorageService.loadAllFolders(),
        workspaceStorageService.loadAllBoardMetadata(),
        workspaceStorageService.loadState(),
      ]);

      // Use requestIdleCallback to yield to main thread before processing data
      await new Promise<void>((resolve) => {
        if ('requestIdleCallback' in window) {
          (window as Window).requestIdleCallback(() => resolve(), {
            timeout: 50,
          });
        } else {
          setTimeout(resolve, 0);
        }
      });

      this.folders = new Map(folders.map((f) => [f.id, f]));
      this.boardMetadata = new Map(boardMetadata.map((b) => [b.id, b]));
      // 为了向后兼容，也更新 boards Map（但此时不含 elements）
      this.boards = new Map(boardMetadata.map((b) => [b.id, { ...b, elements: [] } as Board]));
      this.state = state;

      this.initialized = true;
      // console.log('[WorkspaceService] Initialized with', {
      //   folders: this.folders.size,
      //   boards: this.boardMetadata.size,
      // });
    } catch (error) {
      console.error('[WorkspaceService] Failed to initialize:', error);
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Wait for initialization to complete
   */
  async waitForInitialization(): Promise<void> {
    if (this.initialized) return;
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    // 如果还没开始初始化，启动初始化
    return this.initialize();
  }

  // ========== Folder Operations ==========

  async createFolder(options: CreateFolderOptions): Promise<Folder> {
    await this.ensureInitialized();

    const parentId = options.parentId || null;
    const folderId = generateId();

    const providedName = (
      options.name ?? WORKSPACE_DEFAULTS.DEFAULT_FOLDER_NAME
    ).trim();
    const baseName = providedName || WORKSPACE_DEFAULTS.DEFAULT_FOLDER_NAME;
    const isDefaultName = baseName === WORKSPACE_DEFAULTS.DEFAULT_FOLDER_NAME;

    const finalName = isDefaultName
      ? this.generateUniqueFolderName(baseName, parentId)
      : (() => {
          const validation = this.validateFolderName(
            folderId,
            baseName,
            parentId
          );
          if (!validation.valid) {
            throw new ValidationError(validation.error!);
          }
          return baseName;
        })();

    const siblings = this.getFolderChildren(parentId);
    const maxOrder =
      siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;

    const folder: Folder = {
      id: folderId,
      name: finalName,
      parentId: parentId,
      order: maxOrder,
      isExpanded: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.folders.set(folder.id, folder);
    await workspaceStorageService.saveFolder(folder);
    this.emit('folderCreated', folder);

    return folder;
  }

  /**
   * Validate folder name
   * 验证文件夹名称
   */
  private validateFolderName(
    folderId: string,
    name: string,
    parentId: string | null
  ): { valid: boolean; error?: string } {
    // 1. 空名称检查
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return { valid: false, error: '文件夹名称不能为空' };
    }

    // 2. 长度检查
    if (trimmedName.length > WORKSPACE_DEFAULTS.MAX_NAME_LENGTH) {
      return {
        valid: false,
        error: `文件夹名称不能超过${WORKSPACE_DEFAULTS.MAX_NAME_LENGTH}个字符`,
      };
    }

    // 3. 同级重名检查（只检查同一父文件夹内的其他文件夹）
    const siblings = this.getFolderChildren(parentId).filter(
      (f) => f.id !== folderId
    );

    const isDuplicate = siblings.some((f) => f.name === trimmedName);
    if (isDuplicate) {
      return {
        valid: false,
        error: '此文件夹中已存在同名文件夹，请使用其他名称',
      };
    }

    return { valid: true };
  }

  async renameFolder(id: string, name: string): Promise<void> {
    const folder = this.folders.get(id);
    if (!folder) throw new Error(`Folder ${id} not found`);

    // 验证名称
    const validation = this.validateFolderName(id, name, folder.parentId);
    if (!validation.valid) {
      throw new ValidationError(validation.error!);
    }

    const trimmedName = name.trim();
    folder.name = trimmedName;
    folder.updatedAt = Date.now();

    this.folders.set(id, folder);
    await workspaceStorageService.saveFolder(folder);
    this.emit('folderUpdated', folder);
  }

  async deleteFolder(id: string): Promise<void> {
    const folder = this.folders.get(id);
    if (!folder) throw new Error(`Folder ${id} not found`);

    // Delete all child folders recursively
    const childFolders = this.getFolderChildren(id);
    for (const child of childFolders) {
      await this.deleteFolder(child.id);
    }

    // Move boards to root
    const boards = this.getBoardsInFolder(id);
    for (const board of boards) {
      board.folderId = null;
      await workspaceStorageService.saveBoard(board);
    }

    this.folders.delete(id);
    await workspaceStorageService.deleteFolder(id);
    this.emit('folderDeleted', folder);
  }

  /**
   * Delete folder and all its contents (boards and subfolders)
   */
  async deleteFolderWithContents(id: string): Promise<void> {
    const folder = this.folders.get(id);
    if (!folder) throw new Error(`Folder ${id} not found`);

    // Delete all boards in this folder
    const boards = this.getBoardsInFolder(id);
    for (const board of boards) {
      this.boards.delete(board.id);
      await workspaceStorageService.deleteBoard(board.id);
      this.emit('boardDeleted', board);
    }

    // Delete all child folders recursively (with their contents)
    const childFolders = this.getFolderChildren(id);
    for (const child of childFolders) {
      await this.deleteFolderWithContents(child.id);
    }

    // Delete the folder itself
    this.folders.delete(id);
    await workspaceStorageService.deleteFolder(id);
    this.emit('folderDeleted', folder);
  }

  toggleFolderExpanded(id: string): void {
    const folder = this.folders.get(id);
    if (!folder) return;

    folder.isExpanded = !folder.isExpanded;
    this.folders.set(id, folder);

    // Update state
    if (folder.isExpanded) {
      if (!this.state.expandedFolderIds.includes(id)) {
        this.state.expandedFolderIds.push(id);
      }
    } else {
      this.state.expandedFolderIds = this.state.expandedFolderIds.filter(
        (fid) => fid !== id
      );
    }
    this.saveState();
    this.emit('treeChanged');
  }

  // ========== Board Operations ==========

  /**
   * Generate a unique board name within a folder by appending (n) when needed
   */
  private generateUniqueBoardName(
    baseName: string,
    folderId: string | null,
    ignoreBoardId?: string
  ): string {
    const trimmedBaseName =
      baseName.trim() || WORKSPACE_DEFAULTS.DEFAULT_BOARD_NAME;

    const siblings = this.getBoardsInFolder(folderId).filter(
      (b) => b.id !== ignoreBoardId
    );
    const existingNames = new Set(siblings.map((b) => b.name));

    if (!existingNames.has(trimmedBaseName)) {
      return trimmedBaseName;
    }

    let counter = 2;
    let candidate = `${trimmedBaseName} (${counter})`;
    while (existingNames.has(candidate)) {
      counter += 1;
      candidate = `${trimmedBaseName} (${counter})`;
    }

    return candidate;
  }

  /**
   * Generate a unique folder name within a parent by appending (n) when needed
   */
  private generateUniqueFolderName(
    baseName: string,
    parentId: string | null,
    ignoreFolderId?: string
  ): string {
    const trimmedBaseName =
      baseName.trim() || WORKSPACE_DEFAULTS.DEFAULT_FOLDER_NAME;

    const siblings = this.getFolderChildren(parentId).filter(
      (f) => f.id !== ignoreFolderId
    );
    const existingNames = new Set(siblings.map((f) => f.name));

    if (!existingNames.has(trimmedBaseName)) {
      return trimmedBaseName;
    }

    let counter = 2;
    let candidate = `${trimmedBaseName} (${counter})`;
    while (existingNames.has(candidate)) {
      counter += 1;
      candidate = `${trimmedBaseName} (${counter})`;
    }

    return candidate;
  }

  async createBoard(options: CreateBoardOptions): Promise<Board> {
    await this.ensureInitialized();

    const boardId = generateId();
    const now = Date.now();
    const folderId = options.folderId || null;

    const providedName = (
      options.name ?? WORKSPACE_DEFAULTS.DEFAULT_BOARD_NAME
    ).trim();
    const baseName = providedName || WORKSPACE_DEFAULTS.DEFAULT_BOARD_NAME;
    const isDefaultName = baseName === WORKSPACE_DEFAULTS.DEFAULT_BOARD_NAME;

    // 默认名称自动去重，其余名称遵循重名校验
    const finalName = isDefaultName
      ? this.generateUniqueBoardName(baseName, folderId)
      : (() => {
          const validation = this.validateBoardName(
            boardId,
            baseName,
            folderId
          );
          if (!validation.valid) {
            throw new ValidationError(validation.error!);
          }
          return baseName;
        })();

    // Get max order in folder
    const siblings = this.getBoardsInFolder(folderId);
    const maxOrder =
      siblings.length > 0 ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;

    const board: Board = {
      id: boardId,
      name: finalName,
      folderId,
      order: maxOrder,
      elements: options.elements || [],
      viewport: options.viewport,
      theme: options.theme,
      createdAt: now,
      updatedAt: now,
    };

    this.boards.set(boardId, board);
    // 同步更新 boardMetadata（switchBoard 依赖它验证画板是否存在）
    const { elements, ...metadata } = board;
    this.boardMetadata.set(boardId, metadata);
    await workspaceStorageService.saveBoard(board);

    this.emit('boardCreated', board);
    return board;
  }

  /**
   * Validate board name
   * 验证画板名称
   */
  private validateBoardName(
    boardId: string,
    name: string,
    folderId: string | null
  ): { valid: boolean; error?: string } {
    // 1. 空名称检查
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return { valid: false, error: '画板名称不能为空' };
    }

    // 2. 长度检查
    if (trimmedName.length > WORKSPACE_DEFAULTS.MAX_NAME_LENGTH) {
      return {
        valid: false,
        error: `画板名称不能超过${WORKSPACE_DEFAULTS.MAX_NAME_LENGTH}个字符`,
      };
    }

    // 3. 同级重名检查（只检查同一文件夹内的其他画板）
    const siblings = Array.from(this.boards.values()).filter(
      (b) => b.folderId === folderId && b.id !== boardId
    );

    const isDuplicate = siblings.some((b) => b.name === trimmedName);
    if (isDuplicate) {
      return {
        valid: false,
        error: '此文件夹中已存在同名画板，请使用其他名称',
      };
    }

    return { valid: true };
  }

  async renameBoard(id: string, name: string): Promise<void> {
    const board = this.boards.get(id);
    if (!board) throw new Error(`Board ${id} not found`);

    // 验证名称
    const validation = this.validateBoardName(id, name, board.folderId);
    if (!validation.valid) {
      throw new ValidationError(validation.error!);
    }

    const trimmedName = name.trim();
    board.name = trimmedName;
    board.updatedAt = Date.now();

    this.boards.set(id, board);
    // 同步更新 boardMetadata
    const metadata = this.boardMetadata.get(id);
    if (metadata) {
      metadata.name = trimmedName;
      metadata.updatedAt = board.updatedAt;
    }
    await workspaceStorageService.saveBoard(board);
    this.emit('boardUpdated', board);
  }

  async deleteBoard(id: string): Promise<void> {
    const board = this.boards.get(id);
    if (!board) throw new Error(`Board ${id} not found`);

    // Clear current if this board is active
    if (this.state.currentBoardId === id) {
      this.state.currentBoardId = null;
      this.saveState();
    }

    this.boards.delete(id);
    this.boardMetadata.delete(id);
    this.loadedBoards.delete(id);
    await workspaceStorageService.deleteBoard(id);
    this.emit('boardDeleted', board);
  }

  async moveBoard(
    id: string,
    targetFolderId: string | null,
    targetId?: string,
    position?: 'before' | 'after'
  ): Promise<void> {
    const board = this.boards.get(id);
    if (!board) throw new Error(`Board ${id} not found`);

    const targetFolder = targetFolderId || null;

    // Validate name conflicts when moving into a different folder
    if (board.folderId !== targetFolder) {
      const validation = this.validateBoardName(id, board.name, targetFolder);
      if (!validation.valid) {
        throw new ValidationError(validation.error!);
      }
    }

    board.folderId = targetFolder;
    board.updatedAt = Date.now();

    // Get all items in target folder (excluding the moved board)
    const boardSiblings = this.getBoardsInFolder(targetFolder).filter(
      (b) => b.id !== id
    );
    const folderSiblings = this.getFolderChildren(targetFolder);

    // Build ordered list of all items
    let allItems: Array<{ id: string; type: 'board' | 'folder' }> = [
      ...folderSiblings.map((f) => ({ id: f.id, type: 'folder' as const })),
      ...boardSiblings.map((b) => ({ id: b.id, type: 'board' as const })),
    ].sort((a, b) => {
      const orderA =
        a.type === 'board'
          ? this.boards.get(a.id)?.order ?? 0
          : this.folders.get(a.id)?.order ?? 0;
      const orderB =
        b.type === 'board'
          ? this.boards.get(b.id)?.order ?? 0
          : this.folders.get(b.id)?.order ?? 0;
      return orderA - orderB;
    });

    if (targetId && position) {
      // Find target index
      const targetIndex = allItems.findIndex((item) => item.id === targetId);
      if (targetIndex !== -1) {
        // Insert at the correct position
        const insertIndex =
          position === 'before' ? targetIndex : targetIndex + 1;
        allItems.splice(insertIndex, 0, { id: board.id, type: 'board' });
      } else {
        // Target not found, add to end
        allItems.push({ id: board.id, type: 'board' });
      }
    } else {
      // No target specified, move to end
      allItems.push({ id: board.id, type: 'board' });
    }

    // Reassign integer orders based on new positions
    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      if (item.type === 'board') {
        const b = this.boards.get(item.id);
        if (b) {
          b.order = i;
          this.boards.set(item.id, b);
          // 同步更新 boardMetadata
          const bMeta = this.boardMetadata.get(item.id);
          if (bMeta) {
            bMeta.order = i;
            bMeta.folderId = b.folderId;
            bMeta.updatedAt = b.updatedAt;
          }
          await workspaceStorageService.saveBoard(b);
        }
      } else {
        const f = this.folders.get(item.id);
        if (f) {
          f.order = i;
          this.folders.set(item.id, f);
          await workspaceStorageService.saveFolder(f);
        }
      }
    }

    this.emit('boardUpdated', board);
    this.emit('treeChanged');
  }

  /**
   * Move folder to a new parent folder
   */
  async moveFolder(
    id: string,
    targetParentId: string | null,
    targetId?: string,
    position?: 'before' | 'after'
  ): Promise<void> {
    const folder = this.folders.get(id);
    if (!folder) throw new Error(`Folder ${id} not found`);

    // Prevent moving folder into itself or its descendants
    if (targetParentId) {
      let parent = this.folders.get(targetParentId);
      while (parent) {
        if (parent.id === id) {
          throw new Error('Cannot move folder into itself or its descendants');
        }
        parent = parent.parentId
          ? this.folders.get(parent.parentId)
          : undefined;
      }
    }

    // Validate duplicate name when moving to another parent
    if (folder.parentId !== targetParentId) {
      const validation = this.validateFolderName(
        id,
        folder.name,
        targetParentId
      );
      if (!validation.valid) {
        throw new ValidationError(validation.error!);
      }
    }

    folder.parentId = targetParentId;
    folder.updatedAt = Date.now();

    // Get all items in target folder (excluding the moved folder)
    const folderSiblings = this.getFolderChildren(targetParentId).filter(
      (f) => f.id !== id
    );
    const boardSiblings = this.getBoardsInFolder(targetParentId);

    // Build ordered list of all items
    let allItems: Array<{ id: string; type: 'board' | 'folder' }> = [
      ...folderSiblings.map((f) => ({ id: f.id, type: 'folder' as const })),
      ...boardSiblings.map((b) => ({ id: b.id, type: 'board' as const })),
    ].sort((a, b) => {
      const orderA =
        a.type === 'board'
          ? this.boards.get(a.id)?.order ?? 0
          : this.folders.get(a.id)?.order ?? 0;
      const orderB =
        b.type === 'board'
          ? this.boards.get(b.id)?.order ?? 0
          : this.folders.get(b.id)?.order ?? 0;
      return orderA - orderB;
    });

    if (targetId && position) {
      // Find target index
      const targetIndex = allItems.findIndex((item) => item.id === targetId);
      if (targetIndex !== -1) {
        // Insert at the correct position
        const insertIndex =
          position === 'before' ? targetIndex : targetIndex + 1;
        allItems.splice(insertIndex, 0, { id: folder.id, type: 'folder' });
      } else {
        // Target not found, add to end
        allItems.push({ id: folder.id, type: 'folder' });
      }
    } else {
      // No target specified, move to end
      allItems.push({ id: folder.id, type: 'folder' });
    }

    // Reassign integer orders based on new positions
    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      if (item.type === 'board') {
        const b = this.boards.get(item.id);
        if (b) {
          b.order = i;
          this.boards.set(item.id, b);
          // 同步更新 boardMetadata
          const bMeta = this.boardMetadata.get(item.id);
          if (bMeta) {
            bMeta.order = i;
            bMeta.folderId = b.folderId;
            bMeta.updatedAt = b.updatedAt;
          }
          await workspaceStorageService.saveBoard(b);
        }
      } else {
        const f = this.folders.get(item.id);
        if (f) {
          f.order = i;
          this.folders.set(item.id, f);
          await workspaceStorageService.saveFolder(f);
        }
      }
    }

    this.emit('folderUpdated', folder);
    this.emit('treeChanged');
  }

  /**
   * Reorder items within the same parent
   */
  async reorderItems(
    items: Array<{ id: string; type: 'board' | 'folder'; order: number }>
  ): Promise<void> {
    const now = Date.now();

    for (const item of items) {
      if (item.type === 'board') {
        const board = this.boards.get(item.id);
        if (board) {
          board.order = item.order;
          board.updatedAt = now;
          this.boards.set(item.id, board);
          // 同步更新 boardMetadata
          const bMeta = this.boardMetadata.get(item.id);
          if (bMeta) {
            bMeta.order = item.order;
            bMeta.updatedAt = now;
          }
          await workspaceStorageService.saveBoard(board);
        }
      } else {
        const folder = this.folders.get(item.id);
        if (folder) {
          folder.order = item.order;
          folder.updatedAt = now;
          this.folders.set(item.id, folder);
          await workspaceStorageService.saveFolder(folder);
        }
      }
    }

    this.emit('treeChanged');
  }

  /**
   * Copy a board with all its content
   */
  async copyBoard(id: string): Promise<Board> {
    const sourceBoard = this.boards.get(id);
    if (!sourceBoard) throw new Error(`Board ${id} not found`);

    // Generate new name with "副本" suffix
    let newName = `${sourceBoard.name} 副本`;

    // Check if name already exists and add number if needed
    const existingNames = Array.from(this.boards.values())
      .filter((b) => b.folderId === sourceBoard.folderId)
      .map((b) => b.name);

    let counter = 1;
    while (existingNames.includes(newName)) {
      counter++;
      newName = `${sourceBoard.name} 副本 ${counter}`;
    }

    // Create new board with copied content
    const newBoard = await this.createBoard({
      name: newName,
      folderId: sourceBoard.folderId,
      elements: JSON.parse(JSON.stringify(sourceBoard.elements)), // Deep copy
      viewport: sourceBoard.viewport ? { ...sourceBoard.viewport } : undefined,
      theme: sourceBoard.theme,
    });

    return newBoard;
  }

  /**
   * Batch delete multiple boards
   */
  async deleteBoardsBatch(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.deleteBoard(id);
    }
  }

  /**
   * Batch move multiple boards to a folder
   */
  async moveBoardsBatch(
    ids: string[],
    targetFolderId: string | null
  ): Promise<void> {
    for (const id of ids) {
      await this.moveBoard(id, targetFolderId);
    }
  }

  async switchBoard(boardId: string): Promise<Board> {
    await this.ensureInitialized();

    // 检查元数据是否存在
    const metadata = this.boardMetadata.get(boardId);
    if (!metadata) throw new Error(`Board ${boardId} not found`);

    // 按需加载画板内容
    let board = this.loadedBoards.get(boardId);
    if (!board) {
      const loadedBoard = await workspaceStorageService.loadBoard(boardId);
      if (!loadedBoard) throw new Error(`Board ${boardId} not found in storage`);
      board = loadedBoard;
      this.loadedBoards.set(boardId, board);
      // 同步更新 boards Map（向后兼容）
      this.boards.set(boardId, board);
    }

    // Save current board before switching
    if (this.state.currentBoardId && this.state.currentBoardId !== boardId) {
      // Current board data should be saved by the caller before switching
    }

    this.state.currentBoardId = boardId;
    this.saveState();

    this.emit('boardSwitched', board);
    return board;
  }

  /**
   * Reload board from storage (invalidate cache)
   * Used when board data is updated externally (e.g. sync)
   */
  async reloadBoard(boardId: string): Promise<Board> {
    await this.ensureInitialized();
    
    // Force load from storage
    const board = await workspaceStorageService.loadBoard(boardId);
    if (!board) throw new Error(`Board ${boardId} not found in storage`);
    
    // Update cache
    this.loadedBoards.set(boardId, board);
    this.boards.set(boardId, board);
    
    // Update metadata
    const { elements, ...metadata } = board;
    this.boardMetadata.set(boardId, metadata);
    
    // Emit events
    this.emit('boardUpdated', board);
    
    // If it's the current board, emit switch event to force UI refresh
    if (this.state.currentBoardId === boardId) {
      this.emit('boardSwitched', board);
    }
    
    return board;
  }

  async saveBoard(boardId: string, data: BoardChangeData): Promise<void> {
    // 优先从已加载的画板获取
    let board = this.loadedBoards.get(boardId) || this.boards.get(boardId);
    if (!board) throw new Error(`Board ${boardId} not found`);

    board.elements = data.children;
    board.viewport = data.viewport;
    board.theme = data.theme;
    board.updatedAt = Date.now();

    // 更新所有相关的 Map
    this.loadedBoards.set(boardId, board);
    this.boards.set(boardId, board);
    
    // 更新元数据
    const metadata = this.boardMetadata.get(boardId);
    if (metadata) {
      metadata.viewport = data.viewport;
      metadata.theme = data.theme;
      metadata.updatedAt = board.updatedAt;
    }

    await workspaceStorageService.saveBoard(board);
  }

  /**
   * Save data to the current board (convenience method)
   */
  async saveCurrentBoard(data: BoardChangeData): Promise<void> {
    const currentBoardId = this.state.currentBoardId;
    if (!currentBoardId) {
      console.warn('[WorkspaceService] No current board to save');
      return;
    }
    await this.saveBoard(currentBoardId, data);
  }

  // ========== Getters ==========

  getFolder(id: string): Folder | undefined {
    return this.folders.get(id);
  }

  getBoard(id: string): Board | undefined {
    // 优先从已加载的画板获取
    return this.loadedBoards.get(id) || this.boards.get(id);
  }

  /**
   * 获取画板元数据（不含 elements）
   */
  getBoardMetadata(id: string): BoardMetadata | undefined {
    return this.boardMetadata.get(id);
  }

  getCurrentBoard(): Board | null {
    if (!this.state.currentBoardId) return null;
    // 优先从已加载的画板获取
    return this.loadedBoards.get(this.state.currentBoardId) || 
           this.boards.get(this.state.currentBoardId) || null;
  }

  /**
   * 检查画板是否为空（同步版本，只检查已加载的画板）
   * 注意：如果画板未加载，可能返回 true（因为元数据中 elements 为空数组）
   * 如果需要准确判断，请使用 isBoardEmptyAsync
   */
  isBoardEmpty(boardId: string): boolean {
    const board = this.loadedBoards.get(boardId) || this.boards.get(boardId);
    if (!board) return true;
    return !board.elements || board.elements.length === 0;
  }

  /**
   * 检查画板是否为空（异步版本，会从存储加载画板数据）
   * 这个方法能准确判断画板是否真的为空
   */
  async isBoardEmptyAsync(boardId: string): Promise<boolean> {
    // 先检查已加载的画板
    let board = this.loadedBoards.get(boardId);
    if (board) {
      return !board.elements || board.elements.length === 0;
    }
    
    // 画板未加载，从存储中加载
    try {
      board = await workspaceStorageService.loadBoard(boardId);
      if (!board) return true;
      
      // 缓存加载的画板
      this.loadedBoards.set(boardId, board);
      this.boards.set(boardId, board);
      
      return !board.elements || board.elements.length === 0;
    } catch (error) {
      console.warn('[WorkspaceService] Failed to load board for empty check:', boardId, error);
      return true;
    }
  }

  /**
   * 检查是否是默认空白画板
   * 默认空白画板的定义：
   * 1. 画板是空的（没有元素）
   * 2. 画板名称是默认名称（'未命名画板' 或 '未命名画板 (n)'）
   */
  async isDefaultEmptyBoard(boardId: string): Promise<boolean> {
    const metadata = this.boardMetadata.get(boardId);
    if (!metadata) return false;
    
    // 检查名称是否是默认名称（支持 '未命名画板' 和 '未命名画板 (2)' 等格式）
    const defaultNamePattern = new RegExp(
      `^${WORKSPACE_DEFAULTS.DEFAULT_BOARD_NAME}( \\(\\d+\\))?$`
    );
    const isDefaultName = defaultNamePattern.test(metadata.name);
    
    if (!isDefaultName) return false;
    
    // 检查是否为空
    return this.isBoardEmptyAsync(boardId);
  }

  getState(): WorkspaceState {
    return { ...this.state };
  }

  private getFolderChildren(parentId: string | null): Folder[] {
    return Array.from(this.folders.values())
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.order - b.order);
  }

  private getBoardsInFolder(folderId: string | null): Board[] {
    return Array.from(this.boards.values())
      .filter((b) => b.folderId === folderId)
      .sort((a, b) => a.order - b.order);
  }

  // ========== Tree Building ==========

  getTree(): TreeNode[] {
    const buildFolderNode = (folder: Folder): FolderTreeNode => {
      const childFolders = this.getFolderChildren(folder.id);
      const childBoards = this.getBoardsInFolder(folder.id);

      const children: TreeNode[] = [
        ...childFolders.map(buildFolderNode),
        ...childBoards.map(buildBoardNode),
      ];

      return {
        type: 'folder',
        data: folder,
        children,
      };
    };

    const buildBoardNode = (board: Board): BoardTreeNode => {
      return {
        type: 'board',
        data: board,
      };
    };

    // Build root level nodes
    const rootFolders = this.getFolderChildren(null);
    const rootBoards = this.getBoardsInFolder(null);

    return [
      ...rootFolders.map(buildFolderNode),
      ...rootBoards.map(buildBoardNode),
    ];
  }

  // ========== State Management ==========

  setSidebarWidth(width: number): void {
    this.state.sidebarWidth = Math.max(
      WORKSPACE_DEFAULTS.SIDEBAR_MIN_WIDTH,
      Math.min(WORKSPACE_DEFAULTS.SIDEBAR_MAX_WIDTH, width)
    );
    this.saveState();
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.state.sidebarCollapsed = collapsed;
    this.saveState();
  }

  private async saveState(): Promise<void> {
    await workspaceStorageService.saveState(this.state);
  }

  // ========== Events ==========

  observeEvents(): Observable<WorkspaceEvent> {
    return this.events$.asObservable();
  }

  private emit(type: WorkspaceEvent['type'], payload?: unknown): void {
    this.events$.next({ type, payload, timestamp: Date.now() });
  }

  // ========== Initialization ==========

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  hasBoards(): boolean {
    return this.boardMetadata.size > 0;
  }

  /**
   * 获取所有画板（包含 elements，优先返回已加载的）
   * 注意：未加载的画板会返回空 elements
   */
  getAllBoards(): Board[] {
    return Array.from(this.boardMetadata.values()).map(metadata => {
      // 优先返回已加载完整数据的画板
      const loaded = this.loadedBoards.get(metadata.id);
      if (loaded) return loaded;
      // 否则返回带空 elements 的画板
      return { ...metadata, elements: [] } as Board;
    });
  }

  /**
   * 获取所有画板元数据（不含 elements）
   */
  getAllBoardMetadata(): BoardMetadata[] {
    return Array.from(this.boardMetadata.values());
  }

  /**
   * 重新加载工作区数据（从 IndexedDB 重新加载）
   * 用于数据导入后刷新内存缓存
   */
  async reload(): Promise<void> {
    try {
      // 重新加载元数据
      const [folders, boardMetadata, state] = await Promise.all([
        workspaceStorageService.loadAllFolders(),
        workspaceStorageService.loadAllBoardMetadata(),
        workspaceStorageService.loadState(),
      ]);

      this.folders = new Map(folders.map((f) => [f.id, f]));
      this.boardMetadata = new Map(boardMetadata.map((b) => [b.id, b]));
      // 清空已加载的画板缓存，下次访问时重新加载
      this.loadedBoards.clear();
      // 向后兼容
      this.boards = new Map(boardMetadata.map((b) => [b.id, { ...b, elements: [] } as Board]));
      this.state = state;

      // 触发更新事件
      this.emit('treeChanged');
    } catch (error) {
      console.error('[WorkspaceService] Failed to reload:', error);
      throw error;
    }
  }
}

export { WorkspaceService };
export const workspaceService = WorkspaceService.getInstance();
