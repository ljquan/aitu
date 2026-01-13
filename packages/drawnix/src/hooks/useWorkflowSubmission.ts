/**
 * useWorkflowSubmission Hook
 *
 * Thin wrapper around workflowSubmissionService for React components.
 * Handles React-specific concerns:
 * - State synchronization with WorkflowContext
 * - ChatDrawer message updates
 * - WorkZone UI updates
 * - Subscription lifecycle management
 */

import { useEffect, useCallback, useRef } from 'react';
import { Subscription } from 'rxjs';
import {
  workflowSubmissionService,
  type WorkflowEvent,
  type WorkflowStepEvent,
  type WorkflowStepsAddedEvent,
  type CanvasInsertEvent,
} from '../services/workflow-submission-service';
import { useWorkflowControl } from '../contexts/WorkflowContext';
import { useChatDrawerControl } from '../contexts/ChatDrawerContext';
import type { WorkflowMessageData, WorkflowRetryContext, PostProcessingStatus } from '../types/chat.types';
import type { ParsedGenerationParams } from '../utils/ai-input-parser';
import { type WorkflowDefinition as LegacyWorkflowDefinition } from '../components/ai-input-bar/workflow-converter';
import { WorkZoneTransforms } from '../plugins/with-workzone';
import { PlaitBoard } from '@plait/core';

// ============================================================================
// Types
// ============================================================================

export interface UseWorkflowSubmissionOptions {
  /** Board reference for WorkZone updates */
  boardRef: React.MutableRefObject<PlaitBoard | null>;
  /** Current WorkZone ID reference */
  workZoneIdRef: React.MutableRefObject<string | null>;
}

