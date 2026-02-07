/**
 * 主线程 IndexedDB 配置写入器
 * 
 * 将配置写入 aitu-app 数据库（主线程专用）。
 * SW 不再直接读取主线程 IDB，配置通过 Fetch Relay 传递。
 */

import type { GeminiConfig } from './gemini-api/types';

/**
 * VideoAPIConfig 类型定义
 */
export interface VideoAPIConfig {
  apiKey: string;
  baseUrl: string;
  model?: string;
}

import { getAppDB, APP_DB_STORES } from '../services/app-database';

const CONFIG_STORE = APP_DB_STORES.CONFIG;

/**
 * 配置 IndexedDB 写入器
 */
class ConfigIndexedDBWriter {
  private writeQueue: Promise<void> = Promise.resolve();

  /**
   * 获取数据库连接
   */
  private async getDB(): Promise<IDBDatabase> {
    return getAppDB();
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
