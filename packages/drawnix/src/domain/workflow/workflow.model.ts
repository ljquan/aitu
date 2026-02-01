/**
 * Unified Workflow Domain Model
 *
 * This is the single source of truth for workflow-related types.
 * Used by both main thread and Service Worker.
 */

// ============================================================================
// Status Types
// ============================================================================

/**
 * Workflow status
 */
export type WorkflowStatus =
  | 'pending'     // Workflow is waiting to start
  | 'running'     // Workflow is currently executing
  | 'completed'   // Workflow completed successfully
  | 'failed'      // Workflow failed
  | 'cancelled';  // Workflow was cancelled

/**
 * Workflow step status
 */
export type WorkflowStepStatus =
  | 'pending'     // Step is waiting to execute
  | 'running'     // Step is currently executing
  | 'completed'   // Step completed successfully
  | 'failed'      // Step failed
  | 'skipped';    // Step was skipped

// ============================================================================
// Step Types
// ============================================================================

/**
 * Workflow step options
 */
export interface WorkflowStepOptions {
  /** Execution mode: async (parallel) or queue (sequential) */
  mode?: 'async' | 'queue';
  /** Batch ID for grouped operations */
  batchId?: string;
  /** Index within the batch */
  batchIndex?: number;
  /** Total items in the batch */
  batchTotal?: number;
  /** Global index across all batches */
  globalIndex?: number;
}

/**
 * Workflow step
 */
export interface WorkflowStep {
  /** Unique step identifier */
  id: string;
  /** MCP tool name to execute */
  mcp: string;
  /** Arguments for the MCP tool */
  args: Record<string, unknown>;
  /** Human-readable description */
  description: string;
  /** Current step status */
  status: WorkflowStepStatus;
  /** Step execution result */
  result?: unknown;
  /** Error message if failed */
  error?: string;
  /** Execution duration in milliseconds */
  duration?: number;
  /** Step options */
  options?: WorkflowStepOptions;
}

// ============================================================================
// Workflow Context
// ============================================================================

/**
 * Workflow context - contains user input and parameters
 */
export interface WorkflowContext {
  /** Original user input */
  userInput?: string;
  /** Model used for generation */
  model?: string;
  /** Generation parameters */
  params?: {
    /** Number of items to generate */
    count?: number;
    /** Size/aspect ratio */
    size?: string;
    /** Video duration */
    duration?: string;
  };
  /** Reference images for image-to-image generation */
  referenceImages?: string[];
}

// ============================================================================
// Workflow Model
// ============================================================================

/**
 * Workflow definition
 */
export interface Workflow {
  /** Unique workflow identifier */
  id: string;
  /** Workflow name/title */
  name: string;
  /** List of steps to execute */
  steps: WorkflowStep[];
  /** Current workflow status */
  status: WorkflowStatus;
  /** Creation timestamp (Unix milliseconds) */
  createdAt: number;
  /** Last update timestamp (Unix milliseconds) */
  updatedAt: number;
  /** Completion timestamp (Unix milliseconds) */
  completedAt?: number;
  /** Error message if failed */
  error?: string;
  /** Workflow context */
  context?: WorkflowContext;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Workflow event type
 */
export type WorkflowEventType =
  | 'status'
  | 'step'
  | 'completed'
  | 'failed'
  | 'steps_added'
  | 'recovered'
  | 'canvas_insert'
  | 'main_thread_tool_request';

/**
 * Workflow status event
 */
export interface WorkflowStatusEvent {
  type: 'status';
  workflowId: string;
  status: WorkflowStatus;
}

/**
 * Workflow step event
 */
export interface WorkflowStepEvent {
  type: 'step';
  workflowId: string;
  stepId: string;
  status: WorkflowStepStatus;
  result?: unknown;
  error?: string;
  duration?: number;
}

/**
 * Workflow completed event
 */
export interface WorkflowCompletedEvent {
  type: 'completed';
  workflowId: string;
  workflow: Workflow;
}

/**
 * Workflow failed event
 */
export interface WorkflowFailedEvent {
  type: 'failed';
  workflowId: string;
  error: string;
}

/**
 * Workflow steps added event
 */
export interface WorkflowStepsAddedEvent {
  type: 'steps_added';
  workflowId: string;
  steps: WorkflowStep[];
}

/**
 * Workflow recovered event
 */
export interface WorkflowRecoveredEvent {
  type: 'recovered';
  workflowId: string;
  workflow: Workflow;
}

/**
 * Canvas insert event
 */
export interface CanvasInsertEvent {
  type: 'canvas_insert';
  requestId: string;
  operation: 'insert_image' | 'insert_video' | 'insert_text' | 'canvas_insert';
  params: {
    url?: string;
    content?: string;
    position?: { x: number; y: number };
    items?: Array<{ type: string; url?: string; content?: string }>;
  };
}

/**
 * Main thread tool request event
 */
export interface MainThreadToolRequestEvent {
  type: 'main_thread_tool_request';
  requestId: string;
  workflowId: string;
  stepId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Union type for all workflow events
 */
export type WorkflowEvent =
  | WorkflowStatusEvent
  | WorkflowStepEvent
  | WorkflowCompletedEvent
  | WorkflowFailedEvent
  | WorkflowStepsAddedEvent
  | WorkflowRecoveredEvent
  | CanvasInsertEvent
  | MainThreadToolRequestEvent;

// ============================================================================
// Filter and Query Types
// ============================================================================

/**
 * Workflow filter for querying workflows
 */
export interface WorkflowFilter {
  /** Filter by status */
  status?: WorkflowStatus;
  /** Filter by creation time (start) */
  createdAfter?: number;
  /** Filter by creation time (end) */
  createdBefore?: number;
}

// ============================================================================
// Backward Compatibility Aliases
// ============================================================================

/**
 * WorkflowDefinition is an alias for Workflow
 * @deprecated Use Workflow instead
 */
export type WorkflowDefinition = Workflow;
