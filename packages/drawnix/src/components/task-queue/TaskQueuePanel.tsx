/**
 * TaskQueuePanel Component
 *
 * Side panel that displays all tasks in the queue.
 * Supports filtering by status and provides batch operations.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Button, Tabs, Dialog, MessagePlugin, Input, Radio, Tooltip } from 'tdesign-react';
import { DeleteIcon, SearchIcon, ChevronLeftIcon, ChevronRightIcon, UserIcon } from 'tdesign-icons-react';
import { TaskItem } from './TaskItem';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { Task, TaskType, TaskStatus } from '../../types/task.types';
import { useMediaUrl } from '../../hooks/useMediaCache';
import { useDrawnix, DialogType } from '../../hooks/use-drawnix';
import { insertImageFromUrl } from '../../data/image';
import { insertVideoFromUrl } from '../../data/video';
import { gridImageService } from '../../services/photo-wall';
import { downloadMediaFile, downloadFromBlob, sanitizeFilename } from '../../utils/download-utils';
import { mediaCacheService } from '../../services/media-cache-service';
import { SideDrawer } from '../side-drawer';
import { CharacterCreateDialog } from '../character/CharacterCreateDialog';
import { CharacterList } from '../character/CharacterList';
import { useCharacters } from '../../hooks/useCharacters';
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
 * PreviewContent component - displays preview media with cache support
 */
