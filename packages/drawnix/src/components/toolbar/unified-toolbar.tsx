import React, { useState, useCallback, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { ATTACHED_ELEMENT_CLASS_NAME } from '@plait/core';
import { AppToolbar } from './app-toolbar/app-toolbar';
import { CreationToolbar } from './creation-toolbar';
import { UnifiedToolbarProps } from './toolbar.types';
import { Island } from '../island';
import { BottomActionsSection } from './bottom-actions-section';
import { TaskQueuePanel } from '../task-queue/TaskQueuePanel';
import { useViewportScale } from '../../hooks/useViewportScale';

// 工具栏高度阈值: 当容器高度小于此值时切换到图标模式
// 基于四个分区的最小高度 + 分割线 + padding 计算得出
const TOOLBAR_MIN_HEIGHT = 460;

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
  onTaskPanelToggle
}) => {
  const [isIconMode, setIsIconMode] = useState(false);
  const hasEverExpanded = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
            'unified-toolbar--icon-only': isIconMode,
          },
          className
        )}
        padding={1}
      >
        {/* 顶部固定区域 - 应用工具分区（菜单、撤销、重做） */}
        <div className="unified-toolbar__section unified-toolbar__section--fixed-top">
          <AppToolbar embedded={true} iconMode={isIconMode} />
        </div>

        {/* 可滚动的工具栏内容区 */}
        <div className="unified-toolbar__scrollable">
          {/* 创作工具分区 - 手型、选择、思维导图、文本、画笔、箭头、形状、图片、AI工具、缩放 */}
          <div className="unified-toolbar__section">
            <CreationToolbar embedded={true} iconMode={isIconMode} />
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
