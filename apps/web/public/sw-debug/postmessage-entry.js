/**
 * SW Debug Panel - PostMessage Entry Component
 */

import { formatTime, escapeHtml } from './utils.js';

/**
 * Get a display-friendly label for the client type
 * @param {string} clientType - The client type ('main', 'debug', 'other')
 * @returns {string}
 */
function getClientTypeLabel(clientType) {
  switch (clientType) {
    case 'main':
      return '应用页面';
    case 'debug':
      return '调试面板';
    default:
      return '其他';
  }
}

/**
 * Get a CSS class for the client type badge
 * @param {string} clientType - The client type
 * @returns {string}
 */
function getClientTypeClass(clientType) {
  switch (clientType) {
    case 'main':
      return 'client-type-main';
    case 'debug':
      return 'client-type-debug';
    default:
      return 'client-type-other';
  }
}

/**
 * Format JSON data for display (no truncation - show all data)
 * @param {any} data
 * @returns {string}
 */
function formatData(data) {
  if (data === undefined) return '<span class="pm-undefined">undefined</span>';
  if (data === null) return '<span class="pm-null">null</span>';

  try {
    const str = JSON.stringify(data, null, 2);
    return escapeHtml(str);
  } catch {
    return escapeHtml(String(data));
  }
}

/**
 * Get a preview of the message data (collapsed row preview)
 * @param {any} data
 * @returns {string}
 */
function getDataPreview(data) {
  if (data === undefined || data === null) return '';

  try {
    const str = JSON.stringify(data);
    // Show more content in preview (500 chars), CSS handles overflow
    if (str.length > 500) {
      return escapeHtml(str.slice(0, 500)) + '...';
    }
    return escapeHtml(str);
  } catch {
    return '';
  }
}

/**
 * Create a PostMessage log entry DOM element
 * @param {object} log - The log entry object
 * @param {boolean} isExpanded - Initial expanded state
 * @param {Function} onToggle - Callback when expand state changes (id, expanded)
 * @returns {HTMLElement}
 */
export function createPostMessageEntry(log, isExpanded = false, onToggle = null) {
  const entry = document.createElement('div');
  const directionClass = log.direction === 'send' ? 'send' : 'receive';
  // 使用 log-entry 作为基础类，与 Fetch 日志统一
  entry.className = `log-entry pm-entry${isExpanded ? ' expanded' : ''}`;
  entry.dataset.id = log.id;

  const directionIcon = log.direction === 'send' ? '→' : '←';
  const directionLabel = log.direction === 'send' ? '发送' : '接收';
  const directionTarget = log.direction === 'send' ? 'SW' : '主线程';

  const messageType = log.messageType || 'unknown';
  const dataPreview = getDataPreview(log.data);

  // 构建客户端信息标签
  let clientBadge = '';
  if (log.clientType) {
    const clientTypeLabel = getClientTypeLabel(log.clientType);
    const clientTypeClass = getClientTypeClass(log.clientType);
    clientBadge = `<span class="pm-client-badge ${clientTypeClass}">${clientTypeLabel}</span>`;
  }

  entry.innerHTML = `
    <div class="log-header pm-header">
      <span class="log-toggle"><span class="arrow">▶</span></span>
      <span class="log-time pm-time">${formatTime(log.timestamp)}</span>
      <span class="pm-direction ${directionClass}">
        <span class="pm-direction-icon">${directionIcon}</span>${directionLabel}
      </span>
      ${clientBadge}
      <span class="pm-type">${escapeHtml(messageType)}</span>
      <span class="log-url pm-preview">${dataPreview}</span>
    </div>
    <div class="log-details pm-details">
      <div class="detail-section">
        <h4>基本信息</h4>
        <pre>方向: ${directionLabel} ${directionTarget}
消息类型: ${messageType}
${log.clientType ? `客户端: ${getClientTypeLabel(log.clientType)}` : ''}
${log.clientUrl ? `页面: ${log.clientUrl}` : ''}
${log.clientId ? `ClientID: ${log.clientId}` : ''}
时间: ${new Date(log.timestamp).toLocaleString('zh-CN')}</pre>
      </div>
      <div class="detail-section">
        <h4>消息数据</h4>
        <pre>${formatData(log.data)}</pre>
      </div>
      ${log.response !== undefined ? `
        <div class="detail-section">
          <h4>响应数据</h4>
          <pre style="border-left: 3px solid var(--success-color);">${formatData(log.response)}</pre>
        </div>
      ` : ''}
      ${log.error ? `
        <div class="detail-section">
          <h4>错误信息</h4>
          <pre style="color: var(--error-color);">${escapeHtml(log.error)}</pre>
        </div>
      ` : ''}
    </div>
  `;

  // Toggle expand on toggle button click
  const toggleBtn = entry.querySelector('.log-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isNowExpanded = entry.classList.toggle('expanded');
      if (onToggle) {
        onToggle(log.id, isNowExpanded);
      }
    });
  }

  return entry;
}
