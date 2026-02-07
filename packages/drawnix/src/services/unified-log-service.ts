/**
 * 统一日志服务
 * 提供零性能影响的日志记录能力，支持多种日志类别
 */

// ====================================
// Types
// ====================================

export type LogCategory = 'fetch' | 'console' | 'postmessage' | 'llmapi' | 'crash' | 'sync';
export type LogLevel = 'debug' | 'info' | 'success' | 'warning' | 'error';

export interface UnifiedLogEntry {
  id: string;
  timestamp: number;
  category: LogCategory;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  sessionId?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LogCategoryConfig {
  memoryLimit: number;
  persistToDB: boolean;
  dbLimit?: number;
  retentionDays?: number;
  debugModeOnly?: boolean;
}

export interface LogQueryOptions {
  category?: LogCategory | LogCategory[];
  level?: LogLevel | LogLevel[];
  sessionId?: string;
  startTime?: number;
  endTime?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface LogStats {
  total: number;
  byCategory: Record<LogCategory, number>;
  byLevel: Record<LogLevel, number>;
  oldestEntry?: number;
  newestEntry?: number;
}

// ====================================
// Constants
// ====================================

const DB_NAME = 'aitu-unified-logs';
const DB_VERSION = 1;
const STORE_NAME = 'logs';

const BATCH_WRITE_INTERVAL = 500; // 500ms 批量间隔
const MAX_BATCH_SIZE = 100; // 单次最大写入条数

// 分类配置
const CATEGORY_CONFIGS: Record<LogCategory, LogCategoryConfig> = {
  fetch: {
    memoryLimit: 500,
    persistToDB: false,
    debugModeOnly: true,
  },
  console: {
    memoryLimit: 500,
    persistToDB: true,
    dbLimit: 5000,
    retentionDays: 7,
    debugModeOnly: false,
  },
  postmessage: {
    memoryLimit: 500,
    persistToDB: false,
    debugModeOnly: true,
  },
  llmapi: {
    memoryLimit: 50,
    persistToDB: true,
    dbLimit: 1000,
    retentionDays: 30,
    debugModeOnly: false,
  },
  crash: {
    memoryLimit: 50,
    persistToDB: true,
    dbLimit: 100,
    retentionDays: 30,
    debugModeOnly: false,
  },
  sync: {
    memoryLimit: 200,
    persistToDB: true,
    dbLimit: 5000,
    retentionDays: 7,
    debugModeOnly: false,
  },
};

// ====================================
// Unified Log Service
// ====================================

class UnifiedLogService {
  private buffer: UnifiedLogEntry[] = [];
  private memoryCache: Map<LogCategory, UnifiedLogEntry[]> = new Map();
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private db: IDBDatabase | null = null;
  private dbInitPromise: Promise<void> | null = null;
  private debugModeEnabled = false;
  private currentSessionId: string | null = null;

  constructor() {
    // 初始化内存缓存
    for (const category of Object.keys(CATEGORY_CONFIGS) as LogCategory[]) {
      this.memoryCache.set(category, []);
    }
  }

  // ====================================
  // 会话管理
  // ====================================

  /**
   * 开始新的日志会话
   */
  startSession(prefix = 'session'): string {
    this.currentSessionId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return this.currentSessionId;
  }

  /**
   * 获取当前会话 ID
   */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * 结束当前会话
   */
  endSession(): void {
    this.currentSessionId = null;
  }

  /**
   * 设置调试模式
   */
  setDebugMode(enabled: boolean): void {
    this.debugModeEnabled = enabled;
  }

  // ====================================
  // 核心日志方法
  // ====================================

  /**
   * 记录日志 - 零阻塞，fire-and-forget
   */
  log(
    category: LogCategory,
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    options?: {
      duration?: number;
      error?: Error;
      sessionId?: string;
    }
  ): void {
    // 条件检查
    if (!this.shouldLog(category, level)) {
      return;
    }

    const entry: UnifiedLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      timestamp: Date.now(),
      category,
      level,
      message,
      data: data ? this.sanitizeData(data) : undefined,
      sessionId: options?.sessionId || this.currentSessionId || undefined,
      duration: options?.duration,
    };

