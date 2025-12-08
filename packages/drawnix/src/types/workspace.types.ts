/**
 * Workspace System Type Definitions
 *
 * Defines types for the sidebar-based file management system
 * with folder hierarchy and boards (simplified from project/branch structure).
 */

import { PlaitElement, PlaitTheme, Viewport } from '@plait/core';

/**
 * Folder node - for organizing boards (supports nesting)
 */
export interface Folder {
  /** Unique folder identifier */
  id: string;
  /** Folder display name */
  name: string;
  /** Parent folder ID (null for root level) */
  parentId: string | null;
  /** Sort order within parent */
  order: number;
  /** Whether folder is expanded in UI */
  isExpanded?: boolean;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}

/**
 * Board node - contains the actual drawing board data
 * (Merged from previous Project and Branch concepts)
 */
export interface Board {
  /** Unique board identifier */
  id: string;
  /** Board display name */
  name: string;
  /** Parent folder ID (null for root level) */
  folderId: string | null;
  /** Sort order within folder */
  order: number;
  /** Board elements */
  elements: PlaitElement[];
  /** Viewport state */
  viewport?: Viewport;
  /** Theme configuration */
  theme?: PlaitTheme;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}

/**
 * Tree node types for rendering
 */
export type TreeNodeType = 'folder' | 'board';

/**
 * Folder tree node
 */
export interface FolderTreeNode {
  type: 'folder';
  data: Folder;
  children: TreeNode[];
}

/**
 * Board tree node
 */
export interface BoardTreeNode {
  type: 'board';
  data: Board;
}

/**
 * Union type for all tree nodes
 */
export type TreeNode = FolderTreeNode | BoardTreeNode;

/**
 * Workspace state - persisted UI state
 */
export interface WorkspaceState {
  /** Currently active board ID */
  currentBoardId: string | null;
  /** IDs of expanded folders */
  expandedFolderIds: string[];
  /** Sidebar width in pixels */
  sidebarWidth: number;
  /** Whether sidebar is collapsed */
  sidebarCollapsed: boolean;
  /** Whether legacy data migration has been completed */
  migrationCompleted?: boolean;
}

/**
 * Create folder options
 */
export interface CreateFolderOptions {
  name: string;
  parentId?: string | null;
}

/**
 * Create board options
 */
export interface CreateBoardOptions {
  name: string;
  folderId?: string | null;
  /** Initial elements */
  elements?: PlaitElement[];
  viewport?: Viewport;
  theme?: PlaitTheme;
}

/**
 * Board change data for saving
 */
export interface BoardChangeData {
  children: PlaitElement[];
  viewport?: Viewport;
  theme?: PlaitTheme;
}

/**
 * Workspace event types
 */
export type WorkspaceEventType =
  | 'folderCreated'
  | 'folderUpdated'
  | 'folderDeleted'
  | 'boardCreated'
  | 'boardUpdated'
  | 'boardDeleted'
  | 'boardSwitched'
  | 'treeChanged';

/**
 * Workspace event
 */
export interface WorkspaceEvent {
  type: WorkspaceEventType;
  payload?: unknown;
  timestamp: number;
}

/**
 * Default values
 */
export const WORKSPACE_DEFAULTS = {
  DEFAULT_BOARD_NAME: '未命名画板',
  DEFAULT_FOLDER_NAME: '新建文件夹',
  SIDEBAR_WIDTH: 280,
  SIDEBAR_MIN_WIDTH: 200,
  SIDEBAR_MAX_WIDTH: 400,
} as const;
