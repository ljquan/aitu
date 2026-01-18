/**
 * Crash Logger - 崩溃日志记录系统
 * 
 * 在页面崩溃前记录关键状态信息，持久化到 SW/IndexedDB，
 * 便于用户在 sw-debug.html 导出分析。
 * 
 * 功能：
 * 1. 页面启动时记录初始快照
 * 2. 定期内存快照（仅在内存使用较高时）
 * 3. 全局错误捕获
 * 4. beforeunload 事件记录最后状态
 */

// ==================== 类型定义 ====================

export interface CrashSnapshot {
  id: string;
  timestamp: number;
  type: 'startup' | 'periodic' | 'error' | 'beforeunload';
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  // 页面状态分析（仅在连续高内存时收集）
  pageStats?: {
    // DOM 统计
    domNodeCount: number;
    canvasCount: number;
    imageCount: number;
    videoCount: number;
    iframeCount: number;
    // 事件监听器（仅 Chrome）
    eventListenerCount?: number;
    // 定时器
    // 画布相关
    plaitBoardExists: boolean;
    plaitElementCount?: number;
  };
  userAgent: string;
  url: string;
  error?: {
    message: string;
    stack?: string;
    type: string;
  };
  customData?: Record<string, unknown>;
}

// ==================== 配置常量 ====================

/** 定期快照间隔（毫秒）- 降低频率减少开销 */
const PERIODIC_SNAPSHOT_INTERVAL = 30000; // 30 秒

/** 内存使用阈值（MB），超过此值才记录定期快照 */
const MEMORY_THRESHOLD_MB = 800; // 提高阈值，减少不必要的日志

/** 内存使用比例阈值，超过此比例才记录定期快照 */
const MEMORY_RATIO_THRESHOLD = 0.6; // 60%

/** 连续高内存次数阈值，超过才收集详细页面统计 */
const HIGH_MEMORY_COUNT_FOR_DETAILS = 3;

/** localStorage 中保存最后快照的 key */
const LAST_SNAPSHOT_KEY = 'aitu_last_snapshot';

/** 操作监控：内存变化超过此阈值才记录（MB） */
const OPERATION_MEMORY_DELTA_THRESHOLD = 50;

// ==================== 内部状态 ====================

let snapshotInterval: number | null = null;
let initialized = false;

// ==================== 操作监控 API ====================

/**
 * 轻量级操作监控
 * 只在操作导致内存变化超过阈值时才记录日志
 * 
 * @example
 * const end = trackOperation('图片合并');
 * await mergeImages();
 * end(); // 只在内存变化 > 50MB 时输出日志
 */
export function trackOperation(label: string): () => void {
  const startMem = getMemoryInfo();
  const startTime = Date.now();
  
  return () => {
    const endMem = getMemoryInfo();
    if (!startMem || !endMem) return;
    
    const deltaMB = (endMem.usedJSHeapSize - startMem.usedJSHeapSize) / (1024 * 1024);
    const duration = Date.now() - startTime;
    
    // 只在内存变化超过阈值时记录
    if (Math.abs(deltaMB) >= OPERATION_MEMORY_DELTA_THRESHOLD) {
      const sign = deltaMB >= 0 ? '+' : '';
      console.warn(
        `[MemoryLog] ${label}: ${sign}${deltaMB.toFixed(0)} MB (${duration}ms)`
      );
    }
  };
}

/**
 * 异步操作监控包装器
 * 
 * @example
 * const result = await withMemoryTracking('AI生成', async () => {
 *   return await generateImage(params);
 * });
 */
export async function withMemoryTracking<T>(
  label: string,
  operation: () => Promise<T>
): Promise<T> {
  const end = trackOperation(label);
  try {
    return await operation();
  } finally {
    end();
  }
}

// ==================== 工具函数 ====================

/**
 * 获取当前内存信息（Chrome 专有）
 */
function getMemoryInfo(): CrashSnapshot['memory'] | undefined {
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    const mem = (performance as any).memory;
    return {
      usedJSHeapSize: mem.usedJSHeapSize,
      totalJSHeapSize: mem.totalJSHeapSize,
      jsHeapSizeLimit: mem.jsHeapSizeLimit,
    };
  }
  return undefined;
}

