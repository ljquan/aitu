/**
 * Workflow Storage Reader Service
 * 
 * 主线程直接读取 IndexedDB 中的工作流数据，避免通过 postMessage 与 SW 通信的限制。
 * 
 * 注意：这个模块只负责读取操作，写操作仍然通过 SW 进行以确保数据一致性
 */

import type { 
  WorkflowDefinition, 
  WorkflowStep, 
  WorkflowStatus, 
  WorkflowStepStatus 
} from './sw-channel/types/workflow';
import { BaseStorageReader } from './base-storage-reader';

import { APP_DB_NAME, APP_DB_STORES, getAppDB } from './app-database';

// 使用主线程专用数据库
const DB_NAME = APP_DB_NAME;
const WORKFLOWS_STORE = APP_DB_STORES.WORKFLOWS;

// SW 端的 Workflow 结构
interface SWWorkflow {
  id: string;
  steps: Array<{
    id: string;
    mcp: string;
    args: Record<string, unknown>;
    description: string;
    status: WorkflowStepStatus;
    result?: unknown;
    error?: string;
    duration?: number;
    dependsOn?: string[];
    options?: {
      mode?: 'async' | 'queue';
      batchId?: string;
      batchIndex?: number;
      batchTotal?: number;
      globalIndex?: number;
    };
  }>;
  status: WorkflowStatus;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
  context?: {
    userInput?: string;
    model?: string;
    params?: {
      count?: number;
      size?: string;
      duration?: string;
    };
    selection?: {
      texts?: string[];
      images?: string[];
      videos?: string[];
    };
    referenceImages?: string[];
    textModel?: string;
  };
}

/**
 * 将 SWWorkflow 转换为 WorkflowDefinition
 */
function convertSWWorkflowToDefinition(swWorkflow: SWWorkflow): WorkflowDefinition {
  return {
    id: swWorkflow.id,
    name: swWorkflow.context?.userInput?.slice(0, 50) || `Workflow ${swWorkflow.id.slice(0, 8)}`,
    steps: swWorkflow.steps.map((step): WorkflowStep => ({
      id: step.id,
      mcp: step.mcp,
      args: step.args,
      description: step.description,
      status: step.status,
      result: step.result,
      error: step.error,
      duration: step.duration,
      options: step.options,
    })),
    status: swWorkflow.status,
    createdAt: swWorkflow.createdAt,
    updatedAt: swWorkflow.updatedAt,
    completedAt: swWorkflow.completedAt,
    error: swWorkflow.error,
    context: swWorkflow.context ? {
      userInput: swWorkflow.context.userInput,
      model: swWorkflow.context.model,
      params: swWorkflow.context.params,
      referenceImages: swWorkflow.context.referenceImages,
    } : undefined,
  };
}

/**
 * 工作流缓存结构
 */
interface WorkflowCache {
  workflows: WorkflowDefinition[] | null;
}

/**
 * 工作流存储读取服务
 */
class WorkflowStorageReader extends BaseStorageReader<WorkflowCache> {
  protected readonly dbName = DB_NAME;
  protected readonly storeName = WORKFLOWS_STORE;
  protected readonly logPrefix = 'WorkflowStorageReader';

  /**
   * 使用 getAppDB() 获取数据库连接，确保 store 已创建。
   */
  protected async getDB(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = getAppDB().then(db => {
      this.db = db;
      return db;
    }).catch(error => {
      this.dbPromise = null;
      throw error;
    });

    return this.dbPromise;
  }

  /**
   * 获取所有工作流（带缓存）
   */
  async getAllWorkflows(): Promise<WorkflowDefinition[]> {
    // 检查缓存
    if (this.isCacheValid() && this.cache?.workflows) {
      return this.cache.workflows;
    }

    try {
      const db = await this.getDB();
      
      if (!db.objectStoreNames.contains(WORKFLOWS_STORE)) {
        return [];
      }

      const workflows = await new Promise<WorkflowDefinition[]>((resolve, reject) => {
        const transaction = db.transaction(WORKFLOWS_STORE, 'readonly');
        const store = transaction.objectStore(WORKFLOWS_STORE);
        const request = store.getAll();

        request.onsuccess = () => {
          const rawWorkflows: SWWorkflow[] = request.result || [];
          
          // 按创建时间倒序排序
          rawWorkflows.sort((a, b) => b.createdAt - a.createdAt);
          
          resolve(rawWorkflows.map(convertSWWorkflowToDefinition));
        };

        request.onerror = () => {
          reject(new Error(`Failed to get workflows: ${request.error?.message}`));
        };
      });

      // 更新缓存
      this.cache = { workflows };
      this.updateCacheTimestamp();

      return workflows;
    } catch (error) {
      console.error('[WorkflowStorageReader] Error getting all workflows:', error);
      return [];
    }
  }

  /**
   * 获取单个工作流
   */
  async getWorkflow(workflowId: string): Promise<WorkflowDefinition | null> {
    // 优先从缓存查找
    if (this.isCacheValid() && this.cache?.workflows) {
      const cached = this.cache.workflows.find(w => w.id === workflowId);
      if (cached) return cached;
    }

    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains(WORKFLOWS_STORE)) {
        return null;
      }
      const swWorkflow = await this.getById<SWWorkflow>(WORKFLOWS_STORE, workflowId);
      return swWorkflow ? convertSWWorkflowToDefinition(swWorkflow) : null;
    } catch (error) {
      console.warn('[WorkflowStorageReader] Error getting workflow:', error);
      return null;
    }
  }

  /**
   * 获取指定状态的工作流
   */
  async getWorkflowsByStatus(status: WorkflowStatus): Promise<WorkflowDefinition[]> {
    const all = await this.getAllWorkflows();
    return all.filter(w => w.status === status);
  }

  /**
   * 获取活跃的工作流（pending 或 running）
   */
  async getActiveWorkflows(): Promise<WorkflowDefinition[]> {
    const all = await this.getAllWorkflows();
    return all.filter(w => w.status === 'pending' || w.status === 'running');
  }
}

export const workflowStorageReader = new WorkflowStorageReader();
export { WorkflowStorageReader };
