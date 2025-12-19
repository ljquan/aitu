/**
 * TaskItem Component
 *
 * Displays a single task with its details, status, and action buttons.
 * Shows input parameters (prompt) and output results when completed.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Button, Tag, Tooltip } from 'tdesign-react';
import { ImageIcon, VideoIcon, DeleteIcon, RefreshIcon, DownloadIcon, EditIcon, SaveIcon, CheckCircleFilledIcon } from 'tdesign-icons-react';
import { Task, TaskStatus, TaskType } from '../../types/task.types';
import { formatDateTime, formatTaskDuration } from '../../utils/task-utils';
import { formatRetryDelay } from '../../utils/retry-utils';
import { useMediaCache, useMediaUrl } from '../../hooks/useMediaCache';
import { RetryImage } from '../retry-image';
import './task-queue.scss';

export interface TaskItemProps {
  /** The task to display */
  task: Task;
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
  onRetry,
  onDelete,
  onDownload,
  onInsert,
  onPreviewOpen,
  onEdit,
}) => {
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const isCompleted = task.status === TaskStatus.COMPLETED;
  const isFailed = task.status === TaskStatus.FAILED;

  // Media cache hook
  const {
    isCaching,
    isCached,
    cacheProgress,
    cacheMedia,
    deleteCache,
  } = useMediaCache(
    task.id,
    task.result?.url,
    task.type === TaskType.IMAGE ? 'image' : 'video',
    task.params.prompt
  );

  // Get media URL with cache fallback
  const { url: mediaUrl, isFromCache } = useMediaUrl(task.id, task.result?.url);


  // Load image to get actual dimensions
  useEffect(() => {
    if (isCompleted && mediaUrl && task.type === TaskType.IMAGE) {
      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        // If image fails to load, keep dimensions null
        setImageDimensions(null);
      };
      img.src = mediaUrl;
    }
  }, [isCompleted, mediaUrl, task.type]);

  // Track if user manually deleted cache (to prevent auto-recaching)
  const userDeletedCacheRef = useRef(false);
  // Track if initial auto-cache has been attempted
  const autoCacheAttemptedRef = useRef(false);

  // Handle cache button click - track user intent
  const handleCacheClickWithTracking = async () => {
    if (isCached) {
      // User is manually deleting cache
      userDeletedCacheRef.current = true;
      await deleteCache();
    } else if (!isCaching) {
      // User is manually caching
      userDeletedCacheRef.current = false;
      await cacheMedia();
    }
  };

  // Auto-cache media in background when task completes (only once, unless user manually caches)
  useEffect(() => {
    // Skip if: already cached, currently caching, user manually deleted, or already attempted
    if (isCached || isCaching || userDeletedCacheRef.current || autoCacheAttemptedRef.current) {
      return;
    }

    if (isCompleted && task.result?.url) {
      autoCacheAttemptedRef.current = true;

      // Use requestIdleCallback for low-priority background caching
      const idleCallback = (window as any).requestIdleCallback || ((cb: () => void) => setTimeout(cb, 2000));
      const handle = idleCallback(() => {
        // Double-check conditions before caching
        if (!userDeletedCacheRef.current) {
          console.log(`[TaskItem] Auto-caching media for task ${task.id}`);
          cacheMedia();
        }
      });

      return () => {
        const cancelIdleCallback = (window as any).cancelIdleCallback || clearTimeout;
        cancelIdleCallback(handle);
      };
    }
  }, [isCompleted, task.result?.url, task.id, isCached, isCaching, cacheMedia]);

  // Build detailed tooltip content
  const buildTooltipContent = () => {
    const displayWidth = imageDimensions?.width || task.result?.width || task.params.width;
    const displayHeight = imageDimensions?.height || task.result?.height || task.params.height;

    return (
      <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
        <div><strong>提示词：</strong>{task.params.prompt}</div>
        <div><strong>状态：</strong>{getStatusLabel(task.status)}</div>
        {task.params.model && <div><strong>模型：</strong>{task.params.model}</div>}
        {displayWidth && displayHeight && (
          <div><strong>尺寸：</strong>{displayWidth}x{displayHeight}</div>
        )}
        {task.type === TaskType.VIDEO && task.params.seconds && (
          <div><strong>时长：</strong>{task.params.seconds}秒</div>
        )}
        {task.type === TaskType.VIDEO && task.params.size && (
          <div><strong>分辨率：</strong>{task.params.size}</div>
        )}
        {task.params.batchId && task.params.batchIndex && task.params.batchTotal && (
          <div><strong>批量：</strong>{task.params.batchIndex}/{task.params.batchTotal}</div>
        )}
        <div><strong>创建时间：</strong>{formatDateTime(task.createdAt)}</div>
        {task.startedAt && (
          <div><strong>执行时长：</strong>{formatTaskDuration(
            (task.completedAt || Date.now()) - task.startedAt
          )}</div>
        )}
        {task.type === TaskType.VIDEO && (
          <div><strong>进度：</strong>{task.progress ?? 0}%</div>
        )}
      </div>
    );
  };

  return (
    <div className="task-item">
        <div className="task-item__header">
          <div className="task-item__info">
            {/* Title - Always visible */}
            <div className="task-item__title">
              <div className="task-item__type-icon">
                {task.type === TaskType.IMAGE ? <ImageIcon /> : <VideoIcon />}
              </div>
              <div className="task-item__prompt" title={task.params.prompt}>
                {task.params.prompt}
              </div>
            </div>

            {/* Metadata */}
          <div className="task-item__meta">
            {/* First row: status + time info */}
            <div className="task-item__meta-row">
              {/* Image params: model */}
              {task.type === TaskType.IMAGE && task.params.model && (
                <Tag variant="outline">
                  {task.params.model}
                </Tag>
              )}
              {/* Video params: model, duration, size */}
              {task.type === TaskType.VIDEO && (
                <>
                  {task.params.model && (
                    <Tag variant="outline">
                      {task.params.model}
                    </Tag>
                  )}
                  {task.params.seconds && (
                    <Tag variant="outline">
                      {task.params.seconds}秒
                    </Tag>
                  )}
                  {task.params.size && (
                    <Tag variant="outline">
                      {task.params.size}
                    </Tag>
                  )}
                </>
              )}

              {/* Status in same line */}
              <Tag theme={getStatusTagTheme(task.status)} variant="light">
                {getStatusLabel(task.status)}
              </Tag>
              {/* Batch info */}
              {task.params.batchId && task.params.batchIndex && task.params.batchTotal && (
                <Tag variant="outline">
                  批量 {task.params.batchIndex}/{task.params.batchTotal}
                </Tag>
              )}
              <div className="task-item__meta-item">
                <span>创建时间:</span>
                <span>{formatDateTime(task.createdAt)}</span>
              </div>
              {task.startedAt && (
                <div className="task-item__meta-item">
                  <span>执行时长:</span>
                  <span>{formatTaskDuration(
                    (task.completedAt || Date.now()) - task.startedAt
                  )}</span>
                </div>
              )}
            {/* Second row: progress bar for video tasks */}
            {task.type === TaskType.VIDEO && (
              <div className="task-item__meta-row">
                <div className="task-item__progress">
                  <span className="task-item__progress-label">进度:</span>
                  <span className="task-item__progress-percent">{task.progress ?? 0}%</span>
                  <div className="task-item__progress-bar">
                    <div
                      className={`task-item__progress-fill task-item__progress-fill--${task.status}`}
                      style={{ width: `${task.progress ?? 0}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
            {/* Display actual image dimensions or fallback to params */}
            {(() => {
              const displayWidth = imageDimensions?.width || task.result?.width || task.params.width;
              const displayHeight = imageDimensions?.height || task.result?.height || task.params.height;

              if (displayWidth && displayHeight) {
                return (
                  <div className="task-item__meta-item">
                    <span>尺寸:</span>
                    <span>{displayWidth}x{displayHeight}</span>
                  </div>
                );
              }
              return null;
            })()}
            {/* Display result URL link for completed tasks */}
            {isCompleted && task.result?.url && (
              <div className="task-item__meta-item">
                <a
                  href={task.result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="task-item__link"
                  data-track="task_click_open_link"
                  onClick={(e) => e.stopPropagation()}
                >
                  打开链接
                </a>
              </div>
            )}
            </div>

          </div>

          {/* Error Display */}
          {isFailed && task.error && (
            <div className="task-item__error">
              <div className="task-item__error-message">
                <strong>错误:</strong> {task.error.message}
                {task.error.details?.originalError && (
                  <Tooltip
                    content={
                      <div className="task-item__error-details-tooltip">
                        <div className="task-item__error-details-title">原始错误信息:</div>
                        <div className="task-item__error-details-content">
                          {task.error.details.originalError}
                        </div>
                      </div>
                    }
                    theme="light"
                    placement="bottom"
                  >
                    <span className="task-item__error-details-link">[详情]</span>
                  </Tooltip>
                )}
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
      {isCompleted && mediaUrl && (
        <div className="task-item__preview" data-track="task_click_preview" onClick={onPreviewOpen}>
          {task.type === TaskType.IMAGE ? (
            <RetryImage
              src={mediaUrl}
              alt="Generated"
              maxRetries={5}
              fallback={
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '100px',
                  color: '#999',
                  fontSize: '14px'
                }}
                src-value={mediaUrl}
                >
                  图片加载失败
                </div>
              }
            />
          ) : (
            <video src={mediaUrl} />
          )}
          {/* Cache indicator */}
          {isFromCache && (
            <div className="task-item__cache-badge">
              <CheckCircleFilledIcon />
              <span>已缓存</span>
            </div>
          )}
        </div>
      )}

      {/* Right: Action Buttons (Vertical) */}
      <div className="task-item__actions">
        {/* Delete button for all tasks */}
        <Button
          size="small"
          variant="outline"
          theme="danger"
          icon={<DeleteIcon />}
          data-track="task_click_delete"
          onClick={() => onDelete?.(task.id)}
        >
          删除
        </Button>

        {/* Retry button for failed tasks */}
        {isFailed && (
          <Button
            size="small"
            variant="outline"
            theme="primary"
            icon={<RefreshIcon />}
            data-track="task_click_retry"
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
            data-track="task_click_insert"
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
            data-track="task_click_download"
            onClick={() => onDownload?.(task.id)}
          >
            下载
          </Button>
        )}

        {/* Cache button for completed tasks */}
        {isCompleted && task.result?.url && (
          <Tooltip content={isCached ? '点击删除缓存' : '缓存到本地，URL过期后仍可使用'}>
            <Button
              size="small"
              variant="outline"
              theme={isCached ? 'success' : 'default'}
              icon={isCached ? <CheckCircleFilledIcon /> : <SaveIcon />}
              data-track="task_click_cache"
              onClick={handleCacheClickWithTracking}
              disabled={isCaching}
            >
              {isCaching ? `缓存中 ${cacheProgress}%` : isCached ? '已缓存' : '缓存'}
            </Button>
          </Tooltip>
        )}

        {/* Edit button for all tasks */}
        <Button
          size="small"
          variant="outline"
          icon={<EditIcon />}
          data-track="task_click_edit"
          onClick={() => onEdit?.(task.id)}
        >
          编辑
        </Button>
      </div>
    </div>
  );
};
