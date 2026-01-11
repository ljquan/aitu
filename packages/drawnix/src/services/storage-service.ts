/**
 * Storage Service
 * 
 * Encapsulates IndexedDB operations using localforage for task persistence.
 * Provides reliable storage and retrieval of task queue data across browser sessions.
 */

import localforage from 'localforage';
import { Task, TaskStatus } from '../types/task.types';
import { INDEXEDDB_CONFIG, STORAGE_LIMITS } from '../constants/TASK_CONSTANTS';

/**
 * Storage service class for managing task persistence
 * Uses IndexedDB via localforage for reliable browser storage
 */
class StorageService {
  private store: LocalForage;
  private initialized: boolean = false;

  constructor() {
    // Initialize localforage with IndexedDB configuration
    this.store = localforage.createInstance({
      driver: localforage.INDEXEDDB,
      name: INDEXEDDB_CONFIG.DATABASE_NAME,
      version: INDEXEDDB_CONFIG.DATABASE_VERSION,
      storeName: INDEXEDDB_CONFIG.TASKS_STORE_NAME,
      description: 'Task queue persistent storage',
    });
  }

  /**
   * Initializes the storage service
   * Must be called before using other methods
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.store.ready();
      this.initialized = true;
      // console.log('[StorageService] Initialized successfully');
    } catch (error) {
      console.error('[StorageService] Failed to initialize:', error);
      throw new Error('Storage initialization failed');
    }
  }

  /**
   * Saves a single task to storage
   * Uses task.id as the storage key
   *
   * @param task - Task to save
   * @throws Error if save operation fails
   */
  async saveTask(task: Task): Promise<void> {
    try {
      await this.ensureInitialized();
      await this.store.setItem(task.id, task);
      // console.log(`[StorageService] Saved task ${task.id}`);
    } catch (error) {
      console.error('[StorageService] Failed to save task:', error);
      throw new Error('Failed to save task to storage');
    }
  }

  /**
   * Saves the complete task list to storage
   *
   * @param tasks - Array of tasks to save
   * @throws Error if save operation fails
   */
  async saveTasks(tasks: Task[]): Promise<void> {
    try {
      await this.ensureInitialized();

      // Save each task individually using taskId as key
      await Promise.all(tasks.map(task => this.saveTask(task)));
      // console.log(`[StorageService] Saved ${tasks.length} tasks`);
    } catch (error) {
      console.error('[StorageService] Failed to save tasks:', error);
      throw new Error('Failed to save tasks to storage');
    }
  }

  /**
   * Loads a single task from storage by ID
   *
   * @param taskId - Task ID to load
   * @returns Task or null if not found
   */
  async loadTask(taskId: string): Promise<Task | null> {
    try {
      await this.ensureInitialized();
      const task = await this.store.getItem<Task>(taskId);
      return task;
    } catch (error) {
      console.error(`[StorageService] Failed to load task ${taskId}:`, error);
      return null;
    }
  }

  /**
   * Loads all tasks from storage
   *
   * @returns Array of tasks
   * @throws Error if load operation fails
   */
  async loadTasks(): Promise<Task[]> {
    try {
      await this.ensureInitialized();

      const tasks: Task[] = [];

      // Iterate through all keys in the store
      await this.store.iterate<Task, void>((value) => {
        // Add valid task objects
        if (value && typeof value === 'object' && 'id' in value) {
          tasks.push(value);
        }
      });

      // console.log(`[StorageService] Loaded ${tasks.length} tasks`);
      return tasks;
    } catch (error) {
      console.error('[StorageService] Failed to load tasks:', error);
      // Return empty array instead of throwing to allow app to continue
      return [];
    }
  }

  /**
   * Deletes a task from storage by ID
   *
   * @param taskId - Task ID to delete
   */
  async deleteTask(taskId: string): Promise<void> {
    try {
      await this.ensureInitialized();
      await this.store.removeItem(taskId);
      // console.log(`[StorageService] Deleted task ${taskId}`);
    } catch (error) {
      console.error(`[StorageService] Failed to delete task ${taskId}:`, error);
      throw new Error('Failed to delete task from storage');
    }
  }


  /**
   * Gets the approximate storage size in bytes
   * Note: This is an estimate based on JSON serialization
   * 
   * @returns Storage size in bytes
   */
  async getStorageSize(): Promise<number> {
    try {
      await this.ensureInitialized();
      
      const tasks = await this.loadTasks();
      const jsonString = JSON.stringify(tasks);
      const sizeInBytes = new Blob([jsonString]).size;
      
      return sizeInBytes;
    } catch (error) {
      console.error('[StorageService] Failed to get storage size:', error);
      return 0;
    }
  }

  /**
   * Checks if storage is approaching capacity limit
   * 
   * @returns True if storage usage exceeds warning threshold
   */
  async isStorageNearLimit(): Promise<boolean> {
    const size = await this.getStorageSize();
    return size >= STORAGE_LIMITS.WARNING_THRESHOLD;
  }

  /**
   * Prunes old tasks to free up storage space
   * Keeps only the most recent tasks up to the retention limit
   */
  async pruneOldTasks(): Promise<void> {
    try {
      await this.ensureInitialized();

      const tasks = await this.loadTasks();

      // Sort tasks by creation time (newest first)
      tasks.sort((a, b) => b.createdAt - a.createdAt);

      // Identify tasks to delete (older than retention limit)
      const tasksToDelete = tasks.slice(STORAGE_LIMITS.MAX_RETAINED_TASKS);

      // Delete old tasks
      await Promise.all(tasksToDelete.map(task => this.deleteTask(task.id)));

      const remaining = tasks.length - tasksToDelete.length;
      // console.log(`[StorageService] Pruned ${tasksToDelete.length} old tasks, ${remaining} remaining`);
    } catch (error) {
      console.error('[StorageService] Failed to prune old tasks:', error);
      throw new Error('Failed to prune old tasks');
    }
  }

  /**
   * Clears all data from storage
   * Use with caution - this operation cannot be undone
   */
  async clearAll(): Promise<void> {
    try {
      await this.ensureInitialized();
      await this.store.clear();
      // console.log('[StorageService] Cleared all storage');
    } catch (error) {
      console.error('[StorageService] Failed to clear storage:', error);
      throw new Error('Failed to clear storage');
    }
  }

  /**
   * Ensures the storage service is initialized
   * @private
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Export singleton instance
export const storageService = new StorageService();
