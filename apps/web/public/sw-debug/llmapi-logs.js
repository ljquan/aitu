/**
 * SW Debug Panel - LLM API Logs
 * LLM API 日志功能模块
 */

import { state, elements } from './state.js';
import { escapeHtml, formatBytes, formatJsonWithHighlight, extractRequestParams } from './common.js';
import { downloadJson } from './utils.js';
import { showToast } from './toast.js';

/**
 * Load LLM API logs from SW
 */
export function loadLLMApiLogs() {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SW_DEBUG_GET_LLM_API_LOGS'
    });
  }
}

/**
 * Clear LLM API logs
 */
export function handleClearLLMApiLogs() {
  if (!confirm('确定要清空所有 LLM API 日志吗？')) return;
  
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SW_DEBUG_CLEAR_LLM_API_LOGS'
    });
  }
  state.llmapiLogs = [];
  renderLLMApiLogs();
}

/**
 * Get filtered LLM API logs based on current filters
 */
export function getFilteredLLMApiLogs() {
  const typeFilter = elements.filterLLMApiType?.value || '';
  const statusFilter = elements.filterLLMApiStatus?.value || '';

  let filteredLogs = state.llmapiLogs;

  if (typeFilter) {
    filteredLogs = filteredLogs.filter(l => l.taskType === typeFilter);
  }
  if (statusFilter) {
    filteredLogs = filteredLogs.filter(l => l.status === statusFilter);
  }

  return filteredLogs;
}

/**
 * Render LLM API logs
 */
export function renderLLMApiLogs() {
  const filteredLogs = getFilteredLLMApiLogs();

  if (!elements.llmapiLogsContainer) return;

  if (filteredLogs.length === 0) {
    elements.llmapiLogsContainer.innerHTML = `
      <div class="empty-state">
        <span class="icon">🤖</span>
        <p>暂无 LLM API 调用记录</p>
        <p style="font-size: 12px; opacity: 0.7;">图片/视频/对话等 AI 接口调用会自动记录</p>
      </div>
    `;
    return;
  }

  elements.llmapiLogsContainer.innerHTML = '';
  filteredLogs.forEach(log => {
    const isExpanded = state.expandedLLMApiIds.has(log.id);
    const entry = createLLMApiEntry(log, isExpanded, (id, expanded) => {
      if (expanded) {
        state.expandedLLMApiIds.add(id);
      } else {
        state.expandedLLMApiIds.delete(id);
      }
    });
    elements.llmapiLogsContainer.appendChild(entry);
  });
}

/**
 * Create a LLM API log entry element
 * Uses the same styles as Fetch logs for consistency
 */
