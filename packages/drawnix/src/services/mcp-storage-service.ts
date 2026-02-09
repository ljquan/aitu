/**
 * MCP Storage Service
 * 
 * Stores MCP-related data to IndexedDB (aitu-app database).
 * 主线程专用数据库，不再与 SW 共享。
 */

import { getAppDB, APP_DB_STORES } from './app-database';

const CONFIG_STORE = APP_DB_STORES.CONFIG;

/**
 * Get IndexedDB connection
 */
async function getDB(): Promise<IDBDatabase> {
  return getAppDB();
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

      transaction.oncomplete = () => resolve();
      
      transaction.onerror = () => reject(transaction.error);
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

      request.onsuccess = () => resolve(!!request.result?.value);
      
      request.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}
