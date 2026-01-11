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
    retryContext?: WorkflowRetryContext
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
  return {
    id: workflow.id,
    name: workflow.name,
    generationType: workflow.generationType,
    prompt: workflow.metadata.prompt,
    aiAnalysis: workflow.aiAnalysis,
    count: workflow.metadata.count,
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
        if (currentWorkflow) {
          // Mark remaining steps as completed, except those with taskId (queue tasks)
          currentWorkflow.steps.forEach(step => {
            if (step.status === 'running' || step.status === 'pending') {
              // 如果步骤有 taskId，说明是队列任务，不要强制标记为 completed
              // 等待任务真正完成后由 taskQueueService 更新状态
              const stepResult = step.result as { taskId?: string } | undefined;
              const hasTaskId = stepResult?.taskId;
              if (!hasTaskId) {
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

  /**
   * Submit a workflow using SW execution
   */
  const submitToSW = useCallback(async (
    legacyWorkflow: LegacyWorkflowDefinition,
    parsedInput: ParsedGenerationParams,
    referenceImages: string[],
    retryContext: WorkflowRetryContext
  ): Promise<string> => {
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
    await workflowSubmissionService.submit(swWorkflow);

    // console.log('[useWorkflowSubmission] Workflow submitted to SW:', swWorkflow.id);
    return swWorkflow.id;
  }, [handleWorkflowEvent]);

  /**
   * Submit a workflow
   */
  const submitWorkflow = useCallback(async (
    parsedInput: ParsedGenerationParams,
    referenceImages: string[],
    retryContext?: WorkflowRetryContext
  ): Promise<{ workflowId: string; usedSW: boolean }> => {
    // console.log('[useWorkflowSubmission] ▶ submitWorkflow called');
    // console.log('[useWorkflowSubmission]   - Scenario:', parsedInput.scenario);
    // console.log('[useWorkflowSubmission]   - Generation type:', parsedInput.generationType);
    // console.log('[useWorkflowSubmission]   - useSWExecution option:', useSWExecution);
    // console.log('[useWorkflowSubmission]   - SW available:', checkSWAvailable());

    // Create workflow using the existing converter (maintains compatibility)
    const legacyWorkflow = convertToWorkflow(parsedInput, referenceImages);

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
