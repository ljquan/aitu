/**
 * SW Workflow Client
 *
 * Client-side wrapper for communicating with Service Worker workflow executor.
 * Provides a simple API for submitting workflows and receiving status updates.
 */

import { Subject, Observable, filter, map } from 'rxjs';

// ============================================================================
// Types (mirrored from SW for client-side use)
// ============================================================================

export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface WorkflowStepResult {
  success: boolean;
  type: 'image' | 'video' | 'text' | 'canvas' | 'error';
  data?: {
    url?: string;
    taskId?: string;
    taskIds?: string[];
    content?: string;
    [key: string]: unknown;
  };
  error?: string;
}

export interface WorkflowStep {
  id: string;
  mcp: string;
  args: Record<string, unknown>;
  description: string;
  status: WorkflowStepStatus;
  result?: WorkflowStepResult;
  error?: string;
  duration?: number;
  dependsOn?: string[];
}

export interface WorkflowContext {
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
}

export interface Workflow {
  id: string;
  steps: WorkflowStep[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
  context?: WorkflowContext;
}

// ============================================================================
// Message Types
// ============================================================================

interface WorkflowStatusMessage {
  type: 'WORKFLOW_STATUS';
  workflowId: string;
  status: Workflow['status'];
  updatedAt: number;
}

interface WorkflowStepStatusMessage {
  type: 'WORKFLOW_STEP_STATUS';
  workflowId: string;
  stepId: string;
  status: WorkflowStepStatus;
  result?: WorkflowStepResult;
  error?: string;
  duration?: number;
}

interface WorkflowCompletedMessage {
  type: 'WORKFLOW_COMPLETED';
  workflowId: string;
  workflow: Workflow;
}

interface WorkflowFailedMessage {
  type: 'WORKFLOW_FAILED';
  workflowId: string;
  error: string;
}

interface CanvasOperationRequestMessage {
  type: 'CANVAS_OPERATION_REQUEST';
  requestId: string;
  operation: 'insert_image' | 'insert_video' | 'insert_text';
  params: {
    url?: string;
    content?: string;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
  };
}

interface WorkflowRecoveredMessage {
  type: 'WORKFLOW_RECOVERED';
  workflowId: string;
  workflow: Workflow;
}

interface WorkflowStepsAddedMessage {
  type: 'WORKFLOW_STEPS_ADDED';
  workflowId: string;
  steps: WorkflowStep[];
}

type SWWorkflowMessage =
  | WorkflowStatusMessage
  | WorkflowStepStatusMessage
  | WorkflowCompletedMessage
  | WorkflowFailedMessage
  | CanvasOperationRequestMessage
  | WorkflowRecoveredMessage
  | WorkflowStepsAddedMessage;

// ============================================================================
// Workflow Events
// ============================================================================

export interface WorkflowStatusEvent {
  type: 'status';
  workflowId: string;
  status: Workflow['status'];
  updatedAt: number;
}

export interface WorkflowStepEvent {
  type: 'step';
  workflowId: string;
  stepId: string;
  status: WorkflowStepStatus;
  result?: WorkflowStepResult;
  error?: string;
  duration?: number;
}

export interface WorkflowCompletedEvent {
  type: 'completed';
  workflowId: string;
  workflow: Workflow;
}

export interface WorkflowFailedEvent {
  type: 'failed';
  workflowId: string;
  error: string;
}

export interface CanvasOperationEvent {
  type: 'canvas_operation';
  requestId: string;
  operation: string;
  params: Record<string, unknown>;
}

export type WorkflowEvent =
  | WorkflowStatusEvent
  | WorkflowStepEvent
  | WorkflowCompletedEvent
  | WorkflowFailedEvent
  | CanvasOperationEvent;

// ============================================================================
// Workflow Client
// ============================================================================

/**
 * SW Workflow Client
 */
class SWWorkflowClient {
  private events$ = new Subject<WorkflowEvent>();
  private workflows: Map<string, Workflow> = new Map();
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private initialized = false;

