/**
 * SW Debug Panel - Main Application
 */

import { downloadJson } from './utils.js';
import { createLogEntry } from './log-entry.js';
import { createConsoleEntry } from './console-entry.js';
import { createPostMessageEntry } from './postmessage-entry.js';
import { updateSwStatus, updateStatusPanel, updateDebugButton } from './status-panel.js';
import {
  enableDebug,
  disableDebug,
  refreshStatus,
  clearFetchLogs,
  clearConsoleLogs,
  loadConsoleLogs,
  loadPostMessageLogs,
  clearPostMessageLogs as clearPostMessageLogsInSW,
  checkSwReady,
  registerMessageHandlers,
  onControllerChange,
  setPostMessageLogCallback,
} from './sw-communication.js';

// Domain blacklist - requests from these domains will be hidden
const DOMAIN_BLACKLIST = [
  'us.i.posthog.com',
  'us-assets.i.posthog.com',
  'posthog.com',
  'google-analytics.com',
  'googletagmanager.com',
];

/**
 * Check if URL is in the domain blacklist
 * @param {string} url 
 * @returns {boolean}
 */
function isBlacklistedUrl(url) {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    return DOMAIN_BLACKLIST.some(domain => 
      urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

// Application State
const state = {
  debugEnabled: false,
  logs: [],
  consoleLogs: [],
  postmessageLogs: [],
  crashLogs: [], // Crash snapshots
  autoScroll: true,
  activeTab: 'fetch',
  expandedLogIds: new Set(), // Track expanded fetch log IDs
  expandedStackIds: new Set(), // Track expanded console stack IDs
  expandedPmIds: new Set(), // Track expanded postmessage log IDs
  expandedCrashIds: new Set(), // Track expanded crash log IDs
};

// Memory monitoring interval
let memoryMonitorInterval = null;

// DOM Elements cache
let elements = {};

// Export dropdown state
let exportDropdownOpen = false;

/**
 * Cache DOM elements
 */
function cacheElements() {
  elements = {
    swStatus: document.getElementById('swStatus'),
    toggleDebugBtn: document.getElementById('toggleDebug'),
    exportLogsBtn: document.getElementById('exportLogs'),
    clearLogsBtn: document.getElementById('clearLogs'),
    refreshStatusBtn: document.getElementById('refreshStatus'),
    refreshCacheBtn: document.getElementById('refreshCache'),
    enableDebugBtn: document.getElementById('enableDebugBtn'),
    logsContainer: document.getElementById('logsContainer'),
    consoleLogsContainer: document.getElementById('consoleLogsContainer'),
    filterType: document.getElementById('filterType'),
    filterStatus: document.getElementById('filterStatus'),
    filterUrl: document.getElementById('filterUrl'),
    filterConsoleLevel: document.getElementById('filterConsoleLevel'),
    filterConsoleText: document.getElementById('filterConsoleText'),
    clearConsoleLogsBtn: document.getElementById('clearConsoleLogs'),
    copyConsoleLogsBtn: document.getElementById('copyConsoleLogs'),
    autoScrollCheckbox: document.getElementById('autoScroll'),
    consoleCountEl: document.getElementById('consoleCount'),
    postmessageCountEl: document.getElementById('postmessageCount'),
    postmessageLogsContainer: document.getElementById('postmessageLogsContainer'),
    filterMessageDirection: document.getElementById('filterMessageDirection'),
    filterMessageType: document.getElementById('filterMessageType'),
    clearPostmessageLogsBtn: document.getElementById('clearPostmessageLogs'),
    copyPostmessageLogsBtn: document.getElementById('copyPostmessageLogs'),
    // Status panel elements
    swVersion: document.getElementById('swVersion'),
    debugMode: document.getElementById('debugMode'),
    pendingImages: document.getElementById('pendingImages'),
    pendingVideos: document.getElementById('pendingVideos'),
    videoBlobCache: document.getElementById('videoBlobCache'),
    completedRequests: document.getElementById('completedRequests'),
    workflowHandler: document.getElementById('workflowHandler'),
    debugLogsCount: document.getElementById('debugLogsCount'),
    failedDomainsSection: document.getElementById('failedDomainsSection'),
    failedDomains: document.getElementById('failedDomains'),
    cacheList: document.getElementById('cacheList'),
    // Export dropdown elements
    exportOptions: document.getElementById('exportOptions'),
    doExportBtn: document.getElementById('doExport'),
    // Crash logs elements
    crashCountEl: document.getElementById('crashCount'),
    crashLogsContainer: document.getElementById('crashLogsContainer'),
    filterCrashType: document.getElementById('filterCrashType'),
    refreshCrashLogsBtn: document.getElementById('refreshCrashLogs'),
    clearCrashLogsBtn: document.getElementById('clearCrashLogs'),
    exportCrashLogsBtn: document.getElementById('exportCrashLogs'),
    // Memory monitoring elements
    memoryUsed: document.getElementById('memoryUsed'),
    memoryTotal: document.getElementById('memoryTotal'),
    memoryLimit: document.getElementById('memoryLimit'),
    memoryPercent: document.getElementById('memoryPercent'),
    memoryWarning: document.getElementById('memoryWarning'),
    memoryNotSupported: document.getElementById('memoryNotSupported'),
    memoryUpdateTime: document.getElementById('memoryUpdateTime'),
  };
}

/**
 * Render fetch logs
 */
function renderLogs() {
  const typeFilter = elements.filterType?.value || '';
  const statusFilter = elements.filterStatus?.value || '';
  const urlFilter = (elements.filterUrl?.value || '').toLowerCase();

  let filteredLogs = state.logs;

  // Filter out blacklisted domains
  filteredLogs = filteredLogs.filter(l => !isBlacklistedUrl(l.url));

  if (typeFilter) {
    filteredLogs = filteredLogs.filter(l => l.requestType === typeFilter);
  }

  if (statusFilter) {
    if (statusFilter === '500') {
      filteredLogs = filteredLogs.filter(l => l.status >= 500);
    } else {
      filteredLogs = filteredLogs.filter(l => l.status === parseInt(statusFilter));
    }
  }

  if (urlFilter) {
    filteredLogs = filteredLogs.filter(l => l.url?.toLowerCase().includes(urlFilter));
  }

  if (filteredLogs.length === 0) {
    elements.logsContainer.innerHTML = `
      <div class="empty-state">
        <span class="icon">📋</span>
        <p>${state.debugEnabled ? '暂无匹配的日志' : '请先启用调试模式'}</p>
        ${!state.debugEnabled ? '<button id="enableDebugBtn2" class="primary">启用调试</button>' : ''}
      </div>
    `;
    const btn = document.getElementById('enableDebugBtn2');
    if (btn) {
      btn.addEventListener('click', toggleDebug);
    }
    return;
  }

  elements.logsContainer.innerHTML = '';
  filteredLogs.slice(0, 200).forEach(log => {
    const isExpanded = state.expandedLogIds.has(log.id);
    const entry = createLogEntry(log, isExpanded, (id, expanded) => {
      // Update expanded state
      if (expanded) {
        state.expandedLogIds.add(id);
      } else {
        state.expandedLogIds.delete(id);
      }
    });
    elements.logsContainer.appendChild(entry);
  });
}

/**
 * Render console logs
 */
function renderConsoleLogs() {
  const levelFilter = elements.filterConsoleLevel?.value || '';
  const textFilter = (elements.filterConsoleText?.value || '').toLowerCase();

  let filteredLogs = state.consoleLogs;

  if (levelFilter) {
    filteredLogs = filteredLogs.filter(l => l.logLevel === levelFilter);
  }

  if (textFilter) {
    filteredLogs = filteredLogs.filter(l =>
      l.logMessage?.toLowerCase().includes(textFilter) ||
      l.logStack?.toLowerCase().includes(textFilter)
    );
  }

  // Update count
  updateConsoleCount();

  if (filteredLogs.length === 0) {
    elements.consoleLogsContainer.innerHTML = `
      <div class="empty-state">
        <span class="icon">📝</span>
        <p>暂无控制台日志</p>
      </div>
    `;
    return;
  }

  elements.consoleLogsContainer.innerHTML = '';
  filteredLogs.slice(0, 200).forEach(log => {
    const isExpanded = state.expandedStackIds.has(log.id);
    const entry = createConsoleEntry(log, isExpanded, (id, expanded) => {
      if (expanded) {
        state.expandedStackIds.add(id);
      } else {
        state.expandedStackIds.delete(id);
      }
    });
    elements.consoleLogsContainer.appendChild(entry);
  });
}

/**
 * Update console log count indicator
 */
function updateConsoleCount() {
  const errorCount = state.consoleLogs.filter(l => l.logLevel === 'error').length;
  const warnCount = state.consoleLogs.filter(l => l.logLevel === 'warn').length;
  
  if (errorCount > 0) {
    elements.consoleCountEl.innerHTML = `(<span style="color:var(--error-color)">${errorCount} errors</span>)`;
  } else if (warnCount > 0) {
    elements.consoleCountEl.innerHTML = `(<span style="color:var(--warning-color)">${warnCount} warns</span>)`;
  } else {
    elements.consoleCountEl.textContent = `(${state.consoleLogs.length})`;
  }
}

/**
 * Add or update a log entry
 * @param {object} entry 
 */
function addOrUpdateLog(entry) {
  // Skip blacklisted URLs
  if (isBlacklistedUrl(entry.url)) {
    return;
  }

  const existingIndex = state.logs.findIndex(l => l.id === entry.id);
  if (existingIndex !== -1) {
    state.logs[existingIndex] = { ...state.logs[existingIndex], ...entry };
  } else {
    state.logs.unshift(entry);
    if (state.logs.length > 500) {
      state.logs.pop();
    }
  }
  renderLogs();

  if (state.autoScroll) {
    elements.logsContainer.scrollTop = 0;
  }
}

/**
 * Add a console log entry (real-time)
 * @param {object} entry
 */
function addConsoleLog(entry) {
  // Check for duplicates (in case of race condition with initial load)
  if (state.consoleLogs.some(l => l.id === entry.id)) {
    return;
  }

  state.consoleLogs.unshift(entry);
  if (state.consoleLogs.length > 500) {
    state.consoleLogs.pop();
  }

  if (state.activeTab === 'console') {
    renderConsoleLogs();
  } else {
    updateConsoleCount();
  }
}

/**
 * Render postmessage logs
 */
function renderPostmessageLogs() {
  const directionFilter = elements.filterMessageDirection?.value || '';
  const typeFilter = (elements.filterMessageType?.value || '').toLowerCase();

  let filteredLogs = state.postmessageLogs;

  if (directionFilter) {
    filteredLogs = filteredLogs.filter(l => l.direction === directionFilter);
  }

  if (typeFilter) {
    filteredLogs = filteredLogs.filter(l =>
      l.messageType?.toLowerCase().includes(typeFilter)
    );
  }

  // Update count
  updatePostmessageCount();

  if (filteredLogs.length === 0) {
    elements.postmessageLogsContainer.innerHTML = `
      <div class="empty-state">
        <span class="icon">📨</span>
        <p>暂无 PostMessage 日志</p>
        <p style="font-size: 12px; opacity: 0.7;">记录主线程与 Service Worker 之间的消息通信</p>
      </div>
    `;
    return;
  }

  elements.postmessageLogsContainer.innerHTML = '';
  filteredLogs.slice(0, 200).forEach(log => {
    const isExpanded = state.expandedPmIds.has(log.id);
    const entry = createPostMessageEntry(log, isExpanded, (id, expanded) => {
      if (expanded) {
        state.expandedPmIds.add(id);
      } else {
        state.expandedPmIds.delete(id);
      }
    });
    elements.postmessageLogsContainer.appendChild(entry);
  });
}

/**
 * Update postmessage log count indicator
 */
function updatePostmessageCount() {
  const sendCount = state.postmessageLogs.filter(l => l.direction === 'send').length;
  const receiveCount = state.postmessageLogs.filter(l => l.direction === 'receive').length;

  if (state.postmessageLogs.length > 0) {
    elements.postmessageCountEl.innerHTML = `(<span style="color:var(--primary-color)">${sendCount}→</span> <span style="color:var(--success-color)">←${receiveCount}</span>)`;
  } else {
    elements.postmessageCountEl.textContent = '(0)';
  }
}

/**
 * Add a postmessage log entry
 * @param {object} entry
 */
function addPostmessageLog(entry) {
  // Check for duplicates
  if (state.postmessageLogs.some(l => l.id === entry.id)) {
    return;
  }

  state.postmessageLogs.unshift(entry);
  if (state.postmessageLogs.length > 500) {
    state.postmessageLogs.pop();
  }

  if (state.activeTab === 'postmessage') {
    renderPostmessageLogs();
  } else {
    updatePostmessageCount();
  }
}

/**
 * Clear postmessage logs
 */
function handleClearPostmessageLogs() {
  state.postmessageLogs = [];
  clearPostMessageLogsInSW(); // Also clear in SW
  renderPostmessageLogs();
}

/**
 * Copy filtered postmessage logs to clipboard
 */
async function handleCopyPostmessageLogs() {
  const directionFilter = elements.filterMessageDirection?.value || '';
  const typeFilter = (elements.filterMessageType?.value || '').toLowerCase();

  let filteredLogs = state.postmessageLogs;

  if (directionFilter) {
    filteredLogs = filteredLogs.filter(l => l.direction === directionFilter);
  }

  if (typeFilter) {
    filteredLogs = filteredLogs.filter(l =>
      l.messageType?.toLowerCase().includes(typeFilter)
    );
  }

  if (filteredLogs.length === 0) {
    alert('没有可复制的日志');
    return;
  }

  // Format logs as text
  const logText = filteredLogs.map(log => {
    const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
    const direction = log.direction === 'send' ? '→ SW' : '← 主线程';
    const type = log.messageType || 'unknown';
    const data = log.data ? JSON.stringify(log.data, null, 2) : '';
    const response = log.response !== undefined ? `\n  响应: ${JSON.stringify(log.response, null, 2)}` : '';
    const error = log.error ? `\n  错误: ${log.error}` : '';
    return `${time} [${direction}] ${type}\n  数据: ${data}${response}${error}`;
  }).join('\n\n');

  try {
    await navigator.clipboard.writeText(logText);
    // Visual feedback
    const btn = elements.copyPostmessageLogsBtn;
    const originalText = btn.textContent;
    btn.textContent = '✅ 已复制';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 1500);
  } catch (err) {
    console.error('Failed to copy:', err);
    alert('复制失败');
  }
}

// ==================== Memory Logs ====================

/**
 * Render crash logs
 */
function renderCrashLogs() {
  const typeFilter = elements.filterCrashType?.value || '';

  let filteredLogs = state.crashLogs;

  if (typeFilter) {
    filteredLogs = filteredLogs.filter(l => l.type === typeFilter);
  }

  // Update count
  updateCrashCount();

  if (filteredLogs.length === 0) {
    elements.crashLogsContainer.innerHTML = `
      <div class="empty-state">
        <span class="icon">💥</span>
        <p>暂无内存日志</p>
        <p style="font-size: 12px; opacity: 0.7;">页面启动、内存超限、错误和关闭时的快照会自动记录</p>
      </div>
    `;
    return;
  }

  elements.crashLogsContainer.innerHTML = '';
  filteredLogs.forEach(log => {
    const isExpanded = state.expandedCrashIds.has(log.id);
    const entry = createCrashEntry(log, isExpanded, (id, expanded) => {
      if (expanded) {
        state.expandedCrashIds.add(id);
      } else {
        state.expandedCrashIds.delete(id);
      }
    });
    elements.crashLogsContainer.appendChild(entry);
  });
}

/**
 * Create a crash log entry element
 */
function createCrashEntry(log, isExpanded, onToggle) {
  const entry = document.createElement('div');
  entry.className = 'log-entry crash-entry';
  
  const time = new Date(log.timestamp).toLocaleString('zh-CN', { 
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  const typeLabels = {
    startup: '🚀 启动',
    periodic: '⏱️ 定期',
    error: '❌ 错误',
    beforeunload: '👋 关闭'
  };
  
  const typeLabel = typeLabels[log.type] || log.type;
  const isError = log.type === 'error';
  
  // Memory info
  let memoryInfo = '';
  if (log.memory) {
    const usedMB = (log.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
    const limitMB = (log.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(1);
    const percent = ((log.memory.usedJSHeapSize / log.memory.jsHeapSizeLimit) * 100).toFixed(1);
    memoryInfo = `${usedMB} MB / ${limitMB} MB (${percent}%)`;
  }
  
  // Page stats info
  let pageStatsInfo = '';
  if (log.pageStats) {
    const stats = log.pageStats;
    const parts = [
      `DOM:${stats.domNodeCount || 0}`,
      `Canvas:${stats.canvasCount || 0}`,
      `Img:${stats.imageCount || 0}`,
      `Video:${stats.videoCount || 0}`,
    ];
    if (stats.plaitElementCount !== undefined) {
      parts.push(`Plait:${stats.plaitElementCount}`);
    }
    pageStatsInfo = parts.join(' | ');
  }
  
  // Error info
  let errorInfo = '';
  if (log.error) {
    errorInfo = `<div class="crash-error" style="color: var(--error-color); margin-top: 4px;">
      <strong>${log.error.type}:</strong> ${escapeHtml(log.error.message)}
    </div>`;
  }
  
  entry.innerHTML = `
    <div class="log-header" style="cursor: pointer;">
      <span class="log-time">${time}</span>
      <span class="log-type ${isError ? 'error' : ''}" style="margin-left: 8px;">${typeLabel}</span>
      ${memoryInfo ? `<span class="log-memory" style="margin-left: 12px; opacity: 0.8;">📊 ${memoryInfo}</span>` : ''}
      ${pageStatsInfo ? `<span class="log-stats" style="margin-left: 12px; opacity: 0.6; font-size: 11px;">📄 ${pageStatsInfo}</span>` : ''}
      <span class="expand-icon" style="margin-left: auto;">${isExpanded ? '▼' : '▶'}</span>
    </div>
    ${errorInfo}
    <div class="log-details" style="display: ${isExpanded ? 'block' : 'none'}; margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.05); border-radius: 4px; font-size: 12px;">
      <div><strong>ID:</strong> ${log.id}</div>
      <div><strong>URL:</strong> ${log.url || '-'}</div>
      ${memoryInfo ? `<div><strong>内存:</strong> ${memoryInfo}</div>` : ''}
      ${pageStatsInfo ? `<div><strong>页面统计:</strong> ${pageStatsInfo}</div>` : ''}
      ${log.pageStats ? `<div style="margin-top: 4px; padding-left: 12px; opacity: 0.8;">
        DOM节点: ${log.pageStats.domNodeCount || 0} | 
        Canvas: ${log.pageStats.canvasCount || 0} | 
        图片: ${log.pageStats.imageCount || 0} | 
        视频: ${log.pageStats.videoCount || 0} | 
        iframe: ${log.pageStats.iframeCount || 0}
        ${log.pageStats.plaitElementCount !== undefined ? ` | Plait元素: ${log.pageStats.plaitElementCount}` : ''}
      </div>` : ''}
      ${log.error?.stack ? `<div style="margin-top: 8px;"><strong>Stack:</strong><pre style="margin: 4px 0; white-space: pre-wrap; word-break: break-all;">${escapeHtml(log.error.stack)}</pre></div>` : ''}
      ${log.customData ? `<div style="margin-top: 8px;"><strong>自定义数据:</strong><pre style="margin: 4px 0;">${JSON.stringify(log.customData, null, 2)}</pre></div>` : ''}
      <div style="margin-top: 8px; opacity: 0.6;"><strong>UA:</strong> ${log.userAgent || '-'}</div>
    </div>
  `;
  
  // Toggle expand on header click
  const header = entry.querySelector('.log-header');
  header.addEventListener('click', () => {
    const details = entry.querySelector('.log-details');
    const icon = entry.querySelector('.expand-icon');
    const nowExpanded = details.style.display === 'none';
    details.style.display = nowExpanded ? 'block' : 'none';
    icon.textContent = nowExpanded ? '▼' : '▶';
    onToggle(log.id, nowExpanded);
  });
  
  return entry;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Update crash log count indicator
 */
function updateCrashCount() {
  const errorCount = state.crashLogs.filter(l => l.type === 'error').length;
  
  if (errorCount > 0) {
    elements.crashCountEl.innerHTML = `(<span style="color:var(--error-color)">${errorCount} errors</span>)`;
  } else {
    elements.crashCountEl.textContent = `(${state.crashLogs.length})`;
  }
}

/**
 * Load crash logs from SW
 */
function loadCrashLogs() {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SW_DEBUG_GET_CRASH_SNAPSHOTS'
    });
  }
}

/**
 * Clear crash logs
 */
function handleClearCrashLogs() {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SW_DEBUG_CLEAR_CRASH_SNAPSHOTS'
    });
  }
  state.crashLogs = [];
  renderCrashLogs();
}

