/**
 * useProjectManager Hook
 *
 * Provides React components with project management state and operations.
 * Subscribes to project updates and provides memoized selectors.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { projectManagerService } from '../services/project-manager-service';
import {
  Project,
  ProjectMetadata,
  ProjectListOptions,
  CreateProjectOptions,
  ProjectSortBy,
  ProjectSortOrder,
  ProjectFilter,
} from '../types/project.types';
import { PROJECT_DEFAULT_SORT } from '../constants/PROJECT_CONSTANTS';

/**
 * Return type for useProjectManager hook
 */
export interface UseProjectManagerReturn {
  /** All project metadata for list display */
  projects: ProjectMetadata[];
  /** Currently open project (full data) */
  currentProject: Project | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Current filter options */
  filter: ProjectFilter;
  /** Current sort field */
  sortBy: ProjectSortBy;
  /** Current sort order */
  sortOrder: ProjectSortOrder;
  /** Starred projects */
  starredProjects: ProjectMetadata[];
  /** Recent projects (sorted by accessedAt) */
  recentProjects: ProjectMetadata[];
  /** Total project count */
  projectCount: number;

  // Actions
  /** Creates a new project */
  createProject: (options: CreateProjectOptions) => Promise<Project | null>;
  /** Opens a project by ID */
  openProject: (projectId: string) => Promise<Project | null>;
  /** Closes the current project */
  closeProject: () => Promise<void>;
  /** Deletes a project */
  deleteProject: (projectId: string) => Promise<boolean>;
  /** Renames a project */
  renameProject: (projectId: string, newName: string) => Promise<boolean>;
  /** Duplicates a project */
  duplicateProject: (projectId: string, newName?: string) => Promise<Project | null>;
  /** Toggles project star status */
  toggleStar: (projectId: string) => Promise<void>;
  /** Toggles project archive status */
  toggleArchive: (projectId: string) => Promise<void>;
  /** Refreshes the project list */
  refreshProjects: () => Promise<void>;
  /** Sets filter options */
  setFilter: (filter: ProjectFilter) => void;
  /** Sets sort options */
  setSort: (sortBy: ProjectSortBy, sortOrder?: ProjectSortOrder) => void;
  /** Clears any error */
  clearError: () => void;
}

/**
 * Hook for managing project state and operations
 *
 * @example
 * function ProjectList() {
 *   const { projects, createProject, openProject, isLoading } = useProjectManager();
 *
 *   if (isLoading) return <Loading />;
 *
 *   return (
 *     <div>
 *       <button onClick={() => createProject({ name: 'New Project' })}>
 *         New Project
 *       </button>
 *       {projects.map(project => (
 *         <ProjectCard
 *           key={project.id}
 *           project={project}
 *           onClick={() => openProject(project.id)}
 *         />
 *       ))}
 *     </div>
 *   );
 * }
 */
