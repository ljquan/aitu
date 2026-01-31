/**
 * SW Debug Panel - Duplex Client
 * 基于 postmessage-duplex 的双工通信客户端
 */

import { ServiceWorkerChannel } from './postmessage-duplex.js';

// RPC 方法名常量（与 SW 端保持一致）
const RPC_METHODS = {
  // Debug methods
  DEBUG_GET_STATUS: 'debug:getStatus',
  DEBUG_GET_LOGS: 'debug:getLogs',
  DEBUG_CLEAR_LOGS: 'debug:clearLogs',
  DEBUG_GET_CONSOLE_LOGS: 'debug:getConsoleLogs',
  DEBUG_CLEAR_CONSOLE_LOGS: 'debug:clearConsoleLogs',
  DEBUG_GET_POSTMESSAGE_LOGS: 'debug:getPostMessageLogs',
  DEBUG_CLEAR_POSTMESSAGE_LOGS: 'debug:clearPostMessageLogs',
  DEBUG_GET_LLM_API_LOGS: 'debug:getLLMApiLogs',
  DEBUG_GET_LLM_API_LOG_BY_ID: 'debug:getLLMApiLogById',
  DEBUG_CLEAR_LLM_API_LOGS: 'debug:clearLLMApiLogs',
  DEBUG_DELETE_LLM_API_LOGS: 'debug:deleteLLMApiLogs',
  DEBUG_GET_CRASH_SNAPSHOTS: 'debug:getCrashSnapshots',
  DEBUG_CLEAR_CRASH_SNAPSHOTS: 'debug:clearCrashSnapshots',
  DEBUG_GET_CACHE_STATS: 'debug:getCacheStats',
};

// 事件类型常量（必须与 SW 端 channel-manager.ts 中的 SW_EVENTS 保持一致）
const SW_EVENTS = {
  DEBUG_STATUS_CHANGED: 'debug:statusChanged',
  DEBUG_LOG: 'debug:log',  // SW 的 fetch 调试日志
  CONSOLE_LOG: 'console:log',  // SW 的控制台日志
  POSTMESSAGE_LOG: 'postmessage:log',  // PostMessage 日志
  DEBUG_LLM_LOG: 'debug:llmLog',  // LLM API 日志
  POSTMESSAGE_LOG_BATCH: 'postmessage:logBatch',  // PostMessage 批量日志
};

/** @type {ServiceWorkerChannel|null} */
let channel = null;

/** @type {boolean} */
let initialized = false;

/** @type {Map<string, Function[]>} */
const eventListeners = new Map();

/**
 * 重置 duplex 客户端（在 SW 更新后调用）
 */
export function resetDuplexClient() {
  console.log('[DuplexClient] Resetting client for SW update');
  channel = null;
  initialized = false;
}

/**
 * 初始化 duplex 客户端
 * postmessage-duplex 1.1.0 配合 SW 的 enableGlobalRouting，自动创建 channel
 * @returns {Promise<boolean>}
 */
export async function initDuplexClient() {
  if (initialized && channel) {
    return true;
  }

  try {
    // 等待 SW 准备好
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) {
      console.warn('[DuplexClient] No active SW');
      return false;
    }

    // 创建 duplex 通道
    // SW 端的 enableGlobalRouting 会自动为新客户端创建 channel
    // 不再需要显式的 SW_CHANNEL_CONNECT 握手
    channel = await ServiceWorkerChannel.createFromPage({
      log: { log: () => {}, warn: () => {}, error: () => {} }
    });

    // 注册事件订阅
    setupEventSubscriptions();

    initialized = true;
    console.log('[DuplexClient] Initialized successfully');
    return true;
  } catch (error) {
    console.error('[DuplexClient] Failed to initialize:', error);
    return false;
  }
}

/**
 * 设置事件订阅
 */
function setupEventSubscriptions() {
  if (!channel) return;

  // 使用 onBroadcast 接收 SW 的广播消息（单向，不需要响应）
  // SW 使用 channel.broadcast() 发送事件
  Object.values(SW_EVENTS).forEach(eventName => {
    channel.onBroadcast(eventName, ({ data }) => {
      if (data !== undefined) {
        emitEvent(eventName, data);
      }
    });
  });
}

/**
 * 触发事件
 * @param {string} eventName
 * @param {*} data
 */
function emitEvent(eventName, data) {
  const listeners = eventListeners.get(eventName) || [];
  listeners.forEach(callback => {
    try {
      callback(data);
    } catch (error) {
      console.error(`[DuplexClient] Event handler error for ${eventName}:`, error);
    }
  });
}

/**
 * 添加事件监听器
 * @param {string} eventName
 * @param {Function} callback
 */
export function addEventListener(eventName, callback) {
  if (!eventListeners.has(eventName)) {
    eventListeners.set(eventName, []);
  }
  eventListeners.get(eventName).push(callback);
}

/**
 * 移除事件监听器
 * @param {string} eventName
 * @param {Function} callback
 */
export function removeEventListener(eventName, callback) {
  const listeners = eventListeners.get(eventName);
  if (listeners) {
    const index = listeners.indexOf(callback);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }
}

/**
 * 调用 RPC 方法（带自动重试）
 * @param {string} method
 * @param {object} params
 * @param {number} timeout
 * @param {number} retries - 重试次数
 * @returns {Promise<*>}
 */
