/**
 * Project Migration Utility
 *
 * Handles migration of existing single-board data to the new multi-project system.
 * This ensures backward compatibility with existing user data.
 */

import localforage from 'localforage';
import { PlaitElement, PlaitTheme, Viewport } from '@plait/core';
import { projectManagerService } from '../services/project-manager-service';
import { projectStorageService } from '../services/project-storage-service';
import {
  PROJECT_DEFAULTS,
  PROJECT_STORAGE_KEYS,
} from '../constants/PROJECT_CONSTANTS';
import { OLD_DRAWNIX_LOCAL_DATA_KEY, DRAWNIX_STORE_NAME } from '../constants/storage';

/**
 * Old board data structure (single project)
 */
interface LegacyBoardData {
  children: PlaitElement[];
  viewport?: Viewport;
  theme?: PlaitTheme;
}

/**
 * Storage key for old single-board data
 */
const LEGACY_MAIN_BOARD_KEY = 'main_board_content';

/**
 * Checks if migration has already been completed
 */
export async function isMigrationCompleted(): Promise<boolean> {
  const migrated = localStorage.getItem(PROJECT_STORAGE_KEYS.MIGRATION_COMPLETED);
  return migrated === 'true';
}

/**
 * Marks migration as completed
 */
export function markMigrationCompleted(): void {
  localStorage.setItem(PROJECT_STORAGE_KEYS.MIGRATION_COMPLETED, 'true');
}

/**
 * Gets the legacy board data from old storage
 */
async function getLegacyBoardData(): Promise<LegacyBoardData | null> {
  try {
    // Initialize legacy localforage instance
    const legacyStore = localforage.createInstance({
      name: 'Drawnix',
      storeName: DRAWNIX_STORE_NAME,
      driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
    });

    await legacyStore.ready();

    // Try to get data from IndexedDB first
    const data = await legacyStore.getItem<LegacyBoardData>(LEGACY_MAIN_BOARD_KEY);
    if (data) {
      return data;
    }

    // Try localStorage fallback (old format)
    const localData = localStorage.getItem(OLD_DRAWNIX_LOCAL_DATA_KEY);
    if (localData) {
      try {
        return JSON.parse(localData) as LegacyBoardData;
      } catch {
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error('[Migration] Failed to get legacy data:', error);
    return null;
  }
}

/**
 * Calculates approximate size of data in bytes
 */
function calculateDataSize(data: unknown): number {
  try {
    return new Blob([JSON.stringify(data)]).size;
  } catch {
    return 0;
  }
}

/**
 * Migrates legacy single-board data to a new project
 *
 * @returns The ID of the created project, or null if no migration needed
 */
export async function migrateLegacyData(): Promise<string | null> {
  // Check if already migrated
  if (await isMigrationCompleted()) {
    console.log('[Migration] Already completed, skipping');
    return null;
  }

  // Check if there are any existing projects
  await projectStorageService.initialize();
  const existingCount = await projectStorageService.getProjectCount();
  if (existingCount > 0) {
    console.log('[Migration] Projects already exist, marking as migrated');
    markMigrationCompleted();
    return null;
  }

  // Get legacy data
  const legacyData = await getLegacyBoardData();
  if (!legacyData || !legacyData.children || legacyData.children.length === 0) {
    console.log('[Migration] No legacy data found');
    markMigrationCompleted();
    return null;
  }

  console.log(
    `[Migration] Found legacy data with ${legacyData.children.length} elements`
  );

  try {
    // Create a new project from legacy data
    const project = await projectManagerService.createProject({
      name: PROJECT_DEFAULTS.MIGRATED_PROJECT_NAME,
      description: '从旧版本迁移的项目',
      elements: legacyData.children,
      viewport: legacyData.viewport,
      theme: legacyData.theme,
    });

    console.log(`[Migration] Created project ${project.id} from legacy data`);

    // Mark migration as completed
    markMigrationCompleted();

    // Note: We don't delete the old data for safety
    // Users can manually clean it up if needed

    return project.id;
  } catch (error) {
    console.error('[Migration] Failed to migrate data:', error);
    return null;
  }
}

/**
 * Clears legacy data after successful migration
 * Call this only when user explicitly confirms
 */
export async function clearLegacyData(): Promise<void> {
  try {
    const legacyStore = localforage.createInstance({
      name: 'Drawnix',
      storeName: DRAWNIX_STORE_NAME,
      driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
    });

    await legacyStore.ready();
    await legacyStore.removeItem(LEGACY_MAIN_BOARD_KEY);

    // Also clear localStorage fallback
    localStorage.removeItem(OLD_DRAWNIX_LOCAL_DATA_KEY);

    console.log('[Migration] Legacy data cleared');
  } catch (error) {
    console.error('[Migration] Failed to clear legacy data:', error);
  }
}

/**
 * Checks if there is legacy data that can be migrated
 */
export async function hasLegacyData(): Promise<boolean> {
  const data = await getLegacyBoardData();
  return data !== null && data.children && data.children.length > 0;
}

/**
 * Gets information about legacy data without migrating
 */
export async function getLegacyDataInfo(): Promise<{
  exists: boolean;
  elementCount: number;
  size: number;
} | null> {
  const data = await getLegacyBoardData();
  if (!data || !data.children) {
    return null;
  }

  return {
    exists: true,
    elementCount: data.children.length,
    size: calculateDataSize(data),
  };
}
