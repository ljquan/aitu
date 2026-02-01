/**
 * Workflow Repository
 *
 * Encapsulates the communication with Service Worker for workflow persistence.
 * This is the single point of truth for workflow data access.
 */

import { Subject, Observable, Subscription } from 'rxjs';
import type {
  Workflow,
  WorkflowStatus,
  WorkflowStep,
  WorkflowStepStatus,
  WorkflowEvent,
  WorkflowStatusEvent,
  WorkflowStepEvent,
  WorkflowCompletedEvent,
  WorkflowFailedEvent,
  WorkflowStepsAddedEvent,
  WorkflowRecoveredEvent,
} from './workflow.model';
import {
  swChannelClient,
  type SWChannelEventHandlers,
} from '../../services/sw-channel/client';
import { taskService } from '../task/task.service';

// ============================================================================
// Types
// ============================================================================

/**
 * Workflow submission result
 */
export interface WorkflowSubmitResult {
  success: boolean;
  error?: string;
}

// Cleanup delay: 5 minutes after workflow completes/fails
const WORKFLOW_CLEANUP_DELAY = 5 * 60 * 1000;

// ============================================================================
// Workflow Repository Implementation
// ============================================================================

/**
 * Workflow Repository
 *
 * Provides a unified interface for workflow CRUD operations.
 */
class WorkflowRepository {
  private static instance: WorkflowRepository;
  
  /** Local cache of workflows */
  private workflows: Map<string, Workflow> = new Map();
  
  /** Event subject for workflow updates */
  private events$ = new Subject<WorkflowEvent>();
  
  /** Cleanup timers */
  private cleanupTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  
  /** Initialization state */
  private initialized = false;

  private constructor() {
    this.setupEventHandlers();
  }

