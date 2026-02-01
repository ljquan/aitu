/**
 * Crash Recovery Service
 * 崩溃恢复服务
 *
 * 功能：
 * 1. 检测页面是否因内存不足等原因崩溃
 * 2. 提供安全模式选项，让用户可以创建空白画布规避问题
 * 3. 记录崩溃历史，帮助诊断问题
 */

const STORAGE_KEYS = {
  /** 页面加载状态标记 */
  LOADING_STATE: 'aitu_page_loading_state',
  /** 崩溃计数器 */
  CRASH_COUNT: 'aitu_crash_count',
  /** 上次成功加载时间 */
  LAST_SUCCESS_LOAD: 'aitu_last_success_load',
  /** 安全模式标记 */
  SAFE_MODE: 'aitu_safe_mode',
  /** 崩溃历史 */
  CRASH_HISTORY: 'aitu_crash_history',
};

export interface CrashInfo {
  timestamp: number;
  url: string;
  memoryStats?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  } | null;
}

export interface CrashRecoveryState {
  /** 是否检测到崩溃 */
  crashDetected: boolean;
  /** 连续崩溃次数 */
  crashCount: number;
  /** 是否处于安全模式 */
  isSafeMode: boolean;
  /** 崩溃历史 */
  crashHistory: CrashInfo[];
}

class CrashRecoveryService {
  private state: CrashRecoveryState = {
    crashDetected: false,
    crashCount: 0,
    isSafeMode: false,
    crashHistory: [],
  };

  /**
   * 在页面最早期调用，标记页面开始加载
   * 应该在 main.tsx 中尽早调用
   */
  markLoadingStart(): void {
    try {
      // 检查上次是否崩溃
      const lastState = localStorage.getItem(STORAGE_KEYS.LOADING_STATE);
      
      if (lastState === 'loading') {
        // 上次页面没有正常加载完成，可能是崩溃了
        this.state.crashDetected = true;
        this.incrementCrashCount();
        this.recordCrash();
      }

      // 标记当前页面正在加载
      localStorage.setItem(STORAGE_KEYS.LOADING_STATE, 'loading');

      // 检查是否处于安全模式
      this.state.isSafeMode = localStorage.getItem(STORAGE_KEYS.SAFE_MODE) === 'true';

      // 加载崩溃历史
      this.loadCrashHistory();
    } catch (e) {
      // localStorage 可能不可用，忽略错误
      console.warn('[CrashRecovery] Failed to mark loading start:', e);
    }
  }

  /**
   * 页面完全加载后调用，清除加载标记
   */
  markLoadingComplete(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.LOADING_STATE, 'complete');
      localStorage.setItem(STORAGE_KEYS.LAST_SUCCESS_LOAD, Date.now().toString());
      
      // 成功加载后重置崩溃计数
      if (!this.state.isSafeMode) {
        localStorage.setItem(STORAGE_KEYS.CRASH_COUNT, '0');
        this.state.crashCount = 0;
      }
    } catch (e) {
      console.warn('[CrashRecovery] Failed to mark loading complete:', e);
    }
  }

  /**
   * 增加崩溃计数
   */
  private incrementCrashCount(): void {
    try {
      const count = parseInt(localStorage.getItem(STORAGE_KEYS.CRASH_COUNT) || '0', 10);
      this.state.crashCount = count + 1;
      localStorage.setItem(STORAGE_KEYS.CRASH_COUNT, this.state.crashCount.toString());
    } catch (e) {
      // 忽略
    }
  }

  /**
   * 记录崩溃信息
   */
  private recordCrash(): void {
    try {
      const perf = performance as Performance & {
        memory?: {
          usedJSHeapSize: number;
          totalJSHeapSize: number;
          jsHeapSizeLimit: number;
        };
      };

      const crashInfo: CrashInfo = {
        timestamp: Date.now(),
        url: window.location.href,
        memoryStats: perf.memory ? {
          usedJSHeapSize: perf.memory.usedJSHeapSize,
          totalJSHeapSize: perf.memory.totalJSHeapSize,
          jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
        } : null,
      };

      this.state.crashHistory.unshift(crashInfo);
      // 只保留最近 10 次崩溃记录
      this.state.crashHistory = this.state.crashHistory.slice(0, 10);
      this.saveCrashHistory();
    } catch (e) {
      // 忽略
    }
  }

  /**
   * 加载崩溃历史
   */
  private loadCrashHistory(): void {
    try {
      const history = localStorage.getItem(STORAGE_KEYS.CRASH_HISTORY);
      if (history) {
        this.state.crashHistory = JSON.parse(history);
      }
    } catch (e) {
      this.state.crashHistory = [];
    }
  }

  /**
   * 保存崩溃历史
   */
  private saveCrashHistory(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CRASH_HISTORY, JSON.stringify(this.state.crashHistory));
    } catch (e) {
      // 忽略
    }
  }

  /**
   * 获取当前状态
   */
  getState(): CrashRecoveryState {
    return { ...this.state };
  }

  /**
   * 是否检测到崩溃
   */
  isCrashDetected(): boolean {
    return this.state.crashDetected;
  }

  /**
   * 获取崩溃次数
   */
  getCrashCount(): number {
    return this.state.crashCount;
  }

  /**
   * 是否处于安全模式
   */
  isSafeMode(): boolean {
    return this.state.isSafeMode;
  }

  /**
   * 是否应该显示安全模式提示
   * 连续崩溃 2 次或以上时显示
   */
  shouldShowSafeModePrompt(): boolean {
    return this.state.crashDetected && this.state.crashCount >= 2;
  }

  /**
   * 启用安全模式
   */
  enableSafeMode(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SAFE_MODE, 'true');
      this.state.isSafeMode = true;
    } catch (e) {
      // 忽略
    }
  }

  /**
   * 禁用安全模式
   */
  disableSafeMode(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.SAFE_MODE);
      this.state.isSafeMode = false;
      // 重置崩溃计数
      localStorage.setItem(STORAGE_KEYS.CRASH_COUNT, '0');
      this.state.crashCount = 0;
    } catch (e) {
      // 忽略
    }
  }

  /**
   * 清除崩溃记录（用户手动忽略崩溃提示时调用）
   */
  clearCrashState(): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CRASH_COUNT, '0');
      this.state.crashCount = 0;
      this.state.crashDetected = false;
    } catch (e) {
      // 忽略
    }
  }

  /**
   * 检查 URL 参数是否请求安全模式
   * 支持 ?safe=1 或 ?safe_mode=1
   */
  checkUrlSafeMode(): boolean {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('safe') === '1' || params.get('safe_mode') === '1') {
        this.enableSafeMode();
        return true;
      }
    } catch (e) {
      // 忽略
    }
    return false;
  }

  /**
   * 获取内存使用信息（如果可用）
   */
  getMemoryInfo(): { used: string; limit: string; percent: number } | null {
    try {
      const perf = performance as Performance & {
        memory?: {
          usedJSHeapSize: number;
          totalJSHeapSize: number;
          jsHeapSizeLimit: number;
        };
      };

      if (!perf.memory) return null;

      const formatBytes = (bytes: number): string => {
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
      };

      return {
        used: formatBytes(perf.memory.usedJSHeapSize),
        limit: formatBytes(perf.memory.jsHeapSizeLimit),
        percent: (perf.memory.usedJSHeapSize / perf.memory.jsHeapSizeLimit) * 100,
      };
    } catch (e) {
      return null;
    }
  }
}

// 导出单例
export const crashRecoveryService = new CrashRecoveryService();
