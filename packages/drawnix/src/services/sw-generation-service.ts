/**
 * Service Worker 生成服务
 * 
 * 简化的 AI 图片/视频生成服务，直接通过双工通信调用 SW 执行任务
 * 
 * 核心功能：
 * 1. 提供简洁的 generateImage/generateVideo API
 * 2. 支持进度回调（SW 主动推送）
 * 3. 返回 Promise，在任务完成/失败时 resolve/reject
 */

import { swChannelClient } from './sw-channel/client';
import type { 
  TaskResult, 
  TaskError,
  GenerationParams,
  SWTask,
} from './sw-channel/types';
import { taskStorageReader } from './task-storage-reader';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 图片生成参数
 */
export interface ImageGenerationParams {
  prompt: string;
  model?: string;
  size?: string;
  width?: number;
  height?: number;
  style?: string;
  seed?: number;
  count?: number;
  batchId?: string;
  autoInsertToCanvas?: boolean;
}

/**
 * 视频生成参数
 */
export interface VideoGenerationParams {
  prompt: string;
  model?: string;
  duration?: number;
  aspectRatio?: string;
  width?: number;
  height?: number;
  autoInsertToCanvas?: boolean;
}

/**
 * 进度回调
 */
export type ProgressCallback = (progress: number, phase?: string) => void;

/**
 * 生成结果
 */
export interface GenerationResult {
  taskId: string;
  result: TaskResult;
  task?: SWTask;
}

/**
 * 待处理任务
 */
interface PendingTask {
  resolve: (result: GenerationResult) => void;
  reject: (error: Error) => void;
  onProgress?: ProgressCallback;
}

// ============================================================================
// 生成服务实现
// ============================================================================

class SWGenerationService {
  private static instance: SWGenerationService | null = null;
  
  private pendingTasks: Map<string, PendingTask> = new Map();
  private initialized = false;
  private taskIdCounter = 0;

  private constructor() {
    // 延迟初始化事件监听器
  }

  static getInstance(): SWGenerationService {
    if (!SWGenerationService.instance) {
      SWGenerationService.instance = new SWGenerationService();
    }
    return SWGenerationService.instance;
  }

  /**
   * 初始化服务（设置事件监听）
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 确保 SW 通道已初始化
    const success = await swChannelClient.initialize();
    if (!success) {
      throw new Error('Failed to initialize SW channel');
    }

    // 设置事件监听器
    this.setupEventListeners();
    this.initialized = true;
  }

  /**
   * 生成图片
   */
  async generateImage(
    params: ImageGenerationParams,
    onProgress?: ProgressCallback
  ): Promise<GenerationResult> {
    await this.initialize();

    const taskId = this.generateTaskId();
    const taskType = 'image' as const;

    return this.createAndWaitTask(taskId, taskType, {
      prompt: params.prompt,
      model: params.model,
      size: params.size,
      width: params.width,
      height: params.height,
      style: params.style,
      seed: params.seed,
      batchId: params.batchId,
      autoInsertToCanvas: params.autoInsertToCanvas,
    }, onProgress);
  }

  /**
   * 生成视频
   */
  async generateVideo(
    params: VideoGenerationParams,
    onProgress?: ProgressCallback
  ): Promise<GenerationResult> {
    await this.initialize();

    const taskId = this.generateTaskId();
    const taskType = 'video' as const;

    return this.createAndWaitTask(taskId, taskType, {
      prompt: params.prompt,
      model: params.model,
      duration: params.duration,
      aspectRatio: params.aspectRatio,
      width: params.width,
      height: params.height,
      autoInsertToCanvas: params.autoInsertToCanvas,
    }, onProgress);
  }

  /**
   * 批量生成图片
   */
  async generateImageBatch(
    params: ImageGenerationParams,
    count: number,
    onProgress?: (taskId: string, progress: number) => void
  ): Promise<GenerationResult[]> {
    await this.initialize();

    const batchId = this.generateTaskId();
    const promises: Promise<GenerationResult>[] = [];

    for (let i = 0; i < count; i++) {
      const taskId = `${batchId}_${i}`;
      const promise = this.createAndWaitTask(taskId, 'image', {
        ...params,
        batchId,
      }, onProgress ? (progress) => onProgress(taskId, progress) : undefined);
      promises.push(promise);
    }

    return Promise.all(promises);
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<void> {
    const pending = this.pendingTasks.get(taskId);
    if (pending) {
      this.pendingTasks.delete(taskId);
      pending.reject(new Error('Task cancelled'));
    }

    await swChannelClient.cancelTask(taskId);
  }

  /**
   * 获取任务状态
   */
  async getTask(taskId: string): Promise<SWTask | null> {
    const result = await swChannelClient.getTask(taskId);
    return result.task || null;
  }

  /**
   * 获取所有任务（直接从 IndexedDB 读取）
   */
  async getAllTasks(): Promise<SWTask[]> {
    try {
      if (await taskStorageReader.isAvailable()) {
        const tasks = await taskStorageReader.getAllTasks();
        return tasks as unknown as SWTask[];
      }
    } catch (error) {
      console.warn('[SWGenerationService] Failed to read from IndexedDB:', error);
    }
    
    return [];
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 创建任务并等待完成
   */
  private async createAndWaitTask(
    taskId: string,
    taskType: 'image' | 'video',
    params: GenerationParams,
    onProgress?: ProgressCallback
  ): Promise<GenerationResult> {
    return new Promise(async (resolve, reject) => {
      // 注册待处理任务
      this.pendingTasks.set(taskId, { resolve, reject, onProgress });

      try {
        // 调用 SW 创建任务
        const result = await swChannelClient.createTask({
          taskId,
          taskType,
          params,
        });

        if (!result.success) {
          this.pendingTasks.delete(taskId);
          reject(new Error(result.reason || 'Failed to create task'));
          return;
        }

        // 任务创建成功，等待 SW 推送完成/失败事件
        // 通过 setupEventListeners 中的回调处理
        // Task created, waiting for completion via events

      } catch (error) {
        this.pendingTasks.delete(taskId);
        reject(error);
      }
    });
  }

  /**
   * 设置 SW 事件监听器
   */
  private setupEventListeners(): void {
    swChannelClient.setEventHandlers({
      // 任务进度更新
      onTaskStatus: (event) => {
        const pending = this.pendingTasks.get(event.taskId);
        if (pending?.onProgress && event.progress !== undefined) {
          pending.onProgress(event.progress, event.phase);
        }
      },

      // 任务完成
      onTaskCompleted: (event) => {
        const pending = this.pendingTasks.get(event.taskId);
        if (pending) {
          this.pendingTasks.delete(event.taskId);
          pending.resolve({
            taskId: event.taskId,
            result: event.result,
          });
        }
      },

      // 任务失败
      onTaskFailed: (event) => {
        const pending = this.pendingTasks.get(event.taskId);
        if (pending) {
          this.pendingTasks.delete(event.taskId);
          const error = new Error(event.error?.message || 'Task failed');
          (error as any).code = event.error?.code;
          (error as any).details = event.error?.details;
          pending.reject(error);
        }
      },

      // 任务取消
      onTaskCancelled: (taskId) => {
        const pending = this.pendingTasks.get(taskId);
        if (pending) {
          this.pendingTasks.delete(taskId);
          pending.reject(new Error('Task cancelled'));
        }
      },
    });
  }

  /**
   * 生成唯一的任务 ID
   */
  private generateTaskId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `task_${timestamp}_${random}_${++this.taskIdCounter}`;
  }
}

// 导出单例
export const swGenerationService = SWGenerationService.getInstance();
