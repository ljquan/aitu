/**
 * Unified Generation Service
 *
 * 统一的 AI 生成服务入口，提供 SW 降级能力。
 * 
 * 核心设计原则：
 * 1. 降级决策只在任务提交前 - 通过 ping 检测 SW 是否可用
 * 2. 一旦提交，绝不降级 - 避免重复调用 API（会重复扣费）
 * 3. 提交失败 = 任务失败 - 用户手动重试
 *
 * 执行流程：
 * 1. 检测 SW 健康状态（ping，带缓存）
 * 2. SW 健康 → 提交到 SW 执行
 * 3. SW 不健康 → 主线程直接执行
 * 4. 提交后无论成功失败都不降级
 */

import { Task, TaskType, TaskStatus, GenerationParams, TaskExecutionPhase } from '../types/task.types';
import { swChannelClient } from './sw-channel/client';
import { swTaskQueueService } from './sw-task-queue-service';
import { generationAPIService } from './generation-api-service';
import { legacyTaskQueueService } from './task-queue';
import { generateTaskId } from '../utils/task-utils';
import { validateGenerationParams, sanitizeGenerationParams } from '../utils/validation-utils';

// ============================================================================
// Types
// ============================================================================

/** 执行模式 */
export type ExecutionMode = 'sw' | 'main_thread';

/** 生成选项 */
export interface GenerationOptions {
  /** 生成参数 */
  params: GenerationParams;
  /** 任务类型 */
  type: TaskType;
  /** 是否优先使用 SW（默认 true） */
  preferSW?: boolean;
  /** 是否启用降级（默认 true） */
  fallbackEnabled?: boolean;
}

/** 生成结果 */
export interface GenerationResult {
  /** 任务 ID */
  taskId: string;
  /** 执行模式 */
  executionMode: ExecutionMode;
  /** 任务对象 */
  task: Task;
}

// ============================================================================
// Service Implementation
// ============================================================================

class UnifiedGenerationService {
  private static instance: UnifiedGenerationService;

  /** SW 健康状态缓存 */
  private swHealthy: boolean | null = null;
  /** 上次健康检查时间 */
  private lastHealthCheck: number = 0;
  /** 健康检查缓存时间（30 秒） */
  private readonly healthCheckInterval = 30000;
  /** ping 超时时间（2 秒） */
  private readonly pingTimeout = 2000;