  /**
   * Initialize the client
   */
  init(): void {
    if (this.initialized) return;

    // Listen for SW messages
    this.messageHandler = (event: MessageEvent) => {
      const data = event.data as SWWorkflowMessage;
      if (!data || typeof data !== 'object' || !data.type) return;

      this.handleSWMessage(data);
    };

    navigator.serviceWorker?.addEventListener('message', this.messageHandler);
    this.initialized = true;

    // console.log('[SWWorkflowClient] Initialized');
  }

  /**
   * Destroy the client
   */
  destroy(): void {
    if (this.messageHandler) {
      navigator.serviceWorker?.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    this.events$.complete();
    this.initialized = false;
  }

  /**
   * Submit a workflow for execution
   */
  async submitWorkflow(workflow: Workflow): Promise<void> {
    const sw = await this.getServiceWorker();
    if (!sw) {
      throw new Error('Service Worker not available');
    }

    // Store workflow locally
    this.workflows.set(workflow.id, workflow);

    // Send to SW
    sw.postMessage({
      type: 'WORKFLOW_SUBMIT',
      workflow,
    });

    // console.log('[SWWorkflowClient] Workflow submitted:', workflow.id);
  }

  /**
   * Cancel a workflow
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
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
   * Observable of all workflow events
   */
  get events(): Observable<WorkflowEvent> {
    return this.events$.asObservable();
  }

  /**
   * Observable of events for a specific workflow
   */
  workflowEvents(workflowId: string): Observable<WorkflowEvent> {
    return this.events$.pipe(
      filter((event) => {
        if (event.type === 'canvas_operation') return false;
        return event.workflowId === workflowId;
      })
    );
  }

  /**
   * Observable of canvas operation requests
   */
  get canvasOperations(): Observable<CanvasOperationEvent> {
    return this.events$.pipe(
      filter((event): event is CanvasOperationEvent => event.type === 'canvas_operation')
    );
  }

  /**
   * Respond to a canvas operation request
   */
  async respondToCanvasOperation(
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

  // ============================================================================
  // Private Methods
  // ============================================================================

  private handleSWMessage(message: SWWorkflowMessage): void {
    switch (message.type) {
      case 'WORKFLOW_STATUS':
        this.handleWorkflowStatus(message);
        break;

      case 'WORKFLOW_STEP_STATUS':
        this.handleStepStatus(message);
        break;

      case 'WORKFLOW_COMPLETED':
        this.handleWorkflowCompleted(message);
        break;

      case 'WORKFLOW_FAILED':
        this.handleWorkflowFailed(message);
        break;

      case 'WORKFLOW_RECOVERED':
        this.handleWorkflowRecovered(message);
        break;

      case 'WORKFLOW_STEPS_ADDED':
        this.handleStepsAdded(message);
        break;

      case 'CANVAS_OPERATION_REQUEST':
        this.handleCanvasOperation(message);
        break;
    }
  }

  private handleWorkflowStatus(message: WorkflowStatusMessage): void {
    const workflow = this.workflows.get(message.workflowId);
    if (workflow) {
      workflow.status = message.status;
      workflow.updatedAt = message.updatedAt;
    }

    this.events$.next({
      type: 'status',
      workflowId: message.workflowId,
      status: message.status,
      updatedAt: message.updatedAt,
    });
  }

  private handleStepStatus(message: WorkflowStepStatusMessage): void {
    const workflow = this.workflows.get(message.workflowId);
    if (workflow) {
      const step = workflow.steps.find((s) => s.id === message.stepId);
      if (step) {
        step.status = message.status;
        step.result = message.result;
        step.error = message.error;
        step.duration = message.duration;
      }
    }

    this.events$.next({
      type: 'step',
      workflowId: message.workflowId,
      stepId: message.stepId,
      status: message.status,
      result: message.result,
      error: message.error,
      duration: message.duration,
    });
  }

  private handleWorkflowCompleted(message: WorkflowCompletedMessage): void {
    this.workflows.set(message.workflowId, message.workflow);

    this.events$.next({
      type: 'completed',
      workflowId: message.workflowId,
      workflow: message.workflow,
    });
  }

  private handleWorkflowFailed(message: WorkflowFailedMessage): void {
    const workflow = this.workflows.get(message.workflowId);
    if (workflow) {
      workflow.status = 'failed';
      workflow.error = message.error;
    }

    this.events$.next({
      type: 'failed',
      workflowId: message.workflowId,
      error: message.error,
    });
  }

  private handleWorkflowRecovered(message: WorkflowRecoveredMessage): void {
    this.workflows.set(message.workflowId, message.workflow);

    // Also broadcast as a status event to update UI
    this.events$.next({
      type: 'status',
      workflowId: message.workflowId,
      status: message.workflow.status,
      updatedAt: message.workflow.updatedAt,
    });
  }

  private handleStepsAdded(message: WorkflowStepsAddedMessage): void {
    const workflow = this.workflows.get(message.workflowId);
    if (workflow) {
      // Add new steps to local workflow object
      for (const newStep of message.steps) {
        if (!workflow.steps.find((s) => s.id === newStep.id)) {
          workflow.steps.push(newStep);
        }
      }
    }

    // Broadcast a status event to trigger UI refresh
    this.events$.next({
      type: 'status',
      workflowId: message.workflowId,
      status: workflow?.status || 'running',
      updatedAt: Date.now(),
    });
  }

  private handleCanvasOperation(message: CanvasOperationRequestMessage): void {
    this.events$.next({
      type: 'canvas_operation',
      requestId: message.requestId,
      operation: message.operation,
      params: message.params,
    });
  }

  private async getServiceWorker(): Promise<ServiceWorker | null> {
    if (!navigator.serviceWorker) return null;

    const registration = await navigator.serviceWorker.ready;
    return registration.active;
  }
}

// Export singleton instance
export const swWorkflowClient = new SWWorkflowClient();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a workflow from simple generation parameters
 */
export function createGenerationWorkflow(params: {
  type: 'image' | 'video';
  prompt: string;
  model?: string;
  size?: string;
  count?: number;
  duration?: string;
  referenceImages?: string[];
}): Workflow {
  const workflowId = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const stepId = `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const mcpTool = params.type === 'image' ? 'generate_image' : 'generate_video';
  const args: Record<string, unknown> = {
    prompt: params.prompt,
  };

  if (params.model) args.model = params.model;
  if (params.size) args.size = params.size;
  if (params.count) args.count = params.count;
  if (params.duration) args.seconds = params.duration;
  if (params.referenceImages) args.referenceImages = params.referenceImages;

  return {
    id: workflowId,
    steps: [
      {
        id: stepId,
        mcp: mcpTool,
        args,
        description: params.type === 'image' ? '生成图片' : '生成视频',
        status: 'pending',
      },
    ],
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    context: {
      userInput: params.prompt,
      model: params.model,
      params: {
        count: params.count,
        size: params.size,
        duration: params.duration,
      },
    },
  };
}

/**
 * Create a multi-step workflow
 */
export function createMultiStepWorkflow(
  steps: Array<{
    mcp: string;
    args: Record<string, unknown>;
    description: string;
    dependsOn?: string[];
  }>,
  context?: WorkflowContext
): Workflow {
  const workflowId = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const workflowSteps: WorkflowStep[] = steps.map((step, index) => ({
    id: `step_${index}_${Math.random().toString(36).substr(2, 9)}`,
    mcp: step.mcp,
    args: step.args,
    description: step.description,
    status: 'pending' as const,
    dependsOn: step.dependsOn,
  }));

  return {
    id: workflowId,
    steps: workflowSteps,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    context,
  };
}
