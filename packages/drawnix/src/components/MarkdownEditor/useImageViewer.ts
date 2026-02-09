import { useEffect, useRef, useCallback, RefObject } from 'react';
import Viewer from 'viewerjs';
import 'viewerjs/dist/viewer.css';

export interface UseImageViewerOptions {
  /** 容器元素的 ref */
  containerRef: RefObject<HTMLElement | null>;
  /** 是否启用图片预览 */
  enabled?: boolean;
}

/**
 * 获取 Shadow Root（如果存在）
 */
function getShadowRoot(element: HTMLElement | null): ShadowRoot | null {
  if (!element) return null;
  
  let current: Node | null = element;
  while (current) {
    if (current instanceof ShadowRoot) {
      return current;
    }
    current = (current as Element).parentNode;
  }
  return null;
}

/**
 * 获取容器内的所有可预览图片（排除 viewer 内部图片、ProseMirror 占位符等）
 */
function getPreviewableImages(container: HTMLElement): HTMLImageElement[] {
  const allImages = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
  
  return allImages.filter(img => {
    // 排除没有 src 的图片（如 ProseMirror-separator）
    if (!img.src || img.src === '' || img.src === 'about:blank') {
      return false;
    }
    // 排除 ProseMirror 的占位符图片
    if (img.classList.contains('ProseMirror-separator')) {
      return false;
    }
    // 排除 viewer 相关的图片
    if (img.closest('.viewer-gallery-container') || img.closest('.viewer-container')) {
      return false;
    }
    // 排除已经是 viewer 内部的图片
    if (img.classList.contains('viewer-move')) {
      return false;
    }
    return true;
  });
}

/**
 * 图片预览 Hook
 * 使用 viewerjs 实现双击图片打开全屏预览，支持图片序列浏览
 */
