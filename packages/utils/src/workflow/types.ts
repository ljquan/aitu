/**
 * Workflow Guard Types
 *
 * Type definitions for workflow protection mechanisms.
 * These types are framework-agnostic and can be used in any workflow system.
 */

// ============================================================================
// Tool Execution Status
// ============================================================================

/**
 * Tool execution status
 * Used to indicate the result status of tool execution
 */
export enum ToolExecutionStatus {
  /** Task completed, workflow should terminate */
  COMPLETED = 'completed',
  /** Need to continue executing subsequent steps */
  CONTINUE = 'continue',
  /** Execution failed, workflow should terminate */
  FAILED = 'failed',
  /** Need user input, workflow should pause */
  NEEDS_INPUT = 'needs_input',
  /** Partially completed, can continue or terminate */
  PARTIAL = 'partial',
}

// ============================================================================
// Standard Tool Response
// ============================================================================

/**
 * Standard tool response interface
 * All tools should return responses conforming to this format
 */
export interface StandardToolResponse<T = unknown> {
  /** Execution status */
  status: ToolExecutionStatus;
  /** Status description message */
  message: string;
  /** Actual data */
  data?: T;
  /** Whether to suggest terminating the workflow */
  shouldTerminate: boolean;
  /** Termination reason (if shouldTerminate is true) */
  terminationReason?: string;
  /** Next step hint (if any) */
  nextStepHint?: string;
}

// ============================================================================
// Recursion Guard Configuration
// ============================================================================

/**
 * Recursion guard configuration
 */
export interface RecursionGuardConfig {
  /** Maximum iterations (hard limit) */
  maxIterations: number;
  /** Warning threshold (emit warning when reached) */
  warningThreshold: number;
  /** Soft limit (strongly suggest termination when reached) */
  softLimit: number;
  /** Hard limit (force termination when reached) */
  hardLimit: number;
}

/**
 * Default recursion guard configuration
 */
export const DEFAULT_RECURSION_GUARD_CONFIG: RecursionGuardConfig = {
  maxIterations: 20,
  warningThreshold: 10,
  softLimit: 15,
  hardLimit: 20,
};

/**
 * Recursion depth check result
 */
export interface RecursionCheckResult {
  /** Current iteration count */
  currentIteration: number;
  /** Whether should continue */
  shouldContinue: boolean;
  /** Whether warning threshold is reached */
  isWarning: boolean;
  /** Whether soft limit is reached */
  isSoftLimit: boolean;
  /** Whether hard limit is reached (force terminate) */
  isHardLimit: boolean;
  /** Warning message (for prompt injection) */
  warningMessage?: string;
}

// ============================================================================
// Loop Detection Configuration
// ============================================================================

/**
 * Loop detection configuration
 */
export interface LoopDetectorConfig {
  /** Detection window size (check last N calls) */
  windowSize: number;
  /** Repeat threshold (N consecutive repeats = loop) */
  repeatThreshold: number;
  /** Similarity threshold (0-1), for detecting similar calls */
  similarityThreshold: number;
  /** Whether to enable pattern detection (A-B-A-B patterns) */
  enablePatternDetection: boolean;
}

/**
 * Default loop detection configuration
 */
export const DEFAULT_LOOP_DETECTOR_CONFIG: LoopDetectorConfig = {
  windowSize: 10,
  repeatThreshold: 3,
  similarityThreshold: 0.9,
  enablePatternDetection: true,
};

/**
 * Tool call signature
 * Used to uniquely identify a tool call
 */
export interface ToolCallSignature {
  /** Tool name */
  toolName: string;
  /** Arguments hash */
  argsHash: string;
  /** Timestamp */
  timestamp: number;
  /** Full arguments (for debugging) */
  args?: Record<string, unknown>;
}

/**
 * Loop type
 */
export enum LoopType {
  /** Exact repeat (identical calls) */
  EXACT = 'exact',
  /** Similar repeat (slightly different arguments) */
  SIMILAR = 'similar',
  /** Oscillating pattern (A-B-A-B) */
  OSCILLATING = 'oscillating',
  /** Periodic pattern (A-B-C-A-B-C) */
  PERIODIC = 'periodic',
}

/**
 * Loop detection result
 */
