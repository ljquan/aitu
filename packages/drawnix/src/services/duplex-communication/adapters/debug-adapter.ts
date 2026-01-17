/**
 * Debug Panel Adapter
 * 
 * 集成调试面板的双工通讯日志记录功能
 */

import {
  DuplexMessage,
  MessageMode,
  MessageStats,
  PerformanceMetrics,
} from '../core/types';
import { DuplexClient } from '../core/client';
import { DuplexServer } from '../core/server';

// ============================================================================
// 调试日志条目接口
// ============================================================================

export interface DebugLogEntry {
  /** 日志唯一ID */
  id: string;
  
  /** 时间戳 */
  timestamp: number;
  
  /** 消息方向 */
  direction: 'send' | 'receive';
  
  /** 消息类型 */
  messageType: string;
  
  /** 消息模式 */
  messageMode: MessageMode;
  
  /** 消息数据 */
  data?: unknown;
  
  /** 响应数据 (如果是请求-响应) */
  response?: unknown;
  
  /** 错误信息 */
  error?: string;
  
  /** 处理时长 (毫秒) */
  duration?: number;
  
  /** 客户端ID */
  clientId?: string;
  
  /** 消息大小 (字节) */
  size?: number;
  
  /** 元数据 */
  metadata?: {
    source?: string;
    tags?: string[];
    priority?: string;
    [key: string]: unknown;
  };
}

// ============================================================================
// 调试面板接口
// ============================================================================

export interface DebugPanelInterface {
  /** 记录消息日志 */
  logMessage(entry: DebugLogEntry): void;
  
  /** 更新统计信息 */
  updateStats(stats: MessageStats): void;
  
  /** 更新性能指标 */
  updatePerformanceMetrics(metrics: PerformanceMetrics): void;
  
  /** 清空日志 */
  clearLogs(): void;
  
  /** 导出日志 */
  exportLogs(): string;
}

// ============================================================================
// 调试适配器类
// ============================================================================

export class DebugAdapter {
  private logEntries: DebugLogEntry[] = [];
  private maxLogEntries = 1000;
  private logIdCounter = 0;
  private debugPanel?: DebugPanelInterface;
  
  // 请求-响应关联映射
  private requestResponseMap = new Map<string, {
    entry: DebugLogEntry;
    startTime: number;
  }>();

  constructor(options: {
    maxLogEntries?: number;
    debugPanel?: DebugPanelInterface;
  } = {}) {
    if (options.maxLogEntries) {
      this.maxLogEntries = options.maxLogEntries;
    }
    if (options.debugPanel) {
      this.debugPanel = options.debugPanel;
    }
  }

  /**
   * 设置调试面板接口
   */
  setDebugPanel(debugPanel: DebugPanelInterface): void {
    this.debugPanel = debugPanel;
  }

  /**
   * 记录消息日志
   */
  logMessage(
    message: DuplexMessage,
    direction: 'send' | 'receive',
    clientId?: string,
    error?: string,
    response?: unknown
  ): void {
    const entry: DebugLogEntry = {
      id: `duplex-${Date.now()}-${++this.logIdCounter}`,
      timestamp: message.timestamp || Date.now(),
      direction,
      messageType: message.type,
      messageMode: message.mode,
      data: this.sanitizeData(message.data),
      error,
      response: this.sanitizeData(response),
      clientId,
      size: this.calculateMessageSize(message),
      metadata: {
        source: message.metadata?.source,
        tags: message.metadata?.tags,
        priority: message.priority?.toString(),
        messageId: message.id,
      },
    };

    // 处理请求-响应关联
    this.handleRequestResponseCorrelation(message, entry);

    // 添加到日志列表
    this.addLogEntry(entry);

    // 发送到调试面板
    if (this.debugPanel) {
      this.debugPanel.logMessage(entry);
    }
  }

  /**
   * 获取所有日志条目
   */
  getLogEntries(): DebugLogEntry[] {
    return [...this.logEntries];
  }

