/**
 * 统一媒体预览系统 - 工具栏组件
 */

import React, { useCallback } from 'react';
import {
  X,
  Columns,
  Rows,
  Grid2x2,
  Link,
  Unlink,
  RotateCcw,
  Maximize2,
  ChevronLeft,
} from 'lucide-react';
import { Tooltip } from 'tdesign-react';
import type { ViewerToolbarProps, ViewerMode, CompareLayout } from './types';
import './ViewerToolbar.scss';

// Tooltip z-index 需要高于 unified-viewer 的 10000
const TOOLTIP_Z_INDEX = 10010;

export const ViewerToolbar: React.FC<ViewerToolbarProps> = ({
  mode,
  currentIndex,
  totalCount,
  slotCount,
  compareLayout,
  syncMode,
  onModeChange,
  onSlotCountChange,
  onLayoutChange,
  onSyncToggle,
  onResetView,
  onClose,
  onFullscreen,
}) => {
  // 处理布局切换，田字格自动切换到4分屏
  const handleLayoutChange = useCallback(
    (layout: CompareLayout) => {
      onLayoutChange(layout);
      // 选择田字格布局时，自动切换到4分屏
      if (layout === 'grid' && slotCount < 4) {
        onSlotCountChange(4);
      }
    },
    [onLayoutChange, onSlotCountChange, slotCount]
  );

  // 单图模式工具栏
  const renderSingleModeTools = () => (
    <>
      {/* 索引指示器 */}
      <div className="viewer-toolbar__indicator">
        <span className="viewer-toolbar__current">{currentIndex + 1}</span>
        <span className="viewer-toolbar__separator">/</span>
        <span className="viewer-toolbar__total">{totalCount}</span>
      </div>

      {/* 切换到对比模式 */}
      {totalCount > 1 && (
        <Tooltip
          content="对比模式"
          theme="light"
          placement="bottom"
          zIndex={TOOLTIP_Z_INDEX}
        >
          <button
            className="viewer-toolbar__btn"
            onClick={() => onModeChange('compare')}
          >
            <Columns size={18} />
          </button>
        </Tooltip>
      )}
    </>
  );

  // 对比模式工具栏
  const renderCompareModeTools = () => (
    <>
      {/* 切换到单图模式 */}
      <Tooltip
        content="单图模式"
        theme="light"
        placement="bottom"
        zIndex={TOOLTIP_Z_INDEX}
      >
        <button
          className="viewer-toolbar__btn"
          onClick={() => onModeChange('single')}
        >
          <ChevronLeft size={18} />
          <span className="viewer-toolbar__btn-text">单图</span>
        </button>
      </Tooltip>

      <div className="viewer-toolbar__divider" />

      {/* 分屏数量 */}
      <div className="viewer-toolbar__group">
        <span className="viewer-toolbar__label">分屏</span>
        {[2, 3, 4].map((count) => (
          <Tooltip
            key={count}
            content={`${count}分屏`}
            theme="light"
            placement="bottom"
            zIndex={TOOLTIP_Z_INDEX}
          >
            <button
              className={`viewer-toolbar__btn viewer-toolbar__btn--small ${
                slotCount === count ? 'viewer-toolbar__btn--active' : ''
              }`}
              onClick={() => onSlotCountChange(count as 2 | 3 | 4)}
            >
              {count}
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="viewer-toolbar__divider" />

      {/* 布局切换 */}
      <div className="viewer-toolbar__group">
        <Tooltip
          content="水平布局"
          theme="light"
          placement="bottom"
          zIndex={TOOLTIP_Z_INDEX}
        >
          <button
            className={`viewer-toolbar__btn ${
              compareLayout === 'horizontal' ? 'viewer-toolbar__btn--active' : ''
            }`}
            onClick={() => handleLayoutChange('horizontal')}
          >
            <Columns size={18} />
          </button>
        </Tooltip>
        <Tooltip
          content="垂直布局"
          theme="light"
          placement="bottom"
          zIndex={TOOLTIP_Z_INDEX}
        >
          <button
            className={`viewer-toolbar__btn ${
              compareLayout === 'vertical' ? 'viewer-toolbar__btn--active' : ''
            }`}
            onClick={() => handleLayoutChange('vertical')}
          >
            <Rows size={18} />
          </button>
        </Tooltip>
        <Tooltip
          content="网格布局"
          theme="light"
          placement="bottom"
          zIndex={TOOLTIP_Z_INDEX}
        >
          <button
            className={`viewer-toolbar__btn ${
              compareLayout === 'grid' ? 'viewer-toolbar__btn--active' : ''
            }`}
            onClick={() => handleLayoutChange('grid')}
          >
            <Grid2x2 size={18} />
          </button>
        </Tooltip>
      </div>

      <div className="viewer-toolbar__divider" />

      {/* 同步模式 */}
      <Tooltip
        content={syncMode ? '取消联动（快捷键 S）' : '联动缩放/拖拽（快捷键 S）'}
        theme="light"
        placement="bottom"
        zIndex={TOOLTIP_Z_INDEX}
      >
        <button
          className={`viewer-toolbar__btn ${
            syncMode ? 'viewer-toolbar__btn--active' : ''
          }`}
          onClick={onSyncToggle}
        >
          {syncMode ? <Link size={18} /> : <Unlink size={18} />}
        </button>
      </Tooltip>

      {/* 重置视图 - 仅在联动模式下显示 */}
      {syncMode && (
        <Tooltip
          content="重置视图"
          theme="light"
          placement="bottom"
          zIndex={TOOLTIP_Z_INDEX}
        >
          <button className="viewer-toolbar__btn" onClick={onResetView}>
            <RotateCcw size={18} />
          </button>
        </Tooltip>
      )}
    </>
  );

  return (
    <div className="viewer-toolbar">
      <div className="viewer-toolbar__left">
        {mode === 'single' ? renderSingleModeTools() : renderCompareModeTools()}
      </div>

      <div className="viewer-toolbar__right">
        {/* 全屏 */}
        {onFullscreen && (
          <Tooltip
            content="全屏"
            theme="light"
            placement="bottom"
            zIndex={TOOLTIP_Z_INDEX}
          >
            <button className="viewer-toolbar__btn" onClick={onFullscreen}>
              <Maximize2 size={18} />
            </button>
          </Tooltip>
        )}

        {/* 关闭 */}
        <Tooltip
          content="关闭（Esc）"
          theme="light"
          placement="bottom"
          zIndex={TOOLTIP_Z_INDEX}
        >
          <button
            className="viewer-toolbar__btn viewer-toolbar__btn--close"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};

export default ViewerToolbar;