export interface LoopDetectionResult {
  /** Whether loop is detected */
  loopDetected: boolean;
  /** Loop type */
  loopType?: LoopType;
  /** Loop length (repeat count or period length) */
  loopLength?: number;
  /** Involved tool names */
  involvedTools?: string[];
  /** Loop description */
  description?: string;
  /** Suggested action */
  suggestion?: string;
}

// ============================================================================
// Workflow Execution Context
// ============================================================================

/**
 * Workflow execution context
 * Used to track execution state and history
 */
export interface WorkflowExecutionContext {
  /** Execution ID */
  executionId: string;
  /** Current iteration count */
  currentIteration: number;
  /** Tool call history */
  callHistory: ToolCallSignature[];
  /** Start time */
  startTime: number;
  /** Last activity time */
  lastActivityTime: number;
  /** Whether terminated */
  isTerminated: boolean;
  /** Termination reason */
  terminationReason?: string;
}

// ============================================================================
// Guard Check Result
// ============================================================================

/**
 * Combined guard check result
 */
export interface GuardCheckResult {
  /** Whether to allow continue */
  allowContinue: boolean;
  /** Recursion check result */
  recursionCheck: RecursionCheckResult;
  /** Loop detection result */
  loopCheck: LoopDetectionResult;
  /** Combined warning message (for prompt injection) */
  warningMessage?: string;
  /** Whether to force terminate */
  forceTerminate: boolean;
  /** Force termination reason */
  forceTerminateReason?: string;
}

// ============================================================================
// Workflow Guard Configuration
// ============================================================================

/**
 * Workflow guard configuration
 */
export interface WorkflowGuardConfig {
  recursion: RecursionGuardConfig;
  loopDetection: LoopDetectorConfig;
  /** Whether to enable verbose logging */
  verbose: boolean;
}

/**
 * Default workflow guard configuration
 */
export const DEFAULT_WORKFLOW_GUARD_CONFIG: WorkflowGuardConfig = {
  recursion: DEFAULT_RECURSION_GUARD_CONFIG,
  loopDetection: DEFAULT_LOOP_DETECTOR_CONFIG,
  verbose: false,
};

// ============================================================================
// Step and System Status
// ============================================================================

/**
 * Step status
 */
export enum StepStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/**
 * System status
 */
export enum SystemStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// ============================================================================
// Workflow Configuration
// ============================================================================

/**
 * Workflow execution configuration
 */
export interface WorkflowConfig {
  /** Maximum iterations */
  maxIterations: number;
  /** Tool execution timeout (ms) */
  toolTimeout: number;
  /** Whether to enable verbose logging */
  verbose: boolean;
  /** Model to use */
  model?: string;
  /** Whether to enable loop detection */
  enableLoopDetection?: boolean;
  /** Warning threshold */
  warningThreshold?: number;
  /** Soft limit */
  softLimit?: number;
  /** Whether to enable parameter mapping */
  enableParameterMapping?: boolean;
  /** Parameter mapping log level */
  parameterMappingLogLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Default workflow configuration
 */
export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  maxIterations: 20,
  toolTimeout: 30000,
  verbose: false,
  enableLoopDetection: true,
  warningThreshold: 10,
  softLimit: 15,
  enableParameterMapping: true,
  parameterMappingLogLevel: 'info',
};

// ============================================================================
// Generic Workflow Step (for utility functions)
// ============================================================================

/**
 * Base workflow step interface
 * Generic version that can be extended by specific implementations
 */
export interface BaseWorkflowStep {
  /** Step ID */
  id: string;
  /** Step status */
  status: StepStatus | 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  /** Result (optional) */
  result?: unknown;
  /** Error message (optional) */
  error?: string;
  /** Execution duration in ms (optional) */
  duration?: number;
}

/**
 * Base workflow interface
 * Generic version that can be extended by specific implementations
 */
export interface BaseWorkflow<TStep extends BaseWorkflowStep = BaseWorkflowStep> {
  /** Workflow ID */
  id: string;
  /** Workflow steps */
  steps: TStep[];
}

/**
 * Workflow status summary
 */
export interface WorkflowStatusSummary<TStep extends BaseWorkflowStep = BaseWorkflowStep> {
  /** Overall workflow status */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Number of completed steps */
  completedSteps: number;
  /** Total number of steps */
  totalSteps: number;
  /** Current step (running or next pending) */
  currentStep?: TStep;
}
