/**
 * useWorkflowSubmission Hook
 *
 * Encapsulates workflow submission logic for AIInputBar.
 * Supports two execution modes:
 * 1. SW Mode (direct_generation): Execute in Service Worker for background processing
 * 2. Legacy Mode (agent_flow): Execute in main thread for complex AI workflows
 *
 * Handles:
 * - Workflow creation and submission
 * - Status synchronization with WorkflowContext, ChatDrawer, WorkZone
 * - Canvas operation handling
 * - Main thread tool execution (for tools that cannot run in SW)
 */

import { useEffect, useCallback, useRef } from 'react';
import { Subscription } from 'rxjs';
import {
  workflowSubmissionService,
  type WorkflowDefinition as SWWorkflowDefinition,
  type WorkflowEvent,
  type CanvasInsertEvent,
  type WorkflowStepsAddedEvent,
} from '../services/workflow-submission-service';
import { useWorkflowControl } from '../contexts/WorkflowContext';
import { useChatDrawerControl } from '../contexts/ChatDrawerContext';
import type { WorkflowMessageData, WorkflowRetryContext, PostProcessingStatus } from '../types/chat.types';
import type { ParsedGenerationParams } from '../utils/ai-input-parser';
import { convertToWorkflow, type WorkflowDefinition as LegacyWorkflowDefinition } from '../components/ai-input-bar/workflow-converter';
import { WorkZoneTransforms } from '../plugins/with-workzone';
import { PlaitBoard } from '@plait/core';
import { geminiSettings } from '../utils/settings-manager';

// ============================================================================
// Types
// ============================================================================

