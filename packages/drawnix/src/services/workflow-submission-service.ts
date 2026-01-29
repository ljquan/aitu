/**
 * Workflow Submission Service
 *
 * Simplified service for submitting workflows to Service Worker.
 * This replaces the complex workflow execution logic in AIInputBar.
 *
 * Architecture:
 * - Application layer: Build workflow definition → Submit to SW → Listen for updates
 * - Service Worker: Execute workflow → Call MCP tools → Broadcast status updates
 * 
 * Updated: Now integrates with DuplexBridge for improved communication and state recovery.
 */

import { Subject, Observable, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import type { ParsedGenerationParams } from '../utils/ai-input-parser';
import { isAuthError, dispatchApiAuthError } from '../utils/api-auth-error-event';
import {
  WorkflowBridge,
  getWorkflowBridge,
  type WorkflowEvent as BridgeWorkflowEvent,
} from './duplex-communication/bridge';

// ============================================================================
// Types
// ============================================================================

export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface WorkflowStepOptions {
  mode?: 'async' | 'queue';
  batchId?: string;
  batchIndex?: number;
  batchTotal?: number;
  globalIndex?: number;
}

export interface WorkflowStep {
  id: string;
  mcp: string;
  args: Record<string, unknown>;
  description: string;
  status: WorkflowStepStatus;
  result?: unknown;
  error?: string;
  duration?: number;
  options?: WorkflowStepOptions;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  steps: WorkflowStep[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
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

// Events emitted by the service
export interface WorkflowStatusEvent {
  type: 'status';
  workflowId: string;
  status: WorkflowDefinition['status'];
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

export interface CanvasInsertEvent {
  type: 'canvas_insert';
  requestId: string;
  operation: 'insert_image' | 'insert_video' | 'insert_text' | 'canvas_insert';
  params: {
    url?: string;
    content?: string;
    position?: { x: number; y: number };
    items?: Array<{ type: string; url?: string; content?: string }>;
  };
}

/**
 * Main thread tool request event
 * SW requests main thread to execute a tool
 */
export interface MainThreadToolRequestEvent {
  type: 'main_thread_tool_request';
  requestId: string;
  workflowId: string;
  stepId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface WorkflowStepsAddedEvent {
  type: 'steps_added';
  workflowId: string;
  steps: Array<{
    id: string;
    mcp: string;
    args: Record<string, unknown>;
    description: string;
    status: WorkflowStepStatus;
  }>;
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
  | CanvasInsertEvent
  | MainThreadToolRequestEvent
  | WorkflowStepsAddedEvent
  | WorkflowRecoveredEvent;

// ============================================================================
// Workflow Submission Service
// ============================================================================

// Cleanup delay: 5 minutes after workflow completes/fails
const WORKFLOW_CLEANUP_DELAY = 5 * 60 * 1000;

class WorkflowSubmissionService {
  private events$ = new Subject<WorkflowEvent>();
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private cleanupTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private initialized = false;
  private workflowBridge: WorkflowBridge | null = null;
  private bridgeSubscription: Subscription | null = null;

  /**
   * Initialize the service (call once on app startup)
   */
  init(): void {
    if (this.initialized) return;
    if (!navigator.serviceWorker) {
      console.warn('[WorkflowSubmissionService] Service Worker not supported');
      return;
    }

    this.messageHandler = (event: MessageEvent) => {
      this.handleSWMessage(event.data);
    };

    navigator.serviceWorker.addEventListener('message', this.messageHandler);
    
    // 初始化WorkflowBridge并订阅事件
    this.workflowBridge = getWorkflowBridge();
    this.bridgeSubscription = this.workflowBridge.events.subscribe((event: BridgeWorkflowEvent) => {
      this.handleBridgeEvent(event);
    });
    
    this.initialized = true;
    // console.log('[WorkflowSubmissionService] Initialized');
  }

  /**
   * Destroy the service
   */
  destroy(): void {
    if (this.messageHandler) {
      navigator.serviceWorker?.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    if (this.bridgeSubscription) {
      this.bridgeSubscription.unsubscribe();
      this.bridgeSubscription = null;
    }
    this.events$.complete();
    this.initialized = false;
  }

  /**
   * Handle events from WorkflowBridge (for state recovery)
   */
  private handleBridgeEvent(event: BridgeWorkflowEvent): void {
    switch (event.type) {
      case 'recovered':
        // 工作流恢复事件 - 更新本地缓存并发送事件
        if (event.workflow) {
          this.workflows.set(event.workflowId, event.workflow as unknown as WorkflowDefinition);
        }
        this.events$.next({
          type: 'recovered',
          workflowId: event.workflowId,
          workflow: event.workflow as unknown as WorkflowDefinition,
        });
        break;
      // 其他事件由原有的消息处理器处理
    }
  }

  /**
   * Recover workflow states after page refresh
   * Call this after initialization to restore running workflows
   */
  async recoverWorkflows(): Promise<WorkflowDefinition[]> {
    if (!this.workflowBridge) {
      console.warn('[WorkflowSubmissionService] WorkflowBridge not initialized');
      return [];
    }

    try {
      const workflows = await this.workflowBridge.recoverWorkflows();
      
      // 更新本地缓存
      for (const workflow of workflows) {
        this.workflows.set(workflow.id, workflow as unknown as WorkflowDefinition);
      }
      
      return workflows as unknown as WorkflowDefinition[];
    } catch (error) {
      console.warn('[WorkflowSubmissionService] Failed to recover workflows:', error);
      return [];
    }
  }

  /**
   * Get running workflows from cache
   */
  getRunningWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values())
      .filter(w => w.status === 'running' || w.status === 'pending');
  }

  /**
   * Create a workflow from parsed AI input
   */
  createWorkflow(
    parsedInput: ParsedGenerationParams,
    referenceImages: string[] = []
  ): WorkflowDefinition {
    const workflowId = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    // Determine MCP tool based on generation type
    const mcpTool = parsedInput.generationType === 'video' ? 'generate_video' : 'generate_image';

    // Build tool arguments
    const args: Record<string, unknown> = {
      prompt: parsedInput.prompt,
      model: parsedInput.modelId,
    };

    if (parsedInput.size) args.size = parsedInput.size;
    if (parsedInput.count && parsedInput.count > 1) args.count = parsedInput.count;
    if (parsedInput.duration) args.seconds = parsedInput.duration;
    if (referenceImages.length > 0) args.referenceImages = referenceImages;

    // Create steps based on count
    const steps: WorkflowStep[] = [];
    const count = parsedInput.count || 1;

    for (let i = 0; i < count; i++) {
      steps.push({
        id: `step_${i}_${Math.random().toString(36).substr(2, 9)}`,
        mcp: mcpTool,
        args: { ...args, count: 1 }, // Each step generates 1 item
        description: parsedInput.generationType === 'video'
          ? `生成视频 ${i + 1}/${count}`
          : `生成图片 ${i + 1}/${count}`,
        status: 'pending',
      });
    }

    const workflow: WorkflowDefinition = {
      id: workflowId,
      name: parsedInput.generationType === 'video' ? '视频生成' : '图片生成',
      steps,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      context: {
        userInput: parsedInput.userInstruction,
        model: parsedInput.modelId,
        params: {
          count: parsedInput.count,
          size: parsedInput.size,
          duration: parsedInput.duration,
        },
        referenceImages,
      },
    };

    return workflow;
  }

  /**
   * Submit a workflow for execution
   */
  async submit(workflow: WorkflowDefinition): Promise<void> {
    const sw = await this.getServiceWorker();
    if (!sw) {
      throw new Error('Service Worker not available');
    }

    // Store locally
    this.workflows.set(workflow.id, workflow);

    // Send to SW
    sw.postMessage({
      type: 'WORKFLOW_SUBMIT',
      workflow,
    });
  }

  /**
   * Cancel a workflow
   */
  async cancel(workflowId: string): Promise<void> {
    const sw = await this.getServiceWorker();
    if (!sw) return;

    sw.postMessage({
      type: 'WORKFLOW_CANCEL',
      workflowId,
    });
  }

  /**
   * Get workflow by ID
   */
  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Query workflow status from SW (returns full workflow data)
   */
  async queryWorkflowStatus(workflowId: string): Promise<WorkflowDefinition | null> {
    const sw = await this.getServiceWorker();
    if (!sw) return null;

    return new Promise((resolve) => {
      // Set up one-time listener for response
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'WORKFLOW_STATUS_RESPONSE' && event.data.workflowId === workflowId) {
          navigator.serviceWorker?.removeEventListener('message', handler);
          if (event.data.workflow) {
            // Update local cache
            this.workflows.set(workflowId, event.data.workflow);
          }
          resolve(event.data.workflow || null);
        }
      };

      navigator.serviceWorker?.addEventListener('message', handler);

      // Set timeout
      setTimeout(() => {
        navigator.serviceWorker?.removeEventListener('message', handler);
        resolve(this.workflows.get(workflowId) || null);
      }, 5000);

      // Send query
      sw.postMessage({
        type: 'WORKFLOW_GET_STATUS',
        workflowId,
      });
    });
  }

  /**
   * Query all workflows from SW
   */
  async queryAllWorkflows(): Promise<WorkflowDefinition[]> {
    const sw = await this.getServiceWorker();
    if (!sw) return Array.from(this.workflows.values());

    return new Promise((resolve) => {
      // Set up one-time listener for response
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'WORKFLOW_ALL_RESPONSE') {
          navigator.serviceWorker?.removeEventListener('message', handler);
          // Update local cache
          for (const workflow of event.data.workflows) {
            this.workflows.set(workflow.id, workflow);
          }
          resolve(event.data.workflows);
        }
      };

      navigator.serviceWorker?.addEventListener('message', handler);

      // Set timeout
      setTimeout(() => {
        navigator.serviceWorker?.removeEventListener('message', handler);
        resolve(Array.from(this.workflows.values()));
      }, 5000);

      // Send query
      sw.postMessage({
        type: 'WORKFLOW_GET_ALL',
      });
    });
  }

  /**
   * Observable of all workflow events
   */
  get events(): Observable<WorkflowEvent> {
    return this.events$.asObservable();
  }

  /**
   * Subscribe to events for a specific workflow
   */
  subscribeToWorkflow(
    workflowId: string,
    callback: (event: WorkflowEvent) => void
  ): Subscription {
    return this.events$.pipe(
      filter((event) => {
        if (event.type === 'canvas_insert') return false;
        return (event as any).workflowId === workflowId;
      })
    ).subscribe(callback);
  }

  /**
   * Subscribe to canvas insert requests
   */
  subscribeToCanvasInserts(
    callback: (event: CanvasInsertEvent) => void
  ): Subscription {
    return this.events$.pipe(
      filter((event): event is CanvasInsertEvent => event.type === 'canvas_insert')
    ).subscribe(callback);
  }

  /**
   * Respond to a canvas insert request
   */
  async respondToCanvasInsert(
    requestId: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    const sw = await this.getServiceWorker();
    if (!sw) return;

    sw.postMessage({
      type: 'CANVAS_OPERATION_RESPONSE',
      requestId,
      success,
      error,
    });
  }

  /**
   * Subscribe to main thread tool requests
   */
  subscribeToToolRequests(
    callback: (event: MainThreadToolRequestEvent) => void
  ): Subscription {
    return this.events$.pipe(
      filter((event): event is MainThreadToolRequestEvent => event.type === 'main_thread_tool_request')
    ).subscribe(callback);
  }

  /**
   * Subscribe to all workflow events (for global state sync)
   * Used by drawnix.tsx to sync WorkZone UI with SW workflow state
   */
  subscribeToAllEvents(
    callback: (event: WorkflowEvent) => void
  ): Subscription {
    return this.events$.subscribe(callback);
  }

  /**
   * Respond to a main thread tool request
   */
  async respondToToolRequest(
    requestId: string,
    success: boolean,
    result?: unknown,
    error?: string,
    addSteps?: Array<{
      id: string;
      mcp: string;
      args: Record<string, unknown>;
      description: string;
      status: WorkflowStepStatus;
    }>
  ): Promise<void> {
    const sw = await this.getServiceWorker();
    if (!sw) return;

    sw.postMessage({
      type: 'MAIN_THREAD_TOOL_RESPONSE',
      requestId,
      success,
      result,
      error,
      addSteps,
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private handleSWMessage(data: any): void {
    if (!data || typeof data !== 'object' || !data.type) return;

    // Only log workflow-related messages
    if (data.type.startsWith('WORKFLOW_')) {
      // console.log('[WorkflowSubmissionService] ◀ Received SW message:', data.type, data.workflowId || '');
    }

    switch (data.type) {
      case 'WORKFLOW_STATUS':
        this.handleWorkflowStatus(data);
        break;

      case 'WORKFLOW_STEP_STATUS':
        this.handleStepStatus(data);
        break;

      case 'WORKFLOW_COMPLETED':
        this.handleWorkflowCompleted(data);
        break;

      case 'WORKFLOW_FAILED':
        this.handleWorkflowFailed(data);
        break;

      case 'CANVAS_OPERATION_REQUEST':
        this.handleCanvasOperation(data);
        break;

      case 'MAIN_THREAD_TOOL_REQUEST':
        this.handleMainThreadToolRequest(data);
        break;

      case 'WORKFLOW_STEPS_ADDED':
        this.handleWorkflowStepsAdded(data);
        break;

      case 'WORKFLOW_RECOVERED':
        this.handleWorkflowRecovered(data);
        break;
    }
  }

  /**
   * Clone a workflow to ensure mutability
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

  private handleWorkflowStatus(data: any): void {
    // console.log('[WorkflowSubmissionService] Workflow status update:', data.workflowId, '->', data.status);
    const workflow = this.getMutableWorkflow(data.workflowId);
    if (workflow) {
      workflow.status = data.status;
      workflow.updatedAt = data.updatedAt || Date.now();
    }

    this.events$.next({
      type: 'status',
      workflowId: data.workflowId,
      status: data.status,
    });
  }

  private handleStepStatus(data: any): void {
    // console.log('[WorkflowSubmissionService] Step status update:', data.stepId, '->', data.status);
    // if (data.error) {
    //   console.error('[WorkflowSubmissionService]   - Error:', data.error);
    // }
    // if (data.result) {
    //   console.log('[WorkflowSubmissionService]   - Result type:', data.result?.type);
    // }

    const workflow = this.getMutableWorkflow(data.workflowId);
    if (workflow) {
      const step = workflow.steps.find((s) => s.id === data.stepId);
      if (step) {
        step.status = data.status;
        step.result = data.result;
        step.error = data.error;
        step.duration = data.duration;
      }
    }

    this.events$.next({
      type: 'step',
      workflowId: data.workflowId,
      stepId: data.stepId,
      status: data.status,
      result: data.result,
      error: data.error,
      duration: data.duration,
    });
  }

  private handleWorkflowCompleted(data: any): void {
    // console.log('[WorkflowSubmissionService] ✓ Workflow completed:', data.workflowId);
    if (data.workflow) {
      // Clone to ensure mutability
      this.workflows.set(data.workflowId, this.cloneWorkflow(data.workflow));
    }

    this.events$.next({
      type: 'completed',
      workflowId: data.workflowId,
      workflow: data.workflow,
    });

    // Schedule cleanup to prevent memory leak (keep for 5 minutes for potential queries)
    this.scheduleWorkflowCleanup(data.workflowId);
  }

  private handleWorkflowFailed(data: any): void {
    console.error('[WorkflowSubmissionService] Workflow failed:', data.workflowId, '-', data.error);
    const workflow = this.getMutableWorkflow(data.workflowId);
    if (workflow) {
      workflow.status = 'failed';
      workflow.error = data.error;
    }

    // 检测 401 认证错误，触发打开设置对话框
    if (data.error && isAuthError(data.error)) {
      dispatchApiAuthError({ message: data.error, source: 'workflow' });
    }

    this.events$.next({
      type: 'failed',
      workflowId: data.workflowId,
      error: data.error,
    });

    // Schedule cleanup to prevent memory leak
    this.scheduleWorkflowCleanup(data.workflowId);
  }

  private handleCanvasOperation(data: any): void {
    this.events$.next({
      type: 'canvas_insert',
      requestId: data.requestId,
      operation: data.operation,
      params: data.params,
    });
  }

  private handleMainThreadToolRequest(data: any): void {
    // console.log('[WorkflowSubmissionService] Main thread tool request:', data.toolName);
    this.events$.next({
      type: 'main_thread_tool_request',
      requestId: data.requestId,
      workflowId: data.workflowId,
      stepId: data.stepId,
      toolName: data.toolName,
      args: data.args,
    });
  }

  private handleWorkflowStepsAdded(data: any): void {
    // console.log('[WorkflowSubmissionService] Workflow steps added:', data.workflowId, data.steps?.length);
    const workflow = this.workflows.get(data.workflowId);
    if (workflow && data.steps) {
      // Add new steps to local workflow
      for (const step of data.steps) {
        if (!workflow.steps.find(s => s.id === step.id)) {
          workflow.steps.push({
            id: step.id,
            mcp: step.mcp,
            args: step.args,
            description: step.description,
            status: step.status,
          });
        }
      }

      // Emit event to notify UI about new steps
      this.events$.next({
        type: 'steps_added',
        workflowId: data.workflowId,
        steps: data.steps,
      });
    }
  }

  private handleWorkflowRecovered(data: any): void {
    if (data.workflow) {
      this.workflows.set(data.workflowId, data.workflow);
      
      this.events$.next({
        type: 'recovered',
        workflowId: data.workflowId,
        workflow: data.workflow,
      });
    }
  }

  private async getServiceWorker(): Promise<ServiceWorker | null> {
    if (!navigator.serviceWorker) return null;
    const registration = await navigator.serviceWorker.ready;
    return registration.active;
  }

  /**
   * Schedule cleanup of a completed/failed workflow to prevent memory leak.
   * Workflows are kept for a short period to allow UI to query them.
   */
  private scheduleWorkflowCleanup(workflowId: string): void {
    // Clear any existing timer for this workflow
    const existingTimer = this.cleanupTimers.get(workflowId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new cleanup
    const timer = setTimeout(() => {
      this.workflows.delete(workflowId);
      this.cleanupTimers.delete(workflowId);
    }, WORKFLOW_CLEANUP_DELAY);

    this.cleanupTimers.set(workflowId, timer);
  }
}

// Export singleton instance
export const workflowSubmissionService = new WorkflowSubmissionService();