/**
 * Export crash logs as JSON
 */
function handleExportCrashLogs() {
  if (state.crashLogs.length === 0) {
    alert('没有可导出的内存日志');
    return;
  }
  
  const exportData = {
    exportTime: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: location.href,
    memorySnapshots: state.crashLogs,
  };
  
  const filename = `memory-logs-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.json`;
  downloadJson(exportData, filename);
}

// ==================== Memory Monitoring ====================

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Update memory display
 */
function updateMemoryDisplay() {
  // Check for performance.memory (Chrome only)
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    const mem = performance.memory;
    const usedMB = (mem.usedJSHeapSize / (1024 * 1024)).toFixed(1);
    const totalMB = (mem.totalJSHeapSize / (1024 * 1024)).toFixed(1);
    const limitMB = (mem.jsHeapSizeLimit / (1024 * 1024)).toFixed(0);
    const percent = ((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100).toFixed(1);
    
    elements.memoryUsed.textContent = `${usedMB} MB`;
    elements.memoryTotal.textContent = `${totalMB} MB`;
    elements.memoryLimit.textContent = `${limitMB} MB`;
    elements.memoryPercent.textContent = `${percent}%`;
    
    // Warning if usage is high
    if (parseFloat(percent) > 70) {
      elements.memoryWarning.style.display = 'block';
      elements.memoryPercent.style.color = 'var(--error-color)';
    } else {
      elements.memoryWarning.style.display = 'none';
      elements.memoryPercent.style.color = '';
    }
    
    elements.memoryNotSupported.style.display = 'none';
  } else {
    elements.memoryUsed.textContent = '-';
    elements.memoryTotal.textContent = '-';
    elements.memoryLimit.textContent = '-';
    elements.memoryPercent.textContent = '-';
    elements.memoryNotSupported.style.display = 'block';
  }
  
  // Update timestamp
  const now = new Date();
  elements.memoryUpdateTime.textContent = `更新: ${now.toLocaleTimeString('zh-CN', { hour12: false })}`;
}

