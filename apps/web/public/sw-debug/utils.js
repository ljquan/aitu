/**
 * SW Debug Panel - Utility Functions
 */

/**
 * Format file size to human readable string
 * @param {number} bytes 
 * @returns {string}
 */
export function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format timestamp to time string
 * @param {number} timestamp 
 * @returns {string}
 */
export function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', { hour12: false });
}

/**
 * Format duration in milliseconds
 * @param {number} ms 
 * @returns {string}
 */
export function formatDuration(ms) {
  if (!ms) return '-';
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(2) + 's';
}

/**
 * Get CSS class for HTTP status code
 * @param {number} status 
 * @returns {string}
 */
export function getStatusClass(status) {
  if (!status) return '';
  if (status >= 200 && status < 300) return 'success';
  if (status >= 300 && status < 400) return 'redirect';
  return 'error';
}

/**
 * Escape HTML special characters
 * @param {string} text 
 * @returns {string}
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Format JSON or return text as-is
 * @param {string} text 
 * @returns {string}
 */
export function formatJsonOrText(text) {
  if (!text) return '';
  try {
    const json = JSON.parse(text);
    return JSON.stringify(json, null, 2);
  } catch {
    return text;
  }
}

/**
 * Extract display URL from full URL
 * @param {string} url 
 * @param {number} maxLength 
 * @returns {string}
 */
export function extractDisplayUrl(url, maxLength = 80) {
  if (!url) return '-';
  try {
    const urlObj = new URL(url);
    let displayUrl = urlObj.pathname + urlObj.search;
    if (displayUrl.length > maxLength) {
      displayUrl = displayUrl.substring(0, maxLength) + '...';
    }
    return displayUrl;
  } catch {
    return url;
  }
}

/**
 * Export data as JSON file download
 * @param {object} data 
 * @param {string} filename 
 */
export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
