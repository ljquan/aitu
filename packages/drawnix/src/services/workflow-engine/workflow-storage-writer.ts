/**
 * Workflow Storage Writer
 *
 * 主线程直接写入 IndexedDB 中的工作流数据。
 * 用于 SW 不可用时的降级模式。
 */

import type { Workflow } from './types';

// 与 SW 端 storage.ts 保持一致的数据库配置
const DB_NAME = 'sw-task-queue';
const WORKFLOWS_STORE = 'workflows';

/**
 * 工作流存储写入器
 */
class WorkflowStorageWriter {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * 检查是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      const db = await this.getDB();
      return db.objectStoreNames.contains(WORKFLOWS_STORE);
    } catch {
      return false;
    }
  }

  /**
   * 获取数据库连接
   */
  private async getDB(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);

      request.onerror = () => {
        this.dbPromise = null;
        console.error('[WorkflowStorageWriter] Failed to open database:', request.error);
        reject(new Error('Failed to open database'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.dbPromise = null;
        
        // 检查 store 是否存在
        if (!this.db.objectStoreNames.contains(WORKFLOWS_STORE)) {
          console.warn('[WorkflowStorageWriter] workflows store does not exist');
        }
        
        resolve(this.db);
      };

      request.onupgradeneeded = () => {
        // 如果数据库不存在，创建必要的 object store
        const db = request.result;
        if (!db.objectStoreNames.contains(WORKFLOWS_STORE)) {
          const store = db.createObjectStore(WORKFLOWS_STORE, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * 保存工作流
   * 降级模式下 IndexedDB 可能不可用，失败时静默跳过，不阻塞工作流执行
   */
  async saveWorkflow(workflow: Workflow): Promise<void> {
    try {
      const db = await this.getDB();
      
      // 检查 store 是否存在
      if (!db.objectStoreNames.contains(WORKFLOWS_STORE)) {
        return;
      }
      
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(WORKFLOWS_STORE, 'readwrite');
        const store = transaction.objectStore(WORKFLOWS_STORE);
        const request = store.put(workflow);

        request.onerror = () => {
          resolve(); // 不阻塞：降级模式优先保证执行
        };
        request.onsuccess = () => resolve();
      });
    } catch {
      // 静默跳过：降级模式不依赖持久化
    }
  }

  /**
   * 获取工作流
   */
  async getWorkflow(workflowId: string): Promise<Workflow | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(WORKFLOWS_STORE, 'readonly');
      const store = transaction.objectStore(WORKFLOWS_STORE);
      const request = store.get(workflowId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  /**
   * 删除工作流
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(WORKFLOWS_STORE, 'readwrite');
      const store = transaction.objectStore(WORKFLOWS_STORE);
      const request = store.delete(workflowId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/**
 * 工作流存储写入器单例
 */
export const workflowStorageWriter = new WorkflowStorageWriter();
