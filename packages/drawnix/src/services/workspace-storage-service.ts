/**
 * Workspace Storage Service
 *
 * Handles IndexedDB operations for workspace data persistence.
 * Manages folders, boards, and workspace state.
 */

import localforage from 'localforage';
import {
  Folder,
  Board,
  WorkspaceState,
  WORKSPACE_DEFAULTS,
} from '../types/workspace.types';

/**
 * Database configuration
 */
const WORKSPACE_DB_CONFIG = {
  DATABASE_NAME: 'aitu-workspace',
  DATABASE_VERSION: 6,
  STORES: {
    FOLDERS: 'folders',
    BOARDS: 'boards',
    STATE: 'state',
  },
} as const;

const STATE_KEY = 'workspace_state';

/**
 * Helper to wait for browser idle time
 */
function waitForIdle(timeout = 50): Promise<void> {
  return new Promise(resolve => {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as Window).requestIdleCallback(() => resolve(), { timeout });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Workspace storage service for managing data persistence
 */
class WorkspaceStorageService {
  private foldersStore: LocalForage;
  private boardsStore: LocalForage;
  private stateStore: LocalForage;
  private initialized: boolean = false;

  constructor() {
    this.foldersStore = localforage.createInstance({
      driver: localforage.INDEXEDDB,
      name: WORKSPACE_DB_CONFIG.DATABASE_NAME,
      version: WORKSPACE_DB_CONFIG.DATABASE_VERSION,
      storeName: WORKSPACE_DB_CONFIG.STORES.FOLDERS,
      description: 'Workspace folders storage',
    });

    this.boardsStore = localforage.createInstance({
      driver: localforage.INDEXEDDB,
      name: WORKSPACE_DB_CONFIG.DATABASE_NAME,
      version: WORKSPACE_DB_CONFIG.DATABASE_VERSION,
      storeName: WORKSPACE_DB_CONFIG.STORES.BOARDS,
      description: 'Workspace boards storage',
    });

    this.stateStore = localforage.createInstance({
      driver: localforage.INDEXEDDB,
      name: WORKSPACE_DB_CONFIG.DATABASE_NAME,
      version: WORKSPACE_DB_CONFIG.DATABASE_VERSION,
      storeName: WORKSPACE_DB_CONFIG.STORES.STATE,
      description: 'Workspace state storage',
    });
  }

  /**
   * Initialize storage service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await Promise.all([
        this.foldersStore.ready(),
        this.boardsStore.ready(),
        this.stateStore.ready(),
      ]);
      this.initialized = true;
    } catch (error) {
      console.error('[WorkspaceStorage] Failed to initialize:', error);
      throw new Error('Workspace storage initialization failed');
    }
  }

  // ========== Folder Operations ==========

  async saveFolder(folder: Folder): Promise<void> {
    await this.ensureInitialized();
    await this.foldersStore.setItem(folder.id, folder);
  }

  async loadFolder(id: string): Promise<Folder | null> {
    await this.ensureInitialized();
    return this.foldersStore.getItem<Folder>(id);
  }

  async loadAllFolders(): Promise<Folder[]> {
    await this.ensureInitialized();
    const folders: Folder[] = [];
    await this.foldersStore.iterate<Folder, void>((value) => {
      if (value && value.id) folders.push(value);
    });
    // Wait for browser idle time after IndexedDB operation
    await waitForIdle();
    return folders.sort((a, b) => a.order - b.order);
  }

  async deleteFolder(id: string): Promise<void> {
    await this.ensureInitialized();
    await this.foldersStore.removeItem(id);
  }

  // ========== Board Operations ==========

  async saveBoard(board: Board): Promise<void> {
    await this.ensureInitialized();
    await this.boardsStore.setItem(board.id, board);
  }

  async loadBoard(id: string): Promise<Board | null> {
    await this.ensureInitialized();
    return this.boardsStore.getItem<Board>(id);
  }

  async loadAllBoards(): Promise<Board[]> {
    await this.ensureInitialized();
    const boards: Board[] = [];
    await this.boardsStore.iterate<Board, void>((value) => {
      if (value && value.id) boards.push(value);
    });
    // Wait for browser idle time after IndexedDB operation
    await waitForIdle();
    return boards.sort((a, b) => a.order - b.order);
  }

  async loadFolderBoards(folderId: string | null): Promise<Board[]> {
    await this.ensureInitialized();
    const boards: Board[] = [];
    await this.boardsStore.iterate<Board, void>((value) => {
      if (value && value.folderId === folderId) {
        boards.push(value);
      }
    });
    // Wait for browser idle time after IndexedDB operation
    await waitForIdle();
    return boards.sort((a, b) => a.order - b.order);
  }

  async deleteBoard(id: string): Promise<void> {
    await this.ensureInitialized();
    await this.boardsStore.removeItem(id);
  }

  async deleteFolderBoards(folderId: string): Promise<void> {
    await this.ensureInitialized();
    const boards = await this.loadFolderBoards(folderId);
    await Promise.all(boards.map((b) => this.deleteBoard(b.id)));
  }

  // ========== State Operations ==========

  async saveState(state: WorkspaceState): Promise<void> {
    await this.ensureInitialized();
    await this.stateStore.setItem(STATE_KEY, state);
  }

  async loadState(): Promise<WorkspaceState> {
    await this.ensureInitialized();
    const state = await this.stateStore.getItem<WorkspaceState>(STATE_KEY);
    return (
      state || {
        currentBoardId: null,
        expandedFolderIds: [],
        sidebarWidth: WORKSPACE_DEFAULTS.SIDEBAR_WIDTH,
        sidebarCollapsed: false,
      }
    );
  }

  // ========== Utility Operations ==========

  async getBoardCount(): Promise<number> {
    await this.ensureInitialized();
    return this.boardsStore.length();
  }

  async clearAll(): Promise<void> {
    await this.ensureInitialized();
    await Promise.all([
      this.foldersStore.clear(),
      this.boardsStore.clear(),
      this.stateStore.clear(),
    ]);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

export const workspaceStorageService = new WorkspaceStorageService();