/**
 * 格式化内存大小为 MB
 */
function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2);
}

/** 页面统计信息类型（非空） */
interface PageStats {
  domNodeCount: number;
  canvasCount: number;
  imageCount: number;
  videoCount: number;
  iframeCount: number;
  plaitBoardExists: boolean;
  plaitElementCount?: number;
  eventListenerCount?: number;
}

/**
 * 收集页面状态统计信息
 * 用于分析内存占用的具体来源
 */
function collectPageStats(): PageStats {
  try {
    const stats: PageStats = {
      domNodeCount: document.getElementsByTagName('*').length,
      canvasCount: document.getElementsByTagName('canvas').length,
      imageCount: document.getElementsByTagName('img').length,
      videoCount: document.getElementsByTagName('video').length,
      iframeCount: document.getElementsByTagName('iframe').length,
      plaitBoardExists: !!document.querySelector('.plait-board-container'),
    };

    // 尝试获取 Plait 元素数量
    const boardContainer = document.querySelector('.plait-board-container');
    if (boardContainer) {
      // SVG 中的 g 元素通常代表画布元素
      const svgGroups = boardContainer.querySelectorAll('svg > g > g');
      stats.plaitElementCount = svgGroups.length;
    }

    // Chrome DevTools 特有的 API（仅开发时可用）
    if (typeof (window as any).getEventListeners === 'function') {
      // 这个 API 仅在 DevTools 控制台中可用，正常代码无法调用
      // 留作参考
    }

    return stats;
  } catch {
    return {
      domNodeCount: 0,
      canvasCount: 0,
      imageCount: 0,
      videoCount: 0,
      iframeCount: 0,
      plaitBoardExists: false,
    };
  }
}

/**
 * 格式化页面统计信息为可读字符串
 */
function formatPageStats(stats: PageStats): string {
  const parts = [
    `DOM:${stats.domNodeCount}`,
    `Canvas:${stats.canvasCount}`,
    `Img:${stats.imageCount}`,
    `Video:${stats.videoCount}`,
  ];
  
  if (stats.plaitElementCount !== undefined) {
    parts.push(`Plait元素:${stats.plaitElementCount}`);
  }
  
  return parts.join(' | ');
}

/**
 * 发送快照到 Service Worker 持久化
 */
function sendSnapshotToSW(snapshot: CrashSnapshot): void {
  try {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CRASH_SNAPSHOT',
        snapshot,
      });
    }
  } catch (error) {
    // 忽略发送错误，避免影响主流程
    console.warn('[MemoryLog] Failed to send snapshot to SW:', error);
  }
}

/**
 * 保存快照到 localStorage（作为 beforeunload 的备份）
 */
