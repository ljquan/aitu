/**
 * SW Debug Panel - Memory/Crash Logs
 * 内存和崩溃日志功能模块
 */

import { state, elements } from './state.js';
import { escapeHtml, formatBytes } from './common.js';
import { downloadJson, formatTime } from './utils.js';

// Memory monitoring interval
let memoryMonitorInterval = null;

/**
 * Load crash logs from SW
 */
export function loadCrashLogs() {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SW_DEBUG_GET_CRASH_SNAPSHOTS'
    });
  }
}

/**
 * Clear crash logs
 */
export function handleClearCrashLogs() {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SW_DEBUG_CLEAR_CRASH_SNAPSHOTS'
    });
  }
  state.crashLogs = [];
  renderCrashLogs();
}

/**
 * Get filtered crash logs based on current filters
 */
export function getFilteredCrashLogs() {
  const typeFilter = elements.filterCrashType?.value || '';

  let filteredLogs = state.crashLogs;

  if (typeFilter) {
    filteredLogs = filteredLogs.filter(l => l.type === typeFilter);
  }

  return filteredLogs;
}

/**
 * Render crash logs
 */
export function renderCrashLogs() {
  const filteredLogs = getFilteredCrashLogs();

  // Update count
  updateCrashCount();

  if (filteredLogs.length === 0) {
    elements.crashLogsContainer.innerHTML = `
      <div class="empty-state">
        <span class="icon">💥</span>
        <p>暂无内存日志</p>
        <p style="font-size: 12px; opacity: 0.7;">页面启动、内存超限、错误和关闭时的快照会自动记录</p>
      </div>
    `;
    return;
  }

  elements.crashLogsContainer.innerHTML = '';
  filteredLogs.forEach(log => {
    const isExpanded = state.expandedCrashIds.has(log.id);
    const entry = createCrashEntry(log, isExpanded, (id, expanded) => {
      if (expanded) {
        state.expandedCrashIds.add(id);
      } else {
        state.expandedCrashIds.delete(id);
      }
    });
    elements.crashLogsContainer.appendChild(entry);
  });
}

/**
 * Create a crash log entry element
 */
