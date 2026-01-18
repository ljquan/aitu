/**
 * Workflow Bridge Service
 * 
 * 基于DuplexBridge的工作流通讯服务
 * 支持工作流提交、状态查询、状态恢复和实时更新订阅
 */

import { Subject, Observable, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { DuplexBridge, getDuplexBridge } from './duplex-bridge';

// ============================================================================
// 类型定义
// ============================================================================

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface WorkflowStep {
  id: string;
  mcp: string;
  args: Record<string, unknown>;
  description: string;
  status: WorkflowStepStatus;
  result?: unknown;
  error?: string;
  duration?: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  steps: WorkflowStep[];
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
    referenceImages?: string[];
  };
}

export interface WorkflowStatusEvent {
  type: 'status';
  workflowId: string;
  status: WorkflowStatus;
}

export interface WorkflowStepEvent {
  type: 'step';
  workflowId: string;
  stepId: string;
  status: WorkflowStepStatus;
  result?: unknown;
  error?: string;
  duration?: number;
}

export interface WorkflowCompletedEvent {
  type: 'completed';
  workflowId: string;
  workflow: WorkflowDefinition;
}

export interface WorkflowFailedEvent {
  type: 'failed';
  workflowId: string;
  error: string;
}

export interface WorkflowStepsAddedEvent {
  type: 'steps_added';
  workflowId: string;
  steps: WorkflowStep[];
}

export interface WorkflowRecoveredEvent {
  type: 'recovered';
  workflowId: string;
  workflow: WorkflowDefinition;
}

export type WorkflowEvent =
  | WorkflowStatusEvent
  | WorkflowStepEvent
  | WorkflowCompletedEvent
  | WorkflowFailedEvent
  | WorkflowStepsAddedEvent
  | WorkflowRecoveredEvent;

// ============================================================================
// WorkflowBridge 类
// ============================================================================

export class WorkflowBridge {
  private static instance: WorkflowBridge | null = null;
  
  private bridge: DuplexBridge;
  private events$ = new Subject<WorkflowEvent>();
  private workflows = new Map<string, WorkflowDefinition>();
  private initialized = false;
  private subscriptions: Subscription[] = [];

  private constructor() {
    this.bridge = getDuplexBridge();
    this.setupEventListeners();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): WorkflowBridge {
    if (!WorkflowBridge.instance) {
      WorkflowBridge.instance = new WorkflowBridge();
    }
    return WorkflowBridge.instance;
  }

  /**
   * 初始化工作流桥接
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // 确保DuplexBridge已初始化
    if (!this.bridge.isInitialized()) {
      console.warn('[WorkflowBridge] DuplexBridge not initialized');
      return;
    }

    this.initialized = true;

    // 尝试恢复工作流状态
    await this.recoverWorkflows();
  }

  /**
   * 提交工作流
   */
  async submit(workflow: WorkflowDefinition): Promise<void> {
    if (!this.bridge.isConnected()) {
      throw new Error('Service Worker not connected');
    }

    // 存储到本地
    this.workflows.set(workflow.id, workflow);

    // 发送到SW
    await this.bridge.sendMessage({
      type: 'WORKFLOW_SUBMIT',
      workflow,
    });

  }

  /**
   * 取消工作流
   */
  async cancel(workflowId: string): Promise<void> {
    await this.bridge.sendMessage({
      type: 'WORKFLOW_CANCEL',
      workflowId,
    });
  }

  /**
   * 获取工作流状态
   */
  async getWorkflowStatus(workflowId: string): Promise<WorkflowDefinition | null> {
    // 先检查本地缓存
    const cached = this.workflows.get(workflowId);
    
    // 从SW查询最新状态
    this.bridge.sendMessage({
      type: 'WORKFLOW_GET_STATUS',
      workflowId,
    });

    // 等待响应
    try {
      const response = await this.bridge.waitForMessage(
        'WORKFLOW_STATUS_RESPONSE',
        5000
      ) as any;
      
      if (response.workflow) {
        this.workflows.set(workflowId, response.workflow);
        return response.workflow;
      }
      return cached || null;
    } catch {
      return cached || null;
    }
  }

  /**
   * 获取所有工作流
   */
  async getAllWorkflows(): Promise<WorkflowDefinition[]> {
    this.bridge.sendMessage({ type: 'WORKFLOW_GET_ALL' });

    try {
      const response = await this.bridge.waitForMessage(
        'WORKFLOW_ALL_RESPONSE',
        5000
      ) as any;
      
      if (response.workflows) {
        // 更新本地缓存
        for (const workflow of response.workflows) {
          this.workflows.set(workflow.id, workflow);
        }
        return response.workflows;
      }
      return Array.from(this.workflows.values());
    } catch {
      return Array.from(this.workflows.values());
    }
  }

