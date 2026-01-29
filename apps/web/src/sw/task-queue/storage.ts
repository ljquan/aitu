/**
 * Service Worker Task Queue Storage
 *
 * Provides IndexedDB-based persistence for task queue state.
 * Ensures tasks survive page refreshes and SW restarts.
 * 
 * Supports:
 * - Tasks (image/video/character generation)
 * - Workflows (multi-step operations)
 * - Chat Workflows (LLM chat with tool execution)
 * - Pending Tool Requests (main thread tool delegation)
 */

import type { SWTask, GeminiConfig, VideoAPIConfig } from './types';
import type { Workflow } from './workflow-types';
import type { ChatWorkflow } from './chat-workflow/types';
import { getSafeErrorMessage } from './utils/sanitize-utils';

const DB_NAME = 'sw-task-queue';
const MIN_DB_VERSION = 2; // Minimum required version (with workflow stores)
const TASKS_STORE = 'tasks';
const CONFIG_STORE = 'config';
const WORKFLOWS_STORE = 'workflows';
const CHAT_WORKFLOWS_STORE = 'chat-workflows';
const PENDING_TOOL_REQUESTS_STORE = 'pending-tool-requests';

// All required stores for integrity check
const REQUIRED_STORES = [
  TASKS_STORE,
  CONFIG_STORE,
  WORKFLOWS_STORE,
  CHAT_WORKFLOWS_STORE,
  PENDING_TOOL_REQUESTS_STORE,
];

/**
 * Pending tool request stored in IndexedDB
 */
export interface StoredPendingToolRequest {
  requestId: string;
  workflowId: string;
  stepId: string;
  toolName: string;
  args: Record<string, unknown>;
  createdAt: number;
  /** ID of the client that initiated the request */
  clientId?: string;
}

/**
 * Detect existing database version to avoid downgrade errors
 */
function detectDatabaseVersion(): Promise<number> {
  return new Promise((resolve) => {
    // Open without version to get current version
    const request = indexedDB.open(DB_NAME);
    
    request.onsuccess = () => {
      const db = request.result;
      const version = db.version;
      db.close();
      resolve(Math.max(version, MIN_DB_VERSION));
    };
    
    request.onerror = () => {
      resolve(MIN_DB_VERSION);
    };
  });
}

/**
 * Check if all required object stores exist
 */
function checkStoresIntegrity(db: IDBDatabase): string[] {
  const missing: string[] = [];
  for (const store of REQUIRED_STORES) {
    if (!db.objectStoreNames.contains(store)) {
      missing.push(store);
    }
  }
  return missing;
}

/**
 * Create missing object stores by incrementing version
 */
function repairDatabase(currentVersion: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Increment version to trigger onupgradeneeded
    const newVersion = currentVersion + 1;
    console.log(`[SWStorage] Repairing database: upgrading from v${currentVersion} to v${newVersion}`);
    
    const request = indexedDB.open(DB_NAME, newVersion);
    
    request.onerror = () => {
      console.error('[SWStorage] Failed to repair DB:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      resolve(request.result);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      createAllStores(db);
    };
  });
}

/**
 * Create all required object stores if they don't exist
 */
function createAllStores(db: IDBDatabase): void {
  // Create tasks store
  if (!db.objectStoreNames.contains(TASKS_STORE)) {
    const tasksStore = db.createObjectStore(TASKS_STORE, { keyPath: 'id' });
    tasksStore.createIndex('status', 'status', { unique: false });
    tasksStore.createIndex('type', 'type', { unique: false });
    tasksStore.createIndex('createdAt', 'createdAt', { unique: false });
  }

  // Create config store
  if (!db.objectStoreNames.contains(CONFIG_STORE)) {
    db.createObjectStore(CONFIG_STORE, { keyPath: 'key' });
  }

  // Create workflows store
  if (!db.objectStoreNames.contains(WORKFLOWS_STORE)) {
    const workflowsStore = db.createObjectStore(WORKFLOWS_STORE, { keyPath: 'id' });
    workflowsStore.createIndex('status', 'status', { unique: false });
    workflowsStore.createIndex('createdAt', 'createdAt', { unique: false });
  }

  // Create chat workflows store
  if (!db.objectStoreNames.contains(CHAT_WORKFLOWS_STORE)) {
    const chatWorkflowsStore = db.createObjectStore(CHAT_WORKFLOWS_STORE, { keyPath: 'id' });
    chatWorkflowsStore.createIndex('status', 'status', { unique: false });
    chatWorkflowsStore.createIndex('createdAt', 'createdAt', { unique: false });
  }

  // Create pending tool requests store
  if (!db.objectStoreNames.contains(PENDING_TOOL_REQUESTS_STORE)) {
    const pendingRequestsStore = db.createObjectStore(PENDING_TOOL_REQUESTS_STORE, { keyPath: 'requestId' });
    pendingRequestsStore.createIndex('workflowId', 'workflowId', { unique: false });
  }
}

