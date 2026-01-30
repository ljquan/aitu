/**
 * Service Worker Console Log Capture
 * 
 * 捕获控制台日志发送给 Service Worker 供调试面板显示。
 * - warn/error: 始终捕获（用于错误追踪）
 * - log/info: 仅在调试模式开启时捕获（用于调试分析）
 */

import { swChannelClient } from '@drawnix/drawnix';

let isInitialized = false;
let debugModeEnabled = false;

// 保存原始的 console 方法
const originalConsole = {
  error: console.error,
  warn: console.warn,
  info: console.info,
  log: console.log,
  debug: console.debug,
};

/**
 * 发送日志到 Service Worker
 */
function sendToSW(level: string, message: string, stack?: string) {
  // 防止循环：不转发来自 SW 的日志
  if (message.includes('[SW]') ||
      message.includes('[SWTaskQueue]') ||
      message.includes('[SWChannelManager]') ||
      message.includes('Invalid message structure')) {
    return;
  }

  // 过滤监控服务相关的错误（PostHog, Sentry）
  if (message.includes('posthog.com') ||
      message.includes('sentry.io') ||
      (stack && (stack.includes('posthog') || stack.includes('sentry')))) {
    return;
  }

  // 使用 swChannelClient 发送控制台日志
  if (swChannelClient.isInitialized()) {
    swChannelClient.reportConsoleLog(
      level,
      [{ message, stack: stack || '', source: window.location.href }],
      Date.now()
    ).catch(() => {
      // 忽略发送错误
    });
  }
}

/**
 * 格式化日志参数为字符串
 */
function formatArgs(args: unknown[]): string {
  return args.map(arg => {
    if (arg instanceof Error) {
      return arg.message;
    }
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
}

/**
 * 获取 Error 的堆栈信息
 */
function getStack(args: unknown[]): string {
  for (const arg of args) {
    if (arg instanceof Error && arg.stack) {
      return arg.stack;
    }
  }
  return '';
}

/**
 * 初始化控制台日志捕获
 * 只在有 Service Worker 的环境中生效
 */
export function initSWConsoleCapture(): void {
  if (isInitialized) {
    return;
  }

  if (!('serviceWorker' in navigator)) {
    return;
  }

  isInitialized = true;

  // 订阅调试状态变更事件
  const setupDebugStatusListener = () => {
    if (swChannelClient.isInitialized()) {
      // 订阅调试状态变更事件
      swChannelClient.subscribeToEvent('debug:statusChanged', (data) => {
        const event = data as { enabled: boolean };
        const wasEnabled = debugModeEnabled;
        debugModeEnabled = event.enabled;
        if (debugModeEnabled && !wasEnabled) {
          originalConsole.log('[SW Console Capture] 调试模式已开启，开始捕获所有日志');
        } else if (!debugModeEnabled && wasEnabled) {
          originalConsole.log('[SW Console Capture] 调试模式已关闭，仅捕获 warn/error');
        }
      });

      // 查询当前调试状态
      swChannelClient.getDebugStatus().then((status) => {
        debugModeEnabled = status.enabled;
        if (debugModeEnabled) {
          originalConsole.log('[SW Console Capture] 调试模式已开启，开始捕获所有日志');
        }
      });
    } else {
      // 如果 swChannelClient 未初始化，延迟重试
      setTimeout(setupDebugStatusListener, 500);
    }
  };

  // 初始化调试状态监听
  setupDebugStatusListener();

  // 拦截 console.error（始终捕获）
  console.error = function (...args: unknown[]) {
    originalConsole.error.apply(console, args);
    sendToSW('error', formatArgs(args), getStack(args));
  };

  // 拦截 console.warn（始终捕获）
  console.warn = function (...args: unknown[]) {
    originalConsole.warn.apply(console, args);
    sendToSW('warn', formatArgs(args), getStack(args));
  };

  // 拦截 console.log（仅调试模式）
  console.log = function (...args: unknown[]) {
    originalConsole.log.apply(console, args);
    if (debugModeEnabled) {
      sendToSW('log', formatArgs(args), '');
    }
  };

  // 拦截 console.info（仅调试模式）
  console.info = function (...args: unknown[]) {
    originalConsole.info.apply(console, args);
    if (debugModeEnabled) {
      sendToSW('info', formatArgs(args), '');
    }
  };

  // 拦截 console.debug（仅调试模式）
  console.debug = function (...args: unknown[]) {
    originalConsole.debug.apply(console, args);
    if (debugModeEnabled) {
      sendToSW('debug', formatArgs(args), '');
    }
  };

  // 监听全局错误
  window.addEventListener('error', (event) => {
    const message = `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`;
    sendToSW('error', message, event.error?.stack || '');
  });

  // 监听未捕获的 Promise 错误
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error 
      ? reason.message 
      : `Unhandled Promise: ${String(reason)}`;
    const stack = reason instanceof Error ? reason.stack || '' : '';
    sendToSW('error', message, stack);
  });

  // 输出初始化成功日志（使用原始方法避免循环）
  originalConsole.log('[SW Console Capture] 已初始化');
}
