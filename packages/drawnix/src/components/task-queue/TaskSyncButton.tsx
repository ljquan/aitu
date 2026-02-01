/**
 * 任务产物同步按钮组件
 */

import React, { useState, useCallback } from 'react';
import { Button, Tooltip, Loading, MessagePlugin } from 'tdesign-react';
import { CloudIcon, CheckCircleFilledIcon, CloseCircleFilledIcon, CloudUploadIcon } from 'tdesign-icons-react';
import { useGitHubSyncOptional } from '../../contexts/GitHubSyncContext';
import { mediaSyncService, MediaSyncStatus } from '../../services/github-sync';
import type { Task } from '../../types/task.types';

/** Props */
interface TaskSyncButtonProps {
  /** 任务对象 */
  task: Task;
  /** 按钮尺寸 */
  size?: 'small' | 'medium' | 'large';
  /** 是否只显示图标 */
  iconOnly?: boolean;
  /** 同步完成回调 */
  onSyncComplete?: (success: boolean) => void;
}

/**
 * 获取同步状态显示信息
 */
function getSyncStatusInfo(status: MediaSyncStatus): {
  icon: React.ReactNode;
  text: string;
  theme: 'default' | 'success' | 'warning' | 'danger';
} {
  switch (status) {
    case 'synced':
      return {
        icon: <CheckCircleFilledIcon />,
        text: '已同步',
        theme: 'success',
      };
    case 'syncing':
      return {
        icon: <Loading />,
        text: '同步中',
        theme: 'default',
      };
    case 'too_large':
      return {
        icon: <CloseCircleFilledIcon />,
        text: '文件过大',
        theme: 'warning',
      };
    case 'error':
      return {
        icon: <CloseCircleFilledIcon />,
        text: '同步失败',
        theme: 'danger',
      };
    case 'not_synced':
    default:
      return {
        icon: <CloudUploadIcon />,
        text: '同步产物',
        theme: 'default',
      };
  }
}

/**
 * 任务产物同步按钮
 */
export function TaskSyncButton({
  task,
  size = 'small',
  iconOnly = false,
  onSyncComplete,
}: TaskSyncButtonProps) {
  const syncContext = useGitHubSyncOptional();
  const [localStatus, setLocalStatus] = useState<MediaSyncStatus | null>(null);

  // 如果没有同步上下文，不显示按钮
  if (!syncContext) {
    return null;
  }

  const { isConnected, syncTaskMedia } = syncContext;

  // 获取同步状态
  const status = localStatus || mediaSyncService.getTaskSyncStatus(task.id);
  const statusInfo = getSyncStatusInfo(status);

  // 检查是否可以同步
  const canSync = mediaSyncService.canSync(task);

  // 处理同步点击
  const handleSync = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!isConnected) {
      MessagePlugin.warning('请先在设置中配置 GitHub Token');
      return;
    }

    if (!canSync.canSync) {
      MessagePlugin.warning(canSync.reason || '无法同步此任务');
      return;
    }

    if (status === 'syncing') {
      return;
    }

    setLocalStatus('syncing');

    try {
      const success = await syncTaskMedia(task.id);
      setLocalStatus(success ? 'synced' : 'error');
      
      if (success) {
        MessagePlugin.success('同步成功');
      }
      
      onSyncComplete?.(success);
    } catch (error) {
      setLocalStatus('error');
      onSyncComplete?.(false);
    }
  }, [isConnected, canSync, status, syncTaskMedia, task.id, onSyncComplete]);

  // 已同步状态显示勾选图标
  if (status === 'synced') {
    return (
      <Tooltip content="已同步到云端" theme="light">
        <span className="task-sync-badge task-sync-badge--synced">
          <CheckCircleFilledIcon />
        </span>
      </Tooltip>
    );
  }

  // 文件过大状态显示警告
  if (status === 'too_large') {
    return (
      <Tooltip content={canSync.reason || '文件过大，无法同步'} theme="light">
        <span className="task-sync-badge task-sync-badge--warning">
          <CloseCircleFilledIcon />
        </span>
      </Tooltip>
    );
  }

  // 未连接状态或不可同步
  if (!isConnected || !canSync.canSync) {
    return null;
  }

  // 可同步状态显示按钮
  return (
    <Tooltip content={status === 'syncing' ? '同步中...' : '同步到云端'} theme="light">
      <Button
        size={size}
        variant="text"
        icon={statusInfo.icon}
        loading={status === 'syncing'}
        onClick={handleSync}
        disabled={status === 'syncing'}
      >
        {!iconOnly && statusInfo.text}
      </Button>
    </Tooltip>
  );
}

/**
 * 简单的同步状态图标（用于紧凑布局）
 */
export function TaskSyncStatusIcon({ task }: { task: Task }) {
  const syncContext = useGitHubSyncOptional();

  if (!syncContext?.isConnected) {
    return null;
  }

  const status = mediaSyncService.getTaskSyncStatus(task.id);

  if (status === 'synced') {
    return (
      <Tooltip content="已同步到云端" theme="light">
        <CloudIcon className="task-sync-icon task-sync-icon--synced" />
      </Tooltip>
    );
  }

  return null;
}
