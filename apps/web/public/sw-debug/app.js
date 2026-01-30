/**
 * SW Debug Panel - Main Application
 * 主入口文件 - 组织各模块并初始化应用
 */

// Core modules
import { state, elements, cacheElements } from './state.js';
import { downloadJson, formatTime } from './utils.js';
import { escapeHtml } from './common.js';

// Log entry components
import { createLogEntry } from './log-entry.js';
import { createConsoleEntry } from './console-entry.js';
import { createPostMessageEntry } from './postmessage-entry.js';

// Panel components
import { updateSwStatus, updateStatusPanel, updateDebugButton } from './status-panel.js';
import { extractUniqueTypes, updateTypeSelectOptions } from './log-panel.js';

// SW Communication
import {
  enableDebug,
  disableDebug,
  refreshStatus,
  loadFetchLogs,
  clearFetchLogs,
  clearConsoleLogs,
  loadConsoleLogs,
  loadPostMessageLogs,
  clearPostMessageLogs as clearPostMessageLogsInSW,
  loadCacheStats,
  checkSwReady,
  registerMessageHandlers,
  onControllerChange,
  setPostMessageLogCallback,
  heartbeat,
} from './sw-communication.js';

// Feature modules
import { performBackup } from './backup.js';
import {
  toggleAnalysisMode,
  updateAnalysisModeUI,
  showImportPrompt,
  triggerImportDialog,
  handleLogImport,
  setAnalysisModeCallbacks,
} from './analysis-mode.js';
import {
  toggleTheme,
  loadTheme,
  showSettingsModal,
  closeSettingsModal,
  saveSettings,
  loadSettings,
  showShortcutsModal,
  closeShortcutsModal,
  setThemeSettingsCallbacks,
} from './theme-settings.js';
import {
  loadLLMApiLogs,
  handleClearLLMApiLogs,
  handleCopyLLMApiLogs,
  handleExportLLMApiLogs,
  renderLLMApiLogs,
} from './llmapi-logs.js';
import {
  loadCrashLogs,
  handleClearCrashLogs,
  handleCopyCrashLogs,
  handleExportCrashLogs,
  renderCrashLogs,
  updateCrashCount,
  updateMemoryDisplay,
  startMemoryMonitoring,
  stopMemoryMonitoring,
} from './memory-logs.js';
import {
  openExportModal,
  closeExportModal,
  setupExportModalCheckboxes,
  exportLogs,
} from './export-modal.js';
import {
  renderLogs,
  togglePause,
  toggleSlowRequestFilter,
  updateFetchStats,
  getFilteredFetchLogs,
  addOrUpdateLog,
  toggleBookmark,
  saveBookmarks,
  loadBookmarks,
  toggleSelectMode,
  selectAllLogs,
  batchBookmarkLogs,
  batchDeleteLogs,
  exportFetchCSV,
  handleCopyFetchLogs,
  toggleLogSelection,
} from './fetch-logs.js';

import { showToast } from './toast.js';
import { filterByTimeRange } from './common.js';

// ==================== Console Logs ====================

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
 * Add a console log entry (real-time)
 * @param {object} entry
 */
function addConsoleLog(entry) {
  // In analysis mode, save to liveLogs buffer instead of display state
  if (state.isAnalysisMode) {
    // Check for duplicates in liveLogs
    if (state.liveLogs.consoleLogs.some(l => l.id === entry.id)) {
      return;
    }
    state.liveLogs.consoleLogs.unshift(entry);
    if (state.liveLogs.consoleLogs.length > 500) {
      state.liveLogs.consoleLogs.pop();
    }
    return;
  }

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
    // Update error dot if new error
    if (entry.logLevel === 'error') {
      updateErrorDots();
    }
  }
}

// ==================== PostMessage Logs ====================

/**
 * Update message type select options based on current logs
 */
function updateMessageTypeOptions() {
  const types = extractUniqueTypes(state.postmessageLogs, 'messageType');
  if (elements.filterMessageTypeSelect) {
    updateTypeSelectOptions(elements.filterMessageTypeSelect, types);
  }
}

