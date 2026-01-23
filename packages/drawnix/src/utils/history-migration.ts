/**
 * History Migration Utility
 *
 * Migrates legacy history data from localStorage to task queue in IndexedDB
 */

import { storageService } from '../services/storage-service';
import { TaskType, TaskStatus, Task } from '../types/task.types';
import {
  AI_IMAGE_GENERATION_HISTORY_KEY,
  AI_VIDEO_GENERATION_HISTORY_KEY
} from '../constants/storage';

/**
 * Legacy history item interfaces (from old localStorage format)
 */
interface LegacyBaseHistoryItem {
  id: string;
  prompt: string;
  timestamp: number;
}

interface LegacyImageHistoryItem extends LegacyBaseHistoryItem {
  type?: 'image';
  imageUrl: string;
  width: number;
  height: number;
}

interface LegacyVideoHistoryItem extends LegacyBaseHistoryItem {
  type?: 'video';
  imageUrl: string;
  width: number;
  height: number;
  previewUrl: string;
  downloadUrl?: string;
}

/**
 * Converts legacy history item to task format
 */
function convertImageHistoryToTask(item: LegacyImageHistoryItem): Task {
  // Infer format from URL
  const urlLower = item.imageUrl.toLowerCase();
  const format = urlLower.includes('.png') ? 'png' :
                 urlLower.includes('.jpg') || urlLower.includes('.jpeg') ? 'jpg' :
                 urlLower.includes('.webp') ? 'webp' : 'png';

  return {
    id: item.id,
    type: TaskType.IMAGE,
    status: TaskStatus.COMPLETED,
    params: {
      prompt: item.prompt,
      width: item.width,
      height: item.height,
    },
    result: {
      url: item.imageUrl,
      format,
      size: 0, // Unknown, set to 0
      width: item.width,
      height: item.height,
    },
    createdAt: item.timestamp,
    updatedAt: item.timestamp,
    completedAt: item.timestamp,
  };
}

function convertVideoHistoryToTask(item: LegacyVideoHistoryItem): Task {
  // Infer format from URL
  const urlLower = item.previewUrl.toLowerCase();
  const format = urlLower.includes('.mp4') ? 'mp4' :
                 urlLower.includes('.webm') ? 'webm' :
                 urlLower.includes('.mov') ? 'mov' : 'mp4';

  return {
    id: item.id,
    type: TaskType.VIDEO,
    status: TaskStatus.COMPLETED,
    params: {
      prompt: item.prompt,
      width: item.width,
      height: item.height,
    },
    result: {
      url: item.previewUrl,
      format,
      size: 0, // Unknown, set to 0
      width: item.width,
      height: item.height,
      thumbnailUrl: item.imageUrl, // Store thumbnail URL
    },
    createdAt: item.timestamp,
    updatedAt: item.timestamp,
    completedAt: item.timestamp,
  };
}

/**
 * Migrates legacy image history from localStorage to task queue
 */
async function migrateImageHistory(): Promise<Task[]> {
  try {
    const cached = localStorage.getItem(AI_IMAGE_GENERATION_HISTORY_KEY);
    if (!cached) {
      return [];
    }

    const legacyItems = JSON.parse(cached) as LegacyImageHistoryItem[];
    if (!Array.isArray(legacyItems) || legacyItems.length === 0) {
      return [];
    }

    // console.log(`[HistoryMigration] Found ${legacyItems.length} legacy image history items`);

    // Convert each history item to task format
    const tasks = legacyItems.map(convertImageHistoryToTask);

    // Save to IndexedDB directly (don't add to in-memory queue yet)
    await storageService.saveTasks(tasks);

    // Delete legacy data from localStorage
    localStorage.removeItem(AI_IMAGE_GENERATION_HISTORY_KEY);

    // console.log(`[HistoryMigration] Migrated ${tasks.length} image history items`);
    return tasks;
  } catch (error) {
    console.error('[HistoryMigration] Failed to migrate image history:', error);
    return [];
  }
}

/**
 * Migrates legacy video history from localStorage to task queue
 */
async function migrateVideoHistory(): Promise<Task[]> {
  try {
    const cached = localStorage.getItem(AI_VIDEO_GENERATION_HISTORY_KEY);
    if (!cached) {
      return [];
    }

    const legacyItems = JSON.parse(cached) as LegacyVideoHistoryItem[];
    if (!Array.isArray(legacyItems) || legacyItems.length === 0) {
      return [];
    }

    // console.log(`[HistoryMigration] Found ${legacyItems.length} legacy video history items`);

    // Convert each history item to task format
    const tasks = legacyItems.map(convertVideoHistoryToTask);

    // Save to IndexedDB directly (don't add to in-memory queue yet)
    await storageService.saveTasks(tasks);

    // Delete legacy data from localStorage
    localStorage.removeItem(AI_VIDEO_GENERATION_HISTORY_KEY);

    // console.log(`[HistoryMigration] Migrated ${tasks.length} video history items`);
    return tasks;
  } catch (error) {
    console.error('[HistoryMigration] Failed to migrate video history:', error);
    return [];
  }
}

/**
 * Main migration function - migrates all legacy history data
 * Should be called once during app initialization, before loading tasks
 *
 * Migrated tasks are saved directly to IndexedDB and will be loaded
 * along with other tasks during normal initialization.
 */
export async function migrateLegacyHistory(): Promise<void> {
  // console.log('[HistoryMigration] Starting legacy history migration...');

  try {
    const imageTasks = await migrateImageHistory();
    const videoTasks = await migrateVideoHistory();

    const totalMigrated = imageTasks.length + videoTasks.length;

    if (totalMigrated > 0) {
      // console.log(`[HistoryMigration] ✅ Migration completed! Migrated ${totalMigrated} items (${imageTasks.length} images, ${videoTasks.length} videos)`);
    } else {
      // console.log('[HistoryMigration] No legacy history data found, skipping migration');
    }
  } catch (error) {
    console.error('[HistoryMigration] Migration failed:', error);
    // Don't throw - migration failure shouldn't break the app
  }
}