function createLLMApiEntry(log, isExpanded, onToggle) {
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (isExpanded ? ' expanded' : '');
  entry.dataset.id = log.id;
  
  const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // Status badge - use log-status class like Fetch logs
  let statusClass = '';
  let statusText = '';
  switch (log.status) {
    case 'success':
      statusClass = 'success';
      statusText = '✓ 成功';
      break;
    case 'error':
      statusClass = 'error';
      statusText = '✗ 失败';
      break;
    case 'pending':
      statusClass = 'pending';
      statusText = '⋯ 进行中';
      break;
    default:
      statusText = log.status;
  }

  // Task type badge - use log-type-badge class like Fetch logs
  const typeLabel = {
    'image': '图片生成',
    'video': '视频生成',
    'chat': '对话',
    'character': '角色',
    'other': '其他',
  }[log.taskType] || log.taskType;

  // Duration format - use log-duration class like Fetch logs
  const durationMs = log.duration || 0;
  const durationText = log.duration ? `${(log.duration / 1000).toFixed(1)}s` : '-';
  const durationClass = durationMs >= 3000 ? 'very-slow' : (durationMs >= 1000 ? 'slow' : '');

  // Show full prompt in header (will wrap if needed)
  const promptPreview = log.prompt || '-';
  
  // Extract request parameters from requestBody
  const reqParams = extractRequestParams(log.requestBody);

  // Render reference images preview
  let referenceImagesHtml = '';
  if (log.referenceImages && log.referenceImages.length > 0) {
    const imagesList = log.referenceImages.map(img => {
      const sizeText = img.size ? formatBytes(img.size) : '-';
      const dimensions = img.width && img.height ? `${img.width}x${img.height}` : '-';
      return `
        <div class="reference-image-item" style="display: inline-flex; flex-direction: column; gap: 4px; border: 1px solid var(--border-color); border-radius: 4px; padding: 4px; background: var(--bg-secondary);">
          <div style="width: 120px; height: 120px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #000; border-radius: 2px;">
            <img src="${img.url}" style="max-width: 100%; max-height: 100%; object-fit: contain; cursor: pointer;" onclick="window.open('${img.url}')" title="点击查看原图">
          </div>
          <div style="font-size: 10px; color: var(--text-muted); display: flex; justify-content: space-between; padding: 0 2px;">
            <span>${sizeText}</span>
            <span>${dimensions}</span>
          </div>
        </div>
      `;
    }).join('');
    
    referenceImagesHtml = `
      <div class="detail-section">
        <h4>参考图详情</h4>
        <div class="reference-images-preview" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
          ${imagesList}
        </div>
      </div>
    `;
  }

  entry.innerHTML = `
    <div class="log-header">
      <span class="log-toggle" title="展开/收起详情"><span class="arrow">▶</span></span>
      <span class="log-time">${time}</span>
      <span class="log-status ${statusClass}">${statusText}</span>
      <span class="log-type-badge">${typeLabel}</span>
      <span class="log-type-badge sw-internal">${log.model}</span>
      <span class="log-url" title="${escapeHtml(log.prompt || '')}">${escapeHtml(promptPreview)}</span>
      <span class="log-duration ${durationClass}">${durationText}</span>
    </div>
    <div class="log-details">
      <div class="detail-section">
        <h4>基本信息</h4>
        <table class="form-data-table">
          <tbody>
            <tr>
              <td class="form-data-name">ID</td>
              <td><span class="form-data-value" style="font-family: monospace; font-size: 11px;">${log.id}</span></td>
            </tr>
            <tr>
              <td class="form-data-name">Endpoint</td>
              <td><span class="form-data-value" style="font-family: monospace; font-size: 11px;">${log.endpoint}</span></td>
            </tr>
            <tr>
              <td class="form-data-name">模型</td>
              <td><span class="form-data-value">${log.model}</span></td>
            </tr>
            <tr>
              <td class="form-data-name">类型</td>
              <td><span class="form-data-value">${log.taskType}</span></td>
            </tr>
            <tr>
              <td class="form-data-name">HTTP 状态</td>
              <td><span class="form-data-value">${log.httpStatus || '-'}</span></td>
            </tr>
            <tr>
              <td class="form-data-name">耗时</td>
              <td><span class="form-data-value">${durationText}</span></td>
            </tr>
            ${reqParams.size ? `
            <tr>
              <td class="form-data-name">尺寸</td>
              <td><span class="form-data-value">${reqParams.size}</span></td>
            </tr>
            ` : ''}
            ${reqParams.response_format ? `
            <tr>
              <td class="form-data-name">响应格式</td>
              <td><span class="form-data-value">${reqParams.response_format}</span></td>
            </tr>
            ` : ''}
            ${reqParams.seconds ? `
            <tr>
              <td class="form-data-name">时长</td>
              <td><span class="form-data-value">${reqParams.seconds}s</span></td>
            </tr>
            ` : ''}
            ${log.hasReferenceImages ? `
            <tr>
              <td class="form-data-name">参考图</td>
              <td><span class="form-data-value">${log.referenceImageCount || 0} 张</span></td>
            </tr>
            ` : ''}
            ${log.resultType ? `
            <tr>
              <td class="form-data-name">结果类型</td>
              <td><span class="form-data-value">${log.resultType}</span></td>
            </tr>
            ` : ''}
            ${log.taskId ? `
            <tr>
              <td class="form-data-name">任务 ID</td>
              <td><span class="form-data-value" style="font-family: monospace; font-size: 11px;">${log.taskId}</span></td>
            </tr>
            ` : ''}
            ${log.resultUrl ? `
            <tr>
              <td class="form-data-name">结果 URL</td>
              <td>
                <span class="form-data-value" style="display: flex; align-items: center; gap: 8px;">
                  <a href="${log.resultUrl}" target="_blank" class="llm-result-url" style="font-family: monospace; font-size: 11px; word-break: break-all; color: var(--primary-color); cursor: pointer;">${log.resultUrl.length > 80 ? log.resultUrl.substring(0, 80) + '...' : log.resultUrl}</a>
                  <button class="copy-url-btn" data-url="${escapeHtml(log.resultUrl)}" title="复制 URL" style="padding: 2px 6px; font-size: 10px; cursor: pointer; flex-shrink: 0;">
                    <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </button>
                </span>
              </td>
            </tr>
            ` : ''}
            ${log.errorMessage ? `
            <tr>
              <td class="form-data-name">错误信息</td>
              <td><span class="form-data-value" style="color: var(--error-color); word-break: break-word;">${escapeHtml(log.errorMessage)}</span></td>
            </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
      ${referenceImagesHtml}
      ${log.prompt ? `
        <div class="detail-section">
          <h4>提示词</h4>
          <pre>${escapeHtml(log.prompt)}</pre>
        </div>
      ` : ''}
      ${log.requestBody ? `
        <div class="detail-section">
          <h4>请求参数 (Request Parameters)</h4>
          <pre class="json-highlight">${formatJsonWithHighlight(log.requestBody)}</pre>
        </div>
      ` : ''}
      ${log.resultText ? `
        <div class="detail-section">
          <h4>响应文本</h4>
          <pre>${escapeHtml(log.resultText)}</pre>
        </div>
      ` : ''}
      ${log.responseBody ? `
        <div class="detail-section">
          <h4>响应体 (Response Body)</h4>
          <pre>${escapeHtml(log.responseBody)}</pre>
        </div>
      ` : ''}
    </div>
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
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleExpand();
  });

  // Toggle on header click (except toggle button)
  const header = entry.querySelector('.log-header');
  header.addEventListener('click', (e) => {
    if (e.target.closest('.log-toggle')) return;
    toggleExpand();
  });

  // Copy URL button click handler
  const copyUrlBtn = entry.querySelector('.copy-url-btn');
  if (copyUrlBtn) {
    copyUrlBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const url = copyUrlBtn.dataset.url;
      try {
        await navigator.clipboard.writeText(url);
        // Show feedback
        const originalHtml = copyUrlBtn.innerHTML;
        copyUrlBtn.innerHTML = '✓';
        copyUrlBtn.style.color = 'var(--success-color)';
        setTimeout(() => {
          copyUrlBtn.innerHTML = originalHtml;
          copyUrlBtn.style.color = '';
        }, 1500);
      } catch (err) {
        console.error('Failed to copy URL:', err);
      }
    });
  }

  return entry;
}