/**
 * Render postmessage logs
 */
function renderPostmessageLogs() {
  const directionFilter = elements.filterMessageDirection?.value || '';
  const typeSelectFilter = elements.filterMessageTypeSelect?.value || '';
  const timeRangeFilter = elements.filterPmTimeRange?.value || '';
  const typeFilter = (elements.filterMessageType?.value || '').toLowerCase();

  let filteredLogs = state.postmessageLogs;

  if (directionFilter) {
    filteredLogs = filteredLogs.filter(l => l.direction === directionFilter);
  }

  // 下拉选择器过滤（精确匹配）
  if (typeSelectFilter) {
    filteredLogs = filteredLogs.filter(l => l.messageType === typeSelectFilter);
  }

  // 时间范围过滤
  filteredLogs = filterByTimeRange(filteredLogs, timeRangeFilter);

  // 搜索框过滤（模糊匹配）
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
  // In analysis mode, save to liveLogs buffer instead of display state
  if (state.isAnalysisMode) {
    // Check for duplicates in liveLogs
    if (state.liveLogs.postmessageLogs.some(l => l.id === entry.id)) {
      return;
    }
    state.liveLogs.postmessageLogs.unshift(entry);
    if (state.liveLogs.postmessageLogs.length > 500) {
      state.liveLogs.postmessageLogs.pop();
    }
    return;
  }

  // Check for duplicates
  if (state.postmessageLogs.some(l => l.id === entry.id)) {
    return;
  }

  state.postmessageLogs.unshift(entry);
  if (state.postmessageLogs.length > 500) {
    state.postmessageLogs.pop();
  }

  // 更新消息类型下拉选项
  updateMessageTypeOptions();

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
 * Get filtered postmessage logs based on current filters
 */
function getFilteredPostmessageLogs() {
  const directionFilter = elements.filterMessageDirection?.value || '';
  const typeSelectFilter = elements.filterMessageTypeSelect?.value || '';
  const typeFilter = (elements.filterMessageType?.value || '').toLowerCase();

  let filteredLogs = state.postmessageLogs;

  if (directionFilter) {
    filteredLogs = filteredLogs.filter(l => l.direction === directionFilter);
  }

  if (typeSelectFilter) {
    filteredLogs = filteredLogs.filter(l => l.messageType === typeSelectFilter);
  }

  if (typeFilter) {
    filteredLogs = filteredLogs.filter(l =>
      l.messageType?.toLowerCase().includes(typeFilter)
    );
  }

  return filteredLogs;
}

/**
 * Copy filtered postmessage logs to clipboard
 */
async function handleCopyPostmessageLogs() {
  const filteredLogs = getFilteredPostmessageLogs();

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

// ==================== Error Dots ====================

/**
 * Update error dot indicators
 */
function updateErrorDots() {
  // Console errors
  if (elements.consoleErrorDot) {
    const hasErrors = state.consoleLogs.some(l => l.logLevel === 'error');
    elements.consoleErrorDot.style.display = (hasErrors && state.activeTab !== 'console') ? 'inline-block' : 'none';
  }
  
  // LLM API errors
  if (elements.llmapiErrorDot) {
    const hasErrors = state.llmapiLogs.some(l => l.status === 'error');
    elements.llmapiErrorDot.style.display = (hasErrors && state.activeTab !== 'llmapi') ? 'inline-block' : 'none';
  }
  
  // Crash/memory errors
  if (elements.crashErrorDot) {
    const hasErrors = state.crashLogs.some(l => l.type === 'error' || l.type === 'freeze' || l.type === 'whitescreen');
    elements.crashErrorDot.style.display = (hasErrors && state.activeTab !== 'crash') ? 'inline-block' : 'none';
  }
}

// ==================== Console Log Handlers ====================

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

  // Format logs as text with all details
  const logText = filteredLogs.map(log => {
    const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
    const level = `[${log.logLevel.toUpperCase()}]`;
    const message = log.logMessage || '';
    const source = log.logSource ? `\n  来源: ${log.logSource}` : '';
    const url = log.url ? `\n  页面: ${log.url}` : '';
    const stack = log.logStack ? `\n  堆栈:\n    ${log.logStack.split('\n').join('\n    ')}` : '';
    return `${time} ${level} ${message}${source}${url}${stack}`;
  }).join('\n\n');

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

// ==================== Debug Toggle and Clear ====================

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
 * Clear all logs (Fetch, Console, PostMessage, and Memory logs)
 * Note: LLM API logs are NOT cleared here as they are important for cost tracking
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

  // Clear Memory logs (crash snapshots)
  handleClearCrashLogs();
}

// ==================== Tab Switching ====================

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
  
  // Update error dots (hide dot for active tab)
  updateErrorDots();
  
  if (tabName === 'fetch') {
    renderLogs();
  } else if (tabName === 'console') {
    renderConsoleLogs();
  } else if (tabName === 'postmessage') {
    renderPostmessageLogs();
  } else if (tabName === 'llmapi') {
    loadLLMApiLogs();
  } else if (tabName === 'crash') {
    loadCrashLogs();
  }
}

