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
 * 检查错误信息是否包含 401 认证错误
 */
export function isAuthError(error: string): boolean {
  return error.includes('401') || 
         error.toLowerCase().includes('invalid token') ||
         error.toLowerCase().includes('unauthorized') ||
         error.toLowerCase().includes('authentication');
}

/**
 * 触发 API 认证错误事件
 */
export function dispatchApiAuthError(detail: ApiAuthErrorDetail): void {
  window.dispatchEvent(new CustomEvent(API_AUTH_ERROR_EVENT, { detail }));
}
