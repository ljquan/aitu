/**
 * Project Manager Service
 *
 * Core service for managing the project lifecycle.
 * Implements singleton pattern and uses RxJS for event-driven architecture.
 * Handles project CRUD operations, switching, and auto-save.
 */

import { Subject, Observable } from 'rxjs';
import { PlaitElement, Viewport, PlaitTheme } from '@plait/core';
import {
  Project,
  ProjectMetadata,
  ProjectEvent,
  ProjectListOptions,
  CreateProjectOptions,
  UpdateProjectOptions,
  BoardChangeData,
} from '../types/project.types';
import { projectStorageService } from './project-storage-service';
import {
  PROJECT_DEFAULTS,
  PROJECT_LIMITS,
  PROJECT_STORAGE_KEYS,
} from '../constants/PROJECT_CONSTANTS';

/**
 * Generates a UUID v4
 */
function generateProjectId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Calculates approximate size of project data in bytes
 */
function calculateProjectSize(elements: PlaitElement[]): number {
  try {
    return new Blob([JSON.stringify(elements)]).size;
  } catch {
    return 0;
  }
}

/**
 * Project Manager Service
 * Manages project creation, updates, switching, and lifecycle events
 */
class ProjectManagerService {
  private static instance: ProjectManagerService;
  private currentProject: Project | null = null;
  private projectUpdates$: Subject<ProjectEvent>;
  private initialized: boolean = false;

  private constructor() {
    this.projectUpdates$ = new Subject();
  }

  /**
   * Gets the singleton instance of ProjectManagerService
   */
  static getInstance(): ProjectManagerService {
    if (!ProjectManagerService.instance) {
      ProjectManagerService.instance = new ProjectManagerService();
    }
    return ProjectManagerService.instance;
  }

  /**
   * Initializes the project manager
   * Loads the last opened project if available
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await projectStorageService.initialize();

      // Try to restore last opened project
      const lastProjectId = localStorage.getItem(
        PROJECT_STORAGE_KEYS.CURRENT_PROJECT_ID
      );
      if (lastProjectId) {
        const project = await projectStorageService.loadProject(lastProjectId);
        if (project) {
          this.currentProject = project;
          this.emitEvent('projectOpened', this.extractMetadata(project));
        }
      }

      this.initialized = true;
      console.log('[ProjectManagerService] Initialized successfully');
    } catch (error) {
      console.error('[ProjectManagerService] Failed to initialize:', error);
      throw new Error('Project manager initialization failed');
    }
  }

  /**
   * Creates a new project
   *
   * @param options - Project creation options
   * @returns The created project
   */
  async createProject(options: CreateProjectOptions): Promise<Project> {
    await this.ensureInitialized();

    // Check project limit
    const count = await projectStorageService.getProjectCount();
    if (count >= PROJECT_LIMITS.MAX_PROJECTS) {
      throw new Error(
        `Maximum number of projects (${PROJECT_LIMITS.MAX_PROJECTS}) reached`
      );
    }

    // Validate name
    const name = options.name.trim() || PROJECT_DEFAULTS.DEFAULT_NAME;
    if (name.length > PROJECT_DEFAULTS.MAX_NAME_LENGTH) {
      throw new Error(
        `Project name too long (max ${PROJECT_DEFAULTS.MAX_NAME_LENGTH} characters)`
      );
    }

    const now = Date.now();
    const elements = options.elements || [];

    const project: Project = {
      id: generateProjectId(),
      name,
      description: options.description?.slice(
        0,
        PROJECT_DEFAULTS.MAX_DESCRIPTION_LENGTH
      ),
      createdAt: now,
      updatedAt: now,
      accessedAt: now,
      size: calculateProjectSize(elements),
      elementCount: elements.length,
      elements,
      viewport: options.viewport,
      theme: options.theme,
      settings: options.settings,
      tags: options.tags?.slice(0, PROJECT_LIMITS.MAX_TAGS_PER_PROJECT),
      isStarred: false,
      isArchived: false,
    };

    // Save to storage
    await projectStorageService.saveProject(project);

    // Emit event
    this.emitEvent('projectCreated', this.extractMetadata(project));

    console.log(`[ProjectManagerService] Created project ${project.id}`);
    return project;
  }

