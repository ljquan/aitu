/**
 * 统一媒体预览系统 - 主组件
 * 支持单图预览、对比预览和编辑模式，可相互切换
 */

import React, { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { UnifiedMediaViewerProps, CompareLayout, ViewerMode, MediaItem } from './types';
import { useViewerState } from './useViewerState';
import { MediaViewport } from './MediaViewport';
import { ThumbnailQueue } from './ThumbnailQueue';
import { ViewerToolbar } from './ViewerToolbar';
import { ImageEditorContent, ImageEditorContentRef, ImageEditState } from './ImageEditorContent';
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
  useBuiltInEditor = false,
  onEditOverwrite,
  onEditInsert,
  showEditOverwrite = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ImageEditorContentRef>(null);
  const [slotCount, setSlotCount] = useState<2 | 3 | 4>(2);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 保存进入编辑模式前的项目信息，用于编辑回调
  const [editingItem, setEditingItem] = useState<MediaItem | null>(null);
  // 使用 ref 跟踪 editingItem 的最新值，避免闭包捕获旧值的问题
  const editingItemRef = useRef<MediaItem | null>(null);
  // 存储每个图片的编辑状态（按图片URL索引）
  const editStatesRef = useRef<Map<string, ImageEditState>>(new Map());

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

  // 同时更新 state 和 ref 的包装函数
  const updateEditingItem = useCallback((item: MediaItem | null) => {
    editingItemRef.current = item;
    setEditingItem(item);
  }, []);

  // 当预览器关闭时清空编辑状态记录
  useEffect(() => {
    if (!visible) {
      editStatesRef.current.clear();
      updateEditingItem(null);
    }
  }, [visible, updateEditingItem]);

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

  // 切换到指定索引的图片（编辑模式）
  const switchToEditImage = useCallback(
    (index: number) => {
      // 检查目标是否为图片
      const targetItem = items[index];
      if (!targetItem || targetItem.type !== 'image') {
        return false;
      }
      
      // 保存当前图片的编辑状态（使用 ref 获取最新值）
      const currentEditingItem = editingItemRef.current;
      if (currentEditingItem && editorRef.current) {
        const currentState = editorRef.current.getState();
        editStatesRef.current.set(currentEditingItem.url, currentState);
      }
      
      // 切换图片
      actions.goTo(index);
      updateEditingItem(targetItem);
      
      // 恢复目标图片的编辑状态（如果有）
      // 使用 setTimeout 确保编辑器已经更新
      setTimeout(() => {
        const savedState = editStatesRef.current.get(targetItem.url);
        if (savedState && editorRef.current) {
          editorRef.current.setState(savedState);
        }
      }, 50);
      
      return true;
    },
    [items, actions, updateEditingItem]
  );

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
          if (mode === 'edit') {
            // 编辑模式：切换到上一张图片
            const prevIndex = (currentIndex - 1 + items.length) % items.length;
            switchToEditImage(prevIndex);
          } else if (mode === 'single') {
            actions.goToPrev();
          } else {
            // 对比模式：切换到上一组
            goToPrevGroup();
          }
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          if (mode === 'edit') {
            // 编辑模式：切换到下一张图片
            const nextIndex = (currentIndex + 1) % items.length;
            switchToEditImage(nextIndex);
          } else if (mode === 'single') {
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
  }, [visible, mode, items.length, items, currentIndex, actions, onClose, slotCount, goToNextGroup, goToPrevGroup, switchToEditImage]);

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
      if (mode === 'edit') {
        // 编辑模式：切换被编辑的图片
        switchToEditImage(index);
      } else if (mode === 'single') {
        actions.goTo(index);
      } else {
        // 对比模式：添加到当前焦点槽位
        actions.addToCompare(index, focusedSlot);
      }
    },
    [mode, actions, focusedSlot, switchToEditImage]
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
    if (currentItem && currentItem.type === 'image') {
      if (useBuiltInEditor) {
        // 使用内置编辑器
        updateEditingItem(currentItem);
        actions.setMode('edit');
      } else if (onEdit) {
        // 使用外部编辑器
        onEdit(currentItem);
      }
    }
  }, [items, currentIndex, onEdit, useBuiltInEditor, actions, updateEditingItem]);

  // 处理模式变化（包装 actions.setMode，确保进入编辑模式时设置 editingItem）
  const handleModeChange = useCallback((newMode: ViewerMode) => {
    if (newMode === 'edit') {
      // 进入编辑模式时，设置 editingItem
      const currentItem = items[currentIndex];
      if (currentItem && currentItem.type === 'image') {
        updateEditingItem(currentItem);
      }
    }
    actions.setMode(newMode);
  }, [items, currentIndex, actions, updateEditingItem]);

  // 返回预览模式
  const handleBackToPreview = useCallback(() => {
    // 清空所有图片的编辑状态记录
    editStatesRef.current.clear();
    updateEditingItem(null);
    actions.setMode('single');
  }, [actions, updateEditingItem]);

  // 重置编辑
  const handleResetEdit = useCallback(() => {
    editorRef.current?.reset();
  }, []);

  // 保存编辑
  const handleSaveEdit = useCallback(() => {
    editorRef.current?.save();
  }, []);

  // 编辑覆盖回调
  const handleEditorOverwrite = useCallback((editedImageUrl: string) => {
    // 使用 ref 获取最新的 editingItem，避免闭包捕获旧值
    const currentEditingItem = editingItemRef.current;
    if (onEditOverwrite && currentEditingItem) {
      onEditOverwrite(editedImageUrl, currentEditingItem);
    }
    handleBackToPreview();
  }, [onEditOverwrite, handleBackToPreview]);

  // 编辑插入回调
  const handleEditorInsert = useCallback((editedImageUrl: string) => {
    if (onEditInsert) {
      onEditInsert(editedImageUrl);
    }
    handleBackToPreview();
  }, [onEditInsert, handleBackToPreview]);

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

  // 渲染编辑模式
  const renderEditMode = () => {
    const currentItem = editingItem || items[currentIndex];
    if (!currentItem || currentItem.type !== 'image') {
      return null;
    }

    return (
      <div className="unified-viewer__edit">
        <ImageEditorContent
          ref={editorRef}
          imageUrl={currentItem.url}
          showOverwrite={showEditOverwrite}
          onOverwrite={onEditOverwrite ? handleEditorOverwrite : undefined}
          onInsert={onEditInsert ? handleEditorInsert : undefined}
        />
      </div>
    );
  };

  // 获取当前项目
  const currentItem = items[currentIndex] || null;

  if (!visible || items.length === 0) {
    return null;
  }

  // 渲染主内容区
  const renderContent = () => {
    switch (mode) {
      case 'edit':
        return renderEditMode();
      case 'compare':
        return renderCompareMode();
      default:
        return renderSingleMode();
    }
  };

  const viewerContent = (
    <div
      ref={containerRef}
      className={`unified-viewer ${className} ${
        isFullscreen ? 'unified-viewer--fullscreen' : ''
      } ${mode === 'edit' ? 'unified-viewer--edit-mode' : ''}`}
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
          onModeChange={handleModeChange}
          onSlotCountChange={handleSlotCountChange}
          onLayoutChange={actions.setCompareLayout}
          onSyncToggle={actions.toggleSyncMode}
          onResetView={actions.resetView}
          onClose={onClose}
          onFullscreen={handleFullscreen}
          isImage={currentItem?.type === 'image'}
          showEditButton={useBuiltInEditor || !!onEdit}
          onBackToPreview={handleBackToPreview}
          onResetEdit={handleResetEdit}
          onSaveEdit={handleSaveEdit}
        />

        {/* 主内容区 */}
        <div className="unified-viewer__content">
          {renderContent()}
        </div>

        {/* 缩略图队列 */}
        {showThumbnails && items.length > 1 && (
          <ThumbnailQueue
            items={items}
            mode={mode === 'edit' ? 'single' : mode}
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
