/**
 * Database Cleanup Service
 *
 * Cleans up legacy/redundant IndexedDB databases and LocalStorage data
 * that are no longer needed. This service runs once on app startup and
 * removes old data after migration to new storage locations.
 *
 * Legacy databases to clean:
 * - Drawnix: Old localforage default database
 * - drawnix: Old board data (migrated to aitu-workspace)
 * - localforage: localforage default database
 * - aitu-task-queue: Old task queue (migrated to sw-task-queue)
 * - aitu-media-cache: Old media cache (migrated to drawnix-unified-cache)
 * - aitu-url-cache: Old URL cache (migrated to drawnix-unified-cache)
 *
 * Legacy LocalStorage keys to clean:
 * - aitu-recent-colors-shadow: Orphaned data
 */

import {
  LS_KEYS,
  LS_KEYS_DEPRECATED,
  IDB_LEGACY_DATABASES,
} from '../constants/storage-keys';

// Storage key to track if cleanup has been performed
const CLEANUP_DONE_KEY = LS_KEYS.DB_CLEANUP_DONE;

// List of legacy databases to delete (use from constants)
const LEGACY_DATABASES = [...IDB_LEGACY_DATABASES];

/**
 * Check if a database exists
 */
async function checkDBExists(dbName: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(dbName);
      let existed = false;

      request.onupgradeneeded = () => {
        // Database didn't exist, was just created
        existed = false;
      };

      request.onsuccess = () => {
        const db = request.result;
        // Check if it has any object stores (empty DB means it was just created)
        existed = db.objectStoreNames.length > 0;
        db.close();

        // If we just created an empty DB, delete it
        if (!existed) {
          indexedDB.deleteDatabase(dbName);
        }

        resolve(existed);
      };

      request.onerror = () => {
        resolve(false);
      };
    } catch {
      resolve(false);
    }
  });
}

/**
 * Delete a database
 */
async function deleteDatabase(dbName: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(dbName);

      request.onsuccess = () => {
        // console.log(`[DBCleanup] Deleted database: ${dbName}`);
        resolve(true);
      };

      request.onerror = () => {
        console.warn(`[DBCleanup] Failed to delete database: ${dbName}`);
        resolve(false);
      };

      request.onblocked = () => {
        console.warn(`[DBCleanup] Database deletion blocked: ${dbName}`);
        resolve(false);
      };
    } catch {
      resolve(false);
    }
  });
}

/**
 * Clean up deprecated LocalStorage keys
 */
function cleanupDeprecatedLocalStorage(): number {
  let cleanedCount = 0;

  for (const key of LS_KEYS_DEPRECATED) {
    try {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        cleanedCount++;
      }
    } catch (error) {
      console.warn(`[DBCleanup] Failed to remove LocalStorage key ${key}:`, error);
    }
  }

  return cleanedCount;
}

/**
 * Run database cleanup
 * This should be called once on app startup
 */
export async function runDatabaseCleanup(): Promise<void> {
  // Check if cleanup has already been done
  if (localStorage.getItem(CLEANUP_DONE_KEY)) {
    return;
  }

  // console.log('[DBCleanup] Starting legacy database cleanup...');

  let deletedCount = 0;
  let skippedCount = 0;

  // Clean up legacy IndexedDB databases
  for (const dbName of LEGACY_DATABASES) {
    try {
      const exists = await checkDBExists(dbName);

      if (exists) {
        const deleted = await deleteDatabase(dbName);
        if (deleted) {
          deletedCount++;
        } else {
          skippedCount++;
        }
      }
    } catch (error) {
      console.warn(`[DBCleanup] Error processing database ${dbName}:`, error);
      skippedCount++;
    }
  }

  // Clean up deprecated LocalStorage keys
  const lsCleanedCount = cleanupDeprecatedLocalStorage();

  // Mark cleanup as done
  localStorage.setItem(CLEANUP_DONE_KEY, Date.now().toString());

  if (deletedCount > 0 || skippedCount > 0 || lsCleanedCount > 0) {
    // console.log(`[DBCleanup] Cleanup complete: IDB deleted ${deletedCount}, IDB skipped ${skippedCount}, LS cleaned ${lsCleanedCount}`);
  } else {
    // console.log('[DBCleanup] No legacy data found');
  }
}

/**
 * Force re-run cleanup (for debugging)
 */
export function resetCleanupFlag(): void {
  localStorage.removeItem(CLEANUP_DONE_KEY);
  // console.log('[DBCleanup] Cleanup flag reset, will run on next startup');
}

// Export for debugging
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__dbCleanup = {
    run: runDatabaseCleanup,
    reset: resetCleanupFlag,
    checkDB: checkDBExists,
    deleteDB: deleteDatabase,
    cleanupLS: cleanupDeprecatedLocalStorage,
    LEGACY_DATABASES,
    LS_KEYS_DEPRECATED,
  };
}
