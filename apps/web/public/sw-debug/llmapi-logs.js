/**
 * SW Debug Panel - LLM API Logs
 * LLM API 日志功能模块
 */

import { state, elements } from './state.js';
import { escapeHtml, formatBytes, formatJsonWithHighlight, extractRequestParams } from './common.js';
import { downloadJson } from './utils.js';
import { showToast } from './toast.js';
import { loadLLMApiLogs as loadLLMApiLogsRPC, clearLLMApiLogsInSW, deleteLLMApiLogsInSW, getLLMApiLogByIdInSW } from './sw-communication.js';

/** 缓存已获取的完整日志数据 (logId -> fullLog) */
const fullLogCache = new Map();

/**
 * 获取当前过滤条件
 */
function getCurrentFilter() {
  const taskType = elements.filterLLMApiType?.value || '';
  const status = elements.filterLLMApiStatus?.value || '';
  return {
    taskType: taskType || undefined,
    status: status || undefined,
  };
}

/**
 * Load LLM API logs from SW (uses duplex RPC with pagination)
 * @param {number} page - 页码，默认使用当前页
 */
export async function loadLLMApiLogs(page) {
  try {
    const targetPage = typeof page === 'number' ? page : (state.llmapiPagination.page || 1);
    const pageSize = state.llmapiPagination.pageSize || 20;
    const filter = getCurrentFilter();
    const result = await loadLLMApiLogsRPC(targetPage, pageSize, filter);
    
    if (result) {
      state.llmapiLogs = Array.isArray(result.logs) ? result.logs : [];
      // Ensure pagination values are numbers (postmessage-duplex may return objects)
      state.llmapiPagination.page = typeof result.page === 'number' ? result.page : (Number(result.page) || 1);
      state.llmapiPagination.total = typeof result.total === 'number' ? result.total : (Number(result.total) || 0);
      state.llmapiPagination.totalPages = typeof result.totalPages === 'number' ? result.totalPages : (Number(result.totalPages) || 0);
      state.llmapiPagination.pageSize = typeof result.pageSize === 'number' ? result.pageSize : (Number(result.pageSize) || 20);
      renderLLMApiLogs();
    }
  } catch (error) {
    console.error('[LLMApiLogs] Failed to load logs:', error);
  }
}

/**
 * 跳转到指定页
 */
export function goToLLMApiPage(page) {
  const { totalPages } = state.llmapiPagination;
  if (page < 1 || page > totalPages) return;
  loadLLMApiLogs(page);
}

/**
 * Clear LLM API logs (uses duplex RPC)
 */
export async function handleClearLLMApiLogs() {
  if (!confirm('确定要清空所有 LLM API 日志吗？')) return;
  
  try {
    await clearLLMApiLogsInSW();
    state.llmapiLogs = [];
    // 重置分页状态
    state.llmapiPagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 };
    // 重置选择状态
    state.isLLMApiSelectMode = false;
    state.selectedLLMApiIds.clear();
    // 清空完整日志缓存
    fullLogCache.clear();
    renderLLMApiLogs();
  } catch (error) {
    console.error('[LLMApiLogs] Failed to clear logs:', error);
  }
}

// ==================== 多选和批量删除 ====================

/**
 * 切换选择模式
 */
export function toggleLLMApiSelectMode() {
  state.isLLMApiSelectMode = !state.isLLMApiSelectMode;
  state.selectedLLMApiIds.clear();
  updateLLMApiSelectModeUI();
  renderLLMApiLogs();
}

/**
 * 更新选择模式 UI
 */
function updateLLMApiSelectModeUI() {
  const toggleBtn = elements.toggleLLMApiSelectModeBtn;
  if (toggleBtn) {
    toggleBtn.textContent = state.isLLMApiSelectMode ? '✅ 取消' : '☑️ 选择';
    toggleBtn.style.background = state.isLLMApiSelectMode ? 'var(--primary-color)' : '';
    toggleBtn.style.color = state.isLLMApiSelectMode ? '#fff' : '';
  }
  
  const batchActions = elements.llmapiBatchActionsEl;
  if (batchActions) {
    batchActions.style.display = state.isLLMApiSelectMode ? 'flex' : 'none';
  }
  
  updateLLMApiSelectedCount();
}

/**
 * 更新已选计数
 */
function updateLLMApiSelectedCount() {
  const countEl = elements.llmapiSelectedCountEl;
  if (countEl) {
    countEl.textContent = `已选 ${state.selectedLLMApiIds.size} 条`;
  }
}

/**
 * 切换单条日志选择
 */
