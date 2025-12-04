/**
 * Workspace Storage Service
 *
 * Handles IndexedDB operations for workspace data persistence.
 * Manages folders, projects, branches, and workspace state.
 */

import localforage from 'localforage';
import {
  Folder,
  Project,
  Branch,
  WorkspaceState,
  WORKSPACE_DEFAULTS,
} from '../types/workspace.types';

/**
 * Database configuration
 */
const WORKSPACE_DB_CONFIG = {
  DATABASE_NAME: 'aitu-workspace',
  DATABASE_VERSION: 1,
  STORES: {
    FOLDERS: 'folders',
    PROJECTS: 'projects',
    BRANCHES: 'branches',
    STATE: 'state',
  },
} as const;

const STATE_KEY = 'workspace_state';

/**
 * Workspace storage service for managing data persistence
 */
class WorkspaceStorageService {
  private foldersStore: LocalForage;
  private projectsStore: LocalForage;
  private branchesStore: LocalForage;
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

    this.projectsStore = localforage.createInstance({
      driver: localforage.INDEXEDDB,
      name: WORKSPACE_DB_CONFIG.DATABASE_NAME,
      version: WORKSPACE_DB_CONFIG.DATABASE_VERSION,
      storeName: WORKSPACE_DB_CONFIG.STORES.PROJECTS,
      description: 'Workspace projects storage',
    });

    this.branchesStore = localforage.createInstance({
      driver: localforage.INDEXEDDB,
      name: WORKSPACE_DB_CONFIG.DATABASE_NAME,
      version: WORKSPACE_DB_CONFIG.DATABASE_VERSION,
      storeName: WORKSPACE_DB_CONFIG.STORES.BRANCHES,
      description: 'Workspace branches storage',
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
        this.projectsStore.ready(),
        this.branchesStore.ready(),
        this.stateStore.ready(),
      ]);
      this.initialized = true;
      console.log('[WorkspaceStorage] Initialized successfully');
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
    return folders.sort((a, b) => a.order - b.order);
  }

  async deleteFolder(id: string): Promise<void> {
    await this.ensureInitialized();
    await this.foldersStore.removeItem(id);
  }

  // ========== Project Operations ==========

  async saveProject(project: Project): Promise<void> {
    await this.ensureInitialized();
    await this.projectsStore.setItem(project.id, project);
  }

  async loadProject(id: string): Promise<Project | null> {
    await this.ensureInitialized();
    return this.projectsStore.getItem<Project>(id);
  }

  async loadAllProjects(): Promise<Project[]> {
    await this.ensureInitialized();
    const projects: Project[] = [];
    await this.projectsStore.iterate<Project, void>((value) => {
      if (value && value.id) projects.push(value);
    });
    return projects.sort((a, b) => a.order - b.order);
  }

  async deleteProject(id: string): Promise<void> {
    await this.ensureInitialized();
    await this.projectsStore.removeItem(id);
  }

  // ========== Branch Operations ==========

  async saveBranch(branch: Branch): Promise<void> {
    await this.ensureInitialized();
    await this.branchesStore.setItem(branch.id, branch);
  }

  async loadBranch(id: string): Promise<Branch | null> {
    await this.ensureInitialized();
    return this.branchesStore.getItem<Branch>(id);
  }

  async loadProjectBranches(projectId: string): Promise<Branch[]> {
    await this.ensureInitialized();
    const branches: Branch[] = [];
    await this.branchesStore.iterate<Branch, void>((value) => {
      if (value && value.projectId === projectId) {
        branches.push(value);
      }
    });
    return branches.sort((a, b) => a.createdAt - b.createdAt);
  }

  async loadAllBranches(): Promise<Branch[]> {
    await this.ensureInitialized();
    const branches: Branch[] = [];
    await this.branchesStore.iterate<Branch, void>((value) => {
      if (value && value.id) branches.push(value);
    });
    return branches;
  }

  async deleteBranch(id: string): Promise<void> {
    await this.ensureInitialized();
    await this.branchesStore.removeItem(id);
  }

  async deleteProjectBranches(projectId: string): Promise<void> {
    await this.ensureInitialized();
    const branches = await this.loadProjectBranches(projectId);
    await Promise.all(branches.map((b) => this.deleteBranch(b.id)));
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
        currentBranchId: null,
        currentProjectId: null,
        expandedFolderIds: [],
        expandedProjectIds: [],
        sidebarWidth: WORKSPACE_DEFAULTS.SIDEBAR_WIDTH,
        sidebarCollapsed: false,
      }
    );
  }

  // ========== Utility Operations ==========

  async getProjectCount(): Promise<number> {
    await this.ensureInitialized();
    return this.projectsStore.length();
  }

  async getBranchCount(): Promise<number> {
    await this.ensureInitialized();
    return this.branchesStore.length();
  }

  async clearAll(): Promise<void> {
    await this.ensureInitialized();
    await Promise.all([
      this.foldersStore.clear(),
      this.projectsStore.clear(),
      this.branchesStore.clear(),
      this.stateStore.clear(),
    ]);
    console.log('[WorkspaceStorage] All data cleared');
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

export const workspaceStorageService = new WorkspaceStorageService();
