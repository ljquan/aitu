/**
 * Task-Step Registry
 *
 * Maintains mapping between task IDs and workflow step IDs.
 * When a task status changes, this registry is used to find and update
 * the corresponding workflow step, ensuring synchronized progress updates
 * across WorkZone, ChatDrawer, and Task Queue.
 */

import { taskQueueStorage, type TaskStepMapping } from './storage';

export type { TaskStepMapping };

/**
 * Registry for task-to-step mappings
 * Singleton pattern to ensure consistent state across the SW
 */
class TaskStepRegistry {
  private static instance: TaskStepRegistry;
  
  /** In-memory cache: taskId -> { workflowId, stepId } */
  private taskStepMap: Map<string, { workflowId: string; stepId: string }> = new Map();
  
  /** Promise to track restoration completion */
  private restorePromise: Promise<void> | null = null;

  private constructor() {
    // Restore from storage on initialization
    this.restorePromise = this.restoreFromStorage();
  }

  static getInstance(): TaskStepRegistry {
    if (!TaskStepRegistry.instance) {
      TaskStepRegistry.instance = new TaskStepRegistry();
    }
    return TaskStepRegistry.instance;
  }

  /**
   * Wait for storage restoration to complete
   */
  async waitForRestore(): Promise<void> {
    if (this.restorePromise) {
      await this.restorePromise;
    }
  }

  /**
   * Restore mappings from IndexedDB
   */
  private async restoreFromStorage(): Promise<void> {
    try {
      const mappings = await taskQueueStorage.getAllTaskStepMappings();
      for (const mapping of mappings) {
        this.taskStepMap.set(mapping.taskId, {
          workflowId: mapping.workflowId,
          stepId: mapping.stepId,
        });
      }
    } catch (error) {
      console.error('[TaskStepRegistry] Failed to restore from storage:', error);
    }
  }

  /**
   * Register a task-to-step mapping
   * @param taskId Task ID
   * @param workflowId Workflow ID
   * @param stepId Step ID within the workflow
   */
  async register(taskId: string, workflowId: string, stepId: string): Promise<void> {
    // Store in memory
    this.taskStepMap.set(taskId, { workflowId, stepId });
    
    // Persist to IndexedDB
    try {
      await taskQueueStorage.saveTaskStepMapping({
        taskId,
        workflowId,
        stepId,
        createdAt: Date.now(),
      });
    } catch (error) {
      console.error('[TaskStepRegistry] Failed to save mapping:', error);
    }
  }

  /**
   * Unregister a task mapping
   * @param taskId Task ID to unregister
   */
  async unregister(taskId: string): Promise<void> {
    this.taskStepMap.delete(taskId);
    
    try {
      await taskQueueStorage.deleteTaskStepMapping(taskId);
    } catch (error) {
      console.error('[TaskStepRegistry] Failed to delete mapping:', error);
    }
  }

  /**
   * Get the step info for a task
   * @param taskId Task ID
   * @returns Step info or undefined if not found
   */
  getStepForTask(taskId: string): { workflowId: string; stepId: string } | undefined {
    return this.taskStepMap.get(taskId);
  }

  /**
   * Get all mappings for a workflow
   * @param workflowId Workflow ID
   * @returns Array of task-step mappings
   */
  getMappingsForWorkflow(workflowId: string): Array<{ taskId: string; stepId: string }> {
    const result: Array<{ taskId: string; stepId: string }> = [];
    for (const [taskId, info] of this.taskStepMap.entries()) {
      if (info.workflowId === workflowId) {
        result.push({ taskId, stepId: info.stepId });
      }
    }
    return result;
  }

  /**
   * Clear all mappings for a workflow (when workflow completes/fails)
   * @param workflowId Workflow ID
   */
  async clearWorkflowMappings(workflowId: string): Promise<void> {
    const toDelete: string[] = [];
    for (const [taskId, info] of this.taskStepMap.entries()) {
      if (info.workflowId === workflowId) {
        toDelete.push(taskId);
      }
    }
    
    for (const taskId of toDelete) {
      this.taskStepMap.delete(taskId);
      try {
        await taskQueueStorage.deleteTaskStepMapping(taskId);
      } catch (error) {
        console.error('[TaskStepRegistry] Failed to delete mapping:', taskId, error);
      }
    }
  }

  /**
   * Get statistics for debugging
   */
  getStats(): { totalMappings: number; workflowCount: number } {
    const workflows = new Set<string>();
    for (const info of this.taskStepMap.values()) {
      workflows.add(info.workflowId);
    }
    return {
      totalMappings: this.taskStepMap.size,
      workflowCount: workflows.size,
    };
  }
}

// Export singleton getter
export function getTaskStepRegistry(): TaskStepRegistry {
  return TaskStepRegistry.getInstance();
}

// Export for direct access
export const taskStepRegistry = TaskStepRegistry.getInstance();
