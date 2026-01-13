/**
 * 防止双指缩放服务
 *
 * 通过监听触摸事件来阻止页面缩放
 */

/**
 * 初始化防止双指缩放
 */
export function initPreventPinchZoom(): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  // console.log('[PreventPinchZoom] Initializing');

  // 阻止多点触摸
  const handleTouch = (event: TouchEvent) => {
    if (event.touches.length > 1) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  // 阻止手势事件（iOS Safari）
  const handleGesture = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  // 阻止 Ctrl/Cmd + 滚轮缩放
  const handleWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
    }
  };

  // 添加事件监听器
  document.addEventListener('touchstart', handleTouch, { passive: false, capture: true });
  document.addEventListener('touchmove', handleTouch, { passive: false, capture: true });
  document.addEventListener('touchend', handleTouch, { passive: false, capture: true });
  document.addEventListener('gesturestart', handleGesture, { passive: false, capture: true });
  document.addEventListener('gesturechange', handleGesture, { passive: false, capture: true });
  document.addEventListener('gestureend', handleGesture, { passive: false, capture: true });
  window.addEventListener('wheel', handleWheel, { passive: false });

  // console.log('[PreventPinchZoom] Event listeners added');

  // 返回清理函数
  return () => {
    document.removeEventListener('touchstart', handleTouch, true);
    document.removeEventListener('touchmove', handleTouch, true);
    document.removeEventListener('touchend', handleTouch, true);
    document.removeEventListener('gesturestart', handleGesture, true);
    document.removeEventListener('gesturechange', handleGesture, true);
    document.removeEventListener('gestureend', handleGesture, true);
    window.removeEventListener('wheel', handleWheel);
    // console.log('[PreventPinchZoom] Cleaned up');
  };
}
