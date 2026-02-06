/**
 * 主线程 IndexedDB 配置写入器
 * 
 * 将配置同步到 IndexedDB，供 Service Worker 直接读取。
 * 使用与 SW 相同的数据库和存储结构，确保两边可以共享数据。
 * 
 * 设计说明：
 * - 主线程负责写入配置（用户修改设置时）
 * - SW 负责读取配置（执行任务时）
 * - 两边共享同一个 IndexedDB 数据库
 */

import type { GeminiConfig } from './gemini-api/types';

/**
 * VideoAPIConfig 类型定义（与 SW 保持一致）
 */
export interface VideoAPIConfig {
  apiKey: string;
  baseUrl: string;
  model?: string;
}

// 与 SW storage.ts 保持一致的常量
const DB_NAME = 'sw-task-queue';
const CONFIG_STORE = 'config';
const MIN_DB_VERSION = 3;

/**
 * 检测当前数据库版本
 */
function detectDatabaseVersion(): Promise<number> {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME);
    
    request.onsuccess = () => {
      const db = request.result;
      const version = db.version;
      db.close();
      resolve(Math.max(version, MIN_DB_VERSION));
    };
    
    request.onerror = () => {
      resolve(MIN_DB_VERSION);
    };
  });
}

/**
 * 打开 IndexedDB 连接
 */
async function openDB(): Promise<IDBDatabase> {
  const targetVersion = await detectDatabaseVersion();
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, targetVersion);

    request.onerror = () => {
      console.error('[ConfigWriter] Failed to open DB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const db = request.result;
      
      // 检查 config store 是否存在
      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        console.warn('[ConfigWriter] Config store not found, SW may need to initialize first');
        db.close();
        reject(new Error('Config store not found'));
        return;
      }
      
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // 如果 config store 不存在，创建它
      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        db.createObjectStore(CONFIG_STORE, { keyPath: 'key' });
      }
    };
  });
}

/**
 * 配置 IndexedDB 写入器
 */
class ConfigIndexedDBWriter {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  /**
   * 获取数据库连接
   */
  private async getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB();
    }
    return this.dbPromise;
  }

  /**
   * 重置数据库连接（用于错误恢复）
   */
  private resetDB(): void {
    this.dbPromise = null;
  }

  /**
   * 保存单个配置
   */
  private async saveConfigInternal<T extends Record<string, unknown>>(
    key: 'gemini' | 'video',
    config: T
  ): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CONFIG_STORE, 'readwrite');
        const store = transaction.objectStore(CONFIG_STORE);
        store.put({
          key,
          ...config,
          updatedAt: Date.now(),
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          console.error('[ConfigWriter] Transaction error:', transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error('[ConfigWriter] Failed to save config:', error);
      this.resetDB();
      throw error;
    }
  }

  /**
   * 保存 Gemini 配置
   */
  async saveGeminiConfig(config: GeminiConfig): Promise<void> {
    // 使用队列确保写入顺序
    this.writeQueue = this.writeQueue.then(async () => {
      await this.saveConfigInternal('gemini', config);
    }).catch((error) => {
      console.error('[ConfigWriter] Failed to save gemini config:', error);
    });
    return this.writeQueue;
  }

  /**
   * 保存视频 API 配置
   */
  async saveVideoConfig(config: VideoAPIConfig): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await this.saveConfigInternal('video', config);
    }).catch((error) => {
      console.error('[ConfigWriter] Failed to save video config:', error);
    });
    return this.writeQueue;
  }

  /**
   * 同时保存两个配置
   */
  async saveConfig(geminiConfig: GeminiConfig, videoConfig: VideoAPIConfig): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        const db = await this.getDB();
        return new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(CONFIG_STORE, 'readwrite');
          const store = transaction.objectStore(CONFIG_STORE);
          const now = Date.now();
          
          store.put({
            key: 'gemini',
            ...geminiConfig,
            updatedAt: now,
          });
          
          store.put({
            key: 'video',
            ...videoConfig,
            updatedAt: now,
          });

          transaction.oncomplete = () => resolve();
          transaction.onerror = () => {
            console.error('[ConfigWriter] Transaction error:', transaction.error);
            reject(transaction.error);
          };
        });
      } catch (error) {
        console.error('[ConfigWriter] Failed to save configs:', error);
        this.resetDB();
        throw error;
      }
    }).catch((error) => {
      console.error('[ConfigWriter] Failed to save configs:', error);
    });
    return this.writeQueue;
  }

  /**
   * 读取配置（用于调试和验证）
   */
  async getConfig<T>(key: 'gemini' | 'video'): Promise<T | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CONFIG_STORE, 'readonly');
        const store = transaction.objectStore(CONFIG_STORE);
        const request = store.get(key);

        request.onsuccess = () => {
          const result = request.result;
          if (!result) {
            resolve(null);
            return;
          }
          // 移除 key 字段
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { key: _, ...config } = result;
          resolve(config as T);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[ConfigWriter] Failed to get config:', error);
      return null;
    }
  }
}

// 单例导出
export const configIndexedDBWriter = new ConfigIndexedDBWriter();
