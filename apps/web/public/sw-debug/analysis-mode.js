/**
 * SW Debug Panel - Analysis Mode
 * 分析模式功能模块
 */

import { state, elements, updateElements } from './state.js';
import { escapeHtml, truncateUrl, parseUserAgent, formatBytes } from './common.js';
import { showToast } from './toast.js';
import {
  enableDebug,
  refreshStatus,
  loadConsoleLogs,
  loadPostMessageLogs,
  loadCacheStats,
} from './sw-communication.js';

// Forward declarations - will be set by app.js
let renderLogs = null;
let renderConsoleLogs = null;
let renderPostmessageLogs = null;
let renderCrashLogs = null;
let renderLLMApiLogs = null;
let updateConsoleCount = null;
let updatePostmessageCount = null;
let updateCrashCount = null;
let updateErrorDots = null;
let updateMessageTypeOptions = null;
let loadCrashLogs = null;
let loadLLMApiLogs = null;
let updateMemoryDisplay = null;

/**
 * Set render callbacks from app.js
 */
export function setAnalysisModeCallbacks(callbacks) {
  renderLogs = callbacks.renderLogs;
  renderConsoleLogs = callbacks.renderConsoleLogs;
  renderPostmessageLogs = callbacks.renderPostmessageLogs;
  renderCrashLogs = callbacks.renderCrashLogs;
  renderLLMApiLogs = callbacks.renderLLMApiLogs;
  updateConsoleCount = callbacks.updateConsoleCount;
  updatePostmessageCount = callbacks.updatePostmessageCount;
  updateCrashCount = callbacks.updateCrashCount;
  updateErrorDots = callbacks.updateErrorDots;
  updateMessageTypeOptions = callbacks.updateMessageTypeOptions;
  loadCrashLogs = callbacks.loadCrashLogs;
  loadLLMApiLogs = callbacks.loadLLMApiLogs;
  updateMemoryDisplay = callbacks.updateMemoryDisplay;
}

/**
 * Toggle analysis mode (for analyzing user-provided logs)
 * In analysis mode:
 * - SW connection is disabled
 * - Only imported log data is displayed
 * - Debug-related buttons are hidden
 */
export function toggleAnalysisMode() {
  state.isAnalysisMode = !state.isAnalysisMode;
  updateAnalysisModeUI();
  
  if (state.isAnalysisMode) {
    // Clear all existing data when entering analysis mode
    clearAllLogsForAnalysisMode();
  } else {
    // Restore normal mode - reconnect to SW
    exitAnalysisMode();
  }
}

/**
 * Update UI based on analysis mode state
 */
export function updateAnalysisModeUI() {
  const isAnalysis = state.isAnalysisMode;
  
  // Update mode indicator
  if (elements.analysisModeIndicator) {
    elements.analysisModeIndicator.style.display = isAnalysis ? 'inline-flex' : 'none';
  }
  
  // Update SW status indicator
  if (elements.swStatus) {
    elements.swStatus.style.display = isAnalysis ? 'none' : 'inline-flex';
  }
  
  // Update title
  if (elements.panelTitle) {
    elements.panelTitle.textContent = isAnalysis ? '日志分析模式' : 'Service Worker 调试面板';
  }
  
  // Show/hide import button
  if (elements.importLogsBtn) {
    elements.importLogsBtn.style.display = isAnalysis ? 'inline-flex' : 'none';
  }
  
  // Update toggle button appearance
  if (elements.toggleAnalysisModeBtn) {
    if (isAnalysis) {
      elements.toggleAnalysisModeBtn.classList.add('active');
      elements.toggleAnalysisModeBtn.title = '退出分析模式，返回调试模式';
    } else {
      elements.toggleAnalysisModeBtn.classList.remove('active');
      elements.toggleAnalysisModeBtn.title = '切换到分析模式（导入用户日志）';
    }
  }
  
  // Hide/show debug-mode-only buttons
  document.querySelectorAll('.debug-mode-only').forEach(el => {
    el.style.display = isAnalysis ? 'none' : '';
  });
  
  // In analysis mode, left panel shows user info instead of SW status
  // The panel is always visible, but content changes based on mode
  const leftPanel = document.querySelector('.left-panel');
  if (leftPanel) {
    // Always show left panel, content will be different in analysis mode
    leftPanel.style.display = '';
  }
  
  // Adjust panels grid - always use two-column layout
  const panels = document.querySelector('.panels');
  if (panels) {
    panels.style.gridTemplateColumns = '280px 1fr';
  }
  
  // Update left panel content for analysis mode
  if (isAnalysis) {
    showAnalysisModeLeftPanel();
  } else {
    restoreDebugModeLeftPanel();
  }
  
  // Add/remove body class for analysis mode styling
  document.body.classList.toggle('analysis-mode', isAnalysis);
}

