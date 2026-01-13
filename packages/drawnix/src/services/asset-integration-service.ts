/**
 * Asset Integration Service
 *
 * 素材库与任务队列的集成服务
 *
 * 注意：AI 生成的素材不再单独存储到素材库，
 * 而是直接从任务队列中读取已完成的任务。
 * 这样避免了数据重复存储。
 */

import { TaskType, type Task } from '../types/task.types';

/**
 * Generate a descriptive name for an AI-generated asset
 * 为 AI 生成的素材生成描述性名称
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
 * Initialize asset integration
 * 初始化素材集成服务
 *
 * 注意：不再需要自动保存逻辑，因为 AI 生成的素材直接从任务队列读取
 */
export function initializeAssetIntegration(): () => void {
  // console.log('[AssetIntegration] Asset integration initialized (no-op, AI assets read from task queue)');

  // Return cleanup function
  return () => {
    // console.log('[AssetIntegration] Asset integration cleanup');
  };
}
