/**
 * Project Storage Service
 *
 * Encapsulates IndexedDB operations using localforage for project persistence.
 * Provides reliable storage and retrieval of project data across browser sessions.
 * Separates metadata from full project data for optimal list loading performance.
 */

import localforage from 'localforage';
import {
  Project,
  ProjectMetadata,
  ProjectListOptions,
  ProjectSortBy,
  ProjectSortOrder,
} from '../types/project.types';
import { PROJECT_DB_CONFIG, PROJECT_DEFAULT_SORT } from '../constants/PROJECT_CONSTANTS';

/**
 * Project storage service class for managing project persistence
 * Uses two separate stores: one for metadata (fast list) and one for full data
 */
class ProjectStorageService {
  private projectStore: LocalForage;
  private metadataStore: LocalForage;
  private initialized: boolean = false;

  constructor() {
    // Initialize project data store
    this.projectStore = localforage.createInstance({
      driver: localforage.INDEXEDDB,
      name: PROJECT_DB_CONFIG.DATABASE_NAME,
      version: PROJECT_DB_CONFIG.DATABASE_VERSION,
      storeName: PROJECT_DB_CONFIG.STORES.PROJECTS,
      description: 'Project data storage',
    });

    // Initialize metadata store for fast list loading
    this.metadataStore = localforage.createInstance({
      driver: localforage.INDEXEDDB,
      name: PROJECT_DB_CONFIG.DATABASE_NAME,
      version: PROJECT_DB_CONFIG.DATABASE_VERSION,
      storeName: PROJECT_DB_CONFIG.STORES.METADATA,
      description: 'Project metadata storage',
    });
  }

  /**
   * Initializes the storage service
   * Must be called before using other methods
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await Promise.all([this.projectStore.ready(), this.metadataStore.ready()]);
      this.initialized = true;
      console.log('[ProjectStorageService] Initialized successfully');
    } catch (error) {
      console.error('[ProjectStorageService] Failed to initialize:', error);
      throw new Error('Project storage initialization failed');
    }
  }

  /**
   * Saves a complete project to storage
   * Also updates the metadata store
   *
   * @param project - Project to save
   */
  async saveProject(project: Project): Promise<void> {
    try {
      await this.ensureInitialized();

      // Extract metadata from project
      const metadata = this.extractMetadata(project);

      // Save both project data and metadata
      await Promise.all([
        this.projectStore.setItem(project.id, project),
        this.metadataStore.setItem(project.id, metadata),
      ]);

      console.log(`[ProjectStorageService] Saved project ${project.id}`);
    } catch (error) {
      console.error('[ProjectStorageService] Failed to save project:', error);
      throw new Error('Failed to save project to storage');
    }
  }

