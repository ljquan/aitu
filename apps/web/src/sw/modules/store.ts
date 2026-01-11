/**
 * Service Worker IndexedDB 存储模块
 *
 * 提供任务和工作流的持久化存储功能
 */

import {
  Task,
  TaskStatus,
  WorkflowStore,
  DB_NAME,
  DB_VERSION,
  STORES,
} from '../types';

/**
 * IndexedDB 存储服务
 */
class SWStore {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    if (this.db) return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[SWStore] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        // console.log('[SWStore] Database opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        // console.log('[SWStore] Upgrading database...');

        // 创建任务存储
        if (!db.objectStoreNames.contains(STORES.tasks)) {
          const taskStore = db.createObjectStore(STORES.tasks, { keyPath: 'id' });
          taskStore.createIndex('status', 'status', { unique: false });
          taskStore.createIndex('type', 'type', { unique: false });
          taskStore.createIndex('createdAt', 'createdAt', { unique: false });
          taskStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          // console.log('[SWStore] Created tasks store');
        }

        // 创建工作流存储
        if (!db.objectStoreNames.contains(STORES.workflows)) {
          const workflowStore = db.createObjectStore(STORES.workflows, { keyPath: 'id' });
          workflowStore.createIndex('status', 'status', { unique: false });
          workflowStore.createIndex('createdAt', 'createdAt', { unique: false });
          // console.log('[SWStore] Created workflows store');
        }

        // 创建元数据存储
        if (!db.objectStoreNames.contains(STORES.metadata)) {
          db.createObjectStore(STORES.metadata, { keyPath: 'key' });
          // console.log('[SWStore] Created metadata store');
        }
      };
    });

    return this.initPromise;
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) {
      throw new Error('[SWStore] Database not initialized');
    }
    return this.db;
  }

  // ==================== 任务操作 ====================

  /**
   * 保存任务
   */
  async saveTask(task: Task): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.tasks], 'readwrite');
      const store = transaction.objectStore(STORES.tasks);
      const request = store.put(task);

      request.onsuccess = () => {
        // console.log(`[SWStore] Task saved: ${task.id}`);
        resolve();
      };

      request.onerror = () => {
        console.error(`[SWStore] Failed to save task: ${task.id}`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 获取任务
   */
  async getTask(taskId: string): Promise<Task | undefined> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.tasks], 'readonly');
      const store = transaction.objectStore(STORES.tasks);
      const request = store.get(taskId);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error(`[SWStore] Failed to get task: ${taskId}`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 获取所有任务
   */
  async getAllTasks(): Promise<Task[]> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.tasks], 'readonly');
      const store = transaction.objectStore(STORES.tasks);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('[SWStore] Failed to get all tasks', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 按状态获取任务
   */
  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.tasks], 'readonly');
      const store = transaction.objectStore(STORES.tasks);
      const index = store.index('status');
      const request = index.getAll(status);

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error(`[SWStore] Failed to get tasks by status: ${status}`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.tasks], 'readwrite');
      const store = transaction.objectStore(STORES.tasks);
      const request = store.delete(taskId);

      request.onsuccess = () => {
        // console.log(`[SWStore] Task deleted: ${taskId}`);
        resolve();
      };

      request.onerror = () => {
        console.error(`[SWStore] Failed to delete task: ${taskId}`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 清除已完成的任务
   */
  async clearCompletedTasks(): Promise<number> {
    const tasks = await this.getTasksByStatus(TaskStatus.COMPLETED);
    let count = 0;

    for (const task of tasks) {
      await this.deleteTask(task.id);
      count++;
    }

    // console.log(`[SWStore] Cleared ${count} completed tasks`);
    return count;
  }

  /**
   * 清除失败的任务
   */
  async clearFailedTasks(): Promise<number> {
    const tasks = await this.getTasksByStatus(TaskStatus.FAILED);
    let count = 0;

    for (const task of tasks) {
      await this.deleteTask(task.id);
      count++;
    }

    // console.log(`[SWStore] Cleared ${count} failed tasks`);
    return count;
  }

  // ==================== 工作流操作 ====================

  /**
   * 保存工作流
   */
  async saveWorkflow(workflow: WorkflowStore): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.workflows], 'readwrite');
      const store = transaction.objectStore(STORES.workflows);
      const request = store.put(workflow);

      request.onsuccess = () => {
        // console.log(`[SWStore] Workflow saved: ${workflow.id}`);
        resolve();
      };

      request.onerror = () => {
        console.error(`[SWStore] Failed to save workflow: ${workflow.id}`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 获取工作流
   */
  async getWorkflow(workflowId: string): Promise<WorkflowStore | undefined> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.workflows], 'readonly');
      const store = transaction.objectStore(STORES.workflows);
      const request = store.get(workflowId);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error(`[SWStore] Failed to get workflow: ${workflowId}`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 获取所有工作流
   */
  async getAllWorkflows(): Promise<WorkflowStore[]> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.workflows], 'readonly');
      const store = transaction.objectStore(STORES.workflows);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('[SWStore] Failed to get all workflows', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 删除工作流
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.workflows], 'readwrite');
      const store = transaction.objectStore(STORES.workflows);
      const request = store.delete(workflowId);

      request.onsuccess = () => {
        // console.log(`[SWStore] Workflow deleted: ${workflowId}`);
        resolve();
      };

      request.onerror = () => {
        console.error(`[SWStore] Failed to delete workflow: ${workflowId}`, request.error);
        reject(request.error);
      };
    });
  }

  // ==================== 元数据操作 ====================

  /**
   * 保存元数据
   */
  async setMetadata(key: string, value: unknown): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.metadata], 'readwrite');
      const store = transaction.objectStore(STORES.metadata);
      const request = store.put({ key, value, updatedAt: Date.now() });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 获取元数据
   */
  async getMetadata<T>(key: string): Promise<T | undefined> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.metadata], 'readonly');
      const store = transaction.objectStore(STORES.metadata);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result?.value);
      };

      request.onerror = () => reject(request.error);
    });
  }

  // ==================== 数据迁移 ====================

  /**
   * 从旧的 IndexedDB 迁移数据
   */
  async migrateFromLegacyStore(): Promise<void> {
    const legacyDBName = 'aitu-task-queue';

    return new Promise((resolve) => {
      const request = indexedDB.open(legacyDBName, 1);

      request.onerror = () => {
        // console.log('[SWStore] No legacy database found, skipping migration');
        resolve();
      };

      request.onsuccess = async () => {
        const legacyDB = request.result;

        try {
          if (legacyDB.objectStoreNames.contains('tasks')) {
            const transaction = legacyDB.transaction(['tasks'], 'readonly');
            const store = transaction.objectStore('tasks');
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = async () => {
              const legacyTasks = getAllRequest.result || [];
              // console.log(`[SWStore] Found ${legacyTasks.length} tasks in legacy database`);

              for (const task of legacyTasks) {
                await this.saveTask(task);
              }

              // console.log('[SWStore] Migration completed');
              legacyDB.close();

              // 标记迁移完成
              await this.setMetadata('migrationCompleted', true);
              resolve();
            };

            getAllRequest.onerror = () => {
              console.error('[SWStore] Failed to read legacy tasks');
              legacyDB.close();
              resolve();
            };
          } else {
            legacyDB.close();
            resolve();
          }
        } catch (error) {
          console.error('[SWStore] Migration error:', error);
          legacyDB.close();
          resolve();
        }
      };
    });
  }
}

// 导出单例
export const swStore = new SWStore();
