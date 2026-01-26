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
          
          // Only broadcast if we actually added new steps
          if (actuallyAddedSteps.length > 0) {
            this.config.broadcast({
              type: 'WORKFLOW_STEPS_ADDED',
              workflowId: workflow.id,
              steps: actuallyAddedSteps,
            } as any);
          }
        }
        
        // Save workflow
        await taskQueueStorage.saveWorkflow(workflow);
        
        // Broadcast step completed
        this.config.broadcast({
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
        
        // Save and broadcast failure
        await taskQueueStorage.saveWorkflow(workflow);
        this.config.broadcast({
          type: 'WORKFLOW_STEP_STATUS',
          workflowId: workflow.id,
          stepId: step.id,
          status: 'failed',
          error: step.error,
        });
        this.config.broadcast({
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
   * 
   * Note: For tools like ai_analyze that involve streaming, we don't re-send
   * because the request may already be in progress. The workflow will continue
   * waiting for the original response or timeout.
   */
  resendPendingToolRequests(): void {
    if (this.pendingToolRequests.size === 0) {
      return;
    }

    // Tools that should NOT be re-sent on page refresh
    // These tools may already be executing and re-sending would cause duplicate API calls
    // Note: ai_analyze now runs directly in SW, so it doesn't need special handling
    const noResendTools: string[] = [];

    // console.log('[SW-WorkflowExecutor] resendPendingToolRequests:', {
    //   pendingCount: this.pendingToolRequests.size,
    //   pendingTools: Array.from(this.pendingToolRequests.values()).map(p => ({
    //     toolName: p.requestInfo.toolName,
    //     workflowId: p.requestInfo.workflowId,
    //   })),
    //   timestamp: new Date().toISOString(),
    // });
    
    for (const [, pending] of this.pendingToolRequests) {
      const { requestInfo } = pending;

      // For tools that shouldn't be re-sent, skip (workflow continues waiting for original response)
      if (noResendTools.includes(requestInfo.toolName)) {
        // console.log('[SW-WorkflowExecutor] Skipping resend for tool (already in progress):', {
        //   toolName: requestInfo.toolName,
        //   workflowId: requestInfo.workflowId,
        //   requestId: requestInfo.requestId,
        // });
        continue;
      }

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
    // console.log('[SW-WorkflowExecutor] submitWorkflow:', {
    //   workflowId: workflow.id,
    //   existingWorkflowsCount: this.workflows.size,
    //   hasContext: !!workflow.context,
    //   referenceImagesCount: workflow.context?.referenceImages?.length || 0,
    //   timestamp: new Date().toISOString(),
    // });
    
    // Check for duplicate
    const existing = this.workflows.get(workflow.id);
    if (existing) {
      if (existing.status === 'running' || existing.status === 'pending') {
        // console.log(`[SW-WorkflowExecutor] Re-claiming active workflow ${workflow.id}, status: ${existing.status}`);
        // Already running, just broadcast current status to sync the new client
        this.broadcastWorkflowStatus(existing);
        // Also broadcast individual steps to ensure UI is fully populated
        existing.steps.forEach(step => this.broadcastStepStatus(existing.id, step));
        return;
      }
      
      // If failed/cancelled/completed, we might allow re-submitting with same ID?
      // For now, skip to avoid confusion
      console.warn(`[SW-WorkflowExecutor] Workflow ${workflow.id} already exists with terminal status ${existing.status}, skipping`);
      this.broadcastWorkflowStatus(existing);
      return;
    }

    // console.log('[SW-WorkflowExecutor] ✓ New workflow, starting execution:', workflow.id);
    
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
    // console.log('[SW-WorkflowExecutor] executeWorkflow called:', {
    //   workflowId,
    //   timestamp: new Date().toISOString(),
    // });
    
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      console.error(`[WorkflowExecutor] ✗ Workflow ${workflowId} not found`);
      return;
    }

    // Check if already running
    if (this.runningWorkflows.has(workflowId)) {
      // console.warn(`[SW-WorkflowExecutor] Workflow ${workflowId} is already running, skipping duplicate execution`);
      return;
    }

    this.runningWorkflows.add(workflowId);
    // console.log(`[SW-WorkflowExecutor] ▶ Starting workflow execution: ${workflowId}`);

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
            // console.log(`[WorkflowExecutor] No more executable steps but ${workflow.steps.filter(s => s.status === 'running').length} are still running`);
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
        // console.log(`[WorkflowExecutor] Workflow ${workflowId} is still in progress (waiting for async steps)`);
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
    this.broadcastStepStatus(workflow.id, step);

    try {
      // Check if this tool needs to run in main thread
      if (requiresMainThread(step.mcp) || !getSWMCPTool(step.mcp)) {
        // Delegate to main thread
        // Merge batch options into args for main thread (batchId, batchIndex, batchTotal)
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

            // Broadcast that new steps were added
            this.config.broadcast({
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
          const typeMap: Record<string, string> = {
            'generate_image': 'image',
            'generate_grid_image': 'image',
            'generate_inspiration_board': 'image',
            'generate_video': 'video',
          };
          step.result = {
            success: true,
            type: typeMap[step.mcp] || 'image',
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

        // Handle additional steps (from ai_analyze executed in SW) with deduplication
        if (result.addSteps && result.addSteps.length > 0) {
          // console.log(`[SW-WorkflowExecutor] Adding ${result.addSteps.length} new steps from ${step.mcp}`);
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

          // Only broadcast if we actually added new steps
          if (actuallyAddedSteps.length > 0) {
            this.config.broadcast({
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
      // console.log('[WorkflowExecutor] ▶ Sending main thread tool request:', toolName, requestId);
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
