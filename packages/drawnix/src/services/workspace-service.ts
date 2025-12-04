/**
 * Workspace Service
 *
 * Core service for managing workspace operations including
 * folders, projects, branches, and tree structure.
 */

import { Subject, Observable } from 'rxjs';
import {
  Folder,
  Project,
  Branch,
  TreeNode,
  FolderTreeNode,
  ProjectTreeNode,
  WorkspaceState,
  WorkspaceEvent,
  CreateFolderOptions,
  CreateProjectOptions,
  CreateBranchOptions,
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
  private projects: Map<string, Project> = new Map();
  private branches: Map<string, Branch> = new Map();
  private state: WorkspaceState;
  private events$: Subject<WorkspaceEvent> = new Subject();
  private initialized: boolean = false;

  private constructor() {
    this.state = {
      currentBranchId: null,
      currentProjectId: null,
      expandedFolderIds: [],
      expandedProjectIds: [],
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

      // Load all data
      const [folders, projects, branches, state] = await Promise.all([
        workspaceStorageService.loadAllFolders(),
        workspaceStorageService.loadAllProjects(),
        workspaceStorageService.loadAllBranches(),
        workspaceStorageService.loadState(),
      ]);

      this.folders = new Map(folders.map((f) => [f.id, f]));
      this.projects = new Map(projects.map((p) => [p.id, p]));
      this.branches = new Map(branches.map((b) => [b.id, b]));
      this.state = state;

      this.initialized = true;
      console.log('[WorkspaceService] Initialized with', {
        folders: this.folders.size,
        projects: this.projects.size,
        branches: this.branches.size,
      });
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

    // Move projects to root
    const projects = this.getProjectsInFolder(id);
    for (const project of projects) {
      project.folderId = null;
      await workspaceStorageService.saveProject(project);
    }

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

  // ========== Project Operations ==========

  async createProject(options: CreateProjectOptions): Promise<Project> {
    await this.ensureInitialized();

    const projectId = generateId();
    const branchId = generateId();
    const now = Date.now();

    // Create default branch
    const defaultBranch: Branch = {
      id: branchId,
      projectId,
      name: WORKSPACE_DEFAULTS.DEFAULT_BRANCH_NAME,
      elements: options.elements || [],
      viewport: options.viewport,
      theme: options.theme,
      createdAt: now,
      updatedAt: now,
    };

    // Get max order in folder
    const siblings = this.getProjectsInFolder(options.folderId || null);
    const maxOrder = siblings.length > 0
      ? Math.max(...siblings.map((s) => s.order)) + 1
      : 0;

    const project: Project = {
      id: projectId,
      name: options.name || WORKSPACE_DEFAULTS.DEFAULT_PROJECT_NAME,
      folderId: options.folderId || null,
      order: maxOrder,
      defaultBranchId: branchId,
      isExpanded: false,
      createdAt: now,
      updatedAt: now,
    };

    this.projects.set(projectId, project);
    this.branches.set(branchId, defaultBranch);

    await Promise.all([
      workspaceStorageService.saveProject(project),
      workspaceStorageService.saveBranch(defaultBranch),
    ]);

    this.emit('projectCreated', project);
    return project;
  }

  async renameProject(id: string, name: string): Promise<void> {
    const project = this.projects.get(id);
    if (!project) throw new Error(`Project ${id} not found`);

    project.name = name;
    project.updatedAt = Date.now();

    this.projects.set(id, project);
    await workspaceStorageService.saveProject(project);
    this.emit('projectUpdated', project);
  }

  async deleteProject(id: string): Promise<void> {
    const project = this.projects.get(id);
    if (!project) throw new Error(`Project ${id} not found`);

    // Delete all branches
    const branches = this.getProjectBranches(id);
    for (const branch of branches) {
      this.branches.delete(branch.id);
    }
    await workspaceStorageService.deleteProjectBranches(id);

    // Clear current if this project is active
    if (this.state.currentProjectId === id) {
      this.state.currentProjectId = null;
      this.state.currentBranchId = null;
      this.saveState();
    }

    this.projects.delete(id);
    await workspaceStorageService.deleteProject(id);
    this.emit('projectDeleted', project);
  }

  async moveProject(id: string, targetFolderId: string | null): Promise<void> {
    const project = this.projects.get(id);
    if (!project) throw new Error(`Project ${id} not found`);

    project.folderId = targetFolderId;
    project.updatedAt = Date.now();

    this.projects.set(id, project);
    await workspaceStorageService.saveProject(project);
    this.emit('projectUpdated', project);
  }

  toggleProjectExpanded(id: string): void {
    const project = this.projects.get(id);
    if (!project) return;

    project.isExpanded = !project.isExpanded;
    this.projects.set(id, project);

    // Update state
    if (project.isExpanded) {
      if (!this.state.expandedProjectIds.includes(id)) {
        this.state.expandedProjectIds.push(id);
      }
    } else {
      this.state.expandedProjectIds = this.state.expandedProjectIds.filter(
        (pid) => pid !== id
      );
    }
    this.saveState();
    this.emit('treeChanged');
  }

  // ========== Branch Operations ==========

  async createBranch(options: CreateBranchOptions): Promise<Branch> {
    await this.ensureInitialized();

    const project = this.projects.get(options.projectId);
    if (!project) throw new Error(`Project ${options.projectId} not found`);

    let elements: any[] = [];
    let viewport, theme;

    // Copy from source branch if specified
    if (options.fromBranchId) {
      const sourceBranch = this.branches.get(options.fromBranchId);
      if (sourceBranch) {
        elements = JSON.parse(JSON.stringify(sourceBranch.elements));
        viewport = sourceBranch.viewport;
        theme = sourceBranch.theme;
      }
    }

    const now = Date.now();
    const branch: Branch = {
      id: generateId(),
      projectId: options.projectId,
      name: options.name,
      parentBranchId: options.fromBranchId,
      elements,
      viewport,
      theme,
      createdAt: now,
      updatedAt: now,
    };

    this.branches.set(branch.id, branch);
    await workspaceStorageService.saveBranch(branch);
    this.emit('branchCreated', branch);

    return branch;
  }

  async renameBranch(id: string, name: string): Promise<void> {
    const branch = this.branches.get(id);
    if (!branch) throw new Error(`Branch ${id} not found`);

    branch.name = name;
    branch.updatedAt = Date.now();

    this.branches.set(id, branch);
    await workspaceStorageService.saveBranch(branch);
    this.emit('branchUpdated', branch);
  }

  async deleteBranch(id: string): Promise<void> {
    const branch = this.branches.get(id);
    if (!branch) throw new Error(`Branch ${id} not found`);

    const project = this.projects.get(branch.projectId);
    if (project && project.defaultBranchId === id) {
      throw new Error('Cannot delete the default branch');
    }

    // Clear current if this branch is active
    if (this.state.currentBranchId === id) {
      this.state.currentBranchId = project?.defaultBranchId || null;
      this.saveState();
    }

    this.branches.delete(id);
    await workspaceStorageService.deleteBranch(id);
    this.emit('branchDeleted', branch);
  }

  async switchBranch(branchId: string): Promise<Branch> {
    await this.ensureInitialized();

    const branch = this.branches.get(branchId);
    if (!branch) throw new Error(`Branch ${branchId} not found`);

    const project = this.projects.get(branch.projectId);
    if (!project) throw new Error(`Project ${branch.projectId} not found`);

    // Save current branch before switching
    if (this.state.currentBranchId && this.state.currentBranchId !== branchId) {
      // Current branch data should be saved by the caller before switching
    }

    this.state.currentBranchId = branchId;
    this.state.currentProjectId = branch.projectId;
    this.saveState();

    this.emit('branchSwitched', branch);
    return branch;
  }

  async saveBranch(branchId: string, data: BoardChangeData): Promise<void> {
    const branch = this.branches.get(branchId);
    if (!branch) throw new Error(`Branch ${branchId} not found`);

    branch.elements = data.children;
    branch.viewport = data.viewport;
    branch.theme = data.theme;
    branch.updatedAt = Date.now();

    this.branches.set(branchId, branch);
    await workspaceStorageService.saveBranch(branch);

    // Update project timestamp
    const project = this.projects.get(branch.projectId);
    if (project) {
      project.updatedAt = Date.now();
      this.projects.set(project.id, project);
      await workspaceStorageService.saveProject(project);
    }
  }

  /**
   * Save data to the current branch (convenience method)
   */
  async saveCurrentBranch(data: BoardChangeData): Promise<void> {
    const currentBranchId = this.state.currentBranchId;
    if (!currentBranchId) {
      console.warn('[WorkspaceService] No current branch to save');
      return;
    }
    await this.saveBranch(currentBranchId, data);
  }

  // ========== Getters ==========

  getFolder(id: string): Folder | undefined {
    return this.folders.get(id);
  }

  getProject(id: string): Project | undefined {
    return this.projects.get(id);
  }

  getBranch(id: string): Branch | undefined {
    return this.branches.get(id);
  }

  getCurrentBranch(): Branch | null {
    if (!this.state.currentBranchId) return null;
    return this.branches.get(this.state.currentBranchId) || null;
  }

  getCurrentProject(): Project | null {
    if (!this.state.currentProjectId) return null;
    return this.projects.get(this.state.currentProjectId) || null;
  }

  getState(): WorkspaceState {
    return { ...this.state };
  }

  getProjectBranches(projectId: string): Branch[] {
    return Array.from(this.branches.values())
      .filter((b) => b.projectId === projectId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  private getFolderChildren(parentId: string | null): Folder[] {
    return Array.from(this.folders.values())
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.order - b.order);
  }

  private getProjectsInFolder(folderId: string | null): Project[] {
    return Array.from(this.projects.values())
      .filter((p) => p.folderId === folderId)
      .sort((a, b) => a.order - b.order);
  }

  // ========== Tree Building ==========

  getTree(): TreeNode[] {
    const buildFolderNode = (folder: Folder): FolderTreeNode => {
      const childFolders = this.getFolderChildren(folder.id);
      const childProjects = this.getProjectsInFolder(folder.id);

      const children: TreeNode[] = [
        ...childFolders.map(buildFolderNode),
        ...childProjects.map(buildProjectNode),
      ];

      return {
        type: 'folder',
        data: folder,
        children,
      };
    };

    const buildProjectNode = (project: Project): ProjectTreeNode => {
      const branches = this.getProjectBranches(project.id);
      return {
        type: 'project',
        data: project,
        branches,
      };
    };

    // Build root level nodes
    const rootFolders = this.getFolderChildren(null);
    const rootProjects = this.getProjectsInFolder(null);

    return [
      ...rootFolders.map(buildFolderNode),
      ...rootProjects.map(buildProjectNode),
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

  hasProjects(): boolean {
    return this.projects.size > 0;
  }
}

export { WorkspaceService };
export const workspaceService = WorkspaceService.getInstance();
