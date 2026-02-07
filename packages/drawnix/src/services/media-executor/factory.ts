/**
 * Executor Factory
 *
 * 执行器工厂，始终使用主线程执行器。
 * SW 不再参与任务执行，仅通过 Fetch Relay 保护 API 请求不被页面关闭中断。
 */

import type { IMediaExecutor } from './types';
import { FallbackMediaExecutor, fallbackMediaExecutor } from './fallback-executor';

/**
 * 执行器工厂
 *
 * 始终返回主线程执行器。
 * getFallbackExecutor / getExecutor 返回相同实例，保持 API 兼容。
 */
class ExecutorFactory {
  private executor: FallbackMediaExecutor = fallbackMediaExecutor;

  /**
   * 获取执行器（主线程执行器）
   */
  async getExecutor(): Promise<IMediaExecutor> {
    return this.executor;
  }

  /**
   * 获取降级执行器（与 getExecutor 相同，保持 API 兼容）
   */
  getFallbackExecutor(): IMediaExecutor {
    return this.executor;
  }

  /**
   * SW 执行器已移除，返回主线程执行器
   * @deprecated 使用 getExecutor() 代替
   */
  getSWExecutor(): IMediaExecutor {
    return this.executor;
  }

  /**
   * SW 不再参与任务执行
   */
  async isSWAvailable(): Promise<boolean> {
    return false;
  }

  /**
   * 无操作（保持 API 兼容）
   */
  clearCache(): void {
    // no-op
  }

  /**
   * 始终返回 fallback 模式
   */
  async getExecutorMode(): Promise<'sw' | 'fallback'> {
    return 'fallback';
  }
}

/**
 * 执行器工厂单例
 */
export const executorFactory = new ExecutorFactory();
