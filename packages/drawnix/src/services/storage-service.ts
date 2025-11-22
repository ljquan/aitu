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
      console.log('[StorageService] Initialized successfully');
    } catch (error) {
      console.error('[StorageService] Failed to initialize:', error);
      throw new Error('Storage initialization failed');
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
      
      // Convert array to map for efficient lookups
      const tasksMap: Record<string, Task> = {};
      tasks.forEach(task => {
        tasksMap[task.id] = task;
      });
      
      await this.store.setItem(INDEXEDDB_CONFIG.STORAGE_KEY, tasksMap);
      console.log(`[StorageService] Saved ${tasks.length} tasks`);
    } catch (error) {
      console.error('[StorageService] Failed to save tasks:', error);
      throw new Error('Failed to save tasks to storage');
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
      
      const tasksMap = await this.store.getItem<Record<string, Task>>(
        INDEXEDDB_CONFIG.STORAGE_KEY
      );
      
      if (!tasksMap) {
        console.log('[StorageService] No tasks found in storage');
        return [];
      }
      
      const tasks = Object.values(tasksMap);
      console.log(`[StorageService] Loaded ${tasks.length} tasks`);
      return tasks;
    } catch (error) {
      console.error('[StorageService] Failed to load tasks:', error);
      // Return empty array instead of throwing to allow app to continue
      return [];
    }
  }

  /**
   * Clears completed and cancelled tasks from storage
   * Retains only active and failed tasks
   */
  async clearCompletedTasks(): Promise<void> {
    try {
      await this.ensureInitialized();
      
      const tasks = await this.loadTasks();
      const activeTasks = tasks.filter(task => 
        task.status !== TaskStatus.COMPLETED && 
        task.status !== TaskStatus.CANCELLED
      );
      
      await this.saveTasks(activeTasks);
      console.log(`[StorageService] Cleared completed tasks, ${activeTasks.length} remaining`);
    } catch (error) {
      console.error('[StorageService] Failed to clear completed tasks:', error);
      throw new Error('Failed to clear completed tasks');
    }
  }

  /**
   * Clears failed tasks from storage
   */
  async clearFailedTasks(): Promise<void> {
    try {
      await this.ensureInitialized();
      
      const tasks = await this.loadTasks();
      const nonFailedTasks = tasks.filter(task => 
        task.status !== TaskStatus.FAILED
      );
      
      await this.saveTasks(nonFailedTasks);
      console.log(`[StorageService] Cleared failed tasks, ${nonFailedTasks.length} remaining`);
    } catch (error) {
      console.error('[StorageService] Failed to clear failed tasks:', error);
      throw new Error('Failed to clear failed tasks');
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
      
      // Keep only the most recent tasks
      const retainedTasks = tasks.slice(0, STORAGE_LIMITS.MAX_RETAINED_TASKS);
      
      await this.saveTasks(retainedTasks);
      console.log(`[StorageService] Pruned to ${retainedTasks.length} tasks`);
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
      console.log('[StorageService] Cleared all storage');
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
