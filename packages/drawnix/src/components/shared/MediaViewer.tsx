/**
 * MediaViewer Component
 *
 * 统一的媒体预览组件，支持图片和视频混合预览
 * 基于 ViewerJS 封装，提供：
 * - 图片缩放、旋转、拖拽（单图模式）
 * - 视频播放
 * - 图片/视频混合列表导航
 * - 键盘快捷键支持
 *
 * 使用场景：
 * - 任务队列的结果预览
 * - 批量图片生成的预览
 * - 素材库的大图预览
 * - 聊天中的图片/视频预览
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import ReactDOM from 'react-dom';
import Viewer from 'viewerjs';
import 'viewerjs/dist/viewer.css';
import './media-viewer.scss';

export interface MediaItem {
  /** 媒体 URL */
  url: string;
  /** 媒体类型 */
  type: 'image' | 'video';
  /** 可选的标题 */
  title?: string;
  /** 可选的描述 */
  alt?: string;
}

export interface MediaViewerProps {
  /** 是否显示 */
  visible: boolean;
  /** 媒体列表 */
  items: MediaItem[];
  /** 初始索引（从 0 开始） */
  initialIndex?: number;
  /** 关闭回调 */
  onClose: () => void;
  /** 索引变化回调 */
  onIndexChange?: (index: number) => void;
  /** 是否显示工具栏（仅图片） */
  showToolbar?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 是否显示标题 */
  showTitle?: boolean;
  /** 视频是否自动播放 */
  videoAutoPlay?: boolean;
  /** 视频是否循环播放 */
  videoLoop?: boolean;
}

/**
 * 统一的媒体预览组件 - 支持图片/视频混合列表
 */
export const MediaViewer: React.FC<MediaViewerProps> = ({
  visible,
  items,
  initialIndex = 0,
  onClose,
  onIndexChange,
  showToolbar = true,
  className = '',
  showTitle = true,
  videoAutoPlay = true,
  videoLoop = true,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const prevVisibleRef = useRef(visible);

  // 当前显示项
  const currentItem = items[currentIndex];
  const isCurrentVideo = currentItem?.type === 'video';

  // 只在 visible 从 false 变为 true 时同步 initialIndex
  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      setCurrentIndex(initialIndex);
    }
    prevVisibleRef.current = visible;
  }, [visible, initialIndex]);

  // 清理 ViewerJS 实例
  const destroyViewer = useCallback(() => {
    if (viewerRef.current) {
      viewerRef.current.destroy();
      viewerRef.current = null;
    }
    if (imageContainerRef.current && imageContainerRef.current.parentNode) {
      document.body.removeChild(imageContainerRef.current);
      imageContainerRef.current = null;
    }
  }, []);

  // 创建单图 ViewerJS 实例
  const createImageViewer = useCallback((item: MediaItem) => {
    // 先清理旧实例
    destroyViewer();

    // 创建隐藏的图片容器
    const container = document.createElement('div');
    container.style.display = 'none';
    const img = document.createElement('img');
    img.src = item.url;
    img.alt = item.alt || 'Image';
    container.appendChild(img);
    document.body.appendChild(container);
    imageContainerRef.current = container;

    // 创建 ViewerJS 实例（单图模式，禁用内置导航）
    const viewer = new Viewer(container, {
      inline: false,
      button: false, // 禁用内置关闭按钮，使用我们自己的
      navbar: false, // 禁用缩略图导航
      title: false, // 禁用内置标题，使用我们自己的
      toolbar: showToolbar
        ? {
            zoomIn: 1,
            zoomOut: 1,
            oneToOne: 1,
            reset: 1,
            prev: 0, // 禁用内置导航
            play: 0,
            next: 0, // 禁用内置导航
            rotateLeft: 1,
            rotateRight: 1,
            flipHorizontal: 1,
            flipVertical: 1,
          }
        : false,
      fullscreen: true,
      keyboard: false, // 禁用内置键盘，我们自己处理
      backdrop: 'static', // 点击背景不关闭
      loading: true,
      loop: false,
      minZoomRatio: 0.1,
      maxZoomRatio: 10,
      zoomRatio: 0.2,
      transition: false, // 禁用过渡动画，切换更流畅
    });

    viewer.show();
    viewerRef.current = viewer;
  }, [showToolbar, destroyViewer]);

  // 当 visible 或 currentIndex 变化时，处理预览
  useEffect(() => {
    if (!visible) {
      destroyViewer();
      return;
    }

    if (!currentItem) return;

    // 如果当前是图片，创建 ViewerJS
    if (currentItem.type === 'image') {
      createImageViewer(currentItem);
    } else {
      // 如果当前是视频，销毁 ViewerJS（视频使用自定义播放器）
      destroyViewer();
    }

    return () => {
      // 组件卸载时清理
    };
  }, [visible, currentIndex, currentItem, createImageViewer, destroyViewer]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      destroyViewer();
    };
  }, [destroyViewer]);

  // 导航函数
  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      onIndexChange?.(newIndex);
    }
  }, [currentIndex, onIndexChange]);

  const goToNext = useCallback(() => {
    if (currentIndex < items.length - 1) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      onIndexChange?.(newIndex);
    }
  }, [currentIndex, items.length, onIndexChange]);

  // 处理关闭
  const handleClose = useCallback(() => {
    destroyViewer();
    onClose();
  }, [destroyViewer, onClose]);

  // 键盘事件处理
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'ArrowRight' && currentIndex < items.length - 1) {
        e.preventDefault();
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, currentIndex, items.length, handleClose, goToPrev, goToNext]);

  // 处理点击遮罩关闭
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleClose();
      }
    },
    [handleClose]
  );

  // 如果不可见或没有内容，不渲染
  if (!visible || items.length === 0 || !currentItem) return null;

  // 统一的导航覆盖层（同时用于图片和视频）
  const navigationOverlay = ReactDOM.createPortal(
    <div
      className={`media-viewer media-viewer--navigation ${className}`}
      onClick={isCurrentVideo ? handleOverlayClick : undefined}
    >
      {/* 视频时显示遮罩层 */}
      {isCurrentVideo && <div className="media-viewer__overlay" />}

      {/* 关闭按钮 */}
      <button className="media-viewer__close" onClick={handleClose} title="关闭 (Esc)">
        ×
      </button>

      {/* 导航按钮 */}
      {items.length > 1 && (
        <>
          <button
            className="media-viewer__nav media-viewer__nav--prev"
            onClick={goToPrev}
            disabled={currentIndex === 0}
            title="上一个 (←)"
          >
            ‹
          </button>
          <button
            className="media-viewer__nav media-viewer__nav--next"
            onClick={goToNext}
            disabled={currentIndex === items.length - 1}
            title="下一个 (→)"
          >
            ›
          </button>
        </>
      )}

      {/* 视频播放器（仅视频时渲染） */}
      {isCurrentVideo && (
        <div className="media-viewer__content">
          <video
            key={currentItem.url}
            src={currentItem.url}
            controls
            autoPlay={videoAutoPlay}
            loop={videoLoop}
            playsInline
            className="media-viewer__video"
          />
        </div>
      )}

      {/* 索引指示器 */}
      {items.length > 1 && (
        <div className="media-viewer__indicator">
          <span className="media-viewer__indicator-type">
            {isCurrentVideo ? '🎬' : '🖼️'}
          </span>
          {currentIndex + 1} / {items.length}
        </div>
      )}

      {/* 标题 */}
      {showTitle && currentItem.title && (
        <div className="media-viewer__title">{currentItem.title}</div>
      )}
    </div>,
    document.body
  );

  return navigationOverlay;
};

export default MediaViewer;
