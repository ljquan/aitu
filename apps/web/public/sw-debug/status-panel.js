/**
 * SW Debug Panel - Status Panel Component
 */

import { formatSize } from './utils.js';

/**
 * Update SW status indicator
 * @param {HTMLElement} element 
 * @param {boolean} connected 
 * @param {string} version 
 */
export function updateSwStatus(element, connected, version) {
  if (connected) {
    element.className = 'status-indicator active';
    element.querySelector('.text').textContent = version ? `v${version}` : '已连接';
  } else {
    element.className = 'status-indicator inactive';
    element.querySelector('.text').textContent = '未连接';
  }
}

/**
 * Update status panel with SW status data
 * @param {object} status 
 * @param {object} elements - DOM elements
 */
export function updateStatusPanel(status, elements) {
  elements.swVersion.textContent = status.version || '-';
  elements.debugMode.textContent = status.debugModeEnabled ? '开启' : '关闭';
  elements.pendingImages.textContent = status.pendingImageRequests || 0;
  elements.pendingVideos.textContent = status.pendingVideoRequests || 0;
  elements.videoBlobCache.textContent = status.videoBlobCacheSize || 0;
  elements.completedRequests.textContent = status.completedImageRequestsSize || 0;
  elements.workflowHandler.textContent = status.workflowHandlerInitialized ? '已初始化' : '未初始化';
  elements.debugLogsCount.textContent = status.debugLogsCount || 0;

  // Failed domains
  if (status.failedDomains && status.failedDomains.length > 0) {
    elements.failedDomainsSection.style.display = 'block';
    elements.failedDomains.innerHTML = status.failedDomains
      .map(d => `<span class="failed-domain-tag">${d}</span>`)
      .join('');
  } else {
    elements.failedDomainsSection.style.display = 'none';
  }

  // Cache stats
  if (status.cacheStats) {
    updateCacheList(elements.cacheList, status.cacheStats);
  }

  return status.debugModeEnabled;
}

/**
 * Update cache list with stats
 * @param {HTMLElement} cacheList 
 * @param {object} cacheStats 
 */
export function updateCacheList(cacheList, cacheStats) {
  const entries = Object.entries(cacheStats);
  
  // 分离 Cache API 和 IndexedDB
  const cacheEntries = entries.filter(([, s]) => s.type !== 'indexeddb');
  const idbEntries = entries.filter(([, s]) => s.type === 'indexeddb');
  
  let html = '';
  
  // Cache API 部分
  if (cacheEntries.length > 0) {
    html += '<li class="cache-section-header">Cache API</li>';
    html += cacheEntries.map(([name, stats]) => `
      <li class="cache-item">
        <span class="name">${name.replace('drawnix-', '')}</span>
        <span class="stats">
          <span>${stats.count} 项</span>
          <span>${formatSize(stats.totalSize)}</span>
        </span>
      </li>
    `).join('');
  }
  
  // IndexedDB 部分
  if (idbEntries.length > 0) {
    html += '<li class="cache-section-header">IndexedDB</li>';
    html += idbEntries.map(([name, stats]) => `
      <li class="cache-item">
        <span class="name">${name.replace('[IDB] ', '').replace('drawnix-', '')}</span>
        <span class="stats">
          <span>${stats.count} 条</span>
          <span>~${formatSize(stats.totalSize)}</span>
        </span>
      </li>
    `).join('');
  }
  
  cacheList.innerHTML = html || '<li class="cache-item"><span class="name">暂无缓存</span></li>';
}

/**
 * Update debug button state
 * @param {HTMLElement} button 
 * @param {boolean} enabled 
 */
export function updateDebugButton(button, enabled) {
  if (enabled) {
    button.innerHTML = '<span>⏸</span> 停止调试';
    button.classList.remove('primary');
    button.classList.add('danger');
  } else {
    button.innerHTML = '<span>▶</span> 启用调试';
    button.classList.remove('danger');
    button.classList.add('primary');
  }
}