  /**
   * Opens a project by ID
   * Closes the current project if one is open
   *
   * @param projectId - Project ID to open
   * @returns The opened project
   */
  async openProject(projectId: string): Promise<Project> {
    await this.ensureInitialized();

    // Close current project if open
    if (this.currentProject) {
      await this.closeProject();
    }

    // Load project
    const project = await projectStorageService.loadProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Update accessed time
    const now = Date.now();
    project.accessedAt = now;
    project.updatedAt = now;

    // Set as current
    this.currentProject = project;
    localStorage.setItem(PROJECT_STORAGE_KEYS.CURRENT_PROJECT_ID, projectId);

    // Update storage with new access time
    await projectStorageService.updateMetadata(projectId, {
      accessedAt: now,
      updatedAt: now,
    });

    // Emit event
    this.emitEvent('projectOpened', this.extractMetadata(project));

    console.log(`[ProjectManagerService] Opened project ${projectId}`);
    return project;
  }

  /**
   * Closes the current project
   * Saves any pending changes before closing
   */
  async closeProject(): Promise<void> {
    if (!this.currentProject) {
      return;
    }

    const closedProject = this.currentProject;
    this.currentProject = null;
    localStorage.removeItem(PROJECT_STORAGE_KEYS.CURRENT_PROJECT_ID);

    // Emit event
    this.emitEvent('projectClosed', this.extractMetadata(closedProject));

    console.log(`[ProjectManagerService] Closed project ${closedProject.id}`);
  }

  /**
   * Saves changes to the current project
   * Called by auto-save or manual save
   *
   * @param data - Board change data (elements, viewport, theme)
   */
  async saveCurrentProject(data: BoardChangeData): Promise<void> {
    if (!this.currentProject) {
      console.warn('[ProjectManagerService] No project open to save');
      return;
    }

    const now = Date.now();

    // Update project
    this.currentProject = {
      ...this.currentProject,
      elements: data.children,
      viewport: data.viewport,
      theme: data.theme,
      updatedAt: now,
      size: calculateProjectSize(data.children),
      elementCount: data.children.length,
    };

    // Save to storage
    await projectStorageService.saveProject(this.currentProject);

    // Emit event
    this.emitEvent('projectUpdated', this.extractMetadata(this.currentProject));
  }

  /**
   * Updates a project's metadata
   *
   * @param projectId - Project ID
   * @param updates - Fields to update
   */
  async updateProject(
    projectId: string,
    updates: UpdateProjectOptions
  ): Promise<void> {
    await this.ensureInitialized();

    const project = await projectStorageService.loadProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const now = Date.now();

    // Apply updates
    const updatedProject: Project = {
      ...project,
      ...updates,
      id: projectId, // Ensure ID cannot be changed
      updatedAt: now,
    };

    // Recalculate size if elements changed
    if (updates.elements) {
      updatedProject.size = calculateProjectSize(updates.elements);
      updatedProject.elementCount = updates.elements.length;
    }

    // Save to storage
    await projectStorageService.saveProject(updatedProject);

    // Update current project if it's the one being updated
    if (this.currentProject?.id === projectId) {
      this.currentProject = updatedProject;
    }

    // Emit event
    this.emitEvent('projectUpdated', this.extractMetadata(updatedProject));

    console.log(`[ProjectManagerService] Updated project ${projectId}`);
  }

  /**
   * Renames a project
   *
   * @param projectId - Project ID
   * @param newName - New project name
   */
  async renameProject(projectId: string, newName: string): Promise<void> {
    const name = newName.trim();
    if (!name) {
      throw new Error('Project name cannot be empty');
    }
    if (name.length > PROJECT_DEFAULTS.MAX_NAME_LENGTH) {
      throw new Error(
        `Project name too long (max ${PROJECT_DEFAULTS.MAX_NAME_LENGTH} characters)`
      );
    }

    await this.updateProject(projectId, { name });
  }

