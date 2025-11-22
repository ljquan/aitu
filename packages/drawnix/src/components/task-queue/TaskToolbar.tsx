/**
 * TaskToolbar Component
 * 
 * Circular floating button that displays task count badge
 * and provides expand/collapse functionality for the task queue panel.
 */

import React, { useState } from 'react';
import { ViewListIcon } from 'tdesign-icons-react';
import { Badge, Tooltip } from 'tdesign-react';
import { TaskQueuePanel } from './TaskQueuePanel';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import './task-queue.scss';

export interface TaskToolbarProps {
  /** Callback when panel expand state changes */
  onExpandChange?: (expanded: boolean) => void;
}

/**
 * TaskToolbar component - Circular floating button for task queue
 * 
 * @example
 * <TaskToolbar onExpandChange={(expanded) => console.log(expanded)} />
 */
export const TaskToolbar: React.FC<TaskToolbarProps> = ({ onExpandChange }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { activeTasks, completedTasks, failedTasks } = useTaskQueue();

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
    ? `任务队列 (活动: ${activeTasks.length}, 已完成: ${completedTasks.length}, 失败: ${failedTasks.length})`
    : '任务队列 (暂无任务)';

  return (
    <>
      {/* Task Queue Panel */}
      <TaskQueuePanel expanded={isExpanded} onClose={handleClose} />

      {/* Circular Floating Button */}
      <Tooltip content={tooltipContent} placement="right">
        <div 
          className={`task-toolbar-fab ${isExpanded ? 'task-toolbar-fab--expanded' : ''}`}
          onClick={handleToggle}
        >
          <Badge count={activeTasks.length > 0 ? activeTasks.length : 0} showZero={false}>
            <div className="task-toolbar-fab__icon">
              <ViewListIcon size="24px" />
            </div>
          </Badge>
          
          {/* Status indicator dot */}
          {activeTasks.length > 0 && (
            <div className="task-toolbar-fab__status task-toolbar-fab__status--active" />
          )}
          {failedTasks.length > 0 && activeTasks.length === 0 && (
            <div className="task-toolbar-fab__status task-toolbar-fab__status--failed" />
          )}
        </div>
      </Tooltip>
    </>
  );
};