/**
 * Open IndexedDB connection with dynamic version detection and auto-repair
 */
async function openDB(): Promise<IDBDatabase> {
  // First, detect the current database version
  const targetVersion = await detectDatabaseVersion();
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, targetVersion);

    request.onerror = () => {
      console.error('[SWStorage] Failed to open DB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      const db = request.result;
      
      // Check if all stores exist
      const missingStores = checkStoresIntegrity(db);
      if (missingStores.length > 0) {
        console.warn(`[SWStorage] Missing object stores: ${missingStores.join(', ')}. Repairing...`);
        db.close();
        
        // Repair by incrementing version
        repairDatabase(db.version)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      createAllStores(db);
    };
  });
}

/**
 * Task Queue Storage Manager
 */
export class TaskQueueStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;
  
  // Batch save optimization to reduce IndexedDB transaction overhead
  private pendingTaskSaves: Map<string, SWTask> = new Map();
  private batchSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private batchSavePromises: Map<string, { resolve: () => void; reject: (err: unknown) => void }> = new Map();
  private readonly BATCH_SAVE_DELAY = 50; // ms - batch saves within this window

  /**
   * Get database connection
   */
  private async getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB();
    }
    return this.dbPromise;
  }

  /**
   * Flush pending task saves immediately
   */
  private async flushPendingTaskSaves(): Promise<void> {
    if (this.batchSaveTimer) {
      clearTimeout(this.batchSaveTimer);
      this.batchSaveTimer = null;
    }

    const tasksToSave = Array.from(this.pendingTaskSaves.values());
    const promisesToResolve = new Map(this.batchSavePromises);
    
    this.pendingTaskSaves.clear();
    this.batchSavePromises.clear();

    if (tasksToSave.length === 0) return;

    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(TASKS_STORE, 'readwrite');
        const store = transaction.objectStore(TASKS_STORE);

        // Put all tasks in a single transaction
        for (const task of tasksToSave) {
          store.put(task);
        }

        transaction.oncomplete = () => {
          // Resolve all pending promises
          promisesToResolve.forEach(({ resolve }) => resolve());
          resolve();
        };
        transaction.onerror = () => {
          const error = transaction.error;
          promisesToResolve.forEach(({ reject }) => reject(error));
          reject(error);
        };
      });
    } catch (error) {
      console.error('[SWStorage] Failed to batch save tasks:', error);
      promisesToResolve.forEach(({ reject }) => reject(error));
    }
  }

  /**
   * Save a task to IndexedDB (batched for performance)
   */
  async saveTask(task: SWTask): Promise<void> {
    return new Promise((resolve, reject) => {
      // Add to pending saves
      this.pendingTaskSaves.set(task.id, task);
      this.batchSavePromises.set(task.id, { resolve, reject });

      // Schedule batch save
      if (!this.batchSaveTimer) {
        this.batchSaveTimer = setTimeout(() => {
          this.flushPendingTaskSaves();
        }, this.BATCH_SAVE_DELAY);
      }
    });
  }

  /**
   * Save a task immediately without batching (for critical saves)
   */
  async saveTaskImmediate(task: SWTask): Promise<void> {
    // First, remove from pending batch if present
    this.pendingTaskSaves.delete(task.id);
    const pendingPromise = this.batchSavePromises.get(task.id);
    if (pendingPromise) {
      this.batchSavePromises.delete(task.id);
    }

    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(TASKS_STORE, 'readwrite');
        const store = transaction.objectStore(TASKS_STORE);
        const request = store.put(task);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
      
      // Resolve the pending promise if it existed
      if (pendingPromise) {
        pendingPromise.resolve();
      }
    } catch (error) {
      console.error('[SWStorage] Failed to save task:', error);
      if (pendingPromise) {
        pendingPromise.reject(error);
      }
      throw error;
    }
  }

  /**
   * Get a task by ID
   */
  async getTask(taskId: string): Promise<SWTask | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(TASKS_STORE, 'readonly');
        const store = transaction.objectStore(TASKS_STORE);
        const request = store.get(taskId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
      });
    } catch (error) {
      console.error('[SWStorage] Failed to get task:', error);
      return null;
    }
  }

  /**
   * Get all tasks
   */
  async getAllTasks(): Promise<SWTask[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(TASKS_STORE, 'readonly');
        const store = transaction.objectStore(TASKS_STORE);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || []);
      });
    } catch (error) {
      console.error('[SWStorage] Failed to get all tasks:', error);
      return [];
    }
  }

  /**
   * Get tasks by status
   */
  async getTasksByStatus(status: string): Promise<SWTask[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(TASKS_STORE, 'readonly');
        const store = transaction.objectStore(TASKS_STORE);
        const index = store.index('status');
        const request = index.getAll(status);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || []);
      });
    } catch (error) {
      console.error('[SWStorage] Failed to get tasks by status:', error);
      return [];
    }
  }

  /**
   * Get tasks with pagination using cursor
   * @param options Pagination options
   * @returns Paginated tasks and metadata
   */
  async getTasksPaginated(options: {
    offset: number;
    limit: number;
    status?: string;
    type?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ tasks: SWTask[]; total: number; hasMore: boolean }> {
    const { offset, limit, status, type, sortOrder = 'desc' } = options;

    try {
      const db = await this.getDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(TASKS_STORE, 'readonly');
        const store = transaction.objectStore(TASKS_STORE);
        const index = store.index('createdAt');

        // First, get total count with filters
        const countRequest = store.count();
        let total = 0;

        countRequest.onsuccess = () => {
          total = countRequest.result;
        };

        // Use cursor to iterate with pagination
        const direction: IDBCursorDirection = sortOrder === 'desc' ? 'prev' : 'next';
        const cursorRequest = index.openCursor(null, direction);

        const tasks: SWTask[] = [];
        let skipped = 0;
        let filteredTotal = 0;

        cursorRequest.onerror = () => reject(cursorRequest.error);
        cursorRequest.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

          if (!cursor) {
            // No more entries
            resolve({
              tasks,
              total: filteredTotal,
              hasMore: filteredTotal > offset + tasks.length,
            });
            return;
          }

          const task = cursor.value as SWTask;

          // Apply filters
          const matchesStatus = !status || task.status === status;
          const matchesType = !type || task.type === type;

          if (matchesStatus && matchesType) {
            filteredTotal++;

            if (skipped < offset) {
              // Skip items before offset
              skipped++;
            } else if (tasks.length < limit) {
              // Collect items within limit
              tasks.push(task);
            }
          }

          cursor.continue();
        };
      });
    } catch (error) {
      console.error('[SWStorage] Failed to get paginated tasks:', error);
      return { tasks: [], total: 0, hasMore: false };
    }
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(TASKS_STORE, 'readwrite');
        const store = transaction.objectStore(TASKS_STORE);
        const request = store.delete(taskId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('[SWStorage] Failed to delete task:', error);
    }
  }

  /**
   * Save API configuration
   */
  async saveConfig(
    geminiConfig: GeminiConfig | null,
    videoConfig: VideoAPIConfig | null
  ): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CONFIG_STORE, 'readwrite');
        const store = transaction.objectStore(CONFIG_STORE);

        if (geminiConfig) {
          store.put({ key: 'gemini', ...geminiConfig });
        }
        if (videoConfig) {
          store.put({ key: 'video', ...videoConfig });
        }

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      // 只记录错误类型，不记录详细信息（可能包含敏感配置）
      console.error('[SWStorage] Failed to save config:', getSafeErrorMessage(error));
    }
  }

  /**
   * Load API configuration
   */
  async loadConfig(): Promise<{
    geminiConfig: GeminiConfig | null;
    videoConfig: VideoAPIConfig | null;
  }> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CONFIG_STORE, 'readonly');
        const store = transaction.objectStore(CONFIG_STORE);

        const geminiRequest = store.get('gemini');
        const videoRequest = store.get('video');

        transaction.oncomplete = () => {
          const geminiResult = geminiRequest.result;
          const videoResult = videoRequest.result;

          resolve({
            geminiConfig: geminiResult
              ? {
                  apiKey: geminiResult.apiKey,
                  baseUrl: geminiResult.baseUrl,
                  modelName: geminiResult.modelName,
                }
              : null,
            videoConfig: videoResult
              ? {
                  baseUrl: videoResult.baseUrl,
                  apiKey: videoResult.apiKey,
                }
              : null,
          });
        };
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      // 只记录错误类型，不记录详细信息（可能包含敏感配置）
      console.error('[SWStorage] Failed to load config:', getSafeErrorMessage(error));
      return { geminiConfig: null, videoConfig: null };
    }
  }

  // ============================================================================
  // MCP System Prompt Storage Methods
  // ============================================================================

  /**
   * Save MCP system prompt to IndexedDB
   * Called from main thread during initialization
   */
  async saveSystemPrompt(systemPrompt: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CONFIG_STORE, 'readwrite');
        const store = transaction.objectStore(CONFIG_STORE);
        store.put({ 
          key: 'systemPrompt', 
          value: systemPrompt,
          updatedAt: Date.now(),
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.error('[SWStorage] Failed to save system prompt:', error);
    }
  }

  /**
   * Get MCP system prompt from IndexedDB
   * Called from SW during AI analysis
   */
  async getSystemPrompt(): Promise<string | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CONFIG_STORE, 'readonly');
        const store = transaction.objectStore(CONFIG_STORE);
        const request = store.get('systemPrompt');

        request.onsuccess = () => {
          const result = request.result;
          resolve(result?.value || null);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('[SWStorage] Failed to get system prompt:', error);
      return null;
    }
  }

  // ============================================================================
  // Workflow Storage Methods
  // ============================================================================

  /**
   * Save a workflow to IndexedDB
   */
  async saveWorkflow(workflow: Workflow): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(WORKFLOWS_STORE, 'readwrite');
        const store = transaction.objectStore(WORKFLOWS_STORE);
        const request = store.put(workflow);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('[SWStorage] Failed to save workflow:', error);
    }
  }

  /**
   * Get a workflow by ID
   */
  async getWorkflow(workflowId: string): Promise<Workflow | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(WORKFLOWS_STORE, 'readonly');
        const store = transaction.objectStore(WORKFLOWS_STORE);
        const request = store.get(workflowId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
      });
    } catch (error) {
      console.error('[SWStorage] Failed to get workflow:', error);
      return null;
    }
  }

  /**
   * Get all workflows
   */
  async getAllWorkflows(): Promise<Workflow[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(WORKFLOWS_STORE, 'readonly');
        const store = transaction.objectStore(WORKFLOWS_STORE);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || []);
      });
    } catch (error) {
      console.error('[SWStorage] Failed to get all workflows:', error);
      return [];
    }
  }

  /**
   * Get workflows by status
   */
  async getWorkflowsByStatus(status: string): Promise<Workflow[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(WORKFLOWS_STORE, 'readonly');
        const store = transaction.objectStore(WORKFLOWS_STORE);
        const index = store.index('status');
        const request = index.getAll(status);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || []);
      });
    } catch (error) {
      console.error('[SWStorage] Failed to get workflows by status:', error);
      return [];
    }
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(WORKFLOWS_STORE, 'readwrite');
        const store = transaction.objectStore(WORKFLOWS_STORE);
        const request = store.delete(workflowId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('[SWStorage] Failed to delete workflow:', error);
    }
  }

  // ============================================================================
  // Chat Workflow Storage Methods
  // ============================================================================

  /**
   * Save a chat workflow to IndexedDB
   */
  async saveChatWorkflow(workflow: ChatWorkflow): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CHAT_WORKFLOWS_STORE, 'readwrite');
        const store = transaction.objectStore(CHAT_WORKFLOWS_STORE);
        const request = store.put(workflow);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('[SWStorage] Failed to save chat workflow:', error);
    }
  }

  /**
   * Get a chat workflow by ID
   */
  async getChatWorkflow(workflowId: string): Promise<ChatWorkflow | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CHAT_WORKFLOWS_STORE, 'readonly');
        const store = transaction.objectStore(CHAT_WORKFLOWS_STORE);
        const request = store.get(workflowId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
      });
    } catch (error) {
      console.error('[SWStorage] Failed to get chat workflow:', error);
      return null;
    }
  }

  /**
   * Get all chat workflows
   */
  async getAllChatWorkflows(): Promise<ChatWorkflow[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CHAT_WORKFLOWS_STORE, 'readonly');
        const store = transaction.objectStore(CHAT_WORKFLOWS_STORE);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || []);
      });
    } catch (error) {
      console.error('[SWStorage] Failed to get all chat workflows:', error);
      return [];
    }
  }

  /**
   * Get chat workflows by status
   */
  async getChatWorkflowsByStatus(status: string): Promise<ChatWorkflow[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CHAT_WORKFLOWS_STORE, 'readonly');
        const store = transaction.objectStore(CHAT_WORKFLOWS_STORE);
        const index = store.index('status');
        const request = index.getAll(status);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || []);
      });
    } catch (error) {
      console.error('[SWStorage] Failed to get chat workflows by status:', error);
      return [];
    }
  }

  /**
   * Delete a chat workflow
   */
  async deleteChatWorkflow(workflowId: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(CHAT_WORKFLOWS_STORE, 'readwrite');
        const store = transaction.objectStore(CHAT_WORKFLOWS_STORE);
        const request = store.delete(workflowId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('[SWStorage] Failed to delete chat workflow:', error);
    }
  }

  // ============================================================================
  // Pending Tool Request Storage Methods
  // ============================================================================

  /**
   * Save a pending tool request to IndexedDB
   */
  async savePendingToolRequest(request: StoredPendingToolRequest): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(PENDING_TOOL_REQUESTS_STORE, 'readwrite');
        const store = transaction.objectStore(PENDING_TOOL_REQUESTS_STORE);
        const req = store.put(request);

        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('[SWStorage] Failed to save pending tool request:', error);
    }
  }

  /**
   * Get all pending tool requests
   */
  async getAllPendingToolRequests(): Promise<StoredPendingToolRequest[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(PENDING_TOOL_REQUESTS_STORE, 'readonly');
        const store = transaction.objectStore(PENDING_TOOL_REQUESTS_STORE);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || []);
      });
    } catch (error) {
      console.error('[SWStorage] Failed to get all pending tool requests:', error);
      return [];
    }
  }

  /**
   * Get pending tool requests by workflow ID
   */
  async getPendingToolRequestsByWorkflow(workflowId: string): Promise<StoredPendingToolRequest[]> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(PENDING_TOOL_REQUESTS_STORE, 'readonly');
        const store = transaction.objectStore(PENDING_TOOL_REQUESTS_STORE);
        const index = store.index('workflowId');
        const request = index.getAll(workflowId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || []);
      });
    } catch (error) {
      console.error('[SWStorage] Failed to get pending tool requests by workflow:', error);
      return [];
    }
  }

  /**
   * Get a pending tool request by requestId
   */
  async getPendingToolRequest(requestId: string): Promise<StoredPendingToolRequest | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(PENDING_TOOL_REQUESTS_STORE, 'readonly');
        const store = transaction.objectStore(PENDING_TOOL_REQUESTS_STORE);
        const request = store.get(requestId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
      });
    } catch (error) {
      console.error('[SWStorage] Failed to get pending tool request:', error);
      return null;
    }
  }

  /**
   * Delete a pending tool request
   */
  async deletePendingToolRequest(requestId: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(PENDING_TOOL_REQUESTS_STORE, 'readwrite');
        const store = transaction.objectStore(PENDING_TOOL_REQUESTS_STORE);
        const request = store.delete(requestId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('[SWStorage] Failed to delete pending tool request:', error);
    }
  }

  /**
   * Delete all pending tool requests for a workflow
   */
  async deletePendingToolRequestsByWorkflow(workflowId: string): Promise<void> {
    try {
      const requests = await this.getPendingToolRequestsByWorkflow(workflowId);
      for (const request of requests) {
        await this.deletePendingToolRequest(request.requestId);
      }
    } catch (error) {
      console.error('[SWStorage] Failed to delete pending tool requests by workflow:', error);
    }
  }
}

// Singleton instance
export const taskQueueStorage = new TaskQueueStorage();
