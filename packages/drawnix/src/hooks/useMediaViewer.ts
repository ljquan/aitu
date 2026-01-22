/**
 * useMediaViewer Hook
 *
 * 简化 MediaViewer 组件的使用
 * 提供命令式 API 来打开预览
 *
 * 使用示例：
 * ```tsx
 * const { openViewer, viewerProps } = useMediaViewer();
 *
 * // 打开单张图片
 * openViewer({ url: 'xxx.jpg', type: 'image' });
 *
 * // 打开多张图片，从第2张开始
 * openViewer([
 *   { url: 'a.jpg', type: 'image' },
 *   { url: 'b.jpg', type: 'image' },
 * ], 1);
 *
 * // 在组件中渲染
 * <MediaViewer {...viewerProps} />
 * ```
 */

import { useState, useCallback, useMemo } from 'react';
import type { MediaItem, MediaViewerProps } from '../components/shared/MediaViewer';

export interface UseMediaViewerOptions {
  /** 是否显示缩略图导航栏 */
  showNavbar?: boolean;
  /** 是否显示工具栏 */
  showToolbar?: boolean;
  /** 是否显示标题 */
  showTitle?: boolean;
  /** 视频是否自动播放 */
  videoAutoPlay?: boolean;
  /** 视频是否循环播放 */
  videoLoop?: boolean;
  /** 关闭时的回调 */
  onClose?: () => void;
  /** 索引变化回调 */
  onIndexChange?: (index: number) => void;
}

export interface UseMediaViewerReturn {
  /** 打开预览 */
  openViewer: (items: MediaItem | MediaItem[], initialIndex?: number) => void;
  /** 关闭预览 */
  closeViewer: () => void;
  /** 是否正在显示 */
  isOpen: boolean;
  /** 当前索引 */
  currentIndex: number;
  /** 当前项目列表 */
  items: MediaItem[];
  /** 传给 MediaViewer 组件的 props */
  viewerProps: MediaViewerProps;
}

/**
 * MediaViewer Hook
 * 提供命令式 API 来控制预览组件
 */
export function useMediaViewer(options: UseMediaViewerOptions = {}): UseMediaViewerReturn {
  const {
    showNavbar = true,
    showToolbar = true,
    showTitle = true,
    videoAutoPlay = true,
    videoLoop = true,
    onClose: onCloseCallback,
    onIndexChange: onIndexChangeCallback,
  } = options;

  const [visible, setVisible] = useState(false);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // 打开预览
  const openViewer = useCallback((itemsOrItem: MediaItem | MediaItem[], initialIndex = 0) => {
    const itemList = Array.isArray(itemsOrItem) ? itemsOrItem : [itemsOrItem];
    if (itemList.length === 0) return;

    setItems(itemList);
    setCurrentIndex(Math.max(0, Math.min(initialIndex, itemList.length - 1)));
    setVisible(true);
  }, []);

  // 关闭预览
  const closeViewer = useCallback(() => {
    setVisible(false);
    setItems([]);
    setCurrentIndex(0);
    onCloseCallback?.();
  }, [onCloseCallback]);

  // 索引变化处理
  const handleIndexChange = useCallback(
    (index: number) => {
      setCurrentIndex(index);
      onIndexChangeCallback?.(index);
    },
    [onIndexChangeCallback]
  );

  // 生成传给 MediaViewer 的 props
  const viewerProps: MediaViewerProps = useMemo(
    () => ({
      visible,
      items,
      initialIndex: currentIndex,
      onClose: closeViewer,
      onIndexChange: handleIndexChange,
      showNavbar,
      showToolbar,
      showTitle,
      videoAutoPlay,
      videoLoop,
    }),
    [
      visible,
      items,
      currentIndex,
      closeViewer,
      handleIndexChange,
      showNavbar,
      showToolbar,
      showTitle,
      videoAutoPlay,
      videoLoop,
    ]
  );

  return {
    openViewer,
    closeViewer,
    isOpen: visible,
    currentIndex,
    items,
    viewerProps,
  };
}

// ============ 便捷的快捷函数 ============

/**
 * 将图片 URL 列表转换为 MediaItem 列表
 */
export function urlsToMediaItems(urls: string[], type: 'image' | 'video' = 'image'): MediaItem[] {
  return urls.map((url, index) => ({
    url,
    type,
    alt: `${type === 'image' ? 'Image' : 'Video'} ${index + 1}`,
  }));
}

/**
 * 将混合的 URL 列表转换为 MediaItem 列表（自动检测类型）
 */
export function autoDetectMediaItems(urls: string[]): MediaItem[] {
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi'];
  const isVideo = (url: string) =>
    videoExtensions.some((ext) => url.toLowerCase().includes(ext)) ||
    url.includes('video/');

  return urls.map((url, index) => ({
    url,
    type: isVideo(url) ? 'video' : 'image',
    alt: `Media ${index + 1}`,
  }));
}

export default useMediaViewer;
