/**
 * Task Fingerprint Module
 *
 * Generates unique fingerprints for tasks based on their parameters
 * to enable content-level deduplication.
 */

import { TaskType, GenerationParams, SWTask } from '../types';

/**
 * Fingerprint generation options
 */
export interface FingerprintOptions {
  /** Include timestamp in fingerprint (default: false) */
  includeTimestamp?: boolean;
  /** Custom salt for fingerprint generation */
  salt?: string;
}

/**
 * TaskFingerprint utility class
 * Generates deterministic fingerprints for task deduplication
 */
export class TaskFingerprint {
  /**
   * Generate a fingerprint for a task based on its type and parameters
   * @param type Task type
   * @param params Generation parameters
   * @param options Fingerprint options
   * @returns Unique fingerprint string
   */
  static generate(
    type: TaskType,
    params: GenerationParams,
    options: FingerprintOptions = {}
  ): string {
    // Extract relevant fields for fingerprint based on task type
    const fingerprintData = this.extractFingerprintData(type, params);

    // Add type to fingerprint data
    const dataWithType = {
      type,
      ...fingerprintData,
    };

    // Add optional salt
    if (options.salt) {
      (dataWithType as Record<string, unknown>).salt = options.salt;
    }

    // Add timestamp if requested (makes fingerprint unique per creation time)
    if (options.includeTimestamp) {
      (dataWithType as Record<string, unknown>).timestamp = Date.now();
    }

    // Generate hash from normalized JSON string
    const jsonString = this.normalizeAndStringify(dataWithType);
    return this.hashString(jsonString);
  }

  /**
   * Generate fingerprint from an existing task
   * @param task The task to generate fingerprint for
   * @returns Unique fingerprint string
   */
  static fromTask(task: SWTask): string {
    return this.generate(task.type, task.params);
  }

  /**
   * Check if a task with the same fingerprint already exists
   * @param fingerprint Fingerprint to check
   * @param existingTasks Map or array of existing tasks
   * @returns True if duplicate exists
   */
  static isDuplicate(
    fingerprint: string,
    existingTasks: Map<string, SWTask> | SWTask[]
  ): boolean {
    const tasks = existingTasks instanceof Map
      ? Array.from(existingTasks.values())
      : existingTasks;

    return tasks.some(task => {
      // Only check non-completed/non-failed tasks
      if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        return false;
      }
      const taskFingerprint = this.fromTask(task);
      return taskFingerprint === fingerprint;
    });
  }

  /**
   * Find existing task with the same fingerprint
   * @param fingerprint Fingerprint to find
   * @param existingTasks Map or array of existing tasks
   * @returns Existing task or null
   */
  static findDuplicate(
    fingerprint: string,
    existingTasks: Map<string, SWTask> | SWTask[]
  ): SWTask | null {
    const tasks = existingTasks instanceof Map
      ? Array.from(existingTasks.values())
      : existingTasks;

    return tasks.find(task => {
      // Only check active tasks (pending, processing, retrying)
      if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        return false;
      }
      const taskFingerprint = this.fromTask(task);
      return taskFingerprint === fingerprint;
    }) || null;
  }

  /**
   * Extract relevant data for fingerprint based on task type
   */
  private static extractFingerprintData(
    type: TaskType,
    params: GenerationParams
  ): Record<string, unknown> {
    const baseData: Record<string, unknown> = {
      prompt: params.prompt?.trim().toLowerCase() || '',
    };

    switch (type) {
      case TaskType.IMAGE:
        return {
          ...baseData,
          width: params.width,
          height: params.height,
          size: params.size,
          style: params.style,
          model: params.model,
          // Include reference images if present
          referenceImages: params.referenceImages,
          // Include batch info for concurrent generation
          batchId: params.batchId,
          batchIndex: params.batchIndex,
        };

      case TaskType.VIDEO:
        return {
          ...baseData,
          width: params.width,
          height: params.height,
          duration: params.duration,
          model: params.model,
          sourceVideoTaskId: params.sourceVideoTaskId,
          referenceImages: params.referenceImages,
          // Include batch info for concurrent generation
          batchId: params.batchId,
          batchIndex: params.batchIndex,
        };

      case TaskType.CHARACTER:
        return {
          ...baseData,
          sourceVideoTaskId: params.sourceVideoTaskId,
          characterTimestamps: params.characterTimestamps,
        };

      case TaskType.INSPIRATION_BOARD:
        return {
          ...baseData,
          gridImageRows: params.gridImageRows,
          gridImageCols: params.gridImageCols,
          gridImageLayoutStyle: params.gridImageLayoutStyle,
          inspirationBoardLayoutStyle: params.inspirationBoardLayoutStyle,
          inspirationBoardImageCount: params.inspirationBoardImageCount,
        };

      case TaskType.CHAT:
        // Chat tasks are unique per request, include more context
        return {
          ...baseData,
          model: params.model,
        };

      default:
        return baseData;
    }
  }

  /**
   * Normalize object and convert to JSON string
   * Ensures consistent key ordering for deterministic hashing
   */
  private static normalizeAndStringify(obj: Record<string, unknown>): string {
    const sortedKeys = Object.keys(obj).sort();
    const sortedObj: Record<string, unknown> = {};

    for (const key of sortedKeys) {
      const value = obj[key];
      if (value !== undefined && value !== null) {
        if (typeof value === 'object' && !Array.isArray(value)) {
          sortedObj[key] = this.normalizeAndStringify(value as Record<string, unknown>);
        } else if (Array.isArray(value)) {
          sortedObj[key] = value.map(item =>
            typeof item === 'object' && item !== null
              ? this.normalizeAndStringify(item as Record<string, unknown>)
              : item
          );
        } else {
          sortedObj[key] = value;
        }
      }
    }

    return JSON.stringify(sortedObj);
  }

  /**
   * Generate a hash string from input
   * Uses a simple but effective hash algorithm suitable for SW environment
   */
  private static hashString(str: string): string {
    // Use cyrb53 hash algorithm - fast and good distribution
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;

    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    // Return as hex string
    const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return hash.toString(16).padStart(16, '0');
  }
}

export default TaskFingerprint;