/**
 * Copy filtered LLM API logs to clipboard
 */
export async function handleCopyLLMApiLogs() {
  const filteredLogs = getFilteredLLMApiLogs();

  if (filteredLogs.length === 0) {
    alert('没有可复制的日志');
    return;
  }

  // Format logs as text
  const logText = filteredLogs.map(log => {
    const time = new Date(log.timestamp).toLocaleString('zh-CN', { hour12: false });
    const type = log.taskType || 'unknown';
    const status = log.status || '-';
    const model = log.model || '-';
    const duration = log.duration ? `${(log.duration / 1000).toFixed(1)}s` : '-';
    const prompt = log.prompt ? `\n  提示词: ${log.prompt}` : '';
    const error = log.errorMessage ? `\n  错误: ${log.errorMessage}` : '';
    return `${time} [${type}] ${status} | ${model} (${duration})${prompt}${error}`;
  }).join('\n\n');

  try {
    await navigator.clipboard.writeText(logText);
    const btn = elements.copyLLMApiLogsBtn;
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
 * Export LLM API logs with media files (images/videos)
 * Creates a ZIP file containing:
 * - llm-api-logs.json: All LLM API logs
 * - media/: Directory containing cached images and videos
 */
export async function handleExportLLMApiLogs() {
  if (state.llmapiLogs.length === 0) {
    alert('暂无 LLM API 日志可导出');
    return;
  }
  
  const exportBtn = elements.exportLLMApiLogsBtn;
  const originalText = exportBtn.textContent;
  
  try {
    exportBtn.disabled = true;
    exportBtn.textContent = '⏳ 准备中...';
    
    // Check if JSZip is available
    if (typeof JSZip === 'undefined') {
      // Fallback to JSON-only export
      console.warn('JSZip not available, falling back to JSON-only export');
      const filename = `llm-api-logs-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.json`;
      downloadJson({
        exportTime: new Date().toISOString(),
        logs: state.llmapiLogs,
        mediaNotIncluded: true,
        reason: 'JSZip not available'
      }, filename);
      return;
    }
    
    const zip = new JSZip();
    
    // Add logs JSON
    const logsData = {
      exportTime: new Date().toISOString(),
      userAgent: navigator.userAgent,
      totalLogs: state.llmapiLogs.length,
      summary: {
        image: state.llmapiLogs.filter(l => l.taskType === 'image').length,
        video: state.llmapiLogs.filter(l => l.taskType === 'video').length,
        chat: state.llmapiLogs.filter(l => l.taskType === 'chat').length,
        character: state.llmapiLogs.filter(l => l.taskType === 'character').length,
        success: state.llmapiLogs.filter(l => l.status === 'success').length,
        error: state.llmapiLogs.filter(l => l.status === 'error').length,
      },
      logs: state.llmapiLogs
    };
    zip.file('llm-api-logs.json', JSON.stringify(logsData, null, 2));
    
    // Collect URLs to download
    const mediaUrls = [];
    for (const log of state.llmapiLogs) {
      if (log.resultUrl && log.status === 'success') {
        mediaUrls.push({
          url: log.resultUrl,
          id: log.id,
          type: log.taskType,
          timestamp: log.timestamp
        });
      }
    }
    
    exportBtn.textContent = `⏳ 下载媒体 0/${mediaUrls.length}...`;
    
    // Download media files
    const mediaFolder = zip.folder('media');
    let downloadedCount = 0;
    let failedCount = 0;
    const mediaManifest = [];
    
    for (const item of mediaUrls) {
      try {
        // Handle both absolute and relative URLs
        let fetchUrl = item.url;
        if (fetchUrl.startsWith('/')) {
          fetchUrl = location.origin + fetchUrl;
        }
        
        const response = await fetch(fetchUrl);
        if (response.ok) {
          const blob = await response.blob();
          const contentType = response.headers.get('content-type') || blob.type;
          
          // Determine file extension
          let ext = 'bin';
          if (contentType.includes('image/png')) ext = 'png';
          else if (contentType.includes('image/jpeg')) ext = 'jpg';
          else if (contentType.includes('image/gif')) ext = 'gif';
          else if (contentType.includes('image/webp')) ext = 'webp';
          else if (contentType.includes('video/mp4')) ext = 'mp4';
          else if (contentType.includes('video/webm')) ext = 'webm';
          
          // Create filename based on log id and timestamp
          const date = new Date(item.timestamp);
          const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
          const filename = `${dateStr}_${item.type}_${item.id.split('-').pop()}.${ext}`;
          
          mediaFolder.file(filename, blob);
          mediaManifest.push({
            logId: item.id,
            filename,
            originalUrl: item.url,
            size: blob.size,
            type: contentType
          });
          downloadedCount++;
        } else {
          failedCount++;
          mediaManifest.push({
            logId: item.id,
            originalUrl: item.url,
            error: `HTTP ${response.status}`
          });
        }
      } catch (err) {
        failedCount++;
        mediaManifest.push({
          logId: item.id,
          originalUrl: item.url,
          error: err.message
        });
      }
      
      exportBtn.textContent = `⏳ 下载媒体 ${downloadedCount + failedCount}/${mediaUrls.length}...`;
    }
    
    // Add media manifest
    zip.file('media-manifest.json', JSON.stringify({
      totalUrls: mediaUrls.length,
      downloaded: downloadedCount,
      failed: failedCount,
      files: mediaManifest
    }, null, 2));
    
    exportBtn.textContent = '⏳ 生成 ZIP...';
    
    // Generate and download ZIP
    const zipBlob = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    
    const filename = `llm-api-export-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.zip`;
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Show summary
    const sizeInMB = (zipBlob.size / 1024 / 1024).toFixed(2);
    showToast(`导出完成！\n日志数: ${state.llmapiLogs.length}\n媒体文件: ${downloadedCount} 成功, ${failedCount} 失败\n文件大小: ${sizeInMB} MB`, 'success', 5000);
    
  } catch (err) {
    console.error('Export failed:', err);
    showToast('导出失败: ' + err.message, 'error', 5000);
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = originalText;
  }
}
