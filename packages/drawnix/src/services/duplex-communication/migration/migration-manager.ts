/**
 * Migration Manager
 * 
 * 管理从现有通讯系统到双工通讯系统的渐进式迁移
 */

import { DuplexClient } from '../core/client';
import { DuplexServer } from '../core/server';
import { TaskQueueClientAdapter, TaskQueueServerAdapter } from '../adapters/task-queue-adapter';
import { WorkflowClientAdapter, WorkflowServerAdapter } from '../adapters/workflow-adapter';
import { DebugAdapter, ClientDebugIntegration, ServerDebugIntegration } from '../adapters/debug-adapter';

// ============================================================================
// 迁移配置接口
// ============================================================================

export interface MigrationConfig {
  /** 是否启用双工通讯 */
  enableDuplexCommunication: boolean;
  
  /** 迁移模式 */
  migrationMode: 'disabled' | 'parallel' | 'gradual' | 'complete';
  
  /** 功能迁移开关 */
  featureMigration: {
    /** TaskQueue 系统迁移 */
    taskQueue: boolean;
    /** Workflow 系统迁移 */
    workflow: boolean;
    /** 调试面板迁移 */
    debugPanel: boolean;
  };
  
  /** 回退配置 */
  fallbackConfig: {
    /** 是否启用自动回退 */
    autoFallback: boolean;
    /** 错误阈值 (超过此阈值自动回退) */
    errorThreshold: number;
    /** 监控时间窗口 (毫秒) */
    monitoringWindow: number;
  };
  
  /** 性能监控配置 */
  performanceMonitoring: {
    /** 是否启用性能对比 */
    enableComparison: boolean;
    /** 性能采样率 */
    sampleRate: number;
    /** 慢请求阈值 */
    slowRequestThreshold: number;
  };
}

/**
 * 默认迁移配置
 */
export const DEFAULT_MIGRATION_CONFIG: MigrationConfig = {
  enableDuplexCommunication: false,
  migrationMode: 'disabled',
  featureMigration: {
    taskQueue: false,
    workflow: false,
    debugPanel: false,
  },
  fallbackConfig: {
    autoFallback: true,
    errorThreshold: 0.1, // 10% 错误率
    monitoringWindow: 60000, // 1分钟
  },
  performanceMonitoring: {
    enableComparison: true,
    sampleRate: 0.1, // 10% 采样
    slowRequestThreshold: 5000, // 5秒
  },
};

// ============================================================================
// 迁移状态接口
// ============================================================================

export interface MigrationStatus {
  /** 当前迁移模式 */
  currentMode: MigrationConfig['migrationMode'];
  
  /** 各功能迁移状态 */
  featureStatus: {
    taskQueue: 'legacy' | 'duplex' | 'hybrid';
    workflow: 'legacy' | 'duplex' | 'hybrid';
    debugPanel: 'legacy' | 'duplex' | 'hybrid';
  };
  
  /** 性能对比数据 */
  performanceComparison: {
    legacy: {
      averageResponseTime: number;
      errorRate: number;
      throughput: number;
    };
    duplex: {
      averageResponseTime: number;
      errorRate: number;
      throughput: number;
    };
  };
  
  /** 错误统计 */
  errorStats: {
    legacyErrors: number;
    duplexErrors: number;
    fallbackCount: number;
  };
  
  /** 迁移开始时间 */
  migrationStartedAt: number;
  
  /** 最后更新时间 */
  lastUpdatedAt: number;
}

// ============================================================================
// 迁移管理器类
// ============================================================================

export class MigrationManager {
  private static instance: MigrationManager | null = null;
  
  private config: MigrationConfig;
  private status: MigrationStatus;
  
  // 双工通讯组件
  private duplexClient?: DuplexClient;
  private duplexServer?: DuplexServer;
  
  // 适配器
  private taskQueueAdapter?: TaskQueueClientAdapter;
  private workflowAdapter?: WorkflowClientAdapter;
  private debugIntegration?: ClientDebugIntegration;
  
  // 现有系统引用
  private legacyTaskQueueClient?: any;
  private legacyWorkflowClient?: any;
  
  // 性能监控
  private performanceMetrics = new Map<string, {
    legacy: number[];
    duplex: number[];
  }>();
  
  // 错误监控
  private errorCounts = {
    legacy: 0,
    duplex: 0,
    fallback: 0,
  };
  
  private monitoringStartTime = Date.now();