async function callRPC(method, params = {}, timeout = 10000, retries = 2) {
  if (!channel) {
    throw new Error('DuplexClient not initialized');
  }
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // 注意：publish 用于发送请求并等待响应（RPC 模式）
      // 响应格式: { ret: 0, data: {...} }，需要解包 data 字段
      const response = await channel.publish(method, params, { timeout });
      
      // 检查响应格式并解包 data
      if (response && typeof response === 'object') {
        // ret === undefined || ret === 0 表示成功（publish 模式下 ret 可能是 undefined）
        if ((response.ret === undefined || response.ret === 0) && response.data !== undefined) {
          return response.data;
        }
        // 如果有错误信息（ret 存在且不为 0）
        if (response.ret !== undefined && response.ret !== 0) {
          throw new Error(response.msg || `RPC failed with code ${response.ret}`);
        }
      }
      
      return response;
    } catch (error) {
      if (attempt < retries) {
        // 等待一段时间后重试（给 SW 更新完成的时间）
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 重新初始化 channel
        if (!initialized) {
          await initDuplexClient();
        }
      } else {
        throw error;
      }
    }
  }
}

// ============================================================================
// Debug API
// ============================================================================

/**
 * 获取调试状态
 * @returns {Promise<{debugModeEnabled: boolean, swVersion: string}>}
 */
export async function getDebugStatus() {
  return callRPC(RPC_METHODS.DEBUG_GET_STATUS);
}

/**
 * 获取 Fetch 日志
 * @returns {Promise<{logs: Array}>}
 */
export async function getFetchLogs() {
  return callRPC(RPC_METHODS.DEBUG_GET_LOGS);
}

/**
 * 清除 Fetch 日志
 * @returns {Promise<void>}
 */
export async function clearFetchLogs() {
  return callRPC(RPC_METHODS.DEBUG_CLEAR_LOGS);
}

/**
 * 获取 Console 日志
 * @param {number} limit
 * @returns {Promise<{logs: Array}>}
 */
export async function getConsoleLogs(limit = 1000) {
  return callRPC(RPC_METHODS.DEBUG_GET_CONSOLE_LOGS, { limit });
}

/**
 * 清除 Console 日志
 * @returns {Promise<void>}
 */
export async function clearConsoleLogs() {
  return callRPC(RPC_METHODS.DEBUG_CLEAR_CONSOLE_LOGS);
}

/**
 * 获取 PostMessage 日志
 * @param {number} limit
 * @returns {Promise<{logs: Array}>}
 */
export async function getPostMessageLogs(limit = 500) {
  return callRPC(RPC_METHODS.DEBUG_GET_POSTMESSAGE_LOGS, { limit });
}

/**
 * 清除 PostMessage 日志
 * @returns {Promise<void>}
 */
export async function clearPostMessageLogs() {
  return callRPC(RPC_METHODS.DEBUG_CLEAR_POSTMESSAGE_LOGS);
}

/**
 * 获取 LLM API 日志（分页）
 * @param {number} page - 页码，默认 1
 * @param {number} pageSize - 每页条数，默认 20
 * @param {object} filter - 过滤条件 { taskType?, status? }
 * @returns {Promise<{logs: Array, total: number, page: number, pageSize: number, totalPages: number}>}
 */
export async function getLLMApiLogs(page = 1, pageSize = 20, filter = {}) {
  return callRPC(RPC_METHODS.DEBUG_GET_LLM_API_LOGS, { page, pageSize, ...filter });
}

/**
 * 清除 LLM API 日志
 * @returns {Promise<void>}
 */
export async function clearLLMApiLogs() {
  return callRPC(RPC_METHODS.DEBUG_CLEAR_LLM_API_LOGS);
}

/**
 * 删除指定的 LLM API 日志
 * @param {string[]} logIds - 要删除的日志 ID 列表
 * @returns {Promise<{success: boolean, deletedCount: number}>}
 */
export async function deleteLLMApiLogs(logIds) {
  return callRPC(RPC_METHODS.DEBUG_DELETE_LLM_API_LOGS, { logIds });
}

/**
 * 获取单条 LLM API 日志的完整数据
 * @param {string} logId - 日志 ID
 * @returns {Promise<object|null>}
 */
export async function getLLMApiLogById(logId) {
  return callRPC(RPC_METHODS.DEBUG_GET_LLM_API_LOG_BY_ID, { logId });
}

/**
 * 获取 Crash 快照
 * @returns {Promise<{snapshots: Array}>}
 */
export async function getCrashSnapshots() {
  return callRPC(RPC_METHODS.DEBUG_GET_CRASH_SNAPSHOTS);
}

/**
 * 清除 Crash 快照
 * @returns {Promise<void>}
 */
export async function clearCrashSnapshots() {
  return callRPC(RPC_METHODS.DEBUG_CLEAR_CRASH_SNAPSHOTS);
}

/**
 * 获取缓存统计
 * @returns {Promise<{stats: object}>}
 */
export async function getCacheStats() {
  return callRPC(RPC_METHODS.DEBUG_GET_CACHE_STATS);
}

// ============================================================================
// 原生 postMessage 支持（用于启用/禁用调试模式等简单操作）
// ============================================================================

/**
 * 发送原生 postMessage（用于不需要响应的简单操作）
 * @param {string} type
 * @param {object} data
 */
export function sendNativeMessage(type, data = {}) {
  const sw = navigator.serviceWorker.controller;
  if (sw) {
    sw.postMessage({ type, ...data });
  }
}

/**
 * 启用调试模式
 */
export function enableDebugMode() {
  sendNativeMessage('SW_DEBUG_ENABLE');
}

/**
 * 禁用调试模式
 */
export function disableDebugMode() {
  sendNativeMessage('SW_DEBUG_DISABLE');
}

/**
 * 发送心跳
 */
export function sendHeartbeat() {
  sendNativeMessage('SW_DEBUG_HEARTBEAT');
}

// 导出事件常量供外部使用
export { SW_EVENTS, RPC_METHODS };