export function toggleLLMApiLogSelection(logId) {
  if (state.selectedLLMApiIds.has(logId)) {
    state.selectedLLMApiIds.delete(logId);
  } else {
    state.selectedLLMApiIds.add(logId);
  }
  updateLLMApiSelectedCount();
  
  // 更新 DOM 中的复选框状态
  const checkbox = document.querySelector(`.llmapi-select-checkbox[data-id="${logId}"]`);
  if (checkbox) {
    checkbox.checked = state.selectedLLMApiIds.has(logId);
  }
}

/**
 * 全选/取消全选当前页日志
 */
export function selectAllLLMApiLogs() {
  const filteredLogs = getFilteredLLMApiLogs();
  const allSelected = filteredLogs.every(l => state.selectedLLMApiIds.has(l.id));
  
  if (allSelected) {
    filteredLogs.forEach(l => state.selectedLLMApiIds.delete(l.id));
  } else {
    filteredLogs.forEach(l => state.selectedLLMApiIds.add(l.id));
  }
  
  updateLLMApiSelectedCount();
  renderLLMApiLogs();
}

/**
 * 批量删除选中的日志
 */
export async function batchDeleteLLMApiLogs() {
  if (state.selectedLLMApiIds.size === 0) {
    showToast('请先选择日志', 'warning');
    return;
  }
  
  if (!confirm(`确定要删除选中的 ${state.selectedLLMApiIds.size} 条日志吗？`)) {
    return;
  }
  
  try {
    const logIds = Array.from(state.selectedLLMApiIds);
    const result = await deleteLLMApiLogsInSW(logIds);
    
    if (result.success) {
      // 从本地状态中删除
      state.llmapiLogs = state.llmapiLogs.filter(l => !state.selectedLLMApiIds.has(l.id));
      // 更新分页信息
      state.llmapiPagination.total -= result.deletedCount;
      state.llmapiPagination.totalPages = Math.ceil(state.llmapiPagination.total / state.llmapiPagination.pageSize);
      // 如果当前页没有数据了，跳到前一页
      if (state.llmapiLogs.length === 0 && state.llmapiPagination.page > 1) {
        state.llmapiPagination.page--;
        await loadLLMApiLogs(state.llmapiPagination.page);
      }
      
      state.selectedLLMApiIds.clear();
      updateLLMApiSelectedCount();
      renderLLMApiLogs();
      showToast(`已删除 ${result.deletedCount} 条日志`, 'success');
    } else {
      showToast('删除失败', 'error');
    }
  } catch (error) {
    console.error('[LLMApiLogs] Failed to delete logs:', error);
    showToast('删除失败', 'error');
  }
}

/**
 * Get filtered LLM API logs based on current filters
 * 注意：过滤已经在 SW 端完成，这里直接返回当前页的日志
 */
export function getFilteredLLMApiLogs() {
  return state.llmapiLogs;
}

/**
 * 过滤条件变化时重新加载第一页
 */
export function onFilterChange() {
  // 过滤条件变化时回到第一页
  loadLLMApiLogs(1);
}

/**
 * Render LLM API logs
 */
