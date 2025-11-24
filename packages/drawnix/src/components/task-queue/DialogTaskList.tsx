/**
 * DialogTaskList Component
 *
 * Displays tasks that were created from the current dialog session.
 * Used within AI generation dialogs to show only tasks created in that dialog.
 */

import React, { useMemo } from 'react';
import { TaskItem } from './TaskItem';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { Task, TaskType, TaskStatus } from '../../types/task.types';
import { useDrawnix, DialogType } from '../../hooks/use-drawnix';
import { insertImageFromUrl } from '../../data/image';
import { insertVideoFromUrl } from '../../data/video';
import { MessagePlugin, Dialog } from 'tdesign-react';
import { downloadMediaFile } from '../../utils/download-utils';
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
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [taskToDelete, setTaskToDelete] = React.useState<string | null>(null);

  // Filter tasks by IDs and optionally by type
  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter(task => taskIds.includes(task.id));

    if (taskType !== undefined) {
      filtered = filtered.filter(task => task.type === taskType);
    }

    // Sort by creation time - newest first
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }, [tasks, taskIds, taskType]);

  // Group tasks by batchId for display
  const batchGroups = useMemo(() => {
    const groups = new Map<string, { tasks: Task[]; completed: number; total: number }>();

    filteredTasks.forEach(task => {
      const batchId = task.params.batchId || task.id; // Single tasks use their own ID
      const existing = groups.get(batchId);

      if (existing) {
        existing.tasks.push(task);
        if (task.status === TaskStatus.COMPLETED) {
          existing.completed++;
        }
      } else {
        groups.set(batchId, {
          tasks: [task],
          completed: task.status === TaskStatus.COMPLETED ? 1 : 0,
          total: task.params.batchTotal || 1
        });
      }
    });

    return groups;
  }, [filteredTasks]);

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
      await downloadMediaFile(
        task.result.url,
        task.params.prompt,
        task.result.format,
        task.type
      );
      MessagePlugin.success('下载成功');
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

    // 准备初始数据
    const initialData = {
      prompt: task.params.prompt,
      width: task.params.width,
      height: task.params.height,
      duration: task.params.duration,
      resultUrl: task.result?.url,  // 传递结果URL用于预览
    };

    // 根据任务类型打开对应的对话框
    if (task.type === TaskType.IMAGE) {
      openDialog(DialogType.aiImageGeneration, initialData);
    } else if (task.type === TaskType.VIDEO) {
      openDialog(DialogType.aiVideoGeneration, initialData);
    }
  };

  if (filteredTasks.length === 0) {
    return null;
  }

  // Get batch count info for header
  const batchCount = batchGroups.size;
  const hasBatches = Array.from(batchGroups.values()).some(g => g.total > 1);

  return (
    <>
      <div className="dialog-task-list">
        <div className="dialog-task-list__header">
          <h4>
            生成任务 ({filteredTasks.length})
            {hasBatches && batchCount > 0 && (
              <span className="dialog-task-list__batch-info">
                {' '}· {batchCount} 批次
              </span>
            )}
          </h4>
        </div>
        <div className="dialog-task-list__content">
          {filteredTasks.map(task => {
            const batchId = task.params.batchId;
            const batchGroup = batchId ? batchGroups.get(batchId) : null;
            const showBatchLabel = batchGroup && batchGroup.total > 1;

            return (
              <div key={task.id} className="dialog-task-list__task-wrapper">
                {showBatchLabel && (
                  <div className="dialog-task-list__batch-label">
                    {task.params.batchIndex}/{task.params.batchTotal}
                    {batchGroup && (
                      <span className="dialog-task-list__batch-progress">
                        ({batchGroup.completed}/{batchGroup.total} 完成)
                      </span>
                    )}
                  </div>
                )}
                <TaskItem
                  task={task}
                  onCancel={handleCancel}
                  onRetry={handleRetry}
                  onDelete={handleDelete}
                  onDownload={handleDownload}
                  onInsert={handleInsert}
                  onEdit={handleEdit}
                />
              </div>
            );
          })}
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
    </>
  );
};