// ==================== Status Update Handler ====================

/**
 * Handle SW status update
 * @param {object} data 
 */
function handleStatusUpdate(data) {
  updateSwStatus(elements.swStatus, true, data.status?.version);
  state.debugEnabled = updateStatusPanel(data.status, elements);
  state.swStatus = data.status; // Store for export
  updateDebugButton(elements.toggleDebugBtn, state.debugEnabled);
}

// ==================== Event Listeners Setup ====================

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Analysis mode event listeners
  elements.toggleAnalysisModeBtn?.addEventListener('click', toggleAnalysisMode);
  elements.importLogsBtn?.addEventListener('click', triggerImportDialog);
  elements.importLogsInput?.addEventListener('change', handleLogImport);
  
  // Backup button event listener
  elements.backupDataBtn?.addEventListener('click', performBackup);
  
  elements.toggleDebugBtn?.addEventListener('click', toggleDebug);
  elements.exportLogsBtn?.addEventListener('click', openExportModal);
  elements.doExportBtn?.addEventListener('click', exportLogs);
  elements.closeExportModalBtn?.addEventListener('click', closeExportModal);
  elements.cancelExportBtn?.addEventListener('click', closeExportModal);
  elements.clearLogsBtn.addEventListener('click', handleClearLogs);
  
  // Close modal when clicking overlay
  elements.exportModalOverlay?.addEventListener('click', (e) => {
    if (e.target === elements.exportModalOverlay) {
      closeExportModal();
    }
  });
  
  // Setup export modal checkboxes
  setupExportModalCheckboxes();
  
  elements.refreshStatusBtn.addEventListener('click', async () => {
    refreshStatus();
    loadFetchLogs();
  });
  elements.refreshCacheBtn.addEventListener('click', refreshStatus);
  elements.enableDebugBtn?.addEventListener('click', toggleDebug);
  elements.clearConsoleLogsBtn?.addEventListener('click', handleClearConsoleLogs);
  elements.copyConsoleLogsBtn?.addEventListener('click', handleCopyConsoleLogs);

  elements.filterType?.addEventListener('change', renderLogs);
  elements.filterStatus?.addEventListener('change', renderLogs);
  elements.filterTimeRange?.addEventListener('change', renderLogs);
  elements.filterUrl?.addEventListener('input', renderLogs);
  
  // 慢请求点击过滤
  elements.statSlowRequestsWrapper?.addEventListener('click', () => {
    toggleSlowRequestFilter();
  });
  elements.togglePauseBtn?.addEventListener('click', togglePause);
  elements.toggleSelectModeBtn?.addEventListener('click', toggleSelectMode);
  elements.selectAllBtn?.addEventListener('click', selectAllLogs);
  elements.batchBookmarkBtn?.addEventListener('click', batchBookmarkLogs);
  elements.batchDeleteBtn?.addEventListener('click', batchDeleteLogs);
  elements.filterUrlRegex?.addEventListener('change', renderLogs);
  elements.copyFetchLogsBtn?.addEventListener('click', handleCopyFetchLogs);
  elements.exportFetchCSVBtn?.addEventListener('click', exportFetchCSV);
  elements.showShortcutsBtn?.addEventListener('click', showShortcutsModal);
  elements.showBookmarksOnly?.addEventListener('change', (e) => {
    state.showBookmarksOnly = e.target.checked;
    renderLogs();
  });
  elements.closeShortcutsModalBtn?.addEventListener('click', closeShortcutsModal);
  elements.shortcutsModalOverlay?.addEventListener('click', (e) => {
    if (e.target === elements.shortcutsModalOverlay) {
      closeShortcutsModal();
    }
  });
  elements.toggleThemeBtn?.addEventListener('click', toggleTheme);
  elements.showSettingsBtn?.addEventListener('click', showSettingsModal);
  elements.closeSettingsModalBtn?.addEventListener('click', closeSettingsModal);
  elements.saveSettingsBtn?.addEventListener('click', saveSettings);
  elements.settingsModalOverlay?.addEventListener('click', (e) => {
    if (e.target === elements.settingsModalOverlay) {
      closeSettingsModal();
    }
  });
  elements.filterConsoleLevel?.addEventListener('change', renderConsoleLogs);
  elements.filterConsoleText?.addEventListener('input', renderConsoleLogs);
  elements.autoScrollCheckbox?.addEventListener('change', (e) => {
    state.autoScroll = e.target.checked;
  });

  // PostMessage log event listeners
  elements.filterMessageDirection?.addEventListener('change', renderPostmessageLogs);
  elements.filterMessageTypeSelect?.addEventListener('change', renderPostmessageLogs);
  elements.filterPmTimeRange?.addEventListener('change', renderPostmessageLogs);
  elements.filterMessageType?.addEventListener('input', renderPostmessageLogs);
  elements.clearPostmessageLogsBtn?.addEventListener('click', handleClearPostmessageLogs);
  elements.copyPostmessageLogsBtn?.addEventListener('click', handleCopyPostmessageLogs);

  // LLM API log event listeners
  elements.filterLLMApiType?.addEventListener('change', renderLLMApiLogs);
  elements.filterLLMApiStatus?.addEventListener('change', renderLLMApiLogs);
  elements.refreshLLMApiLogsBtn?.addEventListener('click', loadLLMApiLogs);
  elements.copyLLMApiLogsBtn?.addEventListener('click', handleCopyLLMApiLogs);
  elements.exportLLMApiLogsBtn?.addEventListener('click', handleExportLLMApiLogs);
  elements.clearLLMApiLogsBtn?.addEventListener('click', handleClearLLMApiLogs);

  // Crash log event listeners
  elements.filterCrashType?.addEventListener('change', renderCrashLogs);
  elements.refreshCrashLogsBtn?.addEventListener('click', loadCrashLogs);
  elements.copyCrashLogsBtn?.addEventListener('click', handleCopyCrashLogs);
  elements.clearCrashLogsBtn?.addEventListener('click', handleClearCrashLogs);
  elements.exportCrashLogsBtn?.addEventListener('click', handleExportCrashLogs);

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Mobile status panel toggle
  const toggleStatusPanelBtn = document.getElementById('toggleStatusPanel');
  const leftPanel = document.querySelector('.left-panel');
  if (toggleStatusPanelBtn && leftPanel) {
    toggleStatusPanelBtn.addEventListener('click', () => {
      const isVisible = leftPanel.classList.toggle('mobile-visible');
      toggleStatusPanelBtn.classList.toggle('active', isVisible);
    });

    // Close panel when clicking outside (on logs area)
    document.querySelector('.logs-panel')?.addEventListener('click', () => {
      if (leftPanel.classList.contains('mobile-visible')) {
        leftPanel.classList.remove('mobile-visible');
        toggleStatusPanelBtn.classList.remove('active');
      }
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    // Space - Toggle pause (when in fetch tab)
    if (e.code === 'Space' && state.activeTab === 'fetch') {
      e.preventDefault();
      togglePause();
    }

    // Number keys 1-5 to switch tabs
    const tabMap = { '1': 'fetch', '2': 'console', '3': 'postmessage', '4': 'llmapi', '5': 'crash' };
    if (tabMap[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
      switchTab(tabMap[e.key]);
    }

    // Escape - Close any open modals
    if (e.key === 'Escape') {
      closeExportModal();
      closeShortcutsModal();
    }

    // ? - Show shortcuts help
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      showShortcutsModal();
    }

    // Ctrl/Cmd + L - Clear current tab logs
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      e.preventDefault();
      if (state.activeTab === 'fetch') {
        handleClearLogs();
      } else if (state.activeTab === 'console') {
        handleClearConsoleLogs();
      } else if (state.activeTab === 'postmessage') {
        handleClearPostmessageLogs();
      } else if (state.activeTab === 'llmapi') {
        handleClearLLMApiLogs();
      } else if (state.activeTab === 'crash') {
        handleClearCrashLogs();
      }
    }
  });
}