const PreviewContent: React.FC<{ task: Task }> = ({ task }) => {
  const { url, isFromCache } = useMediaUrl(task.id, task.result?.url);

  if (!url) {
    return <div className="task-preview-content">加载中...</div>;
  }

  return (
    <div className="task-preview-content">
      {task.type === TaskType.IMAGE || task.type === TaskType.CHARACTER ? (
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
    retryTask,
    deleteTask,
    clearCompleted,
    clearFailed,
  } = useTaskQueue();

  const { board, openDialog } = useDrawnix();
  const { characters } = useCharacters();
  const [activeTab, setActiveTab] = useState<string>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearType, setClearType] = useState<'completed' | 'failed'>('completed');
  const [searchText, setSearchText] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video' | 'character'>('all');
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  // Character extraction dialog state
  const [characterDialogTask, setCharacterDialogTask] = useState<Task | null>(null);

  // Check if showing characters view
  const isCharacterView = typeFilter === 'character';

  // Initialize media cache status on component mount
  useEffect(() => {
    mediaCacheService.initCacheStatus();
  }, []);

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
    if (typeFilter !== 'all' && typeFilter !== 'character') {
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
  const handleRetry = (taskId: string) => {
    retryTask(taskId);
    onTaskAction?.('retry', taskId);
  };

  const handleDelete = (taskId: string) => {
    setTaskToDelete(taskId);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (taskToDelete) {
      deleteTask(taskToDelete);
      onTaskAction?.('delete', taskToDelete);
    }
    setShowDeleteConfirm(false);
    setTaskToDelete(null);
  };

  const handleDownload = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task?.result?.url) return;

    const filename = `${sanitizeFilename(task.params.prompt) || task.type}.${task.result.format}`;

    try {
      // 1. 优先从本地 IndexedDB 缓存获取
      const cachedMedia = await mediaCacheService.getCachedMedia(taskId);
      if (cachedMedia?.blob) {
        console.log('[Download] Using cached blob for task:', taskId);
        downloadFromBlob(cachedMedia.blob, filename);
        MessagePlugin.success('下载成功');
        onTaskAction?.('download', taskId);
        return;
      }

      // 2. 缓存不存在，从 URL 下载（带重试，SW 会自动去重）
      console.log('[Download] No cache, fetching from URL:', task.result.url);
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
      onTaskAction?.('download', taskId);
    } catch (error) {
      console.error('Download failed:', error);
      MessagePlugin.error('下载失败，请稍后重试');
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
        // 检查是否是宫格图任务（通过 gridImageRows 参数判断）
        if (task.params.gridImageRows && task.params.gridImageCols) {
          // 宫格图任务：使用已生成的图片进行分割和布局
          console.log('Inserting grid image to board:', taskId);
          gridImageService.setBoard(board);

          // 使用已生成的图片进行分割和布局
          const result = await gridImageService.processExistingImage(
            task.result.url,
            {
              rows: task.params.gridImageRows,
              cols: task.params.gridImageCols,
            },
            task.params.gridImageLayoutStyle || 'scattered'
          );

          if (result.success && result.elements) {
            await gridImageService.insertToBoard(result.elements);
            MessagePlugin.success('宫格图已插入到白板');
          } else {
            throw new Error(result.error || '宫格图处理失败');
          }
        } else {
          // 普通图片任务
          await insertImageFromUrl(board, task.result.url);
          console.log('Image inserted to board:', taskId);
          MessagePlugin.success('图片已插入到白板');
        }
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
      openDialog(DialogType.aiVideoGeneration, initialData);
    }

    onTaskAction?.('edit', taskId);
  };

  // Handle extract character action
  const handleExtractCharacter = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      setCharacterDialogTask(task);
      onTaskAction?.('extractCharacter', taskId);
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
  }, [previewTaskId, handlePreviewPrevious, handlePreviewNext]);

  // Handle close
  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  // Filter section with tabs and filters
  const filterSection = (
    <div className="task-queue-panel__filters-container">
      <Tabs value={activeTab} onChange={(value) => setActiveTab(value as string)}>
        <TabPanel value="all" label={`全部 (${tasks.length})`} />
        <TabPanel value="active" label={`生成中 (${activeTasks.length})`} />
        <TabPanel value="failed" label={`失败 (${failedTasks.length})`} />
        <TabPanel value="completed" label={`已完成 (${completedTasks.length})`} />
      </Tabs>

      <div className="task-queue-panel__filters">
        <RadioGroup
          value={typeFilter}
          onChange={(value) => setTypeFilter(value as 'all' | 'image' | 'video' | 'character')}
          size="small"
          variant="default-filled"
        >
          <Radio.Button value="all">全部</Radio.Button>
          <Radio.Button value="image">图片</Radio.Button>
          <Radio.Button value="video">视频</Radio.Button>
          <Radio.Button value="character">
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <UserIcon size="14px" />
              角色 ({characters.length})
            </span>
          </Radio.Button>
        </RadioGroup>

        {/* Hide search and actions when viewing characters */}
        {!isCharacterView && (
          <div className="task-queue-panel__search-row">
            <Input
              value={searchText}
              onChange={(value) => setSearchText(value)}
              placeholder="搜索 Prompt..."
              clearable
              prefixIcon={<SearchIcon />}
              size="small"
              className="task-queue-panel__search-input"
            />

            {failedTasks.length > 0 && (
              <Tooltip content="清除失败" theme="light">
                <Button
                  size="small"
                  variant="text"
                  theme="danger"
                  icon={<DeleteIcon />}
                  data-track="task_click_clear_failed"
                  onClick={() => handleClear('failed')}
                  className="task-queue-panel__clear-btn"
                >
                  <span className="task-queue-panel__clear-text">清除失败</span>
                </Button>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <SideDrawer
        isOpen={expanded}
        onClose={handleClose}
        title="任务队列"
        filterSection={filterSection}
        position="toolbar-right"
        width="responsive"
        showBackdrop={false}
        closeOnEsc={false}
        showCloseButton={true}
        className="task-queue-panel"
        contentClassName="task-queue-panel__content"
      >
        {isCharacterView ? (
          /* Character List View */
          <CharacterList
            showHeader={false}
            title=""
          />
        ) : (
          /* Task List View */
          filteredTasks.length === 0 ? (
            <div className="task-queue-panel__empty">
              <div className="task-queue-panel__empty-icon">📋</div>
              <div className="task-queue-panel__empty-text">
                {activeTab === 'all' ? '暂无任务' : `暂无${activeTab === 'active' ? '生成中' : activeTab === 'completed' ? '已完成' : activeTab === 'failed' ? '失败' : '已取消'}任务`}
              </div>
            </div>
          ) : (
            <div className="task-queue-panel__list">
              {filteredTasks.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onRetry={handleRetry}
                  onDelete={handleDelete}
                  onDownload={handleDownload}
                  onInsert={handleInsert}
                  onEdit={handleEdit}
                  onPreviewOpen={() => handlePreviewOpen(task.id)}
                  onExtractCharacter={handleExtractCharacter}
                />
              ))}
            </div>
          )
        )}
      </SideDrawer>

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

      {/* Unified Preview Dialog */}
      {previewedTask && previewedTask.result?.url && (
        <Dialog
          visible={!!previewTaskId}
          onClose={handlePreviewClose}
          width="90vw"
          header={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{previewedTask.type === TaskType.IMAGE ? '图片预览' : previewedTask.type === TaskType.CHARACTER ? '角色预览' : '视频预览'}</span>
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

      {/* Character Create Dialog */}
      <CharacterCreateDialog
        visible={!!characterDialogTask}
        task={characterDialogTask}
        onClose={() => setCharacterDialogTask(null)}
        onCreateStart={() => {
          // Start indicator (API call begins)
          console.log('Character creation started');
        }}
        onCreateComplete={(characterId) => {
          console.log('Character created:', characterId);
          // Close dialog and switch to character view after API succeeds
          setCharacterDialogTask(null);
          setTypeFilter('character');
        }}
      />
    </>
  );
};
