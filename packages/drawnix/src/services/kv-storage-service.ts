/**
 * Key-Value Storage Service
 *
 * 基于 IndexedDB 的通用键值存储服务
 * 用于替代 LocalStorage 存储有增量风险的数据
 */

import { IDB_DATABASES } from '../constants/storage-keys';

const DB_CONFIG = IDB_DATABASES.KEY_VALUE_STORE;

interface StoredItem<T = unknown> {
  key: string;
  value: T;
  updatedAt: number;
}

/**
 * 打开数据库连接
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_CONFIG.NAME, DB_CONFIG.VERSION);

    request.onerror = () => {
      console.error('[KVStorage] Failed to open database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 创建 data store
      if (!db.objectStoreNames.contains(DB_CONFIG.STORES.DATA)) {
        const store = db.createObjectStore(DB_CONFIG.STORES.DATA, {
          keyPath: 'key',
        });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });
}

/**
 * 获取存储的值
 */
async function get<T>(key: string): Promise<T | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_CONFIG.STORES.DATA, 'readonly');
      const store = transaction.objectStore(DB_CONFIG.STORES.DATA);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result as StoredItem<T> | undefined;
        resolve(result?.value ?? null);
      };

      request.onerror = () => {
        console.error('[KVStorage] Failed to get:', key, request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('[KVStorage] Get error:', error);
    return null;
  }
}

/**
 * 设置存储的值
 */
async function set<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_CONFIG.STORES.DATA, 'readwrite');
      const store = transaction.objectStore(DB_CONFIG.STORES.DATA);

      const item: StoredItem<T> = {
        key,
        value,
        updatedAt: Date.now(),
      };

      const request = store.put(item);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error('[KVStorage] Failed to set:', key, request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('[KVStorage] Set error:', error);
    throw error;
  }
}

/**
 * 删除存储的值
 */
async function remove(key: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_CONFIG.STORES.DATA, 'readwrite');
      const store = transaction.objectStore(DB_CONFIG.STORES.DATA);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error('[KVStorage] Failed to remove:', key, request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('[KVStorage] Remove error:', error);
    throw error;
  }
}

/**
 * 获取所有键
 */
async function keys(): Promise<string[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_CONFIG.STORES.DATA, 'readonly');
      const store = transaction.objectStore(DB_CONFIG.STORES.DATA);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        resolve(request.result as string[]);
      };

      request.onerror = () => {
        console.error('[KVStorage] Failed to get keys:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('[KVStorage] Keys error:', error);
    return [];
  }
}

/**
 * 清空所有数据
 */
async function clear(): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_CONFIG.STORES.DATA, 'readwrite');
      const store = transaction.objectStore(DB_CONFIG.STORES.DATA);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error('[KVStorage] Failed to clear:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('[KVStorage] Clear error:', error);
    throw error;
  }
}

/**
 * 检查 IndexedDB 是否可用
 */
function isAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * 批量设置多个值
 */
async function setMany(items: Array<{ key: string; value: unknown }>): Promise<void> {
  if (items.length === 0) return;

  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_CONFIG.STORES.DATA, 'readwrite');
      const store = transaction.objectStore(DB_CONFIG.STORES.DATA);
      const now = Date.now();

      for (const { key, value } of items) {
        const item: StoredItem = {
          key,
          value,
          updatedAt: now,
        };
        store.put(item);
      }

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };

      transaction.onerror = () => {
        console.error('[KVStorage] Failed to setMany:', transaction.error);
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('[KVStorage] SetMany error:', error);
    throw error;
  }
}

/**
 * 批量获取多个值
 */
async function getMany<T = unknown>(
  keyList: string[]
): Promise<Map<string, T | null>> {
  const result = new Map<string, T | null>();

  if (keyList.length === 0) return result;

  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_CONFIG.STORES.DATA, 'readonly');
      const store = transaction.objectStore(DB_CONFIG.STORES.DATA);

      for (const key of keyList) {
        const request = store.get(key);
        request.onsuccess = () => {
          const item = request.result as StoredItem<T> | undefined;
          result.set(key, item?.value ?? null);
        };
      }

      transaction.oncomplete = () => {
        db.close();
        resolve(result);
      };

      transaction.onerror = () => {
        console.error('[KVStorage] Failed to getMany:', transaction.error);
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('[KVStorage] GetMany error:', error);
    // 返回空结果
    for (const key of keyList) {
      result.set(key, null);
    }
    return result;
  }
}

/**
 * Key-Value 存储服务
 */
export const kvStorageService = {
  get,
  set,
  remove,
  keys,
  clear,
  isAvailable,
  setMany,
  getMany,
};

export default kvStorageService;
