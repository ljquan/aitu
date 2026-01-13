/**
 * Database Cleanup Service
 *
 * Cleans up deprecated LocalStorage data that is no longer needed.
 * This service runs once on app startup.
 *
 * Note: IndexedDB database cleanup has been removed as it's a dangerous operation.
 * Data migration is handled by individual services (e.g., useTaskStorage, asset-storage-service).
 *
 * Legacy LocalStorage keys to clean:
 * - aitu-recent-colors-shadow: Orphaned data
 */

import {
  LS_KEYS,
  LS_KEYS_DEPRECATED,
} from '../constants/storage-keys';

// Storage key to track if cleanup has been performed
const CLEANUP_DONE_KEY = LS_KEYS.DB_CLEANUP_DONE;

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

  // Clean up deprecated LocalStorage keys
  const lsCleanedCount = cleanupDeprecatedLocalStorage();

  // Mark cleanup as done
  localStorage.setItem(CLEANUP_DONE_KEY, Date.now().toString());

  if (lsCleanedCount > 0) {
    // console.log(`[DBCleanup] Cleanup complete: LS cleaned ${lsCleanedCount}`);
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
    cleanupLS: cleanupDeprecatedLocalStorage,
    LS_KEYS_DEPRECATED,
  };
}
