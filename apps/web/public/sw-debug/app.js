/**
 * SW Debug Panel - Main Application
 */

import { downloadJson, formatTime } from './utils.js';
import { createLogEntry } from './log-entry.js';
import { createConsoleEntry } from './console-entry.js';
import { createPostMessageEntry } from './postmessage-entry.js';
import { updateSwStatus, updateStatusPanel, updateDebugButton } from './status-panel.js';
import { extractUniqueTypes, updateTypeSelectOptions } from './log-panel.js';
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

/**
 * Filter logs by time range
 * @param {Array} logs 
 * @param {string} timeRangeMinutes - Minutes as string, or empty for all
 * @returns {Array}
 */
function filterByTimeRange(logs, timeRangeMinutes) {
  if (!timeRangeMinutes) return logs;
  
  const minutes = parseInt(timeRangeMinutes);
  if (isNaN(minutes)) return logs;
  
  const cutoffTime = Date.now() - (minutes * 60 * 1000);
  return logs.filter(log => log.timestamp >= cutoffTime);
}

/**
 * Check if a request is slow (> 1 second)
 * @param {number} duration - Duration in milliseconds
 * @returns {'normal'|'slow'|'very-slow'}
 */
function getSpeedClass(duration) {
  if (!duration) return 'normal';
  if (duration >= 3000) return 'very-slow';
  if (duration >= 1000) return 'slow';
  return 'normal';
}

/**
 * Toggle pause state
 */
function togglePause() {
  state.isPaused = !state.isPaused;
  updatePauseButton();
  
  if (!state.isPaused && state.pendingLogs.length > 0) {
    // Apply pending logs when resuming
    state.pendingLogs.forEach(log => {
      addOrUpdateLog(log, true); // true = skip render
    });
    state.pendingLogs = [];
    renderLogs();
  }
}

/**
 * Toggle slow request filter
 */
function toggleSlowRequestFilter() {
  state.filterSlowOnly = !state.filterSlowOnly;
  updateSlowRequestsUI();
  renderLogs();
}

/**
 * Update slow requests UI (highlight when filter is active)
 */
function updateSlowRequestsUI() {
  const wrapper = elements.statSlowRequestsWrapper;
  if (wrapper) {
    if (state.filterSlowOnly) {
      wrapper.classList.add('active');
    } else {
      wrapper.classList.remove('active');
    }
  }
}

/**
 * Update pause button appearance
 */
function updatePauseButton() {
  const btn = elements.togglePauseBtn;
  if (!btn) return;
  
  if (state.isPaused) {
    btn.textContent = `⏸️ 暂停`;
    if (state.pendingLogs.length > 0) {
      btn.textContent += ` (${state.pendingLogs.length})`;
    }
    btn.classList.add('paused');
  } else {
    btn.textContent = '▶️ 实时';
    btn.classList.remove('paused');
  }
}

/**
 * Update fetch statistics panel
 */