/**
 * Clear display logs when entering analysis mode
 * Current logs are preserved in liveLogs buffer for restoration later
 */
function clearAllLogsForAnalysisMode() {
  // Save current logs to live buffer before clearing display
  state.liveLogs.logs = [...state.logs];
  state.liveLogs.consoleLogs = [...state.consoleLogs];
  state.liveLogs.postmessageLogs = [...state.postmessageLogs];
  state.liveLogs.crashLogs = [...state.crashLogs];
  state.liveLogs.llmapiLogs = [...state.llmapiLogs];
  
  // Clear display state for imported logs
  state.logs = [];
  state.consoleLogs = [];
  state.postmessageLogs = [];
  state.crashLogs = [];
  state.llmapiLogs = [];
  state.importedLogData = null;
  
  // Re-render all tabs
  if (renderLogs) renderLogs();
  if (renderConsoleLogs) renderConsoleLogs();
  if (renderPostmessageLogs) renderPostmessageLogs();
  if (renderCrashLogs) renderCrashLogs();
  if (renderLLMApiLogs) renderLLMApiLogs();
  
  // Show import prompt
  showImportPrompt();
}

/**
 * Show analysis mode left panel (placeholder for user info)
 */
function showAnalysisModeLeftPanel() {
  const leftPanel = document.querySelector('.left-panel');
  if (!leftPanel) return;
  
  leftPanel.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        🔍 分析模式
      </div>
      <div class="panel-content">
        <div class="empty-state" style="padding: 20px;">
          <span class="icon" style="font-size: 32px;">📋</span>
          <p style="margin-top: 12px; color: var(--text-secondary);">请导入用户日志文件</p>
          <p style="font-size: 11px; opacity: 0.6; margin-top: 8px;">导入后将显示用户信息</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Restore debug mode left panel
 */
function restoreDebugModeLeftPanel() {
  const leftPanel = document.querySelector('.left-panel');
  if (!leftPanel) return;
  
  // Restore original HTML structure
  leftPanel.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        SW 状态信息
      </div>
      <div class="panel-content">
        <div class="stat-grid" id="statusGrid">
          <div class="stat-item">
            <span class="label">版本</span>
            <span class="value" id="swVersion">-</span>
          </div>
          <div class="stat-item">
            <span class="label">调试模式</span>
            <span class="value" id="debugMode">关闭</span>
          </div>
          <div class="stat-item">
            <span class="label">Pending 图片请求</span>
            <span class="value" id="pendingImages">0</span>
          </div>
          <div class="stat-item">
            <span class="label">Pending 视频请求</span>
            <span class="value" id="pendingVideos">0</span>
          </div>
          <div class="stat-item">
            <span class="label">视频 Blob 缓存</span>
            <span class="value" id="videoBlobCache">0</span>
          </div>
          <div class="stat-item">
            <span class="label">已完成请求缓存</span>
            <span class="value" id="completedRequests">0</span>
          </div>
          <div class="stat-item">
            <span class="label">工作流处理器</span>
            <span class="value" id="workflowHandler">未初始化</span>
          </div>
          <div class="stat-item">
            <span class="label">调试日志数</span>
            <span class="value" id="debugLogsCount">0</span>
          </div>
        </div>
        
        <div id="failedDomainsSection" style="margin-top: 16px; display: none;">
          <div class="stat-item" style="flex-direction: column; align-items: flex-start;">
            <span class="label">失败域名</span>
            <div class="failed-domains" id="failedDomains"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        内存监控
        <span id="memoryUpdateTime" style="font-size: 11px; opacity: 0.6; margin-left: 10px;"></span>
      </div>
      <div class="panel-content">
        <div class="stat-grid" id="memoryGrid">
          <div class="stat-item">
            <span class="label">JS 堆已使用</span>
            <span class="value" id="memoryUsed">-</span>
          </div>
          <div class="stat-item">
            <span class="label">JS 堆总大小</span>
            <span class="value" id="memoryTotal">-</span>
          </div>
          <div class="stat-item">
            <span class="label">JS 堆上限</span>
            <span class="value" id="memoryLimit">-</span>
          </div>
          <div class="stat-item">
            <span class="label">使用率</span>
            <span class="value" id="memoryPercent">-</span>
          </div>
        </div>
        <p id="memoryWarning" style="display: none; margin-top: 12px; padding: 8px; background: #fff3cd; border-radius: 4px; font-size: 12px; color: #856404;">
          ⚠️ 内存使用率较高，可能导致页面崩溃
        </p>
        <p id="memoryNotSupported" style="display: none; margin-top: 8px; font-size: 11px; opacity: 0.6;">
          注：performance.memory 仅 Chrome 支持
        </p>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        缓存统计
        <button id="refreshCache">刷新</button>
      </div>
      <div class="panel-content">
        <ul class="cache-list" id="cacheList">
          <li class="cache-item">
            <span class="name">加载中...</span>
          </li>
        </ul>
      </div>
    </div>
  `;
  
  // Re-cache elements and rebind refresh cache button
  const newElements = {
    swVersion: document.getElementById('swVersion'),
    debugMode: document.getElementById('debugMode'),
    pendingImages: document.getElementById('pendingImages'),
    pendingVideos: document.getElementById('pendingVideos'),
    videoBlobCache: document.getElementById('videoBlobCache'),
    completedRequests: document.getElementById('completedRequests'),
    workflowHandler: document.getElementById('workflowHandler'),
    debugLogsCount: document.getElementById('debugLogsCount'),
    failedDomains: document.getElementById('failedDomains'),
    memoryUsed: document.getElementById('memoryUsed'),
    memoryTotal: document.getElementById('memoryTotal'),
    memoryLimit: document.getElementById('memoryLimit'),
    memoryPercent: document.getElementById('memoryPercent'),
    memoryWarning: document.getElementById('memoryWarning'),
    memoryNotSupported: document.getElementById('memoryNotSupported'),
    memoryUpdateTime: document.getElementById('memoryUpdateTime'),
    cacheList: document.getElementById('cacheList'),
  };
  updateElements(newElements);
  
  const refreshCacheBtn = document.getElementById('refreshCache');
  if (refreshCacheBtn) {
    refreshCacheBtn.addEventListener('click', loadCacheStats);
  }
  
  // Refresh data
  refreshStatus();
  loadCacheStats();
  if (updateMemoryDisplay) updateMemoryDisplay();
}

/**
 * Show user info panel in analysis mode after importing logs
 * @param {object} data - Imported log data
 */
export function showUserInfoPanel(data) {
  const leftPanel = document.querySelector('.left-panel');
  if (!leftPanel) return;
  
  // Extract user info from imported data
  const userAgent = data.userAgent || '未知';
  const url = data.url || '未知';
  const exportTime = data.exportTime ? new Date(data.exportTime).toLocaleString('zh-CN') : '未知';
  const swStatus = data.swStatus || {};
  const memory = data.memory || {};
  const cacheStats = data.cacheStats || {};
  
  // Parse UA for display
  const uaInfo = parseUserAgent(userAgent);
  
  // Calculate total logs
  const summary = data.summary || {};
  const logCounts = {
    fetch: summary.fetchLogs || (data.fetchLogs?.length || 0),
    console: summary.consoleLogs || (data.consoleLogs?.length || 0),
    postmessage: summary.postmessageLogs || (data.postmessageLogs?.length || 0),
    memory: summary.memoryLogs || (data.memoryLogs?.length || 0),
    llmapi: summary.llmapiLogs || (data.llmapiLogs?.length || 0),
  };
  const totalLogs = Object.values(logCounts).reduce((a, b) => a + b, 0);
  
  leftPanel.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        👤 用户信息
      </div>
      <div class="panel-content">
        <div class="stat-grid">
          <div class="stat-item" style="grid-column: 1 / -1;">
            <span class="label">访问地址</span>
            <span class="value" style="font-size: 11px; word-break: break-all;" title="${escapeHtml(url)}">${escapeHtml(truncateUrl(url, 40))}</span>
          </div>
          <div class="stat-item">
            <span class="label">浏览器</span>
            <span class="value">${escapeHtml(uaInfo.browser)}</span>
          </div>
          <div class="stat-item">
            <span class="label">系统</span>
            <span class="value">${escapeHtml(uaInfo.os)}</span>
          </div>
          <div class="stat-item">
            <span class="label">导出时间</span>
            <span class="value" style="font-size: 11px;">${escapeHtml(exportTime)}</span>
          </div>
          <div class="stat-item">
            <span class="label">日志总数</span>
            <span class="value">${totalLogs}</span>
          </div>
        </div>
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">
          <details style="font-size: 11px;">
            <summary style="cursor: pointer; color: var(--text-secondary);">完整 User-Agent</summary>
            <p style="margin-top: 8px; word-break: break-all; color: var(--text-secondary); line-height: 1.4;">${escapeHtml(userAgent)}</p>
          </details>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        📊 导出时状态
      </div>
      <div class="panel-content">
        <div class="stat-grid">
          <div class="stat-item">
            <span class="label">SW 版本</span>
            <span class="value">${escapeHtml(swStatus.version || '-')}</span>
          </div>
          <div class="stat-item">
            <span class="label">调试模式</span>
            <span class="value">${swStatus.debugModeEnabled ? '开启' : '关闭'}</span>
          </div>
          <div class="stat-item">
            <span class="label">工作流处理器</span>
            <span class="value">${swStatus.workflowHandlerInitialized ? '已初始化' : '未初始化'}</span>
          </div>
          <div class="stat-item">
            <span class="label">调试日志数</span>
            <span class="value">${swStatus.debugLogsCount || 0}</span>
          </div>
        </div>
      </div>
    </div>

    ${memory.usedMB ? `
    <div class="panel">
      <div class="panel-header">
        💾 内存快照
      </div>
      <div class="panel-content">
        <div class="stat-grid">
          <div class="stat-item">
            <span class="label">JS 堆已使用</span>
            <span class="value">${memory.usedMB} MB</span>
          </div>
          <div class="stat-item">
            <span class="label">JS 堆总大小</span>
            <span class="value">${memory.totalMB} MB</span>
          </div>
          <div class="stat-item">
            <span class="label">使用率</span>
            <span class="value ${memory.usagePercent > 80 ? 'warning' : ''}">${memory.usagePercent}%</span>
          </div>
        </div>
      </div>
    </div>
    ` : ''}

    ${Object.keys(cacheStats).length > 0 ? `
    <div class="panel">
      <div class="panel-header">
        📦 缓存快照
      </div>
      <div class="panel-content">
        <ul class="cache-list">
          ${Object.entries(cacheStats).map(([name, stats]) => `
            <li class="cache-item">
              <span class="name" title="${escapeHtml(name)}">${escapeHtml(truncateUrl(name, 25))}</span>
              <span class="count">${stats.count} 项</span>
              <span class="size">${formatBytes(stats.totalSize)}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    </div>
    ` : ''}

    <div class="panel">
      <div class="panel-header">
        📋 日志统计
      </div>
      <div class="panel-content">
        <div class="stat-grid">
          ${logCounts.fetch > 0 ? `<div class="stat-item"><span class="label">Fetch</span><span class="value">${logCounts.fetch}</span></div>` : ''}
          ${logCounts.console > 0 ? `<div class="stat-item"><span class="label">控制台</span><span class="value">${logCounts.console}</span></div>` : ''}
          ${logCounts.postmessage > 0 ? `<div class="stat-item"><span class="label">PostMessage</span><span class="value">${logCounts.postmessage}</span></div>` : ''}
          ${logCounts.memory > 0 ? `<div class="stat-item"><span class="label">内存</span><span class="value">${logCounts.memory}</span></div>` : ''}
          ${logCounts.llmapi > 0 ? `<div class="stat-item"><span class="label">LLM API</span><span class="value">${logCounts.llmapi}</span></div>` : ''}
          ${totalLogs === 0 ? `<div class="stat-item" style="grid-column: 1 / -1;"><span class="label">无日志数据</span></div>` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Show import prompt in logs container
 */
export function showImportPrompt() {
  if (elements.logsContainer) {
    elements.logsContainer.innerHTML = `
      <div class="empty-state analysis-mode-prompt">
        <span class="icon">📁</span>
        <h3>分析模式</h3>
        <p>在此模式下，您可以导入用户提供的日志文件进行分析</p>
        <p style="font-size: 12px; opacity: 0.7; margin-bottom: 20px;">
          支持从"导出日志"功能生成的 JSON 文件
        </p>
        <button id="importPromptBtn" class="primary" style="margin-top: 10px;">
          <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; margin-right: 6px;">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
          </svg>
          导入日志文件
        </button>
        <p style="font-size: 11px; opacity: 0.5; margin-top: 16px;">
          点击右上角搜索图标可退出分析模式
        </p>
      </div>
    `;
    
    // Attach event listener to the prompt button
    const btn = document.getElementById('importPromptBtn');
    if (btn) {
      btn.addEventListener('click', triggerImportDialog);
    }
  }
}

/**
 * Exit analysis mode and restore normal SW connection
 */
export function exitAnalysisMode() {
  state.importedLogData = null;
  
  // Restore live logs that were collected during analysis mode
  state.logs = state.liveLogs.logs;
  state.consoleLogs = state.liveLogs.consoleLogs;
  state.postmessageLogs = state.liveLogs.postmessageLogs;
  state.crashLogs = state.liveLogs.crashLogs;
  state.llmapiLogs = state.liveLogs.llmapiLogs;
  
  // Re-render with restored logs
  if (renderLogs) renderLogs();
  if (renderConsoleLogs) renderConsoleLogs();
  if (updateMessageTypeOptions) updateMessageTypeOptions();
  if (renderPostmessageLogs) renderPostmessageLogs();
  if (renderCrashLogs) renderCrashLogs();
  if (renderLLMApiLogs) renderLLMApiLogs();
  
  // Update tab counts
  if (updateConsoleCount) updateConsoleCount();
  if (updatePostmessageCount) updatePostmessageCount();
  if (updateCrashCount) updateCrashCount();
  if (updateErrorDots) updateErrorDots();
  
  // Reconnect to SW and refresh status
  if (navigator.serviceWorker?.controller) {
    enableDebug();
    refreshStatus();
    // Re-fetch latest logs from SW (will merge with restored logs)
    loadConsoleLogs();
    loadPostMessageLogs();
    if (loadCrashLogs) loadCrashLogs();
    if (loadLLMApiLogs) loadLLMApiLogs();
  }
}

/**
 * Trigger file import dialog
 */
export function triggerImportDialog() {
  if (elements.importLogsInput) {
    elements.importLogsInput.click();
  }
}

/**
 * Handle imported log file
 * @param {Event} event - File input change event
 */
export async function handleLogImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Validate the imported data structure
    if (!data || typeof data !== 'object') {
      throw new Error('无效的日志文件格式');
    }
    
    // Store imported data
    state.importedLogData = data;
    
    // Parse and load logs from the imported data
    loadImportedLogs(data);
    
    // Show success notification
    showImportSuccessMessage(file.name, data);
    
  } catch (error) {
    console.error('Failed to import log file:', error);
    showToast(`导入失败: ${error.message}`, 'error', 5000);
  }
  
  // Reset file input so same file can be selected again
  event.target.value = '';
}

/**
 * Load logs from imported data
 * @param {object} data - Imported log data
 */
function loadImportedLogs(data) {
  // Load fetch logs
  if (data.fetchLogs && Array.isArray(data.fetchLogs)) {
    state.logs = data.fetchLogs.map(log => ({
      ...log,
      // Ensure required fields exist
      id: log.id || `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: log.timestamp || Date.now(),
    }));
    if (renderLogs) renderLogs();
  }
  
  // Load console logs
  if (data.consoleLogs && Array.isArray(data.consoleLogs)) {
    state.consoleLogs = data.consoleLogs.map(log => ({
      ...log,
      id: log.id || `console-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: log.timestamp || Date.now(),
    }));
    if (renderConsoleLogs) renderConsoleLogs();
  }
  
  // Load postmessage logs
  if (data.postmessageLogs && Array.isArray(data.postmessageLogs)) {
    state.postmessageLogs = data.postmessageLogs.map(log => ({
      ...log,
      id: log.id || `pm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: log.timestamp || Date.now(),
    }));
    if (updateMessageTypeOptions) updateMessageTypeOptions();
    if (renderPostmessageLogs) renderPostmessageLogs();
  }
  
  // Load memory/crash logs
  if (data.memoryLogs && Array.isArray(data.memoryLogs)) {
    state.crashLogs = data.memoryLogs.map(log => ({
      ...log,
      id: log.id || `crash-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: log.timestamp || Date.now(),
    }));
    if (renderCrashLogs) renderCrashLogs();
  }
  
  // Load LLM API logs
  if (data.llmapiLogs && Array.isArray(data.llmapiLogs)) {
    state.llmapiLogs = data.llmapiLogs.map(log => ({
      ...log,
      id: log.id || `llm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: log.timestamp || Date.now(),
    }));
    if (renderLLMApiLogs) renderLLMApiLogs();
  }
  
  // Store SW status from imported data for display
  if (data.swStatus) {
    state.swStatus = data.swStatus;
  }
  
  // Update tab counts
  if (updateConsoleCount) updateConsoleCount();
  if (updatePostmessageCount) updatePostmessageCount();
  if (updateCrashCount) updateCrashCount();
  if (updateErrorDots) updateErrorDots();
  
  // Show user info panel in left sidebar
  showUserInfoPanel(data);
}

/**
 * Show success message after importing logs
 * @param {string} filename
 * @param {object} data
 */
function showImportSuccessMessage(filename, data) {
  const summary = data.summary || {};
  const counts = {
    fetch: summary.fetchLogs || (data.fetchLogs?.length || 0),
    console: summary.consoleLogs || (data.consoleLogs?.length || 0),
    postmessage: summary.postmessageLogs || (data.postmessageLogs?.length || 0),
    memory: summary.memoryLogs || (data.memoryLogs?.length || 0),
    llmapi: summary.llmapiLogs || (data.llmapiLogs?.length || 0),
  };
  
  const totalLogs = counts.fetch + counts.console + counts.postmessage + counts.memory + counts.llmapi;
  
  // Create a temporary notification
  const notification = document.createElement('div');
  notification.className = 'import-notification';
  notification.innerHTML = `
    <div class="import-notification-content">
      <span class="icon">✅</span>
      <div class="info">
        <strong>导入成功</strong>
        <p>${filename}</p>
        <p class="counts">
          共 ${totalLogs} 条日志
          ${counts.fetch > 0 ? `| Fetch: ${counts.fetch}` : ''}
          ${counts.console > 0 ? `| 控制台: ${counts.console}` : ''}
          ${counts.postmessage > 0 ? `| PostMessage: ${counts.postmessage}` : ''}
          ${counts.memory > 0 ? `| 内存: ${counts.memory}` : ''}
          ${counts.llmapi > 0 ? `| LLM API: ${counts.llmapi}` : ''}
        </p>
        ${data.exportTime ? `<p class="export-time">导出时间: ${new Date(data.exportTime).toLocaleString('zh-CN')}</p>` : ''}
      </div>
      <button class="close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}
