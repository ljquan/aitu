/**
 * Workflow Executor for Service Worker
 *
 * Executes workflows by running MCP tools in sequence.
 * Handles step dependencies, progress tracking, and error handling.
 *
 * Tools are categorized into:
 * 1. SW-executable tools: generate_image, generate_video - run directly in SW
 * 2. Main-thread tools: ai_analyze, canvas_insert - delegated to main thread
 */

import type {
  Workflow,
  WorkflowStep,
  SWMCPToolConfig,
  MainThreadToolResponseMessage,
  WorkflowStepStatus,
  WorkflowSWToMainMessage,
} from './workflow-types';
import type { GeminiConfig, VideoAPIConfig } from './types';
import { TaskExecutionPhase } from './types';
import { getSWMCPTool, requiresMainThread, isCanvasTool, isMediaGenerationTool } from './mcp/tools';
import { executeMCPToolForWorkflow } from './media-executor';
import { taskQueueStorage } from './storage';
import { taskStepRegistry } from './task-step-registry';

/**
 * Workflow executor configuration
 */
export interface WorkflowExecutorConfig {
  geminiConfig: GeminiConfig;
  videoConfig: VideoAPIConfig;
  /** Request main thread to execute a tool */
  requestMainThreadTool?: (
    workflowId: string,
    stepId: string,
    toolName: string,
    args: Record<string, unknown>
  ) => Promise<MainThreadToolResponseMessage>;
}

/**
 * Workflow Executor
 * 通过 channelManager 发送消息，不再直接管理 clientId
 */
