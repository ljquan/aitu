/**
 * useSWWorkflow Hook
 *
 * React hook for using the SW Workflow system.
 * Provides workflow submission, status tracking, and canvas operation handling.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Subscription } from 'rxjs';
import {
  swWorkflowClient,
  createGenerationWorkflow,
  createMultiStepWorkflow,
  type Workflow,
  type WorkflowEvent,
  type WorkflowStep,
  type CanvasOperationEvent,
} from '../services/sw-workflow-client';

export interface UseSWWorkflowOptions {
  /** Callback when a canvas operation is requested */
  onCanvasOperation?: (event: CanvasOperationEvent) => Promise<{ success: boolean; error?: string }>;
  /** Auto-initialize on mount */
  autoInit?: boolean;
}

export interface UseSWWorkflowReturn {
  /** Whether the client is initialized */
  initialized: boolean;
  /** All workflows */
  workflows: Workflow[];
  /** Submit a simple generation workflow */
  submitGeneration: (params: {
    type: 'image' | 'video';
    prompt: string;
    model?: string;
    size?: string;
    count?: number;
    duration?: string;
    referenceImages?: string[];
  }) => Promise<string>;
  /** Submit a custom workflow */
  submitWorkflow: (workflow: Workflow) => Promise<void>;
  /** Cancel a workflow */
  cancelWorkflow: (workflowId: string) => Promise<void>;
  /** Get workflow by ID */
  getWorkflow: (workflowId: string) => Workflow | undefined;
  /** Subscribe to workflow events */
  subscribeToWorkflow: (
    workflowId: string,
    callback: (event: WorkflowEvent) => void
  ) => () => void;
}

/**
 * Hook for using SW Workflow system
 */
export function useSWWorkflow(options: UseSWWorkflowOptions = {}): UseSWWorkflowReturn {
  const { onCanvasOperation, autoInit = true } = options;

  const [initialized, setInitialized] = useState(false);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const subscriptionsRef = useRef<Subscription[]>([]);
  const canvasHandlerRef = useRef(onCanvasOperation);

  // Keep canvas handler ref updated
  useEffect(() => {
    canvasHandlerRef.current = onCanvasOperation;
  }, [onCanvasOperation]);

  // Initialize client
  useEffect(() => {
    if (!autoInit) return;

    swWorkflowClient.init();
    setInitialized(true);

    // Subscribe to all events to update local state
    const eventSub = swWorkflowClient.events.subscribe((event) => {
      if (event.type === 'completed' || event.type === 'failed' || event.type === 'status') {
        setWorkflows(swWorkflowClient.getAllWorkflows());
      }
    });
    subscriptionsRef.current.push(eventSub);

    // Subscribe to canvas operations
    const canvasSub = swWorkflowClient.canvasOperations.subscribe(async (event) => {
      if (canvasHandlerRef.current) {
        const result = await canvasHandlerRef.current(event);
        await swWorkflowClient.respondToCanvasOperation(
          event.requestId,
          result.success,
          result.error
        );
      } else {
        // No handler, respond with success (fire-and-forget)
        await swWorkflowClient.respondToCanvasOperation(event.requestId, true);
      }
    });
    subscriptionsRef.current.push(canvasSub);

    return () => {
      subscriptionsRef.current.forEach((sub) => sub.unsubscribe());
      subscriptionsRef.current = [];
    };
  }, [autoInit]);

  // Submit a simple generation workflow
  const submitGeneration = useCallback(
    async (params: {
      type: 'image' | 'video';
      prompt: string;
      model?: string;
      size?: string;
      count?: number;
      duration?: string;
      referenceImages?: string[];
    }): Promise<string> => {
      const workflow = createGenerationWorkflow(params);
      await swWorkflowClient.submitWorkflow(workflow);
      setWorkflows(swWorkflowClient.getAllWorkflows());
      return workflow.id;
    },
    []
  );

  // Submit a custom workflow
  const submitWorkflow = useCallback(async (workflow: Workflow): Promise<void> => {
    await swWorkflowClient.submitWorkflow(workflow);
    setWorkflows(swWorkflowClient.getAllWorkflows());
  }, []);

  // Cancel a workflow
  const cancelWorkflow = useCallback(async (workflowId: string): Promise<void> => {
    await swWorkflowClient.cancelWorkflow(workflowId);
  }, []);

  // Get workflow by ID
  const getWorkflow = useCallback((workflowId: string): Workflow | undefined => {
    return swWorkflowClient.getWorkflow(workflowId);
  }, []);

  // Subscribe to workflow events
  const subscribeToWorkflow = useCallback(
    (workflowId: string, callback: (event: WorkflowEvent) => void): (() => void) => {
      const sub = swWorkflowClient.workflowEvents(workflowId).subscribe(callback);
      return () => sub.unsubscribe();
    },
    []
  );

  return {
    initialized,
    workflows,
    submitGeneration,
    submitWorkflow,
    cancelWorkflow,
    getWorkflow,
    subscribeToWorkflow,
  };
}

// Re-export types and helpers
export { createGenerationWorkflow, createMultiStepWorkflow };
export type { Workflow, WorkflowStep, WorkflowEvent, CanvasOperationEvent };
