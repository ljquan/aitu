/**
 * Database Cleanup Service
 *
 * Cleans up legacy/redundant IndexedDB databases that are no longer needed.
 * This service runs once on app startup and removes old databases after
 * data has been migrated to new storage locations.
 *
 * Legacy databases to clean:
 * - Drawnix: Old localforage default database
 * - drawnix: Old board data (migrated to aitu-workspace)
 * - localforage: localforage default database
 * - aitu-task-queue: Old task queue (migrated to sw-task-queue)
 * - aitu-media-cache: Old media cache (migrated to drawnix-unified-cache)
 * - aitu-url-cache: Old URL cache (migrated to drawnix-unified-cache)
 */

// Storage key to track if cleanup has been performed
const CLEANUP_DONE_KEY = 'db-cleanup-v1-done';

// List of legacy databases to delete
const LEGACY_DATABASES = [
  'Drawnix',           // Old localforage default
  'drawnix',           // Old board data
  'localforage',       // localforage default
  'aitu-task-queue',   // Old task queue (migrated to sw-task-queue)
  'aitu-media-cache',  // Old media cache (migrated to unified-cache)
  'aitu-url-cache',    // Old URL cache (migrated to unified-cache)
];

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

  // Mark cleanup as done
  localStorage.setItem(CLEANUP_DONE_KEY, Date.now().toString());

  if (deletedCount > 0 || skippedCount > 0) {
    // console.log(`[DBCleanup] Cleanup complete: deleted ${deletedCount}, skipped ${skippedCount}`);
  } else {
    // console.log('[DBCleanup] No legacy databases found');
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
  (window as any).__dbCleanup = {
    run: runDatabaseCleanup,
    reset: resetCleanupFlag,
    checkDB: checkDBExists,
    deleteDB: deleteDatabase,
    LEGACY_DATABASES,
  };
}
