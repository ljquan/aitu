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
  MIN_DATABASE_VERSION: 8,
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
 * Detect existing database version to avoid downgrade errors
 */
async function detectDatabaseVersion(dbName: string): Promise<number> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(WORKSPACE_DB_CONFIG.MIN_DATABASE_VERSION);
      return;
    }
    
    // Open without version to get current version
    const request = indexedDB.open(dbName);
    
    request.onsuccess = () => {
      const db = request.result;
      const version = db.version;
      db.close();
      resolve(Math.max(version, WORKSPACE_DB_CONFIG.MIN_DATABASE_VERSION));
    };
    
    request.onerror = () => {
      resolve(WORKSPACE_DB_CONFIG.MIN_DATABASE_VERSION);
    };
  });
}

/**
 * Workspace storage service for managing data persistence
 */
class WorkspaceStorageService {
  private foldersStore: LocalForage | null = null;
  private boardsStore: LocalForage | null = null;
  private stateStore: LocalForage | null = null;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Defer store creation until initialization to detect version first
  }

  /**
   * Create stores with the detected version
   */
  private async createStores(): Promise<void> {
    const version = await detectDatabaseVersion(WORKSPACE_DB_CONFIG.DATABASE_NAME);
    
    this.foldersStore = localforage.createInstance({
      driver: localforage.INDEXEDDB,
      name: WORKSPACE_DB_CONFIG.DATABASE_NAME,
      version: version,
      storeName: WORKSPACE_DB_CONFIG.STORES.FOLDERS,
      description: 'Workspace folders storage',
    });

    this.boardsStore = localforage.createInstance({
      driver: localforage.INDEXEDDB,
      name: WORKSPACE_DB_CONFIG.DATABASE_NAME,
      version: version,
      storeName: WORKSPACE_DB_CONFIG.STORES.BOARDS,
      description: 'Workspace boards storage',
    });

    this.stateStore = localforage.createInstance({
      driver: localforage.INDEXEDDB,
      name: WORKSPACE_DB_CONFIG.DATABASE_NAME,
      version: version,
      storeName: WORKSPACE_DB_CONFIG.STORES.STATE,
      description: 'Workspace state storage',
    });
  }

  /**
   * Initialize storage service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Ensure we only initialize once even if called concurrently
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      // Create stores with detected version first
      await this.createStores();
      
      await Promise.all([
        this.foldersStore!.ready(),
        this.boardsStore!.ready(),
        this.stateStore!.ready(),
      ]);
      this.initialized = true;
    } catch (error) {
      console.error('[WorkspaceStorage] Failed to initialize:', error);
      throw new Error('Workspace storage initialization failed');
    }
  }

  // ========== Private Store Getters (ensure initialized) ==========

  private getFoldersStore(): LocalForage {
    if (!this.foldersStore) {
      throw new Error('WorkspaceStorage not initialized');
    }
    return this.foldersStore;
  }

  private getBoardsStore(): LocalForage {
    if (!this.boardsStore) {
      throw new Error('WorkspaceStorage not initialized');
    }
    return this.boardsStore;
  }

  private getStateStore(): LocalForage {
    if (!this.stateStore) {
      throw new Error('WorkspaceStorage not initialized');
    }
    return this.stateStore;
  }

  // ========== Folder Operations ==========

  async saveFolder(folder: Folder): Promise<void> {
    await this.ensureInitialized();
    await this.getFoldersStore().setItem(folder.id, folder);
  }

  async loadFolder(id: string): Promise<Folder | null> {
    await this.ensureInitialized();
    return this.getFoldersStore().getItem<Folder>(id);
  }

  async loadAllFolders(): Promise<Folder[]> {
    await this.ensureInitialized();
    const folders: Folder[] = [];
    await this.getFoldersStore().iterate<Folder, void>((value) => {
      if (value && value.id) folders.push(value);
    });
    // Wait for browser idle time after IndexedDB operation
    await waitForIdle();
    return folders.sort((a, b) => a.order - b.order);
  }

  async deleteFolder(id: string): Promise<void> {
    await this.ensureInitialized();
    await this.getFoldersStore().removeItem(id);
  }

  // ========== Board Operations ==========

  async saveBoard(board: Board): Promise<void> {
    await this.ensureInitialized();
    await this.getBoardsStore().setItem(board.id, board);
  }

  async loadBoard(id: string): Promise<Board | null> {
    await this.ensureInitialized();
    return this.getBoardsStore().getItem<Board>(id);
  }

  async loadAllBoards(): Promise<Board[]> {
    await this.ensureInitialized();
    const boards: Board[] = [];
    await this.getBoardsStore().iterate<Board, void>((value) => {
      if (value && value.id) boards.push(value);
    });
    // Wait for browser idle time after IndexedDB operation
    await waitForIdle();
    return boards.sort((a, b) => a.order - b.order);
  }

  async loadFolderBoards(folderId: string | null): Promise<Board[]> {
    await this.ensureInitialized();
    const boards: Board[] = [];
    await this.getBoardsStore().iterate<Board, void>((value) => {
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
    await this.getBoardsStore().removeItem(id);
  }

  async deleteFolderBoards(folderId: string): Promise<void> {
    await this.ensureInitialized();
    const boards = await this.loadFolderBoards(folderId);
    await Promise.all(boards.map((b) => this.deleteBoard(b.id)));
  }

  // ========== State Operations ==========

  async saveState(state: WorkspaceState): Promise<void> {
    await this.ensureInitialized();
    await this.getStateStore().setItem(STATE_KEY, state);
  }

  async loadState(): Promise<WorkspaceState> {
    await this.ensureInitialized();
    const state = await this.getStateStore().getItem<WorkspaceState>(STATE_KEY);
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
    return this.getBoardsStore().length();
  }

  async clearAll(): Promise<void> {
    await this.ensureInitialized();
    await Promise.all([
      this.getFoldersStore().clear(),
      this.getBoardsStore().clear(),
      this.getStateStore().clear(),
    ]);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

export const workspaceStorageService = new WorkspaceStorageService();
