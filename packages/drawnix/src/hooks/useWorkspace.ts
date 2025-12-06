/**
 * useWorkspace Hook
 *
 * Provides React components with workspace state and operations.
 * Manages folders, boards, and tree structure.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { workspaceService } from '../services/workspace-service';
import {
  Folder,
  Board,
  TreeNode,
  WorkspaceState,
  CreateFolderOptions,
  CreateBoardOptions,
  BoardChangeData,
} from '../types/workspace.types';

export interface UseWorkspaceReturn {
  // State
  isLoading: boolean;
  error: string | null;
  tree: TreeNode[];
  currentBoard: Board | null;
  workspaceState: WorkspaceState;
  hasBoards: boolean;

  // Folder operations
  createFolder: (options: CreateFolderOptions) => Promise<Folder | null>;
  renameFolder: (id: string, name: string) => Promise<boolean>;
  deleteFolder: (id: string) => Promise<boolean>;
  toggleFolderExpanded: (id: string) => void;

  // Board operations
  createBoard: (options: CreateBoardOptions) => Promise<Board | null>;
  renameBoard: (id: string, name: string) => Promise<boolean>;
  deleteBoard: (id: string) => Promise<boolean>;
  moveBoard: (id: string, targetFolderId: string | null) => Promise<boolean>;
  switchBoard: (boardId: string) => Promise<Board | null>;
  saveBoard: (data: BoardChangeData) => Promise<boolean>;

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
  const [currentBoard, setCurrentBoard] = useState<Board | null>(null);
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(
    workspaceService.getState()
  );
  const [updateCount, setUpdateCount] = useState(0);

  // Refresh function
  const refresh = useCallback(() => {
    setTree(workspaceService.getTree());
    setCurrentBoard(workspaceService.getCurrentBoard());
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

  const hasBoards = useMemo(() => {
    return workspaceService.hasBoards();
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

  // ========== Board Operations ==========

  const createBoard = useCallback(
    async (options: CreateBoardOptions): Promise<Board | null> => {
      try {
        setError(null);
        return await workspaceService.createBoard(options);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create board');
        return null;
      }
    },
    []
  );

  const renameBoard = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      try {
        setError(null);
        await workspaceService.renameBoard(id, name);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to rename board');
        return false;
      }
    },
    []
  );

  const deleteBoard = useCallback(async (id: string): Promise<boolean> => {
    try {
      setError(null);
      await workspaceService.deleteBoard(id);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete board');
      return false;
    }
  }, []);

  const moveBoard = useCallback(
    async (id: string, targetFolderId: string | null): Promise<boolean> => {
      try {
        setError(null);
        await workspaceService.moveBoard(id, targetFolderId);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to move board');
        return false;
      }
    },
    []
  );

  const switchBoard = useCallback(
    async (boardId: string): Promise<Board | null> => {
      try {
        setError(null);
        return await workspaceService.switchBoard(boardId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to switch board');
        return null;
      }
    },
    []
  );

  const saveBoard = useCallback(
    async (data: BoardChangeData): Promise<boolean> => {
      const board = workspaceService.getCurrentBoard();
      if (!board) return false;

      try {
        await workspaceService.saveBoard(board.id, data);
        return true;
      } catch (err) {
        console.error('[useWorkspace] Failed to save board:', err);
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
    currentBoard,
    workspaceState,
    hasBoards,
    createFolder,
    renameFolder,
    deleteFolder,
    toggleFolderExpanded,
    createBoard,
    renameBoard,
    deleteBoard,
    moveBoard,
    switchBoard,
    saveBoard,
    setSidebarWidth,
    setSidebarCollapsed,
    refresh,
  };
}
