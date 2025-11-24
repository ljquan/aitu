/**
 * useTaskQueue Hook
 * 
 * Provides React components with task queue state and operations.
 * Subscribes to task updates and provides memoized selectors.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { taskQueueService } from '../services/task-queue-service';
import { Task, TaskStatus, TaskType, GenerationParams } from '../types/task.types';

/**
 * Return type for useTaskQueue hook
 */
export interface UseTaskQueueReturn {
  /** All tasks in the queue */
  tasks: Task[];
  /** Tasks that are pending, processing, or retrying */
  activeTasks: Task[];
  /** Successfully completed tasks */
  completedTasks: Task[];
  /** Failed tasks */
  failedTasks: Task[];
  /** Cancelled tasks */
  cancelledTasks: Task[];
  /** Creates a new task */
  createTask: (params: GenerationParams, type: TaskType) => Task | null;
  /** Cancels a task */
  cancelTask: (taskId: string) => void;
  /** Retries a failed task */
  retryTask: (taskId: string) => void;
  /** Deletes a task */
  deleteTask: (taskId: string) => void;
  /** Clears all completed tasks */
  clearCompleted: () => void;
  /** Clears all failed tasks */
  clearFailed: () => void;
  /** Gets a specific task by ID */
  getTask: (taskId: string) => Task | undefined;
}

/**
 * Hook for managing task queue state and operations
 * 
 * @example
 * function TaskManager() {
 *   const { tasks, createTask, cancelTask } = useTaskQueue();
 *   
 *   const handleCreate = () => {
 *     createTask({ prompt: "cat" }, 'image');
 *   };
 *   
 *   return (
 *     <div>
 *       <button onClick={handleCreate}>Create Task</button>
 *       {tasks.map(task => (
 *         <div key={task.id}>{task.params.prompt}</div>
 *       ))}
 *     </div>
 *   );
 * }
 */
export function useTaskQueue(): UseTaskQueueReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [updateCounter, setUpdateCounter] = useState(0);

  // Subscribe to task updates
  useEffect(() => {
    // Initialize with current tasks
    setTasks(taskQueueService.getAllTasks());

    // Subscribe to updates
    const subscription = taskQueueService.observeTaskUpdates().subscribe(() => {
      setTasks(taskQueueService.getAllTasks());
      setUpdateCounter(prev => prev + 1);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Memoized selectors
  const activeTasks = useMemo(() => {
    return tasks.filter(task => 
      task.status === TaskStatus.PENDING ||
      task.status === TaskStatus.PROCESSING ||
      task.status === TaskStatus.RETRYING
    );
  }, [tasks]);

  const completedTasks = useMemo(() => {
    return tasks.filter(task => task.status === TaskStatus.COMPLETED);
  }, [tasks]);

  const failedTasks = useMemo(() => {
    return tasks.filter(task => task.status === TaskStatus.FAILED);
  }, [tasks]);

  const cancelledTasks = useMemo(() => {
    return tasks.filter(task => task.status === TaskStatus.CANCELLED);
  }, [tasks]);

  // Task operations
  const createTask = useCallback((params: GenerationParams, type: TaskType): Task | null => {
    try {
      const task = taskQueueService.createTask(params, type);
      return task;
    } catch (error) {
      console.error('[useTaskQueue] Failed to create task:', error);
      return null;
    }
  }, []);

  const cancelTask = useCallback((taskId: string) => {
    taskQueueService.cancelTask(taskId);
  }, []);

  const retryTask = useCallback((taskId: string) => {
    taskQueueService.retryTask(taskId);
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    taskQueueService.deleteTask(taskId);
  }, []);

  const clearCompleted = useCallback(() => {
    taskQueueService.clearCompletedTasks();
  }, []);

  const clearFailed = useCallback(() => {
    taskQueueService.clearFailedTasks();
  }, []);

  const getTask = useCallback((taskId: string) => {
    return taskQueueService.getTask(taskId);
  }, [updateCounter]); // Re-create when tasks update

  return {
    tasks,
    activeTasks,
    completedTasks,
    failedTasks,
    cancelledTasks,
    createTask,
    cancelTask,
    retryTask,
    deleteTask,
    clearCompleted,
    clearFailed,
    getTask,
  };
}