  static getInstance(): WorkflowRepository {
    if (!WorkflowRepository.instance) {
      WorkflowRepository.instance = new WorkflowRepository();
    }
    return WorkflowRepository.instance;
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the repository
   */
  init(): void {
    if (this.initialized) return;
    if (!navigator.serviceWorker) {
      console.warn('[WorkflowRepository] Service Worker not supported');
      return;
    }

    this.initialized = true;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  /**
   * Submit a workflow for execution
   */
  async submit(workflow: Workflow): Promise<WorkflowSubmitResult> {
    if (!swChannelClient.isInitialized()) {
      return { success: false, error: 'SWChannelClient not initialized' };
    }

    // Check SW initialization
    if (!taskService.isInitialized()) {
      const initSuccess = await taskService.initializeSW();
      if (!initSuccess) {
        return { success: false, error: 'Failed to initialize Service Worker' };
      }
    }

    // Store locally
    this.workflows.set(workflow.id, workflow);

    // Submit via SWChannelClient
    let result = await swChannelClient.submitWorkflow(workflow);
    
    // Retry if not initialized
    if (!result.success && result.error?.includes('not initialized')) {
      const reinitSuccess = await taskService.initializeSW();
      if (reinitSuccess) {
        result = await swChannelClient.submitWorkflow(workflow);
      }
    }
    
    if (!result.success) {
      this.workflows.delete(workflow.id);
      return { success: false, error: result.error || 'Submit workflow failed' };
    }

    return { success: true };
  }

  /**
   * Cancel a workflow
   */
  async cancel(workflowId: string): Promise<void> {
    if (!swChannelClient.isInitialized()) return;
    await swChannelClient.cancelWorkflow(workflowId);
  }

  /**
   * Get workflow by ID from local cache
   */
  getById(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Query workflow status from SW
   */
  async queryStatus(workflowId: string): Promise<Workflow | null> {
    if (!swChannelClient.isInitialized()) {
      return this.workflows.get(workflowId) || null;
    }

    const response = await swChannelClient.getWorkflowStatus(workflowId);
    if (response.success && response.workflow) {
      this.workflows.set(workflowId, response.workflow as Workflow);
      return response.workflow as Workflow;
    }
    return this.workflows.get(workflowId) || null;
  }

  /**
   * Get all workflows from local cache
   */
  getAll(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Get running workflows
   */
  getRunning(): Workflow[] {
    return this.getAll().filter(w => 
      w.status === 'running' || w.status === 'pending'
    );
  }

  /**
   * Query all workflows from SW
   */
  async queryAll(): Promise<Workflow[]> {
    if (!swChannelClient.isInitialized()) {
      return this.getAll();
    }

    const response = await swChannelClient.getAllWorkflows();
    if (response.success) {
      for (const workflow of response.workflows) {
        this.workflows.set(workflow.id, workflow as Workflow);
      }
      return response.workflows as Workflow[];
    }
    return this.getAll();
  }

  /**
   * Recover workflows from SW after page refresh
   */
  async recover(): Promise<Workflow[]> {
    if (!swChannelClient.isInitialized()) {
      return [];
    }

    try {
      const response = await swChannelClient.getAllWorkflows();
      
      if (!response.success) {
        return [];
      }
      
      // Sync all workflows from SW
      for (const workflow of response.workflows) {
        const existing = this.workflows.get(workflow.id);
        if (!existing || workflow.updatedAt > (existing.updatedAt || 0)) {
          this.workflows.set(workflow.id, workflow as Workflow);
          
          // Emit event for failed workflows
          if (workflow.status === 'failed' && existing?.status !== 'failed') {
            this.events$.next({
              type: 'failed',
              workflowId: workflow.id,
              error: workflow.error || 'Unknown error',
            });
          }
        }
      }
      
      return this.getRunning();
    } catch (error) {
      console.warn('[WorkflowRepository] Failed to recover workflows:', error);
      return [];
    }
  }

  // ============================================================================
  // Observable
  // ============================================================================

  /**
   * Observe workflow events
   */
  observe(): Observable<WorkflowEvent> {
    return this.events$.asObservable();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private cloneWorkflow(workflow: Workflow): Workflow {
    return JSON.parse(JSON.stringify(workflow));
  }

  private getMutableWorkflow(workflowId: string): Workflow | undefined {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return undefined;
    
    const mutableWorkflow = this.cloneWorkflow(workflow);
    this.workflows.set(workflowId, mutableWorkflow);
    return mutableWorkflow;
  }

  private setupEventHandlers(): void {
    const eventHandlers: SWChannelEventHandlers = {
      onWorkflowStatus: (event) => this.handleWorkflowStatus(event),
      onWorkflowStepStatus: (event) => this.handleStepStatus(event),
      onWorkflowCompleted: (event) => this.handleWorkflowCompleted(event),
      onWorkflowFailed: (event) => this.handleWorkflowFailed(event),
      onWorkflowStepsAdded: (event) => this.handleWorkflowStepsAdded(event),
      onWorkflowRecovered: (event) => this.handleWorkflowRecovered(event),
    };

    swChannelClient.setEventHandlers(eventHandlers);
  }

  private handleWorkflowStatus(event: { workflowId: string; status: string; updatedAt: number }): void {
    const workflow = this.getMutableWorkflow(event.workflowId);
    if (workflow) {
      workflow.status = event.status as WorkflowStatus;
      workflow.updatedAt = event.updatedAt;
    }

    this.events$.next({
      type: 'status',
      workflowId: event.workflowId,
      status: event.status as WorkflowStatus,
    });
  }

  private handleStepStatus(event: {
    workflowId: string;
    stepId: string;
    status: string;
    result?: unknown;
    error?: string;
    duration?: number;
  }): void {
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

  private handleWorkflowCompleted(event: { workflowId: string; workflow?: unknown }): void {
    if (event.workflow) {
      this.workflows.set(event.workflowId, this.cloneWorkflow(event.workflow as Workflow));
    }

    this.events$.next({
      type: 'completed',
      workflowId: event.workflowId,
      workflow: event.workflow as Workflow,
    });

    this.scheduleCleanup(event.workflowId);
  }

  private handleWorkflowFailed(event: { workflowId: string; error: string }): void {
    const workflow = this.getMutableWorkflow(event.workflowId);
    if (workflow) {
      workflow.status = 'failed';
      workflow.error = event.error;
    }

    this.events$.next({
      type: 'failed',
      workflowId: event.workflowId,
      error: event.error,
    });

    this.scheduleCleanup(event.workflowId);
  }

  private handleWorkflowStepsAdded(event: { workflowId: string; steps?: unknown[] }): void {
    const workflow = this.workflows.get(event.workflowId);
    if (workflow && event.steps) {
      for (const step of event.steps as WorkflowStep[]) {
        if (!workflow.steps.find(s => s.id === step.id)) {
          workflow.steps.push(step);
        }
      }

      this.events$.next({
        type: 'steps_added',
        workflowId: event.workflowId,
        steps: event.steps as WorkflowStep[],
      });
    }
  }

  private handleWorkflowRecovered(event: { workflowId: string; workflow?: unknown }): void {
    if (event.workflow) {
      this.workflows.set(event.workflowId, event.workflow as Workflow);
      
      this.events$.next({
        type: 'recovered',
        workflowId: event.workflowId,
        workflow: event.workflow as Workflow,
      });
    }
  }

  private scheduleCleanup(workflowId: string): void {
    const existingTimer = this.cleanupTimers.get(workflowId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.workflows.delete(workflowId);
      this.cleanupTimers.delete(workflowId);
    }, WORKFLOW_CLEANUP_DELAY);

    this.cleanupTimers.set(workflowId, timer);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.events$.complete();
    this.initialized = false;
    
    // Clear all cleanup timers
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();
  }
}

// Export singleton instance
export const workflowRepository = WorkflowRepository.getInstance();