function createCrashEntry(log, isExpanded, onToggle) {
  const entry = document.createElement('div');
  // 使用与 Fetch 日志相同的样式
  entry.className = 'log-entry memory-entry' + (isExpanded ? ' expanded' : '');
  entry.dataset.id = log.id;
  
  const time = formatTime(log.timestamp);
  
  const typeLabels = {
    startup: '启动',
    periodic: '定期',
    error: '错误',
    beforeunload: '关闭',
    freeze: '卡死',
    whitescreen: '白屏',
    longtask: '长任务'
  };
  
  const typeLabel = typeLabels[log.type] || log.type;
  const isError = log.type === 'error';
  const isWarning = log.type === 'freeze' || log.type === 'whitescreen' || log.type === 'longtask';
  
  // 类型徽章样式类
  const typeClass = isError ? 'error' : (isWarning ? 'warning' : 'normal');
  
  // Memory info - 简化显示
  let memoryPercent = 0;
  if (log.memory) {
    memoryPercent = ((log.memory.usedJSHeapSize / log.memory.jsHeapSizeLimit) * 100);
  }
  
  // Page stats - 简化为一行
  let statsText = '';
  if (log.pageStats) {
    const stats = log.pageStats;
    statsText = `DOM ${stats.domNodeCount || 0} · Img ${stats.imageCount || 0}`;
    if (stats.plaitElementCount !== undefined) {
      statsText += ` · Plait ${stats.plaitElementCount}`;
    }
  }
  
  // Performance info - 完整显示
  let perfText = '';
  if (log.performance) {
    const parts = [];
    if (log.performance.longTaskDuration) {
      parts.push(`任务时长: ${log.performance.longTaskDuration.toFixed(0)}ms`);
    }
    if (log.performance.freezeDuration) {
      parts.push(`卡死时长: ${(log.performance.freezeDuration / 1000).toFixed(1)}s`);
    }
    if (log.performance.fps !== undefined) {
      parts.push(`FPS: ${log.performance.fps}`);
    }
    if (parts.length > 0) {
      perfText = parts.join(' | ');
    }
  }
  
  // Error preview - show full message (will wrap if needed)
  let errorPreview = '';
  if (log.error) {
    errorPreview = `<span class="log-url" style="color: var(--error-color);">${escapeHtml(log.error.message || '')}</span>`;
  }
  
  // 完整内存显示
  let memoryText = '';
  if (log.memory) {
    const usedMB = (log.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
    const limitMB = (log.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(1);
    memoryText = `${usedMB} MB / ${limitMB} MB (${memoryPercent.toFixed(1)}%)`;
  }
  
  entry.innerHTML = `
    <div class="log-header">
      <span class="log-toggle"><span class="arrow">▶</span></span>
      <span class="log-time">${time}</span>
      <span class="log-type-badge ${typeClass}">${typeLabel}</span>
      ${perfText ? `<span class="log-perf">⚡ ${perfText}</span>` : ''}
      ${memoryText ? `<span class="log-memory-info">📊 ${memoryText}</span>` : ''}
      ${statsText ? `<span class="log-stats-info">📄 ${statsText}</span>` : ''}
      ${errorPreview}
    </div>
    <div class="log-details">
      <div class="detail-section">
        <h4>基本信息</h4>
        <pre>ID: ${log.id}
时间: ${new Date(log.timestamp).toLocaleString('zh-CN')}
URL: ${log.url || '-'}</pre>
      </div>
      ${log.memory ? `
        <div class="detail-section">
          <h4>内存信息</h4>
          <pre>已用: ${(log.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)} MB
总计: ${(log.memory.totalJSHeapSize / (1024 * 1024)).toFixed(1)} MB
限制: ${(log.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(1)} MB
使用率: ${memoryPercent.toFixed(1)}%</pre>
        </div>
      ` : ''}
      ${log.pageStats ? `
        <div class="detail-section">
          <h4>页面统计</h4>
          <pre>DOM节点: ${log.pageStats.domNodeCount || 0}
Canvas: ${log.pageStats.canvasCount || 0}
图片: ${log.pageStats.imageCount || 0}
视频: ${log.pageStats.videoCount || 0}
iframe: ${log.pageStats.iframeCount || 0}${log.pageStats.plaitElementCount !== undefined ? `\nPlait元素: ${log.pageStats.plaitElementCount}` : ''}</pre>
        </div>
      ` : ''}
      ${log.performance ? `
        <div class="detail-section">
          <h4>性能信息</h4>
          <pre>${log.performance.longTaskDuration ? `长任务时长: ${log.performance.longTaskDuration.toFixed(0)}ms` : ''}${log.performance.freezeDuration ? `卡死时长: ${(log.performance.freezeDuration / 1000).toFixed(1)}s` : ''}${log.performance.fps !== undefined ? `\nFPS: ${log.performance.fps}` : ''}</pre>
        </div>
      ` : ''}
      ${log.error ? `
        <div class="detail-section">
          <h4>错误信息</h4>
          <pre style="color: var(--error-color);">${log.error.type}: ${escapeHtml(log.error.message)}</pre>
          ${log.error.stack ? `<pre style="margin-top: 8px; font-size: 11px; opacity: 0.8;">${escapeHtml(log.error.stack)}</pre>` : ''}
        </div>
      ` : ''}
      ${log.customData ? `
        <div class="detail-section">
          <h4>自定义数据</h4>
          <pre>${JSON.stringify(log.customData, null, 2)}</pre>
        </div>
        ${log.type === 'longtask' ? `
          <div class="detail-section" style="background: var(--warning-light); padding: 12px; border-radius: 6px; border-left: 3px solid var(--warning-color);">
            <h4 style="color: var(--warning-color);">💡 如何定位长任务来源</h4>
            <ol style="margin: 8px 0 0 0; padding-left: 20px; font-size: 12px; line-height: 1.8;">
              <li>打开 Chrome DevTools → Performance 面板</li>
              <li>点击录制按钮 ⏺，复现长任务操作</li>
              <li>停止录制，在 Main 线程中找到黄色/红色的长条（> 50ms）</li>
              <li>点击展开查看详细的函数调用栈</li>
            </ol>
          </div>
        ` : ''}
      ` : ''}
    </div>
  `;
  
  // Toggle expand on header click
  const toggleBtn = entry.querySelector('.log-toggle');
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const nowExpanded = entry.classList.toggle('expanded');
    onToggle(log.id, nowExpanded);
  });
  
  return entry;
}

/**
 * Update crash log count indicator
 */
export function updateCrashCount() {
  const errorCount = state.crashLogs.filter(l => l.type === 'error').length;
  
  if (errorCount > 0) {
    elements.crashCountEl.innerHTML = `(<span style="color:var(--error-color)">${errorCount} errors</span>)`;
  } else {
    elements.crashCountEl.textContent = `(${state.crashLogs.length})`;
  }
}

/**
 * Copy filtered crash logs to clipboard with all details
 */
export async function handleCopyCrashLogs() {
  const filteredLogs = getFilteredCrashLogs();

  if (filteredLogs.length === 0) {
    alert('没有可复制的日志');
    return;
  }

  const typeLabels = {
    startup: '启动',
    periodic: '定期',
    error: '错误',
    beforeunload: '关闭',
    freeze: '卡死',
    whitescreen: '白屏',
    longtask: '长任务'
  };

  // Format logs as text with all details
  const logText = filteredLogs.map(log => {
    const time = new Date(log.timestamp).toLocaleString('zh-CN', { hour12: false });
    const type = log.type || 'unknown';
    const typeLabel = typeLabels[type] || type;
    
    const lines = [];
    lines.push(`═══════════════════════════════════════════════════`);
    lines.push(`${time} [${typeLabel}]`);
    lines.push(`───────────────────────────────────────────────────`);
    
    // 基本信息
    lines.push(`【基本信息】`);
    lines.push(`  ID: ${log.id}`);
    lines.push(`  时间: ${time}`);
    if (log.url) {
      lines.push(`  URL: ${log.url}`);
    }
    
    // 内存信息
    if (log.memory) {
      const usedMB = (log.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
      const totalMB = (log.memory.totalJSHeapSize / (1024 * 1024)).toFixed(1);
      const limitMB = (log.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(1);
      const percent = ((log.memory.usedJSHeapSize / log.memory.jsHeapSizeLimit) * 100).toFixed(1);
      lines.push(``);
      lines.push(`【内存信息】`);
      lines.push(`  已用: ${usedMB} MB`);
      lines.push(`  总计: ${totalMB} MB`);
      lines.push(`  限制: ${limitMB} MB`);
      lines.push(`  使用率: ${percent}%`);
    }
    
    // 页面统计
    if (log.pageStats) {
      const stats = log.pageStats;
      lines.push(``);
      lines.push(`【页面统计】`);
      lines.push(`  DOM节点: ${stats.domNodeCount || 0}`);
      lines.push(`  Canvas: ${stats.canvasCount || 0}`);
      lines.push(`  图片: ${stats.imageCount || 0}`);
      lines.push(`  视频: ${stats.videoCount || 0}`);
      lines.push(`  iframe: ${stats.iframeCount || 0}`);
      if (stats.plaitElementCount !== undefined) {
        lines.push(`  Plait元素: ${stats.plaitElementCount}`);
      }
    }
    
    // 性能信息
    if (log.performance) {
      const perf = log.performance;
      const perfParts = [];
      if (perf.longTaskDuration) {
        perfParts.push(`长任务时长: ${perf.longTaskDuration.toFixed(0)}ms`);
      }
      if (perf.freezeDuration) {
        perfParts.push(`卡死时长: ${(perf.freezeDuration / 1000).toFixed(1)}s`);
      }
      if (perf.fps !== undefined) {
        perfParts.push(`FPS: ${perf.fps}`);
      }
      if (perfParts.length > 0) {
        lines.push(``);
        lines.push(`【性能信息】`);
        perfParts.forEach(p => lines.push(`  ${p}`));
      }
    }
    
    // 错误信息
    if (log.error) {
      lines.push(``);
      lines.push(`【错误信息】`);
      lines.push(`  类型: ${log.error.type || 'Error'}`);
      lines.push(`  消息: ${log.error.message}`);
      if (log.error.stack) {
        lines.push(`  堆栈:`);
        log.error.stack.split('\n').forEach(line => {
          lines.push(`    ${line}`);
        });
      }
    }
    
    // 自定义数据
    if (log.customData) {
      lines.push(``);
      lines.push(`【自定义数据】`);
      lines.push(`  ${JSON.stringify(log.customData, null, 2).split('\n').join('\n  ')}`);
    }
    
    return lines.join('\n');
  }).join('\n\n');

  try {
    await navigator.clipboard.writeText(logText);
    const btn = elements.copyCrashLogsBtn;
    const originalText = btn.textContent;
    btn.textContent = '✅ 已复制';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 1500);
  } catch (err) {
    console.error('Failed to copy:', err);
    alert('复制失败');
  }
}

/**
 * Export crash logs as JSON
 */
export function handleExportCrashLogs() {
  if (state.crashLogs.length === 0) {
    alert('没有可导出的内存日志');
    return;
  }
  
  const exportData = {
    exportTime: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: location.href,
    memorySnapshots: state.crashLogs,
  };
  
  const filename = `memory-logs-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.json`;
  downloadJson(exportData, filename);
}

// ==================== Memory Monitoring ====================

/**
 * Update memory display
 */
export function updateMemoryDisplay() {
  // Check for performance.memory (Chrome only)
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    const mem = performance.memory;
    const usedMB = (mem.usedJSHeapSize / (1024 * 1024)).toFixed(1);
    const totalMB = (mem.totalJSHeapSize / (1024 * 1024)).toFixed(1);
    const limitMB = (mem.jsHeapSizeLimit / (1024 * 1024)).toFixed(0);
    const percent = ((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100).toFixed(1);
    
    if (elements.memoryUsed) elements.memoryUsed.textContent = `${usedMB} MB`;
    if (elements.memoryTotal) elements.memoryTotal.textContent = `${totalMB} MB`;
    if (elements.memoryLimit) elements.memoryLimit.textContent = `${limitMB} MB`;
    if (elements.memoryPercent) elements.memoryPercent.textContent = `${percent}%`;
    
    // Warning if usage is high
    if (parseFloat(percent) > 70) {
      if (elements.memoryWarning) elements.memoryWarning.style.display = 'block';
      if (elements.memoryPercent) elements.memoryPercent.style.color = 'var(--error-color)';
    } else {
      if (elements.memoryWarning) elements.memoryWarning.style.display = 'none';
      if (elements.memoryPercent) elements.memoryPercent.style.color = '';
    }
    
    if (elements.memoryNotSupported) elements.memoryNotSupported.style.display = 'none';
  } else {
    if (elements.memoryUsed) elements.memoryUsed.textContent = '-';
    if (elements.memoryTotal) elements.memoryTotal.textContent = '-';
    if (elements.memoryLimit) elements.memoryLimit.textContent = '-';
    if (elements.memoryPercent) elements.memoryPercent.textContent = '-';
    if (elements.memoryNotSupported) elements.memoryNotSupported.style.display = 'block';
  }
  
  // Update timestamp
  const now = new Date();
  if (elements.memoryUpdateTime) {
    elements.memoryUpdateTime.textContent = `更新: ${now.toLocaleTimeString('zh-CN', { hour12: false })}`;
  }
}

/**
 * Start memory monitoring
 */
export function startMemoryMonitoring() {
  // Initial update
  updateMemoryDisplay();
  
  // Update every 2 seconds
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
  }
  memoryMonitorInterval = setInterval(updateMemoryDisplay, 2000);
}

/**
 * Stop memory monitoring
 */
export function stopMemoryMonitoring() {
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
    memoryMonitorInterval = null;
  }
}
