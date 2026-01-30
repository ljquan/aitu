/**
 * SW Debug Panel - Service Worker Communication Module
 * 
 * 使用 postmessage-duplex 实现可靠的点对点通信
 */

import {
  initDuplexClient,
  resetDuplexClient,
  addEventListener as addDuplexEventListener,
  getDebugStatus,
  getFetchLogs,
  clearFetchLogs as clearFetchLogsRPC,
  getConsoleLogs,
  clearConsoleLogs as clearConsoleLogsRPC,
  getPostMessageLogs,
  clearPostMessageLogs as clearPostMessageLogsRPC,
  getLLMApiLogs,
  clearLLMApiLogs as clearLLMApiLogsRPC,
  getCrashSnapshots,
  clearCrashSnapshots as clearCrashSnapshotsRPC,
  getCacheStats,
  enableDebugMode,
  disableDebugMode,
  sendHeartbeat,
  sendNativeMessage,
  SW_EVENTS,
} from './duplex-client.js';

/** @type {Function|null} PostMessage log callback */
let postMessageLogCallback = null;

/** @type {number} Counter for generating unique log IDs */
let logIdCounter = 0;

/** @type {boolean} */
let duplexInitialized = false;

/** @type {object} Message handlers */
let messageHandlers = {};

/**
 * Set the callback for PostMessage logging
 * @param {Function} callback - Called with (logEntry) when a message is sent/received
 */
export function setPostMessageLogCallback(callback) {
  postMessageLogCallback = callback;
}

/**
 * Message types from the debug panel itself (should be filtered out)
 * We only want to show main application's communications
 */
const DEBUG_PANEL_MESSAGE_PREFIXES = [
  'SW_DEBUG_',
  'SW_POSTMESSAGE_',
];

/**
 * Check if a message type is from the debug panel
 * @param {string} messageType
 * @returns {boolean}
 */
function isDebugPanelMessage(messageType) {
  if (!messageType || typeof messageType !== 'string') {
    return false;
  }
  return DEBUG_PANEL_MESSAGE_PREFIXES.some(prefix => messageType.startsWith(prefix));
}

/**
 * Log a PostMessage event
 * @param {'send'|'receive'} direction
 * @param {string} messageType
 * @param {object} data
 * @param {object} [response]
 * @param {string} [error]
 */
function logPostMessage(direction, messageType, data, response, error) {
  // Filter out debug panel's own messages - only log main application communications
  if (isDebugPanelMessage(messageType)) {
    return;
  }

  if (postMessageLogCallback) {
    const entry = {
      id: `pm-${Date.now()}-${++logIdCounter}`,
      timestamp: Date.now(),
      direction,
      messageType,
      data,
      response,
      error,
    };
    postMessageLogCallback(entry);
  }
}

/**
 * 初始化 duplex 通信
 * @returns {Promise<boolean>}
 */
async function ensureDuplexInitialized() {
  if (duplexInitialized) return true;
  
  try {
    const success = await initDuplexClient();
    if (success) {
      duplexInitialized = true;
      setupDuplexEventHandlers();
      console.log('[SW Communication] Duplex communication initialized');
    }
    return success;
  } catch (error) {
    console.error('[SW Communication] Failed to initialize duplex:', error);
    return false;
  }
}

/**
 * 设置 duplex 事件处理
 */
function setupDuplexEventHandlers() {
  // 调试状态变更 - 映射到 SW_DEBUG_ENABLED/SW_DEBUG_DISABLED
  addDuplexEventListener(SW_EVENTS.DEBUG_STATUS_CHANGED, (data) => {
    const enabled = data?.enabled;
    if (enabled && messageHandlers['SW_DEBUG_ENABLED']) {
      messageHandlers['SW_DEBUG_ENABLED'](data);
    } else if (!enabled && messageHandlers['SW_DEBUG_DISABLED']) {
      messageHandlers['SW_DEBUG_DISABLED'](data);
    }
  });

  // Fetch 日志（SW 的调试日志）
  addDuplexEventListener(SW_EVENTS.DEBUG_LOG, (data) => {
    if (messageHandlers['SW_DEBUG_LOG']) {
      messageHandlers['SW_DEBUG_LOG'](data);
    }
  });

  // Console 日志
  addDuplexEventListener(SW_EVENTS.CONSOLE_LOG, (data) => {
    if (messageHandlers['SW_DEBUG_CONSOLE_LOG']) {
      messageHandlers['SW_DEBUG_CONSOLE_LOG'](data);
    }
  });

  // PostMessage 日志
  addDuplexEventListener(SW_EVENTS.POSTMESSAGE_LOG, (data) => {
    if (messageHandlers['SW_DEBUG_POSTMESSAGE_LOG']) {
      messageHandlers['SW_DEBUG_POSTMESSAGE_LOG'](data);
    }
  });

  // PostMessage 日志批量
  addDuplexEventListener(SW_EVENTS.POSTMESSAGE_LOG_BATCH, (data) => {
    if (messageHandlers['SW_DEBUG_POSTMESSAGE_LOG_BATCH']) {
      messageHandlers['SW_DEBUG_POSTMESSAGE_LOG_BATCH'](data);
    }
  });

  // LLM API 日志
  addDuplexEventListener(SW_EVENTS.DEBUG_LLM_LOG, (data) => {
    if (messageHandlers['SW_DEBUG_LLM_API_LOG']) {
      messageHandlers['SW_DEBUG_LLM_API_LOG'](data);
    }
  });
}

