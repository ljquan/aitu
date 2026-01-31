/**
 * TaskQueuePanel Component
 *
 * Side panel that displays all tasks in the queue.
 * Supports filtering by status and provides batch operations.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Button, Tabs, Dialog, MessagePlugin, Input, Radio, Tooltip, Checkbox, Badge } from 'tdesign-react';
import { DeleteIcon, SearchIcon, UserIcon, RefreshIcon, PauseCircleIcon, CheckDoubleIcon, ImageIcon, VideoIcon, FilterIcon } from 'tdesign-icons-react';
import { VirtualTaskList } from './VirtualTaskList';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { Task, TaskType, TaskStatus } from '../../types/task.types';
import { unifiedCacheService } from '../../services/unified-cache-service';
import { useDrawnix, DialogType } from '../../hooks/use-drawnix';
import { insertImageFromUrl } from '../../data/image';
import { insertVideoFromUrl } from '../../data/video';
import { sanitizeFilename } from '@aitu/utils';
import { downloadMediaFile, downloadFromBlob } from '../../utils/download-utils';
import { BaseDrawer } from '../side-drawer';
import { CharacterCreateDialog } from '../character/CharacterCreateDialog';
import { CharacterList } from '../character/CharacterList';
import { useCharacters } from '../../hooks/useCharacters';
import { UnifiedMediaViewer, type MediaItem as UnifiedMediaItem } from '../shared/media-preview';
import { ImageEditor } from '../image-editor';
import './task-queue.scss';

const { TabPanel } = Tabs;
const RadioGroup = Radio.Group;

// Storage key for drawer width
export const TASK_DRAWER_WIDTH_KEY = 'task-queue-drawer-width';

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
    isLoading,
    isLoadingMore,
    hasMore,
    totalCount,
    loadedCount,
    loadMore,
    retryTask,
    deleteTask,
    clearCompleted,
    clearFailed,
    batchDeleteTasks,
    batchRetryTasks,
    batchCancelTasks,
  } = useTaskQueue();

  const { board, openDialog } = useDrawnix();
  const { characters } = useCharacters();
  const [activeTab, setActiveTab] = useState<string>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearType, setClearType] = useState<'completed' | 'failed'>('completed');
  const [searchText, setSearchText] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video' | 'character'>('all');
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewInitialIndex, setPreviewInitialIndex] = useState(0);
  
  // 图片编辑器状态
  const [imageEditorVisible, setImageEditorVisible] = useState(false);
  const [imageEditorUrl, setImageEditorUrl] = useState('');
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  // Character extraction dialog state
  const [characterDialogTask, setCharacterDialogTask] = useState<Task | null>(null);
  // Multi-selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);

  // Check if showing characters view
  const isCharacterView = typeFilter === 'character';

  // Initialize media cache status on component mount
  useEffect(() => {
    unifiedCacheService.initCacheStatus();
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

  // Multi-selection handlers
  const handleToggleSelectionMode = () => {
    if (selectionMode) {
      // Exit selection mode and clear selections
      setSelectionMode(false);
      setSelectedTaskIds(new Set());
    } else {
      setSelectionMode(true);
    }
  };

  const handleSelectionChange = (taskId: string, selected: boolean) => {
    setSelectedTaskIds(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(taskId);
      } else {
        newSet.delete(taskId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const allTaskIds = filteredTasks.map(t => t.id);
    setSelectedTaskIds(new Set(allTaskIds));
  };

  const handleDeselectAll = () => {
    setSelectedTaskIds(new Set());
  };

  const handleBatchDelete = () => {
    if (selectedTaskIds.size === 0) return;
    setShowBatchDeleteConfirm(true);
  };

  const confirmBatchDelete = () => {
    batchDeleteTasks(Array.from(selectedTaskIds));
    setSelectedTaskIds(new Set());
    setSelectionMode(false);
    setShowBatchDeleteConfirm(false);
    MessagePlugin.success(`已删除 ${selectedTaskIds.size} 个任务`);
  };

  const handleBatchRetry = () => {
    // Retry failed and cancelled tasks
    const retryableSelectedIds = Array.from(selectedTaskIds).filter(id => {
      const task = tasks.find(t => t.id === id);
      return task?.status === TaskStatus.FAILED || task?.status === TaskStatus.CANCELLED;
    });
    if (retryableSelectedIds.length === 0) {
      MessagePlugin.warning('没有可重试的任务');
      return;
    }
    batchRetryTasks(retryableSelectedIds);
    setSelectedTaskIds(new Set());
    setSelectionMode(false);
    MessagePlugin.success(`已重试 ${retryableSelectedIds.length} 个任务`);
  };

  // Count selected failed/cancelled tasks for retry button
  const selectedRetryableCount = useMemo(() => {
    return Array.from(selectedTaskIds).filter(id => {
      const task = tasks.find(t => t.id === id);
      return task?.status === TaskStatus.FAILED || task?.status === TaskStatus.CANCELLED;
    }).length;
  }, [selectedTaskIds, tasks]);

  // Count selected active tasks for cancel button
  const selectedActiveCount = useMemo(() => {
    return Array.from(selectedTaskIds).filter(id => {
      const task = tasks.find(t => t.id === id);
      return task?.status === TaskStatus.PENDING ||
             task?.status === TaskStatus.PROCESSING;
    }).length;
  }, [selectedTaskIds, tasks]);

  // Type counts for filter buttons
  const typeCounts = useMemo(() => {
    return {
      all: tasks.length,
      image: tasks.filter(t => t.type === TaskType.IMAGE).length,
      video: tasks.filter(t => t.type === TaskType.VIDEO).length,
      character: characters.length,
    };
  }, [tasks, characters]);

  const handleBatchCancel = () => {
    // Only cancel active tasks
    const activeSelectedIds = Array.from(selectedTaskIds).filter(id => {
      const task = tasks.find(t => t.id === id);
      return task?.status === TaskStatus.PENDING ||
             task?.status === TaskStatus.PROCESSING;
    });
    if (activeSelectedIds.length === 0) {
      MessagePlugin.warning('没有可取消的进行中任务');
      return;
    }
    batchCancelTasks(activeSelectedIds);
    setSelectedTaskIds(new Set());
    setSelectionMode(false);
    MessagePlugin.success(`已取消 ${activeSelectedIds.length} 个任务`);
  };

  const handleDownload = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task?.result?.url) return;

    const filename = `${sanitizeFilename(task.params.prompt) || task.type}.${task.result.format}`;

    try {
      // 1. 优先从本地 IndexedDB 缓存获取
      const cachedBlob = await unifiedCacheService.getCachedBlob(task.result.url);
      if (cachedBlob) {
        // console.log('[Download] Using cached blob for task:', taskId);
        downloadFromBlob(cachedBlob, filename);
        MessagePlugin.success('下载成功');
        onTaskAction?.('download', taskId);
        return;
      }

      // 2. 缓存不存在，从 URL 下载（带重试，SW 会自动去重）
      // console.log('[Download] No cache, fetching from URL:', task.result.url);
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
        // 直接插入原始生成的图片（包括宫格图和普通图片）
        await insertImageFromUrl(board, task.result.url);
        // console.log('Image inserted to board:', taskId);
        MessagePlugin.success('图片已插入到白板');
      } else if (task.type === TaskType.VIDEO) {
        // 插入视频到白板
        await insertVideoFromUrl(board, task.result.url);
        // console.log('Video inserted to board:', taskId);
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

  // Get completed tasks with results for navigation (deduplicated by ID)
  const completedTasksWithResults = useMemo(() => {
    const seen = new Set<string>();
    return filteredTasks.filter(t => {
      if (t.status !== TaskStatus.COMPLETED || !t.result?.url) return false;
      if (seen.has(t.id)) return false; // 跳过重复的任务 ID
      seen.add(t.id);
      return true;
    });
  }, [filteredTasks]);

  // 创建 taskId -> previewIndex 的映射，用于精确查找
  const taskIdToPreviewIndex = useMemo(() => {
    const map = new Map<string, number>();
    completedTasksWithResults.forEach((task, index) => {
      map.set(task.id, index);
    });
    return map;
  }, [completedTasksWithResults]);

  // 将任务列表转换为 MediaItem 列表
  const previewMediaItems: UnifiedMediaItem[] = useMemo(() => {
    return completedTasksWithResults.map(task => ({
      id: task.id, // 任务 ID，不是画布元素 ID
      url: task.result!.url,
      type: task.type === TaskType.VIDEO ? 'video' as const : 'image' as const,
      title: task.params.prompt?.substring(0, 50),
    }));
  }, [completedTasksWithResults]);

  // Preview navigation handlers - 使用 Map 精确查找索引
  const handlePreviewOpen = useCallback((taskId: string) => {
    setPreviewTaskId(taskId);
    const index = taskIdToPreviewIndex.get(taskId);
    if (index !== undefined) {
      setPreviewInitialIndex(index);
      setPreviewVisible(true);
    }
  }, [taskIdToPreviewIndex]);

  const handlePreviewClose = useCallback(() => {
    setPreviewTaskId(null);
    setPreviewVisible(false);
  }, []);

  // 处理图片编辑
  const handlePreviewEdit = useCallback((item: UnifiedMediaItem) => {
    if (item.type !== 'image') return;
    setImageEditorUrl(item.url);
    setImageEditorVisible(true);
    setPreviewVisible(false); // 关闭预览
  }, []);

  // 编辑后插入画布
  const handleEditInsert = useCallback(async (editedImageUrl: string) => {
    if (!board) return;
    
    try {
      const taskId = `edited-image-${Date.now()}`;
      const stableUrl = `/__aitu_cache__/image/${taskId}.png`;
      
      // 将 data URL 转换为 Blob
      const response = await fetch(editedImageUrl);
      const blob = await response.blob();
      
      // 缓存到 Cache API
      await unifiedCacheService.cacheMediaFromBlob(stableUrl, blob, 'image', { taskId });
      
      // 插入到画布
      await insertImageFromUrl(board, stableUrl);
      
      // 关闭编辑器
      setImageEditorVisible(false);
      setImageEditorUrl('');
    } catch (error) {
      console.error('Failed to insert edited image:', error);
    }
  }, [board]);

  // Handle close
  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  // 计算各 Tab 的显示数量（已加载数据中的分类 + 未加载的估算）
  // 全部数量使用 totalCount（来自 SW），其他分类使用已加载数据的数量
  const displayTotalCount = totalCount > 0 ? totalCount : tasks.length;

  // Filter section with tabs and filters
  const filterSection = (
    <div className="task-queue-panel__filters-container">
      <Tabs value={activeTab} onChange={(value) => setActiveTab(value as string)}>
        <TabPanel value="all" label={`全部 (${displayTotalCount})`} />
        <TabPanel value="active" label={`生成中 (${activeTasks.length})`} />
        <TabPanel value="failed" label={`失败 (${failedTasks.length})`} />
        <TabPanel value="completed" label={`已完成 (${completedTasks.length})`} />
      </Tabs>

      <div className="task-queue-panel__filters">
        {/* Simplified Type Filters */}
        <div className="task-queue-panel__type-filters">
          <Tooltip content={`全部 (${typeCounts.all})`} theme="light">
            <Button
              size="small"
              variant={typeFilter === 'all' ? 'base' : 'text'}
              shape="square"
              onClick={() => setTypeFilter('all')}
              className={typeFilter === 'all' ? 'task-queue-panel__filter-btn--active' : ''}
            >
              <FilterIcon size="16px" />
            </Button>
          </Tooltip>
          <Tooltip content={`图片 (${typeCounts.image})`} theme="light">
            <Button
              size="small"
              variant={typeFilter === 'image' ? 'base' : 'text'}
              shape="square"
              onClick={() => setTypeFilter('image')}
              className={typeFilter === 'image' ? 'task-queue-panel__filter-btn--active' : ''}
            >
              <ImageIcon size="16px" />
            </Button>
          </Tooltip>
          <Tooltip content={`视频 (${typeCounts.video})`} theme="light">
            <Button
              size="small"
              variant={typeFilter === 'video' ? 'base' : 'text'}
              shape="square"
              onClick={() => setTypeFilter('video')}
              className={typeFilter === 'video' ? 'task-queue-panel__filter-btn--active' : ''}
            >
              <VideoIcon size="16px" />
            </Button>
          </Tooltip>
          <Tooltip content={`角色 (${typeCounts.character})`} theme="light">
            <Button
              size="small"
              variant={typeFilter === 'character' ? 'base' : 'text'}
              shape="square"
              onClick={() => setTypeFilter('character')}
              className={typeFilter === 'character' ? 'task-queue-panel__filter-btn--active' : ''}
            >
              <UserIcon size="16px" />
            </Button>
          </Tooltip>
        </div>

        {/* Search row integrated in the same line */}
        <div className="task-queue-panel__search-row">
          <Input
            value={searchText}
            onChange={(value) => setSearchText(value)}
            placeholder="搜索..."
            clearable
            prefixIcon={<SearchIcon />}
            size="small"
            className="task-queue-panel__search-input"
          />

          <div className="task-queue-panel__filter-actions">
            <Tooltip content={selectionMode ? "退出多选" : "批量操作"} theme="light">
              <Button
                size="small"
                variant={selectionMode ? "base" : "outline"}
                theme={selectionMode ? "primary" : "default"}
                icon={<CheckDoubleIcon />}
                data-track="task_click_toggle_selection"
                onClick={handleToggleSelectionMode}
              >
                {selectionMode ? "退出" : "多选"}
              </Button>
            </Tooltip>

            {failedTasks.length > 0 && !selectionMode && (
              <Tooltip content="清除失败" theme="light">
                <Button
                  size="small"
                  variant="text"
                  theme="default"
                  icon={<DeleteIcon style={{ color: 'var(--td-text-color-placeholder)' }} />}
                  data-track="task_click_clear_failed"
                  onClick={() => handleClear('failed')}
                  className="task-queue-panel__clear-btn"
                />
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      {/* Batch action bar - shown when in selection mode */}
      {selectionMode && !isCharacterView && (
        <div className="task-queue-panel__batch-actions">
          <div className="task-queue-panel__batch-select">
            <Checkbox
              checked={selectedTaskIds.size === filteredTasks.length && filteredTasks.length > 0}
              indeterminate={selectedTaskIds.size > 0 && selectedTaskIds.size < filteredTasks.length}
              onChange={(checked) => checked ? handleSelectAll() : handleDeselectAll()}
            />
            <span className="task-queue-panel__batch-count">
              已选 {selectedTaskIds.size} / {filteredTasks.length}
            </span>
          </div>
          <div className="task-queue-panel__batch-buttons">
            {selectedActiveCount > 0 && (
              <Button
                size="small"
                variant="outline"
                theme="warning"
                icon={<PauseCircleIcon />}
                data-track="task_click_batch_cancel"
                onClick={handleBatchCancel}
              >
                取消 ({selectedActiveCount})
              </Button>
            )}
            {selectedRetryableCount > 0 && (
              <Button
                size="small"
                theme="primary"
                icon={<RefreshIcon />}
                data-track="task_click_batch_retry"
                onClick={handleBatchRetry}
              >
                重试 ({selectedRetryableCount})
              </Button>
            )}
            <Button
              size="small"
              variant="text"
              theme="default"
              icon={<DeleteIcon />}
              data-track="task_click_batch_delete"
              onClick={handleBatchDelete}
              disabled={selectedTaskIds.size === 0}
            >
              删除 ({selectedTaskIds.size})
            </Button>

          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <BaseDrawer
        isOpen={expanded}
        onClose={handleClose}
        title="任务队列"
        filterSection={filterSection}
        position="toolbar-right"
        width="responsive"
        storageKey={TASK_DRAWER_WIDTH_KEY}
        showBackdrop={false}
        closeOnEsc={false}
        showCloseButton={true}
        className="task-queue-panel"
        contentClassName="task-queue-panel__content"
        resizable={true}
        minWidth={320}
        maxWidth={1024}
        data-testid="task-queue-panel"
      >
        {isCharacterView ? (
          /* Character List View */
          <CharacterList
            showHeader={false}
            title=""
          />
        ) : (
          /* Task List View with Virtual Scrolling */
          <VirtualTaskList
            tasks={filteredTasks}
            selectionMode={selectionMode}
            selectedTaskIds={selectedTaskIds}
            onSelectionChange={handleSelectionChange}
            onRetry={handleRetry}
            onDelete={handleDelete}
            onDownload={handleDownload}
            onInsert={handleInsert}
            onEdit={handleEdit}
            onPreviewOpen={handlePreviewOpen}
            onExtractCharacter={handleExtractCharacter}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadMore}
            totalCount={totalCount}
            loadedCount={loadedCount}
            className="task-queue-panel__list"
            emptyContent={
              isLoading ? (
                <div className="task-queue-panel__empty">
                  <div className="task-queue-panel__empty-icon">⏳</div>
                  <div className="task-queue-panel__empty-text">加载中...</div>
                </div>
              ) : (
                <div className="task-queue-panel__empty">
                  <div className="task-queue-panel__empty-icon">📋</div>
                  <div className="task-queue-panel__empty-text">
                    {activeTab === 'all' ? '暂无任务' : `暂无${activeTab === 'active' ? '生成中' : activeTab === 'completed' ? '已完成' : activeTab === 'failed' ? '失败' : '已取消'}任务`}
                  </div>
                </div>
              )
            }
          />
        )}
      </BaseDrawer>

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

      {/* Batch Delete Confirmation Dialog */}
      <Dialog
        visible={showBatchDeleteConfirm}
        header="确认批量删除"
        onClose={() => setShowBatchDeleteConfirm(false)}
        onConfirm={confirmBatchDelete}
        onCancel={() => setShowBatchDeleteConfirm(false)}
      >
        确定要删除选中的 {selectedTaskIds.size} 个任务吗？此操作无法撤销。
      </Dialog>

      {/* 统一预览 */}
      <UnifiedMediaViewer
        visible={previewVisible}
        items={previewMediaItems}
        initialIndex={previewInitialIndex}
        onClose={handlePreviewClose}
        showThumbnails={true}
        onEdit={handlePreviewEdit}
      />

      {/* 图片编辑器 - 任务场景只支持插入画布和下载 */}
      {imageEditorVisible && imageEditorUrl && (
        <ImageEditor
          visible={imageEditorVisible}
          imageUrl={imageEditorUrl}
          showOverwrite={false}
          onClose={() => {
            setImageEditorVisible(false);
            setImageEditorUrl('');
          }}
          onInsert={board ? handleEditInsert : undefined}
        />
      )}

      {/* Character Create Dialog */}
      <CharacterCreateDialog
        visible={!!characterDialogTask}
        task={characterDialogTask}
        onClose={() => setCharacterDialogTask(null)}
        onCreateStart={() => {
          // Start indicator (API call begins)
          // console.log('Character creation started');
        }}
        onCreateComplete={(characterId) => {
          // console.log('Character created:', characterId);
          // Close dialog (don't auto-switch to character view)
          setCharacterDialogTask(null);
        }}
      />
    </>
  );
};
