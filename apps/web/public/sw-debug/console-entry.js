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
 * 尝试解析 JSON 格式的日志消息
 * @param {unknown} msg
 * @returns {{ parsed: boolean, message: string, stack?: string, source?: string, extra?: object }}
 */
function parseLogMessage(msg) {
  if (msg == null) return { parsed: false, message: '' };
  
  const msgStr = typeof msg === 'string' ? msg : (
    typeof msg === 'object' ? JSON.stringify(msg) : String(msg)
  );
  
  // 尝试解析 JSON 格式的消息
  if (msgStr.startsWith('{') && msgStr.endsWith('}')) {
    try {
      const obj = JSON.parse(msgStr);
      if (obj && typeof obj === 'object') {
        const result = {
          parsed: true,
          message: obj.message || msgStr,
          stack: obj.stack || undefined,
          source: obj.source || undefined,
        };
        // 收集其他额外字段
        const extra = {};
        for (const key of Object.keys(obj)) {
          if (!['message', 'stack', 'source'].includes(key)) {
            extra[key] = obj[key];
          }
        }
        if (Object.keys(extra).length > 0) {
          result.extra = extra;
        }
        return result;
      }
    } catch {
      // 解析失败，使用原始字符串
    }
  }
  
  return { parsed: false, message: msgStr };
}

/**
 * 格式化 JSON 对象为带语法高亮的 HTML
 * @param {unknown} obj
 * @param {number} indent
 * @returns {string}
 */
function formatJsonHtml(obj, indent = 0) {
  const indentStr = '  '.repeat(indent);
  
  if (obj === null) {
    return '<span class="json-null">null</span>';
  }
  if (typeof obj === 'boolean') {
    return `<span class="json-boolean">${obj}</span>`;
  }
  if (typeof obj === 'number') {
    return `<span class="json-number">${obj}</span>`;
  }
  if (typeof obj === 'string') {
    // 截断过长的字符串
    const displayStr = obj.length > 500 ? obj.substring(0, 500) + '...' : obj;
    return `<span class="json-string">"${escapeHtml(displayStr)}"</span>`;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    const items = obj.map(item => `${indentStr}  ${formatJsonHtml(item, indent + 1)}`);
    return `[\n${items.join(',\n')}\n${indentStr}]`;
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    const items = keys.map(key => 
      `${indentStr}  <span class="json-key">"${escapeHtml(key)}"</span>: ${formatJsonHtml(obj[key], indent + 1)}`
    );
    return `{\n${items.join(',\n')}\n${indentStr}}`;
  }
  return escapeHtml(String(obj));
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
  
  // 解析日志消息
  const parsedMsg = parseLogMessage(log.logMessage);
  const displayMessage = parsedMsg.message;
  
  // 合并来自 log 对象和解析出的信息
  const stack = log.logStack?.trim() || parsedMsg.stack?.trim() || '';
  const source = log.logSource || parsedMsg.source || '';
  const hasStack = !!stack;
  const hasSource = !!source;
  const hasExtra = parsedMsg.extra && Object.keys(parsedMsg.extra).length > 0;
  
  // 总是显示展开按钮（消息长度超过 80 字符或有详细信息）
  const hasDetails = hasStack || hasSource || log.url || hasExtra || displayMessage.length > 80;

  // Map log level to status class
  const levelStatusClass = {
    'error': 'error',
    'warn': 'redirect',
    'info': 'success',
    'log': 'pending',
    'debug': 'pending',
  }[level] || 'pending';

  // 头部显示截断的消息
  const headerMessage = displayMessage.length > 120 
    ? displayMessage.substring(0, 120) + '...' 
    : displayMessage;

  entry.innerHTML = `
    <div class="log-header">
      ${hasDetails ? `<span class="log-toggle" title="展开/收起详情"><span class="arrow">▶</span></span>` : '<span style="width: 16px; display: inline-block;"></span>'}
      <span class="log-time">${formatTime(log.timestamp)}</span>
      <span class="log-status ${levelStatusClass}">${level.toUpperCase()}</span>
      <span class="log-url" title="${escapeHtml(displayMessage)}">${escapeHtml(headerMessage)}</span>
    </div>
    ${hasDetails ? `
      <div class="log-details">
        <div class="detail-section">
          <h4>完整消息</h4>
          <pre class="console-message-pre">${escapeHtml(displayMessage)}</pre>
        </div>
        ${hasSource ? `
          <div class="detail-section">
            <h4>来源</h4>
            <pre class="console-source-pre">${escapeHtml(source)}</pre>
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
            <pre class="console-stack-pre" style="color: var(--error-color);">${formatStack(stack)}</pre>
          </div>
        ` : ''}
        ${hasExtra ? `
          <div class="detail-section">
            <h4>其他信息</h4>
            <pre class="json-highlight">${formatJsonHtml(parsedMsg.extra)}</pre>
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