export function useProjectManager(): UseProjectManagerReturn {
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilterState] = useState<ProjectFilter>({});
  const [sortBy, setSortBy] = useState<ProjectSortBy>(PROJECT_DEFAULT_SORT.SORT_BY);
  const [sortOrder, setSortOrder] = useState<ProjectSortOrder>(
    PROJECT_DEFAULT_SORT.SORT_ORDER
  );

  // Load projects on mount and when filter/sort changes
  const loadProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      const options: ProjectListOptions = {
        filter,
        sortBy,
        sortOrder,
      };
      const projectList = await projectManagerService.getProjectList(options);
      setProjects(projectList);
      setCurrentProject(projectManagerService.getCurrentProject());
      setError(null);
    } catch (err) {
      console.error('[useProjectManager] Failed to load projects:', err);
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  }, [filter, sortBy, sortOrder]);

  // Initialize and subscribe to updates
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        await projectManagerService.initialize();
        if (mounted) {
          await loadProjects();
        }
      } catch (err) {
        if (mounted) {
          console.error('[useProjectManager] Initialization failed:', err);
          setError(
            err instanceof Error ? err.message : 'Failed to initialize project manager'
          );
          setIsLoading(false);
        }
      }
    };

    initialize();

    // Subscribe to project updates
    const subscription = projectManagerService.observeProjectUpdates().subscribe(() => {
      if (mounted) {
        loadProjects();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProjects]);

  // Memoized selectors
  const starredProjects = useMemo(() => {
    return projects.filter((p) => p.isStarred);
  }, [projects]);

  const recentProjects = useMemo(() => {
    return [...projects]
      .sort((a, b) => b.accessedAt - a.accessedAt)
      .slice(0, 5);
  }, [projects]);

  const projectCount = useMemo(() => projects.length, [projects]);

  // Actions
  const createProject = useCallback(
    async (options: CreateProjectOptions): Promise<Project | null> => {
      try {
        setError(null);
        const project = await projectManagerService.createProject(options);
        return project;
      } catch (err) {
        console.error('[useProjectManager] Failed to create project:', err);
        setError(err instanceof Error ? err.message : 'Failed to create project');
        return null;
      }
    },
    []
  );

  const openProject = useCallback(
    async (projectId: string): Promise<Project | null> => {
      try {
        setError(null);
        const project = await projectManagerService.openProject(projectId);
        setCurrentProject(project);
        return project;
      } catch (err) {
        console.error('[useProjectManager] Failed to open project:', err);
        setError(err instanceof Error ? err.message : 'Failed to open project');
        return null;
      }
    },
    []
  );

  const closeProject = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      await projectManagerService.closeProject();
      setCurrentProject(null);
    } catch (err) {
      console.error('[useProjectManager] Failed to close project:', err);
      setError(err instanceof Error ? err.message : 'Failed to close project');
    }
  }, []);

  const deleteProject = useCallback(
    async (projectId: string): Promise<boolean> => {
      try {
        setError(null);
        await projectManagerService.deleteProject(projectId);
        return true;
      } catch (err) {
        console.error('[useProjectManager] Failed to delete project:', err);
        setError(err instanceof Error ? err.message : 'Failed to delete project');
        return false;
      }
    },
    []
  );

  const renameProject = useCallback(
    async (projectId: string, newName: string): Promise<boolean> => {
      try {
        setError(null);
        await projectManagerService.renameProject(projectId, newName);
        return true;
      } catch (err) {
        console.error('[useProjectManager] Failed to rename project:', err);
        setError(err instanceof Error ? err.message : 'Failed to rename project');
        return false;
      }
    },
    []
  );

  const duplicateProject = useCallback(
    async (projectId: string, newName?: string): Promise<Project | null> => {
      try {
        setError(null);
        const project = await projectManagerService.duplicateProject(projectId, newName);
        return project;
      } catch (err) {
        console.error('[useProjectManager] Failed to duplicate project:', err);
        setError(err instanceof Error ? err.message : 'Failed to duplicate project');
        return null;
      }
    },
    []
  );

  const toggleStar = useCallback(async (projectId: string): Promise<void> => {
    try {
      setError(null);
      await projectManagerService.toggleStar(projectId);
    } catch (err) {
      console.error('[useProjectManager] Failed to toggle star:', err);
      setError(err instanceof Error ? err.message : 'Failed to toggle star');
    }
  }, []);

  const toggleArchive = useCallback(async (projectId: string): Promise<void> => {
    try {
      setError(null);
      await projectManagerService.toggleArchive(projectId);
    } catch (err) {
      console.error('[useProjectManager] Failed to toggle archive:', err);
      setError(err instanceof Error ? err.message : 'Failed to toggle archive');
    }
  }, []);

  const refreshProjects = useCallback(async (): Promise<void> => {
    await loadProjects();
  }, [loadProjects]);

  const setFilter = useCallback((newFilter: ProjectFilter): void => {
    setFilterState(newFilter);
  }, []);

  const setSort = useCallback(
    (newSortBy: ProjectSortBy, newSortOrder?: ProjectSortOrder): void => {
      setSortBy(newSortBy);
      if (newSortOrder) {
        setSortOrder(newSortOrder);
      }
    },
    []
  );

  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  return {
    projects,
    currentProject,
    isLoading,
    error,
    filter,
    sortBy,
    sortOrder,
    starredProjects,
    recentProjects,
    projectCount,
    createProject,
    openProject,
    closeProject,
    deleteProject,
    renameProject,
    duplicateProject,
    toggleStar,
    toggleArchive,
    refreshProjects,
    setFilter,
    setSort,
    clearError,
  };
}
