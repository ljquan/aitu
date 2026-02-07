/**
 * Workflow Storage Writer
 *
 * 主线程写入工作流数据到 aitu-app 数据库。
 * 使用主线程专用数据库，不再与 SW 共享，无 IDB 并发竞争。
 */

import type { Workflow } from './types';
import { getAppDB, APP_DB_STORES } from '../app-database';

const WORKFLOWS_STORE = APP_DB_STORES.WORKFLOWS;

/**
 * 工作流存储写入器
 */
class WorkflowStorageWriter {
  /**
   * 检查是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      const db = await getAppDB();
      return db.objectStoreNames.contains(WORKFLOWS_STORE);
    } catch {
      return false;
    }
  }

  /**
   * 获取数据库连接
   */
  private async getDB(): Promise<IDBDatabase> {
    return getAppDB();
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
   * 关闭数据库连接（现在由 app-database 集中管理）
   */
  close(): void {
    // no-op: 连接由 app-database 模块管理
  }
}

/**
 * 工作流存储写入器单例
 */
export const workflowStorageWriter = new WorkflowStorageWriter();
