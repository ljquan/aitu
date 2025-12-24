/**
 * CharacterCreateDialog Component
 *
 * Dialog for creating a character from a Sora-2 video task.
 * Uses video frame preview for time range selection.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Dialog, MessagePlugin } from 'tdesign-react';
import { useCharacters } from '../../hooks/useCharacters';
import { formatCharacterTimestamps } from '../../types/character.types';
import { useMediaUrl } from '../../hooks/useMediaCache';
import { CharacterTimeRangeSelector } from './CharacterTimeRangeSelector';
import type { Task } from '../../types/task.types';
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
  const { createCharacter, isCreatingCharacterForTask } = useCharacters();
  const [isCreating, setIsCreating] = useState(false);

  // Get video URL from cache or original
  const { url: videoUrl } = useMediaUrl(task?.id ?? '', task?.result?.url);

  // Get video duration from task params
  const videoDuration = useMemo(() => {
    if (!task?.params.seconds) return 10; // Default fallback
    return parseFloat(task.params.seconds.toString());
  }, [task?.params.seconds]);

  // Check if already creating for this task
  const alreadyCreating = task ? isCreatingCharacterForTask(task.id) : false;

  // Handle time range confirmation
  const handleConfirm = useCallback(async (startTime: number, endTime: number) => {
    if (!task || !task.remoteId) {
      MessagePlugin.error('无效的任务数据');
      return;
    }

    setIsCreating(true);
    onCreateStart?.();

    try {
      const timestamps = formatCharacterTimestamps(startTime, endTime);

      const character = await createCharacter({
        videoTaskId: task.remoteId,
        characterTimestamps: timestamps,
        localTaskId: task.id,
        sourcePrompt: task.params.prompt,
        sourceModel: task.params.model,
      });

      if (character) {
        MessagePlugin.success('角色创建已提交');
        onCreateComplete?.(character.id);
        onClose();
      }
    } catch (err) {
      console.error('Failed to create character:', err);
      const errorMessage = (err as Error).message || '角色创建失败';
      MessagePlugin.error(errorMessage);
      setIsCreating(false);
    }
  }, [task, createCharacter, onCreateStart, onCreateComplete, onClose]);

  // Handle dialog close
  const handleClose = () => {
    if (!isCreating) {
      onClose();
    }
  };

  // Handle cancel from time selector
  const handleCancel = () => {
    if (!isCreating) {
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
      closeOnOverlayClick={!isCreating}
      closeOnEscKeydown={!isCreating}
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
        disabled={isCreating || alreadyCreating}
      />
    </Dialog>
  );
};

export default CharacterCreateDialog;