export interface UseWorkflowSubmissionReturn {
  /** Submit a workflow based on parsed AI input */
  submitWorkflow: (
    parsedInput: ParsedGenerationParams,
    referenceImages: string[],
    retryContext?: WorkflowRetryContext,
    existingWorkflow?: LegacyWorkflowDefinition
  ) => Promise<{ workflowId: string; usedSW: boolean }>;
  /** Cancel a workflow */
  cancelWorkflow: (workflowId: string) => Promise<void>;
  /** Check if SW execution is available */
  isSWAvailable: () => boolean;
  /** Get current retry context */
  getRetryContext: () => WorkflowRetryContext | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert workflow to WorkflowMessageData for ChatDrawer
 */
export function toWorkflowMessageData(
  workflow: LegacyWorkflowDefinition,
  retryContext?: WorkflowRetryContext,
  postProcessingStatus?: PostProcessingStatus,
  insertedCount?: number
): WorkflowMessageData {
  return workflowSubmissionService.toWorkflowMessageData(
    workflow,
    retryContext,
    postProcessingStatus,
    insertedCount
  );
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useWorkflowSubmission(
  options: UseWorkflowSubmissionOptions
): UseWorkflowSubmissionReturn {
  const { boardRef, workZoneIdRef } = options;

  const workflowControl = useWorkflowControl();
  const chatDrawerControl = useChatDrawerControl();

  // Refs for callbacks to avoid stale closures
  const sendWorkflowMessageRef = useRef(chatDrawerControl.sendWorkflowMessage);
  const updateWorkflowMessageRef = useRef(chatDrawerControl.updateWorkflowMessage);

  useEffect(() => {
    sendWorkflowMessageRef.current = chatDrawerControl.sendWorkflowMessage;
    updateWorkflowMessageRef.current = chatDrawerControl.updateWorkflowMessage;
  }, [chatDrawerControl.sendWorkflowMessage, chatDrawerControl.updateWorkflowMessage]);

  // Current retry context
  const currentRetryContextRef = useRef<WorkflowRetryContext | null>(null);

  // Active subscriptions
  const subscriptionsRef = useRef<Subscription[]>([]);

  // Initialize service on mount
  useEffect(() => {
    workflowSubmissionService.init();

    // Subscribe to canvas insert requests
    const canvasSub = workflowSubmissionService.subscribeToCanvasInserts(
      async (event: CanvasInsertEvent) => {
        await workflowSubmissionService.respondToCanvasInsert(event.requestId, true);
      }
    );
    subscriptionsRef.current.push(canvasSub);

    return () => {
      subscriptionsRef.current.forEach(sub => sub.unsubscribe());
      subscriptionsRef.current = [];
    };
  }, []);

  /**
   * Handle workflow events from SW - sync to React state
   */
  const handleWorkflowEvent = useCallback((
    event: WorkflowEvent,
    _legacyWorkflow: LegacyWorkflowDefinition,
    retryContext: WorkflowRetryContext
  ) => {
    const board = boardRef.current;
    const workZoneId = workZoneIdRef.current;

    // Helper to sync updates to ChatDrawer and WorkZone
    const syncUpdates = () => {
      const updatedWorkflow = workflowControl.getWorkflow();
      if (updatedWorkflow) {
        const workflowData = toWorkflowMessageData(updatedWorkflow, retryContext);
        updateWorkflowMessageRef.current(workflowData);

        if (workZoneId && board) {
          WorkZoneTransforms.updateWorkflow(board, workZoneId, workflowData);
        }
      }
    };

    switch (event.type) {
      case 'step': {
        const stepEvent = event as WorkflowStepEvent;
        workflowControl.updateStep(
          stepEvent.stepId,
          stepEvent.status,
          stepEvent.result,
          stepEvent.error,
          stepEvent.duration
        );
        syncUpdates();
        break;
      }

      case 'completed': {
        // Mark remaining steps as completed (except queue tasks)
        const currentWorkflow = workflowControl.getWorkflow();
        if (currentWorkflow) {
          currentWorkflow.steps.forEach(step => {
            if (step.status === 'running' || step.status === 'pending') {
              const stepResult = step.result as { taskId?: string } | undefined;
              if (!stepResult?.taskId) {
                workflowControl.updateStep(step.id, 'completed');
              }
            }
          });
        }
        syncUpdates();
        break;
      }

      case 'failed': {
        workflowControl.abortWorkflow();
        syncUpdates();
        break;
      }

      case 'steps_added': {
        const stepsEvent = event as WorkflowStepsAddedEvent;
        workflowControl.addSteps(stepsEvent.steps.map(step => ({
          id: step.id,
          mcp: step.mcp,
          args: step.args,
          description: step.description,
          status: step.status,
        })));
        syncUpdates();
        break;
      }
    }
  }, [workflowControl, boardRef, workZoneIdRef]);

  /**
   * Submit a workflow
   */
  const submitWorkflow = useCallback(async (
    parsedInput: ParsedGenerationParams,
    referenceImages: string[],
    retryContext?: WorkflowRetryContext,
    existingWorkflow?: LegacyWorkflowDefinition
  ): Promise<{ workflowId: string; usedSW: boolean }> => {
    // Use service to submit workflow
    const result = await workflowSubmissionService.submitWorkflow(
      parsedInput,
      referenceImages,
      retryContext,
      existingWorkflow
    );

    // Start workflow in WorkflowContext
    workflowControl.startWorkflow(result.workflow);

    // Store retry context
    currentRetryContextRef.current = result.retryContext;

    // Send to ChatDrawer
    const workflowMessageData = toWorkflowMessageData(result.workflow, result.retryContext);
    await sendWorkflowMessageRef.current({
      context: result.retryContext.aiContext,
      workflow: workflowMessageData,
      textModel: result.retryContext.textModel,
      autoOpen: false,
    });

    // Replace default subscription with event handler
    result.subscription.unsubscribe();
    const eventSub = workflowSubmissionService.subscribeToWorkflow(
      result.workflowId,
      (event) => handleWorkflowEvent(event, result.workflow, result.retryContext)
    );
    subscriptionsRef.current.push(eventSub);

    return { workflowId: result.workflowId, usedSW: result.usedSW };
  }, [workflowControl, handleWorkflowEvent]);

  /**
   * Cancel a workflow
   */
  const cancelWorkflow = useCallback(async (workflowId: string): Promise<void> => {
    await workflowSubmissionService.cancel(workflowId);
    workflowControl.abortWorkflow();
  }, [workflowControl]);

  /**
   * Check if SW execution is available
   */
  const isSWAvailable = useCallback((): boolean => {
    return workflowSubmissionService.isSWAvailable();
  }, []);

  /**
   * Get current retry context
   */
  const getRetryContext = useCallback((): WorkflowRetryContext | null => {
    return currentRetryContextRef.current;
  }, []);

  return {
    submitWorkflow,
    cancelWorkflow,
    isSWAvailable,
    getRetryContext,
  };
}