  /** 
   * 强制使用主线程执行（测试用）
   * 在控制台执行: window.__FORCE_MAIN_THREAD_GENERATION__ = true
   */
  private get forceMainThread(): boolean {
    return typeof window !== 'undefined' && (window as any).__FORCE_MAIN_THREAD_GENERATION__ === true;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static getInstance(): UnifiedGenerationService {
    if (!UnifiedGenerationService.instance) {
      UnifiedGenerationService.instance = new UnifiedGenerationService();
    }
    return UnifiedGenerationService.instance;
  }

  /**
   * 检测 SW 是否可用且健康
   * 
   * 检测顺序：
   * 0. 测试开关检查
   * 1. 基础检查（浏览器支持、controller 存在）
   * 2. 缓存检查（30 秒内复用）
   * 3. ping 检测（2 秒超时）
   */
  async checkSWHealth(): Promise<boolean> {
    // 0. 测试开关：强制使用主线程
    if (this.forceMainThread) {
      console.log('[UnifiedGenerationService] Force main thread mode enabled');
      this.swHealthy = false;
      return false;
    }

    // 1. 基础检查
    if (!('serviceWorker' in navigator)) {
      this.swHealthy = false;
      return false;
    }
    if (!navigator.serviceWorker.controller) {
      this.swHealthy = false;
      return false;
    }

    // 2. 使用缓存（30 秒内复用结果）
    const now = Date.now();
    if (this.swHealthy !== null && now - this.lastHealthCheck < this.healthCheckInterval) {
      return this.swHealthy;
    }

    // 3. 发送 ping 检测
    try {
      const pong = await swChannelClient.ping(this.pingTimeout);
      this.swHealthy = pong;
      this.lastHealthCheck = now;
      return pong;
    } catch {
      this.swHealthy = false;
      this.lastHealthCheck = now;
      return false;
    }
  }

  /**
   * 重置健康检查缓存
   * 用于 SW 状态变化后强制重新检测
   */
  resetHealthCache(): void {
    this.swHealthy = null;
    this.lastHealthCheck = 0;
  }

  /**
   * 统一生成入口
   * 
   * 流程：
   * 1. 检测 SW 健康状态
   * 2. SW 健康 → 提交到 SW（提交后不降级）
   * 3. SW 不健康 → 主线程直接执行
   */
  async generate(options: GenerationOptions): Promise<GenerationResult> {
    const { params, type, preferSW = true, fallbackEnabled = true } = options;

    // 参数验证
    const validation = validateGenerationParams(params, type);
    if (!validation.valid) {
      throw new Error(`参数无效: ${validation.errors.join(', ')}`);
    }

    // 检测 SW 健康状态
    const swHealthy = preferSW && await this.checkSWHealth();

    if (swHealthy) {
      // SW 可用，提交到 SW 执行
      // ⚠️ 重要：从这里开始，无论发生什么都不降级！
      // 理由：SW 可能已经收到任务并开始执行了
      try {
        const task = swTaskQueueService.createTask(params, type);
        return { 
          taskId: task.id, 
          executionMode: 'sw', 
          task: { ...task, executionMode: 'sw' } as Task & { executionMode: ExecutionMode }
        };
      } catch (error) {
        // SW 提交失败，不降级，直接抛出错误
        // 用户可以手动重试
        throw error;
      }
    } else if (fallbackEnabled) {
      // SW 不可用，主线程直接执行
      return this.executeInMainThread(params, type);
    } else {
      throw new Error('Service Worker 不可用且降级已禁用');
    }
  }

  /**
   * 主线程直接执行生成
   * 
   * 注意：这里直接调用 API，不经过 SW
   */
  private async executeInMainThread(
    params: GenerationParams,
    type: TaskType
  ): Promise<GenerationResult> {
    const taskId = generateTaskId();
    const sanitizedParams = sanitizeGenerationParams(params);
    const now = Date.now();

    // 创建本地任务（用于 UI 显示）
    const task: Task = {
      id: taskId,
      type,
      status: TaskStatus.PROCESSING,
      params: sanitizedParams,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      executionPhase: TaskExecutionPhase.SUBMITTING,
      ...(type === TaskType.VIDEO && { progress: 0 }),
    };

    // 添加到本地任务队列（用于 UI 显示）
    // 使用 restoreTasks 方法添加单个任务
    legacyTaskQueueService.restoreTasks([task]);

    try {
      // 调用主线程 API 服务
      const result = await generationAPIService.generate(taskId, sanitizedParams, type);
      
      // 更新任务状态为完成
      legacyTaskQueueService.updateTaskStatus(taskId, TaskStatus.COMPLETED, {
        result,
        completedAt: Date.now(),
      });

      const completedTask: Task = {
        ...task,
        status: TaskStatus.COMPLETED,
        result,
        completedAt: Date.now(),
        updatedAt: Date.now(),
      };

      return { 
        taskId, 
        executionMode: 'main_thread', 
        task: { ...completedTask, executionMode: 'main_thread' } as Task & { executionMode: ExecutionMode }
      };
    } catch (error: any) {
      // 更新任务状态为失败
      legacyTaskQueueService.updateTaskStatus(taskId, TaskStatus.FAILED, {
        error: {
          code: error.code || 'GENERATION_ERROR',
          message: error.message || '生成失败',
        },
        completedAt: Date.now(),
      });

      throw error;
    }
  }

  /**
   * 获取当前 SW 健康状态（不触发新检测）
   */
  getSWHealthStatus(): { healthy: boolean | null; lastCheck: number } {
    return {
      healthy: this.swHealthy,
      lastCheck: this.lastHealthCheck,
    };
  }

  /**
   * 检查 SW 是否可用（同步版本，使用缓存）
   * 用于 UI 显示，不发起网络请求
   */
  isSWAvailable(): boolean {
    // 基础检查
    if (!('serviceWorker' in navigator)) return false;
    if (!navigator.serviceWorker.controller) return false;
    
    // 如果有缓存且在有效期内，使用缓存
    if (this.swHealthy !== null && Date.now() - this.lastHealthCheck < this.healthCheckInterval) {
      return this.swHealthy;
    }
    
    // 没有缓存时，返回 true（乐观估计，实际检测在 generate 时进行）
    return true;
  }
}

// 导出单例
export const unifiedGenerationService = UnifiedGenerationService.getInstance();
