/**
 * Task Queue System Type Definitions
 * 
 * Defines all TypeScript types and interfaces for the task queue system.
 * These types form the foundation for task management, state tracking, and
 * integration with the generation API.
 */

/**
 * Task status enumeration
 * Represents all possible states a task can be in during its lifecycle
 */
export enum TaskStatus {
  /** Task is waiting to be executed */
  PENDING = 'pending',
  /** Task is currently being processed */
  PROCESSING = 'processing',
  /** Task failed and is waiting for retry */
  RETRYING = 'retrying',
  /** Task completed successfully */
  COMPLETED = 'completed',
  /** Task failed and will not be retried */
  FAILED = 'failed',
  /** Task was cancelled by the user */
  CANCELLED = 'cancelled'
}

/**
 * Task type enumeration
 * Defines the types of content that can be generated
 */
export enum TaskType {
  /** Image generation task */
  IMAGE = 'image',
  /** Video generation task */
  VIDEO = 'video'
}

/**
 * Generation parameters interface
 * Contains all parameters needed for AI content generation
 */
export interface GenerationParams {
  /** Text prompt describing the desired content */
  prompt: string;
  /** Image/video width in pixels */
  width?: number;
  /** Image/video height in pixels */
  height?: number;
  /** Video duration in seconds (video only) */
  duration?: number;
  /** Style or model to use for generation */
  style?: string;
  /** Random seed for reproducible generation */
  seed?: number;
  /** Additional parameters for specific generation types */
  [key: string]: any;
}

/**
 * Task result interface
 * Contains the output from a successfully completed task
 */
export interface TaskResult {
  /** URL to the generated content */
  url: string;
  /** File format (e.g., 'png', 'jpg', 'mp4') */
  format: string;
  /** File size in bytes */
  size: number;
  /** Content width in pixels */
  width?: number;
  /** Content height in pixels */
  height?: number;
  /** Video duration in seconds (video only) */
  duration?: number;
  /** Video thumbnail URL (video only) */
  thumbnailUrl?: string;
}

/**
 * Task error interface
 * Contains detailed information about task failures
 */
export interface TaskError {
  /** Error code for categorization (e.g., 'TIMEOUT', 'NETWORK', 'API_ERROR') */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: any;
}

/**
 * Core task interface
 * Represents a single generation task with all its metadata
 */
export interface Task {
  /** Unique task identifier (UUID v4) */
  id: string;
  /** Type of content to generate */
  type: TaskType;
  /** Current task status */
  status: TaskStatus;
  /** Parameters for content generation */
  params: GenerationParams;
  /** Task creation timestamp (Unix milliseconds) */
  createdAt: number;
  /** Last update timestamp (Unix milliseconds) */
  updatedAt: number;
  /** Execution start timestamp (Unix milliseconds) */
  startedAt?: number;
  /** Completion timestamp (Unix milliseconds) */
  completedAt?: number;
  /** Generation result (if successful) */
  result?: TaskResult;
  /** Error information (if failed) */
  error?: TaskError;
  /** Number of retry attempts made */
  retryCount: number;
  /** Next scheduled retry timestamp (Unix milliseconds) */
  nextRetryAt?: number;
  /** User identifier (reserved for multi-user support) */
  userId?: string;
}

/**
 * Task queue state interface
 * Represents the complete state of the task queue system
 */
export interface TaskQueueState {
  /** Map of task ID to task object */
  tasks: Map<string, Task>;
  /** Array of task IDs ordered by creation time */
  taskOrder: string[];
}

/**
 * Task event interface
 * Represents state change events emitted by the task queue
 */
export interface TaskEvent {
  /** Event type */
  type: 'taskCreated' | 'taskUpdated' | 'taskDeleted';
  /** The task that triggered the event */
  task: Task;
  /** Timestamp when the event occurred */
  timestamp: number;
}
