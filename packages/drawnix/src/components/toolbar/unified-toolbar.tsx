import React, { useState, useCallback, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { ATTACHED_ELEMENT_CLASS_NAME } from '@plait/core';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { AppToolbar } from './app-toolbar/app-toolbar';
import { CreationToolbar } from './creation-toolbar';
import { UnifiedToolbarProps } from './toolbar.types';
import { Island } from '../island';
import { BottomActionsSection } from './bottom-actions-section';
import { TaskQueuePanel } from '../task-queue/TaskQueuePanel';
import { useViewportScale } from '../../hooks/useViewportScale';
import { useDeviceType } from '../../hooks/useDeviceType';
import { AIImageIcon, AIVideoIcon } from '../icons';
import { DialogType, useDrawnix } from '../../hooks/use-drawnix';

// 工具栏高度阈值: 当容器高度小于此值时切换到图标模式
// 基于四个分区的最小高度 + 分割线 + padding 计算得出
const TOOLBAR_MIN_HEIGHT = 460;

// AI 按钮 ID，用于初始化时滚动到可见位置
const AI_BUTTON_IDS = ['ai-image', 'ai-video'];

/**
 * UnifiedToolbar - 统一左侧工具栏容器
 *
 * 将 AppToolbar 和 CreationToolbar 整合到一个固定在页面左侧的垂直容器中,
 * 工具栏分区之间使用1px水平分割线分隔。
 *
 * 支持响应式图标模式: 当浏览器窗口高度不足时,自动隐藏文本标签,仅显示图标。
 *
 * 仅在桌面端显示,移动端保持原有独立工具栏布局。
 */
export const UnifiedToolbar: React.FC<UnifiedToolbarProps> = React.memo(({
  className,
  projectDrawerOpen = false,
  onProjectDrawerToggle,
  toolboxDrawerOpen = false,
  onToolboxDrawerToggle,
  taskPanelExpanded = false,
  onTaskPanelToggle,
  onOpenBackupRestore,
  onOpenCloudSync,
}) => {
  const [isIconMode, setIsIconMode] = useState(false);
  const [isMobileCollapsed, setIsMobileCollapsed] = useState(true); // 移动端默认收起
  const hasEverExpanded = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const hasScrolledToAI = useRef(false);
  
  // 检测设备类型
  const { isMobile: isSmallScreen, isTablet } = useDeviceType();
  const isMobileOrTablet = isSmallScreen || isTablet;

  // 使用 viewport scale hook 确保缩放时工具栏保持在视口左上角且大小不变
  useViewportScale(containerRef, {
    enablePositionTracking: true, // 启用位置跟随（适用于 absolute 定位）
    enableScaleCompensation: true, // 启用反向缩放保持大小不变
  });

  // 使用 useCallback 稳定回调函数引用,配合 React.memo 优化性能
  const handleResize = useCallback((entries: ResizeObserverEntry[]) => {
    if (entries[0]) {
      const height = entries[0].contentRect.height;
      // 当容器高度小于阈值时切换到图标模式
      setIsIconMode(height < TOOLBAR_MIN_HEIGHT);
    }
  }, []);

  // 监听容器高度变化,实现响应式图标模式切换
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [handleResize]);

  // 初始化时检测 AI 按钮是否可见，如果不可见则滚动到可见位置
  useEffect(() => {
    // 只执行一次，避免重复滚动
    if (hasScrolledToAI.current) return;

    const scrollable = scrollableRef.current;
    if (!scrollable) return;

    // 使用 requestAnimationFrame 确保 DOM 已渲染完成
    const checkAndScroll = () => {
      // 标记为已执行，避免重复
      hasScrolledToAI.current = true;

      // 查找第一个 AI 按钮
      let targetButton: HTMLElement | null = null;
      for (const buttonId of AI_BUTTON_IDS) {
        const button = scrollable.querySelector<HTMLElement>(`[data-button-id="${buttonId}"]`);
        if (button) {
          targetButton = button;
          break;
        }
      }

      if (!targetButton) return;

      // 检查按钮是否在可滚动区域内可见
      const scrollableRect = scrollable.getBoundingClientRect();
      const buttonRect = targetButton.getBoundingClientRect();

      // 如果按钮底部超出可滚动区域底部，需要滚动
      const isButtonVisible = buttonRect.bottom <= scrollableRect.bottom && buttonRect.top >= scrollableRect.top;

      if (!isButtonVisible && scrollableRect.height > 0) {
        // 计算需要滚动的距离，使按钮显示在可滚动区域内
        // 滚动到按钮顶部对齐可滚动区域顶部的位置
        const scrollOffset = buttonRect.top - scrollableRect.top;
        scrollable.scrollTop += scrollOffset;
      }
    };

    // 延迟执行，确保按钮已渲染
    const timeoutId = setTimeout(() => {
      requestAnimationFrame(checkAndScroll);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, []);

  // 任务面板切换处理
  const handleTaskPanelToggle = useCallback(() => {
    if (!taskPanelExpanded && !hasEverExpanded.current) {
      hasEverExpanded.current = true;
    }
    onTaskPanelToggle?.();
  }, [taskPanelExpanded, onTaskPanelToggle]);

  // 关闭任务面板（仅在打开时才关闭）
  const handleTaskPanelClose = useCallback(() => {
    if (taskPanelExpanded) {
      onTaskPanelToggle?.();
    }
  }, [taskPanelExpanded, onTaskPanelToggle]);

  // 移动端工具栏切换
  const handleMobileToggle = useCallback(() => {
    setIsMobileCollapsed(prev => !prev);
  }, []);

  // 获取对话框控制
  const { openDialog } = useDrawnix();

  // AI 按钮点击处理
  const handleAIImageClick = useCallback(() => {
    openDialog(DialogType.aiImageGeneration);
  }, [openDialog]);

  const handleAIVideoClick = useCallback(() => {
    openDialog(DialogType.aiVideoGeneration);
  }, [openDialog]);

  return (
    <>
      {/* 任务队列面板 - 只在首次展开后才渲染 */}
      {hasEverExpanded.current && (
        <TaskQueuePanel expanded={taskPanelExpanded} onClose={handleTaskPanelClose} />
      )}

      <Island
        ref={containerRef}
        className={classNames(
          'unified-toolbar',
          ATTACHED_ELEMENT_CLASS_NAME,
          {
            'unified-toolbar--icon-only': isIconMode || isMobileOrTablet,
            'unified-toolbar--mobile-collapsed': isMobileOrTablet && isMobileCollapsed,
          },
          className
        )}
        padding={0}
        data-testid="unified-toolbar"
      >
        {/* 移动端收起状态的快捷按钮区域 */}
        {isMobileOrTablet && isMobileCollapsed && (
          <div className="unified-toolbar__collapsed-shortcuts">
            {/* 展开按钮 */}
            <button
              className="unified-toolbar__collapsed-btn unified-toolbar__collapsed-btn--toggle"
              onClick={handleMobileToggle}
              aria-label="展开工具栏"
            >
              <ChevronUp size={18} />
            </button>
            {/* AI 图片生成 */}
            <button
              className="unified-toolbar__collapsed-btn"
              onClick={handleAIImageClick}
              aria-label="AI 图片生成"
            >
              <AIImageIcon />
            </button>
            {/* AI 视频生成 */}
            <button
              className="unified-toolbar__collapsed-btn"
              onClick={handleAIVideoClick}
              aria-label="AI 视频生成"
            >
              <AIVideoIcon />
            </button>
          </div>
        )}

        {/* 移动端展开状态的收起按钮 */}
        {isMobileOrTablet && !isMobileCollapsed && (
          <button
            className="unified-toolbar__mobile-toggle unified-toolbar__mobile-toggle--expanded"
            onClick={handleMobileToggle}
            aria-label="收起工具栏"
          >
            <ChevronDown size={18} />
          </button>
        )}

        {/* 顶部固定区域 - 应用工具分区（菜单、撤销、重做） */}
        <div className="unified-toolbar__section unified-toolbar__section--fixed-top">
          <AppToolbar embedded={true} iconMode={isIconMode || isMobileOrTablet} onOpenBackupRestore={onOpenBackupRestore} onOpenCloudSync={onOpenCloudSync} />
        </div>

        {/* 可滚动的工具栏内容区 */}
        <div ref={scrollableRef} className="unified-toolbar__scrollable">
          {/* 创作工具分区 - 手型、选择、思维导图、文本、画笔、箭头、形状、图片、AI工具、缩放 */}
          <div className="unified-toolbar__section">
            <CreationToolbar embedded={true} iconMode={isIconMode || isMobileOrTablet} />
          </div>
        </div>

        {/* 底部操作区域 - 打开项目 + 工具箱 + 任务队列 - 固定在底部 */}
        <div className="unified-toolbar__section unified-toolbar__section--fixed-bottom">
          <BottomActionsSection
            projectDrawerOpen={projectDrawerOpen}
            onProjectDrawerToggle={onProjectDrawerToggle || (() => {})}
            toolboxDrawerOpen={toolboxDrawerOpen}
            onToolboxDrawerToggle={onToolboxDrawerToggle}
            taskPanelExpanded={taskPanelExpanded}
            onTaskPanelToggle={handleTaskPanelToggle}
          />
        </div>
      </Island>
    </>
  );
});
