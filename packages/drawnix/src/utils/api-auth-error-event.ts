/**
 * API 认证错误事件
 * 用于在 API 返回 401 错误时通知主线程打开设置对话框
 */

export const API_AUTH_ERROR_EVENT = 'api-auth-error';

export interface ApiAuthErrorDetail {
  message: string;
  source?: string; // 错误来源，如 'chat', 'workflow' 等
}

/**
 * 检查错误信息是否包含认证错误
 * 支持检测：401 状态码、Invalid Token、Unauthorized、Authentication 失败、rix_api_error
 */
export function isAuthError(error: string): boolean {
  const lowerError = error.toLowerCase();
  return error.includes('401') || 
         lowerError.includes('invalid token') ||
         lowerError.includes('unauthorized') ||
         lowerError.includes('authentication') ||
         // 检测 API 返回的 rix_api_error 类型的 token 错误
         (lowerError.includes('rix_api_error') && lowerError.includes('invalid'));
}

/**
 * 触发 API 认证错误事件
 */
export function dispatchApiAuthError(detail: ApiAuthErrorDetail): void {
  window.dispatchEvent(new CustomEvent(API_AUTH_ERROR_EVENT, { detail }));
}
