/**
 * Workspace System Type Definitions
 *
 * Defines types for the sidebar-based file management system
 * with folder hierarchy, projects, and branches.
 */

import { PlaitElement, PlaitTheme, Viewport } from '@plait/core';

/**
 * Folder node - for organizing projects
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
 * Project node - contains multiple branches
 */
export interface Project {
  /** Unique project identifier */
  id: string;
  /** Project display name */
  name: string;
  /** Parent folder ID (null for root level) */
  folderId: string | null;
  /** Sort order within folder */
  order: number;
  /** Default branch ID */
  defaultBranchId: string;
  /** Whether project is expanded in UI */
  isExpanded?: boolean;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
}

/**
 * Branch - a version/variant of a project
 */
export interface Branch {
  /** Unique branch identifier */
  id: string;
  /** Parent project ID */
  projectId: string;
  /** Branch display name (e.g., "主分支", "方案A") */
  name: string;
  /** Parent branch ID (if derived from another branch) */
  parentBranchId?: string;
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
export type TreeNodeType = 'folder' | 'project' | 'branch';

/**
 * Folder tree node
 */
export interface FolderTreeNode {
  type: 'folder';
  data: Folder;
  children: TreeNode[];
}

/**
 * Project tree node
 */
export interface ProjectTreeNode {
  type: 'project';
  data: Project;
  branches: Branch[];
}

/**
 * Branch tree node (for flat rendering within project)
 */
export interface BranchTreeNode {
  type: 'branch';
  data: Branch;
}

/**
 * Union type for all tree nodes
 */
export type TreeNode = FolderTreeNode | ProjectTreeNode;

/**
 * Workspace state - persisted UI state
 */
export interface WorkspaceState {
  /** Currently active branch ID */
  currentBranchId: string | null;
  /** Currently active project ID */
  currentProjectId: string | null;
  /** IDs of expanded folders */
  expandedFolderIds: string[];
  /** IDs of expanded projects */
  expandedProjectIds: string[];
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
 * Create project options
 */
export interface CreateProjectOptions {
  name: string;
  folderId?: string | null;
  /** Initial elements for default branch */
  elements?: PlaitElement[];
  viewport?: Viewport;
  theme?: PlaitTheme;
}

/**
 * Create branch options
 */
export interface CreateBranchOptions {
  projectId: string;
  name: string;
  /** Branch to copy from (if not provided, creates empty branch) */
  fromBranchId?: string;
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
  | 'projectCreated'
  | 'projectUpdated'
  | 'projectDeleted'
  | 'branchCreated'
  | 'branchUpdated'
  | 'branchDeleted'
  | 'branchSwitched'
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
  DEFAULT_BRANCH_NAME: '主分支',
  DEFAULT_PROJECT_NAME: '未命名项目',
  DEFAULT_FOLDER_NAME: '新建文件夹',
  SIDEBAR_WIDTH: 280,
  SIDEBAR_MIN_WIDTH: 200,
  SIDEBAR_MAX_WIDTH: 400,
} as const;
