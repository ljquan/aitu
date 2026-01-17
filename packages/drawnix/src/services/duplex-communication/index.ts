/**
 * Duplex Communication System
 * 
 * 统一导出双工通讯系统的所有组件
 */

// ============================================================================
// 核心组件
// ============================================================================

export * from './core/types';
export * from './core/protocol';
export * from './core/client';
export * from './core/server';

// ============================================================================
// 工具组件
// ============================================================================

export * from './utils/validator';
export * from './utils/request-manager';
export * from './utils/message-router';

// ============================================================================
// 适配器
// ============================================================================

export * from './adapters/task-queue-adapter';
export * from './adapters/workflow-adapter';
export * from './adapters/debug-adapter';

// ============================================================================
// 迁移管理
// ============================================================================

export * from './migration/migration-manager';

// ============================================================================
// 桥接层
// ============================================================================

export * from './bridge';

// ============================================================================
// 便捷工厂函数
// ============================================================================

import { DuplexClient } from './core/client';
import { DuplexServer } from './core/server';
import { TaskQueueClientAdapter } from './adapters/task-queue-adapter';
import { WorkflowClientAdapter } from './adapters/workflow-adapter';
import { ClientDebugIntegration } from './adapters/debug-adapter';
import { MigrationManager, createMigrationConfig } from './migration/migration-manager';
import type { DuplexConfig } from './core/types';

/**
 * 创建完整的双工通讯客户端
 */
export async function createDuplexClient(
  config?: Partial<DuplexConfig>
): Promise<{
  client: DuplexClient;
  taskQueue: TaskQueueClientAdapter;
  workflow: WorkflowClientAdapter;
  debug: ClientDebugIntegration;
}> {
  const client = DuplexClient.getInstance(config);
  await client.initialize();
  
  const taskQueue = new TaskQueueClientAdapter(client);
  const workflow = new WorkflowClientAdapter(client);
  const debug = new ClientDebugIntegration(client);
  
  return {
    client,
    taskQueue,
    workflow,
    debug,
  };
}

/**
 * 创建双工通讯服务端
 */
export function createDuplexServer(
  config?: Partial<DuplexConfig>,
  dependencies?: {
    taskQueueInstance?: any;
    workflowExecutor?: any;
  }
): {
  server: DuplexServer;
  taskQueueAdapter?: any;
  workflowAdapter?: any;
} {
  const server = DuplexServer.getInstance(config);
  
  let taskQueueAdapter;
  let workflowAdapter;
  
  if (dependencies?.taskQueueInstance) {
    taskQueueAdapter = new (require('./adapters/task-queue-adapter').TaskQueueServerAdapter)(
      server,
      dependencies.taskQueueInstance
    );
  }
  
  if (dependencies?.workflowExecutor) {
    workflowAdapter = new (require('./adapters/workflow-adapter').WorkflowServerAdapter)(
      server,
      dependencies.workflowExecutor
    );
  }
  
  return {
    server,
    taskQueueAdapter,
    workflowAdapter,
  };
}

/**
 * 创建迁移管理器
 */
export async function createMigrationManager(
  environment: 'development' | 'staging' | 'production' = 'development',
  legacyClients?: {
    taskQueue?: any;
    workflow?: any;
  }
): Promise<MigrationManager> {
  const config = createMigrationConfig();
  const manager = MigrationManager.getInstance(config);
  
  await manager.initialize(
    legacyClients?.taskQueue,
    legacyClients?.workflow
  );
  
  return manager;
}

// ============================================================================
// 类型导出 (便于外部使用)
// ============================================================================

export type {
  // 核心类型
  DuplexMessage,
  RequestMessage,
  ResponseMessage,
  PushMessage,
  MessageHandler,
  DuplexConfig,
  MessageStats,
  PerformanceMetrics,
  
  // 验证类型
  ValidationResult,
  
  // 调试类型
  DebugLogEntry,
  DebugPanelInterface,
  
  // 迁移类型
  MigrationConfig,
  MigrationStatus,
} from './core/types';

// ============================================================================
// 常量导出
// ============================================================================

export {
  MESSAGE_TYPES,
  ERROR_CODES,
  DEFAULT_DUPLEX_CONFIG,
} from './core/protocol';

export {
  DEFAULT_MIGRATION_CONFIG,
} from './migration/migration-manager';

// ============================================================================
// 版本信息
// ============================================================================

export const DUPLEX_COMMUNICATION_VERSION = '1.0.0';

/**
 * 获取系统信息
 */
export function getSystemInfo(): {
  version: string;
  features: string[];
  compatibility: {
    serviceWorker: boolean;
    postMessage: boolean;
    indexedDB: boolean;
  };
} {
  return {
    version: DUPLEX_COMMUNICATION_VERSION,
    features: [
      'Request-Response Communication',
      'Push Messaging',
      'Message Routing',
      'Error Handling & Retry',
      'Performance Monitoring',
      'Debug Integration',
      'Migration Management',
      'Legacy Compatibility',
    ],
    compatibility: {
      serviceWorker: 'serviceWorker' in navigator,
      postMessage: typeof postMessage === 'function',
      indexedDB: 'indexedDB' in window,
    },
  };
}