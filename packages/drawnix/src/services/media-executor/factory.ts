/**
 * Executor Factory
 *
 * 执行器工厂，自动选择 SW 执行器或降级执行器。
 */

import type { IMediaExecutor } from './types';
import { SWMediaExecutor, swMediaExecutor } from './sw-executor';
import { FallbackMediaExecutor, fallbackMediaExecutor } from './fallback-executor';

/**
 * 执行器工厂
 *
 * 自动检测 SW 可用性，返回合适的执行器。
 * - SW 可用：返回 SW 执行器（后台执行，页面刷新不中断）
 * - SW 不可用：返回降级执行器（主线程执行，页面刷新中断）
 */
class ExecutorFactory {
  private swExecutor: SWMediaExecutor = swMediaExecutor;
  private fallbackExecutor: FallbackMediaExecutor = fallbackMediaExecutor;

  // 缓存 SW 可用性检测结果
  private swAvailable: boolean | null = null;
  private lastCheck: number = 0;
  private readonly checkInterval = 30000; // 30 秒缓存

  /**
   * 获取执行器
   *
   * 自动检测 SW 可用性并返回合适的执行器。
   */
  async getExecutor(): Promise<IMediaExecutor> {
    const swAvailable = await this.isSWAvailable();
    if (swAvailable) {
      return this.swExecutor;
    }
    return this.fallbackExecutor;
  }

  /**
   * 强制使用降级执行器
   *
   * 用于调试或测试降级模式。
   */
  getFallbackExecutor(): IMediaExecutor {
    return this.fallbackExecutor;
  }

  /**
   * 强制使用 SW 执行器
   *
   * 注意：如果 SW 不可用，调用会失败。
   */
  getSWExecutor(): IMediaExecutor {
    return this.swExecutor;
  }

  /**
   * 检测 SW 是否可用
   */
  async isSWAvailable(): Promise<boolean> {
    const now = Date.now();

    // 使用缓存
    if (this.swAvailable !== null && now - this.lastCheck < this.checkInterval) {
      return this.swAvailable;
    }

    // 重新检测
    try {
      this.swAvailable = await this.swExecutor.isAvailable();
      this.lastCheck = now;
      return this.swAvailable;
    } catch {
      this.swAvailable = false;
      this.lastCheck = now;
      return false;
    }
  }

  /**
   * 清除缓存，强制下次重新检测
   */
  clearCache(): void {
    this.swAvailable = null;
    this.lastCheck = 0;
  }

  /**
   * 获取当前执行模式
   */
  async getExecutorMode(): Promise<'sw' | 'fallback'> {
    const swAvailable = await this.isSWAvailable();
    return swAvailable ? 'sw' : 'fallback';
  }
}

/**
 * 执行器工厂单例
 */
export const executorFactory = new ExecutorFactory();
