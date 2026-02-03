/**
 * Sync Log Service - 同步日志服务
 * 直接使用统一日志服务，提供同步专用的便捷方法
 */

import {
  unifiedLogService,
  logInfo as uLogInfo,
  logSuccess as uLogSuccess,
  logWarning as uLogWarning,
  logError as uLogError,
  logDebug as uLogDebug,
} from '../unified-log-service';

// ====================================
// 会话管理
// ====================================

export const startSyncSession = () => unifiedLogService.startSession('sync');
export const getCurrentSessionId = () => unifiedLogService.getSessionId();
export const endSyncSession = () => unifiedLogService.endSession();

// ====================================
// 日志记录 - 零阻塞
// ====================================

export const logInfo = (message: string, data?: Record<string, unknown>) =>
  uLogInfo('sync', message, data);

export const logSuccess = (message: string, data?: Record<string, unknown>) =>
  uLogSuccess('sync', message, data);

export const logWarning = (message: string, data?: Record<string, unknown>) =>
  uLogWarning('sync', message, data);

export const logError = (message: string, error?: Error, data?: Record<string, unknown>) =>
  uLogError('sync', message, error, data);

export const logDebug = (message: string, data?: Record<string, unknown>) =>
  uLogDebug('sync', message, data);

// ====================================
// 查询接口 - 直接透传
// ====================================

export const queryLogs = (options?: Parameters<typeof unifiedLogService.query>[0]) =>
  unifiedLogService.query({ ...options, category: 'sync' });

export const getLogStats = () => unifiedLogService.getStats('sync');

export const clearLogs = () => unifiedLogService.clear('sync');

export const cleanupOldLogs = () => unifiedLogService.cleanup();
