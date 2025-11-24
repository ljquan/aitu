/**
 * TaskItem Component
 *
 * Displays a single task with its details, status, and action buttons.
 * Shows input parameters (prompt) and output results when completed.
 */

import React from 'react';
import { Button, Tag, Tooltip } from 'tdesign-react';
import { ImageIcon, VideoIcon, DeleteIcon, RefreshIcon, CloseCircleIcon, DownloadIcon, EditIcon } from 'tdesign-icons-react';
import { Task, TaskStatus, TaskType } from '../../types/task.types';
import { getRelativeTime, formatTaskDuration } from '../../utils/task-utils';
import { formatRetryDelay } from '../../utils/retry-utils';
import './task-queue.scss';

export interface TaskItemProps {
  /** The task to display */
  task: Task;
  /** Callback when cancel button is clicked */
  onCancel?: (taskId: string) => void;
  /** Callback when retry button is clicked */
  onRetry?: (taskId: string) => void;
  /** Callback when delete button is clicked */
  onDelete?: (taskId: string) => void;
  /** Callback when download button is clicked */
  onDownload?: (taskId: string) => void;
  /** Callback when insert to board button is clicked */
  onInsert?: (taskId: string) => void;
  /** Callback when preview is opened */
  onPreviewOpen?: () => void;
  /** Callback when edit button is clicked */
  onEdit?: (taskId: string) => void;
}

/**
 * Gets the appropriate status tag color based on task status
 */
function getStatusTagTheme(status: TaskStatus): 'default' | 'primary' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case TaskStatus.PENDING:
      return 'default';
    case TaskStatus.PROCESSING:
      return 'primary';
    case TaskStatus.RETRYING:
      return 'warning';
    case TaskStatus.COMPLETED:
      return 'success';
    case TaskStatus.FAILED:
      return 'danger';
    case TaskStatus.CANCELLED:
      return 'default';
    default:
      return 'default';
  }
}

/**
 * Gets the status label in Chinese
 */
function getStatusLabel(status: TaskStatus): string {
  switch (status) {
    case TaskStatus.PENDING:
      return '待处理';
    case TaskStatus.PROCESSING:
      return '处理中';
    case TaskStatus.RETRYING:
      return '重试中';
    case TaskStatus.COMPLETED:
      return '已完成';
    case TaskStatus.FAILED:
      return '失败';
    case TaskStatus.CANCELLED:
      return '已取消';
    default:
      return '未知';
  }
}

/**
 * TaskItem component - displays a single task
 */
export const TaskItem: React.FC<TaskItemProps> = ({
  task,
  onCancel,
  onRetry,
  onDelete,
  onDownload,
  onInsert,
  onPreviewOpen,
  onEdit,
}) => {
  const isActive = task.status === TaskStatus.PENDING ||
                   task.status === TaskStatus.PROCESSING ||
                   task.status === TaskStatus.RETRYING;
  const isCompleted = task.status === TaskStatus.COMPLETED;
  const isFailed = task.status === TaskStatus.FAILED;

  return (
    <div className="task-item">
      {/* Left: Info + Status */}
      <div className="task-item__header">
        <div className="task-item__info">
          <div className="task-item__title">
            <div className="task-item__type-icon">
              {task.type === TaskType.IMAGE ? <ImageIcon /> : <VideoIcon />}
            </div>
            <Tooltip content={task.params.prompt}>
              <div className="task-item__prompt">
                {task.params.prompt}
              </div>
            </Tooltip>
          </div>


          {/* Metadata */}
          <div className="task-item__meta">
            {/* Status in same line */}
            <Tag theme={getStatusTagTheme(task.status)} variant="light">
              {getStatusLabel(task.status)}
            </Tag>
            <div className="task-item__meta-item">
              <span>创建时间:</span>
              <span>{getRelativeTime(task.createdAt)}</span>
            </div>
            {task.startedAt && (
              <div className="task-item__meta-item">
                <span>执行时长:</span>
                <span>{formatTaskDuration(Date.now() - task.startedAt)}</span>
              </div>
            )}
            {task.params.width && task.params.height && (
              <div className="task-item__meta-item">
                <span>尺寸:</span>
                <span>{task.params.width}x{task.params.height}</span>
              </div>
            )}
          </div>

          {/* Error Display */}
          {isFailed && task.error && (
            <div className="task-item__error">
              <div className="task-item__error-message">
                <strong>错误:</strong> {task.error.message}
              </div>
            </div>
          )}

          {/* Retry Info */}
          {task.status === TaskStatus.RETRYING && task.nextRetryAt && (
            <div className="task-item__retry-info">
              <div className="task-item__retry-info-text">
                重试 {task.retryCount + 1}/3 - 下次重试: {formatRetryDelay(task.retryCount)} 后
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Center: Preview Image/Video */}
      {isCompleted && task.result && task.result.url && (
        <div className="task-item__preview" onClick={onPreviewOpen}>
          {task.type === TaskType.IMAGE ? (
            <img src={task.result.url} alt="Generated" />
          ) : (
            <video src={task.result.url} />
          )}
        </div>
      )}

      {/* Right: Action Buttons (Vertical) */}
      <div className="task-item__actions">
        {/* Cancel button for active tasks */}
        {isActive && (
          <Button
            size="small"
            variant="outline"
            theme="danger"
            icon={<CloseCircleIcon />}
            onClick={() => onCancel?.(task.id)}
          >
            取消
          </Button>
        )}

        {/* Retry button for failed tasks */}
        {isFailed && (
          <Button
            size="small"
            variant="outline"
            theme="primary"
            icon={<RefreshIcon />}
            onClick={() => onRetry?.(task.id)}
          >
            重试
          </Button>
        )}

        {/* Insert button for completed tasks */}
        {isCompleted && task.result?.url && (
          <Button
            size="small"
            theme="primary"
            onClick={() => onInsert?.(task.id)}
          >
            插入
          </Button>
        )}

        {/* Download button for completed tasks */}
        {isCompleted && task.result?.url && (
          <Button
            size="small"
            variant="outline"
            icon={<DownloadIcon />}
            onClick={() => onDownload?.(task.id)}
          >
            下载
          </Button>
        )}

        {/* Edit button for all tasks */}
        <Button
          size="small"
          variant="outline"
          icon={<EditIcon />}
          onClick={() => onEdit?.(task.id)}
        >
          编辑
        </Button>

        {/* Delete button for completed/failed/cancelled tasks */}
        {(isCompleted || isFailed || task.status === TaskStatus.CANCELLED) && (
          <Button
            size="small"
            variant="text"
            theme="danger"
            icon={<DeleteIcon />}
            onClick={() => onDelete?.(task.id)}
          >
            删除
          </Button>
        )}
      </div>
    </div>
  );
};
