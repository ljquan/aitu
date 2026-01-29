/**
 * DialogTaskList Component
 *
 * Displays tasks that were created from the current dialog session.
 * Used within AI generation dialogs to show only tasks created in that dialog.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { VirtualTaskList } from './VirtualTaskList';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { Task, TaskType, TaskStatus } from '../../types/task.types';
import { useDrawnix, DialogType } from '../../hooks/use-drawnix';
import { insertImageFromUrl } from '../../data/image';
import { insertVideoFromUrl } from '../../data/video';
import { MessagePlugin, Dialog, Input } from 'tdesign-react';
import { SearchIcon } from 'tdesign-icons-react';
import { sanitizeFilename } from '@aitu/utils';
import { downloadMediaFile, downloadFromBlob } from '../../utils/download-utils';
import { unifiedCacheService } from '../../services/unified-cache-service';
import { CharacterCreateDialog } from '../character/CharacterCreateDialog';
import { UnifiedMediaViewer, type MediaItem as UnifiedMediaItem } from '../shared/media-preview';
import './dialog-task-list.scss';

export interface DialogTaskListProps {
  /** Task IDs to display. If not provided, shows all tasks (subject to taskType filter) */
  taskIds?: string[];
  /** Type of tasks to show (optional filter) */
  taskType?: TaskType;
  /** Callback when edit button is clicked - if provided, will update parent form instead of opening dialog */
  onEditTask?: (task: any) => void;
}

/**
 * DialogTaskList component - displays filtered tasks for a specific dialog
 */