export interface UseWorkflowSubmissionOptions {
  /** Board reference for WorkZone updates */
  boardRef: React.MutableRefObject<PlaitBoard | null>;
  /** Current WorkZone ID reference */
  workZoneIdRef: React.MutableRefObject<string | null>;
  /** Whether to use SW execution (default: true for direct_generation) */
  useSWExecution?: boolean;
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
  /** Handle workflow retry */
  retryWorkflow: (
    workflowMessageData: WorkflowMessageData,
    startStepIndex: number
  ) => Promise<void>;
  /** Check if SW execution is available */
  isSWAvailable: () => boolean;
  /** Get current retry context */
  getRetryContext: () => WorkflowRetryContext | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert internal workflow to WorkflowMessageData for ChatDrawer
 */
export function toWorkflowMessageData(
  workflow: LegacyWorkflowDefinition,
  retryContext?: WorkflowRetryContext,
  postProcessingStatus?: PostProcessingStatus,
  insertedCount?: number
): WorkflowMessageData {
  // Safely access metadata with defaults
  const metadata = workflow.metadata || {};
  
  return {
    id: workflow.id,
    name: workflow.name,
    generationType: workflow.generationType,
    prompt: metadata.prompt || retryContext?.aiContext?.finalPrompt || '',
    aiAnalysis: workflow.aiAnalysis,
    count: metadata.count,
    steps: workflow.steps.map(step => ({
      id: step.id,
      description: step.description,
      status: step.status,
      mcp: step.mcp,
      args: step.args,
      result: step.result,
      error: step.error,
      duration: step.duration,
      options: step.options,
    })),
    retryContext,
    postProcessingStatus,
    insertedCount,
  };
}

/**
 * Check if Service Worker is available and ready
 */
function checkSWAvailable(): boolean {
  return !!(navigator.serviceWorker && navigator.serviceWorker.controller);
}

/**
 * Determine if workflow should use SW execution
 * Now all workflows use SW execution - SW will delegate to main thread when needed
 */
function shouldUseSWExecution(parsedInput: ParsedGenerationParams): boolean {
  // Check if SW is available
  return checkSWAvailable();
}

/**
 * Handle canvas insert operation from SW
 */
async function handleCanvasInsert(board: PlaitBoard, event: CanvasInsertEvent): Promise<void> {
  const { operation, params } = event;
  
  try {
    // Dynamically import canvas operations to avoid circular dependencies
    const { insertImageFromUrl } = await import('../data/image');
    const { insertVideoFromUrl } = await import('../data/video');
    const { getSmartInsertionPoint } = await import('../utils/selection-utils');
    
    // Get insertion point
    const insertPoint = params.position 
      ? [params.position.x, params.position.y] as [number, number]
      : getSmartInsertionPoint(board) || [100, 100] as [number, number];
    
    if (operation === 'canvas_insert' && params.items) {
      // Handle batch insert
      for (const item of params.items) {
        if (item.type === 'image' && item.url) {
          await insertImageFromUrl(board, item.url, insertPoint);
        } else if (item.type === 'video' && item.url) {
          await insertVideoFromUrl(board, item.url, insertPoint);
        }
      }
    } else if (operation === 'insert_image' && params.url) {
      await insertImageFromUrl(board, params.url, insertPoint);
    } else if (operation === 'insert_video' && params.url) {
      await insertVideoFromUrl(board, params.url, insertPoint);
    }
  } catch (error) {
    console.error('[useWorkflowSubmission] Failed to insert to canvas:', error);
  }
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useWorkflowSubmission(
  options: UseWorkflowSubmissionOptions
): UseWorkflowSubmissionReturn {
  const { boardRef, workZoneIdRef, useSWExecution = true } = options;

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

  // Flag to track if we've already recovered workflows
  const hasRecoveredRef = useRef(false);

  // Ref to hold handleWorkflowEvent to avoid TDZ issues
  const handleWorkflowEventRef = useRef<((
    event: WorkflowEvent,
    legacyWorkflow: LegacyWorkflowDefinition,
    retryContext: WorkflowRetryContext
  ) => void) | null>(null);

  /**
   * Recover workflows on mount (after page refresh)
   */
  const recoverWorkflowsOnMount = useCallback(async () => {
    // Only recover once
    if (hasRecoveredRef.current) return;
    hasRecoveredRef.current = true;

    try {
      const recoveredWorkflows = await workflowSubmissionService.recoverWorkflows();
      
      if (recoveredWorkflows.length > 0) {
        console.log(`[useWorkflowSubmission] Recovered ${recoveredWorkflows.length} workflows from SW`);
      }
    } catch (error) {
      console.warn('[useWorkflowSubmission] Failed to recover workflows:', error);
    }
  }, []);

  /**
   * Handle a recovered workflow (from page refresh)
   * This restores UI state without re-submitting to SW
   */
  const handleRecoveredWorkflow = useCallback((event: WorkflowEvent) => {
    if (event.type !== 'recovered' || !event.workflow) return;

    const recoveredWorkflow = event.workflow as unknown as LegacyWorkflowDefinition;
    const board = boardRef.current;
    const workZoneId = workZoneIdRef.current;

    console.log('[useWorkflowSubmission] Recovered workflow:', recoveredWorkflow.id, recoveredWorkflow.status);

    // Only restore running/pending workflows to avoid showing stale data
    if (recoveredWorkflow.status !== 'running' && recoveredWorkflow.status !== 'pending') {
      return;
    }

    // Restore workflow to WorkflowContext
    workflowControl.restoreWorkflow?.(recoveredWorkflow);

    // Build retry context from workflow context
    const retryContext: WorkflowRetryContext = {
      aiContext: {
        rawInput: recoveredWorkflow.context?.userInput || '',
        userInstruction: recoveredWorkflow.context?.userInput || '',
        model: {
          id: recoveredWorkflow.context?.model || '',
          type: recoveredWorkflow.generationType === 'video' ? 'video' : 'image',
          isExplicit: true,
        },
        params: {
          count: recoveredWorkflow.metadata?.count,
          size: recoveredWorkflow.metadata?.size,
          duration: recoveredWorkflow.metadata?.duration,
        },
        selection: { texts: [], images: [], videos: [], graphics: [] },
        finalPrompt: recoveredWorkflow.metadata?.prompt || '',
      },
      referenceImages: recoveredWorkflow.context?.referenceImages || [],
      textModel: geminiSettings.get().textModelName,
    };

    // Update ChatDrawer with recovered workflow
    const workflowData = toWorkflowMessageData(recoveredWorkflow, retryContext);
    updateWorkflowMessageRef.current(workflowData);

    // Update WorkZone if exists
    if (workZoneId && board) {
      WorkZoneTransforms.updateWorkflow(board, workZoneId, workflowData);
    }

    // Subscribe to future events for this workflow using ref
    const workflowSub = workflowSubmissionService.subscribeToWorkflow(
      recoveredWorkflow.id,
      (evt: WorkflowEvent) => {
        handleWorkflowEventRef.current?.(evt, recoveredWorkflow, retryContext);
      }
    );
    subscriptionsRef.current.push(workflowSub);
  }, [workflowControl, boardRef, workZoneIdRef]);

  // Initialize service on mount
  useEffect(() => {
    workflowSubmissionService.init();

    // Subscribe to canvas insert requests
    const canvasSub = workflowSubmissionService.subscribeToCanvasInserts(
      async (event: CanvasInsertEvent) => {
        // console.log('[useWorkflowSubmission] Canvas insert request:', event);
        // For now, just acknowledge - actual canvas insertion will be handled
        // by the existing auto-insert mechanism (useAutoInsertToCanvas)
        await workflowSubmissionService.respondToCanvasInsert(event.requestId, true);
      }
    );
    subscriptionsRef.current.push(canvasSub);

    // Subscribe to workflow recovery events
    const recoverySub = workflowSubmissionService.subscribeToAllEvents(
      (event: WorkflowEvent) => {
        if (event.type === 'recovered') {
          // Handle recovered workflow - update UI state without resubmitting
          handleRecoveredWorkflow(event);
        }
      }
    );
    subscriptionsRef.current.push(recoverySub);

    // Recover workflows after page refresh
    // This will query SW for any running workflows and restore UI state
    recoverWorkflowsOnMount();

    // Note: Main thread tool requests are now handled by SWTaskQueueClient.handleMainThreadToolRequest
    // which uses swCapabilitiesHandler. This avoids duplicate handling and race conditions.
    // The workflowSubmissionService.subscribeToToolRequests is no longer used.

    return () => {
      subscriptionsRef.current.forEach(sub => sub.unsubscribe());
      subscriptionsRef.current = [];
    };
  }, []);

  /**
   * Handle workflow events from SW
   */
  const handleWorkflowEvent = useCallback((
    event: WorkflowEvent,
    legacyWorkflow: LegacyWorkflowDefinition,
    retryContext: WorkflowRetryContext
  ) => {
    const board = boardRef.current;
    const workZoneId = workZoneIdRef.current;

    switch (event.type) {
      case 'step': {
        // console.log('[useWorkflowSubmission] Step event:', event.stepId, '->', event.status);
        // Update step in WorkflowContext
        workflowControl.updateStep(
          event.stepId,
          event.status,
          event.result,
          event.error,
          event.duration
        );

        // Sync to ChatDrawer and WorkZone
        const updatedWorkflow = workflowControl.getWorkflow();
        if (updatedWorkflow) {
          const workflowData = toWorkflowMessageData(updatedWorkflow, retryContext);
          updateWorkflowMessageRef.current(workflowData);

          if (workZoneId && board) {
            WorkZoneTransforms.updateWorkflow(board, workZoneId, workflowData);
          }
        }
        break;
      }

      case 'completed': {
        // console.log('[useWorkflowSubmission] ✓ Workflow completed:', event.workflowId);

        // Update steps to completed status, but skip steps with taskId (they're waiting for task completion)
        const currentWorkflow = workflowControl.getWorkflow();
        let hasQueuedTasks = false;
        
        if (currentWorkflow) {
          // Mark remaining steps as completed, except those with taskId (queue tasks)
          currentWorkflow.steps.forEach(step => {
            if (step.status === 'running' || step.status === 'pending') {
              // 如果步骤有 taskId，说明是队列任务，不要强制标记为 completed
              // 等待任务真正完成后由 taskQueueService 更新状态
              const stepResult = step.result as { taskId?: string } | undefined;
              const hasTaskId = stepResult?.taskId;
              if (hasTaskId) {
                hasQueuedTasks = true;
              } else {
                workflowControl.updateStep(step.id, 'completed');
              }
            }
          });
        }

        // Sync final state to ChatDrawer and WorkZone
        const completedWorkflow = workflowControl.getWorkflow();
        if (completedWorkflow) {
          const workflowData = toWorkflowMessageData(completedWorkflow, retryContext);
          updateWorkflowMessageRef.current(workflowData);

          if (workZoneId && board) {
            WorkZoneTransforms.updateWorkflow(board, workZoneId, workflowData);
            
            // If no queued tasks (like generate_image), remove WorkZone after a delay
            // Queued tasks will be handled by useAutoInsertToCanvas when they complete
            if (!hasQueuedTasks) {
              setTimeout(() => {
                WorkZoneTransforms.removeWorkZone(board, workZoneId);
                // console.log('[useWorkflowSubmission] Removed WorkZone after completion:', workZoneId);
              }, 1500);
            }
          }
        }
        break;
      }

      case 'failed': {
        console.error('[useWorkflowSubmission] ✗ Workflow failed:', event.error);
        workflowControl.abortWorkflow();

        // Sync failed state to ChatDrawer and WorkZone
        const failedWorkflow = workflowControl.getWorkflow();
        if (failedWorkflow) {
          const workflowData = toWorkflowMessageData(failedWorkflow, retryContext);
          updateWorkflowMessageRef.current(workflowData);

          if (workZoneId && board) {
            WorkZoneTransforms.updateWorkflow(board, workZoneId, workflowData);
          }
        }
        break;
      }

      case 'steps_added': {
        // console.log('[useWorkflowSubmission] Steps added:', event.steps?.length);
        // Add new steps to WorkflowContext
        const stepsAddedEvent = event as WorkflowStepsAddedEvent;
        workflowControl.addSteps(stepsAddedEvent.steps.map(step => ({
          id: step.id,
          mcp: step.mcp,
          args: step.args,
          description: step.description,
          status: step.status,
        })));

        // Sync to ChatDrawer and WorkZone
        const workflowWithNewSteps = workflowControl.getWorkflow();
        if (workflowWithNewSteps) {
          const workflowData = toWorkflowMessageData(workflowWithNewSteps, retryContext);
          updateWorkflowMessageRef.current(workflowData);

          if (workZoneId && board) {
            WorkZoneTransforms.updateWorkflow(board, workZoneId, workflowData);
          }
        }
        break;
      }

      case 'canvas_insert': {
        // Handle canvas insert operation from SW
        const canvasEvent = event as CanvasInsertEvent;
        // console.log('[useWorkflowSubmission] Canvas insert:', canvasEvent.operation, canvasEvent.params);
        
        if (board) {
          handleCanvasInsert(board, canvasEvent);
        }
        break;
      }
    }
  }, [workflowControl, boardRef, workZoneIdRef]);

  // Update ref when handleWorkflowEvent changes
  useEffect(() => {
    handleWorkflowEventRef.current = handleWorkflowEvent;
  }, [handleWorkflowEvent]);

  /**
   * Submit a workflow using SW execution
   */
  const submitToSW = useCallback(async (
    legacyWorkflow: LegacyWorkflowDefinition,
    parsedInput: ParsedGenerationParams,
    referenceImages: string[],
    retryContext: WorkflowRetryContext
  ): Promise<string> => {
    // Ensure SW task queue is initialized before submitting workflow
    // This sends TASK_QUEUE_INIT to SW which initializes the workflowHandler
    const { swTaskQueueService } = await import('../services/sw-task-queue-service');
    await swTaskQueueService.initialize();

    // Convert to SW workflow format
    const swWorkflow: SWWorkflowDefinition = {
      id: legacyWorkflow.id,
      name: legacyWorkflow.name,
      steps: legacyWorkflow.steps.map(step => ({
        id: step.id,
        mcp: step.mcp,
        args: step.args,
        description: step.description,
        status: step.status as any,
      })),
      status: 'pending',
      createdAt: legacyWorkflow.createdAt,
      updatedAt: Date.now(),
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

    // Subscribe to workflow events
    const workflowSub = workflowSubmissionService.subscribeToWorkflow(
      swWorkflow.id,
      (event: WorkflowEvent) => {
        handleWorkflowEvent(event, legacyWorkflow, retryContext);
      }
    );
    subscriptionsRef.current.push(workflowSub);

    // Submit to SW
    console.log('[WorkflowSubmit] Submitting to SW:', {
      workflowId: swWorkflow.id,
      stepsCount: swWorkflow.steps.length,
      timestamp: new Date().toISOString(),
    });
    
    await workflowSubmissionService.submit(swWorkflow);

    console.log('[WorkflowSubmit] ✓ Submitted to SW:', swWorkflow.id);
    return swWorkflow.id;
  }, [handleWorkflowEvent]);

  /**
   * Submit a workflow
   */
  const submitWorkflow = useCallback(async (
    parsedInput: ParsedGenerationParams,
    referenceImages: string[],
    retryContext?: WorkflowRetryContext,
    existingWorkflow?: LegacyWorkflowDefinition
  ): Promise<{ workflowId: string; usedSW: boolean }> => {
    // Debug logging for workflow submission (visible when debug mode enabled)
    console.log('[WorkflowSubmit] ▶ submitWorkflow called', {
      scenario: parsedInput.scenario,
      generationType: parsedInput.generationType,
      useSWExecution,
      swAvailable: checkSWAvailable(),
      existingWorkflowId: existingWorkflow?.id,
      timestamp: new Date().toISOString(),
    });

    // Use existing workflow if provided, otherwise create a new one
    const legacyWorkflow = existingWorkflow || convertToWorkflow(parsedInput, referenceImages);
    
    console.log('[WorkflowSubmit] Created/using workflow:', {
      workflowId: legacyWorkflow.id,
      name: legacyWorkflow.name,
      stepsCount: legacyWorkflow.steps.length,
    });

    // Start workflow in WorkflowContext
    workflowControl.startWorkflow(legacyWorkflow);

    // Build retry context
    const globalSettings = geminiSettings.get();
    const textModel = globalSettings.textModelName;

    const finalRetryContext: WorkflowRetryContext = retryContext || {
      aiContext: {
        rawInput: parsedInput.rawInput || parsedInput.userInstruction,
        userInstruction: parsedInput.userInstruction,
        model: {
          id: parsedInput.modelId,
          type: parsedInput.generationType,
          isExplicit: parsedInput.isModelExplicit,
        },
        params: {
          count: parsedInput.count,
          size: parsedInput.size,
          duration: parsedInput.duration,
        },
        selection: parsedInput.selection || { texts: [], images: [], videos: [], graphics: [] },
        finalPrompt: parsedInput.prompt,
      },
      referenceImages,
      textModel,
    };
    currentRetryContextRef.current = finalRetryContext;

    // Send to ChatDrawer
    const workflowMessageData = toWorkflowMessageData(legacyWorkflow, finalRetryContext);
    await sendWorkflowMessageRef.current({
      context: finalRetryContext.aiContext,
      workflow: workflowMessageData,
      textModel,
      autoOpen: false,
    });

    // Determine execution mode
    const shouldUseSW = useSWExecution && shouldUseSWExecution(parsedInput);
    // console.log('[useWorkflowSubmission]   - shouldUseSW:', shouldUseSW);

    if (shouldUseSW) {
      // Execute in Service Worker
      // console.log('[useWorkflowSubmission] ✓ Using SW execution');
      await submitToSW(legacyWorkflow, parsedInput, referenceImages, finalRetryContext);
      return { workflowId: legacyWorkflow.id, usedSW: true };
    } else {
      // Return workflow ID - caller (AIInputBar) will handle legacy execution
      // console.log('[useWorkflowSubmission] ✗ Using legacy execution for:', parsedInput.scenario);
      return { workflowId: legacyWorkflow.id, usedSW: false };
    }
  }, [workflowControl, useSWExecution, submitToSW]);

  /**
   * Cancel a workflow
   */
  const cancelWorkflow = useCallback(async (workflowId: string): Promise<void> => {
    await workflowSubmissionService.cancel(workflowId);
    workflowControl.abortWorkflow();
  }, [workflowControl]);

  /**
   * Retry a workflow from a specific step
   */
  const retryWorkflow = useCallback(async (
    workflowMessageData: WorkflowMessageData,
    startStepIndex: number
  ): Promise<void> => {
    const retryContext = workflowMessageData.retryContext;
    if (!retryContext) {
      console.error('[useWorkflowSubmission] No retry context available');
      return;
    }

    // console.log(`[useWorkflowSubmission] Retrying from step ${startStepIndex}`);

    // Reconstruct parsed input from retry context
    const parsedInput: ParsedGenerationParams = {
      prompt: workflowMessageData.prompt,
      userInstruction: retryContext.aiContext.userInstruction,
      rawInput: retryContext.aiContext.rawInput,
      modelId: retryContext.aiContext.model.id,
      isModelExplicit: retryContext.aiContext.model.isExplicit,
      generationType: retryContext.aiContext.model.type as 'image' | 'video',
      count: workflowMessageData.count || 1,
      size: retryContext.aiContext.params.size,
      duration: retryContext.aiContext.params.duration,
      scenario: 'direct_generation',
      selection: retryContext.aiContext.selection,
      parseResult: {} as any, // Not needed for retry
      hasExtraContent: false,
    };

    // Submit as new workflow
    await submitWorkflow(parsedInput, retryContext.referenceImages || [], retryContext);
  }, [submitWorkflow]);

  /**
   * Check if SW execution is available
   */
  const isSWAvailable = useCallback((): boolean => {
    return checkSWAvailable();
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
    retryWorkflow,
    isSWAvailable,
    getRetryContext,
  };
}
