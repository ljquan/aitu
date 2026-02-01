/**
 * Domain Error Types
 *
 * Provides standardized error types for the domain layer.
 * These errors are used across all domain services and repositories.
 */

/**
 * Base domain error
 */
export class DomainError extends Error {
  readonly code: string;
  readonly timestamp: number;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.timestamp = Date.now();
  }
}

/**
 * Task-related errors
 */
export class TaskError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'TaskError';
  }

  static notFound(taskId: string): TaskError {
    return new TaskError('TASK_NOT_FOUND', `Task not found: ${taskId}`);
  }

  static invalidParams(errors: string[]): TaskError {
    return new TaskError('INVALID_PARAMS', `Invalid parameters: ${errors.join(', ')}`);
  }

  static alreadyExists(taskId: string): TaskError {
    return new TaskError('TASK_ALREADY_EXISTS', `Task already exists: ${taskId}`);
  }

  static executionFailed(taskId: string, reason: string): TaskError {
    return new TaskError('EXECUTION_FAILED', `Task ${taskId} execution failed: ${reason}`);
  }

  static serviceUnavailable(): TaskError {
    return new TaskError('SERVICE_UNAVAILABLE', 'Task service is not available');
  }
}

/**
 * Workflow-related errors
 */
export class WorkflowError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'WorkflowError';
  }

  static notFound(workflowId: string): WorkflowError {
    return new WorkflowError('WORKFLOW_NOT_FOUND', `Workflow not found: ${workflowId}`);
  }

  static stepFailed(workflowId: string, stepId: string, reason: string): WorkflowError {
    return new WorkflowError(
      'STEP_FAILED',
      `Workflow ${workflowId} step ${stepId} failed: ${reason}`
    );
  }

  static cancelled(workflowId: string): WorkflowError {
    return new WorkflowError('WORKFLOW_CANCELLED', `Workflow ${workflowId} was cancelled`);
  }
}

/**
 * Asset-related errors
 */
export class AssetError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'AssetError';
  }

  static notFound(assetId: string): AssetError {
    return new AssetError('ASSET_NOT_FOUND', `Asset not found: ${assetId}`);
  }

  static importFailed(reason: string): AssetError {
    return new AssetError('IMPORT_FAILED', `Asset import failed: ${reason}`);
  }

  static storageFull(): AssetError {
    return new AssetError('STORAGE_FULL', 'Storage quota exceeded');
  }
}

/**
 * Storage-related errors
 */
export class StorageError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'StorageError';
  }

  static readFailed(key: string, reason: string): StorageError {
    return new StorageError('READ_FAILED', `Failed to read ${key}: ${reason}`);
  }

  static writeFailed(key: string, reason: string): StorageError {
    return new StorageError('WRITE_FAILED', `Failed to write ${key}: ${reason}`);
  }

  static deleteFailed(key: string, reason: string): StorageError {
    return new StorageError('DELETE_FAILED', `Failed to delete ${key}: ${reason}`);
  }
}

/**
 * Network-related errors
 */
export class NetworkError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'NetworkError';
  }

  static timeout(operation: string): NetworkError {
    return new NetworkError('TIMEOUT', `Operation timed out: ${operation}`);
  }

  static offline(): NetworkError {
    return new NetworkError('OFFLINE', 'No network connection');
  }

  static authFailed(): NetworkError {
    return new NetworkError('AUTH_FAILED', 'Authentication failed');
  }
}