  /**
   * 获取本地缓存的工作流
   */
  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * 获取所有本地缓存的工作流
   */
  getCachedWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * 获取运行中的工作流
   */
  getRunningWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values())
      .filter(w => w.status === 'running' || w.status === 'pending');
  }

  /**
   * 订阅所有工作流事件
   */
  get events(): Observable<WorkflowEvent> {
    return this.events$.asObservable();
  }

  /**
   * 订阅特定工作流的事件
   */
  subscribeToWorkflow(
    workflowId: string,
    callback: (event: WorkflowEvent) => void
  ): Subscription {
    return this.events$.pipe(
      filter((event) => (event as any).workflowId === workflowId)
    ).subscribe(callback);
  }

  /**
   * 恢复工作流状态（页面刷新后调用）
   */
  async recoverWorkflows(): Promise<WorkflowDefinition[]> {
    try {
      const workflows = await this.getAllWorkflows();
      
      // 对于运行中的工作流，触发恢复事件
      const runningWorkflows = workflows.filter(
        w => w.status === 'running' || w.status === 'pending'
      );

      for (const workflow of runningWorkflows) {
        this.events$.next({
          type: 'recovered',
          workflowId: workflow.id,
          workflow,
        });
      }

      return workflows;
    } catch (error) {
      console.warn('[WorkflowBridge] Failed to recover workflows:', error);
      return [];
    }
  }

  /**
   * 销毁实例
   */
  destroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
    this.events$.complete();
    this.workflows.clear();
    this.initialized = false;
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 设置事件监听器
   */
  /**
   * Deep clone a workflow to make it mutable
   */
  private cloneWorkflow(workflow: WorkflowDefinition): WorkflowDefinition {
    return JSON.parse(JSON.stringify(workflow));
  }

  /**
   * Get or create a mutable workflow from cache
   */
  private getMutableWorkflow(workflowId: string): WorkflowDefinition | undefined {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return undefined;
    
    // Clone to ensure mutability
    const mutableWorkflow = this.cloneWorkflow(workflow);
    this.workflows.set(workflowId, mutableWorkflow);
    return mutableWorkflow;
  }

  private setupEventListeners(): void {
    // 监听工作流状态更新
    const statusSub = this.bridge.onMessage('WORKFLOW_STATUS').subscribe((msg) => {
      const workflow = this.getMutableWorkflow(msg.workflowId);
      if (workflow) {
        workflow.status = msg.status;
        workflow.updatedAt = msg.updatedAt || Date.now();
      }
      this.events$.next({
        type: 'status',
        workflowId: msg.workflowId,
        status: msg.status,
      });
    });
    this.subscriptions.push(statusSub);

    // 监听步骤状态更新
    const stepSub = this.bridge.onMessage('WORKFLOW_STEP_STATUS').subscribe((msg) => {
      const workflow = this.getMutableWorkflow(msg.workflowId);
      if (workflow) {
        const step = workflow.steps.find(s => s.id === msg.stepId);
        if (step) {
          step.status = msg.status;
          step.result = msg.result;
          step.error = msg.error;
          step.duration = msg.duration;
        }
      }
      this.events$.next({
        type: 'step',
        workflowId: msg.workflowId,
        stepId: msg.stepId,
        status: msg.status,
        result: msg.result,
        error: msg.error,
        duration: msg.duration,
      });
    });
    this.subscriptions.push(stepSub);

    // 监听工作流完成
    const completedSub = this.bridge.onMessage('WORKFLOW_COMPLETED').subscribe((msg) => {
      if (msg.workflow) {
        // Clone to ensure mutability
        this.workflows.set(msg.workflowId, this.cloneWorkflow(msg.workflow));
      }
      this.events$.next({
        type: 'completed',
        workflowId: msg.workflowId,
        workflow: msg.workflow,
      });
    });
    this.subscriptions.push(completedSub);

    // 监听工作流失败
    const failedSub = this.bridge.onMessage('WORKFLOW_FAILED').subscribe((msg) => {
      const workflow = this.getMutableWorkflow(msg.workflowId);
      if (workflow) {
        workflow.status = 'failed';
        workflow.error = msg.error;
      }
      this.events$.next({
        type: 'failed',
        workflowId: msg.workflowId,
        error: msg.error,
      });
    });
    this.subscriptions.push(failedSub);

    // 监听步骤添加
    const stepsAddedSub = this.bridge.onMessage('WORKFLOW_STEPS_ADDED').subscribe((msg) => {
      const workflow = this.getMutableWorkflow(msg.workflowId);
      if (workflow && msg.steps) {
        for (const step of msg.steps) {
          if (!workflow.steps.find(s => s.id === step.id)) {
            workflow.steps.push(step);
          }
        }
      }
      this.events$.next({
        type: 'steps_added',
        workflowId: msg.workflowId,
        steps: msg.steps,
      });
    });
    this.subscriptions.push(stepsAddedSub);

    // 监听工作流恢复
    const recoveredSub = this.bridge.onMessage('WORKFLOW_RECOVERED').subscribe((msg) => {
      if (msg.workflow) {
        this.workflows.set(msg.workflowId, msg.workflow);
        this.events$.next({
          type: 'recovered',
          workflowId: msg.workflowId,
          workflow: msg.workflow,
        });
      }
    });
    this.subscriptions.push(recoveredSub);

    // 监听所有工作流响应（用于恢复）
    const allResponseSub = this.bridge.onMessage('WORKFLOW_ALL_RESPONSE').subscribe((msg) => {
      if (msg.workflows) {
        for (const workflow of msg.workflows) {
          this.workflows.set(workflow.id, workflow);
        }
      }
    });
    this.subscriptions.push(allResponseSub);
  }
}

// 导出单例获取函数
export function getWorkflowBridge(): WorkflowBridge {
  return WorkflowBridge.getInstance();
}
