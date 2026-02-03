/**
 * Debug Storage Reader
 * 直接从 IndexedDB 和 Cache Storage 读取调试数据
 * 避免通过 postMessage RPC 间接读取，提高稳定性和性能
 */

// ============================================================================
// IndexedDB 配置常量
// ============================================================================

// 控制台日志数据库
const CONSOLE_LOG_DB_NAME = 'ConsoleLogDB';
const CONSOLE_LOG_DB_VERSION = 1;
const CONSOLE_LOG_STORE = 'logs';
const CONSOLE_LOG_RETENTION_DAYS = 7;

// LLM API 日志数据库
const LLM_API_LOG_DB_NAME = 'llm-api-logs';
const LLM_API_LOG_DB_VERSION = 4;
const LLM_API_LOG_STORE = 'logs';

// 崩溃快照数据库
const CRASH_SNAPSHOT_DB_NAME = 'MemorySnapshotDB';
const CRASH_SNAPSHOT_DB_VERSION = 1;
const CRASH_SNAPSHOT_STORE = 'snapshots';

// Cache Storage 名称
const CACHE_NAMES = [
  'drawnix-images',
  'drawnix-images-thumb',
  'drawnix-assets',
  'drawnix-cdn-v1',
];

// ============================================================================
// 通用 IndexedDB 操作
// ============================================================================

/**
 * 打开 IndexedDB 数据库
 * @param {string} dbName 
 * @param {number} version 
 * @param {function} onUpgradeNeeded 
 * @returns {Promise<IDBDatabase>}
 */
function openDB(dbName, version, onUpgradeNeeded) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    if (onUpgradeNeeded) {
      request.onupgradeneeded = onUpgradeNeeded;
    }
  });
}

// ============================================================================
// 控制台日志读取
// ============================================================================

/**
 * 直接从 IndexedDB 读取控制台日志
 * @param {number} limit 最大返回条数
 * @param {Object} filter 过滤条件
 * @returns {Promise<{logs: Array, total: number, offset: number, limit: number}>}
 */
export async function getConsoleLogsDirect(limit = 500, filter = {}) {
  try {
    const db = await openDB(CONSOLE_LOG_DB_NAME, CONSOLE_LOG_DB_VERSION, (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(CONSOLE_LOG_STORE)) {
        const store = db.createObjectStore(CONSOLE_LOG_STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('logLevel', 'logLevel', { unique: false });
      }
    });
    
    const transaction = db.transaction([CONSOLE_LOG_STORE], 'readonly');
    const store = transaction.objectStore(CONSOLE_LOG_STORE);
    const index = store.index('timestamp');
    const expirationTime = Date.now() - CONSOLE_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev'); // 按时间倒序
      const logs = [];
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const entry = cursor.value;
          // 只返回 7 天内的日志
          if (entry.timestamp >= expirationTime) {
            // 应用过滤器
            let include = true;
            if (filter.logLevel && entry.logLevel !== filter.logLevel) {
              include = false;
            }
            if (filter.search) {
              const search = filter.search.toLowerCase();
              if (!entry.logMessage?.toLowerCase().includes(search) &&
                  !entry.logStack?.toLowerCase().includes(search)) {
                include = false;
              }
            }
            if (include) {
              logs.push(entry);
            }
          }
          cursor.continue();
        } else {
          db.close();
          const total = logs.length;
          const paginatedLogs = logs.slice(0, limit);
          resolve({ logs: paginatedLogs, total, offset: 0, limit });
        }
      };
      
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn('[DebugStorageReader] Failed to read console logs:', error);
    return { logs: [], total: 0, offset: 0, limit };
  }
}

// ============================================================================
// LLM API 日志读取
// ============================================================================

/**
 * 直接从 IndexedDB 读取 LLM API 日志（分页）
 * @param {number} page 页码（从 1 开始）
 * @param {number} pageSize 每页条数
 * @param {Object} filter 过滤条件 { taskType?, status? }
 * @returns {Promise<{logs: Array, total: number, page: number, pageSize: number, totalPages: number}>}
 */
export async function getLLMApiLogsDirect(page = 1, pageSize = 20, filter = {}) {
  try {
    const db = await openDB(LLM_API_LOG_DB_NAME, LLM_API_LOG_DB_VERSION, (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(LLM_API_LOG_STORE)) {
        const store = db.createObjectStore(LLM_API_LOG_STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('taskType', 'taskType', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('taskId', 'taskId', { unique: false });
      }
    });
    
    const transaction = db.transaction([LLM_API_LOG_STORE], 'readonly');
    const store = transaction.objectStore(LLM_API_LOG_STORE);
    const index = store.index('timestamp');
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev'); // 按时间倒序
      const allLogs = [];
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const log = cursor.value;
          // 应用过滤器
          let include = true;
          if (filter.taskType && log.taskType !== filter.taskType) {
            include = false;
          }
          if (filter.status && log.status !== filter.status) {
            include = false;
          }
          if (include) {
            // 精简数据，去掉大字段
            allLogs.push({
              id: log.id,
              timestamp: log.timestamp,
              endpoint: log.endpoint,
              model: log.model,
              taskType: log.taskType,
              prompt: log.prompt,
              status: log.status,
              httpStatus: log.httpStatus,
              duration: log.duration,
              resultType: log.resultType,
              resultCount: log.resultCount,
              resultUrl: log.resultUrl,
              errorMessage: log.errorMessage,
              remoteId: log.remoteId,
              taskId: log.taskId,
              workflowId: log.workflowId,
              hasReferenceImages: log.hasReferenceImages,
              referenceImageCount: log.referenceImageCount,
              // 不包含 requestBody、responseBody 等大字段
            });
          }
          cursor.continue();
        } else {
          db.close();
          const total = allLogs.length;
          const totalPages = Math.ceil(total / pageSize);
          const startIndex = (page - 1) * pageSize;
          const logs = allLogs.slice(startIndex, startIndex + pageSize);
          resolve({ logs, total, page, pageSize, totalPages });
        }
      };
      
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn('[DebugStorageReader] Failed to read LLM API logs:', error);
    return { logs: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
  }
}