/**
 * Enable debug mode
 */
export function enableDebug() {
  enableDebugMode();
}

/**
 * Disable debug mode
 */
export function disableDebug() {
  disableDebugMode();
}

/**
 * Send heartbeat to keep debug mode alive
 */
export function heartbeat() {
  sendHeartbeat();
}

/**
 * Request status update (uses duplex RPC)
 */
export async function refreshStatus() {
  await ensureDuplexInitialized();
  
  try {
    const result = await getDebugStatus();
    if (messageHandlers['SW_DEBUG_STATUS']) {
      messageHandlers['SW_DEBUG_STATUS'](result);
    }
  } catch (error) {
    console.error('[SW Communication] Failed to get debug status:', error);
    // 回退到原生方式
    sendNativeMessage('SW_DEBUG_GET_STATUS');
  }
}

/**
 * Load fetch logs from SW (uses duplex RPC)
 */
export async function loadFetchLogs() {
  await ensureDuplexInitialized();
  
  try {
    const result = await getFetchLogs();
    if (messageHandlers['SW_DEBUG_LOGS']) {
      messageHandlers['SW_DEBUG_LOGS'](result);
    }
  } catch (error) {
    console.error('[SW Communication] Failed to load fetch logs:', error);
    sendNativeMessage('SW_DEBUG_GET_LOGS');
  }
}

/**
 * Clear fetch logs (uses duplex RPC)
 */
export async function clearFetchLogs() {
  await ensureDuplexInitialized();
  
  try {
    await clearFetchLogsRPC();
    if (messageHandlers['SW_DEBUG_LOGS_CLEARED']) {
      messageHandlers['SW_DEBUG_LOGS_CLEARED']({});
    }
  } catch (error) {
    console.error('[SW Communication] Failed to clear fetch logs:', error);
    sendNativeMessage('SW_DEBUG_CLEAR_LOGS');
  }
}

/**
 * Clear console logs (uses duplex RPC)
 */
export async function clearConsoleLogs() {
  await ensureDuplexInitialized();
  
  try {
    await clearConsoleLogsRPC();
    if (messageHandlers['SW_DEBUG_CONSOLE_LOGS_CLEARED']) {
      messageHandlers['SW_DEBUG_CONSOLE_LOGS_CLEARED']({});
    }
  } catch (error) {
    console.error('[SW Communication] Failed to clear console logs:', error);
    sendNativeMessage('SW_DEBUG_CLEAR_CONSOLE_LOGS');
  }
}

/**
 * Request all console logs from IndexedDB (uses duplex RPC)
 */
export async function loadConsoleLogs() {
  await ensureDuplexInitialized();
  
  try {
    const result = await getConsoleLogs(1000);
    if (messageHandlers['SW_DEBUG_CONSOLE_LOGS']) {
      messageHandlers['SW_DEBUG_CONSOLE_LOGS'](result);
    }
  } catch (error) {
    console.error('[SW Communication] Failed to load console logs:', error);
    sendNativeMessage('SW_DEBUG_GET_CONSOLE_LOGS', { limit: 1000 });
  }
}

/**
 * Load PostMessage logs from SW (uses duplex RPC)
 */
export async function loadPostMessageLogs() {
  await ensureDuplexInitialized();
  
  try {
    const result = await getPostMessageLogs(500);
    if (messageHandlers['SW_DEBUG_POSTMESSAGE_LOGS']) {
      messageHandlers['SW_DEBUG_POSTMESSAGE_LOGS'](result);
    }
  } catch (error) {
    console.error('[SW Communication] Failed to load postmessage logs:', error);
    sendNativeMessage('SW_DEBUG_GET_POSTMESSAGE_LOGS', { limit: 500 });
  }
}

/**
 * Clear PostMessage logs in SW (uses duplex RPC)
 */
export async function clearPostMessageLogs() {
  await ensureDuplexInitialized();
  
  try {
    await clearPostMessageLogsRPC();
    if (messageHandlers['SW_DEBUG_POSTMESSAGE_LOGS_CLEARED']) {
      messageHandlers['SW_DEBUG_POSTMESSAGE_LOGS_CLEARED']({});
    }
  } catch (error) {
    console.error('[SW Communication] Failed to clear postmessage logs:', error);
    sendNativeMessage('SW_DEBUG_CLEAR_POSTMESSAGE_LOGS');
  }
}

/**
 * Load LLM API logs from SW (uses duplex RPC)
 */
