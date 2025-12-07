/**
 * CreateProjectDialog Component
 *
 * Dialog for creating a new project with name and optional description.
 */

import React, { useState, useCallback } from 'react';
import { Dialog, Input, Textarea, MessagePlugin } from 'tdesign-react';
import { PROJECT_DEFAULTS } from '../../constants/PROJECT_CONSTANTS';

export interface CreateProjectDialogProps {
  /** Whether the dialog is visible */
  visible: boolean;
  /** Called when dialog is closed */
  onClose: () => void;
  /** Called when project is created */
  onCreate: (name: string, description?: string) => Promise<void>;
}

/**
 * CreateProjectDialog component
 */
export const CreateProjectDialog: React.FC<CreateProjectDialogProps> = ({
  visible,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleClose = useCallback(() => {
    setName('');
    setDescription('');
    onClose();
  }, [onClose]);

  const handleConfirm = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      MessagePlugin.warning('请输入项目名称');
      return;
    }

    if (trimmedName.length > PROJECT_DEFAULTS.MAX_NAME_LENGTH) {
      MessagePlugin.warning(`项目名称不能超过 ${PROJECT_DEFAULTS.MAX_NAME_LENGTH} 个字符`);
      return;
    }

    try {
      setLoading(true);
      await onCreate(trimmedName, description.trim() || undefined);
      handleClose();
      MessagePlugin.success('项目创建成功');
    } catch (error) {
      MessagePlugin.error(
        error instanceof Error ? error.message : '创建项目失败'
      );
    } finally {
      setLoading(false);
    }
  }, [name, description, onCreate, handleClose]);

  return (
    <Dialog
      visible={visible}
      header="新建项目"
      confirmBtn={{ content: '创建', loading }}
      cancelBtn="取消"
      onConfirm={handleConfirm}
      onClose={handleClose}
      onCancel={handleClose}
      width={480}
      destroyOnClose
    >
      <div className="create-project-dialog">
        <div className="create-project-dialog__field">
          <label className="create-project-dialog__label">
            项目名称 <span className="create-project-dialog__required">*</span>
          </label>
          <Input
            value={name}
            onChange={(value) => setName(value as string)}
            placeholder="请输入项目名称"
            maxlength={PROJECT_DEFAULTS.MAX_NAME_LENGTH}
            autoFocus
          />
        </div>

        <div className="create-project-dialog__field">
          <label className="create-project-dialog__label">项目描述</label>
          <Textarea
            value={description}
            onChange={(value) => setDescription(value as string)}
            placeholder="请输入项目描述（选填）"
            maxlength={PROJECT_DEFAULTS.MAX_DESCRIPTION_LENGTH}
            autosize={{ minRows: 3, maxRows: 5 }}
          />
        </div>
      </div>

      <style>{`
        .create-project-dialog {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding: 8px 0;
        }

        .create-project-dialog__field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .create-project-dialog__label {
          font-size: 14px;
          font-weight: 500;
          color: var(--td-text-color-primary, #181818);
        }

        .create-project-dialog__required {
          color: var(--td-error-color, #e34d59);
        }
      `}</style>
    </Dialog>
  );
};
