/**
 * ViewNavigation Component
 *
 * 视图导航组件 - 整合缩放按钮和小地图
 * 放置在画布右上角，与 ChatDrawer 联动
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { PlaitBoard, BoardTransforms } from '@plait/core';
import { MinusIcon, AddIcon, ChevronDownIcon } from 'tdesign-icons-react';
import { useBoard } from '@plait-board/react-board';
import { Minimap } from '../minimap/Minimap';
import { useChatDrawerControl } from '../../contexts/ChatDrawerContext';
import { Popover, PopoverContent, PopoverTrigger } from '../popover/popover';
import { Z_INDEX } from '../../constants/z-index';
import { useI18n } from '../../i18n';
import './view-navigation.scss';

export interface ViewNavigationProps {
  /** 是否显示 minimap */
  showMinimap?: boolean;
  /** 容器元素 */
  container?: HTMLElement | null;
}

// 边距
const EDGE_MARGIN = 10;
// 自动隐藏延迟（毫秒）
const AUTO_HIDE_DELAY = 3000;

export const ViewNavigation: React.FC<ViewNavigationProps> = ({
  showMinimap = true,
  container,
}) => {
  const board = useBoard() as PlaitBoard;
  const { t } = useI18n();
  const { isDrawerOpen, drawerWidth } = useChatDrawerControl();
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  // 首次进入页面时默认展示 minimap
  const [minimapExpanded, setMinimapExpanded] = useState(true);
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 用于检测 viewport 变化
  const lastViewportRef = useRef({
    zoom: board?.viewport?.zoom || 1,
    offsetX: board?.viewport?.offsetX || 0,
    offsetY: board?.viewport?.offsetY || 0,
  });
  const initializedRef = useRef(false);
  const autoHideTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 计算右侧偏移量
  const rightOffset = useMemo(() => {
    if (isDrawerOpen) {
      return drawerWidth + EDGE_MARGIN;
    }
    return EDGE_MARGIN;
  }, [isDrawerOpen, drawerWidth]);

  // 缩放操作
  const handleZoomOut = useCallback(() => {
    BoardTransforms.updateZoom(board, board.viewport.zoom - 0.1);
  }, [board]);

  const handleZoomIn = useCallback(() => {
    BoardTransforms.updateZoom(board, board.viewport.zoom + 0.1);
  }, [board]);

  const handleFitViewport = useCallback(() => {
    BoardTransforms.fitViewport(board);
    setZoomMenuOpen(false);
  }, [board]);

  const handleZoom100 = useCallback(() => {
    BoardTransforms.updateZoom(board, 1);
    setZoomMenuOpen(false);
  }, [board]);

  // 手动切换 minimap 展开状态
  const toggleMinimap = useCallback(() => {
    setMinimapExpanded((prev) => {
      const newValue = !prev;
      setManuallyExpanded(newValue); // 标记为手动操作
      return newValue;
    });
  }, []);

  // 点击画布时收起 minimap
  useEffect(() => {
    if (!minimapExpanded || !board) return;

    const boardContainer = PlaitBoard.getBoardContainer(board);
    if (!boardContainer) return;

    const handleCanvasClick = (e: MouseEvent) => {
      // 检查点击是否在 view-navigation 内部
      const target = e.target as HTMLElement;
      if (containerRef.current?.contains(target)) {
        return; // 点击在导航组件内部，不处理
      }
      
      // 点击画布，收起 minimap
      setMinimapExpanded(false);
      setManuallyExpanded(false);
    };

    boardContainer.addEventListener('mousedown', handleCanvasClick);
    
    return () => {
      boardContainer.removeEventListener('mousedown', handleCanvasClick);
    };
  }, [minimapExpanded, board]);

  // 自动展开 minimap（检测 viewport 变化）
  useEffect(() => {
    if (!showMinimap || !board) return;

    const checkInterval = setInterval(() => {
      const current = board.viewport;
      const last = lastViewportRef.current;

      const hasZoomChanged = Math.abs(current.zoom - last.zoom) > 0.001;
      const hasOffsetChanged =
        Math.abs(current.offsetX - last.offsetX) > 0.5 ||
        Math.abs(current.offsetY - last.offsetY) > 0.5;

      const hasInteraction = hasZoomChanged || hasOffsetChanged;

      if (hasInteraction) {
        // 更新记录
        lastViewportRef.current = {
          zoom: current.zoom,
          offsetX: current.offsetX,
          offsetY: current.offsetY,
        };

        // 跳过初始化阶段的 viewport 变化
        if (!initializedRef.current) {
          initializedRef.current = true;
          return;
        }

        // 有交互时自动展开小地图
        if (!minimapExpanded) {
          setMinimapExpanded(true);
          setManuallyExpanded(false); // 标记为自动触发
        }

        // 清除之前的自动隐藏定时器
        if (autoHideTimerRef.current) {
          clearTimeout(autoHideTimerRef.current);
        }
      }
    }, 100);

    return () => {
      clearInterval(checkInterval);
    };
  }, [showMinimap, board, minimapExpanded]);

  // 自动隐藏 minimap（非手动展开时）
  useEffect(() => {
    if (!minimapExpanded || manuallyExpanded) return;

    // 设置自动隐藏定时器
    autoHideTimerRef.current = setTimeout(() => {
      setMinimapExpanded(false);
    }, AUTO_HIDE_DELAY);

    return () => {
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
      }
    };
  }, [minimapExpanded, manuallyExpanded]);

  // 处理百分比按钮点击
  const handleZoomPercentClick = useCallback(() => {
    setZoomMenuOpen((prev) => !prev);
  }, []);

  // 当前缩放百分比
  const zoomPercentage = Math.round((board?.viewport?.zoom || 1) * 100);

  return (
    <div
      className="view-navigation"
      style={{
        right: rightOffset,
        zIndex: Z_INDEX.VIEW_NAVIGATION,
      }}
      ref={containerRef}
    >
      {/* 缩放控制区域 */}
      <div className="view-navigation__zoom">
        <button
          className="view-navigation__zoom-btn"
          onClick={handleZoomOut}
          title={t('zoom.out')}
          aria-label={t('zoom.out')}
          data-track="view_nav_zoom_out"
        >
          <MinusIcon />
        </button>

        <Popover
          sideOffset={8}
          open={zoomMenuOpen}
          onOpenChange={setZoomMenuOpen}
          placement="bottom"
        >
          <PopoverTrigger asChild>
            <button
              className="view-navigation__zoom-percent"
              onClick={handleZoomPercentClick}
              title={t('zoom.fit')}
              aria-label={t('zoom.fit')}
              data-track="view_nav_zoom_menu"
            >
              {zoomPercentage}%
            </button>
          </PopoverTrigger>
          <PopoverContent container={container} style={{ zIndex: Z_INDEX.POPOVER }}>
            <div className="view-navigation-zoom-menu">
              <button
                className="zoom-menu-item"
                onClick={handleFitViewport}
                data-track="view_nav_zoom_fit"
              >
                <span className="zoom-menu-item__label">{t('zoom.fit')}</span>
                <span className="zoom-menu-item__shortcut">⌘⇧=</span>
              </button>
              <button
                className="zoom-menu-item"
                onClick={handleZoom100}
                data-track="view_nav_zoom_100"
              >
                <span className="zoom-menu-item__label">{t('zoom.100')}</span>
                <span className="zoom-menu-item__shortcut">⌘0</span>
              </button>
            </div>
          </PopoverContent>
        </Popover>

        <button
          className="view-navigation__zoom-btn"
          onClick={handleZoomIn}
          title={t('zoom.in')}
          aria-label={t('zoom.in')}
          data-track="view_nav_zoom_in"
        >
          <AddIcon />
        </button>

        {/* Minimap 展开按钮 */}
        {showMinimap && (
          <button
            className={`view-navigation__minimap-toggle ${minimapExpanded ? 'view-navigation__minimap-toggle--expanded' : ''}`}
            onClick={toggleMinimap}
            title={minimapExpanded ? '折叠小地图' : '展开小地图'}
            aria-label={minimapExpanded ? '折叠小地图' : '展开小地图'}
            data-track="view_nav_minimap_toggle"
          >
            <ChevronDownIcon />
          </button>
        )}
      </div>

      {/* Minimap - 展开时显示 */}
      {showMinimap && minimapExpanded && (
        <div className="view-navigation__minimap">
          <Minimap
            board={board}
            displayMode="always"
            config={{
              width: 180,
              height: 120,
              position: 'top-right',
              margin: 0,
              collapsible: false,
              defaultExpanded: true,
            }}
          />
        </div>
      )}
    </div>
  );
};

export default ViewNavigation;