  /**
   * 获取过滤后的日志条目
   */
  getFilteredLogEntries(filter: {
    direction?: 'send' | 'receive';
    messageType?: string;
    messageMode?: MessageMode;
    clientId?: string;
    timeRange?: { start: number; end: number };
    hasError?: boolean;
  }): DebugLogEntry[] {
    return this.logEntries.filter(entry => {
      if (filter.direction && entry.direction !== filter.direction) {
        return false;
      }
      if (filter.messageType && entry.messageType !== filter.messageType) {
        return false;
      }
      if (filter.messageMode && entry.messageMode !== filter.messageMode) {
        return false;
      }
      if (filter.clientId && entry.clientId !== filter.clientId) {
        return false;
      }
      if (filter.timeRange) {
        if (entry.timestamp < filter.timeRange.start || entry.timestamp > filter.timeRange.end) {
          return false;
        }
      }
      if (filter.hasError !== undefined) {
        const hasError = !!entry.error;
        if (hasError !== filter.hasError) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * 清空日志
   */
  clearLogs(): void {
    this.logEntries.length = 0;
    this.requestResponseMap.clear();
    this.logIdCounter = 0;
    
    if (this.debugPanel) {
      this.debugPanel.clearLogs();
    }
  }

  /**
   * 导出日志为 JSON
   */
  exportLogsAsJson(): string {
    const exportData = {
      timestamp: Date.now(),
      totalEntries: this.logEntries.length,
      entries: this.logEntries,
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 导出日志为 CSV
   */
  exportLogsAsCsv(): string {
    const headers = [
      'ID',
      'Timestamp',
      'Direction',
      'Message Type',
      'Message Mode',
      'Client ID',
      'Duration (ms)',
      'Size (bytes)',
      'Has Error',
      'Source',
      'Tags',
    ];
    
    const rows = this.logEntries.map(entry => [
      entry.id,
      new Date(entry.timestamp).toISOString(),
      entry.direction,
      entry.messageType,
      entry.messageMode,
      entry.clientId || '',
      entry.duration?.toString() || '',
      entry.size?.toString() || '',
      entry.error ? 'Yes' : 'No',
      entry.metadata?.source || '',
      entry.metadata?.tags?.join(';') || '',
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    
    return csvContent;
  }

  /**
   * 获取日志统计信息
   */
  getLogStats(): {
    totalMessages: number;
    byDirection: Record<'send' | 'receive', number>;
    byMode: Record<MessageMode, number>;
    byType: Record<string, number>;
    errorCount: number;
    averageDuration: number;
    totalSize: number;
  } {
    const stats = {
      totalMessages: this.logEntries.length,
      byDirection: { send: 0, receive: 0 },
      byMode: {
        [MessageMode.REQUEST]: 0,
        [MessageMode.RESPONSE]: 0,
        [MessageMode.PUSH]: 0,
      },
      byType: {} as Record<string, number>,
      errorCount: 0,
      averageDuration: 0,
      totalSize: 0,
    };
    
    let totalDuration = 0;
    let durationCount = 0;
    
    for (const entry of this.logEntries) {
      // 按方向统计
      stats.byDirection[entry.direction]++;
      
      // 按模式统计
      stats.byMode[entry.messageMode]++;
      
      // 按类型统计
      if (!stats.byType[entry.messageType]) {
        stats.byType[entry.messageType] = 0;
      }
      stats.byType[entry.messageType]++;
      
      // 错误统计
      if (entry.error) {
        stats.errorCount++;
      }
      
      // 持续时间统计
      if (entry.duration !== undefined) {
        totalDuration += entry.duration;
        durationCount++;
      }
      
      // 大小统计
      if (entry.size !== undefined) {
        stats.totalSize += entry.size;
      }
    }
    
    // 计算平均持续时间
    if (durationCount > 0) {
      stats.averageDuration = totalDuration / durationCount;
    }
    
    return stats;
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 添加日志条目
   */
  private addLogEntry(entry: DebugLogEntry): void {
    this.logEntries.push(entry);
    
    // 限制日志数量
    if (this.logEntries.length > this.maxLogEntries) {
      const removed = this.logEntries.shift();
      if (removed) {
        // 清理请求-响应映射
        this.requestResponseMap.delete(removed.id);
      }
    }
  }

  /**
   * 处理请求-响应关联
   */
  private handleRequestResponseCorrelation(
    message: DuplexMessage,
    entry: DebugLogEntry
  ): void {
    if (message.mode === MessageMode.REQUEST && entry.direction === 'send') {
      // 记录请求开始时间
      this.requestResponseMap.set(message.id, {
        entry,
        startTime: Date.now(),
      });
    } else if (message.mode === MessageMode.RESPONSE && entry.direction === 'receive') {
      // 查找对应的请求
      const responseMessage = message as any;
      const requestId = responseMessage.requestId;
      
      if (requestId) {
        const requestInfo = this.requestResponseMap.get(requestId);
        if (requestInfo) {
          // 计算响应时间
          const duration = Date.now() - requestInfo.startTime;
          entry.duration = duration;
          
          // 更新请求条目的响应信息
          requestInfo.entry.response = entry.data;
          requestInfo.entry.duration = duration;
          if (entry.error) {
            requestInfo.entry.error = entry.error;
          }
          
          // 清理映射
          this.requestResponseMap.delete(requestId);
        }
      }
    }
  }

  /**
   * 清理敏感数据
   */
  private sanitizeData(data: unknown): unknown {
    if (!data) return data;
    
    try {
      const sanitized = JSON.parse(JSON.stringify(data));
      
      // 递归清理敏感字段
      this.sanitizeObject(sanitized);
      
      return sanitized;
    } catch {
      return '[Non-serializable data]';
    }
  }

  /**
   * 递归清理对象中的敏感字段
   */
  private sanitizeObject(obj: any): void {
    if (!obj || typeof obj !== 'object') return;
    
    const sensitiveFields = ['apiKey', 'password', 'token', 'secret', 'key'];
    
    for (const key in obj) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        this.sanitizeObject(obj[key]);
      }
    }
  }

  /**
   * 计算消息大小
   */
  private calculateMessageSize(message: DuplexMessage): number {
    try {
      return JSON.stringify(message).length;
    } catch {
      return 0;
    }
  }
}

// ============================================================================
// 客户端调试集成
// ============================================================================

export class ClientDebugIntegration {
  private debugAdapter: DebugAdapter;
  private duplexClient: DuplexClient;

  constructor(duplexClient: DuplexClient, debugAdapter?: DebugAdapter) {
    this.duplexClient = duplexClient;
    this.debugAdapter = debugAdapter || new DebugAdapter();
    this.setupLogging();
  }

  /**
   * 获取调试适配器
   */
  getDebugAdapter(): DebugAdapter {
    return this.debugAdapter;
  }

  /**
   * 启用调试日志
   */
  enableDebugLogging(): void {
    this.duplexClient.enableDebug((message, direction) => {
      this.debugAdapter.logMessage(message, direction);
    });
  }

  /**
   * 禁用调试日志
   */
  disableDebugLogging(): void {
    this.duplexClient.disableDebug();
  }

  /**
   * 设置调试面板接口
   */
  setDebugPanel(debugPanel: DebugPanelInterface): void {
    this.debugAdapter.setDebugPanel(debugPanel);
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 设置日志记录
   */
  private setupLogging(): void {
    // 监听消息流，记录日志
    this.duplexClient.onMessage().subscribe(message => {
      // 这里可以添加额外的日志处理逻辑
    });
  }
}

// ============================================================================
// 服务端调试集成
// ============================================================================

export class ServerDebugIntegration {
  private debugAdapter: DebugAdapter;
  private duplexServer: DuplexServer;

  constructor(duplexServer: DuplexServer, debugAdapter?: DebugAdapter) {
    this.duplexServer = duplexServer;
    this.debugAdapter = debugAdapter || new DebugAdapter();
    this.setupLogging();
  }

  /**
   * 获取调试适配器
   */
  getDebugAdapter(): DebugAdapter {
    return this.debugAdapter;
  }

  /**
   * 启用调试日志
   */
  enableDebugLogging(): void {
    this.duplexServer.enableDebug((message, direction, clientId) => {
      this.debugAdapter.logMessage(message, direction, clientId);
    });
  }

  /**
   * 禁用调试日志
   */
  disableDebugLogging(): void {
    this.duplexServer.disableDebug();
  }

  /**
   * 设置调试面板接口
   */
  setDebugPanel(debugPanel: DebugPanelInterface): void {
    this.debugAdapter.setDebugPanel(debugPanel);
  }

  /**
   * 获取服务端统计信息
   */
  getServerStats(): {
    messageStats: MessageStats;
    performanceMetrics: PerformanceMetrics;
    logStats: ReturnType<DebugAdapter['getLogStats']>;
  } {
    return {
      messageStats: this.duplexServer.getStats(),
      performanceMetrics: this.duplexServer.getPerformanceMetrics(),
      logStats: this.debugAdapter.getLogStats(),
    };
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 设置日志记录
   */
  private setupLogging(): void {
    // 这里可以添加服务端特有的日志处理逻辑
  }
}

// ============================================================================
// 调试面板 Web 接口适配器
// ============================================================================

export class WebDebugPanelAdapter implements DebugPanelInterface {
  private postMessageCallback?: (entry: any) => void;

  constructor(postMessageCallback?: (entry: any) => void) {
    this.postMessageCallback = postMessageCallback;
  }

  /**
   * 记录消息日志
   */
  logMessage(entry: DebugLogEntry): void {
    if (this.postMessageCallback) {
      // 发送到调试面板
      this.postMessageCallback({
        type: 'DUPLEX_MESSAGE_LOG',
        entry: {
          id: entry.id,
          timestamp: entry.timestamp,
          direction: entry.direction,
          messageType: entry.messageType,
          data: entry.data,
          response: entry.response,
          error: entry.error,
        },
      });
    }
  }

  /**
   * 更新统计信息
   */
  updateStats(stats: MessageStats): void {
    if (this.postMessageCallback) {
      this.postMessageCallback({
        type: 'DUPLEX_STATS_UPDATE',
        stats,
      });
    }
  }

  /**
   * 更新性能指标
   */
  updatePerformanceMetrics(metrics: PerformanceMetrics): void {
    if (this.postMessageCallback) {
      this.postMessageCallback({
        type: 'DUPLEX_PERFORMANCE_UPDATE',
        metrics,
      });
    }
  }

  /**
   * 清空日志
   */
  clearLogs(): void {
    if (this.postMessageCallback) {
      this.postMessageCallback({
        type: 'DUPLEX_LOGS_CLEARED',
      });
    }
  }

  /**
   * 导出日志
   */
  exportLogs(): string {
    // 这个方法由调试面板自己处理
    return '';
  }
}