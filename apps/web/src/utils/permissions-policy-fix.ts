/**
 * 权限策略修复工具
 * 用于解决第三方库触发的 unload 权限策略违规警告
 *
 * 只拦截 unload 事件（影响 bfcache），允许 beforeunload 事件（用于离开提醒）
 */

// 保存原始的 addEventListener 和 removeEventListener
const originalAddEventListener = window.addEventListener.bind(window);
const originalRemoveEventListener = window.removeEventListener.bind(window);

// 存储 beforeunload 监听器的引用
let beforeUnloadHandler: EventListenerOrEventListenerObject | null = null;

window.addEventListener = function(
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
) {
  // 只拦截 unload 事件（总是阻止，因为它会影响 bfcache）
  if (type === 'unload') {
    console.warn('[Permissions Policy] Blocked unload event listener');
    return;
  }

  // 对于 beforeunload，保存引用并使用原生方法
  if (type === 'beforeunload') {
    beforeUnloadHandler = listener;
    console.log('[Permissions Policy] Registering beforeunload with native method');
    return originalAddEventListener.call(window, type, listener, options);
  }

  // 其他事件正常处理
  return originalAddEventListener.call(window, type, listener, options);
};

window.removeEventListener = function(
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | EventListenerOptions
) {
  // 对于 beforeunload，清除引用
  if (type === 'beforeunload') {
    beforeUnloadHandler = null;
  }

  return originalRemoveEventListener.call(window, type, listener, options);
};

// 暴露调试函数
(window as any).__checkBeforeUnload = () => {
  console.log('[Permissions Policy] beforeUnloadHandler registered:', !!beforeUnloadHandler);
  return !!beforeUnloadHandler;
};

export {};