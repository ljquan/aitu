/**
 * TaskToolbarButton Component
 *
 * Embedded version of task button for UnifiedToolbar
 * Displays task count badge and provides expand/collapse functionality
 */

import React, { useState } from 'react';
import { Badge, Tooltip } from 'tdesign-react';
import { TaskQueuePanel } from './TaskQueuePanel';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { useI18n } from '../../i18n';
import './task-queue.scss';

export interface TaskToolbarButtonProps {
  /** Whether in icon-only mode (for responsive layout) */
  iconMode?: boolean;
  /** Callback when panel expand state changes */
  onExpandChange?: (expanded: boolean) => void;
}

/**
 * TaskToolbarButton component - Embedded button for task queue in UnifiedToolbar
 *
 * @example
 * <TaskToolbarButton iconMode={false} onExpandChange={(expanded) => console.log(expanded)} />
 */
export const TaskToolbarButton: React.FC<TaskToolbarButtonProps> = ({
  iconMode = false,
  onExpandChange
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { activeTasks, completedTasks, failedTasks } = useTaskQueue();
  const { t } = useI18n();

  const handleToggle = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    onExpandChange?.(newExpanded);
  };

  const handleClose = () => {
    setIsExpanded(false);
    onExpandChange?.(false);
  };

  // Prepare tooltip content
  const totalTasks = activeTasks.length + completedTasks.length + failedTasks.length;
  const tooltipContent = totalTasks > 0
    ? `任务队列 (生成中: ${activeTasks.length}, 已完成: ${completedTasks.length}, 失败: ${failedTasks.length})`
    : '任务队列 (暂无任务)';

  return (
    <>
      {/* Task Queue Panel */}
      <TaskQueuePanel expanded={isExpanded} onClose={handleClose} />

      {/* Embedded Task Button */}
      <Tooltip content={tooltipContent} placement="right" theme="light">
        <div
          className={`task-toolbar-button ${isExpanded ? 'task-toolbar-button--expanded' : ''} ${iconMode ? 'task-toolbar-button--icon-only' : ''}`}
          onClick={handleToggle}
        >
          <Badge count={activeTasks.length > 0 ? activeTasks.length : 0} showZero={false}>
            <div className="task-toolbar-button__content">
              <div className="task-toolbar-button__text">
                {t('toolbar.tasks')}
              </div>
            </div>
          </Badge>

          {/* Status indicator dot */}
          {activeTasks.length > 0 && (
            <div className="task-toolbar-button__status task-toolbar-button__status--active" />
          )}
          {failedTasks.length > 0 && activeTasks.length === 0 && (
            <div className="task-toolbar-button__status task-toolbar-button__status--failed" />
          )}
        </div>
      </Tooltip>
    </>
  );
};
