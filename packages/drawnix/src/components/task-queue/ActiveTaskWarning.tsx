/**
 * ActiveTaskWarning Component
 *
 * Shows a centered top banner when tasks are in progress.
 * Features expand/collapse animation when tasks start/complete.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { useI18n } from '../../i18n';
import './active-task-warning.scss';

export const ActiveTaskWarning: React.FC = () => {
  const { activeTasks } = useTaskQueue();
  const { language } = useI18n();
  const [isVisible, setIsVisible] = useState(false);
  const [isCollapsing, setIsCollapsing] = useState(false);
  const prevActiveCountRef = useRef(0);

  useEffect(() => {
    const prevCount = prevActiveCountRef.current;
    const currentCount = activeTasks.length;

    if (currentCount > 0 && prevCount === 0) {
      // Tasks started - show with expand animation
      setIsCollapsing(false);
      setIsVisible(true);
    } else if (currentCount === 0 && prevCount > 0) {
      // All tasks completed - collapse animation then hide
      setIsCollapsing(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsCollapsing(false);
      }, 400); // Match animation duration
      return () => clearTimeout(timer);
    }

    prevActiveCountRef.current = currentCount;
  }, [activeTasks.length]);

  // Don't render if not visible
  if (!isVisible && activeTasks.length === 0) {
    return null;
  }

  const message = language === 'zh'
    ? `${activeTasks.length} 个任务生成中`
    : `${activeTasks.length} task${activeTasks.length > 1 ? 's' : ''} generating`;

  const hint = language === 'zh' ? '刷新可能中断' : 'Refresh may interrupt';

  return (
    <div className={`active-task-warning ${isCollapsing ? 'active-task-warning--collapsing' : ''}`}>
      <span className="active-task-warning__message">{message}</span>
      <span className="active-task-warning__divider">·</span>
      <span className="active-task-warning__hint">{hint}</span>
    </div>
  );
};
