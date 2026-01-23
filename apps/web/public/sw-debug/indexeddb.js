/**
 * SW Debug Panel - IndexedDB Operations
 * IndexedDB 数据库操作函数
 */

/**
 * IndexedDB 存储名称常量（与应用层 storage-keys.ts 保持一致）
 */
export const IDB_STORES = {
  // 工作区数据（文件夹、画板）
  WORKSPACE: {
    name: 'aitu-workspace',
    stores: {
      FOLDERS: 'folders',
      BOARDS: 'boards',
      STATE: 'state',
    },
  },
  // 通用键值存储（提示词等）
  KV: {
    name: 'aitu-storage',
    store: 'data',
  },
  // 素材库元数据
  ASSETS: {
    name: 'aitu-assets',
    store: 'assets',
  },
  // 统一缓存（AI 生成的媒体元数据）
  UNIFIED_CACHE: {
    name: 'drawnix-unified-cache',
    store: 'media',
  },
};

/**
 * KV 存储中的关键 key（与应用层 LS_KEYS_TO_MIGRATE 保持一致）
 */
export const KV_KEYS = {
  PROMPT_HISTORY: 'aitu_prompt_history',
  VIDEO_PROMPT_HISTORY: 'aitu_video_prompt_history',
  IMAGE_PROMPT_HISTORY: 'aitu_image_prompt_history',
  PRESET_SETTINGS: 'aitu-prompt-preset-settings',
};

/**
 * Cache Storage 名称
 */
export const CACHE_NAMES = {
  IMAGES: 'drawnix-images',
};

/**
 * 任务队列数据库配置
 */
export const SW_TASK_QUEUE_DB = {
  name: 'sw-task-queue',
  stores: {
    TASKS: 'tasks',
  },
};

/**
 * 任务类型和状态常量（与 SW 中的枚举值保持一致，是小写）
 */
export const TaskType = {
  IMAGE: 'image',
  VIDEO: 'video',
};

export const TaskStatus = {
  COMPLETED: 'completed',
};

/**
 * 打开 IndexedDB 数据库
 */
export function openIDB(dbName, storeName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        resolve(null);
        return;
      }
      resolve(db);
    };
  });
}

/**
 * 从 IndexedDB 读取所有数据
 */
export async function readAllFromIDB(dbName, storeName) {
  try {
    const db = await openIDB(dbName, storeName);
    if (!db) return [];
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
      request.onsuccess = () => {
        db.close();
        resolve(request.result || []);
      };
    });
  } catch (error) {
    return [];
  }
}

/**
 * 从 IndexedDB KV 存储读取指定 key
 */
export async function readKVItem(key) {
  const db = await openIDB(IDB_STORES.KV.name, IDB_STORES.KV.store);
  if (!db) return null;
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IDB_STORES.KV.store, 'readonly');
    const store = transaction.objectStore(IDB_STORES.KV.store);
    const request = store.get(key);
    
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      db.close();
      const result = request.result;
      resolve(result?.value || null);
    };
  });
}
