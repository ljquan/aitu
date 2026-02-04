/**
 * Workflow Polling Service
 *
 * 主线程工作流轮询服务
 * 负责轮询 IndexedDB 中的工作流，执行标记为 pending_main_thread 的步骤
 *
 * 设计原则：
 * - SW 只负责 fetch 操作和状态持久化
 * - 需要访问 Canvas/DOM 的操作由主线程轮询执行
 * - 通过 IndexedDB 解耦，避免实时通信的时序问题
 * - 使用 boardId 隔离，每个画布只处理自己发起的工作流
 */

import { swCapabilitiesHandler, getCapabilitiesBoard } from './sw-capabilities';
import { workflowSubmissionService, type WorkflowDefinition } from './workflow-submission-service';

// IndexedDB 配置（与 SW 任务队列使用相同的数据库）
// 参见 storage-keys.ts -> SW_TASK_QUEUE
const DB_NAME = 'sw-task-queue';
const MIN_DB_VERSION = 3; // 最小版本（与 SW 端保持一致）
const WORKFLOWS_STORE = 'workflows';

// 轮询间隔
const POLLING_INTERVAL = 1000; // 1秒

/**
 * 工作流步骤状态
 */
type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'pending_main_thread';

/**
 * 工作流步骤
 */
interface WorkflowStep {
  id: string;
  mcp: string;
  args: Record<string, unknown>;
  description: string;
  status: WorkflowStepStatus;
  result?: unknown;
  error?: string;
  duration?: number;
}

/**
 * 工作流
 */
interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
  /** 发起工作流的画布 ID */
  initiatorBoardId?: string;
}

/**
 * 工作流轮询服务
 */
class WorkflowPollingService {
  private db: IDBDatabase | null = null;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private executingSteps: Set<string> = new Set();
  
  /** 当前画布 ID，只处理此画布发起的工作流 */
  private currentBoardId: string | null = null;

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    if (this.db) return;

