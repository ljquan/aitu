/**
 * useWorkspace Hook
 *
 * Provides React components with workspace state and operations.
 * Manages folders, projects, branches, and tree structure.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { workspaceService } from '../services/workspace-service';
import {
  Folder,
  Project,
  Branch,
  TreeNode,
  WorkspaceState,
  CreateFolderOptions,
  CreateProjectOptions,
  CreateBranchOptions,
  BoardChangeData,
} from '../types/workspace.types';

export interface UseWorkspaceReturn {
  // State
  isLoading: boolean;
  error: string | null;
  tree: TreeNode[];
  currentBranch: Branch | null;
  currentProject: Project | null;
  workspaceState: WorkspaceState;
  hasProjects: boolean;

  // Folder operations
  createFolder: (options: CreateFolderOptions) => Promise<Folder | null>;
  renameFolder: (id: string, name: string) => Promise<boolean>;
  deleteFolder: (id: string) => Promise<boolean>;
  toggleFolderExpanded: (id: string) => void;

  // Project operations
  createProject: (options: CreateProjectOptions) => Promise<Project | null>;
  renameProject: (id: string, name: string) => Promise<boolean>;
  deleteProject: (id: string) => Promise<boolean>;
  moveProject: (id: string, targetFolderId: string | null) => Promise<boolean>;
  toggleProjectExpanded: (id: string) => void;

  // Branch operations
  createBranch: (options: CreateBranchOptions) => Promise<Branch | null>;
  renameBranch: (id: string, name: string) => Promise<boolean>;
  deleteBranch: (id: string) => Promise<boolean>;
  switchBranch: (branchId: string) => Promise<Branch | null>;
  saveBranch: (data: BoardChangeData) => Promise<boolean>;

  // UI state
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Refresh
  refresh: () => void;
}

export function useWorkspace(): UseWorkspaceReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(
    workspaceService.getState()
  );
  const [updateCount, setUpdateCount] = useState(0);

  // Refresh function
  const refresh = useCallback(() => {
    setTree(workspaceService.getTree());
    setCurrentBranch(workspaceService.getCurrentBranch());
    setCurrentProject(workspaceService.getCurrentProject());
    setWorkspaceState(workspaceService.getState());
  }, []);

  // Initialize and subscribe to events
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        setIsLoading(true);
        await workspaceService.initialize();
        if (mounted) {
          refresh();
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initialize();

    // Subscribe to workspace events
    const subscription = workspaceService.observeEvents().subscribe(() => {
      if (mounted) {
        refresh();
        setUpdateCount((c) => c + 1);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refresh]);

  const hasProjects = useMemo(() => {
    return workspaceService.hasProjects();
  }, [updateCount]);

  // ========== Folder Operations ==========

  const createFolder = useCallback(
    async (options: CreateFolderOptions): Promise<Folder | null> => {
      try {
        setError(null);
        return await workspaceService.createFolder(options);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create folder');
        return null;
      }
    },
    []
  );

  const renameFolder = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      try {
        setError(null);
        await workspaceService.renameFolder(id, name);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to rename folder');
        return false;
      }
    },
    []
  );

  const deleteFolder = useCallback(async (id: string): Promise<boolean> => {
    try {
      setError(null);
      await workspaceService.deleteFolder(id);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete folder');
      return false;
    }
  }, []);

  const toggleFolderExpanded = useCallback((id: string): void => {
    workspaceService.toggleFolderExpanded(id);
  }, []);

  // ========== Project Operations ==========

  const createProject = useCallback(
    async (options: CreateProjectOptions): Promise<Project | null> => {
      try {
        setError(null);
        return await workspaceService.createProject(options);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create project');
        return null;
      }
    },
    []
  );

  const renameProject = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      try {
        setError(null);
        await workspaceService.renameProject(id, name);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to rename project');
        return false;
      }
    },
    []
  );

  const deleteProject = useCallback(async (id: string): Promise<boolean> => {
    try {
      setError(null);
      await workspaceService.deleteProject(id);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
      return false;
    }
  }, []);

  const moveProject = useCallback(
    async (id: string, targetFolderId: string | null): Promise<boolean> => {
      try {
        setError(null);
        await workspaceService.moveProject(id, targetFolderId);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to move project');
        return false;
      }
    },
    []
  );

  const toggleProjectExpanded = useCallback((id: string): void => {
    workspaceService.toggleProjectExpanded(id);
  }, []);

  // ========== Branch Operations ==========

  const createBranch = useCallback(
    async (options: CreateBranchOptions): Promise<Branch | null> => {
      try {
        setError(null);
        return await workspaceService.createBranch(options);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create branch');
        return null;
      }
    },
    []
  );

  const renameBranch = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      try {
        setError(null);
        await workspaceService.renameBranch(id, name);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to rename branch');
        return false;
      }
    },
    []
  );

  const deleteBranch = useCallback(async (id: string): Promise<boolean> => {
    try {
      setError(null);
      await workspaceService.deleteBranch(id);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete branch');
      return false;
    }
  }, []);

  const switchBranch = useCallback(
    async (branchId: string): Promise<Branch | null> => {
      try {
        setError(null);
        return await workspaceService.switchBranch(branchId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to switch branch');
        return null;
      }
    },
    []
  );

  const saveBranch = useCallback(
    async (data: BoardChangeData): Promise<boolean> => {
      const branch = workspaceService.getCurrentBranch();
      if (!branch) return false;

      try {
        await workspaceService.saveBranch(branch.id, data);
        return true;
      } catch (err) {
        console.error('[useWorkspace] Failed to save branch:', err);
        return false;
      }
    },
    []
  );

  // ========== UI State ==========

  const setSidebarWidth = useCallback((width: number): void => {
    workspaceService.setSidebarWidth(width);
    setWorkspaceState(workspaceService.getState());
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean): void => {
    workspaceService.setSidebarCollapsed(collapsed);
    setWorkspaceState(workspaceService.getState());
  }, []);

  return {
    isLoading,
    error,
    tree,
    currentBranch,
    currentProject,
    workspaceState,
    hasProjects,
    createFolder,
    renameFolder,
    deleteFolder,
    toggleFolderExpanded,
    createProject,
    renameProject,
    deleteProject,
    moveProject,
    toggleProjectExpanded,
    createBranch,
    renameBranch,
    deleteBranch,
    switchBranch,
    saveBranch,
    setSidebarWidth,
    setSidebarCollapsed,
    refresh,
  };
}