export function renderLLMApiLogs() {
  const filteredLogs = getFilteredLLMApiLogs();

  if (!elements.llmapiLogsContainer) return;

  if (filteredLogs.length === 0 && state.llmapiPagination.total === 0) {
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
  
  // 渲染日志
  filteredLogs.forEach(log => {
    const isExpanded = state.expandedLLMApiIds.has(log.id);
    const isSelected = state.selectedLLMApiIds.has(log.id);
    const entry = createLLMApiEntry(
      log, 
      isExpanded, 
      (id, expanded) => {
        if (expanded) {
          state.expandedLLMApiIds.add(id);
        } else {
          state.expandedLLMApiIds.delete(id);
        }
      },
      state.isLLMApiSelectMode,
      isSelected
    );
    elements.llmapiLogsContainer.appendChild(entry);
  });
  
  // 渲染分页控件
  renderLLMApiPagination();
}

/**
 * 渲染分页控件
 */
function renderLLMApiPagination() {
  const { page, totalPages, total, pageSize } = state.llmapiPagination;
  
  // 如果只有一页或没有数据，不显示分页
  if (totalPages <= 1) return;
  
  const paginationEl = document.createElement('div');
  paginationEl.className = 'pagination';
  paginationEl.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border-top: 1px solid var(--border-color); background: var(--bg-secondary);';
  
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);
  
  paginationEl.innerHTML = `
    <button class="pagination-btn" data-page="1" ${page === 1 ? 'disabled' : ''} title="首页">«</button>
    <button class="pagination-btn" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''} title="上一页">‹</button>
    <span style="padding: 0 8px; color: var(--text-muted); font-size: 12px;">
      ${startItem}-${endItem} / ${total} 条 (第 ${page}/${totalPages} 页)
    </span>
    <button class="pagination-btn" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''} title="下一页">›</button>
    <button class="pagination-btn" data-page="${totalPages}" ${page === totalPages ? 'disabled' : ''} title="末页">»</button>
  `;
  
  // 添加样式
  const style = document.createElement('style');
  style.textContent = `
    .pagination-btn {
      padding: 4px 10px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: var(--bg-primary);
      color: var(--text-primary);
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }
    .pagination-btn:hover:not(:disabled) {
      background: var(--accent-color);
      color: white;
      border-color: var(--accent-color);
    }
    .pagination-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;
  if (!document.querySelector('style[data-pagination]')) {
    style.setAttribute('data-pagination', 'true');
    document.head.appendChild(style);
  }
  
  // 添加点击事件
  paginationEl.querySelectorAll('.pagination-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetPage = parseInt(btn.dataset.page, 10);
      if (!isNaN(targetPage)) {
        goToLLMApiPage(targetPage);
      }
    });
  });
  
  elements.llmapiLogsContainer.appendChild(paginationEl);
}

/**
 * Create a LLM API log entry element
 * Uses the same styles as Fetch logs for consistency
 */
function createLLMApiEntry(log, isExpanded, onToggle, isSelectMode = false, isSelected = false) {
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (isExpanded ? ' expanded' : '') + (isSelected ? ' selected' : '');
  entry.dataset.id = log.id;
  
  const date = new Date(log.timestamp);
  const time = date.toLocaleString('zh-CN', { 
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
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

  // Render reference images preview (仅当分页数据包含完整参考图时才显示)
  let referenceImagesHtml = '';
  if (log.referenceImages && log.referenceImages.length > 0) {
    referenceImagesHtml = `
      <div class="detail-section reference-images-section">
        <h4>参考图详情 (${log.referenceImages.length} 张)</h4>
        ${renderReferenceImages(log.referenceImages)}
      </div>
    `;
  } else if (log.hasReferenceImages && log.referenceImageCount > 0) {
    // 分页数据只有数量没有完整数据，显示占位提示
    referenceImagesHtml = `
      <div class="detail-section reference-images-section">
        <h4>参考图详情 (${log.referenceImageCount} 张)</h4>
        <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 12px; background: var(--bg-secondary); border-radius: 4px;">
          <span style="font-size: 20px;">🖼️</span>
          <p style="margin: 8px 0 0;">加载中...</p>
        </div>
      </div>
    `;
  }

  // 选择模式下的复选框
  const selectCheckbox = isSelectMode 
    ? `<input type="checkbox" class="llmapi-select-checkbox" data-id="${log.id}" ${isSelected ? 'checked' : ''} style="margin-right: 6px; cursor: pointer;">` 
    : '';

  entry.innerHTML = `
    <div class="log-header">
      ${selectCheckbox}
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
        <div class="detail-section request-body-section">
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
        <div class="detail-section response-body-section">
          <h4>响应体 (Response Body)</h4>
          <pre class="json-highlight">${formatJsonWithHighlight(log.responseBody)}</pre>
        </div>
      ` : ''}
    </div>
  `;

  // Toggle function - fetch full data on first expand
  const toggleExpand = async () => {
    const isNowExpanded = entry.classList.toggle('expanded');
    if (onToggle) {
      onToggle(log.id, isNowExpanded);
    }
    
    // 首次展开时获取完整数据（包含 responseBody）
    if (isNowExpanded && !fullLogCache.has(log.id)) {
      try {
        const fullLog = await getLLMApiLogByIdInSW(log.id);
        if (fullLog) {
          fullLogCache.set(log.id, fullLog);
          // 更新响应体显示
          updateResponseBodyDisplay(entry, fullLog);
        }
      } catch (error) {
        console.error('[LLMApiLogs] Failed to load full log:', error);
      }
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

  // 选择复选框点击事件
  const checkbox = entry.querySelector('.llmapi-select-checkbox');
  if (checkbox) {
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLLMApiLogSelection(log.id);
    });
  }

  return entry;
}

/**
 * 更新日志详情中的完整数据显示（包括参考图、请求体、响应体）
 * @param {HTMLElement} entry - 日志条目元素
 * @param {object} fullLog - 完整的日志数据
 */
