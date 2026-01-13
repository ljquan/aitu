/**
 * Backup & Restore Dialog
 *
 * 备份恢复对话框组件
 * 支持多选导出（提示词、项目、素材库）和增量导入
 */

import { Dialog, DialogContent } from '../dialog/dialog';
import { useState, useRef, useCallback } from 'react';
import { Checkbox, MessagePlugin, Progress } from 'tdesign-react';
import { UploadIcon } from 'tdesign-icons-react';
import {
  backupRestoreService,
  BackupOptions,
  ImportResult,
} from '../../services/backup-restore-service';
import './backup-restore-dialog.scss';

export interface BackupRestoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container: HTMLElement | null;
}

type TabType = 'backup' | 'restore';

export const BackupRestoreDialog = ({
  open,
  onOpenChange,
  container,
}: BackupRestoreDialogProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('backup');
  const [backupOptions, setBackupOptions] = useState<BackupOptions>({
    includePrompts: true,
    includeProjects: true,
    includeAssets: true,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    if (!isProcessing) {
      onOpenChange(false);
      // 重置状态
      setProgress(0);
      setProgressMessage('');
      setImportResult(null);
    }
  }, [isProcessing, onOpenChange]);

  const handleBackup = useCallback(async () => {
    // 检查是否至少选择了一项
    if (!backupOptions.includePrompts && !backupOptions.includeProjects && !backupOptions.includeAssets) {
      MessagePlugin.warning('请至少选择一项要备份的内容');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setProgressMessage('正在准备...');

    try {
      const blob = await backupRestoreService.exportToZip(
        backupOptions,
        (p, msg) => {
          setProgress(p);
          setProgressMessage(msg);
        }
      );

      backupRestoreService.downloadZip(blob);
      MessagePlugin.success('备份成功！');
      handleClose();
    } catch (error) {
      console.error('[BackupRestore] Export failed:', error);
      MessagePlugin.error('备份失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  }, [backupOptions, handleClose]);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.name.endsWith('.zip')) {
      MessagePlugin.warning('请选择 ZIP 格式的备份文件');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setProgressMessage('正在读取文件...');
    setImportResult(null);

    try {
      const result = await backupRestoreService.importFromZip(
        file,
        (p, msg) => {
          setProgress(p);
          setProgressMessage(msg);
        }
      );

      setImportResult(result);

      if (result.success) {
        MessagePlugin.success('导入成功！');
      } else if (result.errors.length > 0) {
        MessagePlugin.warning('导入完成，但有部分错误');
      }
    } catch (error) {
      console.error('[BackupRestore] Import failed:', error);
      MessagePlugin.error('导入失败，请检查文件格式');
    } finally {
      setIsProcessing(false);
      // 清空文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, []);

  const handleOptionChange = useCallback((key: keyof BackupOptions, checked: boolean) => {
    setBackupOptions((prev) => ({ ...prev, [key]: checked }));
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="backup-restore-dialog" container={container}>
        <h2 className="backup-restore-dialog__title">备份 / 恢复</h2>

        {/* 标签页切换 */}
        <div className="backup-restore-dialog__tabs">
          <button
            className={`backup-restore-dialog__tab ${activeTab === 'backup' ? 'backup-restore-dialog__tab--active' : ''}`}
            onClick={() => setActiveTab('backup')}
            disabled={isProcessing}
          >
            备份
          </button>
          <button
            className={`backup-restore-dialog__tab ${activeTab === 'restore' ? 'backup-restore-dialog__tab--active' : ''}`}
            onClick={() => setActiveTab('restore')}
            disabled={isProcessing}
          >
            恢复
          </button>
        </div>

        {/* 备份面板 */}
        {activeTab === 'backup' && (
          <div className="backup-restore-dialog__panel">
            <p className="backup-restore-dialog__description">
              选择要备份的内容，将导出为 ZIP 压缩包：
            </p>

            <div className="backup-restore-dialog__options">
              <Checkbox
                checked={backupOptions.includePrompts}
                onChange={(checked) => handleOptionChange('includePrompts', checked as boolean)}
                disabled={isProcessing}
              >
                <div className="backup-restore-dialog__option-content">
                  <span className="backup-restore-dialog__option-title">提示词</span>
                  <span className="backup-restore-dialog__option-desc">包含图片和视频生成的历史提示词</span>
                </div>
              </Checkbox>

              <Checkbox
                checked={backupOptions.includeProjects}
                onChange={(checked) => handleOptionChange('includeProjects', checked as boolean)}
                disabled={isProcessing}
              >
                <div className="backup-restore-dialog__option-content">
                  <span className="backup-restore-dialog__option-title">项目</span>
                  <span className="backup-restore-dialog__option-desc">包含所有文件夹和画板</span>
                </div>
              </Checkbox>

              <Checkbox
                checked={backupOptions.includeAssets}
                onChange={(checked) => handleOptionChange('includeAssets', checked as boolean)}
                disabled={isProcessing}
              >
                <div className="backup-restore-dialog__option-content">
                  <span className="backup-restore-dialog__option-title">素材库</span>
                  <span className="backup-restore-dialog__option-desc">包含所有本地上传的图片和视频</span>
                </div>
              </Checkbox>
            </div>

            {isProcessing && (
              <div className="backup-restore-dialog__progress">
                <Progress percentage={progress} theme="line" />
                <span className="backup-restore-dialog__progress-text">{progressMessage}</span>
              </div>
            )}

            <div className="backup-restore-dialog__actions">
              <button
                className="backup-restore-dialog__button backup-restore-dialog__button--cancel"
                onClick={handleClose}
                disabled={isProcessing}
              >
                取消
              </button>
              <button
                className="backup-restore-dialog__button backup-restore-dialog__button--primary"
                onClick={handleBackup}
                disabled={isProcessing}
              >
                {isProcessing ? '正在备份...' : '开始备份'}
              </button>
            </div>
          </div>
        )}

        {/* 恢复面板 */}
        {activeTab === 'restore' && (
          <div className="backup-restore-dialog__panel">
            <p className="backup-restore-dialog__description">
              选择备份文件进行恢复，数据将增量导入（不会覆盖现有内容）：
            </p>

            <div
              className="backup-restore-dialog__dropzone"
              onClick={handleFileSelect}
            >
              <UploadIcon className="backup-restore-dialog__dropzone-icon" />
              <span className="backup-restore-dialog__dropzone-text">
                点击选择备份文件 (.zip)
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>

            {isProcessing && (
              <div className="backup-restore-dialog__progress">
                <Progress percentage={progress} theme="line" />
                <span className="backup-restore-dialog__progress-text">{progressMessage}</span>
              </div>
            )}

            {importResult && (
              <div className="backup-restore-dialog__result">
                <h4 className="backup-restore-dialog__result-title">
                  {importResult.success ? '导入完成' : '导入完成（有错误）'}
                </h4>
                <ul className="backup-restore-dialog__result-list">
                  {(importResult.prompts.imported > 0 || importResult.prompts.skipped > 0) && (
                    <li>
                      提示词：导入 {importResult.prompts.imported} 条，跳过 {importResult.prompts.skipped} 条
                    </li>
                  )}
                  {(importResult.projects.folders > 0 || importResult.projects.boards > 0) && (
                    <li>
                      项目：导入 {importResult.projects.folders} 个文件夹，{importResult.projects.boards} 个画板
                    </li>
                  )}
                  {(importResult.assets.imported > 0 || importResult.assets.skipped > 0) && (
                    <li>
                      素材：导入 {importResult.assets.imported} 个，跳过 {importResult.assets.skipped} 个
                    </li>
                  )}
                </ul>
                {importResult.errors.length > 0 && (
                  <div className="backup-restore-dialog__result-errors">
                    <strong>错误信息：</strong>
                    <ul>
                      {importResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="backup-restore-dialog__actions">
              <button
                className="backup-restore-dialog__button backup-restore-dialog__button--cancel"
                onClick={handleClose}
                disabled={isProcessing}
              >
                {importResult ? '完成' : '取消'}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
