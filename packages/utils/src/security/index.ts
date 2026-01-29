/**
 * Security Utilities
 *
 * Functions for sanitizing sensitive information from logs and data.
 */

/** Sensitive field keywords to redact */
export const SENSITIVE_KEYS = [
  'apikey',
  'api_key',
  'password',
  'token',
  'secret',
  'authorization',
  'bearer',
  'credential',
  'key',
];

/** URL parameters to redact */
export const SENSITIVE_URL_PARAMS = [
  'apikey',
  'api_key',
  'key',
  'token',
  'secret',
  'password',
  'authorization',
  'credential',
];

/**
 * Recursively sanitize sensitive fields from an object
 *
 * @param data - The data to sanitize
 * @returns Sanitized data with sensitive fields replaced by '[REDACTED]'
 *
 * @example
 * sanitizeObject({ apiKey: 'secret123', name: 'test' })
 * // Returns: { apiKey: '[REDACTED]', name: 'test' }
 */
export function sanitizeObject(data: unknown): unknown {
  if (!data) return data;

  if (typeof data === 'string') {
    // Filter Bearer tokens
    if (data.toLowerCase().startsWith('bearer ')) {
      return '[REDACTED]';
    }
    // Filter strings that look like API keys (long alphanumeric without dashes)
    if (data.length > 30 && /^[a-zA-Z0-9-_]+$/.test(data) && !data.includes('-')) {
      return '[REDACTED]';
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeObject(item));
  }

  if (typeof data === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      // Check if key contains sensitive keywords
      if (SENSITIVE_KEYS.some((k) => lowerKey.includes(k))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeObject(value);
      }
    }
    return sanitized;
  }

  return data;
}

/**
 * Sanitize sensitive information from a request body string
 *
 * @param requestBody - The request body string to sanitize
 * @returns Sanitized request body
 *
 * @example
 * sanitizeRequestBody('{"apiKey": "secret123", "data": "test"}')
 * // Returns: '{"apiKey":"[REDACTED]","data":"test"}'
 */
export function sanitizeRequestBody(requestBody: string): string {
  if (!requestBody) return requestBody;

  try {
    // Try to parse as JSON and sanitize fields
    const parsed = JSON.parse(requestBody);
    const sanitized = sanitizeObject(parsed);
    return JSON.stringify(sanitized);
  } catch {
    // If not valid JSON, use regex to filter
    let result = requestBody;
    // Filter Bearer tokens
    result = result.replace(/Bearer\s+[a-zA-Z0-9-_]+/gi, 'Bearer [REDACTED]');
    // Filter API key-like strings
    result = result.replace(
      /"(api[_-]?key|apikey|authorization|token|secret|password|credential)"\s*:\s*"[^"]+"/gi,
      (_match, key) => `"${key}": "[REDACTED]"`
    );
    return result;
  }
}

/**
 * Sanitize sensitive parameters from a URL
 *
 * @param url - The URL string to sanitize
 * @param baseUrl - Optional base URL for relative path resolution
 * @returns Sanitized URL
 *
 * @example
 * sanitizeUrl('https://api.example.com?apiKey=secret&name=test')
 * // Returns: 'https://api.example.com?name=test'
 */
export function sanitizeUrl(url: string, baseUrl?: string): string {
  if (!url) return url;

  try {
    const urlObj = new URL(url, baseUrl || (typeof window !== 'undefined' ? window.location.origin : undefined));

    // Remove sensitive query parameters
    SENSITIVE_URL_PARAMS.forEach((param) => {
      urlObj.searchParams.delete(param);
      urlObj.searchParams.delete(param.toLowerCase());
      urlObj.searchParams.delete(param.toUpperCase());
    });

    return urlObj.toString();
  } catch {
    // URL parsing failed, use regex to filter
    let result = url;
    SENSITIVE_URL_PARAMS.forEach((param) => {
      const regex = new RegExp(`([?&])${param}=[^&]*`, 'gi');
      result = result.replace(regex, '$1' + param + '=[REDACTED]');
    });
    return result;
  }
}

/**
 * Get a safe error message (only returns error type, not details)
 *
 * @param error - The error object
 * @returns Safe error description
 *
 * @example
 * getSafeErrorMessage(new TypeError('Invalid API key'))
 * // Returns: 'TypeError'
 */
export function getSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.name || 'Error';
  }
  return 'Unknown error';
}
