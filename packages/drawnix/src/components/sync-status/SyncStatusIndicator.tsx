/**
 * 同步状态指示器组件
 * 显示在工具栏上，点击可打开同步设置
 */

import React, { useState } from 'react';
import { Tooltip, Loading } from 'tdesign-react';
import {
  CloudIcon,
  CheckCircleFilledIcon,
  CloudUploadIcon,
  CloseCircleFilledIcon,
  HelpCircleIcon,
} from 'tdesign-icons-react';
import { useGitHubSyncOptional } from '../../contexts/GitHubSyncContext';
import { SyncSettings } from '../sync-settings';
import './sync-status.scss';

/**
 * 同步状态指示器
 */
export function SyncStatusIndicator() {
  const syncContext = useGitHubSyncOptional();
  const [showSettings, setShowSettings] = useState(false);

  // 如果没有同步上下文，不显示
  if (!syncContext) {
    return null;
  }

  const { isConnected, isConfigured, syncStatus, isSyncing, lastSyncTime } = syncContext;

  // 获取状态信息
  const getStatusInfo = (): {
    icon: React.ReactNode;
    tooltip: string;
    className: string;
  } => {
    if (!isConfigured) {
      return {
        icon: <HelpCircleIcon />,
        tooltip: '点击配置云端同步',
        className: 'sync-status--not-configured',
      };
    }

    if (!isConnected) {
      return {
        icon: <CloseCircleFilledIcon />,
        tooltip: 'Token 无效，点击重新配置',
        className: 'sync-status--error',
      };
    }

    if (isSyncing) {
      return {
        icon: <Loading />,
        tooltip: '正在同步...',
        className: 'sync-status--syncing',
      };
    }

    switch (syncStatus) {
      case 'synced':
        return {
          icon: <CheckCircleFilledIcon />,
          tooltip: lastSyncTime
            ? `已同步 · ${formatRelativeTime(lastSyncTime)}`
            : '已同步',
          className: 'sync-status--synced',
        };
      case 'local_changes':
        return {
          icon: <CloudUploadIcon />,
          tooltip: '有待同步的变更',
          className: 'sync-status--pending',
        };
      case 'error':
        return {
          icon: <CloseCircleFilledIcon />,
          tooltip: '同步出错，点击查看',
          className: 'sync-status--error',
        };
      default:
        return {
          icon: <CloudIcon />,
          tooltip: '云端同步',
          className: 'sync-status--default',
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <>
      <Tooltip content={statusInfo.tooltip} theme="light">
        <button
          className={`sync-status-indicator ${statusInfo.className}`}
          onClick={() => setShowSettings(true)}
          aria-label="同步设置"
        >
          {statusInfo.icon}
        </button>
      </Tooltip>

      <SyncSettings
        visible={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </>
  );
}

/**
 * 格式化相对时间
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return '刚刚';
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;

  return new Date(timestamp).toLocaleDateString('zh-CN');
}
