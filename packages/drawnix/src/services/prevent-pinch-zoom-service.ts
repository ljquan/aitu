/**
 * 防止双指缩放服务
 *
 * 通过监听触摸事件来阻止页面缩放
 * 
 * 优化：仅在画布区域阻止缩放，允许 UI 元素的正常触控交互
 */

/**
 * 检查元素是否为可交互的 UI 元素
 * 这些元素应该允许正常的触控事件
 */
function isInteractiveElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) {
    return false;
  }

  // 检查元素本身或其祖先是否为可交互元素
  const element = target as HTMLElement;

  // 可交互元素的选择器列表
  const interactiveSelectors = [
    // 表单元素
    'input',
    'textarea',
    'select',
    'button',
    // 工具栏和抽屉
    '.unified-toolbar',
    '.chat-drawer',
    '.side-drawer',
    '.toolbox-drawer',
    '.project-drawer',
    '.popup-toolbar',
    // 对话框和弹窗
    '.t-dialog',
    '.t-drawer',
    '.t-popup',
    '.t-popover',
    '.Dialog',
    '.winbox',
    // AI 输入栏
    '.ai-input-bar',
    // 视图导航
    '.view-navigation',
    // 小地图
    '.minimap',
    // 任务队列
    '.task-queue-panel',
    // 滑块和颜色选择器
    '.t-slider',
    '.unified-color-picker',
    '.color-picker',
    // 媒体库
    '.media-library',
    // 图片预览器 (ViewerJS)
    '.viewer-container',
    '.viewer-canvas',
    '.viewer-footer',
    '.viewer-toolbar',
    // 媒体预览器 (UnifiedMediaViewer)
    '.unified-viewer',
    '.media-viewport',
    '.thumbnail-queue',
    // 其他交互元素
    '[role="button"]',
    '[role="slider"]',
    '[role="menu"]',
    '[role="menuitem"]',
    '[role="dialog"]',
    '[data-allow-touch]', // 自定义属性，允许触控
  ];

  // 检查元素或其祖先是否匹配任一选择器
  for (const selector of interactiveSelectors) {
    if (element.matches(selector) || element.closest(selector)) {
      return true;
    }
  }

  // 检查是否有可滚动内容
  if (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) {
    const style = window.getComputedStyle(element);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll' ||
        style.overflowX === 'auto' || style.overflowX === 'scroll') {
      return true;
    }
  }

  return false;
}

/**
 * 检查是否在画布区域内
 */
function isInCanvasArea(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) {
    return false;
  }

  const element = target as HTMLElement;
  
  // 画布区域的选择器
  const canvasSelectors = [
    '.plait-board-container',
    '.plait-board',
    '[plait-board]',
    'svg.rough-svg',
  ];

  for (const selector of canvasSelectors) {
    if (element.matches(selector) || element.closest(selector)) {
      return true;
    }
  }

  return false;
}

/**
 * 初始化防止双指缩放
 */
export function initPreventPinchZoom(): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  // console.log('[PreventPinchZoom] Initializing');

  // 阻止多点触摸（仅在画布区域）
  const handleTouch = (event: TouchEvent) => {
    if (event.touches.length > 1) {
      const target = event.target;
      
      // 如果是可交互的 UI 元素，允许触控
      if (isInteractiveElement(target)) {
        return;
      }

      // 仅在画布区域阻止缩放
      if (isInCanvasArea(target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  };

  // 阻止手势事件（iOS Safari）- 仅在画布区域
  const handleGesture = (event: Event) => {
    const target = event.target;
    
    // 如果是可交互的 UI 元素，允许手势
    if (isInteractiveElement(target)) {
      return;
    }

    // 仅在画布区域阻止手势
    if (isInCanvasArea(target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  // 阻止 Ctrl/Cmd + 滚轮缩放（全局阻止，因为这是桌面端行为）
  const handleWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
    }
  };

  // 添加事件监听器
  // 使用 passive: false 确保可以调用 preventDefault
  // 使用 capture: true 在捕获阶段处理事件
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
