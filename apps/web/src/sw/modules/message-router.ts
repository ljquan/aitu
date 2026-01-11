/**
 * Service Worker 消息路由模块
 *
 * 处理应用层与 Service Worker 之间的消息通信
 */

import type { AppToSWMessage, SyncData } from '../types';
import { swStore } from './store';
import { sendResponse, broadcast } from '../utils/broadcast';

// Service Worker 全局作用域引用
declare const self: ServiceWorkerGlobalScope;

// 任务执行器引用（延迟导入避免循环依赖）
let taskRunner: typeof import('./task-runner').taskRunner | null = null;

/**
 * 获取任务执行器实例
 */
async function getTaskRunner() {
  if (!taskRunner) {
    const module = await import('./task-runner');
    taskRunner = module.taskRunner;
  }
  return taskRunner;
}

/**
 * 设置消息路由
 */
export function setupMessageRouter(): void {
  self.addEventListener('message', handleMessage);
  // console.log('[MessageRouter] Message router initialized');
}

/**
 * 处理消息
 */
async function handleMessage(event: ExtendableMessageEvent): Promise<void> {
  const message = event.data as AppToSWMessage;
  const source = event.source as Client | null;

  if (!message || !message.type) {
    console.warn('[MessageRouter] Invalid message received:', message);
    return;
  }

  // console.log(`[MessageRouter] Received message: ${message.type}`);

  // 使用 waitUntil 确保异步操作完成
  event.waitUntil(
    processMessage(message, source).catch((error) => {
      console.error(`[MessageRouter] Error processing message ${message.type}:`, error);

      // 发送错误响应
      if (source && 'requestId' in message && message.requestId) {
        sendResponse(source, {
          type: 'ERROR',
          error: error.message || 'Unknown error',
          requestId: message.requestId,
        });
      }
    })
  );
}

/**
 * 处理消息的具体逻辑
 */
async function processMessage(
  message: AppToSWMessage,
  source: Client | null
): Promise<void> {
  const runner = await getTaskRunner();

  switch (message.type) {
    // ==================== 任务相关 ====================

    case 'TASK_CREATE': {
      const task = await runner.createTask(message.payload);

      // 发送响应给请求方
      if (source && message.requestId) {
        sendResponse(source, {
          type: 'RESPONSE',
          payload: task,
          requestId: message.requestId,
        });
      }
      break;
    }

    case 'TASK_CANCEL': {
      await runner.cancelTask(message.payload.taskId);
      break;
    }

    case 'TASK_RETRY': {
      await runner.retryTask(message.payload.taskId);
      break;
    }

    case 'TASK_DELETE': {
      await runner.deleteTask(message.payload.taskId);
      break;
    }

    case 'TASK_CLEAR_COMPLETED': {
      await swStore.clearCompletedTasks();
      break;
    }

    case 'TASK_CLEAR_FAILED': {
      await swStore.clearFailedTasks();
      break;
    }

    // ==================== 工作流相关 ====================

    case 'WORKFLOW_START': {
      // TODO: 实现工作流引擎后添加
      // console.log('[MessageRouter] WORKFLOW_START not implemented yet');
      break;
    }

    case 'WORKFLOW_ABORT': {
      // TODO: 实现工作流引擎后添加
      // console.log('[MessageRouter] WORKFLOW_ABORT not implemented yet');
      break;
    }

    // ==================== 查询相关 ====================

    case 'GET_ALL_TASKS': {
      const tasks = await swStore.getAllTasks();

      if (source) {
        sendResponse(source, {
          type: 'RESPONSE',
          payload: tasks,
          requestId: message.requestId,
        });
      }
      break;
    }

    case 'GET_TASK': {
      const task = await swStore.getTask(message.payload.taskId);

      if (source) {
        sendResponse(source, {
          type: 'RESPONSE',
          payload: task,
          requestId: message.requestId,
        });
      }
      break;
    }

    case 'GET_WORKFLOW_STATE': {
      const workflows = await swStore.getAllWorkflows();

      if (source) {
        sendResponse(source, {
          type: 'RESPONSE',
          payload: workflows,
          requestId: message.requestId,
        });
      }
      break;
    }

    // ==================== 同步相关 ====================

    case 'SYNC_REQUEST': {
      const syncData = await getSyncData();

      if (source) {
        sendResponse(source, {
          type: 'SYNC_RESPONSE',
          payload: syncData,
          requestId: message.requestId,
        });
      }
      break;
    }

    default: {
      console.warn(`[MessageRouter] Unknown message type: ${(message as any).type}`);
    }
  }
}

/**
 * 获取同步数据
 */
async function getSyncData(): Promise<SyncData> {
  const [tasks, workflows] = await Promise.all([
    swStore.getAllTasks(),
    swStore.getAllWorkflows(),
  ]);

  return {
    tasks,
    workflows: workflows.map((w) => ({
      id: w.id,
      definition: w.definition,
      status: w.status,
      currentStepIndex: w.currentStepIndex,
      steps: w.steps,
      result: w.result,
      error: w.error,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    })),
  };
}

/**
 * 初始化消息路由（包括数据迁移和任务恢复）
 */
export async function initializeMessageRouter(): Promise<void> {
  // 初始化存储
  await swStore.initialize();

  // 检查是否需要迁移数据
  const migrationCompleted = await swStore.getMetadata<boolean>('migrationCompleted');
  if (!migrationCompleted) {
    // console.log('[MessageRouter] Starting data migration...');
    await swStore.migrateFromLegacyStore();
  }

  // 设置消息监听
  setupMessageRouter();

  // 恢复未完成的任务
  const runner = await getTaskRunner();
  await runner.resumeAllTasks();

  // console.log('[MessageRouter] Initialization completed');
}
