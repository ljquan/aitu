/**
 * SW Debug Panel - Log Entry Component
 */

import { formatTime, formatDuration, formatSize, getStatusClass, extractDisplayUrl, formatJsonOrText } from './utils.js';

/**
 * Render FormData fields as HTML
 * @param {Array} formData 
 * @returns {string}
 */
function renderFormData(formData) {
  if (!formData || formData.length === 0) return '';
  
  const rows = formData.map(field => {
    let valueHtml;
    
    if (field.isFile) {
      if (field.dataUrl) {
        // Render image preview
        valueHtml = `
          <div class="form-data-image">
            <img src="${field.dataUrl}" alt="${field.fileName || 'image'}" style="max-width: 200px; max-height: 150px; border-radius: 4px; border: 1px solid var(--border-color);">
            <div class="form-data-file-info">${field.fileName || ''} (${field.mimeType || 'binary'})</div>
          </div>
        `;
      } else {
        valueHtml = `<span class="form-data-binary">${field.value}</span>`;
      }
    } else {
      valueHtml = `<span class="form-data-value">${field.value}</span>`;
    }
    
    return `
      <tr>
        <td class="form-data-name">${field.name}</td>
        <td>${valueHtml}</td>
      </tr>
    `;
  }).join('');
  
  return `
    <div class="detail-section">
      <h4>请求参数 (FormData)</h4>
      <table class="form-data-table">
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

/**
 * Extract base64 images from JSON object
 * @param {object} obj 
 * @returns {Array<{key: string, dataUrl: string}>}
 */
function extractBase64Images(obj) {
  const images = [];
  
  function traverse(value, path = '') {
    if (typeof value === 'string') {
      // Check if it's a base64 data URL for an image
      if (value.startsWith('data:image/')) {
        images.push({ key: path, dataUrl: value });
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        traverse(item, path ? `${path}[${index}]` : `[${index}]`);
      });
    } else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, val]) => {
        traverse(val, path ? `${path}.${key}` : key);
      });
    }
  }
  
  traverse(obj);
  return images;
}

/**
 * Extract base64 images from a string (even if JSON is truncated)
 * @param {string} str 
 * @returns {Array<{key: string, dataUrl: string}>}
 */
function extractBase64ImagesFromString(str) {
  const images = [];
  // Match data:image/xxx;base64,... patterns (capture until quote or bracket)
  const regex = /data:image\/([^;]+);base64,([A-Za-z0-9+/=]+)/g;
  let match;
  let index = 0;
  
  while ((match = regex.exec(str)) !== null) {
    const mimeType = match[1];
    const base64Data = match[2];
    // Only include if we have substantial data (at least 100 chars)
    if (base64Data.length > 100) {
      images.push({
        key: `image[${index}]`,
        dataUrl: `data:image/${mimeType};base64,${base64Data}`,
        mimeType: `image/${mimeType}`,
        size: Math.round(base64Data.length * 0.75 / 1024)
      });
      index++;
    }
  }
  
  return images;
}

/**
 * Format JSON body with base64 truncation for display
 * @param {string} jsonStr 
 * @returns {{ formatted: string, images: Array }}
 */
function formatJsonWithBase64(jsonStr) {
  // First, try to extract images from raw string (works even if truncated)
  const rawImages = extractBase64ImagesFromString(jsonStr);
  
  // Truncate base64 in display string
  let formatted = jsonStr.replace(
    /data:image\/([^;]+);base64,([A-Za-z0-9+/=]{50,})/g,
    (match, mimeType, base64) => {
      const sizeKB = Math.round(base64.length * 0.75 / 1024);
      const truncated = base64.substring(0, 40) + '...';
      return `[image/${mimeType} ~${sizeKB}KB] ${truncated}`;
    }
  );
  
  // Try to pretty-print if it's valid JSON
  try {
    // First clean up the truncated base64 for parsing
    const cleanedForParse = jsonStr.replace(
      /data:image\/([^;]+);base64,([A-Za-z0-9+/=]+)/g,
      '[BASE64_IMAGE]'
    );
    const obj = JSON.parse(cleanedForParse);
    
    // Re-process original to create pretty display
    const displayStr = jsonStr.replace(
      /data:image\/([^;]+);base64,([A-Za-z0-9+/=]+)/g,
      (match, mimeType, base64) => {
        const sizeKB = Math.round(base64.length * 0.75 / 1024);
        return `[📷 image/${mimeType} ~${sizeKB}KB]`;
      }
    );
    
    try {
      const displayObj = JSON.parse(displayStr);
      formatted = JSON.stringify(displayObj, null, 2);
    } catch {
      // Use the replaced string as-is
    }
  } catch {
    // JSON parse failed (possibly truncated), use replaced string
  }
  
  return {
    formatted,
    images: rawImages
  };
}

/**
 * Render base64 image previews
 * @param {Array<{key: string, dataUrl: string, mimeType?: string, size?: number}>} images 
 * @returns {string}
 */
function renderBase64Previews(images) {
  if (!images || images.length === 0) return '';
  
  // Generate unique IDs for each image to update dimensions after load
  const previews = images.map((img, idx) => {
    const imgId = `base64-img-${Date.now()}-${idx}`;
    return `
      <div class="base64-preview-item">
        <div class="base64-preview-label">
          ${img.key}
          ${img.size ? `<span class="base64-size">~${img.size}KB</span>` : ''}
          <span class="base64-dimensions" id="${imgId}-dims"></span>
        </div>
        <img 
          src="${img.dataUrl}" 
          alt="${img.key}" 
          class="base64-preview-img"
          onload="this.parentElement.querySelector('.base64-dimensions').textContent = this.naturalWidth + '×' + this.naturalHeight"
        >
      </div>
    `;
  }).join('');
  
  return `
    <div class="base64-previews">
      <h5>📷 请求中的图片 (${images.length}张)</h5>
      <div class="base64-preview-grid">${previews}</div>
    </div>
  `;
}

/**
 * Parse request/response body from log details
 * @param {object} log 
 * @returns {{ requestBodySection: string, responseBodySection: string, formDataSection: string }}
 */
function parseBodySections(log) {
  let requestBodySection = '';
  let responseBodySection = '';
  let formDataSection = '';
  
  // Handle FormData for sw-internal requests
  if (log.formData && log.formData.length > 0) {
    formDataSection = renderFormData(log.formData);
  }
  
  // Handle JSON request body
  if (log.requestBody && !log.formData) {
    // Prefer pre-extracted base64Images from debugFetch (complete images)
    // Fall back to extracting from requestBody (may be truncated)
    const images = log.base64Images || formatJsonWithBase64(log.requestBody).images;
    const previewHtml = renderBase64Previews(images);
    
    // Format the request body for display (already has base64 replaced with placeholders if from debugFetch)
    const displayBody = formatJsonOrText(log.requestBody);
    
    requestBodySection = `
      <div class="detail-section">
        <h4>请求体 (Request Body)</h4>
        <pre>${displayBody}</pre>
        ${previewHtml}
      </div>
    `;
  }
  
  // Handle response body
  if (log.responseBody) {
    responseBodySection = `
      <div class="detail-section">
        <h4>响应体 (Response Body)</h4>
        <pre>${formatJsonOrText(log.responseBody)}</pre>
      </div>
    `;
  }

  // Fallback: parse from details for XHR type
  if (log.details && log.requestType === 'xhr' && !requestBodySection && !responseBodySection) {
    const parts = log.details.split('\n\nResponse Body:\n');
    if (parts.length === 2) {
      const reqParts = parts[0].split('\n\nRequest Body:\n');
      if (reqParts.length === 2) {
        requestBodySection = `
          <div class="detail-section">
            <h4>请求体 (Request Body)</h4>
            <pre>${formatJsonOrText(reqParts[1])}</pre>
          </div>
        `;
      }
      responseBodySection = `
        <div class="detail-section">
          <h4>响应体 (Response Body)</h4>
          <pre>${formatJsonOrText(parts[1])}</pre>
        </div>
      `;
    } else if (log.details.includes('\n\nResponse Body:\n')) {
      const respParts = log.details.split('\n\nResponse Body:\n');
      if (respParts.length === 2) {
        responseBodySection = `
          <div class="detail-section">
            <h4>响应体 (Response Body)</h4>
            <pre>${formatJsonOrText(respParts[1])}</pre>
          </div>
        `;
      }
    }
  }

  return { requestBodySection, responseBodySection, formDataSection };
}

/**
 * Create a log entry DOM element
 * @param {object} log 
 * @param {boolean} isExpanded - Initial expanded state
 * @param {Function} onToggle - Callback when expand state changes (id, expanded)
 * @returns {HTMLElement}
 */
export function createLogEntry(log, isExpanded = false, onToggle = null) {
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (isExpanded ? ' expanded' : '');
  entry.dataset.id = log.id;

  const statusClass = getStatusClass(log.status);
  const cachedBadge = log.cached ? '<span class="log-cached">缓存</span>' : '';
  const typeClass = log.requestType === 'xhr' ? 'xhr' : 
    (log.requestType === 'passthrough' ? 'passthrough' : 
    (log.requestType === 'sw-internal' ? 'sw-internal' : ''));
  const displayUrl = extractDisplayUrl(log.url);
  const { requestBodySection, responseBodySection, formDataSection } = parseBodySections(log);
  
  // Determine if this is a network error (status 0 or has error with no status)
  const isNetworkError = log.error && (log.status === 0 || log.status === undefined);
  const errorBadgeText = isNetworkError 
    ? (log.statusText || '网络错误')
    : '';
  
  // Extract purpose label for sw-internal requests
  const purposeLabel = log.requestType === 'sw-internal' && log.details 
    ? `<span class="log-purpose">${log.details}</span>` 
    : '';
  
  // Streaming badge
  const streamingBadge = log.isStreaming 
    ? '<span class="log-streaming" title="流式响应 (SSE/Stream)">Stream</span>' 
    : '';

  // Build status display
  let statusDisplay;
  if (isNetworkError) {
    // Network error - show error badge instead of status code
    statusDisplay = `<span class="log-status network-error" title="${log.error || ''}">${errorBadgeText}</span>`;
  } else if (log.status) {
    statusDisplay = `<span class="log-status ${statusClass}">${log.status}</span>`;
  } else {
    statusDisplay = '<span class="log-status pending">...</span>';
  }

  entry.innerHTML = `
    <div class="log-header">
      <span class="log-toggle" title="展开/收起详情"><span class="arrow">▶</span></span>
      <span class="log-time">${formatTime(log.timestamp)}</span>
      <span class="log-method">${log.method || 'GET'}</span>
      ${statusDisplay}
      ${streamingBadge}
      ${purposeLabel}
      <span class="log-url" title="${log.url || ''}">${displayUrl}</span>
      <span class="log-duration">${formatDuration(log.duration)}</span>
      ${cachedBadge}
    </div>
    <div class="log-details">
      ${log.url ? `
        <div class="detail-section">
          <h4>完整 URL</h4>
          <pre>${log.url}</pre>
        </div>
      ` : ''}
      ${log.headers && Object.keys(log.headers).length > 0 ? `
        <div class="detail-section">
          <h4>请求头 (Request Headers)</h4>
          <pre>${JSON.stringify(log.headers, null, 2)}</pre>
        </div>
      ` : ''}
      ${formDataSection}
      ${requestBodySection}
      ${log.responseHeaders && Object.keys(log.responseHeaders).length > 0 ? `
        <div class="detail-section">
          <h4>响应头 (Response Headers)</h4>
          <pre>${JSON.stringify(log.responseHeaders, null, 2)}</pre>
        </div>
      ` : ''}
      ${responseBodySection}
      ${log.error ? `
        <div class="detail-section">
          <h4>错误</h4>
          <pre style="color: var(--error-color);">${log.error}</pre>
        </div>
      ` : ''}
      ${log.size && log.size > 0 ? `
        <div class="detail-section">
          <h4>响应大小</h4>
          <pre>${formatSize(log.size)}</pre>
        </div>
      ` : ''}
      ${log.details && log.requestType !== 'xhr' && log.requestType !== 'sw-internal' ? `
        <div class="detail-section">
          <h4>详情</h4>
          <pre>${log.details}</pre>
        </div>
      ` : ''}
    </div>
  `;

  // Toggle function
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

  return entry;
}
