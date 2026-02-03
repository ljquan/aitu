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
 * Updated: Now fully uses postmessage-duplex via SWChannelClient for all SW communication.
 */

import { Subject, Observable, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import type { ParsedGenerationParams } from '../utils/ai-input-parser';
import { isAuthError, dispatchApiAuthError } from '../utils/api-auth-error-event';
import {
  swChannelClient,
  type SWChannelEventHandlers,
} from './sw-channel/client';
import { swTaskQueueService } from './sw-task-queue-service';
import type {
  WorkflowDefinition as ChannelWorkflowDefinition,
  WorkflowStatusEvent as ChannelWorkflowStatusEvent,
  WorkflowStepStatusEvent as ChannelWorkflowStepStatusEvent,
  WorkflowCompletedEvent as ChannelWorkflowCompletedEvent,
  WorkflowFailedEvent as ChannelWorkflowFailedEvent,
  WorkflowStepsAddedEvent as ChannelWorkflowStepsAddedEvent,
  CanvasOperationRequestEvent as ChannelCanvasRequestEvent,
  MainThreadToolRequestEvent as ChannelToolRequestEvent,
  WorkflowRecoveredEvent as ChannelWorkflowRecoveredEvent,
  MainThreadToolResponse,
} from './sw-channel/types';
import { swCapabilitiesHandler } from './sw-capabilities';
import { workflowStorageReader } from './workflow-storage-reader';

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
  private initialized = false;

  /**
   * Initialize the service (call once on app startup)
   * Sets up event handlers for workflow events from SWChannelClient
   */
  init(): void {
    if (this.initialized) return;
    if (!navigator.serviceWorker) {
      console.warn('[WorkflowSubmissionService] Service Worker not supported');
      return;
    }

    // Set up event handlers for workflow events via SWChannelClient
    const eventHandlers: SWChannelEventHandlers = {
      onWorkflowStatus: (event) => this.handleWorkflowStatus(event),
      onWorkflowStepStatus: (event) => this.handleStepStatus(event),
      onWorkflowCompleted: (event) => this.handleWorkflowCompleted(event),
      onWorkflowFailed: (event) => this.handleWorkflowFailed(event),
      onWorkflowStepsAdded: (event) => this.handleWorkflowStepsAdded(event),
      onToolRequest: (event) => this.handleToolRequest(event),
      onWorkflowRecovered: (event) => this.handleWorkflowRecovered(event),
    };

    swChannelClient.setEventHandlers(eventHandlers);

    // Register tool request handler for direct response
    // This allows SW to send tool request and receive response directly,
    // reducing one round trip compared to the old workflow:respondTool approach
    this.registerToolRequestHandler();

    this.initialized = true;
  }

  /**
   * Register tool request handler for direct response
   * SW calls this via publish('workflow:toolRequest') and receives response directly
   */
  private registerToolRequestHandler(): void {
    // Wait for swChannelClient to be initialized
    const tryRegister = () => {
      if (!swChannelClient.isInitialized()) {
        setTimeout(tryRegister, 100);
        return;
      }

      swChannelClient.registerToolRequestHandler(async (request) => {
        try {
          // Execute the tool using swCapabilitiesHandler
          const result = await swCapabilitiesHandler.execute({
            operation: request.toolName,
            args: request.args,
          });

          // Convert CapabilityResult to MainThreadToolResponse format
          return {
            success: result.success,
            result: result.data,
            error: result.error,
            taskId: result.taskId,
            taskIds: result.taskIds,
            addSteps: result.addSteps as MainThreadToolResponse['addSteps'],
          };
        } catch (error) {
          console.error('[WorkflowSubmissionService] Tool request handler error:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });
    };

    tryRegister();
  }

  /**
   * Destroy the service
   */
  destroy(): void {
    this.events$.complete();
    this.initialized = false;
  }

  /**
   * Recover workflow states after page refresh
   * Call this after initialization to restore all workflows from IndexedDB
   * This includes failed workflows (e.g., interrupted by SW restart during ai_analyze)
   */
  async recoverWorkflows(): Promise<WorkflowDefinition[]> {
    try {
      // 优先直接从 IndexedDB 读取，避免 postMessage 通信
      let workflows: WorkflowDefinition[] = [];
      
      if (await workflowStorageReader.isAvailable()) {
        workflows = await workflowStorageReader.getAllWorkflows();
      } else if (swChannelClient.isInitialized()) {
        // Fallback: 通过 RPC 获取
        const response = await swChannelClient.getAllWorkflows();
        if (response.success) {
          workflows = response.workflows as unknown as WorkflowDefinition[];
        }
      }
      
      if (workflows.length === 0) {
        return [];
      }
      
      // Sync all workflows to local cache (including failed/completed)
      // This ensures UI shows correct status for interrupted workflows
      for (const workflow of workflows) {
        const existingWorkflow = this.workflows.get(workflow.id);
        // Only update if data is newer or workflow doesn't exist locally
        if (!existingWorkflow || workflow.updatedAt > (existingWorkflow.updatedAt || 0)) {
          this.workflows.set(workflow.id, workflow);
          
          // Emit status event for failed workflows so UI can update
          if (workflow.status === 'failed' && existingWorkflow?.status !== 'failed' && this.events$) {
            this.events$.next({
              type: 'failed',
              workflowId: workflow.id,
              error: workflow.error || 'Unknown error',
            });
          }
        }
      }
      
      // Return running/pending workflows for callers that need them
      return workflows.filter(w => w.status === 'running' || w.status === 'pending');
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
   * 包含超时处理和自动重连逻辑
   */
  async submit(workflow: WorkflowDefinition): Promise<void> {
    const maxRetries = 2;
    const submitTimeout = 15000; // 15 秒超时，比默认的 120 秒更合理
    
    // 尝试初始化 SW（如果未初始化）
    const ensureSWReady = async (): Promise<boolean> => {
      if (!swChannelClient.isInitialized()) {
        // 尝试重新初始化 swChannelClient
        try {
          await swChannelClient.initialize();
        } catch {
          return false;
        }
      }
      
      if (!swTaskQueueService.isInitialized()) {
        const initSuccess = await swTaskQueueService.initializeSW();
        if (!initSuccess) {
          return false;
        }
      }
      
      return true;
    };
    
    // 带超时的提交
    const submitWithTimeout = async (): Promise<{ success: boolean; error?: string }> => {
      return Promise.race([
        swChannelClient.submitWorkflow(workflow as unknown as ChannelWorkflowDefinition),
        new Promise<{ success: boolean; error: string }>((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), submitTimeout)
        )
      ]);
    };

    // Store locally
    this.workflows.set(workflow.id, workflow);

    // 工作流变更时清除读取缓存
    workflowStorageReader.invalidateCache();

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // 确保 SW 已就绪
        const isReady = await ensureSWReady();
        if (!isReady) {
          lastError = new Error('Failed to initialize Service Worker');
          continue;
        }

        // 尝试提交
        const result = await submitWithTimeout();
        
        // 如果 SW 端返回 "Workflow executor not initialized"，重新初始化并重试
        if (!result.success && result.error?.includes('not initialized')) {
          const reinitSuccess = await swTaskQueueService.initializeSW();
          if (reinitSuccess) {
            const retryResult = await submitWithTimeout();
            if (retryResult.success) {
              return; // 成功
            }
            lastError = new Error(retryResult.error || 'Submit workflow failed');
          }
          continue;
        }
        
        if (result.success) {
          return; // 成功
        }
        
        lastError = new Error(result.error || 'Submit workflow failed');
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // 如果是超时，尝试重新初始化连接
        if (lastError.message === 'timeout' && attempt < maxRetries - 1) {
          console.warn('[WorkflowSubmissionService] Submit timeout, reinitializing SW connection...');
          try {
            // 重置 SW 连接
            await swChannelClient.initialize();
            await swTaskQueueService.initializeSW();
          } catch {
            // 忽略重新初始化错误
          }
        }
      }
    }

    // 所有尝试都失败
    this.workflows.delete(workflow.id);
    throw lastError || new Error('Submit workflow failed after retries');
  }

  /**
   * Cancel a workflow
   */
  async cancel(workflowId: string): Promise<void> {
    if (!swChannelClient.isInitialized()) return;
    workflowStorageReader.invalidateCache();
    await swChannelClient.cancelWorkflow(workflowId);
  }

  /**
   * Get workflow by ID
   */
  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Query workflow status (returns full workflow data)
   * 优先直接从 IndexedDB 读取
   */
  async queryWorkflowStatus(workflowId: string): Promise<WorkflowDefinition | null> {
    try {
      // 优先直接从 IndexedDB 读取
      if (await workflowStorageReader.isAvailable()) {
        const workflow = await workflowStorageReader.getWorkflow(workflowId);
        if (workflow) {
          this.workflows.set(workflowId, workflow);
          return workflow;
        }
      } else if (swChannelClient.isInitialized()) {
        // Fallback: 通过 RPC 获取
        const response = await swChannelClient.getWorkflowStatus(workflowId);
        if (response.success && response.workflow) {
          this.workflows.set(workflowId, response.workflow as unknown as WorkflowDefinition);
          return response.workflow as unknown as WorkflowDefinition;
        }
      }
    } catch (error) {
      console.warn('[WorkflowSubmissionService] Failed to query workflow status:', error);
    }
    
    return this.workflows.get(workflowId) || null;
  }

  /**
   * Query all workflows
   * 优先直接从 IndexedDB 读取
   */
  async queryAllWorkflows(): Promise<WorkflowDefinition[]> {
    try {
      // 优先直接从 IndexedDB 读取
      if (await workflowStorageReader.isAvailable()) {
        const workflows = await workflowStorageReader.getAllWorkflows();
        for (const workflow of workflows) {
          this.workflows.set(workflow.id, workflow);
        }
        return workflows;
      } else if (swChannelClient.isInitialized()) {
        // Fallback: 通过 RPC 获取
        const response = await swChannelClient.getAllWorkflows();
        if (response.success) {
          for (const workflow of response.workflows) {
            this.workflows.set(workflow.id, workflow as unknown as WorkflowDefinition);
          }
          return response.workflows as unknown as WorkflowDefinition[];
        }
      }
    } catch (error) {
      console.warn('[WorkflowSubmissionService] Failed to query all workflows:', error);
    }
    
    return Array.from(this.workflows.values());
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

  // 保存待注册的 Canvas 处理器（用于延迟注册）
  private pendingCanvasHandler: ((operation: string, params: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>) | null = null;

  /**
   * 注册 Canvas 操作处理器（双工通讯模式）
   * SW 发起 canvas:execute 请求，主线程处理并直接返回结果
   * 
   * @param handler 处理函数，接收 operation 和 params，返回 { success, error? }
   */
  registerCanvasHandler(
    handler: (operation: string, params: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
  ): void {
    if (!swChannelClient.isInitialized()) {
      // 保存处理器，等待 swChannelClient 初始化后注册
      this.pendingCanvasHandler = handler;
      // 启动轮询检查
      this.waitForClientAndRegister();
      return;
    }
    
    swChannelClient.registerCanvasOperationHandler(handler);
  }

  /**
   * 等待 swChannelClient 初始化后注册 Canvas 处理器
   */
  private waitForClientAndRegister(): void {
    const checkAndRegister = () => {
      if (swChannelClient.isInitialized() && this.pendingCanvasHandler) {
        swChannelClient.registerCanvasOperationHandler(this.pendingCanvasHandler);
        this.pendingCanvasHandler = null;
      } else if (this.pendingCanvasHandler) {
        // 继续等待，最多等 30 秒
        setTimeout(checkAndRegister, 500);
      }
    };
    checkAndRegister();
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
   * @deprecated Use registerToolRequestHandler in init() for direct response instead.
   * The new approach reduces one round trip by returning results directly in the subscribe callback.
   * This method is kept for backward compatibility but may be removed in future versions.
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
    console.warn('[WorkflowSubmissionService] respondToToolRequest is deprecated. Tool responses are now handled via registerToolRequestHandler.');
    if (!swChannelClient.isInitialized()) return;

    await swChannelClient.respondToToolRequest(requestId, success, result, error, addSteps);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

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

  private handleWorkflowStatus(event: ChannelWorkflowStatusEvent): void {
    const workflow = this.getMutableWorkflow(event.workflowId);
    if (workflow) {
      workflow.status = event.status as WorkflowDefinition['status'];
      workflow.updatedAt = event.updatedAt;
    }

    this.events$.next({
      type: 'status',
      workflowId: event.workflowId,
      status: event.status as WorkflowDefinition['status'],
    });
  }

  private handleStepStatus(event: ChannelWorkflowStepStatusEvent): void {
    const workflow = this.getMutableWorkflow(event.workflowId);
    if (workflow) {
      const step = workflow.steps.find((s) => s.id === event.stepId);
      if (step) {
        step.status = event.status as WorkflowStepStatus;
        step.result = event.result;
        step.error = event.error;
        step.duration = event.duration;
      }
    }

    this.events$.next({
      type: 'step',
      workflowId: event.workflowId,
      stepId: event.stepId,
      status: event.status as WorkflowStepStatus,
      result: event.result,
      error: event.error,
      duration: event.duration,
    });
  }

  private handleWorkflowCompleted(event: ChannelWorkflowCompletedEvent): void {
    if (event.workflow) {
      // Clone to ensure mutability
      this.workflows.set(event.workflowId, this.cloneWorkflow(event.workflow as unknown as WorkflowDefinition));
    }

    this.events$.next({
      type: 'completed',
      workflowId: event.workflowId,
      workflow: event.workflow as unknown as WorkflowDefinition,
    });

    // Schedule cleanup to prevent memory leak (keep for 5 minutes for potential queries)
    this.scheduleWorkflowCleanup(event.workflowId);
  }

  private handleWorkflowFailed(event: ChannelWorkflowFailedEvent): void {
    const workflow = this.getMutableWorkflow(event.workflowId);
    if (workflow) {
      workflow.status = 'failed';
      workflow.error = event.error;
    }

    // 检测 401 认证错误，触发打开设置对话框
    if (event.error && isAuthError(event.error)) {
      dispatchApiAuthError({ message: event.error, source: 'workflow' });
    }

    this.events$.next({
      type: 'failed',
      workflowId: event.workflowId,
      error: event.error,
    });

    // Schedule cleanup to prevent memory leak
    this.scheduleWorkflowCleanup(event.workflowId);
  }

  private handleWorkflowStepsAdded(event: ChannelWorkflowStepsAddedEvent): void {
    const workflow = this.workflows.get(event.workflowId);
    if (workflow && event.steps) {
      // Add new steps to local workflow
      for (const step of event.steps) {
        if (!workflow.steps.find(s => s.id === step.id)) {
          workflow.steps.push({
            id: step.id,
            mcp: step.mcp,
            args: step.args,
            description: step.description,
            status: step.status as WorkflowStepStatus,
          });
        }
      }

      // Emit event to notify UI about new steps
      this.events$.next({
        type: 'steps_added',
        workflowId: event.workflowId,
        steps: event.steps as WorkflowStepsAddedEvent['steps'],
      });
    }
  }

  private handleToolRequest(event: ChannelToolRequestEvent): void {
    this.events$.next({
      type: 'main_thread_tool_request',
      requestId: event.requestId,
      workflowId: event.workflowId,
      stepId: event.stepId,
      toolName: event.toolName,
      args: event.args,
    });
  }

  private handleWorkflowRecovered(event: ChannelWorkflowRecoveredEvent): void {
    if (event.workflow) {
      this.workflows.set(event.workflowId, event.workflow as unknown as WorkflowDefinition);
      
      this.events$.next({
        type: 'recovered',
        workflowId: event.workflowId,
        workflow: event.workflow as unknown as WorkflowDefinition,
      });
    }
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
