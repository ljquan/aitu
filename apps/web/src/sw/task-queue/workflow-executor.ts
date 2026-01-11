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
import { executeSWMCPTool, getSWMCPTool, requiresMainThread } from './mcp/tools';
import { taskQueueStorage } from './storage';

/**
 * Workflow executor configuration
 */
export interface WorkflowExecutorConfig {
  geminiConfig: GeminiConfig;
  videoConfig: VideoAPIConfig;
  /** Broadcast message to all clients */
  broadcast: (message: WorkflowSWToMainMessage) => void;
  /** Request canvas operation from main thread */
  requestCanvasOperation?: (
    operation: string,
    params: Record<string, unknown>
  ) => Promise<{ success: boolean; error?: string }>;
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
    const pending = this.pendingToolRequests.get(response.requestId);
    if (pending) {
      this.pendingToolRequests.delete(response.requestId);
      pending.resolve(response);
    } else {
      // Response came after SW restart - the pending request was in IndexedDB
      // Clean it up since we received a response
      await taskQueueStorage.deletePendingToolRequest(response.requestId);
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
        console.log(`[WorkflowExecutor] Updating step ${step.id} for task ${taskId} to ${status}`);
        
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
        this.broadcastStepStatus(workflow.id, step);

        // If workflow is running, continue execution
        if (workflow.status === 'running') {
          this.executeWorkflow(workflow.id);
        }
        return;
      }
    }
  }

  /**
   * Broadcast all workflows that were recovered from storage
   * This is called when a new client connects to sync state
   */
  broadcastRecoveredWorkflows(): void {
    for (const workflow of this.workflows.values()) {
      this.config.broadcast({
        type: 'WORKFLOW_RECOVERED',
        workflowId: workflow.id,
        workflow,
      });
    }
  }

  /**
   * Re-send all pending main thread tool requests to new client
   * Called when a new client connects (page refresh) to continue workflow execution
   */
  resendPendingToolRequests(): void {
    if (this.pendingToolRequests.size === 0) {
      return;
    }

    for (const [, pending] of this.pendingToolRequests) {
      const { requestInfo } = pending;

      // Re-broadcast the request to new client
      this.config.broadcast({
        type: 'MAIN_THREAD_TOOL_REQUEST',
        requestId: requestInfo.requestId,
        workflowId: requestInfo.workflowId,
        stepId: requestInfo.stepId,
        toolName: requestInfo.toolName,
        args: requestInfo.args,
      });
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
   */
  async submitWorkflow(workflow: Workflow): Promise<void> {
    // Check for duplicate
    const existing = this.workflows.get(workflow.id);
    if (existing) {
      if (existing.status === 'running' || existing.status === 'pending') {
        console.log(`[WorkflowExecutor] Re-claiming active workflow ${workflow.id}`);
        // Already running, just broadcast current status to sync the new client
        this.broadcastWorkflowStatus(existing);
        // Also broadcast individual steps to ensure UI is fully populated
        existing.steps.forEach(step => this.broadcastStepStatus(existing.id, step));
        return;
      }
      
      // If failed/cancelled/completed, we might allow re-submitting with same ID?
      // For now, skip to avoid confusion
      console.warn(`[WorkflowExecutor] Workflow ${workflow.id} already exists with terminal status ${existing.status}, skipping`);
      this.broadcastWorkflowStatus(existing);
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

    this.broadcastWorkflowStatus(workflow);
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
      console.error(`[WorkflowExecutor] ✗ Workflow ${workflowId} not found`);
      return;
    }

    // Check if already running
    if (this.runningWorkflows.has(workflowId)) {
      console.warn(`[WorkflowExecutor] Workflow ${workflowId} is already running`);
      return;
    }

    this.runningWorkflows.add(workflowId);
    // console.log(`[WorkflowExecutor] ▶ Starting workflow execution: ${workflowId}`);

    // Create abort controller
    const abortController = new AbortController();
    this.abortControllers.set(workflowId, abortController);

    // Update status to running
    workflow.status = 'running';
    workflow.updatedAt = Date.now();
    await taskQueueStorage.saveWorkflow(workflow);
    this.broadcastWorkflowStatus(workflow);

    try {
      // Execute steps in order (respecting dependencies)
      let stepIndex = 0;
      while (true) {
        // Find next executable steps
        const executableSteps = workflow.steps.filter((step) => {
          if (step.status === 'completed' || step.status === 'failed' || step.status === 'skipped' || step.status === 'running') {
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

        const hasRunningSteps = workflow.steps.some(s => s.status === 'running');

        if (executableSteps.length === 0) {
          if (hasRunningSteps) {
            // Some steps are still running (e.g. delegated to main thread)
            // Wait for them to finish before checking again
            console.log(`[WorkflowExecutor] No more executable steps but ${workflow.steps.filter(s => s.status === 'running').length} are still running`);
            break; // Exit the loop, execution will resume via updateWorkflowStepForTask
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

        this.config.broadcast({
          type: 'WORKFLOW_COMPLETED',
          workflowId,
          workflow,
        });
      } else {
        // Still running (waiting for async steps)
        console.log(`[WorkflowExecutor] Workflow ${workflowId} is still in progress (waiting for async steps)`);
        await taskQueueStorage.saveWorkflow(workflow);
      }
    } catch (error: any) {
      console.error(`[WorkflowExecutor] ✗ Workflow ${workflowId} failed:`, error);

      workflow.status = 'failed';
      workflow.error = error.message;
      workflow.updatedAt = Date.now();

      // Persist failed state
      await taskQueueStorage.saveWorkflow(workflow);

      this.config.broadcast({
        type: 'WORKFLOW_FAILED',
        workflowId,
        error: error.message,
      });
    } finally {
      this.runningWorkflows.delete(workflowId);
      this.abortControllers.delete(workflowId);
      // console.log(`[WorkflowExecutor] Workflow execution ended: ${workflowId}, status: ${workflow.status}`);
    }
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    workflow: Workflow,
    step: WorkflowStep,
    signal: AbortSignal
  ): Promise<void> {
    const startTime = Date.now();

    // Update step status to running
    step.status = 'running';
    await taskQueueStorage.saveWorkflow(workflow);
    this.broadcastStepStatus(workflow.id, step);

    try {
      // Check if this tool needs to run in main thread
      if (requiresMainThread(step.mcp) || !getSWMCPTool(step.mcp)) {
        // Delegate to main thread
        const response = await this.requestMainThreadTool(
          workflow.id,
          step.id,
          step.mcp,
          step.args
        );

        if (!response.success) {
          throw new Error(response.error || 'Main thread tool execution failed');
        }

        // Handle additional steps (for ai_analyze)
        if (response.addSteps && response.addSteps.length > 0) {
          console.log(`[WorkflowExecutor] Adding ${response.addSteps.length} new steps to workflow ${workflow.id}`);
          // Add new steps to workflow
          for (const newStep of response.addSteps) {
            if (!workflow.steps.find(s => s.id === newStep.id)) {
              workflow.steps.push({
                id: newStep.id,
                mcp: newStep.mcp,
                args: newStep.args,
                description: newStep.description,
                status: newStep.status,
              });
            }
          }
          
          // Persist the workflow immediately after adding steps
          // This ensures that if the page is refreshed right now, the new steps are not lost
          await taskQueueStorage.saveWorkflow(workflow);

          // Broadcast that new steps were added
          this.config.broadcast({
            type: 'WORKFLOW_STEPS_ADDED',
            workflowId: workflow.id,
            steps: response.addSteps,
          } as any);
        }

        // Handle response based on tool type
        const resultData = response.result as any;

        // For generate_image/generate_video, the result contains taskId
        // The step should be marked as 'running' until the task completes
        if ((step.mcp === 'generate_image' || step.mcp === 'generate_video') && response.taskId) {
          step.result = {
            success: true,
            type: step.mcp === 'generate_image' ? 'image' : 'video',
            data: resultData,
            taskId: response.taskId,
            taskIds: response.taskIds,
          };
          // Keep step status as 'running' - it will be updated when task completes
          // The main thread will update the workflow step status via updateWorkflowStepForTask
          step.status = 'running';
          step.duration = Date.now() - startTime;
          this.broadcastStepStatus(workflow.id, step);
          return; // Don't mark as completed yet
        }

        step.result = {
          success: true,
          type: resultData?.type || 'text',
          data: resultData,
        };
      } else {
        // Execute in SW
        const toolConfig: SWMCPToolConfig = {
          geminiConfig: this.config.geminiConfig,
          videoConfig: this.config.videoConfig,
          signal,
          onProgress: (progress, phase) => {
            // Could broadcast progress updates here
          },
          onRemoteId: (remoteId) => {
            // Store remote ID for recovery
          },
        };

        const result = await executeSWMCPTool(step.mcp, step.args, toolConfig);

        // Check if this is a canvas operation that needs delegation
        if (result.success && result.type === 'canvas' && (result.data as any)?.delegateToMainThread) {
          const canvasResult = await this.requestCanvasOperation(
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
          const canvasResult = await this.requestCanvasOperation('canvas_insert', {
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
          const canvasResult = await this.requestCanvasOperation('canvas_insert', {
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
      }

      step.status = 'completed';
      step.duration = Date.now() - startTime;
    } catch (error: any) {
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
    this.broadcastStepStatus(workflow.id, step);
  }

  /**
   * Request main thread to execute a tool
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

    // Otherwise, send message and wait for response
    const requestId = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    return new Promise((resolve, reject) => {
      // Set timeout for response
      const timeout = setTimeout(() => {
        this.pendingToolRequests.delete(requestId);
        reject(new Error(`Main thread tool request timed out: ${toolName}`));
      }, 300000); // 5 minutes timeout

      // Store pending request with info for re-sending
      this.pendingToolRequests.set(requestId, {
        resolve: (response) => {
          clearTimeout(timeout);
          // Remove from IndexedDB when resolved
          taskQueueStorage.deletePendingToolRequest(requestId);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          // Remove from IndexedDB when rejected
          taskQueueStorage.deletePendingToolRequest(requestId);
          reject(error);
        },
        requestInfo: {
          requestId,
          workflowId,
          stepId,
          toolName,
          args,
        },
        timeout,
      });

      // Persist to IndexedDB for recovery after SW restart
      taskQueueStorage.savePendingToolRequest({
        requestId,
        workflowId,
        stepId,
        toolName,
        args,
        createdAt: Date.now(),
      });

      // Send request to main thread
      console.log('[WorkflowExecutor] ▶ Sending main thread tool request:', toolName, requestId);
      this.config.broadcast({
        type: 'MAIN_THREAD_TOOL_REQUEST',
        requestId,
        workflowId,
        stepId,
        toolName,
        args,
      });
    });
  }

  /**
   * Request canvas operation from main thread
   */
  private async requestCanvasOperation(
    operation: string,
    params: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> {
    // If custom handler is provided, use it
    if (this.config.requestCanvasOperation) {
      return this.config.requestCanvasOperation(operation, params);
    }

    // Otherwise, send message and wait for response
    // This requires a response mechanism which we'll implement later
    const requestId = `canvas_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.config.broadcast({
      type: 'CANVAS_OPERATION_REQUEST',
      requestId,
      operation: operation as any,
      params: params as any,
    });

    // For now, assume success (main thread will handle it)
    // In a full implementation, we'd wait for CANVAS_OPERATION_RESPONSE
    return { success: true };
  }

  /**
   * Broadcast workflow status update
   */
  private broadcastWorkflowStatus(workflow: Workflow): void {
    this.config.broadcast({
      type: 'WORKFLOW_STATUS',
      workflowId: workflow.id,
      status: workflow.status,
      updatedAt: workflow.updatedAt,
    });
  }

  /**
   * Broadcast step status update
   */
  private broadcastStepStatus(workflowId: string, step: WorkflowStep): void {
    this.config.broadcast({
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