export function useImageViewer({ containerRef, enabled = true }: UseImageViewerOptions) {
  const viewerRef = useRef<Viewer | null>(null);
  const viewerContainerRef = useRef<HTMLElement | null>(null);
  const galleryContainerRef = useRef<HTMLElement | null>(null);
  // 存储图片 src 到索引的映射
  const imageIndexMapRef = useRef<Map<string, number>>(new Map());

  // 初始化或更新 Viewer 实例
  const initViewer = useCallback(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    // 销毁旧实例
    if (viewerRef.current) {
      viewerRef.current.destroy();
      viewerRef.current = null;
    }

    // 清空索引映射
    imageIndexMapRef.current.clear();

    // 查找所有可预览图片
    const images = getPreviewableImages(container);
    if (images.length === 0) return;

    // 获取 Shadow Root（如果在 Shadow DOM 中运行）
    const shadowRoot = getShadowRoot(container);
    
    // 创建一个隐藏的图片容器用于 Viewer
    let galleryContainer = galleryContainerRef.current;
    if (!galleryContainer || !container.contains(galleryContainer)) {
      galleryContainer = document.createElement('div');
      galleryContainer.className = 'viewer-gallery-container';
      galleryContainer.style.display = 'none';
      container.appendChild(galleryContainer);
      galleryContainerRef.current = galleryContainer;
    }

    // 清空并重新填充图片，同时建立索引映射
    galleryContainer.innerHTML = '';
    images.forEach((img, index) => {
      const clonedImg = document.createElement('img');
      clonedImg.src = img.src;
      clonedImg.alt = img.alt || '';
      galleryContainer.appendChild(clonedImg);
      
      // 给原始图片添加 data 属性标记索引
      img.dataset.viewerIndex = String(index);
      
      // 建立 src 到索引的映射（用于备用匹配）
      // 注意：如果有多个相同 src 的图片，只保留第一个的索引
      if (!imageIndexMapRef.current.has(img.src)) {
        imageIndexMapRef.current.set(img.src, index);
      }
    });

    // 如果在 Shadow DOM 中，创建一个容器用于渲染 Viewer
    if (shadowRoot) {
      let viewerContainer = shadowRoot.querySelector('.viewer-root-container') as HTMLElement;
      if (!viewerContainer) {
        viewerContainer = document.createElement('div');
        viewerContainer.className = 'viewer-root-container';
        // 设置最高层级，确保在抽屉之上
        viewerContainer.style.position = 'relative';
        viewerContainer.style.zIndex = '2147483647';
        shadowRoot.appendChild(viewerContainer);
      }
      viewerContainerRef.current = viewerContainer;
    }

    // 创建 Viewer 实例
    viewerRef.current = new Viewer(galleryContainer, {
      inline: false,
      button: true,
      navbar: images.length > 1,
      title: true,
      toolbar: {
        zoomIn: true,
        zoomOut: true,
        oneToOne: true,
        reset: true,
        prev: images.length > 1,
        play: false,
        next: images.length > 1,
        rotateLeft: true,
        rotateRight: true,
        flipHorizontal: true,
        flipVertical: true,
      },
      keyboard: true,
      tooltip: true,
      movable: true,
      zoomable: true,
      rotatable: true,
      scalable: true,
      transition: true,
      fullscreen: true,
      zoomRatio: 0.1,
      minZoomRatio: 0.01,
      maxZoomRatio: 100,
      container: shadowRoot ? viewerContainerRef.current! : undefined,
    });
  }, [containerRef, enabled]);

  // 销毁 Viewer 实例
  const destroyViewer = useCallback(() => {
    if (viewerRef.current) {
      viewerRef.current.destroy();
      viewerRef.current = null;
    }
    // 清理隐藏的图片容器
    if (galleryContainerRef.current) {
      galleryContainerRef.current.remove();
      galleryContainerRef.current = null;
    }
    // 清理 Shadow DOM 中的 Viewer 容器
    if (viewerContainerRef.current) {
      viewerContainerRef.current.remove();
      viewerContainerRef.current = null;
    }
    // 清空索引映射
    imageIndexMapRef.current.clear();
  }, []);

  // 设置事件监听
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    // 处理双击事件
    const handleDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // 检查是否点击的是图片
      if (target.tagName !== 'IMG') return;

      // 排除 viewer 内部的图片
      if (target.closest('.viewer-gallery-container') || target.closest('.viewer-container')) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const clickedImg = target as HTMLImageElement;
      
      // 优先使用 data-viewer-index 属性获取索引
      let index = -1;
      const dataIndex = clickedImg.dataset.viewerIndex;
      if (dataIndex !== undefined) {
        index = parseInt(dataIndex, 10);
      }
      
      // 如果没有 data 属性，尝试通过 src 映射获取
      if (index === -1 || isNaN(index)) {
        const mappedIndex = imageIndexMapRef.current.get(clickedImg.src);
        if (mappedIndex !== undefined) {
          index = mappedIndex;
        }
      }
      
      // 如果还是找不到，重新初始化并查找
      if (index === -1) {
        initViewer();
        const newDataIndex = clickedImg.dataset.viewerIndex;
        if (newDataIndex !== undefined) {
          index = parseInt(newDataIndex, 10);
        }
      }
      
      if (index !== -1 && !isNaN(index)) {
        // 确保 Viewer 已初始化
        if (!viewerRef.current) {
          initViewer();
        }
        // 显示指定索引的图片
        if (viewerRef.current) {
          viewerRef.current.view(index);
        }
      }
    };

    // 初始化 Viewer
    initViewer();

    // 添加双击事件监听（使用 capture 阶段确保能捕获到事件）
    container.addEventListener('dblclick', handleDblClick, true);

    return () => {
      container.removeEventListener('dblclick', handleDblClick, true);
      destroyViewer();
    };
  }, [containerRef, enabled, initViewer, destroyViewer]);

  // 返回更新方法，供内容变化时调用
  return {
    updateViewer: initViewer,
    destroyViewer,
  };
}

export default useImageViewer;