  private constructor(config: Partial<MigrationConfig> = {}) {
    this.config = { ...DEFAULT_MIGRATION_CONFIG, ...config };
    
    this.status = {
      currentMode: this.config.migrationMode,
      featureStatus: {
        taskQueue: 'legacy',
        workflow: 'legacy',
        debugPanel: 'legacy',
      },
      performanceComparison: {
        legacy: {
          averageResponseTime: 0,
          errorRate: 0,
          throughput: 0,
        },
        duplex: {
          averageResponseTime: 0,
          errorRate: 0,
          throughput: 0,
        },
      },
      errorStats: {
        legacyErrors: 0,
        duplexErrors: 0,
        fallbackCount: 0,
      },
      migrationStartedAt: Date.now(),
      lastUpdatedAt: Date.now(),
    };
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Partial<MigrationConfig>): MigrationManager {
    if (!MigrationManager.instance) {
      MigrationManager.instance = new MigrationManager(config);
    }
    return MigrationManager.instance;
  }

  /**
   * 初始化迁移管理器
   */
  async initialize(
    legacyTaskQueueClient?: any,
    legacyWorkflowClient?: any
  ): Promise<boolean> {
    try {
      this.legacyTaskQueueClient = legacyTaskQueueClient;
      this.legacyWorkflowClient = legacyWorkflowClient;
      
      // 如果启用了双工通讯，初始化双工组件
      if (this.config.enableDuplexCommunication) {
        await this.initializeDuplexComponents();
      }
      
      // 启动性能监控
      this.startPerformanceMonitoring();
      
      console.log('[MigrationManager] Initialized successfully');
      return true;
      
    } catch (error) {
      console.error('[MigrationManager] Initialization failed:', error);
      return false;
    }
  }

  /**
   * 更新迁移配置
   */
  updateConfig(newConfig: Partial<MigrationConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    // 如果启用状态发生变化，重新初始化
    if (oldConfig.enableDuplexCommunication !== this.config.enableDuplexCommunication) {
      if (this.config.enableDuplexCommunication) {
        this.initializeDuplexComponents();
      } else {
        this.destroyDuplexComponents();
      }
    }
    
    // 更新迁移模式
    if (oldConfig.migrationMode !== this.config.migrationMode) {
      this.applyMigrationMode(this.config.migrationMode);
    }
    
    this.status.lastUpdatedAt = Date.now();
  }

  /**
   * 获取 TaskQueue 客户端 (根据迁移状态返回适当的实现)
   */
  getTaskQueueClient(): any {
    const featureStatus = this.status.featureStatus.taskQueue;
    
    switch (featureStatus) {
      case 'duplex':
        return this.taskQueueAdapter;
      case 'hybrid':
        // 混合模式：根据配置或负载均衡选择
        return this.shouldUseDuplex('taskQueue') 
          ? this.taskQueueAdapter 
          : this.legacyTaskQueueClient;
      case 'legacy':
      default:
        return this.legacyTaskQueueClient;
    }
  }

  /**
   * 获取 Workflow 客户端
   */
  getWorkflowClient(): any {
    const featureStatus = this.status.featureStatus.workflow;
    
    switch (featureStatus) {
      case 'duplex':
        return this.workflowAdapter;
      case 'hybrid':
        return this.shouldUseDuplex('workflow') 
          ? this.workflowAdapter 
          : this.legacyWorkflowClient;
      case 'legacy':
      default:
        return this.legacyWorkflowClient;
    }
  }

  /**
   * 获取迁移状态
   */
  getStatus(): MigrationStatus {
    return { ...this.status };
  }

  /**
   * 获取性能对比报告
   */
  getPerformanceReport(): {
    summary: {
      duplexImprovement: {
        responseTime: number; // 百分比改进
        errorRate: number;
        throughput: number;
      };
    };
    details: {
      [feature: string]: {
        legacy: { avg: number; count: number };
        duplex: { avg: number; count: number };
      };
    };
  } {
    const summary = {
      duplexImprovement: {
        responseTime: 0,
        errorRate: 0,
        throughput: 0,
      },
    };
    
    const details: any = {};
    
    // 计算性能改进
    const legacyAvg = this.status.performanceComparison.legacy.averageResponseTime;
    const duplexAvg = this.status.performanceComparison.duplex.averageResponseTime;
    
    if (legacyAvg > 0 && duplexAvg > 0) {
      summary.duplexImprovement.responseTime = ((legacyAvg - duplexAvg) / legacyAvg) * 100;
    }
    
    // 计算各功能的详细对比
    for (const [feature, metrics] of this.performanceMetrics.entries()) {
      const legacyMetrics = metrics.legacy;
      const duplexMetrics = metrics.duplex;
      
      details[feature] = {
        legacy: {
          avg: legacyMetrics.length > 0 
            ? legacyMetrics.reduce((a, b) => a + b, 0) / legacyMetrics.length 
            : 0,
          count: legacyMetrics.length,
        },
        duplex: {
          avg: duplexMetrics.length > 0 
            ? duplexMetrics.reduce((a, b) => a + b, 0) / duplexMetrics.length 
            : 0,
          count: duplexMetrics.length,
        },
      };
    }
    
    return { summary, details };
  }

