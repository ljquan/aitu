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
  TreeNode,
  FolderTreeNode,
  BoardTreeNode,
  WorkspaceState,
  WorkspaceEvent,
  CreateFolderOptions,
  CreateBoardOptions,
  BoardChangeData,
  WORKSPACE_DEFAULTS,
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
  private boards: Map<string, Board> = new Map();
  private state: WorkspaceState;
  private events$: Subject<WorkspaceEvent> = new Subject();
  private initialized: boolean = false;

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

    try {
      await workspaceStorageService.initialize();

      // Load all data in parallel
      const [folders, boards, state] = await Promise.all([
        workspaceStorageService.loadAllFolders(),
        workspaceStorageService.loadAllBoards(),
        workspaceStorageService.loadState(),
      ]);

      // Use requestIdleCallback to yield to main thread before processing data
      await new Promise<void>(resolve => {
        if ('requestIdleCallback' in window) {
          (window as Window).requestIdleCallback(() => resolve(), { timeout: 50 });
        } else {
          setTimeout(resolve, 0);
        }
      });

      this.folders = new Map(folders.map((f) => [f.id, f]));
      this.boards = new Map(boards.map((b) => [b.id, b]));
      this.state = state;

      this.initialized = true;
      // console.log('[WorkspaceService] Initialized with', {
      //   folders: this.folders.size,
      //   boards: this.boards.size,
      // });
    } catch (error) {
      console.error('[WorkspaceService] Failed to initialize:', error);
      throw error;
    }
  }

  // ========== Folder Operations ==========

  async createFolder(options: CreateFolderOptions): Promise<Folder> {
    await this.ensureInitialized();

    const siblings = this.getFolderChildren(options.parentId || null);
    const maxOrder = siblings.length > 0
      ? Math.max(...siblings.map((s) => s.order)) + 1
      : 0;

    const folder: Folder = {
      id: generateId(),
      name: options.name || WORKSPACE_DEFAULTS.DEFAULT_FOLDER_NAME,
      parentId: options.parentId || null,
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

  async renameFolder(id: string, name: string): Promise<void> {
    const folder = this.folders.get(id);
    if (!folder) throw new Error(`Folder ${id} not found`);

    folder.name = name;
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

  async createBoard(options: CreateBoardOptions): Promise<Board> {
    await this.ensureInitialized();

    const boardId = generateId();
    const now = Date.now();

    // Get max order in folder
    const siblings = this.getBoardsInFolder(options.folderId || null);
    const maxOrder = siblings.length > 0
      ? Math.max(...siblings.map((s) => s.order)) + 1
      : 0;

    const board: Board = {
      id: boardId,
      name: options.name || WORKSPACE_DEFAULTS.DEFAULT_BOARD_NAME,
      folderId: options.folderId || null,
      order: maxOrder,
      elements: options.elements || [],
      viewport: options.viewport,
      theme: options.theme,
      createdAt: now,
      updatedAt: now,
    };

    this.boards.set(boardId, board);
    await workspaceStorageService.saveBoard(board);

    this.emit('boardCreated', board);
    return board;
  }

  async renameBoard(id: string, name: string): Promise<void> {
    const board = this.boards.get(id);
    if (!board) throw new Error(`Board ${id} not found`);

    board.name = name;
    board.updatedAt = Date.now();

    this.boards.set(id, board);
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

    board.folderId = targetFolderId;
    board.updatedAt = Date.now();

    // Get all items in target folder (excluding the moved board)
    const boardSiblings = this.getBoardsInFolder(targetFolderId).filter(b => b.id !== id);
    const folderSiblings = this.getFolderChildren(targetFolderId);

    // Build ordered list of all items
    let allItems: Array<{ id: string; type: 'board' | 'folder' }> = [
      ...folderSiblings.map(f => ({ id: f.id, type: 'folder' as const })),
      ...boardSiblings.map(b => ({ id: b.id, type: 'board' as const })),
    ].sort((a, b) => {
      const orderA = a.type === 'board' ? this.boards.get(a.id)?.order ?? 0 : this.folders.get(a.id)?.order ?? 0;
      const orderB = b.type === 'board' ? this.boards.get(b.id)?.order ?? 0 : this.folders.get(b.id)?.order ?? 0;
      return orderA - orderB;
    });

    if (targetId && position) {
      // Find target index
      const targetIndex = allItems.findIndex(item => item.id === targetId);
      if (targetIndex !== -1) {
        // Insert at the correct position
        const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
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
        parent = parent.parentId ? this.folders.get(parent.parentId) : undefined;
      }
    }

    folder.parentId = targetParentId;
    folder.updatedAt = Date.now();

    // Get all items in target folder (excluding the moved folder)
    const folderSiblings = this.getFolderChildren(targetParentId).filter(f => f.id !== id);
    const boardSiblings = this.getBoardsInFolder(targetParentId);

    // Build ordered list of all items
    let allItems: Array<{ id: string; type: 'board' | 'folder' }> = [
      ...folderSiblings.map(f => ({ id: f.id, type: 'folder' as const })),
      ...boardSiblings.map(b => ({ id: b.id, type: 'board' as const })),
    ].sort((a, b) => {
      const orderA = a.type === 'board' ? this.boards.get(a.id)?.order ?? 0 : this.folders.get(a.id)?.order ?? 0;
      const orderB = b.type === 'board' ? this.boards.get(b.id)?.order ?? 0 : this.folders.get(b.id)?.order ?? 0;
      return orderA - orderB;
    });

    if (targetId && position) {
      // Find target index
      const targetIndex = allItems.findIndex(item => item.id === targetId);
      if (targetIndex !== -1) {
        // Insert at the correct position
        const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
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
      .filter(b => b.folderId === sourceBoard.folderId)
      .map(b => b.name);
    
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
  async moveBoardsBatch(ids: string[], targetFolderId: string | null): Promise<void> {
    for (const id of ids) {
      await this.moveBoard(id, targetFolderId);
    }
  }

  async switchBoard(boardId: string): Promise<Board> {
    await this.ensureInitialized();

    const board = this.boards.get(boardId);
    if (!board) throw new Error(`Board ${boardId} not found`);

    // Save current board before switching
    if (this.state.currentBoardId && this.state.currentBoardId !== boardId) {
      // Current board data should be saved by the caller before switching
    }

    this.state.currentBoardId = boardId;
    this.saveState();

    this.emit('boardSwitched', board);
    return board;
  }

  async saveBoard(boardId: string, data: BoardChangeData): Promise<void> {
    const board = this.boards.get(boardId);
    if (!board) throw new Error(`Board ${boardId} not found`);

    board.elements = data.children;
    board.viewport = data.viewport;
    board.theme = data.theme;
    board.updatedAt = Date.now();

    this.boards.set(boardId, board);
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
    return this.boards.get(id);
  }

  getCurrentBoard(): Board | null {
    if (!this.state.currentBoardId) return null;
    return this.boards.get(this.state.currentBoardId) || null;
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
    return this.boards.size > 0;
  }

  /**
   * 重新加载工作区数据（从 IndexedDB 重新加载）
   * 用于数据导入后刷新内存缓存
   */
  async reload(): Promise<void> {
    try {
      // 重新加载所有数据
      const [folders, boards, state] = await Promise.all([
        workspaceStorageService.loadAllFolders(),
        workspaceStorageService.loadAllBoards(),
        workspaceStorageService.loadState(),
      ]);

      this.folders = new Map(folders.map((f) => [f.id, f]));
      this.boards = new Map(boards.map((b) => [b.id, b]));
      this.state = state;

      // 触发更新事件
      this.emit('tree-changed');
    } catch (error) {
      console.error('[WorkspaceService] Failed to reload:', error);
      throw error;
    }
  }
}

export { WorkspaceService };
export const workspaceService = WorkspaceService.getInstance();
