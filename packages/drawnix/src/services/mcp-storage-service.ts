/**
 * MCP Storage Service
 * 
 * Stores MCP-related data to IndexedDB for Service Worker to access.
 * Main thread and SW share the same IndexedDB, so data written here
 * can be read by SW without postMessage communication.
 */

const DB_NAME = 'sw-task-queue';
const CONFIG_STORE = 'config';

/**
 * Get or create IndexedDB connection
 */
async function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    
    request.onerror = () => {
      console.error('[MCPStorage] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

/**
 * Save MCP system prompt to IndexedDB
 * This will be read by SW during AI analysis
 */
export async function saveMCPSystemPrompt(systemPrompt: string): Promise<void> {
  try {
    const db = await getDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(CONFIG_STORE, 'readwrite');
      const store = transaction.objectStore(CONFIG_STORE);
      
      store.put({
        key: 'systemPrompt',
        value: systemPrompt,
        updatedAt: Date.now(),
      });

      transaction.oncomplete = () => {
        console.log('[MCPStorage] System prompt saved to IndexedDB');
        db.close();
        resolve();
      };
      
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('[MCPStorage] Failed to save system prompt:', error);
    throw error;
  }
}

/**
 * Check if system prompt exists in IndexedDB
 */
export async function hasMCPSystemPrompt(): Promise<boolean> {
  try {
    const db = await getDB();
    
    return new Promise((resolve) => {
      const transaction = db.transaction(CONFIG_STORE, 'readonly');
      const store = transaction.objectStore(CONFIG_STORE);
      const request = store.get('systemPrompt');

      request.onsuccess = () => {
        db.close();
        resolve(!!request.result?.value);
      };
      
      request.onerror = () => {
        db.close();
        resolve(false);
      };
    });
  } catch {
    return false;
  }
}