function updateFetchStats() {
  const logs = state.logs.filter(l => !isBlacklistedUrl(l.url));
  
  // Total requests
  if (elements.statTotalRequests) {
    elements.statTotalRequests.textContent = logs.length;
  }
  
  // Success rate
  if (elements.statSuccessRate) {
    const successCount = logs.filter(l => l.status >= 200 && l.status < 400).length;
    const rate = logs.length > 0 ? ((successCount / logs.length) * 100).toFixed(1) : 0;
    elements.statSuccessRate.textContent = `${rate}%`;
    elements.statSuccessRate.style.color = rate >= 95 ? 'var(--success-color)' : (rate >= 80 ? 'var(--warning-color)' : 'var(--error-color)');
  }
  
  // Average duration
  if (elements.statAvgDuration) {
    const durations = logs.filter(l => l.duration > 0).map(l => l.duration);
    const avg = durations.length > 0 ? (durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    elements.statAvgDuration.textContent = avg > 0 ? `${Math.round(avg)}ms` : '-';
    elements.statAvgDuration.style.color = avg < 500 ? 'var(--success-color)' : (avg < 1000 ? 'var(--warning-color)' : 'var(--error-color)');
  }
  
  // Cache hit rate
  if (elements.statCacheHit) {
    const cachedCount = logs.filter(l => l.cached).length;
    const rate = logs.length > 0 ? ((cachedCount / logs.length) * 100).toFixed(1) : 0;
    elements.statCacheHit.textContent = `${rate}%`;
  }
  
  // Slow requests count
  if (elements.statSlowRequests) {
    const slowCount = logs.filter(l => l.duration >= 1000).length;
    elements.statSlowRequests.textContent = slowCount;
    elements.statSlowRequests.style.color = slowCount === 0 ? 'var(--success-color)' : 'var(--warning-color)';
  }
  
  // Duration distribution chart
  updateDurationChart(logs);
}

/**
 * Update duration distribution chart
 */
function updateDurationChart(logs) {
  const logsWithDuration = logs.filter(l => l.duration > 0);
  const total = logsWithDuration.length;
  
  if (total === 0) {
    if (elements.chartFast) elements.chartFast.style.width = '0%';
    if (elements.chartMedium) elements.chartMedium.style.width = '0%';
    if (elements.chartSlow) elements.chartSlow.style.width = '0%';
    if (elements.chartVerySlow) elements.chartVerySlow.style.width = '0%';
    return;
  }
  
  // Categorize by duration
  const fast = logsWithDuration.filter(l => l.duration < 100).length;
  const medium = logsWithDuration.filter(l => l.duration >= 100 && l.duration < 500).length;
  const slow = logsWithDuration.filter(l => l.duration >= 500 && l.duration < 1000).length;
  const verySlow = logsWithDuration.filter(l => l.duration >= 1000).length;
  
  // Calculate percentages
  const fastPct = (fast / total) * 100;
  const mediumPct = (medium / total) * 100;
  const slowPct = (slow / total) * 100;
  const verySlowPct = (verySlow / total) * 100;
  
  // Update chart bars
  if (elements.chartFast) {
    elements.chartFast.style.width = `${fastPct}%`;
    elements.chartFast.title = `<100ms: ${fast} (${fastPct.toFixed(1)}%)`;
  }
  if (elements.chartMedium) {
    elements.chartMedium.style.width = `${mediumPct}%`;
    elements.chartMedium.title = `100-500ms: ${medium} (${mediumPct.toFixed(1)}%)`;
  }
  if (elements.chartSlow) {
    elements.chartSlow.style.width = `${slowPct}%`;
    elements.chartSlow.title = `500ms-1s: ${slow} (${slowPct.toFixed(1)}%)`;
  }
  if (elements.chartVerySlow) {
    elements.chartVerySlow.style.width = `${verySlowPct}%`;
    elements.chartVerySlow.title = `>1s: ${verySlow} (${verySlowPct.toFixed(1)}%)`;
  }
}

/**
 * Export fetch logs as CSV
 */
function exportFetchCSV() {
  const filteredLogs = getFilteredFetchLogs();
  if (filteredLogs.length === 0) {
    alert('没有可导出的日志');
    return;
  }
  
  // CSV header
  const headers = ['时间', '方法', '状态', 'URL', '耗时(ms)', '类型', '缓存'];
  const rows = [headers.join(',')];
  
  // CSV rows
  filteredLogs.forEach(log => {
    const time = new Date(log.timestamp).toLocaleString('zh-CN', { hour12: false });
    const row = [
      `"${time}"`,
      log.method || 'GET',
      log.status || '-',
      `"${(log.url || '').replace(/"/g, '""')}"`,
      log.duration || '',
      log.requestType || '-',
      log.cached ? '是' : '否'
    ];
    rows.push(row.join(','));
  });
  
  const csvContent = '\uFEFF' + rows.join('\n'); // BOM for Excel
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fetch-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Show shortcuts modal
 */
function showShortcutsModal() {
  if (elements.shortcutsModalOverlay) {
    elements.shortcutsModalOverlay.style.display = 'flex';
  }
}

/**
 * Close shortcuts modal
 */
function closeShortcutsModal() {
  if (elements.shortcutsModalOverlay) {
    elements.shortcutsModalOverlay.style.display = 'none';
  }
}

/**
 * Toggle bookmark for a log entry
 * @param {string} logId
 */
function toggleBookmark(logId) {
  if (state.bookmarkedLogIds.has(logId)) {
    state.bookmarkedLogIds.delete(logId);
  } else {
    state.bookmarkedLogIds.add(logId);
  }
  // Save to localStorage
  saveBookmarks();
  renderLogs();
}

/**
 * Save bookmarks to localStorage
 */
function saveBookmarks() {
  try {
    localStorage.setItem('sw-debug-bookmarks', JSON.stringify([...state.bookmarkedLogIds]));
  } catch (e) {
    console.error('Failed to save bookmarks:', e);
  }
}

/**
 * Load bookmarks from localStorage
 */
function loadBookmarks() {
  try {
    const saved = localStorage.getItem('sw-debug-bookmarks');
    if (saved) {
      state.bookmarkedLogIds = new Set(JSON.parse(saved));
    }
  } catch (e) {
    console.error('Failed to load bookmarks:', e);
  }
}

/**
 * Toggle theme between light and dark
 */
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  updateThemeIcon(newTheme);
  saveTheme(newTheme);
}

/**
 * Update theme icon (SVG)
 */
function updateThemeIcon(theme) {
  if (elements.themeIcon) {
    if (theme === 'dark') {
      // Sun icon for dark mode (click to switch to light)
      elements.themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    } else {
      // Moon icon for light mode (click to switch to dark)
      elements.themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    }
  }
}

/**
 * Save theme preference
 */
function saveTheme(theme) {
  try {
    localStorage.setItem('sw-debug-theme', theme);
  } catch (e) {
    console.error('Failed to save theme:', e);
  }
}

/**
 * Load saved theme preference
 */
function loadTheme() {
  try {
    const savedTheme = localStorage.getItem('sw-debug-theme');
    // Also check system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
  } catch (e) {
    console.error('Failed to load theme:', e);
  }
}

/**
 * Show settings modal
 */
function showSettingsModal() {
  if (elements.settingsModalOverlay) {
    // Populate current values
    if (elements.settingMaxLogs) {
      elements.settingMaxLogs.value = state.settings.maxLogs.toString();
    }
    if (elements.settingAutoClean) {
      elements.settingAutoClean.value = state.settings.autoCleanMinutes.toString();
    }
    if (elements.settingKeepBookmarks) {
      elements.settingKeepBookmarks.checked = state.settings.keepBookmarks;
    }
    elements.settingsModalOverlay.style.display = 'flex';
  }
}

/**
 * Close settings modal
 */
function closeSettingsModal() {
  if (elements.settingsModalOverlay) {
    elements.settingsModalOverlay.style.display = 'none';
  }
}

/**
 * Save settings
 */
function saveSettings() {
  const newSettings = {
    maxLogs: parseInt(elements.settingMaxLogs?.value || '500'),
    autoCleanMinutes: parseInt(elements.settingAutoClean?.value || '0'),
    keepBookmarks: elements.settingKeepBookmarks?.checked ?? true,
  };
  
  state.settings = newSettings;
  
  // Save to localStorage
  try {
    localStorage.setItem('sw-debug-settings', JSON.stringify(newSettings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
  
  // Apply new max logs limit
  applyMaxLogsLimit();
  
  // Setup auto clean timer
  setupAutoCleanTimer();
  
  closeSettingsModal();
}

/**
 * Load saved settings
 */
function loadSettings() {
  try {
    const saved = localStorage.getItem('sw-debug-settings');
    if (saved) {
      state.settings = { ...state.settings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  
  // Setup auto clean timer based on saved settings
  setupAutoCleanTimer();
}

/**
 * Apply max logs limit to current logs
 */
function applyMaxLogsLimit() {
  const maxLogs = state.settings.maxLogs;
  
  if (state.logs.length > maxLogs) {
    // Keep bookmarked logs if setting is enabled
    if (state.settings.keepBookmarks) {
      const bookmarked = state.logs.filter(l => state.bookmarkedLogIds.has(l.id));
      const nonBookmarked = state.logs.filter(l => !state.bookmarkedLogIds.has(l.id));
      state.logs = [...bookmarked, ...nonBookmarked.slice(0, maxLogs - bookmarked.length)];
    } else {
      state.logs = state.logs.slice(0, maxLogs);
    }
    renderLogs();
  }
}

/**
 * Setup auto clean timer
 */
function setupAutoCleanTimer() {
  // Clear existing timer
  if (state.autoCleanTimerId) {
    clearInterval(state.autoCleanTimerId);
    state.autoCleanTimerId = null;
  }
  
  const minutes = state.settings.autoCleanMinutes;
  if (minutes <= 0) return;
  
  // Run cleanup every minute
  state.autoCleanTimerId = setInterval(() => {
    autoCleanLogs();
  }, 60000);
  
  // Also run immediately
  autoCleanLogs();
}

/**
 * Auto clean old logs
 */
function autoCleanLogs() {
  const minutes = state.settings.autoCleanMinutes;
  if (minutes <= 0) return;
  
  const cutoffTime = Date.now() - (minutes * 60 * 1000);
  const beforeCount = state.logs.length;
  
  if (state.settings.keepBookmarks) {
    state.logs = state.logs.filter(l => 
      l.timestamp >= cutoffTime || state.bookmarkedLogIds.has(l.id)
    );
  } else {
    state.logs = state.logs.filter(l => l.timestamp >= cutoffTime);
  }
  
  if (state.logs.length !== beforeCount) {
    renderLogs();
  }
}

/**
 * Toggle select mode for batch operations
 */
function toggleSelectMode() {
  state.isSelectMode = !state.isSelectMode;
  state.selectedLogIds.clear();
  updateSelectModeUI();
  renderLogs();
}

/**
 * Update select mode UI
 */
function updateSelectModeUI() {
  if (elements.toggleSelectModeBtn) {
    elements.toggleSelectModeBtn.textContent = state.isSelectMode ? '✅ 取消' : '☑️ 选择';
    elements.toggleSelectModeBtn.style.background = state.isSelectMode ? 'var(--primary-color)' : '';
    elements.toggleSelectModeBtn.style.color = state.isSelectMode ? '#fff' : '';
  }
  if (elements.batchActionsEl) {
    elements.batchActionsEl.style.display = state.isSelectMode ? 'flex' : 'none';
  }
  updateSelectedCount();
}

/**
 * Update selected count display
 */
function updateSelectedCount() {
  if (elements.selectedCountEl) {
    elements.selectedCountEl.textContent = `已选 ${state.selectedLogIds.size} 条`;
  }
}

/**
 * Toggle selection of a log entry
 */
function toggleLogSelection(logId) {
  if (state.selectedLogIds.has(logId)) {
    state.selectedLogIds.delete(logId);
  } else {
    state.selectedLogIds.add(logId);
  }
  updateSelectedCount();
  // Update checkbox in DOM
  const checkbox = document.querySelector(`.log-select-checkbox[data-id="${logId}"]`);
  if (checkbox) {
    checkbox.checked = state.selectedLogIds.has(logId);
  }
}

/**
 * Select all visible logs
 */
function selectAllLogs() {
  const filteredLogs = getFilteredFetchLogs();
  const allSelected = filteredLogs.every(l => state.selectedLogIds.has(l.id));
  
  if (allSelected) {
    // Deselect all
    filteredLogs.forEach(l => state.selectedLogIds.delete(l.id));
  } else {
    // Select all
    filteredLogs.forEach(l => state.selectedLogIds.add(l.id));
  }
  
  updateSelectedCount();
  renderLogs();
}

/**
 * Batch bookmark selected logs
 */
function batchBookmarkLogs() {
  if (state.selectedLogIds.size === 0) {
    alert('请先选择日志');
    return;
  }
  
  state.selectedLogIds.forEach(id => {
    state.bookmarkedLogIds.add(id);
  });
  
  saveBookmarks();
  state.selectedLogIds.clear();
  updateSelectedCount();
  renderLogs();
}

/**
 * Batch delete selected logs
 */
function batchDeleteLogs() {
  if (state.selectedLogIds.size === 0) {
    alert('请先选择日志');
    return;
  }
  
  if (!confirm(`确定要删除选中的 ${state.selectedLogIds.size} 条日志吗？`)) {
    return;
  }
  
  state.logs = state.logs.filter(l => !state.selectedLogIds.has(l.id));
  
  // Also remove from bookmarks
  state.selectedLogIds.forEach(id => {
    state.bookmarkedLogIds.delete(id);
  });
  saveBookmarks();
  
  state.selectedLogIds.clear();
  updateSelectedCount();
  renderLogs();
}

/**
 * Find related requests based on URL pattern or timing
 * @param {object} log - The log entry to find related requests for
 * @returns {Array} - Array of related log entries
 */
function findRelatedRequests(log) {
  if (!log.url) return [];
  
  try {
    const urlObj = new URL(log.url);
    const basePath = urlObj.pathname.split('/').slice(0, 3).join('/'); // First 2 path segments
    const timestamp = log.timestamp;
    const timeWindow = 5000; // 5 second window
    
    return state.logs.filter(l => {
      if (l.id === log.id) return false;
      if (!l.url) return false;
      
      try {
        const otherUrl = new URL(l.url);
        
        // Same host
        if (otherUrl.hostname !== urlObj.hostname) return false;
        
        // Similar path OR within time window
        const otherBasePath = otherUrl.pathname.split('/').slice(0, 3).join('/');
        const pathMatch = otherBasePath === basePath;
        const timeMatch = Math.abs(l.timestamp - timestamp) <= timeWindow;
        
        return pathMatch || timeMatch;
      } catch {
        return false;
      }
    }).slice(0, 10); // Limit to 10 related requests
  } catch {
    return [];
  }
}

/**
 * Render related requests section for log details
 * @param {object} log - The log entry
 * @returns {string} - HTML string
 */
function renderRelatedRequests(log) {
  const related = findRelatedRequests(log);
  if (related.length === 0) return '';
  
  const items = related.map(r => {
    const time = new Date(r.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
    const status = r.status || '...';
    const statusClass = r.status >= 200 && r.status < 400 ? 'success' : (r.status >= 400 ? 'error' : '');
    const duration = r.duration ? `${r.duration}ms` : '-';
    // Show full URL, let CSS handle wrapping
    const displayUrl = r.url || '-';
    
    return `
      <div class="related-request" data-id="${r.id}" style="padding: 4px 8px; cursor: pointer; border-radius: 4px; margin-bottom: 4px; background: var(--bg-tertiary); word-break: break-word;">
        <span style="color: var(--text-muted); font-size: 11px;">${time}</span>
        <span class="log-status ${statusClass}" style="font-size: 11px; margin-left: 8px;">${status}</span>
        <span style="margin-left: 8px; font-size: 12px;">${displayUrl}</span>
        <span style="color: var(--text-muted); font-size: 11px; margin-left: 8px;">${duration}</span>
      </div>
    `;
  }).join('');
  
  return `
    <div class="detail-section" style="margin-top: 12px;">
      <h4>🔗 相关请求 (${related.length})</h4>
      <div class="related-requests-list" style="margin-top: 8px; max-height: 200px; overflow-y: auto;">
        ${items}
      </div>
    </div>
  `;
}

// Make renderRelatedRequests available globally
window.renderRelatedRequests = renderRelatedRequests;

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

// Application State
const state = {
  debugEnabled: false,
  logs: [],
  consoleLogs: [],
  postmessageLogs: [],
  crashLogs: [], // Crash snapshots
  llmapiLogs: [], // LLM API call logs
  swStatus: null, // SW status data for export
  autoScroll: true,
  activeTab: 'fetch',
  expandedLogIds: new Set(), // Track expanded fetch log IDs
  expandedStackIds: new Set(), // Track expanded console stack IDs
  expandedPmIds: new Set(), // Track expanded postmessage log IDs
  expandedCrashIds: new Set(), // Track expanded crash log IDs
  expandedLLMApiIds: new Set(), // Track expanded LLM API log IDs
  // New states for enhanced features
  bookmarkedLogIds: new Set(), // Bookmarked/starred log IDs
  showBookmarksOnly: false, // Filter to show only bookmarked logs
  filterSlowOnly: false, // Filter to show only slow requests (>1s)
  isSelectMode: false, // Batch select mode
  selectedLogIds: new Set(), // Selected log IDs for batch operations
  isPaused: false, // Pause real-time updates
  pendingLogs: [], // Logs received while paused
  hasNewErrors: false, // Track new errors for tab indicator
  hasNewCrashLogs: false, // Track new crash logs
  hasNewLLMApiErrors: false, // Track new LLM API errors
  // Settings
  settings: {
    maxLogs: 500,
    autoCleanMinutes: 0,
    keepBookmarks: true,
  },
  autoCleanTimerId: null,
};

// Memory monitoring interval
let memoryMonitorInterval = null;

// DOM Elements cache
let elements = {};

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
    filterTimeRange: document.getElementById('filterTimeRange'),
    filterUrl: document.getElementById('filterUrl'),
    filterUrlRegex: document.getElementById('filterUrlRegex'),
    togglePauseBtn: document.getElementById('togglePause'),
    toggleSelectModeBtn: document.getElementById('toggleSelectMode'),
    batchActionsEl: document.getElementById('batchActions'),
    selectAllBtn: document.getElementById('selectAll'),
    batchBookmarkBtn: document.getElementById('batchBookmark'),
    batchDeleteBtn: document.getElementById('batchDelete'),
    selectedCountEl: document.getElementById('selectedCount'),
    fetchCountEl: document.getElementById('fetchCount'),
    exportFetchCSVBtn: document.getElementById('exportFetchCSV'),
    showShortcutsBtn: document.getElementById('showShortcuts'),
    showBookmarksOnly: document.getElementById('showBookmarksOnly'),
    shortcutsModalOverlay: document.getElementById('shortcutsModalOverlay'),
    closeShortcutsModalBtn: document.getElementById('closeShortcutsModal'),
    toggleThemeBtn: document.getElementById('toggleTheme'),
    themeIcon: document.getElementById('themeIcon'),
    showSettingsBtn: document.getElementById('showSettings'),
    settingsModalOverlay: document.getElementById('settingsModalOverlay'),
    closeSettingsModalBtn: document.getElementById('closeSettingsModal'),
    saveSettingsBtn: document.getElementById('saveSettings'),
    settingMaxLogs: document.getElementById('settingMaxLogs'),
    settingAutoClean: document.getElementById('settingAutoClean'),
    settingKeepBookmarks: document.getElementById('settingKeepBookmarks'),
    // Stats elements
    statTotalRequests: document.getElementById('statTotalRequests'),
    statSuccessRate: document.getElementById('statSuccessRate'),
    statAvgDuration: document.getElementById('statAvgDuration'),
    statCacheHit: document.getElementById('statCacheHit'),
    statSlowRequests: document.getElementById('statSlowRequests'),
    statSlowRequestsWrapper: document.getElementById('statSlowRequestsWrapper'),
    // Duration chart elements
    chartFast: document.getElementById('chartFast'),
    chartMedium: document.getElementById('chartMedium'),
    chartSlow: document.getElementById('chartSlow'),
    chartVerySlow: document.getElementById('chartVerySlow'),
    filterConsoleLevel: document.getElementById('filterConsoleLevel'),
    filterConsoleText: document.getElementById('filterConsoleText'),
    clearConsoleLogsBtn: document.getElementById('clearConsoleLogs'),
    copyConsoleLogsBtn: document.getElementById('copyConsoleLogs'),
    autoScrollCheckbox: document.getElementById('autoScroll'),
    consoleCountEl: document.getElementById('consoleCount'),
    postmessageCountEl: document.getElementById('postmessageCount'),
    postmessageLogsContainer: document.getElementById('postmessageLogsContainer'),
    filterMessageDirection: document.getElementById('filterMessageDirection'),
    filterMessageTypeSelect: document.getElementById('filterMessageTypeSelect'),
    filterPmTimeRange: document.getElementById('filterPmTimeRange'),
    filterMessageType: document.getElementById('filterMessageType'),
    // Error dot indicators
    consoleErrorDot: document.getElementById('consoleErrorDot'),
    llmapiErrorDot: document.getElementById('llmapiErrorDot'),
    crashErrorDot: document.getElementById('crashErrorDot'),
    clearPostmessageLogsBtn: document.getElementById('clearPostmessageLogs'),
    copyPostmessageLogsBtn: document.getElementById('copyPostmessageLogs'),
    copyFetchLogsBtn: document.getElementById('copyFetchLogs'),
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
    // Export modal elements
    exportModalOverlay: document.getElementById('exportModalOverlay'),
    closeExportModalBtn: document.getElementById('closeExportModal'),
    cancelExportBtn: document.getElementById('cancelExport'),
    doExportBtn: document.getElementById('doExport'),
    selectAllExport: document.getElementById('selectAllExport'),
    // LLM API logs elements
    llmapiLogsContainer: document.getElementById('llmapiLogsContainer'),
    filterLLMApiType: document.getElementById('filterLLMApiType'),
    filterLLMApiStatus: document.getElementById('filterLLMApiStatus'),
    refreshLLMApiLogsBtn: document.getElementById('refreshLLMApiLogs'),
    copyLLMApiLogsBtn: document.getElementById('copyLLMApiLogs'),
    exportLLMApiLogsBtn: document.getElementById('exportLLMApiLogs'),
    clearLLMApiLogsBtn: document.getElementById('clearLLMApiLogs'),
    // Crash logs elements
    crashCountEl: document.getElementById('crashCount'),
    crashLogsContainer: document.getElementById('crashLogsContainer'),
    filterCrashType: document.getElementById('filterCrashType'),
    refreshCrashLogsBtn: document.getElementById('refreshCrashLogs'),
    copyCrashLogsBtn: document.getElementById('copyCrashLogs'),
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
  const timeRangeFilter = elements.filterTimeRange?.value || '';
  const urlFilter = (elements.filterUrl?.value || '').toLowerCase();

  let filteredLogs = state.logs;

  // Filter out blacklisted domains
  filteredLogs = filteredLogs.filter(l => !isBlacklistedUrl(l.url));

  if (typeFilter) {
    filteredLogs = filteredLogs.filter(l => l.requestType === typeFilter);
  }

  if (statusFilter) {
    if (statusFilter === 'error') {
      // Filter failed requests (4xx, 5xx, or has error)
      filteredLogs = filteredLogs.filter(l => l.status >= 400 || l.error);
    } else if (statusFilter === '500') {
      filteredLogs = filteredLogs.filter(l => l.status >= 500);
    } else if (statusFilter === 'slow') {
      // Filter slow requests (> 1 second)
      filteredLogs = filteredLogs.filter(l => l.duration >= 1000);
    } else {
      filteredLogs = filteredLogs.filter(l => l.status === parseInt(statusFilter));
    }
  }

  // Apply time range filter
  filteredLogs = filterByTimeRange(filteredLogs, timeRangeFilter);

  // URL filter with optional regex support
  if (urlFilter) {
    const useRegex = elements.filterUrlRegex?.checked || false;
    if (useRegex) {
      try {
        const regex = new RegExp(urlFilter, 'i');
        filteredLogs = filteredLogs.filter(l => regex.test(l.url || ''));
      } catch (e) {
        // Invalid regex, fall back to simple match
        filteredLogs = filteredLogs.filter(l => l.url?.toLowerCase().includes(urlFilter));
      }
    } else {
      filteredLogs = filteredLogs.filter(l => l.url?.toLowerCase().includes(urlFilter));
    }
  }

  // Bookmarks filter
  if (state.showBookmarksOnly) {
    filteredLogs = filteredLogs.filter(l => state.bookmarkedLogIds.has(l.id));
  }

  // Slow requests filter (via stats bar click)
  if (state.filterSlowOnly) {
    filteredLogs = filteredLogs.filter(l => l.duration >= 1000);
  }

  // Update statistics panel
  updateFetchStats();

  // Update fetch count
  if (elements.fetchCountEl) {
    const slowCount = filteredLogs.filter(l => l.duration >= 1000).length;
    const errorCount = filteredLogs.filter(l => l.status >= 400 || l.error).length;
    let countText = `(${filteredLogs.length})`;
    if (slowCount > 0 || errorCount > 0) {
      const parts = [];
      if (errorCount > 0) parts.push(`<span style="color:var(--error-color)">${errorCount} err</span>`);
      if (slowCount > 0) parts.push(`<span style="color:var(--warning-color)">${slowCount} slow</span>`);
      countText = `(${parts.join(', ')})`;
    }
    elements.fetchCountEl.innerHTML = countText;
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
    const isBookmarked = state.bookmarkedLogIds.has(log.id);
    const isSelected = state.selectedLogIds.has(log.id);
    const entry = createLogEntry(
      log, 
      isExpanded, 
      (id, expanded) => {
        // Update expanded state
        if (expanded) {
          state.expandedLogIds.add(id);
        } else {
          state.expandedLogIds.delete(id);
        }
      },
      isBookmarked,
      toggleBookmark,
      state.isSelectMode,
      isSelected,
      toggleLogSelection
    );
    
    // Add slow request class for highlighting
    const speedClass = getSpeedClass(log.duration);
    if (speedClass !== 'normal') {
      entry.classList.add('slow-request');
    }
    
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
 * 判断日志是否为问题请求（错误、慢请求）
 */
function isProblemLog(log) {
  // 错误请求：状态码 >= 400 或有错误信息
  if (log.status >= 400 || log.error) return true;
  // 慢请求：耗时 >= 1秒
  if (log.duration >= 1000) return true;
  return false;
}

/**
 * 裁剪日志，优先保留问题请求和收藏
 */
function trimLogsWithPriority(maxLogs) {
  if (state.logs.length <= maxLogs) return;
  
  // 分类日志
  const bookmarked = [];
  const problems = [];
  const normal = [];
  
  state.logs.forEach(log => {
    if (state.bookmarkedLogIds.has(log.id)) {
      bookmarked.push(log);
    } else if (isProblemLog(log)) {
      problems.push(log);
    } else {
      normal.push(log);
    }
  });
  
  // 计算需要保留的数量
  const mustKeep = bookmarked.length + problems.length;
  
  if (mustKeep >= maxLogs) {
    // 问题请求太多，只保留收藏 + 部分问题请求
    const problemsToKeep = Math.max(0, maxLogs - bookmarked.length);
    state.logs = [...bookmarked, ...problems.slice(0, problemsToKeep)];
  } else {
    // 保留所有收藏和问题请求，剩余空间给正常请求
    const normalToKeep = maxLogs - mustKeep;
    state.logs = [...bookmarked, ...problems, ...normal.slice(0, normalToKeep)];
  }
  
  // 按时间排序（最新的在前）
  state.logs.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Add or update a log entry
 * @param {object} entry 
 * @param {boolean} skipRender - Skip rendering (for batch updates)
 */
function addOrUpdateLog(entry, skipRender = false) {
  // Skip blacklisted URLs
  if (isBlacklistedUrl(entry.url)) {
    return;
  }

  // If paused, add to pending queue
  if (state.isPaused && !skipRender) {
    state.pendingLogs.push(entry);
    updatePauseButton();
    return;
  }

  const existingIndex = state.logs.findIndex(l => l.id === entry.id);
  if (existingIndex !== -1) {
    state.logs[existingIndex] = { ...state.logs[existingIndex], ...entry };
  } else {
    state.logs.unshift(entry);
    // Use configurable max logs limit
    const maxLogs = state.settings?.maxLogs || 500;
    if (state.logs.length > maxLogs) {
      // 优先保留问题请求（错误、慢请求、收藏）
      trimLogsWithPriority(maxLogs);
    }
  }
  
  if (!skipRender) {
    renderLogs();

    if (state.autoScroll) {
      elements.logsContainer.scrollTop = 0;
    }
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
    // Update error dot if new error
    if (entry.logLevel === 'error') {
      updateErrorDots();
    }
  }
}

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

/**
 * Get filtered fetch logs based on current filters
 */
function getFilteredFetchLogs() {
  const typeFilter = elements.filterType?.value || '';
  const statusFilter = elements.filterStatus?.value || '';
  const urlFilter = (elements.filterUrl?.value || '').toLowerCase();

  let filteredLogs = state.logs.filter(l => !isBlacklistedUrl(l.url));

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

  return filteredLogs;
}

/**
 * Copy filtered fetch logs to clipboard
 */
async function handleCopyFetchLogs() {
  const filteredLogs = getFilteredFetchLogs();

  if (filteredLogs.length === 0) {
    alert('没有可复制的日志');
    return;
  }

  // Format logs as text
  const logText = filteredLogs.map(log => {
    const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
    const method = log.method || 'GET';
    const status = log.status || '-';
    const duration = log.duration ? `${log.duration}ms` : '-';
    const cached = log.cached ? ' [缓存]' : '';
    const url = log.url || '-';
    return `${time} ${method} ${status} ${url} (${duration})${cached}`;
  }).join('\n');

  try {
    await navigator.clipboard.writeText(logText);
    const btn = elements.copyFetchLogsBtn;
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
 * Get filtered LLM API logs based on current filters
 */
function getFilteredLLMApiLogs() {
  const typeFilter = elements.filterLLMApiType?.value || '';
  const statusFilter = elements.filterLLMApiStatus?.value || '';

  let filteredLogs = state.llmapiLogs;

  if (typeFilter) {
    filteredLogs = filteredLogs.filter(l => l.taskType === typeFilter);
  }
  if (statusFilter) {
    filteredLogs = filteredLogs.filter(l => l.status === statusFilter);
  }

  return filteredLogs;
}

/**
 * Copy filtered LLM API logs to clipboard
 */
async function handleCopyLLMApiLogs() {
  const filteredLogs = getFilteredLLMApiLogs();

  if (filteredLogs.length === 0) {
    alert('没有可复制的日志');
    return;
  }

  // Format logs as text
  const logText = filteredLogs.map(log => {
    const time = new Date(log.timestamp).toLocaleString('zh-CN', { hour12: false });
    const type = log.taskType || 'unknown';
    const status = log.status || '-';
    const model = log.model || '-';
    const duration = log.duration ? `${(log.duration / 1000).toFixed(1)}s` : '-';
    const prompt = log.prompt ? `\n  提示词: ${log.prompt}` : '';
    const error = log.errorMessage ? `\n  错误: ${log.errorMessage}` : '';
    return `${time} [${type}] ${status} | ${model} (${duration})${prompt}${error}`;
  }).join('\n\n');

  try {
    await navigator.clipboard.writeText(logText);
    const btn = elements.copyLLMApiLogsBtn;
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
 * Get filtered crash logs based on current filters
 */
function getFilteredCrashLogs() {
  const typeFilter = elements.filterCrashType?.value || '';

  let filteredLogs = state.crashLogs;

  if (typeFilter) {
    filteredLogs = filteredLogs.filter(l => l.type === typeFilter);
  }

  return filteredLogs;
}

/**
 * Copy filtered crash logs to clipboard
 */
async function handleCopyCrashLogs() {
  const filteredLogs = getFilteredCrashLogs();

  if (filteredLogs.length === 0) {
    alert('没有可复制的日志');
    return;
  }

  // Format logs as text
  const logText = filteredLogs.map(log => {
    const time = new Date(log.timestamp).toLocaleString('zh-CN', { hour12: false });
    const type = log.type || 'unknown';
    let memoryInfo = '';
    if (log.memory) {
      const usedMB = (log.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
      const limitMB = (log.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(1);
      memoryInfo = ` | 内存: ${usedMB}/${limitMB} MB`;
    }
    const error = log.error ? `\n  错误: ${log.error.message}` : '';
    const stack = log.error?.stack ? `\n  Stack: ${log.error.stack}` : '';
    return `${time} [${type}]${memoryInfo}${error}${stack}`;
  }).join('\n\n');

  try {
    await navigator.clipboard.writeText(logText);
    const btn = elements.copyCrashLogsBtn;
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

// ==================== LLM API Logs ====================

/**
 * Render LLM API logs
 */
function renderLLMApiLogs() {
  const typeFilter = elements.filterLLMApiType?.value || '';
  const statusFilter = elements.filterLLMApiStatus?.value || '';

  let filteredLogs = state.llmapiLogs;

  if (typeFilter) {
    filteredLogs = filteredLogs.filter(l => l.taskType === typeFilter);
  }
  if (statusFilter) {
    filteredLogs = filteredLogs.filter(l => l.status === statusFilter);
  }

  if (!elements.llmapiLogsContainer) return;

  if (filteredLogs.length === 0) {
    elements.llmapiLogsContainer.innerHTML = `
      <div class="empty-state">
        <span class="icon">🤖</span>
        <p>暂无 LLM API 调用记录</p>
        <p style="font-size: 12px; opacity: 0.7;">图片/视频/对话等 AI 接口调用会自动记录</p>
      </div>
    `;
    return;
  }

  elements.llmapiLogsContainer.innerHTML = '';
  filteredLogs.forEach(log => {
    const isExpanded = state.expandedLLMApiIds.has(log.id);
    const entry = createLLMApiEntry(log, isExpanded, (id, expanded) => {
      if (expanded) {
        state.expandedLLMApiIds.add(id);
      } else {
        state.expandedLLMApiIds.delete(id);
      }
    });
    elements.llmapiLogsContainer.appendChild(entry);
  });
}

/**
 * Create a LLM API log entry element
 * Uses the same styles as Fetch logs for consistency
 */
function createLLMApiEntry(log, isExpanded, onToggle) {
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (isExpanded ? ' expanded' : '');
  entry.dataset.id = log.id;
  
  const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // Status badge - use log-status class like Fetch logs
  let statusClass = '';
  let statusText = '';
  switch (log.status) {
    case 'success':
      statusClass = 'success';
      statusText = '✓ 成功';
      break;
    case 'error':
      statusClass = 'error';
      statusText = '✗ 失败';
      break;
    case 'pending':
      statusClass = 'pending';
      statusText = '⋯ 进行中';
      break;
    default:
      statusText = log.status;
  }

  // Task type badge - use log-type-badge class like Fetch logs
  const typeLabel = {
    'image': '图片生成',
    'video': '视频生成',
    'chat': '对话',
    'character': '角色',
    'other': '其他',
  }[log.taskType] || log.taskType;

  // Duration format - use log-duration class like Fetch logs
  const durationMs = log.duration || 0;
  const durationText = log.duration ? `${(log.duration / 1000).toFixed(1)}s` : '-';
  const durationClass = durationMs >= 3000 ? 'very-slow' : (durationMs >= 1000 ? 'slow' : '');

  // Show full prompt in header (will wrap if needed)
  const promptPreview = log.prompt || '-';

  // Render reference images preview
  let referenceImagesHtml = '';
  if (log.referenceImages && log.referenceImages.length > 0) {
    const imagesList = log.referenceImages.map(img => {
      const sizeText = img.size ? formatBytes(img.size) : '-';
      const dimensions = img.width && img.height ? `${img.width}x${img.height}` : '-';
      return `
        <div class="reference-image-item" style="display: inline-flex; flex-direction: column; gap: 4px; border: 1px solid var(--border-color); border-radius: 4px; padding: 4px; background: var(--bg-secondary);">
          <div style="width: 120px; height: 120px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #000; border-radius: 2px;">
            <img src="${img.url}" style="max-width: 100%; max-height: 100%; object-fit: contain; cursor: pointer;" onclick="window.open('${img.url}')" title="点击查看原图">
          </div>
          <div style="font-size: 10px; color: var(--text-muted); display: flex; justify-content: space-between; padding: 0 2px;">
            <span>${sizeText}</span>
            <span>${dimensions}</span>
          </div>
        </div>
      `;
    }).join('');
    
    referenceImagesHtml = `
      <div class="detail-section">
        <h4>参考图详情</h4>
        <div class="reference-images-preview" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
          ${imagesList}
        </div>
      </div>
    `;
  }

  entry.innerHTML = `
    <div class="log-header">
      <span class="log-toggle" title="展开/收起详情"><span class="arrow">▶</span></span>
      <span class="log-time">${time}</span>
      <span class="log-status ${statusClass}">${statusText}</span>
      <span class="log-type-badge">${typeLabel}</span>
      <span class="log-type-badge sw-internal">${log.model}</span>
      <span class="log-url" title="${escapeHtml(log.prompt || '')}">${escapeHtml(promptPreview)}</span>
      <span class="log-duration ${durationClass}">${durationText}</span>
    </div>
    <div class="log-details">
      <div class="detail-section">
        <h4>基本信息</h4>
        <table class="form-data-table">
          <tbody>
            <tr>
              <td class="form-data-name">ID</td>
              <td><span class="form-data-value" style="font-family: monospace; font-size: 11px;">${log.id}</span></td>
            </tr>
            <tr>
              <td class="form-data-name">Endpoint</td>
              <td><span class="form-data-value" style="font-family: monospace; font-size: 11px;">${log.endpoint}</span></td>
            </tr>
            <tr>
              <td class="form-data-name">模型</td>
              <td><span class="form-data-value">${log.model}</span></td>
            </tr>
            <tr>
              <td class="form-data-name">类型</td>
              <td><span class="form-data-value">${log.taskType}</span></td>
            </tr>
            <tr>
              <td class="form-data-name">HTTP 状态</td>
              <td><span class="form-data-value">${log.httpStatus || '-'}</span></td>
            </tr>
            <tr>
              <td class="form-data-name">耗时</td>
              <td><span class="form-data-value">${durationText}</span></td>
            </tr>
            ${log.hasReferenceImages ? `
            <tr>
              <td class="form-data-name">参考图</td>
              <td><span class="form-data-value">${log.referenceImageCount || 0} 张</span></td>
            </tr>
            ` : ''}
            ${log.resultType ? `
            <tr>
              <td class="form-data-name">结果类型</td>
              <td><span class="form-data-value">${log.resultType}</span></td>
            </tr>
            ` : ''}
            ${log.taskId ? `
            <tr>
              <td class="form-data-name">任务 ID</td>
              <td><span class="form-data-value" style="font-family: monospace; font-size: 11px;">${log.taskId}</span></td>
            </tr>
            ` : ''}
            ${log.resultUrl ? `
            <tr>
              <td class="form-data-name">结果 URL</td>
              <td>
                <span class="form-data-value" style="display: flex; align-items: center; gap: 8px;">
                  <a href="${log.resultUrl}" target="_blank" class="llm-result-url" style="font-family: monospace; font-size: 11px; word-break: break-all; color: var(--primary-color); cursor: pointer;">${log.resultUrl.length > 80 ? log.resultUrl.substring(0, 80) + '...' : log.resultUrl}</a>
                  <button class="copy-url-btn" data-url="${escapeHtml(log.resultUrl)}" title="复制 URL" style="padding: 2px 6px; font-size: 10px; cursor: pointer; flex-shrink: 0;">
                    <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </button>
                </span>
              </td>
            </tr>
            ` : ''}
            ${log.errorMessage ? `
            <tr>
              <td class="form-data-name">错误信息</td>
              <td><span class="form-data-value" style="color: var(--error-color); word-break: break-word;">${escapeHtml(log.errorMessage)}</span></td>
            </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
      ${referenceImagesHtml}
      ${log.prompt ? `
        <div class="detail-section">
          <h4>提示词</h4>
          <pre>${escapeHtml(log.prompt)}</pre>
        </div>
      ` : ''}
      ${log.requestBody ? `
        <div class="detail-section">
          <h4>请求体 (Request Body)</h4>
          <pre>${escapeHtml(log.requestBody)}</pre>
        </div>
      ` : ''}
      ${log.resultText ? `
        <div class="detail-section">
          <h4>响应文本</h4>
          <pre>${escapeHtml(log.resultText)}</pre>
        </div>
      ` : ''}
      ${log.responseBody ? `
        <div class="detail-section">
          <h4>响应体 (Response Body)</h4>
          <pre>${escapeHtml(log.responseBody)}</pre>
        </div>
      ` : ''}
    </div>
  `;

  // Toggle function - same as Fetch logs
  const toggleExpand = () => {
    const isNowExpanded = entry.classList.toggle('expanded');
    if (onToggle) {
      onToggle(log.id, isNowExpanded);
    }
  };

  // Toggle expand/collapse on button click
  const toggleBtn = entry.querySelector('.log-toggle');
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleExpand();
  });

  // Toggle on header click (except toggle button)
  const header = entry.querySelector('.log-header');
  header.addEventListener('click', (e) => {
    if (e.target.closest('.log-toggle')) return;
    toggleExpand();
  });

  // Copy URL button click handler
  const copyUrlBtn = entry.querySelector('.copy-url-btn');
  if (copyUrlBtn) {
    copyUrlBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const url = copyUrlBtn.dataset.url;
      try {
        await navigator.clipboard.writeText(url);
        // Show feedback
        const originalHtml = copyUrlBtn.innerHTML;
        copyUrlBtn.innerHTML = '✓';
        copyUrlBtn.style.color = 'var(--success-color)';
        setTimeout(() => {
          copyUrlBtn.innerHTML = originalHtml;
          copyUrlBtn.style.color = '';
        }, 1500);
      } catch (err) {
        console.error('Failed to copy URL:', err);
      }
    });
  }

  return entry;
}


/**
 * Load LLM API logs from SW
 */
function loadLLMApiLogs() {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SW_DEBUG_GET_LLM_API_LOGS'
    });
  }
}

/**
 * Clear LLM API logs
 */
function handleClearLLMApiLogs() {
  if (!confirm('确定要清空所有 LLM API 日志吗？')) return;
  
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SW_DEBUG_CLEAR_LLM_API_LOGS'
    });
  }
  state.llmapiLogs = [];
  renderLLMApiLogs();
}

/**
 * Export LLM API logs with media files (images/videos)
 * Creates a ZIP file containing:
 * - llm-api-logs.json: All LLM API logs
 * - media/: Directory containing cached images and videos
 */
async function handleExportLLMApiLogs() {
  if (state.llmapiLogs.length === 0) {
    alert('暂无 LLM API 日志可导出');
    return;
  }
  
  const exportBtn = elements.exportLLMApiLogsBtn;
  const originalText = exportBtn.textContent;
  
  try {
    exportBtn.disabled = true;
    exportBtn.textContent = '⏳ 准备中...';
    
    // Check if JSZip is available
    if (typeof JSZip === 'undefined') {
      // Fallback to JSON-only export
      console.warn('JSZip not available, falling back to JSON-only export');
      const filename = `llm-api-logs-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.json`;
      downloadJson({
        exportTime: new Date().toISOString(),
        logs: state.llmapiLogs,
        mediaNotIncluded: true,
        reason: 'JSZip not available'
      }, filename);
      return;
    }
    
    const zip = new JSZip();
    
    // Add logs JSON
    const logsData = {
      exportTime: new Date().toISOString(),
      userAgent: navigator.userAgent,
      totalLogs: state.llmapiLogs.length,
      summary: {
        image: state.llmapiLogs.filter(l => l.taskType === 'image').length,
        video: state.llmapiLogs.filter(l => l.taskType === 'video').length,
        chat: state.llmapiLogs.filter(l => l.taskType === 'chat').length,
        character: state.llmapiLogs.filter(l => l.taskType === 'character').length,
        success: state.llmapiLogs.filter(l => l.status === 'success').length,
        error: state.llmapiLogs.filter(l => l.status === 'error').length,
      },
      logs: state.llmapiLogs
    };
    zip.file('llm-api-logs.json', JSON.stringify(logsData, null, 2));
    
    // Collect URLs to download
    const mediaUrls = [];
    for (const log of state.llmapiLogs) {
      if (log.resultUrl && log.status === 'success') {
        mediaUrls.push({
          url: log.resultUrl,
          id: log.id,
          type: log.taskType,
          timestamp: log.timestamp
        });
      }
    }
    
    exportBtn.textContent = `⏳ 下载媒体 0/${mediaUrls.length}...`;
    
    // Download media files
    const mediaFolder = zip.folder('media');
    let downloadedCount = 0;
    let failedCount = 0;
    const mediaManifest = [];
    
    for (const item of mediaUrls) {
      try {
        // Handle both absolute and relative URLs
        let fetchUrl = item.url;
        if (fetchUrl.startsWith('/')) {
          fetchUrl = location.origin + fetchUrl;
        }
        
        const response = await fetch(fetchUrl);
        if (response.ok) {
          const blob = await response.blob();
          const contentType = response.headers.get('content-type') || blob.type;
          
          // Determine file extension
          let ext = 'bin';
          if (contentType.includes('image/png')) ext = 'png';
          else if (contentType.includes('image/jpeg')) ext = 'jpg';
          else if (contentType.includes('image/gif')) ext = 'gif';
          else if (contentType.includes('image/webp')) ext = 'webp';
          else if (contentType.includes('video/mp4')) ext = 'mp4';
          else if (contentType.includes('video/webm')) ext = 'webm';
          
          // Create filename based on log id and timestamp
          const date = new Date(item.timestamp);
          const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
          const filename = `${dateStr}_${item.type}_${item.id.split('-').pop()}.${ext}`;
          
          mediaFolder.file(filename, blob);
          mediaManifest.push({
            logId: item.id,
            filename,
            originalUrl: item.url,
            size: blob.size,
            type: contentType
          });
          downloadedCount++;
        } else {
          failedCount++;
          mediaManifest.push({
            logId: item.id,
            originalUrl: item.url,
            error: `HTTP ${response.status}`
          });
        }
      } catch (err) {
        failedCount++;
        mediaManifest.push({
          logId: item.id,
          originalUrl: item.url,
          error: err.message
        });
      }
      
      exportBtn.textContent = `⏳ 下载媒体 ${downloadedCount + failedCount}/${mediaUrls.length}...`;
    }
    
    // Add media manifest
    zip.file('media-manifest.json', JSON.stringify({
      totalUrls: mediaUrls.length,
      downloaded: downloadedCount,
      failed: failedCount,
      files: mediaManifest
    }, null, 2));
    
    exportBtn.textContent = '⏳ 生成 ZIP...';
    
    // Generate and download ZIP
    const zipBlob = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    
    const filename = `llm-api-export-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.zip`;
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Show summary
    const sizeInMB = (zipBlob.size / 1024 / 1024).toFixed(2);
    alert(`导出完成！\n\n日志数: ${state.llmapiLogs.length}\n媒体文件: ${downloadedCount} 成功, ${failedCount} 失败\n文件大小: ${sizeInMB} MB`);
    
  } catch (err) {
    console.error('Export failed:', err);
    alert('导出失败: ' + err.message);
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = originalText;
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
  // 使用与 Fetch 日志相同的样式
  entry.className = 'log-entry memory-entry' + (isExpanded ? ' expanded' : '');
  entry.dataset.id = log.id;
  
  const time = formatTime(log.timestamp);
  
  const typeLabels = {
    startup: '启动',
    periodic: '定期',
    error: '错误',
    beforeunload: '关闭',
    freeze: '卡死',
    whitescreen: '白屏',
    longtask: '长任务'
  };
  
  const typeLabel = typeLabels[log.type] || log.type;
  const isError = log.type === 'error';
  const isWarning = log.type === 'freeze' || log.type === 'whitescreen' || log.type === 'longtask';
  
  // 类型徽章样式类
  const typeClass = isError ? 'error' : (isWarning ? 'warning' : 'normal');
  
  // Memory info - 简化显示
  let memoryBadge = '';
  let memoryPercent = 0;
  if (log.memory) {
    const usedMB = (log.memory.usedJSHeapSize / (1024 * 1024)).toFixed(0);
    memoryPercent = ((log.memory.usedJSHeapSize / log.memory.jsHeapSizeLimit) * 100);
    const memoryClass = memoryPercent >= 90 ? 'critical' : (memoryPercent >= 75 ? 'warning' : 'normal');
    memoryBadge = `<span class="log-memory-badge ${memoryClass}">${usedMB} MB</span>`;
  }
  
  // Page stats - 简化为一行
  let statsText = '';
  if (log.pageStats) {
    const stats = log.pageStats;
    statsText = `DOM ${stats.domNodeCount || 0} · Img ${stats.imageCount || 0}`;
    if (stats.plaitElementCount !== undefined) {
      statsText += ` · Plait ${stats.plaitElementCount}`;
    }
  }
  
  // Performance info - 完整显示
  let perfText = '';
  if (log.performance) {
    const parts = [];
    if (log.performance.longTaskDuration) {
      parts.push(`任务时长: ${log.performance.longTaskDuration.toFixed(0)}ms`);
    }
    if (log.performance.freezeDuration) {
      parts.push(`卡死时长: ${(log.performance.freezeDuration / 1000).toFixed(1)}s`);
    }
    if (log.performance.fps !== undefined) {
      parts.push(`FPS: ${log.performance.fps}`);
    }
    if (parts.length > 0) {
      perfText = parts.join(' | ');
    }
  }
  
  // Error preview - show full message (will wrap if needed)
  let errorPreview = '';
  if (log.error) {
    errorPreview = `<span class="log-url" style="color: var(--error-color);">${escapeHtml(log.error.message || '')}</span>`;
  }
  
  // 完整内存显示
  let memoryText = '';
  if (log.memory) {
    const usedMB = (log.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
    const limitMB = (log.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(1);
    memoryText = `${usedMB} MB / ${limitMB} MB (${memoryPercent.toFixed(1)}%)`;
  }
  
  entry.innerHTML = `
    <div class="log-header">
      <span class="log-toggle"><span class="arrow">▶</span></span>
      <span class="log-time">${time}</span>
      <span class="log-type-badge ${typeClass}">${typeLabel}</span>
      ${perfText ? `<span class="log-perf">⚡ ${perfText}</span>` : ''}
      ${memoryText ? `<span class="log-memory-info">📊 ${memoryText}</span>` : ''}
      ${statsText ? `<span class="log-stats-info">📄 ${statsText}</span>` : ''}
      ${errorPreview}
    </div>
    <div class="log-details">
      <div class="detail-section">
        <h4>基本信息</h4>
        <pre>ID: ${log.id}
时间: ${new Date(log.timestamp).toLocaleString('zh-CN')}
URL: ${log.url || '-'}</pre>
      </div>
      ${log.memory ? `
        <div class="detail-section">
          <h4>内存信息</h4>
          <pre>已用: ${(log.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)} MB
总计: ${(log.memory.totalJSHeapSize / (1024 * 1024)).toFixed(1)} MB
限制: ${(log.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(1)} MB
使用率: ${memoryPercent.toFixed(1)}%</pre>
        </div>
      ` : ''}
      ${log.pageStats ? `
        <div class="detail-section">
          <h4>页面统计</h4>
          <pre>DOM节点: ${log.pageStats.domNodeCount || 0}
Canvas: ${log.pageStats.canvasCount || 0}
图片: ${log.pageStats.imageCount || 0}
视频: ${log.pageStats.videoCount || 0}
iframe: ${log.pageStats.iframeCount || 0}${log.pageStats.plaitElementCount !== undefined ? `\nPlait元素: ${log.pageStats.plaitElementCount}` : ''}</pre>
        </div>
      ` : ''}
      ${log.performance ? `
        <div class="detail-section">
          <h4>性能信息</h4>
          <pre>${log.performance.longTaskDuration ? `长任务时长: ${log.performance.longTaskDuration.toFixed(0)}ms` : ''}${log.performance.freezeDuration ? `卡死时长: ${(log.performance.freezeDuration / 1000).toFixed(1)}s` : ''}${log.performance.fps !== undefined ? `\nFPS: ${log.performance.fps}` : ''}</pre>
        </div>
      ` : ''}
      ${log.error ? `
        <div class="detail-section">
          <h4>错误信息</h4>
          <pre style="color: var(--error-color);">${log.error.type}: ${escapeHtml(log.error.message)}</pre>
          ${log.error.stack ? `<pre style="margin-top: 8px; font-size: 11px; opacity: 0.8;">${escapeHtml(log.error.stack)}</pre>` : ''}
        </div>
      ` : ''}
      ${log.customData ? `
        <div class="detail-section">
          <h4>自定义数据</h4>
          <pre>${JSON.stringify(log.customData, null, 2)}</pre>
        </div>
        ${log.type === 'longtask' ? `
          <div class="detail-section" style="background: var(--warning-light); padding: 12px; border-radius: 6px; border-left: 3px solid var(--warning-color);">
            <h4 style="color: var(--warning-color);">💡 如何定位长任务来源</h4>
            <ol style="margin: 8px 0 0 0; padding-left: 20px; font-size: 12px; line-height: 1.8;">
              <li>打开 Chrome DevTools → Performance 面板</li>
              <li>点击录制按钮 ⏺，复现长任务操作</li>
              <li>停止录制，在 Main 线程中找到黄色/红色的长条（> 50ms）</li>
              <li>点击展开查看详细的函数调用栈</li>
            </ol>
          </div>
        ` : ''}
      ` : ''}
    </div>
  `;
  
  // Toggle expand on header click
  const toggleBtn = entry.querySelector('.log-toggle');
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const nowExpanded = entry.classList.toggle('expanded');
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
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SW_DEBUG_CLEAR_CRASH_SNAPSHOTS'
    });
  }
  state.crashLogs = [];
  renderCrashLogs();
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
 * Open export modal
 */
function openExportModal() {
  elements.exportModalOverlay?.classList.add('show');
}

/**
 * Close export modal
 */
function closeExportModal() {
  elements.exportModalOverlay?.classList.remove('show');
}

/**
 * Setup export modal checkbox logic
 */
function setupExportModalCheckboxes() {
  const modal = elements.exportModalOverlay;
  if (!modal) return;

  const selectAllCheckbox = elements.selectAllExport;
  const sectionCheckboxes = modal.querySelectorAll('[data-section]');
  const allItemCheckboxes = modal.querySelectorAll('input[name]');

  // Update section checkbox state based on its items
  function updateSectionCheckbox(sectionName) {
    const sectionCheckbox = modal.querySelector(`[data-section="${sectionName}"]`);
    const items = modal.querySelectorAll(`input[name="${sectionName}"]`);
    if (!sectionCheckbox || items.length === 0) return;

    const checkedItems = Array.from(items).filter(i => i.checked);
    sectionCheckbox.checked = checkedItems.length === items.length;
    sectionCheckbox.indeterminate = checkedItems.length > 0 && checkedItems.length < items.length;
  }

  // Update select all checkbox state
  function updateSelectAllCheckbox() {
    const allChecked = Array.from(allItemCheckboxes).every(cb => cb.checked);
    const someChecked = Array.from(allItemCheckboxes).some(cb => cb.checked);
    selectAllCheckbox.checked = allChecked;
    selectAllCheckbox.indeterminate = someChecked && !allChecked;
  }

  // Select all handler
  selectAllCheckbox?.addEventListener('change', () => {
    const checked = selectAllCheckbox.checked;
    allItemCheckboxes.forEach(cb => cb.checked = checked);
    sectionCheckboxes.forEach(cb => {
      cb.checked = checked;
      cb.indeterminate = false;
    });
  });

  // Section checkbox handlers
  sectionCheckboxes.forEach(sectionCb => {
    sectionCb.addEventListener('change', () => {
      const sectionName = sectionCb.dataset.section;
      const items = modal.querySelectorAll(`input[name="${sectionName}"]`);
      items.forEach(item => item.checked = sectionCb.checked);
      sectionCb.indeterminate = false;
      updateSelectAllCheckbox();
    });
  });

  // Item checkbox handlers
  allItemCheckboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      updateSectionCheckbox(cb.name);
      updateSelectAllCheckbox();
    });
  });
}

/**
 * Get selected export options
 * @returns {object}
 */
function getExportOptions() {
  const basicTypes = Array.from(
    document.querySelectorAll('input[name="basic"]:checked')
  ).map(el => el.value);
  
  const fetchTypes = Array.from(
    document.querySelectorAll('input[name="fetch"]:checked')
  ).map(el => el.value);
  
  const consoleLevels = Array.from(
    document.querySelectorAll('input[name="console"]:checked')
  ).map(el => el.value);
  
  const postmessageDirections = Array.from(
    document.querySelectorAll('input[name="postmessage"]:checked')
  ).map(el => el.value);
  
  const memoryTypes = Array.from(
    document.querySelectorAll('input[name="memory"]:checked')
  ).map(el => el.value);
  
  const llmapiTypes = Array.from(
    document.querySelectorAll('input[name="llmapi"]:checked')
  ).map(el => el.value);
  
  return { basicTypes, fetchTypes, consoleLevels, postmessageDirections, memoryTypes, llmapiTypes };
}

/**
 * Get current memory info from browser
 */
function getCurrentMemoryInfo() {
  const memory = performance.memory;
  if (!memory) return null;
  
  return {
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
    usedMB: Math.round(memory.usedJSHeapSize / 1024 / 1024 * 10) / 10,
    totalMB: Math.round(memory.totalJSHeapSize / 1024 / 1024 * 10) / 10,
    limitMB: Math.round(memory.jsHeapSizeLimit / 1024 / 1024 * 10) / 10,
    usagePercent: Math.round(memory.usedJSHeapSize / memory.jsHeapSizeLimit * 1000) / 10,
  };
}

/**
 * Export logs to JSON file with selected options
 */
function exportLogs() {
  const options = getExportOptions();
  
  // Build basic info
  let basicInfo = {};
  if (options.basicTypes.includes('swStatus') && state.swStatus) {
    basicInfo.swStatus = {
      version: state.swStatus.version,
      debugModeEnabled: state.swStatus.debugModeEnabled,
      pendingImageRequests: state.swStatus.pendingImageRequests,
      pendingVideoRequests: state.swStatus.pendingVideoRequests,
      videoBlobCacheSize: state.swStatus.videoBlobCacheSize,
      videoBlobCacheTotalBytes: state.swStatus.videoBlobCacheTotalBytes,
      completedImageRequestsSize: state.swStatus.completedImageRequestsSize,
      workflowHandlerInitialized: state.swStatus.workflowHandlerInitialized,
      debugLogsCount: state.swStatus.debugLogsCount,
      failedDomains: state.swStatus.failedDomains,
    };
  }
  if (options.basicTypes.includes('memory')) {
    basicInfo.memory = getCurrentMemoryInfo();
  }
  if (options.basicTypes.includes('cache') && state.swStatus?.cacheStats) {
    basicInfo.cacheStats = state.swStatus.cacheStats;
  }
  
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
  
  // Filter memory logs
  let filteredMemoryLogs = [];
  if (options.memoryTypes.length > 0) {
    filteredMemoryLogs = state.crashLogs.filter(l =>
      options.memoryTypes.includes(l.type)
    );
  }
  
  // Filter LLM API logs
  let filteredLLMApiLogs = [];
  if (options.llmapiTypes.length > 0) {
    filteredLLMApiLogs = state.llmapiLogs.filter(l =>
      options.llmapiTypes.includes(l.taskType)
    );
  }
  
  // Check if anything selected
  const hasBasicInfo = Object.keys(basicInfo).length > 0;
  const hasLogs = filteredFetchLogs.length > 0 || 
                  filteredConsoleLogs.length > 0 || 
                  filteredPostmessageLogs.length > 0 ||
                  filteredMemoryLogs.length > 0 ||
                  filteredLLMApiLogs.length > 0;
  
  if (!hasBasicInfo && !hasLogs) {
    alert('没有选中任何导出项，或选中的类型没有数据');
    return;
  }
  
  const exportData = {
    exportTime: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: location.href,
    exportOptions: options,
    // Basic info at the top level for easy access
    ...basicInfo,
    summary: {
      hasBasicInfo,
      fetchLogs: filteredFetchLogs.length,
      consoleLogs: filteredConsoleLogs.length,
      postmessageLogs: filteredPostmessageLogs.length,
      memoryLogs: filteredMemoryLogs.length,
      llmapiLogs: filteredLLMApiLogs.length,
    },
    fetchLogs: filteredFetchLogs,
    consoleLogs: filteredConsoleLogs,
    postmessageLogs: filteredPostmessageLogs,
    memoryLogs: filteredMemoryLogs,
    llmapiLogs: filteredLLMApiLogs,
  };

  const filename = `sw-debug-logs-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.json`;
  downloadJson(exportData, filename);
  closeExportModal();
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

/**
 * Setup event listeners
 */
function setupEventListeners() {
  elements.toggleDebugBtn.addEventListener('click', toggleDebug);
  elements.exportLogsBtn.addEventListener('click', openExportModal);
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
  
  elements.refreshStatusBtn.addEventListener('click', refreshStatus);
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
      updateMessageTypeOptions();
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
    'SW_DEBUG_NEW_CRASH_SNAPSHOT': (data) => {
      // 实时接收新的内存快照
      if (data.snapshot) {
        // 添加到列表开头
        state.crashLogs.unshift(data.snapshot);
        // 限制数量
        if (state.crashLogs.length > 100) {
          state.crashLogs.pop();
        }
        renderCrashLogs();
      }
    },
    'SW_DEBUG_CRASH_SNAPSHOTS_CLEARED': () => {
      state.crashLogs = [];
      renderCrashLogs();
    },
    'SW_DEBUG_LLM_API_LOGS': (data) => {
      state.llmapiLogs = data.logs || [];
      renderLLMApiLogs();
    },
    'SW_DEBUG_LLM_API_LOG': (data) => {
      // 实时接收新的 LLM API 日志
      if (data.log) {
        // 检查是否是更新现有日志
        const existingIndex = state.llmapiLogs.findIndex(l => l.id === data.log.id);
        if (existingIndex >= 0) {
          state.llmapiLogs[existingIndex] = data.log;
        } else {
          state.llmapiLogs.unshift(data.log);
        }
        // 限制数量
        if (state.llmapiLogs.length > 200) {
          state.llmapiLogs.pop();
        }
        renderLLMApiLogs();
      }
    },
    'SW_DEBUG_LLM_API_LOGS_CLEARED': () => {
      state.llmapiLogs = [];
      renderLLMApiLogs();
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
  if (!('serviceWorker' in navigator)) {
    alert('此浏览器不支持 Service Worker');
    updateSwStatus(elements.swStatus, false);
    return;
  }
  
  const swReady = await checkSwReady();
  
  if (!swReady) {
    alert('Service Worker 未注册或未激活\n\n请先访问主应用，然后刷新此页面');
    updateSwStatus(elements.swStatus, false);
    return;
  }
  
  console.log('[SW Debug] SW ready, controller:', !!navigator.serviceWorker.controller);

  updateSwStatus(elements.swStatus, true);

  // Load saved bookmarks, theme, and settings
  loadBookmarks();
  loadTheme();
  loadSettings();

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