/**
 * Start memory monitoring
 */
function startMemoryMonitoring() {
  // Initial update
  updateMemoryDisplay();
  
  // Update every 2 seconds
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
  }
  memoryMonitorInterval = setInterval(updateMemoryDisplay, 2000);
}

/**
 * Stop memory monitoring
 */
function stopMemoryMonitoring() {
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
    memoryMonitorInterval = null;
  }
}

/**
 * Toggle debug mode
 */
function toggleDebug() {
  if (state.debugEnabled) {
    disableDebug();
  } else {
    enableDebug();
  }
}

/**
 * Clear all logs (Fetch, Console, and PostMessage)
 */
function handleClearLogs() {
  // Clear Fetch logs
  clearFetchLogs();
  state.logs = [];
  renderLogs();

  // Clear Console logs
  clearConsoleLogs();
  state.consoleLogs = [];
  renderConsoleLogs();

  // Clear PostMessage logs
  clearPostMessageLogsInSW();
  state.postmessageLogs = [];
  renderPostmessageLogs();
}

/**
 * Clear console logs only
 */
function handleClearConsoleLogs() {
  clearConsoleLogs();
  state.consoleLogs = [];
  renderConsoleLogs();
}

/**
 * Copy filtered console logs to clipboard
 */
async function handleCopyConsoleLogs() {
  const levelFilter = elements.filterConsoleLevel?.value || '';
  const textFilter = (elements.filterConsoleText?.value || '').toLowerCase();

  let filteredLogs = state.consoleLogs;

  if (levelFilter) {
    filteredLogs = filteredLogs.filter(l => l.logLevel === levelFilter);
  }

  if (textFilter) {
    filteredLogs = filteredLogs.filter(l =>
      l.logMessage?.toLowerCase().includes(textFilter) ||
      l.logStack?.toLowerCase().includes(textFilter)
    );
  }

  if (filteredLogs.length === 0) {
    alert('没有可复制的日志');
    return;
  }

  // Format logs as text
  const logText = filteredLogs.map(log => {
    const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
    const level = `[${log.logLevel.toUpperCase()}]`;
    const message = log.logMessage || '';
    const stack = log.logStack ? `\n  Stack: ${log.logStack}` : '';
    return `${time} ${level} ${message}${stack}`;
  }).join('\n');

  try {
    await navigator.clipboard.writeText(logText);
    // Visual feedback
    const btn = elements.copyConsoleLogsBtn;
    const originalText = btn.textContent;
    btn.textContent = '✅ 已复制';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 1500);
  } catch (err) {
    console.error('Failed to copy:', err);
    alert('复制失败');
  }
}

