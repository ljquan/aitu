/**
 * 敏感信息过滤工具 (Service Worker 版本)
 * 
 * 用于过滤 SW 中日志、存储数据中的敏感信息，防止 API Key 等敏感数据泄露。
 * 注意：SW 环境与主线程隔离，需要独立的模块。
 */

/** 敏感字段关键词列表 */
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

/**
 * 递归过滤对象中的敏感字段
 * @param obj 要过滤的对象
 * @returns 过滤后的对象
 */
export function sanitizeObject(obj: unknown): unknown {
  if (!obj) return obj;

  if (typeof obj === 'string') {
    // 过滤 Bearer token
    if (obj.toLowerCase().startsWith('bearer ')) {
      return '[REDACTED]';
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.some((k) => lowerKey.includes(k))) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = sanitizeObject(value);
      }
    }
    return result;
  }

  return obj;
}

/**
 * 过滤请求体中的敏感信息
 * @param requestBody 请求体字符串
 * @returns 脱敏后的请求体
 */
export function sanitizeRequestBody(requestBody: string): string {
  if (!requestBody) return requestBody;

  try {
    // 尝试解析 JSON 并过滤敏感字段
    const parsed = JSON.parse(requestBody);
    const sanitized = sanitizeObject(parsed);
    return JSON.stringify(sanitized);
  } catch {
    // 如果不是有效 JSON，使用正则表达式过滤
    let result = requestBody;
    // 过滤 Bearer token
    result = result.replace(/Bearer\s+[a-zA-Z0-9-_]+/gi, 'Bearer [REDACTED]');
    // 过滤 JSON 中的敏感字段
    result = result.replace(
      /"(api[_-]?key|apikey|authorization|token|secret|password|credential)"\s*:\s*"[^"]+"/gi,
      (match, key) => `"${key}": "[REDACTED]"`
    );
    return result;
  }
}

/**
 * 获取错误的安全描述（只返回错误类型，不返回详细信息）
 * @param error 错误对象
 * @returns 安全的错误描述
 */
export function getSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.name || 'Error';
  }
  return 'Unknown error';
}
