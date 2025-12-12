/**
 * Asset Integration Service
 *
 * Handles automatic saving of AI-generated content to the media library.
 * Subscribes to task queue events and saves completed tasks to asset storage.
 */

import { assetStorageService } from './asset-storage-service';
import { taskQueueService } from './task-queue-service';
import { TaskType, TaskStatus, type Task, type TaskEvent } from '../types/task.types';
import { AssetSource, AssetType } from '../types/asset.types';
import { MessagePlugin } from 'tdesign-react';

/**
 * Generate a descriptive name for an AI-generated asset
 */
export function generateAssetName(task: Task): string {
  const timestamp = new Date(task.createdAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).replace(/\//g, '-').replace(/\s/g, '_');

  const promptPreview = task.params.prompt
    ? task.params.prompt.substring(0, 20).replace(/\s+/g, '_')
    : 'generated';

  const type = task.type === TaskType.IMAGE ? 'image' : 'video';

  return `AI_${type}_${timestamp}_${promptPreview}`;
}

/**
 * Fetch blob data from a URL
 */
async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch blob: ${response.statusText}`);
  }
  return await response.blob();
}

/**
 * Initialize asset integration with task queue
 * Subscribes to task completion events and automatically saves to media library
 */
export function initializeAssetIntegration(): () => void {
  // Subscribe to task updates
  const subscription = taskQueueService.observeTaskUpdates().subscribe((event: TaskEvent) => {
    // Only handle completed tasks
    if (event.type !== 'taskUpdated' || event.task.status !== TaskStatus.COMPLETED) {
      return;
    }

    const task = event.task;

    // Only handle image and video tasks
    if (task.type !== TaskType.IMAGE && task.type !== TaskType.VIDEO) {
      return;
    }

    // Check if already saved to library (prevent duplicates)
    if (task.savedToLibrary) {
      return;
    }

    // Check if task has result URL
    if (!task.result?.url) {
      console.warn(`[AssetIntegration] Task ${task.id} completed but has no result URL`);
      return;
    }

    // Auto-save to media library
    handleTaskCompletion(task).catch((error) => {
      console.error(`[AssetIntegration] Failed to save task ${task.id} to library:`, error);
    });
  });

  console.log('[AssetIntegration] Asset integration initialized');

  // Return cleanup function
  return () => {
    subscription.unsubscribe();
    console.log('[AssetIntegration] Asset integration cleanup');
  };
}

/**
 * Handle task completion by saving result to media library
 */
async function handleTaskCompletion(task: Task): Promise<void> {
  try {
    console.log(`[AssetIntegration] Auto-saving task ${task.id} to media library`);

    // Fetch the blob from result URL
    const blob = await fetchBlob(task.result!.url);

    // Generate asset name
    const name = generateAssetName(task);

    // Determine asset type and mime type
    const assetType = task.type === TaskType.IMAGE ? AssetType.IMAGE : AssetType.VIDEO;
    const mimeType = task.result!.format === 'mp4'
      ? 'video/mp4'
      : task.result!.format === 'webm'
      ? 'video/webm'
      : `image/${task.result!.format}`;

    // Save to asset storage
    const asset = await assetStorageService.addAsset({
      blob,
      name,
      type: assetType,
      source: AssetSource.AI_GENERATED,
      mimeType,
      prompt: task.params.prompt,
      modelName: task.params.model,
    });

    console.log(`[AssetIntegration] Successfully saved asset ${asset.id} from task ${task.id}`);

    // Mark task as saved
    taskQueueService.markAsSaved(task.id);

  } catch (error) {
    // Handle errors gracefully - don't block task queue
    console.error(`[AssetIntegration] Error saving task ${task.id}:`, error);

    // Show user-friendly error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    MessagePlugin.warning(`保存到素材库失败: ${errorMessage}`);
  }
}
