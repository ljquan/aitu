/**
 * Workspace Data Migration Service
 *
 * Handles migration from legacy storage formats to the new workspace format.
 */

import localforage from 'localforage';
import { PlaitElement, PlaitTheme, Viewport } from '@plait/core';
import { WorkspaceService } from './workspace-service';
import { workspaceStorageService } from './workspace-storage-service';
import { DRAWNIX_STORE_NAME, OLD_DRAWNIX_LOCAL_DATA_KEY } from '../constants/storage';

// Legacy storage keys
const LEGACY_MAIN_BOARD_KEY = 'main_board_content';

// Legacy data structure
interface LegacyBoardData {
  children: PlaitElement[];
  viewport?: Viewport;
  theme?: PlaitTheme;
}

// Configure legacy storage (for reading old data)
const legacyStore = localforage.createInstance({
  name: 'Drawnix',
  storeName: DRAWNIX_STORE_NAME,
  driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
});

/**
 * Check if workspace migration has been completed
 * Uses workspace storage to ensure consistency
 */
export async function isWorkspaceMigrationCompleted(): Promise<boolean> {
  try {
    // Check in workspace state storage for migration flag
    const state = await workspaceStorageService.loadState();
    return state?.migrationCompleted === true;
  } catch (error) {
    console.error('[WorkspaceMigration] Failed to check migration status:', error);
    return false;
  }
}

/**
 * Mark workspace migration as completed
 */
async function markMigrationCompleted(): Promise<void> {
  try {
    const state = await workspaceStorageService.loadState();
    state.migrationCompleted = true;
    await workspaceStorageService.saveState(state);
  } catch (error) {
    console.error('[WorkspaceMigration] Failed to mark migration completed:', error);
  }
}

/**
 * Get legacy board data from old storage
 */
async function getLegacyBoardData(): Promise<LegacyBoardData | null> {
  try {
    // Try IndexedDB format first
    const newData = await legacyStore.getItem<LegacyBoardData>(LEGACY_MAIN_BOARD_KEY);
    if (newData && newData.children && newData.children.length > 0) {
      // console.log('[WorkspaceMigration] Found legacy data in IndexedDB');
      return newData;
    }

    // Try old localStorage format
    const oldDataString = localStorage.getItem(OLD_DRAWNIX_LOCAL_DATA_KEY);
    if (oldDataString) {
      const oldData = JSON.parse(oldDataString);
      if (Array.isArray(oldData) && oldData.length > 0) {
        // console.log('[WorkspaceMigration] Found legacy data in localStorage');
        return { children: oldData };
      }
    }

    return null;
  } catch (error) {
    console.error('[WorkspaceMigration] Failed to get legacy data:', error);
    return null;
  }
}

/**
 * Migrate legacy data to workspace format
 * Returns the created branch ID if migration was successful
 */
export async function migrateToWorkspace(): Promise<string | null> {
  try {
    // Check if already migrated
    const migrated = await isWorkspaceMigrationCompleted();
    if (migrated) {
      // console.log('[WorkspaceMigration] Already migrated, skipping');
      return null;
    }

    // Get legacy data
    const legacyData = await getLegacyBoardData();
    if (!legacyData || !legacyData.children || legacyData.children.length === 0) {
      // console.log('[WorkspaceMigration] No legacy data to migrate');
      await markMigrationCompleted();
      return null;
    }

    // console.log('[WorkspaceMigration] Found legacy data, migrating...', legacyData.children.length, 'elements');

    // Initialize workspace service
    const workspaceService = WorkspaceService.getInstance();
    await workspaceService.initialize();

    // Create a board for migrated data (using createBoard instead of createProject)
    const board = await workspaceService.createBoard({
      name: '迁移的画板',
      elements: legacyData.children,
      viewport: legacyData.viewport,
      theme: legacyData.theme,
    });

    if (!board) {
      console.error('[WorkspaceMigration] Failed to create board');
      return null;
    }

    // Switch to the newly created board
    await workspaceService.switchBoard(board.id);

    // Mark migration as completed
    await markMigrationCompleted();

    // Clear legacy data to prevent duplicate migrations
    await clearLegacyData();

    // console.log('[WorkspaceMigration] Migration completed, board:', board.id);
    return board.id;
  } catch (error) {
    console.error('[WorkspaceMigration] Migration failed:', error);
    return null;
  }
}

/**
 * Clear legacy data after successful migration
 * Call this only when you're sure the migration was successful
 */
export async function clearLegacyData(): Promise<void> {
  try {
    await legacyStore.removeItem(LEGACY_MAIN_BOARD_KEY);
    localStorage.removeItem(OLD_DRAWNIX_LOCAL_DATA_KEY);
    // console.log('[WorkspaceMigration] Legacy data cleared');
  } catch (error) {
    console.error('[WorkspaceMigration] Failed to clear legacy data:', error);
  }
}
