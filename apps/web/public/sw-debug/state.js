/**
 * SW Debug Panel - Application State
 * 应用状态管理和 DOM 元素缓存
 */

// Application State
export const state = {
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
  // Analysis mode - for debugging user-provided logs without local SW connection
  isAnalysisMode: false,
  importedLogData: null, // Imported log data from user
  // Live logs buffer - stores incoming logs while in analysis mode
  // So they can be restored when exiting analysis mode
  liveLogs: {
    logs: [],
    consoleLogs: [],
    postmessageLogs: [],
    crashLogs: [],
    llmapiLogs: [],
  },
};

// DOM Elements cache
export let elements = {};

/**
 * Cache DOM elements
 */
export function cacheElements() {
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
    // Analysis mode elements
    toggleAnalysisModeBtn: document.getElementById('toggleAnalysisMode'),
    importLogsBtn: document.getElementById('importLogs'),
    importLogsInput: document.getElementById('importLogsInput'),
    analysisModeIndicator: document.getElementById('analysisModeIndicator'),
    panelTitle: document.getElementById('panelTitle'),
    // Backup button
    backupDataBtn: document.getElementById('backupData'),
  };
}

/**
 * Update elements reference after DOM manipulation
 * Used when restoring debug mode left panel
 */
export function updateElements(newElements) {
  Object.assign(elements, newElements);
}