/**
 * Toggle export dropdown
 */
function toggleExportDropdown() {
  exportDropdownOpen = !exportDropdownOpen;
  elements.exportOptions?.classList.toggle('show', exportDropdownOpen);
}

/**
 * Close export dropdown
 */
function closeExportDropdown() {
  exportDropdownOpen = false;
  elements.exportOptions?.classList.remove('show');
}

/**
 * Get selected export options
 * @returns {object}
 */
function getExportOptions() {
  const fetchTypes = Array.from(
    document.querySelectorAll('input[name="fetch"]:checked')
  ).map(el => el.value);
  
  const consoleLevels = Array.from(
    document.querySelectorAll('input[name="console"]:checked')
  ).map(el => el.value);
  
  const postmessageDirections = Array.from(
    document.querySelectorAll('input[name="postmessage"]:checked')
  ).map(el => el.value);
  
  return { fetchTypes, consoleLevels, postmessageDirections };
}

/**
 * Export logs to JSON file with selected options
 */
function exportLogs() {
  const options = getExportOptions();
  
  // Filter fetch logs
  let filteredFetchLogs = [];
  if (options.fetchTypes.length > 0) {
    filteredFetchLogs = state.logs.filter(l => 
      options.fetchTypes.includes(l.requestType)
    );
  }
  
  // Filter console logs
  let filteredConsoleLogs = [];
  if (options.consoleLevels.length > 0) {
    filteredConsoleLogs = state.consoleLogs.filter(l =>
      options.consoleLevels.includes(l.logLevel)
    );
  }
  
  // Filter postmessage logs
  let filteredPostmessageLogs = [];
  if (options.postmessageDirections.length > 0) {
    filteredPostmessageLogs = state.postmessageLogs.filter(l =>
      options.postmessageDirections.includes(l.direction)
    );
  }
  
  // Check if any logs selected
  if (filteredFetchLogs.length === 0 && 
      filteredConsoleLogs.length === 0 && 
      filteredPostmessageLogs.length === 0) {
    alert('没有选中任何日志类型，或选中的类型没有日志数据');
    return;
  }
  
  const exportData = {
    exportTime: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: location.href,
    exportOptions: options,
    summary: {
      fetchLogs: filteredFetchLogs.length,
      consoleLogs: filteredConsoleLogs.length,
      postmessageLogs: filteredPostmessageLogs.length,
    },
    fetchLogs: filteredFetchLogs,
    consoleLogs: filteredConsoleLogs,
    postmessageLogs: filteredPostmessageLogs,
  };

  const filename = `sw-debug-logs-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.json`;
  downloadJson(exportData, filename);
  closeExportDropdown();
}