  /**
   * Duplicates a project
   *
   * @param projectId - Project ID to duplicate
   * @param newName - Optional name for the copy
   * @returns The duplicated project
   */
  async duplicateProject(projectId: string, newName?: string): Promise<Project> {
    await this.ensureInitialized();

    const original = await projectStorageService.loadProject(projectId);
    if (!original) {
      throw new Error(`Project ${projectId} not found`);
    }

    const name = newName || `${original.name} (副本)`;

    return this.createProject({
      name,
      description: original.description,
      elements: [...original.elements],
      viewport: original.viewport,
      theme: original.theme,
      settings: original.settings,
      tags: original.tags,
    });
  }

  /**
   * Deletes a project
   *
   * @param projectId - Project ID to delete
   */
  async deleteProject(projectId: string): Promise<void> {
    await this.ensureInitialized();

    // Get metadata before deletion for event
    const metadata = await projectStorageService.loadMetadata(projectId);
    if (!metadata) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Close if it's the current project
    if (this.currentProject?.id === projectId) {
      await this.closeProject();
    }

    // Delete from storage
    await projectStorageService.deleteProject(projectId);

    // Emit event
    this.emitEvent('projectDeleted', metadata);

    console.log(`[ProjectManagerService] Deleted project ${projectId}`);
  }

  /**
   * Toggles project starred status
   *
   * @param projectId - Project ID
   */
  async toggleStar(projectId: string): Promise<void> {
    const metadata = await projectStorageService.loadMetadata(projectId);
    if (!metadata) {
      throw new Error(`Project ${projectId} not found`);
    }

    await projectStorageService.updateMetadata(projectId, {
      isStarred: !metadata.isStarred,
    });

    // Update current project if applicable
    if (this.currentProject?.id === projectId) {
      this.currentProject.isStarred = !metadata.isStarred;
    }

    // Emit event
    this.emitEvent('projectUpdated', {
      ...metadata,
      isStarred: !metadata.isStarred,
      updatedAt: Date.now(),
    });
  }

  /**
   * Toggles project archived status
   *
   * @param projectId - Project ID
   */
  async toggleArchive(projectId: string): Promise<void> {
    const metadata = await projectStorageService.loadMetadata(projectId);
    if (!metadata) {
      throw new Error(`Project ${projectId} not found`);
    }

    await projectStorageService.updateMetadata(projectId, {
      isArchived: !metadata.isArchived,
    });

    // Update current project if applicable
    if (this.currentProject?.id === projectId) {
      this.currentProject.isArchived = !metadata.isArchived;
    }

    // Emit event
    this.emitEvent('projectUpdated', {
      ...metadata,
      isArchived: !metadata.isArchived,
      updatedAt: Date.now(),
    });
  }

  /**
   * Gets the current open project
   *
   * @returns Current project or null
   */
  getCurrentProject(): Project | null {
    return this.currentProject;
  }

  /**
   * Gets all project metadata for list display
   *
   * @param options - List options (filter, sort)
   * @returns Array of project metadata
   */
  async getProjectList(options?: ProjectListOptions): Promise<ProjectMetadata[]> {
    await this.ensureInitialized();
    return projectStorageService.loadAllMetadata(options);
  }

  /**
   * Gets project count
   *
   * @returns Number of projects
   */
  async getProjectCount(): Promise<number> {
    await this.ensureInitialized();
    return projectStorageService.getProjectCount();
  }

  /**
   * Observes project update events
   *
   * @returns Observable stream of project events
   */
  observeProjectUpdates(): Observable<ProjectEvent> {
    return this.projectUpdates$.asObservable();
  }

  /**
   * Extracts metadata from a full project
   * @private
   */
  private extractMetadata(project: Project): ProjectMetadata {
    const {
      id,
      name,
      description,
      thumbnail,
      createdAt,
      updatedAt,
      accessedAt,
      size,
      elementCount,
      tags,
      isStarred,
      isArchived,
    } = project;

    return {
      id,
      name,
      description,
      thumbnail,
      createdAt,
      updatedAt,
      accessedAt,
      size,
      elementCount,
      tags,
      isStarred,
      isArchived,
    };
  }

  /**
   * Emits a project event
   * @private
   */
  private emitEvent(type: ProjectEvent['type'], project: ProjectMetadata): void {
    this.projectUpdates$.next({
      type,
      project,
      timestamp: Date.now(),
    });
  }

  /**
   * Ensures the service is initialized
   * @private
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Export singleton instance
export const projectManagerService = ProjectManagerService.getInstance();
