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
 * @param {object} log 
 * @param {boolean} isExpanded - Initial expanded state for stack
 * @param {Function} onToggle - Callback when expand state changes (id, expanded)
 * @returns {HTMLElement}
 */
export function createConsoleEntry(log, isExpanded = false, onToggle = null) {
  const entry = document.createElement('div');
  entry.className = `console-entry ${log.logLevel || 'log'}`;
  entry.dataset.id = log.id;
  
  const hasStack = log.logStack && log.logStack.trim();
  const stackToggle = hasStack 
    ? `<span class="stack-toggle" title="展开/收起堆栈"><span class="arrow">▶</span> 堆栈</span>` 
    : '';

  entry.innerHTML = `
    <div class="console-header">
      <span class="log-time">${formatTime(log.timestamp)}</span>
      <span class="console-level ${log.logLevel || 'log'}">${(log.logLevel || 'log').toUpperCase()}</span>
      <span class="console-message">${escapeHtml(log.logMessage || '')}</span>
    </div>
    ${log.logSource ? `<div class="console-source">${escapeHtml(log.logSource)}</div>` : ''}
    ${log.url ? `<div class="console-source">页面: ${escapeHtml(log.url)}</div>` : ''}
    ${hasStack ? `
      <div class="console-stack-container${isExpanded ? ' expanded' : ''}">
        ${stackToggle}
        <pre class="console-stack">${formatStack(log.logStack)}</pre>
      </div>
    ` : ''}
  `;

  // Add toggle functionality for stack
  if (hasStack) {
    const stackContainer = entry.querySelector('.console-stack-container');
    const toggle = entry.querySelector('.stack-toggle');
    
    if (toggle && stackContainer) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isNowExpanded = stackContainer.classList.toggle('expanded');
        if (onToggle) {
          onToggle(log.id, isNowExpanded);
        }
      });
    }
  }

  return entry;
}

/**
 * Get the inject code for capturing console logs
 * @returns {string}
 */
export function getInjectCode() {
  return `(function(){const o=console.error,w=console.warn,i=console.info,l=console.log;function s(t,m,k){if(navigator.serviceWorker?.controller){const e=m instanceof Error?m.message:String(m);const st=m instanceof Error?m.stack:'';navigator.serviceWorker.controller.postMessage({type:'SW_CONSOLE_LOG_REPORT',logLevel:t,logMessage:e,logStack:st,logSource:k||'',url:location.href});}}console.error=function(...a){o.apply(console,a);s('error',a[0]);};console.warn=function(...a){w.apply(console,a);s('warn',a[0]);};window.addEventListener('error',e=>s('error',e.message,e.filename+':'+e.lineno));window.addEventListener('unhandledrejection',e=>s('error','Unhandled Promise: '+e.reason));console.log('[SW Debug] 日志捕获已启用');})()`;
}
