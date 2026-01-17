/**
 * SW Debug Panel - PostMessage Entry Component
 */

import { formatTime, escapeHtml } from './utils.js';

/**
 * Format JSON data for display
 * @param {any} data
 * @param {number} maxLength - Max string length before truncation
 * @returns {string}
 */
function formatData(data, maxLength = 500) {
  if (data === undefined) return '<span class="pm-undefined">undefined</span>';
  if (data === null) return '<span class="pm-null">null</span>';

  try {
    const str = JSON.stringify(data, null, 2);
    if (str.length > maxLength) {
      return escapeHtml(str.slice(0, maxLength)) + '...';
    }
    return escapeHtml(str);
  } catch {
    return escapeHtml(String(data));
  }
}

/**
 * Get a short preview of the message data
 * @param {any} data
 * @returns {string}
 */
function getDataPreview(data) {
  if (data === undefined || data === null) return '';

  try {
    const str = JSON.stringify(data);
    if (str.length > 60) {
      return escapeHtml(str.slice(0, 60)) + '...';
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
  entry.className = `pm-entry ${directionClass}${isExpanded ? ' expanded' : ''}`;
  entry.dataset.id = log.id;

  const directionIcon = log.direction === 'send' ? '→' : '←';
  const directionLabel = log.direction === 'send' ? '发送' : '接收';
  const directionTarget = log.direction === 'send' ? 'SW' : '主线程';

  const messageType = log.messageType || 'unknown';
  const dataPreview = getDataPreview(log.data);

  entry.innerHTML = `
    <div class="pm-header">
      <span class="pm-toggle">
        <span class="arrow">▶</span>
      </span>
      <span class="pm-time">${formatTime(log.timestamp)}</span>
      <span class="pm-direction ${directionClass}">
        <span class="pm-direction-icon">${directionIcon}</span>
        ${directionLabel}
      </span>
      <span class="pm-type">${escapeHtml(messageType)}</span>
      <span class="pm-preview">${dataPreview}</span>
    </div>
    <div class="pm-details">
      <div class="pm-detail-section">
        <div class="pm-detail-header">
          <span class="pm-detail-label">方向</span>
          <span class="pm-detail-value">${directionLabel} ${directionTarget}</span>
        </div>
        <div class="pm-detail-header">
          <span class="pm-detail-label">消息类型</span>
          <span class="pm-detail-value pm-type-value">${escapeHtml(messageType)}</span>
        </div>
        <div class="pm-detail-header">
          <span class="pm-detail-label">时间</span>
          <span class="pm-detail-value">${new Date(log.timestamp).toLocaleString('zh-CN')}</span>
        </div>
      </div>
      <div class="pm-detail-section">
        <div class="pm-detail-label">消息数据</div>
        <pre class="pm-data">${formatData(log.data)}</pre>
      </div>
      ${log.response !== undefined ? `
        <div class="pm-detail-section">
          <div class="pm-detail-label">响应数据</div>
          <pre class="pm-data pm-response">${formatData(log.response)}</pre>
        </div>
      ` : ''}
      ${log.error ? `
        <div class="pm-detail-section">
          <div class="pm-detail-label">错误信息</div>
          <pre class="pm-data pm-error">${escapeHtml(log.error)}</pre>
        </div>
      ` : ''}
    </div>
  `;

  // Add toggle functionality
  const header = entry.querySelector('.pm-header');
  if (header) {
    header.addEventListener('click', () => {
      const isNowExpanded = entry.classList.toggle('expanded');
      if (onToggle) {
        onToggle(log.id, isNowExpanded);
      }
    });
  }

  return entry;
}
