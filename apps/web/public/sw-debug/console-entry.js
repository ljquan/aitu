/**
 * SW Debug Panel - Console Entry Component
 * 
 * 支持两种日志格式：
 * 1. 控制台日志格式：logLevel, logMessage, logStack, logSource
 * 2. 同步日志格式：level, message, data, error, sessionId, duration, category
 */

import { formatTime, escapeHtml, formatDuration } from './utils.js';

/**
 * 日志级别标签映射
 */
const LEVEL_LABELS = {
  error: '错误',
  warn: '警告',
  warning: '警告',
  success: '成功',
  info: '信息',
  log: '日志',
  debug: '调试',
};

/**
 * 标准化日志级别
 * @param {string} level 
 * @returns {string}
 */
function normalizeLevel(level) {
  // 统一 warn/warning
  if (level === 'warning') return 'warn';
  return level || 'log';
}

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
 * 标准化日志对象，统一两种格式
 * @param {object} log - 原始日志对象
 * @returns {object} 标准化后的日志对象
 */
function normalizeLog(log) {
  // 同步日志格式使用 level/message，控制台日志使用 logLevel/logMessage
  const level = normalizeLevel(log.level || log.logLevel);
  const message = log.message || log.logMessage || '';
  
  // 堆栈信息
  let stack = log.logStack || '';
  if (log.error && log.error.stack) {
    stack = log.error.stack;
  }
  
  // 来源信息
  const source = log.logSource || '';
  
  // 同步日志特有字段
  const sessionId = log.sessionId || null;
  const duration = log.duration || null;
  const category = log.category || null;
  const data = log.data || null;
  const error = log.error || null;
  
  return {
    id: log.id,
    timestamp: log.timestamp,
    level,
    message,
    stack,
    source,
    url: log.url,
    // 同步日志扩展字段
    sessionId,
    duration,
    category,
    data,
    error,
  };
}

/**
 * 格式化会话 ID 显示
 * @param {string} sessionId 
 * @returns {string}
 */
