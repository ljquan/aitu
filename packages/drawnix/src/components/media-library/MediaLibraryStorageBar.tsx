/**
 * Media Library Storage Bar
 * 素材库本地存储空间进度条组件
 */

import { Progress } from 'tdesign-react';
import { HardDrive } from 'lucide-react';
import { formatFileSize } from '../../utils/asset-utils';
import type { MediaLibraryStorageBarProps } from '../../types/asset.types';
import './MediaLibraryStorageBar.scss';

export function MediaLibraryStorageBar({
  assetCount,
  storageStatus,
}: MediaLibraryStorageBarProps) {
  const percentUsed = storageStatus?.quota?.percentUsed || 0;
  const usageBytes = storageStatus?.quota?.usage || 0;

  return (
    <div className="storage-bar">
      <div className="storage-bar__header">
        <div className="storage-bar__header-left">
          <HardDrive size={14} className="storage-bar__icon" />
          <span className="storage-bar__title">本地存储空间</span>
        </div>
        <span className="storage-bar__count">{assetCount} 个素材</span>
      </div>

      <div className="storage-bar__usage">
        <span className="storage-bar__usage-value">已用：{formatFileSize(usageBytes)}</span>
      </div>

      <Progress
        percentage={percentUsed}
        size="small"
        strokeWidth={6}
        label={false}
      />
    </div>
  );
}
