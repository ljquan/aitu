/**
 * TaskQueuePanel Component
 * 
 * Side panel that displays all tasks in the queue.
 * Supports filtering by status and provides batch operations.
 */

import React, { useState } from 'react';
import { Button, Tabs, Dialog } from 'tdesign-react';
import { DeleteIcon, CloseIcon } from 'tdesign-icons-react';
import { TaskItem } from './TaskItem';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { Task, TaskStatus, TaskType } from '../../types/task.types';
import { useDrawnix } from '../../hooks/use-drawnix';
import { insertImageFromUrl } from '../../data/image';
import { insertVideoFromUrl } from '../../data/video';
import './task-queue.scss';

const { TabPanel } = Tabs;

export interface TaskQueuePanelProps {
  /** Whether the panel is expanded */
  expanded: boolean;
  /** Callback when close button is clicked */
  onClose?: () => void;
  /** Callback when a task action is performed */
  onTaskAction?: (action: string, taskId: string) => void;
}

/**
 * TaskQueuePanel component - displays the full task queue
 */
export const TaskQueuePanel: React.FC<TaskQueuePanelProps> = ({
  expanded,
  onClose,
  onTaskAction,
}) => {
  const {
    tasks,
    activeTasks,
    completedTasks,
    failedTasks,
    cancelledTasks,
    cancelTask,
    retryTask,
    deleteTask,
    clearCompleted,
    clearFailed,
  } = useTaskQueue();

  const { board } = useDrawnix();
  const [activeTab, setActiveTab] = useState<string>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearType, setClearType] = useState<'completed' | 'failed'>('completed');

  // Filter tasks based on active tab
  const getFilteredTasks = (): Task[] => {
    switch (activeTab) {
      case 'all':
        return tasks;
      case 'active':
        return activeTasks;
      case 'completed':
        return completedTasks;
      case 'failed':
        return failedTasks;
      case 'cancelled':
        return cancelledTasks;
      default:
        return tasks;
    }
  };

  const filteredTasks = getFilteredTasks();

  // Handle clear action
  const handleClear = (type: 'completed' | 'failed') => {
    setClearType(type);
    setShowClearConfirm(true);
  };

  const confirmClear = () => {
    if (clearType === 'completed') {
      clearCompleted();
    } else {
      clearFailed();
    }
    setShowClearConfirm(false);
  };

  // Task action handlers
  const handleCancel = (taskId: string) => {
    cancelTask(taskId);
    onTaskAction?.('cancel', taskId);
  };

  const handleRetry = (taskId: string) => {
    retryTask(taskId);
    onTaskAction?.('retry', taskId);
  };

  const handleDelete = (taskId: string) => {
    deleteTask(taskId);
    onTaskAction?.('delete', taskId);
  };

  const handleDownload = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task?.result?.url) {
      // Create a temporary link to download the file
      const link = document.createElement('a');
      link.href = task.result.url;
      link.download = `${task.type}-${task.id}.${task.result.format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    onTaskAction?.('download', taskId);
  };

  const handleInsert = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task?.result?.url || !board) {
      console.warn('Cannot insert: task result or board not available');
      return;
    }

    try {
      if (task.type === TaskType.IMAGE) {
        // 插入图片到白板
        await insertImageFromUrl(board, task.result.url);
        console.log('Image inserted to board:', taskId);
      } else if (task.type === TaskType.VIDEO) {
        // 插入视频到白板
        await insertVideoFromUrl(board, task.result.url);
        console.log('Video inserted to board:', taskId);
      }
      onTaskAction?.('insert', taskId);
    } catch (error) {
      console.error('Failed to insert to board:', error);
    }
  };

  return (
    <>
      <div className={`task-queue-panel ${expanded ? 'task-queue-panel--expanded' : ''}`}>
        {/* Header with title and close button */}
        <div className="task-queue-panel__header">
          <div>
            <h3>任务队列</h3>
            <Tabs value={activeTab} onChange={(value) => setActiveTab(value as string)}>
              <TabPanel value="all" label={`全部 (${tasks.length})`} />
              <TabPanel value="active" label={`活动 (${activeTasks.length})`} />
              <TabPanel value="completed" label={`已完成 (${completedTasks.length})`} />
              <TabPanel value="failed" label={`失败 (${failedTasks.length})`} />
            </Tabs>
          </div>

          <div className="task-queue-panel__actions">
            {completedTasks.length > 0 && (
              <Button
                size="small"
                variant="text"
                icon={<DeleteIcon />}
                onClick={() => handleClear('completed')}
              >
                清除已完成
              </Button>
            )}
            {failedTasks.length > 0 && (
              <Button
                size="small"
                variant="text"
                theme="danger"
                icon={<DeleteIcon />}
                onClick={() => handleClear('failed')}
              >
                清除失败
              </Button>
            )}
          </div>
        </div>

        {/* Task List */}
        <div className="task-queue-panel__content">
          {filteredTasks.length === 0 ? (
            <div className="task-queue-panel__empty">
              <div className="task-queue-panel__empty-icon">📋</div>
              <div className="task-queue-panel__empty-text">
                {activeTab === 'all' ? '暂无任务' : `暂无${activeTab === 'active' ? '活动' : activeTab === 'completed' ? '已完成' : activeTab === 'failed' ? '失败' : '已取消'}任务`}
              </div>
            </div>
          ) : (
            <div className="task-queue-panel__list">
              {filteredTasks.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onCancel={handleCancel}
                  onRetry={handleRetry}
                  onDelete={handleDelete}
                  onDownload={handleDownload}
                  onInsert={handleInsert}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Backdrop overlay */}
      {expanded && (
        <div 
          className="task-queue-panel__backdrop"
          onClick={onClose}
        />
      )}

      {/* Clear Confirmation Dialog */}
      <Dialog
        visible={showClearConfirm}
        header="确认清除"
        onClose={() => setShowClearConfirm(false)}
        onConfirm={confirmClear}
        onCancel={() => setShowClearConfirm(false)}
      >
        确定要清除所有{clearType === 'completed' ? '已完成' : '失败'}的任务吗？此操作无法撤销。
      </Dialog>
    </>
  );
};