export class WorkflowExecutor {
  private workflows: Map<string, Workflow> = new Map();
  private runningWorkflows: Set<string> = new Set();
  private abortControllers: Map<string, AbortController> = new Map();
  private config: WorkflowExecutorConfig;
  /** Pending main thread tool requests */
  private pendingToolRequests: Map<string, {
    resolve: (response: MainThreadToolResponseMessage) => void;
    reject: (error: Error) => void;
    // Store request info for re-sending on page refresh
    requestInfo: {
      requestId: string;
      workflowId: string;
      stepId: string;
      toolName: string;
      args: Record<string, unknown>;
    };
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();


  constructor(config: WorkflowExecutorConfig) {
    this.config = config;
    // Restore workflows from storage asynchronously
    this.restoreFromStorage();
  }

  /**
   * Send message to the client that initiated a workflow
   * 通过 channelManager 发送消息，不再直接管理 clientId
   */
  private async sendToWorkflowClient(workflowId: string, message: WorkflowSWToMainMessage): Promise<void> {
    const { getChannelManager } = await import('./channel-manager');
    const cm = getChannelManager();
    if (!cm) {
      // console.warn(`[WorkflowExecutor] channelManager not available`);
      return;
    }
    
    // 使用 channelManager 的工作流事件方法
    switch (message.type) {
      case 'WORKFLOW_STATUS':
        cm.sendWorkflowStatus(workflowId, message.status);
        break;
      case 'WORKFLOW_STEP_STATUS':
        cm.sendWorkflowStepStatus(workflowId, message.stepId, message.status, message.result, message.error, message.duration);
        break;
      case 'WORKFLOW_COMPLETED':
        cm.sendWorkflowCompleted(workflowId, message.workflow);
        break;
      case 'WORKFLOW_FAILED':
        cm.sendWorkflowFailed(workflowId, message.error!);
        break;
      case 'WORKFLOW_STEPS_ADDED':
        cm.sendWorkflowStepsAdded(workflowId, message.steps);
        break;
      case 'MAIN_THREAD_TOOL_REQUEST':
        // Note: This case is deprecated. New code should use requestMainThreadTool() 
        // which calls cm.sendToolRequest() directly and awaits the response.
        // Keeping for backward compatibility.
        cm.sendToolRequest(workflowId, message.requestId, message.stepId, message.toolName, message.args);
        break;
      default:
        console.warn(`[WorkflowExecutor] Unknown message type: ${message.type}`);
    }
  }

  /**
   * Restore workflows from IndexedDB on SW startup
   * Handles interrupted workflows based on their state
   */
  private async restoreFromStorage(): Promise<void> {
    try {
      // Restore any previously persisted workflows.
      const workflows = await taskQueueStorage.getAllWorkflows();

      for (const workflow of workflows) {
        // Skip completed/cancelled/failed workflows (keep in memory for queries)
        if (workflow.status === 'completed' || workflow.status === 'cancelled' || workflow.status === 'failed') {
          this.workflows.set(workflow.id, workflow);
          // Clean up any orphaned pending tool requests for terminal workflows
          // This handles cases where workflows were incorrectly marked as failed before fix
          await taskQueueStorage.deletePendingToolRequestsByWorkflow(workflow.id);
          continue;
        }

        // Handle interrupted workflows
        if (workflow.status === 'running' || workflow.status === 'pending') {
          await this.handleInterruptedWorkflow(workflow);
        }
      }

      // Note: pending main-thread tool requests are not rehydrated into memory.
      // If the SW restarted, the workflow will have been marked failed above.
    } catch (error) {
      console.error('[WorkflowExecutor] Failed to restore from storage:', error);
    }
  }

  /**
   * Handle a workflow that was interrupted (SW restart/crash)
   * Strategy: Mark as failed with appropriate message
   */
  private async handleInterruptedWorkflow(workflow: Workflow): Promise<void> {

    // Find the step that was running (if any)
    const runningStep = workflow.steps.find(s => s.status === 'running');

    // Mark the workflow as failed
    workflow.status = 'failed';
    workflow.error = runningStep
      ? `工作流在步骤 "${runningStep.description || runningStep.mcp}" 执行时中断，请重试`
      : '工作流执行时中断，请重试';
    workflow.updatedAt = Date.now();

    // Mark running step as failed
    if (runningStep) {
      runningStep.status = 'failed';
      runningStep.error = 'Service Worker 重启导致执行中断';
    }

    // Store in memory
    this.workflows.set(workflow.id, workflow);

    // Update in IndexedDB
    await taskQueueStorage.saveWorkflow(workflow);

    // Clean up any pending tool requests for this workflow
    await taskQueueStorage.deletePendingToolRequestsByWorkflow(workflow.id);

  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<WorkflowExecutorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Handle response from main thread tool execution
   */
  async handleMainThreadToolResponse(response: MainThreadToolResponseMessage): Promise<void> {
    // console.log('[SW-WorkflowExecutor] ◀ Received tool response:', {
    //   requestId: response.requestId,
    //   success: response.success,
    //   hasPending: this.pendingToolRequests.has(response.requestId),
    //   hasAddSteps: !!(response as any).addSteps?.length,
    //   timestamp: new Date().toISOString(),
    // });
    
    const pending = this.pendingToolRequests.get(response.requestId);
    if (pending) {
      // console.log('[SW-WorkflowExecutor] ✓ Resolving pending tool request:', response.requestId);
      this.pendingToolRequests.delete(response.requestId);
      pending.resolve(response);
    } else {
      // Response came after SW restart - need to recover and continue workflow
      // console.log('[SW-WorkflowExecutor] Tool response received after SW restart, attempting recovery:', response.requestId);
      
      // Get the pending request info from IndexedDB
      const storedRequest = await taskQueueStorage.getPendingToolRequest(response.requestId);
      if (!storedRequest) {
        // console.log('[SW-WorkflowExecutor] No stored request found for:', response.requestId);
        return;
      }
      
      // console.log('[SW-WorkflowExecutor] Found stored request:', {
      //   workflowId: storedRequest.workflowId,
      //   stepId: storedRequest.stepId,
      //   toolName: storedRequest.toolName,
      // });
      
      // Get the workflow
      let workflow = this.workflows.get(storedRequest.workflowId);
      if (!workflow) {
        // Try to load from storage
        workflow = await taskQueueStorage.getWorkflow(storedRequest.workflowId);
        if (workflow) {
          this.workflows.set(workflow.id, workflow);
        }
      }
      
      if (!workflow) {
        // console.log('[SW-WorkflowExecutor] Workflow not found:', storedRequest.workflowId);
        await taskQueueStorage.deletePendingToolRequest(response.requestId);
        return;
      }
      
      // Find the step
      const step = workflow.steps.find(s => s.id === storedRequest.stepId);
      if (!step) {
        // console.log('[SW-WorkflowExecutor] Step not found:', storedRequest.stepId);
        await taskQueueStorage.deletePendingToolRequest(response.requestId);
        return;
      }
      
      // Update step with response
      if (response.success) {
        step.status = 'completed';
        step.result = {
          success: true,
          type: 'text',
          data: response.result,
        };
        
        // Handle addSteps (with deduplication)
        const addSteps = (response as any).addSteps;
        if (addSteps && addSteps.length > 0) {
          // console.log('[SW-WorkflowExecutor] Adding', addSteps.length, 'new steps from recovered response');
          
          const actuallyAddedSteps: typeof addSteps = [];
          for (const newStep of addSteps) {
            if (!workflow.steps.find(s => s.id === newStep.id)) {
              workflow.steps.push({
                id: newStep.id,
                mcp: newStep.mcp,
                args: newStep.args,
                description: newStep.description,
                status: newStep.status || 'pending',
              });
              actuallyAddedSteps.push(newStep);
            }
          }
          
          // Only send if we actually added new steps
          if (actuallyAddedSteps.length > 0) {
            this.sendToWorkflowClient(workflow.id, {
              type: 'WORKFLOW_STEPS_ADDED',
              workflowId: workflow.id,
              steps: actuallyAddedSteps,
            } as any);
          }
        }
        
        // Save workflow
        await taskQueueStorage.saveWorkflow(workflow);
        
        // Send step completed to initiating client
        this.sendToWorkflowClient(workflow.id, {
          type: 'WORKFLOW_STEP_STATUS',
          workflowId: workflow.id,
          stepId: step.id,
          status: 'completed',
          result: step.result,
        });
      } else {
        step.status = 'failed';
        step.error = response.error || 'Unknown error';
        step.result = {
          success: false,
          type: 'error',
          error: step.error,
        };
        
        // Save and send failure to initiating client
        await taskQueueStorage.saveWorkflow(workflow);
        this.sendToWorkflowClient(workflow.id, {
          type: 'WORKFLOW_STEP_STATUS',
          workflowId: workflow.id,
          stepId: step.id,
          status: 'failed',
          error: step.error,
        });
        this.sendToWorkflowClient(workflow.id, {
          type: 'WORKFLOW_FAILED',
          workflowId: workflow.id,
          error: step.error,
        });
        
        // Clean up and return
        await taskQueueStorage.deletePendingToolRequest(response.requestId);
        return;
      }
      
      // Clean up the pending request
      await taskQueueStorage.deletePendingToolRequest(response.requestId);
      
      // Continue executing remaining steps
      // console.log('[SW-WorkflowExecutor] Continuing workflow execution after recovery:', workflow.id);
      await this.executeWorkflow(workflow);
    }
  }

  /**
   * Update a workflow step based on task queue status change
   */
  async updateWorkflowStepForTask(
    taskId: string,
    status: 'completed' | 'failed',
    result?: any,
    error?: string
  ): Promise<void> {
    for (const workflow of this.workflows.values()) {
      const step = workflow.steps.find(s => {
        const stepResult = s.result as any;
        return stepResult?.taskId === taskId || stepResult?.taskIds?.includes(taskId);
      });

      if (step) {
        // console.log(`[WorkflowExecutor] Updating step ${step.id} for task ${taskId} to ${status}`);
        
        step.status = status;
        if (status === 'completed' && result) {
          step.result = {
            ...step.result,
            success: true,
            data: result,
          } as any;
        } else if (status === 'failed') {
          step.error = error;
          step.result = {
            ...step.result,
            success: false,
            error,
          } as any;
        }

        step.updatedAt = Date.now();
        workflow.updatedAt = Date.now();

        // Persist change
        await taskQueueStorage.saveWorkflow(workflow);

        // Broadcast update
        this.sendStepStatus(workflow.id, step);

        // If workflow is running, continue execution
        if (workflow.status === 'running') {
          this.executeWorkflow(workflow.id);
        }
        return;
      }
    }
  }

  /**
   * Send all active and recently interrupted workflows to a specific client
   * This is called when a new client connects to sync state
   * 
   * Sends:
   * - Running/pending workflows (need client interaction)
   * - Recently failed workflows (within 5 min, so client knows about interruptions)
   * 
   * channelManager 负责维护 workflowId -> channel 的映射
   * @param clientId The client to send recovered workflows to
   */
  async sendRecoveredWorkflowsToClient(clientId: string): Promise<void> {
    const { getChannelManager } = await import('./channel-manager');
    const cm = getChannelManager();
    if (!cm) return;
    
    const now = Date.now();
    const RECENT_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    
    for (const workflow of this.workflows.values()) {
      // Send active workflows that need client interaction
      if (workflow.status === 'running' || workflow.status === 'pending') {
        cm.sendWorkflowRecoveredToClient(clientId, workflow.id, workflow);
        continue;
      }
      
      // Also send recently failed workflows so client knows about interruptions
      // This helps when ai_analyze was running and SW restarted
      if (workflow.status === 'failed' && workflow.updatedAt && (now - workflow.updatedAt) < RECENT_THRESHOLD) {
        cm.sendWorkflowRecoveredToClient(clientId, workflow.id, workflow);
      }
    }
  }

  /**
   * Re-send all pending main thread tool requests to new client
   * Called when a new client connects (page refresh) to continue workflow execution
   * 
   * Uses the new direct response approach via channelManager.sendToolRequest()
   * The response is processed and the pending promise is resolved directly
   */
  async resendPendingToolRequests(): Promise<void> {
    if (this.pendingToolRequests.size === 0) {
      return;
    }

    const { getChannelManager } = await import('./channel-manager');
    const cm = getChannelManager();
    if (!cm) {
      return;
    }

    // Re-send all pending requests and process responses directly
    for (const [requestId, pending] of this.pendingToolRequests) {
      const { requestInfo } = pending;

      // Use direct response approach
      (async () => {
        try {
          const response = await cm.sendToolRequest(
            requestInfo.workflowId,
            requestInfo.requestId,
            requestInfo.stepId,
            requestInfo.toolName,
            requestInfo.args,
            300000 // 5 minutes timeout
          );

          if (response) {
            // Resolve the pending promise with the response
            pending.resolve({
              type: 'MAIN_THREAD_TOOL_RESPONSE',
              requestId: requestInfo.requestId,
              success: response.success,
              result: response.result,
              error: response.error,
              taskId: response.taskId,
              taskIds: response.taskIds,
              addSteps: response.addSteps as MainThreadToolResponseMessage['addSteps'],
            });
          } else {
            // Timeout or error
            pending.reject(new Error(`Tool request timed out: ${requestInfo.toolName}`));
          }
        } catch (error) {
          pending.reject(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    }
  }

  /**
   * 重新发送指定工作流的待处理工具请求
   * 用于页面刷新后，客户端声明接管工作流时调用
   * 
   * @param workflowId 工作流 ID
   */
  async resendPendingToolRequestsForWorkflow(workflowId: string): Promise<void> {
    const { getChannelManager } = await import('./channel-manager');
    const cm = getChannelManager();
    if (!cm) {
      return;
    }

    // 查找该工作流的内存中待处理请求
    let memoryRequestCount = 0;
    for (const [requestId, pending] of this.pendingToolRequests) {
      const { requestInfo } = pending;
      
      if (requestInfo.workflowId !== workflowId) {
        continue;
      }

      memoryRequestCount++;

      // 异步重新发送请求
      (async () => {
        try {
          const response = await cm.sendToolRequest(
            requestInfo.workflowId,
            requestInfo.requestId,
            requestInfo.stepId,
            requestInfo.toolName,
            requestInfo.args,
            300000 // 5 minutes timeout
          );

          if (response) {
            pending.resolve({
              type: 'MAIN_THREAD_TOOL_RESPONSE',
              requestId: requestInfo.requestId,
              success: response.success,
              result: response.result,
              error: response.error,
              taskId: response.taskId,
              taskIds: response.taskIds,
              addSteps: response.addSteps as MainThreadToolResponseMessage['addSteps'],
            });
          } else {
            pending.reject(new Error(`Tool request timed out: ${requestInfo.toolName}`));
          }
        } catch (error) {
          console.error(`[WorkflowExecutor] ❌ Tool request failed: ${requestId}`, error);
          pending.reject(error instanceof Error ? error : new Error(String(error)));
        }
        })();
    }

    // 同时检查 IndexedDB 中的待处理请求（SW 重启后内存中的请求会丢失）
    const storedRequests = await taskQueueStorage.getAllPendingToolRequests();
    const workflowStoredRequests = storedRequests.filter(r => r.workflowId === workflowId);
    
    for (const storedRequest of workflowStoredRequests) {
      // 如果内存中没有这个请求，说明是 SW 重启后的遗留请求
      if (!this.pendingToolRequests.has(storedRequest.requestId)) {
        
        // 重新发送并等待响应
        (async () => {
          try {
            const response = await cm.sendToolRequest(
              storedRequest.workflowId,
              storedRequest.requestId,
              storedRequest.stepId,
              storedRequest.toolName,
              storedRequest.args,
              300000
            );

            if (response) {
              // 处理响应（更新工作流状态）
              await this.handleRecoveredToolResponse(storedRequest, response);
            }
          } catch (error) {
            console.error(`[WorkflowExecutor] ❌ Failed to resend tool request ${storedRequest.requestId}:`, error);
          } finally {
            // 清理 IndexedDB 中的请求
            await taskQueueStorage.deletePendingToolRequest(storedRequest.requestId);
          }
        })();
      }
    }
  }

  /**
   * 处理恢复的工具响应（SW 重启后）
   */
  private async handleRecoveredToolResponse(
    request: { workflowId: string; stepId: string; toolName: string },
    response: { success: boolean; result?: unknown; error?: string; addSteps?: Array<{ id: string; mcp: string; args: Record<string, unknown>; description: string; status: string }> }
  ): Promise<void> {
    const workflow = this.workflows.get(request.workflowId);
    if (!workflow) return;

    const step = workflow.steps.find(s => s.id === request.stepId);
    if (!step) return;

    if (response.success) {
      step.status = 'completed';
      step.result = response.result;
      
      // 处理新增步骤
      if (response.addSteps && response.addSteps.length > 0) {
        for (const newStep of response.addSteps) {
          if (!workflow.steps.find(s => s.id === newStep.id)) {
            workflow.steps.push({
              id: newStep.id,
              mcp: newStep.mcp,
              args: newStep.args,
              description: newStep.description,
              status: newStep.status as 'pending' | 'running' | 'completed' | 'failed' | 'skipped',
            });
          }
        }
      }
    } else {
      step.status = 'failed';
      step.error = response.error;
    }

    workflow.updatedAt = Date.now();
    await taskQueueStorage.saveWorkflow(workflow);

    // 继续执行工作流
    if (response.success && workflow.status === 'running') {
      this.executeWorkflow(workflow.id);
    }
  }

  /**
   * Cancel all pending main thread tool requests
   * Called when a new client connects (page refresh) to fail waiting workflows immediately
   */
  cancelAllPendingToolRequests(): void {
    if (this.pendingToolRequests.size === 0) return;


    for (const [requestId, pending] of this.pendingToolRequests) {
      pending.reject(new Error('页面刷新导致请求中断，请重试'));
    }
    this.pendingToolRequests.clear();
  }

  /**
   * Submit a workflow for execution
   * channelManager 负责维护 workflowId -> channel 的映射
   * @param workflow The workflow to execute
   */
  async submitWorkflow(workflow: Workflow): Promise<void> {
    // Check for duplicate
    const existing = this.workflows.get(workflow.id);
    if (existing) {
      if (existing.status === 'running' || existing.status === 'pending') {
        // Already running, sync current status to the new client
        this.sendWorkflowStatus(existing);
        // Also send individual steps to ensure UI is fully populated
        existing.steps.forEach(step => this.sendStepStatus(existing.id, step));
        return;
      }
      
      // If failed/cancelled/completed, we might allow re-submitting with same ID?
      // For now, skip to avoid confusion
      console.warn(`[SW-WorkflowExecutor] Workflow ${workflow.id} already exists with terminal status ${existing.status}, skipping`);
      this.sendWorkflowStatus(existing);
      return;
    }

    // Store workflow
    workflow.status = 'pending';
    workflow.updatedAt = Date.now();
    this.workflows.set(workflow.id, workflow);

    // Persist to IndexedDB
    await taskQueueStorage.saveWorkflow(workflow);

    // Start execution
    this.executeWorkflow(workflow.id);
  }

  /**
   * Cancel a workflow
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    // Abort any running operations
    const controller = this.abortControllers.get(workflowId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(workflowId);
    }

    // Update status
    workflow.status = 'cancelled';
    workflow.updatedAt = Date.now();
    this.runningWorkflows.delete(workflowId);

    // Persist to IndexedDB
    await taskQueueStorage.saveWorkflow(workflow);

    // Clean up pending tool requests
    await taskQueueStorage.deletePendingToolRequestsByWorkflow(workflowId);

    this.sendWorkflowStatus(workflow);
  }

  /**
   * Get workflow by ID
   */
  getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Get all workflows
   */
  getAllWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Execute a workflow
   */
  private async executeWorkflow(workflowId: string): Promise<void> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      console.error(`[WorkflowExecutor] Workflow ${workflowId} not found`);
      return;
    }

    // Check if already running
    if (this.runningWorkflows.has(workflowId)) {
      return;
    }

    this.runningWorkflows.add(workflowId);

    // Create abort controller
    const abortController = new AbortController();
    this.abortControllers.set(workflowId, abortController);

    // Update status to running
    workflow.status = 'running';
    workflow.updatedAt = Date.now();
    await taskQueueStorage.saveWorkflow(workflow);
    this.sendWorkflowStatus(workflow);

    try {
      // Execute steps in order (respecting dependencies)
      let stepIndex = 0;
      while (true) {
        // Find next executable steps
        const executableSteps = workflow.steps.filter((step) => {
          // Skip steps that are already processed or in progress
          if (step.status === 'completed' || step.status === 'failed' || step.status === 'skipped' || 
              step.status === 'running' || step.status === 'pending_main_thread') {
            return false;
          }
          // Check dependencies
          if (step.dependsOn && step.dependsOn.length > 0) {
            return step.dependsOn.every((depId) => {
              const dep = workflow.steps.find(s => s.id === depId);
              return dep && (dep.status === 'completed' || dep.status === 'skipped');
            });
          }
          return true;
        });

        // 检查是否有正在执行或等待主线程的步骤
        const hasRunningSteps = workflow.steps.some(s => s.status === 'running');
        const hasPendingMainThreadSteps = workflow.steps.some(s => s.status === 'pending_main_thread');

        if (executableSteps.length === 0) {
          if (hasRunningSteps || hasPendingMainThreadSteps) {
            // Some steps are still running (e.g. delegated to main thread)
            // Or waiting for main thread to execute (pending_main_thread)
            // Wait for them to finish before checking again
            // console.log(`[WorkflowExecutor] No more executable steps but ${workflow.steps.filter(s => s.status === 'running' || s.status === 'pending_main_thread').length} are still running/pending`);
            break; // Exit the loop, execution will resume via updateWorkflowStepForTask or main thread polling
          }

          // Check if all steps are actually finished
          const allFinished = workflow.steps.every(s => 
            s.status === 'completed' || s.status === 'failed' || s.status === 'skipped'
          );

          if (allFinished) {
            break;
          }

          // No steps are running, but not all are finished, and no executable steps found
          // This could be a circular dependency or some steps waiting for something
          console.warn('[WorkflowExecutor] Workflow stuck: no executable steps and none running');
          break;
        }

        // Execute steps
        for (const step of executableSteps) {
          if (abortController.signal.aborted) {
            throw new Error('Workflow cancelled');
          }

          stepIndex++;
          await this.executeStep(workflow, step, abortController.signal);

          // Check if step failed and should stop workflow
          if (step.status === 'failed') {
            console.error(`[WorkflowExecutor] ✗ Step ${step.id} failed: ${step.error}`);
            throw new Error(`Step ${step.id} failed: ${step.error}`);
          }
          
          // If the step is now running (async), we might need to stop and wait
          if (step.status === 'running') {
            // Stop executing more steps for now if this is a blocking async step
            // For now, we continue the loop to see if other independent steps can run
          }
        }
      }

      // Check if we are really done
      const allDone = workflow.steps.every(s => 
        s.status === 'completed' || s.status === 'failed' || s.status === 'skipped'
      );

      if (allDone) {
        // All steps completed
        workflow.status = 'completed';
        workflow.completedAt = Date.now();
        workflow.updatedAt = Date.now();

        // Persist final state
        await taskQueueStorage.saveWorkflow(workflow);
        
        // Clean up task-step mappings for this workflow
        await taskStepRegistry.clearWorkflowMappings(workflowId);

        this.sendToWorkflowClient(workflowId, {
          type: 'WORKFLOW_COMPLETED',
          workflowId,
          workflow,
        });
        // channelManager 会在 sendWorkflowCompleted 中自动清理 workflowId -> channel 映射
      } else {
        // Still running (waiting for async steps)
        // console.log(`[WorkflowExecutor] Workflow ${workflowId} is still in progress (waiting for async steps)`);
        await taskQueueStorage.saveWorkflow(workflow);
      }
    } catch (error: any) {
      // 检查是否是等待客户端的错误
      if (error?.isAwaitingClient || error?.message?.startsWith('AWAITING_CLIENT:')) {
        // 不标记为失败，保持 running 状态
        // pending request 已保存在 IndexedDB，客户端重连后会通过 claimWorkflow 继续执行
        workflow.updatedAt = Date.now();
        await taskQueueStorage.saveWorkflow(workflow);
        
        // 清理执行状态，允许后续重新执行
        this.runningWorkflows.delete(workflowId);
        this.abortControllers.delete(workflowId);
        
        // 通知客户端工作流正在等待
        this.sendToWorkflowClient(workflowId, {
          type: 'WORKFLOW_STATUS',
          workflowId,
          status: 'running', // 保持 running 状态
        });
        return;
      }
      
      console.error(`[WorkflowExecutor] ✗ Workflow ${workflowId} failed:`, error);

      workflow.status = 'failed';
      workflow.error = error.message;
      workflow.updatedAt = Date.now();

      // Persist failed state
      await taskQueueStorage.saveWorkflow(workflow);
      
      // Clean up task-step mappings for this workflow
      await taskStepRegistry.clearWorkflowMappings(workflowId);

      this.sendToWorkflowClient(workflowId, {
        type: 'WORKFLOW_FAILED',
        workflowId,
        error: error.message,
      });
      // channelManager 会在 sendWorkflowFailed 中自动清理 workflowId -> channel 映射
    } finally {
      this.runningWorkflows.delete(workflowId);
      this.abortControllers.delete(workflowId);
      // console.log(`[WorkflowExecutor] Workflow execution ended: ${workflowId}, status: ${workflow.status}`);
    }
  }

  /**
   * Replace image placeholders ([图片1], [图片2], etc.) with actual URLs
   * from workflow.context.referenceImages
   */
  private replaceImagePlaceholders(
    args: Record<string, unknown>,
    referenceImages: string[]
  ): Record<string, unknown> {
    if (!referenceImages || referenceImages.length === 0) {
      return args;
    }

    const replacePlaceholder = (value: unknown): unknown => {
      if (typeof value === 'string') {
        // Replace Chinese placeholders [图片1], [图片2], ...
        let result = value.replace(/\[图片(\d+)\]/g, (match, indexStr) => {
          const index = parseInt(indexStr, 10) - 1;
          if (index >= 0 && index < referenceImages.length) {
            return referenceImages[index];
          }
          return match;
        });
        // Replace English placeholders [Image 1], [Image 2], ...
        result = result.replace(/\[Image\s*(\d+)\]/gi, (match, indexStr) => {
          const index = parseInt(indexStr, 10) - 1;
          if (index >= 0 && index < referenceImages.length) {
            return referenceImages[index];
          }
          return match;
        });
        return result;
      }
      if (Array.isArray(value)) {
        return value.map(item => replacePlaceholder(item));
      }
      if (value && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
          result[key] = replacePlaceholder(val);
        }
        return result;
      }
      return value;
    };

    return replacePlaceholder(args) as Record<string, unknown>;
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    workflow: Workflow,
    step: WorkflowStep,
    signal: AbortSignal
  ): Promise<void> {
    // console.log('[SW-WorkflowExecutor] executeStep:', {
    //   workflowId: workflow.id,
    //   stepId: step.id,
    //   mcp: step.mcp,
    //   hasContext: !!workflow.context,
    //   referenceImagesCount: workflow.context?.referenceImages?.length || 0,
    //   timestamp: new Date().toISOString(),
    // });
    
    const startTime = Date.now();

    // Replace image placeholders with actual URLs from context
    const referenceImages = workflow.context?.referenceImages || [];
    
    // Debug: log args before processing
    if (step.mcp === 'generate_image' || step.mcp === 'generate_video') {
      // console.log('[SW-WorkflowExecutor] Image/Video step args before processing:', {
      //   stepId: step.id,
      //   referenceImagesInContext: referenceImages.length,
      //   referenceImagesValues: referenceImages.slice(0, 2).map(url => url.substring(0, 50) + '...'),
      //   argsReferenceImages: (step.args as any).referenceImages,
      // });
    }
    
    const processedArgs = this.replaceImagePlaceholders(step.args, referenceImages);
    
    // Log if any replacements were made
    const argsStr = JSON.stringify(step.args);
    const processedStr = JSON.stringify(processedArgs);
    if (argsStr !== processedStr) {
      // console.log('[SW-WorkflowExecutor] ✓ Replaced image placeholders:', {
      //   stepId: step.id,
      //   referenceImagesCount: referenceImages.length,
      // });
      // Update step args with processed values
      step.args = processedArgs;
    } else if (referenceImages.length > 0 && (step.mcp === 'generate_image' || step.mcp === 'generate_video')) {
      // console.log('[SW-WorkflowExecutor] No placeholders replaced (args unchanged):', {
      //   stepId: step.id,
      //   referenceImagesCount: referenceImages.length,
      // });
    }

    // Update step status to running
    step.status = 'running';
    await taskQueueStorage.saveWorkflow(workflow);
    this.sendStepStatus(workflow.id, step);

    try {
      // Check if this is a Canvas tool (must run in main thread)
      // Canvas tools are marked as pending_main_thread and will be executed by main thread polling
      if (isCanvasTool(step.mcp)) {
        // 合并 batch options 到 args（与之前逻辑保持一致）
        step.args = {
          ...step.args,
          ...(step.options?.batchId !== undefined && { batchId: step.options.batchId }),
          ...(typeof step.options?.batchIndex === 'number' && { batchIndex: step.options.batchIndex }),
          ...(typeof step.options?.batchTotal === 'number' && { batchTotal: step.options.batchTotal }),
          ...(typeof step.options?.globalIndex === 'number' && { globalIndex: step.options.globalIndex }),
        };
        
        // 标记为等待主线程执行
        step.status = 'pending_main_thread';
        step.duration = Date.now() - startTime;
        
        // 保存到 IndexedDB，主线程会轮询并执行
        await taskQueueStorage.saveWorkflow(workflow);
        this.sendStepStatus(workflow.id, step);
        
        // 返回，不继续等待。主线程执行完后会更新 IndexedDB
        return;
      }
      
      // Check if this tool needs to run in main thread (media generation tools)
      if (isMediaGenerationTool(step.mcp) || (!getSWMCPTool(step.mcp) && requiresMainThread(step.mcp))) {
        // Delegate to main thread
        // Merge batch options into args for main thread (batchId, batchIndex, batchTotal)
        // Note: batchId etc. are now included directly in step.args by workflow-converter.ts
        // The options merge below is kept for backward compatibility
        const argsWithOptions = {
          ...step.args,
          ...(step.options?.batchId !== undefined && { batchId: step.options.batchId }),
          ...(typeof step.options?.batchIndex === 'number' && { batchIndex: step.options.batchIndex }),
          ...(typeof step.options?.batchTotal === 'number' && { batchTotal: step.options.batchTotal }),
          ...(typeof step.options?.globalIndex === 'number' && { globalIndex: step.options.globalIndex }),
        };
        const response = await this.requestMainThreadTool(
          workflow.id,
          step.id,
          step.mcp,
          argsWithOptions
        );

        if (!response.success) {
          throw new Error(response.error || 'Main thread tool execution failed');
        }

        // Handle additional steps (for ai_analyze)
        if (response.addSteps && response.addSteps.length > 0) {
          // console.log(`[WorkflowExecutor] Adding ${response.addSteps.length} new steps to workflow ${workflow.id}`);
          // Add new steps to workflow (with deduplication)
          const actuallyAddedSteps: typeof response.addSteps = [];
          for (const newStep of response.addSteps) {
            if (!workflow.steps.find(s => s.id === newStep.id)) {
              workflow.steps.push({
                id: newStep.id,
                mcp: newStep.mcp,
                args: newStep.args,
                description: newStep.description,
                status: newStep.status,
              });
              actuallyAddedSteps.push(newStep);
            }
          }
          
          // Only broadcast if we actually added new steps
          if (actuallyAddedSteps.length > 0) {
            // Persist the workflow immediately after adding steps
            // This ensures that if the page is refreshed right now, the new steps are not lost
            await taskQueueStorage.saveWorkflow(workflow);

            // Send new steps to initiating client
            this.sendToWorkflowClient(workflow.id, {
              type: 'WORKFLOW_STEPS_ADDED',
              workflowId: workflow.id,
              steps: actuallyAddedSteps,
            } as any);
          }
        }

        // Handle response based on tool type
        const resultData = response.result as any;

        // For image/video generation tools, the result contains taskId
        // The step should be marked as 'running' until the task completes
        const imageVideoTools = ['generate_image', 'generate_video', 'generate_grid_image', 'generate_inspiration_board'];
        if (imageVideoTools.includes(step.mcp) && response.taskId) {
          const typeMap: Record<string, 'image' | 'video'> = {
            'generate_image': 'image',
            'generate_grid_image': 'image',
            'generate_inspiration_board': 'image',
            'generate_video': 'video',
          };
          step.result = {
            success: true,
            type: typeMap[step.mcp] ?? 'image',
            data: resultData,
            taskId: response.taskId,
            taskIds: response.taskIds,
          };
          
          // Register task-step mapping for unified progress sync
          // When the task completes, this mapping allows us to update the corresponding workflow step
          await taskStepRegistry.register(response.taskId, workflow.id, step.id);
          
          // Also register any additional taskIds (for batch generation)
          if (response.taskIds && response.taskIds.length > 0) {
            for (const taskId of response.taskIds) {
              await taskStepRegistry.register(taskId, workflow.id, step.id);
            }
          }
          
          // Keep step status as 'running' - it will be updated when task completes
          // The task queue will broadcast workflow:stepStatus when task completes
          step.status = 'running';
          step.duration = Date.now() - startTime;
          this.sendStepStatus(workflow.id, step);
          return; // Don't mark as completed yet
        }

        step.result = {
          success: true,
          type: resultData?.type || 'text',
          data: resultData,
        };
      } else {
        // Execute in SW using unified media executor
        const result = await executeMCPToolForWorkflow(step.mcp, step.args, {
          geminiConfig: this.config.geminiConfig,
          videoConfig: this.config.videoConfig,
          signal,
          onProgress: (progress, phase) => {
            // Could broadcast progress updates here
          },
          onRemoteId: (remoteId) => {
            // Store remote ID for recovery
          },
        });

        // Check if this is a canvas operation that needs delegation
        if (result.success && result.type === 'canvas' && (result.data as any)?.delegateToMainThread) {
          const canvasResult = await this.requestCanvasOperation(
            workflow.id,
            (result.data as any).operation,
            (result.data as any).args
          );

          if (!canvasResult.success) {
            throw new Error(canvasResult.error || 'Canvas operation failed');
          }

          step.result = {
            success: true,
            type: 'canvas',
            data: { completed: true },
          };
        } else if (result.success && result.type === 'image' && (result.data as any)?.url) {
          // Image generation completed, insert to canvas
          const imageData = result.data as { url: string; urls?: string[]; size?: string };
          const canvasResult = await this.requestCanvasOperation(workflow.id, 'canvas_insert', {
            items: [{
              type: 'image',
              url: imageData.url,
            }],
          });

          if (!canvasResult.success) {
            console.warn('[WorkflowExecutor] Failed to insert image to canvas:', canvasResult.error);
            // Don't throw - image was generated successfully, just couldn't insert
          }

          step.result = {
            success: true,
            type: 'image',
            data: result.data as any,
          };
        } else if (result.success && result.type === 'video' && (result.data as any)?.url) {
          // Video generation completed, insert to canvas
          const videoData = result.data as { url: string };
          const canvasResult = await this.requestCanvasOperation(workflow.id, 'canvas_insert', {
            items: [{
              type: 'video',
              url: videoData.url,
            }],
          });

          if (!canvasResult.success) {
            console.warn('[WorkflowExecutor] Failed to insert video to canvas:', canvasResult.error);
          }

          step.result = {
            success: true,
            type: 'video',
            data: result.data as any,
          };
        } else {
          step.result = {
            success: result.success,
            type: result.type || 'text',
            data: result.data as any,
            error: result.error,
          };

          if (!result.success) {
            throw new Error(result.error || 'Step execution failed');
          }
        }

        // Handle additional steps (from ai_analyze executed in SW) with deduplication
        if (result.addSteps && result.addSteps.length > 0) {
          const actuallyAddedSteps: typeof result.addSteps = [];
          for (const newStep of result.addSteps) {
            if (!workflow.steps.find(s => s.id === newStep.id)) {
              workflow.steps.push({
                id: newStep.id,
                mcp: newStep.mcp,
                args: newStep.args,
                description: newStep.description,
                status: newStep.status,
              });
              actuallyAddedSteps.push(newStep);
            }
          }

          // Only send if we actually added new steps
          if (actuallyAddedSteps.length > 0) {
            this.sendToWorkflowClient(workflow.id, {
              type: 'WORKFLOW_STEPS_ADDED',
              workflowId: workflow.id,
              steps: actuallyAddedSteps,
            });
          }
        }
      }

      step.status = 'completed';
      step.duration = Date.now() - startTime;
    } catch (error: any) {
      // 检查是否是等待客户端的错误 - 需要重新抛出以便 workflow 级别处理
      if (error?.isAwaitingClient || error?.message?.startsWith('AWAITING_CLIENT:')) {
        // 保持 step 为 running 状态（等待客户端重连后继续）
        step.status = 'running';
        step.duration = Date.now() - startTime;
        await taskQueueStorage.saveWorkflow(workflow);
        this.sendStepStatus(workflow.id, step);
        // 重新抛出原始错误，保留 isAwaitingClient 标记
        throw error;
      }
      
      step.status = 'failed';
      step.error = error.message;
      step.duration = Date.now() - startTime;
      step.result = {
        success: false,
        type: 'error',
        error: error.message,
      };
    }

    // Persist step status change
    await taskQueueStorage.saveWorkflow(workflow);
    this.sendStepStatus(workflow.id, step);
  }

  /**
   * Request main thread to execute a tool
   * 使用 channelManager 的双工通讯模式，直接等待响应
   * 这样可以减少一次交互，不需要再通过 workflow:respondTool 发送结果
   */
  private async requestMainThreadTool(
    workflowId: string,
    stepId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MainThreadToolResponseMessage> {
    // If custom handler is provided, use it
    if (this.config.requestMainThreadTool) {
      return this.config.requestMainThreadTool(workflowId, stepId, toolName, args);
    }

    // Generate request ID for tracking
    const requestId = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // Persist to IndexedDB for recovery after SW restart
    // This is still needed in case the request is in progress when SW restarts
    await taskQueueStorage.savePendingToolRequest({
      requestId,
      workflowId,
      stepId,
      toolName,
      args,
      createdAt: Date.now(),
    });

    try {
      // Use channelManager's duplex communication to send request and await response directly
      const { getChannelManager } = await import('./channel-manager');
      const cm = getChannelManager();
      
      if (!cm) {
        // channelManager 不可用，保留 pending request 等待后续重试
        const awaitError = new Error(`AWAITING_CLIENT:${toolName}`);
        (awaitError as any).isAwaitingClient = true;
        throw awaitError;
      }

      // Send request and wait for response directly (5 minutes timeout)
      const response = await cm.sendToolRequest(
        workflowId,
        requestId,
        stepId,
        toolName,
        args,
        300000
      );

      if (!response) {
        // 超时或无客户端连接，保留 pending request 等待后续重试
        const awaitError = new Error(`AWAITING_CLIENT:${toolName}`);
        (awaitError as any).isAwaitingClient = true;
        throw awaitError;
      }

      // 收到响应后才清理 IndexedDB
      await taskQueueStorage.deletePendingToolRequest(requestId);

      // Convert response to MainThreadToolResponseMessage format
      return {
        type: 'MAIN_THREAD_TOOL_RESPONSE',
        requestId,
        success: response.success,
        result: response.result,
        error: response.error,
        taskId: response.taskId,
        taskIds: response.taskIds,
        addSteps: response.addSteps as MainThreadToolResponseMessage['addSteps'],
      };
    } catch (error: any) {
      // 如果是等待客户端的错误，不删除 pending request
      if (error?.isAwaitingClient) {
        throw error;
      }
      // 其他错误才清理 IndexedDB
      await taskQueueStorage.deletePendingToolRequest(requestId);
      throw error;
    }
  }

  /**
   * Request canvas operation from main thread
   * 使用 channelManager 的双工通讯模式，直接等待响应
   * @param workflowId 工作流 ID，用于找到正确的 channel
   */
  private async requestCanvasOperation(
    workflowId: string,
    operation: string,
    params: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> {
    // 使用 channelManager 的双工通讯模式
    const { getChannelManager } = await import('./channel-manager');
    const cm = getChannelManager();
    if (cm) {
      return cm.requestCanvasOperation(workflowId, operation, params);
    }

    // channelManager 不可用时返回失败
    console.warn('[WorkflowExecutor] channelManager not available for canvas operation');
    return { success: false, error: 'channelManager not available' };
  }

  /**
   * Send workflow status update to the initiating client
   */
  private sendWorkflowStatus(workflow: Workflow): void {
    this.sendToWorkflowClient(workflow.id, {
      type: 'WORKFLOW_STATUS',
      workflowId: workflow.id,
      status: workflow.status,
      updatedAt: workflow.updatedAt,
    });
  }

  /**
   * Send step status update to the initiating client
   */
  private sendStepStatus(workflowId: string, step: WorkflowStep): void {
    this.sendToWorkflowClient(workflowId, {
      type: 'WORKFLOW_STEP_STATUS',
      workflowId,
      stepId: step.id,
      status: step.status,
      result: step.result,
      error: step.error,
      duration: step.duration,
    });
  }

}
