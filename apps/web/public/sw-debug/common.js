/**
 * SW Debug Panel - Common Utilities
 * 公共工具函数
 */

/**
 * Escape HTML special characters
 * @param {string} str 
 * @returns {string}
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Truncate URL for display
 * @param {string} url 
 * @param {number} maxLen 
 * @returns {string}
 */
export function truncateUrl(url, maxLen) {
  if (url.length <= maxLen) return url;
  return url.substring(0, maxLen - 3) + '...';
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Parse User-Agent string to extract browser and OS info
 * @param {string} ua - User-Agent string
 * @returns {{browser: string, os: string}}
 */
export function parseUserAgent(ua) {
  let browser = '未知';
  let os = '未知';
  
  // Detect browser
  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    const match = ua.match(/Chrome\/(\d+)/);
    browser = match ? `Chrome ${match[1]}` : 'Chrome';
  } else if (ua.includes('Edg')) {
    const match = ua.match(/Edg\/(\d+)/);
    browser = match ? `Edge ${match[1]}` : 'Edge';
  } else if (ua.includes('Firefox')) {
    const match = ua.match(/Firefox\/(\d+)/);
    browser = match ? `Firefox ${match[1]}` : 'Firefox';
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    const match = ua.match(/Version\/(\d+)/);
    browser = match ? `Safari ${match[1]}` : 'Safari';
  }
  
  // Detect OS
  if (ua.includes('Windows NT 10')) {
    os = 'Windows 10/11';
  } else if (ua.includes('Windows NT')) {
    os = 'Windows';
  } else if (ua.includes('Mac OS X')) {
    const match = ua.match(/Mac OS X (\d+[._]\d+)/);
    os = match ? `macOS ${match[1].replace('_', '.')}` : 'macOS';
  } else if (ua.includes('Linux')) {
    os = 'Linux';
  } else if (ua.includes('Android')) {
    const match = ua.match(/Android (\d+)/);
    os = match ? `Android ${match[1]}` : 'Android';
  } else if (ua.includes('iPhone') || ua.includes('iPad')) {
    const match = ua.match(/OS (\d+)/);
    os = match ? `iOS ${match[1]}` : 'iOS';
  }
  
  return { browser, os };
}

// Domain blacklist - requests from these domains will be hidden
export const DOMAIN_BLACKLIST = [
  'us.i.posthog.com',
  'us-assets.i.posthog.com',
  'posthog.com',
  'google-analytics.com',
  'googletagmanager.com',
];

/**
 * Check if URL is in the domain blacklist
 * @param {string} url 
 * @returns {boolean}
 */
export function isBlacklistedUrl(url) {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    return DOMAIN_BLACKLIST.some(domain => 
      urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

/**
 * Filter logs by time range
 * @param {Array} logs 
 * @param {string} timeRangeMinutes - Minutes as string, or empty for all
 * @returns {Array}
 */
export function filterByTimeRange(logs, timeRangeMinutes) {
  if (!timeRangeMinutes) return logs;
  
  const minutes = parseInt(timeRangeMinutes);
  if (isNaN(minutes)) return logs;
  
  const cutoffTime = Date.now() - (minutes * 60 * 1000);
  return logs.filter(log => log.timestamp >= cutoffTime);
}

/**
 * Check if a request is slow (> 1 second)
 * @param {number} duration - Duration in milliseconds
 * @returns {'normal'|'slow'|'very-slow'}
 */
export function getSpeedClass(duration) {
  if (!duration) return 'normal';
  if (duration >= 3000) return 'very-slow';
  if (duration >= 1000) return 'slow';
  return 'normal';
}

/**
 * Format and syntax highlight JSON string
 * @param {string} jsonStr - JSON string to format
 * @returns {string} - HTML with syntax highlighting
 */
export function formatJsonWithHighlight(jsonStr) {
  if (!jsonStr) return '';
  
  try {
    // Try to parse and re-stringify with indentation
    const parsed = JSON.parse(jsonStr);
    const formatted = JSON.stringify(parsed, null, 2);
    
    // Apply syntax highlighting
    return escapeHtml(formatted)
      .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
      .replace(/: "([^"]*)"/g, ': <span class="json-string">"$1"</span>')
      .replace(/: (\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
      .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>')
      .replace(/: (null)/g, ': <span class="json-null">$1</span>');
  } catch {
    // If not valid JSON, just escape and return
    return escapeHtml(jsonStr);
  }
}

/**
 * Parse request body and extract key parameters for quick preview
 * @param {string} requestBody - JSON string of request body
 * @returns {object} - Extracted parameters { model, size, response_format, etc. }
 */
export function extractRequestParams(requestBody) {
  if (!requestBody) return {};
  
  try {
    const parsed = JSON.parse(requestBody);
    return {
      model: parsed.model,
      size: parsed.size,
      response_format: parsed.response_format,
      seconds: parsed.seconds,
      n: parsed.n,
    };
  } catch {
    return {};
  }
}