/**
 * Switch active tab
 * @param {string} tabName 
 */
function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === tabName + 'Tab');
  });
  if (tabName === 'console') {
    renderConsoleLogs();
  } else if (tabName === 'postmessage') {
    renderPostmessageLogs();
  } else if (tabName === 'crash') {
    loadCrashLogs();
  }
}

/**
 * Handle SW status update
 * @param {object} data 
 */
function handleStatusUpdate(data) {
  updateSwStatus(elements.swStatus, true, data.status?.version);
  state.debugEnabled = updateStatusPanel(data.status, elements);
  updateDebugButton(elements.toggleDebugBtn, state.debugEnabled);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  elements.toggleDebugBtn.addEventListener('click', toggleDebug);
  elements.exportLogsBtn.addEventListener('click', toggleExportDropdown);
  elements.doExportBtn?.addEventListener('click', exportLogs);
  elements.clearLogsBtn.addEventListener('click', handleClearLogs);
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (exportDropdownOpen && 
        !e.target.closest('.export-dropdown')) {
      closeExportDropdown();
    }
  });
  elements.refreshStatusBtn.addEventListener('click', refreshStatus);
  elements.refreshCacheBtn.addEventListener('click', refreshStatus);
  elements.enableDebugBtn?.addEventListener('click', toggleDebug);
  elements.clearConsoleLogsBtn?.addEventListener('click', handleClearConsoleLogs);
  elements.copyConsoleLogsBtn?.addEventListener('click', handleCopyConsoleLogs);

  elements.filterType?.addEventListener('change', renderLogs);
  elements.filterStatus?.addEventListener('change', renderLogs);
  elements.filterUrl?.addEventListener('input', renderLogs);
  elements.filterConsoleLevel?.addEventListener('change', renderConsoleLogs);
  elements.filterConsoleText?.addEventListener('input', renderConsoleLogs);
  elements.autoScrollCheckbox?.addEventListener('change', (e) => {
    state.autoScroll = e.target.checked;
  });

  // PostMessage log event listeners
  elements.filterMessageDirection?.addEventListener('change', renderPostmessageLogs);
  elements.filterMessageType?.addEventListener('input', renderPostmessageLogs);
  elements.clearPostmessageLogsBtn?.addEventListener('click', handleClearPostmessageLogs);
  elements.copyPostmessageLogsBtn?.addEventListener('click', handleCopyPostmessageLogs);

  // Crash log event listeners
  elements.filterCrashType?.addEventListener('change', renderCrashLogs);
  elements.refreshCrashLogsBtn?.addEventListener('click', loadCrashLogs);
  elements.clearCrashLogsBtn?.addEventListener('click', handleClearCrashLogs);
  elements.exportCrashLogsBtn?.addEventListener('click', handleExportCrashLogs);

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
}