function saveSnapshotToLocalStorage(snapshot: CrashSnapshot): void {
  try {
    localStorage.setItem(LAST_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // 忽略存储错误
  }
}

/**
 * 从 localStorage 读取上次的快照
 */
export function getLastSnapshotFromLocalStorage(): CrashSnapshot | null {
  try {
    const data = localStorage.getItem(LAST_SNAPSHOT_KEY);
    if (data) {
      return JSON.parse(data) as CrashSnapshot;
    }
  } catch {
    // 忽略解析错误
  }
  return null;
}

/**
 * 清除 localStorage 中的快照
 */
export function clearLastSnapshotFromLocalStorage(): void {
  try {
    localStorage.removeItem(LAST_SNAPSHOT_KEY);
  } catch {
    // 忽略删除错误
  }
}

// ==================== 核心功能 ====================

/**
 * 记录启动快照
 * 优化：启动时不收集 pageStats（此时内存通常较低，无需详细信息）
 */
export function recordStartupSnapshot(): void {
  const snapshot: CrashSnapshot = {
    id: `startup-${Date.now()}`,
    timestamp: Date.now(),
    type: 'startup',
    userAgent: navigator.userAgent,
    url: location.href,
    memory: getMemoryInfo(),
    // 启动时不收集 pageStats 和 storage，减少初始化开销
    // 注：storage.estimate() 返回的是浏览器配额，不是实际磁盘空间，意义不大
  };

  sendSnapshotToSW(snapshot);
}

/**
 * 开始定期内存快照
 * 优化策略：
 * 1. 只在内存超过阈值时才记录
 * 2. 只有连续多次高内存才收集详细页面统计（避免 DOM 查询开销）
 * 3. 日志精简，减少控制台输出
 */
export function startPeriodicSnapshots(): void {
  if (snapshotInterval !== null) {
    return; // 已经在运行
  }

  // 追踪状态
  let lastUsedMB = 0;
  let highMemoryCount = 0; // 连续高内存次数

  snapshotInterval = window.setInterval(() => {
    const memory = getMemoryInfo();
    if (!memory) return;

    const usedMB = memory.usedJSHeapSize / (1024 * 1024);
    const limitMB = memory.jsHeapSizeLimit / (1024 * 1024);
    const ratio = usedMB / limitMB;

    // 检查是否超过阈值
    const isHighMemory = usedMB > MEMORY_THRESHOLD_MB || ratio > MEMORY_RATIO_THRESHOLD;
    
    if (isHighMemory) {
      highMemoryCount++;
      
      // 只有连续多次高内存才收集详细信息（减少 DOM 查询开销）
      const shouldCollectDetails = highMemoryCount >= HIGH_MEMORY_COUNT_FOR_DETAILS;
      const pageStats = shouldCollectDetails ? collectPageStats() : undefined;
      
      const snapshot: CrashSnapshot = {
        id: `periodic-${Date.now()}`,
        timestamp: Date.now(),
        type: 'periodic',
        memory,
        pageStats,
        userAgent: navigator.userAgent,
        url: location.href,
      };

      sendSnapshotToSW(snapshot);
      
      // 精简日志：只在首次和有详细信息时输出
      if (highMemoryCount === 1 || shouldCollectDetails) {
        const deltaStr = lastUsedMB > 0 ? ` (${usedMB > lastUsedMB ? '+' : ''}${(usedMB - lastUsedMB).toFixed(0)} MB)` : '';
        const statsStr = pageStats ? ` | ${formatPageStats(pageStats)}` : '';
        console.warn(`[MemoryLog] High memory: ${usedMB.toFixed(0)} MB${deltaStr}${statsStr}`);
      }
    } else {
      // 内存恢复正常，重置计数
      highMemoryCount = 0;
    }

    lastUsedMB = usedMB;
  }, PERIODIC_SNAPSHOT_INTERVAL);
}

/**
 * 停止定期快照
 */
export function stopPeriodicSnapshots(): void {
  if (snapshotInterval !== null) {
    window.clearInterval(snapshotInterval);
    snapshotInterval = null;
  }
}

/**
 * 设置全局错误捕获
 */
export function setupErrorCapture(): void {
  // JavaScript 未捕获错误
  window.addEventListener('error', (event) => {
    const snapshot: CrashSnapshot = {
      id: `error-${Date.now()}`,
      timestamp: Date.now(),
      type: 'error',
      error: {
        message: event.message || 'Unknown error',
        stack: event.error?.stack,
        type: 'uncaughtError',
      },
      memory: getMemoryInfo(),
      userAgent: navigator.userAgent,
      url: location.href,
    };

    sendSnapshotToSW(snapshot);
    console.error('[MemoryLog] Uncaught error captured:', event.message);
  });

  // 未处理的 Promise rejection
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const snapshot: CrashSnapshot = {
      id: `rejection-${Date.now()}`,
      timestamp: Date.now(),
      type: 'error',
      error: {
        message: reason?.message || String(reason) || 'Unhandled Promise rejection',
        stack: reason?.stack,
        type: 'unhandledRejection',
      },
      memory: getMemoryInfo(),
      userAgent: navigator.userAgent,
      url: location.href,
    };

    sendSnapshotToSW(snapshot);
    console.error('[MemoryLog] Unhandled rejection captured:', reason);
  });

  // 页面即将关闭/崩溃 - 最后的机会记录状态
  window.addEventListener('beforeunload', () => {
    const memory = getMemoryInfo();
    if (memory) {
      const snapshot: CrashSnapshot = {
        id: `beforeunload-${Date.now()}`,
        timestamp: Date.now(),
        type: 'beforeunload',
        memory,
        userAgent: navigator.userAgent,
        url: location.href,
      };

      // 同时保存到 localStorage 和发送到 SW
      // localStorage 作为备份，因为 postMessage 可能不可靠
      saveSnapshotToLocalStorage(snapshot);
      sendSnapshotToSW(snapshot);
    }
  });
}

