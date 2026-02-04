/**
 * Service Worker Media Executor
 *
 * 通过 RPC 调用 SW 中的方法执行媒体生成任务。
 * 任务在 SW 后台执行，结果写入 IndexedDB。
 */

import { swChannelClient } from '../sw-channel/client';
import type {
  IMediaExecutor,
  ImageGenerationParams,
  VideoGenerationParams,
  AIAnalyzeParams,
  AIAnalyzeResult,
  ExecutionOptions,
} from './types';

/**
 * SW 执行器 RPC 参数类型
 */
interface ExecutorRPCParams {
  taskId: string;
  type: 'image' | 'video' | 'ai_analyze';
  params: Record<string, unknown>;
}

/**
 * SW 执行器 RPC 响应类型
 */
interface ExecutorRPCResult {
  success: boolean;
  error?: string;
}

/**
 * Service Worker 媒体执行器
 *
 * 通过 RPC 将任务提交给 SW 后台执行。
 * SW 负责执行 fetch、处理响应、写入 IndexedDB。
 * 主线程通过轮询 IndexedDB 获取结果。
 */
export class SWMediaExecutor implements IMediaExecutor {
  readonly name = 'SWMediaExecutor';

  /**
   * 检查 SW 是否可用
   */
  async isAvailable(): Promise<boolean> {
    if (!('serviceWorker' in navigator)) {
      return false;
    }
    if (!navigator.serviceWorker.controller) {
      return false;
    }

    // 检查通道是否已初始化
    if (!swChannelClient.isInitialized()) {
      try {
        const initialized = await swChannelClient.initialize();
        if (!initialized) {
          return false;
        }
      } catch {
        return false;
      }
    }

    // 健康检查（带超时）
    try {
      const result = await Promise.race([
        swChannelClient.ping(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
      ]);
      return result === true;
    } catch {
      return false;
    }
  }

  /**
   * 生成图片
   */
  async generateImage(
    params: ImageGenerationParams,
    options?: ExecutionOptions
  ): Promise<void> {
    const rpcParams: ExecutorRPCParams = {
      taskId: params.taskId,
      type: 'image',
      params: {
        prompt: params.prompt,
        model: params.model,
        size: params.size,
        referenceImages: params.referenceImages,
        quality: params.quality,
        count: params.count,
      },
    };

    await this.executeViaRPC(rpcParams, options);
  }

  /**
   * 生成视频
   */
  async generateVideo(
    params: VideoGenerationParams,
    options?: ExecutionOptions
  ): Promise<void> {
    const rpcParams: ExecutorRPCParams = {
      taskId: params.taskId,
      type: 'video',
      params: {
        prompt: params.prompt,
        model: params.model,
        duration: params.duration,
        size: params.size,
        inputReference: params.inputReference,
        inputReferences: params.inputReferences,
        referenceImages: params.referenceImages,
      },
    };

    await this.executeViaRPC(rpcParams, options);
  }

  /**
   * AI 分析
   *
   * 注意：SW 执行器的 addSteps 由 SW 端的 workflow executor 处理，
   * 主线程不需要等待返回值。返回空结果仅用于保持接口一致。
   */
  async aiAnalyze(
    params: AIAnalyzeParams,
    options?: ExecutionOptions
  ): Promise<AIAnalyzeResult> {
    const rpcParams: ExecutorRPCParams = {
      taskId: params.taskId,
      type: 'ai_analyze',
      params: {
        prompt: params.prompt,
        images: params.images,
        model: params.model,
        systemPrompt: params.systemPrompt,
      },
    };

    await this.executeViaRPC(rpcParams, options);

    // SW 执行器的 addSteps 由 SW 端处理，主线程不需要
    return {};
  }

  /**
   * 通过 RPC 执行任务
   *
   * 调用 SW 的 executor:execute 方法，SW 会：
   * 1. 更新任务状态为 processing
   * 2. 执行 fetch
   * 3. 处理响应
   * 4. 写入结果到 IndexedDB
   *
   * 此方法立即返回，不等待任务完成。
   * 调用方应通过轮询 IndexedDB 获取结果。
   */
  private async executeViaRPC(
    params: ExecutorRPCParams,
    _options?: ExecutionOptions
  ): Promise<void> {
    if (!swChannelClient.isInitialized()) {
      throw new Error('SW channel not initialized');
    }

    // 调用 SW 的执行方法
    // 注意：这里使用 fire-and-forget 模式，RPC 立即返回
    // SW 在后台执行任务，结果写入 IndexedDB
    const result = await swChannelClient.callExecutor(params);

    if (!result.success) {
      throw new Error(result.error || 'Executor RPC failed');
    }
  }
}

/**
 * SW 执行器单例
 */
export const swMediaExecutor = new SWMediaExecutor();