    if (options?.error) {
      entry.error = {
        name: options.error.name,
        message: options.error.message,
        stack: options.error.stack,
      };
    }

    // 同步写入内存缓存（微秒级）
    this.addToMemoryCache(entry);

    // 如果需要持久化，加入缓冲区
    const config = CATEGORY_CONFIGS[category];
    if (config.persistToDB) {
      this.buffer.push(entry);
      this.scheduleBatchWrite();
    }
  }

  /**
   * 快捷方法：记录 debug 日志
   */
  debug(category: LogCategory, message: string, data?: Record<string, unknown>): void {
    this.log(category, 'debug', message, data);
  }

  /**
   * 快捷方法：记录 info 日志
   */
  info(category: LogCategory, message: string, data?: Record<string, unknown>): void {
    this.log(category, 'info', message, data);
  }

  /**
   * 快捷方法：记录 success 日志
   */
  success(category: LogCategory, message: string, data?: Record<string, unknown>): void {
    this.log(category, 'success', message, data);
  }

  /**
   * 快捷方法：记录 warning 日志
   */
  warning(category: LogCategory, message: string, data?: Record<string, unknown>): void {
    this.log(category, 'warning', message, data);
  }

  /**
   * 快捷方法：记录 error 日志
   */
  error(category: LogCategory, message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log(category, 'error', message, data, { error });
  }

  // ====================================
  // 条件检查
  // ====================================

  private shouldLog(category: LogCategory, level: LogLevel): boolean {
    const config = CATEGORY_CONFIGS[category];

    // 调试模式关闭时，仅调试模式的类别不记录
    if (!this.debugModeEnabled && config.debugModeOnly) {
      return false;
    }

    // sync 类别：非调试模式下过滤掉 debug 级别（减少日志量）
    if (category === 'sync') {
      if (!this.debugModeEnabled && level === 'debug') {
        return false;
      }
      return true;
    }

    // 非调试模式下，仅记录 warning 及以上（除非是 success）
    if (!this.debugModeEnabled) {
      if (level === 'debug' || level === 'info') {
        return false;
      }
    }

    return true;
  }

  // ====================================
  // 内存缓存管理
  // ====================================

  private addToMemoryCache(entry: UnifiedLogEntry): void {
    const cache = this.memoryCache.get(entry.category);
    if (!cache) return;

    const config = CATEGORY_CONFIGS[entry.category];

    // 添加到头部
    cache.unshift(entry);

    // FIFO 清理
    while (cache.length > config.memoryLimit) {
      cache.pop();
    }
  }

  /**
   * 获取内存中的日志
   */
  getMemoryLogs(category?: LogCategory): UnifiedLogEntry[] {
    if (category) {
      return [...(this.memoryCache.get(category) || [])];
    }

    // 合并所有类别
    const allLogs: UnifiedLogEntry[] = [];
    for (const logs of this.memoryCache.values()) {
      allLogs.push(...logs);
    }
    return allLogs.sort((a, b) => b.timestamp - a.timestamp);
  }

  // ====================================
  // 批量写入
  // ====================================

