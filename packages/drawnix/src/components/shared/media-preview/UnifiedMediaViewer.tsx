/**
 * 统一媒体预览系统 - 主组件
 * 支持单图预览和对比预览模式，可相互切换
 */

import React, { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { UnifiedMediaViewerProps, CompareLayout, ViewerMode } from './types';
import { useViewerState } from './useViewerState';
import { MediaViewport } from './MediaViewport';
import { ThumbnailQueue } from './ThumbnailQueue';
import { ViewerToolbar } from './ViewerToolbar';
import './UnifiedMediaViewer.scss';

export const UnifiedMediaViewer: React.FC<UnifiedMediaViewerProps> = ({
  visible,
  items,
  initialMode = 'single',
  initialIndex = 0,
  onClose,
  onModeChange,
  showThumbnails = true,
  maxCompareSlots = 4,
  defaultCompareLayout = 'horizontal',
  className = '',
  showTitle = true,
  videoAutoPlay = false,
  videoLoop = true,
  onInsertToCanvas,
  onEdit,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [slotCount, setSlotCount] = useState<2 | 3 | 4>(2);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [state, actions] = useViewerState({
    items,
    initialMode,
    initialIndex,
    maxCompareSlots,
    defaultCompareLayout,
    visible,
    onModeChange,
  });

  const {
    mode,
    currentIndex,
    compareIndices,
    compareLayout,
    syncMode,
    zoomLevel,
    panOffset,
    focusedSlot,
  } = state;

  // 对比模式下切换到下一组
  const goToNextGroup = useCallback(() => {
    if (items.length <= slotCount) return;
    
    // 找到当前组的最大索引
    const maxCurrentIndex = Math.max(...compareIndices);
    // 下一组的起始索引
    const nextStartIndex = maxCurrentIndex + 1;
    
    if (nextStartIndex >= items.length) {
      // 已经是最后一组，循环到开头
      const newIndices: number[] = [];
      for (let i = 0; i < slotCount && i < items.length; i++) {
        newIndices.push(i);
      }
      newIndices.forEach((idx, slot) => actions.addToCompare(idx, slot));
    } else {
      // 切换到下一组
      const newIndices: number[] = [];
      for (let i = 0; i < slotCount; i++) {
        const newIdx = (nextStartIndex + i) % items.length;
        newIndices.push(newIdx);
      }
      newIndices.forEach((idx, slot) => actions.addToCompare(idx, slot));
    }
  }, [items.length, slotCount, compareIndices, actions]);

  // 对比模式下切换到上一组
  const goToPrevGroup = useCallback(() => {
    if (items.length <= slotCount) return;
    
    // 找到当前组的最小索引
    const minCurrentIndex = Math.min(...compareIndices);
    // 上一组的起始索引
    const prevStartIndex = minCurrentIndex - slotCount;
    
    if (prevStartIndex < 0) {
      // 已经是第一组，循环到最后
      const lastGroupStart = Math.max(0, items.length - slotCount);
      const newIndices: number[] = [];
      for (let i = 0; i < slotCount && lastGroupStart + i < items.length; i++) {
        newIndices.push(lastGroupStart + i);
      }
      newIndices.forEach((idx, slot) => actions.addToCompare(idx, slot));
    } else {
      // 切换到上一组
      const newIndices: number[] = [];
      for (let i = 0; i < slotCount; i++) {
        newIndices.push(prevStartIndex + i);
      }
      newIndices.forEach((idx, slot) => actions.addToCompare(idx, slot));
    }
  }, [items.length, slotCount, compareIndices, actions]);

  // 键盘快捷键处理
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 避免在输入框等元素中触发
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          if (mode === 'single') {
            actions.goToPrev();
          } else {
            // 对比模式：切换到上一组
            goToPrevGroup();
          }
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          if (mode === 'single') {
            actions.goToNext();
          } else {
            // 对比模式：切换到下一组
            goToNextGroup();
          }
          break;
        case 'c':
        case 'C':
          // 切换对比模式
          if (items.length > 1) {
            e.preventDefault();
            actions.setMode(mode === 'single' ? 'compare' : 'single');
          }
          break;
        case '1':
        case '2':
        case '3':
        case '4':
          // 对比模式下切换焦点槽位
          if (mode === 'compare') {
            const slot = parseInt(e.key, 10) - 1;
            if (slot < slotCount) {
              e.preventDefault();
              actions.setFocusedSlot(slot);
            }
          }
          break;
        case '+':
        case '=':
          e.preventDefault();
          actions.zoom(0.25);
          break;
        case '-':
        case '_':
          e.preventDefault();
          actions.zoom(-0.25);
          break;
        case '0':
          e.preventDefault();
          actions.resetView();
          break;
        case 's':
        case 'S':
          if (mode === 'compare') {
            e.preventDefault();
            actions.toggleSyncMode();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, mode, items.length, actions, onClose, slotCount, goToNextGroup, goToPrevGroup]);

  // 全屏处理
  const handleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, [isFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 点击背景关闭
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // 缩略图点击处理
  const handleThumbnailClick = useCallback(
    (index: number) => {
      if (mode === 'single') {
        actions.goTo(index);
      } else {
        // 对比模式：添加到当前焦点槽位
        actions.addToCompare(index, focusedSlot);
      }
    },
    [mode, actions, focusedSlot]
  );

  // 槽位分屏数变化
  const handleSlotCountChange = useCallback(
    (count: 2 | 3 | 4) => {
      setSlotCount(count);
      actions.setSlotCount(count);
    },
    [actions]
  );

  // 获取对比布局样式
  const getCompareLayoutClass = useCallback(
    (layout: CompareLayout, count: number): string => {
      if (layout === 'grid') {
        return count <= 2 ? 'layout-horizontal' : 'layout-grid';
      }
      return `layout-${layout}`;
    },
    []
  );

  // 处理插入到画布
  const handleInsertToCanvas = useCallback(() => {
    const currentItem = items[currentIndex];
    if (currentItem && onInsertToCanvas) {
      onInsertToCanvas(currentItem);
    }
  }, [items, currentIndex, onInsertToCanvas]);

  // 处理下载当前媒体
  const handleDownload = useCallback(() => {
    const currentItem = items[currentIndex];
    if (!currentItem) return;
    
    const link = document.createElement('a');
    link.href = currentItem.url;
    link.download = currentItem.title || `media-${Date.now()}`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [items, currentIndex]);

  // 处理编辑当前媒体
  const handleEdit = useCallback(() => {
    const currentItem = items[currentIndex];
    if (currentItem && onEdit && currentItem.type === 'image') {
      onEdit(currentItem);
    }
  }, [items, currentIndex, onEdit]);

  // 渲染单图模式
  const renderSingleMode = () => {
    const currentItem = items[currentIndex] || null;

    return (
      <div className="unified-viewer__single">
        {/* 左箭头 */}
        {items.length > 1 && (
          <button
            className="unified-viewer__nav unified-viewer__nav--prev"
            onClick={actions.goToPrev}
            title="上一个"
          >
            <ChevronLeft size={32} />
          </button>
        )}

        {/* 主展示区 */}
        <MediaViewport
          item={currentItem}
          zoomLevel={zoomLevel}
          panOffset={panOffset}
          videoAutoPlay={videoAutoPlay}
          videoLoop={videoLoop}
          onZoomChange={(z) => actions.zoom(z - zoomLevel)}
          onPanChange={() => {
            // 单图模式暂不同步 pan
          }}
          onInsertToCanvas={onInsertToCanvas ? handleInsertToCanvas : undefined}
          onDownload={handleDownload}
          onEdit={onEdit ? handleEdit : undefined}
        />

        {/* 右箭头 */}
        {items.length > 1 && (
          <button
            className="unified-viewer__nav unified-viewer__nav--next"
            onClick={actions.goToNext}
            title="下一个"
          >
            <ChevronRight size={32} />
          </button>
        )}
      </div>
    );
  };

  // 渲染对比模式
  const renderCompareMode = () => {
    const layoutClass = getCompareLayoutClass(compareLayout, slotCount);

    return (
      <div className={`unified-viewer__compare ${layoutClass}`}>
        {Array.from({ length: slotCount }).map((_, slotIdx) => {
          const itemIndex = compareIndices[slotIdx];
          const item =
            typeof itemIndex === 'number' ? items[itemIndex] : null;

          return (
            <MediaViewport
              key={slotIdx}
              item={item}
              slotIndex={slotIdx}
              isFocused={focusedSlot === slotIdx}
              zoomLevel={syncMode ? zoomLevel : undefined}
              panOffset={syncMode ? panOffset : undefined}
              onClick={() => actions.setFocusedSlot(slotIdx)}
              onClose={
                slotCount > 2
                  ? () => actions.removeFromCompare(slotIdx)
                  : undefined
              }
              videoAutoPlay={videoAutoPlay}
              videoLoop={videoLoop}
              onZoomChange={
                syncMode ? (z) => actions.zoom(z - zoomLevel) : undefined
              }
              onPanChange={syncMode ? actions.setPan : undefined}
              isCompareMode={true}
            />
          );
        })}
      </div>
    );
  };

  if (!visible || items.length === 0) {
    return null;
  }

  const viewerContent = (
    <div
      ref={containerRef}
      className={`unified-viewer ${className} ${
        isFullscreen ? 'unified-viewer--fullscreen' : ''
      }`}
      onClick={handleBackdropClick}
    >
      <div className="unified-viewer__container">
        {/* 工具栏 */}
        <ViewerToolbar
          mode={mode}
          currentIndex={currentIndex}
          totalCount={items.length}
          slotCount={slotCount}
          compareLayout={compareLayout}
          syncMode={syncMode}
          onModeChange={actions.setMode}
          onSlotCountChange={handleSlotCountChange}
          onLayoutChange={actions.setCompareLayout}
          onSyncToggle={actions.toggleSyncMode}
          onResetView={actions.resetView}
          onClose={onClose}
          onFullscreen={handleFullscreen}
        />

        {/* 主内容区 */}
        <div className="unified-viewer__content">
          {mode === 'single' ? renderSingleMode() : renderCompareMode()}
        </div>

        {/* 缩略图队列 */}
        {showThumbnails && items.length > 1 && (
          <ThumbnailQueue
            items={items}
            mode={mode}
            currentIndex={currentIndex}
            compareIndices={compareIndices}
            onThumbnailClick={handleThumbnailClick}
          />
        )}
      </div>
    </div>
  );

  // 使用 Portal 渲染到 body
  return createPortal(viewerContent, document.body);
};

export default UnifiedMediaViewer;