/**
 * 直接从 IndexedDB 读取单条 LLM API 日志（包含完整数据）
 * @param {string} logId 日志 ID
 * @returns {Promise<Object|null>}
 */
export async function getLLMApiLogByIdDirect(logId) {
  try {
    const db = await openDB(LLM_API_LOG_DB_NAME, LLM_API_LOG_DB_VERSION);
    const transaction = db.transaction([LLM_API_LOG_STORE], 'readonly');
    const store = transaction.objectStore(LLM_API_LOG_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.get(logId);
      
      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };
      
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn('[DebugStorageReader] Failed to read LLM API log by ID:', error);
    return null;
  }
}

// ============================================================================
// 崩溃快照读取
// ============================================================================

/**
 * 直接从 IndexedDB 读取崩溃快照
 * @returns {Promise<{snapshots: Array, total: number}>}
 */
export async function getCrashSnapshotsDirect() {
  try {
    const db = await openDB(CRASH_SNAPSHOT_DB_NAME, CRASH_SNAPSHOT_DB_VERSION, (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(CRASH_SNAPSHOT_STORE)) {
        const store = db.createObjectStore(CRASH_SNAPSHOT_STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
    });
    
    const transaction = db.transaction([CRASH_SNAPSHOT_STORE], 'readonly');
    const store = transaction.objectStore(CRASH_SNAPSHOT_STORE);
    const index = store.index('timestamp');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll();
      
      request.onsuccess = () => {
        db.close();
        // 按时间倒序排列
        const snapshots = (request.result || []).sort((a, b) => b.timestamp - a.timestamp);
        resolve({ snapshots, total: snapshots.length });
      };
      
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch (error) {
    console.warn('[DebugStorageReader] Failed to read crash snapshots:', error);
    return { snapshots: [], total: 0 };
  }
}

// ============================================================================
// Cache Storage 统计
// ============================================================================

/**
 * 直接从 Cache Storage 读取缓存统计
 * @returns {Promise<{stats: Object}>}
 */
export async function getCacheStatsDirect() {
  try {
    const stats = {
      caches: [],
      totalSize: 0,
      totalEntries: 0,
    };
    
    for (const cacheName of CACHE_NAMES) {
      try {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        
        let cacheSize = 0;
        for (const request of keys) {
          try {
            const response = await cache.match(request);
            if (response) {
              const blob = await response.clone().blob();
              cacheSize += blob.size;
            }
          } catch {
            // 忽略单个条目的错误
          }
        }
        
        stats.caches.push({
          name: cacheName,
          entries: keys.length,
          size: cacheSize,
        });
        
        stats.totalEntries += keys.length;
        stats.totalSize += cacheSize;
      } catch {
        // 缓存不存在，跳过
        stats.caches.push({
          name: cacheName,
          entries: 0,
          size: 0,
          error: 'Cache not found',
        });
      }
    }
    
    return { stats };
  } catch (error) {
    console.warn('[DebugStorageReader] Failed to get cache stats:', error);
    return {
      stats: {
        caches: [],
        totalSize: 0,
        totalEntries: 0,
        error: String(error),
      },
    };
  }
}

/**
 * 获取缓存条目列表
 * @param {string} cacheName 缓存名称
 * @param {number} limit 最大返回条数
 * @returns {Promise<{entries: Array, total: number}>}
 */
export async function getCacheEntriesDirect(cacheName, limit = 100) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    
    const entries = [];
    for (let i = 0; i < Math.min(keys.length, limit); i++) {
      const request = keys[i];
      try {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.clone().blob();
          entries.push({
            url: request.url,
            size: blob.size,
            type: response.headers.get('content-type') || 'unknown',
          });
        }
      } catch {
        entries.push({
          url: request.url,
          size: 0,
          type: 'error',
        });
      }
    }
    
    return { entries, total: keys.length };
  } catch (error) {
    console.warn('[DebugStorageReader] Failed to get cache entries:', error);
    return { entries: [], total: 0, error: String(error) };
  }
}

// ============================================================================
// 导出日志数据
// ============================================================================

/**
 * 导出所有日志数据（用于调试导出功能）
 * @returns {Promise<Object>}
 */
export async function exportLogsDirect() {
  try {
    const [consoleLogs, crashSnapshots, cacheStats] = await Promise.all([
      getConsoleLogsDirect(10000),
      getCrashSnapshotsDirect(),
      getCacheStatsDirect(),
    ]);
    
    // LLM API 日志可能很大，只导出最近 500 条
    const llmLogs = await getLLMApiLogsDirect(1, 500);
    
    return {
      exportTime: new Date().toISOString(),
      consoleLogs: consoleLogs.logs,
      crashSnapshots: crashSnapshots.snapshots,
      llmApiLogs: llmLogs.logs,
      cacheStats: cacheStats.stats,
    };
  } catch (error) {
    console.warn('[DebugStorageReader] Failed to export logs:', error);
    return {
      exportTime: new Date().toISOString(),
      error: String(error),
    };
  }
}
