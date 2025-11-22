/**
 * TaskSummary Component
 * 
 * Displays a summary of task queue status with counts for active, completed,
 * and failed tasks.
 */

import React from 'react';
import { Badge } from 'tdesign-react';
import './task-queue.scss';

export interface TaskSummaryProps {
  /** Number of active tasks (pending/processing/retrying) */
  activeCount: number;
  /** Number of completed tasks */
  completedCount: number;
  /** Number of failed tasks */
  failedCount: number;
  /** Click handler for summary */
  onClick?: () => void;
}

/**
 * TaskSummary component displays task queue statistics
 * 
 * @example
 * <TaskSummary
 *   activeCount={3}
 *   completedCount={12}
 *   failedCount={1}
 *   onClick={() => console.log('Summary clicked')}
 * />
 */
export const TaskSummary: React.FC<TaskSummaryProps> = ({
  activeCount,
  completedCount,
  failedCount,
  onClick,
}) => {
  return (
    <div className="task-summary" onClick={onClick}>
      {activeCount > 0 && (
        <div className="task-summary__item task-summary__item--active">
          <span className="task-summary__label">活动:</span>
          <Badge count={activeCount} size="medium" />
        </div>
      )}
      
      {completedCount > 0 && (
        <div className="task-summary__item task-summary__item--completed">
          <span className="task-summary__label">已完成:</span>
          <span className="task-summary__count">{completedCount}</span>
        </div>
      )}
      
      {failedCount > 0 && (
        <div className="task-summary__item task-summary__item--failed">
          <span className="task-summary__label">失败:</span>
          <Badge count={failedCount} size="medium" color="error" />
        </div>
      )}
      
      {activeCount === 0 && completedCount === 0 && failedCount === 0 && (
        <div className="task-summary__item">
          <span className="task-summary__label">无任务</span>
        </div>
      )}
    </div>
  );
};