function formatSessionId(sessionId) {
  if (!sessionId) return '';
  // Format: sync-1234567890-abc123
  const parts = sessionId.split('-');
  if (parts.length >= 3) {
    const timestamp = parseInt(parts[1]);
    if (!isNaN(timestamp)) {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
  }
  return sessionId.slice(-8);
}

/**
 * Create a console log entry DOM element
 * Uses the same styles as Fetch logs for consistency
 * 
 * 支持两种日志格式：
 * - 控制台日志：{ logLevel, logMessage, logStack, logSource, url }
 * - 同步日志：{ level, message, data, error, sessionId, duration, category }
 * 
 * @param {object} log 
 * @param {boolean} isExpanded - Initial expanded state for stack
 * @param {Function} onToggle - Callback when expand state changes (id, expanded)
 * @param {object} options - 额外配置选项
 * @param {boolean} options.showDate - 是否显示日期（默认 false）
 * @param {boolean} options.showLevelLabel - 是否显示级别的中文标签（默认 false）
 * @returns {HTMLElement}
 */
export function createConsoleEntry(log, isExpanded = false, onToggle = null, options = {}) {
  const { showDate = false, showLevelLabel = false } = options;
  
  // 标准化日志格式
  const normalized = normalizeLog(log);
  const level = normalized.level;
  
  const entry = document.createElement('div');
  entry.className = `log-entry console-entry ${level}` + (isExpanded ? ' expanded' : '');
  entry.dataset.id = normalized.id;
  
  // 解析日志消息
  const parsedMsg = parseLogMessage(normalized.message);
  const displayMessage = parsedMsg.message;
  
  // 合并来自 log 对象和解析出的信息
  const stack = normalized.stack?.trim() || parsedMsg.stack?.trim() || '';
  const source = normalized.source || parsedMsg.source || '';
  const hasStack = !!stack;
  const hasSource = !!source;
  const hasExtra = parsedMsg.extra && Object.keys(parsedMsg.extra).length > 0;
  
  // 同步日志扩展字段
  const hasData = normalized.data && Object.keys(normalized.data).length > 0;
  const hasError = normalized.error && (normalized.error.name || normalized.error.message);
  const hasSession = !!normalized.sessionId;
  const hasDuration = normalized.duration != null;
  
  // 总是显示展开按钮（消息长度超过 80 字符或有详细信息）
  const hasDetails = hasStack || hasSource || normalized.url || hasExtra || hasData || hasError || displayMessage.length > 80;

  // Map log level to status class
  const levelStatusClass = {
    'error': 'error',
    'warn': 'redirect',
    'warning': 'redirect',
    'success': 'success',
    'info': 'success',
    'log': 'pending',
    'debug': 'pending',
  }[level] || 'pending';

  // 头部显示截断的消息
  const headerMessage = displayMessage.length > 120 
    ? displayMessage.substring(0, 120) + '...' 
    : displayMessage;

  // 格式化时间（可选显示日期）
  const timeStr = showDate 
    ? formatTimeWithDate(normalized.timestamp)
    : formatTime(normalized.timestamp);
  
  // 级别显示文本
  const levelText = showLevelLabel 
    ? (LEVEL_LABELS[level] || level.toUpperCase())
    : level.toUpperCase();

  // 构建头部额外信息
  let headerExtra = '';
  if (hasDuration) {
    headerExtra += `<span class="log-duration">${formatDuration(normalized.duration)}</span>`;
  }
  if (hasSession) {
    headerExtra += `<span class="console-entry-session" title="${normalized.sessionId}">${formatSessionId(normalized.sessionId)}</span>`;
  }

  entry.innerHTML = `
    <div class="log-header">
      ${hasDetails ? `<span class="log-toggle" title="展开/收起详情"><span class="arrow">▶</span></span>` : '<span style="width: 16px; display: inline-block;"></span>'}
      <span class="log-time">${timeStr}</span>
      <span class="log-status ${levelStatusClass}">${levelText}</span>
      <span class="log-url" title="${escapeHtml(displayMessage)}">${escapeHtml(headerMessage)}</span>
      ${headerExtra}
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
        ${normalized.url ? `
          <div class="detail-section">
            <h4>页面</h4>
            <pre>${escapeHtml(normalized.url)}</pre>
          </div>
        ` : ''}
        ${hasData ? `
          <div class="detail-section">
            <h4>附加数据</h4>
            <pre class="json-highlight">${formatJsonHtml(normalized.data)}</pre>
          </div>
        ` : ''}
        ${hasError ? `
          <div class="detail-section">
            <h4>错误信息</h4>
            <div class="console-error-block">
              <div class="console-error-name">${escapeHtml(normalized.error.name || 'Error')}</div>
              <div class="console-error-message">${escapeHtml(normalized.error.message || '')}</div>
              ${normalized.error.stack ? `<pre class="console-stack-pre" style="color: var(--error-color);">${formatStack(normalized.error.stack)}</pre>` : ''}
            </div>
          </div>
        ` : ''}
        ${hasStack && !hasError ? `
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
      onToggle(normalized.id, isNowExpanded);
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
 * 格式化带日期的时间
 * @param {number} timestamp 
 * @returns {string}
 */
function formatTimeWithDate(timestamp) {
  const date = new Date(timestamp);
  const month = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${month} ${time}`;
}

/**
 * Get the inject code for capturing console logs
 * @returns {string}
 */
export function getInjectCode() {
  return `(function(){const o=console.error,w=console.warn,i=console.info,l=console.log;function s(t,m,k){if(navigator.serviceWorker?.controller){const e=m instanceof Error?m.message:String(m);const st=m instanceof Error?m.stack:'';navigator.serviceWorker.controller.postMessage({type:'SW_CONSOLE_LOG_REPORT',logLevel:t,logMessage:e,logStack:st,logSource:k||'',url:location.href});}}console.error=function(...a){o.apply(console,a);s('error',a[0]);};console.warn=function(...a){w.apply(console,a);s('warn',a[0]);};window.addEventListener('error',e=>s('error',e.message,e.filename+':'+e.lineno));window.addEventListener('unhandledrejection',e=>s('error','Unhandled Promise: '+e.reason));console.log('[SW Debug] 日志捕获已启用');})()`;
}
