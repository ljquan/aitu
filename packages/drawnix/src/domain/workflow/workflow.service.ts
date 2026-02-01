/**
 * Workflow Service
 *
 * Business logic layer for workflow management.
 * Uses WorkflowRepository for data access and publishes domain events.
 */

import { Observable, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import type {
  Workflow,
  WorkflowStatus,
  WorkflowStep,
  WorkflowStepStatus,
  WorkflowEvent,
  WorkflowContext,
} from './workflow.model';
import { workflowRepository, type WorkflowSubmitResult } from './workflow.repository';
import { domainEventBus } from '../shared/event-bus';
import type { ParsedGenerationParams } from '../../utils/ai-input-parser';

// ============================================================================
// Types
// ============================================================================

/**
 * Create workflow parameters
 */
export interface CreateWorkflowParams {
  parsedInput: ParsedGenerationParams;
  referenceImages?: string[];
}

// ============================================================================
// Workflow Service Implementation
// ============================================================================

/**
 * Workflow Service
 *
 * Provides high-level workflow management operations.
 */
class WorkflowService {
  private static instance: WorkflowService;
  private eventSubscription: Subscription | null = null;

  private constructor() {
    this.setupEventForwarding();
  }

  static getInstance(): WorkflowService {
    if (!WorkflowService.instance) {
      WorkflowService.instance = new WorkflowService();
    }
    return WorkflowService.instance;
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the workflow service
   */
  init(): void {
    workflowRepository.init();
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return workflowRepository.isInitialized();
  }

  // ============================================================================
  // Workflow Operations
  // ============================================================================

  /**
   * Create a workflow from parsed AI input
   */
  createWorkflow(params: CreateWorkflowParams): Workflow {
    const { parsedInput, referenceImages = [] } = params;
    
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
        args: { ...args, count: 1 },
        description: parsedInput.generationType === 'video'
          ? `生成视频 ${i + 1}/${count}`
          : `生成图片 ${i + 1}/${count}`,
        status: 'pending',
      });
    }

    const workflow: Workflow = {
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
  async submitWorkflow(workflow: Workflow): Promise<WorkflowSubmitResult> {
    return workflowRepository.submit(workflow);
  }

  /**
   * Create and submit a workflow in one step
   */
  async createAndSubmit(params: CreateWorkflowParams): Promise<{ workflow: Workflow; result: WorkflowSubmitResult }> {
    const workflow = this.createWorkflow(params);
    const result = await this.submitWorkflow(workflow);
    return { workflow, result };
  }

  /**
   * Cancel a workflow
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    return workflowRepository.cancel(workflowId);
  }

  /**
   * Get workflow by ID
   */
  getWorkflow(workflowId: string): Workflow | undefined {
    return workflowRepository.getById(workflowId);
  }

  /**
   * Query workflow status from SW
   */
  async queryWorkflowStatus(workflowId: string): Promise<Workflow | null> {
    return workflowRepository.queryStatus(workflowId);
  }

  /**
   * Get all workflows
   */
  getAllWorkflows(): Workflow[] {
    return workflowRepository.getAll();
  }

  /**
   * Get running workflows
   */
  getRunningWorkflows(): Workflow[] {
    return workflowRepository.getRunning();
  }

  /**
   * Query all workflows from SW
   */
  async queryAllWorkflows(): Promise<Workflow[]> {
    return workflowRepository.queryAll();
  }

  /**
   * Recover workflows after page refresh
   */
  async recoverWorkflows(): Promise<Workflow[]> {
    return workflowRepository.recover();
  }

  /**
   * Check if there are running workflows
   */
  hasRunningWorkflows(): boolean {
    return this.getRunningWorkflows().length > 0;
  }

  // ============================================================================
  // Observable
  // ============================================================================

  /**
   * Observe all workflow events
   */
  observeEvents(): Observable<WorkflowEvent> {
    return workflowRepository.observe();
  }

  /**
   * Observe events for a specific workflow
   */
  observeWorkflow(workflowId: string): Observable<WorkflowEvent> {
    return workflowRepository.observe().pipe(
      filter(event => {
        if (event.type === 'canvas_insert' || event.type === 'main_thread_tool_request') {
          return false;
        }
        return (event as { workflowId?: string }).workflowId === workflowId;
      })
    );
  }

  /**
   * Observe completed workflows
   */
  observeCompletedWorkflows(): Observable<WorkflowEvent> {
    return workflowRepository.observe().pipe(
      filter(event => event.type === 'completed')
    );
  }

  /**
   * Observe failed workflows
   */
  observeFailedWorkflows(): Observable<WorkflowEvent> {
    return workflowRepository.observe().pipe(
      filter(event => event.type === 'failed')
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Forward repository events to domain event bus
   */
  private setupEventForwarding(): void {
    this.eventSubscription = workflowRepository.observe().subscribe(event => {
      switch (event.type) {
        case 'status':
          domainEventBus.publish({
            type: 'workflow:started',
            workflowId: event.workflowId,
            name: '',
            timestamp: Date.now(),
          });
          break;
        case 'step':
          if (event.status === 'completed') {
            domainEventBus.publish({
              type: 'workflow:stepCompleted',
              workflowId: event.workflowId,
              stepId: event.stepId,
              result: event.result,
              timestamp: Date.now(),
            });
          }
          break;
        case 'completed':
          domainEventBus.publish({
            type: 'workflow:completed',
            workflowId: event.workflowId,
            timestamp: Date.now(),
          });
          break;
        case 'failed':
          domainEventBus.publish({
            type: 'workflow:failed',
            workflowId: event.workflowId,
            error: event.error,
            timestamp: Date.now(),
          });
          break;
      }
    });
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.eventSubscription) {
      this.eventSubscription.unsubscribe();
      this.eventSubscription = null;
    }
    workflowRepository.destroy();
  }
}

// Export singleton instance
export const workflowService = WorkflowService.getInstance();