// ==================== SW Message Handlers ====================

/**
 * Add or update a log entry in the live logs buffer (used in analysis mode)
 * @param {string} logType - The type of log ('logs', 'consoleLogs', etc.)
 * @param {object} entry - The log entry
 */
function addOrUpdateLiveLog(logType, entry) {
  if (!state.liveLogs[logType]) {
    state.liveLogs[logType] = [];
  }
  const existingIndex = state.liveLogs[logType].findIndex(l => l.id === entry.id);
  if (existingIndex >= 0) {
    state.liveLogs[logType][existingIndex] = { ...state.liveLogs[logType][existingIndex], ...entry };
  } else {
    state.liveLogs[logType].unshift(entry);
  }
}

/**
 * Setup SW message handlers
 * In analysis mode, live logs are stored separately (state.liveLogs) and not displayed.
 * When exiting analysis mode, live logs are restored to the display state.
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
      if (!state.isAnalysisMode) {
        renderLogs(); // Refresh to remove "enable debug" button
      }
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
      if (!state.isAnalysisMode) {
        renderLogs(); // Refresh to show "enable debug" button
      }
    },
    'SW_DEBUG_LOG': (data) => {
      if (state.isAnalysisMode) {
        // Store in live logs buffer, don't display
        addOrUpdateLiveLog('logs', data.entry);
      } else {
        addOrUpdateLog(data.entry);
      }
    },
    'SW_DEBUG_LOGS': (data) => {
      if (state.isAnalysisMode) {
        state.liveLogs.logs = data.logs || [];
      } else {
        state.logs = data.logs || [];
        renderLogs();
      }
    },
    'SW_DEBUG_LOGS_CLEARED': () => {
      if (state.isAnalysisMode) {
        state.liveLogs.logs = [];
      } else {
        state.logs = [];
        renderLogs();
      }
    },
    'SW_CONSOLE_LOG': (data) => {
      if (state.isAnalysisMode) {
        addOrUpdateLiveLog('consoleLogs', data.entry);
      } else {
        addConsoleLog(data.entry);
      }
    },
    'SW_DEBUG_CONSOLE_LOGS': (data) => {
      if (state.isAnalysisMode) {
        state.liveLogs.consoleLogs = data.logs || [];
      } else {
        state.consoleLogs = data.logs || [];
        renderConsoleLogs();
      }
    },
    'SW_DEBUG_CONSOLE_LOGS_CLEARED': () => {
      if (state.isAnalysisMode) {
        state.liveLogs.consoleLogs = [];
      } else {
        state.consoleLogs = [];
        renderConsoleLogs();
      }
    },
    'SW_POSTMESSAGE_LOG': (data) => {
      if (state.isAnalysisMode) {
        addOrUpdateLiveLog('postmessageLogs', data.entry);
      } else {
        addPostmessageLog(data.entry);
      }
    },
    'SW_DEBUG_POSTMESSAGE_LOGS': (data) => {
      if (state.isAnalysisMode) {
        state.liveLogs.postmessageLogs = data.logs || [];
      } else {
        state.postmessageLogs = data.logs || [];
        updateMessageTypeOptions();
        renderPostmessageLogs();
      }
    },
    'SW_DEBUG_POSTMESSAGE_LOGS_CLEARED': () => {
      if (state.isAnalysisMode) {
        state.liveLogs.postmessageLogs = [];
      } else {
        state.postmessageLogs = [];
        renderPostmessageLogs();
      }
    },
    'SW_DEBUG_CRASH_SNAPSHOTS': (data) => {
      if (state.isAnalysisMode) {
        state.liveLogs.crashLogs = data.snapshots || [];
      } else {
        state.crashLogs = data.snapshots || [];
        renderCrashLogs();
      }
    },
    'SW_DEBUG_NEW_CRASH_SNAPSHOT': (data) => {
      if (data.snapshot) {
        if (state.isAnalysisMode) {
          state.liveLogs.crashLogs.unshift(data.snapshot);
          if (state.liveLogs.crashLogs.length > 100) {
            state.liveLogs.crashLogs.pop();
          }
        } else {
          state.crashLogs.unshift(data.snapshot);
          if (state.crashLogs.length > 100) {
            state.crashLogs.pop();
          }
          renderCrashLogs();
        }
      }
    },
    'SW_DEBUG_CRASH_SNAPSHOTS_CLEARED': () => {
      if (state.isAnalysisMode) {
        state.liveLogs.crashLogs = [];
      } else {
        state.crashLogs = [];
        renderCrashLogs();
      }
    },
    'SW_DEBUG_LLM_API_LOGS': (data) => {
      if (state.isAnalysisMode) {
        state.liveLogs.llmapiLogs = data.logs || [];
      } else {
        state.llmapiLogs = data.logs || [];
        renderLLMApiLogs();
      }
    },
    'SW_DEBUG_LLM_API_LOG': (data) => {
      if (data.log) {
        if (state.isAnalysisMode) {
          const existingIndex = state.liveLogs.llmapiLogs.findIndex(l => l.id === data.log.id);
          if (existingIndex >= 0) {
            state.liveLogs.llmapiLogs[existingIndex] = data.log;
          } else {
            state.liveLogs.llmapiLogs.unshift(data.log);
          }
          if (state.liveLogs.llmapiLogs.length > 200) {
            state.liveLogs.llmapiLogs.pop();
          }
        } else {
          const existingIndex = state.llmapiLogs.findIndex(l => l.id === data.log.id);
          if (existingIndex >= 0) {
            state.llmapiLogs[existingIndex] = data.log;
          } else {
            state.llmapiLogs.unshift(data.log);
          }
          if (state.llmapiLogs.length > 200) {
            state.llmapiLogs.pop();
          }
          renderLLMApiLogs();
        }
      }
    },
    'SW_DEBUG_LLM_API_LOGS_CLEARED': () => {
      if (state.isAnalysisMode) {
        state.liveLogs.llmapiLogs = [];
      } else {
        state.llmapiLogs = [];
        renderLLMApiLogs();
      }
    },
    'SW_DEBUG_EXPORT_DATA': () => {
      // Handle export data from SW if needed
    },
  });

  onControllerChange(async () => {
    // Service Worker controller 改变时，等待新 SW 完全就绪后再刷新
    // 避免在 SW 更新过程中发起 RPC 调用
    console.log('[SW Debug] Controller changed, waiting for new SW to be ready...');
    
    // 等待一段时间让新的 SW 完全接管
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('[SW Debug] Refreshing status after SW update...');
    updateSwStatus(elements.swStatus, true);
    
    // 重新加载所有数据
    refreshStatus();
    loadFetchLogs();
    loadConsoleLogs();
    loadPostMessageLogs();
  });
}

// ==================== Initialization ====================

/**
 * Initialize the application
 */