/**
 * Setup SW message handlers
 */
function setupMessageHandlers() {
  registerMessageHandlers({
    'SW_DEBUG_STATUS': handleStatusUpdate,
    'SW_DEBUG_ENABLED': () => {
      state.debugEnabled = true;
      updateDebugButton(elements.toggleDebugBtn, true);
      // Update status panel text to show "开启"
      if (elements.debugMode) {
        elements.debugMode.textContent = '开启';
      }
      renderLogs(); // Refresh to remove "enable debug" button
      // Refresh status after debug enabled to get latest state
      // This ensures cache stats and other info are up-to-date
      refreshStatus();
    },
    'SW_DEBUG_DISABLED': () => {
      state.debugEnabled = false;
      updateDebugButton(elements.toggleDebugBtn, false);
      // Update status panel text to show "关闭"
      if (elements.debugMode) {
        elements.debugMode.textContent = '关闭';
      }
      renderLogs(); // Refresh to show "enable debug" button
    },
    'SW_DEBUG_LOG': (data) => addOrUpdateLog(data.entry),
    'SW_DEBUG_LOGS': (data) => {
      state.logs = data.logs || [];
      renderLogs();
    },
    'SW_DEBUG_LOGS_CLEARED': () => {
      state.logs = [];
      renderLogs();
    },
    'SW_CONSOLE_LOG': (data) => addConsoleLog(data.entry),
    'SW_DEBUG_CONSOLE_LOGS': (data) => {
      state.consoleLogs = data.logs || [];
      renderConsoleLogs();
    },
    'SW_DEBUG_CONSOLE_LOGS_CLEARED': () => {
      state.consoleLogs = [];
      renderConsoleLogs();
    },
    'SW_POSTMESSAGE_LOG': (data) => addPostmessageLog(data.entry),
    'SW_DEBUG_POSTMESSAGE_LOGS': (data) => {
      state.postmessageLogs = data.logs || [];
      renderPostmessageLogs();
    },
    'SW_DEBUG_POSTMESSAGE_LOGS_CLEARED': () => {
      state.postmessageLogs = [];
      renderPostmessageLogs();
    },
    'SW_DEBUG_CRASH_SNAPSHOTS': (data) => {
      state.crashLogs = data.snapshots || [];
      renderCrashLogs();
    },
    'SW_DEBUG_CRASH_SNAPSHOTS_CLEARED': () => {
      state.crashLogs = [];
      renderCrashLogs();
    },
    'SW_DEBUG_EXPORT_DATA': () => {
      // Handle export data from SW if needed
    },
  });

  onControllerChange(() => {
    updateSwStatus(elements.swStatus, true);
    refreshStatus();
  });
}