  /**
   * Loads a complete project from storage by ID
   *
   * @param projectId - Project ID to load
   * @returns Project or null if not found
   */
  async loadProject(projectId: string): Promise<Project | null> {
    try {
      await this.ensureInitialized();
      const project = await this.projectStore.getItem<Project>(projectId);
      return project;
    } catch (error) {
      console.error(
        `[ProjectStorageService] Failed to load project ${projectId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Loads project metadata by ID (lightweight, no elements)
   *
   * @param projectId - Project ID
   * @returns ProjectMetadata or null if not found
   */
  async loadMetadata(projectId: string): Promise<ProjectMetadata | null> {
    try {
      await this.ensureInitialized();
      const metadata = await this.metadataStore.getItem<ProjectMetadata>(projectId);
      return metadata;
    } catch (error) {
      console.error(
        `[ProjectStorageService] Failed to load metadata ${projectId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Loads all project metadata for list display
   * Supports filtering and sorting
   *
   * @param options - List options (filter, sort)
   * @returns Array of project metadata
   */
  async loadAllMetadata(options?: ProjectListOptions): Promise<ProjectMetadata[]> {
    try {
      await this.ensureInitialized();

      const metadataList: ProjectMetadata[] = [];

      // Iterate through all metadata
      await this.metadataStore.iterate<ProjectMetadata, void>((value) => {
        if (value && typeof value === 'object' && 'id' in value) {
          metadataList.push(value);
        }
      });

      // Apply filters
      let filtered = this.applyFilters(metadataList, options?.filter);

      // Apply sorting
      filtered = this.applySorting(
        filtered,
        options?.sortBy || PROJECT_DEFAULT_SORT.SORT_BY,
        options?.sortOrder || PROJECT_DEFAULT_SORT.SORT_ORDER
      );

      console.log(
        `[ProjectStorageService] Loaded ${filtered.length} project metadata`
      );
      return filtered;
    } catch (error) {
      console.error('[ProjectStorageService] Failed to load metadata:', error);
      return [];
    }
  }

  /**
   * Updates project metadata only (without rewriting full project)
   * Useful for quick updates like starring or renaming
   *
   * @param projectId - Project ID
   * @param updates - Partial metadata updates
   */
  async updateMetadata(
    projectId: string,
    updates: Partial<ProjectMetadata>
  ): Promise<void> {
    try {
      await this.ensureInitialized();

      const existing = await this.metadataStore.getItem<ProjectMetadata>(projectId);
      if (!existing) {
        throw new Error(`Project ${projectId} not found`);
      }

      const updated: ProjectMetadata = {
        ...existing,
        ...updates,
        id: projectId, // Ensure ID cannot be changed
        updatedAt: Date.now(),
      };

      await this.metadataStore.setItem(projectId, updated);
      console.log(`[ProjectStorageService] Updated metadata for ${projectId}`);
    } catch (error) {
      console.error('[ProjectStorageService] Failed to update metadata:', error);
      throw new Error('Failed to update project metadata');
    }
  }

  /**
   * Deletes a project from storage
   * Removes both project data and metadata
   *
   * @param projectId - Project ID to delete
   */
  async deleteProject(projectId: string): Promise<void> {
    try {
      await this.ensureInitialized();

      await Promise.all([
        this.projectStore.removeItem(projectId),
        this.metadataStore.removeItem(projectId),
      ]);

      console.log(`[ProjectStorageService] Deleted project ${projectId}`);
    } catch (error) {
      console.error(
        `[ProjectStorageService] Failed to delete project ${projectId}:`,
        error
      );
      throw new Error('Failed to delete project from storage');
    }
  }

  /**
   * Gets the count of all projects
   *
   * @returns Number of projects
   */
  async getProjectCount(): Promise<number> {
    try {
      await this.ensureInitialized();
      const count = await this.metadataStore.length();
      return count;
    } catch (error) {
      console.error('[ProjectStorageService] Failed to get project count:', error);
      return 0;
    }
  }

  /**
   * Checks if a project exists
   *
   * @param projectId - Project ID to check
   * @returns True if project exists
   */
  async projectExists(projectId: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      const metadata = await this.metadataStore.getItem(projectId);
      return metadata !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clears all project data from storage
   * Use with caution - this operation cannot be undone
   */
  async clearAll(): Promise<void> {
    try {
      await this.ensureInitialized();
      await Promise.all([this.projectStore.clear(), this.metadataStore.clear()]);
      console.log('[ProjectStorageService] Cleared all project storage');
    } catch (error) {
      console.error('[ProjectStorageService] Failed to clear storage:', error);
      throw new Error('Failed to clear project storage');
    }
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
   * Applies filters to metadata list
   * @private
   */
  private applyFilters(
    list: ProjectMetadata[],
    filter?: ProjectListOptions['filter']
  ): ProjectMetadata[] {
    if (!filter) {
      return list;
    }

    return list.filter((item) => {
      // Search filter
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const nameMatch = item.name.toLowerCase().includes(searchLower);
        const descMatch = item.description?.toLowerCase().includes(searchLower);
        if (!nameMatch && !descMatch) {
          return false;
        }
      }

      // Tags filter
      if (filter.tags && filter.tags.length > 0) {
        const hasMatchingTag = filter.tags.some((tag) => item.tags?.includes(tag));
        if (!hasMatchingTag) {
          return false;
        }
      }

      // Starred filter
      if (filter.isStarred !== undefined && item.isStarred !== filter.isStarred) {
        return false;
      }

      // Archived filter (default: hide archived)
      if (filter.isArchived === undefined) {
        if (item.isArchived) {
          return false;
        }
      } else if (item.isArchived !== filter.isArchived) {
        return false;
      }

      return true;
    });
  }

  /**
   * Applies sorting to metadata list
   * @private
   */
  private applySorting(
    list: ProjectMetadata[],
    sortBy: ProjectSortBy,
    sortOrder: ProjectSortOrder
  ): ProjectMetadata[] {
    const sorted = [...list];

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'createdAt':
          comparison = a.createdAt - b.createdAt;
          break;
        case 'updatedAt':
          comparison = a.updatedAt - b.updatedAt;
          break;
        case 'accessedAt':
          comparison = a.accessedAt - b.accessedAt;
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        default:
          comparison = a.updatedAt - b.updatedAt;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return sorted;
  }

  /**
   * Ensures the storage service is initialized
   * @private
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Export singleton instance
export const projectStorageService = new ProjectStorageService();
