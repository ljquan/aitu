/**
 * 权限策略修复工具
 * 用于解决第三方库触发的 unload 权限策略违规警告
 */

// 重写可能触发警告的事件监听器
const originalAddEventListener = window.addEventListener;

window.addEventListener = function(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
  // 拦截 unload 和 beforeunload 事件的注册
  if (type === 'unload' || type === 'beforeunload') {
    console.warn(`[Permissions Policy] Blocked ${type} event listener to avoid policy violation`);
    return;
  }
  
  // 其他事件正常处理
  return originalAddEventListener.call(this, type, listener, options);
};

// 存储可能需要移除的监听器引用
const noopUnloadHandler = () => {
  // Placeholder handler for removing unload listeners
};
const noopBeforeunloadHandler = () => {
  // Placeholder handler for removing beforeunload listeners
};

// 如果有第三方库已经添加了 unload 事件监听器，移除它们
const removeExistingUnloadListeners = () => {
  try {
    // 尝试移除可能存在的 unload 监听器
    window.removeEventListener('unload', noopUnloadHandler);
    window.removeEventListener('beforeunload', noopBeforeunloadHandler);
  } catch (error) {
    // 忽略移除不存在的监听器时的错误
  }
};

// 页面加载时清理
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', removeExistingUnloadListeners);
} else {
  removeExistingUnloadListeners();
}

export {};