/**
 * Initialize the application
 */
async function init() {
  cacheElements();

  // Check SW availability
  const swReady = await checkSwReady();
  if (!swReady) {
    alert('此浏览器不支持 Service Worker 或 SW 未注册');
    updateSwStatus(elements.swStatus, false);
    return;
  }

  updateSwStatus(elements.swStatus, true);

  // Register PostMessage logging callback
  setPostMessageLogCallback(addPostmessageLog);

  setupMessageHandlers();
  setupEventListeners();

  // Auto-enable debug mode first when entering debug page
  // The SW_DEBUG_ENABLED handler will then call refreshStatus() to get latest state
  // This ensures proper state synchronization and avoids race conditions
  console.log('[SW Debug] Auto-enabling debug mode');
  enableDebug();
  
  // Load console logs from IndexedDB (independent of debug mode status)
  loadConsoleLogs();
  // Load PostMessage logs from SW
  loadPostMessageLogs();
  // Load crash logs
  loadCrashLogs();
  renderLogs();
  
  // Start memory monitoring
  startMemoryMonitoring();
  
  // Heartbeat mechanism to keep debug mode alive
  // This allows SW to detect when debug page is truly closed (no heartbeat for 15s)
  // vs just refreshed (new page immediately sends heartbeat)
  const HEARTBEAT_INTERVAL = 5000; // 5 seconds
  
  function sendHeartbeat() {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SW_DEBUG_HEARTBEAT' });
    }
  }
  
  // Send initial heartbeat
  sendHeartbeat();
  
  // Start heartbeat interval
  const heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
  
  // When page becomes visible again, immediately send heartbeat
  // This handles browser throttling of background tabs
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      sendHeartbeat();
    }
  });
  
  // Clean up on page unload (stop heartbeat timer)
  window.addEventListener('beforeunload', () => {
    clearInterval(heartbeatTimer);
    // Don't send disable message here - let SW detect timeout instead
    // This allows refresh to work without disabling debug mode
  });
  
}

// Start the app
init();
