import { useEffect, RefObject } from 'react';
import React from 'react';

// 创建全局蒙层（单例模式）
let globalOverlay: HTMLDivElement | null = null;
let overlayTimer: NodeJS.Timeout | null = null;

/**
 * 显示缩放调整蒙层，持续 1 秒
 * 这个蒙层用于提示用户正在进行缩放调整，避免在调整期间进一步操作
 */
const showScalingOverlay = () => {
  // 如果已经有定时器，清除它
  if (overlayTimer) {
    clearTimeout(overlayTimer);
    overlayTimer = null;
  }

  // 创建或获取蒙层元素
  if (!globalOverlay) {
    globalOverlay = document.createElement('div');
    globalOverlay.className = 'viewport-scaling-overlay';
    globalOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.1);
      z-index: 9999;
      pointer-events: auto;
      backdrop-filter: blur(2px);
      opacity: 0;
      transition: opacity 0.15s ease-in-out;
    `;

    // 添加提示文本 - 使用 absolute 定位，通过 left/top 固定到视口中心
    const message = document.createElement('div');
    message.textContent = `不要缩放页面，会有问题! 请把页面的缩放调回100%`;
    message.className = 'viewport-scaling-message';
    message.style.cssText = `
      position: absolute;
      background: rgba(0, 0, 0, 0.7);
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 500;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.9);
      white-space: nowrap;
      pointer-events: none;
      transform-origin: center center;
    `;
    globalOverlay.appendChild(message);

    document.body.appendChild(globalOverlay);
  }

  // 更新提示文本位置：固定在视口中心
  if (window.visualViewport) {
    const viewport = window.visualViewport;
    const scale = viewport.scale;
    const message = globalOverlay.querySelector('.viewport-scaling-message') as HTMLElement;

    if (message) {
      // 计算视口中心在页面坐标系中的位置
      // viewport.offsetLeft/Top 是视口左上角在页面中的位置
      // viewport.width/height / 2 是视口尺寸的一半
      const centerX = viewport.offsetLeft + viewport.width / 2;
      const centerY = viewport.offsetTop + viewport.height / 2;

      // 设置固定位置到视口中心
      message.style.left = `${centerX}px`;
      message.style.top = `${centerY}px`;

      if (scale !== 1) {
        const scaleRatio = 1 / scale;
        // 应用反向缩放，transform-origin 是 center center，所以元素会围绕中心缩放
        message.style.transform = `translate(-50%, -50%) scale(${scaleRatio})`;
      } else {
        // 缩放比例为 1 时，只居中
        message.style.transform = 'translate(-50%, -50%)';
      }
    }
  }

  // 显示蒙层
  requestAnimationFrame(() => {
    if (globalOverlay) {
      globalOverlay.style.opacity = '1';
    }
  });

  // 1 秒后隐藏蒙层
  overlayTimer = setTimeout(() => {
    if (globalOverlay) {
      globalOverlay.style.opacity = '0';
      // 动画结束后移除元素
      setTimeout(() => {
        if (globalOverlay && globalOverlay.parentNode) {
          globalOverlay.parentNode.removeChild(globalOverlay);
          globalOverlay = null;
        }
      }, 150); // 等待 transition 结束
    }
    overlayTimer = null;
  }, 1000);
};

export interface UseViewportScaleOptions {
  /**
   * 是否启用位置跟随（适用于绝对定位元素）
   * @default false
   */
  enablePositionTracking?: boolean;

  /**
   * 是否启用反向缩放以保持元素大小不变
   * @default true
   */
  enableScaleCompensation?: boolean;
}

/**
 * useViewportScale - 监听页面缩放并调整元素显示
 *
 * 此 hook 监听 visualViewport 的缩放和滚动事件，可以：
 * 1. 通过反向 scale transform 保持元素显示大小不变
 * 2. 对于绝对定位元素，调整位置使其跟随视口
 * 3. 对于固定定位元素，通过 translate 补偿视口偏移
 *
 * @param elementRef - 要应用效果的元素 ref
 * @param options - 配置选项
 * @returns 返回一个 refresh 函数，用于手动触发重新计算
 *
 * @example
 * // fixed 定位：仅保持大小不变 + translate 补偿视口偏移
 * const ref = useRef<HTMLDivElement>(null);
 * const refresh = useViewportScale(ref);
 * // 在元素加载后手动触发：refresh();
 *
 * @example
 * // absolute 定位：调整 left/top 跟随视口 + 反向缩放
 * const ref = useRef<HTMLDivElement>(null);
 * const refresh = useViewportScale(ref, { enablePositionTracking: true });
 */
export function useViewportScale<T extends HTMLElement>(
  elementRef: RefObject<T>,
  options: UseViewportScaleOptions = {}
): () => void {
  const {
    enablePositionTracking = false,
    enableScaleCompensation = true,
  } = options;

  // 使用 useCallback 创建稳定的 handleViewportChange 引用
  const handleViewportChange = React.useCallback(() => {
    const element = elementRef.current;
    if (!element) return;

    const viewport = window.visualViewport!;
    const scale = viewport.scale;

    // 当缩放比例不为 1 时，显示蒙层提示用户正在调整
    if (scale !== 1) {
      showScalingOverlay();
    }

    // 位置跟随：调整元素位置使其对齐到视口左上角（适用于 absolute 定位）
    if (enablePositionTracking) {
      const offsetX = viewport.offsetLeft;
      const offsetY = viewport.offsetTop;
      element.style.left = `${offsetX}px`;
      element.style.top = `${offsetY}px`;

      // absolute 定位：只需要反向缩放，不需要 translate
      if (enableScaleCompensation && scale !== 1) {
        element.style.transform = `scale(${1 / scale})`;
        element.style.transformOrigin = 'top left';
      } else if (enableScaleCompensation) {
        element.style.transform = '';
        element.style.transformOrigin = '';
      }
    } else {
      // fixed 定位：需要 translate 补偿视口偏移 + 反向缩放
      if (enableScaleCompensation && scale !== 1) {
        // 计算缩放偏移补偿
        // 当页面放大时，元素反向缩小，需要通过 translate 调整位置使其保持在视口中心
        const scaleRatio = 1 / scale;

        // 计算需要的位移：使缩小后的元素相对于视口保持原来的视觉位置
        // translateX/Y = viewport offset / scale (转换到缩小后的坐标系)
        const translateX = viewport.offsetLeft / scale;
        const translateY = viewport.offsetTop / scale;

        element.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scaleRatio})`;
        element.style.transformOrigin = 'top left';
      } else if (enableScaleCompensation) {
        element.style.transform = '';
        element.style.transformOrigin = '';
      }
    }
  }, [elementRef, enablePositionTracking, enableScaleCompensation]);

  useEffect(() => {
    if (!window.visualViewport) return;

    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);

    // 初始化时调用一次
    handleViewportChange();

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      window.visualViewport?.removeEventListener('scroll', handleViewportChange);
    };
  }, [handleViewportChange]);

  // 返回 refresh 函数，允许外部手动触发重新计算
  return handleViewportChange;
}
