/**
 * Task Storage Writer
 *
 * 主线程直接写入 IndexedDB 中的任务数据。
 * 用于 SW 不可用时的降级模式。
 *
 * 注意：正常情况下应通过 SW 写入以确保一致性。
 * 此模块仅用于降级场景。
 */

import type { TaskType, TaskStatus } from '../../types/task.types';

// 与 SW 端 storage.ts 保持一致的数据库配置
const DB_NAME = 'sw-task-queue';
const TASKS_STORE = 'tasks';

/**
 * SW 端的任务结构（与 SWTask 保持一致）
 */
export interface SWTask {
  id: string;
  type: TaskType;
  status: TaskStatus;
  params: {
    prompt: string;
    [key: string]: unknown;
  };
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: {
    url: string;
    format: string;
    size: number;
    width?: number;
    height?: number;
    duration?: number;
    thumbnailUrl?: string;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  progress?: number;
  remoteId?: string;
  executionPhase?: string;
  savedToLibrary?: boolean;
  insertedToCanvas?: boolean;
}

/**
 * 任务存储写入器
 *
 * 提供直接写入 IndexedDB 的能力，用于降级模式。
 */
class TaskStorageWriter {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

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
        reject(new Error('Failed to open database'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.dbPromise = null;
        resolve(this.db);
      };

      request.onupgradeneeded = () => {
        // 如果数据库不存在，创建必要的 object store
        const db = request.result;
        if (!db.objectStoreNames.contains(TASKS_STORE)) {
          const store = db.createObjectStore(TASKS_STORE, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * 保存任务
   */
  async saveTask(task: SWTask): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(TASKS_STORE, 'readwrite');
      const store = transaction.objectStore(TASKS_STORE);
      const request = store.put(task);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * 获取任务
   */
  async getTask(taskId: string): Promise<SWTask | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(TASKS_STORE, 'readonly');
      const store = transaction.objectStore(TASKS_STORE);
      const request = store.get(taskId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  /**
   * 创建新任务
   */
  async createTask(
    taskId: string,
    type: TaskType,
    params: SWTask['params']
  ): Promise<SWTask> {
    const now = Date.now();
    const task: SWTask = {
      id: taskId,
      type,
      status: 'pending',
      params,
      createdAt: now,
      updatedAt: now,
    };
    await this.saveTask(task);
    return task;
  }

  /**
   * 更新任务状态
   */
  async updateStatus(taskId: string, status: TaskStatus): Promise<void> {
    const task = await this.getTask(taskId);
    if (task) {
      task.status = status;
      task.updatedAt = Date.now();
      if (status === 'processing' && !task.startedAt) {
        task.startedAt = Date.now();
      }
      await this.saveTask(task);
    }
  }

  /**
   * 更新任务进度
   */
  async updateProgress(
    taskId: string,
    progress: number,
    phase?: string
  ): Promise<void> {
    const task = await this.getTask(taskId);
    if (task) {
      task.progress = progress;
      task.updatedAt = Date.now();
      if (phase) {
        task.executionPhase = phase;
      }
      await this.saveTask(task);
    }
  }

  /**
   * 完成任务
   */
  async completeTask(taskId: string, result: SWTask['result']): Promise<void> {
    const task = await this.getTask(taskId);
    if (task) {
      task.status = 'completed';
      task.result = result;
      task.completedAt = Date.now();
      task.updatedAt = Date.now();
      task.progress = 100;
      await this.saveTask(task);
    }
  }

  /**
   * 任务失败
   */
  async failTask(taskId: string, error: SWTask['error']): Promise<void> {
    const task = await this.getTask(taskId);
    if (task) {
      task.status = 'failed';
      task.error = error;
      task.updatedAt = Date.now();
      await this.saveTask(task);
    }
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
 * 任务存储写入器单例
 */
export const taskStorageWriter = new TaskStorageWriter();