async function init() {
  cacheElements();
  
  // Load saved bookmarks, theme, and settings first (before any early returns)
  loadBookmarks();
  loadTheme();
  loadSettings();
  
  // Setup callbacks for modules that need render functions
  setAnalysisModeCallbacks({
    renderLogs,
    renderConsoleLogs,
    renderPostmessageLogs,
    renderCrashLogs,
    renderLLMApiLogs,
    updateConsoleCount,
    updatePostmessageCount,
    updateCrashCount,
    updateErrorDots,
    updateMessageTypeOptions,
    loadCrashLogs,
    loadLLMApiLogs,
    updateMemoryDisplay,
  });
  
  setThemeSettingsCallbacks({
    renderLogs,
  });
  
  // Setup event listeners (always needed, even in analysis mode)
  setupEventListeners();
  
  // Check if analysis mode should be auto-enabled (e.g., via URL parameter)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('analysis')) {
    state.isAnalysisMode = true;
    updateAnalysisModeUI();
    showImportPrompt();
    console.log('[SW Debug] Started in analysis mode');
    return;
  }

  // Check SW availability
  if (!('serviceWorker' in navigator)) {
    alert('此浏览器不支持 Service Worker\n\n提示：您可以使用分析模式导入用户日志进行分析');
    updateSwStatus(elements.swStatus, false);
    return;
  }
  
  const swReady = await checkSwReady();
  
  if (!swReady) {
    // SW not ready - offer analysis mode as alternative
    const useAnalysisMode = confirm('Service Worker 未注册或未激活\n\n您可以：\n1. 点击"取消"后访问主应用，然后刷新此页面\n2. 点击"确定"进入分析模式，导入用户日志进行分析');
    
    if (useAnalysisMode) {
      state.isAnalysisMode = true;
      updateAnalysisModeUI();
      showImportPrompt();
      return;
    }
    
    updateSwStatus(elements.swStatus, false);
    return;
  }
  
  console.log('[SW Debug] SW ready, controller:', !!navigator.serviceWorker.controller);

  updateSwStatus(elements.swStatus, true);

  // Register PostMessage logging callback
  setPostMessageLogCallback(addPostmessageLog);

  setupMessageHandlers();

  // Auto-enable debug mode first when entering debug page
  // The SW_DEBUG_ENABLED handler will then call refreshStatus() to get latest state
  // This ensures proper state synchronization and avoids race conditions
  console.log('[SW Debug] Auto-enabling debug mode');
  enableDebug();
  
  // 等待 SW 处理 debug mode 启用消息
  // 这确保 SW 端的 duplex channel 已经建立
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Load fetch logs (existing logs from before debug mode was enabled won't exist,
  // but logs generated during this session will be available)
  loadFetchLogs();
  // Load console logs from IndexedDB (independent of debug mode status)
  loadConsoleLogs();
  // Load PostMessage logs from SW
  loadPostMessageLogs();
  // Load crash logs
  loadCrashLogs();
  // Load LLM API logs (ensure data is available for export even without visiting the tab)
  loadLLMApiLogs();
  renderLogs();
  
  // Start memory monitoring
  startMemoryMonitoring();
  
  // Heartbeat mechanism to keep debug mode alive
  // This allows SW to detect when debug page is truly closed (no heartbeat for 15s)
  // vs just refreshed (new page immediately sends heartbeat)
  const HEARTBEAT_INTERVAL = 5000; // 5 seconds
  
  // Send initial heartbeat
  heartbeat();
  
  // Start heartbeat interval
  const heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL);
  
  // When page becomes visible again, immediately send heartbeat
  // This handles browser throttling of background tabs
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      heartbeat();
    }
  });
  
  // Clean up on page unload (stop heartbeat timer and memory monitoring)
  window.addEventListener('beforeunload', () => {
    clearInterval(heartbeatTimer);
    stopMemoryMonitoring();
    // Don't send disable message here - let SW detect timeout instead
    // This allows refresh to work without disabling debug mode
  });
  
}

// Start the app
init();
