/**
 * SW Debug Panel - Console Entry Component
 */

import { formatTime, escapeHtml } from './utils.js';

/**
 * Format stack trace for better readability
 * @param {string} stack 
 * @returns {string}
 */
function formatStack(stack) {
  if (!stack) return '';
  
  // Split by newlines and format each line
  return stack.split('\n').map(line => {
    // Highlight file paths and line numbers
    return escapeHtml(line.trim());
  }).filter(Boolean).join('\n');
}

/**
 * Create a console log entry DOM element
 * Uses the same styles as Fetch logs for consistency
 * @param {object} log 
 * @param {boolean} isExpanded - Initial expanded state for stack
 * @param {Function} onToggle - Callback when expand state changes (id, expanded)
 * @returns {HTMLElement}
 */
export function createConsoleEntry(log, isExpanded = false, onToggle = null) {
  const entry = document.createElement('div');
  const level = log.logLevel || 'log';
  entry.className = `log-entry console-entry ${level}` + (isExpanded ? ' expanded' : '');
  entry.dataset.id = log.id;
  
  const hasStack = log.logStack && log.logStack.trim();
  const hasDetails = hasStack || log.logSource || log.url;

  // Map log level to status class
  const levelStatusClass = {
    'error': 'error',
    'warn': 'redirect',
    'info': 'success',
    'log': 'pending',
    'debug': 'pending',
  }[level] || 'pending';

  // Show full message in header (will wrap if needed)
  const messagePreview = log.logMessage || '-';

  entry.innerHTML = `
    <div class="log-header">
      ${hasDetails ? `<span class="log-toggle" title="展开/收起详情"><span class="arrow">▶</span></span>` : '<span style="width: 16px; display: inline-block;"></span>'}
      <span class="log-time">${formatTime(log.timestamp)}</span>
      <span class="log-status ${levelStatusClass}">${level.toUpperCase()}</span>
      <span class="log-url" title="${escapeHtml(log.logMessage || '')}">${escapeHtml(messagePreview)}</span>
    </div>
    ${hasDetails ? `
      <div class="log-details">
        ${log.logMessage ? `
          <div class="detail-section">
            <h4>完整消息</h4>
            <pre>${escapeHtml(log.logMessage)}</pre>
          </div>
        ` : ''}
        ${log.logSource ? `
          <div class="detail-section">
            <h4>来源</h4>
            <pre>${escapeHtml(log.logSource)}</pre>
          </div>
        ` : ''}
        ${log.url ? `
          <div class="detail-section">
            <h4>页面</h4>
            <pre>${escapeHtml(log.url)}</pre>
          </div>
        ` : ''}
        ${hasStack ? `
          <div class="detail-section">
            <h4>堆栈</h4>
            <pre style="color: var(--error-color);">${formatStack(log.logStack)}</pre>
          </div>
        ` : ''}
      </div>
    ` : ''}
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
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleExpand();
    });
  }

  // Toggle on header click (except toggle button)
  const header = entry.querySelector('.log-header');
  header.addEventListener('click', (e) => {
    if (e.target.closest('.log-toggle')) return;
    if (hasDetails) {
      toggleExpand();
    }
  });

  return entry;
}

/**
 * Get the inject code for capturing console logs
 * @returns {string}
 */
export function getInjectCode() {
  return `(function(){const o=console.error,w=console.warn,i=console.info,l=console.log;function s(t,m,k){if(navigator.serviceWorker?.controller){const e=m instanceof Error?m.message:String(m);const st=m instanceof Error?m.stack:'';navigator.serviceWorker.controller.postMessage({type:'SW_CONSOLE_LOG_REPORT',logLevel:t,logMessage:e,logStack:st,logSource:k||'',url:location.href});}}console.error=function(...a){o.apply(console,a);s('error',a[0]);};console.warn=function(...a){w.apply(console,a);s('warn',a[0]);};window.addEventListener('error',e=>s('error',e.message,e.filename+':'+e.lineno));window.addEventListener('unhandledrejection',e=>s('error','Unhandled Promise: '+e.reason));console.log('[SW Debug] 日志捕获已启用');})()`;
}
