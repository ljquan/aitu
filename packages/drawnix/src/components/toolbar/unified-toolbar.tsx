import React, { useState, useCallback, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { ATTACHED_ELEMENT_CLASS_NAME } from '@plait/core';
import { AppToolbar } from './app-toolbar/app-toolbar';
import { CreationToolbar } from './creation-toolbar';
import { ZoomToolbar } from './zoom-toolbar';
import { ThemeToolbar } from './theme-toolbar';
import { UnifiedToolbarProps } from './toolbar.types';
import { Island } from '../island';
import { FeedbackButton } from '../feedback-button';
import { TaskToolbarButton } from '../task-queue/TaskToolbarButton';

// 工具栏高度阈值: 当容器高度小于此值时切换到图标模式
// 基于四个分区的最小高度 + 分割线 + padding 计算得出
const TOOLBAR_MIN_HEIGHT = 460;

/**
 * UnifiedToolbar - 统一左侧工具栏容器
 *
 * 将四个独立的工具栏(AppToolbar, CreationToolbar, ZoomToolbar, ThemeToolbar)
 * 整合到一个固定在页面左侧的垂直容器中,工具栏分区之间使用1px水平分割线分隔。
 *
 * 支持响应式图标模式: 当浏览器窗口高度不足时,自动隐藏文本标签,仅显示图标。
 *
 * 仅在桌面端显示,移动端保持原有独立工具栏布局。
 */
export const UnifiedToolbar: React.FC<UnifiedToolbarProps> = React.memo(({
  className
}) => {
  const [isIconMode, setIsIconMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
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
      {/* 可滚动的工具栏内容区 */}
      <div className="unified-toolbar__scrollable">
        {/* 应用工具分区 - 菜单、撤销、重做、复制、删除 */}
        <div className="unified-toolbar__section">
          <AppToolbar embedded={true} iconMode={isIconMode} />
        </div>

        {/* 创作工具分区 - 手型、选择、思维导图、文本、画笔、箭头、形状、图片、AI工具 */}
        <div className="unified-toolbar__section">
          <CreationToolbar embedded={true} iconMode={isIconMode} />
        </div>

        {/* 缩放工具分区 - 缩小、缩放百分比、放大 */}
        <div className="unified-toolbar__section">
          <ZoomToolbar embedded={true} iconMode={isIconMode} />
        </div>

        {/* 主题选择分区 - 主题下拉选择器 */}
        <div className="unified-toolbar__section">
          <ThemeToolbar embedded={true} iconMode={isIconMode} />
        </div>

        {/* 反馈按钮分区 */}
        <div className="unified-toolbar__section" style={{ display: 'flex', justifyContent: 'center' }}>
          <FeedbackButton />
        </div>
      </div>

      {/* 任务按钮分区 - 固定在底部 */}
      <div className="unified-toolbar__section unified-toolbar__section--fixed-bottom">
        <TaskToolbarButton iconMode={isIconMode} />
      </div>
    </Island>
  );
});
