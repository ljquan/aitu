/**
 * Unified Domain Event Bus
 *
 * This provides a centralized event bus for all domain events.
 * It replaces the scattered RxJS Subjects across different services.
 *
 * Benefits:
 * - Single source of truth for event subscriptions
 * - Type-safe event handling
 * - Easy to debug and trace events
 * - Supports both sync and async handlers
 */

import { Subject, Observable, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import type { Task, TaskError } from '../task';

// ============================================================================
// Domain Event Types
// ============================================================================

/**
 * Task-related events
 */
export interface TaskCreatedEvent {
  type: 'task:created';
  task: Task;
  timestamp: number;
}

export interface TaskUpdatedEvent {
  type: 'task:updated';
  task: Task;
  changes: Partial<Task>;
  timestamp: number;
}

export interface TaskCompletedEvent {
  type: 'task:completed';
  task: Task;
  timestamp: number;
}

export interface TaskFailedEvent {
  type: 'task:failed';
  task: Task;
  error: TaskError;
  timestamp: number;
}

export interface TaskDeletedEvent {
  type: 'task:deleted';
  taskId: string;
  task?: Task;
  timestamp: number;
}

export interface TaskSyncedEvent {
  type: 'task:synced';
  tasks: Task[];
  timestamp: number;
}

/**
 * Workflow-related events (will be expanded in Phase 4)
 */
export interface WorkflowStartedEvent {
  type: 'workflow:started';
  workflowId: string;
  name: string;
  timestamp: number;
}

export interface WorkflowStepCompletedEvent {
  type: 'workflow:stepCompleted';
  workflowId: string;
  stepId: string;
  result?: unknown;
  timestamp: number;
}

export interface WorkflowCompletedEvent {
  type: 'workflow:completed';
  workflowId: string;
  timestamp: number;
}

export interface WorkflowFailedEvent {
  type: 'workflow:failed';
  workflowId: string;
  error: string;
  timestamp: number;
}

/**
 * Asset-related events (will be expanded in Phase 5)
 */
export interface AssetImportedEvent {
  type: 'asset:imported';
  assetId: string;
  assetType: 'image' | 'video';
  url: string;
  timestamp: number;
}

export interface AssetDeletedEvent {
  type: 'asset:deleted';
  assetId: string;
  timestamp: number;
}

/**
 * Union type for all domain events
 */
export type DomainEvent =
  // Task events
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | TaskDeletedEvent
  | TaskSyncedEvent
  // Workflow events
  | WorkflowStartedEvent
  | WorkflowStepCompletedEvent
  | WorkflowCompletedEvent
  | WorkflowFailedEvent
  // Asset events
  | AssetImportedEvent
  | AssetDeletedEvent;

/**
 * Extract event type string from DomainEvent
 */
export type DomainEventType = DomainEvent['type'];

// ============================================================================
// Event Bus Implementation
// ============================================================================

/**
 * Domain Event Bus
 *
 * A centralized event bus for publishing and subscribing to domain events.
 * This is a singleton that can be used across the application.
 */
class DomainEventBus {
  private static instance: DomainEventBus;
  private events$ = new Subject<DomainEvent>();
  private debugMode = false;

  private constructor() {}

  static getInstance(): DomainEventBus {
    if (!DomainEventBus.instance) {
      DomainEventBus.instance = new DomainEventBus();
    }
    return DomainEventBus.instance;
  }

  /**
   * Enable or disable debug mode
   * When enabled, all events are logged to console
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Publish a domain event
   */
  publish<T extends DomainEvent>(event: T): void {
    if (this.debugMode) {
      console.log('[DomainEventBus]', event.type, event);
    }
    this.events$.next(event);
  }

  /**
   * Subscribe to all domain events
   */
  subscribe(handler: (event: DomainEvent) => void): Subscription {
    return this.events$.subscribe(handler);
  }

  /**
   * Subscribe to events of a specific type
   */
  on<T extends DomainEventType>(
    eventType: T,
    handler: (event: Extract<DomainEvent, { type: T }>) => void
  ): Subscription {
    return this.events$
      .pipe(filter((event): event is Extract<DomainEvent, { type: T }> => event.type === eventType))
      .subscribe(handler);
  }

  /**
   * Subscribe to multiple event types
   */
  onAny<T extends DomainEventType>(
    eventTypes: T[],
    handler: (event: Extract<DomainEvent, { type: T }>) => void
  ): Subscription {
    return this.events$
      .pipe(
        filter((event): event is Extract<DomainEvent, { type: T }> =>
          eventTypes.includes(event.type as T)
        )
      )
      .subscribe(handler);
  }

  /**
   * Get the raw observable for advanced use cases
   */
  asObservable(): Observable<DomainEvent> {
    return this.events$.asObservable();
  }

  /**
   * Complete the event bus (for cleanup)
   */
  destroy(): void {
    this.events$.complete();
  }
}

// Export singleton instance
export const domainEventBus = DomainEventBus.getInstance();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a task created event
 */
export function createTaskCreatedEvent(task: Task): TaskCreatedEvent {
  return {
    type: 'task:created',
    task,
    timestamp: Date.now(),
  };
}

/**
 * Create a task updated event
 */
export function createTaskUpdatedEvent(task: Task, changes: Partial<Task>): TaskUpdatedEvent {
  return {
    type: 'task:updated',
    task,
    changes,
    timestamp: Date.now(),
  };
}

/**
 * Create a task completed event
 */
export function createTaskCompletedEvent(task: Task): TaskCompletedEvent {
  return {
    type: 'task:completed',
    task,
    timestamp: Date.now(),
  };
}

/**
 * Create a task failed event
 */
export function createTaskFailedEvent(task: Task, error: TaskError): TaskFailedEvent {
  return {
    type: 'task:failed',
    task,
    error,
    timestamp: Date.now(),
  };
}

/**
 * Create a task deleted event
 */
export function createTaskDeletedEvent(taskId: string, task?: Task): TaskDeletedEvent {
  return {
    type: 'task:deleted',
    taskId,
    task,
    timestamp: Date.now(),
  };
}

/**
 * Create a task synced event
 */
export function createTaskSyncedEvent(tasks: Task[]): TaskSyncedEvent {
  return {
    type: 'task:synced',
    tasks,
    timestamp: Date.now(),
  };
}