/**
 * 手动记录自定义快照
 * 用于在关键操作时记录状态
 */
export function recordCustomSnapshot(label: string, customData?: Record<string, unknown>): void {
  const snapshot: CrashSnapshot = {
    id: `custom-${label}-${Date.now()}`,
    timestamp: Date.now(),
    type: 'periodic', // 使用 periodic 类型，便于统一处理
    memory: getMemoryInfo(),
    userAgent: navigator.userAgent,
    url: location.href,
    customData: {
      label,
      ...customData,
    },
  };

  sendSnapshotToSW(snapshot);
}

/**
 * 暴露调试工具到 window 对象
 * 这些工具只在用户主动调用时才执行，不会自动运行
 */
function exposeDebugTools(): void {
  if (typeof window === 'undefined') return;

  (window as any).__memoryLog = {
    // 获取当前内存快照（轻量级）
    getMemory: () => {
      const mem = getMemoryInfo();
      if (!mem) return null;
      return {
        usedMB: (mem.usedJSHeapSize / 1024 / 1024).toFixed(1),
        limitMB: (mem.jsHeapSizeLimit / 1024 / 1024).toFixed(0),
        percent: ((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100).toFixed(1),
      };
    },
    
    // 操作追踪（供代码调用）
    track: trackOperation,
    
    // 完整诊断（会触发 DOM 查询，仅手动调用）
    diagnose: () => {
      const mem = getMemoryInfo();
      const stats = collectPageStats();
      
      console.group('[MemoryLog] 内存诊断');
      
      if (mem) {
        const usedMB = mem.usedJSHeapSize / (1024 * 1024);
        const limitMB = mem.jsHeapSizeLimit / (1024 * 1024);
        const percent = (usedMB / limitMB) * 100;
        console.log(`内存: ${usedMB.toFixed(0)} MB / ${limitMB.toFixed(0)} MB (${percent.toFixed(1)}%)`);
      }
      
      console.log(`页面: DOM ${stats.domNodeCount} | Canvas ${stats.canvasCount} | Img ${stats.imageCount} | Video ${stats.videoCount}`);
      
      if (stats.plaitElementCount !== undefined) {
        console.log(`Plait 元素: ${stats.plaitElementCount}`);
      }
      
      // 简化的建议
      if (stats.imageCount > 50) console.warn('图片较多，考虑懒加载');
      if (stats.domNodeCount > 5000) console.warn('DOM 节点较多');
      
      console.groupEnd();
      return { memory: mem, pageStats: stats };
    },
    
    // 手动记录快照到 SW
    snapshot: () => {
      const snapshot: CrashSnapshot = {
        id: `manual-${Date.now()}`,
        timestamp: Date.now(),
        type: 'periodic',
        memory: getMemoryInfo(),
        pageStats: collectPageStats(),
        userAgent: navigator.userAgent,
        url: location.href,
      };
      sendSnapshotToSW(snapshot);
      console.log('[MemoryLog] 快照已保存');
    },
  };
}

/**
 * 初始化崩溃日志系统
 * 在应用入口处调用
 */
export function initCrashLogger(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  // 1. 记录启动快照
  recordStartupSnapshot();

  // 2. 设置错误捕获
  setupErrorCapture();

  // 3. 开始定期快照
  startPeriodicSnapshots();

  // 4. 暴露调试工具
  exposeDebugTools();

  // 5. 检查并发送上次的 localStorage 快照（如果存在）
  const lastSnapshot = getLastSnapshotFromLocalStorage();
  if (lastSnapshot) {
    // 添加标记表示这是恢复的快照
    lastSnapshot.customData = {
      ...lastSnapshot.customData,
      recovered: true,
      recoveredAt: Date.now(),
    };
    sendSnapshotToSW(lastSnapshot);
    clearLastSnapshotFromLocalStorage();
    console.log('[MemoryLog] Recovered and sent last snapshot from localStorage');
  }

  console.log('[MemoryLog] Initialized. Use __memoryLog.diagnose() for details');
}
