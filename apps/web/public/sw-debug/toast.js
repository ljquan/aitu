/**
 * SW Debug Panel - Toast Notifications
 * Toast 通知组件
 */

import { escapeHtml } from './common.js';

/**
 * 显示 Toast 通知
 * @param {string} message - 通知消息
 * @param {string} type - 类型: 'success' | 'error' | 'warning' | 'info'
 * @param {number} duration - 持续时间（毫秒），默认 3000
 */
export function showToast(message, type = 'success', duration = 3000) {
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };
  
  const notification = document.createElement('div');
  notification.className = `import-notification toast-notification toast-${type}`;
  notification.innerHTML = `
    <div class="import-notification-content">
      <span class="icon">${icons[type] || icons.info}</span>
      <div class="info">
        <p style="margin: 0; white-space: pre-line;">${escapeHtml(message)}</p>
      </div>
      <button class="close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // 自动消失
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 300);
  }, duration);
}
