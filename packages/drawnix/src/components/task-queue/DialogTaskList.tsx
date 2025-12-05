/**
 * DialogTaskList Component
 *
 * Displays tasks that were created from the current dialog session.
 * Used within AI generation dialogs to show only tasks created in that dialog.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { TaskItem } from './TaskItem';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { TaskType, TaskStatus } from '../../types/task.types';
import { useDrawnix, DialogType } from '../../hooks/use-drawnix';
import { insertImageFromUrl } from '../../data/image';
import { insertVideoFromUrl } from '../../data/video';
import { MessagePlugin, Dialog, Button } from 'tdesign-react';
import { ChevronLeftIcon, ChevronRightIcon } from 'tdesign-icons-react';
import { downloadMediaFile } from '../../utils/download-utils';
import { useMediaUrl } from '../../hooks/useMediaCache';
import './dialog-task-list.scss';

export interface DialogTaskListProps {
  /** Task IDs to display */
  taskIds: string[];
  /** Type of tasks to show (optional filter) */
  taskType?: TaskType;
}

/**
 * DialogTaskList component - displays filtered tasks for a specific dialog
 */
export const DialogTaskList: React.FC<DialogTaskListProps> = ({
  taskIds,
  taskType
}) => {
  const {
    tasks,
    cancelTask,
    retryTask,
    deleteTask,
  } = useTaskQueue();

  const { board, openDialog } = useDrawnix();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);

  // Filter tasks by IDs and optionally by type
  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter(task => taskIds.includes(task.id));

    if (taskType !== undefined) {
      filtered = filtered.filter(task => task.type === taskType);
    }

    // Sort by creation time - newest first
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }, [tasks, taskIds, taskType]);

  // Task action handlers
  const handleCancel = (taskId: string) => {
    cancelTask(taskId);
  };

  const handleRetry = (taskId: string) => {
    retryTask(taskId);
  };

  const handleDelete = (taskId: string) => {
    setTaskToDelete(taskId);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (taskToDelete) {
      deleteTask(taskToDelete);
    }
    setShowDeleteConfirm(false);
    setTaskToDelete(null);
  };

  const handleDownload = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task?.result?.url) return;

    try {
      const result = await downloadMediaFile(
        task.result.url,
        task.params.prompt,
        task.result.format,
        task.type
      );
      if (result && 'opened' in result) {
        MessagePlugin.success('已在新标签页打开，请右键另存为');
      } else {
        MessagePlugin.success('下载成功');
      }
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
        await insertImageFromUrl(board, task.result.url);
        MessagePlugin.success('图片已插入到白板');
      } else if (task.type === TaskType.VIDEO) {
        await insertVideoFromUrl(board, task.result.url);
        MessagePlugin.success('视频已插入到白板');
      }
    } catch (error) {
      console.error('Failed to insert to board:', error);
      MessagePlugin.error(`插入失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleEdit = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      console.warn('Cannot edit: task not found');
      return;
    }

    // 根据任务类型打开对应的对话框
    if (task.type === TaskType.IMAGE) {
      // 准备图片生成初始数据
      const initialData = {
        initialPrompt: task.params.prompt,
        initialWidth: task.params.width,
        initialHeight: task.params.height,
        initialImages: task.params.uploadedImages,  // 传递上传的参考图片(数组)
        initialResultUrl: task.result?.url,  // 传递结果URL用于预览
      };
      openDialog(DialogType.aiImageGeneration, initialData);
    } else if (task.type === TaskType.VIDEO) {
      // 准备视频生成初始数据
      const initialData = {
        initialPrompt: task.params.prompt,
        initialDuration: typeof task.params.seconds === 'string' 
          ? parseInt(task.params.seconds, 10) 
          : task.params.seconds,  // 确保转换为数字
        initialModel: task.params.model,  // 传递模型
        initialSize: task.params.size,  // 传递尺寸
        initialImages: task.params.uploadedImages,  // 传递上传的图片（多图片格式）
        initialResultUrl: task.result?.url,  // 传递结果URL用于预览
      };
      console.log('DialogTaskList - handleEdit VIDEO task:', {
        taskId,
        taskParams: task.params,
        initialData
      });
      openDialog(DialogType.aiVideoGeneration, initialData);
    }
  };

  // Get completed tasks with results for navigation
  const completedTasksWithResults = useMemo(() => {
    return filteredTasks.filter(
      t => t.status === TaskStatus.COMPLETED && t.result?.url
    );
  }, [filteredTasks]);

  // Get current preview index and navigation info
  const previewInfo = useMemo(() => {
    if (!previewTaskId) return null;
    const currentIndex = completedTasksWithResults.findIndex(t => t.id === previewTaskId);
    if (currentIndex === -1) return null;
    return {
      currentIndex,
      total: completedTasksWithResults.length,
      hasPrevious: currentIndex > 0,
      hasNext: currentIndex < completedTasksWithResults.length - 1,
    };
  }, [previewTaskId, completedTasksWithResults]);

  // Preview navigation handlers
  const handlePreviewOpen = (taskId: string) => {
    setPreviewTaskId(taskId);
  };

  const handlePreviewClose = () => {
    setPreviewTaskId(null);
  };

  const handlePreviewPrevious = () => {
    if (!previewInfo || !previewInfo.hasPrevious) return;
    setPreviewTaskId(completedTasksWithResults[previewInfo.currentIndex - 1].id);
  };

  const handlePreviewNext = () => {
    if (!previewInfo || !previewInfo.hasNext) return;
    setPreviewTaskId(completedTasksWithResults[previewInfo.currentIndex + 1].id);
  };

  // Get current previewed task
  const previewedTask = useMemo(() => {
    if (!previewTaskId) return null;
    return tasks.find(t => t.id === previewTaskId);
  }, [previewTaskId, tasks]);

  // Keyboard navigation for preview
  useEffect(() => {
    if (!previewTaskId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        handlePreviewPrevious();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        handlePreviewNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handlePreviewClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewTaskId, previewInfo]);

  if (filteredTasks.length === 0) {
    return null;
  }

  return (
    <>
      <div className="dialog-task-list">
        <div className="dialog-task-list__header">
          <h4>生成任务 ({filteredTasks.length})</h4>
        </div>
        <div className="dialog-task-list__content">
          {filteredTasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              onCancel={handleCancel}
              onRetry={handleRetry}
              onDelete={handleDelete}
              onDownload={handleDownload}
              onInsert={handleInsert}
              onEdit={handleEdit}
              onPreviewOpen={() => handlePreviewOpen(task.id)}
            />
          ))}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        visible={showDeleteConfirm}
        header="确认删除"
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      >
        确定要删除此任务吗？此操作无法撤销。
      </Dialog>

      {/* Preview Dialog */}
      {previewedTask && previewedTask.result?.url && (
        <Dialog
          visible={!!previewTaskId}
          onClose={handlePreviewClose}
          width="90vw"
          header={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{previewedTask.type === TaskType.IMAGE ? '图片预览' : '视频预览'}</span>
              {previewInfo && (
                <span style={{ fontSize: '14px', color: '#757575', fontWeight: 'normal' }}>
                  {previewInfo.currentIndex + 1} / {previewInfo.total}
                </span>
              )}
            </div>
          }
          footer={null}
          className="task-preview-dialog"
        >
          <div className="task-preview-container">
            <Button
              className="task-preview-nav task-preview-nav--left"
              icon={<ChevronLeftIcon />}
              data-track="task_click_preview_previous"
              onClick={handlePreviewPrevious}
              size="large"
              shape="circle"
              variant="outline"
              disabled={!previewInfo?.hasPrevious}
            />
            <PreviewContent task={previewedTask} />
            <Button
              className="task-preview-nav task-preview-nav--right"
              icon={<ChevronRightIcon />}
              data-track="task_click_preview_next"
              onClick={handlePreviewNext}
              size="large"
              shape="circle"
              variant="outline"
              disabled={!previewInfo?.hasNext}
            />
          </div>
        </Dialog>
      )}
    </>
  );
};

/**
 * PreviewContent component - displays preview media with cache support
 */
const PreviewContent: React.FC<{ task: any }> = ({ task }) => {
  const { url, isFromCache } = useMediaUrl(task.id, task.result?.url);

  if (!url) {
    return <div className="task-preview-content">加载中...</div>;
  }

  return (
    <div className="task-preview-content">
      {task.type === TaskType.IMAGE ? (
        <img
          key={task.id}
          src={url}
          alt="Preview"
          style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain' }}
        />
      ) : (
        <video
          key={task.id}
          src={url}
          controls
          autoPlay
          style={{ maxWidth: '100%', maxHeight: '85vh' }}
        />
      )}
      {isFromCache && (
        <div className="task-preview-cache-badge">已缓存</div>
      )}
    </div>
  );
};