  private scheduleBatchWrite(): void {
    if (this.writeTimer) return;

    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      const batch = this.buffer.splice(0, MAX_BATCH_SIZE);

      if (batch.length > 0) {
        // 异步写入，不阻塞后续日志
        this.flushToIndexedDB(batch).catch((err) => {
          console.warn('[UnifiedLog] Batch write failed:', err);
        });
      }

      // 如果还有剩余，继续调度
      if (this.buffer.length > 0) {
        this.scheduleBatchWrite();
      }
    }, BATCH_WRITE_INTERVAL);
  }

  private async flushToIndexedDB(entries: UnifiedLogEntry[]): Promise<void> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const entry of entries) {
        store.add(entry);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ====================================
  // 数据库操作
  // ====================================

  private async ensureDb(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    if (!this.dbInitPromise) {
      this.dbInitPromise = this.initDatabase();
    }

    await this.dbInitPromise;
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  private async initDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('level', 'level', { unique: false });
          store.createIndex('sessionId', 'sessionId', { unique: false });
          store.createIndex('category_timestamp', ['category', 'timestamp'], { unique: false });
        }
      };
    });
  }

  // ====================================
  // 查询接口
  // ====================================

  /**
   * 查询日志
   */
  async query(options: LogQueryOptions = {}): Promise<UnifiedLogEntry[]> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');

      const results: UnifiedLogEntry[] = [];
      const request = index.openCursor(null, 'prev'); // 按时间倒序

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(results);
          return;
        }

        const entry = cursor.value as UnifiedLogEntry;

        // 应用过滤器
        if (!this.matchesFilter(entry, options)) {
          cursor.continue();
          return;
        }

        // 应用 offset
        if (options.offset && results.length < options.offset) {
          results.push(entry);
          cursor.continue();
          return;
        }

        results.push(entry);

        // 应用 limit
        if (options.limit && results.length >= (options.offset || 0) + options.limit) {
          resolve(results.slice(options.offset || 0));
          return;
        }

        cursor.continue();
      };

      request.onerror = () => reject(request.error);
    });
  }

  private matchesFilter(entry: UnifiedLogEntry, options: LogQueryOptions): boolean {
    if (options.category) {
      const categories = Array.isArray(options.category) ? options.category : [options.category];
      if (!categories.includes(entry.category)) return false;
    }

    if (options.level) {
      const levels = Array.isArray(options.level) ? options.level : [options.level];
      if (!levels.includes(entry.level)) return false;
    }

    if (options.sessionId && entry.sessionId !== options.sessionId) {
      return false;
    }

    if (options.startTime && entry.timestamp < options.startTime) {
      return false;
    }

    if (options.endTime && entry.timestamp > options.endTime) {
      return false;
    }

    if (options.search) {
      const searchLower = options.search.toLowerCase();
      const matchesMessage = entry.message.toLowerCase().includes(searchLower);
      const matchesData = entry.data && JSON.stringify(entry.data).toLowerCase().includes(searchLower);
      if (!matchesMessage && !matchesData) return false;
    }

    return true;
  }

  /**
   * 获取日志统计信息
   */
  async getStats(category?: LogCategory): Promise<LogStats> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      const stats: LogStats = {
        total: 0,
        byCategory: { fetch: 0, console: 0, postmessage: 0, llmapi: 0, crash: 0, sync: 0 },
        byLevel: { debug: 0, info: 0, success: 0, warning: 0, error: 0 },
      };

      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(stats);
          return;
        }

        const entry = cursor.value as UnifiedLogEntry;

        // 过滤类别
        if (category && entry.category !== category) {
          cursor.continue();
          return;
        }

        stats.total++;
        stats.byCategory[entry.category]++;
        stats.byLevel[entry.level]++;

        if (!stats.oldestEntry || entry.timestamp < stats.oldestEntry) {
          stats.oldestEntry = entry.timestamp;
        }
        if (!stats.newestEntry || entry.timestamp > stats.newestEntry) {
          stats.newestEntry = entry.timestamp;
        }

        cursor.continue();
      };

      request.onerror = () => reject(request.error);
    });
  }

  // ====================================
  // 清理
  // ====================================

  /**
   * 清理过期和超量日志
   */
  async cleanup(): Promise<{ deleted: number }> {
    const db = await this.ensureDb();
    let deleted = 0;

    // 按类别清理
    for (const [category, config] of Object.entries(CATEGORY_CONFIGS)) {
      if (!config.persistToDB) continue;

      // 1. 清理过期日志
      if (config.retentionDays) {
        const expirationTime = Date.now() - config.retentionDays * 24 * 60 * 60 * 1000;
        deleted += await this.deleteByTimestamp(db, category as LogCategory, expirationTime);
      }

      // 2. 清理超量日志
      if (config.dbLimit) {
        deleted += await this.enforceLimit(db, category as LogCategory, config.dbLimit);
      }
    }

    return { deleted };
  }

  private async deleteByTimestamp(db: IDBDatabase, category: LogCategory, beforeTimestamp: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('category_timestamp');

      let deleted = 0;
      const range = IDBKeyRange.bound([category, 0], [category, beforeTimestamp]);
      const request = index.openCursor(range);

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(deleted);
          return;
        }

        cursor.delete();
        deleted++;
        cursor.continue();
      };

      request.onerror = () => reject(request.error);
    });
  }

  private async enforceLimit(db: IDBDatabase, category: LogCategory, limit: number): Promise<number> {
    // 获取该类别的总数
    const count = await this.getCategoryCount(db, category);
    if (count <= limit) return 0;

    const toDelete = count - limit;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('category_timestamp');

      let deleted = 0;
      const range = IDBKeyRange.bound([category, 0], [category, Date.now()]);
      const request = index.openCursor(range); // 从最旧的开始

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || deleted >= toDelete) {
          resolve(deleted);
          return;
        }

        cursor.delete();
        deleted++;
        cursor.continue();
      };

      request.onerror = () => reject(request.error);
    });
  }

  private async getCategoryCount(db: IDBDatabase, category: LogCategory): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('category');
      const request = index.count(IDBKeyRange.only(category));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清空指定类别的日志
   */
  async clear(category?: LogCategory): Promise<void> {
    // 清空内存
    if (category) {
      this.memoryCache.set(category, []);
    } else {
      for (const cat of this.memoryCache.keys()) {
        this.memoryCache.set(cat, []);
      }
    }

    // 清空 IndexedDB
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      if (category) {
        const index = store.index('category');
        const request = index.openCursor(IDBKeyRange.only(category));

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } else {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }
    });
  }

  // ====================================
  // 数据清理
  // ====================================

  private sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      // 脱敏敏感字段
      const keyLower = key.toLowerCase();
      if (keyLower.includes('token') || keyLower.includes('password') || keyLower.includes('secret')) {
        sanitized[key] = '***';
      } else if (keyLower.includes('gistid') || keyLower.includes('gist_id')) {
        sanitized[key] = typeof value === 'string' ? this.maskId(value) : value;
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeData(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private maskId(id: string): string {
    if (!id || id.length <= 8) return id;
    return `${id.slice(0, 4)}...${id.slice(-4)}`;
  }
}

// ====================================
// 导出单例
// ====================================

export const unifiedLogService = new UnifiedLogService();

// 便捷导出
export const logDebug = (category: LogCategory, message: string, data?: Record<string, unknown>) =>
  unifiedLogService.debug(category, message, data);

export const logInfo = (category: LogCategory, message: string, data?: Record<string, unknown>) =>
  unifiedLogService.info(category, message, data);

export const logSuccess = (category: LogCategory, message: string, data?: Record<string, unknown>) =>
  unifiedLogService.success(category, message, data);

export const logWarning = (category: LogCategory, message: string, data?: Record<string, unknown>) =>
  unifiedLogService.warning(category, message, data);

export const logError = (category: LogCategory, message: string, error?: Error, data?: Record<string, unknown>) =>
  unifiedLogService.error(category, message, error, data);

// ====================================
// 性能测试工具
// ====================================

/**
 * 性能基准测试
 * 验证日志记录的零阻塞特性
 */
export async function runPerformanceBenchmark(iterations = 1000): Promise<{
  totalTimeMs: number;
  avgPerLogUs: number;
  logsPerSecond: number;
  passed: boolean;
}> {
  // 启用调试模式以确保日志被记录
  unifiedLogService.setDebugMode(true);

  const startTime = performance.now();

  for (let i = 0; i < iterations; i++) {
    unifiedLogService.log('sync', 'info', `Benchmark log #${i}`, {
      iteration: i,
      timestamp: Date.now(),
    });
  }

  const endTime = performance.now();
  const totalTimeMs = endTime - startTime;
  const avgPerLogUs = (totalTimeMs / iterations) * 1000; // 转换为微秒
  const logsPerSecond = Math.round(iterations / (totalTimeMs / 1000));

  // 目标：平均每次日志调用 < 100 微秒
  const passed = avgPerLogUs < 100;

  return {
    totalTimeMs: Math.round(totalTimeMs * 100) / 100,
    avgPerLogUs: Math.round(avgPerLogUs * 100) / 100,
    logsPerSecond,
    passed,
  };
}
