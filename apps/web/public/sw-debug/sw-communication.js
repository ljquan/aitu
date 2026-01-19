/**
 * SW Debug Panel - Service Worker Communication Module
 */

/** @type {Function|null} PostMessage log callback */
let postMessageLogCallback = null;

/** @type {number} Counter for generating unique log IDs */
let logIdCounter = 0;

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
 * Send message to Service Worker
 * Uses controller if available, otherwise uses registration.active
 * @param {string} type
 * @param {object} data
 */
export function sendToSW(type, data = {}) {
  const sw = getActiveSW();
  if (sw) {
    const message = { type, ...data };
    sw.postMessage(message);
    logPostMessage('send', type, data);
  } else {
    console.warn('[SW Debug] No active SW to send message to');
  }
}

/**
 * Enable debug mode
 */
export function enableDebug() {
  sendToSW('SW_DEBUG_ENABLE');
}

/**
 * Disable debug mode
 */
export function disableDebug() {
  sendToSW('SW_DEBUG_DISABLE');
}

/**
 * Request status update
 */
export function refreshStatus() {
  sendToSW('SW_DEBUG_GET_STATUS');
}

/**
 * Clear fetch logs
 */
export function clearFetchLogs() {
  sendToSW('SW_DEBUG_CLEAR_LOGS');
}

/**
 * Clear console logs
 */
export function clearConsoleLogs() {
  sendToSW('SW_DEBUG_CLEAR_CONSOLE_LOGS');
}

/**
 * Request all console logs from IndexedDB
 */
export function loadConsoleLogs() {
  sendToSW('SW_DEBUG_GET_CONSOLE_LOGS', { limit: 1000 });
}

/**
 * Request logs export
 */
export function requestExport() {
  sendToSW('SW_DEBUG_EXPORT_LOGS');
}

/**
 * Load PostMessage logs from SW
 */
export function loadPostMessageLogs() {
  sendToSW('SW_DEBUG_GET_POSTMESSAGE_LOGS', { limit: 500 });
}

/**
 * Clear PostMessage logs in SW
 */
export function clearPostMessageLogs() {
  sendToSW('SW_DEBUG_CLEAR_POSTMESSAGE_LOGS');
}

/** @type {ServiceWorkerRegistration|null} */
let cachedRegistration = null;

/**
 * Check if SW is available and ready
 * Returns true if SW is active (even without controller - we can use registration.active)
 * @returns {Promise<boolean>}
 */
export async function checkSwReady() {
  if (!('serviceWorker' in navigator)) {
    return false;
  }
  
  const registration = await navigator.serviceWorker.ready;
  cachedRegistration = registration;
  
  // If SW is active, we can communicate with it
  // (controller might be null on hard refresh, but registration.active works)
  return !!registration.active;
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
 * @param {object} handlers - Message type to handler function map
 */
export function registerMessageHandlers(handlers) {
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
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (navigator.serviceWorker.controller) {
      callback();
    }
  });
}
