/**
 * CharacterCreateDialog Component
 *
 * Dialog for creating a character from a Sora-2 video task.
 * Uses video frame preview for time range selection.
 * Character creation is handled through the task queue system.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Dialog, MessagePlugin } from 'tdesign-react';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { formatCharacterTimestamps, getCharacterModel } from '../../types/character.types';
import { useMediaUrl } from '../../hooks/useMediaCache';
import { CharacterTimeRangeSelector } from './CharacterTimeRangeSelector';
import { Task, TaskType, TaskStatus } from '../../types/task.types';
import './character.scss';

export interface CharacterCreateDialogProps {
  /** Whether the dialog is visible */
  visible: boolean;
  /** The source video task */
  task: Task | null;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Callback when character creation starts */
  onCreateStart?: () => void;
  /** Callback when character creation completes (API call done, polling started) */
  onCreateComplete?: (characterId: string) => void;
}

/**
 * CharacterCreateDialog component
 */
export const CharacterCreateDialog: React.FC<CharacterCreateDialogProps> = ({
  visible,
  task,
  onClose,
  onCreateStart,
  onCreateComplete,
}) => {
  const { createTask, tasks } = useTaskQueue();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get video URL from cache or original
  const { url: videoUrl } = useMediaUrl(task?.id ?? '', task?.result?.url);

  // Get video duration from task params
  const videoDuration = useMemo(() => {
    if (!task?.params.seconds) return 10; // Default fallback
    return parseFloat(task.params.seconds.toString());
  }, [task?.params.seconds]);

  // Check if already creating for this task (look for pending/processing character tasks)
  const alreadyCreating = useMemo(() => {
    if (!task) return false;
    return tasks.some(
      t => t.type === TaskType.CHARACTER &&
        t.params.sourceLocalTaskId === task.id &&
        (t.status === TaskStatus.PENDING || t.status === TaskStatus.PROCESSING)
    );
  }, [task, tasks]);

  // Handle time range confirmation - create a task in the queue
  const handleConfirm = useCallback(async (startTime: number, endTime: number) => {
    if (!task || !task.remoteId) {
      MessagePlugin.error('无效的任务数据');
      return;
    }

    setIsSubmitting(true);
    onCreateStart?.();

    try {
      const timestamps = formatCharacterTimestamps(startTime, endTime);

      // Create a character task in the queue
      // Use the actual character API model name (e.g., sora-2-character, sora-2-pro-character)
      const characterModel = getCharacterModel(task.params.model);
      const characterTask = createTask(
        {
          prompt: task.params.prompt || '角色提取',
          model: characterModel,
          sourceVideoTaskId: task.remoteId,
          characterTimestamps: timestamps,
          sourceLocalTaskId: task.id,
        },
        TaskType.CHARACTER
      );

      MessagePlugin.success('角色创建任务已加入队列');
      onCreateComplete?.(characterTask.id);
      onClose();
    } catch (err) {
      console.error('Failed to create character task:', err);
      const errorMessage = (err as Error).message || '创建任务失败';
      MessagePlugin.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [task, createTask, onCreateStart, onCreateComplete, onClose]);

  // Handle dialog close
  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  // Handle cancel from time selector
  const handleCancel = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  if (!task || !videoUrl) return null;

  return (
    <Dialog
      visible={visible}
      header="角色"
      onClose={handleClose}
      footer={null}
      width={560}
      className="character-create-dialog"
      closeOnOverlayClick={!isSubmitting}
      closeOnEscKeydown={!isSubmitting}
    >
      <div className="character-create-dialog__description">
        从视频中提取角色，创建后可通过 <code>@username</code> 在提示词中引用
      </div>

      {/* Already creating warning */}
      {alreadyCreating && (
        <div className="character-create-dialog__warning">
          此视频已有一个角色正在创建中
        </div>
      )}

      {/* Video frame time range selector */}
      <CharacterTimeRangeSelector
        videoUrl={videoUrl}
        videoDuration={videoDuration}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        disabled={isSubmitting || alreadyCreating}
      />
    </Dialog>
  );
};

export default CharacterCreateDialog;