    try {
      this.db = await this.openDB();
      console.log('[WorkflowPollingService] ✅ Database opened');
    } catch (error) {
      console.error('[WorkflowPollingService] ❌ Failed to open database:', error);
    }
  }

  /**
   * 打开数据库
   */
  private async openDB(): Promise<IDBDatabase> {
    // 动态检测数据库版本，避免版本冲突
    const currentVersion = await this.detectDatabaseVersion();

    return new Promise((resolve, reject) => {
      // 使用检测到的版本打开数据库
      const request = indexedDB.open(DB_NAME, currentVersion);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);

      // 如果数据库版本不匹配，需要升级（但这里只读取，不创建 store）
      request.onupgradeneeded = () => {
        // 轮询服务只读取数据，不负责创建 store
        // store 由 SW 创建和管理
        console.log('[WorkflowPollingService] Database upgrade needed, waiting for SW to create stores');
      };
    });
  }

  /**
   * 检测现有数据库版本
   */
  private detectDatabaseVersion(): Promise<number> {
    return new Promise((resolve) => {
      // 不指定版本打开，获取当前版本
      const request = indexedDB.open(DB_NAME);

      request.onsuccess = () => {
        const db = request.result;
        const version = db.version;
        db.close();
        // 返回当前版本或最小版本中的较大值
        resolve(Math.max(version, MIN_DB_VERSION));
      };

      request.onerror = () => {
        // 如果打开失败，使用最小版本
        resolve(MIN_DB_VERSION);
      };
    });
  }

  /**
   * 设置当前画布 ID
   * 轮询服务只会处理此画布发起的工作流
   */
  setBoardId(boardId: string): void {
    this.currentBoardId = boardId;
    console.log(`[WorkflowPollingService] 📋 Board ID set: ${boardId}`);
  }

  /**
   * 获取当前画布 ID
   */
  getBoardId(): string | null {
    return this.currentBoardId;
  }

  /**
   * 开始轮询
   */
  start(): void {
    if (this.pollingTimer) return;

    console.log('[WorkflowPollingService] 🚀 Starting polling', { boardId: this.currentBoardId });
    this.pollingTimer = setInterval(() => this.poll(), POLLING_INTERVAL);

    // 立即执行一次
    this.poll();
  }

  /**
   * 停止轮询
   */
  stop(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      console.log('[WorkflowPollingService] ⏹️ Stopped polling');
    }
  }

  /**
   * 轮询一次
   */
  private async poll(): Promise<void> {
    if (this.isPolling) return;
    if (!this.db) {
      await this.initialize();
      if (!this.db) return;
    }

    this.isPolling = true;

    try {
      // 获取所有工作流
      const workflows = await this.getAllWorkflows();

      // 查找需要主线程执行的步骤
      for (const workflow of workflows) {
        if (workflow.status !== 'running') continue;

        // 只处理当前画布发起的工作流
        // 如果工作流没有 initiatorBoardId，则任何画布都可以处理（向后兼容）
        if (workflow.initiatorBoardId && this.currentBoardId && workflow.initiatorBoardId !== this.currentBoardId) {
          continue;
        }

        for (const step of workflow.steps) {
          // 只处理 pending_main_thread 状态的步骤
          // running 状态表示正在执行中，跳过
          if (step.status !== 'pending_main_thread') {
            continue;
          }

          // 检查是否已在执行队列中
          if (this.executingSteps.has(step.id)) {
            continue;
          }

          // 检查画布是否可用（Canvas 工具需要画布）
          const board = getCapabilitiesBoard();
          if (!board) {
            // 画布未加载，跳过执行，等待下一次轮询
            // 不打印日志避免刷屏
            continue;
          }

          // 标记为正在执行，防止重复执行
          this.executingSteps.add(step.id);

          // 异步执行步骤
          this.executeStep(workflow, step).finally(() => {
            this.executingSteps.delete(step.id);
          });
        }
      }
    } catch (error) {
      console.error('[WorkflowPollingService] ❌ Polling error:', error);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * 获取所有工作流
   */
  private getAllWorkflows(): Promise<Workflow[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve([]);
        return;
      }

      try {
        const transaction = this.db.transaction(WORKFLOWS_STORE, 'readonly');
        const store = transaction.objectStore(WORKFLOWS_STORE);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      } catch (error) {
        // Store 可能不存在
        resolve([]);
      }
    });
  }

  /**
   * 执行步骤
   */
  private async executeStep(workflow: Workflow, step: WorkflowStep): Promise<void> {
    // 再次检查步骤状态，避免重复执行
    // （可能在等待执行期间已经被其他地方处理）
    if (step.status !== 'pending_main_thread') {
      console.log(`[WorkflowPollingService] ⏭️ Step already processed: ${step.id}, status: ${step.status}`);
      return;
    }

    console.log(`[WorkflowPollingService] 🔧 Executing step: ${step.mcp}`, {
      workflowId: workflow.id,
      stepId: step.id,
      boardId: workflow.initiatorBoardId,
    });

    // 先将状态改为 running，防止重复执行
    step.status = 'running' as WorkflowStepStatus;
    await this.updateWorkflow(workflow);

    const startTime = Date.now();

    try {
      // 使用 swCapabilitiesHandler 执行
      const result = await swCapabilitiesHandler.execute({
        operation: step.mcp,
        args: step.args,
      });

      if (result.success) {
        step.status = 'completed';
        step.result = result.data;
        step.duration = Date.now() - startTime;

        console.log(`[WorkflowPollingService] ✅ Step completed: ${step.mcp}`);
        
        // 通知 UI 步骤完成
        workflowSubmissionService.notifyStepUpdate(
          workflow.id, step.id, 'completed', step.result, undefined, step.duration
        );
      } else if (result.error === '画布未初始化') {
        // 画布未初始化，保持 pending_main_thread 状态，等待下一次轮询
        console.log(`[WorkflowPollingService] ⏳ Board not ready, will retry: ${step.mcp}`);
        return; // 不更新工作流，不检查完成状态
      } else {
        step.status = 'failed';
        step.error = result.error;
        step.duration = Date.now() - startTime;

        console.error(`[WorkflowPollingService] ❌ Step failed: ${step.mcp}`, result.error);
        
        // 通知 UI 步骤失败
        workflowSubmissionService.notifyStepUpdate(
          workflow.id, step.id, 'failed', undefined, step.error, step.duration
        );
      }
    } catch (error: any) {
      // 画布未初始化错误，保持 pending_main_thread 状态
      if (error.message === '画布未初始化') {
        console.log(`[WorkflowPollingService] ⏳ Board not ready, will retry: ${step.mcp}`);
        return;
      }

      step.status = 'failed';
      step.error = error.message || 'Unknown error';
      step.duration = Date.now() - startTime;

      console.error(`[WorkflowPollingService] ❌ Step execution error: ${step.mcp}`, error);
      
      // 通知 UI 步骤失败
      workflowSubmissionService.notifyStepUpdate(
        workflow.id, step.id, 'failed', undefined, step.error, step.duration
      );
    }

    // 更新工作流到 IndexedDB
    await this.updateWorkflow(workflow);

    // 检查工作流是否完成
    await this.checkWorkflowCompletion(workflow);
  }

  /**
   * 更新工作流到 IndexedDB
   */
  private async updateWorkflow(workflow: Workflow): Promise<void> {
    if (!this.db) {
      console.error('[WorkflowPollingService] ❌ Cannot update workflow: DB not available');
      return;
    }

    workflow.updatedAt = Date.now();

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(WORKFLOWS_STORE, 'readwrite');
        const store = transaction.objectStore(WORKFLOWS_STORE);
        const request = store.put(workflow);

        request.onsuccess = () => {
          console.log(`[WorkflowPollingService] 💾 Workflow updated: ${workflow.id}`, {
            stepsStatus: workflow.steps.map(s => ({ id: s.id, status: s.status })),
          });
          resolve();
        };
        request.onerror = () => {
          console.error('[WorkflowPollingService] ❌ Failed to update workflow:', request.error);
          reject(request.error);
        };
        
        // 等待事务完成
        transaction.oncomplete = () => {
          // 事务完成，数据已持久化
        };
      } catch (error) {
        console.error('[WorkflowPollingService] ❌ Error updating workflow:', error);
        reject(error);
      }
    });
  }

  /**
   * 检查工作流是否完成
   */
  private async checkWorkflowCompletion(workflow: Workflow): Promise<void> {
    const allDone = workflow.steps.every(
      (s) => s.status === 'completed' || s.status === 'failed' || s.status === 'skipped'
    );

    if (allDone) {
      const hasFailed = workflow.steps.some((s) => s.status === 'failed');
      workflow.status = hasFailed ? 'failed' : 'completed';
      workflow.completedAt = Date.now();

      if (hasFailed) {
        const failedStep = workflow.steps.find((s) => s.status === 'failed');
        workflow.error = failedStep?.error;
      }

      await this.updateWorkflow(workflow);

      console.log(`[WorkflowPollingService] 🏁 Workflow ${workflow.status}: ${workflow.id}`);

      // 通知 UI 工作流完成/失败
      if (hasFailed) {
        workflowSubmissionService.notifyWorkflowFailed(workflow.id, workflow.error || 'Unknown error');
      } else {
        // 转换为 WorkflowDefinition 格式
        const workflowDef: WorkflowDefinition = {
          id: workflow.id,
          name: workflow.name || '',
          steps: workflow.steps.map(s => ({
            id: s.id,
            mcp: s.mcp,
            args: s.args,
            description: s.description || '',
            status: s.status as 'pending' | 'running' | 'completed' | 'failed' | 'skipped',
            result: s.result,
            error: s.error,
            duration: s.duration,
            options: s.options,
          })),
          status: workflow.status as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
          completedAt: workflow.completedAt,
          error: workflow.error,
          context: workflow.context,
          initiatorBoardId: workflow.initiatorBoardId,
        };
        workflowSubmissionService.notifyWorkflowCompleted(workflow.id, workflowDef);
      }
    }
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.stop();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// 单例导出
export const workflowPollingService = new WorkflowPollingService();