export async function loadLLMApiLogs() {
  await ensureDuplexInitialized();
  
  try {
    const result = await getLLMApiLogs();
    if (messageHandlers['SW_DEBUG_LLM_API_LOGS']) {
      messageHandlers['SW_DEBUG_LLM_API_LOGS'](result);
    }
    return result;
  } catch (error) {
    console.error('[SW Communication] Failed to load LLM API logs:', error);
    sendNativeMessage('SW_DEBUG_GET_LLM_API_LOGS');
    return null;
  }
}

/**
 * Clear LLM API logs in SW (uses duplex RPC)
 */
export async function clearLLMApiLogsInSW() {
  await ensureDuplexInitialized();
  
  try {
    await clearLLMApiLogsRPC();
    if (messageHandlers['SW_DEBUG_LLM_API_LOGS_CLEARED']) {
      messageHandlers['SW_DEBUG_LLM_API_LOGS_CLEARED']({});
    }
  } catch (error) {
    console.error('[SW Communication] Failed to clear LLM API logs:', error);
    sendNativeMessage('SW_DEBUG_CLEAR_LLM_API_LOGS');
  }
}

/**
 * Load crash snapshots from SW (uses duplex RPC)
 */
export async function loadCrashSnapshots() {
  await ensureDuplexInitialized();
  
  try {
    const result = await getCrashSnapshots();
    if (messageHandlers['SW_DEBUG_CRASH_SNAPSHOTS']) {
      messageHandlers['SW_DEBUG_CRASH_SNAPSHOTS'](result);
    }
    return result;
  } catch (error) {
    console.error('[SW Communication] Failed to load crash snapshots:', error);
    sendNativeMessage('SW_DEBUG_GET_CRASH_SNAPSHOTS');
    return null;
  }
}

/**
 * Clear crash snapshots in SW (uses duplex RPC)
 */
export async function clearCrashSnapshotsInSW() {
  await ensureDuplexInitialized();
  
  try {
    await clearCrashSnapshotsRPC();
    if (messageHandlers['SW_DEBUG_CRASH_SNAPSHOTS_CLEARED']) {
      messageHandlers['SW_DEBUG_CRASH_SNAPSHOTS_CLEARED']({});
    }
  } catch (error) {
    console.error('[SW Communication] Failed to clear crash snapshots:', error);
    sendNativeMessage('SW_DEBUG_CLEAR_CRASH_SNAPSHOTS');
  }
}

/**
 * Request cache stats from SW (uses duplex RPC)
 */
export async function loadCacheStats() {
  await ensureDuplexInitialized();
  
  try {
    const result = await getCacheStats();
    if (messageHandlers['SW_DEBUG_CACHE_STATS']) {
      messageHandlers['SW_DEBUG_CACHE_STATS'](result);
    }
    return result;
  } catch (error) {
    console.error('[SW Communication] Failed to load cache stats:', error);
    sendNativeMessage('SW_DEBUG_GET_CACHE_STATS');
    return null;
  }
}

/** @type {ServiceWorkerRegistration|null} */
let cachedRegistration = null;

/**
 * Check if SW is available and ready
 * Also initializes duplex client
 * @returns {Promise<boolean>}
 */
export async function checkSwReady() {
  if (!('serviceWorker' in navigator)) {
    return false;
  }
  
  const registration = await navigator.serviceWorker.ready;
  cachedRegistration = registration;
  
  // If SW is active, initialize duplex communication
  if (registration.active) {
    await ensureDuplexInitialized();
    return true;
  }
  
  return false;
}

/**
 * Get the active SW to send messages to
 * Prefers controller, falls back to registration.active
 * @returns {ServiceWorker|null}
 */
export function getActiveSW() {
  if (navigator.serviceWorker.controller) {
    return navigator.serviceWorker.controller;
  }
  if (cachedRegistration?.active) {
    return cachedRegistration.active;
  }
  return null;
}

/**
 * Register message handler for SW messages
 * Also sets up duplex event handlers
 * @param {object} handlers - Message type to handler function map
 */
export function registerMessageHandlers(handlers) {
  messageHandlers = handlers;
  
  // Also listen for native messages (for backward compatibility)
  navigator.serviceWorker.addEventListener('message', (event) => {
    const { type, ...data } = event.data;

    // Log the incoming message (filtering handled inside logPostMessage)
    logPostMessage('receive', type, data);

    if (handlers[type]) {
      handlers[type](data);
    }
  });
}

/**
 * Register controller change handler
 * @param {Function} callback 
 */
export function onControllerChange(callback) {
  navigator.serviceWorker.addEventListener('controllerchange', async () => {
    if (navigator.serviceWorker.controller) {
      console.log('[SW Communication] Controller changed, resetting duplex client');
      // 完全重置 duplex 客户端
      resetDuplexClient();
      duplexInitialized = false;
      
      // 重新初始化
      await ensureDuplexInitialized();
      callback();
    }
  });
}

// 导出 duplex 初始化函数供外部使用
export { ensureDuplexInitialized };
