/**
 * TaskQueuePanel Component
 * 
 * Side panel that displays all tasks in the queue.
 * Supports filtering by status and provides batch operations.
 */

import React, { useState, useMemo } from 'react';
import { Button, Tabs, Dialog, MessagePlugin, Input, Radio } from 'tdesign-react';
import { DeleteIcon, SearchIcon } from 'tdesign-icons-react';
import { TaskItem } from './TaskItem';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { Task, TaskType } from '../../types/task.types';
import { useDrawnix } from '../../hooks/use-drawnix';
import { insertImageFromUrl } from '../../data/image';
import { insertVideoFromUrl } from '../../data/video';
import './task-queue.scss';

const { TabPanel } = Tabs;
const RadioGroup = Radio.Group;

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
  const [activeTab, setActiveTab] = useState<string>('active');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearType, setClearType] = useState<'completed' | 'failed'>('completed');
  const [searchText, setSearchText] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video'>('all');

  // Filter and sort tasks
  const filteredTasks = useMemo(() => {
    // Get tasks based on active tab
    let tasksToFilter: Task[];
    switch (activeTab) {
      case 'all':
        tasksToFilter = tasks;
        break;
      case 'active':
        tasksToFilter = activeTasks;
        break;
      case 'completed':
        tasksToFilter = completedTasks;
        break;
      case 'failed':
        tasksToFilter = failedTasks;
        break;
      case 'cancelled':
        tasksToFilter = cancelledTasks;
        break;
      default:
        tasksToFilter = tasks;
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      tasksToFilter = tasksToFilter.filter(task =>
        task.type === (typeFilter === 'image' ? TaskType.IMAGE : TaskType.VIDEO)
      );
    }

    // Apply search filter
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase().trim();
      tasksToFilter = tasksToFilter.filter(task =>
        task.params.prompt.toLowerCase().includes(searchLower)
      );
    }

    // Sort by time - newest first (reverse chronological)
    return [...tasksToFilter].sort((a, b) => b.createdAt - a.createdAt);
  }, [activeTab, tasks, activeTasks, completedTasks, failedTasks, cancelledTasks, typeFilter, searchText]);

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

  const handleDownload = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task?.result?.url) return;

    try {
      // Fetch the file as blob to handle cross-origin URLs
      const response = await fetch(task.result.url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const blob = await response.blob();

      // Create blob URL
      const blobUrl = URL.createObjectURL(blob);

      // Generate filename from prompt (sanitize and truncate)
      const sanitizedPrompt = task.params.prompt
        .replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s-]/g, '') // Remove special chars, keep Chinese
        .replace(/\s+/g, '-') // Replace spaces with dashes
        .substring(0, 50); // Limit to 50 chars

      const filename = `${sanitizedPrompt || task.type}.${task.result.format}`;

      // Create a temporary link to download the file
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up blob URL
      URL.revokeObjectURL(blobUrl);

      MessagePlugin.success('下载成功');
      onTaskAction?.('download', taskId);
    } catch (error) {
      console.error('Download failed:', error);
      MessagePlugin.error(`下载失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleInsert = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task?.result?.url || !board) {
      console.warn('Cannot insert: task result or board not available');
      MessagePlugin.warning('无法插入：白板未就绪');
      return;
    }

    try {
      if (task.type === TaskType.IMAGE) {
        // 插入图片到白板
        await insertImageFromUrl(board, task.result.url);
        console.log('Image inserted to board:', taskId);
        MessagePlugin.success('图片已插入到白板');
      } else if (task.type === TaskType.VIDEO) {
        // 插入视频到白板
        await insertVideoFromUrl(board, task.result.url);
        console.log('Video inserted to board:', taskId);
        MessagePlugin.success('视频已插入到白板');
      }
      onTaskAction?.('insert', taskId);
    } catch (error) {
      console.error('Failed to insert to board:', error);
      MessagePlugin.error(`插入失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  return (
    <>
      <div className={`task-queue-panel ${expanded ? 'task-queue-panel--expanded' : ''}`}>
        {/* Header with title and tabs */}
        <div className="task-queue-panel__header">
          <div>
            <h3>任务队列</h3>
            <Tabs value={activeTab} onChange={(value) => setActiveTab(value as string)}>
              <TabPanel value="active" label={`活动 (${activeTasks.length})`} />
              <TabPanel value="failed" label={`失败 (${failedTasks.length})`} />
              <TabPanel value="completed" label={`已完成 (${completedTasks.length})`} />
              <TabPanel value="all" label={`全部 (${tasks.length})`} />
            </Tabs>
          </div>
        </div>

        {/* Filters and Actions */}
        <div className="task-queue-panel__filters">
          <Input
            value={searchText}
            onChange={(value) => setSearchText(value)}
            placeholder="搜索 Prompt..."
            clearable
            prefixIcon={<SearchIcon />}
            size="small"
            style={{ flex: 1, marginRight: '8px' }}
          />

          <RadioGroup
            value={typeFilter}
            onChange={(value) => setTypeFilter(value as 'all' | 'image' | 'video')}
            size="small"
            variant="default-filled"
            style={{ marginRight: '8px' }}
          >
            <Radio.Button value="all">全部</Radio.Button>
            <Radio.Button value="image">图片</Radio.Button>
            <Radio.Button value="video">视频</Radio.Button>
          </RadioGroup>

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