function updateResponseBodyDisplay(entry, fullLog) {
  const detailsEl = entry.querySelector('.log-details');
  if (!detailsEl) return;
  
  // 1. 更新参考图（如果有）
  if (fullLog.referenceImages && fullLog.referenceImages.length > 0) {
    let refSection = detailsEl.querySelector('.reference-images-section');
    const imagesHtml = renderReferenceImages(fullLog.referenceImages);
    
    if (!refSection) {
      refSection = document.createElement('div');
      refSection.className = 'detail-section reference-images-section';
      refSection.innerHTML = `
        <h4>参考图详情 (${fullLog.referenceImages.length} 张)</h4>
        ${imagesHtml}
      `;
      // 插入到基本信息之后
      const basicInfoSection = detailsEl.querySelector('.detail-section');
      if (basicInfoSection && basicInfoSection.nextSibling) {
        detailsEl.insertBefore(refSection, basicInfoSection.nextSibling);
      } else {
        detailsEl.appendChild(refSection);
      }
    } else {
      refSection.innerHTML = `
        <h4>参考图详情 (${fullLog.referenceImages.length} 张)</h4>
        ${imagesHtml}
      `;
    }
  }
  
  // 2. 更新请求体（如果之前没有）
  if (fullLog.requestBody && !detailsEl.querySelector('.request-body-section')) {
    const requestSection = document.createElement('div');
    requestSection.className = 'detail-section request-body-section';
    requestSection.innerHTML = `
      <h4>请求参数 (Request Parameters)</h4>
      <pre class="json-highlight">${formatJsonWithHighlight(fullLog.requestBody)}</pre>
    `;
    detailsEl.appendChild(requestSection);
  }
  
  // 3. 更新响应体
  let responseSection = detailsEl.querySelector('.response-body-section');
  if (fullLog.responseBody) {
    if (!responseSection) {
      responseSection = document.createElement('div');
      responseSection.className = 'detail-section response-body-section';
      responseSection.innerHTML = `
        <h4>响应体 (Response Body)</h4>
        <pre class="json-highlight">${formatJsonWithHighlight(fullLog.responseBody)}</pre>
      `;
      detailsEl.appendChild(responseSection);
    } else {
      responseSection.innerHTML = `
        <h4>响应体 (Response Body)</h4>
        <pre class="json-highlight">${formatJsonWithHighlight(fullLog.responseBody)}</pre>
      `;
    }
  }
}

/**
 * 渲染参考图列表 HTML
 * @param {Array} referenceImages - 参考图数组
 * @returns {string} HTML 字符串
 */
function renderReferenceImages(referenceImages) {
  if (!referenceImages || referenceImages.length === 0) return '';
  
  const imagesList = referenceImages.map((img, index) => {
    const sizeText = img.size ? formatBytes(img.size) : '-';
    const dimensions = img.width && img.height ? `${img.width}×${img.height}` : '-';
    const imgUrl = img.url || '';
    
    // 判断是否是有效的可预览图片 URL
    const isPreviewable = imgUrl && (
      imgUrl.startsWith('data:image/') || 
      imgUrl.startsWith('http://') || 
      imgUrl.startsWith('https://') ||
      imgUrl.startsWith('/__aitu_cache__/')
    );
    
    return `
      <div class="reference-image-item" style="display: inline-flex; flex-direction: column; gap: 4px; border: 1px solid var(--border-color); border-radius: 8px; padding: 8px; background: var(--bg-secondary); min-width: 140px;">
        <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">参考图 ${index + 1}</div>
        <div style="width: 140px; height: 140px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #1a1a1a; border-radius: 4px;">
          ${isPreviewable 
            ? `<img src="${escapeHtml(imgUrl)}" style="max-width: 100%; max-height: 100%; object-fit: contain; cursor: pointer;" onclick="window.open('${escapeHtml(imgUrl)}')" title="点击查看原图" onerror="this.parentElement.innerHTML='<span style=\\'color:#666;font-size:12px;\\'>加载失败</span>'">`
            : `<span style="color: #666; font-size: 12px; text-align: center; padding: 8px;">无法预览<br><span style="font-size: 10px; word-break: break-all;">${imgUrl ? imgUrl.substring(0, 30) + '...' : '无 URL'}</span></span>`
          }
        </div>
        <div style="font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between; padding: 4px 2px 0;">
          <span title="文件大小">${sizeText}</span>
          <span title="尺寸">${dimensions}</span>
        </div>
        ${img.name ? `<div style="font-size: 10px; color: var(--text-muted); word-break: break-all; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(img.name)}">${escapeHtml(img.name)}</div>` : ''}
      </div>
    `;
  }).join('');
  
  return `
    <div class="reference-images-preview" style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px;">
      ${imagesList}
    </div>
  `;
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
