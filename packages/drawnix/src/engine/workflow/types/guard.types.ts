/**
 * 工作流防护机制类型定义
 *
 * 从 @aitu/utils 重新导出，保持向后兼容
 */

export {
  // Enums
  ToolExecutionStatus,
  LoopType,
  StepStatus,
  SystemStatus,

  // Interfaces
  type StandardToolResponse,
  type RecursionGuardConfig,
  type RecursionCheckResult,
  type LoopDetectorConfig,
  type ToolCallSignature,
  type LoopDetectionResult,
  type WorkflowExecutionContext,
  type GuardCheckResult,
  type WorkflowGuardConfig,
  type WorkflowConfig,
  type BaseWorkflowStep,
  type BaseWorkflow,
  type WorkflowStatusSummary,

  // Default configs
  DEFAULT_RECURSION_GUARD_CONFIG,
  DEFAULT_LOOP_DETECTOR_CONFIG,
  DEFAULT_WORKFLOW_GUARD_CONFIG,
  DEFAULT_WORKFLOW_CONFIG,
} from '@aitu/utils';