export const DialogTaskList: React.FC<DialogTaskListProps> = ({
  taskIds,
  taskType,
  onEditTask
}) => {
  const {
    tasks,
    retryTask,
    deleteTask,
  } = useTaskQueue();

  const { board, openDialog } = useDrawnix();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewInitialIndex, setPreviewInitialIndex] = useState(0);
  const [searchText, setSearchText] = useState('');
  // Character extraction dialog state
  const [characterDialogTask, setCharacterDialogTask] = useState<Task | null>(null);

  // Fuzzy match helper: all tokens must be present in concatenated fields
  const taskMatchesQuery = (task: any, query: string) => {
    if (!query.trim()) return true;
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    // Note: PENDING is deprecated, displayed as '处理中' for legacy compatibility
    const statusLabelMap: Record<TaskStatus, string> = {
      [TaskStatus.PENDING]: '处理中',
      [TaskStatus.PROCESSING]: '处理中',
      [TaskStatus.COMPLETED]: '已完成',
      [TaskStatus.FAILED]: '失败',
      [TaskStatus.CANCELLED]: '已取消',
    };

    const haystackParts: string[] = [];
    haystackParts.push(task.params?.prompt ?? '');
    haystackParts.push(task.params?.model ?? '');
    haystackParts.push(task.id ?? '');
    haystackParts.push(statusLabelMap[task.status as TaskStatus] ?? String(task.status));
    if (task.params?.batchId) haystackParts.push(String(task.params.batchId));
    if (task.params?.batchIndex) haystackParts.push(String(task.params.batchIndex));
    if (task.params?.batchTotal) haystackParts.push(String(task.params.batchTotal));
    if (task.result?.format) haystackParts.push(String(task.result.format));
    if (task.result?.width && task.result?.height) {
      haystackParts.push(`${task.result.width}x${task.result.height}`);
    } else if (task.params?.width && task.params?.height) {
      haystackParts.push(`${task.params.width}x${task.params.height}`);
    }

    const haystack = haystackParts.join(' ').toLowerCase();
    return tokens.every(t => haystack.includes(t));
  };

  // Filter tasks by IDs, type, and search text
  const filteredTasks = useMemo(() => {
    let filtered = tasks;

    if (taskIds && taskIds.length > 0) {
      filtered = filtered.filter(task => taskIds.includes(task.id));
    }

    if (taskType !== undefined) {
      filtered = filtered.filter(task => task.type === taskType);
    }

    if (searchText.trim()) {
      filtered = filtered.filter(t => taskMatchesQuery(t, searchText));
    }

    // Sort by creation time - newest first
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }, [tasks, taskIds, taskType, searchText]);

  // Task action handlers
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

    const filename = `${sanitizeFilename(task.params.prompt) || task.type}.${task.result.format}`;

    try {
      // 1. 优先从本地 IndexedDB 缓存获取
      const cachedBlob = await unifiedCacheService.getCachedBlob(task.result.url);
      if (cachedBlob) {
        // console.log('[Download] Using cached blob for task:', taskId);
        downloadFromBlob(cachedBlob, filename);
        MessagePlugin.success('下载成功');
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

    // 如果有 onEditTask 回调（从弹窗内部调用），直接更新父组件表单
    if (onEditTask) {
      onEditTask(task);
      return;
    }

    // 否则打开新的对话框（从任务队列面板调用）
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
      // console.log('DialogTaskList - handleEdit VIDEO task:', {
      //   taskId,
      //   taskParams: task.params,
      //   initialData
      // });
      openDialog(DialogType.aiVideoGeneration, initialData);
    }
  };

  // Handle extract character action
  const handleExtractCharacter = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      setCharacterDialogTask(task);
    }
  };

  // Get completed tasks with results for navigation
  const completedTasksWithResults = useMemo(() => {
    return filteredTasks.filter(
      t => t.status === TaskStatus.COMPLETED && t.result?.url
    );
  }, [filteredTasks]);

  // Convert tasks to MediaItem list for UnifiedMediaViewer
  const previewMediaItems: UnifiedMediaItem[] = useMemo(() => {
    return completedTasksWithResults.map(task => ({
      id: task.id,
      url: task.result!.url,
      type: task.type === TaskType.VIDEO ? 'video' as const : 'image' as const,
      title: task.params.prompt?.substring(0, 50),
    }));
  }, [completedTasksWithResults]);

  // Preview handlers
  const handlePreviewOpen = useCallback((taskId: string) => {
    const index = completedTasksWithResults.findIndex(t => t.id === taskId);
    if (index >= 0) {
      setPreviewInitialIndex(index);
      setPreviewVisible(true);
    }
  }, [completedTasksWithResults]);

  const handlePreviewClose = useCallback(() => {
    setPreviewVisible(false);
  }, []);

  // 计算总任务数（不受搜索影响）
  const totalTaskCount = useMemo(() => {
    let total = tasks;
    if (taskIds && taskIds.length > 0) {
      total = total.filter(task => taskIds.includes(task.id));
    }
    if (taskType !== undefined) {
      total = total.filter(task => task.type === taskType);
    }
    return total.length;
  }, [tasks, taskIds, taskType]);

  // 判断是否有搜索但无匹配
  const hasSearchNoMatch = searchText.trim() && filteredTasks.length === 0 && totalTaskCount > 0;

  return (
    <>
      <div className="dialog-task-list">
        <div className="dialog-task-list__header" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <h4>生成任务 ({filteredTasks.length})</h4>
          <div style={{ minWidth: '180px', maxWidth: '240px', flexShrink: 0 }}>
            <Input
              value={searchText}
              onChange={(v) => setSearchText(v)}
              placeholder="搜索任务（提示词/模型/...）"
              clearable
              prefixIcon={<SearchIcon />}
              size="small"
            />
          </div>
        </div>
        <VirtualTaskList
          tasks={filteredTasks}
          onRetry={handleRetry}
          onDelete={handleDelete}
          onDownload={handleDownload}
          onInsert={handleInsert}
          onEdit={handleEdit}
          onPreviewOpen={handlePreviewOpen}
          onExtractCharacter={handleExtractCharacter}
          className="dialog-task-list__content"
          emptyContent={
            <div className="dialog-task-list__empty">
              {hasSearchNoMatch ? (
                <p>未找到匹配的任务</p>
              ) : (
                <p>暂无生成任务</p>
              )}
            </div>
          }
        />
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

      {/* Unified Preview */}
      <UnifiedMediaViewer
        visible={previewVisible}
        items={previewMediaItems}
        initialIndex={previewInitialIndex}
        onClose={handlePreviewClose}
        showThumbnails={true}
      />

      {/* Character Create Dialog */}
      <CharacterCreateDialog
        visible={!!characterDialogTask}
        task={characterDialogTask}
        onClose={() => setCharacterDialogTask(null)}
        onCreateComplete={(characterId) => {
          // console.log('Character created:', characterId);
          setCharacterDialogTask(null);
        }}
      />
    </>
  );
};
