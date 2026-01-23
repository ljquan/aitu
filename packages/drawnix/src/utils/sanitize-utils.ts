/**
 * 敏感信息过滤工具
 * 
 * 用于过滤日志、上报数据中的敏感信息，防止 API Key 等敏感数据泄露。
 * 主线程使用此模块，Service Worker 使用 sw/task-queue/utils/sanitize-utils.ts
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

/** URL 中需要过滤的敏感参数 */
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
 * 递归清理对象中的敏感字段
 * @param data 要清理的数据
 * @returns 清理后的数据
 */
export function sanitizeObject(data: unknown): unknown {
  if (!data) return data;

  if (typeof data === 'string') {
    // 过滤可能包含 API Key 的字符串（Bearer token 等）
    if (data.toLowerCase().startsWith('bearer ')) {
      return '[REDACTED]';
    }
    // 过滤看起来像 API Key 的长字符串（但保留常见的 ID 格式）
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
      // 检查 key 是否包含敏感关键词
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
    // 过滤看起来像 API Key 的字符串
    result = result.replace(
      /"(api[_-]?key|apikey|authorization|token|secret|password|credential)"\s*:\s*"[^"]+"/gi,
      (match, key) => `"${key}": "[REDACTED]"`
    );
    return result;
  }
}

/**
 * 过滤 URL 中的敏感参数
 * @param url URL 字符串
 * @param baseUrl 基础 URL（用于相对路径解析）
 * @returns 脱敏后的 URL
 */
export function sanitizeUrl(url: string, baseUrl?: string): string {
  if (!url) return url;

  try {
    const urlObj = new URL(url, baseUrl || (typeof window !== 'undefined' ? window.location.origin : undefined));

    // 删除敏感查询参数
    SENSITIVE_URL_PARAMS.forEach((param) => {
      urlObj.searchParams.delete(param);
      urlObj.searchParams.delete(param.toLowerCase());
      urlObj.searchParams.delete(param.toUpperCase());
    });

    return urlObj.toString();
  } catch {
    // URL 解析失败，使用正则表达式过滤
    let result = url;
    SENSITIVE_URL_PARAMS.forEach((param) => {
      const regex = new RegExp(`([?&])${param}=[^&]*`, 'gi');
      result = result.replace(regex, '$1' + param + '=[REDACTED]');
    });
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