  /**
   * 手动触发回退到旧系统
   */
  async fallbackToLegacy(reason: string): Promise<void> {
    console.warn(`[MigrationManager] Falling back to legacy system: ${reason}`);
    
    // 更新状态
    this.status.featureStatus.taskQueue = 'legacy';
    this.status.featureStatus.workflow = 'legacy';
    this.status.errorStats.fallbackCount++;
    this.status.lastUpdatedAt = Date.now();
    
    // 记录回退事件
    this.recordFallbackEvent(reason);
  }

  /**
   * 销毁迁移管理器
   */
  destroy(): void {
    this.destroyDuplexComponents();
    MigrationManager.instance = null;
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 初始化双工通讯组件
   */
  private async initializeDuplexComponents(): Promise<void> {
    try {
      // 初始化双工客户端
      this.duplexClient = DuplexClient.getInstance();
      await this.duplexClient.initialize();
      
      // 初始化适配器
      if (this.config.featureMigration.taskQueue) {
        this.taskQueueAdapter = new TaskQueueClientAdapter(this.duplexClient);
      }
      
      if (this.config.featureMigration.workflow) {
        this.workflowAdapter = new WorkflowClientAdapter(this.duplexClient);
      }
      
      if (this.config.featureMigration.debugPanel) {
        this.debugIntegration = new ClientDebugIntegration(this.duplexClient);
        this.debugIntegration.enableDebugLogging();
      }
      
      console.log('[MigrationManager] Duplex components initialized');
      
    } catch (error) {
      console.error('[MigrationManager] Failed to initialize duplex components:', error);
      throw error;
    }
  }

  /**
   * 销毁双工通讯组件
   */
  private destroyDuplexComponents(): void {
    if (this.debugIntegration) {
      this.debugIntegration.disableDebugLogging();
      this.debugIntegration = undefined;
    }
    
    if (this.taskQueueAdapter) {
      this.taskQueueAdapter.destroy();
      this.taskQueueAdapter = undefined;
    }
    
    if (this.workflowAdapter) {
      this.workflowAdapter.destroy();
      this.workflowAdapter = undefined;
    }
    
    if (this.duplexClient) {
      this.duplexClient.destroy();
      this.duplexClient = undefined;
    }
  }

  /**
   * 应用迁移模式
   */
  private applyMigrationMode(mode: MigrationConfig['migrationMode']): void {
    this.status.currentMode = mode;
    
    switch (mode) {
      case 'disabled':
        // 完全禁用双工通讯
        this.status.featureStatus.taskQueue = 'legacy';
        this.status.featureStatus.workflow = 'legacy';
        this.status.featureStatus.debugPanel = 'legacy';
        break;
        
      case 'parallel':
        // 并行运行，但仍使用旧系统
        this.status.featureStatus.taskQueue = 'legacy';
        this.status.featureStatus.workflow = 'legacy';
        this.status.featureStatus.debugPanel = 'legacy';
        break;
        
      case 'gradual':
        // 渐进式迁移
        this.status.featureStatus.taskQueue = this.config.featureMigration.taskQueue ? 'hybrid' : 'legacy';
        this.status.featureStatus.workflow = this.config.featureMigration.workflow ? 'hybrid' : 'legacy';
        this.status.featureStatus.debugPanel = this.config.featureMigration.debugPanel ? 'duplex' : 'legacy';
        break;
        
      case 'complete':
        // 完全迁移到双工通讯
        this.status.featureStatus.taskQueue = this.config.featureMigration.taskQueue ? 'duplex' : 'legacy';
        this.status.featureStatus.workflow = this.config.featureMigration.workflow ? 'duplex' : 'legacy';
        this.status.featureStatus.debugPanel = this.config.featureMigration.debugPanel ? 'duplex' : 'legacy';
        break;
    }
    
    console.log(`[MigrationManager] Applied migration mode: ${mode}`, this.status.featureStatus);
  }

  /**
   * 判断是否应该使用双工通讯
   */
  private shouldUseDuplex(feature: 'taskQueue' | 'workflow'): boolean {
    // 在混合模式下的决策逻辑
    
    // 1. 检查错误率
    const errorRate = this.calculateErrorRate('duplex');
    if (errorRate > this.config.fallbackConfig.errorThreshold) {
      return false;
    }
    
    // 2. 负载均衡 (简单的随机分配)
    if (this.config.performanceMonitoring.enableComparison) {
      return Math.random() < this.config.performanceMonitoring.sampleRate;
    }
    
    // 3. 默认使用双工通讯
    return true;
  }

  /**
   * 计算错误率
   */
  private calculateErrorRate(system: 'legacy' | 'duplex'): number {
    const now = Date.now();
    const windowStart = now - this.config.fallbackConfig.monitoringWindow;
    
    // 这里应该从实际的错误记录中计算
    // 简化实现，使用累计错误数
    const totalRequests = 100; // 假设值
    const errors = system === 'legacy' ? this.errorCounts.legacy : this.errorCounts.duplex;
    
    return totalRequests > 0 ? errors / totalRequests : 0;
  }

  /**
   * 启动性能监控
   */
  private startPerformanceMonitoring(): void {
    setInterval(() => {
      this.updatePerformanceMetrics();
      this.checkAutoFallback();
    }, 10000); // 每10秒检查一次
  }

  /**
   * 更新性能指标
   */
  private updatePerformanceMetrics(): void {
    // 从双工客户端获取统计信息
    if (this.duplexClient) {
      const stats = this.duplexClient.getStats();
      this.status.performanceComparison.duplex.averageResponseTime = stats.averageResponseTime;
      this.status.performanceComparison.duplex.errorRate = 
        stats.totalMessages > 0 ? stats.failedMessages / stats.totalMessages : 0;
    }
    
    // 更新旧系统的性能指标 (需要从旧系统获取)
    // 这里是简化实现
    
    this.status.lastUpdatedAt = Date.now();
  }

  /**
   * 检查自动回退条件
   */
  private checkAutoFallback(): void {
    if (!this.config.fallbackConfig.autoFallback) {
      return;
    }
    
    const duplexErrorRate = this.calculateErrorRate('duplex');
    
    if (duplexErrorRate > this.config.fallbackConfig.errorThreshold) {
      this.fallbackToLegacy(`High error rate: ${(duplexErrorRate * 100).toFixed(2)}%`);
    }
  }

  /**
   * 记录回退事件
   */
  private recordFallbackEvent(reason: string): void {
    console.warn(`[MigrationManager] Fallback event: ${reason}`, {
      timestamp: Date.now(),
      reason,
      errorStats: this.status.errorStats,
      performanceComparison: this.status.performanceComparison,
    });
  }
}

// ============================================================================
// 迁移工具函数
// ============================================================================

/**
 * 创建迁移配置
 */
export function createMigrationConfig(
  overrides: Partial<MigrationConfig> = {}
): MigrationConfig {
  return { ...DEFAULT_MIGRATION_CONFIG, ...overrides };
}

/**
 * 获取推荐的迁移配置
 */
export function getRecommendedMigrationConfig(
  environment: 'development' | 'staging' | 'production'
): MigrationConfig {
  const baseConfig = createMigrationConfig();
  
  switch (environment) {
    case 'development':
      return {
        ...baseConfig,
        enableDuplexCommunication: true,
        migrationMode: 'parallel',
        featureMigration: {
          taskQueue: true,
          workflow: true,
          debugPanel: true,
        },
        performanceMonitoring: {
          enableComparison: true,
          sampleRate: 1.0, // 100% 在开发环境
          slowRequestThreshold: 1000,
        },
      };
      
    case 'staging':
      return {
        ...baseConfig,
        enableDuplexCommunication: true,
        migrationMode: 'gradual',
        featureMigration: {
          taskQueue: true,
          workflow: false, // 逐步启用
          debugPanel: true,
        },
        performanceMonitoring: {
          enableComparison: true,
          sampleRate: 0.5, // 50% 采样
          slowRequestThreshold: 3000,
        },
      };
      
    case 'production':
      return {
        ...baseConfig,
        enableDuplexCommunication: false, // 生产环境谨慎启用
        migrationMode: 'disabled',
        fallbackConfig: {
          autoFallback: true,
          errorThreshold: 0.05, // 5% 错误率
          monitoringWindow: 300000, // 5分钟
        },
        performanceMonitoring: {
          enableComparison: true,
          sampleRate: 0.1, // 10% 采样
          slowRequestThreshold: 5000,
        },
      };
      
    default:
      return baseConfig;
  }
}