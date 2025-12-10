/**
 * Project Management System Type Definitions
 *
 * Defines all TypeScript types and interfaces for the project management system.
 * These types form the foundation for project CRUD operations, metadata management,
 * and multi-project persistence.
 */

import { PlaitElement, PlaitTheme, Viewport } from '@plait/core';

/**
 * Project metadata interface
 * Contains lightweight information for project list display (not full data)
 */
export interface ProjectMetadata {
  /** Unique project identifier (UUID v4) */
  id: string;
  /** Project display name */
  name: string;
  /** Optional project description */
  description?: string;
  /** Thumbnail image (base64 data URL or blob URL) */
  thumbnail?: string;
  /** Project creation timestamp (Unix milliseconds) */
  createdAt: number;
  /** Last modification timestamp (Unix milliseconds) */
  updatedAt: number;
  /** Last access timestamp (Unix milliseconds) */
  accessedAt: number;
  /** Approximate data size in bytes */
  size: number;
  /** Number of elements in the project */
  elementCount: number;
  /** Optional tags for categorization */
  tags?: string[];
  /** Whether the project is starred/favorited */
  isStarred?: boolean;
  /** Whether the project is archived */
  isArchived?: boolean;
}

/**
 * Project settings interface
 * Contains project-specific configuration
 */
export interface ProjectSettings {
  /** Custom background color */
  backgroundColor?: string;
  /** Whether grid is enabled */
  gridEnabled?: boolean;
  /** Whether snap to grid is enabled */
  snapToGrid?: boolean;
  /** Grid size in pixels */
  gridSize?: number;
}

/**
 * Complete project interface
 * Contains all project data including elements and settings
 */
export interface Project extends ProjectMetadata {
  /** Board elements (shapes, text, images, etc.) */
  elements: PlaitElement[];
  /** Current viewport state (zoom, offset) */
  viewport?: Viewport;
  /** Theme configuration */
  theme?: PlaitTheme;
  /** Project-specific settings */
  settings?: ProjectSettings;
}

/**
 * Project creation options
 * Parameters for creating a new project
 */
export interface CreateProjectOptions {
  /** Project name (required) */
  name: string;
  /** Optional description */
  description?: string;
  /** Initial elements (optional, defaults to empty) */
  elements?: PlaitElement[];
  /** Initial viewport (optional) */
  viewport?: Viewport;
  /** Initial theme (optional) */
  theme?: PlaitTheme;
  /** Initial settings (optional) */
  settings?: ProjectSettings;
  /** Initial tags (optional) */
  tags?: string[];
}

/**
 * Project update options
 * Parameters for updating an existing project
 */
export interface UpdateProjectOptions {
  /** Update project name */
  name?: string;
  /** Update description */
  description?: string;
  /** Update elements */
  elements?: PlaitElement[];
  /** Update viewport */
  viewport?: Viewport;
  /** Update theme */
  theme?: PlaitTheme;
  /** Update settings */
  settings?: ProjectSettings;
  /** Update tags */
  tags?: string[];
  /** Update starred status */
  isStarred?: boolean;
  /** Update archived status */
  isArchived?: boolean;
}

/**
 * Project sort field options
 */
export type ProjectSortBy =
  | 'name'
  | 'createdAt'
  | 'updatedAt'
  | 'accessedAt'
  | 'size';

/**
 * Sort order options
 */
export type ProjectSortOrder = 'asc' | 'desc';

/**
 * Project filter options
 * Used for filtering project list
 */
export interface ProjectFilter {
  /** Search keyword (matches name and description) */
  search?: string;
  /** Filter by tags */
  tags?: string[];
  /** Show only starred projects */
  isStarred?: boolean;
  /** Show archived projects */
  isArchived?: boolean;
}

/**
 * Project list query options
 * Combines filtering and sorting
 */
export interface ProjectListOptions {
  /** Filter options */
  filter?: ProjectFilter;
  /** Sort field */
  sortBy?: ProjectSortBy;
  /** Sort order */
  sortOrder?: ProjectSortOrder;
}

/**
 * Project event types
 */
export type ProjectEventType =
  | 'projectCreated'
  | 'projectUpdated'
  | 'projectDeleted'
  | 'projectOpened'
  | 'projectClosed';

/**
 * Project event interface
 * Represents state change events emitted by the project manager
 */
export interface ProjectEvent {
  /** Event type */
  type: ProjectEventType;
  /** The project that triggered the event (metadata only for list updates) */
  project: ProjectMetadata;
  /** Timestamp when the event occurred */
  timestamp: number;
}

/**
 * Project manager state interface
 * Represents the complete state of the project management system
 */
export interface ProjectManagerState {
  /** Currently open project (null if none) */
  currentProject: Project | null;
  /** List of all project metadata */
  projectList: ProjectMetadata[];
  /** Whether the manager is loading data */
  isLoading: boolean;
  /** Current error (if any) */
  error: string | null;
}

/**
 * Board change data interface
 * Used for auto-save and data persistence
 */
export interface BoardChangeData {
  /** Board elements */
  children: PlaitElement[];
  /** Viewport state */
  viewport?: Viewport;
  /** Theme configuration */
  theme?: PlaitTheme;
}

/**
 * Project export data interface
 * Format for exported .drawnix files
 */
export interface ProjectExportData {
  /** Export format type */
  type: 'drawnix-project';
  /** Export version */
  version: number;
  /** Export source */
  source: 'web';
  /** Project metadata */
  metadata: Omit<ProjectMetadata, 'thumbnail'>;
  /** Board elements */
  elements: PlaitElement[];
  /** Viewport state */
  viewport?: Viewport;
  /** Theme configuration */
  theme?: PlaitTheme;
  /** Project settings */
  settings?: ProjectSettings;
}
