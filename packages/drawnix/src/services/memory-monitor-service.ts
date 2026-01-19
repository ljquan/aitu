/**
 * Memory Monitor Service
 * 内存监控服务
 *
 * 功能：
 * 1. 周期性检查内存使用情况
 * 2. 在内存压力过大时触发清理
 * 3. 提供内存统计信息
 */

export interface MemoryStats {
  /** JS 堆已使用大小 (bytes) */
  usedJSHeapSize: number;
  /** JS 堆总大小 (bytes) */
  totalJSHeapSize: number;
  /** JS 堆大小限制 (bytes) */
  jsHeapSizeLimit: number;
  /** 使用率 (0-100) */
  usagePercent: number;
  /** 是否处于内存压力状态 */
  isUnderPressure: boolean;
  /** 格式化的内存信息 */
  formatted: {
    used: string;
    total: string;
    limit: string;
  };
}

export interface MemoryCleanupHandler {
  name: string;
  priority: number; // 数字越小优先级越高
  cleanup: () => Promise<void> | void;
}

// 内存压力阈值 (75%)
const MEMORY_PRESSURE_THRESHOLD = 0.75;

// 严重内存压力阈值 (90%)
const CRITICAL_MEMORY_THRESHOLD = 0.90;

// 检查间隔 (60 秒) - 足够长以避免性能影响
const CHECK_INTERVAL = 60000;

class MemoryMonitorService {
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupHandlers: MemoryCleanupHandler[] = [];
  private lastCleanupTime = 0;
  private cleanupCooldown = 60000; // 清理冷却时间 60 秒

  /**
   * 获取当前内存统计
   */
  getMemoryStats(): MemoryStats | null {
    // Chrome 专有 API
    const perf = performance as Performance & {
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    };

    if (!perf.memory) {
      return null;
    }

    const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = perf.memory;
    const usagePercent = (usedJSHeapSize / jsHeapSizeLimit) * 100;

    return {
      usedJSHeapSize,
      totalJSHeapSize,
      jsHeapSizeLimit,
      usagePercent,
      isUnderPressure: usagePercent > MEMORY_PRESSURE_THRESHOLD * 100,
      formatted: {
        used: this.formatBytes(usedJSHeapSize),
        total: this.formatBytes(totalJSHeapSize),
        limit: this.formatBytes(jsHeapSizeLimit),
      },
    };
  }

  /**
   * 格式化字节数
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  /**
   * 注册清理处理器
   */
  registerCleanupHandler(handler: MemoryCleanupHandler): void {
    this.cleanupHandlers.push(handler);
    // 按优先级排序
    this.cleanupHandlers.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 注销清理处理器
   */
  unregisterCleanupHandler(name: string): void {
    this.cleanupHandlers = this.cleanupHandlers.filter(h => h.name !== name);
  }

  /**
   * 触发内存清理
   */
  async triggerCleanup(force = false): Promise<void> {
    const now = Date.now();
    
    // 检查冷却时间
    if (!force && now - this.lastCleanupTime < this.cleanupCooldown) {
      console.log('[MemoryMonitor] Cleanup skipped (cooldown)');
      return;
    }

    console.log('[MemoryMonitor] Starting memory cleanup...');
    this.lastCleanupTime = now;

    const beforeStats = this.getMemoryStats();
    
    // 执行所有清理处理器
    for (const handler of this.cleanupHandlers) {
      try {
        console.log(`[MemoryMonitor] Running cleanup: ${handler.name}`);
        await handler.cleanup();
      } catch (error) {
        console.error(`[MemoryMonitor] Cleanup failed: ${handler.name}`, error);
      }
    }

    // 请求垃圾回收（如果可用）
    if (typeof (globalThis as any).gc === 'function') {
      (globalThis as any).gc();
    }

    const afterStats = this.getMemoryStats();
    if (beforeStats && afterStats) {
      const freed = beforeStats.usedJSHeapSize - afterStats.usedJSHeapSize;
      console.log(`[MemoryMonitor] Cleanup complete. Freed: ${this.formatBytes(freed)}`);
    }
  }

  /**
   * 检查内存状态并在必要时触发清理
   */
  private checkMemory(): void {
    const stats = this.getMemoryStats();
    if (!stats) return;

    // 严重内存压力：立即清理
    if (stats.usagePercent > CRITICAL_MEMORY_THRESHOLD * 100) {
      console.warn(`[MemoryMonitor] Critical memory pressure: ${stats.usagePercent.toFixed(1)}%`);
      this.triggerCleanup(true);
      return;
    }

    // 内存压力：触发清理
    if (stats.isUnderPressure) {
      console.warn(`[MemoryMonitor] Memory pressure: ${stats.usagePercent.toFixed(1)}%`);
      this.triggerCleanup();
    }
  }

  /**
   * 启动内存监控
   */
  start(): void {
    if (this.checkTimer) return;

    // 检查浏览器是否支持内存 API
    const stats = this.getMemoryStats();
    if (!stats) {
      console.log('[MemoryMonitor] Memory API not available');
      return;
    }

    console.log('[MemoryMonitor] Starting memory monitor');
    this.checkTimer = setInterval(() => this.checkMemory(), CHECK_INTERVAL);

    // 立即检查一次
    this.checkMemory();
  }

  /**
   * 停止内存监控
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      console.log('[MemoryMonitor] Memory monitor stopped');
    }
  }

  /**
   * 打印当前内存状态
   */
  logMemoryStatus(): void {
    const stats = this.getMemoryStats();
    if (!stats) {
      console.log('[MemoryMonitor] Memory API not available');
      return;
    }

    console.log('[MemoryMonitor] Memory Status:', {
      used: stats.formatted.used,
      total: stats.formatted.total,
      limit: stats.formatted.limit,
      usage: `${stats.usagePercent.toFixed(1)}%`,
      pressure: stats.isUnderPressure ? 'YES' : 'NO',
    });
  }
}

// 导出单例
export const memoryMonitorService = new MemoryMonitorService();

// 默认清理处理器：使用 requestIdleCallback 在空闲时清理
memoryMonitorService.registerCleanupHandler({
  name: 'idle-gc-hint',
  priority: 10,
  cleanup: async () => {
    // 使用 requestIdleCallback 在浏览器空闲时提示 GC
    // 不直接操作 DOM，避免性能影响
    return new Promise<void>(resolve => {
      if ('requestIdleCallback' in window) {
        (window as Window).requestIdleCallback(
          () => {
            // 空闲时浏览器可能会执行 GC
            resolve();
          },
          { timeout: 1000 }
        );
      } else {
        setTimeout(resolve, 0);
      }
    });
  },
});
