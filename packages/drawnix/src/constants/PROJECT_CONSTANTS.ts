/**
 * Project Management System Constants
 *
 * Centralized constant definitions for the project management system.
 * All database config, limits, and default values are defined here.
 */

/**
 * IndexedDB configuration for project storage
 */
export const PROJECT_DB_CONFIG = {
  /** Database name */
  DATABASE_NAME: 'aitu-projects',
  /** Database version */
  DATABASE_VERSION: 1,
  /** Object store names */
  STORES: {
    /** Store for complete project data */
    PROJECTS: 'projects',
    /** Store for project metadata (fast list loading) */
    METADATA: 'metadata',
  },
} as const;

/**
 * Storage keys for localStorage/sessionStorage
 */
export const PROJECT_STORAGE_KEYS = {
  /** Current project ID */
  CURRENT_PROJECT_ID: 'aitu_current_project_id',
  /** Project list view preference (grid/list) */
  VIEW_PREFERENCE: 'aitu_project_view_preference',
  /** Project sort preference */
  SORT_PREFERENCE: 'aitu_project_sort_preference',
  /** Migration completed flag */
  MIGRATION_COMPLETED: 'aitu_project_migration_completed',
} as const;

/**
 * Default project values
 */
export const PROJECT_DEFAULTS = {
  /** Default project name for new projects */
  DEFAULT_NAME: '未命名项目',
  /** Default name for migrated project */
  MIGRATED_PROJECT_NAME: '我的第一个项目',
  /** Default description */
  DEFAULT_DESCRIPTION: '',
  /** Maximum project name length */
  MAX_NAME_LENGTH: 100,
  /** Maximum description length */
  MAX_DESCRIPTION_LENGTH: 500,
} as const;

/**
 * Project list limits
 */
export const PROJECT_LIMITS = {
  /** Maximum number of projects allowed */
  MAX_PROJECTS: 100,
  /** Maximum number of tags per project */
  MAX_TAGS_PER_PROJECT: 10,
  /** Maximum tag length */
  MAX_TAG_LENGTH: 20,
  /** Thumbnail max width */
  THUMBNAIL_MAX_WIDTH: 400,
  /** Thumbnail max height */
  THUMBNAIL_MAX_HEIGHT: 300,
  /** Thumbnail quality (0-1) */
  THUMBNAIL_QUALITY: 0.7,
} as const;

/**
 * Auto-save configuration
 */
export const PROJECT_AUTO_SAVE = {
  /** Debounce delay for auto-save (ms) */
  DEBOUNCE_DELAY: 1000,
  /** Minimum interval between saves (ms) */
  MIN_SAVE_INTERVAL: 2000,
  /** Maximum delay before forced save (ms) */
  MAX_DELAY: 5000,
} as const;

/**
 * UI update intervals
 */
export const PROJECT_UI_INTERVALS = {
  /** List refresh interval (ms) */
  LIST_REFRESH: 1000,
  /** Thumbnail generation debounce (ms) */
  THUMBNAIL_DEBOUNCE: 500,
} as const;

/**
 * Project list default sorting
 */
export const PROJECT_DEFAULT_SORT = {
  /** Default sort field */
  SORT_BY: 'updatedAt' as const,
  /** Default sort order */
  SORT_ORDER: 'desc' as const,
} as const;

/**
 * Project export configuration
 */
export const PROJECT_EXPORT = {
  /** Current export version */
  VERSION: 1,
  /** File extension */
  EXTENSION: 'drawnix',
  /** MIME type */
  MIME_TYPE: 'application/json',
} as const;
